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

// Copy aggregateTaskStats from _core.mjs
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

  if (period === 'day') {
    startDateUTC = Date.UTC(y, m, d, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, m, d, 23, 59, 59, 999);
  } else if (period === 'week') {
    const daysToSubtract = dayOfWeek;
    const daysToAdd = 6 - dayOfWeek;
    startDateUTC = Date.UTC(y, m, d - daysToSubtract, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, m, d + daysToAdd, 23, 59, 59, 999);
  } else if (period === 'month') {
    startDateUTC = Date.UTC(y, m, 1, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, m + 1, 0, 23, 59, 59, 999);
  } else if (period === 'year') {
    startDateUTC = Date.UTC(y, 0, 1, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, 11, 31, 23, 59, 59, 999);
  }

  const start = startDateUTC - FRANCE_OFFSET_MS;
  const end = endDateUTC - FRANCE_OFFSET_MS;
  return { start, end };
}

function aggregateTaskStats(child, period = 'week') {
  const { start, end } = getDateRange(period);

  let rawTasks = child.tasks || [];
  if (rawTasks && typeof rawTasks === 'object' && !Array.isArray(rawTasks)) {
    rawTasks = Object.values(rawTasks).filter(v => v !== null && v !== undefined);
  }

  const tasks = rawTasks.filter(t => t && typeof t === 'object').map(t => {
    let completedAt = null;
    if (t.completedAt) {
      const num = Number(t.completedAt);
      completedAt = !isNaN(num) ? num : (typeof t.completedAt === 'string' ? new Date(t.completedAt).getTime() : null);
    }
    return { ...t, completedAt };
  });

  const dailyBreakdown = {};
  let tasksCount = 0;
  let xpGained = 0;
  let goldGained = 0;
  const taskNameCounts = {};
  let bestDay = { date: '', tasksCount: 0, xp: 0, gold: 0 };

  for (const task of tasks) {
    const inRange = task.completedAt && task.completedAt >= start && task.completedAt <= end;
    if (inRange) {
      const iso = dateToISO(task.completedAt);
      tasksCount++;
      xpGained += task.xp || 0;
      goldGained += task.gold || 0;
      
      if (!dailyBreakdown[iso]) {
        dailyBreakdown[iso] = { tasksCount: 0, xp: 0, gold: 0 };
      }
      dailyBreakdown[iso].tasksCount++;
      dailyBreakdown[iso].xp += task.xp || 0;
      dailyBreakdown[iso].gold += task.gold || 0;

      if (dailyBreakdown[iso].tasksCount > bestDay.tasksCount ||
          (dailyBreakdown[iso].tasksCount === bestDay.tasksCount && iso < bestDay.date)) {
        bestDay = { date: iso, ...dailyBreakdown[iso] };
      }

      const key = task.name || 'Sans nom';
      taskNameCounts[key] = (taskNameCounts[key] || 0) + 1;
    }
  }

  const tasksAttempted = tasks.length;
  const topTasks = Object.entries(taskNameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => {
      const task = tasks.find(t => t.name === name);
      return { name, count, icon: task?.icon || '⭐' };
    });

  const completionRate = tasksAttempted > 0 ? Math.round((tasksCount / tasksAttempted) * 100) : 0;

  return {
    tasksCount,
    tasksAttempted,
    completionRate,
    xpGained,
    goldGained,
    dailyBreakdown,
    topTasks,
    bestDay: bestDay.tasksCount > 0 ? bestDay : null
  };
}

async function testAdminStats() {
  console.log('=== ADMIN STATS (LIKE getAdminStats) ===\n');
  
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();
  
  let children = family.children;
  if (children && typeof children === 'object' && !Array.isArray(children)) {
    children = Object.values(children).filter(v => v !== null && v !== undefined);
  }
  
  // This is what getAdminStats does - calculate year stats for each child
  let totalTasksCompleted = 0;
  const familyChildren = [];
  
  for (const child of (children || [])) {
    const childStats = aggregateTaskStats(child, 'year');
    const tasksCount = childStats.tasksCount || 0;
    totalTasksCompleted += tasksCount;
    
    familyChildren.push({
      id: child.id,
      name: child.name,
      pin: child.pin,
      tasksCompleted: tasksCount
    });
    
    console.log(`${child.name}: ${tasksCount} tasks (${childStats.xpGained} XP, ${childStats.goldGained} gold)`);
  }
  
  console.log(`\nTotal tasks completed (year): ${totalTasksCompleted}`);
  console.log('\nFamily children in admin stats:');
  console.log(JSON.stringify(familyChildren, null, 2));
  
  process.exit(0);
}

testAdminStats().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
