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
db.ref('families/fam-1792359166434-9h37yw72i').once('value', snap => {
  const f = snap.val();
  if (!f) { console.log('Family not found'); process.exit(0); }
  
  const fields = ['children', 'questList', 'proposals', 'rewards', 'requests', 'gradeRequests', 'taskRequests', 'sanctionsList'];
  
  fields.forEach(field => {
    if (f[field]) {
      if (Array.isArray(f[field])) {
        console.log(`${field}: ARRAY (${f[field].length} items)`);
      } else {
        console.log(`${field}: OBJECT (${Object.keys(f[field]).length} keys)`);
      }
    } else {
      console.log(`${field}: undefined`);
    }
  });
  
  process.exit(0);
});
