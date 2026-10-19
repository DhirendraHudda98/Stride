require('dotenv').config();
const path = require('path'), crypto = require('crypto'), express = require('express'), cors = require('cors'), mongoose = require('mongoose');
const jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');
const { generateSecret, generateURI, verifySync } = require('otplib');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const sharp = require('sharp');
const { User, Product, Review, Coupon, Order } = require('./models');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me', PROD = process.env.NODE_ENV === 'production';
const app = express(); app.use(cors(), express.json());
app.use(express.static(path.join(__dirname, '../public')));

const fail = (m, s = 400) => { const e = new Error(m); e.status = s; throw e; };
const wrap = fn => (req, res, next) => fn(req, res, next).catch(e => res.status(e.status || 400).json({ error: e.message }));
const sign = u => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' });
const parse = req => { try { return jwt.verify((req.get('authorization') || '').slice(7), SECRET); } catch { return null; } };
const optional = (req, _, next) => { req.auth = parse(req); next(); };
const needAuth = async (req, res, next) => {
  req.auth = parse(req);
  if (!req.auth) return res.status(401).json({ error: 'Please sign in first' });
  try {
    const u = await User.findById(req.auth.id).select('role blocked');
    if (!u || u.blocked) return res.status(401).json({ error: 'User session is invalid or user has been blocked' });
    req.userRole = u.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};
const needAdmin = async (req, res, next) => {
  req.auth = parse(req);
  if (!req.auth) return res.status(401).json({ error: 'Please sign in first' });
  try {
    const u = await User.findById(req.auth.id).select('role blocked');
    if (!u || u.blocked || u.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
    req.userRole = u.role;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Admins only' });
  }
};
const pub = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone || '',
  address: u.address || '',
  avatar: u.avatar || '',
  dob: u.dob || '',
  gender: u.gender || 'unspecified',
  addresses: u.addresses || [],
  settings: u.settings || {
    theme: 'system',
    currency: 'INR',
    sizeSystem: 'UK',
    defaultSize: 8,
    emailPrefs: { orderUpdates: true, offers: true, backInStock: true }
  },
  twoFactorEnabled: !!u.twoFactor?.enabled,
  sessions: (u.sessions || []).map(s => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, lastActive: s.lastActive })),
  wishlist: (u.wishlist || []).map(String)
});

// Auto-migrate legacy address string to address subdocument
async function ensureAddressMigration(u) {
  if (u && (!u.addresses || u.addresses.length === 0) && u.address) {
    u.addresses = [{
      label: 'Home',
      name: u.name || '',
      phone: u.phone || '',
      line1: u.address,
      line2: '',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'IN',
      isDefault: true
    }];
    await u.save();
  }
  return u;
}
const hits = new Map();   // tiny in-memory rate limiter for auth routes
const limit = (max, ms) => (req, res, next) => { const k = req.ip + req.path, n = Date.now(), a = (hits.get(k) || []).filter(t => n - t < ms);
  if (a.length >= max) return res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' }); a.push(n); hits.set(k, a); next(); };
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const formatINR = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: (paise % 100 === 0 ? 0 : 2) }).format((paise || 0) / 100);

const numberToWordsINR = (num) => {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const inWords = (n) => {
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
    return '';
  };
  num = Math.floor(num);
  if (num === 0) return 'Zero Rupees Only';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;
  let str = '';
  if (crore) str += inWords(crore) + ' Crore ';
  if (lakh) str += inWords(lakh) + ' Lakh ';
  if (thousand) str += inWords(thousand) + ' Thousand ';
  if (remainder) str += inWords(remainder);
  return str.trim() + ' Rupees Only';
};

const PIN_RULES = {
  '11': { city: 'New Delhi', state: 'Delhi', days: 2 },
  '12': { city: 'Gurugram / Haryana', state: 'Haryana', days: 2 },
  '20': { city: 'Noida / Ghaziabad', state: 'Uttar Pradesh', days: 2 },
  '40': { city: 'Mumbai', state: 'Maharashtra', days: 2 },
  '41': { city: 'Pune', state: 'Maharashtra', days: 3 },
  '56': { city: 'Bengaluru', state: 'Karnataka', days: 2 },
  '50': { city: 'Hyderabad', state: 'Telangana', days: 3 },
  '60': { city: 'Chennai', state: 'Tamil Nadu', days: 3 },
  '70': { city: 'Kolkata', state: 'West Bengal', days: 3 },
  '38': { city: 'Ahmedabad', state: 'Gujarat', days: 3 },
  '30': { city: 'Jaipur', state: 'Rajasthan', days: 3 }
};
const lookupPin = (pin) => {
  const p = String(pin || '').trim();
  if (!/^[1-9][0-9]{5}$/.test(p)) return null;
  const prefix = p.slice(0, 2);
  const info = PIN_RULES[prefix];
  const days = info ? info.days : 5;
  const est = new Date();
  est.setDate(est.getDate() + days);
  return {
    valid: true,
    pin: p,
    city: info ? info.city : 'All India',
    state: info ? info.state : 'India',
    deliveryDays: days,
    estimatedDate: est.toISOString(),
    codAvailable: true
  };
};

