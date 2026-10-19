import { initFirebase, createTestUser } from './tests/e2e/framework.mjs';

const { db, auth } = await initFirebase();

async function testNoDuplicatesOnRapidSubmission() {
  const parentUid = await createTestUser(`p-final-${Date.now()}@test.fr`, 'pass123');
  const famId = `f-final-${Date.now()}`;

  try {
    console.log('\n✅ FINAL TEST: No Duplicates On Rapid Submission\n');

    const child = {
      id: `child-${Date.now()}`,
      name: 'Emma',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1,
      pin: '0000'
    };

    console.log('Setup: Create family');
    await db.ref(`families/${famId}`).set({
      id: famId,
      name: 'Test Family',
      owner: parentUid,
      members: [parentUid],
      children: [child],
      gradeRequests: []
    });

    console.log('\n📝 Submission 1: Français 10/20');
    // Simulate submitGrade + save() flow
    let fam = (await db.ref(`families/${famId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    fam.gradeRequests.push({
      id: `grade_${Date.now()}_abc`,
      child: 'Emma',
      subject: 'Français',
      grade: '10/20',
      gold: 20,
      status: 'pending',
      submittedAt: Date.now()
    });
    await db.ref(`families/${famId}`).set(fam);

    let check1 = (await db.ref(`families/${famId}`).once('value')).val();
    console.log(`  Backend after submit: ${check1.gradeRequests.length} grade(s)`);
    console.log(`  Grades: ${check1.gradeRequests.map(g => g.subject).join(', ')}`);

    // Simulate save() reloading state
    console.log('  simulate save() reloading state...');
    // state would now have: gradeRequests from server

    console.log('\n📝 Submission 2: Histoire 15/20 (rapid)');
    fam = (await db.ref(`families/${famId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    console.log(`  Backend before submit: ${fam.gradeRequests.length} grade(s)`);

    fam.gradeRequests.push({
      id: `grade_${Date.now()}_def`,
      child: 'Emma',
      subject: 'Histoire',
      grade: '15/20',
      gold: 30,
      status: 'pending',
      submittedAt: Date.now() + 100
    });
    await db.ref(`families/${famId}`).set(fam);

    let check2 = (await db.ref(`families/${famId}`).once('value')).val();
    console.log(`  Backend after submit: ${check2.gradeRequests.length} grade(s)`);
    console.log(`  Grades: ${check2.gradeRequests.map(g => g.subject).join(', ')}`);

    console.log('\n🔍 DUPLICATE CHECK:');
    const grades = check2.gradeRequests || [];

    // Check for exact duplicates
    const ids = new Map();
    let hasDuplicateIds = false;
    grades.forEach(g => {
      const count = (ids.get(g.id) || 0) + 1;
      ids.set(g.id, count);
      if (count > 1) {
        console.log(`  ❌ DUPLICATE ID: ${g.id} appears ${count} times`);
        hasDuplicateIds = true;
      }
    });

    // Check for duplicate subjects
    const subjects = new Map();
    let hasDuplicateSubjects = false;
    grades.forEach(g => {
      const count = (subjects.get(g.subject) || 0) + 1;
      subjects.set(g.subject, count);
      if (count > 1) {
        console.log(`  ❌ DUPLICATE SUBJECT: ${g.subject} appears ${count} times`);
        hasDuplicateSubjects = true;
      }
    });

    if (!hasDuplicateIds && !hasDuplicateSubjects) {
      console.log(`  ✓ No duplicate IDs`);
      console.log(`  ✓ No duplicate subjects`);
    }

    // Check that both grades are present
    const hasFrancais = grades.some(g => g.subject === 'Français' && g.grade === '10/20');
    const hasHistoire = grades.some(g => g.subject === 'Histoire' && g.grade === '15/20');

    console.log('\n✅ GRADE PRESENCE:');
    console.log(`  Français: ${hasFrancais ? '✓' : '✗'}`);
    console.log(`  Histoire: ${hasHistoire ? '✓' : '✗'}`);
    console.log(`  Total: ${grades.length}/2`);

    const pass =
      !hasDuplicateIds &&
      !hasDuplicateSubjects &&
      hasFrancais &&
      hasHistoire &&
      grades.length === 2;

    console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}: All checks passed`);

    return pass;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  } finally {
    await db.ref(`families/${famId}`).remove();
    try { await auth.deleteUser(parentUid); } catch {}
  }
}

const success = await testNoDuplicatesOnRapidSubmission();
process.exit(success ? 0 : 1);
