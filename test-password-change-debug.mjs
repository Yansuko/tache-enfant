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
    // 1. Get user by email
    const user = await auth.getUserByEmail('parent@demo.fr');
    console.log('UID:', user.uid);
    
    // 2. Check children BEFORE password change
    const famBefore = await db.ref('families/fam-demo/children').once('value');
    console.log('BEFORE password change:', {
      childrenCount: famBefore.val()?.length,
      childrenType: typeof famBefore.val()
    });
    
    // 3. Change password
    await auth.updateUser(user.uid, { password: 'testpass123' });
    console.log('✅ Password changed successfully');
    
    // 4. Check children AFTER password change
    const famAfter = await db.ref('families/fam-demo/children').once('value');
    console.log('AFTER password change:', {
      childrenCount: famAfter.val()?.length,
      childrenType: typeof famAfter.val()
    });
    
    // 5. Check if calling the me endpoint would return children
    const userRef = await db.ref(`users/${user.uid}`).once('value');
    console.log('User data:', {
      familyIds: userRef.val()?.familyIds
    });
    
    // 6. Fetch family again
    const fam = await db.ref('families/fam-demo').once('value');
    console.log('Full family data keys:', Object.keys(fam.val() || {}));
    console.log('Children in family:', fam.val()?.children?.length);
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

test();
