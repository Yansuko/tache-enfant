import admin from 'firebase-admin';
import fs from 'fs';

// Load .env
const envContent = fs.readFileSync('.env', 'utf8');
envContent.split('\n').forEach(line => {
  const [key, val] = line.split('=').map(s => s.trim());
  if (key && val) process.env[key] = val;
});

let serviceAccount = {};
try {
  const accountJson = fs.readFileSync('firebase-service-account.json', 'utf-8');
  serviceAccount = JSON.parse(accountJson);
} catch {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
}

if (!serviceAccount.project_id) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
} catch (e) {
  if (!e.message.includes('already exists')) throw e;
}

const db = admin.database();

async function testAuditLog() {
  console.log('=== AUDIT LOG CHECK ===\n');
  
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();
  
  let actionLog = family.actionLog;
  if (actionLog && typeof actionLog === 'object' && !Array.isArray(actionLog)) {
    actionLog = Object.values(actionLog).filter(v => v !== null && v !== undefined);
  }
  
  console.log(`actionLog type: ${typeof actionLog}, isArray: ${Array.isArray(actionLog)}, length: ${actionLog?.length || 0}\n`);
  
  if (actionLog && Array.isArray(actionLog) && actionLog.length > 0) {
    console.log('Recent audit log entries:');
    actionLog.slice(-10).forEach((entry, i) => {
      const timestamp = new Date(entry.timestamp).toISOString();
      console.log(`  [${i}] ${timestamp} - ${entry.type}: ${entry.subject} → ${entry.target}`);
      console.log(`       Details: ${entry.details}`);
    });
  } else {
    console.log('No actionLog entries found');
  }
  
  process.exit(0);
}

testAuditLog().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
