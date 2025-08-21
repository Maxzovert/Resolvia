import express from 'express';
import AgentSuggestion from '../models/AgentSuggestion.js';
import Ticket from '../models/Ticket.js';
import AuditLog from '../models/AuditLog.js';
import { authenticateToken, requireAgent } from '../middleware/auth.js';
import { validateRequest, agentFeedbackSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get agent suggestion for a ticket
router.get('/suggestion/:ticketId',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    
    const suggestion = await AgentSuggestion.findOne({ ticketId })
      .populate('articleIds', 'title body category tags')
      .populate('ticketId', 'title description category status');
    
    if (!suggestion) {
      return res.status(404).json({ error: 'No suggestion found for this ticket' });
    }
    
    res.json({ suggestion });
  })
);

// Submit feedback on agent suggestion
router.post('/suggestion/:id/feedback',
  authenticateToken,
  requireAgent,
  validateRequest(agentFeedbackSchema),
  asyncHandler(async (req, res) => {
    const suggestion = await AgentSuggestion.findById(req.params.id);
    
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    const feedback = {
      ...req.body,
      submittedBy: req.user._id
    };
    
    await suggestion.submitFeedback(feedback);
    
    // Log the feedback
    await AuditLog.logAction({
      ticketId: suggestion.ticketId,
      traceId: suggestion.traceId,
      actor: 'agent',
      actorId: req.user._id,
      action: 'agent_reviewed',
      description: `Agent ${feedback.accepted ? 'accepted' : 'rejected'} AI suggestion`,
      meta: { 
        accepted: feedback.accepted,
        rating: feedback.rating,
        hasEditedReply: !!feedback.editedReply
      }
    });
    
    res.json({
      message: 'Feedback submitted successfully',
      suggestion
    });
  })
);

// Mark suggestion as used
router.post('/suggestion/:id/use',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const suggestion = await AgentSuggestion.findById(req.params.id);
    
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    await suggestion.markAsUsed();
    
    // Log the usage
    await AuditLog.logAction({
      ticketId: suggestion.ticketId,
      traceId: suggestion.traceId,
      actor: 'agent',
      actorId: req.user._id,
      action: 'reply_drafted',
      description: 'Agent used AI suggestion',
      meta: { suggestionId: suggestion._id }
    });
    
    res.json({
      message: 'Suggestion marked as used',
      suggestion
    });
  })
);

// Get agent performance metrics
router.get('/metrics',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const dateRange = {};
    
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;
    
    // Get overall suggestion performance
    const performanceMetrics = await AgentSuggestion.getPerformanceMetrics(dateRange);
    
    // Get category accuracy
    const categoryAccuracy = await AgentSuggestion.getCategoryAccuracy(dateRange);
    
    // Get agent-specific metrics
    const agentMetrics = await AgentSuggestion.aggregate([
      {
        $match: {
          'agentFeedback.submittedBy': req.user._id,
          ...(startDate && { createdAt: { $gte: new Date(startDate) } }),
          ...(endDate && { createdAt: { $lte: new Date(endDate) } })
        }
      },
      {
        $group: {
          _id: null,
          totalReviewed: { $sum: 1 },
          acceptedCount: { $sum: { $cond: ['$agentFeedback.accepted', 1, 0] } },
          avgRating: { $avg: '$agentFeedback.rating' },
          avgConfidence: { $avg: '$confidence' }
        }
      },
      {
        $project: {
          _id: 0,
          totalReviewed: 1,
          acceptedCount: 1,
          acceptanceRate: { $divide: ['$acceptedCount', '$totalReviewed'] },
          avgRating: { $round: ['$avgRating', 2] },
          avgConfidence: { $round: ['$avgConfidence', 3] }
        }
      }
    ]);
    
    // Get ticket resolution stats for this agent
    const ticketStats = await Ticket.aggregate([
      {
        $match: {
          assignee: req.user._id,
          ...(startDate && { createdAt: { $gte: new Date(startDate) } }),
          ...(endDate && { createdAt: { $lte: new Date(endDate) } })
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgResolutionTime: {
            $avg: {
              $cond: [
                { $eq: ['$status', 'resolved'] },
                { $subtract: ['$resolvedAt', '$createdAt'] },
                null
              ]
            }
          }
        }
      }
    ]);
    
    res.json({
      performanceMetrics: performanceMetrics[0] || {},
      categoryAccuracy,
      agentMetrics: agentMetrics[0] || {},
      ticketStats
    });
  })
);

