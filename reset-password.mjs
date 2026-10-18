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
  const tempPassword = 'Temp123!@#';

  try {
    // Find user by email
    const user = await auth.getUserByEmail(email);

    // Update password
    await auth.updateUser(user.uid, {
      password: tempPassword
    });

    console.log(`✅ Password reset for ${email}`);
    console.log(`📝 Temporary password: ${tempPassword}`);
    console.log(`💡 Login and change it in settings`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }

  process.exit(0);
}

reset();
