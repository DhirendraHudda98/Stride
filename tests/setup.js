const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app } = require('../server/index');
const { User, Product, Review, Coupon, Order } = require('../server/models');

const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/stride_test';
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

let tokens = {};
let testProducts = [];
let testCoupons = [];

async function setupTestDb() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(TEST_DB_URI);
  }
  await resetTestDb();
}

async function resetTestDb() {
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Review.deleteMany({}),
    Coupon.deleteMany({}),
    Order.deleteMany({})
  ]);

  // 1. Admin
  const admin = await User.create({
    name: 'Store Admin',
    email: 'admin@stride.dev',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    phone: '+91 98000 11223',
    address: 'Stride HQ, Indiranagar, Bengaluru'
  });

  // 2. Customer 1 (Asha)
  const cust1 = await User.create({
    name: 'Asha Rao',
    email: 'asha@example.com',
    passwordHash: bcrypt.hashSync('customer123', 10),
    role: 'customer',
    phone: '+91 98765 43210',
    address: 'Flat 402, Indiranagar, Bengaluru, Karnataka 560038',
    addresses: [{
      label: 'Home',
      name: 'Asha Rao',
      phone: '+91 98765 43210',
      line1: 'Flat 402, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      country: 'IN',
      isDefault: true
    }]
  });

  // 3. Customer 2 (Rohan)
  const cust2 = await User.create({
    name: 'Rohan Sharma',
    email: 'rohan@example.com',
    passwordHash: bcrypt.hashSync('customer123', 10),
    role: 'customer',
    phone: '+91 98111 22334',
    address: '15/B Marine Drive, Mumbai, Maharashtra 400021'
  });

  // 4. Blocked User
  const blocked = await User.create({
    name: 'Blocked User',
    email: 'blocked@example.com',
    passwordHash: bcrypt.hashSync('blocked123', 10),
    role: 'customer',
    blocked: true
  });

  tokens = {
    admin: jwt.sign({ id: String(admin._id), role: 'admin' }, TEST_JWT_SECRET, { expiresIn: '1d' }),
    cust1: jwt.sign({ id: String(cust1._id), role: 'customer' }, TEST_JWT_SECRET, { expiresIn: '1d' }),
    cust2: jwt.sign({ id: String(cust2._id), role: 'customer' }, TEST_JWT_SECRET, { expiresIn: '1d' }),
    blocked: jwt.sign({ id: String(blocked._id), role: 'customer' }, TEST_JWT_SECRET, { expiresIn: '1d' }),
    adminUser: admin,
    cust1User: cust1,
    cust2User: cust2
  };

  // 5. Sample Products
  testProducts = await Product.insertMany([
    {
      name: 'Aero Sprint Runner',
      brand: 'Stride',
      type: 'runner',
      gender: 'men',
      mrp: 499900,
      price: 349900,
      stock: 10,
      sizes: [7, 8, 9, 10],
      images: [
        { url: '/uploads/products/runner_1.webp', isCover: true, alt: 'Front profile' },
        { url: '/uploads/products/runner_2.webp', isCover: false, alt: 'Side profile' },
        { url: '/uploads/products/runner_3.webp', isCover: false, alt: 'Sole view' }
      ],
      desc: 'High-rebound road running shoe.'
    },
    {
      name: 'Classic Court Tennis',
      brand: 'Red Tape',
      type: 'court',
      gender: 'unisex',
      mrp: 399900,
      price: 249900,
      stock: 1, // Only 1 in stock for race condition test!
      sizes: [6, 7, 8, 9],
      images: [
        { url: '/uploads/products/court_1.webp', isCover: true, alt: 'Front' },
        { url: '/uploads/products/court_2.webp', isCover: false, alt: 'Side' },
        { url: '/uploads/products/court_3.webp', isCover: false, alt: 'Back' }
      ],
      desc: 'Durable court sneaker.'
    },
    {
      name: 'Sold Out Trail Shoe',
      brand: 'Woodland',
      type: 'trail',
      gender: 'men',
      mrp: 599900,
      price: 449900,
      stock: 0,
      sizes: [8, 9],
      images: [
        { url: '/uploads/products/trail_1.webp', isCover: true, alt: 'Cover' },
        { url: '/uploads/products/trail_2.webp', isCover: false, alt: 'Side' },
        { url: '/uploads/products/trail_3.webp', isCover: false, alt: 'Lug sole' }
      ],
      desc: 'All-terrain shoe (sold out).'
    }
  ]);

  // 6. Sample Coupons
  testCoupons = await Coupon.insertMany([
    { code: 'STRIDE10', type: 'percent', percent: 10, maxDiscount: 50000, minSpend: 149900, active: true },
    { code: 'WELCOME200', type: 'flat', amount: 20000, minSpend: 99900, active: true },
    { code: 'FREESHIP', type: 'shipping', minSpend: 0, active: true },
    { code: 'EXPIRED10', type: 'percent', percent: 10, active: false }
  ]);

  return { tokens, testProducts, testCoupons };
}

async function teardownTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  app,
  request: request(app),
  rawRequest: request,
  setupTestDb,
  resetTestDb,
  teardownTestDb,
  getTokens: () => tokens,
  getProducts: () => testProducts,
  getCoupons: () => testCoupons,
  models: { User, Product, Review, Coupon, Order },
  SECRET: TEST_JWT_SECRET
};
