import admin from 'firebase-admin';
import fs from 'fs';

// Load .env
try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
} catch {}

// Initialize Firebase
let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));
} catch {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function check() {
  console.log('Checking yansu@free.fr family...\n');
  
  // Get all users to find yansu@free.fr
  const usersRef = db.ref('users');
  const usersSnapshot = await usersRef.once('value');
  const users = usersSnapshot.val() || {};
  
  let yansufreeUser = null;
  for (const [uid, user] of Object.entries(users)) {
    if (user.email === 'yansu@free.fr') {
      yansufreeUser = { uid, ...user };
      break;
    }
  }
  
  if (!yansufreeUser) {
    console.log('❌ yansu@free.fr user not found');
    process.exit(1);
  }
  
  console.log('✓ Found yansu@free.fr:', yansufreeUser);
  console.log('  FamilyIds:', yansufreeUser.familyIds);
  
  // Get family data
  for (const familyId of (yansufreeUser.familyIds || [])) {
    const famSnapshot = await db.ref(`families/${familyId}`).once('value');
    const family = famSnapshot.val();
    
    console.log(`\n📁 Family: ${family.name}`);
    console.log(`   ID: ${familyId}`);
    console.log(`   Children count: ${family.children?.length || 0}`);
    if (family.children && family.children.length > 0) {
      console.log('   Children:');
      for (const child of family.children) {
        console.log(`     - ${child.name}: ${child.xp} XP, ${child.gold} gold, ${child.tasks?.length || 0} tasks`);
      }
    } else {
      console.log('   ⚠️  NO CHILDREN FOUND');
    }
  }
  
  process.exit(0);
}

check().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
