// Cœur de l'API — logique pure partagée entre la fonction Netlify (Blobs) et le
// serveur de dev local (fichier). Aucune dépendance Netlify ici : tout passe par
// une interface `store` minimale { get(key), set(key,val), del(key) } (valeurs JSON).
import crypto from 'node:crypto';

/* ── crypto : vrais hachages de mot de passe (scrypt) + jetons signés (HMAC) ── */

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return { salt, hash };
}
export function checkPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}
export function signToken(email, secret, ttlMs = 1000 * 60 * 60 * 24 * 30) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}
export function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!sig || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() ? email : null;
  } catch { return null; }
}

// ponytail: secret auto-généré et stocké dans le store si absent — zéro config sur Netlify. Course possible au tout premier boot (double génération), négligeable.
async function getSecret(store) {
  let s = await store.get('secret');
  if (!s) { s = { key: crypto.randomBytes(32).toString('hex') }; await store.set('secret', s); }
  return s.key;
}

/* ── modèles ── */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const err = (status, error) => ({ status, body: { error } });

export function newFamily(name, owner) {
  return {
    id: 'fam-' + crypto.randomBytes(5).toString('hex'), name, owner, members: [owner],
    day: '', dailyBonus: { xp: 30, gold: 15 },
    questList: [], proposals: [], children: [], sanctionsList: [], rewards: [], requests: [],
  };
}

function seedFamily() {
  return {
    id: 'fam-demo', name: 'Famille Démo', owner: 'parent@demo.fr', members: ['parent@demo.fr'],
    day: '', dailyBonus: { xp: 30, gold: 15 },
    questList: [
      { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, daily: true },
      { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, daily: true },
      { icon: '🛏️', name: 'Faire son lit', xp: 10, gold: 5, daily: true },
    ],
    proposals: [],
    children: [
      { name: 'Emma', xp: 230, gold: 128,
        tasks: [
          { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true },
          { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: false, daily: true },
          { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: false },
          { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true },
        ],
        grades: [
          { subject: 'Mathématiques', grade: '16/20', xp: 50, gold: 10 },
          { subject: 'Français', grade: '13/20', xp: 30, gold: 5 },
          { subject: 'Histoire-Géo', grade: '', xp: 0, gold: 0 },
          { subject: 'Anglais', grade: '', xp: 0, gold: 0 },
        ],
        sanctions: [{ motif: 'Croix de conduite', gold: 10 }],
      },
      { name: 'Lucas', xp: 90, gold: 64,
        tasks: [
          { icon: '🛏️', name: 'Faire son lit', xp: 10, gold: 5, done: false, daily: true },
          { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: false, daily: true },
        ],
        grades: [
          { subject: 'Mathématiques', grade: '', xp: 0, gold: 0 },
          { subject: 'Français', grade: '', xp: 0, gold: 0 },
        ],
        sanctions: [],
      },
    ],
    sanctionsList: [
      { name: 'Croix de conduite', gold: 10 },
      { name: 'Devoirs non faits', gold: 5 },
    ],
    rewards: [
      { icon: '🎮', name: '30 min de jeu vidéo', cost: 50, lvl: 1 },
      { icon: '🍿', name: 'Soirée film + popcorn', cost: 80, lvl: 2 },
      { icon: '💶', name: "5€ d'argent de poche", cost: 150, lvl: 3 },
    ],
    requests: [
      { child: 'Emma', icon: '🎬', name: 'Sortie cinéma', cost: 40, status: 'approved' },
      { child: 'Emma', icon: '🎮', name: "Temps d'écran", cost: 50, status: 'pending' },
    ],
  };
}

// crée le compte démo (parent@demo.fr / demo) + sa famille au tout premier appel
async function ensureSeed(store) {
  if (await store.get('seeded')) return;
  const fam = seedFamily();
  const { salt, hash } = hashPassword('demo');
  await store.set('family:' + fam.id, fam);
  await store.set('account:parent@demo.fr', { email: 'parent@demo.fr', name: 'Parent démo', salt, hash, familyIds: [fam.id] });
  await updateFamilyNameIndex(store, fam.name, fam.id);
  await store.set('seeded', { at: Date.now() });
}

/* ── lecture d'état ── */

async function withNames(store, fam) {
  const memberInfo = {};
  for (const m of fam.members) { const a = await store.get('account:' + m); memberInfo[m] = a ? a.name : null; }
  return { ...fam, memberInfo };
}
async function stateFor(store, email) {
  const acc = await store.get('account:' + email);
  if (!acc) return { me: null, families: [] };
  const families = [];
  for (const id of acc.familyIds) { const f = await store.get('family:' + id); if (f) families.push(await withNames(store, f)); }
  return { me: { email: acc.email, name: acc.name }, families };
}

/* ── actions ── */

