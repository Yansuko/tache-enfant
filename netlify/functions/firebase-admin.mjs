import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env if not already loaded
if (!process.env.FIREBASE_DATABASE_URL) {
  try {
    const envPath = path.join(__dirname, '../../.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, val] = line.split('=');
      if (key && val) process.env[key.trim()] = val.trim();
    });
  } catch (e) {
    console.warn('[ENV] Could not load .env:', e.message);
  }
}

let db, auth;

try {
  let serviceAccount;
  try {
    // Try to load from file first
    try {
      const accountPath = path.join(__dirname, '../../firebase-service-account.json');
      const accountJson = fs.readFileSync(accountPath, 'utf-8');
      serviceAccount = JSON.parse(accountJson);
    } catch {
      // Fall back to env variable
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    }
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT: ${error.message}`);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });

  db = admin.database();
  auth = admin.auth();
} catch (error) {
  // Firebase not configured - provide mock/stub for testing
  console.warn(`[FIREBASE-INIT] Warning: ${error.message} - using stubs for testing`);
  db = {
    ref: () => ({
      set: async () => { console.warn('[FIREBASE-STUB] db.ref().set() called'); },
      once: async () => ({ exists: () => false, val: () => null })
    })
  };
  auth = {
    createUser: async () => { throw new Error('[FIREBASE-STUB] auth.createUser() requires Firebase config'); },
    getUserByEmail: async () => { throw new Error('[FIREBASE-STUB] auth.getUserByEmail() requires Firebase config'); },
    verifyIdToken: async () => { throw new Error('[FIREBASE-STUB] auth.verifyIdToken() requires Firebase config'); }
  };
}

export { db, auth };
