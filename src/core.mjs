// Cœur de l'API: logique pure, tout passe par le store clé/valeur passé en paramètre (SQLite ou PostgreSQL via database.js).
import crypto from 'node:crypto';
import webpush from 'web-push';

let emailSender = null;
export function setEmailSender(fn) { emailSender = fn; }
let resetCodes = {};

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
  if (!token || !token.includes('.')) {
    console.error('[VERIFY-TOKEN-DEBUG] Token missing or no dot separator');
    return null;
  }
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!sig) {
    console.error('[VERIFY-TOKEN-DEBUG] No signature in token');
    return null;
  }
  if (sig.length !== expect.length) {
    console.error('[VERIFY-TOKEN-DEBUG] Signature length mismatch - got', sig.length, 'expected', expect.length);
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    console.error('[VERIFY-TOKEN-DEBUG] Signature verification failed');
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const { email, exp } = decoded;
    if (!email) {
      console.error('[VERIFY-TOKEN-DEBUG] No email in token payload');
      return null;
    }
    if (!exp) {
      console.error('[VERIFY-TOKEN-DEBUG] No expiry in token payload');
      return null;
    }
    if (exp <= Date.now()) {
      console.error('[VERIFY-TOKEN-DEBUG] Token expired');
      return null;
    }
    return email;
  } catch(e) {
    console.error('[VERIFY-TOKEN-DEBUG] Failed to parse payload:', e.message);
    return null;
  }
}

// ponytail: secret auto-généré et stocké dans le store si absent. Course possible au tout premier boot (double génération), négligeable.
async function getSecret(store) {
  // Production: use JWT_SECRET env var if available (required for container consistency)
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  // Fallback: auto-generate and store (for dev only)
  let s = await store.get('secret');
  if (!s) { s = { key: crypto.randomBytes(32).toString('hex') }; await store.set('secret', s); }
  return s.key;
}

