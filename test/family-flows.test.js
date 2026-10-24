import { describe, it, expect, beforeAll } from 'vitest';
import { api, newParent } from './helpers.js';

const child = (name, extra = {}) => ({ id: `child-${name.toLowerCase()}`, name, xp: 0, gold: 0, tasks: [], grades: [], sanctions: [], notes: [], ...extra });
const names = (list) => (list || []).map(x => x.name);

describe('compte', () => {
  it('changePassword: le nouveau mot de passe fonctionne, l\'ancien est refusé', async () => {
    const p = await newParent();
    const r = await api('changePassword', { newPassword: 'nouveau123' }, p.token);
    expect(r.status).toBe(200);
    expect((await api('login', { email: p.email, password: 'nouveau123' })).status).toBe(200);
    expect((await api('login', { email: p.email, password: p.password })).status).toBe(401);
  });

  it('changePassword: refuse un mot de passe trop court et un appel sans jeton', async () => {
    const p = await newParent();
    expect((await api('changePassword', { newPassword: '123' }, p.token)).status).toBe(400);
    expect((await api('changePassword', { newPassword: 'nouveau123' })).status).toBe(401);
  });

  it('les enfants (xp, or, tâches, PIN) survivent à un changement de mot de passe', async () => {
    const p = await newParent();
    p.family.children = [
      child('Alice', { xp: 120, gold: 30, pin: '1234', tasks: [{ id: 't1', name: 'Lire', xp: 10, gold: 1, done: false, frequency: 'daily' }] }),
      child('Bob', { xp: 5, pin: '5678' }),
    ];
    const before = await p.save(p.family);
    await api('changePassword', { newPassword: 'nouveau123' }, p.token);
    const login = await api('login', { email: p.email, password: 'nouveau123' });
    const after = login.body.families[0].children;
    expect(after.map(c => [c.name, c.xp, c.gold, c.pin])).toEqual(before.children.map(c => [c.name, c.xp, c.gold, c.pin]));
    expect(after[0].tasks.map(t => t.name)).toEqual(['Lire']);
  });
});

describe('familles', () => {
  it('createFamily: la nouvelle famille apparaît dans me; un nom vide est refusé', async () => {
    const p = await newParent();
    expect((await api('createFamily', { name: '  ' }, p.token)).status).toBe(400);
    const r = await api('createFamily', { name: 'Seconde famille' }, p.token);
    expect(r.status).toBe(200);
    expect(names(await p.me())).toContain('Seconde famille');
  });

  it('invite / removeAdult: le propriétaire gère les adultes, les autres sont refusés', async () => {
    const owner = await newParent();
    const other = await newParent();
    const fid = owner.family.id;

    expect((await api('invite', { familyId: fid, email: 'pas-un-email' }, owner.token)).status).toBe(400);
    expect((await api('invite', { familyId: fid, email: other.email }, other.token)).status).toBe(403);
    expect((await api('invite', { familyId: fid, email: other.email }, owner.token)).status).toBe(200);
    expect((await api('invite', { familyId: fid, email: other.email }, owner.token)).status).toBe(409);
    expect((await other.me()).some(f => f.id === fid)).toBe(true);

    expect((await api('removeAdult', { familyId: fid, email: owner.email }, owner.token)).status).toBe(400);
    expect((await api('removeAdult', { familyId: fid, email: other.email }, owner.token)).status).toBe(200);
    expect((await other.me()).some(f => f.id === fid)).toBe(false);
  });

  it('un adulte invité peut modifier la famille', async () => {
    const owner = await newParent();
    const other = await newParent();
    await api('invite', { familyId: owner.family.id, email: other.email }, owner.token);
    const fam = (await other.me()).find(f => f.id === owner.family.id);
    fam.children = [child('Zoé')];
    const saved = await other.save(fam);
    expect(names(saved.children)).toEqual(['Zoé']);
  });

  it('un étranger ne peut pas modifier la famille', async () => {
    const owner = await newParent();
    const stranger = await newParent();
    const r = await api('saveFamily', { family: owner.family }, stranger.token);
    expect(r.status).toBe(403);
  });
});

