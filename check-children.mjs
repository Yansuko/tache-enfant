import admin from 'firebase-admin';
import fs from 'fs';
import { exec } from 'child_process';

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
db.ref('families').once('value', snap => {
  const families = snap.val() || {};
  Object.entries(families).forEach(([fid, f]) => {
    console.log(`\nFamily ${fid}:`);
    if (f.children) {
      if (Array.isArray(f.children)) {
        console.log(`  children is ARRAY with ${f.children.length} items`);
        f.children.forEach((c, i) => {
          console.log(`    [${i}]: name="${c?.name || '(undefined)'}"`);
        });
      } else if (typeof f.children === 'object') {
        const keys = Object.keys(f.children);
        console.log(`  children is OBJECT with keys: ${keys.join(', ')}`);
        keys.forEach(ckey => {
          const c = f.children[ckey];
          console.log(`    ${ckey}: name="${c?.name || '(undefined)'}"`);
        });
      }
    }
  });
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
