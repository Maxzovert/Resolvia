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
    const { status, category, limit = 20, page = 1, query, unassigned, myRequests } = req.query;
    const skip = (page - 1) * limit;
    
    console.log('Ticket query params:', req.query);
    console.log('Unassigned value:', unassigned, 'Type:', typeof unassigned);
    console.log('MyRequests value:', myRequests, 'Type:', typeof myRequests);
    
    let filterQuery = {};
    
    // Apply role-based filtering
    if (req.user.role === 'user') {
      filterQuery.createdBy = req.user._id;
    } else if (req.user.role === 'agent') {
      // Check if specifically requesting unassigned tickets
      if (req.query.unassigned === 'true') {
        filterQuery.assignee = null;
        filterQuery.status = { $in: ['triaged', 'waiting_human'] };
      } else if (req.query.myRequests === 'true') {
        // Agents requesting their own assignment requests
        filterQuery['pendingAssignment.requestedBy'] = req.user._id;
        console.log('MyRequests query - User ID:', req.user._id);
        console.log('MyRequests filter:', filterQuery);
      } else {
        // Agents see assigned tickets + unassigned tickets
        filterQuery.$or = [
          { assignee: req.user._id },
          { assignee: null, status: { $in: ['triaged', 'waiting_human'] } }
        ];
      }
    }
    // Admins see all tickets
    
    // Apply additional filters
    if (status && req.query.unassigned !== 'true') {
      filterQuery.status = status;
    }
    if (category) filterQuery.category = category;
    if (query) {
      filterQuery.$text = { $search: query };
    }
    
    const tickets = await Ticket.find(filterQuery)
      .populate('createdBy', 'name email')
      .populate('assignee', 'name email')
      .populate('pendingAssignment.requestedBy', 'name email')
      .select('title status priority category createdAt createdBy assignee pendingAssignment lastActivity')
      .sort({ lastActivity: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    console.log('Tickets query result count:', tickets.length);
    if (tickets.length > 0 && req.query.myRequests === 'true') {
      console.log('First ticket pendingAssignment:', tickets[0].pendingAssignment);
      console.log('First ticket requestedBy:', tickets[0].pendingAssignment?.requestedBy);
    }
    
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

// Get pending assignment requests (admin only)
router.get('/pending-assignments',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    console.log('Pending assignments route hit');
    console.log('User role:', req.user.role);
    
    if (req.user.role !== 'admin') {
      console.log('Access denied - not admin');
      return res.status(403).json({ error: 'Only admins can view pending assignments' });
    }
    
    try {
      console.log('Querying for pending assignments...');
      const pendingTickets = await Ticket.find({
        'pendingAssignment.status': 'pending'
      })
      .populate('createdBy', 'name email')
      .populate('pendingAssignment.requestedBy', 'name email')
      .sort({ 'pendingAssignment.requestedAt': 1 });
      
      console.log('Found pending tickets:', pendingTickets.length);
      
      res.json({
        pendingAssignments: pendingTickets
      });
    } catch (error) {
      console.error('Error in pending-assignments route:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  })
);

// Get single ticket
router.get('/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignee', 'name email')
      .populate('pendingAssignment.requestedBy', 'name email')
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
    
    // Restrict users from updating status and priority
    if (req.user.role === 'user' && (req.body.status || req.body.priority)) {
      return res.status(403).json({ 
        error: 'Users cannot update ticket status or priority. Please contact support.' 
      });
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
      
      // Update lastActivity when status changes
      ticket.lastActivity = new Date();
      await ticket.save();
    }
    
    await ticket.populate(['createdBy', 'assignee', 'pendingAssignment.requestedBy'], 'name email');
    
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

// Request assignment to a ticket
router.post('/:id/assign',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { assigneeId } = req.body;
    
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // If assigneeId is provided, this is an admin direct assignment
    if (assigneeId) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can directly assign tickets' });
      }
      
      // Check if ticket is already assigned
      if (ticket.assignee) {
        return res.status(400).json({ error: 'Ticket is already assigned to an agent' });
      }
      
      // Direct assignment by admin
      ticket.assignee = assigneeId;
      ticket.status = 'in_progress';
      ticket.lastActivity = new Date();
      await ticket.save();
      
      // Log the assignment
      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId: `assign-direct-${Date.now()}`,
        actor: 'admin',
        actorId: req.user._id,
        action: 'assigned',
        description: `Ticket directly assigned by admin to agent`,
        meta: { 
          assignedAgent: assigneeId,
          previousStatus: ticket.status
        }
      });
      
      return res.json({ message: 'Ticket assigned successfully', ticket });
    }
    
    // Agent requesting assignment
    if (req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Only agents can request ticket assignment' });
    }
    
    try {
      // Use the new validation logic
      await ticket.requestAssignment(req.user._id);
      
      // Log the assignment request
      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId: `assign-request-${Date.now()}`,
        actor: 'agent',
        actorId: req.user._id,
        action: 'assignment_requested',
        description: `Assignment request submitted by ${req.user.name}`,
        meta: { 
          requestedAgent: req.user._id
        }
      });
      
      res.json({ 
        message: 'Assignment request submitted successfully', 
        ticket 
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })
);