// Normalize family data: convert object-stored arrays (index-keyed objects from older data) to actual arrays
function normalizeFamilyData(f) {
  if (!f || typeof f !== 'object') return f;
  const arrayFields = ['children', 'questList', 'proposals', 'rewards', 'requests', 'gradeRequests', 'taskRequests', 'sanctionsList', 'actionLog'];

  for (const field of arrayFields) {
    if (f[field] && typeof f[field] === 'object' && !Array.isArray(f[field])) {
      const arr = Object.values(f[field]).filter(v => v !== null && v !== undefined);
      f[field] = arr;
    }
    if (!f[field] || !Array.isArray(f[field])) f[field] = [];

    // Deduplicate gradeRequests by ID
    if (field === 'gradeRequests' && f[field].length > 0) {
      const seen = new Set();
      f[field] = f[field].filter(g => {
        if (!g || !g.id) return true;
        if (seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
    }

    // Deduplicate children by ID (fix for children stored as object with both numeric and ID keys)
    if (field === 'children' && f[field].length > 0) {
      const seen = new Set();
      f[field] = f[field].filter(c => {
        if (!c || !c.id) return true;
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
    }

    // Doublons: par id pour toutes les collections; par contenu (nom|xp|or) seulement pour les modèles de quêtes
    // (anciennes données sans id). Deux demandes distinctes peuvent légitimement se ressembler: jamais de contenu pour elles.
    if (['questList', 'proposals', 'requests', 'taskRequests'].includes(field) && f[field].length > 0) {
      const seen = new Set();
      const seenByContent = new Set();
      const before = f[field].length;
      f[field] = f[field].filter(item => {
        if (!item) return false;
        if (item.id) {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
        }
        if (field === 'questList') {
          const contentKey = `${item.name}|${item.xp}|${item.gold}`;
          if (seenByContent.has(contentKey)) return false;
          seenByContent.add(contentKey);
        }
        return true;
      });
      if (before !== f[field].length) {
        console.log(`[DEDUP] ${field}: ${before} → ${f[field].length}`, f[field].map(x => ({ id: x?.id, name: x?.name })));
      }

      // Sanitize questList: remove task-specific fields that shouldn't be in templates
      // ponytail: quest templates should never carry done, completedAt, etc
      if (field === 'questList') {
        for (const item of f[field]) {
          if (item) {
            delete item.done;
            delete item.completedAt;
          }
        }
      }
    }
  }
  // Ensure each child has an array of tasks
  if (f.children && Array.isArray(f.children)) {
    for (const child of f.children) {
      if (child && typeof child === 'object') {
        if (child.tasks && typeof child.tasks === 'object' && !Array.isArray(child.tasks)) {
          child.tasks = Object.values(child.tasks).filter(v => v !== null && v !== undefined);
        }
        if (!child.tasks || !Array.isArray(child.tasks)) child.tasks = [];
      }
    }
  }
  return f;
}

/* ── JWT token verification ── */

async function verifyJWTToken(token, secret) {
  if (!token) return null;
  try {
    const email = verifyToken(token, secret);
    if (!email) {
      console.error('[VERIFY-TOKEN] FAILED: invalid token');
      throw new Error('Invalid token');
    }
    console.log('[VERIFY-TOKEN] SUCCESS: email=', email);
    return email;
  } catch (error) {
    console.error('[VERIFY-TOKEN] FAILED:', error.message);
    throw error;
  }
}

async function getUserEmail(request, store) {
  const authHeader = request.headers.get('authorization') || request.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) throw new Error('Missing authorization token');
  const secret = await getSecret(store);
  return await verifyJWTToken(token, secret);
}

/* ── modèles ── */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const err = (status, error) => ({ status, body: { error } });

export function newFamily(name, owner) {
  return {
    id: 'fam-' + crypto.randomBytes(5).toString('hex'), name, owner, members: [owner],
    day: '', dailyBonus: { xp: 30, gold: 15 },
    questList: [], proposals: [], children: [], sanctionsList: [], actionLog: [],
    rewards: [
      { icon: '📱', name: 'Temps écran +30min', cost: 50, lvl: 1 },
      { icon: '🎮', name: 'Session de jeu +1h', cost: 75, lvl: 2 },
      { icon: '🍕', name: 'Pizza au dîner', cost: 100, lvl: 2 },
      { icon: '🚴', name: 'Sortie à vélo', cost: 120, lvl: 3 },
      { icon: '🎬', name: 'Soirée cinéma en famille', cost: 150, lvl: 3 },
      { icon: '🎪', name: 'Sortie au parc d\'attraction', cost: 200, lvl: 4 },
    ],
    requests: [], gradeRequests: [], taskRequests: [],
  };
}

function seedFamily() {
  // Use function to generate fresh timestamps so demo tasks always appear in current week
  function demoTasks() {
    const now = Date.now();
    return [
      { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now },
      { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now },
      { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: now - 86400000 },
      { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 86400000 },
      { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 172800000 },
      { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now - 172800000 },
      { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 172800000 },
      { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 259200000 },
      { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: now - 259200000 },
      { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 345600000 },
      { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now - 345600000 },
      { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 345600000 },
      { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: now - 432000000 },
      { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: now - 518400000 },
      { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: now - 518400000 },
      { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: now - 604800000 },
    ];
  }

  return {
    id: 'fam-demo', name: 'Famille Démo', owner: 'parent@demo.fr', members: ['parent@demo.fr'],
    day: '', dailyBonus: { xp: 30, gold: 15 },
    questList: [
      { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, daily: true },
      { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, daily: true },
      { icon: '🛏️', name: 'Faire son lit', xp: 10, gold: 5, daily: true },
    ],
    proposals: [],
    gradeRequests: [],
    taskRequests: [],
    children: [
      { id: 'child-emma-demo', name: 'Emma', xp: 450, gold: 280,
        tasks: demoTasks(),
        grades: [
          { subject: 'Mathématiques', grade: '16/20', xp: 50, gold: 10 },
          { subject: 'Français', grade: '13/20', xp: 30, gold: 5 },
          { subject: 'Histoire-Géo', grade: '', xp: 0, gold: 0 },
          { subject: 'Anglais', grade: '', xp: 0, gold: 0 },
        ],
        sanctions: [{ motif: 'Croix de conduite', gold: 10 }],
      },
      { id: 'child-lucas-demo', name: 'Lucas', xp: 90, gold: 64,
        tasks: [
          { icon: '🛏️', name: 'Faire son lit', xp: 10, gold: 5, done: false, daily: true, completedAt: null },
          { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: false, daily: true, completedAt: null },
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
    actionLog: [],
  };
}

// crée le compte démo (parent@demo.fr / demo) + sa famille au tout premier appel
async function ensureSeed(store) {
  if (await store.get('seeded')) {
    // Already seeded, don't overwrite user changes
    return;
  }
  const fam = seedFamily();
  const { salt, hash } = hashPassword('demo');
  // Store: create demo family
  await store.set('family:' + fam.id, {
    id: fam.id,
    name: fam.name,
    owner: fam.owner,
    members: fam.members,
    children: fam.children,
    day: fam.day,
    dailyBonus: fam.dailyBonus,
    questList: fam.questList,
    proposals: fam.proposals,
    sanctionsList: fam.sanctionsList,
    rewards: fam.rewards,
    requests: fam.requests,
    gradeRequests: fam.gradeRequests,
    taskRequests: fam.taskRequests,
    actionLog: fam.actionLog,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  await store.set('account:parent@demo.fr', { email: 'parent@demo.fr', name: 'Parent démo', salt, hash, familyIds: [fam.id] });
  await updateFamilyNameIndex(store, fam.name, fam.id);
  // Index children by ID for fast lookup
  for (const child of fam.children) {
    if (child.id) {
      const idx = (await store.get('child-id-index')) || {};
      idx[child.id] = fam.id;
      await store.set('child-id-index', idx);
    }
  }
  await store.set('seeded', { at: Date.now() });
}

/* ── lecture d'état ── */

async function withNames(store, fam) {
  const memberInfo = {};
  for (const m of fam.members) { const a = await store.get('account:' + m); memberInfo[m] = a ? a.name : null; }
  return { ...fam, memberInfo };
}
// Limitation des tentatives (anti force brute): après AUTH_MAX_ATTEMPTS échecs (8 par défaut) sur un même identifiant
// (e-mail, famille+enfant), il est bloqué AUTH_LOCK_MS (15 min par défaut). Une réussite remet le compteur à zéro.
// Par identifiant et non par IP: derrière un reverse proxy toutes les IP se ressemblent.
const failures = new Map();
const maxAttempts = () => Number(process.env.AUTH_MAX_ATTEMPTS) || 8;
const lockMs = () => Number(process.env.AUTH_LOCK_MS) || 15 * 60 * 1000;
function lockedFor(key) {
  const f = failures.get(key);
  if (!f?.lockedUntil) return 0;
  if (Date.now() >= f.lockedUntil) { failures.delete(key); return 0; }
  return f.lockedUntil - Date.now();
}
function recordFailure(key) {
  if (failures.size > 10000) { for (const [k, f] of failures) if (!f.lockedUntil || Date.now() >= f.lockedUntil) failures.delete(k); if (failures.size > 10000) failures.clear(); }
  const f = failures.get(key) || { count: 0 };
  if (++f.count >= maxAttempts()) f.lockedUntil = Date.now() + lockMs();
  failures.set(key, f);
}
const clearFailures = key => failures.delete(key);
const tooMany = ms => err(429, `Trop de tentatives. Réessaie dans ${Math.max(1, Math.ceil(ms / 60000))} minute(s).`);

// Identité d'un jeton enfant: « Prénom@<idFamille>.enfant.local » (deux familles peuvent avoir une « Emma »).
const childEmail = (name, familyId) => `${name}@${familyId}.enfant.local`;
function parseChildEmail(email) {
  const m = /^(.+)@([^@]+)\.enfant\.local$/.exec(email || '');
  return m ? { name: m[1], familyId: m[2] } : null;
}
const isChildOf = (email, fam) => {
  const c = parseChildEmail(email);
  return !!c && c.familyId === fam?.id && !!fam.children?.some(x => x.name === c.name);
};

async function stateFor(store, email) {
  // Jeton enfant: uniquement la famille dont il est issu
  const child = parseChildEmail(email);
  if (child) {
    const f = await store.get('family:' + child.familyId);
    if (!f || !(Array.isArray(f.children) ? f.children : Object.values(f.children || {})).some(c => c?.name === child.name)) {
      return { me: { email, name: child.name }, families: [] };
    }
    if (!f.id) f.id = child.familyId;
    normalizeFamilyData(f);
    return { me: { email, name: child.name }, families: [await withNames(store, f)] };
  }

  // Parent account lookup
  const acc = await store.get('account:' + email);
  if (!acc) return { me: null, families: [] };
  const families = [];
  for (const id of acc.familyIds) {
    try {
      const f = await store.get('family:' + id);
      if (f) {
        // Ensure family ID is set correctly
        if (!f.id) f.id = id;
        console.log(`[STATEFOR-BEFORE-NORM] family ${id}: questList=${f.questList?.length || 0} items`, (f.questList || []).map(q => ({ id: q?.id, name: q?.name })));
        normalizeFamilyData(f);
        console.log(`[STATEFOR-AFTER-NORM] family ${id}: questList=${f.questList?.length || 0} items`, (f.questList || []).map(q => ({ id: q?.id, name: q?.name })));
        families.push(await withNames(store, f));
      }
    } catch (err) {
      // Skip if store error
    }
  }
  return { me: { email: acc.email, name: acc.name }, families };
}

/* ── actions ── */

async function signup(store, secret, b) {
  const email = String(b.email || '').toLowerCase(), password = b.password, name = (b.name || '').trim(), familyName = (b.familyName || '').trim();
  if (!email || !password || !name || !familyName) return err(400, 'Tous les champs sont requis.');
  if (!EMAIL_RE.test(email)) return err(400, 'Email invalide.');
  if (String(password).length < 4) return err(400, 'Mot de passe trop court (4 caractères min).');
  if (await store.get('account:' + email)) return err(409, 'Un compte existe déjà avec cet email.');

  // Create family in store
  const fam = newFamily(familyName, email);
  const pending = (await store.get('invite:' + email)) || [];
  await store.set('family:' + fam.id, {
    id: fam.id,
    name: fam.name,
    owner: fam.owner,
    members: fam.members,
    children: fam.children,
    day: fam.day,
    dailyBonus: fam.dailyBonus,
    questList: fam.questList,
    proposals: fam.proposals,
    sanctionsList: fam.sanctionsList,
    rewards: fam.rewards,
    requests: fam.requests,
    gradeRequests: fam.gradeRequests,
    taskRequests: fam.taskRequests,
    actionLog: fam.actionLog,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  await updateFamilyNameIndex(store, fam.name, fam.id);
  await store.set('account:' + email, { email, name, ...hashPassword(password), familyIds: [fam.id, ...pending] });
  if (pending.length) await store.del('invite:' + email);

  // Log activity
  await logActivity(store, 'signup', email, email, `Account created with family ${familyName}`);

  // Return token and user data
  const state = await stateFor(store, email);
  return {
    status: 200,
    body: {
      token: signToken(email, secret),
      ...state
    }
  };
}
async function login(store, secret, b) {
  const email = String(b.email || '').toLowerCase();
  const key = 'pw|' + email;
  if (lockedFor(key)) return tooMany(lockedFor(key));
  const acc = await store.get('account:' + email);
  const pwCheck = acc && checkPassword(b.password, acc.salt, acc.hash);
  if (!acc) console.log(`[LOGIN] Account not found for ${email}`);
  if (acc && !pwCheck) console.log(`[LOGIN] Password mismatch for ${email}`);
  if (!acc || !pwCheck) { recordFailure(key); return err(401, 'Email ou mot de passe incorrect.'); }
  clearFailures(key);

  // Log activity
  await logActivity(store, 'login', email, acc.name, 'Parent login');

  // Return using store
  return { status: 200, body: { token: signToken(email, secret), ...(await stateFor(store, email)) } };
}
async function resetPassword(store, secret, b) {
  // Nettoyer les codes expirés
  const now = Date.now();
  for (const [email, data] of Object.entries(resetCodes)) {
    if (data.expiresAt < now) delete resetCodes[email];
  }

  if (b.step === 1) {
    // Générer et envoyer code
    const email = String(b.email || '').toLowerCase();
    const inProduction = process.env.NODE_ENV === 'production';
    // En production le code ne part que par e-mail: sans service d'e-mail il n'existe aucun moyen sûr de le transmettre
    if (inProduction && !emailSender) return err(503, "L'envoi d'e-mails n'est pas configuré sur ce serveur. Demande à l'administrateur de réinitialiser ton mot de passe.");
    const reqKey = 'resetreq|' + email;
    if (lockedFor(reqKey)) return tooMany(lockedFor(reqKey));
    recordFailure(reqKey);                                   // au plus AUTH_MAX_ATTEMPTS demandes de code par période
    const acc = await store.get('account:' + email);
    if (!acc) return err(404, 'Email non trouvé.');
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    resetCodes[email] = { code, expiresAt: Date.now() + 15 * 60 * 1000 };
    const isDevMode = !inProduction;
    if (emailSender) await emailSender({
      to: email,
      subject: 'Code de réinitialisation - DailyKids Quest',
      body: `Ton code de réinitialisation: ${code}\nValide 15 minutes.`
    });
    // le code n'est renvoyé que hors production (développement, tests automatiques)
    const body = { message: 'Code envoyé' };
    if (isDevMode) body.devCode = code;
    return { status: 200, body };
  }

  if (b.step === 2) {
    // Valider code et changer password
    const email = String(b.email || '').toLowerCase();
    const data = resetCodes[email];
    const codeKey = 'reset|' + email;
    if (lockedFor(codeKey)) return tooMany(lockedFor(codeKey));
    if (!data) return err(400, 'Pas de demande en cours.');
    if (data.expiresAt < now) return err(400, 'Code expiré.');
    if (data.code !== String(b.code)) { recordFailure(codeKey); return err(400, 'Code incorrect.'); }
    clearFailures(codeKey);
    const acc = await store.get('account:' + email);
    if (!acc) return err(404, 'Compte non trouvé.');
    if (checkPassword(b.password, acc.salt, acc.hash)) return err(400, 'Nouveau password identique à l\'ancien.');
    const newPw = hashPassword(b.password);
    acc.salt = newPw.salt;
    acc.hash = newPw.hash;
    await store.set('account:' + email, acc);
    delete resetCodes[email];
    return { status: 200, body: { message: 'Password changé' } };
  }

  return err(400, 'Étape invalide.');
}
// Un achat de récompense = une request passée à 'approved'. On l'horodate côté serveur (approvedAt),
// c'est ce que lit getRewardStats. Appariement par enfant+nom, une ancienne approuvée par nouvelle :
// les achats déjà connus gardent leur date, un même achat répété est daté séparément.
// ponytail: pas d'INSERT SQL dans reward_purchases, le store est un KV JSON (SQLite/PG) sans
// tables families/children/rewards, les FK échoueraient. À brancher si le core passe en relationnel.
export function stampRewardPurchases(oldRequests, newRequests) {
  if (!Array.isArray(newRequests)) return;
  const pool = {}, byId = new Map();
  for (const r of Array.isArray(oldRequests) ? oldRequests : []) {
    if (r?.id != null) byId.set(r.id, r);
    else if (r?.status === 'approved') (pool[r.child + '\0' + r.name] ??= []).push(r);
  }
  for (const r of newRequests) {
    if (r?.status !== 'approved') continue;
    const old = r.id != null ? byId.get(r.id) : pool[r.child + '\0' + r.name]?.shift();
    if (r.approvedAt != null) continue;
    if (old?.status !== 'approved') r.approvedAt = Date.now();
    else if (old.approvedAt != null) r.approvedAt = old.approvedAt; // le client a perdu la date
  }
}
// A stale client only knows the requests it loaded: keep server records (by id) it didn't send,
// so a submission made meanwhile isn't erased. Id-less legacy records still follow the client.
// Ajouts concurrents: un élément présent sur le serveur mais absent de la copie d'un appareil n'est supprimé que si
// l'appareil le connaissait (ajouté avant sa dernière synchro, `addedAt` posé par le serveur). Sinon c'est un ajout
// fait entre-temps par un autre appareil et on le garde. Sans `updatedAt` (client ancien, API directe): suppression honorée.
function keepConcurrentAdds(cur, inc, basedAt, keyOf = x => x.id ?? `${x.name}|${x.cost ?? x.gold ?? x.xp}`) {
  const list = Array.isArray(inc) ? inc : [];
  if (!Array.isArray(cur) || !Number.isFinite(basedAt)) return list;
  const have = new Set(list.map(x => x && keyOf(x)));
  return [...list, ...cur.filter(x => x && !have.has(keyOf(x)) && Number(x.addedAt) > basedAt)];
}
const stampAdded = (list, now) => { for (const x of list || []) if (x && typeof x === 'object' && !x.addedAt) x.addedAt = now; return list; };

// Union par id, l'entrant gagne, sauf qu'un statut final (approuvé, refusé, annulé...) posé côté serveur ne
// repasse jamais en "pending" à cause d'une copie périmée d'un autre appareil.
function mergeById(cur, inc) {
  const list = Array.isArray(inc) ? inc : [];
  const curList = Array.isArray(cur) ? cur : [];
  const curById = new Map(curList.filter(r => r?.id != null).map(r => [r.id, r]));
  const settled = r => r.status && r.status !== 'pending';
  const merged = list.map(r => {
    const old = r?.id != null ? curById.get(r.id) : null;
    return old && settled(old) && r.status === 'pending' ? old : r;
  });
  const ids = new Set(list.map(r => r?.id).filter(id => id != null));
  return [...merged, ...curList.filter(r => r?.id != null && !ids.has(r.id))];
}
async function saveFamily(store, email, b) {
  const saveId = Math.random().toString(36).substring(7);
  const saveTime = new Date().toISOString();
  console.log(`[SAVEFAMILY-START-${saveId}] ${saveTime} saveFamily called, email: ${email}`);
  let inc = b.family;
  if (!inc || !inc.id) return err(400, 'Famille invalide.');

  // Log incoming shop data BEFORE normalization
  console.log(`[SAVEFAMILY-RECV-GRADES-${saveId}] gradeRequests count:`, inc.gradeRequests?.length || 0);
  if (inc.gradeRequests?.length > 0) {
    console.log(`[SAVEFAMILY-RECV-GRADES-DETAIL-${saveId}] grades:`, JSON.stringify(inc.gradeRequests.map(g => ({ id: g.id, child: g.child, subject: g.subject, status: g.status }))));
  }
  console.log(`[SAVEFAMILY-RECV-SHOP-${saveId}] requests:`, JSON.stringify(inc.requests?.map(r => ({ child: r.child, name: r.name, status: r.status }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-RECV-SHOP-${saveId}] sanctionsList:`, JSON.stringify(inc.sanctionsList?.map(s => ({ name: s.name, gold: s.gold }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-RECV-ACTIONLOG-${saveId}] incoming actionLog:`, inc.actionLog?.length || 0, 'entries, type:', typeof inc.actionLog);
  if (inc.actionLog?.length > 0) {
    console.log(`[SAVEFAMILY-RECV-ACTIONLOG-DETAIL-${saveId}] First entry:`, JSON.stringify(inc.actionLog[0]));
  }
  console.log(`[SAVEFAMILY-RECV-SHOP-${saveId}] children count:`, inc.children?.length || 0);
  if (inc.children?.[0]) {
    console.log(`[SAVEFAMILY-RECV-CHILD0-${saveId}] name=${inc.children[0].name}, gold=${inc.children[0].gold}, sanctions=${JSON.stringify(inc.children[0].sanctions?.slice(0, 2) || [])}`);
  }

  // Normalize incoming family data
  normalizeFamilyData(inc);

  // Log after normalization
  console.log(`[SAVEFAMILY-NORM-SHOP-${saveId}] requests after normalize:`, JSON.stringify(inc.requests?.map(r => ({ child: r.child, name: r.name, status: r.status }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-NORM-ACTIONLOG-${saveId}] actionLog after normalize:`, inc.actionLog?.length || 0, 'entries, type:', typeof inc.actionLog);

  // Read from store (single source of truth)
  const cur = await store.get('family:' + inc.id);
  if (!cur) return err(404, 'Famille introuvable.');
  // Normalize current family data
  normalizeFamilyData(cur);
  // Check if user is a parent member or a child of this family
  const isParent = cur.members?.includes(email);
  const isChild = isChildOf(email, cur);
  if (!isParent && !isChild) return err(403, 'Accès refusé.');
  const basedAt = inc.updatedAt ? Number(inc.updatedAt) : Infinity;   // moment de la dernière synchro de cet appareil
  // Un appareil enfant n'écrit que: ses propres quêtes, ses demandes, ses propositions, le jour. Tout le reste
  // (xp, or, PIN, boutique, sanctions, modèles, autres enfants) vient du serveur: sa copie est souvent périmée
  // et il ne doit pas pouvoir se créditer lui-même.
  if (!isParent) {
    const childName = parseChildEmail(email).name;
    const safe = structuredClone(cur);
    safe.id = inc.id;
    if (inc.day) safe.day = inc.day;
    for (const k of ['taskRequests', 'requests', 'proposals', 'gradeRequests', 'actionLog']) if (inc[k] !== undefined) safe[k] = inc[k];
    const own = (inc.children || []).find(c => c.name === childName);
    const target = safe.children.find(c => c.name === childName);
    if (own && target && Array.isArray(own.tasks)) {
      const ownById = new Map(own.tasks.filter(t => t?.id).map(t => [t.id, t]));
      // il ne retire qu'une quête unique déjà terminée (renouvellement du jour); les autres restent
      target.tasks = (target.tasks || []).filter(t => !(t.id && !ownById.has(t.id) && t.frequency === 'unique' && t.done && t.completedAt))
        .map(t => (t.id && ownById.get(t.id)) || t);
    }
    inc = safe;
  }
  // owner / members / id restent maîtrisés par le serveur : un membre ne peut pas s'auto-promouvoir
  const merged = { ...inc, id: cur.id, owner: cur.owner, members: cur.members };
  delete merged.memberInfo; delete merged.role; delete merged.tab; delete merged.activeChild;

  // Merge children: preserve existing tasks not in incoming data
  const incomingChildIds = new Set(inc.children?.map(c => c.id) || []);
  const serverOnlyChildren = cur.children?.filter(c => !inc.children?.some(ic => ic.id === c.id)) || [];

  // ponytail: task completion merge — preserve server's done=true state if incoming is stale (done=false or no completedAt).
  // This prevents devices with stale cached data from undoing validated tasks.
  const mergedChildren = (inc.children || []).map(incChild => {
    // Find matching server child by ID or name
    const serverChild = cur.children?.find(sc =>
      (incChild.id && sc.id === incChild.id) ||
      (incChild.name && !incChild.id && sc.name === incChild.name)
    );

    // xp / or: variation de l'appareil (valeur - valeur reçue) appliquée à la valeur du serveur; sans base, valeur envoyée
    if (serverChild) {
      for (const f of ['xp', 'gold']) {
        const base = incChild[f + 'Base'];
        if (typeof base === 'number' && typeof incChild[f] === 'number' && typeof serverChild[f] === 'number') {
          incChild[f] = serverChild[f] + (incChild[f] - base);
        }
      }
    }
    delete incChild.xpBase; delete incChild.goldBase;

    if (!serverChild || !serverChild.tasks || !incChild.tasks) {
      return incChild; // No merge needed, return incoming as-is
    }

    // Fusion par id (les tâches d'avant les ids retombent sur nom|xp). Le serveur garde une validation plus récente
    // que la dernière réinitialisation (resetAt) vue par l'appareil: protège des appareils périmés sans
    // ressusciter une tâche remise à faire au changement de jour ni une tâche réassignée.
    const serverById = new Map();
    const serverByKey = new Map();
    (serverChild.tasks || []).forEach(t => {
      if (t.id) serverById.set(t.id, t);
      serverByKey.set(`${t.name}|${t.xp}`, t);
    });

    const mergedTasks = (incChild.tasks || []).map(incTask => {
      const serverTask = incTask.id ? serverById.get(incTask.id) : serverByKey.get(`${incTask.name}|${incTask.xp}`);
      let out = incTask;
      if (serverTask && serverTask.done === true && serverTask.completedAt &&
          (!incTask.done || !incTask.completedAt) &&
          Number(serverTask.completedAt) > Number(incTask.resetAt || 0)) {
        console.log(`[MERGE-TASK-PRESERVE] ${incChild.name}: '${incTask.name}' — keeping server completion (${new Date(Number(serverTask.completedAt)).toISOString()})`);
        out = { ...incTask, done: serverTask.done, completedAt: serverTask.completedAt };
      }
      return out.id ? out : { ...out, id: serverTask?.id || 'task-' + crypto.randomBytes(4).toString('hex') };
    });
    mergedTasks.splice(0, mergedTasks.length, ...keepConcurrentAdds(serverChild.tasks, mergedTasks, basedAt, t => t.id ?? `${t.name}|${t.xp}`));

    return { ...incChild, tasks: mergedTasks };
  });

  // ponytail: un parent fait foi (sinon un enfant supprimé revient à chaque sauvegarde); un enfant ne peut pas retirer ses frères et sœurs
  merged.children = isParent ? keepConcurrentAdds(cur.children, mergedChildren, basedAt, c => c.id ?? c.name) : [...mergedChildren, ...serverOnlyChildren];

  // Normalize completedAt timestamps to always be numbers
  for (const child of merged.children || []) {
    if (child && child.tasks && Array.isArray(child.tasks)) {
      for (const task of child.tasks) {
        if (task && task.completedAt) {
          const num = Number(task.completedAt);
          task.completedAt = !isNaN(num) ? num : (typeof task.completedAt === 'string' ? new Date(task.completedAt).getTime() : null);
        }
      }
    }
  }

  // Generate missing child IDs (for children created before ID generation was implemented)
  for (const child of merged.children || []) {
    if (!child.id) {
      child.id = 'child-' + crypto.randomBytes(4).toString('hex');
    }
  }

  // Generate missing IDs for all mergeable arrays (must happen BEFORE merge because mergeById filters out items without IDs)
  // ponytail: centralized ID generation for all arrays that use mergeById
  // ponytail: id déterministe (hash du contenu hors horodatages serveur) pour que la copie serveur et la copie client
  // d'une même ancienne donnée sans id reçoivent le même id; des éléments strictement identiques fusionnent.
  const generateIdIfMissing = (item, prefix) => {
    if (item && !item.id) {
      const content = JSON.stringify({ ...item, approvedAt: undefined, id: undefined });
      item.id = `${prefix}-${crypto.createHash('sha1').update(content).digest('hex').slice(0, 8)}`;
    }
    return item;
  };

  for (const [key, prefix] of [['proposals', 'proposal'], ['requests', 'request'], ['gradeRequests', 'grade'], ['taskRequests', 'task'], ['questList', 'quest']]) {
    if (cur[key]) cur[key] = cur[key].map(item => generateIdIfMissing(item, prefix));
    if (inc[key]) inc[key] = inc[key].map(item => generateIdIfMissing(item, prefix));
  }

  // Log proposals before merge
  console.log(`[SAVEFAMILY-MERGE-PROPOSALS-${saveId}] Before merge - cur.proposals count:`, cur.proposals?.length || 0);
  console.log(`[SAVEFAMILY-MERGE-PROPOSALS-${saveId}] Before merge - inc.proposals count:`, inc.proposals?.length || 0);
  if (inc.proposals?.length > 0) {
    console.log(`[SAVEFAMILY-MERGE-PROPOSALS-${saveId}] inc.proposals:`, JSON.stringify(inc.proposals.map(p => ({ name: p.name, child: p.child, status: p.status, type: p.type })) || []));
  }
  for (const k of ['requests', 'gradeRequests', 'taskRequests', 'proposals']) merged[k] = mergeById(cur[k], inc[k]);
  // ponytail: questList = dernier parent écrit gagne (une union avec le serveur ressuscitait les modèles supprimés); un enfant ne la modifie pas
  merged.questList = isParent && Array.isArray(inc.questList) ? keepConcurrentAdds(cur.questList, inc.questList, basedAt) : (cur.questList || []);
  console.log(`[SAVEFAMILY-MERGE-PROPOSALS-${saveId}] After merge - merged.proposals count:`, merged.proposals?.length || 0);
  if (merged.proposals?.length > 0) {
    console.log(`[SAVEFAMILY-MERGE-PROPOSALS-${saveId}] merged.proposals:`, JSON.stringify(merged.proposals.map(p => ({ name: p.name, child: p.child, status: p.status, type: p.type })) || []));
  }
  stampRewardPurchases(cur.requests, merged.requests);
  // Demandes d'achat: nouvelle demande -> parents (une fois, par id); approbation -> l'enfant concerné
  for (const req of inc.requests || []) {
    if (!req || typeof req !== 'object') continue;
    const oldReq = (cur.requests || []).find(r => (req.id && r.id === req.id) || (!req.id && r.child === req.child && r.name === req.name && r.status === 'pending'));
    if (!oldReq && req.status === 'pending') {
      await notifyParents(store, inc.id, `🎁 ${req.child} demande '${req.name}'`, `Coût: ${req.cost} or — à valider`, req.icon || '🎁', 'reward', email);
    }
    if (oldReq?.status === 'pending' && req.status === 'approved') {
      await notifyChild(store, inc.id, req.child, `🎁 Ta récompense '${req.name}' a été approuvée!`, 'Validée par les parents', req.icon || '🎁', 'reward', email);
      await logActivity(store, 'buyReward', req.child, inc.id, `${req.name} (${req.cost} or)`);
    }
  }

  // Log merged data BEFORE store write
  console.log(`[SAVEFAMILY-MERGED-GRADES-${saveId}] gradeRequests count:`, merged.gradeRequests?.length || 0);
  if (merged.gradeRequests?.length > 0) {
    console.log(`[SAVEFAMILY-MERGED-GRADES-DETAIL-${saveId}] merged grades:`, JSON.stringify(merged.gradeRequests.map(g => ({ id: g.id, subject: g.subject, status: g.status }))?.slice(0, 3)));
  }
  console.log(`[SAVEFAMILY-MERGED-${saveId}] requests:`, JSON.stringify(merged.requests?.map(r => ({ child: r.child, name: r.name, status: r.status }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-MERGED-${saveId}] sanctionsList:`, JSON.stringify(merged.sanctionsList?.map(s => ({ name: s.name, gold: s.gold }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-MERGED-ACTIONLOG-${saveId}] actionLog in merged:`, merged.actionLog?.length || 0, 'entries, type:', typeof merged.actionLog);

  // Write to store (single source of truth)
  const ensureArray = (val) => Array.isArray(val) ? val : [];
  if (isParent) {
    merged.rewards = keepConcurrentAdds(cur.rewards, merged.rewards, basedAt);
    merged.sanctionsList = keepConcurrentAdds(cur.sanctionsList, merged.sanctionsList, basedAt);
  }
  const famPayload = {
    id: merged.id,
    name: merged.name,
    owner: merged.owner,
    members: merged.members,
    children: ensureArray(merged.children),
    day: merged.day,
    dailyBonus: merged.dailyBonus,
    emailNotifications: !!merged.emailNotifications,
    questList: ensureArray(merged.questList),
    proposals: ensureArray(merged.proposals),
    sanctionsList: ensureArray(merged.sanctionsList),
    rewards: ensureArray(merged.rewards),
    requests: ensureArray(merged.requests),
    gradeRequests: ensureArray(merged.gradeRequests),
    taskRequests: ensureArray(merged.taskRequests),
    actionLog: ensureArray(merged.actionLog),
    updatedAt: Date.now()
  };

  // Log what's being written
  console.log(`[SAVEFAMILY-WRITE-GRADES-${saveId}] Writing to store - gradeRequests:`, famPayload.gradeRequests?.length || 0);
  if (famPayload.gradeRequests?.length > 0) {
    console.log(`[SAVEFAMILY-WRITE-GRADES-DETAIL-${saveId}] grades to store:`, JSON.stringify(famPayload.gradeRequests.map(g => ({ id: g.id, subject: g.subject, status: g.status }))?.slice(0, 3)));
  }
  console.log(`[SAVEFAMILY-WRITE-SHOP-${saveId}] Writing to store - requests:`, JSON.stringify(famPayload.requests?.map(r => ({ child: r.child, name: r.name, status: r.status }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-WRITE-SHOP-${saveId}] Writing to store - sanctionsList:`, JSON.stringify(famPayload.sanctionsList?.map(s => ({ name: s.name, gold: s.gold }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-WRITE-ACTIONLOG-${saveId}] Writing to store - actionLog:`, famPayload.actionLog?.length || 0, 'entries, type:', typeof famPayload.actionLog);
  console.log(`[SAVEFAMILY-WRITE-PROPOSALS-${saveId}] Writing to store - proposals:`, famPayload.proposals?.length || 0);
  if (famPayload.proposals?.length > 0) {
    console.log(`[SAVEFAMILY-WRITE-PROPOSALS-DETAIL-${saveId}] proposals:`, JSON.stringify(famPayload.proposals.map(p => ({ name: p.name, child: p.child, status: p.status, type: p.type })) || []));
  }

  console.log(`[SAVEFAMILY-WRITE-STORE-${saveId}] Calling store.set() with actionLog:`, famPayload.actionLog?.length || 0, 'entries');
  // date d'ajout posée par le serveur (voir keepConcurrentAdds)
  const stampNow = famPayload.updatedAt;
  for (const c of famPayload.children) stampAdded(c.tasks, stampNow);
  for (const l of [famPayload.children, famPayload.questList, famPayload.rewards, famPayload.sanctionsList]) stampAdded(l, stampNow);
  merged.updatedAt = stampNow;                // le client repart de cette version
  await store.set('family:' + inc.id, famPayload);
  console.log(`[SAVEFAMILY-WRITE-STORE-${saveId}] store.set() returned successfully`);

  // Index children by ID for fast lookup
  for (const child of merged.children || []) {
    if (child.id) {
      const childIdx = (await store.get('child-id-index')) || {};
      childIdx[child.id] = inc.id;
      await store.set('child-id-index', childIdx);
    }
  }
  // L'enfant coche une quête -> les parents sont prévenus (une fois par demande, par id)
  const knownTaskRequests = new Set((cur.taskRequests || []).map(r => r?.id).filter(Boolean));
  for (const r of inc.taskRequests || []) {
    if (r?.id && r.status === 'pending' && !knownTaskRequests.has(r.id)) {
      await notifyParents(store, inc.id, `⏳ ${r.child} a terminé '${r.taskName}'`, `À valider: +${r.xp || 0} XP, +${r.gold || 0} or`, '⏳', 'task-request', email);
    }
  }
  // Validation d'une quête -> l'enfant; nouvelle quête ajoutée par un parent -> l'enfant. Appariement par id.
  for (const mergedChild of merged.children || []) {
    const curChild = cur.children?.find(c => c.id === mergedChild.id || c.name === mergedChild.name);
    if (!(curChild && mergedChild.tasks && curChild.tasks)) continue;
    const oldById = new Map((curChild.tasks || []).filter(t => t.id).map(t => [t.id, t]));
    const oldByKey = new Map((curChild.tasks || []).filter(t => !t.id).map(t => [`${t.name}|${t.xp}`, t]));
    for (const newTask of mergedChild.tasks || []) {
      const oldTask = (newTask.id && oldById.get(newTask.id)) || oldByKey.get(`${newTask.name}|${newTask.xp}`);
      // validation = une date de validation plus récente que celle connue (une copie périmée la ré-affirme à l'identique)
      if (newTask.done === true && newTask.completedAt && Number(newTask.completedAt) > Number(oldTask?.completedAt || 0)) {
        await logActivity(store, 'completeTask', mergedChild.name, inc.name, `${newTask.name} (${newTask.xp || 0} XP)`);
        await notifyChild(store, inc.id, mergedChild.name, `✅ Tâche validée: '${newTask.name}'`, `+${newTask.xp || 0} XP, +${newTask.gold || 0} or`, '✅', 'task', email);
      } else if (isParent && !newTask.done && !oldTask) {
        await notifyChild(store, inc.id, mergedChild.name, `📋 Nouvelle tâche: '${newTask.name}'`, `+${newTask.xp || 0} XP, +${newTask.gold || 0} or`, newTask.icon || '📋', 'task-new', email);
        await logActivity(store, 'addTask', email, inc.id, `${mergedChild.name}: ${newTask.name}`);
      }
    }
  }

  // Deduplicate gradeRequests
  if (merged.gradeRequests && Array.isArray(merged.gradeRequests)) {
    const seen = new Set();
    merged.gradeRequests = merged.gradeRequests.filter(g => {
      if (!g || !g.id) return true;
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });
  }

  // Sanctions appliquées -> l'enfant (comparaison motif + date: une sanction déjà connue ne re-notifie pas)
  const sanctionCounts = (list) => (list || []).reduce((m, x) => { const k = `${x.motif}|${x.date || ''}`; m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  for (const mergedChild of merged.children || []) {
    const curChild = cur.children?.find(c => c.id === mergedChild.id || c.name === mergedChild.name);
    if (!(curChild && Array.isArray(mergedChild.sanctions) && Array.isArray(curChild.sanctions))) continue;
    const before = sanctionCounts(curChild.sanctions);
    const seen = new Map();
    for (const newSanction of mergedChild.sanctions) {
      const k = `${newSanction.motif}|${newSanction.date || ''}`;
      seen.set(k, (seen.get(k) || 0) + 1);
      if (seen.get(k) <= (before.get(k) || 0)) continue;
      const sanctionDef = cur.sanctionsList?.find(x => x.name === newSanction.motif);
      const gold = newSanction.gold ?? sanctionDef?.gold ?? 0;
      await notifyChild(store, inc.id, mergedChild.name, '⚠️ Tu as reçu une sanction', `${newSanction.motif} (-${gold} or)`, '⚠️', 'sanction', email);
      await logActivity(store, 'applySanction', mergedChild.name, inc.id, `${newSanction.motif} (-${gold} or)`);
    }
  }

  // Nouvelle proposition (identifiant inconnu du serveur) -> les parents, une seule fois
  if (Array.isArray(inc.proposals)) {
    const knownProposals = new Set((cur.proposals || []).map(p => p?.id).filter(Boolean));
    // Les propositions de l'application enfant n'ont pas toujours de type: sans type, c'est une récompense.
    const typeOf = p => p.type || 'reward';
    for (const proposal of inc.proposals) {
      if (!proposal?.id || knownProposals.has(proposal.id) || (proposal.status && proposal.status !== 'pending')) continue;
      const who = proposal.proposedBy || proposal.child;
      if (typeOf(proposal) === 'task') {
        await notifyParents(store, inc.id, `💡 ${who} propose: '${proposal.name}'`, `+${proposal.xp || 0} XP, +${proposal.gold || 0} or`, '💡', 'proposal', email);
      } else if (typeOf(proposal) === 'quest') {
        await notifyParents(store, inc.id, `💡 ${who} propose une quête: '${proposal.name}'`, 'À valider avec XP/Or', '💡', 'proposal', email);
      } else {
        await notifyParents(store, inc.id, `🛍️ ${who} propose: '${proposal.name}'`, `Coût: ${proposal.cost || 0} or`, '🛍️', 'proposal', email);
      }
      await logActivity(store, 'propose', who || 'unknown', inc.id, `${typeOf(proposal)}: ${proposal.name}`);
    }
  }

  // Return the merged data directly without reloading from storage
  merged.memberInfo = {};
  for (const m of merged.members) { const a = await store.get('account:' + m); merged.memberInfo[m] = a ? a.name : null; }

  // Log what we're returning to frontend
  console.log(`[SAVEFAMILY-RETURN-GRADES-${saveId}] Returning to frontend - gradeRequests:`, merged.gradeRequests?.length || 0);
  if (merged.gradeRequests?.length > 0) {
    console.log(`[SAVEFAMILY-RETURN-GRADES-DETAIL-${saveId}] grades returned:`, JSON.stringify(merged.gradeRequests.map(g => ({ id: g.id, subject: g.subject, status: g.status }))?.slice(0, 3)));
  }
  console.log(`[SAVEFAMILY-RETURN-${saveId}] Returning to frontend - requests:`, JSON.stringify(merged.requests?.map(r => ({ child: r.child, name: r.name, status: r.status }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-RETURN-${saveId}] Returning to frontend - sanctionsList:`, JSON.stringify(merged.sanctionsList?.map(s => ({ name: s.name, gold: s.gold }))?.slice(0, 3) || []));
  console.log(`[SAVEFAMILY-RETURN-ACTIONLOG-${saveId}] Returning to frontend - actionLog:`, merged.actionLog?.length || 0, 'entries');
  console.log(`[SAVEFAMILY-RETURN-PROPOSALS-${saveId}] Returning to frontend - proposals:`, merged.proposals?.length || 0);
  if (merged.proposals?.length > 0) {
    console.log(`[SAVEFAMILY-RETURN-PROPOSALS-DETAIL-${saveId}] proposals:`, JSON.stringify(merged.proposals.map(p => ({ name: p.name, child: p.child, status: p.status, type: p.type })) || []));
  }

  return { status: 200, body: { family: merged } };
}
async function createFamily(store, email, b) {
  const name = (b.name || '').trim();
  console.log('[CREATE-FAMILY] email:', email);
  if (!name) return err(400, 'Nom de la famille requis.');
  const fam = newFamily(name, email);
  fam.createdAt = Date.now();
  await updateFamilyNameIndex(store, fam.name, fam.id);

  // Update account record in store
  const acc = await store.get('account:' + email);
  if (acc) {
    acc.familyIds.push(fam.id);
    await store.set('account:' + email, acc);
  }

  // Update admin metadata
  const metadata = (await store.get('_admin_metadata')) || { familyIds: [], accountEmails: [] };
  if (!metadata.familyIds.includes(fam.id)) metadata.familyIds.push(fam.id);
  if (!metadata.accountEmails.includes(email)) metadata.accountEmails.push(email);
  await store.set('_admin_metadata', metadata);

  // Write to store
  const storeFamily = {
    id: fam.id,
    name: fam.name,
    owner: fam.owner,
    members: fam.members,
    children: [],
    day: fam.day,
    dailyBonus: fam.dailyBonus,
    questList: fam.questList,
    proposals: fam.proposals,
    sanctionsList: fam.sanctionsList,
    rewards: fam.rewards,
    requests: fam.requests,
    gradeRequests: fam.gradeRequests,
    taskRequests: fam.taskRequests,
    actionLog: fam.actionLog,
    createdAt: fam.createdAt,
    updatedAt: Date.now()
  };
  await store.set('family:' + fam.id, storeFamily);

  // Store default level config
  await store.set('levelConfig:' + fam.id, {
    name: 'Configuration par défaut',
    levels: Array.from({ length: 50 }, (_, i) => ({
      level: i + 1,
      xpRequired: (i + 1) * 100
    })),
    createdAt: Date.now()
  });

  await logActivity(store, 'createFamily', email, fam.id, `Famille créée: ${name}`);

  return { status: 200, body: { family: await withNames(store, fam) } };
}
async function deleteFamily(store, email, b) {
  const familyId = b.familyId;
  if (!familyId) return err(400, 'familyId requis.');

  // Get family and verify ownership from store
  const fam = await store.get('family:' + familyId);
  if (!fam) return err(404, 'Famille introuvable.');
  if (fam.owner !== email) return err(403, 'Seul le propriétaire peut supprimer la famille.');

  // Remove from all members
  for (const member of fam.members) {
    const acc = await store.get('account:' + member);
    if (acc) {
      acc.familyIds = acc.familyIds.filter(id => id !== familyId);
      await store.set('account:' + member, acc);
    }
  }

  // Delete from store
  await store.del('family:' + familyId);
  await store.del('levelConfig:' + familyId);

  // Update admin metadata
  const metadata = (await store.get('_admin_metadata')) || { familyIds: [], accountEmails: [] };
  metadata.familyIds = metadata.familyIds.filter(id => id !== familyId);
  await store.set('_admin_metadata', metadata);

  await logActivity(store, 'deleteFamily', email, familyId, `Famille supprimée: ${fam.name}`);

  return { status: 200, body: { ok: true } };
}
async function invite(store, email, b) {
  const fid = b.familyId, inv = String(b.email || '').toLowerCase();
  if (!EMAIL_RE.test(inv)) return err(400, 'Email invalide.');
  const fam = await store.get('family:' + fid);
  if (!fam) return err(404, 'Famille introuvable.');
  if (fam.owner !== email) return err(403, 'Seul le propriétaire peut inviter.');
  if (fam.members.includes(inv)) return err(409, 'Cet adulte a déjà accès.');
  const inviter = await store.get('account:' + email);
  fam.members.push(inv);
  const acc = await store.get('account:' + inv);
  if (acc) { if (!acc.familyIds.includes(fid)) { acc.familyIds.push(fid); await store.set('account:' + inv, acc); } }
  else { const p = (await store.get('invite:' + inv)) || []; if (!p.includes(fid)) { p.push(fid); await store.set('invite:' + inv, p); } }
  if (emailSender) { await emailSender({ to: inv, subject: `Invitation à la famille « ${fam.name} »`, body: `${inviter?.name || email} vous a invité à rejoindre la famille « ${fam.name} » sur DailyKids Quest IV.` }); }

  // Update store members
  await store.set('family:' + fid, fam);

  await logActivity(store, 'inviteMember', email, fid, `${inv} invité à la famille`);

  return { status: 200, body: { family: await withNames(store, fam) } };
}
async function removeAdult(store, email, b) {
  const fid = b.familyId, rem = String(b.email || '').toLowerCase();
  const fam = await store.get('family:' + fid);
  if (!fam) return err(404, 'Famille introuvable.');
  if (fam.owner !== email) return err(403, 'Seul le propriétaire peut retirer un adulte.');
  if (rem === fam.owner) return err(400, 'Impossible de retirer le propriétaire.');
  fam.members = fam.members.filter(m => m !== rem);
  const acc = await store.get('account:' + rem);
  if (acc) { acc.familyIds = acc.familyIds.filter(x => x !== fid); await store.set('account:' + rem, acc); }
  const p = await store.get('invite:' + rem);
  if (p) await store.set('invite:' + rem, p.filter(x => x !== fid));

  // Update store members
  await store.set('family:' + fid, fam);

  await logActivity(store, 'removeMember', email, fid, `${rem} retiré de la famille`);

  return { status: 200, body: { family: await withNames(store, fam) } };
}

async function updateFamilyNameIndex(store, name, familyId) {
  const idx = (await store.get('family-names-index')) || {};
  // Index both full name and last word (for child login UX)
  // "Famille Démo" → ["famille démo", "démo"]
  const keys = new Set();
  keys.add(name.toLowerCase());
  const lastWord = name.trim().split(/\s+/).pop();
  if (lastWord) keys.add(lastWord.toLowerCase());
  for (const key of keys) {
    if (!idx[key]) idx[key] = [];
    if (!idx[key].includes(familyId)) idx[key].push(familyId);
  }
  await store.set('family-names-index', idx);
}
async function unlockChildDirect(store, b, secret) {
  const famname = (b.familyName || '').trim().toLowerCase();
  const childName = (b.childName || '').trim();
  const pin = String(b.pin || '').trim();
  if (!famname || !childName || !pin) return err(400, 'Tous les parametres requis.');
  const pinKey = `pin|${famname}|${childName.toLowerCase()}`;
  if (lockedFor(pinKey)) return tooMany(lockedFor(pinKey));
  const idx = (await store.get('family-names-index')) || {};
  const famIds = idx[famname] || [];
  for (const fid of famIds) {
    const fam = await store.get('family:' + fid);
    if (!fam) continue;
    // Normalize family data
    normalizeFamilyData(fam);
    const child = fam.children.find(c => c.name === childName);
    if (!child || !child.pin || child.pin !== pin) continue;
    const token = signToken(childEmail(childName, fam.id), secret);
    clearFailures(pinKey);
    return { status: 200, body: { families: [await withNames(store, fam)], token } };
  }
  recordFailure(pinKey);
  return err(401, 'Famille ou enfant introuvable, ou PIN incorrect.');
}
async function submitGrade(store, famId, b) {
  const { childName, subject, grade, gold } = b;
  if (!childName || !subject || !grade || gold === undefined) return err(400, 'Tous les champs requis.');
  if (isNaN(gold) || gold < 0) return err(400, 'Or invalide.');

  // Read from store (single source of truth)
  const fam = await store.get('family:' + famId);
  if (!fam) return err(404, 'Famille introuvable.');

  // Ensure gradeRequests is always a clean array
  let gradeRequests = fam.gradeRequests || [];
  if (!Array.isArray(gradeRequests)) {
    // If object, convert to array
    if (typeof gradeRequests === 'object') {
      gradeRequests = Object.keys(gradeRequests)
        .filter(key => /^\d+$/.test(key))
        .map(key => gradeRequests[key])
        .filter(v => v != null && typeof v === 'object');
    } else {
      gradeRequests = [];
    }
  }

  // Create new grade
  const gradeRequest = {
    id: `grade_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    child: childName,
    subject,
    grade,
    gold,
    status: 'pending',
    submittedAt: Date.now()
  };

  // Add to array
  gradeRequests.push(gradeRequest);
  fam.gradeRequests = gradeRequests;

  console.log(`[SUBMIT-GRADE-BEFORE-SAVE] About to save. gradeRequests count: ${fam.gradeRequests?.length || 0}`);

  // Save to store
  await store.set('family:' + famId, fam);

  console.log(`[SUBMIT-GRADE-AFTER-SAVE] Saved. Family gradeRequests count: ${fam.gradeRequests?.length || 0}`);

  // Log activity
  await logActivity(store, 'submitGrade', childName, `${fam.name}`, `Soumis: ${subject} (Note: ${grade}, Or: ${gold})`);

  // Envoyer un email au parent
  // Parents prévenus une fois (push; e-mail seulement si l'option est activée)
  await notifyParents(store, famId, `📝 ${childName} a soumis une note`, `${subject} (${grade}) — or demandé: ${gold}`, '📝', 'grade');

  // Return the updated family so frontend can update state directly
  return { status: 200, body: { family: fam } };
}
async function approveGrade(store, email, b) {
  const { familyId, gradeId, gold } = b;
  const fam = await store.get('family:' + familyId);
  if (!fam) return err(404, 'Famille introuvable.');
  if (!fam.members.includes(email)) return err(403, 'Accès refusé.');
  // Normalize family data
  normalizeFamilyData(fam);
  const req = fam.gradeRequests?.find(g => g.id === gradeId);
  if (!req) return err(404, 'Note introuvable.');
  if (req.status !== 'pending') return err(400, 'Seules les notes en attente peuvent être approuvées.');
  const child = fam.children.find(c => c.name === req.child);
  const goldAmount = (gold !== undefined && gold !== null) ? gold : req.gold;
  if (child) { child.gold = (child.gold || 0) + goldAmount; }
  req.status = 'approved';
  req.approvedAt = Date.now();
  req.gold = goldAmount;

  // Update in store
  await store.set('family:' + familyId, fam);

  await logActivity(store, 'approveGrade', email, familyId, `Note approuvée: ${req.child} - ${req.subject}`);

  // Notify child about approved grade
  await notifyChild(store, familyId, req.child, `📝 Ta note en ${req.subject} (${req.grade}) a été validée!`, `+${goldAmount} or`, '✅', 'grade', email)
    .catch(e => console.error('[NOTIFY-GRADE] Error:', e.message));

  return { status: 200, body: { ok: true, child: child ? { name: child.name, gold: child.gold } : null } };
}

// ADMIN_KEY est obligatoire: sans elle (ou avec une clé vide/différente) toute action admin est refusée.
function isAdminKey(key) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || typeof key !== 'string' || !key) return false;
  const digest = v => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(digest(key), digest(expected));
}

async function getLevelConfig(store, b) {
  const { familyId, adminKey } = b;
  if (!familyId) return err(400, 'familyId requis.');

  // Verify admin key
  if (!isAdminKey(adminKey)) {
    return err(403, 'Clé admin invalide.');
  }

  try {
    // Get level config from store
    let config = await store.get('levelConfig:' + familyId);

    // Provide default if not found
    if (!config) {
      config = {
        name: 'Configuration par défaut',
        levels: Array.from({ length: 50 }, (_, i) => ({
          level: i + 1,
          xpRequired: (i + 1) * 100
        })),
        createdAt: Date.now()
      };
    }

    return {
      status: 200,
      body: { levelConfig: config, familyId }
    };
  } catch (error) {
    console.error('[GET-LEVEL-CONFIG-ERROR]', error.message);
    return { status: 500, body: { error: error.message } };
  }
}

async function updateLevelConfig(store, b) {
  const { familyId, levelConfig, adminKey } = b;
  if (!familyId) return err(400, 'familyId requis.');
  if (!levelConfig) return err(400, 'levelConfig requis.');

  // Verify admin key
  if (!isAdminKey(adminKey)) {
    return err(403, 'Clé admin invalide.');
  }

  try {
    // Validate config structure
    if (!levelConfig.levels || !Array.isArray(levelConfig.levels)) {
      return err(400, 'Invalid level config format');
    }

    if (levelConfig.levels.length === 0 || levelConfig.levels.length > 99) {
      return err(400, 'Must have 1-99 levels');
    }

    // Validate: levels ordered, XP increasing
    for (let i = 0; i < levelConfig.levels.length; i++) {
      const level = levelConfig.levels[i];

      if (level.level !== i + 1) {
        return err(400, `Level at index ${i} should have level ${i + 1}`);
      }

      if (i > 0 && level.xpRequired <= levelConfig.levels[i - 1].xpRequired) {
        return err(400, `XP must increase (level ${i + 1})`);
      }
    }

    // Write to store
    await store.set('levelConfig:' + familyId, {
      name: levelConfig.name || 'Ma configuration',
      levels: levelConfig.levels,
      updatedAt: Date.now()
    });

    // Log activity
    await logActivity(store, 'updateLevelConfig', 'admin', familyId, `Updated level progression (${levelConfig.levels.length} levels)`);

    return {
      status: 200,
      body: { message: 'Level config updated', levelConfig }
    };
  } catch (error) {
    console.error('[UPDATE-LEVEL-CONFIG-ERROR]', error.message);
    return { status: 500, body: { error: error.message } };
  }
}

async function resetLevelConfig(store, b) {
  const { familyId, adminKey } = b;
  if (!familyId) return err(400, 'familyId requis.');

  // Verify admin key
  if (!isAdminKey(adminKey)) {
    return err(403, 'Clé admin invalide.');
  }

  try {
    const defaultConfig = {
      name: 'Configuration par défaut',
      levels: Array.from({ length: 50 }, (_, i) => ({
        level: i + 1,
        xpRequired: (i + 1) * 100
      })),
      createdAt: Date.now()
    };

    // Write to store
    await store.set('levelConfig:' + familyId, defaultConfig);

    // Log activity
    await logActivity(store, 'resetLevelConfig', 'admin', familyId, 'Reset level progression to default');

    return {
      status: 200,
      body: { message: 'Level config reset to default', levelConfig: defaultConfig }
    };
  } catch (error) {
    console.error('[RESET-LEVEL-CONFIG-ERROR]', error.message);
    return { status: 500, body: { error: error.message } };
  }
}

/* ── Task statistics aggregation ── */

function dateToISO(ms) {
  return new Date(ms).toISOString().split('T')[0];  // "YYYY-MM-DD"
}

function getDateRange(period, endDate = Date.now()) {
  // Dynamic France timezone offset: UTC+2 (CEST) or UTC+1 (CET)
  // CEST: late March to late October
  // CET: late October to late March
  function getFranceOffset(dateMs) {
    const d = new Date(dateMs);
    const year = d.getUTCFullYear();
    // Last Sunday of March at 02:00 UTC = start of CEST
    const march = new Date(Date.UTC(year, 2, 31, 2, 0, 0));
    const lastSunMarch = new Date(march - (march.getUTCDay() * 86400000));
    // Last Sunday of October at 03:00 UTC = end of CEST (return to CET)
    const october = new Date(Date.UTC(year, 9, 31, 3, 0, 0));
    const lastSunOct = new Date(october - (october.getUTCDay() * 86400000));

    // If date is between last Sunday March (02:00) and last Sunday October (03:00), use UTC+2 (CEST)
    // Otherwise use UTC+1 (CET)
    return (dateMs >= lastSunMarch && dateMs < lastSunOct) ? 7200000 : 3600000;  // 2h or 1h in ms
  }

  const FRANCE_OFFSET_MS = getFranceOffset(endDate);

  // Convert current time to France timezone to get the correct calendar date
  const timeInFrance = endDate + FRANCE_OFFSET_MS;
  const dateInFrance = new Date(timeInFrance);

  // Get date components in France timezone
  const y = dateInFrance.getUTCFullYear();
  const m = dateInFrance.getUTCMonth();
  const d = dateInFrance.getUTCDate();
  const dayOfWeek = dateInFrance.getUTCDay();

  let startDateUTC, endDateUTC;

  if (period === 'day') {
    // Today (France date) 00:00 to 23:59:59.999 in France time
    startDateUTC = Date.UTC(y, m, d, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, m, d, 23, 59, 59, 999);
  } else if (period === 'week') {
    // Sunday to Saturday of current week (France timezone)
    const daysToSubtract = dayOfWeek;  // dayOfWeek: 0=Sun, 1=Mon, etc.
    const daysToAdd = 6 - dayOfWeek;   // days until Saturday
    startDateUTC = Date.UTC(y, m, d - daysToSubtract, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, m, d + daysToAdd, 23, 59, 59, 999);
  } else if (period === 'month') {
    // 1st to last day of month (France timezone)
    startDateUTC = Date.UTC(y, m, 1, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, m + 1, 0, 23, 59, 59, 999);
  } else if (period === 'year') {
    // Jan 1 to Dec 31 (France timezone)
    startDateUTC = Date.UTC(y, 0, 1, 0, 0, 0, 0);
    endDateUTC = Date.UTC(y, 11, 31, 23, 59, 59, 999);
  }

  // Convert back from France timezone to UTC by subtracting the offset
  const start = startDateUTC - FRANCE_OFFSET_MS;
  const end = endDateUTC - FRANCE_OFFSET_MS;

  console.log('[AGGREGATE-STATS] Period:', period, 'France offset:', FRANCE_OFFSET_MS/3600000 + 'h', 'France date:', { y, m: m+1, d }, 'Range:', { start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  return { start, end };
}

function aggregateTaskStats(child, period = 'week') {
  const { start, end } = getDateRange(period);
  console.log('[AGGREGATE-STATS] Period:', period, 'Range:', { start: new Date(start).toISOString(), end: new Date(end).toISOString() });

  // Ensure tasks array exists and all have completedAt field
  let rawTasks = child.tasks || [];
  // Convert tasks object to array if needed (older data stored index-keyed objects)
  if (rawTasks && typeof rawTasks === 'object' && !Array.isArray(rawTasks)) {
    rawTasks = Object.values(rawTasks).filter(v => v !== null && v !== undefined);
  }
  console.log('[AGGREGATE-STATS] Child:', child.name, 'Total tasks:', rawTasks.length);

  const tasks = rawTasks.filter(t => t && typeof t === 'object').map(t => {
    let completedAt = null;
    if (t.completedAt) {
      const num = Number(t.completedAt);
      // Handle both numeric timestamps and ISO date strings
      completedAt = !isNaN(num) ? num : (typeof t.completedAt === 'string' ? new Date(t.completedAt).getTime() : null);
    }
    return { ...t, completedAt };
  });

  // Log any tasks that have completedAt but might be outside range
  const completedTasks = tasks.filter(t => t.completedAt);
  if (completedTasks.length > 0) {
    console.log('[AGGREGATE-STATS] Tasks with completedAt:', completedTasks.length,
      'Sample:', completedTasks.slice(0, 2).map(t => ({ name: t.name, done: t.done, completedAt: new Date(t.completedAt).toISOString(), inRange: t.completedAt >= start && t.completedAt <= end })));
  }


  const dailyBreakdown = {};
  let tasksCount = 0;
  let xpGained = 0;
  let goldGained = 0;
  const taskNameCounts = {};  // { "Ranger sa chambre": 3, ... }
  let bestDay = { date: '', tasksCount: 0, xp: 0, gold: 0 };

  for (const task of tasks) {
    // A task is considered completed if it has a completedAt timestamp in range (regardless of done flag)
    const inRange = task.completedAt && task.completedAt >= start && task.completedAt <= end;
    if (inRange) {
      const iso = dateToISO(task.completedAt);

      // Update global counters
      tasksCount++;
      xpGained += task.xp || 0;
      goldGained += task.gold || 0;

      // Update daily breakdown
      if (!dailyBreakdown[iso]) {
        dailyBreakdown[iso] = { tasksCount: 0, xp: 0, gold: 0 };
      }
      dailyBreakdown[iso].tasksCount++;
      dailyBreakdown[iso].xp += task.xp || 0;
      dailyBreakdown[iso].gold += task.gold || 0;

      // Track best day
      if (dailyBreakdown[iso].tasksCount > bestDay.tasksCount ||
          (dailyBreakdown[iso].tasksCount === bestDay.tasksCount && iso < bestDay.date)) {
        bestDay = { date: iso, ...dailyBreakdown[iso] };
      }

      // Count task occurrences
      const key = task.name || 'Sans nom';
      taskNameCounts[key] = (taskNameCounts[key] || 0) + 1;
    }
  }

  // Count total attempted tasks (heuristic: all tasks are "attempted")
  const tasksAttempted = tasks.length;

  // Top 5 tasks
  const topTasks = Object.entries(taskNameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => {
      const task = tasks.find(t => t.name === name);
      return { name, count, icon: task?.icon || '⭐' };
    });

  const completionRate = tasksAttempted > 0 ? Math.round((tasksCount / tasksAttempted) * 100) : 0;

  return {
    tasksCount,
    tasksAttempted,
    completionRate,
    xpGained,
    goldGained,
    dailyBreakdown,
    topTasks,
    bestDay: bestDay.tasksCount > 0 ? bestDay : null
  };
}

/* ── Web Push : abonnements par famille (parents seulement), clés VAPID auto-générées comme le secret ── */
async function getVapid(store) {
  let v = await store.get('vapid');
  if (!v) { v = webpush.generateVAPIDKeys(); await store.set('vapid', v); }
  return v;
}
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
// Garde anti-doublon: la même notification (même appareil, même texte) n'est pas renvoyée dans les 60 s.
const recentPush = new Map();
const PUSH_DEDUP_MS = 60000;
// `opts.only(sub)`: ne garde que les appareils concernés (parents, un enfant...). Sans option: toute la famille.
export async function sendPush(store, familyId, payload, opts = {}) {
  const all = (await store.get('push:' + familyId)) || [];
  console.log(`[PUSH-SEND] Family ${familyId}: ${all.length} subscription(s), payload: ${payload.title}`);
  if (!all.length) return { sent: 0, removed: 0 };
  const now = Date.now();
  for (const [k, t] of recentPush) if (now - t > PUSH_DEDUP_MS) recentPush.delete(k);
  const subs = all.filter(s => (!opts.only || opts.only(s)) && !recentPush.has(`${s.subscription.endpoint}|${payload.title}|${payload.body}`));
  if (!subs.length) return { sent: 0, removed: 0 };
  for (const s of subs) recentPush.set(`${s.subscription.endpoint}|${payload.title}|${payload.body}`, now);
  const v = await getVapid(store);
  const wp = { TTL: 3600, vapidDetails: { subject: process.env.VAPID_SUBJECT || 'mailto:admin@dailykids.local', publicKey: v.publicKey, privateKey: v.privateKey } };
  const dead = new Set();
  let sent = 0;
  await Promise.all(subs.map(s => webpush.sendNotification(s.subscription, JSON.stringify(payload), wp).then(
    () => { sent++; },
    e => {
      if (e.statusCode === 404 || e.statusCode === 410) { dead.add(s.subscription.endpoint); return; }
      // fournisseur (apple, google, mozilla...) et raison, jamais l'adresse complète de l'appareil
      let host = '?'; try { host = new URL(s.subscription.endpoint).host; } catch { /* adresse invalide */ }
      console.error(`[PUSH] send failed: ${e.statusCode || e.message} host=${host} ${String(e.body || '').slice(0, 160)}`.trim());
    })));
  if (dead.size) await store.set('push:' + familyId, all.filter(s => !dead.has(s.subscription.endpoint)));
  return { sent, removed: dead.size };
}
async function subscribePush(store, email, b) {
  const fam = await store.get('family:' + b.familyId);
  if (!fam) return err(404, 'Famille introuvable.');
  // Allow both parents (fam.members) and children (email@enfant.local)
  normalizeFamilyData(fam);
  const isParent = fam.members?.includes(email);
  const isChild = isChildOf(email, fam);
  if (!isParent && !isChild) return err(403, 'Accès refusé.');
  const s = b.subscription;
  if (!s || !/^https:\/\//.test(s.endpoint || '') || typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return err(400, 'Abonnement invalide.');
  const subscription = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
  // ponytail: 20 appareils max par famille, les plus anciens sautent
  const subs = ((await store.get('push:' + fam.id)) || []).filter(x => x.subscription.endpoint !== s.endpoint);
  subs.push({ email, subscription, createdAt: Date.now() });
  await store.set('push:' + fam.id, subs.slice(-20));
  console.log(`[PUSH-SUBSCRIBE] ${email} subscribed to family ${fam.id}, total subs: ${subs.length}`);
  return { status: 200, body: { ok: true } };
}
async function unsubscribePush(store, email, b) {
  if (typeof b.endpoint !== 'string') return err(400, 'endpoint requis.');
  const acc = await store.get('account:' + email);
  for (const fid of new Set([...(acc?.familyIds || []), b.familyId].filter(Boolean))) {
    const subs = (await store.get('push:' + fid)) || [];
    const kept = subs.filter(x => !(x.subscription.endpoint === b.endpoint && x.email === email));
    if (kept.length !== subs.length) await store.set('push:' + fid, kept);
  }
  return { status: 200, body: { ok: true } };
}
async function notify(store, email, b) {
  const fam = await store.get('family:' + b.familyId);
  if (!fam) return err(404, 'Famille introuvable.');
  normalizeFamilyData(fam);
  const isChild = isChildOf(email, fam);
  if (!fam.members?.includes(email) && !isChild) return err(403, 'Accès refusé.');
  const title = str(b.title, 100);
  if (!title) return err(400, 'title requis.');
  const data = b.data && typeof b.data === 'object' && JSON.stringify(b.data).length <= 1024 ? b.data : {};
  const payload = { title, body: str(b.body, 300) || '', icon: str(b.icon, 200) || '/icon-192.svg', badge: str(b.badge, 200) || '/icon-96.svg', tag: str(b.tag, 64), data };
  return { status: 200, body: await sendPush(store, fam.id, payload) };
}

// Notifications ciblées: les parents (push + e-mail si l'option est activée) ou un enfant précis (push seulement).
// `except` = l'auteur de l'action, qui n'est pas prévenu de ce qu'il vient de faire lui-même.
async function notifyParents(store, familyId, title, body, icon = '📢', tag = 'action', except = null) {
  try {
    const fam = await store.get('family:' + familyId);
    if (!fam) return;
    const members = fam.members || [];
    await sendPush(store, familyId, { title, body, icon, badge: '/icon-96.svg', tag, data: { url: '/' } }, { only: s => members.includes(s.email) && s.email !== except });
    if (fam.emailNotifications && emailSender) {
      for (const parentEmail of members.filter(m => m !== except)) {
        await emailSender({ to: parentEmail, subject: title, body }).catch(e => console.error('[NOTIFY-EMAIL] Error sending to ' + parentEmail + ':', e.message));
      }
    }
  } catch (e) {
    console.error('[NOTIFY-PARENTS] Error:', e.message);
  }
}

async function notifyChild(store, familyId, childName, title, body, icon = '📢', tag = 'action', except = null) {
  try {
    await sendPush(store, familyId, { title, body, icon, badge: '/icon-96.svg', tag, data: { url: '/' } }, { only: s => parseChildEmail(s.email)?.name === childName && s.email !== except });
  } catch (e) {
    console.error('[NOTIFY-CHILD] Error:', e.message);
  }
}

const PUBLIC = new Set(['login', 'signup', 'verifyPassword', 'unlockChildDirect', 'submitGrade', 'reset-password', 'getTaskStats', 'getFamilyData', 'getAdminStats', 'adminResetPassword', 'adminDeleteAccount', 'adminResetPin', 'adminDeleteFamily', 'getLevelConfig', 'updateLevelConfig', 'resetLevelConfig', 'pushKey']);

// point d'entrée unique. payload = { action, token, body }
async function logActivity(store, type, subject, target, details) {
  const globalHistory = (await store.get('_activity_history')) || [];
  globalHistory.push({
    timestamp: Date.now(),
    type,
    subject,
    target,
    details
  });
  if (globalHistory.length > 5000) globalHistory.shift();
  await store.set('_activity_history', globalHistory);
}

async function logAdminAction(store, action, target, details) {
  const history = (await store.get('_admin_history')) || [];
  history.push({
    timestamp: Date.now(),
    action,
    target,
    details
  });
  if (history.length > 1000) history.shift();
  await store.set('_admin_history', history);
}

/* ── statistiques (notes, récompenses, sanctions) ──
   ponytail: l'API stocke tout dans le document JSON famille (pas de tables grades/sanctions/reward_purchases
   lues ici). On agrège donc depuis child.grades, gradeRequests approuvées, child.sanctions et requests approuvées.
   Les entrées legacy sans date ne sont comptées que si aucun filtre de date explicite n'est fourni. */

const DAY_MS = 86400000;
const toDay = ms => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));
function recordTime(r) {
  const v = r?.date ?? r?.appliedAt ?? r?.purchaseDate ?? r?.approvedAt ?? r?.submittedAt ?? r?.at;
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
const round2 = n => Math.round(n * 100) / 100;

// Charge la famille, vérifie l'accès, résout la période et l'enfant. Retourne { error } ou le contexte.
async function statsContext(store, email, b) {
  const { familyId, childId, startDate, endDate } = b || {};
  if (!familyId) return { error: err(400, 'familyId requis.') };
  const fam = await store.get('family:' + familyId);
  if (!fam) return { error: err(404, 'Famille introuvable.') };
  if (!Array.isArray(fam.members) || !fam.members.includes(email)) return { error: err(403, 'Accès refusé.') };
  normalizeFamilyData(fam);
  const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z'));
  if (startDate != null && !isDay(startDate)) return { error: err(400, 'startDate invalide (AAAA-MM-JJ).') };
  if (endDate != null && !isDay(endDate)) return { error: err(400, 'endDate invalide (AAAA-MM-JJ).') };
  const end = endDate ? Date.parse(endDate + 'T00:00:00Z') + DAY_MS - 1 : Date.now();
  const start = startDate ? Date.parse(startDate + 'T00:00:00Z') : end - 90 * DAY_MS;
  if (start > end) return { error: err(400, 'startDate doit précéder endDate.') };
  let children = fam.children.filter(c => c && typeof c === 'object');
  if (childId) {
    children = children.filter(c => c.id === childId);
    if (!children.length) return { error: err(404, 'Enfant non trouvé.') };
  }
  const keepUndated = startDate == null && endDate == null;
  const inRange = t => (t == null ? keepUndated : t >= start && t <= end);
  const asArray = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []).filter(Boolean);
  const days = Math.max(1, (end - start) / DAY_MS);
  const frequency = n => ({ perMonth: round2(n / (days / 30)), perWeek: round2(n / (days / 7)) });
  return { fam, children, inRange, asArray, frequency };
}

const mostFrequent = groups => Object.entries(groups).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? null;
// "16/20", "16", "8/10" → note ramenée sur 20 ; null si illisible
function gradeOn20(g) {
  const m = String(g ?? '').trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?$/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.')), max = m[2] ? parseFloat(m[2].replace(',', '.')) : 20;
  return max > 0 ? (v / max) * 20 : null;
}

async function getGradeStats(store, email, b) {
  const ctx = await statsContext(store, email, b);
  if (ctx.error) return ctx.error;
  const { fam, children, inRange, asArray } = ctx;
  const names = new Set(children.map(c => c.name));
  const all = [];
  for (const c of children) {
    for (const g of asArray(c.grades)) {
      if (!g.grade) continue; // matière sans note saisie
      all.push({ childId: c.id, subject: g.subject, grade: g.grade, xp: +g.xp || 0, gold: +g.gold || 0, t: recordTime(g) });
    }
  }
  for (const g of asArray(fam.gradeRequests)) {
    if (g.status !== 'approved' || !names.has(g.child)) continue;
    const c = children.find(x => x.name === g.child);
    all.push({ childId: c.id, subject: g.subject, grade: g.grade, xp: +g.xp || 0, gold: +g.gold || 0, t: recordTime(g) });
  }
  const kept = all.filter(g => inRange(g.t)).sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  const grades = kept.map(({ t, ...g }) => ({ ...g, date: toDay(t) }));

  const bySubject = {}, byDay = {};
  for (const g of grades) {
    const s = (bySubject[g.subject] ??= { count: 0, avg: null, grades: [] });
    s.count++; s.grades.push(g.grade);
    if (g.date) {
      const d = (byDay[g.date] ??= { count: 0, subjects: [] });
      d.count++; if (!d.subjects.includes(g.subject)) d.subjects.push(g.subject);
    }
  }
  for (const s of Object.values(bySubject)) {
    const nums = s.grades.map(gradeOn20).filter(n => n != null);
    s.avg = nums.length ? String(round2(nums.reduce((a, n) => a + n, 0) / nums.length)) : null;
  }
  // tendance : moyenne de la 2e moitié vs 1re moitié (ordre chronologique), seuil 1 point sur 20
  const nums = grades.map(g => gradeOn20(g.grade)).filter(n => n != null);
  let trend = 'stable';
  if (nums.length >= 2) {
    const half = Math.floor(nums.length / 2), avg = a => a.reduce((s, n) => s + n, 0) / a.length;
    const diff = avg(nums.slice(nums.length - half)) - avg(nums.slice(0, half));
    trend = diff > 1 ? 'improving' : diff < -1 ? 'declining' : 'stable';
  }
  return { status: 200, body: {
    grades, bySubject, byDay, trend,
    totalXP: grades.reduce((s, g) => s + g.xp, 0),
    totalGold: grades.reduce((s, g) => s + g.gold, 0),
  } };
}

async function getRewardStats(store, email, b) {
  const ctx = await statsContext(store, email, b);
  if (ctx.error) return ctx.error;
  const { fam, children, inRange, asArray, frequency } = ctx;
  const names = new Set(children.map(c => c.name));
  const catalog = asArray(fam.rewards);
  const purchases = asArray(fam.requests)
    .filter(r => r.status === 'approved' && names.has(r.child))
    .map(r => ({ r, t: recordTime(r) }))
    .filter(({ t }) => inRange(t))
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
    .map(({ r, t }) => {
      const ref = catalog.find(x => (r.rewardId && x.id === r.rewardId) || x.name === r.name);
      return { name: r.name, cost: +r.cost || 0, purchaseDate: toDay(t), rewardId: r.rewardId ?? ref?.id ?? null,
        childId: children.find(c => c.name === r.child)?.id ?? null };
    });
  const byReward = {};
  for (const p of purchases) {
    const g = (byReward[p.name] ??= { count: 0, totalCost: 0, lastPurchase: null });
    g.count++; g.totalCost += p.cost;
    if (p.purchaseDate && (!g.lastPurchase || p.purchaseDate > g.lastPurchase)) g.lastPurchase = p.purchaseDate;
  }
  const totalSpent = purchases.reduce((s, p) => s + p.cost, 0);
  return { status: 200, body: {
    purchases, byReward, totalSpent,
    avgCost: purchases.length ? round2(totalSpent / purchases.length) : 0,
    mostPopular: mostFrequent(byReward),
    frequency: frequency(purchases.length),
  } };
}

async function getSanctionStats(store, email, b) {
  const ctx = await statsContext(store, email, b);
  if (ctx.error) return ctx.error;
  const { fam, children, inRange, asArray, frequency } = ctx;
  const defs = asArray(fam.sanctionsList);
  const sanctions = [];
  for (const c of children) {
    for (const s of asArray(c.sanctions)) {
      const t = recordTime(s);
      if (!inRange(t)) continue;
      // certaines sanctions legacy n'ont pas d'or : on reprend celui du barème
      const gold = s.gold != null ? +s.gold || 0 : +(defs.find(d => d.name === s.motif)?.gold) || 0;
      sanctions.push({ motif: s.motif, gold, date: toDay(t), childId: c.id, t });
    }
  }
  sanctions.sort((a, b) => (a.t ?? 0) - (b.t ?? 0)).forEach(s => delete s.t);
  const byMotif = {};
  for (const s of sanctions) {
    const g = (byMotif[s.motif] ??= { count: 0, totalGold: 0 });
    g.count++; g.totalGold += s.gold;
  }
  const totalGoldLost = sanctions.reduce((a, s) => a + s.gold, 0);
  return { status: 200, body: {
    sanctions, byMotif,
    totalCount: sanctions.length,
    totalGoldLost,
    avgGoldPerSanction: sanctions.length ? round2(totalGoldLost / sanctions.length) : 0,
    frequency: frequency(sanctions.length),
    mostCommon: mostFrequent(byMotif),
  } };
}

export async function handleApi({ action, token, body = {} }, store) {
  await ensureSeed(store);
  const secret = await getSecret(store);
  let email = null;
  if (!PUBLIC.has(action)) {
    console.log('[HANDLEAPI] action:', action, 'token exists:', !!token, 'token length:', token?.length);
    if (token) email = verifyToken(token, secret);
    if (email && email.endsWith('@enfant.local')) email = null;   // ancien jeton enfant (sans famille): reconnexion par PIN
    if (!email) {
      console.log('[HANDLEAPI] Authentication failed for action:', action);
      return err(401, 'Non authentifié.');
    }
  }
  switch (action) {
    case 'signup': return signup(store, secret, body);
    case 'login': return login(store, secret, body);
    case 'reset-password': return resetPassword(store, secret, body);
    case 'unlockChildDirect': return unlockChildDirect(store, body, secret);
    case 'getTaskStats': {
      const { childId, period = 'week' } = body;
      console.log('[GET-TASK-STATS] childId:', childId, 'period:', period);
      if (!childId) {
        console.error('[GET-TASK-STATS] No childId provided');
        return err(400, 'childId requis.');
      }
      let idx = (await store.get('child-id-index')) || {};
      let familyId = idx[childId];

      // If not in index, build index from existing families (first access after migration)
      if (!familyId && store.list) {
        const keys = await store.list();
        for (const key of keys) {
          if (key.startsWith('family:')) {
            const fam = await store.get(key);
            if (fam && fam.children) {
              // Normalize family data
              normalizeFamilyData(fam);
              for (const child of fam.children) {
                if (child.id) {
                  idx[child.id] = fam.id;
                }
              }
            }
          }
        }
        await store.set('child-id-index', idx);
        familyId = idx[childId];
      }

      if (!familyId) return err(404, 'Enfant non trouvé.');

      // Read from store
      let child = null;
      let family = null;
      try {
        family = await store.get('family:' + familyId);
        if (family) {
          // Normalize all family data
          normalizeFamilyData(family);
          if (family && family.children) {
            child = family.children.find(c => c.id === childId);
          }
        }
      } catch (err) {
        console.error('[GET-TASK-STATS] Store read error:', err.message);
      }

      if (!child) {
        console.error('[GET-TASK-STATS] Child not found - childId:', childId, 'familyId:', familyId);
        return err(404, 'Enfant non trouvé.');
      }

      console.log('[GET-TASK-STATS] Found child:', child.name, 'tasks:', child.tasks?.length || 0);
      const stats = aggregateTaskStats(child, period);
      console.log('[GET-TASK-STATS] Stats result:', { tasksCount: stats.tasksCount, xpGained: stats.xpGained, period });

      // Get stats for all children in family
      let childrenStats = [];
      try {
        if (family && family.children) {
          childrenStats = family.children.map(c => {
            const childStats = aggregateTaskStats(c, period);
            return {
              tasks: childStats.tasksCount || 0,
              xp: childStats.xpGained || 0,
              gold: childStats.goldGained || 0
            };
          });
        }
      } catch (err) {
        console.error('[GET-TASK-STATS] Error getting children stats:', err.message);
      }

      return { status: 200, body: { ...stats, childrenStats } };
    }
    case 'me': {
      try {
        return { status: 200, body: await stateFor(store, email) };
      } catch (error) {
        console.error('[ME-ERROR]', error.message);
        return err(401, 'Non authentifié.');
      }
    }
    case 'verifyPassword': {
      // Accept email from body (for unlock scenario) or from token (for authenticated scenario)
      const verifyEmail = String(body.email || email || '').toLowerCase();
      console.log('[VERIFY-PASSWORD] Attempting - email:', verifyEmail, 'hasToken:', !!email);
      if (!verifyEmail || !body.password) {
        console.log('[VERIFY-PASSWORD] Missing email or password');
        return { status: 200, body: { ok: false } };
      }
      const pwKey = 'pw|' + verifyEmail;
      if (lockedFor(pwKey)) return tooMany(lockedFor(pwKey));
      const acc = await store.get('account:' + verifyEmail);
      const ok = !!(acc && checkPassword(body.password, acc.salt, acc.hash));
      if (ok) clearFailures(pwKey); else recordFailure(pwKey);
      console.log('[VERIFY-PASSWORD] Result: ok=', ok, 'account found:', !!acc, 'email:', verifyEmail);
      return { status: 200, body: { ok } };
    }
    case 'changePassword': {
      if (!email) return err(401, 'Non authentifié.');
      const { newPassword } = body;
      if (!newPassword || newPassword.length < 6) {
        return err(400, 'Le mot de passe doit faire au moins 6 caractères.');
      }
      try {
        const account = await store.get('account:' + email);
        if (!account) return err(404, 'Compte non trouvé.');
        const { salt, hash } = hashPassword(newPassword);
        await store.set('account:' + email, { ...account, salt, hash });
        console.log('[CHANGE-PASSWORD] Password updated for email:', email);
        return { status: 200, body: { ok: true } };
      } catch (e) {
        console.error('[CHANGE-PASSWORD] Error:', e.message);
        return err(400, 'Erreur: ' + e.message);
      }
    }
    case 'pushKey': return { status: 200, body: { key: (await getVapid(store)).publicKey } };
    case 'subscribePush': return subscribePush(store, email, body);
    case 'unsubscribePush': return unsubscribePush(store, email, body);
    case 'notify': return notify(store, email, body);
    case 'saveFamily': return saveFamily(store, email, body);
    case 'createFamily': return createFamily(store, email, body);
    case 'deleteFamily': return deleteFamily(store, email, body);
    case 'invite': return invite(store, email, body);
    case 'removeAdult': return removeAdult(store, email, body);
    case 'submitGrade': return submitGrade(store, body.familyId, body);
    case 'approveGrade': return approveGrade(store, email, body);
    case 'getGradeStats': return getGradeStats(store, email, body);
    case 'getRewardStats': return getRewardStats(store, email, body);
    case 'getSanctionStats': return getSanctionStats(store, email, body);
    case 'getLevelConfig': return getLevelConfig(store, body);
    case 'updateLevelConfig': return updateLevelConfig(store, body);
    case 'resetLevelConfig': return resetLevelConfig(store, body);
    case 'getAdminStats': {
      // Verify admin key
      if (!isAdminKey(body.adminKey)) {
        return err(403, 'Clé admin invalide.');
      }
      const families = [];
      const accounts = [];
      let totalChildren = 0;
      let totalTasksCompleted = 0;

      let metadata = (await store.get('_admin_metadata')) || { familyIds: [], accountEmails: [] };
      console.log('[GET-ADMIN-STATS] Metadata loaded:', { familyIds: metadata.familyIds?.length || 0, accountEmails: metadata.accountEmails?.length || 0 });
      if (metadata.familyIds?.length > 0) {
        console.log('[GET-ADMIN-STATS] Sample familyIds:', metadata.familyIds.slice(0, 3));
      }

      // Always ensure metadata is complete by scanning the store (handles cases where families were created before metadata tracking)
      if (store.list) {
        const keys = await store.list();
        const scannedFamilyIds = [];
        const scannedEmails = [];
        for (const key of keys) {
          if (key.startsWith('family:')) scannedFamilyIds.push(key.slice(7));
          if (key.startsWith('account:')) scannedEmails.push(key.slice(8));
        }
        // Update metadata if scan found different items than what's recorded
        const metaFamilyIds = metadata.familyIds || [];
        const metaEmails = metadata.accountEmails || [];
        if (scannedFamilyIds.length !== metaFamilyIds.length ||
            scannedEmails.length !== metaEmails.length ||
            !scannedFamilyIds.every(id => metaFamilyIds.includes(id)) ||
            !scannedEmails.every(email => metaEmails.includes(email))) {
          console.log('[GET-ADMIN-STATS] Metadata stale - updating from scan:', { before: { families: metaFamilyIds.length, accounts: metaEmails.length }, after: { families: scannedFamilyIds.length, accounts: scannedEmails.length } });
          metadata = { familyIds: scannedFamilyIds, accountEmails: scannedEmails };
          await store.set('_admin_metadata', metadata);
        }
      }

      // Load families from store
      for (const famId of metadata.familyIds || []) {
        try {
          const fam = await store.get('family:' + famId);
          if (fam) {
            normalizeFamilyData(fam);
            totalChildren += fam.children?.length || 0;
            let familyTasks = 0;
            const children = [];
            for (const child of fam.children || []) {
              const childStats = aggregateTaskStats(child, 'year');
              familyTasks += childStats.tasksCount || 0;
              children.push({
                id: child.id,
                name: child.name,
                pin: child.pin
              });
            }
            totalTasksCompleted += familyTasks;
            families.push({
              id: famId,
              name: fam.name,
              owner: fam.owner,
              children,
              tasksCompleted: familyTasks
            });
          }
        } catch (err) {
          console.log('[GET-ADMIN-STATS] Error reading family:', famId, err.message);
        }
      }

      // Load accounts
      for (const email of metadata.accountEmails || []) {
        const acc = await store.get('account:' + email);
        if (acc) accounts.push({ email: acc.email, name: acc.name });
      }

      // Get history
      const history = (await store.get('_admin_history')) || [];
      let activityHistory = (await store.get('_activity_history')) || [];

      // Collect audit logs from all families
      const allAuditLogs = [];
      console.log('[GET-ADMIN-STATS-AUDIT] Starting audit log collection from', metadata.familyIds?.length || 0, 'families');
      for (const famId of metadata.familyIds || []) {
        try {
          const fam = await store.get('family:' + famId);
          console.log(`[GET-ADMIN-STATS-AUDIT-${famId}] Family found: ${!!fam}, hasActionLog: ${!!fam?.actionLog}, isArray: ${Array.isArray(fam?.actionLog)}, length: ${fam?.actionLog?.length || 0}`);
          if (fam && fam.actionLog && Array.isArray(fam.actionLog)) {
            console.log(`[GET-ADMIN-STATS-AUDIT-${famId}] Adding ${fam.actionLog.length} entries`);
            if (fam.actionLog.length > 0) {
              console.log(`[GET-ADMIN-STATS-AUDIT-${famId}] Sample entry:`, JSON.stringify(fam.actionLog[0]));
            }
            allAuditLogs.push(...fam.actionLog);
          } else {
            console.log(`[GET-ADMIN-STATS-AUDIT-${famId}] Skipped - fam:${!!fam}, actionLog:${!!fam?.actionLog}, isArray:${Array.isArray(fam?.actionLog)}`);
          }
        } catch (err) {
          console.log('[GET-ADMIN-STATS-AUDIT-ERROR]', famId, err.message);
        }
      }
      // Sort by timestamp descending (most recent first) and keep last 5000 entries
      allAuditLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      const auditLogs = allAuditLogs.slice(0, 5000);
      console.log('[GET-ADMIN-STATS] Total audit logs collected:', auditLogs.length, '- Sample:', auditLogs.slice(0, 2).map(a => ({ actionType: a.actionType, userId: a.userId, timestamp: new Date(a.timestamp).toISOString() })));

      // If activity history is empty, generate from existing completed tasks
      if (activityHistory.length === 0) {
        const generatedActivities = [];
        for (const famId of metadata.familyIds || []) {
          try {
            const fam = await store.get('family:' + famId);
            if (fam && fam.children) {
              normalizeFamilyData(fam);
              for (const child of fam.children) {
                if (child.tasks && Array.isArray(child.tasks)) {
                  for (const task of child.tasks) {
                    if (task.done === true && task.completedAt) {
                      generatedActivities.push({
                        timestamp: task.completedAt,
                        type: 'completeTask',
                        subject: child.name,
                        target: fam.name,
                        details: task.name + (task.xp ? ` (${task.xp} XP)` : '')
                      });
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.log('[GET-ADMIN-STATS] Error generating activity for family:', famId, err.message);
          }
        }
        // Sort by timestamp descending (most recent first)
        generatedActivities.sort((a, b) => b.timestamp - a.timestamp);
        activityHistory = generatedActivities.slice(0, 500);
      }

      return {
        status: 200,
        body: {
          stats: {
            totalAccounts: accounts.length,
            totalFamilies: families.length,
            totalChildren,
            totalTasksCompleted,
            averageTasksPerChild: totalChildren > 0 ? Math.round(totalTasksCompleted / totalChildren) : 0
          },
          families: families.slice(0, 50),
          accounts: accounts.slice(0, 50),
          history: history.slice(-100),  // Last 100 admin actions
          activityHistory: activityHistory.slice(-500),  // Last 500 app activities
          auditLogs: auditLogs  // Complete audit logs from all families
        }
      };
    }
    case 'adminResetPassword': {
      // Verify admin key
      if (!isAdminKey(body.adminKey)) {
        return err(403, 'Clé admin invalide.');
      }
      const targetEmail = body.email?.toLowerCase();
      if (!targetEmail) return err(400, 'Email requis.');

      const acc = await store.get('account:' + targetEmail);
      if (!acc) return err(404, 'Compte non trouvé.');

      // Generate new temporary password
      const newPassword = Math.random().toString(36).substring(2, 10);
      const { salt, hash } = hashPassword(newPassword);
      acc.salt = salt;
      acc.hash = hash;
      await store.set('account:' + targetEmail, acc);

      // Log action
      await logAdminAction(store, 'resetPassword', targetEmail, `Mot de passe temporaire: ${newPassword}`);

      return { status: 200, body: { message: `Mot de passe réinitialisé. Nouveau MDP temporaire: ${newPassword}` } };
    }
    case 'adminDeleteAccount': {
      // Verify admin key
      if (!isAdminKey(body.adminKey)) {
        return err(403, 'Clé admin invalide.');
      }
      const targetEmail = body.email?.toLowerCase();
      if (!targetEmail) return err(400, 'Email requis.');

      const acc = await store.get('account:' + targetEmail);
      if (!acc) return err(404, 'Compte non trouvé.');

      // Delete families owned by this account
      for (const famId of acc.familyIds || []) {
        await store.del('family:' + famId);
        await store.del('levelConfig:' + famId);
      }

      // Delete account
      await store.del('account:' + targetEmail);

      // Remove from metadata
      const metadata = (await store.get('_admin_metadata')) || { familyIds: [], accountEmails: [] };
      metadata.accountEmails = metadata.accountEmails?.filter(e => e !== targetEmail) || [];
      await store.set('_admin_metadata', metadata);

      // Log action
      await logAdminAction(store, 'deleteAccount', targetEmail, `Supprimer ${acc.familyIds?.length || 0} familles`);

      return { status: 200, body: { message: `Compte ${targetEmail} et ses familles supprimés` } };
    }
    case 'adminResetPin': {
      // Verify admin key
      if (!isAdminKey(body.adminKey)) {
        return err(403, 'Clé admin invalide.');
      }
      const famId = body.familyId;
      const childId = body.childId;
      if (!famId || !childId) return err(400, 'Family ID et Child ID requis.');

      const fam = await store.get('family:' + famId);
      if (!fam) return err(404, 'Famille non trouvée.');

      const child = fam.children?.find(c => c.id === childId);
      if (!child) return err(404, 'Enfant non trouvé.');

      // Generate new PIN
      const newPin = Math.random().toString().slice(2, 6);
      const oldPin = child.pin;
      child.pin = newPin;
      await store.set('family:' + famId, fam);

      // Log action
      await logAdminAction(store, 'resetPin', `${fam.name} - ${child.name}`, `Ancien PIN: ${oldPin}, Nouveau PIN: ${newPin}`);

      return { status: 200, body: { message: `PIN de ${child.name} réinitialisé: ${newPin}` } };
    }
    case 'adminDeleteFamily': {
      // Verify admin key
      if (!isAdminKey(body.adminKey)) {
        return err(403, 'Clé admin invalide.');
      }
      const famId = body.familyId;
      if (!famId) return err(400, 'Family ID requis.');

      const fam = await store.get('family:' + famId);
      if (!fam) return err(404, 'Famille non trouvée.');

      // Remove from account's familyIds
      for (const email of fam.members || []) {
        const acc = await store.get('account:' + email);
        if (acc) {
          acc.familyIds = (acc.familyIds || []).filter(id => id !== famId);
          await store.set('account:' + email, acc);
        }
      }

      // Delete from store
      await store.del('family:' + famId);
      await store.del('levelConfig:' + famId);

      // Remove from metadata
      const metadata = (await store.get('_admin_metadata')) || { familyIds: [], accountEmails: [] };
      metadata.familyIds = metadata.familyIds?.filter(id => id !== famId) || [];
      await store.set('_admin_metadata', metadata);

      // Log action
      await logAdminAction(store, 'deleteFamily', fam.name, `Supprimée avec ${fam.children?.length || 0} enfants`);

      return { status: 200, body: { message: `Famille ${fam.name} supprimée` } };
    }
    default: return err(400, 'Action inconnue : ' + action);
  }
}
