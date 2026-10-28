import { describe, it, expect } from 'vitest';
import { api, newParent } from './helpers.js';
import { getDateRange } from '../src/core.mjs';

const MIN = 60000;
const task = (id, name, over = {}) => ({ id, name, xp: 10, gold: 5, frequency: 'daily', done: false, completedAt: null, ...over });
const kid = (tasks = [], extra = {}) => ({ id: 'c-emma', name: 'Emma', xp: 0, gold: 0, tasks, grades: [], sanctions: [], ...extra });
const stats = async (period, childId = 'c-emma') => (await api('getTaskStats', { childId, period })).body;

async function setup(tasks = [], extra = {}) {
  const p = await newParent('hist');
  p.family.children = [kid(tasks, extra)];
  const base = await p.save(p.family);
  return { p, base };
}
// Valide une quête (date, XP, or), enregistre; puis (optionnel) la remet à faire comme le fait le changement de jour.
const validate = async (p, fam, id, at, { reset = true, child = 0 } = {}) => {
  const t = fam.children[child].tasks.find(x => x.id === id);
  Object.assign(t, { done: true, completedAt: at });
  let f = await p.save(fam);
  if (reset) { const t2 = f.children[child].tasks.find(x => x.id === id); Object.assign(t2, { done: false, resetAt: at + 1 }); f = await p.save(f); }
  return f;
};

describe('historique des statistiques', () => {
  it('une quête quotidienne validée 3 fois compte 3 fois (semaine, mois, année), pas une seule', async () => {
    const { p, base } = await setup([task('t1', 'Ranger sa chambre')]);
    const now = Date.now();
    let f = base;
    for (const at of [now - 40 * MIN, now - 30 * MIN, now - 20 * MIN]) f = await validate(p, f, 't1', at);
    for (const period of ['month', 'year']) {
      const s = await stats(period);
      expect([period, s.tasksCount, s.xpGained, s.goldGained]).toEqual([period, 3, 30, 15]);
    }
  });

  it('une quête unique terminée puis retirée reste dans l\'historique', async () => {
    const { p, base } = await setup([task('t1', 'Apprendre un verset', { frequency: 'unique' }), task('t2', 'Autre')]);
    let f = await validate(p, base, 't1', Date.now() - 10 * MIN, { reset: false });
    f.children[0].tasks = f.children[0].tasks.filter(t => t.id !== 't1');            // retirée au renouvellement
    await p.save(f);
    expect((await stats('year')).tasksCount).toBe(1);
  });

  it('une quête supprimée par le parent après validation garde son historique', async () => {
    const { p, base } = await setup([task('t1', 'Sortir le chien')]);
    let f = await validate(p, base, 't1', Date.now() - 5 * MIN, { reset: false });
    f.children[0].tasks = [];
    await p.save(f);
    expect((await stats('month')).tasksCount).toBe(1);
  });

  it('une copie périmée d\'un autre appareil n\'efface pas l\'historique', async () => {
    const { p, base } = await setup([task('t1', 'Faire son lit')]);
    const stale = structuredClone(base);
    const now = Date.now();
    let f = base;
    for (const at of [now - 30 * MIN, now - 20 * MIN, now - 10 * MIN]) f = await validate(p, f, 't1', at);
    stale.updatedAt = f.updatedAt;
    await p.save(stale);                                                              // un appareil resté sur l'ancienne liste de quêtes
    expect((await stats('year')).tasksCount).toBe(3);
  });

  it('ne compte pas deux fois une validation présente à la fois dans la quête et dans le journal d\'actions', async () => {
    const at = Date.now() - 15 * MIN;
    const { p, base } = await setup([task('t1', 'Mettre la table')]);
    base.actionLog = [{ timestamp: at + 40, userId: 'Parent', actionType: 'task_approved', target: 'Mettre la table', details: { child: 'Emma', xp: 10, gold: 5 }, status: 'success' }];
    await validate(p, base, 't1', at, { reset: false });
    expect((await stats('year')).tasksCount).toBe(1);
  });

  it('retrouve l\'historique passé grâce au journal d\'actions (quêtes déjà remises à faire ou supprimées)', async () => {
    const now = Date.now();
    const { p, base } = await setup([]);
    base.actionLog = [30, 20, 10].map(m => ({ timestamp: now - m * MIN, userId: 'Parent', actionType: 'task_approved', target: 'Faire ses devoirs', details: { child: 'Emma', xp: 30, gold: 15 }, status: 'success' }))
      .concat([{ timestamp: now - 5 * MIN, userId: 'Parent', actionType: 'task_approved', target: 'Raté', details: { child: 'Emma' }, status: 'failed' },
               { timestamp: now - 6 * MIN, userId: 'Parent', actionType: 'task_approved', target: 'Autre enfant', details: { child: 'Lucas', xp: 99, gold: 99 }, status: 'success' }]);
    await p.save(base);
    const s = await stats('year');
    expect([s.tasksCount, s.xpGained, s.goldGained]).toEqual([3, 90, 45]);
  });

  it('renvoie la liste des tâches accomplies (la plus récente d\'abord) pour l\'écran Historique', async () => {
    const now = Date.now();
    const { p, base } = await setup([task('t1', 'A'), task('t2', 'B')]);
    let f = await validate(p, base, 't1', now - 30 * MIN);
    f = await validate(p, f, 't2', now - 20 * MIN);
    f = await validate(p, f, 't1', now - 10 * MIN);
    const h = (await stats('year')).history;
    expect(h.map(e => e.name)).toEqual(['A', 'B', 'A']);
    expect(h[0]).toMatchObject({ name: 'A', xp: 10, gold: 5 });
    expect(h[0].at).toBe(now - 10 * MIN);
  });

  it('les statistiques des autres enfants (tableau comparatif) comptent aussi toutes les validations', async () => {
    const p = await newParent('hist');
    p.family.children = [kid([task('t1', 'A')]), { ...kid([task('t2', 'B')]), id: 'c-lucas', name: 'Lucas' }];
    let f = await p.save(p.family);
    const now = Date.now();
    for (const at of [now - 30 * MIN, now - 20 * MIN]) f = await validate(p, f, 't2', at, { child: 1 });
    const s = await stats('year', 'c-emma');
    expect(s.childrenStats.map(c => c.tasks)).toEqual([0, 2]);
  });
});

