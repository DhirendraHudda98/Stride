const path = require('path');
const fs = require('fs');
require('dotenv').config();
const mongoose = require('mongoose'), bcrypt = require('bcryptjs');
const { User, Product, Review, Coupon, Order, TYPES } = require('./models');

const BRANDS = ['Stride', 'Red Tape', 'Woodland', 'Bata', 'Campus', 'Sparx'];
const ADJ = ['Aero', 'Night', 'Dune', 'Sage', 'Ember', 'Cobalt', 'Slate', 'Coral', 'Ivory', 'Onyx', 'Rust', 'Mint'];
const NOUN = {
  runner: ['Run', 'Sprint', 'Glide', 'Pulse', 'Tempo', 'Dash', 'Flow', 'Stride'],
  court: ['Court', 'Serve', 'Baseline', 'Classic', 'Ace', 'Volley', 'Deuce'],
  hightop: ['High', 'Skyline', 'Rally', 'Tower', 'Peak', 'Loft', 'Dunk'],
  boot: ['Boot', 'Ridge', 'Summit', 'Canyon', 'Forge', 'Timber', 'Harbor'],
  loafer: ['Loafer', 'Drift', 'Penny', 'Muse', 'Plaza', 'Slip', 'Venture'],
  trail: ['Trek', 'Ridgeline', 'Gravel', 'Mesa', 'Fjord', 'Moss', 'Ascent']
};

// Phase 2 Price bands in integer paise (₹1 = 100 paise)
// runner ₹1,999 to ₹4,999 · court ₹1,799 to ₹3,999 · hightop ₹2,999 to ₹5,999
// boot ₹3,999 to ₹8,999 · loafer ₹1,999 to ₹4,499 · trail ₹2,999 to ₹6,999
const BANDS = {
  runner:  { min: 199900, max: 499900, step: 25000 },
  court:   { min: 179900, max: 399900, step: 20000 },
  hightop: { min: 299900, max: 599900, step: 30000 },
  boot:    { min: 399900, max: 899900, step: 45000 },
  loafer:  { min: 199900, max: 449900, step: 22000 },
  trail:   { min: 299900, max: 699900, step: 35000 }
};

const DESC = {
  runner: 'Light, breathable engineered mesh runner with responsive high-rebound cushioning for Indian roads.',
  court: 'Clean court-inspired sneaker with durable cupsole and premium soft-touch upper for everyday styling.',
  hightop: 'High-top silhouette with padded ankle collar and reinforced grip for maximum street support.',
  boot: 'Water-resistant rugged leather boot with deep-lugged anti-skid rubber sole built for all seasons.',
  loafer: 'Handcrafted slip-on shoe with plush cushioned footbed and breathable inner lining for work and leisure.',
  trail: 'All-terrain outdoor shoe with rock-plate protection, mudguard and aggressive multi-directional traction.'
};

const COLOR_THEMES = [
  { primary: '#2563eb', secondary: '#f8fafc', accent: '#1d4ed8', bg: '#eff6ff' },
  { primary: '#16a34a', secondary: '#f0fdf4', accent: '#15803d', bg: '#f0fdf4' },
  { primary: '#ea580c', secondary: '#fff7ed', accent: '#c2410c', bg: '#fff7ed' },
  { primary: '#0f172a', secondary: '#f1f5f9', accent: '#334155', bg: '#f8fafc' },
  { primary: '#7c3aed', secondary: '#faf5ff', accent: '#6d28d9', bg: '#f5f3ff' },
  { primary: '#b45309', secondary: '#fef3c7', accent: '#92400e', bg: '#fffbeb' },
  { primary: '#0891b2', secondary: '#ecfeff', accent: '#0e7490', bg: '#ecfeff' },
  { primary: '#e11d48', secondary: '#fff1f2', accent: '#be123c', bg: '#fff1f2' }
];

