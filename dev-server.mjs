// Serveur de dev local — sert les fichiers statiques de tache-enfant/ et l'API /api,
// avec un store persistant sur fichier (.data/store.json). Zéro dépendance.
// Reproduit le contrat de la fonction Netlify (même cœur _core.mjs), pour développer
// sans `netlify dev`. En prod c'est netlify/functions/api.mjs (Blobs) qui répond.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, setEmailSender } from './netlify/functions/_core.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC = path.join(DIR, 'tache-enfant');
const DATA = path.join(DIR, '.data', 'store.json');
const PORT = process.env.PORT || 8123;

// store fichier : une map { key: value } chargée en mémoire, réécrite à chaque set/del
fs.mkdirSync(path.dirname(DATA), { recursive: true });
let mem = {};
try { mem = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { mem = {}; }
const flush = () => fs.writeFileSync(DATA, JSON.stringify(mem));
const store = {
  get: async (k) => (k in mem ? structuredClone(mem[k]) : null),
  set: async (k, v) => { mem[k] = structuredClone(v); flush(); },
  del: async (k) => { delete mem[k]; flush(); },
};

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// stub pour envoyer des emails en local (juste loguer)
setEmailSender(async ({ to, subject, body }) => {
  console.log(`📧 Email à ${to}:\n   Sujet: ${subject}\n   ${body.substring(0, 60)}...`);
});

const server = http.createServer(async (req, res) => {
  if (req.url === '/api' && req.method === 'POST') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let payload = {};
      try { payload = JSON.parse(raw || '{}'); } catch {}
      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      const { action, ...body } = payload;
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