const eff = p => p.price;
const restock = o => Promise.all(o.lines.map(l => Product.findByIdAndUpdate(l.product, { $inc: { stock: l.qty, sold: -l.qty } })));
const rate = async pid => { const [a] = await Review.aggregate([{ $match: { product: new mongoose.Types.ObjectId(pid) } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  await Product.findByIdAndUpdate(pid, { rating: a ? +a.avg.toFixed(2) : 0, ratingCount: a ? a.n : 0 }); };

// ---- Auth + profile
app.post('/api/auth/register', limit(10, 9e5), wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    fail('Invalid input format');
  }
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !/^\S+@\S+\.\S+$/.test(cleanEmail)) fail('Enter your name and a valid email address');
  if (cleanName.length > 100 || cleanEmail.length > 255) fail('Input is too long');
  if (!password || password.length < 6 || password.length > 128) fail('Choose a password with at least 6 characters');
  if (await User.findOne({ email: cleanEmail })) fail('That email already has an account. Sign in instead.', 409);
  const u = await User.create({ name: cleanName, email: cleanEmail, passwordHash: bcrypt.hashSync(password, 10), role: 'customer' });
  res.status(201).json({ token: sign(u), user: pub(u) });
}));
app.post('/api/auth/login', limit(10, 9e5), wrap(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    fail('Invalid email or password', 401);
  }
  const cleanEmail = email.trim().toLowerCase();
  const u = await User.findOne({ email: cleanEmail });
  if (!u || !bcrypt.compareSync(password, u.passwordHash)) {
    fail('Invalid email or password', 401);
  }
  const k = req.ip + req.path;
  hits.delete(k);
  res.json({ token: sign(u), user: pub(u) });
}));
app.post('/api/auth/forgot', limit(5, 9e5), wrap(async (req, res) => {
  const u = await User.findOne({ email: String(req.body.email || '').toLowerCase() }); let token;
  if (u) { token = crypto.randomBytes(8).toString('hex'); u.resetHash = crypto.createHash('sha256').update(token).digest('hex'); u.resetExp = new Date(Date.now() + 18e5); await u.save();
    console.log(`[password reset] code for ${u.email}: ${token}  (connect an email service to send this)`); }
  res.json({ message: 'If that email has an account, a reset code has been created.', devToken: PROD ? undefined : token });
}));
app.post('/api/auth/reset', limit(10, 9e5), wrap(async (req, res) => {
  const { token, password } = req.body; if (!password || password.length < 6) fail('Choose a password with at least 6 characters');
  const u = await User.findOne({ resetHash: crypto.createHash('sha256').update(String(token || '')).digest('hex'), resetExp: { $gt: new Date() } });
  if (!u) fail('That reset code is wrong or has expired. Request a new one.');
  u.passwordHash = bcrypt.hashSync(password, 10); u.resetHash = u.resetExp = undefined; await u.save(); res.json({ ok: true });
}));
app.get('/api/auth/me', needAuth, wrap(async (req, res) => {
  let u = await User.findById(req.auth.id);
  if (!u) fail('Account not found', 401);
  u = await ensureAddressMigration(u);
  res.json(pub(u));
}));
app.put('/api/auth/me', needAuth, wrap(async (req, res) => {
  const { name, phone, address } = req.body;
  if (!name?.trim()) fail('Name cannot be empty');
  let u = await User.findByIdAndUpdate(req.auth.id, { name: name.trim(), phone: phone || '', address: address || '' }, { new: true });
  u = await ensureAddressMigration(u);
  res.json(pub(u));
}));
app.put('/api/auth/password', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id), { current, next } = req.body;
  if (!bcrypt.compareSync(current || '', u.passwordHash)) fail('Your current password is wrong', 401);
  if (!next || next.length < 6) fail('Choose a new password with at least 6 characters');
  u.passwordHash = bcrypt.hashSync(next, 10); await u.save(); res.json({ ok: true });
}));

// ---- Account Center APIs
app.get('/api/account/profile', needAuth, wrap(async (req, res) => {
  const u = await ensureAddressMigration(await User.findById(req.auth.id));
  if (!u) fail('Account not found', 401);
  res.json(pub(u));
}));

app.put('/api/account/profile', needAuth, wrap(async (req, res) => {
  const { name, phone, dob, gender, email, passwordForEmail } = req.body;
  const u = await User.findById(req.auth.id);
  if (!u) fail('Account not found', 401);
  if (name !== undefined) {
    if (!name.trim()) fail('Name cannot be empty');
    u.name = name.trim();
  }
  if (phone !== undefined) u.phone = String(phone).trim();
  if (dob !== undefined) u.dob = String(dob).trim();
  if (gender !== undefined && ['unspecified', 'men', 'women', 'other'].includes(gender)) u.gender = gender;
  if (email && email.toLowerCase() !== u.email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) fail('Please provide a valid email');
    if (!passwordForEmail || !bcrypt.compareSync(passwordForEmail, u.passwordHash)) {
      fail('Your current password is required to change your email address', 401);
    }
    const exist = await User.findOne({ email: email.toLowerCase() });
    if (exist && String(exist._id) !== u.id) fail('That email is already registered by another account', 409);
    u.email = email.toLowerCase();
  }
  await u.save();
  res.json(pub(u));
}));

app.post('/api/account/avatar', needAuth, wrap(async (req, res) => {
  const { avatar } = req.body;
  if (!avatar) fail('Avatar image URL or data required');
  const u = await User.findByIdAndUpdate(req.auth.id, { avatar }, { new: true });
  res.json({ avatar: u.avatar, user: pub(u) });
}));

