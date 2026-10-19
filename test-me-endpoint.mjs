import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.database();

async function checkData() {
  const famSnap = await db.ref('families/fam-demo').once('value');
  const fam = famSnap.val();
  
  console.log('🔍 Ce que Firebase retourne pour families/fam-demo:');
  console.log('   Clés:', Object.keys(fam || {}));
  console.log('   Enfants:', fam?.children);
  console.log('\n📋 Contenu complet:');
  console.log(JSON.stringify(fam, null, 2).substring(0, 500));
}

checkData();
process.exit(0);
