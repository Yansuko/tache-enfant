import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

let app;
let n = 0;
const DAY = 24 * 3600 * 1000;

beforeAll(async () => {
  process.env.DATABASE_URL = 'sqlite://:memory:';
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));
});

async function setup() {
  const email = `lifecycle${++n}@test.com`;
  const res = await request(app).post('/api').send({
    action: 'signup', email, password: 'test123', name: 'Parent', familyName: 'Fam'
  });
  const token = res.body.token;
  const family = res.body.families[0];
  family.children = [{ id: 'child-emma', name: 'Emma', xp: 0, gold: 0, tasks: [] }];
  family.questList = [];
  const save = async (f) => {
    const r = await request(app).post('/api').set('Authorization', `Bearer ${token}`).send({ action: 'saveFamily', family: f });
    expect(r.status).toBe(200);
    return r.body.family;
  };
  return { family: await save(family), save };
}

const tasksOf = (f) => f.children.find(c => c.name === 'Emma').tasks;

describe('modèles de quêtes', () => {
  it('un modèle supprimé ne revient pas après la sauvegarde', async () => {
    const { family, save } = await setup();
    family.questList = [
      { id: 'quest-a', name: 'A', xp: 10, gold: 1, frequency: 'daily' },
      { id: 'quest-b', name: 'B', xp: 20, gold: 2, frequency: 'daily' },
    ];
    let f = await save(family);
    expect(f.questList.map(q => q.name).sort()).toEqual(['A', 'B']);

    f.questList = f.questList.filter(q => q.name !== 'B');
    f = await save(f);
    expect(f.questList.map(q => q.name)).toEqual(['A']);
  });

  it('un modèle sans id (données anciennes) ne se multiplie pas à chaque sauvegarde', async () => {
    const { family, save } = await setup();
    const legacy = () => ({ name: 'Ranger sa chambre', xp: 20, gold: 10, frequency: 'daily' });
    family.questList = [legacy()];
    await save(family);
    family.questList = [legacy()];
    await save(family);
    family.questList = [legacy()];
    const f = await save(family);
    expect(f.questList.filter(q => q.name === 'Ranger sa chambre').length).toBe(1);
  });
});

describe('tâches des enfants', () => {
  it('une tâche réassignée (même nom/xp qu\'une tâche déjà terminée) arrive non faite', async () => {
    const { family, save } = await setup();
    const doneAt = Date.now() - 3 * DAY;
    family.children[0].tasks = [
      { id: 'task-old', name: 'Ranger sa chambre', xp: 20, gold: 10, frequency: 'daily', done: true, completedAt: doneAt },
    ];
    let f = await save(family);

    f.children[0].tasks.push(
      { id: 'task-new', name: 'Ranger sa chambre', xp: 20, gold: 10, frequency: 'daily', done: false, completedAt: null }
    );
    f = await save(f);
    const fresh = tasksOf(f).find(t => t.id === 'task-new');
    expect(fresh.done).toBe(false);
    expect(fresh.completedAt).toBeFalsy();
  });

  it('un appareil périmé ne peut pas annuler une tâche validée récemment', async () => {
    const { family, save } = await setup();
    family.children[0].tasks = [
      { id: 'task-1', name: 'Faire son lit', xp: 10, gold: 5, frequency: 'daily', done: true, completedAt: Date.now() - 1000 },
    ];
    await save(family);

    family.children[0].tasks = [
      { id: 'task-1', name: 'Faire son lit', xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null },
    ];
    const f = await save(family);
    expect(tasksOf(f)[0].done).toBe(true);
  });

  it('une tâche réinitialisée au changement de jour n\'est pas ressuscitée par le serveur', async () => {
    const { family, save } = await setup();
    const yesterday = Date.now() - DAY;
    family.children[0].tasks = [
      { id: 'task-1', name: 'Faire ses devoirs', xp: 30, gold: 15, frequency: 'daily', done: true, completedAt: yesterday },
    ];
    await save(family);

    family.children[0].tasks = [
      { id: 'task-1', name: 'Faire ses devoirs', xp: 30, gold: 15, frequency: 'daily', done: false, completedAt: yesterday, resetAt: Date.now() },
    ];
    const f = await save(family);
    expect(tasksOf(f)[0].done).toBe(false);
  });
});

describe('demandes (validation de tâche, boutique)', () => {
  it('une nouvelle demande de validation au même rang qu\'une ancienne approuvée est conservée', async () => {
    const { family, save } = await setup();
    family.taskRequests = [
      { id: 'tr-old', child: 'Emma', taskIndex: 4, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'approved', submittedAt: Date.now() - 5000 },
      { id: 'tr-new', child: 'Emma', taskIndex: 4, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending', submittedAt: Date.now() },
    ];
    const f = await save(family);
    expect(f.taskRequests.map(r => r.id).sort()).toEqual(['tr-new', 'tr-old']);
  });

  it('deux demandes d\'achat du même article (ids différents) sont conservées', async () => {
    const { family, save } = await setup();
    family.requests = [
      { id: 'rq-1', child: 'Emma', name: 'Pizza', cost: 25, status: 'approved' },
      { id: 'rq-2', child: 'Emma', name: 'Pizza', cost: 25, status: 'pending' },
    ];
    const f = await save(family);
    expect(f.requests.map(r => r.id).sort()).toEqual(['rq-1', 'rq-2']);
  });
});

describe('anciennes données sans id', () => {
  it('des demandes sans id ne se multiplient pas à chaque sauvegarde', async () => {
    const { family, save } = await setup();
    const legacy = () => [{ child: 'Emma', name: 'Pizza', cost: 25, status: 'approved', approvedAt: 1792317600000 }];
    family.requests = legacy();
    await save(family);
    family.requests = legacy();
    await save(family);
    family.requests = legacy();
    const f = await save(family);
    expect(f.requests.filter(r => r.name === 'Pizza').length).toBe(1);
  });
});
