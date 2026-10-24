// Seeds the demo account (parent@demo.fr / demo) through the API instead of raw SQL.
// handleApi() runs ensureSeed() on every call (no-op once the `seeded` key exists), so one login seeds and verifies.
// Usage: DATABASE_URL=postgresql://dailykids:dailykids@localhost:5432/dailykids node seed-demo-only.mjs
import pg from 'pg';
import Database from 'better-sqlite3';
import { handleApi } from './src/core.mjs';
import { createDatabaseAdapter } from './database.js';

const url = process.env.DATABASE_URL || 'sqlite://./data/dailykids.db';
const isPg = url.startsWith('postgresql');
const db = isPg ? new pg.Pool({ connectionString: url }) : new Database(url.replace('sqlite://', ''));
const store = createDatabaseAdapter(db, isPg);

const r = await handleApi({ action: 'login', body: { email: 'parent@demo.fr', password: 'demo' } }, store);
if (isPg) await db.end(); else db.close();
if (r.status && r.status !== 200) {
  console.error('Demo seed failed:', r.body);
  process.exit(1);
}
console.log('Demo account ready: parent@demo.fr / demo');
// Firebase admin keeps the event loop alive when configured
process.exit(0);
