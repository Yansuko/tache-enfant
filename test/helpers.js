import request from 'supertest';

let app;
let n = 0;

export async function getApp() {
  if (!app) {
    process.env.DATABASE_URL = 'sqlite://:memory:';
    process.env.PORT = '0';
    ({ app } = await import('../server.js'));
  }
  return app;
}

export async function api(action, body = {}, token) {
  const req = request(await getApp()).post('/api');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.send({ action, ...body });
}

// Crée un compte parent + sa famille; `save(family)` appelle saveFamily et renvoie la famille du serveur.
export async function newParent(prefix = 'flow') {
  const email = `${prefix}${++n}@test.com`;
  const password = 'test123';
  const familyName = `Fam${n}x${Date.now() % 100000}`;
  const res = await api('signup', { email, password, name: 'Parent', familyName });
  expectOk(res);
  const token = res.body.token;
  const save = async (family) => {
    const r = await api('saveFamily', { family }, token);
    expectOk(r);
    return r.body.family;
  };
  const me = async () => (await api('me', {}, token)).body.families;
  return { email, password, token, familyName, family: res.body.families[0], save, me };
}

function expectOk(res) {
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.body)}`);
}
