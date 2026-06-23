/**
 * Migration: move embedded reviews and FAQs from Product documents
 * to standalone Review and FAQ collections.
 *
 * Run once:  node scripts/migrateReviews.js
 * Safe to re-run — skips products that have already been migrated (no embedded data).
 */
import "dotenv/config";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import FAQ from "../models/FAQ.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/Pickob";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const products = await Product.find({
    $or: [{ "reviews.0": { $exists: true } }, { "faqs.0": { $exists: true } }],
  }).lean();

  console.log(`Found ${products.length} products with embedded reviews/FAQs`);

  let reviewsMigrated = 0;
  let faqsMigrated = 0;
  let errors = 0;

  for (const product of products) {
    const productId = product._id;

    // Migrate reviews
    if (product.reviews && product.reviews.length > 0) {
      const existingCount = await Review.countDocuments({ productId });
      if (existingCount === 0) {
        const docs = product.reviews.map((r) => ({
          productId,
          userId: r.userId || null,
          userName: r.userName || r.name || "Anonymous",
          userEmail: r.userEmail || null,
          rating: r.rating || 5,
          comment: r.comment || r.text || "",
          images: r.images || [],
          isVerifiedPurchase: r.isVerifiedPurchase || false,
          isApproved: r.isApproved !== false,
          helpfulVotes: r.helpfulVotes || 0,
          createdAt: r.createdAt || new Date(),
        }));
        try {
          await Review.insertMany(docs, { ordered: false });
          reviewsMigrated += docs.length;
        } catch (err) {
          console.error(
            `Error migrating reviews for product ${productId}:`,
            err.message,
          );
          errors++;
        }
      }
    }

    // Migrate FAQs
    if (product.faqs && product.faqs.length > 0) {
      const existingCount = await FAQ.countDocuments({ productId });
      if (existingCount === 0) {
        const docs = product.faqs.map((f, i) => ({
          productId,
          question: f.question || "",
          answer: f.answer || "",
          askedBy: f.askedBy || "Anonymous",
          answeredBy: f.answeredBy || "Pickob Team",
          isPublished: f.isPublished !== false,
          order: i,
          createdAt: f.createdAt || new Date(),
        }));
        try {
          await FAQ.insertMany(docs, { ordered: false });
          faqsMigrated += docs.length;
        } catch (err) {
          console.error(
            `Error migrating FAQs for product ${productId}:`,
            err.message,
          );
          errors++;
        }
      }
    }
  }

  console.log(`Migration complete:`);
  console.log(`  Reviews migrated: ${reviewsMigrated}`);
  console.log(`  FAQs migrated:    ${faqsMigrated}`);
  console.log(`  Errors:           ${errors}`);
  console.log("");
  console.log(
    "Next step: after verifying the data, remove the reviews/faqs arrays",
  );
  console.log(
    "from the Product schema and drop the embedded fields from the collection.",
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
