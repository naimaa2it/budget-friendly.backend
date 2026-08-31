/**
 * seedChatbotQA.js
 * Fully trains the FREE support chatbot with a starter Q&A knowledge base.
 * These show up in dashboard → Chatbot Training and are matched by keyword
 * (Bangla / English / Banglish) when customers chat.
 *
 * Answers are written in Bangla (default reply language); tags carry the
 * English + Banglish keywords customers actually type, so matching still works
 * whatever script/language the customer uses.
 *
 * Safe to re-run: upserts by `question` (won't duplicate, won't wipe your own
 * manually-added Q&A).
 *
 * Usage:  node seedChatbotQA.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const QA = [
  {
    question: "Delivery charge koto? / Shipping cost",
    answer:
      "ঢাকার মধ্যে ডেলিভারি চার্জ ৬০-৮০৳, ঢাকার বাইরে ১২০-১৫০৳। সঠিক চার্জ আপনার লোকেশন অনুযায়ী অর্ডার কনফার্ম করার সময় দেখানো হবে। পেমেন্ট: ক্যাশ অন ডেলিভারি (COD) ✅",
    tags: ["delivery", "charge", "shipping", "cost", "courier", "pathao", "dhaka", "baire", "খরচ", "ডেলিভারি", "চার্জ"],
  },
  {
    question: "Delivery hote koto din lage? / Delivery time",
    answer:
      "ঢাকার মধ্যে ১-২ দিন, ঢাকার বাইরে ২-৪ দিনের মধ্যে ডেলিভারি হয়ে যায় 🚚",
    tags: ["delivery", "time", "din", "koto din", "kobe", "kobe pabo", "duration", "সময়", "কবে", "দিন"],
  },
  {
    question: "Payment kivabe korbo? / Payment method",
    answer:
      "আমরা ক্যাশ অন ডেলিভারি (COD) তে ডেলিভার করি — পণ্য হাতে পেয়ে টাকা দেবেন 💵। অগ্রিম কোনো টাকা লাগে না।",
    tags: ["payment", "cod", "cash on delivery", "bkash", "nagad", "advance", "taka", "পেমেন্ট", "টাকা"],
  },
  {
    question: "Kivabe order korbo? / How to order",
    answer:
      "খুব সহজ 🙂 এখানে চ্যাটে পণ্যের নাম লিখুন — আমি দাম ও ডিটেইলস বলে দেবো, তারপর আপনার নাম, ফোন, ইমেইল ও ঠিকানা নিয়ে অর্ডার কনফার্ম করে দেবো। ওয়েবসাইট থেকেও অর্ডার করা যায়।",
    tags: ["order", "kivabe", "kinbo", "kinte", "buy", "purchase", "how", "অর্ডার", "কিনব", "কিভাবে"],
  },
  {
    question: "Order track korbo kivabe? / Track order",
    answer:
      "অর্ডার ট্র্যাক করতে আপনার অর্ডার আইডি রেডি রাখুন। ওয়েবসাইটের 'Track Order' পেজে গিয়ে আইডি দিয়ে স্ট্যাটাস দেখতে পারবেন 📦",
    tags: ["track", "tracking", "status", "kothay", "order koi", "parcel", "ট্র্যাক", "অর্ডার"],
  },
  {
    question: "Return / refund policy ki?",
    answer:
      "পণ্যে সমস্যা থাকলে বা ভুল পণ্য পেলে ডেলিভারির ২৪-৪৮ ঘণ্টার মধ্যে আমাদের জানান — রিটার্ন/এক্সচেঞ্জ করে দেবো। ড্যামেজড/ডিফেক্টিভ পণ্যের ক্ষেত্রে রিফান্ড অ্যাভেইলেবল।",
    tags: ["return", "refund", "ferot", "exchange", "policy", "wrong", "problem", "রিটার্ন", "ফেরত", "রিফান্ড"],
  },
  {
    question: "Warranty ache ki?",
    answer:
      "অনেক পণ্যে ওয়ারেন্টি আছে। কোন পণ্যের কত দিন ওয়ারেন্টি সেটা ওই পণ্যের ডিটেইলসে দেওয়া থাকে — নাম বলুন, দেখে বলে দেবো 🙂",
    tags: ["warranty", "guarantee", "warenty", "warrenty", "ওয়ারেন্টি", "গ্যারান্টি"],
  },
  {
    question: "Order cancel korte parbo?",
    answer:
      "ডেলিভার হওয়ার আগ পর্যন্ত অর্ডার ক্যান্সেল করা যায়। ক্যান্সেল করতে চাইলে এখানে 'cancel' লিখুন অথবা আমাদের নাম্বারে যোগাযোগ করুন।",
    tags: ["cancel", "batil", "cancel order", "বাতিল", "ক্যান্সেল"],
  },
  {
    question: "Product original / genuine to?",
    answer:
      "জি, আমরা ১০০% অরিজিনাল ও অথেনটিক পণ্য ডেলিভার করি ✅। কোয়ালিটি নিয়ে কোনো চিন্তা করবেন না।",
    tags: ["original", "genuine", "authentic", "asol", "nokol", "fake", "quality", "অরিজিনাল", "আসল"],
  },
  {
    question: "Customer care / jogajog number koto?",
    answer:
      "আমাদের সাপোর্ট নাম্বার: 01987432764 📞। এই চ্যাটেও আমি সাহায্য করতে পারি — বলুন কী লাগবে 🙂",
    tags: ["contact", "number", "phone", "customer care", "helpline", "call", "jogajog", "নাম্বার", "যোগাযোগ", "agent", "human"],
  },
  {
    question: "Discount / coupon ache?",
    answer:
      "সময় সময় ডিসকাউন্ট ও কুপন অফার থাকে 🎉। ভ্যালিড কুপন থাকলে অর্ডারের সময় কোড বসিয়ে ডিসকাউন্ট পেতে পারবেন। চলতি অফার জানতে চাইলে পণ্যের নাম বলুন।",
    tags: ["discount", "coupon", "offer", "promo", "code", "ডিসকাউন্ট", "কুপন", "অফার"],
  },
  {
    question: "Stock ache ki? / Available?",
    answer:
      "কোন পণ্যটির কথা বলছেন নামটা লিখুন — আমি স্টক ও দাম দেখে সাথে সাথে জানিয়ে দেবো 🙂",
    tags: ["stock", "available", "ache ki", "in stock", "sesh", "product", "স্টক"],
  },
  {
    question: "Sara Bangladesh e deliver koren?",
    answer:
      "জি, আমরা সারা বাংলাদেশে হোম ডেলিভারি করি 🇧🇩। আপনার জেলা ও থানা বললেই চার্জ ও সময় বলে দেবো।",
    tags: ["delivery area", "bangladesh", "kothay", "district", "outside dhaka", "sara desh", "এলাকা", "বাংলাদেশ"],
  },
  {
    question: "Advance payment lagbe?",
    answer:
      "না, কোনো অগ্রিম লাগে না। ক্যাশ অন ডেলিভারি — পণ্য হাতে পেয়ে পুরো টাকা পরিশোধ করবেন 💵।",
    tags: ["advance", "agam", "deposit", "cod", "cash on delivery", "অগ্রিম"],
  },
  {
    question: "Product exchange kora jabe?",
    answer:
      "সাইজ/কালার ঠিক না হলে বা অন্য সমস্যা থাকলে ডেলিভারির ২৪-৪৮ ঘণ্টার মধ্যে এক্সচেঞ্জ করা যাবে। পণ্য আনইউজড থাকতে হবে।",
    tags: ["exchange", "poriborton", "change", "size", "color", "এক্সচেঞ্জ", "পরিবর্তন"],
  },
  {
    question: "Koto tay open / working hours?",
    answer:
      "আমরা প্রতিদিন সকাল ১০টা থেকে রাত ১০টা পর্যন্ত অর্ডার ও সাপোর্ট দিয়ে থাকি 🕙। চ্যাটে মেসেজ করলে আমি সব সময় সাহায্য করি।",
    tags: ["open", "time", "working hours", "khola", "bondho", "kokhon", "সময়", "খোলা"],
  },
  {
    question: "Damaged / nosto product pele ki korbo?",
    answer:
      "পণ্য ড্যামেজড বা নষ্ট পেলে ছবি তুলে ডেলিভারির ২৪-৪৮ ঘণ্টার মধ্যে আমাদের জানান — আমরা রিপ্লেস/রিফান্ড করে দেবো। কোনো টেনশন নাই 🙂",
    tags: ["damaged", "broken", "nosto", "vanga", "defective", "faulty", "নষ্ট", "ভাঙা"],
  },
  {
    question: "Bulk / wholesale order kora jay?",
    answer:
      "জি, বেশি পরিমাণে (বাল্ক/হোলসেল) অর্ডারের জন্য স্পেশাল প্রাইস আছে — আমাদের নাম্বার 01987432764 এ যোগাযোগ করুন 🙂",
    tags: ["bulk", "wholesale", "paikari", "beshi", "quantity", "reseller", "পাইকারি"],
  },
  {
    question: "Product hate pawar age check kore nite parbo? / Cash on delivery te khule dekhte parbo?",
    answer:
      "জি, ক্যাশ অন ডেলিভারিতে পণ্য হাতে পেয়ে বাইরে থেকে দেখে নিতে পারবেন ✅। প্যাকেট খুলে চেক করতে চাইলে ডেলিভারি ম্যানকে বলুন — সমস্যা থাকলে তখনই জানাবেন।",
    tags: ["check", "khule dekhbo", "open box", "trial", "dekhe nibo", "hate peye", "চেক", "খুলে দেখব", "যাচাই"],
  },
  {
    question: "bKash / Nagad / Rocket e payment kora jabe?",
    answer:
      "আমরা মূলত ক্যাশ অন ডেলিভারি (COD) তে ডেলিভার করি — পণ্য হাতে পেয়ে টাকা দেবেন 💵। বিকাশ/নগদে অগ্রিম পেমেন্টের দরকার নেই। বিশেষ ক্ষেত্রে (যেমন বাইরের এলাকা/বাল্ক) বিকাশে পেমেন্ট লাগলে আমরা আগে জানিয়ে দেবো।",
    tags: ["bkash", "nagad", "rocket", "mobile banking", "online payment", "advance bkash", "বিকাশ", "নগদ", "রকেট"],
  },
  {
    question: "Apnader physical dokan / shop ache? / Location kothay?",
    answer:
      "আমরা মূলত অনলাইনে সারা বাংলাদেশে হোম ডেলিভারি করি 🏠। শপে এসে নিতে চাইলে বা লোকেশন জানতে আমাদের নাম্বার 01987432764 এ যোগাযোগ করুন — বিস্তারিত জানিয়ে দেবো 🙂",
    tags: ["shop", "dokan", "store", "location", "address", "physical", "showroom", "দোকান", "লোকেশন", "শপ"],
  },
  {
    question: "Same day / urgent / joldi delivery hobe?",
    answer:
      "ঢাকার ভেতরে অনেক সময় সেম-ডে/আর্জেন্ট ডেলিভারি করা যায় 🚀। জরুরি হলে অর্ডারের সময় জানান বা 01987432764 এ কল করুন — চেষ্টা করে দ্রুত পৌঁছে দেবো।",
    tags: ["same day", "urgent", "joldi", "fast delivery", "express", "aji", "ajke", "তাড়াতাড়ি", "জরুরি", "দ্রুত"],
  },
  {
    question: "Delivery charge free / free shipping ache?",
    answer:
      "সময় সময় ফ্রি ডেলিভারি বা বিশেষ অফার থাকে 🎉। চলতি অফার আছে কিনা জানতে পণ্যের নাম বলুন — দেখে জানিয়ে দেবো।",
    tags: ["free delivery", "free shipping", "free", "charge maf", "ফ্রি ডেলিভারি", "ফ্রি", "delivery free"],
  },
  {
    question: "Kisti / EMI te kena jabe?",
    answer:
      "আমরা মূলত ক্যাশ অন ডেলিভারিতে (এককালীন) ডেলিভার করি — এখন সাধারণত কিস্তি/EMI নেই। বড় অ্যামাউন্টের ক্ষেত্রে অপশন আছে কিনা জানতে 01987432764 এ যোগাযোগ করুন।",
    tags: ["emi", "kisti", "installment", "kisti te", "monthly", "কিস্তি", "ইএমআই"],
  },
  {
    question: "Order confirm holo kina bujhbo kivabe? / Confirmation pai nai",
    answer:
      "অর্ডার প্লেস হলে আপনার ইমেইলে একটা কনফার্মেশন চলে যায় 📧 এবং আমরা ফোনেও কনফার্ম করি। ইমেইল না পেলে স্প্যাম ফোল্ডার দেখুন, অথবা আপনার অর্ডার আইডি/নাম্বার এখানে দিন — চেক করে জানিয়ে দিচ্ছি।",
    tags: ["confirmation", "confirm holo", "confirm hoyeche", "email pai nai", "order hoise", "কনফার্ম", "কনফার্মেশন"],
  },
  {
    question: "Order dewar por address / quantity / number change kora jabe?",
    answer:
      "ডেলিভারি হওয়ার আগে ঠিকানা, পরিমাণ বা নাম্বার পরিবর্তন করা যায় ✏️। আপনার অর্ডার আইডি ও নতুন তথ্য এখানে লিখুন অথবা 01987432764 এ জানান — আপডেট করে দেবো।",
    tags: ["change order", "edit order", "address change", "quantity change", "number change", "modify", "পরিবর্তন", "ঠিকানা বদল"],
  },
  {
    question: "Dam ki komano jabe? / Price negotiable?",
    answer:
      "আমাদের দাম মোটামুটি ফিক্সড ও যথাসম্ভব কম রাখা 🙂। তবে বেশি পরিমাণে (বাল্ক) নিলে বা চলতি অফার থাকলে ছাড় পেতে পারেন — পণ্যের নাম বলুন, দেখে জানাই।",
    tags: ["negotiable", "dam komano", "kom hobe", "discount koro", "komabe", "kom", "দাম কমানো", "কমাবেন", "দরদাম"],
  },
  {
    question: "Product ta ki valo? / Review / quality kemon?",
    answer:
      "আমরা ১০০% অরিজিনাল ও ভালো কোয়ালিটির পণ্যই রাখি ✅। নির্দিষ্ট পণ্যের নাম বলুন — সেটার ডিটেইলস, ফিচার ও দাম জানিয়ে দিচ্ছি, যাতে বুঝে নিতে পারেন।",
    tags: ["review", "quality", "valo", "kemon", "bhalo", "feedback", "rating", "রিভিউ", "কোয়ালিটি", "মান"],
  },
  {
    question: "Product er details / specification / feature ki?",
    answer:
      "কোন পণ্যটির কথা বলছেন নামটা লিখুন — আমি ডেটাবেস থেকে সেটার দাম, ফিচার ও ডিটেইলস সাথে সাথে জানিয়ে দেবো 🙂",
    tags: ["details", "specification", "feature", "spec", "config", "বিস্তারিত", "স্পেসিফিকেশন", "ফিচার"],
  },
  {
    question: "Stock sesh hole abar kobe ashbe? / Restock",
    answer:
      "কোনো পণ্য স্টক আউট থাকলে সাধারণত অল্প কিছুদিনের মধ্যেই রিস্টক হয়। কোন পণ্যটি চান নামটা বলুন — কবে পাওয়া যাবে জানিয়ে দেবো অথবা এলে আপনাকে জানাবো 🙂",
    tags: ["restock", "stock out", "sesh", "kobe ashbe", "abar kobe", "available hobe", "রিস্টক", "স্টক আউট"],
  },
  {
    question: "Gift / uphar hisebe pathano jabe?",
    answer:
      "জি, আপনি চাইলে অন্য কারও ঠিকানায় গিফট হিসেবে পাঠাতে পারবেন 🎁। অর্ডারের সময় প্রাপকের নাম ও ঠিকানা দিন, নোটে গিফট লিখে দিলে আমরা সেভাবে পাঠাবো।",
    tags: ["gift", "uphar", "present", "gift wrap", "onner thikanay", "গিফট", "উপহার"],
  },
  {
    question: "Agent / manush er sathe kotha bolbo",
    answer:
      "অবশ্যই 🙂 আমি আমাদের একজন টিম মেম্বারকে জানিয়ে দিচ্ছি — একটু পরেই এখানে রিপ্লাই পাবেন। জরুরি হলে কল করুন: 01987432764 📞",
    tags: ["agent", "human", "manush", "representative", "customer care agent", "real person", "এজেন্ট", "প্রতিনিধি", "মানুষ"],
  },
];

async function main() {
  const URI =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/Pickob";
  await mongoose.connect(URI);
  console.log("Connected to MongoDB");

  const ChatbotQA = (await import("./models/ChatbotQA.js")).default;

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < QA.length; i++) {
    const q = QA[i];
    const existing = await ChatbotQA.findOne({ question: q.question });
    if (existing) {
      existing.answer = q.answer;
      existing.tags = q.tags;
      existing.enabled = true;
      existing.order = i;
      await existing.save();
      updated++;
    } else {
      await ChatbotQA.create({
        question: q.question,
        answer: q.answer,
        tags: q.tags,
        enabled: true,
        order: i,
      });
      inserted++;
    }
  }

  const total = await ChatbotQA.countDocuments();
  console.log(`✅ Chatbot trained (Bangla answers) — ${inserted} added, ${updated} updated. Total Q&A: ${total}`);
  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("SEED ERROR", err);
  process.exit(1);
});
