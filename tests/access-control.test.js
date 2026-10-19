const jwt = require('jsonwebtoken');
const { app, request, setupTestDb, resetTestDb, teardownTestDb, getTokens, getProducts, models, SECRET } = require('./setup');

describe('Phase 3: Admin Portal and Access Control Matrix', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  describe('Access Control Matrix: Guest, Customer, and Admin', () => {
    it('GET /api/products: Guest=200, Customer=200, Admin=200', async () => {
      const tokens = getTokens();
      const rGuest = await request.get('/api/products');
      expect(rGuest.status).toBe(200);

      const rCust = await request.get('/api/products').set('Authorization', `Bearer ${tokens.cust1}`);
      expect(rCust.status).toBe(200);

      const rAdmin = await request.get('/api/products').set('Authorization', `Bearer ${tokens.admin}`);
      expect(rAdmin.status).toBe(200);
    });

    it('GET /api/products/:id/reviews: Guest=200, Customer=200, Admin=200', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];
      const rGuest = await request.get(`/api/products/${p.id}/reviews`);
      expect(rGuest.status).toBe(200);

      const rCust = await request.get(`/api/products/${p.id}/reviews`).set('Authorization', `Bearer ${tokens.cust1}`);
      expect(rCust.status).toBe(200);

      const rAdmin = await request.get(`/api/products/${p.id}/reviews`).set('Authorization', `Bearer ${tokens.admin}`);
      expect(rAdmin.status).toBe(200);
    });

    it('POST /api/orders (guest checkout): Guest=201, Customer=201, Admin=201', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];
      const payload = {
        name: 'Guest Buyer',
        email: 'guest@example.com',
        phone: '9876543210',
        addrLine1: '123 Main St',
        addrCity: 'Bengaluru',
        addrState: 'Karnataka',
        addrPin: '560038',
        lines: [{ id: p.id, size: 8, qty: 1 }]
      };

      const rGuest = await request.post('/api/orders').send(payload);
      expect(rGuest.status).toBe(201);

      const rCust = await request.post('/api/orders').set('Authorization', `Bearer ${tokens.cust1}`).send({ ...payload, email: 'asha@example.com' });
      expect(rCust.status).toBe(201);

      const rAdmin = await request.post('/api/orders').set('Authorization', `Bearer ${tokens.admin}`).send({ ...payload, email: 'admin@stride.dev' });
      expect(rAdmin.status).toBe(201);
    });

    it('GET /api/orders/mine: Guest=401, Customer=200, Admin=200', async () => {
      const tokens = getTokens();
      const rGuest = await request.get('/api/orders/mine');
      expect(rGuest.status).toBe(401);

      const rCust = await request.get('/api/orders/mine').set('Authorization', `Bearer ${tokens.cust1}`);
      expect(rCust.status).toBe(200);

      const rAdmin = await request.get('/api/orders/mine').set('Authorization', `Bearer ${tokens.admin}`);
      expect(rAdmin.status).toBe(200);
    });

    it('POST /api/products/:id/reviews: Guest=401, Customer=201, Admin=201', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];

      const rGuest = await request.post(`/api/products/${p.id}/reviews`).send({ rating: 5, body: 'Nice shoe' });
      expect(rGuest.status).toBe(401);

      const rCust = await request.post(`/api/products/${p.id}/reviews`).set('Authorization', `Bearer ${tokens.cust1}`).send({ rating: 5, body: 'Great fit' });
      expect(rCust.status).toBe(201);

      const rAdmin = await request.post(`/api/products/${p.id}/reviews`).set('Authorization', `Bearer ${tokens.admin}`).send({ rating: 4, body: 'Solid review' });
      expect(rAdmin.status).toBe(201);
    });

    it('POST /api/products: Guest=401, Customer=403, Admin=201', async () => {
      const tokens = getTokens();
      const newShoe = {
        name: 'New Admin Pro Shoe',
        brand: 'Stride',
        gender: 'men',
        type: 'runner',
        mrp: 499900,
        price: 349900,
        stock: 12,
        images: [
          { url: '/uploads/products/runner_1.webp', isCover: true, alt: 'A' },
          { url: '/uploads/products/runner_2.webp', isCover: false, alt: 'B' },
          { url: '/uploads/products/runner_3.webp', isCover: false, alt: 'C' }
        ]
      };

      const rGuest = await request.post('/api/products').send(newShoe);
      expect(rGuest.status).toBe(401);

      const rCust = await request.post('/api/products').set('Authorization', `Bearer ${tokens.cust1}`).send(newShoe);
      expect(rCust.status).toBe(403);

      const rAdmin = await request.post('/api/products').set('Authorization', `Bearer ${tokens.admin}`).send(newShoe);
      expect(rAdmin.status).toBe(201);
    });

    it('PUT /api/products/:id: Guest=401, Customer=403, Admin=200', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];
      const updateData = { name: 'Aero Sprint Runner V2', price: 359900, mrp: 499900 };

      const rGuest = await request.put(`/api/products/${p.id}`).send(updateData);
      expect(rGuest.status).toBe(401);

      const rCust = await request.put(`/api/products/${p.id}`).set('Authorization', `Bearer ${tokens.cust1}`).send(updateData);
      expect(rCust.status).toBe(403);

      const rAdmin = await request.put(`/api/products/${p.id}`).set('Authorization', `Bearer ${tokens.admin}`).send(updateData);
      expect(rAdmin.status).toBe(200);
      expect(rAdmin.body.name).toBe('Aero Sprint Runner V2');
    });

    it('DELETE /api/products/:id: Guest=401, Customer=403, Admin=200', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];

      const rGuest = await request.delete(`/api/products/${p.id}`);
      expect(rGuest.status).toBe(401);

      const rCust = await request.delete(`/api/products/${p.id}`).set('Authorization', `Bearer ${tokens.cust1}`);
      expect(rCust.status).toBe(403);

      const rAdmin = await request.delete(`/api/products/${p.id}`).set('Authorization', `Bearer ${tokens.admin}`);
      expect(rAdmin.status).toBe(200);
    });

    it('GET /api/admin/stats: Guest=401, Customer=403, Admin=200', async () => {
      const tokens = getTokens();
      const rGuest = await request.get('/api/admin/stats');
      expect(rGuest.status).toBe(401);

      const rCust = await request.get('/api/admin/stats').set('Authorization', `Bearer ${tokens.cust1}`);
      expect(rCust.status).toBe(403);

      const rAdmin = await request.get('/api/admin/stats').set('Authorization', `Bearer ${tokens.admin}`);
      expect(rAdmin.status).toBe(200);
      expect(rAdmin.body).toHaveProperty('revenue');
      expect(rAdmin.body).toHaveProperty('orders');
    });

    it('Admin coupons routes: create, toggle, delete: Guest=401, Customer=403, Admin=200/201', async () => {
      const tokens = getTokens();
      const newCoupon = { code: 'SECRET50', type: 'percent', percent: 50, minSpend: 100000 };

      // Create
      const rGuestCreate = await request.post('/api/admin/coupons').send(newCoupon);
      expect(rGuestCreate.status).toBe(401);

      const rCustCreate = await request.post('/api/admin/coupons').set('Authorization', `Bearer ${tokens.cust1}`).send(newCoupon);
      expect(rCustCreate.status).toBe(403);

      const rAdminCreate = await request.post('/api/admin/coupons').set('Authorization', `Bearer ${tokens.admin}`).send(newCoupon);
      expect(rAdminCreate.status).toBe(201);
      const couponId = rAdminCreate.body._id || rAdminCreate.body.id;

      // Toggle
      const rCustToggle = await request.patch(`/api/admin/coupons/${couponId}`).set('Authorization', `Bearer ${tokens.cust1}`).send({ active: false });
      expect(rCustToggle.status).toBe(403);

      const rAdminToggle = await request.patch(`/api/admin/coupons/${couponId}`).set('Authorization', `Bearer ${tokens.admin}`).send({ active: false });
      expect(rAdminToggle.status).toBe(200);

      // Delete
      const rCustDel = await request.delete(`/api/admin/coupons/${couponId}`).set('Authorization', `Bearer ${tokens.cust1}`);
      expect(rCustDel.status).toBe(403);

      const rAdminDel = await request.delete(`/api/admin/coupons/${couponId}`).set('Authorization', `Bearer ${tokens.admin}`);
      expect(rAdminDel.status).toBe(200);
    });
  });

  describe('Stale Permissions and Demoted Users', () => {
    it('immediately denies admin operations if an admin is demoted in DB despite valid JWT token', async () => {
      const tokens = getTokens();
      // Demote admin in database to 'customer'
      await models.User.findByIdAndUpdate(tokens.adminUser._id, { role: 'customer' });

      // Request admin stats using the previously generated admin token
      const res = await request
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Admins only/i);
    });

    it('immediately denies operations if an admin is deleted from DB', async () => {
      const tokens = getTokens();
      // Delete admin from database
      await models.User.findByIdAndDelete(tokens.adminUser._id);

      const res = await request
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(res.status).toBe(403);
    });
  });

  describe('IDOR / Horizontal Privilege Escalation', () => {
    it('prevents Customer B from cancelling Customer A order', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];

      // Customer A places an order
      const orderRes = await request
        .post('/api/orders')
        .set('Authorization', `Bearer ${tokens.cust1}`)
        .send({
          name: 'Asha Rao',
          email: 'asha@example.com',
          phone: '9876543210',
          addrLine1: 'Indiranagar',
          addrCity: 'Bengaluru',
          addrState: 'Karnataka',
          addrPin: '560038',
          lines: [{ id: p.id, size: 8, qty: 1 }]
        });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body._id || orderRes.body.id;

      // Customer B (Rohan) attempts to cancel Customer A's order
      const cancelRes = await request
        .patch(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${tokens.cust2}`);

      // Must be rejected with 404 (not found for this user) or 403
      expect([403, 404]).toContain(cancelRes.status);
    });

    it('prevents unauthenticated guest or other customer from downloading private customer invoice', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];

      // Customer A places an order
      const orderRes = await request
        .post('/api/orders')
        .set('Authorization', `Bearer ${tokens.cust1}`)
        .send({
          name: 'Asha Rao',
          email: 'asha@example.com',
          phone: '9876543210',
          addrLine1: 'Indiranagar',
          addrCity: 'Bengaluru',
          addrState: 'Karnataka',
          addrPin: '560038',
          lines: [{ id: p.id, size: 8, qty: 1 }]
        });
      const orderId = orderRes.body._id || orderRes.body.id;

      // 1. Unauthenticated guest tries to download Customer A's invoice
      const guestInvoiceRes = await request.get(`/api/orders/${orderId}/invoice`);
      expect([401, 403]).toContain(guestInvoiceRes.status);

      // 2. Customer B tries to download Customer A's invoice
      const cust2InvoiceRes = await request
        .get(`/api/orders/${orderId}/invoice`)
        .set('Authorization', `Bearer ${tokens.cust2}`);
      expect(cust2InvoiceRes.status).toBe(403);

      // 3. Customer A can download their own invoice
      const ownInvoiceRes = await request
        .get(`/api/orders/${orderId}/invoice`)
        .set('Authorization', `Bearer ${tokens.cust1}`);
      expect(ownInvoiceRes.status).toBe(200);
      expect(ownInvoiceRes.headers['content-type']).toBe('application/pdf');

      // 4. Admin can download any invoice
      const adminInvoiceRes = await request
        .get(`/api/orders/${orderId}/invoice`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(adminInvoiceRes.status).toBe(200);
    });
  });

  describe('Mass Assignment & Operator Injection Protection on Product Updates', () => {
    it('rejects MongoDB operator injection ($set / $unset) in product updates', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];

      const res = await request
        .put(`/api/products/${p.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ $set: { adminOnlyBackdoor: true } });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid operator/i);
    });

    it('ignores non-whitelisted fields during product updates', async () => {
      const tokens = getTokens();
      const p = getProducts()[0];

      const res = await request
        .put(`/api/products/${p.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ name: 'Valid Updated Name', secretInternalCost: 500, maliciousRole: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Valid Updated Name');
      expect(res.body).not.toHaveProperty('secretInternalCost');

      // Check DB directly
      const rawInDb = await models.Product.findById(p.id).lean();
      expect(rawInDb.secretInternalCost).toBeUndefined();
    });
  });
});
