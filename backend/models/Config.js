import mongoose from 'mongoose';

const configSchema = new mongoose.Schema({
  // Singleton pattern - only one config document
  _id: {
    type: String,
    default: 'config'
  },
  
  // Auto-close settings
  autoCloseEnabled: {
    type: Boolean,
    default: false
  },
  confidenceThreshold: {
    type: Number,
    default: 0.8,
    min: 0,
    max: 1
  },
  
  // SLA settings
  slaHours: {
    type: Number,
    default: 24,
    min: 1,
    max: 168 // 1 week max
  },
  
  // AI settings
  aiModel: {
    type: String,
    default: 'gemini-pro',
    enum: ['gemini-pro', 'stub']
  },
  stubMode: {
    type: Boolean,
    default: true
  },
  
  // Notification settings
  emailNotificationsEnabled: {
    type: Boolean,
    default: true
  },
  
  // Agent assignment settings
  autoAssignmentEnabled: {
    type: Boolean,
    default: false
  },
  maxTicketsPerAgent: {
    type: Number,
    default: 10,
    min: 1,
    max: 50
  },
  
  // Business hours
  businessHours: {
    enabled: {
      type: Boolean,
      default: false
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    schedule: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        monday: { start: '09:00', end: '17:00' },
        tuesday: { start: '09:00', end: '17:00' },
        wednesday: { start: '09:00', end: '17:00' },
        thursday: { start: '09:00', end: '17:00' },
        friday: { start: '09:00', end: '17:00' },
        saturday: { start: '09:00', end: '17:00' },
        sunday: { start: '09:00', end: '17:00' }
      }
    }
  },
  
  // Knowledge base settings
  kbSettings: {
    requireApproval: {
      type: Boolean,
      default: true
    },
    allowUserSubmissions: {
      type: Boolean,
      default: false
    },
    autoTagging: {
      type: Boolean,
      default: true
    }
  },
  
  // System limits
  limits: {
    maxAttachmentSize: {
      type: Number,
      default: 10485760 // 10MB in bytes
    },
    maxTicketsPerUser: {
      type: Number,
      default: 20
    },
    rateLimitRequests: {
      type: Number,
      default: 100
    },
    rateLimitWindow: {
      type: Number,
      default: 900000 // 15 minutes in ms
    }
  },
  
  // Metadata
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Static method to get config (singleton)
configSchema.statics.getConfig = async function() {
  let config = await this.findById('config');
  
  if (!config) {
    // Create default config if it doesn't exist
    config = await this.create({});
  }
  
  return config;
};

// Static method to update config
configSchema.statics.updateConfig = async function(updates, updatedBy) {
  const config = await this.getConfig();
  
  // Validate updates
  const allowedUpdates = [
    'autoCloseEnabled',
    'confidenceThreshold',
    'slaHours',
    'aiModel',
    'stubMode',
    'emailNotificationsEnabled',
    'autoAssignmentEnabled',
    'maxTicketsPerAgent',
    'businessHours',
    'kbSettings',
    'limits'
  ];
  
  const updateKeys = Object.keys(updates);
  const isValidUpdate = updateKeys.every(key => allowedUpdates.includes(key));
  
  if (!isValidUpdate) {
    throw new Error('Invalid configuration update');
  }
  
  // Apply updates
  updateKeys.forEach(key => {
    if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
      // Merge nested objects
      config[key] = { ...config[key], ...updates[key] };
    } else {
      config[key] = updates[key];
    }
  });
  
  config.lastUpdatedBy = updatedBy;
  config.version += 1;
  
  return config.save();
};

// Method to check if within business hours
configSchema.methods.isWithinBusinessHours = function(date = new Date()) {
  if (!this.businessHours.enabled) return true;
  
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'lowercase' });
  const schedule = this.businessHours.schedule[dayOfWeek];
  
  if (!schedule) return false;
  
  const currentTime = date.toTimeString().slice(0, 5); // HH:MM format
  return currentTime >= schedule.start && currentTime <= schedule.end;
};

// Method to calculate next business day
configSchema.methods.getNextBusinessDay = function(fromDate = new Date()) {
  if (!this.businessHours.enabled) return fromDate;
  
  let nextDay = new Date(fromDate);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(9, 0, 0, 0); // Start of business day
  
  while (!this.isWithinBusinessHours(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  
  return nextDay;
};

// Method to export safe config (without sensitive data)
configSchema.methods.toSafeObject = function() {
  const config = this.toObject();
  
  // Remove sensitive or internal fields if any
  delete config._id;
  delete config.__v;
  
  return config;
};

// Virtual for display name
configSchema.virtual('displayName').get(function() {
  return `Configuration v${this.version}`;
});

const Config = mongoose.model('Config', configSchema);

export default Config;
