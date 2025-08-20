import express from 'express';
import AuditLog from '../models/AuditLog.js';
import { authenticateToken, requireAgent } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get audit log for a specific ticket
router.get('/tickets/:ticketId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Check if user has access to this ticket's audit log
    // Users can see their own tickets, agents can see assigned tickets, admins see all
    if (req.user.role === 'user') {
      const Ticket = (await import('../models/Ticket.js')).default;
      const ticket = await Ticket.findById(ticketId);
      if (!ticket || ticket.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const auditEntries = await AuditLog.getTicketTimeline(ticketId, {
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
    
    const total = await AuditLog.countDocuments({ ticketId });
    
    res.json({
      auditEntries: auditEntries.map(entry => entry.toDisplayFormat()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  })
);

// Get audit log for a specific trace
router.get('/traces/:traceId',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { traceId } = req.params;
    
    const auditEntries = await AuditLog.getTraceTimeline(traceId);
    
    res.json({
      traceId,
      auditEntries: auditEntries.map(entry => entry.toDisplayFormat())
    });
  })
);

// Get system activity summary
router.get('/activity',
  authenticateToken,
  requireAgent,
  asyncHandler(async (req, res) => {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;
    
    const activity = await AuditLog.getActivitySummary(dateRange, { groupBy });
    
    res.json({ activity });
  })
);

// Get user activity (for admin or user's own activity)
router.get('/users/:userId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Check permissions
    if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;
    
    const userActivity = await AuditLog.getUserActivity(userId, dateRange);
    
    res.json({ userActivity });
  })
);

// Search audit logs (admin only)
router.get('/search',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { 
      action, 
      actor, 
      startDate, 
      endDate, 
      limit = 50, 
      page = 1 
    } = req.query;
    
    const skip = (page - 1) * limit;
    const query = {};
    
    if (action) query.action = action;
    if (actor) query.actor = actor;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const auditEntries = await AuditLog.find(query)
      .populate('actorId', 'name email')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    const total = await AuditLog.countDocuments(query);
    
    res.json({
      auditEntries: auditEntries.map(entry => entry.toDisplayFormat()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  })
);

// Get audit statistics (admin only)
router.get('/stats',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { startDate, endDate } = req.query;
    const matchQuery = {};
    
    if (startDate || endDate) {
      matchQuery.timestamp = {};
      if (startDate) matchQuery.timestamp.$gte = new Date(startDate);
      if (endDate) matchQuery.timestamp.$lte = new Date(endDate);
    }
    
    // Action distribution
    const actionStats = await AuditLog.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Actor distribution
    const actorStats = await AuditLog.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$actor',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Activity over time
    const timelineStats = await AuditLog.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$timestamp'
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    const totalEntries = await AuditLog.countDocuments(matchQuery);
    
    res.json({
      totalEntries,
      actionStats,
      actorStats,
      timelineStats
    });
  })
);

// Export audit logs (admin only)
router.get('/export',
  authenticateToken,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { startDate, endDate, format = 'json' } = req.query;
    const query = {};
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const auditEntries = await AuditLog.find(query)
      .populate('actorId', 'name email')
      .sort({ timestamp: -1 })
      .limit(10000); // Reasonable export limit
    
    if (format === 'csv') {
      // Simple CSV format
      const csvHeader = 'Timestamp,Ticket ID,Trace ID,Actor,Action,Description\n';
      const csvRows = auditEntries.map(entry => 
        `${entry.timestamp.toISOString()},${entry.ticketId},${entry.traceId},${entry.actor},${entry.action},"${entry.description.replace(/"/g, '""')}"`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
      res.send(csvHeader + csvRows);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.json');
      res.json({
        exportDate: new Date().toISOString(),
        totalEntries: auditEntries.length,
        entries: auditEntries.map(entry => entry.toDisplayFormat())
      });
    }
  })
);

export default router;
