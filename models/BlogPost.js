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

// Schema for Cloudinary media assets
const MediaAssetSchema = new mongoose.Schema({
  public_id: { type: String },
  url: { type: String, required: true },
  width: { type: Number },
  height: { type: Number },
  format: { type: String },
  resourceType: { type: String, enum: ['image', 'video'], default: 'image' }
}, { _id: false });

// Schema for dynamic sections (FAQ, Accordion, Steps)
const DynamicSectionSchema = new mongoose.Schema({
  type: { type: String, enum: ['faq', 'accordion', 'steps'], required: true },
  title: { type: String },
  items: [
    {
      title: { type: String },
      content: { type: String },
      order: { type: Number, default: 0 }
    }
  ]
}, { _id: false });

const BlogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  excerpt: { type: String },
  content: { type: String }, // HTML content
  author: { type: String },
  // Enhanced featured image with Cloudinary details
  featuredImage: {
    type: MediaAssetSchema,
    default: null
  },
  // Legacy support - will be migrated to featuredImage object
  featuredImageLegacy: { type: String },
  // Blog categories (references to BlogCategory model)
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BlogCategory' }],
  // Mark as featured post
  isFeatured: { type: Boolean, default: false },
  tags: { type: [String], default: [] },
  // Additional images for gallery/content
  additionalImages: [MediaAssetSchema],
  // Video uploads
  videos: [MediaAssetSchema],
  // Dynamic sections for FAQ, Accordion, Steps
  dynamicSections: [DynamicSectionSchema],
  // Custom publish date (can be different from publishedAt)
  publishDate: { type: Date },
  // Reading time in minutes
  readingTime: { type: Number, default: 5 },
  seo: {
    title: { type: String },
    description: { type: String },
    keywords: { type: [String], default: [] },
  },
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
