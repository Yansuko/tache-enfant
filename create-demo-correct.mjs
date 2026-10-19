import admin from 'firebase-admin';
import fs from 'fs';
import crypto from 'crypto';

const DEFAULT_DB_URL = 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app';
const keyPath = new URL('./firebase-service-account.json', import.meta.url);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf-8'))),
    databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL
  });
}

const db = admin.database();

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return { salt, hash };
}

async function create() {
  console.log('Creating demo account with correct hashing (scrypt)...\n');
  
  const { salt, hash } = hashPassword('demo');
  
  await db.ref('users/email-parent_demo_fr').set({
    email: 'parent@demo.fr',
    name: 'Parent démo',
    salt,
    hash,
    familyIds: ['fam-demo']
  });
  
  console.log('✅ Demo account created: parent@demo.fr / demo');
  console.log('  salt:', salt);
  console.log('  hash:', hash.substring(0, 20)+'...');
}

await create();
process.exit(0);
