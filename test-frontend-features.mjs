#!/usr/bin/env node
/**
 * Test Frontend Features - Simule les opérations du frontend
 * Teste: changePassword et gestion des notes
 */

import fetch from 'node-fetch';
import admin from 'firebase-admin';
import fs from 'fs';

// Load .env first
try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
} catch {}

// Configuration
const BASE_URL = 'http://localhost:8123';
const API_ENDPOINT = `${BASE_URL}/api`;

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
} catch {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const auth = admin.auth();
const db = admin.database();

async function callApi(action, body, token) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    body: JSON.stringify({ action, ...body })
  });

  const data = await response.json();
  return { status: response.status, ...data };
}

async function test() {
  console.log('🧪 TEST FRONTEND FEATURES\n');
  console.log('═'.repeat(50) + '\n');

  // 1. Créer un utilisateur de test
  console.log('📝 Phase 1: Setup\n');
  const testEmail = `frontend-test-${Date.now()}@test.fr`;
  const testPassword = 'TestPassword123!';
  const newPassword = 'NewPassword456!';

  try {
    // Créer l'utilisateur
    console.log('1️⃣  Création utilisateur...');
    const testUser = await auth.createUser({
      email: testEmail,
      password: testPassword
    });
    console.log(`   ✅ Créé: ${testUser.uid}\n`);

    // Obtenir un ID token via l'authentification REST Firebase
    console.log('2️⃣  Obtention du token Firebase...');
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    const signInResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          returnSecureToken: true
        })
      }
    );
    const signInData = await signInResponse.json();
    const idToken = signInData.idToken;

    if (!idToken) {
      throw new Error(`Erreur signin: ${JSON.stringify(signInData)}`);
    }
    console.log(`   ✅ Token obtenu\n`);

    // Utiliser le token pour appeler l'API
    console.log('3️⃣  Login via API...');
    const meResult = await callApi('me', { email: testEmail }, idToken);
    console.log(`   Status: ${meResult.status}`);
    console.log(`   Response:`, (meResult.body || meResult.me) ? `✅ Connecté` : `❌ Erreur: ${meResult.error}`);
    console.log();

    // ==================
    console.log('═'.repeat(50));
    console.log('\n🔐 Phase 2: Changement de mot de passe\n');

    console.log('1️⃣  Appel changePassword via API...');
    const changePwdResult = await callApi('changePassword', {
      newPassword: newPassword
    }, idToken);

    console.log(`   Status: ${changePwdResult.status}`);
    if (changePwdResult.ok) {
      console.log(`   ✅ Mot de passe changé avec succès`);
    } else {
      console.log(`   ❌ Erreur: ${changePwdResult.error || JSON.stringify(changePwdResult)}`);
    }
    console.log();

    // ==================
    console.log('═'.repeat(50));
    console.log('\n📝 Phase 3: Gestion des notes\n');

    // Créer une famille de test d'abord
    console.log('1️⃣  Création d\'une famille de test...');
    const createFamResult = await callApi('createFamily', {
      name: 'Famille Test Notes'
    }, idToken);

    if (createFamResult.status !== 200) {
      console.log(`   ❌ Erreur: ${createFamResult.error}`);
    } else {
      const familyId = createFamResult.family?.id || createFamResult.body?.family?.id;
      console.log(`   ✅ Famille créée: ${familyId}\n`);

      // Obtenir les données de la famille
      console.log('2️⃣  Récupération des données de la famille...');
      const meData = await callApi('me', { email: testEmail }, idToken);
      const family = meData.body?.families?.[0] || meData.families?.[0];

      if (!family) {
        console.log(`   ❌ Famille non trouvée`);
      } else {
        console.log(`   ✅ Famille trouvée: ${family.name}`);
        console.log(`   Enfants: ${family.children?.length || 0}\n`);

        // Soumettre une note si on a des enfants
        if (family.children && family.children.length > 0) {
          const child = family.children[0];
          console.log(`3️⃣  Soumission d'une note pour ${child.name}...\n`);

          // Avant d'approuver, il faut soumettre
          const submitGradeResult = await callApi('submitGrade', {
            familyId: family.id,
            child: child.name,
            subject: 'Français',
            grade: '18/20',
            xp: 50,
            gold: 10
          }, idToken);

          console.log(`   submitGrade Status: ${submitGradeResult.status}`);
          if (submitGradeResult.ok) {
            console.log(`   ✅ Note soumise`);
          } else {
            console.log(`   ❌ Erreur: ${submitGradeResult.error || JSON.stringify(submitGradeResult)}`);
          }

          // Essayer d'approuver
          if (submitGradeResult.ok) {
            console.log(`\n4️⃣  Approbation de la note...\n`);
            const approveResult = await callApi('approveGrade', {
              familyId: family.id,
              index: 0
            }, idToken);

            console.log(`   approveGrade Status: ${approveResult.status}`);
            if (approveResult.ok) {
              console.log(`   ✅ Note approuvée`);
            } else {
              console.log(`   ❌ Erreur: ${approveResult.error || JSON.stringify(approveResult)}`);
            }
          }
        } else {
          console.log('   ⚠️  Pas d\'enfants dans la famille pour tester');
        }
      }
    }

    // Cleanup
    console.log('\n' + '═'.repeat(50));
    console.log('\n🧹 Cleanup\n');
    console.log('Suppression de l\'utilisateur de test...');
    await auth.deleteUser(testUser.uid);
    console.log('✅ Utilisateur supprimé\n');

    console.log('═'.repeat(50));
    console.log('\n✅ TEST TERMINÉ\n');

  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    console.error('Stack:', error.stack);
  }

  process.exit(0);
}

test();
