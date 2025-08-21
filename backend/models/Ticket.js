import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 5000
  },
  category: {
    type: String,
    enum: ['billing', 'tech', 'shipping', 'other'],
    default: 'other'
  },
  status: {
    type: String,
    required: true,
    enum: ['open', 'triaged', 'waiting_human', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  agentSuggestionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AgentSuggestion'
  },
  attachmentUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Attachment URL must be a valid HTTP/HTTPS URL'
    }
  },
  replies: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 5000
    },
    isInternal: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 30
  }],
  slaDeadline: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
ticketSchema.index({ createdBy: 1, status: 1 });
ticketSchema.index({ assignee: 1, status: 1 });
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ category: 1, status: 1 });
ticketSchema.index({ slaDeadline: 1 });
ticketSchema.index({ lastActivity: -1 });

// Virtual for SLA status
ticketSchema.virtual('slaStatus').get(function() {
  if (!this.slaDeadline) return 'no_sla';
  if (this.status === 'resolved' || this.status === 'closed') return 'met';
  
  const now = new Date();
  const timeRemaining = this.slaDeadline.getTime() - now.getTime();
  
  if (timeRemaining < 0) return 'breached';
  if (timeRemaining < 2 * 60 * 60 * 1000) return 'at_risk'; // 2 hours
  return 'on_track';
});

// Virtual for response time
ticketSchema.virtual('responseTime').get(function() {
  if (this.replies.length === 0 || !this.createdAt) return null;
  
  const firstReply = this.replies[0];
  if (!firstReply.createdAt) return null;
  
  return firstReply.createdAt - this.createdAt;
});

// Methods
ticketSchema.methods.addReply = function(authorId, content, isInternal = false) {
  this.replies.push({
    author: authorId,
    content,
    isInternal
  });
  this.lastActivity = new Date();
  return this.save();
};

ticketSchema.methods.updateStatus = function(newStatus, userId) {
  const oldStatus = this.status;
  this.status = newStatus;
  this.lastActivity = new Date();
  
  if (newStatus === 'resolved') {
    this.resolvedAt = new Date();
  } else if (newStatus === 'closed') {
    this.closedAt = new Date();
  }
  
  return this.save();
};

ticketSchema.methods.assignTo = function(agentId) {
  this.assignee = agentId;
  this.lastActivity = new Date();
  return this.save();
};

ticketSchema.methods.setSLA = function(hours) {
  if (hours && hours > 0) {
    const baseDate = this.createdAt || new Date();
    this.slaDeadline = new Date(baseDate.getTime() + (hours * 60 * 60 * 1000));
  }
  return this;
};

// Static methods
ticketSchema.statics.getTicketsByStatus = function(status, options = {}) {
  const { assignee, createdBy, limit = 20, skip = 0 } = options;
  
  const query = { status };
  if (assignee) query.assignee = assignee;
  if (createdBy) query.createdBy = createdBy;
  
  return this.find(query)
    .populate('createdBy', 'name email')
    .populate('assignee', 'name email')
    .sort({ lastActivity: -1 })
    .limit(limit)
    .skip(skip);
};

ticketSchema.statics.getOverdueTickets = function() {
  return this.find({
    slaDeadline: { $lt: new Date() },
    status: { $nin: ['resolved', 'closed'] }
  })
  .populate('createdBy', 'name email')
  .populate('assignee', 'name email')
  .sort({ slaDeadline: 1 });
};

// Update lastActivity on save
ticketSchema.pre('save', function(next) {
  if (this.isModified() && !this.isModified('lastActivity')) {
    this.lastActivity = new Date();
  }
  next();
});

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
