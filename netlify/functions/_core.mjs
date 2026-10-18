// Cœur de l'API — logique pure partagée entre la fonction Netlify (Blobs) et le
// serveur de dev local (fichier). Aucune dépendance Netlify ici : tout passe par
// une interface `store` minimale { get(key), set(key,val), del(key) } (valeurs JSON).
import crypto from 'node:crypto';
import { db, auth } from './firebase-admin.mjs';

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

// Normalize family data: convert Firebase object-stored arrays to actual arrays
function normalizeFamilyData(f) {
  if (!f || typeof f !== 'object') return f;
  const arrayFields = ['children', 'questList', 'proposals', 'rewards', 'requests', 'gradeRequests', 'taskRequests', 'sanctionsList'];
  for (const field of arrayFields) {
    if (f[field] && typeof f[field] === 'object' && !Array.isArray(f[field])) {
      const arr = Object.values(f[field]).filter(v => v !== null && v !== undefined);
      f[field] = arr;
    }
    if (!f[field] || !Array.isArray(f[field])) f[field] = [];
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

/* ── Firebase authentication ── */

async function verifyFirebaseToken(token) {
  if (!token) return null;
  try {
    const decodedToken = await auth.verifyIdToken(token);
    console.log('[VERIFY-TOKEN] SUCCESS: uid=', decodedToken.uid);
    return decodedToken.uid;
  } catch (error) {
    console.error('[VERIFY-TOKEN] FAILED:', error.code, error.message);
    throw error;
  }
}

async function getUserUid(request) {
  const authHeader = request.headers.get('authorization') || request.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) throw new Error('Missing authorization token');
  return await verifyFirebaseToken(token);
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
  if (await store.get('seeded')) {
    // Already seeded, don't overwrite user changes
    return;
  }
  const fam = seedFamily();
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

  let uid = null;
  try {
    // Try Firebase auth (requires env config)
    try {
      const user = await auth.createUser({
        email,
        password
      });
      uid = user.uid;

      const familyId = 'family_' + Date.now();

      // Create user doc in Firebase
      await db.ref(`users/${uid}`).set({
        email,
        name,
        familyIds: [familyId],
        createdAt: Date.now()
      });

      // Create family in Firebase
      await db.ref(`families/${familyId}`).set({
        id: familyId,
        name: familyName,
        owner: email,
        members: [email],
        children: [],
        day: '',
        dailyBonus: { xp: 30, gold: 15 },
        questList: [],
        proposals: [],
        sanctionsList: [],
        rewards: [],
        requests: [],
        gradeRequests: [],
        taskRequests: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      // Create default level config
      await db.ref(`levelConfigs/${familyId}`).set({
        name: 'Configuration par défaut',
        levels: Array.from({ length: 50 }, (_, i) => ({
          level: i + 1,
          xpRequired: (i + 1) * 100
        })),
        createdAt: Date.now()
      });
    } catch (fbErr) {
      if (fbErr.message?.includes('auth/email-already-exists')) {
        return err(409, 'Un compte existe déjà avec cet email.');
      }
      // Firebase not configured - use legacy store only
    }
  } catch (error) {
    console.error('[SIGNUP-ERROR]', error.message);
    return err(500, error.message);
  }

  // Create account in legacy store (always)
  const fam = newFamily(familyName, email);
  const pending = (await store.get('invite:' + email)) || [];
  await store.set('family:' + fam.id, fam);
  await updateFamilyNameIndex(store, fam.name, fam.id);
  await store.set('account:' + email, { email, name, ...hashPassword(password), familyIds: [fam.id, ...pending], ...(uid && { firebaseUid: uid }) });
  if (pending.length) await store.del('invite:' + email);

  // Log activity
  await logActivity(store, 'signup', email, uid || 'unknown', `Account created with family ${familyName}`);

  // Return token and user data
  const state = await stateFor(store, email);
  return {
    status: 200,
    body: {
      token: signToken(email, secret),
      ...(uid && { uid }),
      ...state
    }
  };
}
async function login(store, secret, b) {
  const email = String(b.email || '').toLowerCase();
  const acc = await store.get('account:' + email);
  const pwCheck = acc && checkPassword(b.password, acc.salt, acc.hash);
  if (!acc) console.log(`[LOGIN] Account not found for ${email}`);
  if (acc && !pwCheck) console.log(`[LOGIN] Password mismatch for ${email}`);
  if (!acc || !pwCheck) return err(401, 'Email ou mot de passe incorrect.');

  let uid = null;
  try {
    // Try to sync with Firebase
    try {
      let firebaseUser;
      try {
        firebaseUser = await auth.getUserByEmail(email);
      } catch (err) {
        if (err.message?.includes('user-not-found')) {
          // Create Firebase user if doesn't exist (migration scenario)
          firebaseUser = await auth.createUser({
            email,
            password: b.password
          });
        } else {
          throw err;
        }
      }

      uid = firebaseUser.uid;

      // Ensure user doc exists in Firebase
      const userDocRef = db.ref(`users/${uid}`);
      const userDocSnapshot = await userDocRef.once('value');
      if (!userDocSnapshot.exists()) {
        await userDocRef.set({
          email,
          name: acc.name,
          familyIds: acc.familyIds || [],
          createdAt: Date.now()
        });
      }

      // Update legacy account with Firebase UID
      acc.firebaseUid = uid;
      await store.set('account:' + email, acc);
    } catch (fbErr) {
      // Firebase not configured - use legacy store only
    }
  } catch (error) {
    console.error('[LOGIN-ERROR]', error.message);
    return err(500, error.message);
  }

  // Log activity
  await logActivity(store, 'login', email, acc.name, 'Parent login');

  // Return using legacy store (Firebase sync attempted but optional)
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
  let inc = b.family;
  if (!inc || !inc.id) return err(400, 'Famille invalide.');
  // Normalize incoming family data
  normalizeFamilyData(inc);
  const lucas = inc.children?.find(c => c.name === 'Lucas');
  const cur = await store.get('family:' + inc.id);
  if (!cur) return err(404, 'Famille introuvable.');
  if (!cur.members.includes(email)) return err(403, 'Accès refusé.');
  // owner / members / id restent maîtrisés par le serveur : un membre ne peut pas s'auto-promouvoir
  const merged = { ...inc, id: cur.id, owner: cur.owner, members: cur.members };
  delete merged.memberInfo; delete merged.role; delete merged.tab; delete merged.activeChild;

  // Merge children: preserve existing tasks not in incoming data
  const incomingChildIds = new Set(inc.children?.map(c => c.id) || []);
  const serverOnlyChildren = cur.children?.filter(c => !inc.children?.some(ic => ic.id === c.id)) || [];
  merged.children = [...(inc.children || []), ...serverOnlyChildren];

  merged.children?.forEach(c => {
  });
  // Generate missing child IDs (for children created before ID generation was implemented)
  for (const child of merged.children || []) {
    if (!child.id) {
      child.id = 'child-' + crypto.randomBytes(4).toString('hex');
    }
  }
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
  // DEBUG: Check first task specifically
  const firstTask = lucas_before?.tasks?.[0];
  await store.set('family:' + inc.id, merged);

  // Sync to Firebase (primary write target)
  try {
    const firebaseFamily = { ...merged };
    delete firebaseFamily.memberInfo;
    delete firebaseFamily.role;
    delete firebaseFamily.tab;
    delete firebaseFamily.activeChild;

    // Write family header
    const famPayload = {
      id: firebaseFamily.id,
      name: firebaseFamily.name,
      owner: firebaseFamily.owner,
      members: firebaseFamily.members,
      day: firebaseFamily.day,
      dailyBonus: firebaseFamily.dailyBonus,
      questList: firebaseFamily.questList,
      proposals: firebaseFamily.proposals,
      sanctionsList: firebaseFamily.sanctionsList,
      rewards: firebaseFamily.rewards,
      requests: firebaseFamily.requests,
      gradeRequests: firebaseFamily.gradeRequests,
      taskRequests: firebaseFamily.taskRequests,
      updatedAt: Date.now()
    };
    await db.ref(`families/${inc.id}`).set(famPayload);

    // Write each child separately under /families/{familyId}/children/{childId}
    for (const child of (merged.children || [])) {
      if (child.id) {
        await db.ref(`families/${inc.id}/children/${child.id}`).set({
          id: child.id,
          name: child.name,
          xp: child.xp || 0,
          gold: child.gold || 0,
          pin: child.pin,
          tasks: child.tasks || [],
          grades: child.grades || [],
          sanctions: child.sanctions || [],
          dailyBonusDay: child.dailyBonusDay,
          updatedAt: Date.now()
        });
      }
    }
  } catch (fbErr) {
  }

  // Verify what was actually stored
  const verify = await store.get('family:' + inc.id);
  const lucas_verify = verify?.children?.find(c => c.name === 'Lucas');
  // Index children by ID for fast lookup
  for (const child of merged.children || []) {
    if (child.id) {
      const childIdx = (await store.get('child-id-index')) || {};
      childIdx[child.id] = inc.id;
      await store.set('child-id-index', childIdx);
    }
  }
  // Log completed tasks
  for (const mergedChild of merged.children || []) {
    const curChild = cur.children?.find(c => c.id === mergedChild.id || c.name === mergedChild.name);
    if (curChild && mergedChild.tasks && curChild.tasks) {
      for (let i = 0; i < mergedChild.tasks.length; i++) {
        const newTask = mergedChild.tasks[i];
        const oldTask = curChild.tasks[i];
        if (newTask.done === true && (!oldTask || oldTask.done !== true)) {
          await logActivity(store, 'completeTask', mergedChild.name, inc.name, `${newTask.name} (${newTask.xp || 0} XP)`);
        }
      }
    }
  }

  // Return the merged data directly without reloading from storage
  // (avoids stale data if storage didn't persist the changes yet)
  merged.memberInfo = {};
  for (const m of merged.members) { const a = await store.get('account:' + m); merged.memberInfo[m] = a ? a.name : null; }
  return { status: 200, body: { family: merged } };
}
async function createFamily(store, email, b, firebaseUid) {
  const name = (b.name || '').trim();
  console.log('[CREATE-FAMILY] firebaseUid:', firebaseUid, 'email:', email);
  if (!name) return err(400, 'Nom de la famille requis.');
  const fam = newFamily(name, email);
  fam.createdAt = Date.now();
  await store.set('family:' + fam.id, fam);
  await updateFamilyNameIndex(store, fam.name, fam.id);

  // Update user record (Firebase or legacy)
  if (firebaseUid) {
    const userRef = db.ref(`users/${firebaseUid}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val() || { email, familyIds: [], createdAt: Date.now() };
    if (!userData.familyIds) userData.familyIds = [];
    userData.familyIds.push(fam.id);
    await userRef.set(userData);
  } else {
    const acc = await store.get('account:' + email);
    if (acc) {
      acc.familyIds.push(fam.id);
      await store.set('account:' + email, acc);
    }
  }
  // Update admin metadata
  const metadata = (await store.get('_admin_metadata')) || { familyIds: [], accountEmails: [] };
  if (!metadata.familyIds.includes(fam.id)) metadata.familyIds.push(fam.id);
  if (!metadata.accountEmails.includes(email)) metadata.accountEmails.push(email);
  await store.set('_admin_metadata', metadata);

  // Write to Firebase
  try {
    const fbFamily = {
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
      createdAt: fam.createdAt,
      updatedAt: Date.now()
    };
    await db.ref(`families/${fam.id}`).set(fbFamily);

    // Create default level config
    await db.ref(`levelConfigs/${fam.id}`).set({
      name: 'Configuration par défaut',
      levels: Array.from({ length: 50 }, (_, i) => ({
        level: i + 1,
        xpRequired: (i + 1) * 100
      })),
      createdAt: Date.now()
    });
  } catch (fbErr) {
  }

  await logActivity(store, 'createFamily', email, fam.id, `Famille créée: ${name}`);

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

  // Update Firebase
  try {
    await db.ref(`families/${fid}/members`).set(fam.members);
  } catch (fbErr) {
  }

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
  await store.set('family:' + fid, fam);
  const acc = await store.get('account:' + rem);
  if (acc) { acc.familyIds = acc.familyIds.filter(x => x !== fid); await store.set('account:' + rem, acc); }
  const p = await store.get('invite:' + rem);
  if (p) await store.set('invite:' + rem, p.filter(x => x !== fid));

  // Update Firebase
  try {
    await db.ref(`families/${fid}/members`).set(fam.members);
  } catch (fbErr) {
  }

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
    // Normalize family data
    normalizeFamilyData(fam);
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
  const gradeRequest = {
    id: `grade_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    child: childName,
    subject,
    grade,
    gold,
    status: 'pending',
    submittedAt: Date.now()
  };
  fam.gradeRequests.push(gradeRequest);
  await store.set('family:' + famId, fam);

  // Log activity
  await logActivity(store, 'submitGrade', childName, `${fam.name}`, `Soumis: ${subject} (Note: ${grade}, Or: ${gold})`);

  // Write to Firebase
  try {
    await db.ref(`families/${famId}/gradeRequests/${gradeRequest.id}`).set(gradeRequest);
  } catch (fbErr) {
  }

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
  // Normalize family data
  normalizeFamilyData(fam);
  if (!fam.gradeRequests || !fam.gradeRequests[index]) return err(404, 'Note introuvable.');
  const req = fam.gradeRequests[index];
  if (req.status !== 'pending') return err(400, 'Seules les notes en attente peuvent être approuvées.');
  const child = fam.children.find(c => c.name === req.child);
  if (child) { child.gold = (child.gold || 0) + req.gold; }
  req.status = 'approved';
  req.approvedAt = Date.now();
  await store.set('family:' + familyId, fam);

  // Update in Firebase
  try {
    // Update grade request status
    await db.ref(`families/${familyId}/gradeRequests/${req.id}`).update({
      status: 'approved',
      approvedAt: Date.now()
    });

    // Update child's gold if exists
    if (child && child.id) {
      await db.ref(`families/${familyId}/children/${child.id}/gold`).set(child.gold);

      // Add grade to child's grades array
      await db.ref(`families/${familyId}/children/${child.id}/grades`).push({
        subject: req.subject,
        grade: req.grade,
        xp: 0,
        gold: req.gold,
        approvedAt: Date.now()
      });
    }
  } catch (fbErr) {
  }

  await logActivity(store, 'approveGrade', email, familyId, `Note approuvée: ${req.child} - ${req.subject}`);

  return { status: 200, body: { ok: true } };
}

async function getLevelConfig(store, b) {
  const { familyId, adminKey } = b;
  if (!familyId) return err(400, 'familyId requis.');

  // Verify admin key
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'demo-admin-key') {
    return err(403, 'Clé admin invalide.');
  }

  try {
    // Get level config from Firebase
    let config = null;
    try {
      const configSnapshot = await db.ref(`levelConfigs/${familyId}`).once('value');
      if (configSnapshot.exists()) {
        config = configSnapshot.val();
      }
    } catch (fbErr) {
    }

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
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'demo-admin-key') {
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

    // Write to Firebase
    try {
      await db.ref(`levelConfigs/${familyId}`).set({
        name: levelConfig.name || 'Ma configuration',
        levels: levelConfig.levels,
        updatedAt: Date.now()
      });
    } catch (fbErr) {
    }

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
  if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'demo-admin-key') {
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

    // Write to Firebase
    try {
      await db.ref(`levelConfigs/${familyId}`).set(defaultConfig);
    } catch (fbErr) {
    }

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
    const daysToSubtract = dayOfWeek;  // dayOfWeek: 0=Sun, 1=Mon, etc.
    start.setUTCDate(d - daysToSubtract);
    start.setUTCHours(0, 0, 0, 0);
    const daysToAdd = 6 - dayOfWeek;   // days until Saturday
    end.setUTCDate(d + daysToAdd);
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
  const { start, end } = getDateRange(period);
  console.log('[AGGREGATE-STATS] Period:', period, 'Range:', { start: new Date(start).toISOString(), end: new Date(end).toISOString() });

  // Ensure tasks array exists and all have completedAt field
  let rawTasks = child.tasks || [];
  // Convert tasks object to array if needed (from Firebase)
  if (rawTasks && typeof rawTasks === 'object' && !Array.isArray(rawTasks)) {
    rawTasks = Object.values(rawTasks);
  }
  console.log('[AGGREGATE-STATS] Total tasks:', rawTasks.length);

  const tasks = rawTasks.map(t => ({
    ...t,
    completedAt: t.completedAt ? Number(t.completedAt) : null
  }));


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

const PUBLIC = new Set(['login', 'signup', 'unlockChildDirect', 'submitGrade', 'reset-password', 'getTaskStats', 'getFamilyData', 'getAdminStats', 'adminResetPassword', 'adminDeleteAccount', 'adminResetPin', 'adminDeleteFamily', 'getLevelConfig', 'updateLevelConfig', 'resetLevelConfig']);

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

  // Log to Firebase as well
  try {
    const entryId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await db.ref(`activityHistory/${entryId}`).set({
      timestamp: Date.now(),
      type,
      subject,
      target,
      details
    });
  } catch (fbErr) {
  }

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

export async function handleApi({ action, token, body = {} }, store) {
  await ensureSeed(store);
  const secret = await getSecret(store);
  let email = null;
  let firebaseUid = null;
  if (!PUBLIC.has(action)) {
    console.log('[HANDLEAPI] action:', action, 'token exists:', !!token, 'token length:', token?.length);
    // Try Firebase token first (Firebase tokens are JWTs)
    if (token) {
      try {
        console.log('[HANDLEAPI] Attempting Firebase token verification...');
        firebaseUid = await verifyFirebaseToken(token);
        console.log('[HANDLEAPI] Firebase verification succeeded, uid:', firebaseUid);
        // If we have a Firebase UID, fetch the email from Firebase (or prepare for user creation)
        if (firebaseUid) {
          const userSnapshot = await db.ref(`users/${firebaseUid}`).once('value');
          if (userSnapshot.exists()) {
            email = userSnapshot.val().email;
            console.log('[HANDLEAPI] Found user email:', email);
          } else {
            console.log('[HANDLEAPI] User doc not found in Firebase, will be created by me endpoint');
          }
        }
      } catch (e) {
        console.log('[HANDLEAPI] Firebase verification failed:', e.message);
        // Not a valid Firebase token or verification failed, fall through to legacy
      }
    }
    // Fall back to legacy secret-based token verification
    if (!email && !firebaseUid) {
      console.log('[HANDLEAPI] Attempting legacy token verification...');
      email = verifyToken(token, secret);
      if (email) console.log('[HANDLEAPI] Legacy verification succeeded, email:', email);
    }
    // Require either email (from legacy auth) or firebaseUid (from Firebase auth)
    if (!email && !firebaseUid) {
      console.log('[HANDLEAPI] Authentication failed - no email or firebaseUid');
      return err(401, 'Non authentifié.');
    }
    console.log('[HANDLEAPI] Authentication passed - email:', email, 'firebaseUid:', firebaseUid);
  }
  switch (action) {
    case 'signup': return signup(store, secret, body);
    case 'login': return login(store, secret, body);
    case 'reset-password': return resetPassword(store, secret, body);
    case 'unlockChildDirect': return unlockChildDirect(store, body);
    case 'getTaskStats': {
      const { childId, period = 'week' } = body;
      console.log('[GET-TASK-STATS] childId:', childId, 'period:', period, 'familyId from me:', firebaseUid);
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

      // Try to read from Firebase first
      let child = null;
      let family = null;
      try {
        const familySnapshot = await db.ref(`families/${familyId}`).once('value');
        if (familySnapshot.exists()) {
          family = familySnapshot.val();
          // Ensure children is always an array
          if (family.children && typeof family.children === 'object' && !Array.isArray(family.children)) {
            family.children = Object.values(family.children);
          }
          if (family && family.children) {
            child = family.children.find(c => c.id === childId);
          }
        }
      } catch (fbErr) {
        console.error('[GET-TASK-STATS] Firebase read error:', fbErr.message);
      }

      // Fall back to store if Firebase unavailable
      if (!child) {
        family = await store.get('family:' + familyId);
        if (!family) return err(404, 'Famille non trouvée.');
        // Ensure children is always an array
        if (family.children && typeof family.children === 'object' && !Array.isArray(family.children)) {
          family.children = Object.values(family.children);
        }
        if (!family.children) family.children = [];
        child = family.children.find(c => c.id === childId);
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
        // Try Firebase first
        const childrenSnapshot = await db.ref(`families/${familyId}/children`).once('value');
        if (childrenSnapshot.exists()) {
          const childrenData = childrenSnapshot.val();
          childrenStats = Object.values(childrenData).map(c => ({
            tasks: aggregateTaskStats(c, period).tasksCount || 0,
            xp: aggregateTaskStats(c, period).xpGained || 0,
            gold: aggregateTaskStats(c, period).goldGained || 0
          }));
        }
      } catch (fbErr) {
        // Fall back to store
        if (!family) family = await store.get('family:' + familyId);
        if (family) {
          // Ensure children is always an array
          let children = family.children;
          if (children && typeof children === 'object' && !Array.isArray(children)) {
            children = Object.values(children);
          }
          if (children) {
            childrenStats = children.map(c => ({
              tasks: aggregateTaskStats(c, period).tasksCount || 0,
              xp: aggregateTaskStats(c, period).xpGained || 0,
              gold: aggregateTaskStats(c, period).goldGained || 0
            }));
          }
        }
      }

      return { status: 200, body: { ...stats, childrenStats } };
    }
    case 'me': {
      try {
        // For backward compatibility, support both Firebase and legacy auth
        let userEmail = email || body.email; // Support email from body (Firebase login flow)
        let uid = firebaseUid;

        // Try Firebase token from body if Authorization header verification didn't work
        if (!uid && body.firebaseToken) {
          uid = await verifyFirebaseToken(body.firebaseToken);
          if (uid) {
            const userSnapshot = await db.ref(`users/${uid}`).once('value');
            if (userSnapshot.exists()) {
              const userData = userSnapshot.val();
              userEmail = userData.email;
            }
          }
        }

        console.log('[ME-ENDPOINT] uid:', uid, 'userEmail:', userEmail);
        if (!userEmail && !uid) return err(401, 'Non authentifié.');

        // Fetch user from Firebase if we have uid
        if (uid) {
          const userSnapshot = await db.ref(`users/${uid}`).once('value');
          let userData;
          if (!userSnapshot.exists()) {
            // Create new user record (first login with this Firebase account)
            if (!userEmail) {
              return err(401, 'Non authentifié - impossible de créer utilisateur.');
            }
            userData = {
              email: userEmail,
              name: userEmail.split('@')[0], // Use part of email as default name
              familyIds: [],
              createdAt: Date.now()
            };
            console.log('[ME-ENDPOINT] Creating new user:', userEmail);
            await db.ref(`users/${uid}`).set(userData);
          } else {
            userData = userSnapshot.val();
          }
          const families = [];
          console.log('[ME-ENDPOINT] userData.familyIds:', userData.familyIds);

          for (const familyId of userData.familyIds || []) {
            console.log('[ME-ENDPOINT] Fetching family:', familyId);
            const famSnapshot = await db.ref(`families/${familyId}`).once('value');
            console.log('[ME-ENDPOINT] Family exists:', famSnapshot.exists());
            if (famSnapshot.exists()) {
              const famData = famSnapshot.val();
              // Fetch children separately from Firebase (stored at /families/{id}/children/{id})
              const childrenSnapshot = await db.ref(`families/${familyId}/children`).once('value');
              if (childrenSnapshot.exists()) {
                const childrenObj = childrenSnapshot.val();
                // Convert children object to array
                famData.children = Object.values(childrenObj).filter(c => c != null);
              } else {
                famData.children = [];
              }
              // Normalize all family data (convert objects to arrays)
              normalizeFamilyData(famData);
              const memberInfo = {};
              for (const m of famData.members || []) {
                const memberAcc = await store.get('account:' + m);
                memberInfo[m] = memberAcc ? memberAcc.name : null;
              }
              families.push({ ...famData, memberInfo });
            }
          }

          return {
            status: 200,
            body: {
              me: { email: userData.email, name: userData.name },
              families
            }
          };
        }

        // Fall back to legacy store auth
        return { status: 200, body: await stateFor(store, userEmail) };
      } catch (error) {
        console.error('[ME-ERROR]', error.message);
        return err(401, 'Non authentifié.');
      }
    }
    case 'verifyPassword': {
      // For Firebase Auth: verify token passed in body
      console.log('[VERIFY-PASSWORD] Attempting - has firebaseToken:', !!body.firebaseToken, 'email:', email);
      if (body.firebaseToken) {
        try {
          const decodedToken = await auth.verifyIdToken(body.firebaseToken);
          console.log('[VERIFY-PASSWORD] Firebase token valid, email:', decodedToken.email, 'matches:', decodedToken.email === email);
          // Token verified and matches email
          return { status: 200, body: { ok: decodedToken.email === email } };
        } catch (e) {
          console.error('[VERIFY-PASSWORD] Firebase token failed:', e.message);
        }
      }
      // Fallback: legacy password verification from store
      console.log('[VERIFY-PASSWORD] Falling back to legacy verification');
      const acc = await store.get('account:' + email);
      const ok = !!(acc && checkPassword(body.password, acc.salt, acc.hash));
      console.log('[VERIFY-PASSWORD] Legacy result: ok=', ok, 'account found:', !!acc);
      return { status: 200, body: { ok } };
    }
    case 'changePassword': {
      if (!firebaseUid) return err(401, 'Non authentifié.');
      const { newPassword } = body;
      if (!newPassword || newPassword.length < 6) {
        return err(400, 'Le mot de passe doit faire au moins 6 caractères.');
      }
      try {
        await auth.updateUser(firebaseUid, { password: newPassword });
        console.log('[CHANGE-PASSWORD] Password updated for UID:', firebaseUid);
        return { status: 200, body: { ok: true } };
      } catch (e) {
        console.error('[CHANGE-PASSWORD] Error:', e.message);
        return err(400, 'Erreur: ' + e.message);
      }
    }
    case 'saveFamily': return saveFamily(store, email, body);
    case 'createFamily': return createFamily(store, email, body, firebaseUid);
    case 'invite': return invite(store, email, body);
    case 'removeAdult': return removeAdult(store, email, body);
    case 'submitGrade': return submitGrade(store, body.familyId, body);
    case 'approveGrade': return approveGrade(store, email, body);
    case 'getLevelConfig': return getLevelConfig(store, body);
    case 'updateLevelConfig': return updateLevelConfig(store, body);
    case 'resetLevelConfig': return resetLevelConfig(store, body);
    case 'getAdminStats': {
      // Verify admin key
      if (body.adminKey !== process.env.ADMIN_KEY && body.adminKey !== 'demo-admin-key') {
        return err(403, 'Clé admin invalide.');
      }
      const families = [];
      const accounts = [];
      let totalChildren = 0;
      let totalTasksCompleted = 0;

      let metadata = (await store.get('_admin_metadata')) || { familyIds: [], accountEmails: [] };

      // If metadata empty, scan store to populate it (first access after migration)
      if ((!metadata.familyIds || metadata.familyIds.length === 0) && store.list) {
        const keys = await store.list();
        const scannedFamilyIds = [];
        const scannedEmails = [];
        for (const key of keys) {
          if (key.startsWith('family:')) scannedFamilyIds.push(key.slice(7));
          if (key.startsWith('account:')) scannedEmails.push(key.slice(8));
        }
        if (scannedFamilyIds.length > 0 || scannedEmails.length > 0) {
          metadata = { familyIds: scannedFamilyIds, accountEmails: scannedEmails };
          await store.set('_admin_metadata', metadata);
        }
      }

      // Load families
      for (const famId of metadata.familyIds || []) {
        const fam = await store.get('family:' + famId);
        if (fam) {
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
      }

      // Load accounts
      for (const email of metadata.accountEmails || []) {
        const acc = await store.get('account:' + email);
        if (acc) accounts.push({ email: acc.email, name: acc.name });
      }

      // Get history
      const history = (await store.get('_admin_history')) || [];
      let activityHistory = (await store.get('_activity_history')) || [];

      // If activity history is empty, generate from existing completed tasks
      if (activityHistory.length === 0) {
        const generatedActivities = [];
        for (const famId of metadata.familyIds || []) {
          const fam = await store.get('family:' + famId);
          if (fam && fam.children) {
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
          activityHistory: activityHistory.slice(-500)  // Last 500 app activities
        }
      };
    }
    case 'adminResetPassword': {
      // Verify admin key
      if (body.adminKey !== process.env.ADMIN_KEY && body.adminKey !== 'demo-admin-key') {
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
      if (body.adminKey !== process.env.ADMIN_KEY && body.adminKey !== 'demo-admin-key') {
        return err(403, 'Clé admin invalide.');
      }
      const targetEmail = body.email?.toLowerCase();
      if (!targetEmail) return err(400, 'Email requis.');

      const acc = await store.get('account:' + targetEmail);
      if (!acc) return err(404, 'Compte non trouvé.');

      // Delete families owned by this account
      for (const famId of acc.familyIds || []) {
        await store.del('family:' + famId);
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
      if (body.adminKey !== process.env.ADMIN_KEY && body.adminKey !== 'demo-admin-key') {
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
      if (body.adminKey !== process.env.ADMIN_KEY && body.adminKey !== 'demo-admin-key') {
        return err(403, 'Clé admin invalide.');
      }
      const famId = body.familyId;
      if (!famId) return err(400, 'Family ID requis.');

      const fam = await store.get('family:' + famId);
      if (!fam) return err(404, 'Famille non trouvée.');

      // Delete family
      await store.del('family:' + famId);

      // Remove from account's familyIds
      for (const email of fam.members || []) {
        const acc = await store.get('account:' + email);
        if (acc) {
          acc.familyIds = (acc.familyIds || []).filter(id => id !== famId);
          await store.set('account:' + email, acc);
        }
      }

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
