import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

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

async function checkFirebase() {
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();
  
  console.log('=== Raw Firebase data ===');
  console.log('Family ID:', family?.id);
  console.log('Family name:', family?.name);
  
  console.log('\n=== Children analysis ===');
  console.log('children type:', typeof family?.children);
  console.log('children isArray:', Array.isArray(family?.children));
  if (family?.children && typeof family.children === 'object' && !Array.isArray(family.children)) {
    const childrenObj = family.children;
    console.log('Children is an OBJECT with keys:', Object.keys(childrenObj));
    const childrenArray = Object.values(childrenObj).filter(v => v !== null && v !== undefined);
    console.log('As array would have', childrenArray.length, 'items');
    childrenArray.forEach((c, i) => {
      console.log(`  [${i}] ${c.name}: id=${c.id}`);
    });
  } else if (Array.isArray(family?.children)) {
    console.log('Children is an ARRAY with', family.children.length, 'items');
    family.children.forEach((c, i) => {
      console.log(`  [${i}] ${c.name}: id=${c.id}`);
    });
  }
}

checkFirebase().catch(console.error);
