// Serveur de dev local — sert les fichiers statiques et l'API /api,
// utilise SQLite comme store. Reproduit netlify/functions/api.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { handleApi, setEmailSender } from './netlify/functions/_core.mjs';
import { createDatabaseAdapter } from './database.js';

// Load .env file if present
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=').map(s => s.trim());
    if (key && val) process.env[key] = val;
  });
} catch {};

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC = path.join(DIR, 'public');
const PORT = process.env.PORT || 8123;

// Initialize SQLite database
let db = null;
function initDatabase() {
  if (db) return;
  try {
    const dbPath = path.join(DIR, '.data', 'dev-local.db');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log('[DB] SQLite database initialized at', dbPath);
  } catch (e) {
    console.error('[DB-INIT] Error:', e.message);
    throw e;
  }
}

// Local store - same interface as netlify/functions/api.mjs
let store = null;
function getStore() {
  if (!store) {
    initDatabase();
    store = createDatabaseAdapter(db, false);
  }
  return store;
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

// email sender: utilise Brevo si BREVO_API_KEY, sinon loggue simplement
async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`📧 Email à ${to}:\n   Sujet: ${subject}\n   ${body.substring(0, 60)}...`);
    return;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'DailyKids Quest IV', email: 'dailykidsquest@gmail.com' },
        to: [{ email: to }],
        subject,
        htmlContent: `<p>${body.replace(/\n/g, '<br>')}</p>`
      }),
    });
    if (!res.ok) console.error('Erreur Brevo:', await res.text());
    else console.log(`✅ Email envoyé à ${to}: "${subject}" (Brevo)`);
  } catch (e) {
    console.error('Erreur envoi email:', e.message);
  }
}
setEmailSender(sendEmail);

const server = http.createServer(async (req, res) => {
  if (req.url === '/api' && req.method === 'POST') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let payload = {};
      try { payload = JSON.parse(raw || '{}'); } catch {}
      console.log(`[SERVER] Received action: ${payload.action}, has family: ${!!payload.family}, children count: ${payload.family?.children?.length || 0}`);
      if (payload.action === 'saveFamily') {
        const lucas = payload.family?.children?.find(c => c.name === 'Lucas');
        console.log(`[SERVER-RECV] saveFamily: Lucas=${lucas ? 'found' : 'NOT FOUND'}, children=${payload.family?.children?.length || 0}`);
        if (lucas) console.log(`[SERVER-RECV] Lucas tasks:`, lucas.tasks?.map(t => ({ name: t.name, done: t.done, completedAt: t.completedAt })));
      }
      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const { action, ...bodyData } = payload;
      const body = bodyData;
      try {
        const store = getStore();
        const r = await handleApi({ action, token, body }, store);
        res.writeHead(r.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(r.body));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Erreur serveur : ' + (e && e.message || e) }));
      }
    });
    return;
  }

  // Serve node_modules
  if (req.url.startsWith('/node_modules/')) {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(DIR, path.normalize(rel));
    if (!file.startsWith(path.join(DIR, 'node_modules'))) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (e, data) => {
      if (e) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }

  // statique
  const rel = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(STATIC, path.normalize(rel));
  if (!file.startsWith(STATIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(PORT, () => console.log(`tache-enfant dev sur http://localhost:${PORT}`));
