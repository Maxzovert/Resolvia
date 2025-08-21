import express from 'express';
import Ticket from '../models/Ticket.js';
import AgentSuggestion from '../models/AgentSuggestion.js';
import AuditLog from '../models/AuditLog.js';
import Config from '../models/Config.js';
import aiService from '../services/aiService.js';
import { authenticateToken, requireAgent, requireUser } from '../middleware/auth.js';
import { 
  validateRequest, 
  validateQuery,
  createTicketSchema, 
  updateTicketSchema,
  addReplySchema,
  assignTicketSchema,
  searchSchema 
} from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get tickets with filtering
router.get('/',
  authenticateToken,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { status, category, limit = 20, page = 1, query } = req.query;
    const skip = (page - 1) * limit;
    
    let filterQuery = {};
    
    // Apply role-based filtering
    if (req.user.role === 'user') {
      filterQuery.createdBy = req.user._id;
    } else if (req.user.role === 'agent') {
      // Agents see assigned tickets + unassigned tickets
      filterQuery.$or = [
        { assignee: req.user._id },
        { assignee: null, status: { $in: ['triaged', 'waiting_human'] } }
      ];
    }
    // Admins see all tickets
    
    // Apply additional filters
    if (status) filterQuery.status = status;
    if (category) filterQuery.category = category;
    if (query) {
      filterQuery.$text = { $search: query };
    }
    
    const tickets = await Ticket.find(filterQuery)
      .populate('createdBy', 'name email')
      .populate('assignee', 'name email')
      .sort({ lastActivity: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await Ticket.countDocuments(filterQuery);
    
    res.json({
      tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  })
);

// Create new ticket
router.post('/',
  authenticateToken,
  requireUser,
  validateRequest(createTicketSchema),
  asyncHandler(async (req, res) => {
    console.log('Creating ticket with data:', req.body); // Debug log
    console.log('User creating ticket:', req.user); // Debug log
    const ticketData = {
      ...req.body,
      createdBy: req.user._id
    };
    console.log('Final ticket data:', ticketData); // Debug log
    
    const ticket = new Ticket(ticketData);
    
    // Save ticket first to get the createdAt timestamp
    await ticket.save();
    
    // Set SLA deadline after saving
    let config;
    try {
      config = await Config.getConfig();
    } catch (error) {
      console.warn('Failed to get config, using default SLA:', error.message);
      config = { slaHours: 24 }; // Default fallback
    }
    
    ticket.setSLA(config.slaHours);
    await ticket.save();
    
    await ticket.populate('createdBy', 'name email');
    
    // Log ticket creation
    await AuditLog.logAction({
      ticketId: ticket._id,
      traceId: `ticket-${ticket._id}`,
      actor: 'user',
      actorId: req.user._id,
      action: 'ticket_created',
      description: `Ticket created: ${ticket.title}`,
      meta: { 
        category: ticket.category,
        priority: ticket.priority 
      }
    });
    
    // Trigger AI triage asynchronously
    setImmediate(async () => {
      try {
        const { suggestion, shouldAutoClose } = await aiService.processTicket(ticket);
        
        if (shouldAutoClose) {
          ticket.status = 'resolved';
          ticket.agentSuggestionId = suggestion._id;
          await ticket.addReply(null, suggestion.draftReply, false);
          await ticket.save();
        } else {
          ticket.status = 'triaged';
          ticket.agentSuggestionId = suggestion._id;
          await ticket.save();
        }
      } catch (error) {
        console.error('AI triage error:', error);
        // Ticket remains in 'open' status if AI triage fails
      }
    });
    
    res.status(201).json({
      message: 'Ticket created successfully',
      ticket
    });
  })
);

// Get single ticket
router.get('/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignee', 'name email')
      .populate('replies.author', 'name email role');
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Check access permissions
    const hasAccess = 
      req.user.role === 'admin' ||
      ticket.createdBy._id.toString() === req.user._id.toString() ||
      (req.user.role === 'agent' && (
        !ticket.assignee || 
        ticket.assignee._id.toString() === req.user._id.toString()
      ));
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get AI suggestion if available
    let suggestion = null;
    if (ticket.agentSuggestionId) {
      suggestion = await AgentSuggestion.findById(ticket.agentSuggestionId)
        .populate('articleIds', 'title body category');
    }
    
    res.json({
      ticket,
      suggestion
    });
  })
);

// Update ticket
router.put('/:id',
  authenticateToken,
  validateRequest(updateTicketSchema),
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Check permissions
    const canEdit = 
      req.user.role === 'admin' ||
      (req.user.role === 'agent' && ticket.assignee?.toString() === req.user._id.toString()) ||
      (req.user.role === 'user' && ticket.createdBy.toString() === req.user._id.toString());
    
    if (!canEdit) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const oldStatus = ticket.status;
    const updates = req.body;
    
    // Apply updates
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        ticket[key] = updates[key];
      }
    });
    
    await ticket.save();
    
    // Log status change if applicable
    if (updates.status && updates.status !== oldStatus) {
      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId: `update-${Date.now()}`,
        actor: req.user.role,
        actorId: req.user._id,
        action: 'status_changed',
        description: `Status changed from ${oldStatus} to ${updates.status}`,
        meta: { oldStatus, newStatus: updates.status }
      });
    }
    
    await ticket.populate(['createdBy', 'assignee'], 'name email');
    
    res.json({
      message: 'Ticket updated successfully',
      ticket
    });
  })
);

