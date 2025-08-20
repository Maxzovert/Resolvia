import Joi from 'joi';

export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const details = error.details.map(detail => detail.message);
      return res.status(400).json({
        error: 'Validation Error',
        details
      });
    }
    
    next();
  };
};

// Auth validation schemas
export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(128).required(),
  role: Joi.string().valid('user', 'agent', 'admin').default('user')
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

// KB validation schemas
export const createArticleSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  body: Joi.string().min(20).max(10000).required(),
  tags: Joi.array().items(Joi.string().max(30)).max(10).default([]),
  status: Joi.string().valid('draft', 'published').default('draft'),
  category: Joi.string().valid('billing', 'tech', 'shipping', 'other').default('other')
});

export const updateArticleSchema = Joi.object({
  title: Joi.string().min(5).max(200),
  body: Joi.string().min(20).max(10000),
  tags: Joi.array().items(Joi.string().max(30)).max(10),
  status: Joi.string().valid('draft', 'published'),
  category: Joi.string().valid('billing', 'tech', 'shipping', 'other')
});

// Ticket validation schemas
export const createTicketSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).max(5000).required(),
  category: Joi.string().valid('billing', 'tech', 'shipping', 'other').default('other'),
  attachmentUrl: Joi.string().uri().allow(''),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium')
});

export const updateTicketSchema = Joi.object({
  title: Joi.string().min(5).max(200),
  description: Joi.string().min(10).max(5000),
  category: Joi.string().valid('billing', 'tech', 'shipping', 'other'),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
  status: Joi.string().valid('open', 'triaged', 'waiting_human', 'in_progress', 'resolved', 'closed')
});

export const addReplySchema = Joi.object({
  content: Joi.string().min(1).max(5000).required(),
  isInternal: Joi.boolean().default(false)
});

export const assignTicketSchema = Joi.object({
  assigneeId: Joi.string().hex().length(24).allow(null)
});

// Config validation schemas
export const updateConfigSchema = Joi.object({
  autoCloseEnabled: Joi.boolean(),
  confidenceThreshold: Joi.number().min(0).max(1),
  slaHours: Joi.number().min(1).max(168),
  aiModel: Joi.string().valid('gemini-pro', 'stub'),
  stubMode: Joi.boolean(),
  emailNotificationsEnabled: Joi.boolean(),
  autoAssignmentEnabled: Joi.boolean(),
  maxTicketsPerAgent: Joi.number().min(1).max(50),
  businessHours: Joi.object({
    enabled: Joi.boolean(),
    timezone: Joi.string(),
    schedule: Joi.object().pattern(
      Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
      Joi.object({
        start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
        end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      })
    )
  }),
  kbSettings: Joi.object({
    requireApproval: Joi.boolean(),
    allowUserSubmissions: Joi.boolean(),
    autoTagging: Joi.boolean()
  }),
  limits: Joi.object({
    maxAttachmentSize: Joi.number().min(1024).max(104857600), // 1KB to 100MB
    maxTicketsPerUser: Joi.number().min(1).max(100),
    rateLimitRequests: Joi.number().min(1).max(1000),
    rateLimitWindow: Joi.number().min(60000).max(3600000) // 1 minute to 1 hour
  })
});

// Agent feedback schema
export const agentFeedbackSchema = Joi.object({
  accepted: Joi.boolean().required(),
  editedReply: Joi.string().max(5000),
  feedbackNotes: Joi.string().max(1000),
  rating: Joi.number().min(1).max(5)
});

// Search validation
export const searchSchema = Joi.object({
  query: Joi.string().max(200),
  category: Joi.string().valid('billing', 'tech', 'shipping', 'other'),
  status: Joi.string(),
  limit: Joi.number().min(1).max(50).default(10),
  page: Joi.number().min(1).default(1)
});

// Query parameter validation middleware
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query);
    
    if (error) {
      const details = error.details.map(detail => detail.message);
      return res.status(400).json({
        error: 'Query Validation Error',
        details
      });
    }
    
    req.query = value;
    next();
  };
};
