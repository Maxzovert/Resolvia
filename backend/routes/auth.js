import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { 
  generateTokens, 
  verifyRefreshToken, 
  authenticateToken 
} from '../middleware/auth.js';
import { 
  validateRequest, 
  registerSchema, 
  loginSchema, 
  refreshTokenSchema 
} from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Register new user
router.post('/register', 
  validateRequest(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, role = 'user' } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Create new user
    const user = new User({
      name,
      email,
      passwordHash: password, // Will be hashed by pre-save middleware
      role
    });
    
    await user.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    // Save refresh token
    await user.addRefreshToken(refreshToken);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      accessToken,
      refreshToken
    });
  })
);

// Login user
router.post('/login',
  validateRequest(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    // Find user and include password hash for comparison
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    
    // Save refresh token
    await user.addRefreshToken(refreshToken);
    
    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      accessToken,
      refreshToken
    });
  })
);

// Refresh access token
router.post('/refresh',
  validateRequest(refreshTokenSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    
    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);
      
      // Find user and check if refresh token exists
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
      
      const tokenExists = user.refreshTokens.some(rt => rt.token === refreshToken);
      if (!tokenExists) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
      
      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
      
      // Replace old refresh token with new one
      await user.removeRefreshToken(refreshToken);
      await user.addRefreshToken(newRefreshToken);
      
      res.json({
        accessToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
  })
);

// Logout user
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await req.user.removeRefreshToken(refreshToken);
    }
    
    res.json({ message: 'Logout successful' });
  })
);

// Logout from all devices
router.post('/logout-all',
  authenticateToken,
  asyncHandler(async (req, res) => {
    req.user.refreshTokens = [];
    await req.user.save();
    
    res.json({ message: 'Logged out from all devices' });
  })
);

// Get current user profile
router.get('/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({
      user: req.user.toJSON()
    });
  })
);

// Update user profile
router.put('/profile',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const allowedUpdates = ['name'];
    const updates = {};
    
    // Only allow certain fields to be updated
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }
    
    Object.assign(req.user, updates);
    await req.user.save();
    
    res.json({
      message: 'Profile updated successfully',
      user: req.user.toJSON()
    });
  })
);

// Change password
router.put('/change-password',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    // Get user with password hash
    const user = await User.findById(req.user._id).select('+passwordHash');
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    
    // Update password
    user.passwordHash = newPassword; // Will be hashed by pre-save middleware
    await user.save();
    
    res.json({ message: 'Password changed successfully' });
  })
);

// Get all users (for admin)
router.get('/users',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Only allow admin to view all users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const users = await User.find({})
      .select('-refreshTokens -passwordHash')
      .sort({ createdAt: -1 });
    
    res.json(users);
  })
);

// Update user (for admin)
router.put('/users/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Only allow admin to update users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { id } = req.params;
    const { role, isActive } = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update allowed fields
    if (role !== undefined) {
      user.role = role;
    }
    if (isActive !== undefined) {
      user.isActive = isActive;
    }
    
    await user.save();
    
    res.json({
      message: 'User updated successfully',
      user: user.toJSON()
    });
  })
);

// Get user stats (for admin)
router.get('/stats',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // Only allow admin to view stats
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } }
        }
      }
    ]);
    
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    res.json({
      totalUsers,
      activeUsers,
      recentUsers,
      roleDistribution: stats
    });
  })
);

export default router;
