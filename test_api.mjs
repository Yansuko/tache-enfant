import { handleApi } from './netlify/functions/_core.mjs';
import Database from 'better-sqlite3';
import { createDatabaseAdapter } from './database.js';

const db = new Database('./data/dailykids.db');
const store = createDatabaseAdapter(db, false);

console.log('\n=== TEST 1: Login ===');
const loginRes = await handleApi({
  action: 'login',
  body: { email: 'parent@demo.fr', password: 'demo' }
}, store);

if (loginRes.status !== 200) {
  console.error('Login failed:', loginRes.body);
  process.exit(1);
}

const { families } = loginRes.body;
console.log(`✅ Login successful. Families: ${families.length}`);

const family = families[0];
console.log(`\n=== TEST 2: Check QuestList (Templates) ===`);
console.log(`Family: ${family.name}`);
console.log(`Total items in questList: ${family.questList.length}`);

const templatesByName = {};
family.questList.forEach(q => {
  const name = q.name || 'unnamed';
  if (!templatesByName[name]) {
    templatesByName[name] = { count: 0, items: [] };
  }
  templatesByName[name].count++;
  templatesByName[name].items.push(q);
});

console.log(`\nTemplate counts:`);
Object.entries(templatesByName).sort((a, b) => b[1].count - a[1].count).forEach(([name, data]) => {
  const status = data.count === 1 ? '✅' : '❌';
  console.log(`${status} "${name}": ${data.count} occurrence(s)`);
  if (data.count > 1) {
    data.items.forEach((item, i) => {
      console.log(`   ${i+1}. ID=${item.id || 'none'}, XP=${item.xp}, Gold=${item.gold}`);
    });
  }
});

console.log(`\n=== TEST 3: Check Task History in Child ===`);
const child = family.children[0];
console.log(`Child: ${child.name}`);
const completedTasks = (child.tasks || []).filter(t => t && t.completedAt);
console.log(`Total completed tasks: ${completedTasks.length}`);
if (completedTasks.length > 0) {
  console.log(`✅ Task history available (${completedTasks.length} tasks)`);
  console.log(`First 3 tasks:`);
  completedTasks.slice(0, 3).forEach(t => {
    const date = new Date(t.completedAt).toLocaleDateString('fr-CA');
    console.log(`  - ${t.name} (${date})`);
  });
}

db.close();
process.exit(0);
