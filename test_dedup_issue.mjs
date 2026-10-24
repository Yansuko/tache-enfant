import { handleApi } from './netlify/functions/_core.mjs';
import Database from 'better-sqlite3';
import { createDatabaseAdapter } from './database.js';

const db = new Database('./data/dailykids.db');
const store = createDatabaseAdapter(db, false);

// Fresh login to see current state
const res = await handleApi({
  action: 'login',
  body: { email: 'parent@demo.fr', password: 'demo' }
}, store);

const family = res.body.families[0];
const questList = family.questList || [];

console.log(`\n=== CURRENT QUESTLIST STATE ===`);
console.log(`Total items: ${questList.length}`);
questList.forEach((q, i) => {
  console.log(`${i+1}. ID: ${q.id}, Name: "${q.name}", XP: ${q.xp}, Gold: ${q.gold}`);
});

// Check for duplicates by name
const byName = {};
questList.forEach(q => {
  const name = q.name;
  if (!byName[name]) byName[name] = [];
  byName[name].push(q);
});

console.log(`\n=== DUPLICATE ANALYSIS ===`);
Object.entries(byName).forEach(([name, items]) => {
  if (items.length > 1) {
    console.log(`\n❌ DUPLICATE: "${name}" appears ${items.length} times`);
    items.forEach((item, i) => {
      console.log(`   ${i+1}. ID: ${item.id}, XP: ${item.xp}, Gold: ${item.gold}`);
    });
  }
});

const uniqueCount = Object.keys(byName).length;
console.log(`\n=== SUMMARY ===`);
console.log(`Unique template names: ${uniqueCount}`);
console.log(`Total items in list: ${questList.length}`);
console.log(`Duplicates: ${questList.length - uniqueCount}`);

db.close();
process.exit(0);