describe('enfants', () => {
  it('ajout, changement de PIN et suppression sont persistés', async () => {
    const p = await newParent();
    p.family.children = [child('Alice', { pin: '1234' }), child('Bob')];
    let f = await p.save(p.family);
    expect(names(f.children)).toEqual(['Alice', 'Bob']);

    f.children[0].pin = '5678';
    f = await p.save(f);
    expect((await p.me())[0].children[0].pin).toBe('5678');

    f.children = f.children.filter(c => c.name !== 'Alice');
    f = await p.save(f);
    expect(names(f.children)).toEqual(['Bob']);
    expect(names((await p.me())[0].children)).toEqual(['Bob']);
  });

  it('unlockChildDirect: bon PIN = jeton enfant; mauvais PIN ou enfant inconnu = 401', async () => {
    const p = await newParent();
    p.family.children = [child('Alice', { pin: '1234' })];
    await p.save(p.family);
    const ok = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Alice', pin: '1234' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect((await api('unlockChildDirect', { familyName: p.familyName, childName: 'Alice', pin: '0000' })).status).toBe(401);
    expect((await api('unlockChildDirect', { familyName: p.familyName, childName: 'Inconnu', pin: '1234' })).status).toBe(401);
    expect((await api('unlockChildDirect', { familyName: p.familyName, childName: 'Alice' })).status).toBe(400);
  });

  it('une note par enfant reste attachée à cet enfant', async () => {
    const p = await newParent();
    p.family.children = [child('Alice'), child('Bob')];
    p.family.children[0].notes = [{ id: 'n1', text: 'Très sage', createdAt: Date.now() }];
    const f = await p.save(p.family);
    expect(f.children.find(c => c.name === 'Alice').notes.map(n => n.text)).toEqual(['Très sage']);
    expect(f.children.find(c => c.name === 'Bob').notes).toEqual([]);
  });
});

describe('tâches', () => {
  const task = (over = {}) => ({ id: 't1', name: 'Faire son lit', xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null, ...over });

  it('ajout et suppression d\'une tâche sont persistés', async () => {
    const p = await newParent();
    p.family.children = [child('Alice', { tasks: [task()] })];
    let f = await p.save(p.family);
    expect(f.children[0].tasks.map(t => t.name)).toEqual(['Faire son lit']);
    f.children[0].tasks = [];
    f = await p.save(f);
    expect(f.children[0].tasks).toEqual([]);
  });

  it('la validation (done + completedAt, xp, or) est persistée', async () => {
    const p = await newParent();
    p.family.children = [child('Alice', { tasks: [task()] })];
    let f = await p.save(p.family);
    const at = Date.now();
    Object.assign(f.children[0].tasks[0], { done: true, completedAt: at });
    f.children[0].xp += 10; f.children[0].gold += 5;
    f = await p.save(f);
    const t = (await p.me())[0].children[0];
    expect([t.tasks[0].done, t.tasks[0].completedAt, t.xp, t.gold]).toEqual([true, at, 10, 5]);
  });

  it('l\'annulation d\'une coche non validée (sans date) est conservée', async () => {
    const p = await newParent();
    p.family.children = [child('Alice', { tasks: [task({ done: true, completedAt: null })] })];
    let f = await p.save(p.family);
    f.children[0].tasks[0].done = false;
    f = await p.save(f);
    expect(f.children[0].tasks[0].done).toBe(false);
  });
});

