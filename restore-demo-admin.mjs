import { db } from './netlify/functions/firebase-admin.mjs';

async function restoreDemoFamily() {
  try {
    console.log('🔄 Restauration de la famille démo via Firebase Admin...');

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
          dailyBonusDay: null
        }
      ],
      sanctionsList: [
        { name: 'Lost gold penalty', gold: 20 },
        { name: 'Extra homework', gold: 10 }
      ],
      questList: [],
      proposals: [],
      rewards: [],
      requests: [],
      gradeRequests: [],
      taskRequests: [],
      actionLog: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await db.ref('families/fam-demo').set(demoFamily);
    console.log('✅ Famille démo restaurée avec succès!');
    console.log('   ✓ Emma (PIN: 0000) - 150 XP, 45 gold');
    console.log('   ✓ Lucas (PIN: 1111) - 230 XP, 80 gold');
    console.log('   ✓ Test (PIN: 2222) - 50 XP, 20 gold');
    console.log('   ✓ 2 sanctions configurées');

    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

restoreDemoFamily();
