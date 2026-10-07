// Cœur de l'API — logique pure partagée entre la fonction Netlify (Blobs) et le
// serveur de dev local (fichier). Aucune dépendance Netlify ici : tout passe par
// une interface `store` minimale { get(key), set(key,val), del(key) } (valeurs JSON).
import crypto from 'node:crypto';

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
    questList: [], proposals: [], children: [], sanctionsList: [], rewards: [], requests: [], gradeRequests: [], taskRequests: [],
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
    gradeRequests: [],
    taskRequests: [],
    children: [
      { id: 'child-emma-demo', name: 'Emma', xp: 450, gold: 280,
        tasks: [
          { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: Date.now() - 0 },
          { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: Date.now() - 0 },
          { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: Date.now() - 86400000 },
          { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: Date.now() - 86400000 },
          { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: Date.now() - 172800000 },
          { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: Date.now() - 172800000 },
          { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: Date.now() - 172800000 },
          { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: Date.now() - 259200000 },
          { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: Date.now() - 259200000 },
          { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: Date.now() - 345600000 },
          { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: Date.now() - 345600000 },
          { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: Date.now() - 345600000 },
          { icon: '🍽️', name: 'Mettre la table', xp: 10, gold: 5, done: true, completedAt: Date.now() - 432000000 },
          { icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: Date.now() - 518400000 },
          { icon: '📚', name: 'Faire ses devoirs', xp: 30, gold: 15, done: true, daily: true, completedAt: Date.now() - 518400000 },
          { icon: '🐶', name: 'Sortir le chien', xp: 16, gold: 8, done: true, completedAt: Date.now() - 604800000 },
        ],
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
  };
}

