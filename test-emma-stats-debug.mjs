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

async function testEmmaStats() {
  console.log('=== EMMA STATS DEBUG ===\n');
  
  // Get demo family
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();
  
  if (!family) {
    console.log('❌ Demo family not found');
    process.exit(1);
  }
  
  // Normalize children if they're stored as object
  let children = family.children;
  if (children && typeof children === 'object' && !Array.isArray(children)) {
    console.log('⚠️  Children is an object, converting to array...');
    children = Object.values(children).filter(v => v !== null && v !== undefined);
  }
  
  console.log(`Found ${children?.length || 0} children\n`);
  
  for (const child of (children || [])) {
    console.log(`📋 Child: ${child.name} (id: ${child.id})`);
    console.log(`   XP: ${child.xp || 0}, Gold: ${child.gold || 0}`);
    
    // Check tasks
    let tasks = child.tasks || [];
    if (tasks && typeof tasks === 'object' && !Array.isArray(tasks)) {
      console.log('   ⚠️  Tasks is an object, converting to array...');
      tasks = Object.values(tasks).filter(v => v !== null && v !== undefined);
    }
    
    console.log(`   Total tasks: ${tasks.length}`);
    
    // Check which tasks are marked done
    const doneTasks = tasks.filter(t => t.done === true);
    console.log(`   Done tasks: ${doneTasks.length}`);
    
    // Check completedAt timestamps
    const completedTasks = tasks.filter(t => t.completedAt);
    console.log(`   Tasks with completedAt: ${completedTasks.length}`);
    
    // Show first few tasks
    if (tasks.length > 0) {
      console.log(`   First 3 tasks:`);
      tasks.slice(0, 3).forEach((t, i) => {
        const ct = t.completedAt;
        const ctDate = ct ? new Date(Number(ct)).toISOString() : 'null';
        console.log(`     [${i}] "${t.name}": done=${t.done}, completedAt=${ctDate}`);
      });
    }
    
    console.log('');
  }
  
  process.exit(0);
}

testEmmaStats().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