// Postal code validator helper
const isValidPostal = (postal, country = 'IN') => {
  const p = String(postal || '').trim();
  if (!p) return false;
  if (country === 'IN') return /^\d{6}$/.test(p);
  if (country === 'US') return /^\d{5}(-\d{4})?$/.test(p);
  if (country === 'UK') return /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(p);
  if (country === 'CA') return /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(p);
  return p.length >= 3 && p.length <= 10;
};

// Addresses
app.get('/api/account/addresses', needAuth, wrap(async (req, res) => {
  const u = await ensureAddressMigration(await User.findById(req.auth.id));
  res.json(u.addresses || []);
}));

app.post('/api/account/addresses', needAuth, wrap(async (req, res) => {
  const { label, name, phone, line1, line2, city, state, postalCode, country = 'IN', isDefault } = req.body;
  if (!line1?.trim() || !city?.trim() || !postalCode?.trim()) fail('Street address, city, and postal code are required');
  if (!isValidPostal(postalCode, country)) fail(`Invalid postal code format for ${country}`);
  const u = await User.findById(req.auth.id);
  const shouldDefault = isDefault || u.addresses.length === 0;
  if (shouldDefault) u.addresses.forEach(a => a.isDefault = false);
  u.addresses.push({ label: label || 'Home', name: name || u.name, phone: phone || u.phone, line1: line1.trim(), line2: line2?.trim() || '', city: city.trim(), state: state?.trim() || '', postalCode: postalCode.trim(), country, isDefault: !!shouldDefault });
  await u.save();
  res.status(201).json(u.addresses);
}));

app.put('/api/account/addresses/:id', needAuth, wrap(async (req, res) => {
  const { label, name, phone, line1, line2, city, state, postalCode, country = 'IN', isDefault } = req.body;
  if (line1 !== undefined && !line1.trim()) fail('Street address cannot be empty');
  if (postalCode && !isValidPostal(postalCode, country)) fail(`Invalid postal code format for ${country}`);
  const u = await User.findById(req.auth.id);
  const addr = u.addresses.id(req.params.id);
  if (!addr) fail('Address not found', 404);
  if (isDefault) u.addresses.forEach(a => a.isDefault = false);
  if (label !== undefined) addr.label = label;
  if (name !== undefined) addr.name = name;
  if (phone !== undefined) addr.phone = phone;
  if (line1 !== undefined) addr.line1 = line1.trim();
  if (line2 !== undefined) addr.line2 = line2.trim();
  if (city !== undefined) addr.city = city.trim();
  if (state !== undefined) addr.state = state.trim();
  if (postalCode !== undefined) addr.postalCode = postalCode.trim();
  if (country !== undefined) addr.country = country;
  if (isDefault !== undefined) addr.isDefault = isDefault;
  await u.save();
  res.json(u.addresses);
}));

app.delete('/api/account/addresses/:id', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id);
  const addr = u.addresses.id(req.params.id);
  if (!addr) fail('Address not found', 404);
  const wasDefault = addr.isDefault;
  addr.deleteOne();
  if (wasDefault && u.addresses.length > 0) u.addresses[0].isDefault = true;
  await u.save();
  res.json(u.addresses);
}));

app.put('/api/account/addresses/:id/default', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id);
  const addr = u.addresses.id(req.params.id);
  if (!addr) fail('Address not found', 404);
  u.addresses.forEach(a => a.isDefault = (String(a._id) === req.params.id));
  await u.save();
  res.json(u.addresses);
}));

// Settings
app.put('/api/account/settings', needAuth, wrap(async (req, res) => {
  const { theme, currency, sizeSystem, defaultSize, emailPrefs } = req.body;
  const u = await User.findById(req.auth.id);
  u.settings = u.settings || {};
  if (theme && ['light', 'dark', 'system'].includes(theme)) u.settings.theme = theme;
  if (currency) u.settings.currency = currency;
  if (sizeSystem && ['US', 'UK', 'EU', 'IN'].includes(sizeSystem)) u.settings.sizeSystem = sizeSystem;
  if (defaultSize) u.settings.defaultSize = +defaultSize;
  if (emailPrefs && typeof emailPrefs === 'object') {
    u.settings.emailPrefs = { ...u.settings.emailPrefs, ...emailPrefs };
  }
  await u.save();
  res.json(u.settings);
}));

// Active Sessions
app.get('/api/account/sessions', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id);
  const currentIp = req.ip || '127.0.0.1';
  const ua = req.get('user-agent') || 'Browser';
  const list = u.sessions && u.sessions.length ? u.sessions : [
    { id: 'sess_cur', ip: currentIp, userAgent: ua, lastActive: new Date() }
  ];
  res.json(list);
}));

app.delete('/api/account/sessions', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id);
  u.sessions = [];
  await u.save();
  res.json({ message: 'Signed out of all other devices', sessions: [] });
}));

// Two-Factor Authentication (TOTP)
app.post('/api/account/2fa/setup', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id);
  const secret = generateSecret();
  u.twoFactor = { secret, enabled: false };
  await u.save();
  const otpauth = generateURI({ secret, label: u.email, issuer: 'Stride' });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
  res.json({ secret, qrCode: qrCodeDataUrl });
}));

