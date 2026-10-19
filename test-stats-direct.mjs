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

// Helper functions copied from _core.mjs
function dateToISO(timestamp) {
  const d = new Date(Number(timestamp));
  return d.toISOString().split('T')[0];
}

function getDateRange(period = 'week') {
  const now = Date.now();
  const d = new Date(now);
  const offset = d.getTimezoneOffset() * 60000;
  const localDate = new Date(now - offset);
  const todayStart = new Date(localDate.toISOString().split('T')[0]).getTime() + offset;

  if (period === 'today') {
    return { start: todayStart, end: todayStart + 86400000 };
  } else if (period === 'week') {
    const dow = new Date(localDate).getDay();
    const weekStart = todayStart - (dow || 7) * 86400000 + 86400000;
    return { start: weekStart, end: weekStart + 7 * 86400000 };
  } else if (period === 'month') {
    const year = new Date(localDate).getFullYear();
    const month = new Date(localDate).getMonth();
    const monthStart = new Date(year, month, 1).getTime() + offset;
    return { start: monthStart, end: monthStart + 31 * 86400000 };
  } else if (period === 'year') {
    const year = new Date(localDate).getFullYear();
    const yearStart = new Date(year, 0, 1).getTime() + offset;
    return { start: yearStart, end: yearStart + 366 * 86400000 };
  }
  return { start: todayStart - 7 * 86400000, end: todayStart + 86400000 };
}

function aggregateTaskStats(child, period = 'week') {
  const { start, end } = getDateRange(period);
  console.log('[AGGREGATE-STATS] Period:', period, 'Range:', { start: new Date(start).toISOString(), end: new Date(end).toISOString() });

  // Ensure tasks array exists and all have completedAt field
  let rawTasks = child.tasks || [];
  // Convert tasks object to array if needed (from Firebase)
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

  for (const task of tasks) {
    // A task is considered completed if it has a completedAt timestamp in range (regardless of done flag)
    const inRange = task.completedAt && task.completedAt >= start && task.completedAt <= end;
    if (inRange) {
      const iso = dateToISO(task.completedAt);
      console.log(`  ✓ Task "${task.name}" completed on ${iso} (${task.xp}XP, ${task.gold}Gold)`);

      // Update global counters
      tasksCount++;
      xpGained += task.xp || 0;
      goldGained += task.gold || 0;

      // Update daily breakdown
      if (!dailyBreakdown[iso]) {
        dailyBreakdown[iso] = { tasksCount: 0, xp: 0, gold: 0 };
      }
      dailyBreakdown[iso].tasksCount++;
      dailyBreakdown[iso].xp += task.xp || 0;
      dailyBreakdown[iso].gold += task.gold || 0;

      // Count task occurrences
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
    dailyBreakdown
  };
}

async function testStatsFlow() {
  const testId = Date.now();
  const familyId = `fam-${testId}`;
  const childId = `child-${testId}`;
  const childName = 'TestChild';

  console.log('\n=== DIRECT STATS TEST ===\n');

  try {
    // Create family with child
    console.log('📋 Creating family with child...');
    const now = Date.now();
    const familyData = {
      id: familyId,
      name: 'Test Family',
      owner: 'test-uid',
      members: ['test-uid'],
      children: [{
        id: childId,
        name: childName,
        xp: 0,
        gold: 0,
        tasks: [
          {
            id: `task-1`,
            name: 'Test Task 1',
            icon: '⭐',
            xp: 50,
            gold: 10,
            frequency: 'daily',
            done: true,
            completedAt: now  // Set to now (within week)
          },
          {
            id: `task-2`,
            name: 'Test Task 2',
            icon: '🎯',
            xp: 30,
            gold: 5,
            frequency: 'daily',
            done: false,
            completedAt: null
          },
          {
            id: `task-3`,
            name: 'Old Task',
            icon: '📚',
            xp: 20,
            gold: 3,
            frequency: 'daily',
            done: true,
            completedAt: now - 10 * 86400000  // 10 days ago (outside week)
          }
        ]
      }],
      gradeRequests: [],
      taskRequests: [],
      proposals: [],
      rewards: [],
      requests: [],
      sanctionsList: [],
      questList: [],
      day: 'D',
      dailyBonus: { xp: 30, gold: 15 }
    };

    await db.ref(`families/${familyId}`).set(familyData);
    console.log(`✓ Family created\n`);

    // Test aggregateTaskStats
    console.log('🧮 Testing aggregateTaskStats for week period...\n');
    const child = familyData.children[0];
    console.log(`Child "${child.name}" has ${child.tasks.length} tasks:`);
    child.tasks.forEach((t, i) => {
      console.log(`  [${i}] ${t.name}: done=${t.done}, completedAt=${t.completedAt ? new Date(t.completedAt).toISOString() : 'null'}, xp=${t.xp}`);
    });
    console.log();

    const stats = aggregateTaskStats(child, 'week');
    console.log('\n📊 Stats result:');
    console.log(`  tasksCount: ${stats.tasksCount}`);
    console.log(`  xpGained: ${stats.xpGained}`);
    console.log(`  goldGained: ${stats.goldGained}`);
    console.log(`  tasksAttempted: ${stats.tasksAttempted}`);
    console.log(`  completionRate: ${stats.completionRate}%\n`);

    // Verify the expected task count
    const expectedTasksCount = 1;  // Only "Test Task 1" should be in the week
    const expectedXP = 50;  // Only "Test Task 1"

    if (stats.tasksCount === expectedTasksCount && stats.xpGained === expectedXP) {
      console.log(`✅ TEST PASSED: Stats correctly shows ${expectedTasksCount} completed task with ${expectedXP} XP\n`);
    } else {
      console.log(`❌ TEST FAILED:`);
      console.log(`   Expected: tasksCount=${expectedTasksCount}, xpGained=${expectedXP}`);
      console.log(`   Got: tasksCount=${stats.tasksCount}, xpGained=${stats.xpGained}\n`);
    }

    // Now test with a family structure that matches Firebase (object instead of array)
    console.log('\n🔄 Testing with object-based tasks (Firebase structure)...\n');
    const tasksAsObject = {};
    child.tasks.forEach((t, i) => {
      tasksAsObject[`task_${i}`] = t;
    });

    const childWithObjectTasks = {
      ...child,
      tasks: tasksAsObject
    };

    console.log(`Child with object tasks:`, Object.keys(tasksAsObject));
    const stats2 = aggregateTaskStats(childWithObjectTasks, 'week');
    console.log('\n📊 Stats result (object tasks):');
    console.log(`  tasksCount: ${stats2.tasksCount}`);
    console.log(`  xpGained: ${stats2.xpGained}`);
    console.log(`  goldGained: ${stats2.goldGained}\n`);

    if (stats2.tasksCount === expectedTasksCount && stats2.xpGained === expectedXP) {
      console.log(`✅ OBJECT FORMAT TEST PASSED\n`);
    } else {
      console.log(`❌ OBJECT FORMAT TEST FAILED`);
      console.log(`   Expected: tasksCount=${expectedTasksCount}, xpGained=${expectedXP}`);
      console.log(`   Got: tasksCount=${stats2.tasksCount}, xpGained=${stats2.xpGained}\n`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    // Cleanup
    try {
      await db.ref(`families/${familyId}`).remove();
    } catch (e) {
      console.log(`Note: cleanup error: ${e.message}`);
    }
  }
}

await testStatsFlow();
