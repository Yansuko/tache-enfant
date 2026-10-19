import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
});

const auth = admin.auth();
const db = admin.database();

async function createDemoUser() {
  try {
    console.log('📝 Création de l\'utilisateur démo...\n');
    
    const user = await auth.createUser({
      email: 'parent@demo.fr',
      password: 'demo123',
      displayName: 'Parent Démo'
    });
    
    console.log('✅ Utilisateur créé:', user.uid);
    
    await db.ref(`users/${user.uid}`).set({
      email: 'parent@demo.fr',
      name: 'Parent Démo',
      familyIds: ['fam-demo'],
      createdAt: Date.now()
    });
    
    console.log('✅ Entrée DB créée');
    console.log('\n✨ Utilisateur démo prêt:');
    console.log('   Email: parent@demo.fr');
    console.log('   Mot de passe: demo123');
    
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      console.log('ℹ️  Utilisateur déjà existant');
    } else {
      console.error('❌ Erreur:', e.message);
    }
  }
  process.exit(0);
}

createDemoUser();
