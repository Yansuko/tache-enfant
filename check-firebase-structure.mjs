import admin from 'firebase-admin';
import fs from 'fs';

try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
} catch {}

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
} catch {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function check() {
  const familyId = 'fam-2edd490ceb';
  
  console.log('Checking structure for family:', familyId, '\n');
  
  // Check top-level family
  const famSnapshot = await db.ref(`families/${familyId}`).once('value');
  const famData = famSnapshot.val();
  
  console.log('Top-level family data keys:', Object.keys(famData || {}).sort());
  console.log('Children at top level:', famData?.children?.length || 'undefined');
  
  // Check separate children path
  const childrenSnapshot = await db.ref(`families/${familyId}/children`).once('value');
  console.log('\n/families/{id}/children exists:', childrenSnapshot.exists());
  if (childrenSnapshot.exists()) {
    const childrenData = childrenSnapshot.val();
    console.log('Children at /families/{id}/children:', childrenData);
  }
  
  // Dump entire family structure
  console.log('\n\n📋 Full family structure:');
  console.log(JSON.stringify(famData, null, 2).substring(0, 500) + '...');
  
  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
