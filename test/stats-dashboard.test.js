// Statistics tab UI (public/index.html): loads the real page in jsdom, mocks /api, drives the DOM.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const EMMA = 'child-emma', LUCAS = 'child-lucas';

const FAMILY = {
  id: 'fam-test', name: 'Famille Test',
  children: [
    { id: EMMA, name: 'Emma', xp: 0, gold: 0, tasks: [], grades: [], sanctions: [] },
    { id: LUCAS, name: 'Lucas', xp: 0, gold: 0, tasks: [], grades: [], sanctions: [] },
  ],
  rewards: [], requests: [], gradeRequests: [], sanctionsList: [],
};

// Server-shaped responses (see getGradeStats / getRewardStats / getSanctionStats in src/core.mjs)
const gradeRows = [
  { childId: EMMA, date: '2026-10-10', subject: 'Mathématiques', grade: '16/20', xp: 50, gold: 10 },
  { childId: EMMA, date: '2026-10-15', subject: 'Mathématiques', grade: '18/20', xp: 50, gold: 10 },
  { childId: EMMA, date: '2026-10-15', subject: 'Français', grade: '12/20', xp: 30, gold: 5 },
  { childId: LUCAS, date: '2026-10-12', subject: 'Français', grade: '8/20', xp: 10, gold: 0 },
];
const rewardRows = [
  { childId: EMMA, purchaseDate: '2026-10-11', name: 'Sortie cinéma', cost: 40 },
  { childId: EMMA, purchaseDate: '2026-10-14', name: 'Sortie cinéma', cost: 40 },
  { childId: LUCAS, purchaseDate: '2026-10-16', name: '30 min de jeu vidéo', cost: 25 },
];
const sanctionRows = [
  { childId: EMMA, date: '2026-10-13', motif: 'Devoirs non faits', gold: 10 },
  { childId: LUCAS, date: '2026-10-13', motif: 'Devoirs non faits', gold: 10 },
  { childId: LUCAS, date: '2026-10-17', motif: 'Insolence', gold: 4 },
];

// Minimal mirror of the server aggregation so filters produce visibly different numbers.
const inRange = (d, b) => (!b.startDate || d >= b.startDate) && (!b.endDate || d <= b.endDate);
const pick = (rows, b, dateKey) => rows.filter(r => (!b.childId || r.childId === b.childId) && inRange(r[dateKey], b));
const countBy = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ??= { count: 0 }).count++, m), {});
const top = m => Object.entries(m).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? null;
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);
const STATS = {
  getGradeStats(b) {
    const grades = pick(gradeRows, b, 'date'), bySubject = {}, byDay = {};
    for (const g of grades) {
      const s = (bySubject[g.subject] ??= { count: 0, total: 0 });
      s.count++; s.total += parseFloat(g.grade);
      (byDay[g.date] ??= { count: 0 }).count++;
    }
    for (const s of Object.values(bySubject)) s.avg = String(Math.round(s.total / s.count * 10) / 10);
    return { grades, bySubject, byDay, totalXP: sum(grades, 'xp'), totalGold: sum(grades, 'gold'), trend: 'improving' };
  },
  getRewardStats(b) {
    const purchases = pick(rewardRows, b, 'purchaseDate'), byReward = countBy(purchases, 'name');
    const totalSpent = sum(purchases, 'cost');
    return { purchases, byReward, mostPopular: top(byReward), totalSpent, avgCost: purchases.length ? Math.round(totalSpent / purchases.length) : 0, frequency: { perWeek: purchases.length, perMonth: purchases.length } };
  },
  getSanctionStats(b) {
    const sanctions = pick(sanctionRows, b, 'date'), byMotif = countBy(sanctions, 'motif');
    const totalGoldLost = sum(sanctions, 'gold');
    return { sanctions, byMotif, mostCommon: top(byMotif), totalCount: sanctions.length, totalGoldLost, avgGoldPerSanction: sanctions.length ? Math.round(totalGoldLost / sanctions.length) : 0, frequency: { perWeek: 1, perMonth: 2 } };
  },
  getTaskStats: b => ({ tasksCount: b.childId === EMMA ? 7 : 3, xpGained: 70, goldGained: 14, bestDay: null, dailyBreakdown: {}, topTasks: [], childrenStats: {} }),
};

