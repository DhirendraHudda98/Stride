const jwt = require('jsonwebtoken');
const { app, request, setupTestDb, resetTestDb, teardownTestDb, getTokens, models, SECRET } = require('./setup');

describe('Phase 2: Authentication, Sign-up, and Login', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  describe('Sign-up / Register', () => {
    it('allows valid sign-up and returns token and safe user profile', async () => {
      const res = await request
        .post('/api/auth/register')
        .send({ name: 'Kiran Desai', email: 'kiran@example.com', password: 'Password123!' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.name).toBe('Kiran Desai');
      expect(res.body.user.email).toBe('kiran@example.com');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.user).not.toHaveProperty('password');

      // Verify in DB
      const userInDb = await models.User.findOne({ email: 'kiran@example.com' });
      expect(userInDb).toBeTruthy();
      expect(userInDb.passwordHash).not.toBe('Password123!');
      expect(userInDb.passwordHash.startsWith('$2')).toBe(true);
      expect(userInDb.role).toBe('customer');
    });

    it('rejects empty or whitespace name', async () => {
      const res = await request
        .post('/api/auth/register')
        .send({ name: '   ', email: 'blank@example.com', password: 'Password123!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/name/i);
    });

    it('rejects invalid email formats', async () => {
      const res = await request
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'notanemail', password: 'Password123!' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    it('rejects password shorter than 6 characters', async () => {
      const res = await request
        .post('/api/auth/register')
        .send({ name: 'Short Pass', email: 'short@example.com', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 6 characters/i);
    });

    it('rejects duplicate email with different casing', async () => {
      const res1 = await request
        .post('/api/auth/register')
        .send({ name: 'User One', email: 'duplicate@example.com', password: 'Password123!' });
      expect(res1.status).toBe(201);

      const res2 = await request
        .post('/api/auth/register')
        .send({ name: 'User Two', email: 'DUPLICATE@EXAMPLE.COM', password: 'Password123!' });
      expect(res2.status).toBe(409);
      expect(res2.body.error).toMatch(/already has an account/i);
    });

    it('trims leading and trailing spaces from email', async () => {
      const res = await request
        .post('/api/auth/register')
        .send({ name: 'Padded Email', email: '  padded@example.com  ', password: 'Password123!' });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('padded@example.com');
      const inDb = await models.User.findOne({ email: 'padded@example.com' });
      expect(inDb).toBeTruthy();
    });

    it('prevents role escalation during registration (attacker cannot become admin)', async () => {
      const res = await request
        .post('/api/auth/register')
        .send({ name: 'Attacker', email: 'hacker@example.com', password: 'Password123!', role: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('customer');
      const inDb = await models.User.findOne({ email: 'hacker@example.com' });
      expect(inDb.role).toBe('customer');
    });

    it('rejects excessively long inputs', async () => {
      const res = await request
        .post('/api/auth/register')
        .send({
          name: 'A'.repeat(200),
          email: 'valid@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/too long/i);
    });
  });

  describe('Login', () => {
    it('accepts correct credentials and returns JWT token', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'customer123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('asha@example.com');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('returns generic error for unknown email (no user enumeration)', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'nobody_exists@example.com', password: 'customer123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('returns the same generic error for wrong password', async () => {
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('handles empty email or empty password gracefully', async () => {
      const res1 = await request.post('/api/auth/login').send({ email: '', password: 'customer123' });
      expect(res1.status).toBe(401);

      const res2 = await request.post('/api/auth/login').send({ email: 'asha@example.com', password: '' });
      expect(res2.status).toBe(401);
    });

    it('rejects NoSQL injection objects in email and password without 500 error', async () => {
      const res1 = await request
        .post('/api/auth/login')
        .send({ email: { $gt: '' }, password: { $gt: '' } });

      expect(res1.status).toBe(401);
      expect(res1.body.error).toBe('Invalid email or password');

      const res2 = await request
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: { $ne: null } });

      expect(res2.status).toBe(401);
      expect(res2.body.error).toBe('Invalid email or password');
    });
  });

  describe('Session, Tokens, and Permissions', () => {
    it('verifies /api/auth/me returns current user profile when valid token provided', async () => {
      const tokens = getTokens();
      const res = await request
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.cust1}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('asha@example.com');
      expect(res.body.name).toBe('Asha Rao');
    });

    it('rejects request with missing or malformed token with 401', async () => {
      const res1 = await request.get('/api/auth/me');
      expect(res1.status).toBe(401);

      const res2 = await request.get('/api/auth/me').set('Authorization', 'Bearer invalid.token.value');
      expect(res2.status).toBe(401);
    });

    it('rejects tampered token signed with wrong secret', async () => {
      const fakeToken = jwt.sign({ id: 'someId', role: 'customer' }, 'wrong-secret-key');
      const res = await request
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`);

      expect(res.status).toBe(401);
    });

    it('rejects expired token', async () => {
      const expiredToken = jwt.sign({ id: 'someId', role: 'customer' }, SECRET, { expiresIn: -10 });
      const res = await request
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('immediately rejects tokens of blocked users', async () => {
      const tokens = getTokens();
      const res = await request
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.blocked}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid or user has been blocked/i);
    });
  });

  describe('Password Reset Flow', () => {
    it('never reveals whether an email exists on forgot password', async () => {
      const res1 = await request.post('/api/auth/forgot').send({ email: 'asha@example.com' });
      expect(res1.status).toBe(200);
      expect(res1.body.message).toMatch(/If that email has an account/i);

      const res2 = await request.post('/api/auth/forgot').send({ email: 'nonexistent@example.com' });
      expect(res2.status).toBe(200);
      expect(res2.body.message).toMatch(/If that email has an account/i);
    });

    it('allows resetting password with valid token and invalidates token on use', async () => {
      // 1. Request reset
      const forgotRes = await request.post('/api/auth/forgot').send({ email: 'asha@example.com' });
      const devToken = forgotRes.body.devToken;
      expect(devToken).toBeTruthy();

      // 2. Perform reset
      const resetRes = await request
        .post('/api/auth/reset')
        .send({ token: devToken, password: 'NewSecurePassword123!' });
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.ok).toBe(true);

      // 3. Old password should fail
      const oldLogin = await request
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'customer123' });
      expect(oldLogin.status).toBe(401);

      // 4. New password should succeed
      const newLogin = await request
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'NewSecurePassword123!' });
      expect(newLogin.status).toBe(200);

      // 5. Reusing the reset token must fail
      const reuseRes = await request
        .post('/api/auth/reset')
        .send({ token: devToken, password: 'AnotherPassword123!' });
      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.error).toMatch(/wrong or has expired/i);
    });
  });

  describe('Profile and Security Changes', () => {
    it('allows updating profile details (name, phone, address)', async () => {
      const tokens = getTokens();
      const res = await request
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.cust1}`)
        .send({ name: 'Asha R. Updated', phone: '+91 99999 88888', address: 'Indiranagar Stage 2' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Asha R. Updated');
      expect(res.body.phone).toBe('+91 99999 88888');

      // Verify persistence
      const meRes = await request.get('/api/auth/me').set('Authorization', `Bearer ${tokens.cust1}`);
      expect(meRes.body.name).toBe('Asha R. Updated');
    });

    it('requires current password to change password and rejects incorrect current password', async () => {
      const tokens = getTokens();
      // Wrong current password
      const wrongRes = await request
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${tokens.cust1}`)
        .send({ current: 'WrongCurrentPass!', next: 'BrandNewPass123!' });

      expect(wrongRes.status).toBe(401);
      expect(wrongRes.body.error).toMatch(/current password is wrong/i);

      // Correct current password
      const goodRes = await request
        .put('/api/auth/password')
        .set('Authorization', `Bearer ${tokens.cust1}`)
        .send({ current: 'customer123', next: 'BrandNewPass123!' });

      expect(goodRes.status).toBe(200);
      expect(goodRes.body.ok).toBe(true);
    });
  });
});
