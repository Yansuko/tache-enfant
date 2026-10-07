// Serveur de dev local — sert les fichiers statiques de tache-enfant/ et l'API /api,
// avec un store persistant sur fichier (.data/store.json). Zéro dépendance.
// Reproduit le contrat de la fonction Netlify (même cœur _core.mjs), pour développer
// sans `netlify dev`. En prod c'est netlify/functions/api.mjs (Blobs) qui répond.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, setEmailSender } from './netlify/functions/_core.mjs';

// Load .env file if present
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=').map(s => s.trim());
    if (key && val) process.env[key] = val;
  });
} catch {};

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC = path.join(DIR, 'tache-enfant');
const DATA = path.join(DIR, '.data', 'store.json');
const PORT = process.env.PORT || 8123;

// store fichier : une map { key: value } chargée en mémoire, réécrite à chaque set/del
fs.mkdirSync(path.dirname(DATA), { recursive: true });
let mem = {};
try { mem = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { mem = {}; }
const flush = () => {
  const data = JSON.stringify(mem);
  fs.writeFileSync(DATA, data);
  // Verify what was actually written
  const diskData = fs.readFileSync(DATA, 'utf8');
  if (data !== diskData) console.log('[FLUSH-ERROR] Disk data mismatch!');
};
const store = {
  get: async (k) => {
    const result = k in mem ? structuredClone(mem[k]) : null;
    if (k.startsWith('family:')) {
      const lucas = result?.children?.find(c => c.name === 'Lucas');
      const done = lucas?.tasks?.[0]?.done;
      console.log(`[STORE.GET] ${k} - Lucas first task done=${done}:`, JSON.stringify(lucas?.tasks?.[0]));
    }
    return result;
  },
  set: async (k, v) => {
    if (k.startsWith('family:')) {
      const lukas_input = v?.children?.find(c => c.name === 'Lucas');
      console.log(`[STORE.SET-INPUT] ${k} - Input Lucas done=${lukas_input?.tasks?.[0]?.done}:`, JSON.stringify(lukas_input?.tasks?.[0]));
    }
    mem[k] = structuredClone(v);
    if (k.startsWith('family:')) {
      const lucas_mem = mem[k]?.children?.find(c => c.name === 'Lucas');
      console.log(`[STORE.SET-MEM] ${k} - After clone, Lucas done=${lucas_mem?.tasks?.[0]?.done}:`, JSON.stringify(lucas_mem?.tasks?.[0]));
    }
    flush();
    if (k.startsWith('family:')) {
      // Read back from disk to verify
      const disk = JSON.parse(fs.readFileSync(DATA, 'utf8'));
      const lucas_disk = disk[k]?.children?.find(c => c.name === 'Lucas');
      console.log(`[STORE.SET-DISK] ${k} - After flush, Lucas done=${lucas_disk?.tasks?.[0]?.done}:`, JSON.stringify(lucas_disk?.tasks?.[0]));
    }
  },
  del: async (k) => { delete mem[k]; flush(); },
};

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

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
