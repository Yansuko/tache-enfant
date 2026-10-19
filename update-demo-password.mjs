import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();

async function updatePassword() {
  try {
    const user = await auth.getUserByEmail('parent@demo.fr');
    await auth.updateUser(user.uid, { password: 'demo123' });
    console.log('✅ Mot de passe changé en: demo123');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
  process.exit(0);
}

updatePassword();