describe('boutique', () => {
  it('ajout et suppression d\'un article sont persistés', async () => {
    const p = await newParent();
    p.family.rewards = [{ id: 'r1', icon: '🍕', name: 'Pizza', cost: 25, lvl: 1 }];
    let f = await p.save(p.family);
    expect(names(f.rewards)).toContain('Pizza');
    f.rewards = f.rewards.filter(r => r.name !== 'Pizza');
    f = await p.save(f);
    expect(names(f.rewards)).not.toContain('Pizza');
    expect(names((await p.me())[0].rewards)).not.toContain('Pizza');
  });

  it('demande puis approbation: l\'achat est daté, un refus ne débite pas l\'enfant', async () => {
    const p = await newParent();
    p.family.children = [child('Alice', { gold: 100 })];
    p.family.requests = [
      { id: 'q1', child: 'Alice', name: 'Pizza', cost: 25, status: 'pending' },
      { id: 'q2', child: 'Alice', name: 'Jeu', cost: 40, status: 'pending' },
    ];
    let f = await p.save(p.family);
    f.requests.find(r => r.id === 'q1').status = 'approved';
    f.requests.find(r => r.id === 'q2').status = 'refused';
    f.children[0].gold -= 25;
    f = await p.save(f);
    expect(f.requests.find(r => r.id === 'q1').approvedAt).toBeGreaterThan(0);
    expect(f.requests.find(r => r.id === 'q2').approvedAt).toBeUndefined();
    expect(f.children[0].gold).toBe(75);
  });
});

describe('notes (scolaires)', () => {
  it('submitGrade sans jeton crée une demande en attente, approveGrade crédite l\'or', async () => {
    const p = await newParent();
    p.family.children = [child('Alice')];
    await p.save(p.family);
    const s = await api('submitGrade', { familyId: p.family.id, childName: 'Alice', subject: 'Maths', grade: '18/20', gold: 12 });
    expect(s.status).toBe(200);
    const pending = (await p.me())[0].gradeRequests;
    expect(pending.map(g => [g.subject, g.status])).toEqual([['Maths', 'pending']]);

    const a = await api('approveGrade', { familyId: p.family.id, gradeId: pending[0].id, gold: 15 }, p.token);
    expect(a.status).toBe(200);
    expect(a.body.child).toEqual({ name: 'Alice', gold: 15 });   // le client adopte ce solde, il ne l'ajoute pas lui-même
    const fam = (await p.me())[0];
    expect(fam.gradeRequests[0].status).toBe('approved');
    expect(fam.children[0].gold).toBe(15);
    expect((await api('approveGrade', { familyId: p.family.id, gradeId: pending[0].id }, p.token)).status).toBe(400);
  });

  it('submitGrade / approveGrade: champs manquants, note inconnue, non-membre', async () => {
    const p = await newParent();
    const stranger = await newParent();
    expect((await api('submitGrade', { familyId: p.family.id, childName: 'Alice' })).status).toBe(400);
    expect((await api('submitGrade', { familyId: 'nope', childName: 'A', subject: 'M', grade: '1/20', gold: 1 })).status).toBe(404);
    expect((await api('approveGrade', { familyId: p.family.id, gradeId: 'nope' }, p.token)).status).toBe(404);
    expect((await api('approveGrade', { familyId: p.family.id, gradeId: 'x' }, stranger.token)).status).toBe(403);
  });

  it('plusieurs notes se cumulent, même soumises pendant qu\'un parent enregistre une version périmée', async () => {
    const p = await newParent();
    p.family.children = [child('Alice')];
    const stale = await p.save(p.family);
    for (const [subject, grade] of [['Maths', '18/20'], ['Français', '15/20'], ['Histoire', '12/20']]) {
      await api('submitGrade', { familyId: p.family.id, childName: 'Alice', subject, grade, gold: 5 });
    }
    // le parent enregistre sa copie ancienne (sans les notes)
    const f = await p.save(stale);
    expect(f.gradeRequests.map(g => g.subject).sort()).toEqual(['Français', 'Histoire', 'Maths']);
  });

  it('gradeRequests stocké en objet indexé (anciennes données) est normalisé en tableau', async () => {
    const p = await newParent();
    p.family.children = [child('Alice')];
    p.family.gradeRequests = {
      0: { id: 'g0', child: 'Alice', subject: 'Maths', grade: '18/20', gold: 5, status: 'pending' },
      1: { id: 'g1', child: 'Alice', subject: 'Français', grade: '15/20', gold: 5, status: 'pending' },
    };
    const f = await p.save(p.family);
    expect(Array.isArray(f.gradeRequests)).toBe(true);
    expect(f.gradeRequests.map(g => g.id).sort()).toEqual(['g0', 'g1']);
  });
});

