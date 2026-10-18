#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

const TOKEN = 'nfp_m7gL3g1ayEq726z6TKWdHiv61tzJLSi8c5b5';

console.log('📤 Exporting production blobs\n');

// Get list
const listCmd = `NETLIFY_BLOBS_TOKEN=${TOKEN} netlify blobs:list tache-enfant --auth "${TOKEN}" --json`;
const listOutput = JSON.parse(execSync(listCmd, { encoding: 'utf-8' }));

const allData = {};
const keys = listOutput.blobs.map(b => b.key).filter(k => k.startsWith('account:') || k.startsWith('family:'));

console.log(`📡 Found ${keys.length} items to export\n`);

for (const key of keys) {
  try {
    const tmpFile = `/tmp/blob-${key.replace(/[^a-z0-9]/gi, '_')}.json`;
    const getCmd = `NETLIFY_BLOBS_TOKEN=${TOKEN} netlify blobs:get tache-enfant "${key}" -O "${tmpFile}" --auth "${TOKEN}"`;
    execSync(getCmd, { stdio: 'pipe' });
    
    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    allData[key] = content;
    console.log(`✅ ${key}`);
    fs.unlinkSync(tmpFile);
  } catch (e) {
    console.log(`❌ ${key}`);
  }
}

fs.writeFileSync('production-blobs.json', JSON.stringify(allData, null, 2));
console.log(`\n💾 Saved to production-blobs.json`);

const accounts = Object.keys(allData).filter(k => k.startsWith('account:'));
const families = Object.keys(allData).filter(k => k.startsWith('family:'));

console.log(`\n📊 ${accounts.length} accounts, ${families.length} families`);