app.post('/api/account/2fa/verify', needAuth, wrap(async (req, res) => {
  const { token } = req.body;
  if (!token) fail('Verification code is required');
  const u = await User.findById(req.auth.id);
  if (!u.twoFactor?.secret) fail('2FA setup has not been initiated', 400);
  const isValid = verifySync({ token: String(token).trim(), secret: u.twoFactor.secret });
  if (!isValid) fail('Invalid verification code. Please check your authenticator app and try again.', 400);
  u.twoFactor.enabled = true;
  await u.save();
  res.json({ ok: true, message: 'Two-factor authentication enabled successfully!' });
}));

app.post('/api/account/2fa/disable', needAuth, wrap(async (req, res) => {
  const { password, token } = req.body;
  const u = await User.findById(req.auth.id);
  if (!bcrypt.compareSync(password || '', u.passwordHash)) fail('Incorrect password', 401);
  if (u.twoFactor?.enabled && token) {
    if (!verifySync({ token: String(token).trim(), secret: u.twoFactor.secret })) {
      fail('Invalid 2FA code', 400);
    }
  }
  u.twoFactor = { secret: '', enabled: false };
  await u.save();
  res.json({ ok: true, message: 'Two-factor authentication disabled.' });
}));

// Download My Data (GDPR export)
app.get('/api/account/export', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id).populate('wishlist');
  const orders = await Order.find({ user: req.auth.id }).sort('-createdAt');
  const reviews = await Review.find({ user: req.auth.id });
  const data = {
    exportedAt: new Date().toISOString(),
    account: pub(u),
    orders,
    reviews,
    wishlist: u.wishlist
  };
  res.setHeader('Content-Disposition', `attachment; filename=stride_data_${u.id}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
}));

// Delete Account (Anonymize orders)
app.delete('/api/account', needAuth, wrap(async (req, res) => {
  const { email, password } = req.body;
  const u = await User.findById(req.auth.id);
  if (!u) fail('Account not found', 404);
  if (email.toLowerCase().trim() !== u.email) fail('Confirmation email does not match');
  if (!bcrypt.compareSync(password || '', u.passwordHash)) fail('Incorrect password', 401);
  
  // Anonymize user orders rather than deleting them
  await Order.updateMany(
    { user: u.id },
    { $set: { name: 'Deleted Customer', email: 'anonymized@deleted.stride.dev', address: 'Anonymized' } }
  );
  await Review.deleteMany({ user: u.id });
  await User.findByIdAndDelete(u.id);
  res.json({ ok: true, message: 'Your account has been deleted and orders anonymized.' });
}));

// In-App Notifications
app.get('/api/notifications', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id);
  const notifications = (u.notifications || []).sort((a, b) => b.createdAt - a.createdAt);
  const unreadCount = notifications.filter(n => !n.read).length;
  res.json({ notifications, unreadCount });
}));

app.patch('/api/notifications/read', needAuth, wrap(async (req, res) => {
  const { id } = req.body;
  const u = await User.findById(req.auth.id);
  if (id) {
    const notif = u.notifications.id(id);
    if (notif) notif.read = true;
  } else {
    // mark all as read
    u.notifications.forEach(n => n.read = true);
  }
  await u.save();
  const unreadCount = u.notifications.filter(n => !n.read).length;
  res.json({ ok: true, unreadCount, notifications: u.notifications });
}));

app.get('/api/wishlist', needAuth, wrap(async (req, res) => { const u = await User.findById(req.auth.id).populate('wishlist'); res.json(u.wishlist); }));
app.post('/api/wishlist/:id', needAuth, wrap(async (req, res) => {
  const u = await User.findById(req.auth.id), has = u.wishlist.some(x => String(x) === req.params.id);
  u.wishlist = has ? u.wishlist.filter(x => String(x) !== req.params.id) : [...u.wishlist, req.params.id]; await u.save(); res.json({ wishlist: u.wishlist.map(String) });
}));

// ---- Products (search, filters, sort, pagination)
app.get('/api/products/meta', wrap(async (_, res) => {
  const [m] = await Product.aggregate([{ $group: { _id: null, max: { $max: '$price' } } }]);
  res.json({ brands: (await Product.distinct('brand')).sort(), maxPrice: Math.ceil((m?.max || 999900) / 10000) * 10000 });
}));
// ---- Autocomplete endpoint – returns up to 8 lightweight suggestions
app.get('/api/products/autocomplete', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  const rx = new RegExp(esc(q), 'i');
  const f = { $or: [{ name: rx }, { brand: rx }, { type: rx }] };
  const hits = await Product.find(f, 'name brand type price mrp image images rating ratingCount').limit(8).lean();
  res.json(hits.map(d => ({
    id: String(d._id),
    name: d.name,
    brand: d.brand,
    type: d.type,
    price: d.price,
    mrp: d.mrp,
    rating: d.rating,
    ratingCount: d.ratingCount,
    thumb: (d.images && d.images[0]?.thumbUrl) || (d.images && d.images[0]?.cardUrl) || d.image || ''
  })));
}));

app.get('/api/products', wrap(async (req, res) => {
  const q = req.query, f = {}; if (q.search) f.name = new RegExp(esc(q.search), 'i');
  for (const k of ['type', 'brand', 'gender']) if (q[k]) f[k] = q[k];
  if (q.stock === '1') f.stock = { $gt: 0 }; if (q.featured === '1') f.featured = true;
  const cond = [];
  if (q.min) cond.push({ $gte: ['$price', +q.min] });
  if (q.max) cond.push({ $lte: ['$price', +q.max] });
  if (cond.length) f.$expr = { $and: cond };
  const sorts = { lo: { price: 1 }, hi: { price: -1 }, rating: { rating: -1, ratingCount: -1 }, new: { createdAt: -1 }, popular: { sold: -1 }, featured: { featured: -1, sold: -1 } };
  const limit = Math.min(+q.limit || 12, 200), page = Math.max(+q.page || 1, 1);
  const [r] = await Product.aggregate([{ $match: f }, { $sort: { ...(sorts[q.sort] || sorts.featured), _id: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } }]);
  const total = r.total[0]?.n || 0;
  res.json({ items: r.items.map(d => ({ ...d, id: String(d._id), _id: undefined, __v: undefined })), total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}));
app.get('/api/products/:id', wrap(async (req, res) => {
  const p = await Product.findById(req.params.id);
  if (!p) fail('Product not found', 404);
  res.json({ ...p.toObject(), id: String(p._id), _id: undefined, __v: undefined });
}));

app.get('/api/products/:id/reviews', wrap(async (req, res) => res.json(await Review.find({ product: req.params.id }).sort('-createdAt').limit(50))));
app.post('/api/products/:id/reviews', needAuth, wrap(async (req, res) => {
  const rating = Math.round(+req.body.rating); if (!(rating >= 1 && rating <= 5)) fail('Choose a rating from 1 to 5 stars');
  const u = await User.findById(req.auth.id);
  await Review.findOneAndUpdate({ product: req.params.id, user: u.id }, { userName: u.name, rating, body: String(req.body.body || '').slice(0, 600) }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await rate(req.params.id); res.status(201).json({ ok: true });
}));
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG and WebP images are allowed'));
    } else {
      cb(null, true);
    }
  }
});

// Helper: 64-bit dHash for perceptual similarity check
async function computeDHashBuffer(buf) {
  try {
    const { data } = await sharp(buf).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    let hash = '';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) hash += (data[r * 9 + c] > data[r * 9 + c + 1] ? '1' : '0');
    }
    return hash;
  } catch (e) { return null; }
}

function hamming(h1, h2) {
  if (!h1 || !h2 || h1.length !== h2.length) return 999;
  let d = 0; for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) d++;
  return d;
}

// Admin Image Upload with Duplicate & Near-Duplicate Rejection
app.post('/api/admin/images/upload', needAdmin, upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) fail('No image file uploaded');
  const buf = req.file.buffer;
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) fail('Corrupted or invalid image file');
  if (Math.max(meta.width, meta.height) < 1000) fail('Image must be at least 1000 px on the long side');

  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const dhash = await computeDHashBuffer(buf);

  // Check across all existing products for duplicate or near-duplicate
  const allProds = await Product.find({}, 'name image images').lean();
  for (const p of allProds) {
    const imgs = p.images || [];
    for (const im of imgs) {
      if (im.sha256 === sha) {
        fail(`This photo is already used on '${p.name}'. Choose a different photo.`);
      }
      if (im.dhash && dhash && hamming(im.dhash, dhash) <= 8) {
        fail(`This photo is visually too similar to an existing photo on '${p.name}'. Choose a different photo.`);
      }
    }
  }

  // Save unique image to disk in WebP format
  const outName = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.webp`;
  const uploadDir = path.join(__dirname, '../public/uploads/products');
  fs.mkdirSync(uploadDir, { recursive: true });
  await sharp(buf).resize(1200, 1200, { fit: 'cover' }).webp({ quality: 84 }).toFile(path.join(uploadDir, outName));

  res.status(201).json({
    url: `/uploads/products/${outName}`,
    sha256: sha,
    dhash,
    width: 1200,
    height: 1200
  });
}));

