import request from 'supertest';
import app from '../server.js';
import User from '../models/User.js';
import Article from '../models/Article.js';
import mongoose from 'mongoose';

describe('Knowledge Base', () => {
  let adminToken;
  let userToken;
  let adminUser;
  let regularUser;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resolvia-test');
  });

  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await Article.deleteMany({});

    // Create admin user
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin'
      });

    adminToken = adminResponse.body.accessToken;
    adminUser = adminResponse.body.user;

    // Create regular user
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Regular User',
        email: 'user@example.com',
        password: 'password123',
        role: 'user'
      });

    userToken = userResponse.body.accessToken;
    regularUser = userResponse.body.user;
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/kb', () => {
    it('should create article as admin', async () => {
      const articleData = {
        title: 'How to reset your password',
        body: 'To reset your password, follow these steps: 1. Go to login page 2. Click forgot password 3. Enter your email',
        tags: ['password', 'reset', 'login'],
        category: 'tech',
        status: 'published'
      };

      const response = await request(app)
        .post('/api/kb')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(articleData)
        .expect(201);

      expect(response.body).toHaveProperty('article');
      expect(response.body.article.title).toBe(articleData.title);
      expect(response.body.article.createdBy._id).toBe(adminUser._id);
      expect(response.body.article.category).toBe('tech');
      expect(response.body.article.status).toBe('published');
    });

    it('should not create article as regular user', async () => {
      const articleData = {
        title: 'Test Article',
        body: 'This is a test article that should not be created by regular user',
        category: 'other'
      };

      const response = await request(app)
        .post('/api/kb')
        .set('Authorization', `Bearer ${userToken}`)
        .send(articleData)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/kb')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Test'  // Missing body
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/kb', () => {
    beforeEach(async () => {
      // Create test articles
      await Article.create([
        {
          title: 'Password Reset Guide',
          body: 'Detailed guide on how to reset your password...',
          tags: ['password', 'reset'],
          category: 'tech',
          status: 'published',
          createdBy: adminUser._id
        },
        {
          title: 'Billing FAQ',
          body: 'Frequently asked questions about billing...',
          tags: ['billing', 'faq'],
          category: 'billing',
          status: 'published',
          createdBy: adminUser._id
        },
        {
          title: 'Draft Article',
          body: 'This is a draft article...',
          tags: ['draft'],
          category: 'other',
          status: 'draft',
          createdBy: adminUser._id
        }
      ]);
    });

    it('should search published articles', async () => {
      const response = await request(app)
        .get('/api/kb')
        .query({ query: 'password' })
        .expect(200);

      expect(response.body).toHaveProperty('articles');
      expect(response.body.articles.length).toBeGreaterThan(0);
      expect(response.body.articles[0].status).toBe('published');
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/kb')
        .query({ category: 'billing' })
        .expect(200);

      expect(response.body.articles).toHaveLength(1);
      expect(response.body.articles[0].category).toBe('billing');
    });

    it('should only return published articles by default', async () => {
      const response = await request(app)
        .get('/api/kb')
        .expect(200);

      expect(response.body.articles.every(article => article.status === 'published')).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/kb')
        .query({ limit: 1, page: 1 })
        .expect(200);

      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.pagination.page).toBe(1);
    });
  });

  describe('GET /api/kb/:id', () => {
    let publishedArticle;
    let draftArticle;

    beforeEach(async () => {
      publishedArticle = await Article.create({
        title: 'Published Article',
        body: 'This is a published article...',
        tags: ['test'],
        category: 'tech',
        status: 'published',
        createdBy: adminUser._id
      });

      draftArticle = await Article.create({
        title: 'Draft Article',
        body: 'This is a draft article...',
        tags: ['test'],
        category: 'tech',
        status: 'draft',
        createdBy: adminUser._id
      });
    });

    it('should get published article by ID', async () => {
      const response = await request(app)
        .get(`/api/kb/${publishedArticle._id}`)
        .expect(200);

      expect(response.body).toHaveProperty('article');
      expect(response.body.article._id).toBe(publishedArticle._id.toString());
      expect(response.body.article.viewCount).toBe(1); // Should increment view count
    });

    it('should not get draft article as regular user', async () => {
      const response = await request(app)
        .get(`/api/kb/${draftArticle._id}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should get draft article as admin', async () => {
      const response = await request(app)
        .get(`/api/kb/${draftArticle._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('article');
      expect(response.body.article._id).toBe(draftArticle._id.toString());
    });
  });

  describe('PUT /api/kb/:id', () => {
    let article;

    beforeEach(async () => {
      article = await Article.create({
        title: 'Test Article',
        body: 'Original content...',
        tags: ['test'],
        category: 'tech',
        status: 'draft',
        createdBy: adminUser._id
      });
    });

    it('should update article as admin', async () => {
      const updateData = {
        title: 'Updated Article Title',
        body: 'Updated content...',
        status: 'published'
      };

      const response = await request(app)
        .put(`/api/kb/${article._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.article.title).toBe(updateData.title);
      expect(response.body.article.body).toBe(updateData.body);
      expect(response.body.article.status).toBe(updateData.status);
      expect(response.body.article.updatedBy._id).toBe(adminUser._id);
    });

    it('should not update article as regular user', async () => {
      const response = await request(app)
        .put(`/api/kb/${article._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Hacked Title' })
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/kb/:id', () => {
    let article;

    beforeEach(async () => {
      article = await Article.create({
        title: 'Test Article to Delete',
        body: 'This article will be deleted...',
        tags: ['test'],
        category: 'tech',
        status: 'published',
        createdBy: adminUser._id
      });
    });

    it('should delete article as admin', async () => {
      const response = await request(app)
        .delete(`/api/kb/${article._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');

      // Verify article is deleted
      const deletedArticle = await Article.findById(article._id);
      expect(deletedArticle).toBeNull();
    });

    it('should not delete article as regular user', async () => {
      const response = await request(app)
        .delete(`/api/kb/${article._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');

      // Verify article still exists
      const existingArticle = await Article.findById(article._id);
      expect(existingArticle).toBeTruthy();
    });
  });
});
