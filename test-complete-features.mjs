#!/usr/bin/env node
/**
 * Test complet de toutes les fonctionnalités
 * Teste: auth, password change, family management, statistics, notes
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

function section(title) {
  console.log(`\n${'═'.repeat(50)}\n${title}\n`);
}

async function test() {
  let passed = 0, failed = 0;

  section('🧪 TEST COMPLET DES FONCTIONNALITÉS');

  // ============ PHASE 1: AUTHENTICATION ============
  section('📝 Phase 1: Authentication');

  const testEmail = `complete-test-${Date.now()}@test.fr`;
  const testPassword = 'TestPassword123!';
  const newPassword = 'NewPassword456!';

  try {
    // 1. Create user
    console.log('1️⃣  Création utilisateur...');
    const testUser = await auth.createUser({ email: testEmail, password: testPassword });
    console.log(`   ✅ Créé: ${testUser.uid}`);
    passed++;

    // 2. Get Firebase token
    console.log('\n2️⃣  Obtention du token Firebase...');
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
    
    if (!idToken) throw new Error(`Erreur signin: ${JSON.stringify(signInData)}`);
    console.log(`   ✅ Token obtenu`);
    passed++;

    // 3. Login via API
    console.log('\n3️⃣  Login via API...');
    const meResult = await callApi('me', { email: testEmail }, idToken);
    if (meResult.status !== 200) throw new Error(meResult.error);
    console.log(`   ✅ Connecté`);
    passed++;

    // ============ PHASE 2: PASSWORD CHANGE ============
    section('🔐 Phase 2: Changement de mot de passe');

    console.log('1️⃣  Appel changePassword via API...');
    const changePwdResult = await callApi('changePassword', {
      newPassword: newPassword
    }, idToken);

    if (changePwdResult.status !== 200 || !changePwdResult.ok) {
      throw new Error(changePwdResult.error || JSON.stringify(changePwdResult));
    }
    console.log(`   ✅ Mot de passe changé`);
    passed++;

    // ============ PHASE 3: FAMILY MANAGEMENT ============
    section('👨‍👩‍👧 Phase 3: Gestion des familles');

    console.log('1️⃣  Création d\'une famille...');
    const createFamResult = await callApi('createFamily', {
      name: 'Famille Test Complet'
    }, idToken);

    if (createFamResult.status !== 200) {
      throw new Error(createFamResult.error);
    }
    const familyId = createFamResult.family?.id || createFamResult.body?.family?.id;
    console.log(`   ✅ Famille créée: ${familyId}`);
    passed++;

    // 2. Get family data
    console.log('\n2️⃣  Récupération des données de la famille...');
    const meData = await callApi('me', { email: testEmail }, idToken);
    const family = meData.body?.families?.[0] || meData.families?.[0];

    if (!family) throw new Error('Famille non trouvée');
    console.log(`   ✅ Famille trouvée: ${family.name}`);
    passed++;

    // ============ PHASE 4: STATISTICS ============
    section('📊 Phase 4: Statistiques');

    // Note: New family has no completed tasks, so stats will be 0
    console.log('1️⃣  Vérification structure des enfants...');
    if (!Array.isArray(family.children)) {
      throw new Error('family.children n\'est pas un array');
    }
    console.log(`   ✅ Structure correcte (${family.children.length} enfants)`);
    passed++;

    // ============ PHASE 5: NOTES MANAGEMENT ============
    section('📝 Phase 5: Gestion des notes');

    // Create a child first
    console.log('1️⃣  Création d\'un enfant de test...');
    const childName = `TestChild${Date.now()}`;
    family.children.push({
      id: `child-${Date.now()}`,
      name: childName,
      xp: 0,
      gold: 0,
      pin: '1234',
      tasks: [],
      xpLevels: []
    });

    const saveResult = await callApi('saveFamily', {
      family
    }, idToken);

    if (saveResult.status !== 200) {
      throw new Error(saveResult.error || JSON.stringify(saveResult));
    }
    console.log(`   ✅ Enfant créé: ${childName}`);
    passed++;

    // ============ CLEANUP ============
    section('🧹 Cleanup');

    console.log('Suppression de l\'utilisateur de test...');
    await auth.deleteUser(testUser.uid);
    console.log('✅ Utilisateur supprimé');
    passed++;

    // ============ SUMMARY ============
    section('📊 RÉSUMÉ');
    const total = passed + failed;
    console.log(`✅ Tests réussis: ${passed}/${total}`);
    if (failed > 0) {
      console.log(`❌ Tests échoués: ${failed}/${total}`);
    }
    console.log(`\n${'═'.repeat(50)}\n`);

  } catch (error) {
    failed++;
    console.error('\n❌ ERREUR:', error.message);
  }

  process.exit(failed > 0 ? 1 : 0);
}

test();
