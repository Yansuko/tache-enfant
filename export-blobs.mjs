#!/usr/bin/env node
/**
 * Export all production blobs from Netlify Blobs API
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

async function exportBlobs() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;

  if (!token || !siteId) {
    console.error('❌ Missing NETLIFY_BLOBS_TOKEN or NETLIFY_SITE_ID in .env');
    process.exit(1);
  }

  console.log('📤 Exporting Netlify Blobs from tache-enfant store...\n');

  try {
    // Get metadata URL for the tache-enfant store
    const metaUrl = `https://api.netlify.com/api/v1/sites/${siteId}/blobs/metadata?store=tache-enfant`;

    console.log(`📡 Getting metadata from: ${metaUrl}\n`);

    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!metaRes.ok) {
      throw new Error(`Failed to get metadata: ${metaRes.status}`);
    }

    const metaData = await metaRes.json();
    const s3Url = metaData.url;

    if (!s3Url) {
      throw new Error('No S3 URL returned');
    }

    console.log(`✅ Got S3 URL\n`);
    console.log(`📥 Fetching blob data from S3...\n`);

    // Fetch the actual blob data from S3
    const dataRes = await fetch(s3Url);

    if (!dataRes.ok) {
      throw new Error(`Failed to fetch from S3: ${dataRes.status}`);
    }

    const blobData = await dataRes.json();

    // Count the data
    const keys = Object.keys(blobData).filter(k => !k.startsWith('_'));
    const accounts = keys.filter(k => k.startsWith('account:'));
    const families = keys.filter(k => k.startsWith('family:'));

    console.log(`✅ Successfully exported blobs!\n`);
    console.log(`📊 Summary:`);
    console.log(`   Total items: ${keys.length}`);
    console.log(`   Accounts: ${accounts.length}`);
    console.log(`   Families: ${families.length}`);
    console.log(`\n📋 Accounts:`);
    accounts.forEach(key => {
      const email = key.replace('account:', '');
      console.log(`   - ${email}`);
    });
    console.log(`\n👨‍👩‍👧‍👦 Families:`);
    families.forEach(key => {
      const fid = key.replace('family:', '');
      const family = blobData[key];
      const childCount = family?.children?.length || 0;
      console.log(`   - ${family?.name || fid} (${childCount} children)`);
    });

    // Save to file
    const outputFile = 'exported-blobs.json';
    fs.writeFileSync(outputFile, JSON.stringify(blobData, null, 2));
    console.log(`\n💾 Exported data saved to ${outputFile}`);
    console.log(`   File size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

exportBlobs();
