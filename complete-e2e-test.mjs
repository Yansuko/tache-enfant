import { initFirebase, createTestUser, logTest } from './tests/e2e/framework.mjs';

const { db, auth } = await initFirebase();

async function testRealGradeFlow() {
  const parentEmail = `parent-real-${Date.now()}@test.fr`;
  const parentUid = await createTestUser(parentEmail, 'testpass123');
  const familyId = `fam-real-${Date.now()}`;
  
  try {
    const child = {
      id: `child-${Date.now()}`,
      name: 'Alice',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1
    };
    
    console.log('\n📝 TESTING REAL GRADE SUBMISSION FLOW\n');
    console.log('Setup: Create family');
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      members: [parentUid],
      children: [child],
      gradeRequests: []
    });
    
    // Simulate child submitting first grade
    console.log('\n1️⃣  Child submits first grade (Français 10/20)');
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
    
    let famAfter1 = (await db.ref(`families/${familyId}`).once('value')).val();
    console.log(`   ✓ Grade 1 in backend: ${famAfter1.gradeRequests.length} grades`);
    
    // Simulate persistFamily reload (like it would happen in real app)
    console.log('\n2️⃣  Frontend reloads state (persistFamily)');
    const reloadedState = (await db.ref(`families/${familyId}`).once('value')).val();
    const localPending1 = (reloadedState.gradeRequests || []).filter(g => g.status === 'pending');
    console.log(`   ✓ Reloaded ${localPending1.length} pending grades`);
    
    // Simulate child submitting SECOND grade rapidly
    console.log('\n3️⃣  Child submits second grade RAPIDLY (Histoire 15/20)');
    const grade2 = {
      id: `grade_${Date.now()}_def456`,
      child: 'Alice',
      subject: 'Histoire',
      grade: '15/20',
      gold: 30,
      status: 'pending',
      submittedAt: Date.now() + 100
    };
    
    fam = (await db.ref(`families/${familyId}`).once('value')).val();
    fam.gradeRequests = fam.gradeRequests || [];
    console.log(`   Before submit: ${fam.gradeRequests.length} grades`);
    
    fam.gradeRequests.push(grade2);
    await db.ref(`families/${familyId}`).set(fam);
    
    let famAfter2 = (await db.ref(`families/${familyId}`).once('value')).val();
    console.log(`   ✓ Grade 2 in backend: ${famAfter2.gradeRequests.length} grades`);
    
    // Verify both grades are present
    const finalGrades = famAfter2.gradeRequests || [];
    console.log('\n4️⃣  Final verification');
    finalGrades.forEach((g, i) => {
      console.log(`   Grade ${i+1}: ${g.subject} (${g.grade}) - ${g.status}`);
    });
    
    const hasFr = finalGrades.some(g => g.subject === 'Français' && g.grade === '10/20');
    const hasHist = finalGrades.some(g => g.subject === 'Histoire' && g.grade === '15/20');
    const pass = finalGrades.length === 2 && hasFr && hasHist;
    
    console.log(`\n✅ Both grades present: ${pass ? 'YES' : 'NO'}`);
    console.log(`   Français: ${hasFr ? '✓' : '✗'}`);
    console.log(`   Histoire: ${hasHist ? '✓' : '✗'}`);
    
    return pass;
  } catch (err) {
    console.error('❌ Error:', err.message);
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

const success = await testRealGradeFlow();
process.exit(success ? 0 : 1);
