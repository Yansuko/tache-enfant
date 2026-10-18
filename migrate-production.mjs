#!/usr/bin/env node
/**
 * Call the Netlify migrate function to extract real production data
 */

import https from 'https';

async function callMigrateFunction() {
  const hostname = 'splendorous-jelly-830fcf.netlify.app';
  const path = '/.netlify/functions/migrate?adminKey=mitomito';

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            console.error('❌ Migration function not found (404). Netlify may not have deployed yet.');
            resolve(null);
            return;
          }

          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          console.error('❌ Failed to parse response:', e.message);
          console.error('Response:', data.substring(0, 500));
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ Request failed:', e.message);
      reject(e);
    });

    req.end();
  });
}

async function main() {
  console.log('📡 Calling Netlify migrate function to export production data...\n');

  try {
    const result = await callMigrateFunction();

    if (!result) {
      console.log('⚠️ No data returned (function may not be deployed yet)');
      console.log('   Once Netlify deploys, run this again or check the admin dashboard');
      return;
    }

    if (result.status === 'success') {
      console.log('✅ Migration successful!');
      console.log(`   - Accounts: ${result.accountsMigrated}`);
      console.log(`   - Families: ${result.familiesMigrated}`);
      console.log(`   - Children: ${result.childrenMigrated}`);
      console.log(`   - Tasks: ${result.tasksMigrated}`);
      console.log(`   - Configs: ${result.levelConfigsMigrated}`);

      if (result.errors.length > 0) {
        console.log('\n⚠️ Errors:');
        result.errors.forEach(e => console.log(`   - ${e}`));
      }
    } else {
      console.error('❌ Migration failed:');
      console.error(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
