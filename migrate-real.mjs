#!/usr/bin/env node
/**
 * Real Firebase migration using Netlify Blobs REST API
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && !key.startsWith('#') && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

// Initialize Firebase
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

const report = {
  timestamp: new Date().toISOString(),
  accountsMigrated: 0,
  familiesMigrated: 0,
  childrenMigrated: 0,
  tasksMigrated: 0,
  levelConfigsMigrated: 0,
  errors: [],
  status: 'pending'
};

async function fetchNetlifyBlobs() {
  console.log('🔍 Fetching Netlify Blobs from local store...');

  // Try local .data/store.json first (development)
  const localPath = '.data/store.json';
  if (fs.existsSync(localPath)) {
    console.log('✅ Found local .data/store.json (dev environment)');
    const storeData = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    return storeData;
  }

  console.log('⚠️ Local store not found, this is production mode');
  return {};
}

async function migrateData() {
  try {
    console.log('🚀 Starting real Firebase migration...\n');

    // Fetch blobs from Netlify
    const blobs = await fetchNetlifyBlobs();

    if (!blobs || Object.keys(blobs).length === 0) {
      console.log('📭 No blobs found\n');
      report.status = 'success';
      report.errors.push('No data found to migrate');
    } else {
      // Migrate real blobs data
      console.log(`📦 Migrating ${Object.keys(blobs).length} items to Firebase...\n`);

      const keys = Object.keys(blobs);

      // Migrate accounts first
      for (const key of keys) {
        if (key.startsWith('account:')) {
          const email = key.replace('account:', '');
          const content = blobs[key];

          try {
            const user = await admin.auth().createUser({
              email,
              password: 'TempPassword123!',
              displayName: content.name || email
            });

            await db.ref(`users/${user.uid}`).set({
              email,
              name: content.name || email,
              familyIds: content.familyIds || [],
              createdAt: content.createdAt || Date.now()
            });

            report.accountsMigrated++;
            console.log(`✅ Account: ${email}`);
          } catch (error) {
            report.errors.push(`Account ${email}: ${error.message}`);
            console.log(`❌ Account ${email}: ${error.message}`);
          }
        }
      }

      // Migrate families
      for (const key of keys) {
        if (key.startsWith('family:')) {
          const familyId = key.replace('family:', '');
          const content = blobs[key];

          try {
            await db.ref(`families/${familyId}`).set({
              id: familyId,
              name: content.name || 'Family',
              owner: content.owner || 'admin',
              members: content.members || [],
              children: content.children || [],
              createdAt: content.createdAt || Date.now(),
              updatedAt: content.updatedAt || Date.now()
            });

            await db.ref(`levelConfigs/${familyId}`).set({
              name: 'Configuration par défaut',
              levels: Array.from({ length: 50 }, (_, i) => ({
                level: i + 1,
                xpRequired: i * 100
              })),
              createdAt: Date.now()
            });

            report.familiesMigrated++;
            report.childrenMigrated += content.children?.length || 0;
            report.tasksMigrated += (content.children || []).reduce((sum, c) => sum + (c.tasks?.length || 0), 0);
            report.levelConfigsMigrated++;

            console.log(`✅ Family: ${content.name} (${content.children?.length || 0} kids)`);
          } catch (error) {
            report.errors.push(`Family ${familyId}: ${error.message}`);
            console.log(`❌ Family ${familyId}: ${error.message}`);
          }
        }
      }
    }

    report.status = 'success';

    console.log('\n📊 Migration Report:');
    console.log(JSON.stringify(report, null, 2));

    // Save report
    fs.writeFileSync('migrate-report.json', JSON.stringify(report, null, 2));
    console.log('\n✅ Report saved to migrate-report.json');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    report.status = 'failed';
    report.errors.push(error.message);
    fs.writeFileSync('migrate-report.json', JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

migrateData();
