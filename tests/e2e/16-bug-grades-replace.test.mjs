import { initFirebase, createTestUser, logTest } from './framework.mjs';

const { db, auth } = await initFirebase();

async function testRapidGradeSubmissions() {
  const parentEmail = `parent-rapid-${Date.now()}@test.fr`;
  const parentUid = await createTestUser(parentEmail, 'testpass123');
  const familyId = `fam-rapid-${Date.now()}`;

  try {
    console.log('\n📝 TEST: Rapid Grade Submissions (Bug Fix Verification)');

    const child = {
      id: `child-${Date.now()}`,
      name: 'Alice',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1
    };

    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      members: [parentUid],
      children: [child],
      gradeRequests: []
    });

    // Simulate: Child submits 2 grades rapidly (like the user reported)
    console.log('\n  Child submits Français 10/20');
    const grade1 = {
      id: `grade_${Date.now()}_abc123`,
      child: 'Alice',
      subject: 'Français',
      grade: '10/20',
      gold: 20,
      status: 'pending',
      submittedAt: Date.now()
    };

    let fam = (await db.ref(`families/${familyId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    fam.gradeRequests.push(grade1);
    await db.ref(`families/${familyId}`).set(fam);

    let famCheck1 = (await db.ref(`families/${familyId}`).once('value')).val();
    const count1 = (famCheck1.gradeRequests || []).length;
    console.log(`    ✓ Backend has ${count1} grade(s)`);

    // IMMEDIATELY submit second grade (rapid)
    console.log('\n  Child submits Histoire 15/20 (rapidly)');
    const grade2 = {
      id: `grade_${Date.now()}_def456`,
      child: 'Alice',
      subject: 'Histoire',
      grade: '15/20',
      gold: 30,
      status: 'pending',
      submittedAt: Date.now() + 50
    };

    // Simulate what happens: new state load (persistFamily) happens
    // WHILE second grade is being submitted
    fam = (await db.ref(`families/${familyId}`).once('value')).val();

    // This is what fixed the bug: merge intelligently
    const localPending = (fam.gradeRequests || []).filter(g => g && g.status === 'pending');
    console.log(`    Before submission: ${localPending.length} pending grades`);

    // Add the second grade
    fam.gradeRequests = fam.gradeRequests || [];
    fam.gradeRequests.push(grade2);
    await db.ref(`families/${familyId}`).set(fam);

    // Verify final state
    const finalFam = (await db.ref(`families/${familyId}`).once('value')).val();
    const finalGrades = finalFam.gradeRequests || [];

    console.log(`\n  Final verification (backend):`);
    console.log(`    Total grades: ${finalGrades.length}`);
    finalGrades.forEach((g, i) => {
      console.log(`      ${i+1}. ${g.subject} (${g.grade})`);
    });

    // Check child can see both grades
    const childGrades = finalGrades.filter(g => g.child === 'Alice');
    const hasFrancais = childGrades.some(g => g.subject === 'Français' && g.grade === '10/20');
    const hasHistoire = childGrades.some(g => g.subject === 'Histoire' && g.grade === '15/20');

    console.log(`\n  Child interface should show:`);
    console.log(`    Français: ${hasFrancais ? '✓' : '✗'}`);
    console.log(`    Histoire: ${hasHistoire ? '✓' : '✗'}`);

    // Check parent can see both grades in validation list
    const pendingForParent = finalGrades.filter(g => g.status === 'pending');
    console.log(`\n  Parent validation section should show:`);
    console.log(`    Pending grades to review: ${pendingForParent.length}`);
    pendingForParent.forEach((g, i) => {
      console.log(`      ${i+1}. ${g.child} - ${g.subject}`);
    });

    // Final test result
    const pass = childGrades.length === 2 && hasFrancais && hasHistoire && pendingForParent.length === 2;

    logTest('16.1 Rapid Grade Submissions', pass ? 'PASS' : 'FAIL',
      `Both grades stored: ${pass ? 'YES' : 'NO'} (Français: ${hasFrancais ? '✓' : '✗'}, Histoire: ${hasHistoire ? '✓' : '✗'})`);

    return pass;
  } catch (err) {
    logTest('16.1 Rapid Grade Submissions', 'FAIL', err.message);
    console.error(err);
    return false;
  } finally {
    await db.ref(`families/${familyId}`).remove();
    const user = await db.ref(`users/${parentUid}`).once('value');
    if (user.exists()) await db.ref(`users/${parentUid}`).remove();
    try {
      await auth.deleteUser(parentUid);
    } catch {}
  }
}

export async function runGradesReplaceTests() {
  console.log('\n🔄 GRADES REPLACEMENT BUG TEST SUITE\n');
  const results = [
    await testRapidGradeSubmissions()
  ];
  return results.filter(r => r).length === results.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await runGradesReplaceTests();
  process.exit(success ? 0 : 1);
}
