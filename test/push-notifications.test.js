import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

// Mock Firebase to prevent touching real services
vi.mock('../netlify/functions/firebase-admin.mjs', () => ({
  db: { ref: () => ({ set: async () => {}, once: async () => ({ exists: () => false, val: () => null }) }) },
  auth: {
    createUser: async () => { throw new Error('firebase disabled in tests'); },
    getUserByEmail: async () => { throw new Error('firebase disabled in tests'); },
    verifyIdToken: async () => { throw new Error('firebase disabled in tests'); }
  }
}));

let app;
let token;
let familyId;

beforeAll(async () => {
  process.env.DATABASE_URL = 'sqlite://:memory:';
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));

  // Create test user
  const signupRes = await request(app)
    .post('/api')
    .send({
      action: 'signup',
      email: 'push-test@test.fr',
      password: 'test123',
      name: 'Push Test Parent',
      familyName: 'Push Test Family'
    });

  token = signupRes.body.token;

  // Get user family
  const meRes = await request(app)
    .post('/api')
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'me' });

  familyId = meRes.body.families[0].id;
});

describe('Push Notifications API', () => {
  describe('pushKey endpoint', () => {
    it('returns public VAPID key without authentication', async () => {
      const res = await request(app)
        .post('/api')
        .send({ action: 'pushKey' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('key');
      expect(typeof res.body.key).toBe('string');
      expect(res.body.key.length).toBeGreaterThan(0);
    });
  });

  describe('subscribePush endpoint', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api')
        .send({
          action: 'subscribePush',
          familyId,
          subscription: {
            endpoint: 'https://example.com/push/v1/abc123',
            keys: { p256dh: 'test-p256dh', auth: 'test-auth' }
          }
        });

      expect(res.status).toBe(401);
    });

    it('rejects invalid subscription format', async () => {
      const res = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'subscribePush',
          familyId,
          subscription: { endpoint: 'not-a-valid-url' }
        });

      expect(res.status).toBe(400);
    });

    it('accepts valid subscription for authenticated user', async () => {
      const res = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'subscribePush',
          familyId,
          subscription: {
            endpoint: 'https://example.com/push/v1/abc123',
            keys: {
              p256dh: 'dGVzdC1wMjU2ZGg=',  // base64
              auth: 'dGVzdC1hdXRo'         // base64
            }
          }
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
    });

    it('rejects subscription for non-member', async () => {
      // Create another user
      const otherRes = await request(app)
        .post('/api')
        .send({
          action: 'signup',
          email: 'other-user@test.fr',
          password: 'test123',
          name: 'Other User',
          familyName: 'Other Family'
        });

      const otherToken = otherRes.body.token;

      // Try to subscribe to first user's family
      const res = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          action: 'subscribePush',
          familyId,
          subscription: {
            endpoint: 'https://example.com/push/v1/xyz789',
            keys: { p256dh: 'dGVzdC1wMjU2ZGg=', auth: 'dGVzdC1hdXRo' }
          }
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('unsubscribePush endpoint', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api')
        .send({
          action: 'unsubscribePush',
          endpoint: 'https://example.com/push/v1/abc123'
        });

      expect(res.status).toBe(401);
    });

    it('handles unsubscription for authenticated user', async () => {
      // First subscribe
      await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'subscribePush',
          familyId,
          subscription: {
            endpoint: 'https://example.com/push/v1/unsub123',
            keys: { p256dh: 'dGVzdC1wMjU2ZGg=', auth: 'dGVzdC1hdXRo' }
          }
        });

      // Then unsubscribe
      const res = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'unsubscribePush',
          endpoint: 'https://example.com/push/v1/unsub123',
          familyId
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
    });
  });

  describe('notify endpoint', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api')
        .send({
          action: 'notify',
          familyId,
          title: 'Test Notification'
        });

      expect(res.status).toBe(401);
    });

    it('requires title in request', async () => {
      const res = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'notify',
          familyId,
          body: 'Test body without title'
        });

      expect(res.status).toBe(400);
    });

    it('accepts valid notification request', async () => {
      const res = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'notify',
          familyId,
          title: 'Tâche complétée',
          body: 'Emma a complété une tâche!',
          icon: '/logo-192.png'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sent');
      expect(typeof res.body.sent).toBe('number');
    });

    it('rejects notification for non-existent family', async () => {
      const res = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'notify',
          familyId: 'fam-nonexistent',
          title: 'Test',
          body: 'This should fail'
        });

      expect(res.status).toBe(404);
    });
  });

  describe('Push notification flow', () => {
    it('completes full subscription and notification workflow', async () => {
      // Step 1: Get public key
      const keyRes = await request(app)
        .post('/api')
        .send({ action: 'pushKey' });
      expect(keyRes.status).toBe(200);

      // Step 2: Subscribe
      const subRes = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'subscribePush',
          familyId,
          subscription: {
            endpoint: 'https://example.com/push/v1/workflow-test',
            keys: { p256dh: 'dGVzdC1wMjU2ZGg=', auth: 'dGVzdC1hdXRo' }
          }
        });
      expect(subRes.status).toBe(200);

      // Step 3: Send notification (won't actually send to example.com, just queued)
      const notifyRes = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'notify',
          familyId,
          title: 'Notification Test',
          body: 'This is a test notification',
          tag: 'test-workflow'
        });
      expect(notifyRes.status).toBe(200);
      // sent = 0 because example.com endpoint is not real
      expect(notifyRes.body).toHaveProperty('sent');
    });
  });
});
