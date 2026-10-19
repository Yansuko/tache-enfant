import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();
const db = admin.database();

async function check() {
  try {
    const user = await auth.getUserByEmail('parent@demo.fr');
    console.log('1. UID:', user.uid.substring(0, 10) + '...');
    
    const userSnap = await db.ref(`users/${user.uid}`).once('value');
    const userData = userSnap.val();
    console.log('2. User familyIds:', userData?.familyIds);
    
    const famSnap = await db.ref('families/fam-demo').once('value');
    const famData = famSnap.val();
    console.log('3. Family children:', famData?.children?.length || 0);
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

check();
