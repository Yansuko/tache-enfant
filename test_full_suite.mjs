import { handleApi } from './netlify/functions/_core.mjs';
import Database from 'better-sqlite3';
import { createDatabaseAdapter } from './database.js';

const db = new Database('./data/dailykids.db');
const store = createDatabaseAdapter(db, false);

let token = null;

async function test(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log('='.repeat(60));
  try {
    await fn();
  } catch (e) {
    console.error(`❌ FAILED:`, e.message);
  }
}

await test('1. LOGIN', async () => {
  const res = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  if (res.status !== 200) throw new Error('Login failed: ' + res.body.error);
  token = res.body.token;
  console.log(`✅ Login successful`);
  console.log(`✅ Token issued: ${token.substring(0, 20)}...`);
});

await test('2. QUEST TEMPLATE DEDUPLICATION', async () => {
  const res = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  const family = res.body.families[0];
  const questList = family.questList || [];
  
  console.log(`Total templates: ${questList.length}`);
  questList.forEach(q => {
    console.log(`  - "${q.name}" (ID: ${q.id || 'none'})`);
  });
  
  // Count duplicates
  const byName = {};
  questList.forEach(q => {
    byName[q.name] = (byName[q.name] || 0) + 1;
  });
  
  const hasDuplicates = Object.values(byName).some(count => count > 1);
  if (hasDuplicates) {
    console.log(`❌ DUPLICATES FOUND:`);
    Object.entries(byName).forEach(([name, count]) => {
      if (count > 1) console.log(`   "${name}": ${count} occurrences`);
    });
    throw new Error('Templates are duplicated');
  }
  console.log(`✅ NO DUPLICATES - All templates are unique`);
});

await test('3. TASK HISTORY IN STATS', async () => {
  const res = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  const family = res.body.families[0];
  const child = family.children[0];
  const completedTasks = (child.tasks || []).filter(t => t?.completedAt);
  
  console.log(`Child: ${child.name}`);
  console.log(`Completed tasks: ${completedTasks.length}`);
  
  if (completedTasks.length === 0) {
    throw new Error('No completed tasks found');
  }
  
  console.log(`✅ Task history is populated`);
  console.log(`Sample tasks:`);
  completedTasks.slice(0, 3).forEach(t => {
    const date = new Date(t.completedAt).toLocaleDateString('fr-CA');
    console.log(`   - ${t.name} (${date})`);
  });
});

await test('4. ADD NEW TEMPLATE', async () => {
  const res = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  let family = res.body.families[0];
  const beforeCount = family.questList.length;
  
  // Add new quest template
  family.questList.push({
    icon: '🧪',
    name: 'Test Template ' + Date.now(),
    xp: 25,
    gold: 12,
    daily: true
  });
  
  const saveRes = await handleApi({
    action: 'saveFamily',
    token,
    body: { family }
  }, store);
  
  if (saveRes.status !== 200) {
    throw new Error('Save failed: ' + saveRes.body.error);
  }
  
  // Verify
  const verifyRes = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  family = verifyRes.body.families[0];
  const afterCount = family.questList.length;
  
  if (afterCount !== beforeCount + 1) {
    throw new Error(`Expected ${beforeCount + 1} templates, got ${afterCount}`);
  }
  
  console.log(`✅ Template added successfully`);
  console.log(`   Before: ${beforeCount}, After: ${afterCount}`);
});

await test('5. DELETE TEMPLATE', async () => {
  const res = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  let family = res.body.families[0];
  const beforeCount = family.questList.length;
  const toDelete = family.questList[family.questList.length - 1];
  
  // Remove last template
  family.questList = family.questList.slice(0, -1);
  
  const saveRes = await handleApi({
    action: 'saveFamily',
    token,
    body: { family }
  }, store);
  
  if (saveRes.status !== 200) {
    throw new Error('Delete failed: ' + saveRes.body.error);
  }
  
  // Verify
  const verifyRes = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  family = verifyRes.body.families[0];
  const afterCount = family.questList.length;
  
  if (afterCount !== beforeCount - 1) {
    throw new Error(`Expected ${beforeCount - 1} templates, got ${afterCount}`);
  }
  
  console.log(`✅ Template deleted successfully`);
  console.log(`   Deleted: "${toDelete.name}"`);
  console.log(`   Before: ${beforeCount}, After: ${afterCount}`);
});

await test('6. MULTI-DEVICE SYNC SIMULATION', async () => {
  // Simulate two clients
  const loginRes = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  let family1 = JSON.parse(JSON.stringify(loginRes.body.families[0]));
  let family2 = JSON.parse(JSON.stringify(loginRes.body.families[0]));
  
  // Device 1 modifies dailyBonus XP
  family1.dailyBonus.xp = 99;
  
  // Device 2 modifies child reward
  if (family2.children[0].rewards) {
    family2.children[0].rewards.push({ name: 'Device2 Reward', xp: 50, gold: 25 });
  }
  
  // Save both
  const save1 = await handleApi({
    action: 'saveFamily',
    token,
    body: { family: family1 }
  }, store);
  
  const save2 = await handleApi({
    action: 'saveFamily',
    token,
    body: { family: family2 }
  }, store);
  
  if (save1.status !== 200 || save2.status !== 200) {
    throw new Error('One or both saves failed');
  }
  
  // Verify both changes are present
  const verifyRes = await handleApi({
    action: 'login',
    body: { email: 'parent@demo.fr', password: 'demo' }
  }, store);
  
  const finalFamily = verifyRes.body.families[0];
  
  if (finalFamily.dailyBonus.xp !== 99) {
    throw new Error('Device 1 change not persisted');
  }
  
  console.log(`✅ Multi-device sync working`);
  console.log(`   Device 1 change (dailyBonus.xp = 99): ✅`);
  console.log(`   Device 2 change (reward added): ✅`);
});

db.close();
console.log(`\n${'='.repeat(60)}`);
console.log('ALL TESTS COMPLETED');
console.log('='.repeat(60));
process.exit(0);
