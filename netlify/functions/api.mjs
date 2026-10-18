// Fonction Netlify (Functions v2) — expose l'API sur /api via Firebase Realtime Database
import admin from 'firebase-admin';
import { handleApi, setEmailSender } from './_core.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let db = null;

function initFirebase() {
  if (db) return;
  try {
    let serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (!serviceAccount.project_id) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    db = admin.database();
  } catch (e) {
    console.error('[FIREBASE-INIT] Error:', e.message);
    throw e;
  }
}

// adapte Firebase à l'interface { get, set, del, list } attendue par le cœur
function firebaseStore() {
  initFirebase();

  const getPath = (key) => {
    // Map blob keys to Firebase paths
    if (key.startsWith('family:')) return `families/${key.replace('family:', '')}`;
    if (key.startsWith('account:')) return `users/email-${key.replace(/[^a-z0-9]/gi, '_')}`;
    if (key.startsWith('_')) return `_metadata/${key.substring(1)}`;
    return `_other/${key}`;
  };

  return {
    get: async (k) => {
      const path = getPath(k);
      const snap = await db.ref(path).once('value');
      return snap.val();
    },
    set: async (k, v) => {
      const path = getPath(k);
      await db.ref(path).set(v);
    },
    del: async (k) => {
      const path = getPath(k);
      await db.ref(path).remove();
    },
    list: async () => {
      const keys = [];

      // List all family keys
      const famsSnap = await db.ref('families').once('value');
      const families = famsSnap.val() || {};
      Object.keys(families).forEach(id => keys.push(`family:${id}`));

      // List users by email (get from users)
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val() || {};
      Object.values(users).forEach(u => {
        if (u.email) keys.push(`account:${u.email}`);
      });

      // List metadata
      const metaSnap = await db.ref('_metadata').once('value');
      const meta = metaSnap.val() || {};
      Object.keys(meta).forEach(k => keys.push(`_${k}`));

      return keys;
    },
  };
}

// envoie un email via Brevo (clé API dans BREVO_API_KEY)
async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) { console.log('BREVO_API_KEY non définie, email non envoyé:', { to, subject }); return; }
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
  } catch (e) {
    console.error('Erreur envoi email:', e.message);
  }
}

// configure l'envoyeur d'email
setEmailSender(sendEmail);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST uniquement.' });
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  let payload = {};
  try { payload = await req.json(); } catch { /* corps vide/invalide */ }
  const { action, ...body } = payload;
  try {
    const r = await handleApi({ action, token, body }, firebaseStore());
    return json(r.status, r.body);
  } catch (e) {
    return json(500, { error: 'Erreur serveur : ' + (e && e.message || e) });
  }
};

export const config = { path: '/api' };
