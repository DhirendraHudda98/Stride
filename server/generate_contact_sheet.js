const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function generateContactSheet() {
  await mongoose.connect('mongodb://127.0.0.1:27017/stride');
  const Product = mongoose.connection.collection('products');
  const products = await Product.find({}).sort({ type: 1, name: 1 }).toArray();

  const outDir = path.join(__dirname, '../output');
  fs.mkdirSync(outDir, { recursive: true });

  // Map occurrences to highlight duplicates in red
  const urlCounts = new Map();
  for (const p of products) {
    const imgs = p.images || [];
    for (const im of imgs) {
      if (im.url) urlCounts.set(im.url, (urlCounts.get(im.url) || 0) + 1);
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Stride Catalogue Visual Contact Sheet</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; }
    h1 { margin-top: 0; font-size: 1.8rem; }
    .meta-bar { background: #1e293b; padding: 12px 18px; border-radius: 8px; margin-bottom: 24px; font-size: .95rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 14px; position: relative; }
    .card.has-dup { border: 2px solid #ef4444; background: #2a1b24; }
    .card-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .name { font-weight: 700; font-size: 1.05rem; }
    .badge { font-size: .75rem; background: #334155; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
    .dup-badge { background: #ef4444; color: #fff; font-size: .7rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
    .imgs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; }
    .imgs img { width: 90px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #475569; }
    .imgs img.is-dup { border: 2px solid #ef4444; }
    .details { font-size: .8rem; color: #94a3b8; margin-top: 8px; line-height: 1.4; }
  </style>
</head>
<body>
  <h1>Stride Catalogue Visual Contact Sheet</h1>
  <div class="meta-bar">
    Total Products: <b>${products.length}</b> | Red borders indicate photos reused across multiple products.
  </div>
  <div class="grid">
    ${products.map(p => {
      const imgs = p.images || (p.image ? [{ url: p.image }] : []);
      const hasDup = imgs.some(im => (urlCounts.get(im.url) || 0) > 1);
      return `
        <div class="card ${hasDup ? 'has-dup' : ''}">
          <div class="card-hdr">
            <div>
              <div class="name">${p.name}</div>
              <div style="font-size: .8rem; color: #38bdf8;">${p.brand || 'Stride'} · ${p.type} · ${p.gender}</div>
            </div>
            ${hasDup ? '<span class="dup-badge">REUSED PHOTO</span>' : '<span class="badge">UNIQUE</span>'}
          </div>
          <div class="imgs">
            ${imgs.map(im => `
              <img src="${im.url}" class="${(urlCounts.get(im.url) || 0) > 1 ? 'is-dup' : ''}" title="${im.url} (Used ${urlCounts.get(im.url) || 1} times)" loading="lazy">
            `).join('')}
          </div>
          <div class="details">
            <b>Price:</b> ₹${Math.round(p.price / 100)} (MRP ₹${Math.round((p.mrp || p.price) / 100)})<br>
            <b>Stock:</b> ${p.stock} | <b>Images count:</b> ${imgs.length}<br>
            <b>Alt:</b> ${imgs[0]?.alt || 'N/A'}
          </div>
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, 'contact-sheet.html'), html, 'utf8');
  console.log(`Contact sheet generated at: output/contact-sheet.html`);
  await mongoose.disconnect();
}

if (require.main === module) {
  generateContactSheet().catch(console.error);
}

module.exports = { generateContactSheet };
