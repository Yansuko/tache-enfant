import admin from 'firebase-admin';
import fs from 'fs';

// Load Firebase config
let serviceAccount = {};
try {
  const accountPath = '/home/yansu/workspace/firebase-service-account.json';
  const accountJson = fs.readFileSync(accountPath, 'utf-8');
  serviceAccount = JSON.parse(accountJson);
} catch (e) {
  console.error('Could not load service account:', e.message);
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
} catch (e) {
  if (!e.message.includes('already exists')) throw e;
}

const db = admin.database();

async function test() {
  console.log('\n=== STEP 1: Check fam-demo family ===');
  const snap = await db.ref('families/fam-demo').once('value');
  const fam = snap.val();
  
  if (!fam) {
    console.log('❌ fam-demo not found');
    process.exit(1);
  }
  
  console.log('✓ Found fam-demo');
  console.log('  - Children:', fam.children?.length || 0);
  console.log('  - ActionLog before:', fam.actionLog?.length || 0);
  
  // Check Test child
  const testChild = (fam.children || []).find(c => c.name === 'Test');
  if (!testChild) {
    console.log('❌ Test child not found');
    process.exit(1);
  }
  console.log('✓ Found Test child, gold:', testChild.gold);
  
  console.log('\n=== STEP 2: Simulate applying sanction ===');
  // Add a sanction entry
  if (!Array.isArray(fam.actionLog)) fam.actionLog = [];
  fam.actionLog.push({
    timestamp: Date.now(),
    userId: 'test-parent',
    actionType: 'sanction_applied',
    target: 'Test Sanction',
    details: { child: 'Test', goldDeducted: 50, applier: 'TestParent' },
    status: 'success',
    datetime: new Date().toISOString()
  });
  
  testChild.gold = Math.max(0, testChild.gold - 50);
  testChild.sanctions = testChild.sanctions || [];
  testChild.sanctions.unshift({ motif: 'Test Sanction', gold: 50 });
  
  console.log('✓ Added sanction to actionLog');
  console.log('  - ActionLog after:', fam.actionLog?.length || 0);
  console.log('  - Test child gold:', testChild.gold);
  
  console.log('\n=== STEP 3: Write to Firebase ===');
  await db.ref('families/fam-demo').set(fam);
  console.log('✓ Wrote to Firebase');
  
  console.log('\n=== STEP 4: Read back from Firebase ===');
  const snap2 = await db.ref('families/fam-demo').once('value');
  const fam2 = snap2.val();
  console.log('✓ Read back');
  console.log('  - ActionLog in Firebase:', fam2.actionLog?.length || 0);
  if (fam2.actionLog && fam2.actionLog.length > 0) {
    const lastEntry = fam2.actionLog[fam2.actionLog.length - 1];
    console.log('  - Last entry:', { actionType: lastEntry.actionType, userId: lastEntry.userId, timestamp: new Date(lastEntry.timestamp).toISOString() });
  }
  
  console.log('\n=== STEP 5: Call getAdminStats ===');
  // Simulate reading all families
  const familiesSnap = await db.ref('families').once('value');
  const allFamilies = familiesSnap.val() || {};
  
  const allAuditLogs = [];
  for (const famId of Object.keys(allFamilies)) {
    const f = allFamilies[famId];
    if (f && f.actionLog && Array.isArray(f.actionLog)) {
      allAuditLogs.push(...f.actionLog);
    }
  }
  
  allAuditLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  console.log('✓ Collected audit logs from all families');
  console.log('  - Total audit logs:', allAuditLogs.length);
  
  // Find our sanction entry
  const sanctionEntry = allAuditLogs.find(a => a.actionType === 'sanction_applied' && a.details?.child === 'Test');
  if (sanctionEntry) {
    console.log('✓ Found sanction entry in audit logs');
    console.log('  - Entry:', JSON.stringify(sanctionEntry));
  } else {
    console.log('❌ Could not find sanction entry in audit logs!');
  }
  
  process.exit(0);
}

test().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
