import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// simple helper to log and exit on error
function fatal(err) {
  console.error('SEED ERROR', err);
  process.exit(1);
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/yourhaat';
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB for seeding');
  } catch (err) {
    fatal(err);
  }

  const Category = (await import('./models/Category.js')).default;
  const Product = (await import('./models/Product.js')).default;

  // remove existing data (optional)
  await Category.deleteMany({});
  await Product.deleteMany({});
  console.log('Cleared existing categories & products');

  // create a few categories / subcategories
  const cats = {};
  function c(name, parent = null) {
    return { name, parent };
  }

  const categoriesToCreate = [
    c('Electronics'),
    c('Ladies'),
    c('Gents'),
    // subcategories
    c('Mobile Phones', 'Electronics'),
    c('Laptops', 'Electronics'),
    c('Accessories', 'Electronics'),
    c('Cameras', 'Electronics'),
    c('Smart Watches', 'Electronics'),
    c('Clothing (Ladies)', 'Ladies'),
    c('Jewelry', 'Ladies'),
    c('Beauty', 'Ladies'),
    c('Clothing (Gents)', 'Gents'),
    c('Grooming', 'Gents'),
    c('Footwear (Gents)', 'Gents'),
    // level 2
    c('Smartphones', 'Mobile Phones'),
    c('Android Phones', 'Smartphones'),
    c('iOS Phones', 'Smartphones'),
    c('DSLR', 'Cameras'),
    c('Mirrorless', 'Cameras'),
    c('Running Shoes', 'Footwear (Gents)'),
    c('Makeup', 'Beauty'),
    c('Skincare', 'Beauty'),
    c('Dresses', 'Clothing (Ladies)'),
    c('Formal Shirts', 'Clothing (Gents)')
  ];

  // first create top-level categories to get ids
  for (const cat of categoriesToCreate) {
    if (!cat.parent) {
      const doc = new Category({ name: cat.name });
      await doc.save();
      cats[cat.name] = doc;
    }
  }

  // create non-root categories in multiple passes to ensure parents exist
  let remaining = categoriesToCreate.filter(cat => cat.parent);
  while (remaining.length) {
    const next = [];
    for (const cat of remaining) {
      const parentDoc = cats[cat.parent];
      if (!parentDoc) {
        next.push(cat);
        continue;
      }
      const doc = new Category({ name: cat.name, parent: parentDoc._id, level: parentDoc.level + 1 });
      await doc.save();
      cats[cat.name] = doc;
    }
    if (next.length === remaining.length) {
      // cannot resolve parents any further
      break;
    }
    remaining = next;
  }

  console.log('Created categories:');
  Object.values(cats).forEach(c => console.log('-', c.name));

  // now create a number of products across various categories
  const productsToCreate = [
    {
      title: 'SuperPhone X',
      description: 'Latest flagship smartphone',
      price: 999,
      categoryId: cats['Smartphones']?._id,
      tags: ['mobile','smartphone'],
      inventory: 50,
      status: 'published'
    },
    {
      title: 'UltraBook Pro 14',
      description: 'Slim premium laptop with OLED display',
      price: 1499,
      categoryId: cats['Laptops']?._id,
      tags: ['laptop','electronics'],
      inventory: 20,
      status: 'published'
    },
    {
      title: 'Wireless Earbuds Z ',
      description: 'Noise-cancelling earbuds',
      price: 199,
      categoryId: cats['Accessories']?._id,
      tags: ['audio','earbuds'],
      inventory: 100,
      status: 'published'
    },
    {
      title: 'Pro DSLR Camera',
      description: 'High resolution DSLR for professionals',
      price: 1200,
      categoryId: cats['DSLR']?._id,
      tags: ['camera','photography'],
      inventory: 10,
      status: 'published'
    },
    {
      title: 'Crystal Smart Watch',
      description: 'Fitness tracker & smartwatch',
      price: 249,
      categoryId: cats['Smart Watches']?._id,
      tags: ['wearable','watch'],
      inventory: 60,
      status: 'published'
    },
    {
      title: 'Elegant Evening Dress',
      description: 'Perfect for parties and events',
      price: 120,
      categoryId: cats['Dresses']?._id,
      tags: ['dress','fashion'],
      inventory: 30,
      status: 'published'
    },
    {
      title: 'Makeup Starter Kit',
      description: 'Basic makeup essentials',
      price: 60,
      categoryId: cats['Makeup']?._id,
      tags: ['makeup','beauty'],
      inventory: 70,
      status: 'published'
    },
    {
      title: 'Classic Formal Shirt',
      description: 'Sharp look for the office',
      price: 45,
      categoryId: cats['Formal Shirts']?._id,
      tags: ['shirt','men'],
      inventory: 100,
      status: 'published'
    },
    {
      title: 'Men’s Grooming Kit',
      description: 'Complete grooming set with trimmer and scissors',
      price: 80,
      categoryId: cats['Grooming']?._id,
      tags: ['grooming','men'],
      inventory: 40,
      status: 'published'
    },
    {
      title: 'Running Shoes',
      description: 'Lightweight shoes for runners',
      price: 90,
      categoryId: cats['Running Shoes']?._id,
      tags: ['shoes','sports'],
      inventory: 80,
      status: 'published'
    },
    {
      title: 'Diamond Stud Earrings',
      description: '12k white gold diamond studs',
      price: 250,
      categoryId: cats['Jewelry']?._id,
      tags: ['jewelry','earrings'],
      inventory: 15,
      status: 'published'
    }
  ];

  for (const prod of productsToCreate) {
    const p = new Product(prod);
    await p.save();
    console.log('Created product', p.title);
  }

  mongoose.disconnect();
  console.log('Seeding finished');
}

main().catch(fatal);
