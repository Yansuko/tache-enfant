import admin from 'firebase-admin';
import fs from 'fs';

// Load env and Firebase config
const envPath = new URL('../.env', import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) process.env[key.trim()] = val.trim();
  });
}

const serviceAccountPath = new URL('../firebase-service-account.json', import.meta.url).pathname;
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

function demoTasks() {
  const now = Date.now();
  return [
    { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now },
    { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now },
    { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: now - 86400000 },
    { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 86400000 },
    { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 172800000 },
    { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now - 172800000 },
    { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 172800000 },
    { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 259200000 },
    { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: now - 259200000 },
    { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 345600000 },
    { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now - 345600000 },
    { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 345600000 },
    { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: now - 432000000 },
    { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 518400000 },
    { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now - 518400000 },
    { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 604800000 },
  ];
}

async function restoreDemoFamily() {
  try {
    console.log('🔄 Restauration de la famille démo...');

    const restoredFamily = {
      id: 'fam-demo',
      name: 'Famille Démo',
      owner: 'parent@demo.fr',
      members: ['parent@demo.fr'],
      day: '',
      dailyBonus: { xp: 30, gold: 15 },
      questList: [
        { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, daily: true },
        { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, daily: true },
        { icon: '🛏️', name: 'Faire son lit', xp: 10, gold: 5, daily: true },
      ],
      proposals: [],
      gradeRequests: [
        { id: 'grade-1', child: 'Emma', subject: 'Mathématiques', grade: '16/20', xp: 50, gold: 10, date: new Date('2025-10-15').getTime() },
        { id: 'grade-2', child: 'Emma', subject: 'Français', grade: '13/20', xp: 30, gold: 5, date: new Date('2025-10-14').getTime() },
      ],
      taskRequests: [],
      children: [
        {
          id: 'child-emma-demo',
          name: 'Emma',
          xp: 150,
          gold: 230,
          level: 2,
          pin: '0000',
          tasks: demoTasks(),
          grades: [
            { subject: 'Mathématiques', grade: '16/20', xp: 50, gold: 10 },
            { subject: 'Français', grade: '13/20', xp: 30, gold: 5 },
            { subject: 'Histoire-Géo', grade: '', xp: 0, gold: 0 },
            { subject: 'Anglais', grade: '', xp: 0, gold: 0 },
          ],
          sanctions: [{ motif: 'Croix de conduite', gold: 10 }],
        },
        {
          id: 'child-lucas-demo',
          name: 'Lucas',
          xp: 230,
          gold: 50,
          level: 3,
          pin: '1111',
          tasks: [
            { icon: '🛏️', name: 'Faire son lit', xp: 10, gold: 5, done: false, daily: true, completedAt: null },
            { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: false, daily: true, completedAt: null },
          ],
          grades: [
            { subject: 'Mathématiques', grade: '', xp: 0, gold: 0 },
            { subject: 'Français', grade: '', xp: 0, gold: 0 },
          ],
          sanctions: [],
        },
        {
          id: 'child-test-demo',
          name: 'Test',
          xp: 50,
          gold: 30,
          level: 1,
          pin: '2222',
          tasks: [
            { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: false, daily: true, completedAt: null },
          ],
          grades: [],
          sanctions: [],
        },
      ],
      sanctionsList: [
        { name: 'Croix de conduite', gold: 10 },
        { name: 'Devoirs non faits', gold: 5 },
      ],
      rewards: [
        { icon: '🎮', name: '30 min de jeu vidéo', cost: 50, lvl: 1 },
        { icon: '🍿', name: 'Soirée film + popcorn', cost: 80, lvl: 2 },
        { icon: '💶', name: "5€ d'argent de poche", cost: 150, lvl: 3 },
      ],
      requests: [
        { child: 'Emma', icon: '🎬', name: 'Sortie cinéma', cost: 40, status: 'approved' },
        { child: 'Emma', icon: '🎮', name: "Temps d'écran", cost: 50, status: 'pending' },
      ],
      actionLog: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.ref('families/fam-demo').set(restoredFamily);
    console.log('✅ Famille démo restaurée avec succès!');
    console.log('   - Emma (PIN: 0000): 150 XP, 230 gold, 16 tâches');
    console.log('   - Lucas (PIN: 1111): 230 XP, 50 gold, 2 tâches');
    console.log('   - Test (PIN: 2222): 50 XP, 30 gold, 1 tâche');
    console.log('   - 3 quêtes disponibles');
    console.log('   - 2 sanctions');
    console.log('   - 3 récompenses');
    console.log('   - 2 demandes de notes');
    console.log('   - actionLog vide (pour nouvelles actions)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

restoreDemoFamily();
