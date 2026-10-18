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

console.log('Reading current family...');
db.ref(`families/${familyId}`).once('value', snap => {
  const f = snap.val();
  if (!f) {
    console.log('Family not found');
    process.exit(1);
  }
  
  console.log('Converting all array-like fields to proper arrays...');
  
  const arrayFields = ['children', 'questList', 'proposals', 'rewards', 'requests', 'gradeRequests', 'taskRequests', 'sanctionsList'];
  
  arrayFields.forEach(field => {
    if (f[field] && typeof f[field] === 'object' && !Array.isArray(f[field])) {
      f[field] = Object.values(f[field]).filter(v => v != null);
      console.log(`  ✅ Converted ${field}: ${Array.isArray(f[field]) ? 'ARRAY' : 'FAILED'}`);
    }
  });
  
  // Also convert children's tasks
  if (f.children && Array.isArray(f.children)) {
    f.children.forEach((child, i) => {
      if (child && child.tasks && typeof child.tasks === 'object' && !Array.isArray(child.tasks)) {
        child.tasks = Object.values(child.tasks).filter(v => v != null);
        console.log(`    Child ${i} tasks: converted to ARRAY`);
      }
    });
  }
  
  console.log('\nSaving fixed family...');
  db.ref(`families/${familyId}`).set(f).then(() => {
    console.log('✅ Family rebuilt successfully!');
    process.exit(0);
  }).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
});
