import admin from 'firebase-admin';
import fs from 'fs';

// Load .env
const envContent = fs.readFileSync('.env', 'utf8');
envContent.split('\n').forEach(line => {
  const [key, val] = line.split('=').map(s => s.trim());
  if (key && val) process.env[key] = val;
});

let serviceAccount = {};
try {
  const accountJson = fs.readFileSync('firebase-service-account.json', 'utf-8');
  serviceAccount = JSON.parse(accountJson);
} catch {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
}

if (!serviceAccount.project_id) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
} catch (e) {
  if (!e.message.includes('already exists')) throw e;
}

const db = admin.database();

async function fixFamilyChildren() {
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();

  if (!family?.children || Array.isArray(family.children)) {
    console.log('Children already an array or missing, no fix needed');
    return;
  }

  // Convert object to array, deduplicating by ID
  const childrenObj = family.children;
  const childrenMap = new Map();

  // First, add all children indexed by ID
  for (const [key, child] of Object.entries(childrenObj)) {
    if (child && child.id) {
      childrenMap.set(child.id, child);
    }
  }

  const childrenArray = Array.from(childrenMap.values());
  console.log('Fixed children array:');
  childrenArray.forEach((c, i) => {
    console.log(`  [${i}] ${c.name} (id: ${c.id})`);
  });

  // Update Firebase
  family.children = childrenArray;
  await db.ref('families/fam-demo').update({ children: childrenArray });

  console.log('\nFamily updated in Firebase');
}

fixFamilyChildren().catch(console.error).finally(() => process.exit(0));
