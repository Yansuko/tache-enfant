import { initFirebase, createTestUser } from './tests/e2e/framework.mjs';

const { db, auth } = await initFirebase();

async function testExactFrontendFlow() {
  const parentUid = await createTestUser(`p-exact-${Date.now()}@test.fr`, 'pass123');
  const famId = `f-exact-${Date.now()}`;

  try {
    console.log('\n🔬 EXACT FRONTEND FLOW TEST\n');

    const child = {
      id: `child-${Date.now()}`,
      name: 'Emma',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1,
      pin: '0000'
    };

    // Initialize
    console.log('SETUP: Create family');
    await db.ref(`families/${famId}`).set({
      id: famId,
      name: 'Test',
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
    console.log('✓ Family created\n');

    // Simulate frontend state
    let state = {
      id: famId,
      gradeRequests: [],
      children: [child],
      proposals: [],
      rewards: [],
      requests: [],
      taskRequests: [],
      sanctionsList: [],
      questList: [],
      name: 'Test'
    };

    console.log('STEP 1: User submits Français 10/20');
    console.log(`  Frontend state.gradeRequests BEFORE: ${state.gradeRequests.length}`);

    // Simulate submitGrade API call
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
    console.log(`  API saved to backend`);

    // Simulate save() / persistFamily() - sends state to backend
    console.log(`  Frontend calls save() which sends state to backend`);
    console.log(`    state.gradeRequests being sent: ${state.gradeRequests.length} grades`);

    // Simulate saveFamily - backend receives state and returns merged result
    let backendFam = (await db.ref(`families/${famId}`).once('value')).val();
    // Backend would merge: { ...state, ...serverData }
    // Since state has 0 grades and server has 1, result has 1
    state.gradeRequests = backendFam.gradeRequests;
    console.log(`  Frontend state updated from backend: ${state.gradeRequests.length} grades`);
    console.log(`    Grades: ${state.gradeRequests.map(g => g.subject).join(', ')}\n`);

    // STEP 2: Rapid submission
    console.log('STEP 2: User submits Histoire 15/20 (rapidly)');
    console.log(`  Frontend state.gradeRequests BEFORE: ${state.gradeRequests.length}`);

    // submitGrade API call
    fam = (await db.ref(`families/${famId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    console.log(`  Backend before push: ${fam.gradeRequests.length}`);

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
    console.log(`  API saved to backend`);
    console.log(`  Backend now has: ${fam.gradeRequests.length} grades`);

    // save() call - sends state to backend again
    console.log(`  Frontend calls save() again`);
    console.log(`    state.gradeRequests being sent: ${state.gradeRequests.length} grades`);

    // saveFamily - backend receives state with 1 grade, merges with server which has 2
    backendFam = (await db.ref(`families/${famId}`).once('value')).val();
    console.log(`    Backend has: ${backendFam.gradeRequests.length} grades`);

    // THIS IS WHERE DUPLICATES HAPPEN!
    // If backend merges { ...state, ...server } and state has [Français]
    // and server has [Français, Histoire], what does it keep?

    state.gradeRequests = backendFam.gradeRequests;
    console.log(`  Frontend state updated: ${state.gradeRequests.length} grades\n`);

    // FINAL CHECK
    console.log('FINAL STATE:');
    console.log(`  Frontend state.gradeRequests: ${state.gradeRequests.length}`);
    state.gradeRequests.forEach((g, i) => {
      console.log(`    ${i+1}. ${g.subject} (ID: ${g.id})`);
    });

    console.log(`\n  Database gradeRequests: ${backendFam.gradeRequests.length}`);
    backendFam.gradeRequests.forEach((g, i) => {
      console.log(`    ${i+1}. ${g.subject} (ID: ${g.id})`);
    });

    // Check for duplicates
    const allGrades = backendFam.gradeRequests || [];
    const subjectCounts = {};
    allGrades.forEach(g => {
      subjectCounts[g.subject] = (subjectCounts[g.subject] || 0) + 1;
    });

    console.log('\n  DUPLICATE CHECK:');
    Object.entries(subjectCounts).forEach(([subject, count]) => {
      if (count > 1) {
        console.log(`    ❌ ${subject}: appears ${count} times`);
      } else {
        console.log(`    ✓ ${subject}: 1 time`);
      }
    });

    const hasDuplicates = Object.values(subjectCounts).some(count => count > 1);
    const allPresent = allGrades.length === 2;
    const pass = !hasDuplicates && allPresent;

    console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}`);

    return pass;
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    return false;
  } finally {
    await db.ref(`families/${famId}`).remove();
    try { await auth.deleteUser(parentUid); } catch {}
  }
}

const success = await testExactFrontendFlow();
process.exit(success ? 0 : 1);
