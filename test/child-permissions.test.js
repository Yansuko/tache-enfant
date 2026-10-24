import { describe, it, expect } from 'vitest';
import { api, newParent } from './helpers.js';

const task = (id, name, over = {}) => ({ id, name, xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null, ...over });

// Famille avec 2 enfants (PIN), une boutique, des sanctions; renvoie aussi la session enfant d'Emma.
async function setup() {
  const p = await newParent('perm');
  p.family.children = [
    { id: 'c-emma', name: 'Emma', xp: 0, gold: 100, pin: '1234', tasks: [task('t-lit', 'Faire son lit')], grades: [], sanctions: [] },
    { id: 'c-lucas', name: 'Lucas', xp: 0, gold: 0, pin: '4321', tasks: [task('t-chien', 'Sortir le chien')], grades: [], sanctions: [] },
  ];
  p.family.rewards = [{ id: 'r1', name: 'Pizza', cost: 25, lvl: 1 }];
  p.family.sanctionsList = [{ id: 's1', name: 'Retard', gold: 5 }];
  p.family.questList = [{ id: 'q1', name: 'Ranger', xp: 20, gold: 10, frequency: 'daily' }];
  const staleCopy = await p.save(p.family);                      // ce que l'appareil de l'enfant a chargé
  const unlock = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
  expect(unlock.status).toBe(200);
  const childSave = async (family) => { const r = await api('saveFamily', { family }, unlock.body.token); expect(r.status).toBe(200); return r.body.family; };
  return { p, staleCopy: structuredClone(staleCopy), childSave, childToken: unlock.body.token };
}

describe('un appareil enfant ne peut écrire que ses quêtes, ses demandes et ses propositions', () => {
  it('une copie périmée ne réécrit pas l\'XP et l\'or crédités entre-temps par le parent', async () => {
    const { p, staleCopy, childSave } = await setup();
    const fresh = structuredClone(staleCopy);                    // le parent valide la quête (xp, or, date)
    Object.assign(fresh.children[0].tasks[0], { done: true, completedAt: Date.now() });
    fresh.children[0].xp = 10; fresh.children[0].gold = 105;
    await p.save(fresh);

    const f = await childSave(staleCopy);                        // l'enfant pousse son ancienne copie
    expect([f.children[0].xp, f.children[0].gold]).toEqual([10, 105]);
    expect(f.children[0].tasks[0].done).toBe(true);
  });

  it('une copie périmée ne supprime ni les articles, ni les sanctions, ni les modèles du parent', async () => {
    const { p, staleCopy, childSave } = await setup();
    const fresh = structuredClone(staleCopy);
    fresh.rewards.push({ id: 'r2', name: 'Cinéma', cost: 60, lvl: 2 });
    fresh.sanctionsList.push({ id: 's2', name: 'Insolence', gold: 10 });
    fresh.questList.push({ id: 'q2', name: 'Lire', xp: 15, gold: 5, frequency: 'daily' });
    await p.save(fresh);

    const f = await childSave(staleCopy);
    expect(f.rewards.map(r => r.name).sort()).toEqual(['Cinéma', 'Pizza']);
    expect(f.sanctionsList.map(s => s.name).sort()).toEqual(['Insolence', 'Retard']);
    expect(f.questList.map(q => q.name).sort()).toEqual(['Lire', 'Ranger']);
  });

  it('l\'enfant peut cocher sa quête et demander un achat', async () => {
    const { p, staleCopy, childSave } = await setup();
    const copy = structuredClone(staleCopy);
    copy.children[0].tasks[0].done = true;
    copy.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending' }];
    copy.requests = [{ id: 'rq1', child: 'Emma', name: 'Pizza', cost: 25, status: 'pending' }];
    copy.proposals = [{ id: 'pp1', child: 'Emma', name: 'Piscine', cost: 60, status: 'pending' }];
    await childSave(copy);
    const f = (await p.me())[0];
    expect(f.children[0].tasks[0].done).toBe(true);
    expect(f.taskRequests.map(r => r.id)).toEqual(['tr1']);
    expect(f.requests.map(r => r.id)).toEqual(['rq1']);
    expect(f.proposals.map(r => r.id)).toEqual(['pp1']);
  });

  it('l\'enfant ne peut ni modifier les quêtes d\'un frère, ni supprimer un enfant, ni changer un PIN', async () => {
    const { p, staleCopy, childSave } = await setup();
    const copy = structuredClone(staleCopy);
    copy.children[1].tasks[0].done = true;
    copy.children[1].gold = 999;
    copy.children[0].pin = '0000';
    await childSave(copy);
    let f = (await p.me())[0];
    expect([f.children[1].tasks[0].done, f.children[1].gold, f.children[0].pin]).toEqual([false, 0, '1234']);

    const without = structuredClone(staleCopy);
    without.children = without.children.filter(c => c.name === 'Emma');
    await childSave(without);
    f = (await p.me())[0];
    expect(f.children.map(c => c.name)).toEqual(['Emma', 'Lucas']);
  });
});

