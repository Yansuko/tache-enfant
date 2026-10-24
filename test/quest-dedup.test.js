import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

let app;

beforeAll(async () => {
  process.env.DATABASE_URL = 'sqlite://:memory:';
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));
});

describe('Quest Template Deduplication', () => {
  let token, familyId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api')
      .send({
        action: 'signup',
        email: 'quest-test@test.com',
        password: 'test123',
        name: 'Quest Tester',
        familyName: 'Quest Test Family'
      });
    token = res.body.token;
    familyId = res.body.families[0].id;
  });

  it('Should deduplicate questList items without IDs by content', async () => {
    // Simulate receiving questList items without IDs from old data
    // This would happen if data was stored without IDs
    const family = {
      id: familyId,
      name: 'Test',
      owner: 'quest-test@test.com',
      members: ['quest-test@test.com'],
      children: [],
      questList: [
        { name: 'Ranger sa chambre', xp: 20, gold: 10, frequency: 'daily' },
        { name: 'Ranger sa chambre', xp: 20, gold: 10, frequency: 'daily' }, // duplicate
        { name: 'Faire les devoirs', xp: 30, gold: 15, frequency: 'daily' },
      ],
      proposals: [],
      rewards: [],
      requests: [],
      gradeRequests: [],
      taskRequests: [],
      sanctionsList: [],
      actionLog: [],
    };

    const saveRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'saveFamily',
        family
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.family.questList.length).toBe(2);
    expect(saveRes.body.family.questList[0].name).toBe('Ranger sa chambre');
    expect(saveRes.body.family.questList[1].name).toBe('Faire les devoirs');
  });

  it('Should deduplicate questList items by ID when IDs are present', async () => {
    // Get current family
    const meRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });

    const family = meRes.body.families[0];

    // Add quest with ID
    family.questList = family.questList || [];
    const id1 = 'quest-abc123';
    family.questList.push({ id: id1, name: 'Nouveau modèle', xp: 25, gold: 12, frequency: 'daily' });
    family.questList.push({ id: id1, name: 'Nouveau modèle', xp: 25, gold: 12, frequency: 'daily' }); // duplicate with same ID

    const saveRes = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'saveFamily',
        family
      });

    expect(saveRes.status).toBe(200);
    // Should have only 1 copy of the ID-based duplicate
    const newModels = saveRes.body.family.questList.filter(q => q.name === 'Nouveau modèle');
    expect(newModels.length).toBe(1);
  });
});
