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

async function testGetTaskStatsFlow() {
  console.log('=== SIMULATING getTaskStats FLOW ===\n');
  
  // Step 1: Get child-id-index (like the API does)
  console.log('Step 1: Check child-id-index');
  // In real API, this would be from store.get, but we'll check Firebase directly
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();
  
  // Step 2: Get Emma's child record
  const childId = 'child-emma-demo';
  console.log(`\nStep 2: Looking for childId: ${childId}`);
  
  // Simulate normalizeFamilyData
  let children = family.children;
  if (children && typeof children === 'object' && !Array.isArray(children)) {
    console.log('  Normalizing children (converting object to array)...');
    children = Object.values(children).filter(v => v !== null && v !== undefined);
  }
  
  const child = children.find(c => c.id === childId);
  if (!child) {
    console.log(`  ❌ ERROR: Child ${childId} NOT FOUND!`);
    console.log(`  Available children: ${children.map(c => `${c.name} (${c.id})`).join(', ')}`);
    process.exit(1);
  }
  
  console.log(`  ✓ Found: ${child.name}`);
  console.log(`  Tasks: ${child.tasks?.length || 0}`);
  console.log(`  XP: ${child.xp}, Gold: ${child.gold}`);
  
  // Step 3: Check what getTaskStats would return for children stats
  console.log(`\nStep 3: Simulate childrenStats collection`);
  console.log('  This is what would be returned as childrenStats:');
  
  const childrenStats = children.map((c, idx) => ({
    index: idx,
    name: c.name,
    id: c.id,
    tasks: c.tasks?.filter(t => t.done === true).length || 0,
    tasksWithCompletedAt: c.tasks?.filter(t => t.completedAt).length || 0,
  }));
  
  childrenStats.forEach(s => {
    console.log(`    [${s.index}] ${s.name}: done=${s.tasks}, completedAt=${s.tasksWithCompletedAt}`);
  });
  
  process.exit(0);
}

testGetTaskStatsFlow().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
