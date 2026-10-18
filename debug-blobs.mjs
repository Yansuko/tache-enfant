#!/usr/bin/env node
/**
 * Debug script to check Netlify Blobs content
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

async function debugBlobs() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  console.log('🔍 Checking Netlify Blobs...\n');
  console.log('Token:', token ? 'SET' : 'NOT SET');
  console.log('Site ID:', siteId);

  if (!token || !siteId) {
    console.log('\n❌ Missing credentials');
    return;
  }

  try {
    // Try different API endpoints
    console.log('\n📡 Trying API endpoints:\n');

    // Endpoint 1: List blobs
    const url1 = `https://api.netlify.com/api/v1/sites/${siteId}/blobs`;
    console.log(`1. GET ${url1}`);
    const res1 = await fetch(url1, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`   Status: ${res1.status}`);
    const data1 = await res1.json();
    console.log(`   Response:`, JSON.stringify(data1).substring(0, 200));

    // Endpoint 2: With pagination
    const url2 = `https://api.netlify.com/api/v1/sites/${siteId}/blobs?paginate=false`;
    console.log(`\n2. GET ${url2}`);
    const res2 = await fetch(url2, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`   Status: ${res2.status}`);
    const data2 = await res2.json();
    console.log(`   Response:`, JSON.stringify(data2).substring(0, 200));

    // Endpoint 3: List with limit
    const url3 = `https://api.netlify.com/api/v1/sites/${siteId}/blobs?limit=100`;
    console.log(`\n3. GET ${url3}`);
    const res3 = await fetch(url3, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`   Status: ${res3.status}`);
    const data3 = await res3.json();
    console.log(`   Response:`, JSON.stringify(data3).substring(0, 200));

    // Endpoint 4: Check store directly
    console.log(`\n4. Try to fetch all blobs from different store paths...`);

    const stores = ['migration', '', 'data', 'default'];
    for (const store of stores) {
      const storeUrl = store
        ? `https://api.netlify.com/api/v1/sites/${siteId}/blobs/metadata?store=${store}`
        : `https://api.netlify.com/api/v1/sites/${siteId}/blobs/metadata`;

      console.log(`\n   Store: "${store}" (${storeUrl})`);
      try {
        const res = await fetch(storeUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`   Status: ${res.status}`);
        if (res.ok) {
          const data = await res.json();
          console.log(`   Data:`, JSON.stringify(data).substring(0, 300));
        }
      } catch (e) {
        console.log(`   Error: ${e.message}`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugBlobs();
