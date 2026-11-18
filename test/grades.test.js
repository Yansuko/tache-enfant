import { describe, it, expect, beforeAll } from 'vitest';
import { api, newParent } from './helpers.js';

let G;
beforeAll(async () => {
  await import('../public/grades.js');
  G = globalThis.Grades;
});

const v = (raw, scale) => G.parseGrade(raw, scale);

describe('Grades.parseGrade', () => {
  it('nombres, décimaux, fractions', () => {
    expect(v('15')).toEqual({ ok: true, value20: 15, text: '15' });
    expect(v('15,5')).toEqual({ ok: true, value20: 15.5, text: '15,5' });
    expect(v(' 15.5 ')).toEqual({ ok: true, value20: 15.5, text: '15.5' });
    expect(v('17/20').value20).toBe(17);
    expect(v('8,5/10').value20).toBe(17);
    expect(v('0').value20).toBe(0);
    expect(v('20').value20).toBe(20);
  });
  it('appréciations du tableau par défaut', () => {
    for (const s of ['TB', 'tb', 'T.B.', 'très bien']) expect(v(s)).toMatchObject({ ok: true, value20: 18 });
    expect(v('Assez Bien').value20).toBe(12);
    expect(v('ab').value20).toBe(12);
    expect(v('b').value20).toBe(15);
    expect(v('TB').text).toBe('TB');
  });
  it('rejets', () => {
    for (const s of ['abc', '15,5€', '', '   ', '-3', '25/20', '5/0', '1e3', '15,5,5', 'NaN', '21', '20,5', null, undefined]) {
      expect(v(s), String(s)).toEqual({ ok: false });
    }
  });
  it('saisie démesurée refusée (pas d\'Infinity/NaN)', () => {
    expect(v('9'.repeat(400) + '/' + '9'.repeat(400))).toEqual({ ok: false });
    expect(v('1/' + '9'.repeat(400))).toEqual({ ok: false });
    expect(v('0'.repeat(40) + '15')).toEqual({ ok: false });
  });
  it('isNumber: forme numérique (même hors échelle)', () => {
    for (const s of ['15', '15,5', '25/20', ' 8/10 ']) expect(G.isNumber(s), s).toBe(true);
    for (const s of ['tb', '15€', '', 'a/b']) expect(G.isNumber(s), s).toBe(false);
  });
  it('échelle personnalisée', () => {
    const scale = [...G.DEFAULT_SCALE, { labels: ['insuffisant'], value: 6 }];
    expect(v('Insuffisant', scale).value20).toBe(6);
    expect(v('insuffisant').ok).toBe(false);   // absent du tableau par défaut
    expect(v('TB', [{ labels: ['tb'], value: 10 }]).value20).toBe(10);
  });
  it('normLabel', () => {
    expect(G.normLabel('  T.B. ')).toBe('tb');
    expect(G.normLabel('Très   Bien')).toBe('tres bien');
    expect(G.normLabel('T. B.')).toBe('tb');
    expect(G.normLabel('a b c')).toBe('abc');
    expect(G.normLabel('assez  bien')).toBe('assez bien');
    for (const s of ['T. B.', 't b', 'très bien', 'tres  bien', 'A. B.']) expect(v(s).ok, s).toBe(true);
  });
});

async function setup() {
  const p = await newParent('grades');
  p.family.children = [{ id: 'c-emma', name: 'Emma', xp: 0, gold: 0, pin: '1234', tasks: [], grades: [], sanctions: [] }];
  const fam = await p.save(p.family);
  const submit = grade => api('submitGrade', { familyId: fam.id, childName: 'Emma', subject: 'Maths', grade, gold: 5 });
  return { p, fam, submit };
}

