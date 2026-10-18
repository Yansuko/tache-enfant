#!/usr/bin/env node
/**
 * Build script: Generate firebase-config.js from environment variables
 * This prevents API keys from being committed to the repository
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read from environment variables
const config = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Validate required variables
const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missing = required.filter(key => !config[key]);

if (missing.length > 0) {
  console.error('❌ Missing Firebase environment variables:', missing.join(', '));
  console.error('Please set these in your .env file or Netlify environment settings.');
  process.exit(1);
}

// Generate the config file
const content = `export const firebaseConfig = ${JSON.stringify(config, null, 2)};
`;

const configPath = path.join(__dirname, 'firebase-config.js');
fs.writeFileSync(configPath, content, 'utf-8');

console.log('✅ firebase-config.js generated successfully');
console.log('   Project ID:', config.projectId);
console.log('   Auth Domain:', config.authDomain);
