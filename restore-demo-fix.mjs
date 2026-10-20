import admin from 'firebase-admin';
import fs from 'fs';

// Load service account from file
const serviceAccount = JSON.parse(fs.readFileSync('./firebase-service-account.json', 'utf-8'));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function restoreDemoFamily() {
  const demoFamily = {
    id: 'fam-demo',
    name: 'Famille Démo',
    owner: 'parent@demo.fr',
    members: ['parent@demo.fr'],
    children: [
      {
        id: 'child-emma-demo',
        name: 'Emma',
        pin: '0000',
        xp: 150,
        gold: 45,
        level: 2,
        tasks: [],
        sanctions: [],
        grades: [],
        dailyBonusDay: null
      },
      {
        id: 'child-lucas-demo',
        name: 'Lucas',
        pin: '1111',
        xp: 230,
        gold: 80,
        level: 3,
        tasks: [],
        sanctions: [],
        grades: [],
        dailyBonusDay: null
      },
      {
        id: 'child-test-demo',
        name: 'Test',
        pin: '2222',
        xp: 50,
        gold: 20,
        level: 1,
        tasks: [],
        sanctions: [],
        grades: [],
        dailyBonusDay: null
      }
    ],
    sanctionsList: [
      { name: 'Croix de conduite', gold: 10 },
      { name: 'Devoirs non faits', gold: 5 }
    ],
    questList: [],
    proposals: [],
    rewards: [
      { icon: '🎮', name: '30 min de jeu vidéo', cost: 50, lvl: 1 },
      { icon: '🍿', name: 'Soirée film + popcorn', cost: 80, lvl: 2 },
      { icon: '💶', name: "5€ d'argent de poche", cost: 150, lvl: 3 },
    ],
    requests: [
      { child: 'Emma', icon: '🎬', name: 'Sortie cinéma', cost: 40, status: 'approved' },
      { child: 'Emma', icon: '🎮', name: "Temps d'écran", cost: 50, status: 'pending' },
    ],
    gradeRequests: [],
    taskRequests: [],
    actionLog: [],  // IMPORTANT: Initialize with empty array
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  console.log('Writing fam-demo to Firebase...');
  await db.ref('families/fam-demo').set(demoFamily);
  console.log('✓ Written to families/fam-demo');

  // Also write each child separately
  for (const child of demoFamily.children) {
    await db.ref(`families/fam-demo/children/${child.id}`).set({
      id: child.id,
      name: child.name,
      xp: child.xp || 0,
      gold: child.gold || 0,
      pin: child.pin,
      tasks: child.tasks || [],
      grades: child.grades || [],
      sanctions: child.sanctions || [],
      dailyBonusDay: child.dailyBonusDay,
      updatedAt: Date.now()
    });
  }
  console.log('✓ Written each child separately');

  // Verify
  const snap = await db.ref('families/fam-demo').once('value');
  const fam = snap.val();
  console.log('\nVerification:');
  console.log('✓ Family found');
  console.log('  - actionLog field exists:', 'actionLog' in fam);
  console.log('  - actionLog is array:', Array.isArray(fam.actionLog));
  console.log('  - actionLog length:', fam.actionLog?.length || 0);
  console.log('  - children count:', fam.children?.length || 0);

  process.exit(0);
}

restoreDemoFamily().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
