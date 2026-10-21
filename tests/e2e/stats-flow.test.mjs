// tests/e2e/stats-flow.test.mjs — run: node tests/e2e/stats-flow.test.mjs
// Real browser (Playwright/Chromium) against server.js on a fresh SQLite file seeded with the demo family
// (parent@demo.fr / demo, Emma = children[0]). Scenarios share one server and run in order: A → B → C → D.
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { logTest, runAll } from './framework.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const PORT = 3900 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;

let page;
const httpErrors = [];

// ── helpers ──
const box = async label => (await page.locator('#xs-stats .xs-box', { hasText: label }).locator('.xs-num').innerText()).trim();
const num = async label => parseInt(await box(label), 10);
const nav = tab => page.click(`#nav [data-action="nav"][data-tab="${tab}"]`);
// Every action re-renders after save(): wait for a *new* stats load to finish, not the previous one.
async function afterStatsLoad(trigger) {
  const req0 = await page.evaluate(() => xs.req);
  await trigger();
  await page.waitForFunction(r => xs.req > r && xs.data && document.querySelector('#xs-stats .xs-box'), req0);
}
const openStats = () => afterStatsLoad(() => nav('stats'));
const xsTab = async t => { await page.click(`[data-xs-tab="${t}"]`); await page.waitForSelector(`[data-xs-tab="${t}"][aria-selected="true"]`); };
const pageApi = (action, body) => page.evaluate(([a, b]) => api(a, b), [action, body]);
const emmaId = () => page.evaluate(() => state.children[0].id);

async function login() {
  await page.goto(BASE);
  await page.fill('#au-email', 'parent@demo.fr');
  await page.fill('#au-pass', 'demo');
  await page.click('[data-action="login"]');
  await page.waitForSelector('#nav [data-tab="stats"]');
}

async function scenario(title, fn) {
  try { await fn(); logTest(title, 'PASS'); return true; }
  catch (err) { logTest(title, 'FAIL', err.message.replace(/\s+/g, ' ').slice(0, 300)); return false; }
}

// ── scenarios ──
export const testA = () => scenario('A. Grade added via API appears in dashboard', async () => {
  await login();
  await openStats();
  await page.selectOption('#stats-child-select', '0');
  await page.waitForFunction(() => xs.data && document.querySelector('#xs-stats h2')?.textContent.includes('Emma'));
  await xsTab('grades');
  const before = await num('Notes');
  assert.strictEqual(before, 2, 'seed: Emma has 16/20 and 13/20');

  const familyId = await page.evaluate(() => state.id);
  const { family } = await pageApi('submitGrade', { familyId, childName: 'Emma', subject: 'Sciences', grade: '19/20', gold: 7 });
  const gradeId = family.gradeRequests.find(g => g.subject === 'Sciences' && g.status === 'pending')?.id;
  assert.ok(gradeId, 'submitGrade did not create a pending grade');
  await pageApi('approveGrade', { familyId, gradeId }); // stats count approved grades only

  // Reload, not just re-open the tab: the tab's family copy is stale, and any UI save() would
  // overwrite the server's gradeRequests with it (saveFamily replaces the array) — see report.
  // The session survives the reload; the parent space comes back locked.
  await page.reload();
  await page.fill('#pu-pass', 'demo');
  await page.click('[data-action="unlockParent"]');
  await page.waitForSelector('#nav [data-tab="stats"]');
  await openStats();
  await xsTab('grades');
  assert.strictEqual(await num('Notes'), before + 1);
  assert.ok(await page.locator('#xs-stats .xs-table td', { hasText: '19/20' }).count(), '19/20 missing from grades table');
  const api = await pageApi('getGradeStats', { familyId, childId: await emmaId() });
  assert.strictEqual(api.grades.length, before + 1, 'UI and API disagree');
  assert.strictEqual(await num('XP gagnés'), api.totalXP);
  assert.strictEqual(await num('Or 🪙 gagné'), api.totalGold);
});

