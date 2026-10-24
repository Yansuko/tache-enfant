import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

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

  it('saveFamily preserves task completion when stale client sends done=false', async () => {
    // Setup: Create a family with a task
    const createRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'createFamily',
        name: 'Sync Test Family'
      });

    expect(createRes.status).toBe(200);
    const familyId = createRes.body.family.id;
    const now = Date.now();

    // Step 1: Device A (Mac) completes a task with done=true
    const deviceA = {
      family: {
        id: familyId,
        name: 'Sync Test Family',
        children: [{
          id: 'child-sync-test',
          name: 'TestChild',
          xp: 0,
          gold: 0,
          tasks: [{
            icon: '✅',
            name: 'Test Task',
            xp: 10,
            gold: 5,
            done: true,
            daily: false,
            completedAt: now
          }],
          grades: [],
          sanctions: []
        }],
        questList: [],
        proposals: [],
        sanctionsList: [],
        requests: [],
        gradeRequests: [],
        taskRequests: [],
        actionLog: [],
        rewards: [],
        owner: 'parent@demo.fr',
        members: ['parent@demo.fr'],
        day: '',
        dailyBonus: { xp: 30, gold: 15 }
      }
    };

    const deviceARes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'saveFamily', ...deviceA });

    expect(deviceARes.status).toBe(200);
    expect(deviceARes.body.family.children[0].tasks[0].done).toBe(true);
    expect(deviceARes.body.family.children[0].tasks[0].completedAt).toBe(now);

    // Step 2: Device B (Phone) has stale data (done=false) and sends it
    // This simulates a phone that went offline before the Mac's update
    const deviceB = {
      family: {
        id: familyId,
        name: 'Sync Test Family',
        children: [{
          id: 'child-sync-test',
          name: 'TestChild',
          xp: 0,
          gold: 0,
          tasks: [{
            icon: '✅',
            name: 'Test Task',
            xp: 10,
            gold: 5,
            done: false,
            daily: false,
            completedAt: null
          }],
          grades: [],
          sanctions: []
        }],
        questList: [],
        proposals: [],
        sanctionsList: [],
        requests: [],
        gradeRequests: [],
        taskRequests: [],
        actionLog: [],
        rewards: [],
        owner: 'parent@demo.fr',
        members: ['parent@demo.fr'],
        day: '',
        dailyBonus: { xp: 30, gold: 15 }
      }
    };

    const deviceBRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'saveFamily', ...deviceB });

    expect(deviceBRes.status).toBe(200);
    expect(deviceBRes.body.family.children[0].tasks[0].done).toBe(true);
    expect(deviceBRes.body.family.children[0].tasks[0].completedAt).toBe(now);
  });
});
