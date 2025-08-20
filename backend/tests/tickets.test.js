import request from 'supertest';
import app from '../server.js';
import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import mongoose from 'mongoose';

describe('Tickets', () => {
  let userToken;
  let agentToken;
  let adminToken;
  let userAccount;
  let agentAccount;
  let adminAccount;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resolvia-test');
  });

  beforeEach(async () => {
    // Clean up collections
    await User.deleteMany({});
    await Ticket.deleteMany({});

    // Create test users
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'user@example.com',
        password: 'password123',
        role: 'user'
      });
    userToken = userResponse.body.accessToken;
    userAccount = userResponse.body.user;

    const agentResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Agent',
        email: 'agent@example.com',
        password: 'password123',
        role: 'agent'
      });
    agentToken = agentResponse.body.accessToken;
    agentAccount = agentResponse.body.user;

    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin'
      });
    adminToken = adminResponse.body.accessToken;
    adminAccount = adminResponse.body.user;
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('POST /api/tickets', () => {
    it('should create ticket as user', async () => {
      const ticketData = {
        title: 'Password reset issue',
        description: 'I cannot reset my password. The email is not arriving.',
        category: 'tech',
        priority: 'medium'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body).toHaveProperty('ticket');
      expect(response.body.ticket.title).toBe(ticketData.title);
      expect(response.body.ticket.description).toBe(ticketData.description);
      expect(response.body.ticket.category).toBe(ticketData.category);
      expect(response.body.ticket.status).toBe('open');
      expect(response.body.ticket.createdBy._id).toBe(userAccount._id);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test'  // Missing description
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should not create ticket without authentication', async () => {
      const ticketData = {
        title: 'Test Ticket',
        description: 'This should not be created'
      };

      const response = await request(app)
        .post('/api/tickets')
        .send(ticketData)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should set SLA deadline when creating ticket', async () => {
      const ticketData = {
        title: 'Test Ticket with SLA',
        description: 'This ticket should have an SLA deadline'
      };

      const response = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .send(ticketData)
        .expect(201);

      expect(response.body.ticket).toHaveProperty('slaDeadline');
      expect(new Date(response.body.ticket.slaDeadline)).toBeInstanceOf(Date);
    });
  });

  describe('GET /api/tickets', () => {
    beforeEach(async () => {
      // Create test tickets
      await Ticket.create([
        {
          title: 'User Ticket 1',
          description: 'First ticket by user',
          category: 'tech',
          status: 'open',
          createdBy: userAccount._id
        },
        {
          title: 'User Ticket 2',
          description: 'Second ticket by user',
          category: 'billing',
          status: 'resolved',
          createdBy: userAccount._id
        },
        {
          title: 'Another User Ticket',
          description: 'Ticket by different user',
          category: 'tech',
          status: 'open',
          createdBy: agentAccount._id  // Using agent as another user
        }
      ]);
    });

    it('should get user own tickets only', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('tickets');
      expect(response.body.tickets).toHaveLength(2);
      expect(response.body.tickets.every(ticket => ticket.createdBy._id === userAccount._id)).toBe(true);
    });

    it('should get all tickets as admin', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.tickets).toHaveLength(3);
    });

    it('should filter tickets by status', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ status: 'open' })
        .expect(200);

      expect(response.body.tickets).toHaveLength(1);
      expect(response.body.tickets[0].status).toBe('open');
    });

    it('should filter tickets by category', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ category: 'billing' })
        .expect(200);

      expect(response.body.tickets).toHaveLength(1);
      expect(response.body.tickets[0].category).toBe('billing');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/tickets')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ limit: 1, page: 1 })
        .expect(200);

      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.tickets).toHaveLength(1);
    });
  });

  describe('GET /api/tickets/:id', () => {
    let userTicket;
    let otherUserTicket;

    beforeEach(async () => {
      userTicket = await Ticket.create({
        title: 'User Ticket',
        description: 'Ticket created by user',
        category: 'tech',
        status: 'open',
        createdBy: userAccount._id
      });

      otherUserTicket = await Ticket.create({
        title: 'Other User Ticket',
        description: 'Ticket created by other user',
        category: 'tech',
        status: 'open',
        createdBy: agentAccount._id
      });
    });

    it('should get own ticket details', async () => {
      const response = await request(app)
        .get(`/api/tickets/${userTicket._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('ticket');
      expect(response.body.ticket._id).toBe(userTicket._id.toString());
    });

    it('should not get other user ticket', async () => {
      const response = await request(app)
        .get(`/api/tickets/${otherUserTicket._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    it('should get any ticket as admin', async () => {
      const response = await request(app)
        .get(`/api/tickets/${otherUserTicket._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.ticket._id).toBe(otherUserTicket._id.toString());
    });
  });

  describe('POST /api/tickets/:id/reply', () => {
    let ticket;

    beforeEach(async () => {
      ticket = await Ticket.create({
        title: 'Test Ticket for Reply',
        description: 'This ticket will receive replies',
        category: 'tech',
        status: 'open',
        createdBy: userAccount._id
      });
    });

    it('should add reply to own ticket', async () => {
      const replyData = {
        content: 'This is my reply to the ticket',
        isInternal: false
      };

      const response = await request(app)
        .post(`/api/tickets/${ticket._id}/reply`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(replyData)
        .expect(200);

      expect(response.body).toHaveProperty('ticket');
      expect(response.body.ticket.replies).toHaveLength(1);
      expect(response.body.ticket.replies[0].content).toBe(replyData.content);
      expect(response.body.ticket.replies[0].author._id).toBe(userAccount._id);
    });

    it('should add internal reply as agent', async () => {
      // First assign ticket to agent
      await Ticket.findByIdAndUpdate(ticket._id, { assignee: agentAccount._id });

      const replyData = {
        content: 'Internal note for agent team',
        isInternal: true
      };

      const response = await request(app)
        .post(`/api/tickets/${ticket._id}/reply`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send(replyData)
        .expect(200);

      expect(response.body.ticket.replies[0].isInternal).toBe(true);
    });

    it('should not allow user to add internal reply', async () => {
      const replyData = {
        content: 'User trying to add internal note',
        isInternal: true
      };

      const response = await request(app)
        .post(`/api/tickets/${ticket._id}/reply`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(replyData)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/tickets/:id/assign', () => {
    let ticket;

    beforeEach(async () => {
      ticket = await Ticket.create({
        title: 'Test Ticket for Assignment',
        description: 'This ticket will be assigned',
        category: 'tech',
        status: 'triaged',
        createdBy: userAccount._id
      });
    });

    it('should assign ticket to agent', async () => {
      const assignData = {
        assigneeId: agentAccount._id
      };

      const response = await request(app)
        .post(`/api/tickets/${ticket._id}/assign`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send(assignData)
        .expect(200);

      expect(response.body.ticket.assignee._id).toBe(agentAccount._id);
    });

    it('should unassign ticket', async () => {
      // First assign the ticket
      await Ticket.findByIdAndUpdate(ticket._id, { assignee: agentAccount._id });

      const assignData = {
        assigneeId: null
      };

      const response = await request(app)
        .post(`/api/tickets/${ticket._id}/assign`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send(assignData)
        .expect(200);

      expect(response.body.ticket.assignee).toBeNull();
    });

    it('should not allow user to assign tickets', async () => {
      const assignData = {
        assigneeId: agentAccount._id
      };

      const response = await request(app)
        .post(`/api/tickets/${ticket._id}/assign`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(assignData)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });
  });
});