describe('un statut final posé par le parent ne revient jamais en attente', () => {
  it('demande d\'achat, validation de quête et proposition restent traitées malgré une copie périmée', async () => {
    const { p, staleCopy, childSave } = await setup();
    const withPending = structuredClone(staleCopy);
    withPending.requests = [{ id: 'rq1', child: 'Emma', name: 'Pizza', cost: 25, status: 'pending' }];
    withPending.taskRequests = [{ id: 'tr1', child: 'Emma', taskIndex: 0, taskName: 'Faire son lit', xp: 10, gold: 5, status: 'pending' }];
    withPending.proposals = [{ id: 'pp1', child: 'Emma', name: 'Piscine', cost: 60, status: 'pending' }];
    await childSave(withPending);                                   // l'enfant a posé ses demandes

    const parentView = (await p.me())[0];                           // le parent les traite
    parentView.requests[0].status = 'approved';
    parentView.taskRequests[0].status = 'approved';
    parentView.proposals[0].status = 'approved';
    await p.save(parentView);

    const f = await childSave(withPending);                         // l'enfant repousse sa copie périmée (encore "pending")
    expect([f.requests[0].status, f.taskRequests[0].status, f.proposals[0].status]).toEqual(['approved', 'approved', 'approved']);

    const stalePendingFromParent = structuredClone(withPending);    // un second parent périmé aussi
    const g = await p.save(stalePendingFromParent);
    expect([g.requests[0].status, g.taskRequests[0].status, g.proposals[0].status]).toEqual(['approved', 'approved', 'approved']);
  });
});

describe('un jeton enfant est lié à sa famille', () => {
  async function twoFamiliesWithEmma() {
    const mk = async (gold) => {
      const p = await newParent('twin');
      p.family.children = [{ id: `c-${gold}`, name: 'Emma', xp: 0, gold, pin: '1234', tasks: [], grades: [], sanctions: [] }];
      p.family = await p.save(p.family);
      const u = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
      expect(u.status).toBe(200);
      return { ...p, childToken: u.body.token };
    };
    return [await mk(111), await mk(222)];
  }

  it('l\'Emma de la famille B ne voit que sa propre famille', async () => {
    const [a, b] = await twoFamiliesWithEmma();
    const res = await api('me', {}, b.childToken);
    expect(res.status).toBe(200);
    expect(res.body.families.map(f => f.id)).toEqual([b.family.id]);
    expect(res.body.families[0].children[0].gold).toBe(222);
    expect((await api('me', {}, a.childToken)).body.families.map(f => f.id)).toEqual([a.family.id]);
  });

  it('l\'Emma de la famille A ne peut rien écrire dans la famille B', async () => {
    const [a, b] = await twoFamiliesWithEmma();
    const forged = structuredClone(b.family);
    forged.children[0].tasks = [{ id: 'x', name: 'Intrus', xp: 1, gold: 1, done: false }];
    const r = await api('saveFamily', { family: forged }, a.childToken);
    expect(r.status).toBe(403);
    expect((await b.me())[0].children[0].tasks).toEqual([]);
  });

  it('un ancien jeton « Prénom@enfant.local » (sans famille) est refusé', async () => {
    const { signToken } = await import('../src/core.mjs');
    process.env.JWT_SECRET = 'secret-de-test';
    const [a] = await twoFamiliesWithEmma();                           // le secret est lu à chaque appel: ces jetons sont signés avec
    const sameSecret = await api('unlockChildDirect', { familyName: a.familyName, childName: 'Emma', pin: '1234' });
    expect((await api('me', {}, sameSecret.body.token)).status).toBe(200);
    const legacy = signToken('Emma@enfant.local', 'secret-de-test');
    expect((await api('me', {}, legacy)).status).toBe(401);
    delete process.env.JWT_SECRET;
  });
});

