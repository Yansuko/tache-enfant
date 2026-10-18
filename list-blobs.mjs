#!/usr/bin/env node
/**
 * List all blobs from Netlify Blobs API
 */

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

async function listBlobs() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!token || !siteId) {
    console.error('❌ Missing credentials');
    process.exit(1);
  }

  console.log('📡 Listing blobs from Netlify...\n');

  // Try different stores
  const stores = ['tache-enfant', 'production', 'default', ''];

  for (const store of stores) {
    const storeName = store || '(default)';
    console.log(`\n🔍 Store: ${storeName}`);

    try {
      // List blobs
      const listUrl = store
        ? `https://api.netlify.com/api/v1/sites/${siteId}/blobs?store=${store}`
        : `https://api.netlify.com/api/v1/sites/${siteId}/blobs`;

      console.log(`   URL: ${listUrl}`);

      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        console.log(`   ❌ Status: ${res.status}`);
        continue;
      }

      const data = await res.json();
      console.log(`   ✅ Response:`, JSON.stringify(data).substring(0, 200));

      if (data.blobs && Array.isArray(data.blobs)) {
        console.log(`   📦 Found ${data.blobs.length} blobs`);
        if (data.blobs.length > 0) {
          console.log(`   First blob:`, data.blobs[0]);
        }
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
    }
  }
}

listBlobs();
