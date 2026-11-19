import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

// Préchargé dans le serveur enfant: trace setInterval/clearInterval et les passages du minuteur,
// et interdit tout appel réseau vers Brevo (aucune vraie clé ni requête dans ces tests).
const TRACE = `data:text/javascript,
const si = globalThis.setInterval, ci = globalThis.clearInterval, f = globalThis.fetch;
globalThis.setInterval = (fn, ms, ...a) => { const id = si(() => { process.stdout.write('[TRACE] tick ' + ms + '\\n'); fn(); }, ms, ...a); process.stdout.write('[TRACE] setInterval ' + ms + '\\n'); return id; };
globalThis.clearInterval = (id) => { process.stdout.write('[TRACE] clearInterval ' + (id ? 'timer' : 'null') + '\\n'); return ci(id); };
globalThis.fetch = (url, ...a) => { if (String(url).includes('brevo.com')) throw new Error('[TRACE] appel Brevo interdit en test'); return f(url, ...a); };
`;

// Lance server.js, attend qu'il écoute (+ `waitMs`), envoie SIGTERM et renvoie toute la sortie.
let port = 3420;
async function runServer(env, waitMs = 0) {
  const p = port++;
  const childEnv = { ...process.env, NODE_ENV: 'test', PORT: String(p), DATABASE_URL: 'sqlite://:memory:', ...env };
  for (const k of ['BREVO_API_KEY', 'EMAIL_FROM', 'REMINDER_TICK_MS']) if (!(k in env)) delete childEnv[k];
  const child = spawn('node', ['--import', TRACE, 'server.js'], { env: childEnv });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const exited = new Promise(resolve => child.on('exit', code => resolve(code)));
  const t0 = Date.now();
  while (!out.includes('DailyKids Quest running') && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, waitMs));
  child.kill('SIGTERM');
  const code = await Promise.race([exited, new Promise(r => setTimeout(() => r('timeout'), 4000))]);
  if (code === 'timeout') child.kill('SIGKILL');
  return { out, code };
}

describe('minuteur des rappels', () => {
  it('REMINDER_TICK_MS défini: le minuteur tourne à cet intervalle puis est arrêté à l\'extinction', async () => {
    const { out, code } = await runServer({ REMINDER_TICK_MS: '137' }, 600);
    expect(out).toContain('[TRACE] setInterval 137');
    expect(out).toContain('[TRACE] tick 137');
    expect(out).not.toContain('[REMINDERS]');               // runReminders(store) passe sans erreur
    const stop = out.indexOf('SIGTERM reçu');
    expect(stop).toBeGreaterThan(-1);
    expect(out.indexOf('[TRACE] clearInterval timer', stop)).toBeGreaterThan(stop);
    expect(out.slice(out.indexOf('[TRACE] clearInterval timer'))).not.toContain('[TRACE] tick');  // plus de passage après l'arrêt
    expect(code).toBe(0);
  }, 20000);

  it('NODE_ENV=test sans REMINDER_TICK_MS: aucun minuteur des rappels', async () => {
    const { out, code } = await runServer({}, 300);
    expect(out).toContain('DailyKids Quest running');
    expect(out).not.toMatch(/\[TRACE\] setInterval (60000|\d+)/);
    expect(out).toContain('[TRACE] clearInterval null');
    expect(code).toBe(0);
  }, 20000);

  it('hors test (development): minuteur d\'une minute par défaut', async () => {
    const { out, code } = await runServer({ NODE_ENV: 'development' });
    expect(out).toContain('[TRACE] setInterval 60000');
    expect(code).toBe(0);
  }, 20000);
});

describe('messages e-mail au démarrage', () => {
  const FAKE_REST = 'xkeysib-cle-factice-pour-test';
  const FAKE_SMTP = 'xsmtpsib-cle-factice-pour-test';

  it('sans BREVO_API_KEY: e-mails désactivés', async () => {
    const { out } = await runServer({});
    expect(out).toContain('[EMAIL] BREVO_API_KEY absent: e-mails désactivés');
    expect(out).not.toContain('Brevo configuré');
  }, 20000);

  it('clé API sans EMAIL_FROM: e-mails désactivés, sans avertissement', async () => {
    const { out } = await runServer({ BREVO_API_KEY: FAKE_REST });
    expect(out).toContain('[EMAIL] EMAIL_FROM non défini: e-mails désactivés');
    expect(out).not.toContain('clé SMTP');
    expect(out).not.toContain('Brevo configuré');
  }, 20000);

  it('clé SMTP sans EMAIL_FROM: l\'avertissement clé SMTP s\'affiche aussi, e-mails désactivés', async () => {
    const { out } = await runServer({ BREVO_API_KEY: FAKE_SMTP });
    expect(out).toContain('[EMAIL] BREVO_API_KEY est une clé SMTP (xsmtpsib-…)');
    expect(out).toContain('[EMAIL] EMAIL_FROM non défini: e-mails désactivés');
    expect(out).not.toContain('Brevo configuré');
    expect(out).not.toContain(FAKE_SMTP);
  }, 20000);

  it('clé SMTP xsmtpsib- avec EMAIL_FROM: avertissement puis Brevo configuré', async () => {
    const { out } = await runServer({ BREVO_API_KEY: FAKE_SMTP, EMAIL_FROM: 'test@example.invalid' });
    expect(out).toContain('[EMAIL] BREVO_API_KEY est une clé SMTP (xsmtpsib-…)');
    expect(out).toContain('[EMAIL] Brevo configuré (expéditeur: test@example.invalid)');
    expect(out).not.toContain(FAKE_SMTP);                    // la clé n'est jamais journalisée
    expect(out).not.toContain('appel Brevo interdit');
  }, 20000);

  it('clé API xkeysib- avec EMAIL_FROM: Brevo configuré sans avertissement', async () => {
    const { out } = await runServer({ BREVO_API_KEY: FAKE_REST, EMAIL_FROM: 'test@example.invalid' });
    expect(out).toContain('[EMAIL] Brevo configuré (expéditeur: test@example.invalid)');
    expect(out).not.toContain('clé SMTP');
    expect(out).not.toContain(FAKE_REST);
  }, 20000);
});