describe('submitGrade / approveGrade', () => {
  it('submitGrade refuse une note invalide, accepte 15,5 et TB', async () => {
    const { p, submit } = await setup();
    const bad = await submit('abc');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Note invalide.');
    expect((await submit('15,5')).status).toBe(200);
    expect((await submit(' TB ')).status).toBe(200);
    expect((await p.me())[0].gradeRequests.map(g => g.grade)).toEqual(['15,5', 'TB']);
  });

  it('submitGrade: réponse minimale (ni pin, ni members, ni autres enfants)', async () => {
    const { p, fam } = await setup();
    await p.save({ ...fam, children: [...fam.children, { id: 'c-lucas', name: 'Lucas', xp: 0, gold: 0, pin: '4321', tasks: [], grades: [], sanctions: [] }] });
    await api('submitGrade', { familyId: fam.id, childName: 'Lucas', subject: 'Maths', grade: '12', gold: 1 });
    const r = await api('submitGrade', { familyId: fam.id, childName: 'Emma', subject: 'Maths', grade: '15', gold: 5 });
    expect(r.status).toBe(200);
    const body = JSON.stringify(r.body);
    expect(body).not.toContain('pin');
    expect(body).not.toContain('members');
    expect(body).not.toContain(p.email);
    expect(body).not.toContain('Lucas');
    expect(Object.keys(r.body.family)).toEqual(['gradeRequests']);
    expect(r.body.family.gradeRequests.map(g => [g.child, g.grade])).toEqual([['Emma', '15']]);
  });

  it('submitGrade: enfant inconnu, matière trop longue, champs non textuels refusés', async () => {
    const { p, fam, submit } = await setup();
    const s = b => api('submitGrade', { familyId: fam.id, childName: 'Emma', subject: 'Maths', grade: '12', gold: 1, ...b });
    expect((await s({ childName: 'Inconnu' })).status).toBe(404);
    expect((await s({ childName: ['Emma'] })).status).toBe(400);
    expect((await s({ subject: 'x'.repeat(61) })).status).toBe(400);
    expect((await s({ subject: { a: 1 } })).status).toBe(400);
    expect((await s({ subject: 'x'.repeat(60) })).status).toBe(200);
    expect((await p.me())[0].gradeRequests).toHaveLength(1);
  });

  it('approveGrade: or entier entre 0 et 100000, sinon 400', async () => {
    const { p, fam, submit } = await setup();
    await submit('12');
    const id = (await p.me())[0].gradeRequests[0].id;
    const ap = gold => api('approveGrade', { familyId: fam.id, gradeId: id, gold }, p.token);
    for (const g of ['100', -1, 2.5, 100001, true, '']) expect((await ap(g)).status, String(g)).toBe(400);
    const f = (await p.me())[0];
    expect([f.gradeRequests[0].status, f.children[0].gold]).toEqual(['pending', 0]);
    expect((await ap(0)).status).toBe(200);
  });

  it('submitGrade utilise le tableau de la famille', async () => {
    const { p, fam, submit } = await setup();
    expect((await submit('insuffisant')).status).toBe(400);
    await p.save({ ...fam, gradeScale: [{ labels: ['insuffisant'], value: 6 }] });
    expect((await submit('insuffisant')).status).toBe(200);
  });

  it('approveGrade corrige la note et conserve submittedGrade; 400 si invalide', async () => {
    const { p, fam, submit } = await setup();
    await submit('15,5');
    const id = (await p.me())[0].gradeRequests[0].id;
    const bad = await api('approveGrade', { familyId: fam.id, gradeId: id, gold: 5, grade: 'xx' }, p.token);
    expect(bad.status).toBe(400);
    const f1 = (await p.me())[0];
    expect(f1.gradeRequests[0].status).toBe('pending');   // rien n'a changé
    expect(f1.children[0].gold).toBe(0);
    expect((await api('approveGrade', { familyId: fam.id, gradeId: id, gold: 5, grade: '16' }, p.token)).status).toBe(200);
    const g = (await p.me())[0].gradeRequests[0];
    expect(g).toMatchObject({ grade: '16', submittedGrade: '15,5', status: 'approved' });
  });

  it('approveGrade sans correction (ou identique): pas de submittedGrade', async () => {
    const { p, fam, submit } = await setup();
    await submit('TB'); await submit('12');
    const [a, b] = (await p.me())[0].gradeRequests;
    expect((await api('approveGrade', { familyId: fam.id, gradeId: a.id }, p.token)).status).toBe(200);
    expect((await api('approveGrade', { familyId: fam.id, gradeId: b.id, grade: '12' }, p.token)).status).toBe(200);
    const gs = (await p.me())[0].gradeRequests;
    expect(gs.map(g => [g.grade, g.submittedGrade])).toEqual([['TB', undefined], ['12', undefined]]);
  });

  it('les anciennes notes invalides restent intactes', async () => {
    const { p, fam } = await setup();
    const f = await p.save({ ...fam, gradeRequests: [{ id: 'old', child: 'Emma', subject: 'Maths', grade: 'A+', gold: 1, status: 'approved' }] });
    expect(f.gradeRequests[0].grade).toBe('A+');
    const s = await api('getGradeStats', { familyId: fam.id }, p.token);
    expect(s.status).toBe(200);
    expect(s.body.grades.map(g => g.grade)).toEqual(['A+']);
    expect(s.body.bySubject.Maths.avg).toBe(null);
  });
});

