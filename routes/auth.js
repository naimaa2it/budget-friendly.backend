import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Admin from '../models/Admin.js';

const router = express.Router();

const createToken = (user) => {
  const payload = { id: user._id, role: user.role };
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// Simple ping route to verify server is running properly or not
router.get('/ping', (req, res) => {
  res.json({ ok: true, time: Date.now(), origin: req.headers.origin, cookie: req.headers.cookie || null });
});

// Firebase (client) provides user info after sign-in (google or email)
router.post('/firebase-login', async (req, res) => {
  try {
    const { email, name, image, provider } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const update = {
      email,
      name,
      image,
      provider: provider || 'firebase',
      isVerified: true
    };

    const user = await User.findOneAndUpdate({ email }, update, { upsert: true, new: true, setDefaultsOnInsert: true }).populate('tags');

    const token = createToken(user);
    // SameSite=none + Secure required for cross-origin cookie (Vercel frontend ↔ Render backend)
    res.cookie('token', token, { httpOnly: true, sameSite: 'none', secure: true });
    res.json({ user: { email: user.email, name: user.name, role: user.role, image: user.image, tags: user.tags || [] } });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Logout by clearing the token cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'none', secure: true });
  res.json({ ok: 'Logged out successfully' });
});

// Get current user info based on token (used by frontend on page load to check if user is logged in)
router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.json({ user: null });
    
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    
    // Check if this is an admin token (has type: 'admin')
    let user;
    if (payload.type === 'admin') {
      user = await Admin.findById(payload.id).select('-hashedPassword -resetToken -resetExpires -loginAttempts');
      
      // Check if admin account is still active
      if (user && !user.isActive) {
        res.clearCookie('token');
        return res.json({ user: null, error: 'Account disabled' });
      }
    } else {
      // Regular user
      user = await User.findById(payload.id).select('-hashedPassword -resetToken -resetExpires').populate('tags');
    }
    
    if (!user) return res.json({ user: null });
    res.json({ user });
  } catch (err) {
    res.clearCookie('token');
    res.json({ user: null });
  }
});

export default router;
