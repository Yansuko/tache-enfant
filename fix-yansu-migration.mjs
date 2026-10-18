#!/usr/bin/env node
/**
 * Fix migration: import yansu@free.fr account and their family from production blobs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env
try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
} catch {}

// Initialize Firebase
let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
} catch {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
}

if (!serviceAccount.project_id) {
  console.error('❌ Firebase not configured');
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
} catch (e) {
  if (!e.message.includes('already exists')) throw e;
}

const db = admin.database();
const auth = admin.auth();

// Load production blobs
const blobs = JSON.parse(fs.readFileSync('production-blobs.json', 'utf-8'));

async function main() {
  console.log('🔄 Fixing yansu@free.fr migration...\n');

  // 1. Create yansu@free.fr Firebase account if doesn't exist
  console.log('1️⃣  Creating Firebase account for yansu@free.fr...');
  let firebaseUid;
  try {
    const existing = await auth.getUserByEmail('yansu@free.fr');
    firebaseUid = existing.uid;
    console.log(`   ✅ Account exists: ${firebaseUid}`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email: 'yansu@free.fr',
        password: 'password123',
        displayName: 'Yanis'
      });
      firebaseUid = created.uid;
      console.log(`   ✅ Account created: ${firebaseUid}`);
    } else {
      throw e;
    }
  }

  // 2. Create user document in Firebase
  console.log('\n2️⃣  Creating user document in Firebase...');
  const userSnapshot = await db.ref(`users/${firebaseUid}`).once('value');
  if (userSnapshot.exists()) {
    console.log('   ✅ User document already exists');
  } else {
    await db.ref(`users/${firebaseUid}`).set({
      email: 'yansu@free.fr',
      name: 'Yanis',
      familyIds: [],
      createdAt: Date.now()
    });
    console.log('   ✅ User document created');
  }

  // 3. Import family fam-2edd490ceb from blobs
  console.log('\n3️⃣  Importing BEKRAR family from blobs...');
  const blobFamily = blobs['family:fam-2edd490ceb'];

  if (!blobFamily) {
    console.error('   ❌ Family fam-2edd490ceb not found in blobs');
    process.exit(1);
  }

  // Generate new family ID for Firebase
  const newFamilyId = `fam-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`   Family ID: ${newFamilyId}`);

  const firebaseFamily = {
    id: newFamilyId,
    name: blobFamily.name,
    owner: 'yansu@free.fr',
    members: ['yansu@free.fr'],
    day: blobFamily.day || new Date().toISOString().split('T')[0],
    dailyBonus: blobFamily.dailyBonus || { xp: 30, gold: 15 },
    questList: blobFamily.questList || [],
    proposals: blobFamily.proposals || [],
    children: blobFamily.children || [],
    sanctionsList: blobFamily.sanctionsList || [],
    rewards: blobFamily.rewards || [],
    requests: blobFamily.requests || [],
    gradeRequests: blobFamily.gradeRequests || [],
    taskRequests: blobFamily.taskRequests || []
  };

  await db.ref(`families/${newFamilyId}`).set(firebaseFamily);
  console.log(`   ✅ Family created with ${firebaseFamily.children.length} children`);
  firebaseFamily.children.forEach(c => {
    console.log(`      - ${c.name}: ${c.xp} XP, ${c.gold} gold, ${c.tasks?.length || 0} tasks`);
  });

  // 4. Update user's familyIds
  console.log('\n4️⃣  Linking family to user...');
  await db.ref(`users/${firebaseUid}/familyIds`).set([newFamilyId]);
  console.log(`   ✅ User now owns family ${newFamilyId}`);

  console.log('\n✅ Migration complete!');
  console.log(`   Firebase UID: ${firebaseUid}`);
  console.log(`   Family: ${blobFamily.name}`);
  console.log(`   Children: ${blobFamily.children.length}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