// Approve assignment request (admin only)
router.post('/:id/assign/approve',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can approve assignment requests' });
    }
    
    const { adminNotes } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    if (!ticket.pendingAssignment || ticket.pendingAssignment.status !== 'pending') {
      return res.status(400).json({ error: 'No pending assignment request found' });
    }
    
    try {
      console.log('Approving assignment for ticket:', req.params.id);
      console.log('Current pendingAssignment:', ticket.pendingAssignment);
      
      await ticket.approveAssignment(adminNotes);
      
      console.log('Assignment approved successfully');
      
      // Log approval
      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId: `assign-approve-${Date.now()}`,
        actor: 'admin',
        actorId: req.user._id,
        action: 'assignment_approved',
        description: `Assignment request approved by ${req.user.name}`,
        meta: { 
          approvedAgent: ticket.assignee ? 
            (typeof ticket.assignee === 'object' ? 
              ticket.assignee._id || ticket.assignee.toString() : 
              ticket.assignee.toString()) : 'Unknown',
          adminNotes
        }
      });
      
      console.log('Audit log created successfully');
      
      await ticket.populate(['createdBy', 'assignee', 'pendingAssignment.requestedBy'], 'name email');
      
      console.log('Ticket populated successfully');
      
      res.json({
        message: 'Assignment request approved',
        ticket
      });
    } catch (error) {
      console.error('Error approving assignment:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to approve assignment', details: error.message });
    }
  })
);

// Reject assignment request (admin only)
router.post('/:id/assign/reject',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can reject assignment requests' });
    }
    
    const { adminNotes } = req.body;
    const ticket = await Ticket.findById(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    if (!ticket.pendingAssignment || ticket.pendingAssignment.status !== 'pending') {
      return res.status(400).json({ error: 'No pending assignment request found' });
    }
    
    try {
      console.log('Rejecting assignment for ticket:', req.params.id);
      console.log('Current pendingAssignment:', ticket.pendingAssignment);
      
      // Store the agent ID before rejecting (since it will be cleared)
      const rejectedAgentId = ticket.pendingAssignment.requestedBy;
      
      await ticket.rejectAssignment(adminNotes);
      
      console.log('Assignment rejected successfully');
      
      // Log rejection
      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId: `assign-reject-${Date.now()}`,
        actor: 'admin',
        actorId: req.user._id,
        action: 'assignment_rejected',
        description: `Assignment request rejected by ${req.user.name}`,
        meta: { 
          rejectedAgent: rejectedAgentId ? 
            (typeof rejectedAgentId === 'object' ? 
              rejectedAgentId._id || rejectedAgentId.toString() : 
              rejectedAgentId.toString()) : 'Unknown',
          adminNotes
        }
      });
      
      console.log('Audit log created successfully');
      
      await ticket.populate(['createdBy', 'assignee'], 'name email');
      
      console.log('Ticket populated successfully');
      
      res.json({
        message: 'Assignment request rejected',
        ticket
      });
    } catch (error) {
      console.error('Error rejecting assignment:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to reject assignment', details: error.message });
    }
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
    // Admins see all tickets (no filter)
    
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
    
    // Calculate resolved today for admins and agents
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedToday = await Ticket.countDocuments({
      ...matchQuery,
      resolvedAt: { $gte: today },
      status: { $in: ['resolved', 'closed'] }
    });
    
    // Additional stats for admin panel
    const openTickets = await Ticket.countDocuments({
      ...matchQuery,
      status: 'open'
    });
    
    const inProgressTickets = await Ticket.countDocuments({
      ...matchQuery,
      status: { $in: ['in_progress', 'waiting_human'] }
    });
    
    const resolvedTickets = await Ticket.countDocuments({
      ...matchQuery,
      status: { $in: ['resolved', 'closed'] }
    });
    
    // Count pending assignments
    const pendingAssignments = await Ticket.countDocuments({
      'pendingAssignment.status': 'pending'
    });
    
    res.json({
      statusStats: stats,
      categoryStats,
      overdueTickets,
      resolvedToday,
      totalTickets: await Ticket.countDocuments(matchQuery),
      openTickets,
      inProgressTickets,
      resolvedTickets,
      pendingAssignments
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

// Check if agent can request assignment to a ticket
router.get('/:id/can-request-assignment',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    if (req.user.role !== 'agent') {
      return res.status(403).json({ error: 'Only agents can check assignment availability' });
    }
    
    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const canRequest = ticket.canRequestAssignment(req.user._id);
    
    res.json({
      canRequest: canRequest.canRequest,
      reason: canRequest.reason || null,
      ticket: {
        id: ticket._id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        assignee: ticket.assignee,
        pendingAssignment: ticket.pendingAssignment
      }
    });
  })
);

export default router;
