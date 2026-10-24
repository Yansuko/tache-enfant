import { describe, it, expect } from 'vitest';
import { api, newParent } from './helpers.js';

const wait = (ms = 5) => new Promise(r => setTimeout(r, ms));
const task = (id, name, over = {}) => ({ id, name, xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null, ...over });

async function setup() {
  const p = await newParent('adds');
  p.family.children = [{ id: 'c-emma', name: 'Emma', xp: 0, gold: 100, pin: '1234', tasks: [task('t-old', 'Ranger sa chambre', { done: true, completedAt: Date.now() })], grades: [], sanctions: [] }];
  p.family.questList = [{ id: 'q-old', name: 'Ancien modèle', xp: 5, gold: 1, frequency: 'daily' }];
  p.family.rewards = [{ id: 'r-old', name: 'Ancien article', cost: 10, lvl: 1 }];
  const base = await p.save(p.family);
  const stale = () => structuredClone(base);                 // copie d'un appareil qui n'a pas synchronisé depuis
  const u = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
  const childSave = async (f) => (await api('saveFamily', { family: f }, u.body.token)).body.family;
  await wait();
  return { p, base, stale, childSave };
}

describe('ce qui est ajouté pendant qu\'un appareil est en retard n\'est pas supprimé par lui', () => {
  it('appareil enfant: une quête ajoutée par le parent survit à la synchro de l\'enfant (cas signalé)', async () => {
    const { p, stale, childSave } = await setup();
    const child = stale();                                    // l'enfant a chargé avant l'ajout
    const parent = (await p.me())[0];
    parent.children[0].tasks.push(task('t-new', 'Ranger sa chambre'));
    await p.save(parent);                                     // le parent ajoute la quête depuis un modèle déjà validé
    const f = await childSave(child);                         // l'enfant synchronise avec sa copie ancienne
    expect(f.children[0].tasks.map(t => t.id).sort()).toEqual(['t-new', 't-old']);
    expect(f.children[0].tasks.find(t => t.id === 't-old').done).toBe(true);
    expect((await p.me())[0].children[0].tasks.map(t => t.id).sort()).toEqual(['t-new', 't-old']);
  });

  it('appareil enfant: il ne peut pas créer de quête', async () => {
    const { stale, childSave } = await setup();
    const child = stale();
    child.children[0].tasks.push(task('t-fake', 'Quête inventée', { xp: 999 }));
    const f = await childSave(child);
    expect(f.children[0].tasks.map(t => t.id)).toEqual(['t-old']);
  });

  it('second appareil parent en retard: ses modifications ne suppriment ni quête, ni modèle, ni article, ni enfant ajoutés entre-temps', async () => {
    const { p, stale } = await setup();
    const other = stale();
    const a = (await p.me())[0];
    a.children[0].tasks.push(task('t-new', 'Nouvelle quête'));
    a.questList.push({ id: 'q-new', name: 'Nouveau modèle', xp: 7, gold: 2, frequency: 'daily' });
    a.rewards.push({ id: 'r-new', name: 'Nouvel article', cost: 30, lvl: 1 });
    a.children.push({ id: 'c-lucas', name: 'Lucas', xp: 0, gold: 0, tasks: [], grades: [], sanctions: [] });
    await p.save(a);
    other.children[0].gold += 3;                              // l'autre appareil (périmé) fait un changement sans rapport
    const f = await p.save(other);
    expect(f.children.map(c => c.name)).toEqual(['Emma', 'Lucas']);
    expect(f.children[0].tasks.map(t => t.id).sort()).toEqual(['t-new', 't-old']);
    expect(f.questList.map(q => q.id).sort()).toEqual(['q-new', 'q-old']);
    expect(f.rewards.map(r => r.name).sort()).toEqual(['Ancien article', 'Nouvel article']);
  });

  it('une suppression faite par un appareil à jour est bien appliquée', async () => {
    const { p } = await setup();
    const a = (await p.me())[0];
    a.children[0].tasks = [];
    a.questList = [];
    a.rewards = [];
    const f = await p.save(a);
    expect([f.children[0].tasks.length, f.questList.length, f.rewards.length]).toEqual([0, 0, 0]);
  });

  it('une suppression reste appliquée à la synchro suivante', async () => {
    const { p } = await setup();
    const a = (await p.me())[0];
    a.questList = [];
    let f = await p.save(a);
    await wait();
    f = await p.save(f);
    expect(f.questList).toEqual([]);
  });

  it('appareil enfant: il peut retirer une quête unique terminée (renouvellement du jour), pas une autre', async () => {
    const { p, stale, childSave } = await setup();
    const parent = (await p.me())[0];
    parent.children[0].tasks.push(task('t-unique', 'Quête unique', { frequency: 'unique', done: true, completedAt: Date.now() - 1000 }), task('t-daily', 'Quête du jour'));
    await p.save(parent);
    await wait();
    const child = (await p.me())[0];
    child.children[0].tasks = child.children[0].tasks.filter(t => t.id !== 't-unique' && t.id !== 't-daily');   // l'enfant n'a gardé ni l'unique faite, ni la quotidienne
    const f = await childSave(child);
    const ids = f.children[0].tasks.map(t => t.id).sort();
    expect(ids).toEqual(['t-daily', 't-old']);                    // l'unique terminée est retirée, la quotidienne est conservée
  });
});

