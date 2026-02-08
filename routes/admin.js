import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();
const SALT_ROUNDS = 10;

const createToken = (user) => {
  const payload = { id: user._id, role: user.role };
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// Admin / Moderator registration (only via admin secret)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, adminSecret, role } = req.body;
    if (!name || !email || !password || !adminSecret) return res.status(400).json({ error: 'Missing fields' });
    if (adminSecret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Invalid admin secret' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User with this email already exists' });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = new User({ name, email, hashedPassword: hashed, role: role === 'moderator' ? 'moderator' : 'admin', provider: 'local', isVerified: true });
    await user.save();

    res.json({ ok: true, user: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password, adminSecret } = req.body;
    if (!email || !password || !adminSecret) return res.status(400).json({ error: 'Missing fields' });
    if (adminSecret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Invalid admin secret' });

    const user = await User.findOne({ email, role: { $in: ['admin', 'moderator'] } });
    if (!user || !user.hashedPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.hashedPassword);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = createToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ user: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin forgot password - returns token (in prod send an email)
router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email, role: { $in: ['admin', 'moderator'] } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = token;
    user.resetExpires = Date.now() + 1000 * 60 * 30; // 30 minutes
    await user.save();

    // TODO: send email with link containing token
    res.json({ ok: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({ resetToken: token, resetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    user.hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.resetToken = undefined;
    user.resetExpires = undefined;
    await user.save();

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
