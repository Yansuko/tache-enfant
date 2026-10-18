import admin from 'firebase-admin';
import fs from 'fs';

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

// First, delete the entire gradeRequests field
console.log('Step 1: Deleting gradeRequests...');
db.ref(`families/${familyId}/gradeRequests`).remove().then(() => {
  console.log('Deleted. Now checking...');
  
  // Then get the family to see what we have
  return db.ref(`families/${familyId}`).once('value');
}).then(snap => {
  const f = snap.val();
  if (f.gradeRequests) {
    console.log('gradeRequests still exists!');
    console.log('Type:', Array.isArray(f.gradeRequests) ? 'ARRAY' : 'OBJECT');
  } else {
    console.log('✅ gradeRequests removed successfully');
  }
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
