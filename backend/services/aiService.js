import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import Article from '../models/Article.js';
import AgentSuggestion from '../models/AgentSuggestion.js';
import AuditLog from '../models/AuditLog.js';
import Config from '../models/Config.js';

class AIService {
  constructor() {
    this.genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
    this.model = this.genAI ? this.genAI.getGenerativeModel({ model: 'gemini-pro' }) : null;
  }

  async processTicket(ticket) {
    const traceId = uuidv4();
    const startTime = Date.now();

    try {
      // Log the start of triage process
      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId,
        actor: 'system',
        action: 'category_predicted',
        description: 'Starting AI triage process',
        meta: { ticketTitle: ticket.title }
      });

      // Step 1: Classify category
      const categoryResult = await this.classifyCategory(ticket, traceId);
      
      // Step 2: Retrieve relevant KB articles
      const articles = await this.retrieveRelevantArticles(ticket, categoryResult.category, traceId);
      
      // Step 3: Generate draft reply
      const draftResult = await this.generateDraftReply(ticket, articles, categoryResult, traceId);
      
      // Step 4: Calculate overall confidence
      const confidence = this.calculateOverallConfidence(categoryResult, draftResult, articles);
      
      // Step 5: Create agent suggestion
      const suggestion = await AgentSuggestion.create({
        ticketId: ticket._id,
        traceId,
        predictedCategory: categoryResult.category,
        categoryConfidence: categoryResult.confidence,
        articleIds: articles.map(a => a._id),
        draftReply: draftResult.reply,
        confidence,
        modelInfo: {
          model: process.env.STUB_MODE === 'true' ? 'stub' : 'gemini-pro',
          version: '1.0',
          processingTime: Date.now() - startTime,
          tokensUsed: draftResult.tokensUsed || 0
        }
      });

      // Step 6: Check for auto-close
      const config = await Config.getConfig();
      const shouldAutoClose = config.autoCloseEnabled && confidence >= config.confidenceThreshold;
      
