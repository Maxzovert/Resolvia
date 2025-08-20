import mongoose from 'mongoose';

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 200
  },
  body: {
    type: String,
    required: true,
    minlength: 20,
    maxlength: 10000
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 30
  }],
  status: {
    type: String,
    required: true,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  category: {
    type: String,
    trim: true,
    lowercase: true,
    enum: ['billing', 'tech', 'shipping', 'other'],
    default: 'other'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  viewCount: {
    type: Number,
    default: 0
  },
  helpfulCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for search performance
articleSchema.index({ title: 'text', body: 'text', tags: 'text' });
articleSchema.index({ status: 1, category: 1 });
articleSchema.index({ tags: 1 });
articleSchema.index({ createdAt: -1 });

// Virtual for search score
articleSchema.virtual('searchScore').get(function() {
  return this.helpfulCount + (this.viewCount * 0.1);
});

// Methods
articleSchema.methods.incrementView = function() {
  this.viewCount += 1;
  return this.save();
};

articleSchema.methods.incrementHelpful = function() {
  this.helpfulCount += 1;
  return this.save();
};

// Static methods for search
articleSchema.statics.searchByKeywords = function(keywords, options = {}) {
  const {
    status = 'published',
    category,
    limit = 10,
    skip = 0
  } = options;

  const query = { status };
  if (category) query.category = category;

  if (keywords && keywords.trim()) {
    query.$text = { $search: keywords };
  }

  return this.find(query)
    .select('title body tags category viewCount helpfulCount createdAt')
    .sort(keywords ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('createdBy', 'name email');
};

// Static method to find similar articles by tags
articleSchema.statics.findSimilar = function(articleId, tags, limit = 5) {
  return this.find({
    _id: { $ne: articleId },
    status: 'published',
    tags: { $in: tags }
  })
  .select('title tags category')
  .sort({ helpfulCount: -1, createdAt: -1 })
  .limit(limit);
};

const Article = mongoose.model('Article', articleSchema);

export default Article;
