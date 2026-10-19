import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function test() {
  // Simulate what the me endpoint does
  const user = await admin.auth().getUserByEmail('parent@demo.fr');
  const userSnapshot = await db.ref(`users/${user.uid}`).once('value');
  const userData = userSnapshot.val();
  
  console.log('User familyIds:', userData.familyIds);
  
  for (const familyId of userData.familyIds || []) {
    const famSnapshot = await db.ref(`families/${familyId}`).once('value');
    if (famSnapshot.exists()) {
      const famData = famSnapshot.val();
      console.log('Family:', {
        name: famData.name,
        children_count: famData.children?.length,
        children_type: Array.isArray(famData.children) ? 'array' : typeof famData.children,
        children_names: famData.children?.slice(0, 3).map(c => c.name)
      });
    }
  }
  
  process.exit(0);
}

test();
