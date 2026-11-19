import { describe, it, expect } from 'vitest';
import { api, newParent } from './helpers.js';

// Famille avec Emma, une note approuvée (« 12 », 5 or crédités) et une note en attente; session enfant d'Emma.
async function setup() {
  const p = await newParent('edit');
  p.family.children = [{ id: 'c-emma', name: 'Emma', xp: 0, gold: 0, pin: '1234', tasks: [], grades: [], sanctions: [] }];
  const fam = await p.save(p.family);
  const submit = grade => api('submitGrade', { familyId: fam.id, childName: 'Emma', subject: 'Maths', grade, gold: 5 });
  await submit('12'); await submit('14');
  const [a, b] = (await p.me())[0].gradeRequests;
  expect((await api('approveGrade', { familyId: fam.id, gradeId: a.id }, p.token)).status).toBe(200);
  const unlock = await api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin: '1234' });
  expect(unlock.status).toBe(200);
  const edit = (gradeId, grade, token = p.token, familyId = fam.id) => api('editGrade', { familyId, gradeId, grade }, token);
  const get = async id => (await p.me())[0].gradeRequests.find(g => g.id === id);
  return { p, fam, approved: a.id, pending: b.id, childToken: unlock.body.token, edit, get };
}

describe('editGrade', () => {
  it('le parent corrige une note validée: submittedGrade, editedAt, or inchangé', async () => {
    const { p, approved, edit, get } = await setup();
    const r = await edit(approved, '15,5');
    expect(r.status).toBe(200);
    const g = await get(approved);
    expect(g).toMatchObject({ grade: '15,5', submittedGrade: '12', status: 'approved', gold: 5 });
    expect(typeof g.editedAt).toBe('number');
    expect((await p.me())[0].children[0].gold).toBe(5);
  });

  it('submittedGrade conservé après deux corrections', async () => {
    const { approved, edit, get } = await setup();
    expect((await edit(approved, '15')).status).toBe(200);
    expect((await edit(approved, 'TB')).status).toBe(200);
    expect(await get(approved)).toMatchObject({ grade: 'TB', submittedGrade: '12' });
  });

  it('enfant 403, autre famille 403, note introuvable 404', async () => {
    const { approved, childToken, edit, get } = await setup();
    expect((await edit(approved, '18', childToken)).status).toBe(403);
    const other = await newParent('edit-other');
    expect((await edit(approved, '18', other.token)).status).toBe(403);
    expect((await edit('nope', '18')).status).toBe(404);
    expect((await edit(approved, '18', undefined, 'fam-inconnue')).status).toBe(404);
    expect((await get(approved)).grade).toBe('12');
  });

  it('note en attente 400, note invalide 400', async () => {
    const { approved, pending, edit, get } = await setup();
    expect((await edit(pending, '18')).status).toBe(400);
    const bad = await edit(approved, '15 sur 20');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Note invalide.');
    expect((await get(pending)).status).toBe('pending');
    expect((await get(approved)).grade).toBe('12');
  });

  it('une ancienne note au mauvais format est corrigeable', async () => {
    const { p, fam, edit, get } = await setup();
    const cur = (await p.me())[0];
    await p.save({ ...cur, gradeRequests: [...cur.gradeRequests, { id: 'old', child: 'Emma', subject: 'Français', grade: '15 sur 20', gold: 1, status: 'approved' }] });
    expect((await edit('old', '15/20')).status).toBe(200);
    expect(await get('old')).toMatchObject({ grade: '15/20', submittedGrade: '15 sur 20' });
    const s = await api('getGradeStats', { familyId: fam.id }, p.token);
    expect(s.body.bySubject['Français'].avg).toBe('15');
  });

  it('la moyenne de getGradeStats est recalculée', async () => {
    const { p, fam, approved, edit } = await setup();
    const avg = async () => (await api('getGradeStats', { familyId: fam.id }, p.token)).body.bySubject.Maths.avg;
    expect(await avg()).toBe('12');
    await edit(approved, '18');
    expect(await avg()).toBe('18');
  });

  it('une copie périmée (parent ou enfant) ne rétablit pas l\'ancienne note', async () => {
    const { p, approved, childToken, edit, get } = await setup();
    const stale = (await p.me())[0];
    expect((await edit(approved, '17')).status).toBe(200);
    await p.save(stale);
    expect((await get(approved)).grade).toBe('17');
    expect((await api('saveFamily', { family: stale }, childToken)).status).toBe(200);
    expect((await get(approved)).grade).toBe('17');
  });
});

describe('saveFamily enfant: une note validée est intouchable', () => {
  it('l\'enfant ne change pas la note ni l\'or d\'une note approuvée', async () => {
    const { p, approved, childToken, get } = await setup();
    const fam = (await p.me())[0];
    const forged = structuredClone(fam);
    Object.assign(forged.gradeRequests.find(g => g.id === approved), { grade: '20', gold: 999 });
    expect((await api('saveFamily', { family: forged }, childToken)).status).toBe(200);
    expect(await get(approved)).toMatchObject({ grade: '12', gold: 5, status: 'approved' });
  });
});
