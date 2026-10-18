#!/usr/bin/env node
/**
 * Export production blobs using Netlify CLI
 */

import { execSync } from 'child_process';
import fs from 'fs';

const NETLIFY_SITE_ID = '6f683bca-35a7-4f27-bbfc-84b18c61826b';
const NETLIFY_BLOBS_TOKEN = 'nfp_m7gL3g1ayEq726z6TKWdHiv61tzJLSi8c5b5';

console.log('📤 Exporting production blobs using Netlify CLI\n');

try {
  // List all blobs
  console.log('📡 Listing blobs...');
  const listCmd = `NETLIFY_SITE_ID=${NETLIFY_SITE_ID} NETLIFY_BLOBS_TOKEN=${NETLIFY_BLOBS_TOKEN} netlify blobs:list tache-enfant --auth "${NETLIFY_BLOBS_TOKEN}" --json`;
  const listOutput = execSync(listCmd, { encoding: 'utf-8' });
  const listData = JSON.parse(listOutput);

  console.log(`✅ Found ${listData.blobs.length} blobs\n`);

  const allData = {};
  const keys = listData.blobs.map(b => b.key);

  // Get each blob
  console.log('📥 Fetching blob contents...\n');

  for (const key of keys) {
    try {
      const getCmd = `NETLIFY_SITE_ID=${NETLIFY_SITE_ID} NETLIFY_BLOBS_TOKEN=${NETLIFY_BLOBS_TOKEN} netlify blobs:get tache-enfant "${key}" --auth "${NETLIFY_BLOBS_TOKEN}" --json`;
      const output = execSync(getCmd, { encoding: 'utf-8' });

      // Parse the output - it might be JSON directly or need parsing
      try {
        const data = JSON.parse(output);
        allData[key] = data;
        console.log(`✅ ${key}`);
      } catch (e) {
        // If not JSON, store as string
        allData[key] = output;
        console.log(`✅ ${key} (string)`);
      }
    } catch (error) {
      console.log(`⚠️  ${key}: ${error.message.substring(0, 50)}`);
    }
  }

  // Save to file
  const outputFile = 'production-blobs-export.json';
  fs.writeFileSync(outputFile, JSON.stringify(allData, null, 2));

  console.log(`\n💾 Exported to ${outputFile}`);
  console.log(`📊 Size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);

  // Summary
  const accounts = Object.keys(allData).filter(k => k.startsWith('account:'));
  const families = Object.keys(allData).filter(k => k.startsWith('family:'));

  console.log(`\n📋 Summary:`);
  console.log(`   Accounts: ${accounts.length}`);
  accounts.forEach(k => console.log(`   - ${k.replace('account:', '')}`));
  console.log(`\n   Families: ${families.length}`);
  families.forEach(k => {
    const fam = allData[k];
    const childCount = fam?.children?.length || 0;
    console.log(`   - ${fam?.name || k} (${childCount} children)`);
  });

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
