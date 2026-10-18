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

console.log(`Fixing family ${familyId}...\n`);

db.ref(`families/${familyId}/children`).once('value', snap => {
  const children = snap.val();
  
  if (!children) {
    console.log('No children found');
    process.exit(0);
  }
  
  console.log('Current structure:');
  if (Array.isArray(children)) {
    console.log('  - Already an ARRAY');
  } else {
    console.log('  - OBJECT with keys:', Object.keys(children).join(', '));
  }
  
  // Convert to array and remove undefined entries
  const childrenArray = [];
  if (Array.isArray(children)) {
    childrenArray.push(...children);
  } else {
    // It's an object, extract numeric keys and skip undefined entries
    Object.entries(children).forEach(([key, child]) => {
      if (!isNaN(key)) {
        childrenArray.push(child);
      } else if (child && child.name && child.name !== '(undefined)') {
        childrenArray.push(child);
      }
    });
  }
  
  console.log(`\nConverting to array (${childrenArray.length} valid children)...`);
  childrenArray.forEach((c, i) => {
    console.log(`  [${i}]: ${c.name}`);
  });
  
  // Update the family with the fixed children
  db.ref(`families/${familyId}/children`).set(childrenArray).then(() => {
    console.log('\n✅ Children fixed successfully!');
    process.exit(0);
  }).catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
  });
});
