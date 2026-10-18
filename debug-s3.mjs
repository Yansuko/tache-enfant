#!/usr/bin/env node
/**
 * Debug script to check S3 blob storage directly
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

async function debugS3() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  console.log('🔍 Checking S3 blob storage directly...\n');

  const stores = ['production', 'default', 'migration', 'data'];

  for (const store of stores) {
    console.log(`\n📦 Store: "${store}"`);
    try {
      // Get metadata URL from Netlify API
      const storeUrl = store
        ? `https://api.netlify.com/api/v1/sites/${siteId}/blobs/metadata?store=${store}`
        : `https://api.netlify.com/api/v1/sites/${siteId}/blobs/metadata`;

      const metaRes = await fetch(storeUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!metaRes.ok) {
        console.log(`   ❌ Failed to get metadata`);
        continue;
      }

      const metaData = await metaRes.json();
      const s3Url = metaData.url;

      if (!s3Url) {
        console.log(`   ❌ No S3 URL returned`);
        continue;
      }

      // Extract base path from S3 URL
      const urlObj = new URL(s3Url);
      const s3Base = `${urlObj.origin}${urlObj.pathname}`;
      console.log(`   ✅ S3 Base: ${s3Base.substring(0, 100)}...`);

      // Try to list contents - check for metadata.json
      const metadataUrl = `${s3Base}`;
      console.log(`   📡 Checking: ${metadataUrl.substring(0, 80)}...`);

      const metaListRes = await fetch(metadataUrl);
      if (metaListRes.ok) {
        const metaContent = await metaListRes.text();
        console.log(`   📄 Metadata response (${metaContent.length} bytes):`);
        console.log(`      ${metaContent.substring(0, 150)}`);

        // Try to parse if JSON
        try {
          const parsed = JSON.parse(metaContent);
          console.log(`      Keys in metadata:`, Object.keys(parsed).slice(0, 5));
        } catch (e) {
          // Not JSON
        }
      } else {
        console.log(`   Status: ${metaListRes.status}`);
      }
    } catch (e) {
      console.log(`   Error: ${e.message}`);
    }
  }

  // Now check if the app actually stores data in Netlify Blobs or somewhere else
  console.log('\n\n🔎 Checking current app data locations...\n');
  console.log('Looking for data files and environment configuration...\n');

  // Check for any data files in the project
  const possibleDataDirs = [
    '.data',
    'data',
    './data',
    'netlify/functions/.data',
    '.netlify/blobs'
  ];

  for (const dir of possibleDataDirs) {
    const fullPath = path.join(__dirname, dir);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ Found directory: ${dir}`);
      if (fs.statSync(fullPath).isDirectory()) {
        const files = fs.readdirSync(fullPath).slice(0, 10);
        console.log(`   Files: ${files.join(', ')}`);
      }
    }
  }

  // Check .env for any data location hints
  console.log('\n\n📋 .env configuration hints:\n');
  const envKeys = Object.keys(process.env).filter(k =>
    k.includes('BLOB') ||
    k.includes('DATA') ||
    k.includes('STORE') ||
    k.includes('NETLIFY')
  );
  envKeys.forEach(key => {
    const val = process.env[key];
    if (val && !key.includes('TOKEN') && !key.includes('SECRET')) {
      console.log(`${key}: ${val.substring(0, 60)}`);
    } else if (val) {
      console.log(`${key}: [SET]`);
    }
  });
}

debugS3();
