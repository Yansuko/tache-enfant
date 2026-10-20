import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { app } from '../server.js';

let testDb;

beforeAll(() => {
  // Create in-memory SQLite for tests
  testDb = new Database(':memory:');
  // Initialize schema...
});

afterAll(() => {
  testDb.close();
});

describe('API - Authentication', () => {
  it('POST /api signup creates user', async () => {
    const res = await request(app)
      .post('/api')
      .send({
        action: 'signup',
        email: 'newuser@test.com',
        password: 'test123',
        name: 'Test User'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.email).toBe('newuser@test.com');
  });

  it('POST /api login authenticates user', async () => {
    const res = await request(app)
      .post('/api')
      .send({
        action: 'login',
        email: 'parent@demo.fr',
        password: 'demo'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
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
      .send({
        action: 'login',
        email: 'parent@demo.fr',
        password: 'demo'
      });
    token = res.body.token;
  });

  it('GET /api me returns current user', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('parent@demo.fr');
  });
});