let dom, w, calls, errors, override;
const $ = sel => w.document.querySelector(sel);
const text = sel => $(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? '';
const flush = () => new Promise(r => setTimeout(r, 0));
const callsFor = action => calls.filter(c => c.action === action);
const boxes = () => Object.fromEntries([...w.document.querySelectorAll('#xs-stats .xs-box')].map(b =>
  [b.querySelector('.kicker').textContent.trim(), b.querySelector('.xs-num').textContent.replace(/\s+/g, ' ').trim()]));
const rows = () => [...w.document.querySelectorAll('#xs-stats .xs-table')].map(t =>
  [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim())));

async function fetchMock(_url, opts) {
  const body = JSON.parse(opts.body);
  calls.push(body);
  if (override) { const r = await override(body); if (r) return r; }
  const fn = STATS[body.action];
  const json = fn ? fn(body) : {};
  return { ok: true, status: 200, json: async () => structuredClone(json) };
}
const ok = json => ({ ok: true, status: 200, json: async () => json });
const fail = (status, error) => ({ ok: false, status, json: async () => ({ error }) });

function change(el, prop, value) {
  el[prop] = value;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
}

async function openStats() {
  // Bypass login/PIN: the page boots to the auth screen, then we inject a logged-in, unlocked parent.
  w.__fam = structuredClone(FAMILY);
  w.eval(`me = { email: 'p@test.fr', name: 'Parent' }; families = [Object.assign(window.__fam, { role: 'parent', tab: 'stats', activeChild: 0 })];
          state = families[0]; parentUnlocked = true; statsChildIndex = 0; statsPeriod = 'week';
          xs = { tab: 'grades', start: '', end: '', family: false, data: null, err: '', req: 0 }; render();`);
  await flush(); await flush();
}

beforeEach(async () => {
  calls = []; errors = []; override = null;
  const vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.join(' ')));
  vc.on('jsdomError', e => errors.push(String(e.stack || e)));
  dom = new JSDOM(HTML, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(win) { win.fetch = fetchMock; win.Chart = function () {}; },
  });
  w = dom.window;
  await flush();
});
afterEach(() => {
  expect(errors).toEqual([]); // no console.error / uncaught page errors in any test
  w.close();
});

