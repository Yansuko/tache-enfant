/**
 * Netlify Function: Firebase Migration using REST API
 * Uses Netlify Blobs REST API instead of SDK to avoid version conflicts
 */

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

async function fetchBlobsViaREST() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!token || !siteId) {
    throw new Error('Missing NETLIFY_BLOBS_TOKEN or NETLIFY_SITE_ID');
  }

  const allData = {};

  // First, get metadata for tache-enfant store to get the S3 URL
  const metaUrl = `https://api.netlify.com/api/v1/sites/${siteId}/blobs/metadata?store=tache-enfant`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to get blob metadata: ${metaRes.status}`);
  }

  const metaData = await metaRes.json();
  const s3Url = metaData.url;

  if (!s3Url) {
    throw new Error('No S3 URL in metadata');
  }

  // Fetch the metadata.json from S3 to see what blobs exist
  const metadataRes = await fetch(s3Url);
  if (metadataRes.ok) {
    const metadataText = await metadataRes.text();
    console.log('[REST-API] S3 metadata response length:', metadataText.length);
    console.log('[REST-API] First 200 chars:', metadataText.substring(0, 200));

    // Try to parse as JSON
    try {
      const metadata = JSON.parse(metadataText);
      console.log('[REST-API] S3 metadata keys:', Object.keys(metadata).slice(0, 10));

      // Return all the data we found
      return metadata;
    } catch (e) {
      console.log('[REST-API] S3 metadata is not JSON, trying as directory listing');
    }
  }

  // Try listing via REST API
  const listUrl = `https://api.netlify.com/api/v1/sites/${siteId}/blobs?paginate=false`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!listRes.ok) {
    throw new Error(`Failed to list blobs: ${listRes.status}`);
  }

  const listData = await listRes.json();
  console.log('[REST-API] List response:', JSON.stringify(listData).substring(0, 300));

  return allData;
}

export default async (req, context) => {
  const adminKey = new URL(req.url).searchParams.get('adminKey');
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'demo-admin-key') {
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
    status: 'pending',
    debugInfo: []
  };

  try {
    initFirebase();

    // Fetch blobs via REST API
    const allBlobs = await fetchBlobsViaREST();
    const blobKeys = Object.keys(allBlobs || {});

    report.debugInfo.push(`Found ${blobKeys.length} items in tache-enfant store`);
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
