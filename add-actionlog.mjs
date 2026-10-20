import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-service-account.json', 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function addActionLog() {
  console.log('Reading current fam-demo...');
  const snap = await db.ref('families/fam-demo').once('value');
  const fam = snap.val();
  
  console.log('Current keys:', Object.keys(fam || {}).sort());
  
  // Add actionLog field
  console.log('\nAdding actionLog field...');
  await db.ref('families/fam-demo/actionLog').set([
    {
      timestamp: Date.now(),
      userId: 'demo-parent',
      actionType: 'test_entry',
      target: 'test',
      details: {},
      status: 'success'
    }
  ]);
  console.log('✓ Set actionLog');
  
  // Read back
  console.log('\nReading back...');
  const snap2 = await db.ref('families/fam-demo').once('value');
  const fam2 = snap2.val();
  
  console.log('New keys:', Object.keys(fam2 || {}).sort());
  console.log('actionLog in response:', 'actionLog' in fam2);
  console.log('actionLog value:', fam2?.actionLog);
  
  process.exit(0);
}

addActionLog().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
