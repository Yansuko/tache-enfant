#!/usr/bin/env node
/**
 * Migrate Firebase data: Convert all object-based arrays to proper arrays
 * This fixes the root cause of data normalization issues
 */

import admin from 'firebase-admin';
import fs from 'fs';

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

function normalizeArrays(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const arrayFields = ['children', 'questList', 'proposals', 'rewards', 'requests', 'gradeRequests', 'taskRequests', 'sanctionsList'];

  for (const field of arrayFields) {
    if (obj[field] && typeof obj[field] === 'object' && !Array.isArray(obj[field])) {
      // Convert object to array
      obj[field] = Object.values(obj[field]).filter(v => v !== null && v !== undefined);
    }
    if (!obj[field] || !Array.isArray(obj[field])) {
      obj[field] = [];
    }
  }

  // Normalize child tasks
  if (obj.children && Array.isArray(obj.children)) {
    for (const child of obj.children) {
      if (child && typeof child === 'object') {
        if (child.tasks && typeof child.tasks === 'object' && !Array.isArray(child.tasks)) {
          child.tasks = Object.values(child.tasks).filter(v => v !== null && v !== undefined);
        }
        if (!child.tasks || !Array.isArray(child.tasks)) {
          child.tasks = [];
        }
      }
    }
  }

  return obj;
}

async function migrate() {
  console.log('🔄 Starting Firebase array migration...\n');

  try {
    // Get all families
    const familiesRef = db.ref('families');
    const familiesSnapshot = await familiesRef.once('value');
    const families = familiesSnapshot.val() || {};

    let migratedCount = 0;
    let updates = {};

    for (const [familyId, familyData] of Object.entries(families)) {
      console.log(`📝 Processing family: ${familyId}`);

      const normalized = normalizeArrays(JSON.parse(JSON.stringify(familyData)));

      // Check if data changed
      const dataChanged = JSON.stringify(familyData) !== JSON.stringify(normalized);
      if (dataChanged) {
        updates[`families/${familyId}`] = normalized;
        migratedCount++;
        console.log(`   ✅ Converted arrays for ${familyId}`);
      } else {
        console.log(`   ℹ️  No changes needed for ${familyId}`);
      }
    }

    if (migratedCount > 0) {
      console.log(`\n💾 Writing ${migratedCount} updated families to Firebase...`);
      await db.ref().update(updates);
      console.log('✅ Migration complete!\n');
    } else {
      console.log('\n✅ All families already properly formatted!\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
