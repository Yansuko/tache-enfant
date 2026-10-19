import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { db } = await initFirebase();

async function withChild(fn) {
  const parentUid = await createTestUser(`parent-bug-${Date.now()}@test.fr`, 'pass123');
  const familyId = `fam-bug-${Date.now()}`;
  
  const child = {
    id: `child-${Date.now()}`,
    name: 'TestChild',
    xp: 0,
    gold: 0,
    tasks: [],
    notes: [],
    level: 1
  };
  
  try {
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      children: [child]
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

async function testMultipleNotesAddition() {
  return withChild(async ({ familyId, parentUid }) => {
    try {
      // Ajouter la première note
      let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const note1 = {
        id: `note-${Date.now()}-1`,
        content: 'Première note',
        timestamp: Date.now()
      };
      child.notes = child.notes || [];
      child.notes.push(note1);
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Ajouter la deuxième note
      await new Promise(resolve => setTimeout(resolve, 100)); // Petit délai
      child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const note2 = {
        id: `note-${Date.now()}-2`,
        content: 'Deuxième note',
        timestamp: Date.now()
      };
      child.notes = child.notes || [];
      child.notes.push(note2);
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Ajouter la troisième note
      await new Promise(resolve => setTimeout(resolve, 100));
      child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const note3 = {
        id: `note-${Date.now()}-3`,
        content: 'Troisième note',
        timestamp: Date.now()
      };
      child.notes = child.notes || [];
      child.notes.push(note3);
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Vérifier que les 3 notes sont présentes
      const childFinal = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const notesCount = childFinal.notes?.length || 0;
      const hasAllNotes = notesCount === 3 &&
                         childFinal.notes.some(n => n.content === 'Première note') &&
                         childFinal.notes.some(n => n.content === 'Deuxième note') &&
                         childFinal.notes.some(n => n.content === 'Troisième note');
      
      const pass = hasAllNotes;
      logTest('13.1 Multiple Notes Addition', pass ? 'PASS' : 'FAIL', 
        `Notes found: ${notesCount} (expected 3)`);
      
      return pass;
    } catch (err) {
      logTest('13.1 Multiple Notes Addition', 'FAIL', err.message);
      return false;
    }
  });
}

export async function runBugTests() {
  console.log('\n🐛 BUG REGRESSION TESTS\n');
  const results = [
    await testMultipleNotesAddition()
  ];
  return results.filter(r => r).length === results.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await runBugTests();
  process.exit(success ? 0 : 1);
}
