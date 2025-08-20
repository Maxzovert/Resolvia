import express from 'express';
import Config from '../models/Config.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { validateRequest, updateConfigSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get current configuration
router.get('/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const config = await Config.getConfig();
    
    // Different response based on user role
    if (req.user.role === 'admin') {
      res.json({ config: config.toSafeObject() });
    } else {
      // Limited config for non-admin users
      res.json({
        config: {
          slaHours: config.slaHours,
          businessHours: config.businessHours,
          limits: {
            maxAttachmentSize: config.limits.maxAttachmentSize,
            maxTicketsPerUser: config.limits.maxTicketsPerUser
          }
        }
      });
    }
  })
);

// Update configuration (admin only)
router.put('/',
  authenticateToken,
  requireAdmin,
  validateRequest(updateConfigSchema),
  asyncHandler(async (req, res) => {
    const config = await Config.updateConfig(req.body, req.user._id);
    
    res.json({
      message: 'Configuration updated successfully',
      config: config.toSafeObject()
    });
  })
);

// Reset configuration to defaults (admin only)
router.post('/reset',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Delete current config to trigger default creation
    await Config.findByIdAndDelete('config');
    
    // Get new default config
    const config = await Config.getConfig();
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    res.json({
      message: 'Configuration reset to defaults',
      config: config.toSafeObject()
    });
  })
);

// Get configuration history/versions (admin only)
router.get('/history',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // For now, just return current config
    // In a real app, you might want to track config changes in AuditLog
    const config = await Config.getConfig();
    
    res.json({
      versions: [{
        version: config.version,
        updatedAt: config.updatedAt,
        updatedBy: config.lastUpdatedBy
      }]
    });
  })
);

// Validate configuration without saving (admin only)
router.post('/validate',
  authenticateToken,
  requireAdmin,
  validateRequest(updateConfigSchema),
  asyncHandler(async (req, res) => {
    // If validation passes, the configuration is valid
    res.json({
      message: 'Configuration is valid',
      valid: true
    });
  })
);

// Test business hours calculation
router.post('/test-business-hours',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { testDate } = req.body;
    const config = await Config.getConfig();
    
    const date = testDate ? new Date(testDate) : new Date();
    const isWithinHours = config.isWithinBusinessHours(date);
    const nextBusinessDay = config.getNextBusinessDay(date);
    
    res.json({
      testDate: date,
      isWithinBusinessHours: isWithinHours,
      nextBusinessDay,
      businessHoursEnabled: config.businessHours.enabled,
      timezone: config.businessHours.timezone
    });
  })
);

// Get system health status
router.get('/health',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const config = await Config.getConfig();
    
    // Check various system components
    const health = {
      database: 'healthy',
      ai: {
        stubMode: config.stubMode,
        model: config.aiModel,
        status: process.env.GEMINI_API_KEY ? 'configured' : 'not_configured'
      },
      features: {
        autoClose: config.autoCloseEnabled,
        emailNotifications: config.emailNotificationsEnabled,
        autoAssignment: config.autoAssignmentEnabled,
        businessHours: config.businessHours.enabled
      },
      limits: config.limits,
      version: config.version,
      uptime: process.uptime()
    };
    
    res.json({ health });
  })
);

// Update specific feature flags (admin only)
router.patch('/features',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { feature, enabled } = req.body;
    
    const allowedFeatures = [
      'autoCloseEnabled',
      'emailNotificationsEnabled', 
      'autoAssignmentEnabled'
    ];
    
    if (!allowedFeatures.includes(feature)) {
      return res.status(400).json({ error: 'Invalid feature flag' });
    }
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Feature flag must be boolean' });
    }
    
    const updates = { [feature]: enabled };
    const config = await Config.updateConfig(updates, req.user._id);
    
    res.json({
      message: `Feature ${feature} ${enabled ? 'enabled' : 'disabled'}`,
      feature,
      enabled,
      version: config.version
    });
  })
);

export default router;
