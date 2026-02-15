import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

const router = express.Router();
const SALT_ROUNDS = 12; // Increased from 10 for better security

const createToken = (admin) => {
  const payload = { id: admin._id, role: admin.role, type: 'admin' };
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// Admin / Moderator registration (only via admin secret)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, adminSecret, role } = req.body;
    if (!name || !email || !password || !adminSecret) return res.status(400).json({ error: 'Missing fields' });
    
    // Validate admin secret
    if (adminSecret !== process.env.ADMIN_SECRET) {
      console.warn(`Failed admin registration attempt from IP ${req.ip} - invalid secret`);
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if this email already exists as admin (separate from User collection)
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'This email is already registered as an admin. Use admin login instead.' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = new Admin({ 
      name, 
      email: email.toLowerCase(), 
      hashedPassword: hashed, 
      role: role === 'moderator' ? 'moderator' : 'admin',
      isActive: true
    });
    await admin.save();

    console.log(`New ${admin.role} registered: ${admin.email}`);
    res.json({ ok: true, user: { email: admin.email, name: admin.name, role: admin.role } });
  } catch (err) {
    console.error('Admin registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if email already exists as admin (same email can be user + admin)
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Only check if already exists as admin (allow same email for user)
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ 
        exists: true, 
        error: 'This email is already registered as an admin.'
      });
    }

    res.json({ exists: false, ok: true });
  } catch (err) {
    console.error('Email check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password, adminSecret } = req.body;
    if (!email || !password || !adminSecret) return res.status(400).json({ error: 'Missing fields' });
    
    // Validate admin secret
    if (adminSecret !== process.env.ADMIN_SECRET) {
      console.warn(`Failed admin login attempt from IP ${req.ip} - invalid secret`);
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !admin.hashedPassword) {
      console.warn(`Failed admin login attempt from IP ${req.ip} - admin not found: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (!admin.isActive) {
      console.warn(`Inactive admin login attempt: ${email}`);
      return res.status(403).json({ error: 'Account is disabled. Contact super admin.' });
    }

    // Check if account is locked
    if (admin.isCurrentlyLocked) {
      const minutesLeft = Math.ceil((admin.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ error: `Account is temporarily locked. Try again in ${minutesLeft} minutes.` });
    }

    // Verify password
    const ok = await bcrypt.compare(password, admin.hashedPassword);
    if (!ok) {
      console.warn(`Failed admin login attempt from IP ${req.ip} - wrong password: ${email}`);
      await admin.incLoginAttempts();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login - reset attempts and update last login info
    await admin.resetLoginAttempts();
    admin.lastLoginAt = Date.now();
    admin.lastLoginIP = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    await admin.save();

    const token = createToken(admin);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    
    console.log(`Admin logged in: ${admin.email} (${admin.role})`);
    res.json({ user: { email: admin.email, name: admin.name, role: admin.role, image: null } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin forgot password - returns token (in prod send an email)
router.post('/forgot', async (req, res) => {
  try {
    const { email, adminSecret } = req.body;
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      // Don't reveal if admin exists or not
      return res.json({ ok: true, message: 'If account exists, reset token has been generated' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    admin.resetToken = token;
    admin.resetExpires = Date.now() + 1000 * 60 * 30; // 30 minutes
    await admin.save();

    console.log(`Password reset requested for admin: ${email}`);
    // TODO: send email with link containing token
    res.json({ ok: true, token, message: 'Reset token generated' });
  } catch (err) {
    console.error('Admin forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ resetToken: token, resetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    user.hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.resetToken = undefined;
    user.resetExpires = undefined;
    user.loginAttempts = 0; // Reset login attempts on password change
    user.isLocked = false;
    user.lockUntil = undefined;
    await user.save();

    console.log(`Password reset completed for admin: ${user.email}`);
    res.json({ ok: true, message: 'Password reset successful' });
  } catch (err) {
    console.error('Admin password reset error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
