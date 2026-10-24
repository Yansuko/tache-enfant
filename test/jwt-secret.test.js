import { describe, it, expect, afterEach } from 'vitest';
import { api, newParent } from './helpers.js';
import { signToken } from '../src/core.mjs';

// Valeur publiée dans l'historique du dépôt (ancien Dockerfile): connue de tous, elle ne doit plus jamais protéger un compte.
const LEAKED = 'dailykids_jwt_secret_production_v1_2026';
const saved = process.env.JWT_SECRET;
afterEach(() => { if (saved === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved; });

describe('secret de signature des sessions (JWT_SECRET)', () => {
  it('le secret publié dans le dépôt ne permet pas de fabriquer une session', async () => {
    process.env.JWT_SECRET = LEAKED;
    const p = await newParent('jwt');
    const forged = signToken(p.email.toLowerCase(), LEAKED);
    expect((await api('me', {}, forged)).status).toBe(401);
    expect((await api('me', {}, p.token)).status).toBe(200);          // la vraie session continue de fonctionner
  });

  it('sans JWT_SECRET: un secret aléatoire est généré et conservé; la session survit entre deux appels', async () => {
    delete process.env.JWT_SECRET;
    const p = await newParent('jwt');
    expect((await api('me', {}, p.token)).status).toBe(200);
    expect((await api('me', {}, p.token)).status).toBe(200);
    expect((await api('me', {}, signToken(p.email.toLowerCase(), LEAKED))).status).toBe(401);
    expect((await api('me', {}, signToken(p.email.toLowerCase(), ''))).status).toBe(401);
  });

  it('un JWT_SECRET personnel est respecté: seules les sessions signées avec lui sont valides', async () => {
    process.env.JWT_SECRET = 'mon-secret-personnel-0123456789abcdef0123456789abcdef';
    const p = await newParent('jwt');
    expect((await api('me', {}, p.token)).status).toBe(200);
    expect((await api('me', {}, signToken(p.email.toLowerCase(), 'un-autre-secret'))).status).toBe(401);
    expect((await api('me', {}, signToken(p.email.toLowerCase(), process.env.JWT_SECRET))).status).toBe(200);
  });
});
