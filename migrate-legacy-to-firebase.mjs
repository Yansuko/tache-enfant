#!/usr/bin/env node
/**
 * Migrate legacy data from Netlify Blobs to Firebase
 * Adds default rewards and initializes missing data
 */

import admin from 'firebase-admin';
import fs from 'fs';

try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
} catch {}

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

const db = admin.database();

// Default rewards (shop items)
const DEFAULT_REWARDS = [
  { icon: '📱', name: 'Temps écran +30min', cost: 50, lvl: 1 },
  { icon: '🎮', name: 'Session de jeu +1h', cost: 75, lvl: 2 },
  { icon: '🍕', name: 'Pizza au dîner', cost: 100, lvl: 2 },
  { icon: '🚴', name: 'Sortie à vélo', cost: 120, lvl: 3 },
  { icon: '🎬', name: 'Soirée cinéma en famille', cost: 150, lvl: 3 },
  { icon: '🎪', name: 'Sortie au parc d\'attraction', cost: 200, lvl: 4 },
];

async function migrateFamily(familyId, familyData) {
  console.log(`\n📝 Processing family: ${familyId}`);

  // Ensure rewards are populated
  if (!familyData.rewards || familyData.rewards.length === 0) {
    console.log('   ✅ Initializing default rewards...');
    familyData.rewards = DEFAULT_REWARDS;
  }

  // Ensure other arrays exist
  if (!familyData.gradeRequests) familyData.gradeRequests = [];
  if (!familyData.proposals) familyData.proposals = [];
  if (!familyData.requests) familyData.requests = [];
  if (!familyData.sanctionsList) familyData.sanctionsList = [];
  if (!familyData.taskRequests) familyData.taskRequests = [];
  if (!familyData.questList) familyData.questList = [];

  // Update Firebase
  await db.ref(`families/${familyId}`).update(familyData);
  console.log(`   ✅ Updated family with rewards and missing fields`);
}

async function migrate() {
  console.log('🔄 Migrating legacy data to Firebase...\n');

  try {
    const familiesRef = db.ref('families');
    const familiesSnapshot = await familiesRef.once('value');
    const families = familiesSnapshot.val() || {};

    for (const [familyId, familyData] of Object.entries(families)) {
      await migrateFamily(familyId, familyData);
    }

    console.log('\n✅ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
