const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const mongoose = require('mongoose');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/products');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Curated high quality legal Unsplash shoe photos (Unsplash Free Licence) with full photographer credits
const STYLE_PHOTOS = {
  runner: [
    {
      id: 'runner_1',
      url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
      credit: 'Dom Hill',
      alt: 'Red performance running sneaker side view'
    },
    {
      id: 'runner_2',
      url: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5',
      credit: 'Paul Volkmer',
      alt: 'Black athletic breathable running shoe'
    },
    {
      id: 'runner_3',
      url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a',
      credit: 'Maksim Larin',
      alt: 'Futuristic cushioned neon runner'
    },
    {
      id: 'runner_4',
      url: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2',
      credit: 'Fachry Zella Devandra',
      alt: 'Lightweight marathon shoe'
    }
  ],
  court: [
    {
      id: 'court_1',
      url: 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3',
      credit: 'Hermes Rivera',
      alt: 'Classic white court tennis sneaker'
    },
    {
      id: 'court_2',
      url: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77',
      credit: 'Jan Antonin Kolar',
      alt: 'Retro skate and street court sneaker'
    },
    {
      id: 'court_3',
      url: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86',
      credit: 'Revolt',
      alt: 'Multicolor street court trainer'
    }
  ],
  hightop: [
    {
      id: 'hightop_1',
      url: 'https://images.unsplash.com/photo-1552346154-21d32810aba3',
      credit: 'Daniel Storek',
      alt: 'Vintage leather high-top basketball sneaker'
    },
    {
      id: 'hightop_2',
      url: 'https://images.unsplash.com/photo-1514989940723-e8e51635b782',
      credit: 'Lucas Hoang',
      alt: 'Canvas high-top sneaker retro profile'
    },
    {
      id: 'hightop_3',
      url: 'https://images.unsplash.com/photo-1582588678413-dbf45f4823e9',
      credit: 'Taylor Smith',
      alt: 'Urban premium leather high-top boot sneaker'
    }
  ],
  boot: [
    {
      id: 'boot_1',
      url: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f',
      credit: 'Girma Nigusse',
      alt: 'Rugged leather lace-up combat boot'
    },
    {
      id: 'boot_2',
      url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772',
      credit: 'Camila Damásio',
      alt: 'Classic suede Chelsea ankle boot'
    },
    {
      id: 'boot_3',
      url: 'https://images.unsplash.com/photo-1520639888713-7851133b1ed0',
      credit: 'Alina Grubnyak',
      alt: 'Waterproof all-weather outdoor boot'
    }
  ],
  loafer: [
    {
      id: 'loafer_1',
      url: 'https://images.unsplash.com/photo-1533867617858-e7b97e060509',
      credit: 'Girma Nigusse',
      alt: 'Handcrafted brown leather penny loafer'
    },
    {
      id: 'loafer_2',
      url: 'https://images.unsplash.com/photo-1560343090-f0409e92791a',
      credit: 'Wu Yi',
      alt: 'Slip-on formal Italian dress shoe'
    },
    {
      id: 'loafer_3',
      url: 'https://images.unsplash.com/photo-1595341888016-a392ef81b7de',
      credit: 'NordWood Themes',
      alt: 'Casual suede driving loafer'
    }
  ],
  trail: [
    {
      id: 'trail_1',
      url: 'https://images.unsplash.com/photo-1575537302964-96cd47c06b1b',
      credit: 'Usama Akram',
      alt: 'Grip lugged sole off-road trail running shoe'
    },
    {
      id: 'trail_2',
      url: 'https://images.unsplash.com/photo-1512990414788-d97cb4a25db3',
      credit: 'Lefteris kallergis',
      alt: 'Mountain trekking trail sneaker'
    },
    {
      id: 'trail_3',
      url: 'https://images.unsplash.com/photo-1587563871167-1ee9c731aefb',
      credit: 'Malvestida',
      alt: 'Reinforced toe trail outdoor walker'
    }
  ]
};

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url + '?auto=format&fit=crop&w=1200&h=1200&q=85', res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function processPhoto(rawBuffer, baseName) {
  const mainFile = `${baseName}.webp`;
  const cardFile = `${baseName}_card.webp`;
  const thumbFile = `${baseName}_thumb.webp`;

  const mainPath = path.join(UPLOAD_DIR, mainFile);
  const cardPath = path.join(UPLOAD_DIR, cardFile);
  const thumbPath = path.join(UPLOAD_DIR, thumbFile);

  // Generate 1200px main WebP
  await sharp(rawBuffer)
    .resize(1200, 1200, { fit: 'cover', position: 'center' })
    .webp({ quality: 82 })
    .toFile(mainPath);

  // Generate 600px card WebP
  await sharp(rawBuffer)
    .resize(600, 600, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toFile(cardPath);

  // Generate 160px thumb WebP
  await sharp(rawBuffer)
    .resize(160, 160, { fit: 'cover', position: 'center' })
    .webp({ quality: 75 })
    .toFile(thumbPath);

  // 20px blurred base64 placeholder
  const blurBuffer = await sharp(rawBuffer)
    .resize(20, 20, { fit: 'cover' })
    .webp({ quality: 20 })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;

  return {
    url: `/uploads/products/${mainFile}`,
    cardUrl: `/uploads/products/${cardFile}`,
    thumbUrl: `/uploads/products/${thumbFile}`,
    blurDataUrl,
    width: 1200,
    height: 1200
  };
}

async function main() {
  console.log('Downloading and optimizing curated stock photos for all footwear categories...');
  const processedByStyle = {};

  for (const [style, items] of Object.entries(STYLE_PHOTOS)) {
    processedByStyle[style] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const baseName = `${style}_${idx + 1}`;
      console.log(`Processing ${style} [${idx + 1}/${items.length}] by ${item.credit}...`);
      try {
        const rawBuf = await downloadImage(item.url);
        const imgObj = await processPhoto(rawBuf, baseName);
        processedByStyle[style].push({
          ...imgObj,
          alt: item.alt,
          credit: `${item.credit} on Unsplash`,
          sourceUrl: item.url,
          licence: 'Unsplash Free License'
        });
      } catch (err) {
        console.error(`Failed to process ${item.url}:`, err.message);
      }
    }
  }

  // Connect to DB and update all 60 shoes
  console.log('Connecting to MongoDB to update 60 product galleries...');
  await mongoose.connect('mongodb://127.0.0.1:27017/stride');
  const Product = mongoose.connection.collection('products');
  const products = await Product.find({}).toArray();

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const style = p.type || 'runner';
    const pool = processedByStyle[style] || processedByStyle.runner;
    if (!pool || !pool.length) continue;

    // Primary cover photo and 2 additional angle/color photos from pool
    const primaryIdx = i % pool.length;
    const secondaryIdx = (i + 1) % pool.length;
    const tertiaryIdx = (i + 2) % pool.length;

    const img1 = { ...pool[primaryIdx], isCover: true };
    const img2 = { ...pool[secondaryIdx], isCover: false };
    const img3 = { ...pool[tertiaryIdx], isCover: false };

    const images = [img1, img2, img3];
    const coverImage = img1.cardUrl;

    const colorways = [
      { name: 'Core Edition', hex: '#1e293b', imageIndex: 0 },
      { name: 'Contrast Edition', hex: '#e11d48', imageIndex: 1 },
      { name: 'Neutral Minimal', hex: '#94a3b8', imageIndex: 2 }
    ];

    await Product.updateOne(
      { _id: p._id },
      {
        $set: {
          image: coverImage,
          images,
          colorways,
          highlights: {
            upperMaterial: style === 'boot' || style === 'loafer' ? 'Full Grain Leather' : 'Engineered Breathable Mesh',
            soleMaterial: style === 'trail' ? 'High-Traction Lugged Vibram Compound' : 'Ultra-Responsive Cushioning EVA',
            closure: style === 'loafer' ? 'Slip-On' : 'Lace-Up with Metal Eyelets',
            fit: 'Standard UK Regular'
          }
        }
      }
    );
  }

  console.log(`Successfully updated ${products.length} products with real photography, responsive formats, and colorways.`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
