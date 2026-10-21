// Quick Stats widget (Enfants tab). No DOM lib installed: we pull the real functions
// out of public/index.html and run them against a tiny fake document + stubbed api().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

// Slice from `start` to the brace closing the body that opens at `open`.
function block(start, open = SRC.indexOf(') {', start) + 2) {
  let i = open, depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error('unbalanced block at ' + start);
}
const fn = name => block(SRC.indexOf(`function ${name}(`));
const line = decl => { const s = SRC.indexOf(decl); return SRC.slice(s, SRC.indexOf('\n', s)); };
const vs = SRC.indexOf('{', SRC.indexOf("'view-stats': el =>"));
const viewStatsBody = block(vs, vs);

const CODE = [
  line('const today ='), line('const LVL_XP'), line('const level ='), line('const qsCache ='),
  fn('esc'), fn('on20'), fn('qsHtml'), fn('loadQuickStats'), fn('screenEnfants'),
  `const viewStats = el => ${viewStatsBody};`,
  'return { qsCache, screenEnfants, loadQuickStats, viewStats, getStatsChildIndex: () => statsChildIndex };',
].join('\n');

function boot(children) {
  const els = {};
  const document = { getElementById: id => els[id] || null };
  const state = { id: 'fam-1', tab: 'enfants', children };
  const xs = { family: true };
  const localStorage = { setItem: vi.fn() };
  const api = vi.fn();
  const app = new Function('document', 'state', 'xs', 'localStorage', 'api', 'normalizeFamilyData', 'console',
    `let statsChildIndex = 0;\n${CODE}`)(document, state, xs, localStorage, api, () => {}, { log() {} });
  // "render": inject screenEnfants() and expose each qs-N container like the browser would
  const render = () => {
    const html = app.screenEnfants();
    for (const k in els) delete els[k];
    for (const m of html.matchAll(/id="qs-(\d+)">([\s\S]*?)<\/div>\n\s*<\/div>/g)) els['qs-' + m[1]] = { innerHTML: m[2] };
    return html;
  };
  return { app, api, state, xs, localStorage, els, render };
}

const flush = () => new Promise(r => setTimeout(r, 0));
const text = el => el.innerHTML.replace(/<[^>]+>/g, '');

const STATS = {
  'child-emma': {
    getGradeStats: { grades: [{ grade: '16/20' }, { grade: '8/10' }, { grade: '12' }] }, // 16, 16, 12 → 14.7
    getRewardStats: { totalSpent: 80, purchases: [{ name: 'Cinéma', cost: 30 }, { name: '30 min de jeu', cost: 50 }] },
    getSanctionStats: { totalCount: 2, sanctions: [{ motif: 'Retard' }, { motif: 'Devoirs non faits' }] },
  },
  'child-lucas': {
    getGradeStats: { grades: [] },
    getRewardStats: { totalSpent: 0, purchases: [] },
    getSanctionStats: { totalCount: 0, sanctions: [] },
  },
};
const mockApi = api => api.mockImplementation(async (action, body) => structuredClone(STATS[body.childId][action]));

const emma = () => ({ id: 'child-emma', name: 'Emma', xp: 120, gold: 40, pin: '1234' });
const lucas = () => ({ id: 'child-lucas', name: 'Lucas', xp: 10, gold: 5 });

