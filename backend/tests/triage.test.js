import aiService from '../services/aiService.js';
import Article from '../models/Article.js';
import Ticket from '../models/Ticket.js';
import AgentSuggestion from '../models/AgentSuggestion.js';
import AuditLog from '../models/AuditLog.js';
import Config from '../models/Config.js';
import mongoose from 'mongoose';

describe('AI Triage Service', () => {
  let testTicket;
  let testUser;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resolvia-test');
  });

  beforeEach(async () => {
    // Clean up collections
    await Ticket.deleteMany({});
    await Article.deleteMany({});
    await AgentSuggestion.deleteMany({});
    await AuditLog.deleteMany({});
    await Config.deleteMany({});

    // Create test user (mocked)
    testUser = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test User',
      email: 'test@example.com',
      role: 'user'
    };

    // Create test articles
    await Article.create([
      {
        title: 'Password Reset Guide',
        body: 'To reset your password: 1. Go to login page 2. Click forgot password 3. Enter email 4. Check inbox for reset link',
        tags: ['password', 'reset', 'login'],
        category: 'tech',
        status: 'published',
        createdBy: testUser._id
      },
      {
        title: 'Billing Questions',
        body: 'For billing issues: Contact our billing team at billing@company.com or check your invoice details',
        tags: ['billing', 'invoice', 'payment'],
        category: 'billing',
        status: 'published',
        createdBy: testUser._id
      },
      {
        title: 'Shipping Information',
        body: 'Track your order using the tracking number sent to your email. Delivery takes 3-5 business days',
        tags: ['shipping', 'delivery', 'tracking'],
        category: 'shipping',
        status: 'published',
        createdBy: testUser._id
      }
    ]);

    // Create test ticket
    testTicket = await Ticket.create({
      title: 'Cannot reset my password',
      description: 'I forgot my password and the reset email is not working. Please help me reset it.',
      category: 'other',
      status: 'open',
      createdBy: testUser._id
    });

    // Ensure we're in stub mode for consistent testing
    process.env.STUB_MODE = 'true';
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Category Classification', () => {
    it('should classify tech-related tickets correctly', async () => {
      const result = aiService.stubClassifyCategory({
        title: 'Password reset not working',
        description: 'I have a technical issue with password reset functionality'
      });

      expect(result.category).toBe('tech');
      expect(result.confidence).toBe(0.8);
      expect(result.reasoning).toContain('Keywords found');
    });

    it('should classify billing-related tickets correctly', async () => {
      const result = aiService.stubClassifyCategory({
        title: 'Invoice question',
        description: 'I have a question about my monthly subscription bill and payment'
      });

      expect(result.category).toBe('billing');
      expect(result.confidence).toBe(0.8);
    });

    it('should classify shipping-related tickets correctly', async () => {
      const result = aiService.stubClassifyCategory({
        title: 'Package delivery issue',
        description: 'My order has not arrived and tracking shows no updates'
      });

      expect(result.category).toBe('shipping');
      expect(result.confidence).toBe(0.8);
    });

    it('should default to other category when no keywords match', async () => {
      const result = aiService.stubClassifyCategory({
        title: 'General inquiry',
        description: 'I have a question about your company policies'
      });

      expect(result.category).toBe('other');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('Article Retrieval', () => {
    it('should retrieve relevant articles based on ticket content', async () => {
      const articles = await aiService.retrieveRelevantArticles(
        testTicket,
        'tech',
        'test-trace-id'
      );

      expect(articles.length).toBeGreaterThan(0);
      expect(articles[0].status).toBe('published');
    });

    it('should retrieve articles from all categories if none found in specific category', async () => {
      // Create a ticket with content that doesn't match any tech articles
      const nonTechTicket = await Ticket.create({
        title: 'Random question',
        description: 'This is a very specific question that should not match tech articles',
        category: 'tech',
        status: 'open',
        createdBy: testUser._id
      });

      const articles = await aiService.retrieveRelevantArticles(
        nonTechTicket,
        'tech',
        'test-trace-id'
      );

      // Should still return some articles from any category
      expect(Array.isArray(articles)).toBe(true);
    });
  });

  describe('Draft Reply Generation', () => {
    it('should generate appropriate reply with relevant articles', async () => {
      const articles = await Article.find({ category: 'tech' });
      const categoryResult = { category: 'tech', confidence: 0.8 };

      const result = aiService.stubGenerateDraftReply(testTicket, articles, categoryResult);

      expect(result.reply).toContain('Thank you for contacting us');
      expect(result.reply).toContain(testTicket.title);
      expect(result.reply).toContain('Password Reset Guide');
      expect(result.tokensUsed).toBe(0); // Stub mode
    });

    it('should generate fallback reply when no articles found', async () => {
      const categoryResult = { category: 'tech', confidence: 0.8 };

      const result = aiService.stubGenerateDraftReply(testTicket, [], categoryResult);

      expect(result.reply).toContain('Thank you for contacting us');
      expect(result.reply).toContain('tech issue');
      expect(result.reply).toContain('our team will review');
    });
  });

  describe('Full Triage Process', () => {
    it('should complete full triage process successfully', async () => {
      const result = await aiService.processTicket(testTicket);

      expect(result).toHaveProperty('suggestion');
      expect(result).toHaveProperty('shouldAutoClose');
      expect(result).toHaveProperty('traceId');

      expect(result.suggestion.ticketId.toString()).toBe(testTicket._id.toString());
      expect(result.suggestion.predictedCategory).toBe('tech');
      expect(result.suggestion.draftReply).toContain('Thank you for contacting us');
      expect(result.suggestion.confidence).toBeGreaterThan(0);
      expect(result.suggestion.modelInfo.model).toBe('stub');
    });

    it('should create audit log entries during triage', async () => {
      await aiService.processTicket(testTicket);

      const auditEntries = await AuditLog.find({ ticketId: testTicket._id });
      
      expect(auditEntries.length).toBeGreaterThan(0);
      expect(auditEntries.some(entry => entry.action === 'category_predicted')).toBe(true);
      expect(auditEntries.some(entry => entry.action === 'articles_retrieved')).toBe(true);
      expect(auditEntries.some(entry => entry.action === 'reply_drafted')).toBe(true);
    });

    it('should not auto-close by default', async () => {
      // Ensure default config doesn't auto-close
      const config = await Config.getConfig();
      config.autoCloseEnabled = false;
      await config.save();

      const result = await aiService.processTicket(testTicket);

      expect(result.shouldAutoClose).toBe(false);
      expect(result.suggestion.autoClosed).toBe(false);
    });

    it('should auto-close when confidence meets threshold', async () => {
      // Enable auto-close with low threshold
      const config = await Config.getConfig();
      config.autoCloseEnabled = true;
      config.confidenceThreshold = 0.1; // Very low threshold
      await config.save();

      const result = await aiService.processTicket(testTicket);

      expect(result.shouldAutoClose).toBe(true);
      expect(result.suggestion.autoClosed).toBe(true);

      // Should have auto-close audit log
      const autoCloseEntry = await AuditLog.findOne({
        ticketId: testTicket._id,
        action: 'auto_closed'
      });
      expect(autoCloseEntry).toBeTruthy();
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate confidence score correctly', async () => {
      const categoryResult = { category: 'tech', confidence: 0.8 };
      const draftResult = { reply: 'A detailed reply explaining the solution...', tokensUsed: 0 };
      const articles = await Article.find({ category: 'tech' });

      const confidence = aiService.calculateOverallConfidence(categoryResult, draftResult, articles);

      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
      
      // Should be weighted combination of category confidence, article relevance, and reply quality
      expect(confidence).toBeCloseTo(0.32 + 0.3 + 0.3, 1); // Approximately expected value
    });

    it('should handle edge cases in confidence calculation', async () => {
      const categoryResult = { category: 'other', confidence: 0.1 };
      const draftResult = { reply: 'Short', tokensUsed: 0 };
      const articles = [];

      const confidence = aiService.calculateOverallConfidence(categoryResult, draftResult, articles);

      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully and return stub result', async () => {
      // Create a ticket that might cause errors
      const problematicTicket = {
        _id: new mongoose.Types.ObjectId(),
        title: null, // This might cause issues
        description: null,
        category: 'tech'
      };

      const result = await aiService.getStubResult(problematicTicket, 'error-trace-id');

      expect(result).toHaveProperty('suggestion');
      expect(result).toHaveProperty('shouldAutoClose');
      expect(result).toHaveProperty('traceId');
      expect(result.shouldAutoClose).toBe(false);
    });
  });
});
