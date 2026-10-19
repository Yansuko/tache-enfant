import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const keyPath = '/home/yansu/workspace/firebase-service-account.json';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf-8'))),
    databaseURL: 'https://dailykidsquest-20c85-default-rtdb.europe-west1.firebasedatabase.app'
  });
}

const db = admin.database();

async function main() {
  console.log('\n=== CHECKING DEMO FAMILY DATA ===\n');
  
  // Get the demo family
  const snap = await db.ref('families/fam-demo').once('value');
  const family = snap.val();
  
  if (!family) {
    console.error('Demo family not found!');
    return;
  }
  
  console.log(`Family: ${family.name}`);
  console.log(`Owner: ${family.owner}`);
  console.log(`Children: ${family.children?.length || 0}`);
  
  // Check Emma's tasks
  const emma = family.children?.find(c => c.name === 'Emma');
  if (!emma) {
    console.log('\nEmma not found!');
    return;
  }
  
  console.log(`\nEmma's tasks (${emma.tasks?.length || 0} total):`);
  const tasks = emma.tasks || [];
  
  // Count tasks by completedAt status
  let completedCount = 0;
  let nullCount = 0;
  
  for (let i = 0; i < Math.min(5, tasks.length); i++) {
    const t = tasks[i];
    const completed = t.completedAt ? '✓' : '✗';
    console.log(`  [${i}] ${completed} ${t.name}: done=${t.done}, completedAt=${t.completedAt ? new Date(t.completedAt).toISOString() : 'null'}`);
    if (t.completedAt) completedCount++;
    else nullCount++;
  }
  
  console.log(`\n  Summary: ${completedCount} with completedAt, ${nullCount} with null`);
  console.log(`  Total tasks in array: ${tasks.length}`);
  
  // Now check what the stats calculation would return
  const FRANCE_OFFSET_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  const timeInFrance = now + FRANCE_OFFSET_MS;
  const dateInFrance = new Date(timeInFrance);
  
  console.log(`\n=== DATE RANGE CALCULATION ===`);
  console.log(`Now (UTC): ${new Date(now).toISOString()}`);
  console.log(`France time: ${new Date(timeInFrance).toISOString()}`);
  console.log(`France date components: ${dateInFrance.getUTCFullYear()}-${dateInFrance.getUTCMonth()+1}-${dateInFrance.getUTCDate()}`);
  
  const y = dateInFrance.getUTCFullYear();
  const m = dateInFrance.getUTCMonth();
  const d = dateInFrance.getUTCDate();
  const dow = dateInFrance.getUTCDay();
  
  console.log(`Day of week: ${dow} (0=Sun, 6=Sat)`);
  
  // Calculate week range
  const daysToSubtract = dow;
  const startDateUTC = Date.UTC(y, m, d - daysToSubtract, 0, 0, 0, 0);
  const endDateUTC = Date.UTC(y, m, d + (6 - dow), 23, 59, 59, 999);
  
  const start = startDateUTC - FRANCE_OFFSET_MS;
  const end = endDateUTC - FRANCE_OFFSET_MS;
  
  console.log(`\nWeek range (UTC):`);
  console.log(`  Start: ${new Date(start).toISOString()}`);
  console.log(`  End: ${new Date(end).toISOString()}`);
  
  console.log(`\n=== TASKS IN RANGE ===`);
  
  let inRange = 0;
  let outRange = 0;
  let noCompletedAt = 0;
  
  for (const t of tasks) {
    if (!t.completedAt) {
      noCompletedAt++;
    } else if (t.completedAt >= start && t.completedAt <= end) {
      inRange++;
      console.log(`  ✓ "${t.name}": ${new Date(t.completedAt).toISOString()}`);
    } else {
      outRange++;
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`  In range: ${inRange}`);
  console.log(`  Out of range: ${outRange}`);
  console.log(`  No completedAt: ${noCompletedAt}`);
}

await main();