describe('stats dashboard', () => {
  it('renders without errors with all controls', async () => {
    await openStats();
    expect(text('h2')).toBe('Statistiques');
    expect([...w.document.querySelectorAll('#stats-child-select option')].map(o => o.textContent)).toEqual(['Emma', 'Lucas']);
    expect([...w.document.querySelectorAll('[data-action="set-stats-period"]')].map(b => b.textContent)).toEqual(['Jour', 'Semaine', 'Mois', 'Année']);
    expect($('#xs-start').type).toBe('date');
    expect($('#xs-end').type).toBe('date');
    expect($('#xs-family').checked).toBe(false);
    expect([...w.document.querySelectorAll('[data-xs-tab]')].map(b => b.dataset.xsTab)).toEqual(['grades', 'rewards', 'sanctions']);
    expect(text('#xs-stats h2')).toBe('Statistiques de Emma');
    expect(callsFor('getTaskStats')[0]).toMatchObject({ childId: EMMA, period: 'week' });
  });

  it('shows the loading state until the API answers', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    override = async b => b.action.endsWith('Stats') && b.action !== 'getTaskStats' ? (await gate, null) : null;
    await openStats();
    expect(text('.xs-body')).toBe('Chargement…');
    release();
    await flush(); await flush();
    expect(text('.xs-body')).not.toContain('Chargement');
    expect(boxes()['Notes']).toBe('3');
  });

  it('displays grade stats: totals, chart, per-subject averages, table', async () => {
    await openStats();
    const b = boxes();
    expect(b['XP gagnés']).toBe('130');
    expect(b['Or 🪙 gagné']).toBe('25');
    expect(b['Notes']).toBe('3');
    expect(b['Tendance']).toContain('En progrès');
    const svg = $('#xs-stats svg[aria-label="Évolution des notes par matière"]');
    expect(svg.querySelectorAll('polyline')).toHaveLength(2); // one line per subject
    expect(svg.querySelectorAll('circle')).toHaveLength(3);
    expect(w.document.querySelectorAll('#xs-stats .xs-bar')).toHaveLength(2); // 2 distinct days
    const [averages, all] = rows();
    expect(averages).toEqual([['Mathématiques', '2', '17'], ['Français', '1', '12']]);
    expect(all).toHaveLength(3);
    expect(all[0].slice(1)).toEqual(['Français', '12/20', '30', '5']); // newest first, no "Enfant" column
  });

  it('displays reward stats', async () => {
    await openStats();
    $('[data-xs-tab="rewards"]').click();
    expect($('[data-xs-tab="rewards"]').getAttribute('aria-selected')).toBe('true');
    expect(text('.xs-badge')).toBe('🏆 La plus populaire : Sortie cinéma (2×)');
    const b = boxes();
    expect(b['Total dépensé']).toBe('80 🪙');
    expect(b['Coût moyen']).toBe('40 🪙');
    expect(b['Achats']).toBe('2');
    expect(b['Fréquence']).toBe('2/sem · 2/mois');
    expect(rows()[0].map(r => r.slice(1))).toEqual([['Sortie cinéma', '40 🪙'], ['Sortie cinéma', '40 🪙']]);
  });

  it('displays sanction stats', async () => {
    await openStats();
    $('[data-xs-tab="sanctions"]').click();
    expect(text('.xs-badge')).toBe('📌 Motif le plus fréquent : Devoirs non faits (1×)');
    const b = boxes();
    expect(b['Sanctions']).toBe('1');
    expect(b['Or perdu']).toBe('10 🪙');
    expect(b['Moyenne']).toBe('10 🪙');
    expect(rows()[0]).toEqual([[expect.any(String), 'Devoirs non faits', '−10 🪙']]);
  });

  it('child selector reloads stats for the selected child', async () => {
    await openStats();
    calls = [];
    change($('#stats-child-select'), 'value', '1');
    await flush(); await flush();
    expect(w.eval('statsChildIndex')).toBe(1);
    for (const a of ['getGradeStats', 'getRewardStats', 'getSanctionStats', 'getTaskStats']) expect(callsFor(a)[0]?.childId).toBe(LUCAS);
    expect(text('#xs-stats h2')).toBe('Statistiques de Lucas');
    expect(boxes()['Notes']).toBe('1');
    expect(rows()[0]).toEqual([['Français', '1', '8']]);
  });

  it('period buttons refetch task stats with the period and highlight the active button', async () => {
    await openStats();
    for (const [label, period] of [['Jour', 'day'], ['Mois', 'month'], ['Année', 'year'], ['Semaine', 'week']]) {
      calls = [];
      [...w.document.querySelectorAll('[data-action="set-stats-period"]')].find(b => b.textContent === label).click();
      await flush();
      // Fires twice today: the action itself, then the dispatcher's save()+render() refetches.
      expect(callsFor('getTaskStats').length).toBeGreaterThan(0);
      for (const c of callsFor('getTaskStats')) expect(c).toMatchObject({ childId: EMMA, period });
      expect($(`[data-period="${period}"]`).classList.contains('btn-primary')).toBe(true);
      expect(w.document.querySelectorAll('[data-action="set-stats-period"].btn-primary')).toHaveLength(1);
    }
    expect(w.localStorage.getItem('statsPeriod')).toBe('week');
  });

  it('date filters send startDate/endDate and narrow the data', async () => {
    await openStats();
    calls = [];
    change($('#xs-start'), 'value', '2026-10-12');
    await flush(); await flush();
    expect(callsFor('getGradeStats').at(-1)).toMatchObject({ familyId: 'fam-test', childId: EMMA, startDate: '2026-10-12' });
    expect(callsFor('getGradeStats').at(-1)).not.toHaveProperty('endDate');
    expect(boxes()['Notes']).toBe('2'); // 2026-10-10 excluded
    change($('#xs-end'), 'value', '2026-10-14');
    await flush(); await flush();
    expect(callsFor('getRewardStats').at(-1)).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-14' });
    expect(boxes()['Notes']).toBe('0');
    expect($('#xs-start').value).toBe('2026-10-12'); // filters survive the repaint
    expect($('#xs-end').value).toBe('2026-10-14');
    $('[data-xs-tab="rewards"]').click();
    expect(boxes()['Total dépensé']).toBe('40 🪙'); // only the 2026-10-14 purchase
  });

  it('"Toute la famille" drops childId and adds the Enfant column', async () => {
    await openStats();
    calls = [];
    change($('#xs-family'), 'checked', true);
    await flush(); await flush();
    for (const a of ['getGradeStats', 'getRewardStats', 'getSanctionStats']) {
      expect(callsFor(a)).toHaveLength(1);
      expect(callsFor(a)[0]).not.toHaveProperty('childId');
    }
    expect(text('#xs-stats h2')).toBe('Statistiques de la famille');
    expect($('#xs-family').checked).toBe(true);
    expect(boxes()['Notes']).toBe('4');
    expect(boxes()['XP gagnés']).toBe('140');
    expect([...w.document.querySelectorAll('#xs-stats .xs-table')[1].querySelectorAll('th')].map(t => t.textContent)[0]).toBe('Enfant');
    expect(rows()[1].map(r => r[0]).sort()).toEqual(['Emma', 'Emma', 'Emma', 'Lucas']);
    $('[data-xs-tab="sanctions"]').click();
    expect(boxes()['Sanctions']).toBe('3');
    expect(boxes()['Or perdu']).toBe('24 🪙');
    expect(text('.xs-badge')).toContain('Devoirs non faits (2×)');
    // unchecking goes back to the selected child
    change($('#xs-family'), 'checked', false);
    await flush(); await flush();
    expect(callsFor('getSanctionStats').at(-1).childId).toBe(EMMA);
  });

  it('shows the API error message when stats fail', async () => {
    override = b => b.action === 'getRewardStats' ? fail(500, 'Stats unavailable') : null;
    await openStats();
    expect(text('.xs-body')).toBe('⚠️ Stats unavailable');
    expect(w.document.querySelectorAll('#xs-stats .xs-box')).toHaveLength(0);
    // the error clears on the next successful load
    override = null;
    change($('#xs-start'), 'value', '2026-10-01');
    await flush(); await flush();
    expect(text('.xs-body')).not.toContain('⚠️');
    expect(boxes()['Notes']).toBe('3');
  });

  it('falls back to a status message when the error has no body', async () => {
    override = b => b.action === 'getGradeStats' ? { ok: false, status: 503, json: async () => { throw new Error('no json'); } } : null;
    await openStats();
    expect(text('.xs-body')).toBe('⚠️ Erreur 503');
  });

  it('handles empty data', async () => {
    override = b => ({
      getGradeStats: ok({ grades: [], bySubject: {}, byDay: {}, totalXP: 0, totalGold: 0, trend: 'stable' }),
      getRewardStats: ok({ purchases: [], byReward: {}, mostPopular: null, totalSpent: 0, avgCost: 0, frequency: { perWeek: 0, perMonth: 0 } }),
      getSanctionStats: ok({ sanctions: [], byMotif: {}, mostCommon: null, totalCount: 0, totalGoldLost: 0, avgGoldPerSanction: 0, frequency: { perWeek: 0, perMonth: 0 } }),
    })[b.action] ?? null;
    await openStats();
    expect(boxes()).toMatchObject({ 'XP gagnés': '0', 'Notes': '0' });
    expect(text('.xs-body')).toContain('Pas de notes datées à tracer.');
    expect(text('.xs-body')).toContain('Aucune note datée.');
    expect(text('.xs-body')).toContain('Aucune donnée sur la période.');
    expect($('#xs-stats svg')).toBeNull();
    $('[data-xs-tab="rewards"]').click();
    expect($('.xs-badge')).toBeNull();
    expect(boxes()['Total dépensé']).toBe('0 🪙');
    expect(text('.xs-body')).toContain('Aucune donnée sur la période.');
    $('[data-xs-tab="sanctions"]').click();
    expect($('.xs-badge')).toBeNull();
    expect(boxes()['Sanctions']).toBe('0');
  });

  it('ignores stale responses when filters change quickly', async () => {
    let releaseFirst;
    const slow = new Promise(r => { releaseFirst = r; });
    let first = true;
    override = async b => {
      if (b.action === 'getGradeStats' && b.startDate === '2026-10-01' && first) { first = false; await slow; }
      return null;
    };
    await openStats();
    change($('#xs-start'), 'value', '2026-10-01'); // slow request
    change($('#xs-start'), 'value', '2026-10-12'); // fast request wins
    await flush(); await flush();
    expect(boxes()['Notes']).toBe('2');
    releaseFirst();
    await flush(); await flush();
    expect(boxes()['Notes']).toBe('2'); // stale (3 grades) response discarded
  });
});
