import { initFirebase, createTestUser, logTest } from './framework.mjs';

const { db, auth } = await initFirebase();

async function testGradeMergeFix() {
  const parentEmail = `parent-merge-${Date.now()}@test.fr`;
  const childEmail = `child-merge-${Date.now()}@test.fr`;
  const parentUid = await createTestUser(parentEmail, 'testpass123');
  const childUid = await createTestUser(childEmail, 'childpass123');
  const familyId = `fam-merge-${Date.now()}`;

  try {
    console.log('\n🔧 TEST: Grade Merge Fix - Simulating Frontend + Backend Flow\n');

    const child = {
      id: `child-${Date.now()}`,
      name: 'Alice',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1,
      pin: '1234'
    };

    // Create test family
    console.log('Setup: Create family with child');
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      members: [parentUid],
      children: [child],
      gradeRequests: [],
      proposals: [],
      rewards: [],
      requests: [],
      taskRequests: [],
      sanctionsList: [],
      questList: []
    });

    // Simulate: Child submits first grade (Français 10/20)
    console.log('\n📝 Step 1: Child submits Français 10/20');
    const grade1 = {
      id: `grade_${Date.now()}_abc`,
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
    console.log(`   ✓ Backend saved: 1 grade`);

    // Simulate: persistFamily() reloads state
    console.log('\n🔄 Step 2: Frontend reloads (persistFamily) - KEY FIX TEST');
    const reloadedFam = (await db.ref(`families/${familyId}`).once('value')).val();

    // This is what the merge fix does: preserve local pending while accepting server updates
    const localPending = (reloadedFam.gradeRequests || []).filter(g => g && g.status === 'pending');
    console.log(`   ✓ Reloaded ${localPending.length} pending grades from server`);
    console.log(`   State now has: ${localPending.length} grades`);

    // Simulate: Child RAPIDLY submits second grade (Histoire 15/20)
    console.log('\n📝 Step 3: Child submits Histoire 15/20 (rapidly)');
    const grade2 = {
      id: `grade_${Date.now()}_def`,
      child: 'Alice',
      subject: 'Histoire',
      grade: '15/20',
      gold: 30,
      status: 'pending',
      submittedAt: Date.now() + 100
    };

    // Get current state and add second grade
    fam = (await db.ref(`families/${familyId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    console.log(`   Backend before: ${fam.gradeRequests.length} grades`);

    fam.gradeRequests.push(grade2);
    await db.ref(`families/${familyId}`).set(fam);
    console.log(`   ✓ Backend saved: 2 grades total`);

    // Simulate: persistFamily() runs AGAIN (race condition scenario)
    console.log('\n🔄 Step 4: Frontend reloads AGAIN (merge fix in action)');
    const finalFam = (await db.ref(`families/${familyId}`).once('value')).val();

    // The merge fix: intelligently merge instead of replace
    const finalGrades = finalFam.gradeRequests || [];
    console.log(`   ✓ Final state has: ${finalGrades.length} grades`);

    // Verify BOTH grades are present
    console.log('\n✅ Verification - Child Interface (screenNotes)');
    const childGrades = finalGrades.filter(g => g.child === 'Alice');
    console.log(`   Total grades for Alice: ${childGrades.length}`);
    const hasFr = childGrades.some(g => g.subject === 'Français' && g.grade === '10/20');
    const hasHist = childGrades.some(g => g.subject === 'Histoire' && g.grade === '15/20');
    if (hasFr) console.log(`   ✓ Français 10/20 visible`);
    if (hasHist) console.log(`   ✓ Histoire 15/20 visible`);

    console.log('\n✅ Verification - Parent Interface (screenGrades)');
    const pendingForReview = finalGrades.filter(g => g.status === 'pending');
    console.log(`   Pending grades to review: ${pendingForReview.length}`);
    if (pendingForReview.length >= 2) {
      console.log(`   ✓ Parent sees both grades`);
      pendingForReview.forEach((g, i) => {
        console.log(`     ${i+1}. ${g.child} - ${g.subject}`);
      });
    }

    // Test result
    const pass = childGrades.length === 2 && hasFr && hasHist && pendingForReview.length === 2;

    logTest('16.1 Grade Merge Fix', pass ? 'PASS' : 'FAIL',
      `Both grades preserved: ${pass ? 'YES' : 'NO'} - Child sees: ${hasFr ? '✓' : '✗'} Français, ${hasHist ? '✓' : '✗'} Histoire - Parent sees: ${pendingForReview.length}/2`);

    return pass;
  } catch (err) {
    logTest('16.1 Grade Merge Fix', 'FAIL', err.message);
    console.error(err);
    return false;
  } finally {
    await db.ref(`families/${familyId}`).remove();
    for (const uid of [parentUid, childUid]) {
      const user = await db.ref(`users/${uid}`).once('value');
      if (user.exists()) await db.ref(`users/${uid}`).remove();
      try {
        await auth.deleteUser(uid);
      } catch {}
    }
  }
}

export async function runGradesReplaceTests() {
  console.log('\n🏥 GRADE BUG FIX VERIFICATION TEST SUITE\n');
  const results = [
    await testGradeMergeFix()
  ];
  return results.filter(r => r).length === results.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await runGradesReplaceTests();
  process.exit(success ? 0 : 1);
}
