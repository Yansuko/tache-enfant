/**
 * Netlify Function: Firebase Migration
 * Migrates data from Netlify Blobs to Firebase Realtime Database
 *
 * Usage: POST /api/migrate?adminKey=YOUR_ADMIN_KEY
 */

import { getStore } from '@netlify/blobs';
import admin from 'firebase-admin';

let db = null;

// Initialize Firebase if not already done
function initFirebase() {
  if (db) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!serviceAccount.project_id) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
  db = admin.database();
}

export default async (req, context) => {
  // Security: require admin key
  const adminKey = new URL(req.url).searchParams.get('adminKey');
  if (adminKey !== process.env.ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
  }

  const report = {
    timestamp: new Date().toISOString(),
    accountsMigrated: 0,
    familiesMigrated: 0,
    childrenMigrated: 0,
    tasksMigrated: 0,
    levelConfigsMigrated: 0,
    activityHistoryMigrated: 0,
    errors: [],
    status: 'pending'
  };

  try {
    initFirebase();

    // Get Netlify Blobs store
    const store = getStore('migration');
    const keys = await store.list();

    console.log(`[MIGRATION] Found ${keys.length} items in Netlify Blobs`);

    // Step 1: Migrate accounts
    console.log('[MIGRATION] Migrating accounts...');
    const accountKeys = keys.filter(k => k.startsWith('account:'));
    for (const key of accountKeys) {
      const account = await store.get(key);
      if (!account) continue;

      const email = key.replace('account:', '');
      try {
        // Create user in Firebase Auth
        const user = await admin.auth().createUser({
          email,
          password: account.passwordHash || 'TempPassword123!',
          displayName: account.name
        });

        // Create user doc
        await db.ref(`users/${user.uid}`).set({
          email,
          name: account.name,
          familyIds: account.familyIds || [],
          createdAt: account.createdAt || Date.now()
        });

        report.accountsMigrated++;
      } catch (error) {
        report.errors.push(`Account ${email}: ${error.message}`);
      }
    }

    // Step 2: Migrate families
    console.log('[MIGRATION] Migrating families...');
    const familyKeys = keys.filter(k => k.startsWith('family:'));
    for (const key of familyKeys) {
      const family = await store.get(key);
      if (!family) continue;

      const familyId = key.replace('family:', '');
      try {
        const childrenCount = family.children?.length || 0;
        const tasksCount = family.children?.reduce((sum, c) => sum + (c.tasks?.length || 0), 0) || 0;

        // Write family
        await db.ref(`families/${familyId}`).set({
          id: familyId,
          name: family.name,
          owner: family.owner,
          members: family.members || [],
          children: family.children || [],
          createdAt: family.createdAt || Date.now(),
          updatedAt: family.updatedAt || Date.now()
        });

        // Create default level config
        await db.ref(`levelConfigs/${familyId}`).set({
          name: 'Configuration par défaut',
          levels: Array.from({ length: 50 }, (_, i) => ({
            level: i + 1,
            xpRequired: i * 100
          })),
          createdAt: Date.now()
        });

        report.familiesMigrated++;
        report.childrenMigrated += childrenCount;
        report.tasksMigrated += tasksCount;
        report.levelConfigsMigrated++;
      } catch (error) {
        report.errors.push(`Family ${familyId}: ${error.message}`);
      }
    }

    // Step 3: Migrate activity history
    console.log('[MIGRATION] Migrating activity history...');
    const historyKey = 'activityHistory';
    const history = await store.get(historyKey);
    if (history && Array.isArray(history)) {
      for (const entry of history) {
        try {
          const entryId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
          await db.ref(`activityHistory/${entryId}`).set(entry);
          report.activityHistoryMigrated++;
        } catch (error) {
          report.errors.push(`Activity history entry: ${error.message}`);
        }
      }
    }

    report.status = 'success';
    console.log('[MIGRATION] Complete:', report);

    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    report.status = 'failed';
    report.errors.push(error.message);
    console.error('[MIGRATION] Error:', error);

    return new Response(JSON.stringify(report, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
