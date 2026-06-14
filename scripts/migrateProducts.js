/**
 * Product DB migration — run once after schema changes.
 *
 * What this fixes:
 *  1. specifications  – was `String`, then `[{key,value}]`, now `[{type,label,key,value}]`
 *     • string  → cleared to []
 *     • [{key,value}] without type → adds type:"row"
 *     • entries where value is an object (corrupt image data) → removed
 *     • completely empty entries {} → removed
 *  2. detailedDescription – no migration needed (Mixed accepts both string and array)
 *
 * Run:  node scripts/migrateProducts.js
 * Safe to re-run — idempotent.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yourhaat';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Use raw collection to avoid Mongoose casting old data
  const col = mongoose.connection.collection('products');

  // ── 1. specifications that are stored as a plain string ─────────────────────
  const stringSpecDocs = await col
    .find({ specifications: { $type: 'string' } })
    .project({ _id: 1, title: 1, specifications: 1 })
    .toArray();

  console.log(`\nFound ${stringSpecDocs.length} products with string specifications`);
  for (const doc of stringSpecDocs) {
    console.log(`  • [${doc._id}] "${doc.title}" — clearing string spec`);
    await col.updateOne({ _id: doc._id }, { $set: { specifications: [] } });
  }

  // ── 2. specifications that are arrays needing cleanup / type injection ───────
  const arraySpecDocs = await col
    .find({
      specifications: { $exists: true, $type: 'array', $ne: [] },
    })
    .project({ _id: 1, title: 1, specifications: 1 })
    .toArray();

  console.log(`\nFound ${arraySpecDocs.length} products with array specifications`);

  let cleanedCount = 0;
  for (const doc of arraySpecDocs) {
    const original = doc.specifications;
    if (!Array.isArray(original)) continue;

    let changed = false;
    const cleaned = [];

    for (const spec of original) {
      // skip nulls or non-objects
      if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
        changed = true;
        continue;
      }

      // already has a valid type — keep as-is
      if (spec.type === 'header' || spec.type === 'row') {
        // but still guard: header must have label, row must have string key/value
        if (spec.type === 'header') {
          if (spec.label && typeof spec.label === 'string') {
            cleaned.push(spec);
          } else {
            changed = true; // invalid header, drop it
          }
        } else {
          // row
          if (typeof spec.value === 'object' && spec.value !== null) {
            // corrupt — value is an image object etc., drop
            changed = true;
            console.log(`    ⚠ dropped corrupt row (object value) in "${doc.title}"`);
          } else {
            cleaned.push({
              type: 'row',
              key: typeof spec.key === 'string' ? spec.key : String(spec.key ?? ''),
              value: spec.value != null ? String(spec.value) : '',
            });
          }
        }
        continue;
      }

      // no type field — infer from content
      const hasLabel = spec.label && typeof spec.label === 'string';
      const hasKey   = spec.key   != null;
      const hasValue = spec.value != null;

      if (hasLabel && !hasKey && !hasValue) {
        // it's a header
        cleaned.push({ type: 'header', label: spec.label });
        changed = true;
        continue;
      }

      if (hasKey || hasValue) {
        if (typeof spec.value === 'object' && spec.value !== null) {
          // corrupt row (image object stored as value) — drop
          changed = true;
          console.log(`    ⚠ dropped corrupt row (no type, object value) in "${doc.title}"`);
          continue;
        }
        cleaned.push({
          type: 'row',
          key:   typeof spec.key === 'string'   ? spec.key   : String(spec.key ?? ''),
          value: spec.value != null ? String(spec.value) : '',
        });
        changed = true; // added type field
        continue;
      }

      // completely empty or unrecognisable — drop
      changed = true;
    }

    if (changed) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { specifications: cleaned } },
      );
      cleanedCount++;
      console.log(`  ✓ [${doc._id}] "${doc.title}" — ${original.length} → ${cleaned.length} specs`);
    }
  }

  // ── 3. detailedDescription — convert plain objects (non-array, non-string) ──
  //    Mixed field, but guard against any weird stored values
  const weirdDescDocs = await col
    .find({
      detailedDescription: {
        $exists: true,
        $not: { $type: 'string' },
        $not: { $type: 'array' },
        $not: { $type: 'null' },
      },
    })
    .project({ _id: 1, title: 1 })
    .toArray();

  console.log(`\nFound ${weirdDescDocs.length} products with unexpected detailedDescription type`);
  for (const doc of weirdDescDocs) {
    console.log(`  • [${doc._id}] "${doc.title}" — clearing detailedDescription`);
    await col.updateOne({ _id: doc._id }, { $unset: { detailedDescription: '' } });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log('Migration complete:');
  console.log(`  String specs cleared : ${stringSpecDocs.length}`);
  console.log(`  Array specs cleaned  : ${cleanedCount}`);
  console.log(`  Bad detailedDesc     : ${weirdDescDocs.length}`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
