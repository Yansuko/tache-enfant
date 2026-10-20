import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBTWAWR0yQgPMo_PEK57lauxIzVqjtRMDI",
  authDomain: "dailykidsquest-20c85.firebaseapp.com",
  databaseURL: "https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dailykidsquest-20c85",
  storageBucket: "dailykidsquest-20c85.firebasestorage.app",
  messagingSenderId: "505406678744",
  appId: "1:505406678744:web:7d6190678aef2cda2999ad"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function restoreDemoFamily() {
  try {
    console.log('🔄 Restauration de la famille démo...');

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
        {
          name: 'Croix de conduite',
          gold: 10
        },
        {
          name: 'Devoirs non faits',
          gold: 5
        }
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
      actionLog: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await set(ref(db, `families/fam-demo`), demoFamily);
    console.log('✅ Famille démo restaurée avec succès!');
    console.log('   - Emma (PIN: 0000)');
    console.log('   - Lucas (PIN: 1111)');
    console.log('   - Test (PIN: 2222)');
    console.log('   - 2 sanctions disponibles');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

restoreDemoFamily();
