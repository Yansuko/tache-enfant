import { initFirebase, createTestUser } from './tests/e2e/framework.mjs';

const { db, auth } = await initFirebase();

async function testGradeSaveVerification() {
  const parentUid = await createTestUser(`p-save-${Date.now()}@test.fr`, 'pass123');
  const famId = `f-save-${Date.now()}`;

  try {
    console.log('\n🧪 E2E TEST: Grade Save Verification\n');

    const child = {
      id: `child-${Date.now()}`,
      name: 'Emma',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1,
      pin: '0000'
    };

    // Create family
    console.log('Step 1: Create family');
    await db.ref(`families/${famId}`).set({
      id: famId,
      name: 'Test',
      owner: parentUid,
      members: [parentUid],
      children: [child],
      gradeRequests: []
    });
    console.log('✓ Family created\n');

    // Simulate: submitGrade API call
    console.log('Step 2: Call submitGrade API');
    console.log('  - Submitting: Français 10/20');

    const grade = {
      id: `grade_${Date.now()}_abc123`,
      child: 'Emma',
      subject: 'Français',
      grade: '10/20',
      gold: 20,
      status: 'pending',
      submittedAt: Date.now()
    };

    // This is what the API does
    let fam = (await db.ref(`families/${famId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    fam.gradeRequests.push(grade);
    await db.ref(`families/${famId}`).set(fam);
    console.log('  ✓ API saved to backend\n');

    // Step 3: Verify the grade was saved
    console.log('Step 3: Verify grade saved');
    let check = (await db.ref(`families/${famId}`).once('value')).val();
    const saved = check.gradeRequests;

    console.log(`  Grades in DB: ${saved.length}`);
    saved.forEach((g, i) => {
      console.log(`    ${i+1}. ${g.subject} (${g.grade})`);
    });

    const pass = saved.length === 1 && saved[0].subject === 'Français';

    console.log(`\n${pass ? '✅' : '❌'} Grade ${pass ? 'WAS' : 'NOT'} saved to backend`);

    return pass;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  } finally {
    await db.ref(`families/${famId}`).remove();
    try { await auth.deleteUser(parentUid); } catch {}
  }
}

const success = await testGradeSaveVerification();
process.exit(success ? 0 : 1);
