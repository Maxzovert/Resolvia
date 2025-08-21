import express from 'express';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Middleware to ensure only admins can access these routes
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get all users (admin only)
router.get('/users',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const users = await User.find({}, '-password')
      .sort({ createdAt: -1 });
    
    res.json({ users });
  })
);

// Create new user (admin only)
router.post('/users',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;
    
    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ 
        error: 'Name, email, password, and role are required' 
      });
    }
    
    // Validate role
    if (!['user', 'agent', 'admin'].includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role. Must be user, agent, or admin' 
      });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User with this email already exists' 
      });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create user with passwordHash field
    const user = new User({
      name,
      email,
      passwordHash: hashedPassword,
      role
    });
    
    await user.save();
    
    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    
    res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  })
);

// Update user role (admin only)
router.put('/users/:id/role',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['user', 'agent', 'admin'].includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role. Must be user, agent, or admin' 
      });
    }
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent admin from changing their own role
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ 
        error: 'Cannot change your own role' 
      });
    }
    
    user.role = role;
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({
      message: 'User role updated successfully',
      user: userResponse
    });
  })
);

// Delete user (admin only)
router.delete('/users/:id',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ 
        error: 'Cannot delete your own account' 
      });
    }
    
    // Prevent deletion of the last admin
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ 
          error: 'Cannot delete the last admin account' 
        });
      }
    }
    
    await User.findByIdAndDelete(id);
    
    res.json({ message: 'User deleted successfully' });
  })
);

export default router;
