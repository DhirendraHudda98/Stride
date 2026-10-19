const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const mongoose = require('mongoose');

// Compute SHA-256
function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// 64-bit dHash perceptual hash
async function computeDHash(buffer) {
  try {
    const { data } = await sharp(buffer)
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = data[row * 9 + col];
        const right = data[row * 9 + col + 1];
        hash += (left > right ? '1' : '0');
      }
    }
    return hash;
  } catch (err) {
    return null;
  }
}

// Hamming distance between two binary hash strings
function hammingDistance(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 999;
  let dist = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) dist++;
  }
  return dist;
}

async function audit() {
  console.log('====================================================');
  console.log('🔍 STRIDE IMAGE AUDIT TOOL (PHASE 1 AUDIT)');
  console.log('====================================================\n');

  await mongoose.connect('mongodb://127.0.0.1:27017/stride');
  const Product = mongoose.connection.collection('products');
  const products = await Product.find({}).toArray();

  console.log(`Found ${products.length} products in database.\n`);

  const imageMap = new Map(); // url -> { buffer, sha256, dhash, width, height, size, products: [] }
  const productIssues = [];
  const exactDuplicates = new Map(); // sha256 -> [ { url, productNames } ]
  const nearDuplicates = []; // [ { p1, p2, url1, url2, distance } ]

  for (const p of products) {
    const imgs = p.images && p.images.length ? p.images : (p.image ? [{ url: p.image }] : []);

    if (imgs.length < 3) {
      productIssues.push({
        id: p._id,
        name: p.name,
        issue: `Fewer than 3 images (has ${imgs.length})`
      });
    }

    for (const im of imgs) {
      if (!im.url) continue;
      // Strip query params or leading slash to resolve local path
      let relPath = im.url.replace(/^\//, '');
      const localPath = path.join(__dirname, '../public', relPath);

      if (!fs.existsSync(localPath)) {
        productIssues.push({
          id: p._id,
          name: p.name,
          issue: `Missing or broken image file: ${im.url}`
        });
        continue;
      }

      if (!imageMap.has(im.url)) {
        const buf = fs.readFileSync(localPath);
        const meta = await sharp(buf).metadata();
        const sha = computeSha256(buf);
        const dhash = await computeDHash(buf);

        imageMap.set(im.url, {
          url: im.url,
          sha256: sha,
          dhash,
          width: meta.width,
          height: meta.height,
          size: buf.length,
          products: [p.name]
        });
      } else {
        const item = imageMap.get(im.url);
        if (!item.products.includes(p.name)) {
          item.products.push(p.name);
        }
      }
    }
  }

  // Check exact duplicates (SHA256 across different products or multiple occurrences)
  for (const [url, item] of imageMap.entries()) {
    if (item.products.length > 1) {
      if (!exactDuplicates.has(item.sha256)) {
        exactDuplicates.set(item.sha256, {
          url,
          products: item.products,
          count: item.products.length
        });
      }
    }
  }

  // Check near duplicates (dHash hamming distance <= 8)
  const itemsArray = Array.from(imageMap.values());
  for (let i = 0; i < itemsArray.length; i++) {
    for (let j = i + 1; j < itemsArray.length; j++) {
      const it1 = itemsArray[i];
      const it2 = itemsArray[j];
      if (it1.sha256 === it2.sha256) continue; // Already exact
      const dist = hammingDistance(it1.dhash, it2.dhash);
      if (dist <= 8) {
        nearDuplicates.push({
          url1: it1.url,
          url2: it2.url,
          dist,
          products1: it1.products,
          products2: it2.products
        });
      }
    }
  }

  console.log('----------------------------------------------------');
  console.log('📊 AUDIT SUMMARY METRICS');
  console.log('----------------------------------------------------');
  console.log(`Total Products: ${products.length}`);
  console.log(`Unique Image Files Referenced: ${imageMap.size}`);
  console.log(`Exact Duplicate Groups (Images shared across products): ${exactDuplicates.size}`);
  console.log(`Near-Duplicate Image Pairs (dHash <= 8): ${nearDuplicates.length}`);
  console.log(`Products with < 3 Images: ${productIssues.filter(x => x.issue.includes('Fewer than 3')).length}`);
  console.log(`Broken Image References: ${productIssues.filter(x => x.issue.includes('Missing')).length}\n`);

  if (exactDuplicates.size > 0) {
    console.log('❌ FAIL: EXACT DUPLICATE GROUPS (Photos reused across multiple shoes):');
    let count = 0;
    for (const [sha, info] of exactDuplicates.entries()) {
      count++;
      if (count <= 10) {
        console.log(`  [${count}] ${info.url} reused by ${info.count} products: ${info.products.slice(0, 5).join(', ')}${info.products.length > 5 ? '...' : ''}`);
      }
    }
    if (exactDuplicates.size > 10) {
      console.log(`  ... and ${exactDuplicates.size - 10} more duplicate groups.\n`);
    } else {
      console.log('');
    }
  }

  const hasFails = exactDuplicates.size > 0 || productIssues.length > 0;
  console.log('----------------------------------------------------');
  console.log(`Audit result: ${hasFails ? '❌ FAILED (Rule 1 Violated: Photos are reused)' : '✅ PASSED'}`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  // Return stats for reporting
  return {
    totalProducts: products.length,
    uniqueImages: imageMap.size,
    exactDuplicates: exactDuplicates.size,
    nearDuplicates: nearDuplicates.length,
    productIssues: productIssues.length,
    hasFails
  };
}

if (require.main === module) {
  audit().then(res => {
    if (res.hasFails) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { audit };
