import express from 'express';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';

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
}

// ============ Health check endpoint ============
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============ API endpoint stub (will be implemented in Task 8) ============
app.post('/api', async (req, res) => {
  res.status(501).json({ error: 'API not yet implemented' });
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
