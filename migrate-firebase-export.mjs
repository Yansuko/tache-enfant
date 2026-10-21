import admin from 'firebase-admin';
import fs from 'fs';

// Load Firebase credentials
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function exportFirebase() {
  console.log('Exporting Firebase database...');
  
  try {
    const snapshot = await db.ref('/').once('value');
    const data = snapshot.val();
    
    // Write to file
    fs.writeFileSync('firebase-export.json', JSON.stringify(data, null, 2));
    console.log('✅ Firebase export complete: firebase-export.json');
    console.log('   Size:', fs.statSync('firebase-export.json').size, 'bytes');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Export failed:', err.message);
    process.exit(1);
  }
}

exportFirebase();
