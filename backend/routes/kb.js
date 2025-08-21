import express from 'express';
import Article from '../models/Article.js';
import { authenticateToken, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { 
  validateRequest, 
  validateQuery, 
  createArticleSchema, 
  updateArticleSchema,
  searchSchema 
} from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get all articles (alias for frontend compatibility)
router.get('/articles',
  optionalAuth,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { query, category, status = 'published', limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    // Build filter query
    let filterQuery = {};
    
    // Non-admin users only see published articles
    if (!req.user || req.user.role !== 'admin') {
      filterQuery.isPublic = true;
      filterQuery.status = 'published';
    } else if (status) {
      filterQuery.status = status;
    }
    
    if (category) filterQuery.category = category;
    if (query) filterQuery.$text = { $search: query };
    
    const articles = await Article.find(filterQuery)
      .populate('author', 'name email')
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    res.json(articles);
  })
);

// Get single article by ID (alias for frontend compatibility)
router.get('/articles/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id)
      .populate('author', 'name email');
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Check visibility
    if (!article.isPublic && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Increment view count for published articles
    if (article.status === 'published') {
      article.views = (article.views || 0) + 1;
      await article.save();
    }
    
    res.json(article);
  })
);

// Create new article (alias for frontend compatibility)
router.post('/articles',
  authenticateToken,
  requireAdmin,
  validateRequest(createArticleSchema),
  asyncHandler(async (req, res) => {
    const { title, content, category, tags = [], isPublic = true } = req.body;
    
    const article = new Article({
      title,
      content,
      category,
      tags,
      isPublic,
      author: req.user._id,
      status: 'published'
    });
    
    await article.save();
    await article.populate('author', 'name email');
    
    res.status(201).json(article);
  })
);

// Delete article (alias for frontend compatibility)
router.delete('/articles/:id',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    await Article.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Article deleted successfully' });
  })
);

// Search articles (public endpoint with optional auth)
router.get('/',
  optionalAuth,
  validateQuery(searchSchema),
  asyncHandler(async (req, res) => {
    const { query, category, status = 'published', limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;
    
    const articles = await Article.searchByKeywords(query, {
      status,
      category,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
    
    const total = await Article.countDocuments({
      ...(category && { category }),
      status,
      ...(query && { $text: { $search: query } })
    });
    
    res.json({
      articles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  })
);

// Get single article by ID
router.get('/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Only show published articles to non-admin users
    if (article.status !== 'published' && (!req.user || req.user.role !== 'admin')) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Increment view count for published articles
    if (article.status === 'published') {
      await article.incrementView();
    }
    
    // Get similar articles
    const similarArticles = await Article.findSimilar(article._id, article.tags);
    
    res.json({
      article,
      similarArticles
    });
  })
);

// Create new article (admin only)
router.post('/',
  authenticateToken,
  requireAdmin,
  validateRequest(createArticleSchema),
  asyncHandler(async (req, res) => {
    const articleData = {
      ...req.body,
      createdBy: req.user._id
    };
    
    const article = new Article(articleData);
    await article.save();
    
    await article.populate('createdBy', 'name email');
    
    res.status(201).json({
      message: 'Article created successfully',
      article
    });
  })
);

// Update article (admin only)
router.put('/:id',
  authenticateToken,
  requireAdmin,
  validateRequest(updateArticleSchema),
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'body', 'tags', 'status', 'category'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        article[field] = req.body[field];
      }
    });
    
    article.updatedBy = req.user._id;
    await article.save();
    
    await article.populate(['createdBy', 'updatedBy'], 'name email');
    
    res.json({
      message: 'Article updated successfully',
      article
    });
  })
);

// Delete article (admin only)
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    await Article.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Article deleted successfully' });
  })
);

// Mark article as helpful
router.post('/:id/helpful',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id);
    
    if (!article || article.status !== 'published') {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    await article.incrementHelpful();
    
    res.json({ 
      message: 'Feedback recorded',
      helpfulCount: article.helpfulCount 
    });
  })
);

// Get article categories with counts
router.get('/meta/categories',
  asyncHandler(async (req, res) => {
    const categories = await Article.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          latestUpdate: { $max: '$updatedAt' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({ categories });
  })
);

// Get popular tags
router.get('/meta/tags',
  asyncHandler(async (req, res) => {
    const tags = await Article.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 },
          articles: { $addToSet: '$_id' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    res.json({ tags });
  })
);

// Get KB statistics (admin only)
router.get('/meta/stats',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stats = await Article.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalViews: { $sum: '$viewCount' },
          totalHelpful: { $sum: '$helpfulCount' }
        }
      }
    ]);
    
    const categoryStats = await Article.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgViews: { $avg: '$viewCount' },
          avgHelpful: { $avg: '$helpfulCount' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    const recentArticles = await Article.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    res.json({
      statusStats: stats,
      categoryStats,
      recentArticles,
      totalArticles: await Article.countDocuments()
    });
  })
);

// Bulk operations (admin only)
router.post('/bulk',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { action, articleIds } = req.body;
    
    if (!action || !Array.isArray(articleIds) || articleIds.length === 0) {
      return res.status(400).json({ error: 'Action and article IDs are required' });
    }
    
    let result;
    
    switch (action) {
      case 'publish':
        result = await Article.updateMany(
          { _id: { $in: articleIds } },
          { status: 'published', updatedBy: req.user._id }
        );
        break;
        
      case 'unpublish':
        result = await Article.updateMany(
          { _id: { $in: articleIds } },
          { status: 'draft', updatedBy: req.user._id }
        );
        break;
        
      case 'delete':
        result = await Article.deleteMany({ _id: { $in: articleIds } });
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    res.json({
      message: `Bulk ${action} completed`,
      modifiedCount: result.modifiedCount || result.deletedCount
    });
  })
);

export default router;
