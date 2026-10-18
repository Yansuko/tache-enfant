/**
 * Netlify Function: Dump all blobs from tache-enfant store for migration
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const adminKey = new URL(req.url).searchParams.get('adminKey');
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'demo-admin-key') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
  }

  try {
    const store = getStore('tache-enfant');
    const allData = {};

    // List all blobs
    const listResult = await store.list();

    // Handle different response formats
    let keys = [];
    if (Array.isArray(listResult)) {
      keys = listResult.map(item => item.key || item);
    } else if (listResult && listResult.blobs) {
      keys = listResult.blobs.map(item => item.key);
    } else if (typeof listResult === 'object') {
      keys = Object.keys(listResult);
    }

    console.log(`[DUMP] Found ${keys.length} items in 'tache-enfant' store`);

    // Fetch each blob
    for (const key of keys) {
      try {
        const data = await store.get(key);
        if (data) {
          allData[key] = data;
        }
      } catch (e) {
        console.error(`Error fetching ${key}:`, e);
      }
    }

    return new Response(JSON.stringify(allData, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
