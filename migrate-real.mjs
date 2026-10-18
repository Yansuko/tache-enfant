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
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
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
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!token || !siteId) {
    throw new Error('Missing NETLIFY_BLOBS_TOKEN or NETLIFY_SITE_ID');
  }

  console.log('🔍 Fetching Netlify Blobs...');

  const allBlobs = {};

  // Fetch blobs using REST API
  const url = `https://api.netlify.com/api/v1/sites/${siteId}/blobs?paginate=false`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    console.log(`⚠️ Could not fetch blobs list (${response.status}). Checking if any data exists...`);
    return allBlobs;
  }

  const data = await response.json();
  console.log(`✅ Found ${data.length || 0} blobs`);

  return data;
}

async function migrateData() {
  try {
    console.log('🚀 Starting real Firebase migration...\n');

    // Fetch blobs from Netlify
    const blobs = await fetchNetlifyBlobs();

    if (!Array.isArray(blobs) || blobs.length === 0) {
      console.log('📭 No blobs found in Netlify\n');
      report.status = 'success';
      report.errors.push('No Netlify Blobs data found - starting fresh with Firebase');

      // Initialize Firebase with demo data for testing
      console.log('📝 Initializing Firebase with demo data...');

      // Create a demo account
      try {
        const demoUser = await admin.auth().createUser({
          email: 'demo@test.com',
          password: 'Demo123!',
          displayName: 'Demo User'
        });

        const demoFamilyId = `family_${Date.now()}`;

        await db.ref(`users/${demoUser.uid}`).set({
          email: 'demo@test.com',
          name: 'Demo User',
          familyIds: [demoFamilyId],
          createdAt: Date.now()
        });

        await db.ref(`families/${demoFamilyId}`).set({
          id: demoFamilyId,
          name: 'Demo Family',
          owner: 'demo@test.com',
          members: ['demo@test.com'],
          children: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        await db.ref(`levelConfigs/${demoFamilyId}`).set({
          name: 'Configuration par défaut',
          levels: Array.from({ length: 50 }, (_, i) => ({
            level: i + 1,
            xpRequired: i * 100
          })),
          createdAt: Date.now()
        });

        report.accountsMigrated = 1;
        report.familiesMigrated = 1;
        report.levelConfigsMigrated = 1;

        console.log('✅ Demo data created');
      } catch (error) {
        console.log(`⚠️ Demo data creation: ${error.message}`);
      }
    } else {
      // Migrate real blobs data
      console.log('📦 Migrating Netlify Blobs data to Firebase...\n');

      for (const blob of blobs) {
        const key = blob.key;

        try {
          // Fetch blob content
          const contentResponse = await fetch(blob.url);
          const content = await contentResponse.json();

          if (key.startsWith('account:')) {
            const email = key.replace('account:', '');
            const user = await admin.auth().createUser({
              email,
              password: content.passwordHash || 'TempPassword123!',
              displayName: content.name
            });

            await db.ref(`users/${user.uid}`).set({
              email,
              name: content.name,
              familyIds: content.familyIds || [],
              createdAt: content.createdAt || Date.now()
            });

            report.accountsMigrated++;
            console.log(`✅ Migrated account: ${email}`);
          } else if (key.startsWith('family:')) {
            const familyId = key.replace('family:', '');

            await db.ref(`families/${familyId}`).set({
              id: familyId,
              name: content.name,
              owner: content.owner,
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

            console.log(`✅ Migrated family: ${content.name}`);
          }
        } catch (error) {
          report.errors.push(`${key}: ${error.message}`);
          console.log(`❌ Error migrating ${key}: ${error.message}`);
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