// Get suggestions pending review
router.get('/pending-review',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Find tickets assigned to this agent that have suggestions but no feedback
    const suggestions = await AgentSuggestion.find({
      used: false,
      'agentFeedback.submittedBy': { $exists: false }
    })
    .populate({
      path: 'ticketId',
      match: { assignee: req.user._id },
      populate: {
        path: 'createdBy',
        select: 'name email'
      }
    })
    .populate('articleIds', 'title category')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(skip));
    
    // Filter out suggestions where ticket population failed (not assigned to this agent)
    const validSuggestions = suggestions.filter(s => s.ticketId);
    
    const total = await AgentSuggestion.countDocuments({
      used: false,
      'agentFeedback.submittedBy': { $exists: false },
      ticketId: { 
        $in: await Ticket.find({ assignee: req.user._id }).distinct('_id')
      }
    });
    
    res.json({
      suggestions: validSuggestions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  })
);

// Get AI suggestions history
router.get('/suggestions/history',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { limit = 20, page = 1, status } = req.query;
    const skip = (page - 1) * limit;
    
    let matchQuery = {};
    
    if (status === 'used') {
      matchQuery.used = true;
    } else if (status === 'reviewed') {
      matchQuery['agentFeedback.submittedBy'] = { $exists: true };
    } else if (status === 'auto-closed') {
      matchQuery.autoClosed = true;
    }
    
    // Only show suggestions for tickets this agent can access
    const accessibleTickets = await Ticket.find({
      $or: [
        { assignee: req.user._id },
        { assignee: null },
        ...(req.user.role === 'admin' ? [{}] : [])
      ]
    }).distinct('_id');
    
    matchQuery.ticketId = { $in: accessibleTickets };
    
    const suggestions = await AgentSuggestion.find(matchQuery)
      .populate('ticketId', 'title status category createdBy')
      .populate('agentFeedback.submittedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await AgentSuggestion.countDocuments(matchQuery);
    
    res.json({
      suggestions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  })
);

// Get suggestion quality trends
router.get('/quality-trends',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const trends = await AgentSuggestion.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          'agentFeedback.submittedBy': { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            }
          },
          avgConfidence: { $avg: '$confidence' },
          avgRating: { $avg: '$agentFeedback.rating' },
          acceptanceRate: {
            $avg: { $cond: ['$agentFeedback.accepted', 1, 0] }
          },
          totalSuggestions: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    res.json({ trends });
  })
);

// Get agent's assigned tickets
router.get('/tickets',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const tickets = await Ticket.find({ assignee: req.user._id })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json(tickets);
  })
);

// Get agent stats for dashboard
router.get('/stats',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const userId = req.user._id;
    
    // Get assigned tickets count
    const assignedTickets = await Ticket.countDocuments({ assignee: userId });
    
    // Get resolved tickets today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const resolvedToday = await Ticket.countDocuments({
      assignee: userId,
      status: 'resolved',
      updatedAt: { $gte: startOfDay }
    });
    
    // Calculate average response time (simplified)
    const avgResponseTime = 2.5; // Hours - this would need more complex calculation
    
    // Customer satisfaction (simplified)
    const customerSatisfaction = 95; // Percentage - this would come from feedback data
    
    res.json({
      assignedTickets,
      resolvedToday,
      avgResponseTime,
      customerSatisfaction
    });
  })
);

// Get AI suggestions for agent
router.get('/suggestions',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    // Get recent suggestions for tickets assigned to this agent
    const suggestions = await AgentSuggestion.find({
      used: false
    })
    .populate({
      path: 'ticketId',
      match: { assignee: req.user._id },
      select: 'title status'
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    // Filter out suggestions where ticket population failed
    const validSuggestions = suggestions.filter(s => s.ticketId);
    
    res.json(validSuggestions);
  })
);

// Delete/dismiss a suggestion
router.delete('/suggestions/:id',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const suggestion = await AgentSuggestion.findById(req.params.id);
    
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    
    // Mark as used/dismissed instead of deleting
    suggestion.used = true;
    suggestion.agentFeedback = {
      submittedBy: req.user._id,
      accepted: false,
      rating: 1,
      feedbackNotes: 'Dismissed by agent'
    };
    
    await suggestion.save();
    
    res.json({ message: 'Suggestion dismissed' });
  })
);

export default router;
