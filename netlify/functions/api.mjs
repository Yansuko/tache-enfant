// Fonction Netlify (Functions v2) — expose l'API sur /api via Netlify Blobs.
import { getStore } from '@netlify/blobs';
import { handleApi } from './_core.mjs';

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
