import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import mongoose from 'mongoose';

describe('Audit Logging', () => {
  let testUser;
  let testTicket;
  let traceId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resolvia-test');
  });

  beforeEach(async () => {
    // Clean up collections
    await AuditLog.deleteMany({});
    await User.deleteMany({});
    await Ticket.deleteMany({});

    // Create test user
    testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'hashedpassword',
      role: 'user'
    });

    // Create test ticket
    testTicket = await Ticket.create({
      title: 'Test Ticket for Audit',
      description: 'This ticket is for testing audit functionality',
      category: 'tech',
      status: 'open',
      createdBy: testUser._id
    });

    traceId = `test-trace-${Date.now()}`;
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('AuditLog.logAction', () => {
    it('should create audit log entry successfully', async () => {
      const logData = {
        ticketId: testTicket._id,
        traceId,
        actor: 'user',
        actorId: testUser._id,
        action: 'ticket_created',
        description: 'User created a new ticket',
        meta: { category: 'tech', priority: 'medium' }
      };

      const auditEntry = await AuditLog.logAction(logData);

      expect(auditEntry).toBeTruthy();
      expect(auditEntry.ticketId.toString()).toBe(testTicket._id.toString());
      expect(auditEntry.traceId).toBe(traceId);
      expect(auditEntry.actor).toBe('user');
      expect(auditEntry.action).toBe('ticket_created');
      expect(auditEntry.description).toBe('User created a new ticket');
      expect(auditEntry.meta.category).toBe('tech');
      expect(auditEntry.timestamp).toBeInstanceOf(Date);
    });

    it('should handle system actions without actorId', async () => {
      const logData = {
        ticketId: testTicket._id,
        traceId,
        actor: 'system',
        action: 'category_predicted',
        description: 'AI predicted ticket category',
        meta: { predictedCategory: 'tech', confidence: 0.85 }
      };

      const auditEntry = await AuditLog.logAction(logData);

      expect(auditEntry.actor).toBe('system');
      expect(auditEntry.actorId).toBeUndefined();
      expect(auditEntry.meta.confidence).toBe(0.85);
    });

    it('should validate required fields', async () => {
      const invalidLogData = {
        // Missing ticketId, traceId, actor, action, description
        meta: { test: 'data' }
      };

      await expect(AuditLog.logAction(invalidLogData)).rejects.toThrow();
    });
  });

  describe('AuditLog.getTicketTimeline', () => {
    beforeEach(async () => {
      // Create multiple audit entries for the ticket
      const entries = [
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-1`,
          actor: 'user',
          actorId: testUser._id,
          action: 'ticket_created',
          description: 'Ticket was created',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-2`,
          actor: 'system',
          action: 'category_predicted',
          description: 'AI predicted category',
          timestamp: new Date('2024-01-01T10:01:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-3`,
          actor: 'agent',
          actorId: testUser._id,
          action: 'status_changed',
          description: 'Status changed to resolved',
          timestamp: new Date('2024-01-01T10:02:00Z')
        }
      ];

      await AuditLog.insertMany(entries);
    });

    it('should retrieve ticket timeline in chronological order', async () => {
      const timeline = await AuditLog.getTicketTimeline(testTicket._id);

      expect(timeline).toHaveLength(3);
      expect(timeline[0].action).toBe('ticket_created');
      expect(timeline[1].action).toBe('category_predicted');
      expect(timeline[2].action).toBe('status_changed');
      
      // Should be in ascending timestamp order
      expect(timeline[0].timestamp.getTime()).toBeLessThan(timeline[1].timestamp.getTime());
      expect(timeline[1].timestamp.getTime()).toBeLessThan(timeline[2].timestamp.getTime());
    });

    it('should support pagination', async () => {
      const timeline = await AuditLog.getTicketTimeline(testTicket._id, { limit: 2, skip: 1 });

      expect(timeline).toHaveLength(2);
      expect(timeline[0].action).toBe('category_predicted');
      expect(timeline[1].action).toBe('status_changed');
    });

    it('should populate actor information', async () => {
      const timeline = await AuditLog.getTicketTimeline(testTicket._id);

      const userEntry = timeline.find(entry => entry.actor === 'user');
      expect(userEntry.actorId).toBeTruthy();
      expect(userEntry.actorId.name).toBe('Test User');
      expect(userEntry.actorId.email).toBe('test@example.com');

      const systemEntry = timeline.find(entry => entry.actor === 'system');
      expect(systemEntry.actorId).toBeNull();
    });
  });

  describe('AuditLog.getTraceTimeline', () => {
    beforeEach(async () => {
      // Create audit entries with same trace ID
      const entries = [
        {
          ticketId: testTicket._id,
          traceId,
          actor: 'system',
          action: 'category_predicted',
          description: 'Starting triage process',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId,
          actor: 'system',
          action: 'articles_retrieved',
          description: 'Retrieved relevant articles',
          timestamp: new Date('2024-01-01T10:01:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId,
          actor: 'system',
          action: 'reply_drafted',
          description: 'AI drafted reply',
          timestamp: new Date('2024-01-01T10:02:00Z')
        }
      ];

      await AuditLog.insertMany(entries);
    });

    it('should retrieve all entries for a trace', async () => {
      const traceTimeline = await AuditLog.getTraceTimeline(traceId);

      expect(traceTimeline).toHaveLength(3);
      expect(traceTimeline.every(entry => entry.traceId === traceId)).toBe(true);
      expect(traceTimeline[0].action).toBe('category_predicted');
      expect(traceTimeline[1].action).toBe('articles_retrieved');
      expect(traceTimeline[2].action).toBe('reply_drafted');
    });
  });

  describe('AuditLog.getActivitySummary', () => {
    beforeEach(async () => {
      // Create audit entries across different days and actions
      const entries = [
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-1`,
          actor: 'user',
          action: 'ticket_created',
          description: 'Ticket created',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-2`,
          actor: 'user',
          action: 'ticket_created',
          description: 'Another ticket created',
          timestamp: new Date('2024-01-01T11:00:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-3`,
          actor: 'agent',
          action: 'reply_added',
          description: 'Agent replied',
          timestamp: new Date('2024-01-02T10:00:00Z')
        }
      ];

      await AuditLog.insertMany(entries);
    });

    it('should summarize activity by day', async () => {
      const summary = await AuditLog.getActivitySummary({
        startDate: '2024-01-01',
        endDate: '2024-01-02'
      });

      expect(summary).toHaveLength(2);
      
      const day1 = summary.find(s => s._id.day === 1);
      const day2 = summary.find(s => s._id.day === 2);
      
      expect(day1.totalActions).toBe(2);
      expect(day2.totalActions).toBe(1);
      
      expect(day1.actions).toContainEqual(
        expect.objectContaining({ action: 'ticket_created', count: 2 })
      );
      expect(day2.actions).toContainEqual(
        expect.objectContaining({ action: 'reply_added', count: 1 })
      );
    });

    it('should support hourly grouping', async () => {
      const summary = await AuditLog.getActivitySummary(
        { startDate: '2024-01-01', endDate: '2024-01-01' },
        { groupBy: 'hour' }
      );

      expect(summary.length).toBeGreaterThan(0);
      expect(summary[0]._id).toHaveProperty('hour');
    });
  });

  describe('AuditLog.getUserActivity', () => {
    beforeEach(async () => {
      // Create user activities
      const entries = [
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-1`,
          actor: 'user',
          actorId: testUser._id,
          action: 'ticket_created',
          description: 'Created ticket',
          timestamp: new Date('2024-01-01T10:00:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-2`,
          actor: 'user',
          actorId: testUser._id,
          action: 'reply_added',
          description: 'Added reply',
          timestamp: new Date('2024-01-01T11:00:00Z')
        },
        {
          ticketId: testTicket._id,
          traceId: `${traceId}-3`,
          actor: 'user',
          actorId: testUser._id,
          action: 'reply_added',
          description: 'Added another reply',
          timestamp: new Date('2024-01-01T12:00:00Z')
        }
      ];

      await AuditLog.insertMany(entries);
    });

    it('should summarize user activity by action', async () => {
      const userActivity = await AuditLog.getUserActivity(testUser._id);

      expect(userActivity).toHaveLength(2);
      
      const ticketCreated = userActivity.find(a => a._id === 'ticket_created');
      const replyAdded = userActivity.find(a => a._id === 'reply_added');
      
      expect(ticketCreated.count).toBe(1);
      expect(replyAdded.count).toBe(2);
      expect(replyAdded.lastOccurrence).toBeInstanceOf(Date);
    });

    it('should filter by date range', async () => {
      const userActivity = await AuditLog.getUserActivity(testUser._id, {
        startDate: '2024-01-01T10:30:00Z',
        endDate: '2024-01-01T11:30:00Z'
      });

      // Should only include the reply_added action from 11:00
      expect(userActivity).toHaveLength(1);
      expect(userActivity[0]._id).toBe('reply_added');
      expect(userActivity[0].count).toBe(1);
    });
  });

  describe('toDisplayFormat method', () => {
    it('should format audit entry for display', async () => {
      const auditEntry = await AuditLog.logAction({
        ticketId: testTicket._id,
        traceId,
        actor: 'user',
        actorId: testUser._id,
        action: 'ticket_created',
        description: 'User created a ticket',
        meta: { category: 'tech' }
      });

      await auditEntry.populate('actorId', 'name email role');
      const displayFormat = auditEntry.toDisplayFormat();

      expect(displayFormat).toHaveProperty('id');
      expect(displayFormat).toHaveProperty('timestamp');
      expect(displayFormat).toHaveProperty('actor');
      expect(displayFormat).toHaveProperty('actorName');
      expect(displayFormat).toHaveProperty('action');
      expect(displayFormat).toHaveProperty('description');
      expect(displayFormat).toHaveProperty('meta');

      expect(displayFormat.actor).toBe('user');
      expect(displayFormat.actorName).toBe('Test User');
      expect(displayFormat.action).toBe('ticket_created');
      expect(displayFormat.meta.category).toBe('tech');
    });

    it('should handle system entries without actor', async () => {
      const auditEntry = await AuditLog.logAction({
        ticketId: testTicket._id,
        traceId,
        actor: 'system',
        action: 'category_predicted',
        description: 'System predicted category'
      });

      const displayFormat = auditEntry.toDisplayFormat();

      expect(displayFormat.actor).toBe('system');
      expect(displayFormat.actorName).toBe('System');
    });
  });
});
