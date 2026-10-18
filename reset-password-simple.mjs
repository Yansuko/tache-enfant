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

async function reset() {
  const email = 'yansu@free.fr';
  const password = 'password123';

  try {
    // Delete and recreate
    console.log(`🗑️  Deleting old account...`);
    try {
      const user = await auth.getUserByEmail(email);
      await auth.deleteUser(user.uid);
      console.log(`✅ Deleted`);
    } catch (e) {
      console.log(`⏭️  Account doesn't exist, creating new one...`);
    }

    // Create new account
    console.log(`➕ Creating new account...`);
    const newUser = await auth.createUser({
      email: email,
      password: password
    });
    console.log(`✅ Created`);

    console.log(`\n📝 Login credentials:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);

  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }

  process.exit(0);
}

reset();
