import express from 'express';
import jwt from 'jsonwebtoken';
import Discount from '../models/Discount.js';
import CouponUsage from '../models/CouponUsage.js';
import Order from '../models/Order.js';
import User from '../models/User.js';

const router = express.Router();

/**
 * Extract user ID from JWT token (if logged in)
 */
const getUserId = (req) => {
  try {
    const token = req.cookies?.token;
    if (!token) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.type === 'admin' ? null : payload.id?.toString() ?? null;
  } catch {
    return null;
  }
};

/**
 * Check if a coupon is expired
 */
const isCouponExpired = (coupon) => {
  if (!coupon.expiresAt) return false;
  return new Date(coupon.expiresAt) < new Date();
};

/**
 * Check if user is eligible for a coupon
 * Returns { eligible: boolean, reason?: string }
 */
const checkUserEligibility = async (coupon, userId, userDoc = null) => {
  // Check if coupon is active
  if (!coupon.isActive) {
    return { eligible: false, reason: 'Coupon is not active' };
  }

  // Check if coupon is expired
  if (isCouponExpired(coupon)) {
    return { eligible: false, reason: 'Coupon has expired' };
  }

  // Check total usage limit
  if (coupon.maxUsesTotal > 0 && coupon.usageCount >= coupon.maxUsesTotal) {
    return { eligible: false, reason: 'Coupon usage limit reached' };
  }

  // For guest users, they can't use user-specific coupons
  if (!userId) {
    if (coupon.isNewUserOnly || coupon.isFirstOrderOnly) {
      return { eligible: false, reason: 'Please login to use this coupon' };
    }
    return { eligible: true };
  }

  // Fetch user if not provided
  if (!userDoc) {
    userDoc = await User.findById(userId).select('createdAt').lean();
  }

  // Check new user requirement (registered within 30 days)
  if (coupon.isNewUserOnly) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const isNewUser = userDoc && new Date(userDoc.createdAt).getTime() > thirtyDaysAgo;
    if (!isNewUser) {
      return { eligible: false, reason: 'This coupon is only for new users (registered within 30 days)' };
    }
  }

  // Check first order requirement
  if (coupon.isFirstOrderOnly) {
    const orderCount = await Order.countDocuments({ 
      userId, 
      status: { $nin: ['cancelled', 'failed'] } 
    });
    if (orderCount > 0) {
      return { eligible: false, reason: 'This coupon is only valid for your first order' };
    }
  }

  // Check per-user usage limit
  if (coupon.maxUsesPerUser > 0) {
    const userUsageCount = await CouponUsage.countDocuments({
      userId,
      couponId: coupon._id,
    });
    if (userUsageCount >= coupon.maxUsesPerUser) {
      return { eligible: false, reason: `You have already used this coupon ${userUsageCount} time(s)` };
    }
  }

  return { eligible: true };
};

/**
 * Calculate potential savings from a coupon
 */
const calculatePotentialSavings = (coupon, subtotal = 0) => {
  if (coupon.discountType === 'free_shipping') {
    return { type: 'free_shipping', value: 130, text: 'Free Delivery' };
  }
  if (coupon.discountType === 'percentage') {
    const discount = (subtotal * coupon.discountValue) / 100;
    const capped = coupon.maxDiscountAmount > 0 ? Math.min(discount, coupon.maxDiscountAmount) : discount;
    return { type: 'percentage', value: capped, text: `${coupon.discountValue}% off` };
  }
  // fixed
  return { type: 'fixed', value: coupon.discountValue, text: `৳${coupon.discountValue} off` };
};

