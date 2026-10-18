#!/usr/bin/env node
/**
 * Import accounts from production data into Firebase Auth
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file
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

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!serviceAccount.project_id) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT not configured');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const auth = admin.auth();
const db = admin.database();

async function importAccounts() {
  try {
    // Load production data
    const prodData = JSON.parse(fs.readFileSync('./production-blobs.json', 'utf-8'));

    // Extract accounts
    const accounts = Object.keys(prodData).filter(k => k.startsWith('account:'));

    if (accounts.length === 0) {
      console.log('❌ No accounts found in production data');
      return;
    }

    console.log(`📋 Found ${accounts.length} accounts to import\n`);

    // Get existing Firebase Auth users
    let existingEmails = new Set();
    let pageToken = undefined;

    do {
      const page = await auth.listUsers(1000, pageToken);
      page.users.forEach(user => existingEmails.add(user.email));
      pageToken = page.pageToken;
    } while (pageToken);

    console.log(`📧 Firebase Auth already has ${existingEmails.size} users\n`);

    // Create accounts for each user
    let created = 0, skipped = 0;

    for (const accountKey of accounts) {
      const email = accountKey.replace('account:', '');
      const accountData = prodData[accountKey];

      if (existingEmails.has(email)) {
        console.log(`⏭️  ${email} - already exists`);
        skipped++;
        continue;
      }

      try {
        // Generate temporary password (user should change it)
        const tempPassword = Math.random().toString(36).substring(2, 10) + 'Temp1!';

        const userRecord = await auth.createUser({
          email: email,
          password: tempPassword,
          displayName: accountData.name || email.split('@')[0]
        });

        console.log(`✅ ${email} - created (password: ${tempPassword})`);
        created++;

        // Also ensure user entry in database
        const safeEmail = email.replace(/[^a-z0-9]/gi, '_');
        await db.ref(`users/email-${safeEmail}`).set({
          email: email,
          name: accountData.name || email.split('@')[0]
        });

      } catch (error) {
        console.log(`❌ ${email} - Error: ${error.message}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`\n💡 Users can change their password after first login`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

importAccounts().then(() => {
  console.log('\n✨ Done!');
  process.exit(0);
});
