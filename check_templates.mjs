import Database from 'better-sqlite3';
const db = new Database('./data/dailykids.db');

console.log('\n=== ALL TEMPLATES ===');
const templates = db.prepare('SELECT * FROM templates').all();
templates.forEach(t => {
  console.log(`ID: ${t.id}, Name: ${t.name}, FamilyId: ${t.familyId}`);
});

console.log(`\nTotal templates: ${templates.length}`);

// Check for duplicates
console.log('\n=== TEMPLATE COUNTS BY NAME ===');
const templatesByName = {};
templates.forEach(t => {
  if (!templatesByName[t.name]) templatesByName[t.name] = 0;
  templatesByName[t.name]++;
});

Object.entries(templatesByName).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
  const status = count === 1 ? '✅' : '❌';
  console.log(`${status} "${name}": ${count} occurrences`);
});

db.close();
