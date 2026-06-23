/**
 * seedFeatured.js
 * Creates / replaces FeaturedSection records only.
 * Does NOT touch products, categories, or any other collection.
 *
 * Usage:  node seedFeatured.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/Pickob";
  await mongoose.connect(URI);
  console.log("Connected to MongoDB");

  const Product = (await import("./models/Product.js")).default;
  const FeaturedSection = (await import("./models/FeaturedSection.js")).default;

  // ── Wipe only FeaturedSection records ────────────────────────────────────
  await FeaturedSection.deleteMany({});
  console.log("Cleared existing featured sections");

  // ── Pull ALL active products ──────────────────────────────────────────────
  const allProducts = await Product.find({ status: { $ne: "archived" } })
    .select("_id title badges categoryId category")
    .sort({ updatedAt: -1 });

  console.log(`Found ${allProducts.length} products in the database`);

  if (allProducts.length === 0) {
    console.log(
      "No products found — add products first, then re-run this script.",
    );
    await mongoose.disconnect();
    return;
  }

  // ── Helper: filter by badge ───────────────────────────────────────────────
  const byBadge = (badge) =>
    allProducts.filter((p) => (p.badges || []).includes(badge));

  // ── Helper: first N products of a category name fragment ─────────────────
  const byCatName = (fragment, limit = 8) =>
    allProducts
      .filter((p) =>
        (p.category || "").toLowerCase().includes(fragment.toLowerCase()),
      )
      .slice(0, limit);

  // ── Build sections dynamically ────────────────────────────────────────────
  const sectionsToCreate = [];

  // 1. Hot Deals  — products tagged deals_of_the_day
  const hotDeals = byBadge("deals_of_the_day");
  if (hotDeals.length > 0) {
    sectionsToCreate.push({
      title: "Hot Deals of the Day",
      viewAllLink: "/",
      isActive: true,
      order: 0,
      productIds: hotDeals.map((p) => p._id),
      limit: 10,
    });
  }

  // 2. Best Sellers
  const bestSellers = byBadge("best_seller");
  if (bestSellers.length > 0) {
    sectionsToCreate.push({
      title: "Best Sellers",
      viewAllLink: "/",
      isActive: true,
      order: 1,
      productIds: bestSellers.map((p) => p._id),
      limit: 10,
    });
  }

  // 3. New Arrivals
  const newArrivals = byBadge("new_arrival");
  if (newArrivals.length > 0) {
    sectionsToCreate.push({
      title: "New Arrivals",
      viewAllLink: "/",
      isActive: true,
      order: 2,
      productIds: newArrivals.map((p) => p._id),
      limit: 10,
    });
  }

  // 4. Trending Now
  const trending = byBadge("trending");
  if (trending.length > 0) {
    sectionsToCreate.push({
      title: "Trending Now",
      viewAllLink: "/",
      isActive: true,
      order: 3,
      productIds: trending.map((p) => p._id),
      limit: 10,
    });
  }

  // 5. Electronics (by category name)
  const electronics = byCatName("electron");
  if (electronics.length > 0) {
    sectionsToCreate.push({
      title: "Top Electronics Picks",
      viewAllLink: "/",
      isActive: true,
      order: 4,
      productIds: electronics.map((p) => p._id),
      limit: 10,
    });
  }

  // 6. Fashion / Ladies
  const fashion = [
    ...byCatName("dress"),
    ...byCatName("ladies"),
    ...byCatName("cloth"),
    ...byCatName("fashion"),
    ...byCatName("jewelry"),
    ...byCatName("jewel"),
  ]
    .filter((p, i, a) => a.findIndex((x) => x._id.equals(p._id)) === i)
    .slice(0, 10);
  if (fashion.length > 0) {
    sectionsToCreate.push({
      title: "Fashion Essentials",
      viewAllLink: "/",
      isActive: true,
      order: 5,
      productIds: fashion.map((p) => p._id),
      limit: 10,
    });
  }

  // 7. Fallback — if no badge/category matches, just show the first N products
  if (sectionsToCreate.length === 0) {
    sectionsToCreate.push({
      title: "Featured Products",
      viewAllLink: "/",
      isActive: true,
      order: 0,
      productIds: allProducts.slice(0, 10).map((p) => p._id),
      limit: 10,
    });
    console.log(
      "No badge/category matches found — created a generic Featured Products section.",
    );
  }

  // ── Save sections ─────────────────────────────────────────────────────────
  for (const sec of sectionsToCreate) {
    const s = new FeaturedSection(sec);
    await s.save();
    console.log(
      `✅ Created: "${s.title}"  (${sec.productIds.length} products)`,
    );
  }

  await mongoose.disconnect();
  console.log("Done — FeaturedSections seeded successfully.");
}

main().catch((err) => {
  console.error("SEED ERROR", err);
  process.exit(1);
});
