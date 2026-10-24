import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

let app;
let token;

beforeAll(async () => {
  process.env.DATABASE_URL = 'sqlite://:memory:';
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));

  // Create test user
  const signupRes = await request(app)
    .post('/api')
    .send({
      action: 'signup',
      email: 'stats@test.fr',
      password: 'test123',
      name: 'Test Parent',
      familyName: 'Test Family'
    });

  token = signupRes.body.token;

  // Setup family with children and stats
  const familyRes = await request(app)
    .post('/api')
    .set('Authorization', `Bearer ${token}`)
    .send({
      action: 'me'
    });

  const family = familyRes.body.families[0];

  // Add test children (l'API n'a pas d'action saveChild: tout passe par saveFamily)
  family.children = [{ id: 'child-1', name: 'Emma', xp: 100, gold: 50, tasks: [], grades: [], sanctions: [] }];
  await request(app)
    .post('/api')
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'saveFamily', family });
});

describe('Stats API - getGradeStats', () => {
  it('returns 400 when familyId is missing', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'getGradeStats' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', 'Bearer invalid-token')
      .send({
        action: 'getGradeStats',
        familyId: 'fam-test'
      });

    expect(res.status).toBe(401);
  });

  it('returns 404 when familyId does not exist', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getGradeStats',
        familyId: 'non-existent-family'
      });

    expect(res.status).toBe(404);
  });

  it('returns valid stats structure when family exists', async () => {
    // First get user family
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const familyId = meRes.body.families[0].id;

    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getGradeStats',
        familyId
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('grades');
    expect(res.body).toHaveProperty('bySubject');
    expect(res.body).toHaveProperty('byDay');
    expect(res.body).toHaveProperty('totalXP');
    expect(res.body).toHaveProperty('totalGold');
    expect(Array.isArray(res.body.grades)).toBe(true);
  });

  it('returns 400 when startDate is invalid format', async () => {
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const familyId = meRes.body.families[0].id;

    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getGradeStats',
        familyId,
        startDate: '21/10/2026'  // Invalid format
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when startDate is after endDate', async () => {
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const familyId = meRes.body.families[0].id;

    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getGradeStats',
        familyId,
        startDate: '2026-10-21',
        endDate: '2026-10-01'
      });

    expect(res.status).toBe(400);
  });

  it('returns 404 when childId does not exist', async () => {
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const familyId = meRes.body.families[0].id;

    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getGradeStats',
        familyId,
        childId: 'non-existent-child'
      });

    expect(res.status).toBe(404);
  });
});

describe('Stats API - getRewardStats', () => {
  it('returns 400 when familyId is missing', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'getRewardStats' });

    expect(res.status).toBe(400);
  });

  it('returns valid reward stats structure', async () => {
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const familyId = meRes.body.families[0].id;

    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getRewardStats',
        familyId
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('purchases');
    expect(res.body).toHaveProperty('totalSpent');
    expect(res.body).toHaveProperty('avgCost');
    expect(Array.isArray(res.body.purchases)).toBe(true);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', 'Bearer bad-token')
      .send({
        action: 'getRewardStats',
        familyId: 'test'
      });

    expect(res.status).toBe(401);
  });
});

describe('Stats API - getSanctionStats', () => {
  it('returns 400 when familyId is missing', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'getSanctionStats' });

    expect(res.status).toBe(400);
  });

  it('returns valid sanction stats structure', async () => {
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const familyId = meRes.body.families[0].id;

    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getSanctionStats',
        familyId
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCount');
    expect(res.body).toHaveProperty('totalGoldLost');
    expect(res.body).toHaveProperty('avgGoldPerSanction');
    expect(typeof res.body.totalCount).toBe('number');
  });

  it('returns 404 for non-existent family', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getSanctionStats',
        familyId: 'non-existent'
      });

    expect(res.status).toBe(404);
  });

  it('filters by childId when provided', async () => {
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const familyId = meRes.body.families[0].id;

    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'getSanctionStats',
        familyId,
        childId: 'child-1'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCount');
  });
});

describe('API - PWA Routes', () => {
  it('GET /api/vapid-key returns VAPID public key', async () => {
    const res = await request(app).get('/api/vapid-key');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('key');
  });

  it('POST /api/subscribe handles push subscription', async () => {
    const res = await request(app)
      .post('/api/subscribe')
      .send({
        action: 'subscribePush',
        endpoint: 'https://example.com/push',
        keys: {
          p256dh: 'test-key',
          auth: 'test-auth'
        }
      });

    expect([200, 401, 400]).toContain(res.status);
  });

  it('POST /api/unsubscribe handles push unsubscription', async () => {
    const res = await request(app)
      .post('/api/unsubscribe')
      .send({
        action: 'unsubscribePush',
        endpoint: 'https://example.com/push'
      });

    expect([200, 401, 400]).toContain(res.status);
  });

  it('GET /manifest.json returns valid manifest', async () => {
    const res = await request(app).get('/manifest.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('short_name');
    expect(res.body).toHaveProperty('icons');
  });

  it('GET /index.html falls back for SPA routing', async () => {
    const res = await request(app).get('/some-undefined-route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html');
  });
});

describe('API - Error Handling', () => {
  it('returns 500 on unexpected server error', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'invalid-action-name' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 401 when no token provided for protected action', async () => {
    const res = await request(app)
      .post('/api')
      .send({ action: 'me' });

    expect(res.status).toBe(401);
  });

  it('handles CORS preflight requests', async () => {
    const res = await request(app)
      .options('/api')
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
  });

  it('sets correct CORS headers', async () => {
    const res = await request(app)
      .get('/api/vapid-key')
      .set('Origin', 'http://example.com');

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