function generateShoeSvg(name, brand, type, themeIndex) {
  const theme = COLOR_THEMES[themeIndex % COLOR_THEMES.length];
  const { primary, secondary, accent, bg } = theme;

  let shoePath = '';
  let solePath = '';
  let detailLines = '';

  if (type === 'runner') {
    shoePath = `M 70,165 Q 110,130 170,120 Q 210,115 250,95 Q 265,120 280,140 Q 320,150 340,168 Q 300,180 200,182 Q 110,182 70,165 Z`;
    solePath = `M 65,165 Q 110,180 200,182 Q 300,182 342,168 L 348,185 Q 280,198 180,198 Q 100,198 62,180 Z`;
    detailLines = `<path d="M 160,122 Q 200,150 250,150" stroke="${accent}" stroke-width="4" fill="none" opacity="0.6"/>
                   <circle cx="210" cy="115" r="3" fill="#ffffff"/>
                   <circle cx="225" cy="110" r="3" fill="#ffffff"/>
                   <circle cx="240" cy="105" r="3" fill="#ffffff"/>`;
  } else if (type === 'hightop') {
    shoePath = `M 70,165 L 75,85 Q 120,80 155,100 L 220,105 Q 260,110 280,135 Q 320,145 342,168 Q 300,180 200,182 Q 110,182 70,165 Z`;
    solePath = `M 65,165 Q 110,180 200,182 Q 300,182 342,168 L 346,186 Q 280,198 180,198 Q 100,198 62,180 Z`;
    detailLines = `<path d="M 78,92 L 145,102" stroke="#ffffff" stroke-width="3" opacity="0.7"/>
                   <path d="M 120,110 L 195,145" stroke="${accent}" stroke-width="4" fill="none"/>`;
  } else if (type === 'boot') {
    shoePath = `M 68,168 L 72,70 Q 115,68 150,88 L 205,98 Q 255,115 285,138 Q 325,145 345,168 Q 290,180 200,180 Q 100,180 68,168 Z`;
    solePath = `M 62,168 Q 120,180 200,180 Q 300,180 345,168 L 348,190 L 330,194 L 320,190 L 290,194 L 280,190 L 190,194 L 180,190 L 100,194 L 60,186 Z`;
    detailLines = `<circle cx="160" cy="100" r="4" fill="#d97706"/><circle cx="175" cy="110" r="4" fill="#d97706"/><circle cx="190" cy="120" r="4" fill="#d97706"/>`;
  } else if (type === 'loafer') {
    shoePath = `M 72,165 Q 95,140 145,135 Q 210,130 260,120 Q 295,135 340,165 Q 280,178 190,178 Q 110,178 72,165 Z`;
    solePath = `M 68,165 Q 110,178 190,178 Q 290,178 340,165 L 344,178 Q 280,188 180,188 L 105,188 L 102,194 L 66,194 Z`;
    detailLines = `<path d="M 195,128 Q 220,140 245,128" stroke="${accent}" stroke-width="4" fill="none"/>`;
  } else if (type === 'trail') {
    shoePath = `M 68,166 Q 105,130 165,122 Q 220,118 255,98 Q 275,120 290,140 Q 325,148 348,168 Q 295,182 195,182 Q 105,182 68,166 Z`;
    solePath = `M 62,166 Q 115,182 195,182 Q 300,182 348,168 L 352,188 L 335,195 L 315,188 L 295,195 L 270,188 L 245,195 L 220,188 L 195,195 L 170,188 L 140,195 L 60,186 Z`;
    detailLines = `<path d="M 285,150 Q 330,158 345,168" fill="${accent}" opacity="0.6"/>
                   <path d="M 140,135 L 210,155" stroke="#f59e0b" stroke-width="3" fill="none"/>`;
  } else { // court
    shoePath = `M 70,165 Q 100,135 155,125 Q 210,122 250,110 Q 280,130 338,165 Q 285,178 190,178 Q 105,178 70,165 Z`;
    solePath = `M 66,165 Q 115,178 190,178 Q 295,178 338,165 L 342,182 Q 280,192 180,192 Q 100,192 64,180 Z`;
    detailLines = `<path d="M 150,140 Q 210,160 270,140" stroke="${accent}" stroke-width="4" fill="none" opacity="0.5"/>
                   <circle cx="210" cy="125" r="2.5" fill="#ffffff"/>
                   <circle cx="225" cy="120" r="2.5" fill="#ffffff"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="100%" height="100%">
    <defs>
      <radialGradient id="g_${themeIndex}" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${bg}" stop-opacity="0.95"/>
      </radialGradient>
      <filter id="shadow_${themeIndex}" x="-10%" y="-10%" width="130%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000000" flood-opacity="0.18"/>
      </filter>
    </defs>
    <rect width="400" height="260" rx="16" fill="url(#g_${themeIndex})"/>
    <ellipse cx="205" cy="204" rx="145" ry="16" fill="#000000" opacity="0.12" filter="blur(6px)"/>
    <g filter="url(#shadow_${themeIndex})">
      <path d="${shoePath}" fill="${primary}"/>
      <path d="${solePath}" fill="${secondary}" stroke="#cbd5e1" stroke-width="1.5"/>
      ${detailLines}
    </g>
    <text x="24" y="36" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1.5">${brand.toUpperCase()}</text>
    <text x="24" y="52" font-family="system-ui, sans-serif" font-size="10" font-weight="600" fill="#94a3b8">${type.toUpperCase()}</text>
  </svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const REVIEWS = [
  'Fits true to size and feels great all day. Very comfortable for daily Indian commute.',
  'Looks even better in person. Top notch build quality and genuine materials.',
  'Great value for money in INR. Sole has excellent grip and arch support.',
  'Runs true to UK size 8. Very stylish with jeans or joggers.',
  'Comfortable from day one with zero break-in period. Highly recommended!',
  'Colour and finish are premium. Breathable and perfect for Indian summer weather.'
];

const WHO = ['Maya', 'Rohan', 'Priya', 'Vikram', 'Ananya', 'Kabir', 'Farah', 'Rajesh'];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride');
  await Promise.all([User, Product, Review, Coupon, Order].map(m => m.deleteMany()));

  // 1. Admin account
  await User.create({
    name: 'Store Admin',
    email: 'admin@stride.dev',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    phone: '+91 98000 11223',
    address: 'Stride HQ, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038'
  });

  // 2. Indian customer accounts
  const customersData = [
    { name: 'Asha Rao', email: 'asha@example.com', line1: 'Flat 402, Shanti Niketan, 12th Main Indiranagar', city: 'Bengaluru', state: 'Karnataka', postalCode: '560038', phone: '+91 98765 43210' },
    { name: 'Rohan Sharma', email: 'rohan@example.com', line1: '15/B Marine Drive, Nariman Point', city: 'Mumbai', state: 'Maharashtra', postalCode: '400021', phone: '+91 98111 22334' },
    { name: 'Priya Patel', email: 'priya@example.com', line1: '7 C.G. Road, Navrangpura', city: 'Ahmedabad', state: 'Gujarat', postalCode: '380009', phone: '+91 98222 33445' },
    { name: 'Dev Patel', email: 'dev@example.com', line1: '44 Park Street, Mullick Bazar', city: 'Kolkata', state: 'West Bengal', postalCode: '700016', phone: '+91 98333 44556' },
    { name: 'Ananya Iyer', email: 'ananya@example.com', line1: '28 Anna Salai, T. Nagar', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600017', phone: '+91 98444 55667' },
    { name: 'Farah Ali', email: 'farah@example.com', line1: 'H-92 Connaught Place', city: 'New Delhi', state: 'Delhi', postalCode: '110001', phone: '+91 98555 66778' }
  ];

  const pw = bcrypt.hashSync('customer123', 10);
  const custs = await User.insertMany(customersData.map(c => ({
    name: c.name,
    email: c.email,
    passwordHash: pw,
    phone: c.phone,
    address: `${c.line1}, ${c.city}, ${c.state} ${c.postalCode}`,
    addresses: [{
      label: 'Home',
      name: c.name,
      phone: c.phone,
      line1: c.line1,
      line2: '',
      city: c.city,
      state: c.state,
      postalCode: c.postalCode,
      country: 'IN',
      isDefault: true
    }],
    settings: {
      theme: 'system',
      currency: 'INR',
      sizeSystem: 'UK',
      defaultSize: 8,
      emailPrefs: { orderUpdates: true, offers: true, backInStock: true }
    }
  })));

  // 3. Products in integer paise with realistic MRP and Selling Price (10-40% discount)
  const seen = new Set();
  let prods = [];
  const manifestPath = path.join(__dirname, '../seed_manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      prods = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch(e) { prods = []; }
  }
  if (!prods.length) {
    for (let i = 0; i < 60; i++) {
    const type = TYPES[i % 6];
    const pool = NOUN[type];
    const brand = BRANDS[i % 6];
    let name = `${ADJ[(i * 5) % 12]} ${pool[Math.floor(i / 6) % pool.length]}`;
    while (seen.has(name)) name += ' II';
    seen.add(name);

    const band = BANDS[type];
    const price = band.min + ((i * band.step) % (band.max - band.min + 1));
    const markupPct = 15 + ((i * 7) % 25); // 15% to 39% discount look
    const rawMrp = Math.round(price * (1 + markupPct / 100));
    const mrp = Math.max(price, Math.round(rawMrp / 10000) * 10000 - 100);

    const stock = i % 17 === 0 ? 0 : 4 + (i * 11) % 36;
    const imgIdx = (i % 3) + 1;
    const imgIdx2 = ((i + 1) % 3) + 1;
    const imgIdx3 = ((i + 2) % 3) + 1;

    const images = [
      {
        url: `/uploads/products/${type}_${imgIdx}.webp`,
        cardUrl: `/uploads/products/${type}_${imgIdx}_card.webp`,
        thumbUrl: `/uploads/products/${type}_${imgIdx}_thumb.webp`,
        alt: `${name} primary profile`,
        isCover: true,
        credit: 'Unsplash Photography',
        licence: 'Unsplash Free License'
      },
      {
        url: `/uploads/products/${type}_${imgIdx2}.webp`,
        cardUrl: `/uploads/products/${type}_${imgIdx2}_card.webp`,
        thumbUrl: `/uploads/products/${type}_${imgIdx2}_thumb.webp`,
        alt: `${name} alternate angle`,
        isCover: false,
        credit: 'Unsplash Photography',
        licence: 'Unsplash Free License'
      },
      {
        url: `/uploads/products/${type}_${imgIdx3}.webp`,
        cardUrl: `/uploads/products/${type}_${imgIdx3}_card.webp`,
        thumbUrl: `/uploads/products/${type}_${imgIdx3}_thumb.webp`,
        alt: `${name} lifestyle detail`,
        isCover: false,
        credit: 'Unsplash Photography',
        licence: 'Unsplash Free License'
      }
    ];

    const image = images[0].cardUrl;

    const colorways = [
      { name: 'Core Edition', hex: '#1e293b', imageIndex: 0 },
      { name: 'Contrast Edition', hex: '#e11d48', imageIndex: 1 },
      { name: 'Neutral Minimal', hex: '#94a3b8', imageIndex: 2 }
    ];

    const highlights = {
      upperMaterial: type === 'boot' || type === 'loafer' ? 'Full Grain Leather' : 'Engineered Breathable Mesh',
      soleMaterial: type === 'trail' ? 'High-Traction Lugged Vibram Compound' : 'Ultra-Responsive Cushioning EVA',
      closure: type === 'loafer' ? 'Slip-On' : 'Lace-Up with Metal Eyelets',
      fit: 'Standard UK Regular'
    };

    prods.push({
      name,
      brand,
      gender: ['men', 'women', 'unisex'][i % 3],
      type,
      mrp,
      price,
      stock,
      image,
      images,
      colorways,
      highlights,
      desc: DESC[type],
      featured: i % 8 === 0
    });
    }
  }

  const ps = await Product.insertMany(prods);

  // 4. Customer Reviews
  const revs = [];
  ps.forEach((p, i) => {
    for (let k = 0; k < 2 + (i % 3); k++) {
      revs.push({
        product: p.id,
        userName: WHO[(i + k) % WHO.length],
        rating: 3 + ((i * 3 + k * 5) % 3),
        body: REVIEWS[(i + k) % REVIEWS.length]
      });
    }
  });
  revs.forEach(r => r.rating = Math.min(5, Math.max(3, r.rating)));
  await Review.insertMany(revs);

  for (const p of ps) {
    const r = revs.filter(x => x.product === p.id);
    await Product.findByIdAndUpdate(p.id, {
      rating: +(r.reduce((s, x) => s + x.rating, 0) / r.length).toFixed(2),
      ratingCount: r.length
    });
  }

  // 5. Coupons in integer paise: percent with cap, flat ₹ off, and free shipping
  await Coupon.insertMany([
    { code: 'STRIDE10', type: 'percent', percent: 10, maxDiscount: 50000, minSpend: 149900, active: true },
    { code: 'WELCOME200', type: 'flat', amount: 20000, minSpend: 99900, active: true },
    { code: 'FREESHIP', type: 'shipping', minSpend: 0, active: true },
    { code: 'FESTIVE30', type: 'percent', percent: 30, maxDiscount: 150000, minSpend: 499900, active: true }
  ]);

  // 6. Orders in integer paise with UK sizes (5 to 11), timelines and structured addresses
  const statuses = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'delivered', 'cancelled'];
  const statusTimelines = {
    placed: [
      { status: 'placed', note: 'Order placed successfully (Cash on Delivery)' }
    ],
    confirmed: [
      { status: 'placed', note: 'Order placed successfully' },
      { status: 'confirmed', note: 'Order confirmed and inventory reserved' }
    ],
    packed: [
      { status: 'placed', note: 'Order placed successfully' },
      { status: 'confirmed', note: 'Order confirmed' },
      { status: 'packed', note: 'Packed at Bengaluru fulfillment hub' }
    ],
    shipped: [
      { status: 'placed', note: 'Order placed successfully' },
      { status: 'confirmed', note: 'Order confirmed' },
      { status: 'packed', note: 'Packed at fulfillment hub' },
      { status: 'shipped', note: 'Dispatched via BlueDart Express (AWB: BLR8941029)' }
    ],
    out_for_delivery: [
      { status: 'placed', note: 'Order placed successfully' },
      { status: 'confirmed', note: 'Order confirmed' },
      { status: 'packed', note: 'Packed at fulfillment hub' },
      { status: 'shipped', note: 'Dispatched via courier' },
      { status: 'out_for_delivery', note: 'Out for delivery with delivery agent Ravi Kumar' }
    ],
    delivered: [
      { status: 'placed', note: 'Order placed successfully' },
      { status: 'confirmed', note: 'Order confirmed' },
      { status: 'packed', note: 'Packed at fulfillment hub' },
      { status: 'shipped', note: 'Dispatched via courier' },
      { status: 'out_for_delivery', note: 'Out for delivery' },
      { status: 'delivered', note: 'Delivered to customer. Payment collected via Cash on Delivery.' }
    ],
    cancelled: [
      { status: 'placed', note: 'Order placed successfully' },
      { status: 'cancelled', note: 'Order cancelled by customer before dispatch' }
    ]
  };

  for (let i = 0; i < 48; i++) {
    const n = 1 + (i % 3);
    const lines = [];
    const u = custs[i % custs.length];
    const userAddr = u.addresses && u.addresses[0];
    let mrpTotal = 0;
    for (let k = 0; k < n; k++) {
      const p = ps[(i * 7 + k * 11) % ps.length];
      const qty = 1 + (k % 2);
      lines.push({
        product: p.id,
        name: p.name,
        size: 5 + ((i + k) % 7) * 0.5 + Math.floor((i + k) / 3),
        qty,
        unitPrice: p.price,
        price: p.price,
        mrp: p.mrp
      });
      mrpTotal += p.mrp * qty;
    }
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const discount = i % 5 === 0 ? Math.min(Math.round(subtotal * 0.1), 50000) : 0;
    const shipping = (subtotal - discount >= 149900) ? 0 : 9900;
    const tax = Math.round((subtotal - discount) * 18 / 118); // 18% GST included
    const total = subtotal - discount + shipping;
    const status = statuses[i % statuses.length];

    const orderDate = new Date(Date.now() - (i % 14) * 864e5 - i * 36e5);
    const estDelivery = new Date(orderDate.getTime() + (3 + (i % 3)) * 864e5);
    const timeline = (statusTimelines[status] || statusTimelines.placed).map((evt, idx) => ({
      status: evt.status,
      note: evt.note,
      ts: new Date(orderDate.getTime() + idx * 18e6)
    }));

    await Order.create({
      user: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone || '9876543210',
      address: userAddr ? `${userAddr.line1}, ${userAddr.city}, ${userAddr.state} ${userAddr.postalCode}` : u.address,
      addrLine1: userAddr ? userAddr.line1 : u.address,
      addrCity: userAddr ? userAddr.city : 'Bengaluru',
      addrState: userAddr ? userAddr.state : 'Karnataka',
      addrPin: userAddr ? userAddr.postalCode : '560001',
      lines,
      mrpTotal,
      subtotal,
      discount,
      shipping,
      tax,
      total,
      currency: 'INR',
      status,
      payment: 'cod',
      estimatedDelivery: estDelivery,
      timeline,
      createdAt: orderDate
    });

    if (status !== 'cancelled') {
      for (const l of lines) {
        await Product.findByIdAndUpdate(l.product, { $inc: { sold: l.qty } });
      }
    }
  }

  console.log(`Successfully seeded ${ps.length} shoes in integer paise (INR), ${revs.length} reviews, 48 orders.`);
  console.log('Admin login: admin@stride.dev / admin123');
  console.log('Customer login: asha@example.com / customer123');
  process.exit(0);
})();
