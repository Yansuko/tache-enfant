import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();
const db = admin.database();

async function test() {
  try {
    // Get user
    const user = await auth.getUserByEmail('parent@demo.fr');
    console.log('UID:', user.uid);
    
    // Simulate me endpoint
    const userSnapshot = await db.ref(`users/${user.uid}`).once('value');
    console.log('User data:', userSnapshot.val());
    
    // Get family
    const familyIds = userSnapshot.val()?.familyIds || [];
    for (const famId of familyIds) {
      const famSnapshot = await db.ref(`families/${famId}`).once('value');
      const famData = famSnapshot.val();
      console.log('Family:', {
        name: famData?.name,
        children_keys: Object.keys(famData?.children || {}),
        children_length: famData?.children?.length,
        children_type: typeof famData?.children,
        children_first_3_keys: Object.keys(famData?.children || {}).slice(0, 3)
      });
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

test();
