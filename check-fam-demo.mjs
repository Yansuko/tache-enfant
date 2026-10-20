import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-service-account.json', 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function check() {
  const snap = await db.ref('families/fam-demo').once('value');
  const fam = snap.val();
  
  console.log('Current fam-demo structure:');
  console.log(JSON.stringify(fam, null, 2).substring(0, 500) + '...');
  
  process.exit(0);
}

check().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
