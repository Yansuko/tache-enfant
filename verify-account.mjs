import admin from 'firebase-admin';
import fs from 'fs';

const DEFAULT_DB_URL = 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app';
const keyPath = new URL('./firebase-service-account.json', import.meta.url);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf-8'))),
    databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL
  });
}

const db = admin.database();

async function verify() {
  console.log('Checking accounts in Firebase:\n');
  
  const usersSnap = await db.ref('users').once('value');
  const users = usersSnap.val() || {};
  
  console.log(`Users found: ${Object.keys(users).length}`);
  for (const [path, user] of Object.entries(users)) {
    console.log(`  ${path}:`);
    console.log(`    email: ${user.email}`);
    console.log(`    name: ${user.name}`);
    console.log(`    salt: ${user.salt ? 'YES' : 'NO'}`);
    console.log(`    hash: ${user.hash ? user.hash.substring(0, 20)+'...' : 'NO'}`);
  }
}

await verify();
process.exit(0);
