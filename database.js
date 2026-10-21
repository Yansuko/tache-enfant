// database.js - Key/value store for _core.mjs on top of the `metadata` table (PostgreSQL or SQLite).
// _core.mjs stores whole JSON documents under keys like "account:<email>", "family:<id>", "secret",
// so it needs a JSON KV store, not a row-per-entity mapping.
// ponytail: relational tables (users, families, ...) are not read by the API yet; map them here if/when the core moves off JSON documents.

export function createDatabaseAdapter(db, isPostgres = false) {
  if (isPostgres) {
    const ready = db.query(
      'CREATE TABLE IF NOT EXISTS metadata (key VARCHAR(255) PRIMARY KEY, value JSONB, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
    );
    return {
      get: async (key) => {
        await ready;
        const { rows } = await db.query('SELECT value FROM metadata WHERE key = $1', [key]);
        return rows[0]?.value ?? null;
      },
      set: async (key, value) => {
        await ready;
        await db.query(
          `INSERT INTO metadata (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [key, JSON.stringify(value ?? null)]
        );
      },
      del: async (key) => {
        await ready;
        await db.query('DELETE FROM metadata WHERE key = $1', [key]);
      },
      list: async () => {
        await ready;
        const { rows } = await db.query('SELECT key FROM metadata');
        return rows.map(r => r.key);
      }
    };
  }

  db.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  const getStmt = db.prepare('SELECT value FROM metadata WHERE key = ?');
  const setStmt = db.prepare(
    `INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  );
  const delStmt = db.prepare('DELETE FROM metadata WHERE key = ?');
  const listStmt = db.prepare('SELECT key FROM metadata');
  return {
    get: async (key) => {
      const row = getStmt.get(key);
      return row ? JSON.parse(row.value) : null;
    },
    set: async (key, value) => { setStmt.run(key, JSON.stringify(value ?? null)); },
    del: async (key) => { delStmt.run(key); },
    list: async () => listStmt.all().map(r => r.key)
  };
}
