import mongoose from 'mongoose';

// simple slugify helper (avoid adding new dependency)
const slugifyString = (s) => {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

const BlogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  excerpt: { type: String },
  content: { type: String }, // HTML content
  author: { type: String },
  featuredImage: { type: String },
  tags: { type: [String], default: [] },
  status: { type: String, enum: ['draft','published','archived'], default: 'draft' },
  publishedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ensure a unique slug before validation
BlogPostSchema.pre('validate', async function() {
  if (!this.slug && this.title) {
    // use local helper to avoid missing dependency
    let base = slugifyString(this.title).slice(0, 120) || 'post';
    let slug = base;
    // ensure unique
    let i = 0;
    // eslint-disable-next-line no-undef
    const Model = mongoose.models.BlogPost || mongoose.model('BlogPost', BlogPostSchema);
    while (await Model.findOne({ slug })) {
      i += 1;
      slug = `${base}-${i}`;
    }
    this.slug = slug;
  }
});


BlogPostSchema.pre('save', function() {
  this.updatedAt = Date.now();
  if (this.status === 'published' && !this.publishedAt) this.publishedAt = Date.now();
});

export default mongoose.models.BlogPost || mongoose.model('BlogPost', BlogPostSchema);
