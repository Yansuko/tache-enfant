import Database from 'better-sqlite3';
const db = new Database('./data/dailykids.db');

console.log('=== DATABASE TABLES ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(`- ${t.name}`));

if (tables.length > 0) {
  console.log('\n=== FAMILIES TABLE ===');
  try {
    const families = db.prepare('SELECT * FROM families LIMIT 5').all();
    console.log(JSON.stringify(families, null, 2));
  } catch(e) {
    console.log('No families table or error:', e.message);
  }
}

db.close();
