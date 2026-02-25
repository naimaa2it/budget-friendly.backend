import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import User from '../models/User.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
let cloudinaryConfigured = false;
const ensureCloudinaryConfigured = () => {
  if (!cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    cloudinaryConfigured = true;
  }
};

// middleware to make sure user is logged in (either user or admin token)
const requireUser = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    // payload.type is either undefined or 'admin'
    const user = await User.findById(payload.id);
    if (!user) return res.status(403).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// update profile (name/email/mobile/dob + optional image file)
router.put('/profile', requireUser, upload.single('image'), async (req, res) => {
  try {
    const { name, email, mobile, dob } = req.body || {};
    const u = req.user;

    // email change validation
    if (email && email.toLowerCase() !== u.email) {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists && exists._id.toString() !== u._id.toString()) {
        return res.status(400).json({ error: 'Another account already uses that email' });
      }
      u.email = email.toLowerCase();
    }
    if (typeof name !== 'undefined') u.name = name;
    if (typeof mobile !== 'undefined') u.mobile = mobile;
    if (typeof dob !== 'undefined') u.dob = dob;

    // handle image upload if provided
    if (req.file) {
      // make sure cloudinary credentials exist
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return res.status(500).json({ error: 'Cloudinary not configured on server' });
      }
      ensureCloudinaryConfigured();

      // optionally resize/convert using sharp (same pattern as admin)
      const maxWidth = Number(process.env.IMG_MAX_WIDTH) || 1600;
      const quality = Number(process.env.IMG_QUALITY) || 75;
      let optimizedBuffer;
      try {
        optimizedBuffer = await sharp(req.file.buffer)
          .rotate()
          .resize({ width: maxWidth, withoutEnlargement: true })
          .webp({ quality })
          .toBuffer();
      } catch (sharpErr) {
        console.error('Sharp processing error on profile image:', sharpErr);
        return res.status(400).json({ error: 'Invalid image file' });
      }

      const streamUpload = (buffer) =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: process.env.CLOUDINARY_FOLDER || 'yourhaat/profiles',
              resource_type: 'image'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(buffer);
        });

      const result = await streamUpload(optimizedBuffer);

      // delete old image if existed
      if (u.imagePublicId) {
        try {
          await cloudinary.uploader.destroy(u.imagePublicId);
        } catch (delErr) {
          console.warn('Failed to remove old profile image from Cloudinary', delErr);
        }
      }

      u.image = result.secure_url || result.url;
      u.imagePublicId = result.public_id;
    }

    await u.save();
    // return sanitized user
    const safe = {
      _id: u._id,
      email: u.email,
      name: u.name,
      mobile: u.mobile,
      dob: u.dob,
      image: u.image,
      role: u.role,
      provider: u.provider,
      isVerified: u.isVerified,
      addresses: u.addresses || [],
      createdAt: u.createdAt
    };
    res.json({ ok: true, user: safe });
  } catch (err) {
    console.error('PUT /user/profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// addresses CRUD
router.get('/addresses', requireUser, async (req, res) => {
  res.json({ addresses: req.user.addresses || [] });
});

router.post('/addresses', requireUser, async (req, res) => {
  try {
    const { fullName, email, phone, city, zone, address, type } = req.body || {};
    const addr = { fullName, email, phone, city, zone, address, type };
    req.user.addresses.push(addr);
    await req.user.save();
    const added = req.user.addresses[req.user.addresses.length - 1];
    res.json({ ok: true, address: added });
  } catch (err) {
    console.error('POST /user/addresses error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/addresses/:id', requireUser, async (req, res) => {
  try {
    const addr = req.user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ error: 'Not found' });
    Object.assign(addr, req.body);
    await req.user.save();
    res.json({ ok: true, address: addr });
  } catch (err) {
    console.error('PUT /user/addresses/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/addresses/:id', requireUser, async (req, res) => {
  try {
    req.user.addresses.id(req.params.id)?.remove();
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /user/addresses/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