/**
 * GET /api/coupons
 * Returns all active coupons with user eligibility info
 * Query params:
 *   - subtotal: current cart subtotal (for progress calculation)
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const subtotal = parseFloat(req.query.subtotal) || 0;
    
    // Get user doc if logged in
    let userDoc = null;
    let isFirstOrder = true;
    if (userId) {
      userDoc = await User.findById(userId).select('createdAt').lean();
      const orderCount = await Order.countDocuments({ 
        userId, 
        status: { $nin: ['cancelled', 'failed'] } 
      });
      isFirstOrder = orderCount === 0;
    }

    // Get all active coupons with coupon codes
    const coupons = await Discount.find({
      isActive: true,
      couponCode: { $ne: '', $exists: true },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    }).sort({ order: 1, createdAt: 1 }).lean();

    // Process each coupon with eligibility and progress info
    const processedCoupons = await Promise.all(coupons.map(async (coupon) => {
      const eligibility = await checkUserEligibility(coupon, userId, userDoc);
      const savings = calculatePotentialSavings(coupon, subtotal);
      
      // Calculate progress towards minimum order
      let progress = null;
      if (coupon.minOrderAmount > 0) {
        if (subtotal < coupon.minOrderAmount) {
          const remaining = coupon.minOrderAmount - subtotal;
          progress = {
            current: subtotal,
            required: coupon.minOrderAmount,
            remaining,
            percentage: Math.min(100, (subtotal / coupon.minOrderAmount) * 100),
            message: `Buy ৳${Math.ceil(remaining)} more to unlock`,
          };
        } else {
          progress = {
            current: subtotal,
            required: coupon.minOrderAmount,
            remaining: 0,
            percentage: 100,
            message: 'Ready to use!',
          };
        }
      }

      // Determine if coupon can be applied now
      const canApply = eligibility.eligible && 
                       (!coupon.minOrderAmount || subtotal >= coupon.minOrderAmount);

      return {
        _id: coupon._id,
        couponCode: coupon.couponCode,
        title: coupon.title,
        subtitle: coupon.subtitle,
        description: coupon.description,
        highlight: coupon.highlight,
        highlightSecondary: coupon.highlightSecondary,
        spend: coupon.spend,
        theme: coupon.theme,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscountAmount: coupon.maxDiscountAmount,
        isFirstOrderOnly: coupon.isFirstOrderOnly,
        isNewUserOnly: coupon.isNewUserOnly,
        stackable: coupon.stackable,
        expiresAt: coupon.expiresAt,
        eligible: eligibility.eligible,
        eligibilityReason: eligibility.reason || null,
        canApply,
        progress,
        savings,
      };
    }));

    // Separate into eligible and other coupons
    const eligibleCoupons = processedCoupons.filter(c => c.eligible);
    const otherCoupons = processedCoupons.filter(c => !c.eligible);

    // Get coupons that are close to being unlocked (within 500tk of min order)
    const almostUnlocked = eligibleCoupons.filter(c => 
      c.progress && c.progress.remaining > 0 && c.progress.remaining <= 500
    );

    res.json({
      eligible: eligibleCoupons,
      other: otherCoupons,
      almostUnlocked,
      isLoggedIn: !!userId,
      isFirstOrder,
      isNewUser: userDoc ? (Date.now() - new Date(userDoc.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000) : false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/coupons/progress
 * Returns progress indicators for checkout page
 * Shows what discounts are available at different spending thresholds
 */
router.get('/progress', async (req, res) => {
  try {
    const userId = getUserId(req);
    const subtotal = parseFloat(req.query.subtotal) || 0;

    // Get user info
    let userDoc = null;
    let isFirstOrder = true;
    if (userId) {
      userDoc = await User.findById(userId).select('createdAt').lean();
      const orderCount = await Order.countDocuments({ 
        userId, 
        status: { $nin: ['cancelled', 'failed'] } 
      });
      isFirstOrder = orderCount === 0;
    }
    const isNewUser = userDoc ? (Date.now() - new Date(userDoc.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000) : false;

    // Get active coupons with min order amounts
    const coupons = await Discount.find({
      isActive: true,
      couponCode: { $ne: '', $exists: true },
      minOrderAmount: { $gt: subtotal }, // Only get coupons we haven't reached yet
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    }).sort({ minOrderAmount: 1 }).lean();

    // Filter by user eligibility
    const progressItems = [];
    for (const coupon of coupons) {
      // Skip if user not eligible
      if (coupon.isNewUserOnly && !isNewUser) continue;
      if (coupon.isFirstOrderOnly && !isFirstOrder) continue;

      const remaining = coupon.minOrderAmount - subtotal;
      const savings = calculatePotentialSavings(coupon, coupon.minOrderAmount);

      progressItems.push({
        couponCode: coupon.couponCode,
        title: coupon.title,
        minOrderAmount: coupon.minOrderAmount,
        remaining,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        savings,
        message: `Buy ৳${Math.ceil(remaining)} more to get ${savings.text}`,
        theme: coupon.theme,
      });

      // Only show top 3 progress items
      if (progressItems.length >= 3) break;
    }

    // Free shipping threshold (built-in at 999)
    if (subtotal < 999) {
      const remaining = 999 - subtotal;
      progressItems.unshift({
        type: 'builtin',
        title: 'Free Delivery',
        minOrderAmount: 999,
        remaining,
        message: `Buy ৳${Math.ceil(remaining)} more for free delivery`,
        theme: 'green',
      });
    }

    res.json({
      subtotal,
      progressItems,
      isLoggedIn: !!userId,
      isFirstOrder,
      isNewUser,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Export helper functions for use in orders.js
export { checkUserEligibility, calculatePotentialSavings, isCouponExpired };

export default router;
