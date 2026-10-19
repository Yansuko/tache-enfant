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

// Copy the aggregateTaskStats logic from _core.mjs
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
      console.log(`  ✓ Task "${task.name}" in range (${task.xp}XP): completedAt=${new Date(task.completedAt).toISOString()}`);
    } else if (task.completedAt) {
      console.log(`  ✗ Task "${task.name}" OUT OF RANGE: completedAt=${new Date(task.completedAt).toISOString()}, range=[${new Date(start).toISOString()}, ${new Date(end).toISOString()}]`);
    }
  }

  return { tasksCount, xpGained };
}

async function test() {
  console.log('\n=== TEST: Stats with ISO string completedAt ===\n');
  
  const famSnap = await db.ref('families/fam-demo').once('value');
  const family = famSnap.val();
  
  const lucas = family.children?.find(c => c.name === 'Lucas');
  if (!lucas) {
    console.error('Lucas not found');
    return;
  }
  
  console.log('Lucas tasks from Firebase:');
  lucas.tasks?.forEach((t, i) => {
    console.log(`  [${i}] "${t.name}": completedAt=${t.completedAt} (type: ${typeof t.completedAt})`);
  });
  
  console.log('\nCalculating stats...\n');
  const stats = aggregateTaskStats(lucas, 'week');
  
  console.log('\nResult:', stats);
  if (stats.tasksCount > 0) {
    console.log('✅ Stats working!');
  } else {
    console.log('❌ Stats broken!');
  }
}

await test();
process.exit(0);
