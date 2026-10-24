import { describe, it, expect, beforeAll } from 'vitest';

let R;
beforeAll(async () => {
  await import('../public/rollover.js');
  R = globalThis.Rollover;
});

// 2026-10-24 est un samedi; la semaine commence le lundi 2026-10-19.
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const TODAY = '2026-10-24';
const NOW = at(2026, 10, 24);
const task = (over) => ({ id: 't', name: 'x', xp: 1, gold: 0, done: true, ...over });

describe('rolloverTasks', () => {
  it('quotidienne terminée hier: remise à faire, avec resetAt', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'daily', completedAt: at(2026, 10, 23) })], TODAY, NOW);
    expect(t.done).toBe(false);
    expect(t.resetAt).toBe(NOW);
  });

  it('sans fréquence = quotidienne', () => {
    const [t] = R.rolloverTasks([task({ completedAt: at(2026, 10, 17) })], TODAY, NOW);
    expect(t.done).toBe(false);
  });

  it('hebdomadaire terminée la semaine dernière: remise à faire', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'weekly', completedAt: at(2026, 10, 18) })], TODAY, NOW);
    expect(t.done).toBe(false);
  });

  it('hebdomadaire terminée cette semaine: reste faite', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'weekly', completedAt: at(2026, 10, 20) })], TODAY, NOW);
    expect(t.done).toBe(true);
  });

  it('mensuelle terminée le mois dernier: remise à faire', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'monthly', completedAt: at(2026, 9, 30) })], TODAY, NOW);
    expect(t.done).toBe(false);
  });

  it('mensuelle terminée ce mois-ci: reste faite', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'monthly', completedAt: at(2026, 10, 2) })], TODAY, NOW);
    expect(t.done).toBe(true);
  });

  it('unique terminée: disparaît; unique non terminée: reste', () => {
    const out = R.rolloverTasks([
      task({ id: 'a', frequency: 'unique', completedAt: at(2026, 10, 23) }),
      task({ id: 'b', frequency: 'unique', done: false, completedAt: null }),
    ], TODAY, NOW);
    expect(out.map(t => t.id)).toEqual(['b']);
  });

  it('quotidienne terminée aujourd\'hui reste faite', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'daily', completedAt: at(2026, 10, 24) })], TODAY, NOW);
    expect(t.done).toBe(true);
  });
});
