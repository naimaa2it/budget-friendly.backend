import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

const createToken = (user) => {
  const payload = { id: user._id, role: user.role };
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// Firebase (client) provides user info after sign-in (google or email)
router.post('/firebase-login', async (req, res) => {
  try {
    const { email, name, image, provider } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const update = {
      email,
      name,
      image,
      provider: provider || 'firebase',
      isVerified: true
    };

    const user = await User.findOneAndUpdate({ email }, update, { upsert: true, new: true, setDefaultsOnInsert: true });

    const token = createToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ user: { email: user.email, name: user.name, role: user.role, image: user.image } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.json({ user: null });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = await User.findById(payload.id).select('-hashedPassword -resetToken -resetExpires');
    if (!user) return res.json({ user: null });
    res.json({ user });
  } catch (err) {
    res.clearCookie('token');
    res.json({ user: null });
  }
});

export default router;
