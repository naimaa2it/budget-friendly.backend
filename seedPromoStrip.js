/**
 * seedPromoStrip.js
 * Creates/replaces promo strip items shown below homepage banner.
 *
 * Usage: node seedPromoStrip.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const demoItems = [
  {
    title: "UP TO 400 TK",
    subtitle: "bKash Cashback",
    link: "/search?badge=bkash_cashback_400",
    image: {
      url: "https://images.unsplash.com/photo-1556742213-3c82f86d8fac?w=200&h=100&fit=crop",
      width: 200,
      height: 100,
      format: "jpeg",
    },
    isActive: true,
    order: 1,
  },
  {
    title: "UP TO 1,000 TK",
    subtitle: "Visa/Mastercard Discount",
    link: "/search?badge=visa_mastercard_1000",
    image: {
      url: "https://images.unsplash.com/photo-1578026351781-30dd4adf8773?w=200&h=100&fit=crop",
      width: 200,
      height: 100,
      format: "jpeg",
    },
    isActive: true,
    order: 2,
  },
  {
    title: "UNDER 999",
    subtitle: "Budget Deals",
    link: "/search?badge=under_999",
    image: {
      url: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=200&h=100&fit=crop",
      width: 200,
      height: 100,
      format: "jpeg",
    },
    isActive: true,
    order: 3,
  },
  {
    title: "EID FEST",
    subtitle: "Best Offers",
    link: "/search?badge=eid_fest",
    image: {
      url: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=200&h=100&fit=crop",
      width: 200,
      height: 100,
      format: "jpeg",
    },
    isActive: true,
    order: 4,
  },
  {
    title: "GET POINTS",
    subtitle: "Save More",
    link: "/search?badge=points_save_more",
    image: {
      url: "https://images.unsplash.com/photo-1634926488383-c424f03edb66?w=200&h=100&fit=crop",
      width: 200,
      height: 100,
      format: "jpeg",
    },
    isActive: true,
    order: 5,
  },
];

async function main() {
  const URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/Pickob";
  await mongoose.connect(URI);
  console.log("Connected to MongoDB");

  const PromoStripItem = (await import("./models/PromoStripItem.js")).default;

  await PromoStripItem.deleteMany({});
  console.log("Cleared existing promo strip items");

  const inserted = await PromoStripItem.insertMany(demoItems);

  console.log(`Inserted ${inserted.length} promo strip items:`);
  inserted.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title} — ${item.subtitle} (${item.link})`);
  });

  await mongoose.disconnect();
  console.log("Done — promo strip seed complete.");
}

main().catch((err) => {
  console.error("SEED ERROR", err);
  process.exit(1);
});
