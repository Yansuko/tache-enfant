/**
 * Netlify Function: Firebase Migration
 * Migrates data from Netlify Blobs to Firebase Realtime Database
 */

import { getStore } from '@netlify/blobs';
import admin from 'firebase-admin';

let db = null;

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

async function getAllBlobs() {
  const store = getStore('tache-enfant');
  const result = {};

  try {
    // List all blobs
    const listResult = await store.list();
    console.log('[BLOBS-DEBUG] listResult type:', typeof listResult);
    console.log('[BLOBS-DEBUG] listResult keys:', Object.keys(listResult || {}));

    // Handle different response formats from store.list()
    let keys = [];

    if (Array.isArray(listResult)) {
      // If it's an array of blob objects
      keys = listResult.map(item => item.key || item.path || item.name);
    } else if (listResult && listResult.blobs && Array.isArray(listResult.blobs)) {
      // If response is {blobs: [...]}
      keys = listResult.blobs.map(item => item.key || item.path || item.name);
    } else if (listResult && typeof listResult === 'object') {
      // If it's a plain object with blob keys
      keys = Object.keys(listResult).filter(k => !k.startsWith('_'));
    }

    console.log(`[BLOBS-DEBUG] Found ${keys.length} blob keys`);

    // Fetch each blob's data
    for (const key of keys) {
      try {
        const data = await store.get(key);
        if (data) {
          result[key] = data;
        }
      } catch (e) {
        console.error(`Error fetching blob ${key}:`, e);
      }
    }
  } catch (error) {
    console.error('Error listing blobs:', error);
  }

  return result;
}

export default async (req, context) => {
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
    errors: [],
    status: 'pending'
  };

  try {
    initFirebase();

    // Get all blobs
    const allBlobs = await getAllBlobs();
    const blobKeys = Object.keys(allBlobs);

    console.log(`[MIGRATION] Found ${blobKeys.length} items`);

    if (blobKeys.length === 0) {
      report.status = 'success';
      report.errors.push('No data found in Netlify Blobs');
      return new Response(JSON.stringify(report, null, 2), { status: 200 });
    }

    // Migrate accounts
    for (const key of blobKeys) {
      if (key.startsWith('account:')) {
        const email = key.replace('account:', '');
        try {
          const account = allBlobs[key];
          const user = await admin.auth().createUser({
            email,
            password: 'TempPassword123!',
            displayName: account?.name || email
          });
          await db.ref(`users/${user.uid}`).set({
            email,
            name: account?.name || email,
            familyIds: account?.familyIds || [],
            createdAt: account?.createdAt || Date.now()
          });
          report.accountsMigrated++;
        } catch (error) {
          report.errors.push(`Account ${email}: ${error.message}`);
        }
      }
    }

    // Migrate families
    for (const key of blobKeys) {
      if (key.startsWith('family:')) {
        const familyId = key.replace('family:', '');
        try {
          const family = allBlobs[key];
          await db.ref(`families/${familyId}`).set({
            id: familyId,
            name: family?.name || 'Family',
            owner: family?.owner || 'admin',
            members: family?.members || [],
            children: family?.children || [],
            createdAt: family?.createdAt || Date.now(),
            updatedAt: family?.updatedAt || Date.now()
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
          report.childrenMigrated += family?.children?.length || 0;
          report.tasksMigrated += (family?.children || []).reduce((sum, c) => sum + (c.tasks?.length || 0), 0);
          report.levelConfigsMigrated++;
        } catch (error) {
          report.errors.push(`Family ${familyId}: ${error.message}`);
        }
      }
    }

    report.status = 'success';
    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    report.status = 'failed';
    report.errors.push(error.message);
    return new Response(JSON.stringify(report, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
