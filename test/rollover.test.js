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

  it('dédoublonne les tâches identiques à faire (même nom, xp, or, fréquence)', () => {
    const base = { name: 'Ranger sa chambre', xp: 20, gold: 10, frequency: 'daily', done: false, completedAt: null };
    const out = R.rolloverTasks([{ ...base, id: 'a' }, { ...base, id: 'b' }, { ...base, id: 'c' }], TODAY, NOW);
    expect(out.map(t => t.id)).toEqual(['a']);
  });

  it('dédoublonne après remise à faire (anciennes copies faites il y a des jours)', () => {
    const base = { name: 'Sortir le chien', xp: 16, gold: 8, frequency: 'daily', done: true, completedAt: at(2026, 10, 16) };
    const out = R.rolloverTasks([{ ...base, id: 'a' }, { ...base, id: 'b' }], TODAY, NOW);
    expect(out.length).toBe(1);
    expect(out[0].done).toBe(false);
  });

  it('garde les tâches qui diffèrent (xp différent)', () => {
    const base = { name: 'Lire', gold: 1, frequency: 'daily', done: false };
    const out = R.rolloverTasks([{ ...base, id: 'a', xp: 10 }, { ...base, id: 'b', xp: 20 }], TODAY, NOW);
    expect(out.length).toBe(2);
  });

  it('garde une tâche faite aujourd\'hui ET sa réassignation à faire', () => {
    const base = { name: 'Faire son lit', xp: 10, gold: 5, frequency: 'daily' };
    const out = R.rolloverTasks([
      { ...base, id: 'a', done: true, completedAt: at(2026, 10, 24) },
      { ...base, id: 'b', done: false, completedAt: null },
    ], TODAY, NOW);
    expect(out.map(t => t.id)).toEqual(['a', 'b']);
  });

  it('une tâche cochée par l\'enfant en attente de validation (sans date) n\'est pas réinitialisée', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'daily', completedAt: null })], TODAY, NOW);
    expect(t.done).toBe(true);
  });

  it('au changement de jour, une tâche jamais validée est remise à faire', () => {
    const [t] = R.rolloverTasks([task({ frequency: 'daily', completedAt: null })], TODAY, NOW, { dayChanged: true });
    expect(t.done).toBe(false);
  });
});

describe('mergeValidations (PULL: validations locales vs tâches serveur)', () => {
  const base = { name: 'Faire son lit', xp: 10, gold: 5, frequency: 'daily' };
  const local = { ...base, id: 'old', done: true, completedAt: NOW - 1000 };

  it('une tâche réassignée (autre id) reste à faire malgré une validation locale du même nom', () => {
    const out = R.mergeValidations([{ ...base, id: 'new', done: false, completedAt: null }], [local]);
    expect(out[0].done).toBe(false);
  });

  it('même id, serveur périmé: la validation locale est conservée', () => {
    const out = R.mergeValidations([{ ...base, id: 'old', done: false, completedAt: null }], [local]);
    expect(out[0].done).toBe(true);
    expect(out[0].completedAt).toBe(NOW - 1000);
  });

  it('même id, serveur remis à faire après la validation locale (resetAt): le serveur gagne', () => {
    const out = R.mergeValidations([{ ...base, id: 'old', done: false, completedAt: local.completedAt, resetAt: NOW }], [local]);
    expect(out[0].done).toBe(false);
  });

  it('le serveur déjà validé est repris tel quel', () => {
    const srv = { ...base, id: 'old', done: true, completedAt: NOW - 5 };
    expect(R.mergeValidations([srv], [local])[0]).toEqual(srv);
  });

  it('anciennes tâches sans id: repli sur nom|xp', () => {
    const out = R.mergeValidations([{ ...base, done: false, completedAt: null }], [{ ...local, id: undefined }]);
    expect(out[0].done).toBe(true);
  });
});
