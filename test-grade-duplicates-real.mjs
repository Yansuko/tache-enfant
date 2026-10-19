import { initFirebase, createTestUser } from './tests/e2e/framework.mjs';

const { db, auth } = await initFirebase();

async function testRealGradeDuplicateFlow() {
  const parentEmail = `parent-dup-${Date.now()}@test.fr`;
  const parentUid = await createTestUser(parentEmail, 'testpass123');
  const familyId = `fam-dup-${Date.now()}`;

  try {
    console.log('\n🔍 REAL DUPLICATE GRADE TEST\n');

    const child = {
      id: `child-${Date.now()}`,
      name: 'Emma',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1,
      pin: '0000'
    };

    // Create test family
    console.log('Setup: Create family with Emma');
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
    console.log(`✓ Family created: ${familyId}\n`);

    // Simulate: Child submits Français 10/20 via frontend
    console.log('1️⃣  SUBMIT GRADE 1: Français 10/20');

    // This is what the API submitGrade does
    let fam = (await db.ref(`families/${familyId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    console.log(`   Before submit: ${fam.gradeRequests.length} grades`);

    const grade1 = {
      id: `grade_${Date.now()}_abc`,
      child: 'Emma',
      subject: 'Français',
      grade: '10/20',
      gold: 20,
      status: 'pending',
      submittedAt: Date.now()
    };

    fam.gradeRequests.push(grade1);
    await db.ref(`families/${familyId}`).set(fam);

    let check1 = (await db.ref(`families/${familyId}`).once('value')).val();
    console.log(`   After submit: ${check1.gradeRequests.length} grades`);
    console.log(`   Grades: ${check1.gradeRequests.map(g => `${g.subject}`).join(', ')}\n`);

    // Simulate: persistFamily() is called (save() reloads)
    console.log('🔄 PERSIST: Frontend calls persistFamily() - RELOAD FROM SERVER');
    const reloaded1 = (await db.ref(`families/${familyId}`).once('value')).val();
    console.log(`   Server has: ${reloaded1.gradeRequests.length} grades\n`);

    // Simulate: Child RAPIDLY submits Histoire 15/20
    console.log('2️⃣  SUBMIT GRADE 2: Histoire 15/20 (rapidly)');

    fam = (await db.ref(`families/${familyId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    console.log(`   Before submit: ${fam.gradeRequests.length} grades`);

    const grade2 = {
      id: `grade_${Date.now()}_def`,
      child: 'Emma',
      subject: 'Histoire',
      grade: '15/20',
      gold: 30,
      status: 'pending',
      submittedAt: Date.now() + 100
    };

    fam.gradeRequests.push(grade2);
    await db.ref(`families/${familyId}`).set(fam);

    let check2 = (await db.ref(`families/${familyId}`).once('value')).val();
    console.log(`   After submit: ${check2.gradeRequests.length} grades`);
    console.log(`   Grades: ${check2.gradeRequests.map(g => `${g.subject}`).join(', ')}\n`);

    // Simulate: persistFamily() is called again
    console.log('🔄 PERSIST: Frontend calls persistFamily() again');
    const reloaded2 = (await db.ref(`families/${familyId}`).once('value')).val();
    console.log(`   Server has: ${reloaded2.gradeRequests.length} grades`);
    console.log(`   Grades: ${reloaded2.gradeRequests.map(g => `${g.subject} (ID: ${g.id})`).join(', ')}\n`);

    // CHECK FOR DUPLICATES
    console.log('✅ FINAL CHECK:\n');
    const finalGrades = reloaded2.gradeRequests || [];

    // Count each unique grade
    const seen = new Map();
    finalGrades.forEach(g => {
      const key = `${g.child}:${g.subject}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    });

    console.log('Unique grades:');
    seen.forEach((count, key) => {
      const [child, subject] = key.split(':');
      console.log(`  ${child} - ${subject}: appears ${count} time(s) ${count > 1 ? '❌ DUPLICATE!' : '✓'}`);
    });

    const hasDuplicates = Array.from(seen.values()).some(count => count > 1);
    const hasAllGrades = finalGrades.length === 2 && finalGrades.some(g => g.subject === 'Français') && finalGrades.some(g => g.subject === 'Histoire');

    console.log(`\nTotal grades in DB: ${finalGrades.length}`);
    console.log(`All grades present: ${hasAllGrades ? '✓' : '✗'}`);
    console.log(`Duplicates found: ${hasDuplicates ? '❌ YES' : '✓ NO'}`);

    // Test result
    const pass = !hasDuplicates && hasAllGrades;
    console.log(`\n${pass ? '✅' : '❌'} TEST ${pass ? 'PASSED' : 'FAILED'}`);

    return pass;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  } finally {
    await db.ref(`families/${familyId}`).remove();
    try { await auth.deleteUser(parentUid); } catch {}
  }
}

const success = await testRealGradeDuplicateFlow();
process.exit(success ? 0 : 1);
