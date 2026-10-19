import admin from 'firebase-admin';
import fs from 'fs';

const DEFAULT_DB_URL = 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app';
const keyPath = new URL('./firebase-service-account.json', import.meta.url);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf-8'))),
    databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL
  });
}

const db = admin.database();

// Import functions from _core
function normalizeFamilyData(f) {
  if (!f || typeof f !== 'object') return f;
  const arrayFields = ['children', 'questList', 'proposals', 'rewards', 'requests', 'gradeRequests', 'taskRequests', 'sanctionsList'];
  for (const field of arrayFields) {
    if (f[field] && typeof f[field] === 'object' && !Array.isArray(f[field])) {
      const arr = Object.values(f[field]).filter(v => v !== null && v !== undefined);
      f[field] = arr;
    }
    if (!f[field] || !Array.isArray(f[field])) f[field] = [];
  }
  if (f.children && Array.isArray(f.children)) {
    for (const child of f.children) {
      if (child && typeof child === 'object') {
        if (child.tasks && typeof child.tasks === 'object' && !Array.isArray(child.tasks)) {
          child.tasks = Object.values(child.tasks).filter(v => v !== null && v !== undefined);
        }
        if (!child.tasks || !Array.isArray(child.tasks)) child.tasks = [];
      }
    }
  }
  return f;
}

function dateToISO(ms) {
  return new Date(ms).toISOString().split('T')[0];
}

function getDateRange(period, endDate = Date.now()) {
  const FRANCE_OFFSET_MS = 2 * 60 * 60 * 1000;
  const timeInFrance = endDate + FRANCE_OFFSET_MS;
  const dateInFrance = new Date(timeInFrance);
  const y = dateInFrance.getUTCFullYear();
  const m = dateInFrance.getUTCMonth();
  const d = dateInFrance.getUTCDate();
  const dayOfWeek = dateInFrance.getUTCDay();

  let startDateUTC, endDateUTC;
  if (period === 'week') {
    const daysToSubtract = dayOfWeek;
    const daysToAdd = 6 - dayOfWeek;
    startDateUTC = Date.UTC(y, m, d - daysToSubtract, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, m, d + daysToAdd, 23, 59, 59, 999);
  }

  const start = startDateUTC - FRANCE_OFFSET_MS;
  const end = endDateUTC - FRANCE_OFFSET_MS;
  return { start, end };
}

function aggregateTaskStats(child, period = 'week') {
  const { start, end } = getDateRange(period);
  console.log('[AGGREGATE-STATS] Period:', period, 'Range:', { start: new Date(start).toISOString(), end: new Date(end).toISOString() });

  let rawTasks = child.tasks || [];
  if (rawTasks && typeof rawTasks === 'object' && !Array.isArray(rawTasks)) {
    rawTasks = Object.values(rawTasks).filter(v => v !== null && v !== undefined);
  }
  console.log('[AGGREGATE-STATS] Total tasks:', rawTasks.length);

  const tasks = rawTasks.filter(t => t && typeof t === 'object').map(t => {
    let completedAt = null;
    if (t.completedAt) {
      const num = Number(t.completedAt);
      completedAt = !isNaN(num) ? num : (typeof t.completedAt === 'string' ? new Date(t.completedAt).getTime() : null);
    }
    return { ...t, completedAt };
  });

  let tasksCount = 0;
  let xpGained = 0;
  for (const task of tasks) {
    const inRange = task.completedAt && task.completedAt >= start && task.completedAt <= end;
    if (inRange) {
      tasksCount++;
      xpGained += task.xp || 0;
      console.log(`  ✓ Task "${task.name}" completed (${task.xp}XP)`);
    }
  }

  return { tasksCount, xpGained };
}

async function testFix() {
  console.log('\n=== TESTING STATS FIX ===\n');
  
  try {
    // Get demo family
    const famSnap = await db.ref('families/fam-demo').once('value');
    const family = famSnap.val();
    
    if (!family) {
      console.error('Demo family not found');
      return;
    }
    
    normalizeFamilyData(family);
    const emma = family.children?.find(c => c.name === 'Emma');
    if (!emma) {
      console.error('Emma not found');
      return;
    }
    
    console.log(`Testing stats for Emma (${emma.tasks?.length || 0} tasks)`);
    console.log(`Sample completedAt values:`);
    emma.tasks?.slice(0, 3).forEach((t, i) => {
      const comp = t.completedAt;
      console.log(`  [${i}] ${t.name}: type=${typeof comp}, value=${comp}`);
    });
    
    console.log(`\nCalculating stats...`);
    const stats = aggregateTaskStats(emma, 'week');
    
    console.log(`\nStats Result:`);
    console.log(`  tasksCount: ${stats.tasksCount}`);
    console.log(`  xpGained: ${stats.xpGained}`);
    
    if (stats.tasksCount > 0) {
      console.log('\n✅ STATS CALCULATION WORKS!');
    } else {
      console.log('\n❌ STATS STILL SHOWING ZERO');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

await testFix();
