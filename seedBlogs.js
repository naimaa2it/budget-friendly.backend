// Sample Electronics Blog Posts Generator
// Run this script to populate your blog with electronics-related content

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BlogPost from './models/BlogPost.js';
import BlogCategory from './models/BlogCategory.js';

dotenv.config();

const sampleBlogs = [
  {
    title: "Top 10 Must-Have Smart Home Devices in 2026",
    excerpt: "Transform your living space into a futuristic haven with these cutting-edge smart home gadgets that combine convenience, security, and energy efficiency.",
    content: `<h2>Welcome to the Future of Home Automation</h2>
<p>Smart home technology has evolved dramatically over the past few years. What once seemed like science fiction is now an affordable reality for millions of households. In this comprehensive guide, we'll explore the top 10 smart home devices that are revolutionizing how we live.</p>

<h2>1. Smart Thermostats</h2>
<p>Leading the pack are intelligent thermostats that learn your schedule and preferences. These devices can reduce your energy bills by up to 23% while keeping your home at the perfect temperature. Brands like Nest and Ecobee have set the standard for energy-efficient climate control.</p>

<h2>2. Video Doorbells</h2>
<p>Never miss a visitor or package delivery again. Modern video doorbells offer crystal-clear HD video, two-way audio, and motion detection alerts sent directly to your smartphone. Ring and Arlo lead this category with their robust feature sets.</p>

<h2>3. Smart Lighting Systems</h2>
<p>Phillips Hue and LIFX have transformed ordinary lighting into an art form. Control brightness, color, and ambiance from your phone or voice assistant. Set schedules, create scenes, and even sync lights with your music or movies.</p>

<h2>4. Voice Assistants & Smart Speakers</h2>
<p>Amazon Echo, Google Nest, and Apple HomePod serve as the command centers of modern smart homes. These devices can control all your connected gadgets, answer questions, play music, and much more.</p>

<h2>5. Smart Security Cameras</h2>
<p>Keep an eye on your property 24/7 with advanced security cameras featuring night vision, motion tracking, and cloud storage. Many now include AI-powered person detection to reduce false alerts.</p>

<h2>Conclusion</h2>
<p>Investing in smart home technology isn't just about convenience—it's about creating a more efficient, secure, and comfortable living environment. Start with one or two devices and gradually expand your smart home ecosystem.</p>`,
    author: "Tech Review Team",
    featuredImage: {
      url: "https://images.unsplash.com/photo-1558002038-1055907df827?w=800",
      resourceType: "image"
    },
    tags: ["Smart Home", "IoT", "Home Automation"],
    categories: [],
    isFeatured: true,
    status: "published",
    publishedAt: new Date()
  },
  {
    title: "Wireless Earbuds Buying Guide 2026: Find Your Perfect Match",
    excerpt: "Confused by the endless options in wireless earbuds? Our comprehensive guide breaks down everything you need to know to make the right choice.",
    content: `<h2>The Wireless Audio Revolution</h2>
<p>Wireless earbuds have become an essential accessory for music lovers, commuters, and fitness enthusiasts. With hundreds of models flooding the market, choosing the right pair can be overwhelming. Let's simplify the decision.</p>

<h2>Key Features to Consider</h2>
<h3>Sound Quality</h3>
<p>Look for earbuds with balanced audio profiles. Premium models often feature custom drivers and support for high-resolution codecs like aptX HD or LDAC.</p>

<h3>Active Noise Cancellation (ANC)</h3>
<p>If you commute or work in noisy environments, ANC is a game-changer. Top performers like AirPods Pro and Sony WF-1000XM5 can block up to 95% of ambient noise.</p>

<h3>Battery Life</h3>
<p>Modern earbuds typically offer 5-8 hours per charge, with cases providing 24-30 hours total. Consider your usage patterns when evaluating battery specs.</p>

<h2>Top Picks by Category</h2>
<ul>
<li><strong>Best Overall:</strong> Sony WF-1000XM5 - Superior ANC and audio quality</li>
<li><strong>Best Value:</strong> Nothing Ear (2) - Premium features at mid-range price</li>
<li><strong>Best for iPhone:</strong> AirPods Pro 2 - Seamless iOS integration</li>
<li><strong>Best for Android:</strong> Samsung Galaxy Buds2 Pro - Deep ecosystem integration</li>
<li><strong>Best for Sports:</strong> Beats Fit Pro - Secure fit with powerful bass</li>
</ul>

<h2>Budget Considerations</h2>
<p>While flagship models cost $200-300, excellent options exist in the $50-100 range. Brands like Anker Soundcore and JBL offer impressive value for money.</p>`,
    author: "Audio Expert",
    featuredImage: {
      url: "https://images.unsplash.com/photo-1590658165737-15a047b7a46f?w=800",
      resourceType: "image"
    },
    tags: ["Audio", "Wireless", "Earbuds", "Reviews"],
    categories: [],
    isFeatured: true,
    status: "published",
    publishedAt: new Date(Date.now() - 86400000) // 1 day ago
  },
  {
    title: "Gaming Laptops vs Desktop PCs: Which Should You Choose in 2026?",
    excerpt: "The eternal debate continues. We break down the pros and cons of gaming laptops versus desktop PCs to help you make an informed decision.",
    content: `<h2>The Great Gaming Debate</h2>
<p>Whether you're a casual gamer or a competitive esports enthusiast, choosing between a gaming laptop and a desktop PC is a crucial decision that affects your gaming experience for years to come.</p>

<h2>Gaming Laptops: Portability Meets Power</h2>
<h3>Advantages</h3>
<ul>
<li>Portable - game anywhere</li>
<li>All-in-one solution with built-in display and peripherals</li>
<li>Space-saving design</li>
<li>Integrated battery for power outages</li>
</ul>

<h3>Disadvantages</h3>
<ul>
<li>Limited upgrade options</li>
<li>Higher cost per performance</li>
<li>Thermal challenges</li>
<li>Shorter lifespan compared to desktops</li>
</ul>

<h2>Desktop PCs: Maximum Performance and Flexibility</h2>
<h3>Advantages</h3>
<ul>
<li>Better cooling and sustained performance</li>
<li>Easily upgradeable components</li>
<li>Better value for money</li>
<li>Larger displays and ergonomic setup</li>
<li>Longer usable lifespan</li>
</ul>

<h3>Disadvantages</h3>
<ul>
<li>Not portable</li>
<li>Requires dedicated space</li>
<li>Need to purchase monitor and peripherals separately</li>
<li>Power outages stop gameplay</li>
</ul>

<h2>Our Recommendation</h2>
<p>Choose a gaming laptop if you travel frequently, have limited space, or need to game in multiple locations. Opt for a desktop if you prioritize performance, upgradeability, and value for money.</p>

<p>Consider a hybrid approach: build a powerful desktop for home and get a budget laptop for portability.</p>`,
    author: "Gaming Guru",
    featuredImage: {
      url: "https://images.unsplash.com/photo-1593640495253-23196b27a87f?w=800",
      resourceType: "image"
    },
    tags: ["Gaming", "Laptops", "PC", "Hardware"],
    categories: [],
    isFeatured: false,
    status: "published",
    publishedAt: new Date(Date.now() - 172800000) // 2 days ago
  },
  {
    title: "5G Smartphones: Everything You Need to Know Before Buying",
    excerpt: "5G is no longer the future—it's the present. Learn what makes a great 5G smartphone and which models deliver the best experience.",
    content: `<h2>Understanding 5G Technology</h2>
<p>5G represents the fifth generation of mobile network technology, offering dramatically faster speeds, lower latency, and improved connectivity. But what does this mean for your smartphone purchase?</p>

<h2>Why 5G Matters</h2>
<p>5G networks can deliver download speeds up to 100 times faster than 4G, with latency as low as 1 millisecond. This enables seamless 4K video streaming, lag-free gaming, and instant app downloads.</p>

<h2>Key Features in a 5G Smartphone</h2>
<h3>Processor</h3>
<p>Look for the latest Snapdragon 8 Gen 3 or Apple A17 Pro chips with integrated 5G modems for optimal efficiency.</p>

<h3>Battery</h3>
<p>5G consumes more power. Choose phones with at least 4,500mAh battery capacity and support for fast charging.</p>

<h3>Display</h3>
<p>To fully appreciate 5G content, opt for phones with 120Hz+ refresh rates and AMOLED displays.</p>

<h2>Top 5G Smartphones of 2026</h2>
<ol>
<li><strong>iPhone 16 Pro Max</strong> - Best overall 5G experience</li>
<li><strong>Samsung Galaxy S25 Ultra</strong> - Best Android flagship</li>
<li><strong>Google Pixel 9 Pro</strong> - Best camera and AI features</li>
<li><strong>OnePlus 12</strong> - Best value flagship</li>
<li><strong>Xiaomi 14 Pro</strong> - Best fast-charging</li>
</ol>

<h2>5G Coverage Considerations</h2>
<p>Before buying a 5G phone, check your carrier's 5G coverage map. Many areas still rely primarily on 4G LTE networks.</p>`,
    author: "Mobile Expert",
    featuredImage: {
      url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800",
      resourceType: "image"
    },
    tags: ["Smartphones", "5G", "Mobile", "Technology"],
    categories: [],
    isFeatured: false,
    status: "published",
    publishedAt: new Date(Date.now() - 259200000) // 3 days ago
  },
  {
    title: "Mechanical Keyboards: The Complete Beginner's Guide",
    excerpt: "Discover why mechanical keyboards have taken the tech world by storm and how to choose your first one.",
    content: `<h2>Why Mechanical Keyboards?</h2>
<p>Mechanical keyboards offer superior typing experience, durability, and customization options compared to traditional membrane keyboards. Once you try one, there's no going back.</p>

<h2>Understanding Switch Types</h2>
<h3>Linear Switches (Red)</h3>
<p>Smooth keystroke with no tactile bump. Ideal for gaming and fast typing. Popular options: Cherry MX Red, Gateron Red.</p>

<h3>Tactile Switches (Brown)</h3>
<p>Gentle tactile bump provides typing feedback without being too loud. Perfect for office use. Popular: Cherry MX Brown, Kailh Brown.</p>

<h3>Clicky Switches (Blue)</h3>
<p>Pronounced click sound and tactile feedback. Excellent for typing enthusiasts but may disturb others. Popular: Cherry MX Blue, Gateron Blue.</p>

<h2>Form Factors</h2>
<ul>
<li><strong>Full-Size (100%):</strong> Includes numpad - best for productivity</li>
<li><strong>Tenkeyless (TKL/80%):</strong> Compact without numpad - popular choice</li>
<li><strong>75%:</strong> Compact with function keys</li>
<li><strong>65%:</strong> No function row but has arrow keys</li>
<li><strong>60%:</strong> Minimal layout for enthusiasts</li>
</ul>

<h2>Budget Recommendations</h2>
<h3>Under $50</h3>
<p>Redragon K552 - Solid entry-level mechanical keyboard with good build quality.</p>

<h3>$50-$100</h3>
<p>Keychron K2 - Wireless option with Mac/Windows compatibility and hot-swappable switches.</p>

<h3>$100-$200</h3>
<p>Ducky One 3 - Premium build quality with excellent keycaps and multiple switch options.</p>

<h2>Essential Features</h2>
<p>Look for N-key rollover, USB-C connectivity, and if possible, hot-swappable switches for easy customization.</p>`,
    author: "Keyboard Enthusiast",
    featuredImage: {
      url: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800",
      resourceType: "image"
    },
    tags: ["Keyboards", "Peripherals", "Gaming", "Productivity"],
    categories: [],
    isFeatured: false,
    status: "published",
    publishedAt: new Date(Date.now() - 345600000) // 4 days ago
  }
];