describe('sanctions', () => {
  it('catalogue et sanctions appliquées sont persistés; la suppression aussi', async () => {
    const p = await newParent();
    p.family.sanctionsList = [{ id: 's1', name: 'Insolence', gold: 10 }, { id: 's2', name: 'Retard', gold: 5 }];
    p.family.children = [child('Alice', { gold: 50 })];
    let f = await p.save(p.family);
    expect(names(f.sanctionsList)).toEqual(['Insolence', 'Retard']);

    f.children[0].gold -= 15;
    f.children[0].sanctions = [{ motif: 'Insolence', gold: 10, date: new Date().toISOString() }, { motif: 'Retard', gold: 5, date: new Date().toISOString() }];
    f = await p.save(f);
    let alice = (await p.me())[0].children[0];
    expect([alice.gold, alice.sanctions.length]).toEqual([35, 2]);

    f.children[0].sanctions = f.children[0].sanctions.slice(0, 1);
    f.children[0].gold += 5;
    f = await p.save(f);
    alice = (await p.me())[0].children[0];
    expect([alice.gold, alice.sanctions.map(s => s.motif)]).toEqual([40, ['Insolence']]);

    f.sanctionsList = f.sanctionsList.filter(s => s.name !== 'Retard');
    f = await p.save(f);
    expect(names(f.sanctionsList)).toEqual(['Insolence']);
  });
});

describe('niveaux (clé admin)', () => {
  const adminKey = 'cle-admin-de-test';
  beforeAll(() => { process.env.ADMIN_KEY = adminKey; });

  it('par défaut: 50 niveaux, 100 XP chacun; une clé invalide est refusée', async () => {
    const p = await newParent();
    expect((await api('getLevelConfig', { familyId: p.family.id, adminKey: 'mauvaise' })).status).toBe(403);
    const r = await api('getLevelConfig', { familyId: p.family.id, adminKey });
    expect(r.status).toBe(200);
    const levels = r.body.levelConfig.levels;
    expect(levels.length).toBe(50);
    expect(levels.every((l, i) => l.level === i + 1 && l.xpRequired === (i + 1) * 100)).toBe(true);
  });

  it('modification persistée; XP non croissant ou niveaux mal numérotés refusés; reset revient au défaut', async () => {
    const p = await newParent();
    const fam = { familyId: p.family.id, adminKey };
    const levels = [{ level: 1, xpRequired: 100 }, { level: 2, xpRequired: 150 }, { level: 3, xpRequired: 300 }];
    expect((await api('updateLevelConfig', { ...fam, levelConfig: { levels } })).status).toBe(200);
    const got = (await api('getLevelConfig', fam)).body.levelConfig.levels;
    expect(got.map(l => l.xpRequired)).toEqual([100, 150, 300]);

    const flat = [{ level: 1, xpRequired: 100 }, { level: 2, xpRequired: 100 }];
    expect((await api('updateLevelConfig', { ...fam, levelConfig: { levels: flat } })).status).toBe(400);
    const skipped = [{ level: 1, xpRequired: 100 }, { level: 3, xpRequired: 200 }];
    expect((await api('updateLevelConfig', { ...fam, levelConfig: { levels: skipped } })).status).toBe(400);

    expect((await api('resetLevelConfig', fam)).status).toBe(200);
    expect((await api('getLevelConfig', fam)).body.levelConfig.levels.length).toBe(50);
  });
});

describe('persistance', () => {
  it('ce qui est enregistré se retrouve après une nouvelle connexion', async () => {
    const p = await newParent();
    p.family.children = [child('Alice', { xp: 42 })];
    p.family.rewards = [{ id: 'r1', icon: '🎮', name: 'Jeu', cost: 30, lvl: 1 }];
    await p.save(p.family);
    const again = await api('login', { email: p.email, password: p.password });
    const f = again.body.families[0];
    expect([f.children[0].name, f.children[0].xp, names(f.rewards)]).toEqual(['Alice', 42, ['Jeu']]);
  });
});

