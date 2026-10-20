import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

// Never touch real Firebase from tests (firebase-service-account.json is in the repo root).
// Stubs mirror the "not configured" fallback in firebase-admin.mjs, so _core uses the legacy store only.
vi.mock('../netlify/functions/firebase-admin.mjs', () => ({
  db: { ref: () => ({ set: async () => {}, once: async () => ({ exists: () => false, val: () => null }) }) },
  auth: {
    createUser: async () => { throw new Error('firebase disabled in tests'); },
    getUserByEmail: async () => { throw new Error('firebase disabled in tests'); },
    verifyIdToken: async () => { throw new Error('firebase disabled in tests'); }
  }
}));

let app;

beforeAll(async () => {
  // Must be set before server.js is imported: it initializes the DB and listens at import time.
  process.env.DATABASE_URL = 'sqlite://:memory:';
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));
  // Demo user (parent@demo.fr / demo, hashed) is seeded by _core's ensureSeed on the first API call.
});

describe('API - Authentication', () => {
  it('POST /api signup creates user', async () => {
    const res = await request(app)
      .post('/api')
      .send({
        action: 'signup',
        email: 'newuser@test.com',
        password: 'test123',
        name: 'Test User',
        familyName: 'Test Family'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.me.email).toBe('newuser@test.com');
  });

  it('POST /api login authenticates user', async () => {
    const res = await request(app)
      .post('/api')
      .send({ action: 'login', email: 'parent@demo.fr', password: 'demo' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('POST /api login rejects wrong password', async () => {
    const res = await request(app)
      .post('/api')
      .send({ action: 'login', email: 'parent@demo.fr', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('Missing token on protected action returns 401', async () => {
    const res = await request(app)
      .post('/api')
      .send({ action: 'me' });

    expect(res.status).toBe(401);
  });
});

describe('API - Families', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api')
      .send({ action: 'login', email: 'parent@demo.fr', password: 'demo' });
    token = res.body.token;
  });

  it('POST /api me returns current user', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    expect(res.status).toBe(200);
    expect(res.body.me.email).toBe('parent@demo.fr');
  });
});