describe('saveFamily: gradeScale', () => {
  const scale = [{ labels: ['TB', 'très bien'], value: 18 }, { labels: ['insuffisant'], value: 6 }];

  it('absent par défaut; un parent le modifie; une sauvegarde sans le champ le conserve', async () => {
    const { p, fam } = await setup();
    expect(fam.gradeScale).toBeUndefined();
    const f = await p.save({ ...fam, gradeScale: scale });
    expect(f.gradeScale).toEqual(scale);
    expect((await p.me())[0].gradeScale).toEqual(scale);
    const { gradeScale, ...rest } = f;
    expect((await p.save(rest)).gradeScale).toEqual(scale);
  });

  it('un enfant ne le modifie pas (200, ignoré)', async () => {
    const { p, fam } = await setup();
    await p.save({ ...fam, gradeScale: scale });
    const tok = (await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' })).body.token;
    const r = await api('saveFamily', { family: { ...fam, gradeScale: [{ labels: ['tb'], value: 0 }] } }, tok);
    expect(r.status).toBe(200);
    expect((await p.me())[0].gradeScale).toEqual(scale);
  });

  it('validation: 400', async () => {
    const { p, fam } = await setup();
    const st = async s => (await api('saveFamily', { family: { ...fam, gradeScale: s } }, p.token)).status;
    expect(await st([{ labels: ['tb'], value: 25 }])).toBe(400);
    expect(await st([{ labels: ['tb'], value: -1 }])).toBe(400);
    expect(await st([{ labels: ['tb'], value: '12' }])).toBe(400);
    expect(await st([{ labels: ['TB'], value: 18 }, { labels: ['t.b.'], value: 10 }])).toBe(400);   // doublon après normLabel
    expect(await st([{ labels: ['tb', 'TB'], value: 18 }])).toBe(400);
    expect(await st(Array.from({ length: 21 }, (_, i) => ({ labels: ['l' + i], value: 10 })))).toBe(400);
    expect(await st([])).toBe(400);
    expect(await st([{ labels: [], value: 10 }])).toBe(400);
    expect(await st([{ labels: ['a', 'b', 'c', 'd', 'e'], value: 10 }])).toBe(400);
    expect(await st([{ labels: [' '], value: 10 }])).toBe(400);
    expect(await st([{ labels: ['x'.repeat(31)], value: 10 }])).toBe(400);
    expect(await st('tb')).toBe(400);
    expect(await st([{ labels: ['tb', '15'], value: 18 }])).toBe(400);      // libellé numérique: jamais atteint
    expect(await st([{ labels: ['25/20'], value: 18 }])).toBe(400);
    expect(await st(Array.from({ length: 20 }, (_, i) => ({ labels: ['l' + i], value: 10 })))).toBe(200);
    expect((await p.me())[0].gradeScale).toHaveLength(20);
  });
});

describe('getGradeStats', () => {
  it('moyenne avec 15,5, 17/20 et TB; changer TB recalcule', async () => {
    const { p, fam, submit } = await setup();
    for (const g of ['15,5', '17/20', 'TB']) await submit(g);
    for (const g of (await p.me())[0].gradeRequests) await api('approveGrade', { familyId: fam.id, gradeId: g.id }, p.token);
    const avg = async () => (await api('getGradeStats', { familyId: fam.id }, p.token)).body.bySubject.Maths.avg;
    expect(await avg()).toBe('16.83');   // (15,5 + 17 + 18) / 3
    const cur = (await p.me())[0];
    await p.save({ ...cur, gradeScale: [{ labels: ['tb', 'tres bien'], value: 10 }] });
    expect(await avg()).toBe('14.17');   // (15,5 + 17 + 10) / 3
  });
});
