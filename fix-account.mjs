#!/usr/bin/env node
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();

async function fixAccount() {
  const email = 'yansu@free.fr';

  try {
    console.log(`🔍 Finding user ${email}...`);
    const user = await auth.getUserByEmail(email);
    console.log(`✅ Found user:`, {
      uid: user.uid,
      email: user.email,
      customClaims: user.customClaims
    });

    // Delete and recreate
    console.log(`\n🗑️  Deleting old account...`);
    await auth.deleteUser(user.uid);
    console.log(`✅ Deleted`);

    console.log(`\n➕ Creating new account...`);
    const newUser = await auth.createUser({
      email: email,
      password: 'TestPassword123!',
      displayName: 'Yansu'
    });
    console.log(`✅ Created with UID:`, newUser.uid);

    console.log(`\n📝 New credentials:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: TestPassword123!`);

  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }

  process.exit(0);
}

fixAccount();
