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
const arrayFields = ['children', 'questList', 'proposals', 'rewards', 'requests', 'gradeRequests', 'taskRequests', 'sanctionsList'];

db.ref('families').once('value', snap => {
  const families = snap.val() || {};
  const updates = {};
  
  Object.entries(families).forEach(([fid, f]) => {
    if (!f) return;
    
    arrayFields.forEach(field => {
      if (f[field] && typeof f[field] === 'object' && !Array.isArray(f[field])) {
        const arr = Object.values(f[field]);
        if (arr.length > 0) {
          console.log(`Family ${fid}: Converting ${field} from OBJECT to ARRAY (${arr.length} items)`);
          updates[`families/${fid}/${field}`] = arr;
        }
      }
    });
  });
  
  if (Object.keys(updates).length === 0) {
    console.log('No updates needed');
    process.exit(0);
  }
  
  console.log(`\nApplying ${Object.keys(updates).length} updates...`);
  db.ref().update(updates).then(() => {
    console.log('✅ All arrays fixed!');
    process.exit(0);
  }).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
});
