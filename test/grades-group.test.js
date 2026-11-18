import { describe, it, expect, beforeAll } from 'vitest';

let G;
beforeAll(async () => {
  await import('../public/grades.js');
  G = globalThis.Grades;
});

const kids = [{ name: 'Lucas' }, { name: 'Emma' }];   // ordre de la famille
let n = 0;
const g = (child, subject, grade, status = 'approved', over = {}) => ({ id: `g${++n}`, child, subject, grade, gold: 5, status, submittedAt: n * 1000, ...over });

describe('Grades.groupGrades', () => {
  it('une section par enfant, dans l\'ordre de la famille, listes séparées', () => {
    const reqs = [g('Emma', 'Maths', '15'), g('Lucas', 'Maths', '12', 'pending'), g('Emma', 'Français', '8', 'refused'), g('Emma', 'Maths', '14', 'pending')];
    const out = G.groupGrades(reqs, kids, null);
    expect(out.map(s => s.child)).toEqual(['Lucas', 'Emma']);
    const [lucas, emma] = out;
    expect(lucas).toMatchObject({ pending: 1, count: 0, avg: null });
    expect(lucas.pendingList.map(r => r.grade)).toEqual(['12']);
    expect(emma.pendingList.map(r => r.grade)).toEqual(['14']);
    expect(emma.approvedList.map(r => r.grade)).toEqual(['15']);
    expect(emma.refusedList.map(r => r.grade)).toEqual(['8']);
    expect(emma).toMatchObject({ pending: 1, count: 1, avg: 15 });
  });

  it('approuvées triées par date décroissante (approvedAt ?? submittedAt)', () => {
    const reqs = [
      g('Emma', 'A', '10', 'approved', { submittedAt: 1, approvedAt: 50 }),
      g('Emma', 'B', '11', 'approved', { submittedAt: 100 }),
      g('Emma', 'C', '12', 'approved', { submittedAt: 2, approvedAt: 10 }),
    ];
    expect(G.groupGrades(reqs, kids, null)[1].approvedList.map(r => r.subject)).toEqual(['B', 'A', 'C']);
  });

  it('moyenne: « 15,5 », « 17/20 », « TB » (échelle perso); note invalide ignorée mais affichée', () => {
    const scale = [{ labels: ['tb'], value: 19 }];
    const reqs = [g('Emma', 'Maths', '15,5'), g('Emma', 'Maths', '17/20'), g('Emma', 'Français', 'TB'), g('Emma', 'Français', 'abc')];
    const emma = G.groupGrades(reqs, kids, scale)[1];
    expect(emma.avg).toBeCloseTo((15.5 + 17 + 19) / 3);
    expect(emma.count).toBe(4);
    expect(emma.approvedList).toHaveLength(4);
    expect(emma.bySubject).toEqual([
      { subject: 'Français', avg: 19, count: 2 },
      { subject: 'Maths', avg: 16.25, count: 2 },
    ]);
  });

  it('avg null sans note convertible', () => {
    const emma = G.groupGrades([g('Emma', 'Maths', 'xx')], kids, null)[1];
    expect(emma.avg).toBeNull();
    expect(emma.bySubject).toEqual([{ subject: 'Maths', avg: null, count: 1 }]);
  });

  it('filtres enfant et matière', () => {
    const reqs = [g('Emma', 'Maths', '15'), g('Emma', 'Français', '10'), g('Lucas', 'Maths', '12', 'pending')];
    const byChild = G.groupGrades(reqs, kids, null, { child: 'Emma' });
    expect(byChild.map(s => s.child)).toEqual(['Emma']);
    expect(byChild[0].avg).toBe(12.5);
    const bySubject = G.groupGrades(reqs, kids, null, { subject: 'Maths' });
    expect(bySubject.map(s => [s.child, s.avg, s.pending])).toEqual([['Lucas', null, 1], ['Emma', 15, 0]]);
    expect(bySubject[1].bySubject.map(s => s.subject)).toEqual(['Maths']);
    expect(G.groupGrades(reqs, kids, null, { child: 'Emma', subject: 'Français' })[0].approvedList.map(r => r.grade)).toEqual(['10']);
  });

  it('enfant inconnu ignoré; entrée vide ou absente', () => {
    expect(G.groupGrades([g('Fantôme', 'Maths', '15')], kids, null).every(s => s.count === 0 && !s.pendingList.length)).toBe(true);
    expect(G.groupGrades([], kids, null).map(s => s.child)).toEqual(['Lucas', 'Emma']);
    expect(G.groupGrades(undefined, [], null)).toEqual([]);
    expect(G.groupGrades([null, g('Emma', 'Maths', '15')], kids, null)[1].count).toBe(1);
  });
});

describe('Grades.subjects', () => {
  it('matières distinctes triées', () => {
    expect(G.subjects([g('Emma', 'Maths', '1'), g('Lucas', 'Français', '2'), g('Emma', 'Maths', '3'), null])).toEqual(['Français', 'Maths']);
    expect(G.subjects(undefined)).toEqual([]);
  });
});
