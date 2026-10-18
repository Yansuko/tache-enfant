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

async function debug() {
  const familyId = 'fam-2edd490ceb';
  
  console.log('Debugging backend data retrieval:\n');
  
  // Method 1: Direct family fetch (what the backend does currently)
  const famSnapshot = await db.ref(`families/${familyId}`).once('value');
  const famData = famSnapshot.val();
  
  console.log('1. Direct /families/{id} fetch:');
  console.log('   Has children field:', !!famData.children);
  console.log('   Children count:', famData?.children?.length || 0);
  console.log('   Children is Array:', Array.isArray(famData.children));
  
  // Method 2: Separate children fetch
  const childrenSnapshot = await db.ref(`families/${familyId}/children`).once('value');
  console.log('\n2. Separate /families/{id}/children fetch:');
  console.log('   Exists:', childrenSnapshot.exists());
  if (childrenSnapshot.exists()) {
    const childrenData = childrenSnapshot.val();
    console.log('   Type:', typeof childrenData);
    console.log('   Is Array:', Array.isArray(childrenData));
    console.log('   Count:', Array.isArray(childrenData) ? childrenData.length : Object.keys(childrenData).length);
  }
  
  process.exit(0);
}

debug().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
