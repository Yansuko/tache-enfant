import fs from 'fs';
import crypto from 'crypto';

const firebaseExport = JSON.parse(fs.readFileSync('firebase-export.json', 'utf-8'));
const sql = [];

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'number') return str.toString();
  if (typeof str === 'boolean') return str ? 'TRUE' : 'FALSE';
  return "'" + str.toString().replace(/'/g, "''") + "'";
}

// Process users
const usersMap = {}; // email → UUID
Object.entries(firebaseExport.users || {}).forEach(([key, user]) => {
  const userId = crypto.randomUUID();
  usersMap[user.email] = userId;
  
  sql.push(`INSERT INTO users (id, email, name, password_salt, password_hash, created_at) 
VALUES (${escapeSql(userId)}, ${escapeSql(user.email)}, ${escapeSql(user.name || '')}, 
${escapeSql(user.salt)}, ${escapeSql(user.hash)}, NOW());`);
});

// Process families and children
Object.entries(firebaseExport.families || {}).forEach(([familyId, family]) => {
  const ownerId = usersMap[family.owner] || usersMap[Object.keys(usersMap)[0]];
  
  sql.push(`INSERT INTO families (id, owner_id, name, daily_bonus_xp, daily_bonus_gold, created_at)
VALUES (${escapeSql(familyId)}, ${escapeSql(ownerId)}, ${escapeSql(family.name)}, 
${family.dailyBonus?.xp || 30}, ${family.dailyBonus?.gold || 15}, NOW());`);

  // Process children
  Object.values(family.children || {}).forEach((child) => {
    sql.push(`INSERT INTO children (id, family_id, name, xp, gold, pin, created_at)
VALUES (${escapeSql(child.id)}, ${escapeSql(familyId)}, ${escapeSql(child.name)}, 
${child.xp || 0}, ${child.gold || 0}, ${escapeSql(child.pin || '0000')}, NOW());`);

    // Process tasks
    Object.values(child.tasks || {}).forEach((task) => {
      const completedAt = task.completedAt ? `'${new Date(task.completedAt).toISOString()}'` : 'NULL';
      sql.push(`INSERT INTO tasks (id, child_id, family_id, icon, name, xp, gold, done, daily, completed_at, created_at)
VALUES (${escapeSql('task-' + generateId())}, ${escapeSql(child.id)}, ${escapeSql(familyId)}, 
${escapeSql(task.icon || '')}, ${escapeSql(task.name)}, ${task.xp || 0}, ${task.gold || 0}, 
${task.done ? 'TRUE' : 'FALSE'}, ${task.daily ? 'TRUE' : 'FALSE'}, ${completedAt}, NOW());`);
    });

    // Process grades
    Object.values(child.grades || {}).forEach((grade) => {
      sql.push(`INSERT INTO grades (id, child_id, family_id, subject, grade, xp, gold, created_at)
VALUES (${escapeSql('grade-' + generateId())}, ${escapeSql(child.id)}, ${escapeSql(familyId)}, 
${escapeSql(grade.subject)}, ${escapeSql(grade.grade || '')}, ${grade.xp || 0}, ${grade.gold || 0}, NOW());`);
    });
  });

  // Process rewards
  Object.values(family.rewards || {}).forEach((reward) => {
    sql.push(`INSERT INTO rewards (id, family_id, icon, name, cost, lvl)
VALUES (${escapeSql('reward-' + generateId())}, ${escapeSql(familyId)}, 
${escapeSql(reward.icon || '')}, ${escapeSql(reward.name)}, ${reward.cost}, ${reward.lvl || 1});`);
  });
});

// Write migration SQL
fs.writeFileSync('migration.sql', sql.join('\n'));
console.log('✅ Migration SQL generated: migration.sql');
console.log('   Statements:', sql.length);
