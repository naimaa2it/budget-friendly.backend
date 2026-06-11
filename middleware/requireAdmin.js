import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

export async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'admin')
      return res.status(403).json({ error: 'Admin access required' });
    const admin = await Admin.findById(payload.id);
    if (!admin || !admin.isActive)
      return res.status(403).json({ error: 'Admin not found or disabled' });
    req.admin = admin;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
