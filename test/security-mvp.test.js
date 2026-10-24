import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { api, newParent } from './helpers.js';
import { setEmailSender } from '../src/core.mjs';

const env = { ...process.env };
beforeAll(() => { process.env.AUTH_MAX_ATTEMPTS = '5'; process.env.AUTH_LOCK_MS = '300'; });
afterAll(() => { for (const k of ['AUTH_MAX_ATTEMPTS', 'AUTH_LOCK_MS', 'NODE_ENV']) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; } setEmailSender(null); });
afterEach(() => { process.env.NODE_ENV = env.NODE_ENV ?? 'test'; setEmailSender(null); });
const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('mot de passe oublié: le code ne sort jamais du serveur en production', () => {
  it('production sans service d\'e-mail: pas de code dans la réponse, erreur claire', async () => {
    const p = await newParent('sec');
    process.env.NODE_ENV = 'production'; setEmailSender(null);
    const r = await api('reset-password', { step: 1, email: p.email });
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).not.toMatch(/\d{6}/);
    expect(r.body.devCode).toBeUndefined();
  });

  it('production avec service d\'e-mail: le code part par e-mail et n\'est pas dans la réponse; il permet de changer le mot de passe', async () => {
    const p = await newParent('sec');
    process.env.NODE_ENV = 'production';
    const mails = []; setEmailSender(async m => { mails.push(m); });
    const r = await api('reset-password', { step: 1, email: p.email });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/\d{6}/);
    const code = mails[0].body.match(/\d{6}/)[0];
    expect(mails[0].to).toBe(p.email.toLowerCase());
    expect((await api('reset-password', { step: 2, email: p.email, code, password: 'nouveau789' })).status).toBe(200);
    expect((await api('login', { email: p.email, password: 'nouveau789' })).status).toBe(200);
  });

  it('hors production (tests, développement): le code est renvoyé pour faciliter les essais', async () => {
    const p = await newParent('sec');
    process.env.NODE_ENV = 'test'; setEmailSender(null);
    const r = await api('reset-password', { step: 1, email: p.email });
    expect(r.status).toBe(200);
    expect(r.body.devCode).toMatch(/^\d{6}$/);
  });
});

describe('limitation des tentatives (anti force brute)', () => {
  it('mot de passe: après 5 échecs, même le bon mot de passe est refusé (429), puis la limite expire', async () => {
    const p = await newParent('rate');
    for (let i = 0; i < 5; i++) expect((await api('login', { email: p.email, password: 'faux' + i })).status).toBe(401);
    expect((await api('login', { email: p.email, password: p.password })).status).toBe(429);
    expect((await api('verifyPassword', { email: p.email, password: p.password })).status).toBe(429);
    await wait(350);
    expect((await api('login', { email: p.email, password: p.password })).status).toBe(200);
  });

  it('une connexion réussie remet le compteur à zéro', async () => {
    const p = await newParent('rate');
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) await api('login', { email: p.email, password: 'faux' });
      expect((await api('login', { email: p.email, password: p.password })).status).toBe(200);
    }
  });

  it('les comptes sont indépendants', async () => {
    const a = await newParent('rate'), b = await newParent('rate');
    for (let i = 0; i < 6; i++) await api('login', { email: a.email, password: 'faux' });
    expect((await api('login', { email: b.email, password: b.password })).status).toBe(200);
  });

  it('PIN enfant (4 chiffres): après 5 échecs, le bon PIN est refusé (429)', async () => {
    const p = await newParent('rate');
    p.family.children = [{ id: 'c1', name: 'Emma', xp: 0, gold: 0, pin: '1234', tasks: [], grades: [], sanctions: [] }];
    await p.save(p.family);
    const unlock = (pin) => api('unlockChildDirect', { familyName: p.familyName, childName: 'Emma', pin });
    for (let i = 0; i < 5; i++) expect((await unlock('000' + i)).status).toBe(401);
    expect((await unlock('1234')).status).toBe(429);
    await wait(350);
    expect((await unlock('1234')).status).toBe(200);
  });

  it('code de réinitialisation (6 chiffres): après 5 essais faux, même le bon code est refusé (429)', async () => {
    const p = await newParent('rate');
    process.env.NODE_ENV = 'test';
    const code = (await api('reset-password', { step: 1, email: p.email })).body.devCode;
    for (let i = 0; i < 5; i++) expect((await api('reset-password', { step: 2, email: p.email, code: '99999' + i, password: 'autre12345' })).status).toBe(400);
    expect((await api('reset-password', { step: 2, email: p.email, code, password: 'autre12345' })).status).toBe(429);
  });
});