async function seedBlogs() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/yourhaat');
    console.log('✅ Connected to MongoDB');

    // Create blog categories
    const categoryNames = ['Smart Home', 'Audio', 'Gaming', 'Mobile', 'Accessories'];
    const categoryIds = {};

    for (const name of categoryNames) {
      let category = await BlogCategory.findOne({ name });
      if (!category) {
        category = await BlogCategory.create({ name, description: `${name} related articles` });
        console.log(`✅ Created category: ${name}`);
      }
      categoryIds[name] = category._id;
    }

    // Clear existing blogs
    await BlogPost.deleteMany({});
    console.log('🗑️  Cleared existing blogs');

    // Create blogs
    for (const blog of sampleBlogs) {
      // Assign categories based on tags
      const cats = [];
      if (blog.tags.includes('Smart Home') || blog.tags.includes('IoT')) cats.push(categoryIds['Smart Home']);
      if (blog.tags.includes('Audio') || blog.tags.includes('Earbuds')) cats.push(categoryIds['Audio']);
      if (blog.tags.includes('Gaming') || blog.tags.includes('PC')) cats.push(categoryIds['Gaming']);
      if (blog.tags.includes('Smartphones') || blog.tags.includes('Mobile') || blog.tags.includes('5G')) cats.push(categoryIds['Mobile']);
      if (blog.tags.includes('Keyboards') || blog.tags.includes('Peripherals')) cats.push(categoryIds['Accessories']);
      
      blog.categories = cats;
      
      await BlogPost.create(blog);
      console.log(`✅ Created blog: ${blog.title}`);
    }

    console.log(`\n🎉 Successfully seeded ${sampleBlogs.length} blog posts!`);
    console.log('✨ Your blog is now populated with electronics content');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding blogs:', error);
    process.exit(1);
  }
}

seedBlogs();