app.post('/api/products', needAdmin, wrap(async (req, res) => {
  const { name, brand, gender, type, mrp, price, stock, image, images, desc, featured } = req.body;
  const pMRP = Math.round(+mrp);
  const pPrice = Math.round(+price);
  if (!pMRP || pMRP <= 0) fail('MRP must be greater than zero');
  if (!pPrice || pPrice <= 0) fail('Price must be greater than zero');
  if (pPrice > pMRP) fail('Selling price cannot exceed MRP');

  // Publish gate: at least 3 images, cover image, and alt text
  const imgList = Array.isArray(images) && images.length ? images : (image ? [{ url: image, alt: name, isCover: true }] : []);
  if (imgList.length < 3) fail('Publish gate: Every product requires at least 3 distinct images');
  if (!imgList.some(im => im.isCover || im.url === image)) fail('Publish gate: Product must have a cover image');

  res.status(201).json(await Product.create({
    name, brand, gender, type, mrp: pMRP, price: pPrice, stock: Math.max(0, +stock || 0),
    image: image || imgList[0].url,
    images: imgList,
    desc: desc || '',
    featured: !!featured
  }));
}));

app.put('/api/products/:id', needAdmin, wrap(async (req, res) => {
  const body = { ...req.body };
  if (body.mrp !== undefined) body.mrp = Math.round(+body.mrp);
  if (body.price !== undefined) body.price = Math.round(+body.price);
  if (body.mrp !== undefined && body.price !== undefined && body.price > body.mrp) fail('Selling price cannot exceed MRP');
  if (body.images && Array.isArray(body.images) && body.images.length < 3) fail('Product must have at least 3 distinct photos to remain published');
  res.json(await Product.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }));
}));