describe('périodes', () => {
  it('la semaine commence le lundi et finit le dimanche (heure de Paris)', () => {
    const wed = getDateRange('week', Date.parse('2026-10-28T12:00:00Z'));
    expect(new Date(wed.start).toISOString()).toBe('2026-10-25T23:00:00.000Z');          // lundi 26 octobre 00:00 (UTC+1)
    expect(new Date(wed.end).toISOString()).toBe('2026-11-01T22:59:59.999Z');            // dimanche 1er novembre 23:59
    const sun = getDateRange('week', Date.parse('2026-11-01T12:00:00Z'));
    expect(new Date(sun.start).toISOString()).toBe('2026-10-25T23:00:00.000Z');          // le dimanche appartient à la même semaine
    const mon = getDateRange('week', Date.parse('2026-10-26T08:00:00Z'));
    expect(new Date(mon.start).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('une validation juste après minuit (Paris) est rangée dans le bon jour', async () => {
    const ymd = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const parisHm = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    const [y, m, d] = ymd.split('-').map(Number);
    const at = [-2, -1, 0].map(h => Date.UTC(y, m - 1, d - 1, 22 + 2 + h, 30)).concat([Date.UTC(y, m - 1, d, 0, 30)]).find(ms => parisHm(ms) === '00:30' && new Date(ms).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }) === ymd);
    const { p, base } = await setup([task('t1', 'Nuit')]);
    await validate(p, base, 't1', at, { reset: false });
    const day = (await stats('year')).dailyBreakdown;
    expect(Object.keys(day)).toEqual([ymd]);
  });
});

describe('suppression', () => {
  it('le journal des validations est supprimé avec la famille', async () => {
    const { p, base } = await setup([task('t1', 'A')]);
    await validate(p, base, 't1', Date.now() - 5 * MIN, { reset: false });
    expect((await stats('year')).tasksCount).toBe(1);
    expect((await api('deleteFamily', { familyId: p.family.id }, p.token)).status).toBe(200);
    expect((await api('getTaskStats', { childId: 'c-emma', period: 'year' })).status).toBe(404);
  });
});
