import express from 'express';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import { handleApi } from './netlify/functions/_core.mjs';
import { createDatabaseAdapter } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============ Logging ============
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// ============ CORS ============
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') res.sendStatus(200);
  else next();
});

// ============ Middleware ============
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ Database initialization ============
let db = null;
let store = null;

async function initializeDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (dbUrl?.startsWith('postgresql')) {
    // PostgreSQL
    db = new Pool({ connectionString: dbUrl });
    console.log('[DB] PostgreSQL pool initialized');
  } else {
    // SQLite (default)
    const dbPath = dbUrl?.replace('sqlite://', '') || './data/dailykids.db';
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log('[DB] SQLite database initialized at', dbPath);
  }
  store = createDatabaseAdapter(db, db instanceof Pool);
}

// ============ Health check endpoint ============
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============ API endpoint ============
// handleApi (_core.mjs) verifies the Bearer token for every non-public action (401 'Non authentifié.')
// and returns a signed token in the body of login/signup — same HMAC scheme as auth.js, secret kept in the store.
app.post('/api', async (req, res) => {
  const { action, ...body } = req.body || {};
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  try {
    const r = await handleApi({ action, token, body }, store);
    res.status(r.status || 200).json(r.body);
  } catch (error) {
    console.error('[API-ERROR]', { action, error: error.message });
    res.status(500).json({ error: 'Erreur serveur : ' + error.message });
  }
});

// ============ Fallback to SPA ============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ Error handler ============
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

// ============ Server startup ============
async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`[SERVER] DailyKids Quest running on http://localhost:${PORT}`);
      console.log(`[SERVER] Node ${process.version}, ${NODE_ENV} mode`);
    });
  } catch (error) {
    console.error('[STARTUP] Fatal error:', error);
    process.exit(1);
  }
}

start();

export { app, db };
