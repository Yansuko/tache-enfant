#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

const TOKEN = 'nfp_m7gL3g1ayEq726z6TKWdHiv61tzJLSi8c5b5';
const TMP_DIR = '/tmp/blobs-export';

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

console.log('📤 Exporting production blobs\n');

// Get list
const listCmd = `cd /home/yansu/workspace && NETLIFY_BLOBS_TOKEN=${TOKEN} netlify blobs:list tache-enfant --auth "${TOKEN}" --json`;
const listOutput = JSON.parse(execSync(listCmd, { encoding: 'utf-8' }));

const keys = listOutput.blobs.map(b => b.key).filter(k => k.startsWith('account:') || k.startsWith('family:'));
console.log(`📡 Exporting ${keys.length} items\n`);

const allData = {};

for (const key of keys) {
  try {
    const safeKey = key.replace(/[^a-z0-9]/gi, '_');
    const tmpFile = `${TMP_DIR}/${safeKey}.json`;
    execSync(`cd /home/yansu/workspace && NETLIFY_BLOBS_TOKEN=${TOKEN} netlify blobs:get tache-enfant "${key}" -O "${tmpFile}" --auth "${TOKEN}"`, { stdio: 'pipe' });
    
    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    allData[key] = content;
    console.log(`✅ ${key}`);
  } catch (e) {
    console.log(`❌ ${key}: ${e.message.split('\n')[0]}`);
  }
}

fs.writeFileSync('production-blobs.json', JSON.stringify(allData, null, 2));
console.log(`\n💾 Saved to production-blobs.json (${(fs.statSync('production-blobs.json').size/1024).toFixed(1)}KB)`);

const accounts = Object.keys(allData).filter(k => k.startsWith('account:'));
const families = Object.keys(allData).filter(k => k.startsWith('family:'));

console.log(`\n📊 Summary:`);
console.log(`   Accounts: ${accounts.length}`);
accounts.forEach(k => console.log(`   - ${k.replace('account:', '')}`));
console.log(`\n   Families: ${families.length}`);
families.forEach(k => {
  const fam = allData[k];
  console.log(`   - ${fam?.name || k} (${fam?.children?.length || 0} kids)`);
});
