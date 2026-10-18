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

async function fix() {
  console.log('Fixing yansu@free.fr family association...\n');
  
  // Find yansu@free.fr user
  const usersRef = db.ref('users');
  const usersSnapshot = await usersRef.once('value');
  const users = usersSnapshot.val() || {};
  
  let yansufreeUid = null;
  for (const [uid, user] of Object.entries(users)) {
    if (user.email === 'yansu@free.fr') {
      yansufreeUid = uid;
      console.log('Found yansu@free.fr user:',  uid);
      console.log('Current familyIds:', user.familyIds);
      break;
    }
  }
  
  if (!yansufreeUid) {
    console.log('❌ yansu@free.fr not found');
    process.exit(1);
  }
  
  // Update to use the family WITH children
  console.log('\nUpdating familyIds to [fam-2edd490ceb]...');
  await db.ref(`users/${yansufreeUid}/familyIds`).set(['fam-2edd490ceb']);
  
  console.log('✅ Family association updated!');
  process.exit(0);
}

fix().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