describe('Quick Stats widget', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00')); });
  afterEach(() => vi.useRealTimers());

  it('renders "Chargement…" before stats arrive', () => {
    const t = boot([emma()]);
    t.render();
    expect(text(t.els['qs-0'])).toBe('Chargement…');
  });

  it('loads and shows the 3 stat lines for a child with mixed stats', async () => {
    const t = boot([emma()]);
    mockApi(t.api);
    t.render(); t.app.loadQuickStats(); await flush();
    const s = text(t.els['qs-0']);
    expect(s).toContain('Quick Stats · 30 jours');
    expect(s).toContain('Notes : 3 ce mois, moyenne 14.7/20');
    expect(s).toContain('Récompenses : 80 🪙 dépensé (30 min de jeu)'); // total + latest purchase
    expect(s).toContain('Sanctions : 2 ce mois (Devoirs non faits)');   // count + latest motif
  });

  it('requests exactly the last 30 days, once per stat endpoint', async () => {
    const t = boot([emma()]);
    mockApi(t.api);
    t.render(); t.app.loadQuickStats(); await flush();
    expect(t.api.mock.calls.map(c => c[0]).sort()).toEqual(['getGradeStats', 'getRewardStats', 'getSanctionStats']);
    for (const [, body] of t.api.mock.calls)
      expect(body).toEqual({ familyId: 'fam-1', childId: 'child-emma', startDate: '2026-09-21', endDate: '2026-10-21' });
  });

  it('shows empty stats for a child with no data', async () => {
    const t = boot([lucas()]);
    mockApi(t.api);
    t.render(); t.app.loadQuickStats(); await flush();
    const s = text(t.els['qs-0']);
    expect(s).toContain('Notes : 0 ce mois, moyenne —');
    expect(s).toContain('Récompenses : 0 🪙 dépensé');
    expect(s).not.toContain('(');
    expect(s).toContain('Sanctions : 0 ce mois');
  });

  it('shows "Stats unavailable" on API error', async () => {
    const t = boot([emma()]);
    t.api.mockRejectedValue(new Error('500'));
    t.render(); t.app.loadQuickStats(); await flush();
    expect(text(t.els['qs-0'])).toBe('Stats unavailable');
  });

  it('shows "Stats unavailable" for an unsaved child (no id) without calling the API', async () => {
    const t = boot([{ name: 'Nouveau', xp: 0, gold: 0 }]);
    t.render(); t.app.loadQuickStats(); await flush();
    expect(t.api).not.toHaveBeenCalled();
    expect(text(t.els['qs-0'])).toBe('Stats unavailable');
  });

  it('multiple children get independent widgets and requests', async () => {
    const t = boot([emma(), lucas()]);
    mockApi(t.api);
    t.render(); t.app.loadQuickStats(); await flush();
    expect(t.api).toHaveBeenCalledTimes(6); // 3 per child, no duplicates
    expect(new Set(t.api.mock.calls.map(c => c[1].childId + c[0])).size).toBe(6);
    expect(text(t.els['qs-0'])).toContain('moyenne 14.7/20');
    expect(text(t.els['qs-1'])).toContain('moyenne —');
  });

  it('one child failing does not break the other widget', async () => {
    const t = boot([emma(), lucas()]);
    mockApi(t.api);
    const ok = t.api.getMockImplementation();
    t.api.mockImplementation(async (a, b) => { if (b.childId === 'child-lucas') throw new Error('x'); return ok(a, b); });
    t.render(); t.app.loadQuickStats(); await flush();
    expect(text(t.els['qs-0'])).toContain('Notes : 3');
    expect(text(t.els['qs-1'])).toBe('Stats unavailable');
  });

  it('re-render uses the cache instead of flashing "Chargement…"', async () => {
    const t = boot([emma()]);
    mockApi(t.api);
    t.render(); t.app.loadQuickStats(); await flush();
    const before = t.els['qs-0'].innerHTML;
    t.render(); // e.g. save() → render() before the refetch lands
    expect(t.els['qs-0'].innerHTML).toBe(before);
    expect(t.app.qsCache['child-emma']).toBe(before);
  });

  it('updates the widget when child data changes', async () => {
    const t = boot([emma()]);
    mockApi(t.api);
    t.render(); t.app.loadQuickStats(); await flush();
    STATS['child-emma'].getSanctionStats = { totalCount: 3, sanctions: [{ motif: 'Retard' }, { motif: 'Insolence' }] };
    try {
      t.render(); t.app.loadQuickStats(); await flush();
      expect(text(t.els['qs-0'])).toContain('Sanctions : 3 ce mois (Insolence)');
    } finally {
      STATS['child-emma'].getSanctionStats = { totalCount: 2, sanctions: [{ motif: 'Retard' }, { motif: 'Devoirs non faits' }] };
    }
  });

  it('ignores a late response when the child at that slot changed', async () => {
    const t = boot([emma()]);
    mockApi(t.api);
    t.render(); t.app.loadQuickStats();
    t.state.children[0] = lucas(); // child removed/replaced before the response
    await flush();
    expect(text(t.els['qs-0'])).toBe('Chargement…');
  });

  it('escapes reward names and sanction motifs', async () => {
    const t = boot([emma()]);
    t.api.mockImplementation(async a => ({
      getGradeStats: { grades: [] },
      getRewardStats: { totalSpent: 1, purchases: [{ name: '<img src=x>' }] },
      getSanctionStats: { totalCount: 1, sanctions: [{ motif: '<script>' }] },
    })[a]);
    t.render(); t.app.loadQuickStats(); await flush();
    expect(t.els['qs-0'].innerHTML).not.toMatch(/<img|<script/);
    expect(t.els['qs-0'].innerHTML).toContain('&lt;img src=x&gt;');
  });

  it('has a 📊 stats button per child that navigates to the dashboard', () => {
    const t = boot([emma(), lucas()]);
    const html = t.render();
    const btns = [...html.matchAll(/<button[^>]*data-action="view-stats" data-i="(\d+)"[^>]*>📊<\/button>/g)];
    expect(btns.map(m => m[1])).toEqual(['0', '1']);
    expect(btns[0][0]).toContain('aria-label="Voir les statistiques"');

    t.app.viewStats({ dataset: { i: '1' } });
    expect(t.state.tab).toBe('stats');
    expect(t.app.getStatsChildIndex()).toBe(1);
    expect(t.xs.family).toBe(false);
    expect(t.localStorage.setItem).toHaveBeenCalledWith('statsChildIndex', 1);
  });
});
