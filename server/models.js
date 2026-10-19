const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;
const opts = { timestamps: true, toJSON: { versionKey: false, transform: (_, r) => { r.id = String(r._id); delete r._id; delete r.passwordHash; delete r.resetHash; delete r.resetExp; } } };
const TYPES = ['runner', 'court', 'hightop', 'boot', 'loafer', 'trail'];

const AddressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  line1: { type: String, required: true },
  line2: { type: String, default: '' },
  city: { type: String, required: true },
  state: { type: String, default: '' },
  postalCode: { type: String, required: true },
  country: { type: String, default: 'IN' },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin', 'staff'], default: 'customer' },
  blocked: { type: Boolean, default: false },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  avatar: { type: String, default: '' },
  dob: { type: String, default: '' },
  gender: { type: String, enum: ['unspecified', 'men', 'women', 'other'], default: 'unspecified' },
  addresses: [AddressSchema],
  settings: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    currency: { type: String, default: 'INR' },
    sizeSystem: { type: String, enum: ['US', 'UK', 'EU', 'IN'], default: 'UK' },
    defaultSize: { type: Number, default: 8 },
    emailPrefs: {
      orderUpdates: { type: Boolean, default: true },
      offers: { type: Boolean, default: true },
      backInStock: { type: Boolean, default: true }
    }
  },
  twoFactor: {
    secret: { type: String, default: '' },
    enabled: { type: Boolean, default: false }
  },
  sessions: [{
    id: { type: String, required: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    lastActive: { type: Date, default: Date.now }
  }],
  notifications: [{
    title: { type: String, required: true },
    message: { type: String, default: '' },
    read: { type: Boolean, default: false },
    link: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],
  wishlist: [{ type: ObjectId, ref: 'Product' }],
  resetHash: String, resetExp: Date
}, opts));

// Available UK shoe sizes (India uses UK sizing standard)
const DEFAULT_SIZES = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11];

const ProductImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  thumbUrl: { type: String, default: '' },
  cardUrl: { type: String, default: '' },
  blurDataUrl: { type: String, default: '' },
  sha256: { type: String, default: '' },
  dhash: { type: String, default: '' },
  alt: { type: String, default: 'Shoe photo' },
  isCover: { type: Boolean, default: false },
  credit: { type: String, default: 'Stride Studio' },
  sourceUrl: { type: String, default: '' },
  licence: { type: String, default: 'Commercial' },
  width: { type: Number, default: 1200 },
  height: { type: Number, default: 1200 }
}, { _id: false });

const ColorwaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  hex: { type: String, default: '#000000' },
  imageIndex: { type: Number, default: 0 }
}, { _id: false });

const Product = mongoose.model('Product', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  brand: { type: String, default: 'Stride', trim: true },
  gender: { type: String, enum: ['men', 'women', 'unisex'], default: 'unisex' },
  type: { type: String, enum: TYPES, default: 'runner' },
  mrp: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 1 },
  stock: { type: Number, default: 0, min: 0 }, sold: { type: Number, default: 0 },
  sizes: { type: [Number], default: () => [...DEFAULT_SIZES] }, // UK sizes available
  image: { type: String, default: '' }, // primary cover image URL
  images: { type: [ProductImageSchema], default: () => [] },
  colorways: { type: [ColorwaySchema], default: () => [] },
  highlights: {
    upperMaterial: { type: String, default: 'Breathable Mesh & Synthetic Leather' },
    soleMaterial: { type: String, default: 'High-traction responsive EVA Rubber' },
    closure: { type: String, default: 'Lace-Up' },
    fit: { type: String, default: 'Regular UK Fit' }
  },
  desc: { type: String, default: '' },
  rating: { type: Number, default: 0 }, ratingCount: { type: Number, default: 0 },
  featured: { type: Boolean, default: false }
}, opts));

const Review = mongoose.model('Review', new mongoose.Schema({
  product: { type: ObjectId, ref: 'Product', index: true }, user: { type: ObjectId, ref: 'User' }, userName: String,
  rating: { type: Number, min: 1, max: 5, required: true }, body: { type: String, default: '', maxlength: 600 }
}, opts));

const Coupon = mongoose.model('Coupon', new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ['percent', 'flat', 'shipping'], default: 'percent' },
  percent: { type: Number, min: 1, max: 90 },
  amount: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 },
  minSpend: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
}, opts));

const TimelineEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  note: { type: String, default: '' },
  ts: { type: Date, default: Date.now }
}, { _id: false });

const Order = mongoose.model('Order', new mongoose.Schema({
  user: { type: ObjectId, ref: 'User' }, name: String, email: String,
  phone: { type: String, default: '' },
  address: String, payment: { type: String, default: 'cod' },
  currency: { type: String, default: 'INR' },
  addrLine1: { type: String, default: '' },
  addrLine2: { type: String, default: '' },
  addrCity:  { type: String, default: '' },
  addrState: { type: String, default: '' },
  addrPin:   { type: String, default: '' },
  lines: [{ product: ObjectId, name: String, size: Number, qty: Number, unitPrice: Number, price: Number, mrp: Number }],
  mrpTotal: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  coupon: { type: String, default: '' },
  shipping: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, required: true },
  estimatedDelivery: { type: Date },
  status: { type: String, enum: ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'], default: 'placed' },
  timeline: { type: [TimelineEventSchema], default: () => [{ status: 'placed', note: 'Order placed successfully', ts: new Date() }] }
}, opts));

module.exports = { User, Product, Review, Coupon, Order, TYPES, DEFAULT_SIZES };
