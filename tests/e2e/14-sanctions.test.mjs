import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { db } = await initFirebase();

async function withFamily(fn) {
  const parentUid = await createTestUser(`parent-sanc-${Date.now()}@test.fr`, 'pass123');
  const familyId = `fam-sanc-${Date.now()}`;
  
  const child = {
    id: `child-${Date.now()}`,
    name: 'TestChild',
    xp: 100,
    gold: 50,
    tasks: [],
    sanctions: [],
    level: 2
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

async function test141ApplySanction() {
  return withFamily(async ({ familyId, parentUid }) => {
    try {
      // Parent applique une sanction à l'enfant
      let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      
      const sanction = {
        id: `sanction-${Date.now()}`,
        reason: 'Refus de faire les devoirs',
        xpDeducted: 10,
        goldDeducted: 5,
        appliedAt: Date.now(),
        appliedBy: 'parent'
      };
      
      child.sanctions = child.sanctions || [];
      child.sanctions.push(sanction);
      child.xp -= sanction.xpDeducted;
      child.gold -= sanction.goldDeducted;
      
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Vérifier que la sanction est enregistrée
      const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const sanctionSaved = childAfter.sanctions?.length === 1;
      const xpDeducted = childAfter.xp === 90; // 100 - 10
      const goldDeducted = childAfter.gold === 45; // 50 - 5
      
      const pass = sanctionSaved && xpDeducted && goldDeducted;
      logTest('14.1 Apply Sanction', pass ? 'PASS' : 'FAIL', 
        `Sanctions: ${childAfter.sanctions?.length}, XP: ${childAfter.xp}, Gold: ${childAfter.gold}`);
      
      return pass;
    } catch (err) {
      logTest('14.1 Apply Sanction', 'FAIL', err.message);
      return false;
    }
  });
}

async function test142MultipleSanctions() {
  return withFamily(async ({ familyId, parentUid }) => {
    try {
      // Appliquer plusieurs sanctions
      let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      child.sanctions = [];
      
      // Sanction 1
      const sanction1 = {
        id: `sanc-1`,
        reason: 'Refus devoirs',
        xpDeducted: 10,
        goldDeducted: 5,
        appliedAt: Date.now()
      };
      child.sanctions.push(sanction1);
      child.xp -= 10;
      child.gold -= 5;
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Sanction 2
      child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const sanction2 = {
        id: `sanc-2`,
        reason: 'Dispute avec frère',
        xpDeducted: 5,
        goldDeducted: 3,
        appliedAt: Date.now() + 1000
      };
      child.sanctions.push(sanction2);
      child.xp -= 5;
      child.gold -= 3;
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Vérifier 2 sanctions
      const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const pass = childAfter.sanctions?.length === 2 && 
                   childAfter.xp === 85 && // 100 - 10 - 5
                   childAfter.gold === 42; // 50 - 5 - 3
      
      logTest('14.2 Multiple Sanctions', pass ? 'PASS' : 'FAIL',
        `Sanctions: ${childAfter.sanctions?.length}, XP: ${childAfter.xp}, Gold: ${childAfter.gold}`);
      
      return pass;
    } catch (err) {
      logTest('14.2 Multiple Sanctions', 'FAIL', err.message);
      return false;
    }
  });
}

async function test143RemoveSanction() {
  return withFamily(async ({ familyId, parentUid }) => {
    try {
      // Ajouter 2 sanctions, puis en supprimer 1
      let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      child.sanctions = [
        { id: 's1', reason: 'Sanction 1', xpDeducted: 10, goldDeducted: 5 },
        { id: 's2', reason: 'Sanction 2', xpDeducted: 5, goldDeducted: 3 }
      ];
      child.xp = 85; // Après 2 sanctions
      child.gold = 42;
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Supprimer la première sanction
      child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const removedSanction = child.sanctions.shift();
      
      // Restaurer XP et gold de la sanction supprimée
      child.xp += removedSanction.xpDeducted;
      child.gold += removedSanction.goldDeducted;
      
      await db.ref(`families/${familyId}/children/0`).set(child);
      
      // Vérifier
      const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
      const pass = childAfter.sanctions?.length === 1 && 
                   childAfter.xp === 95 && // 85 + 10
                   childAfter.gold === 47; // 42 + 5
      
      logTest('14.3 Remove Sanction', pass ? 'PASS' : 'FAIL',
        `Sanctions: ${childAfter.sanctions?.length}, XP: ${childAfter.xp}, Gold: ${childAfter.gold}`);
      
      return pass;
    } catch (err) {
      logTest('14.3 Remove Sanction', 'FAIL', err.message);
      return false;
    }
  });
}

export async function runSanctionTests() {
  console.log('\n⚖️  SANCTION MANAGEMENT TESTS\n');
  const results = [
    await test141ApplySanction(),
    await test142MultipleSanctions(),
    await test143RemoveSanction()
  ];
  return results.filter(r => r).length === results.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await runSanctionTests();
  process.exit(success ? 0 : 1);
}