app.delete('/api/products/:id', needAdmin, wrap(async (req, res) => res.json(await Product.findByIdAndDelete(req.params.id))));

// ---- Coupons + orders (all values in integer paise, payments collected on delivery)
app.get('/api/coupons/:code', wrap(async (req, res) => {
  const c = await Coupon.findOne({ code: req.params.code.toUpperCase(), active: true });
  if (!c) fail('That coupon code is not valid', 404);
  const subtotal = req.query.subtotal !== undefined ? +req.query.subtotal : null;
  if (subtotal !== null && subtotal < c.minSpend) {
    fail(`This coupon needs a minimum order value of ${formatINR(c.minSpend)}`);
  }
  let discountForSubtotal = 0;
  if (subtotal !== null) {
    if (c.type === 'percent') {
      discountForSubtotal = Math.round((subtotal * c.percent) / 100);
      if (c.maxDiscount && discountForSubtotal > c.maxDiscount) discountForSubtotal = c.maxDiscount;
    } else if (c.type === 'flat') {
      discountForSubtotal = Math.min(c.amount || 0, subtotal);
    }
  }
  res.json({
    code: c.code,
    type: c.type,
    percent: c.percent,
    amount: c.amount,
    maxDiscount: c.maxDiscount,
    minSpend: c.minSpend,
    discountForSubtotal
  });
}));

app.get('/api/pincode/:pin', (req, res) => {
  const result = lookupPin(req.params.pin);
  if (!result) return res.status(400).json({ error: 'Please enter a valid 6-digit Indian PIN code' });
  res.json(result);
});

app.post('/api/orders', optional, wrap(async (req, res) => {
  const { name, email, phone, address, addrLine1, addrLine2, addrCity, addrState, addrPin, lines, coupon } = req.body;
  const fullAddress = address || [addrLine1, addrLine2, addrCity, addrState, addrPin].filter(Boolean).join(', ');
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || !fullAddress || !Array.isArray(lines) || !lines.length) {
    fail('Name, a valid email, delivery address, and at least one item are required');
  }
  const taken = [], items = []; let subtotal = 0, mrpTotal = 0;
  try {
    for (const l of lines) {
      const qty = Math.floor(+l.qty), size = +l.size;
      if (!(qty > 0) || !size) fail('Each item needs a size and a quantity');
      const p = await Product.findOneAndUpdate({ _id: l.id, stock: { $gte: qty } }, { $inc: { stock: -qty, sold: qty } });
      if (!p) fail('An item is sold out or no longer available. Refresh and try again.');
      taken.push({ id: p.id, qty });
      items.push({ product: p.id, name: p.name, size, qty, unitPrice: p.price, price: p.price, mrp: p.mrp || p.price });
      subtotal += p.price * qty;
      mrpTotal += (p.mrp || p.price) * qty;
    }
    let discount = 0, code;
    let freeShippingCoupon = false;
    if (coupon) {
      const c = await Coupon.findOne({ code: String(coupon).toUpperCase(), active: true });
      if (!c) fail('That coupon code is not valid');
      if (subtotal < c.minSpend) fail(`This coupon needs a minimum order value of ${formatINR(c.minSpend)}`);
      code = c.code;
      if (c.type === 'shipping') {
        freeShippingCoupon = true;
      } else if (c.type === 'flat') {
        discount = Math.min(c.amount || 0, subtotal);
      } else {
        discount = Math.round(subtotal * (c.percent || 0) / 100);
        if (c.maxDiscount && c.maxDiscount > 0) discount = Math.min(discount, c.maxDiscount);
      }
    }
    let shipping = (subtotal - discount >= 149900 || freeShippingCoupon) ? 0 : 9900;
    const tax = Math.round((subtotal - discount) * 18 / 118);
    const total = subtotal - discount + shipping;

    const pinInfo = addrPin ? lookupPin(addrPin) : null;
    const deliveryDays = pinInfo ? pinInfo.deliveryDays : 5;
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + deliveryDays);

    const initialTimeline = [{
      status: 'placed',
      note: 'Order placed successfully (Cash on Delivery)',
      ts: new Date()
    }];

    const newOrder = await Order.create({
      user: req.auth?.id,
      name, email,
      phone: phone || '',
      address: fullAddress,
      addrLine1: addrLine1 || '',
      addrLine2: addrLine2 || '',
      addrCity: addrCity || '',
      addrState: addrState || '',
      addrPin: addrPin || '',
      lines: items,
      coupon: code,
      mrpTotal, subtotal, discount, shipping, tax, total,
      currency: 'INR',
      status: 'placed',
      payment: 'cod',
      estimatedDelivery: estDate,
      timeline: initialTimeline
    });

    res.status(201).json(newOrder);
  } catch (e) {
    for (const t of taken) await Product.findByIdAndUpdate(t.id, { $inc: { stock: t.qty, sold: -t.qty } });
    throw e;
  }
}));

app.get('/api/orders/mine', needAuth, wrap(async (req, res) => res.json(await Order.find({ user: req.auth.id }).sort('-createdAt'))));

