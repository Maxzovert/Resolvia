import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true,
    index: true
  },
  traceId: {
    type: String,
    required: true,
    index: true
  },
  actor: {
    type: String,
    required: true,
    enum: ['system', 'user', 'agent', 'admin']
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  action: {
    type: String,
    required: true,
    enum: [
      'ticket_created',
      'ticket_updated',
      'status_changed',
      'assigned',
      'unassigned',
      'assignment_requested',
      'assignment_approved',
      'assignment_rejected',
      'reply_added',
      'category_predicted',
      'articles_retrieved',
      'reply_drafted',
      'auto_closed',
      'agent_reviewed',
      'escalated',
      'sla_set',
      'sla_breached'
    ]
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: false // We use our own timestamp field
});

// Compound indexes for efficient queries
auditLogSchema.index({ ticketId: 1, timestamp: -1 });
auditLogSchema.index({ traceId: 1, timestamp: 1 });
auditLogSchema.index({ actor: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

// Static methods
auditLogSchema.statics.logAction = function(data) {
  const {
    ticketId,
    traceId,
    actor,
    actorId,
    action,
    description,
    meta = {},
    ipAddress,
    userAgent
  } = data;

  return this.create({
    ticketId,
    traceId,
    actor,
    actorId,
    action,
    description,
    meta,
    ipAddress,
    userAgent,
    timestamp: new Date()
  });
};

auditLogSchema.statics.getTicketTimeline = function(ticketId, options = {}) {
  const { limit = 50, skip = 0 } = options;
  
  return this.find({ ticketId })
    .populate('actorId', 'name email role')
    .sort({ timestamp: 1 })
    .limit(limit)
    .skip(skip);
};

auditLogSchema.statics.getTraceTimeline = function(traceId) {
  return this.find({ traceId })
    .populate('actorId', 'name email role')
    .sort({ timestamp: 1 });
};

auditLogSchema.statics.getActivitySummary = function(dateRange = {}, options = {}) {
  const { startDate, endDate } = dateRange;
  const { groupBy = 'day' } = options;
  
  const matchQuery = {};
  if (startDate || endDate) {
    matchQuery.timestamp = {};
    if (startDate) matchQuery.timestamp.$gte = new Date(startDate);
    if (endDate) matchQuery.timestamp.$lte = new Date(endDate);
  }

  let dateGrouping;
  switch (groupBy) {
    case 'hour':
      dateGrouping = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' }
      };
      break;
    case 'month':
      dateGrouping = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' }
      };
      break;
    default: // day
      dateGrouping = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' }
      };
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          date: dateGrouping,
          action: '$action'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        actions: {
          $push: {
            action: '$_id.action',
            count: '$count'
          }
        },
        totalActions: { $sum: '$count' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
  ]);
};

auditLogSchema.statics.getUserActivity = function(userId, dateRange = {}) {
  const { startDate, endDate } = dateRange;
  const matchQuery = { actorId: userId };
  
  if (startDate || endDate) {
    matchQuery.timestamp = {};
    if (startDate) matchQuery.timestamp.$gte = new Date(startDate);
    if (endDate) matchQuery.timestamp.$lte = new Date(endDate);
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        lastOccurrence: { $max: '$timestamp' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Method to format for display
auditLogSchema.methods.toDisplayFormat = function() {
  return {
    id: this._id,
    timestamp: this.timestamp,
    actor: this.actor,
    actorName: this.actorId?.name || 'System',
    action: this.action,
    description: this.description,
    meta: this.meta
  };
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
