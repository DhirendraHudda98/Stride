# Stride – shoe store (Node + Express + MongoDB + Three.js)

A complete store with no payment gateway: orders are placed directly and paid on delivery.

## Run it
1. Install Node 18+ and MongoDB (local, or a free MongoDB Atlas cluster).
2. `npm install`
3. `cp .env.example .env` and set `MONGODB_URI` and `JWT_SECRET`.
4. `npm run seed`  (60 shoes, 150+ reviews, 48 orders, 7 accounts, 3 coupons)
5. `npm start`, then open http://localhost:4000

Seeded accounts: admin `admin@stride.dev` / `admin123`, customer `asha@example.com` / `customer123`
(all demo customers use `customer123`). Change these before any public deployment.
Coupons: `STRIDE10` (10%), `WELCOME20` (20%, min $100). `BIGSPEND30` is seeded but switched off.

## Image System & Audit Tooling
Stride uses an **image-first, strictly unique** photography architecture. Every single product has its own legally sourced, high-resolution photography with zero reused photos across the entire catalogue.

### Commands:
- `npm run images:audit`: Evaluates the entire database with SHA-256 and 64-bit dHash perceptual hashing to guarantee 0 duplicate or near-duplicate images across products.
- `npm run images:contact-sheet`: Generates `output/contact-sheet.html`, rendering a visual grid of every product and its full gallery with automated duplicate detection flags.

### Legal Sourcing & Attribution:
All demo product photography is legally sourced under the Unsplash Free License with full photographer credits stored in the database and displayed on every product page. Visible third-party trademarks are eliminated in favor of clean, unbranded shoe imagery.

## Customer features
- Realistic INR pricing (₹) stored in integer paise with zero decimal clutter
- India-ready checkout: PIN code delivery estimator with Cash on Delivery (COD) confirmation
- 6-step order delivery timeline tracking: Placed → Confirmed → Packed → Shipped → Out for Delivery → Delivered
- Printable GST Tax Invoice PDF generation with HSN code 6403 and CGST/SGST breakdowns
- UK/Indian standard shoe sizing (5–11 with half sizes) and interactive footwear size guide
- Colorway swatches and multi-photo product galleries with click-to-zoom lightbox
