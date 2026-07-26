// Fonction Netlify (Functions v2) — expose l'API sur /api via Netlify Blobs.
import { getStore } from '@netlify/blobs';
import { handleApi, setEmailSender } from './_core.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// adapte Netlify Blobs à l'interface { get, set, del } attendue par le cœur
function blobStore() {
  const s = getStore('tache-enfant');
  return {
    get: (k) => s.get(k, { type: 'json' }),
    set: (k, v) => s.setJSON(k, v),
    del: (k) => s.delete(k),
  };
}

// envoie un email via Resend (clé API dans RESEND_API_KEY)
async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.log('RESEND_API_KEY non définie, email non envoyé:', { to, subject }); return; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'noreply@dailykidsquest.com', to, subject, html: `<p>${body.replace(/\n/g, '<br>')}</p>` }),
    });
    if (!res.ok) console.error('Erreur Resend:', await res.text());
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
    const r = await handleApi({ action, token, body }, blobStore());
    return json(r.status, r.body);
  } catch (e) {
    return json(500, { error: 'Erreur serveur : ' + (e && e.message || e) });
  }
};

export const config = { path: '/api' };
