import Database from 'better-sqlite3';
const db = new Database('./data/dailykids.db');

console.log('\n=== TEMPLATES IN DATABASE ===');
const templates = db.prepare('SELECT id, name, familyId FROM templates').all();
const templatesByName = {};
templates.forEach(t => {
  if (!templatesByName[t.name]) templatesByName[t.name] = [];
  templatesByName[t.name].push(t);
});

Object.entries(templatesByName).forEach(([name, list]) => {
  console.log(`"${name}": ${list.length} occurrences`);
  if (list.length > 1) {
    list.forEach((t, i) => console.log(`  ${i+1}. ID=${t.id}, familyId=${t.familyId}`));
  }
});

console.log(`\nTotal unique template names: ${Object.keys(templatesByName).length}`);
console.log(`Total template records: ${templates.length}`);

console.log('\n=== FAMILIES IN DATABASE ===');
const families = db.prepare('SELECT id, email FROM families').all();
families.forEach(f => console.log(`${f.email}: ID=${f.id}`));

db.close();
