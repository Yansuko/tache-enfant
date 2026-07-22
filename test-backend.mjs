// Test du cœur d'API contre un store mémoire — exécuter : node test-backend.mjs
import assert from 'node:assert';
import { handleApi, hashPassword, checkPassword, signToken, verifyToken } from './netlify/functions/_core.mjs';

function memStore() {
  const m = new Map();
  return {
    get: async k => (m.has(k) ? structuredClone(m.get(k)) : null),
    set: async (k, v) => { m.set(k, structuredClone(v)); },
    del: async k => { m.delete(k); },
  };
}
const call = (store, action, body, token) => handleApi({ action, token, body }, store);

// ── crypto ──
const { salt, hash } = hashPassword('s3cret');
assert.ok(checkPassword('s3cret', salt, hash) && !checkPassword('wrong', salt, hash), 'scrypt round-trip');
const tok = signToken('a@b.fr', 'topsecret');
assert.equal(verifyToken(tok, 'topsecret'), 'a@b.fr', 'token valide');
assert.equal(verifyToken(tok, 'autre'), null, 'token mauvais secret rejeté');
assert.equal(verifyToken(signToken('a@b.fr', 'k', -1), 'k'), null, 'token expiré rejeté');

// ── flux applicatif ──
const s = memStore();

// démo seedée
let r = await call(s, 'login', { email: 'parent@demo.fr', password: 'demo' });
assert.equal(r.status, 200, 'login démo');
assert.equal(r.body.families[0].children.length, 2, 'famille démo a Emma & Lucas');

// signup A
r = await call(s, 'signup', { email: 'a@x.fr', password: 'pass', name: 'Alice', familyName: 'Chez Alice' });
assert.equal(r.status, 200, 'signup A');
const tokenA = r.body.token;
const famA = r.body.families[0].id;
assert.equal(r.body.families.length, 1, 'A a 1 famille');

// signup en double refusé
assert.equal((await call(s, 'signup', { email: 'a@x.fr', password: 'pass', name: 'X', familyName: 'Y' })).status, 409, 'email déjà pris');

// mauvais mot de passe
assert.equal((await call(s, 'login', { email: 'a@x.fr', password: 'nope' })).status, 401, 'mauvais mdp');

// non authentifié
assert.equal((await call(s, 'me', {}, 'jeton-bidon')).status, 401, 'token invalide → 401');

// A ajoute un enfant puis sauvegarde
let fam = (await call(s, 'me', {}, tokenA)).body.families[0];
fam.children.push({ name: 'Zoé', xp: 0, gold: 0, tasks: [], grades: [], sanctions: [] });
assert.equal((await call(s, 'saveFamily', { family: fam }, tokenA)).status, 200, 'saveFamily');
assert.equal((await call(s, 'me', {}, tokenA)).body.families[0].children.length, 1, 'enfant persisté');

// A invite B (sans compte) → email en attente
r = await call(s, 'invite', { familyId: famA, email: 'b@x.fr' }, tokenA);
assert.equal(r.status, 200, 'invite B');
assert.deepEqual(r.body.family.members, ['a@x.fr', 'b@x.fr'], 'B membre');

// B s'inscrit → rejoint automatiquement la famille de A + la sienne
r = await call(s, 'signup', { email: 'b@x.fr', password: 'passb', name: 'Bob', familyName: 'Chez Bob' });
assert.equal(r.status, 200, 'signup B');
const tokenB = r.body.token;
const namesB = r.body.families.map(f => f.name).sort();
assert.deepEqual(namesB, ['Chez Alice', 'Chez Bob'], 'B voit les 2 familles');

// B (invité, non-propriétaire) ne peut pas inviter
assert.equal((await call(s, 'invite', { familyId: famA, email: 'c@x.fr' }, tokenB)).status, 403, 'invité ne peut pas inviter');

// B peut gérer les enfants de la famille partagée
const famAforB = (await call(s, 'me', {}, tokenB)).body.families.find(f => f.id === famA);
famAforB.children[0].gold = 999;
assert.equal((await call(s, 'saveFamily', { family: famAforB }, tokenB)).status, 200, 'B sauvegarde famille partagée');
assert.equal((await call(s, 'me', {}, tokenA)).body.families[0].children[0].gold, 999, 'modif de B visible par A');

// un membre ne peut pas s'auto-promouvoir propriétaire via saveFamily
const tamper = structuredClone(famAforB); tamper.owner = 'b@x.fr'; tamper.members = ['b@x.fr'];
await call(s, 'saveFamily', { family: tamper }, tokenB);
const afterTamper = (await call(s, 'me', {}, tokenA)).body.families[0];
assert.equal(afterTamper.owner, 'a@x.fr', 'owner protégé côté serveur');
assert.ok(afterTamper.members.includes('a@x.fr'), 'members protégés côté serveur');

// A retire B
r = await call(s, 'removeAdult', { familyId: famA, email: 'b@x.fr' }, tokenA);
assert.equal(r.status, 200, 'removeAdult');
assert.ok(!(await call(s, 'me', {}, tokenB)).body.families.some(f => f.id === famA), 'B ne voit plus la famille');

console.log('✅ test-backend : tous les cas passent');
