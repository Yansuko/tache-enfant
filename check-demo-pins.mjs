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

const DIR = path.dirname(fileURLToPath(import.meta.url));

let serviceAccount = {};
try {
  const accountPath = path.join(DIR, 'firebase-service-account.json');
  const accountJson = fs.readFileSync(accountPath, 'utf-8');
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

async function checkPins() {
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();
  
  console.log('Family structure:');
  console.log('  Children:', family.children?.length);
  
  if (family.children) {
    for (const child of family.children) {
      console.log(`    ${child.name}: PIN=${child.pin || 'NOT SET'}, ID=${child.id}`);
    }
  }
}

checkPins().catch(console.error);