export const testB = () => scenario('B. Approved reward purchase appears in stats', async () => {
  await nav('enfants');
  const btn = page.locator('[data-action="view-stats"][data-i="0"]');
  await btn.waitFor().catch(() => assert.fail('View Stats button missing on Emma card'));
  await afterStatsLoad(() => btn.click());
  assert.match(await page.locator('#xs-stats h2').innerText(), /Emma/);
  await xsTab('rewards');
  const [buys0, spent0] = [await num('Achats'), await num('Total dépensé')];

  await nav('sanctions'); // Boutique
  const approve = page.locator('[data-action="approve"]').first(); // seed: Emma's pending "Temps d'écran" (50)
  await approve.waitFor();
  const gold0 = await page.evaluate(() => state.children[0].gold);
  await approve.click();
  await page.waitForFunction(() => !state.requests.some(r => r.status === 'pending'));

  await openStats();
  await xsTab('rewards');
  assert.strictEqual(await num('Achats'), buys0 + 1);
  assert.strictEqual(await num('Total dépensé'), spent0 + 50);
  assert.ok(await page.locator('#xs-stats .xs-table td', { hasText: "Temps d'écran" }).count(), 'purchase missing from table');
  assert.strictEqual(await page.evaluate(() => state.children[0].gold), gold0 - 50, 'gold not deducted');
  const today = await page.evaluate(() => today());
  const api = await pageApi('getRewardStats', { familyId: 'fam-demo', childId: await emmaId(), startDate: today, endDate: today });
  assert.deepStrictEqual(api.purchases.map(p => p.name), ["Temps d'écran"], 'purchase not dated today server-side');
});

export const testC = () => scenario('C. Applied sanction increases sanction count', async () => {
  await openStats();
  await xsTab('sanctions');
  const [count0, lost0] = [await num('Sanctions'), await num('Or perdu')];

  await nav('sanctions');
  await page.click('.seg input[name="child"][value="0"]', { force: true }).catch(() => {}); // Emma
  const apply = page.locator('[data-action="apply-sanction"]', { hasText: 'Emma' }).nth(1); // "Devoirs non faits" (5)
  await apply.click();
  await page.waitForFunction(() => state.children[0].sanctions.length === 2);

  await openStats();
  await xsTab('sanctions');
  assert.strictEqual(await num('Sanctions'), count0 + 1);
  assert.strictEqual(await num('Or perdu'), lost0 + 5);
  const api = await pageApi('getSanctionStats', { familyId: 'fam-demo', childId: await emmaId() });
  assert.strictEqual(api.totalCount, count0 + 1, 'UI and API disagree');
  const today = await page.evaluate(() => today());
  const dated = await pageApi('getSanctionStats', { familyId: 'fam-demo', childId: await emmaId(), startDate: today, endDate: today });
  assert.deepStrictEqual(dated.sanctions.map(s => s.motif), ['Devoirs non faits'], 'sanction not dated today server-side');
});

export const testD = () => scenario('D. Quick Stats widget matches dashboard', async () => {
  await page.evaluate(() => { for (const k in qsCache) delete qsCache[k]; }); // B's visit cached pre-purchase stats
  await nav('enfants');
  await page.waitForFunction(() => document.getElementById('qs-0')?.textContent.includes('Quick Stats'));
  const qs = await page.locator('#qs-0').innerText();
  const notes = +qs.match(/Notes\s*:\s*(\d+)/)[1], spent = +qs.match(/Récompenses\s*:\s*(\d+)/)[1], sanctions = +qs.match(/Sanctions\s*:\s*(\d+)/)[1];
  assert.ok(notes >= 1 && spent >= 50, `widget shows no data: ${qs}`);

  await afterStatsLoad(() => page.click('[data-action="view-stats"][data-i="0"]'));
  // widget = last 30 days: apply the same range on the dashboard
  const [start, end] = await page.evaluate(() => [new Date(Date.now() - 30 * 864e5).toLocaleDateString('fr-CA'), today()]);
  await afterStatsLoad(() => page.fill('#xs-start', start));
  await afterStatsLoad(() => page.fill('#xs-end', end));
  await xsTab('grades');
  assert.strictEqual(await num('Notes'), notes, 'grade count differs');
  await xsTab('rewards');
  assert.strictEqual(await num('Total dépensé'), spent, 'spent differs');
  await xsTab('sanctions');
  assert.strictEqual(await num('Sanctions'), sanctions, 'sanction count differs');
});

export const testNoHttpErrors = () => scenario('No 4xx/5xx responses during the flow', async () => {
  assert.deepStrictEqual(httpErrors, []);
});

// ── server + browser lifecycle ──
export async function runStatsFlowTests() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dk-e2e-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'ignore', process.env.DEBUG ? 'inherit' : 'ignore'],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', DATABASE_URL: `sqlite://${path.join(dir, 'e2e.db')}` }
  });
  let browser;
  try {
    for (let i = 0; ; i++) {
      if (await fetch(`${BASE}/health`).then(r => r.ok, () => false)) break;
      if (i > 50) throw new Error('server did not start');
      await new Promise(r => setTimeout(r, 200));
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }); // set when Playwright's bundled build is missing
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on('dialog', d => d.accept());
    page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) httpErrors.push(`${r.status()} ${r.request().postData()?.slice(0, 60) || r.url()}`); });
    return await runAll('📊 STATISTICS FLOW (browser E2E)', [testA, testB, testC, testD, testNoHttpErrors]);
  } finally {
    await browser?.close();
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runStatsFlowTests()) ? 0 : 1);
}