      if (shouldAutoClose) {
        suggestion.autoClosed = true;
        await suggestion.save();
        
        await AuditLog.logAction({
          ticketId: ticket._id,
          traceId,
          actor: 'system',
          action: 'auto_closed',
          description: `Auto-closed with confidence ${confidence.toFixed(3)}`,
          meta: { 
            confidence, 
            threshold: config.confidenceThreshold,
            draftReply: draftResult.reply 
          }
        });
      }

      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId,
        actor: 'system',
        action: 'reply_drafted',
        description: 'AI triage process completed',
        meta: { 
          confidence,
          category: categoryResult.category,
          articlesFound: articles.length,
          autoClosed: shouldAutoClose
        }
      });

      return {
        suggestion,
        shouldAutoClose,
        traceId
      };

    } catch (error) {
      console.error('AI Service Error:', error);
      
      // Log the error
      await AuditLog.logAction({
        ticketId: ticket._id,
        traceId,
        actor: 'system',
        action: 'triage_failed',
        description: `AI triage failed: ${error.message}`,
        meta: { error: error.message }
      });

      // Return fallback stub result
      return this.getStubResult(ticket, traceId);
    }
  }

  async classifyCategory(ticket, traceId) {
    if (process.env.STUB_MODE === 'true' || !this.model) {
      return this.stubClassifyCategory(ticket);
    }

    try {
      const prompt = `
        Classify the following support ticket into one of these categories: billing, tech, shipping, other.
        
        Ticket Title: ${ticket.title}
        Ticket Description: ${ticket.description}
        
        Respond with only JSON in this format:
        {"category": "billing|tech|shipping|other", "confidence": 0.0-1.0, "reasoning": "brief explanation"}
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const parsed = JSON.parse(text);
      
      return {
        category: parsed.category,
        confidence: Math.min(Math.max(parsed.confidence, 0), 1),
        reasoning: parsed.reasoning
      };
    } catch (error) {
      console.error('Gemini classification error:', error);
      return this.stubClassifyCategory(ticket);
    }
  }

  stubClassifyCategory(ticket) {
    const text = `${ticket.title} ${ticket.description}`.toLowerCase();
    
    // Simple keyword-based classification
    const keywords = {
      billing: ['bill', 'invoice', 'payment', 'charge', 'refund', 'subscription', 'price', 'cost'],
      tech: ['bug', 'error', 'crash', 'not working', 'broken', 'issue', 'problem', 'technical'],
      shipping: ['delivery', 'shipping', 'package', 'tracking', 'shipment', 'order', 'received']
    };

    let bestCategory = 'other';
    let bestScore = 0;

    for (const [category, words] of Object.entries(keywords)) {
      const score = words.reduce((count, word) => {
        return count + (text.includes(word) ? 1 : 0);
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    return {
      category: bestCategory,
      confidence: bestScore > 0 ? 0.8 : 0.5,
      reasoning: bestScore > 0 ? `Keywords found: ${bestScore}` : 'No specific keywords found'
    };
  }

  async retrieveRelevantArticles(ticket, category, traceId) {
    const query = `${ticket.title} ${ticket.description}`;
    
    // Search for articles
    const articles = await Article.searchByKeywords(query, {
      status: 'published',
      category,
      limit: 5
    });

    // If no articles found in specific category, search all categories
    if (articles.length === 0) {
      const allArticles = await Article.searchByKeywords(query, {
        status: 'published',
        limit: 3
      });
      articles.push(...allArticles);
    }

    await AuditLog.logAction({
      ticketId: ticket._id,
      traceId,
      actor: 'system',
      action: 'articles_retrieved',
      description: `Retrieved ${articles.length} relevant articles`,
      meta: { 
        query: query.substring(0, 100),
        category,
        articleIds: articles.map(a => a._id)
      }
    });

    return articles;
  }

  async generateDraftReply(ticket, articles, categoryResult, traceId) {
    if (process.env.STUB_MODE === 'true' || !this.model) {
      return this.stubGenerateDraftReply(ticket, articles, categoryResult);
    }

    try {
      const articlesText = articles.map(a => 
        `Title: ${a.title}\nContent: ${a.body.substring(0, 300)}...`
      ).join('\n\n');

      const prompt = `
        Generate a helpful response to this support ticket using the provided knowledge base articles.
        
        Ticket: ${ticket.title}
        Description: ${ticket.description}
        Predicted Category: ${categoryResult.category}
        
        Relevant Knowledge Base Articles:
        ${articlesText}
        
        Write a professional, helpful response that:
        1. Addresses the customer's concern
        2. References relevant KB articles
        3. Is concise but informative
        4. Maintains a friendly tone
        
        If the KB articles don't fully address the issue, acknowledge this and suggest next steps.
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const reply = response.text();

      return {
        reply: reply.trim(),
        tokensUsed: response.usageMetadata?.totalTokenCount || 0
      };
    } catch (error) {
      console.error('Gemini reply generation error:', error);
      return this.stubGenerateDraftReply(ticket, articles, categoryResult);
    }
  }

  stubGenerateDraftReply(ticket, articles, categoryResult) {
    let reply = `Thank you for contacting us regarding "${ticket.title}".`;

    if (articles.length > 0) {
      reply += `\n\nBased on your query, I found some relevant information that might help:\n\n`;
      
      articles.forEach((article, index) => {
        reply += `${index + 1}. ${article.title}\n`;
      });

      reply += `\nPlease review these resources. If they don't fully address your concern, our team will be happy to assist you further.`;
    } else {
      reply += `\n\nI understand you need help with this ${categoryResult.category} issue. Our team will review your request and get back to you shortly.`;
    }

    reply += `\n\nBest regards,\nResolvia Support Team`;

    return {
      reply,
      tokensUsed: 0
    };
  }

  calculateOverallConfidence(categoryResult, draftResult, articles) {
    let confidence = categoryResult.confidence * 0.4; // Category confidence (40%)
    
    // Article relevance score (30%)
    const articleScore = Math.min(articles.length / 3, 1) * 0.3;
    confidence += articleScore;
    
    // Reply quality score (30%)
    const replyLength = draftResult.reply.length;
    const replyScore = Math.min(replyLength / 500, 1) * 0.3;
    confidence += replyScore;
    
    return Math.min(confidence, 1);
  }

  async getStubResult(ticket, traceId) {
    const categoryResult = this.stubClassifyCategory(ticket);
    const articles = await this.retrieveRelevantArticles(ticket, categoryResult.category, traceId);
    const draftResult = this.stubGenerateDraftReply(ticket, articles, categoryResult);
    const confidence = this.calculateOverallConfidence(categoryResult, draftResult, articles);

    const suggestion = await AgentSuggestion.create({
      ticketId: ticket._id,
      traceId,
      predictedCategory: categoryResult.category,
      categoryConfidence: categoryResult.confidence,
      articleIds: articles.map(a => a._id),
      draftReply: draftResult.reply,
      confidence,
      modelInfo: {
        model: 'stub',
        version: '1.0',
        processingTime: 100,
        tokensUsed: 0
      }
    });

    return {
      suggestion,
      shouldAutoClose: false,
      traceId
    };
  }
}

export default new AIService();
