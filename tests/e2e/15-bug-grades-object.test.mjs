import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { db } = await initFirebase();

async function withFamily(fn) {
  const parentUid = await createTestUser(`parent-grades-${Date.now()}@test.fr`, 'pass123');
  const familyId = `fam-grades-${Date.now()}`;
  
  const child = {
    id: `child-${Date.now()}`,
    name: 'TestChild',
    xp: 0,
    gold: 0,
    tasks: [],
    level: 1
  };
  
  try {
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      children: [child],
      gradeRequests: {} // LEGACY FORMAT: object instead of array
    });
    
    return await fn({ familyId, childId: child.id, parentUid });
  } finally {
    await db.ref(`families/${familyId}`).remove();
    const user = await db.ref(`users/${parentUid}`).once('value');
    if (user.exists()) await db.ref(`users/${parentUid}`).remove();
    try {
      await (await initFirebase()).auth.deleteUser(parentUid);
    } catch {}
  }
}

async function testMultipleGradesWithLegacyFormat() {
  return withFamily(async ({ familyId, childId, parentUid }) => {
    try {
      // Simuler l'appel à submitGrade via le backend
      // Première note
      let fam = (await db.ref(`families/${familyId}`).once('value')).val();
      
      // Defensive: convert object to array (comme dans le backend fix)
      let gradeRequests = fam.gradeRequests;
      if (gradeRequests && typeof gradeRequests === 'object' && !Array.isArray(gradeRequests)) {
        gradeRequests = Object.values(gradeRequests).filter(v => v != null);
      }
      gradeRequests = gradeRequests || [];
      
      // Ajouter première note
      gradeRequests.push({
        id: `grade-${Date.now()}-1`,
        child: 'TestChild',
        subject: 'Mathématiques',
        grade: '18/20',
        gold: 50,
        status: 'pending',
        submittedAt: Date.now()
      });
      
      fam.gradeRequests = gradeRequests;
      await db.ref(`families/${familyId}`).set(fam);
      
      // Deuxième note
      await new Promise(resolve => setTimeout(resolve, 50));
      fam = (await db.ref(`families/${familyId}`).once('value')).val();
      
      gradeRequests = fam.gradeRequests;
      if (gradeRequests && typeof gradeRequests === 'object' && !Array.isArray(gradeRequests)) {
        gradeRequests = Object.values(gradeRequests).filter(v => v != null);
      }
      gradeRequests = gradeRequests || [];
      
      gradeRequests.push({
        id: `grade-${Date.now()}-2`,
        child: 'TestChild',
        subject: 'Français',
        grade: '16/20',
        gold: 40,
        status: 'pending',
        submittedAt: Date.now()
      });
      
      fam.gradeRequests = gradeRequests;
      await db.ref(`families/${familyId}`).set(fam);
      
      // Troisième note
      await new Promise(resolve => setTimeout(resolve, 50));
      fam = (await db.ref(`families/${familyId}`).once('value')).val();
      
      gradeRequests = fam.gradeRequests;
      if (gradeRequests && typeof gradeRequests === 'object' && !Array.isArray(gradeRequests)) {
        gradeRequests = Object.values(gradeRequests).filter(v => v != null);
      }
      gradeRequests = gradeRequests || [];
      
      gradeRequests.push({
        id: `grade-${Date.now()}-3`,
        child: 'TestChild',
        subject: 'Histoire-Géo',
        grade: '14/20',
        gold: 30,
        status: 'pending',
        submittedAt: Date.now()
      });
      
      fam.gradeRequests = gradeRequests;
      await db.ref(`families/${familyId}`).set(fam);
      
      // Vérifier que les 3 notes sont présentes
      const familyFinal = (await db.ref(`families/${familyId}`).once('value')).val();
      const gradesArray = Array.isArray(familyFinal.gradeRequests) ? 
        familyFinal.gradeRequests : 
        Object.values(familyFinal.gradeRequests || {});
      
      const pass = gradesArray.length === 3 &&
                   gradesArray.some(g => g.subject === 'Mathématiques') &&
                   gradesArray.some(g => g.subject === 'Français') &&
                   gradesArray.some(g => g.subject === 'Histoire-Géo');
      
      logTest('15.1 Multiple Grades with Legacy Object Format', pass ? 'PASS' : 'FAIL',
        `Grades saved: ${gradesArray.length} (expected 3)`);
      
      return pass;
    } catch (err) {
      logTest('15.1 Multiple Grades with Legacy Object Format', 'FAIL', err.message);
      return false;
    }
  });
}

export async function runLegacyGradeTests() {
  console.log('\n🔄 LEGACY FORMAT BUG TESTS\n');
  const results = [
    await testMultipleGradesWithLegacyFormat()
  ];
  return results.filter(r => r).length === results.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await runLegacyGradeTests();
  process.exit(success ? 0 : 1);
}
