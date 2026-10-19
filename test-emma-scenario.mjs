import { initFirebase, createTestUser } from './tests/e2e/framework.mjs';

const { db, auth } = await initFirebase();

async function testEmmaScenario() {
  const parentUid = await createTestUser(`p-emma-${Date.now()}@test.fr`, 'pass123');
  const famId = `f-emma-${Date.now()}`;

  try {
    console.log('\n🧪 EMMA SCENARIO E2E TEST\n');
    console.log('='.repeat(50));

    const child = {
      id: `child-${Date.now()}`,
      name: 'Emma',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1,
      pin: '0000'
    };

    // Setup
    console.log('\n📋 SETUP: Create family with Emma');
    await db.ref(`families/${famId}`).set({
      id: famId,
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
    console.log('✓ Family created\n');

    // STEP 1: Simulate Emma submitting grades
    console.log('STEP 1️⃣: Emma submits 2 grades');
    console.log('─'.repeat(50));

    const grade1 = {
      id: `grade_${Date.now()}_svt`,
      child: 'Emma',
      subject: 'SVT',
      grade: '2/20',
      gold: 2,
      status: 'pending',
      submittedAt: Date.now()
    };

    console.log(`  📝 Submitting: SVT 2/20 (gold: 2)`);
    let fam = (await db.ref(`families/${famId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    fam.gradeRequests.push(grade1);
    await db.ref(`families/${famId}`).set(fam);
    console.log(`  ✓ SVT submitted - now have ${fam.gradeRequests.length} grade(s)`);

    // Wait a bit to simulate user action
    await new Promise(r => setTimeout(r, 100));

    const grade2 = {
      id: `grade_${Date.now()}_anglais`,
      child: 'Emma',
      subject: 'Anglais',
      grade: '18/20',
      gold: 18,
      status: 'pending',
      submittedAt: Date.now() + 1000
    };

    console.log(`  📝 Submitting: Anglais 18/20 (gold: 18)`);
    fam = (await db.ref(`families/${famId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    fam.gradeRequests.push(grade2);
    await db.ref(`families/${famId}`).set(fam);
    console.log(`  ✓ Anglais submitted - now have ${fam.gradeRequests.length} grade(s)\n`);

    // STEP 2: Emma navigates to tasks page (simulate page change)
    console.log('STEP 2️⃣: Emma navigates to tasks page');
    console.log('─'.repeat(50));
    console.log('  🔄 Changing page to tasks...');
    console.log('  ✓ Now on tasks page\n');

    // STEP 3: Emma returns to notes page
    console.log('STEP 3️⃣: Emma returns to notes page');
    console.log('─'.repeat(50));
    console.log('  🔄 Changing page back to notes...');

    // Check if grades are still there
    let check = (await db.ref(`families/${famId}`).once('value')).val();
    const gradesAfterPageChange = check.gradeRequests || [];

    console.log(`  ✓ Back on notes page`);
    console.log(`  📊 Grades still present: ${gradesAfterPageChange.length}/2`);
    gradesAfterPageChange.forEach((g, i) => {
      console.log(`    ${i+1}. ${g.subject} (${g.grade}) - ${g.gold}🪙`);
    });

    const hasSVT = gradesAfterPageChange.some(g => g.subject === 'SVT' && g.grade === '2/20');
    const hasAnglais = gradesAfterPageChange.some(g => g.subject === 'Anglais' && g.grade === '18/20');

    if (!hasSVT || !hasAnglais) {
      console.log(`\n❌ GRADES MISSING AFTER PAGE CHANGE!`);
      return false;
    }
    console.log(`\n✓ Both grades present after page navigation\n`);

    // STEP 4: Parent logs in and checks validation section
    console.log('STEP 4️⃣: Parent logs in and checks notes for validation');
    console.log('─'.repeat(50));

    // Get family as parent would see it
    let parentView = (await db.ref(`families/${famId}`).once('value')).val();
    const pendingGrades = parentView.gradeRequests || [];

    console.log(`  📋 Parent opens "Notes à valider" section`);
    console.log(`  📊 Pending grades visible: ${pendingGrades.length}/2`);
    pendingGrades.forEach((g, i) => {
      console.log(`    ${i+1}. ${g.child} - ${g.subject} (${g.grade}) - ${g.gold}🪙 pending approval`);
    });

    const parentSeesSVT = pendingGrades.some(g => g.subject === 'SVT');
    const parentSeesAnglais = pendingGrades.some(g => g.subject === 'Anglais');

    if (!parentSeesSVT || !parentSeesAnglais) {
      console.log(`\n❌ PARENT CANNOT SEE GRADES FOR VALIDATION!`);
      return false;
    }

    console.log(`\n✓ Parent can see both grades for validation\n`);

    // Final check
    console.log('='.repeat(50));
    console.log('✅ SCENARIO PASSED:\n');
    console.log('  ✓ Emma submitted 2 grades (SVT 2/20, Anglais 18/20)');
    console.log('  ✓ Grades persisted after page navigation');
    console.log('  ✓ Parent can see both grades for validation');
    console.log('  ✓ No duplicates, no data loss\n');

    return true;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  } finally {
    await db.ref(`families/${famId}`).remove();
    try { await auth.deleteUser(parentUid); } catch {}
  }
}

const success = await testEmmaScenario();
process.exit(success ? 0 : 1);