// Add reply to ticket
router.post('/:id/reply',
  authenticateToken,
  validateRequest(addReplySchema),
  asyncHandler(async (req, res) => {
    const { content, isInternal = false } = req.body;
    
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Check permissions
    const canReply = 
      req.user.role === 'admin' ||
      ticket.createdBy.toString() === req.user._id.toString() ||
      (req.user.role === 'agent' && (
        !ticket.assignee || 
        ticket.assignee.toString() === req.user._id.toString()
      ));
    
    if (!canReply) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Users cannot add internal notes
    if (req.user.role === 'user' && isInternal) {
      return res.status(403).json({ error: 'Users cannot add internal notes' });
    }
    
    await ticket.addReply(req.user._id, content, isInternal);
    
    // Update ticket status if needed
    if (req.user.role === 'agent' && ticket.status === 'waiting_human') {
      ticket.status = 'in_progress';
      await ticket.save();
    }
    
    // Log the reply
    await AuditLog.logAction({
      ticketId: ticket._id,
      traceId: `reply-${Date.now()}`,
      actor: req.user.role,
      actorId: req.user._id,
      action: 'reply_added',
      description: `${isInternal ? 'Internal note' : 'Reply'} added`,
      meta: { 
        isInternal,
        contentLength: content.length 
      }
    });
    
    await ticket.populate('replies.author', 'name email role');
    
    res.json({
      message: 'Reply added successfully',
      ticket
    });
  })
);

// Add comment to ticket (alias for reply to match frontend expectation)
router.post('/:id/comments',
  authenticateToken,
  validateRequest(addReplySchema),
  asyncHandler(async (req, res) => {
    const { content, isInternal = false } = req.body;
    
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Check permissions
    const canReply = 
      req.user.role === 'admin' ||
      ticket.createdBy.toString() === req.user._id.toString() ||
      (req.user.role === 'agent' && (
        !ticket.assignee || 
        ticket.assignee.toString() === req.user._id.toString()
      ));
    
    if (!canReply) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Users cannot add internal notes
    if (req.user.role === 'user' && isInternal) {
      return res.status(403).json({ error: 'Users cannot add internal notes' });
    }
    
    await ticket.addReply(req.user._id, content, isInternal);
    
    // Update ticket status if needed
    if (req.user.role === 'agent' && ticket.status === 'waiting_human') {
      ticket.status = 'in_progress';
      await ticket.save();
    }
    
    // Log the reply
    await AuditLog.logAction({
      ticketId: ticket._id,
      traceId: `reply-${Date.now()}`,
      actor: req.user.role,
      actorId: req.user._id,
      action: 'reply_added',
      description: `${isInternal ? 'Internal note' : 'Comment'} added`,
      meta: { 
        isInternal,
        contentLength: content.length 
      }
    });
    
    await ticket.populate('replies.author', 'name email role');
    
    // Return the newly added comment in the format expected by frontend
    const newComment = ticket.replies[ticket.replies.length - 1];
    res.json({
      _id: newComment._id,
      content: newComment.content,
      author: {
        name: newComment.author.name,
        role: newComment.author.role
      },
      createdAt: newComment.createdAt
    });
  })
);

// Assign ticket to agent
router.post('/:id/assign',
  authenticateToken,
  requireAgent,
  validateRequest(assignTicketSchema),
  asyncHandler(async (req, res) => {
    const { assigneeId } = req.body;
    
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const oldAssignee = ticket.assignee;
    
    if (assigneeId) {
      // Assign to specific agent
      await ticket.assignTo(assigneeId);
    } else {
      // Unassign
      ticket.assignee = null;
      await ticket.save();
    }
    
    // Log assignment change
    await AuditLog.logAction({
      ticketId: ticket._id,
      traceId: `assign-${Date.now()}`,
      actor: req.user.role,
      actorId: req.user._id,
      action: assigneeId ? 'assigned' : 'unassigned',
      description: assigneeId ? 
        `Ticket assigned to agent` : 
        'Ticket unassigned',
      meta: { 
        oldAssignee: oldAssignee?.toString(),
        newAssignee: assigneeId 
      }
    });
    
    await ticket.populate(['createdBy', 'assignee'], 'name email');
    
    res.json({
      message: 'Ticket assignment updated',
      ticket
    });
  })
);

// Get ticket statistics
router.get('/meta/stats',
  authenticateToken,
  asyncHandler(async (req, res) => {
    let matchQuery = {};
    
    // Filter by role
    if (req.user.role === 'user') {
      matchQuery.createdBy = req.user._id;
    } else if (req.user.role === 'agent') {
      matchQuery.assignee = req.user._id;
    }
    
    const stats = await Ticket.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$responseTime' }
        }
      }
    ]);
    
    const categoryStats = await Ticket.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    const overdueTickets = await Ticket.countDocuments({
      ...matchQuery,
      slaDeadline: { $lt: new Date() },
      status: { $nin: ['resolved', 'closed'] }
    });
    
    res.json({
      statusStats: stats,
      categoryStats,
      overdueTickets,
      totalTickets: await Ticket.countDocuments(matchQuery)
    });
  })
);

// Get overdue tickets
router.get('/meta/overdue',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const overdueTickets = await Ticket.getOverdueTickets();
    res.json({ overdueTickets });
  })
);

export default router;