// crée le compte démo (parent@demo.fr / demo) + sa famille au tout premier appel
async function ensureSeed(store) {
  const fam = seedFamily();
  if (await store.get('seeded')) {
    // Always refresh demo family data to keep test data up-to-date
    await store.set('family:' + fam.id, fam);
    // Re-index children
    for (const child of fam.children) {
      if (child.id) {
        const idx = (await store.get('child-id-index')) || {};
        idx[child.id] = fam.id;
        await store.set('child-id-index', idx);
      }
    }
    return;
  }
  const { salt, hash } = hashPassword('demo');
  await store.set('family:' + fam.id, fam);
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
  const pwCheck = acc && checkPassword(b.password, acc.salt, acc.hash);
  if (!acc) console.log(`[LOGIN] Account not found for ${email}`);
  if (acc && !pwCheck) console.log(`[LOGIN] Password mismatch for ${email}`);
  if (!acc || !pwCheck) return err(401, 'Email ou mot de passe incorrect.');
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
    const acc = await store.get('account:' + email);
    if (!acc) return err(404, 'Email non trouvé.');
    const code = Math.random().toString().slice(2, 8).padStart(6, '0');
    resetCodes[email] = { code, expiresAt: Date.now() + 15 * 60 * 1000 };
    if (emailSender) await emailSender({
      to: email,
      subject: 'Code de réinitialisation - DailyKids Quest',
      body: `Ton code de réinitialisation: ${code}\nValide 15 minutes.`
    });
    return { status: 200, body: { message: 'Code envoyé' } };
  }

  if (b.step === 2) {
    // Valider code et changer password
    const email = String(b.email || '').toLowerCase();
    const data = resetCodes[email];
    if (!data) return err(400, 'Pas de demande en cours.');
    if (data.expiresAt < now) return err(400, 'Code expiré.');
    if (data.code !== String(b.code)) return err(400, 'Code incorrect.');
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
async function saveFamily(store, email, b) {
  const saveId = Math.random().toString(36).substring(7);
  const saveTime = new Date().toISOString();
  const inc = b.family;
  if (!inc || !inc.id) return err(400, 'Famille invalide.');
  const lucas = inc.children?.find(c => c.name === 'Lucas');
  console.log(`[SAVE-RECV-${saveId}] ${saveTime} Lucas from frontend:`, JSON.stringify(lucas?.tasks?.map(t => ({ name: t.name, done: t.done, completedAt: t.completedAt })) || []));
  const cur = await store.get('family:' + inc.id);
  if (!cur) return err(404, 'Famille introuvable.');
  if (!cur.members.includes(email)) return err(403, 'Accès refusé.');
  // owner / members / id restent maîtrisés par le serveur : un membre ne peut pas s'auto-promouvoir
  const merged = { ...inc, id: cur.id, owner: cur.owner, members: cur.members };
  delete merged.memberInfo; delete merged.role; delete merged.tab; delete merged.activeChild;
  console.log(`[SAVE] Inc children: ${inc.children?.length}, Merged children: ${merged.children?.length}`);
  merged.children?.forEach(c => {
    console.log(`[SAVE] Child: ${c.name}`);
    console.log(`[SAVE]  - Tasks: ${JSON.stringify(c.tasks?.map(t => ({ name: t.name, done: t.done, completedAt: t.completedAt })) || [])}`);
  });
  // notifier les parents pour les nouvelles demandes et les approbations
  if (emailSender && inc.requests) {
    const owner = await store.get('account:' + cur.owner);
    for (const req of inc.requests) {
      const oldReq = cur.requests?.find(r => r.child === req.child && r.name === req.name);
      // Nouvelle demande en attente
      if (!oldReq && req.status === 'pending') {
        if (owner?.email) {
          await emailSender({
            to: owner.email,
            subject: `Nouvelle demande à valider: ${req.child} - ${req.name}`,
            body: `${req.child} a soumis une demande de récompense à valider:\n\nRécompense: ${req.name}\nCoût: ${req.cost} or\n\nVeuillez vous connecter pour approuver ou refuser cette demande.`
          });
        }
      }
      // Demande approuvée
      if (oldReq?.status === 'pending' && req.status === 'approved') {
        if (owner?.email) { await emailSender({ to: owner.email, subject: `Demande approuvée: ${req.name}`, body: `La demande « ${req.name} » de ${req.child} a été approuvée!` }); }
      }
    }
  }
  const lucas_before = merged.children?.find(c => c.name === 'Lucas');
  console.log(`[SAVE-BEFORE-STORE] Lucas tasks:`, JSON.stringify(lucas_before?.tasks?.map(t => ({ name: t.name, done: t.done, completedAt: t.completedAt })) || []));
  console.log(`[SAVE-TIMESTAMP] Saved at ${new Date().toISOString()}, storing family ID: ${inc.id}`);
  await store.set('family:' + inc.id, merged);
  // Verify what was actually stored
  const verify = await store.get('family:' + inc.id);
  const lucas_verify = verify?.children?.find(c => c.name === 'Lucas');
  console.log(`[SAVE-AFTER-STORE] Lucas tasks (read back):`, JSON.stringify(lucas_verify?.tasks?.map(t => ({ name: t.name, done: t.done, completedAt: t.completedAt })) || []));
  console.log(`[SAVE-VERIFY-TIMESTAMP] Read back at ${new Date().toISOString()}`);
  // Return the merged data directly without reloading from storage
  // (avoids stale data if storage didn't persist the changes yet)
  merged.memberInfo = {};
  for (const m of merged.members) { const a = await store.get('account:' + m); merged.memberInfo[m] = a ? a.name : null; }
  return { status: 200, body: { family: merged } };
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
  const inviter = await store.get('account:' + email);
  fam.members.push(inv);
  await store.set('family:' + fid, fam);
  const acc = await store.get('account:' + inv);
  if (acc) { if (!acc.familyIds.includes(fid)) { acc.familyIds.push(fid); await store.set('account:' + inv, acc); } }
  else { const p = (await store.get('invite:' + inv)) || []; if (!p.includes(fid)) { p.push(fid); await store.set('invite:' + inv, p); } }
  if (emailSender) { await emailSender({ to: inv, subject: `Invitation à la famille « ${fam.name} »`, body: `${inviter?.name || email} vous a invité à rejoindre la famille « ${fam.name} » sur DailyKids Quest IV.` }); }
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
async function submitGrade(store, famId, b) {
  const fam = await store.get('family:' + famId);
  if (!fam) return err(404, 'Famille introuvable.');
  const { childName, subject, grade, gold } = b;
  if (!childName || !subject || !grade || gold === undefined) return err(400, 'Tous les champs requis.');
  if (isNaN(gold) || gold < 0) return err(400, 'Or invalide.');
  fam.gradeRequests = fam.gradeRequests || [];
  fam.gradeRequests.push({
    child: childName, subject, grade, gold, status: 'pending', submittedAt: Date.now()
  });
  await store.set('family:' + famId, fam);

  // Envoyer un email au parent
  if (emailSender) {
    const owner = await store.get('account:' + fam.owner);
    if (owner?.email) {
      await emailSender({
        to: owner.email,
        subject: `Nouvelle note à valider: ${childName} - ${subject}`,
        body: `${childName} a soumis une note à valider:\n\nMatière: ${subject}\nNote: ${grade}\nOr demandé: ${gold}\n\nVeuillez vous connecter pour valider ou refuser cette note.`
      });
    }
  }

  return { status: 200, body: { ok: true } };
}
async function approveGrade(store, email, b) {
  const { familyId, index } = b;
  const fam = await store.get('family:' + familyId);
  if (!fam) return err(404, 'Famille introuvable.');
  if (!fam.members.includes(email)) return err(403, 'Accès refusé.');
  if (!fam.gradeRequests || !fam.gradeRequests[index]) return err(404, 'Note introuvable.');
  const req = fam.gradeRequests[index];
  if (req.status !== 'pending') return err(400, 'Seules les notes en attente peuvent être approuvées.');
  const child = fam.children.find(c => c.name === req.child);
  if (child) { child.gold = (child.gold || 0) + req.gold; }
  req.status = 'approved';
  req.approvedAt = Date.now();
  await store.set('family:' + familyId, fam);
  return { status: 200, body: { ok: true } };
}

/* ── Task statistics aggregation ── */

function dateToISO(ms) {
  return new Date(ms).toISOString().split('T')[0];  // "YYYY-MM-DD"
}

function getDateRange(period, endDate = Date.now()) {
  // Use UTC to avoid timezone issues with completedAt timestamps
  const end = new Date(endDate);
  const start = new Date(end);

  // Get UTC date components
  const y = end.getUTCFullYear();
  const m = end.getUTCMonth();
  const d = end.getUTCDate();
  const dayOfWeek = end.getUTCDay();

  if (period === 'day') {
    // Today 00:00 UTC to 23:59:59.999 UTC
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (period === 'week') {
    // Sunday to Saturday of current week (UTC)
    const sundayDate = d - dayOfWeek;
    start.setUTCFullYear(y, m, sundayDate);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (period === 'month') {
    // 1st to last day of month (UTC)
    start.setUTCFullYear(y, m, 1);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCFullYear(y, m, new Date(y, m + 1, 0).getUTCDate());
    end.setUTCHours(23, 59, 59, 999);
  } else if (period === 'year') {
    // Jan 1 to Dec 31 (UTC)
    start.setUTCFullYear(y, 0, 1);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCFullYear(y, 11, 31);
    end.setUTCHours(23, 59, 59, 999);
  }

  return { start: start.getTime(), end: end.getTime() };
}

function aggregateTaskStats(child, period = 'week') {
  console.log(`[STATS-ENTER] Child: ${child?.name}, Tasks type: ${Array.isArray(child?.tasks) ? 'array' : typeof child?.tasks}, Length: ${child?.tasks?.length || 0}`);
  const { start, end } = getDateRange(period);
  console.log(`[STATS-RANGE] Period: ${period}, Start (epoch): ${start}, End (epoch): ${end}`);
  console.log(`[STATS-RANGE] Start ISO: ${new Date(start).toISOString()}, End ISO: ${new Date(end).toISOString()}`);
  console.log(`[STATS] Child: ${child.name}, Period: ${period}, Range: ${new Date(start).toISOString()} to ${new Date(end).toISOString()}`);

  // Ensure tasks array exists and all have completedAt field
  const rawTasks = child.tasks || [];
  console.log(`[STATS-RAW] Raw tasks before map: ${JSON.stringify(rawTasks.map(t => ({ name: t.name, done: t.done, completedAt: t.completedAt, completedAtType: typeof t.completedAt })))}`);

  const tasks = rawTasks.map(t => ({
    ...t,
    completedAt: t.completedAt ? Number(t.completedAt) : null
  }));

  console.log(`[STATS] All ${tasks.length} tasks after map:`, JSON.stringify(tasks.map(t => ({ name: t.name, done: t.done, completedAt: t.completedAt }))));

  const dailyBreakdown = {};
  let tasksCount = 0;
  let xpGained = 0;
  let goldGained = 0;
  const taskNameCounts = {};  // { "Ranger sa chambre": 3, ... }
  let bestDay = { date: '', tasksCount: 0, xp: 0, gold: 0 };

  for (const task of tasks) {
    const inRange = task.completedAt && task.completedAt >= start && task.completedAt <= end;
    console.log(`[STATS-CHECK] "${task.name}": done=${task.done}, completedAt=${task.completedAt}, start=${start}, end=${end}, inRange=${inRange}`);
    if (task.completedAt && task.completedAt >= start && task.completedAt <= end) {
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

const PUBLIC = new Set(['login', 'signup', 'unlockChildDirect', 'submitGrade', 'reset-password', 'getTaskStats', 'getFamilyData']);

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
    case 'reset-password': return resetPassword(store, secret, body);
    case 'unlockChildDirect': return unlockChildDirect(store, body);
    case 'getTaskStats': {
      const { childId, period = 'week' } = body;
      if (!childId) return err(400, 'childId requis.');
      const idx = (await store.get('child-id-index')) || {};
      const familyId = idx[childId];
      if (!familyId) return err(404, 'Enfant non trouvé.');
      const family = await store.get('family:' + familyId);
      if (!family) return err(404, 'Famille non trouvée.');
      const child = family.children.find(c => c.id === childId);
      if (!child) return err(404, 'Enfant non trouvé.');
      const stats = aggregateTaskStats(child, period);
      const childrenStats = family.children.map(c => ({ tasks: aggregateTaskStats(c, period).tasksCount || 0, xp: aggregateTaskStats(c, period).xpGained || 0, gold: aggregateTaskStats(c, period).goldGained || 0 }));
      return { status: 200, body: { ...stats, childrenStats } };
    }
    case 'me': return { status: 200, body: await stateFor(store, email) };
    case 'verifyPassword': {
      const acc = await store.get('account:' + email);
      return { status: 200, body: { ok: !!(acc && checkPassword(body.password, acc.salt, acc.hash)) } };
    }
    case 'saveFamily': return saveFamily(store, email, body);
    case 'createFamily': return createFamily(store, email, body);
    case 'invite': return invite(store, email, body);
    case 'removeAdult': return removeAdult(store, email, body);
    case 'submitGrade': return submitGrade(store, body.familyId, body);
    case 'approveGrade': return approveGrade(store, email, body);
    default: return err(400, 'Action inconnue : ' + action);
  }
}
