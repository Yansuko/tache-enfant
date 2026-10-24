import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

const waitFor = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* pas encore prêt */ } await new Promise(r => setTimeout(r, 100)); } return false; };

describe('arrêt du serveur', () => {
  it('SIGTERM (docker stop) arrête proprement et rapidement, avec le code 0', async () => {
    const child = spawn('node', ['server.js'], { env: { ...process.env, PORT: '3399', DATABASE_URL: 'sqlite://:memory:' }, stdio: 'ignore' });
    const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
    expect(await waitFor(async () => (await fetch('http://localhost:3399/health')).ok)).toBe(true);
    const t0 = Date.now();
    child.kill('SIGTERM');
    const result = await Promise.race([exited, new Promise(r => setTimeout(() => r({ timeout: true }), 4000))]);
    if (result.timeout) child.kill('SIGKILL');
    expect(result).toEqual({ code: 0, signal: null });
    expect(Date.now() - t0).toBeLessThan(3500);
  }, 20000);
});