app.patch('/api/orders/:id/cancel', needAuth, wrap(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o || String(o.user) !== req.auth.id) fail('Order not found', 404);
  if (['shipped', 'out_for_delivery', 'delivered', 'cancelled'].includes(o.status)) {
    fail('Only orders that have not shipped can be cancelled');
  }
  o.status = 'cancelled';
  o.timeline = o.timeline || [];
  o.timeline.push({ status: 'cancelled', note: 'Order cancelled by customer', ts: new Date() });
  await restock(o);
  res.json(await o.save());
}));

// Printable GST Tax Invoice PDF generator
app.get('/api/orders/:id/invoice', optional, wrap(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) fail('Order not found', 404);
  if (req.auth && req.auth.role !== 'admin' && String(o.user) !== req.auth.id) {
    fail('Unauthorized', 403);
  }

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const filename = `Invoice-${o.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text('STRIDE FOOTWEAR', 40, 40);
  doc.fontSize(9).font('Helvetica').fillColor('#555555')
    .text('Stride Lifestyle India Pvt Ltd', 40, 65)
    .text('124 Indiranagar 100ft Road, Bengaluru, Karnataka - 560038', 40, 78)
    .text('GSTIN: 29AAAAA0000A1Z5 | HSN Code: 6403 (Footwear)', 40, 91)
    .text('Support: support@stride.in | www.stride.in', 40, 104);

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#111111')
    .text('TAX INVOICE', 380, 40, { align: 'right' });
  doc.fontSize(9).font('Helvetica').fillColor('#333333')
    .text(`Invoice #: INV-${o.id.slice(-8).toUpperCase()}`, 380, 65, { align: 'right' })
    .text(`Order Date: ${new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, 380, 78, { align: 'right' })
    .text(`Payment Mode: ${(o.payment || 'cod').toUpperCase()}`, 380, 91, { align: 'right' })
    .text(`Status: ${o.status.toUpperCase()}`, 380, 104, { align: 'right' });

  doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, 125).lineTo(555, 125).stroke();

  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111111').text('BILLED TO / DELIVER TO:', 40, 138);
  doc.fontSize(9).font('Helvetica').fillColor('#333333')
    .text(o.name || 'Valued Customer', 40, 153)
    .text(o.address || '', 40, 166, { width: 300 })
    .text(`Phone: ${o.phone || 'N/A'} | Email: ${o.email || 'N/A'}`, 40, 192);

  doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(40, 215).lineTo(555, 215).stroke();

  let y = 225;
  doc.rect(40, y, 515, 22).fill('#f3f4f6');
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#111111')
    .text('#', 45, y + 6)
    .text('ITEM DESCRIPTION', 65, y + 6)
    .text('SIZE', 230, y + 6)
    .text('HSN', 270, y + 6)
    .text('QTY', 315, y + 6)
    .text('MRP', 345, y + 6)
    .text('UNIT (₹)', 410, y + 6)
    .text('AMOUNT (₹)', 480, y + 6, { align: 'right', width: 70 });

  y += 26;
  doc.font('Helvetica').fontSize(8).fillColor('#222222');
  o.lines.forEach((l, idx) => {
    const itemTotal = (l.price * l.qty / 100).toFixed(2);
    const unitP = (l.price / 100).toFixed(2);
    const mrp = ((l.mrp || l.price) / 100).toFixed(2);
    doc.text(String(idx + 1), 45, y)
       .text(l.name, 65, y, { width: 160 })
       .text(`UK ${l.size}`, 230, y)
       .text('6403', 270, y)
       .text(String(l.qty), 315, y)
       .text(`₹${mrp}`, 345, y)
       .text(`₹${unitP}`, 410, y)
       .text(`₹${itemTotal}`, 480, y, { align: 'right', width: 70 });
    y += 20;
  });

  doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, y + 5).lineTo(555, y + 5).stroke();
  y += 15;

  const taxableVal = Math.round((o.subtotal - o.discount) * 100 / 118);
  const totalGst = (o.subtotal - o.discount) - taxableVal;
  const halfGst = Math.round(totalGst / 2);

  doc.fontSize(8).font('Helvetica').fillColor('#555555')
    .text('GST Rate: 18% inclusive (CGST 9% + SGST 9%)', 40, y)
    .text(`Taxable Value: ₹${(taxableVal / 100).toFixed(2)}`, 40, y + 14)
    .text(`CGST (9%): ₹${(halfGst / 100).toFixed(2)}`, 40, y + 28)
    .text(`SGST (9%): ₹${(halfGst / 100).toFixed(2)}`, 40, y + 42)
    .text(`Total Tax (18%): ₹${(totalGst / 100).toFixed(2)}`, 40, y + 56);

  const rightX = 350, valX = 475;
  doc.fontSize(9).font('Helvetica').fillColor('#333333')
    .text('MRP Total:', rightX, y)
    .text(`₹${((o.mrpTotal || o.subtotal) / 100).toFixed(2)}`, valX, y, { align: 'right', width: 80 });

  y += 14;
  doc.text('Selling Subtotal:', rightX, y)
    .text(`₹${(o.subtotal / 100).toFixed(2)}`, valX, y, { align: 'right', width: 80 });

  if (o.discount > 0) {
    y += 14;
    doc.text(`Discount (${o.coupon || 'Promo'}):`, rightX, y)
      .text(`-₹${(o.discount / 100).toFixed(2)}`, valX, y, { align: 'right', width: 80 });
  }

  y += 14;
  doc.text('Delivery Fee:', rightX, y)
    .text(o.shipping === 0 ? 'FREE' : `₹${(o.shipping / 100).toFixed(2)}`, valX, y, { align: 'right', width: 80 });

  y += 16;
  doc.rect(rightX - 5, y - 3, 210, 22).fill('#f9fafb');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#059669')
    .text('Total Payable:', rightX, y + 2)
    .text(`₹${(o.total / 100).toFixed(2)}`, valX, y + 2, { align: 'right', width: 80 });

  y += 35;
  const inWords = numberToWordsINR(o.total / 100);
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#111111')
    .text(`Amount in Words: ${inWords}`, 40, y);

  y += 30;
  doc.fontSize(7).font('Helvetica').fillColor('#777777')
    .text('Declaration: This is a computer-generated tax invoice and requires no signature.', 40, y)
    .text('Thank you for shopping with Stride Footwear!', 40, y + 12);

  doc.end();
}));

// ---- Admin
app.get('/api/admin/orders', needAdmin, wrap(async (_, res) => res.json(await Order.find().sort('-createdAt').limit(200))));

app.patch('/api/admin/orders/:id', needAdmin, wrap(async (req, res) => {
  const o = await Order.findById(req.params.id);
  if (!o) fail('Order not found', 404);
  const next = req.body.status;
  if (!Order.schema.path('status').enumValues.includes(next)) fail('Unknown status');
  if (o.status === 'cancelled') fail('A cancelled order cannot be reopened');
  if (next === 'cancelled') await restock(o);

  o.status = next;
  o.timeline = o.timeline || [];
  const statusLabels = {
    placed: 'Order placed',
    confirmed: 'Order confirmed and verified',
    packed: 'Packed at fulfillment center',
    shipped: 'Handed over to courier partner',
    out_for_delivery: 'Out for delivery to your address',
    delivered: 'Delivered successfully',
    cancelled: 'Order cancelled'
  };
  o.timeline.push({
    status: next,
    note: req.body.note || statusLabels[next] || `Status updated to ${next}`,
    ts: new Date()
  });

  res.json(await o.save());
}));

app.get('/api/admin/customers', needAdmin, wrap(async (_, res) => {
  const us = await User.find({ role: 'customer' }).sort('-createdAt');
  const agg = await Order.aggregate([{ $match: { user: { $ne: null }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' } } }]);
  const m = Object.fromEntries(agg.map(a => [String(a._id), a]));
  res.json(us.map(u => ({ ...pub(u), createdAt: u.createdAt, orders: m[u.id]?.orders || 0, spent: m[u.id]?.spent || 0 })));
}));
app.get('/api/admin/coupons', needAdmin, wrap(async (_, res) => res.json(await Coupon.find().sort('code'))));
app.post('/api/admin/coupons', needAdmin, wrap(async (req, res) => {
  const { code, type = 'percent', percent, amount, maxDiscount, minSpend } = req.body;
  res.status(201).json(await Coupon.create({
    code: code.trim().toUpperCase(),
    type,
    percent: percent ? +percent : undefined,
    amount: amount ? Math.round(+amount) : 0,
    maxDiscount: maxDiscount ? Math.round(+maxDiscount) : 0,
    minSpend: minSpend ? Math.round(+minSpend) : 0,
    active: true
  }));
}));
app.patch('/api/admin/coupons/:id', needAdmin, wrap(async (req, res) => res.json(await Coupon.findByIdAndUpdate(req.params.id, { active: !!req.body.active }, { new: true }))));
app.delete('/api/admin/coupons/:id', needAdmin, wrap(async (req, res) => res.json(await Coupon.findByIdAndDelete(req.params.id))));
app.get('/api/admin/stats', needAdmin, wrap(async (_, res) => {
  const live = { status: { $ne: 'cancelled' } };
  const [t] = await Order.aggregate([{ $match: live }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]);
  const since = new Date(Date.now() - 6 * 864e5); since.setHours(0, 0, 0, 0);
  const recent = await Order.find({ ...live, createdAt: { $gte: since } }).select('total createdAt');
  const byDay = [...Array(7)].map((_, i) => { const d = new Date(since.getTime() + i * 864e5);
    return { day: d.toLocaleDateString('en', { weekday: 'short' }), total: recent.filter(o => o.createdAt.toDateString() === d.toDateString()).reduce((s, o) => s + o.total, 0) }; });
  const top = await Order.aggregate([{ $match: live }, { $unwind: '$lines' }, { $group: { _id: '$lines.name', qty: { $sum: '$lines.qty' } } }, { $sort: { qty: -1 } }, { $limit: 5 }]);
  res.json({ revenue: t?.revenue || 0, orders: t?.orders || 0, aov: t && t.orders ? Math.round(t.revenue / t.orders) : 0, products: await Product.countDocuments(),
    lowStock: await Product.countDocuments({ stock: { $lt: 8 } }), lowList: await Product.find({ stock: { $lt: 8 } }).sort('stock').limit(8).select('name stock'),
    customers: await User.countDocuments({ role: 'customer' }), byDay, top: top.map(x => ({ name: x._id, qty: x.qty })) });
}));

app.use('/api', (_, res) => res.status(404).json({ error: 'Not found' }));
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stride')
    .then(() => app.listen(process.env.PORT || 4000, () => console.log('Stride running on http://localhost:' + (process.env.PORT || 4000))))
    .catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
}

module.exports = { app, mongoose };
