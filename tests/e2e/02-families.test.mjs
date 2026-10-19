// tests/e2e/02-families.test.mjs
import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { db } = await initFirebase();

async function withFamily(title, userCount, check) {
  const stamp = Date.now();
  const familyId = `test-family-${stamp}`;
  const uids = [];
  try {
    for (let i = 0; i < userCount; i++) {
      uids.push(await createTestUser(`e2e-fam-${stamp}-${i}@test.local`, 'TestPass123!'));
    }
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: uids[0],
      members: uids,
      children: [],
      createdAt: Date.now()
    });
    for (const uid of uids) await db.ref(`users/${uid}/familyIds`).set([familyId]);

    const family = (await db.ref(`families/${familyId}`).once('value')).val();
    const links = await Promise.all(uids.map(async uid =>
      (await db.ref(`users/${uid}/familyIds`).once('value')).val()));
    const detail = check(family, links, uids, familyId);
    logTest(title, detail ? 'FAIL' : 'PASS', detail || '');
    return !detail;
  } catch (err) {
    logTest(title, 'FAIL', err.message);
    return false;
  } finally {
    await db.ref(`families/${familyId}`).remove();
    for (const uid of uids) {
      await db.ref(`users/${uid}`).remove();
      await deleteTestUser(uid);
    }
  }
}

// Each check returns an error string, or '' when OK.
export const test21CreateFamily = () =>
  withFamily('2.1 Create family', 1, (family, links, [owner], familyId) =>
    !family ? 'family missing'
    : family.owner !== owner ? 'wrong owner'
    : !links[0]?.includes(familyId) ? 'user not linked to family'
    : '');

export const test22InviteAdult = () =>
  withFamily('2.2 Invite adult', 2, (family, links, [, spouse], familyId) =>
    !family?.members?.includes(spouse) ? 'spouse not in members'
    : !links[1]?.includes(familyId) ? 'spouse not linked to family'
    : '');

export async function runFamilyTests() {
  console.log('\n👨‍👩‍👧 FAMILY MANAGEMENT TESTS\n');
  const results = [
    await test21CreateFamily(),
    await test22InviteAdult()
  ];
  return results.filter(r => r).length === results.length;
}
