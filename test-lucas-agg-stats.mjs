// Test aggregateTaskStats directly with Lucas's data
import fs from 'fs';

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

  console.log('[AGGREGATE-STATS] Period:', period, 'France date:', { y, m: m+1, d }, 'Range:', { start: new Date(start).toISOString(), end: new Date(end).toISOString() });
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

  const tasks = rawTasks.filter(t => t && typeof t === 'object').map(t => ({
    ...t,
    completedAt: t.completedAt ? Number(t.completedAt) : null
  }));

  const dailyBreakdown = {};
  let tasksCount = 0;
  let xpGained = 0;
  let goldGained = 0;
  const taskNameCounts = {};
  let bestDay = { date: '', tasksCount: 0, xp: 0, gold: 0 };

  for (const task of tasks) {
    console.log(`  Checking task "${task.name}": done=${task.done}, completedAt=${task.completedAt ? new Date(task.completedAt).toISOString() : 'null'}`);

    const inRange = task.completedAt && task.completedAt >= start && task.completedAt <= end;
    console.log(`    In range: ${inRange} (${task.completedAt} >= ${start} && ${task.completedAt} <= ${end})`);

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
  const completionRate = tasksAttempted > 0 ? Math.round((tasksCount / tasksAttempted) * 100) : 0;

  return {
    tasksCount,
    tasksAttempted,
    completionRate,
    xpGained,
    goldGained,
    dailyBreakdown,
    topTasks: Object.entries(taskNameCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => {
        const task = tasks.find(t => t.name === name);
        return { name, count, icon: task?.icon || '⭐' };
      }),
    bestDay: bestDay.tasksCount > 0 ? bestDay : null
  };
}

console.log('\n=== TESTING LUCAS STATS AGGREGATION ===\n');

const now = Date.now();

// Simulate Lucas's data AFTER parent approves 2 tasks
const lucas = {
  id: 'child-lucas-demo',
  name: 'Lucas',
  xp: 90,
  gold: 64,
  tasks: [
    { icon: '🛏️', name: 'Faire son lit', xp: 10, gold: 5, done: true, daily: true, completedAt: now },
    { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now },
  ],
  grades: [
    { subject: 'Mathématiques', grade: '', xp: 0, gold: 0 },
    { subject: 'Français', grade: '', xp: 0, gold: 0 },
  ],
  sanctions: [],
};

console.log('Lucas tasks:');
lucas.tasks.forEach((t, i) => {
  console.log(`  [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt ? new Date(t.completedAt).toISOString() : 'null'}`);
});

console.log('\n📊 Computing stats for week period...\n');
const stats = aggregateTaskStats(lucas, 'week');

console.log('\n📈 Results:');
console.log(`  tasksCount: ${stats.tasksCount}`);
console.log(`  xpGained: ${stats.xpGained}`);
console.log(`  goldGained: ${stats.goldGained}`);
console.log(`  tasksAttempted: ${stats.tasksAttempted}`);
console.log(`  completionRate: ${stats.completionRate}%`);

if (stats.tasksCount === 2 && stats.xpGained === 40) {
  console.log('\n✅ TEST PASSED: Stats correctly shows 2 completed tasks with 40 XP\n');
} else {
  console.log(`\n❌ TEST FAILED: Expected tasksCount=2, xpGained=40, got tasksCount=${stats.tasksCount}, xpGained=${stats.xpGained}\n`);
}