async function signup(store, secret, b) {
  const email = String(b.email || '').toLowerCase(), password = b.password, name = (b.name || '').trim(), familyName = (b.familyName || '').trim();
  if (!email || !password || !name || !familyName) return err(400, 'Tous les champs sont requis.');
  if (!EMAIL_RE.test(email)) return err(400, 'Email invalide.');
  if (String(password).length < 4) return err(400, 'Mot de passe trop court (4 caractères min).');
  if (await store.get('account:' + email)) return err(409, 'Un compte existe déjà avec cet email.');
  const fam = newFamily(familyName, email);
  const pending = (await store.get('invite:' + email)) || [];
  await store.set('family:' + fam.id, fam);
  await updateFamilyNameIndex(store, fam.name, fam.id);
  await store.set('account:' + email, { email, name, ...hashPassword(password), familyIds: [fam.id, ...pending] });
  if (pending.length) await store.del('invite:' + email);
  return { status: 200, body: { token: signToken(email, secret), ...(await stateFor(store, email)) } };
}
async function login(store, secret, b) {
  const email = String(b.email || '').toLowerCase();
  const acc = await store.get('account:' + email);
  if (!acc || !checkPassword(b.password, acc.salt, acc.hash)) return err(401, 'Email ou mot de passe incorrect.');
  return { status: 200, body: { token: signToken(email, secret), ...(await stateFor(store, email)) } };
}
async function saveFamily(store, email, b) {
  const inc = b.family;
  if (!inc || !inc.id) return err(400, 'Famille invalide.');
  const cur = await store.get('family:' + inc.id);
  if (!cur) return err(404, 'Famille introuvable.');
  if (!cur.members.includes(email)) return err(403, 'Accès refusé.');
  // owner / members / id restent maîtrisés par le serveur : un membre ne peut pas s'auto-promouvoir
  const merged = { ...inc, id: cur.id, owner: cur.owner, members: cur.members };
  delete merged.memberInfo; delete merged.role; delete merged.tab; delete merged.activeChild;
  await store.set('family:' + inc.id, merged);
  return { status: 200, body: { ok: true } };
}
async function createFamily(store, email, b) {
  const name = (b.name || '').trim();
  if (!name) return err(400, 'Nom de la famille requis.');
  const fam = newFamily(name, email);
  await store.set('family:' + fam.id, fam);
  await updateFamilyNameIndex(store, fam.name, fam.id);
  const acc = await store.get('account:' + email);
  acc.familyIds.push(fam.id);
  await store.set('account:' + email, acc);
  return { status: 200, body: { family: await withNames(store, fam) } };
}
async function invite(store, email, b) {
  const fid = b.familyId, inv = String(b.email || '').toLowerCase();
  if (!EMAIL_RE.test(inv)) return err(400, 'Email invalide.');
  const fam = await store.get('family:' + fid);
  if (!fam) return err(404, 'Famille introuvable.');
  if (fam.owner !== email) return err(403, 'Seul le propriétaire peut inviter.');
  if (fam.members.includes(inv)) return err(409, 'Cet adulte a déjà accès.');
  fam.members.push(inv);
  await store.set('family:' + fid, fam);
  const acc = await store.get('account:' + inv);
  if (acc) { if (!acc.familyIds.includes(fid)) { acc.familyIds.push(fid); await store.set('account:' + inv, acc); } }
  else { const p = (await store.get('invite:' + inv)) || []; if (!p.includes(fid)) { p.push(fid); await store.set('invite:' + inv, p); } }
  return { status: 200, body: { family: await withNames(store, fam) } };
}
async function removeAdult(store, email, b) {
  const fid = b.familyId, rem = String(b.email || '').toLowerCase();
  const fam = await store.get('family:' + fid);
  if (!fam) return err(404, 'Famille introuvable.');
  if (fam.owner !== email) return err(403, 'Seul le propriétaire peut retirer un adulte.');
  if (rem === fam.owner) return err(400, 'Impossible de retirer le propriétaire.');
  fam.members = fam.members.filter(m => m !== rem);
  await store.set('family:' + fid, fam);
  const acc = await store.get('account:' + rem);
  if (acc) { acc.familyIds = acc.familyIds.filter(x => x !== fid); await store.set('account:' + rem, acc); }
  const p = await store.get('invite:' + rem);
  if (p) await store.set('invite:' + rem, p.filter(x => x !== fid));
  return { status: 200, body: { family: await withNames(store, fam) } };
}

async function updateFamilyNameIndex(store, name, familyId) {
  const idx = (await store.get('family-names-index')) || {};
  const key = name.toLowerCase();
  if (!idx[key]) idx[key] = [];
  if (!idx[key].includes(familyId)) idx[key].push(familyId);
  await store.set('family-names-index', idx);
}
async function unlockChildDirect(store, b) {
  const famname = (b.familyName || '').trim().toLowerCase();
  const childName = (b.childName || '').trim();
  const pin = String(b.pin || '').trim();
  if (!famname || !childName || !pin) return err(400, 'Tous les parametres requis.');
  const idx = (await store.get('family-names-index')) || {};
  const famIds = idx[famname] || [];
  for (const fid of famIds) {
    const fam = await store.get('family:' + fid);
    if (!fam) continue;
    const child = fam.children.find(c => c.name === childName);
    if (!child || !child.pin || child.pin !== pin) continue;
    return { status: 200, body: { families: [await withNames(store, fam)] } };
  }
  return err(401, 'Famille ou enfant introuvable, ou PIN incorrect.');
}
const PUBLIC = new Set(['login', 'signup', 'unlockChildDirect']);

// point d'entrée unique. payload = { action, token, body }
export async function handleApi({ action, token, body = {} }, store) {
  await ensureSeed(store);
  const secret = await getSecret(store);
  let email = null;
  if (!PUBLIC.has(action)) {
    email = verifyToken(token, secret);
    if (!email) return err(401, 'Non authentifié.');
  }
  switch (action) {
    case 'signup': return signup(store, secret, body);
    case 'login': return login(store, secret, body);
    case 'unlockChildDirect': return unlockChildDirect(store, body);
    case 'me': return { status: 200, body: await stateFor(store, email) };
    case 'verifyPassword': {
      const acc = await store.get('account:' + email);
      return { status: 200, body: { ok: !!(acc && checkPassword(body.password, acc.salt, acc.hash)) } };
    }
    case 'saveFamily': return saveFamily(store, email, body);
    case 'createFamily': return createFamily(store, email, body);
    case 'invite': return invite(store, email, body);
    case 'removeAdult': return removeAdult(store, email, body);
    default: return err(400, 'Action inconnue : ' + action);
  }
}