describe('statistiques de tâches (getTaskStats)', () => {
  it('compte les tâches validées dans la période, ignore les anciennes, détaille par enfant', async () => {
    const p = await newParent();
    const done = (id, name, xp, gold, completedAt) => ({ id, name, xp, gold, frequency: 'daily', done: true, completedAt });
    const now = Date.now();
    p.family.children = [
      child('Alice', { tasks: [done('a', 'Lit', 10, 5, now), done('b', 'Devoirs', 30, 15, now), done('c', 'Ancienne', 99, 99, now - 400 * 86400000)] }),
      child('Bob', { tasks: [done('d', 'Chien', 16, 8, now)] }),
    ];
    const f = await p.save(p.family);
    const alice = f.children.find(c => c.name === 'Alice');

    const week = await api('getTaskStats', { childId: alice.id, period: 'week' });
    expect(week.status).toBe(200);
    expect([week.body.tasksCount, week.body.xpGained, week.body.goldGained]).toEqual([2, 40, 20]);
    expect(week.body.topTasks.map(t => t.name).sort()).toEqual(['Devoirs', 'Lit']);
    expect(week.body.childrenStats.map(c => c.tasks)).toEqual([2, 1]);
  });

  it('childId manquant = 400, enfant inconnu = 404', async () => {
    expect((await api('getTaskStats', {})).status).toBe(400);
    expect((await api('getTaskStats', { childId: 'child-inexistant' })).status).toBe(404);
  });
});

describe('clé admin', () => {
  const ADMIN_ACTIONS = ['getAdminStats', 'getLevelConfig', 'updateLevelConfig', 'resetLevelConfig', 'adminResetPassword', 'adminDeleteAccount', 'adminResetPin', 'adminDeleteFamily'];
  const saved = process.env.ADMIN_KEY;
  const restore = () => { if (saved === undefined) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = saved; };

  it('la clé "demo-admin-key" n\'ouvre aucune action admin', async () => {
    process.env.ADMIN_KEY = 'vraie-cle-secrete';
    const p = await newParent();
    for (const action of ADMIN_ACTIONS) {
      const r = await api(action, { adminKey: 'demo-admin-key', familyId: p.family.id, email: p.email, levelConfig: { levels: [{ level: 1, xpRequired: 1 }] } });
      expect(r.status, action).toBe(403);
    }
    // le compte n'a pas été touché
    expect((await api('login', { email: p.email, password: p.password })).status).toBe(200);
    restore();
  });

  it('sans ADMIN_KEY configurée, toutes les actions admin sont refusées, avec ou sans clé', async () => {
    delete process.env.ADMIN_KEY;
    const p = await newParent();
    for (const action of ADMIN_ACTIONS) {
      for (const adminKey of [undefined, '', 'undefined']) {
        const r = await api(action, { adminKey, familyId: p.family.id, email: p.email, levelConfig: { levels: [{ level: 1, xpRequired: 1 }] } });
        expect(r.status, `${action} / ${JSON.stringify(adminKey)}`).toBe(403);
      }
    }
    expect((await api('login', { email: p.email, password: p.password })).status).toBe(200);
    restore();
  });

  it('la clé configurée fonctionne: statistiques et réinitialisation de mot de passe', async () => {
    process.env.ADMIN_KEY = 'vraie-cle-secrete';
    const p = await newParent();
    expect((await api('getAdminStats', { adminKey: 'vraie-cle-secrete' })).status).toBe(200);
    expect((await api('getAdminStats', { adminKey: 'vraie-cle-secrete ' })).status).toBe(403);
    const r = await api('adminResetPassword', { adminKey: 'vraie-cle-secrete', email: p.email });
    expect(r.status).toBe(200);
    restore();
  });
});

describe('options de la famille', () => {
  it('l\'option « notifications par e-mail » est enregistrée et restituée', async () => {
    const p = await newParent();
    p.family.emailNotifications = true;
    const f = await p.save(p.family);
    expect(f.emailNotifications).toBe(true);
    expect((await p.me())[0].emailNotifications).toBe(true);
    f.emailNotifications = false;
    await p.save(f);
    expect((await p.me())[0].emailNotifications).toBe(false);
  });
});

