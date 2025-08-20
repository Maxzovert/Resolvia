import mongoose from 'mongoose';

const agentSuggestionSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true,
    unique: true
  },
  traceId: {
    type: String,
    required: true,
    index: true
  },
  predictedCategory: {
    type: String,
    required: true,
    enum: ['billing', 'tech', 'shipping', 'other']
  },
  categoryConfidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  articleIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article'
  }],
  draftReply: {
    type: String,
    required: true,
    maxlength: 5000
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  autoClosed: {
    type: Boolean,
    default: false
  },
  modelInfo: {
    model: {
      type: String,
      default: 'stub'
    },
    version: String,
    processingTime: Number, // milliseconds
    tokensUsed: Number
  },
  agentFeedback: {
    accepted: Boolean,
    editedReply: String,
    feedbackNotes: String,
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    submittedAt: Date,
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  used: {
    type: Boolean,
    default: false
  },
  usedAt: Date
}, {
  timestamps: true
});

// Indexes
agentSuggestionSchema.index({ ticketId: 1 });
agentSuggestionSchema.index({ traceId: 1 });
agentSuggestionSchema.index({ predictedCategory: 1, confidence: -1 });
agentSuggestionSchema.index({ createdAt: -1 });
agentSuggestionSchema.index({ autoClosed: 1 });

// Virtual for overall quality score
agentSuggestionSchema.virtual('qualityScore').get(function() {
  let score = this.confidence;
  
  if (this.agentFeedback?.rating) {
    score = (score + (this.agentFeedback.rating / 5)) / 2;
  }
  
  return score;
});

// Methods
agentSuggestionSchema.methods.submitFeedback = function(feedback) {
  this.agentFeedback = {
    ...feedback,
    submittedAt: new Date()
  };
  return this.save();
};

agentSuggestionSchema.methods.markAsUsed = function() {
  this.used = true;
  this.usedAt = new Date();
  return this.save();
};

agentSuggestionSchema.methods.getRecommendedArticles = function() {
  return mongoose.model('Article').find({
    _id: { $in: this.articleIds },
    status: 'published'
  }).select('title body tags category');
};

// Static methods
agentSuggestionSchema.statics.getPerformanceMetrics = function(dateRange = {}) {
  const { startDate, endDate } = dateRange;
  const matchQuery = {};
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalSuggestions: { $sum: 1 },
        autoClosedCount: { $sum: { $cond: ['$autoClosed', 1, 0] } },
        usedCount: { $sum: { $cond: ['$used', 1, 0] } },
        avgConfidence: { $avg: '$confidence' },
        avgCategoryConfidence: { $avg: '$categoryConfidence' },
        avgProcessingTime: { $avg: '$modelInfo.processingTime' },
        categoryBreakdown: {
          $push: {
            category: '$predictedCategory',
            confidence: '$confidence'
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalSuggestions: 1,
        autoClosedCount: 1,
        usedCount: 1,
        autoCloseRate: { $divide: ['$autoClosedCount', '$totalSuggestions'] },
        usageRate: { $divide: ['$usedCount', '$totalSuggestions'] },
        avgConfidence: { $round: ['$avgConfidence', 3] },
        avgCategoryConfidence: { $round: ['$avgCategoryConfidence', 3] },
        avgProcessingTime: { $round: ['$avgProcessingTime', 2] }
      }
    }
  ]);
};

agentSuggestionSchema.statics.getCategoryAccuracy = function(dateRange = {}) {
  const { startDate, endDate } = dateRange;
  const matchQuery = { used: true };
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
    if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: 'tickets',
        localField: 'ticketId',
        foreignField: '_id',
        as: 'ticket'
      }
    },
    { $unwind: '$ticket' },
    {
      $group: {
        _id: '$predictedCategory',
        total: { $sum: 1 },
        correct: {
          $sum: {
            $cond: [
              { $eq: ['$predictedCategory', '$ticket.category'] },
              1,
              0
            ]
          }
        },
        avgConfidence: { $avg: '$categoryConfidence' }
      }
    },
    {
      $project: {
        category: '$_id',
        total: 1,
        correct: 1,
        accuracy: { $divide: ['$correct', '$total'] },
        avgConfidence: { $round: ['$avgConfidence', 3] }
      }
    },
    { $sort: { accuracy: -1 } }
  ]);
};

const AgentSuggestion = mongoose.model('AgentSuggestion', agentSuggestionSchema);

export default AgentSuggestion;
