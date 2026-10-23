// Fonction Netlify (Functions v2) — expose l'API sur /api via Netlify Blobs
import { getStore } from '@netlify/blobs';
import { handleApi, setEmailSender } from './_core.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Adapte Netlify Blobs à l'interface { get, set, del, list } attendue par le cœur
async function blobsStore() {
  const store = getStore('tache-enfant');

  return {
    get: async (k) => {
      try {
        const data = await store.get(k);
        return data ? JSON.parse(data.toString()) : null;
      } catch (e) {
        if (e.message?.includes('not found')) return null;
        throw e;
      }
    },
    set: async (k, v) => {
      await store.set(k, JSON.stringify(v ?? null));
    },
    del: async (k) => {
      try {
        await store.delete(k);
      } catch (e) {
        if (!e.message?.includes('not found')) throw e;
      }
    },
    list: async () => {
      const result = await store.list();
      // Handle different response formats
      if (Array.isArray(result)) {
        return result.map(item => item.key || item.path || item.name);
      } else if (result?.blobs && Array.isArray(result.blobs)) {
        return result.blobs.map(item => item.key || item.path || item.name);
      } else if (result && typeof result === 'object') {
        return Object.keys(result).filter(k => !k.startsWith('_'));
      }
      return [];
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
    const store = await blobsStore();
    const r = await handleApi({ action, token, body }, store);
    return json(r.status, r.body);
  } catch (e) {
    return json(500, { error: 'Erreur serveur : ' + (e && e.message || e) });
  }
};

export const config = { path: '/api' };
