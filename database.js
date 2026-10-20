// database.js - Adapter between _core.mjs and SQL databases

export function createDatabaseAdapter(db, isPostgres = false) {
  return {
    // Get a value by key (maps to table + row lookup)
    get: async (key) => {
      const [table, id] = parseKey(key);
      
      if (isPostgres) {
        // PostgreSQL query
        const result = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
        return result.rows[0] || null;
      } else {
        // SQLite query
        const stmt = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
        return stmt.get(id) || null;
      }
    },

    // Set/update a value by key
    set: async (key, value) => {
      const [table, id] = parseKey(key);
      // Implementation depends on table schema
      // Will be expanded in Task 8
    },

    // Delete a value by key
    del: async (key) => {
      const [table, id] = parseKey(key);
      if (isPostgres) {
        await db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      } else {
        const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
        stmt.run(id);
      }
    },

    // List all keys (for admin/debugging)
    list: async () => {
      const tables = ['families', 'children', 'tasks', 'grades', 'users'];
      const keys = [];
      for (const table of tables) {
        if (isPostgres) {
          const result = await db.query(`SELECT id FROM ${table}`);
          keys.push(...result.rows.map(r => `${table}:${r.id}`));
        } else {
          const rows = db.prepare(`SELECT id FROM ${table}`).all();
          keys.push(...rows.map(r => `${table}:${r.id}`));
        }
      }
      return keys;
    }
  };
}

function parseKey(key) {
  // Parse keys like "family:fam-demo" → ["families", "fam-demo"]
  const [type, id] = key.split(':');
  const tableMap = {
    'family': 'families',
    'user': 'users',
    'child': 'children',
    'task': 'tasks',
    'grade': 'grades'
  };
  return [tableMap[type] || type, id];
}
