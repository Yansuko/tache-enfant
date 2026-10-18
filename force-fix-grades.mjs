import admin from 'firebase-admin';
import fs from 'fs';

// Load .env
const envContent = fs.readFileSync('.env', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) process.env[key.trim()] = val.trim();
});

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const familyId = 'fam-1792359166434-9h37yw72i';

db.ref(`families/${familyId}/gradeRequests`).once('value', snap => {
  const grades = snap.val();
  if (!grades) {
    console.log('gradeRequests not found');
    process.exit(0);
  }
  
  if (Array.isArray(grades)) {
    console.log('Already an ARRAY');
    process.exit(0);
  }
  
  const arr = Object.values(grades);
  console.log(`Converting OBJECT with ${Object.keys(grades).length} keys to ARRAY with ${arr.length} items`);
  
  db.ref(`families/${familyId}/gradeRequests`).set(arr).then(() => {
    console.log('✅ Fixed!');
    process.exit(0);
  }).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
});
