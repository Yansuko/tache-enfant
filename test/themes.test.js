import { describe, it, expect, beforeAll } from 'vitest';

let T;
beforeAll(async () => {
  await import('../public/sun.js');
  await import('../public/themes.js');
  T = globalThis.Themes;
});

const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const utc = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const clone = o => JSON.parse(JSON.stringify(o));
const theme = id => T.THEMES.find(t => t.id === id);

// Luminosité OKLab (vérification indépendante de l'échelle commune des rampes).
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
function okL(hex) {
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
}

describe('contraste WCAG', () => {
  it('valeurs de référence', () => {
    expect(T.contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(T.contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(T.contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
  it('composite un rgba sur un fond opaque', () => {
    expect(T.composite('rgba(255,255,255,.5)', '#000000')).toEqual([127.5, 127.5, 127.5]);
    expect(T.composite('#123456', '#ffffff')).toEqual([0x12, 0x34, 0x56]);
  });
});

describe('registre', () => {
  it('Clair (light) et Bleu nuit (dark) existent avec noms fr/en', () => {
    expect(theme('clair')).toMatchObject({ family: 'light', names: { fr: 'Clair' } });
    expect(theme('bleu-nuit')).toMatchObject({ family: 'dark', names: { fr: 'Bleu nuit' } });
    for (const t of T.THEMES) expect(t.names.en).toBeTruthy();
  });

  it('chaque thème est valide (variables obligatoires + contraste AA avec chaque accent)', () => {
    for (const t of T.THEMES) expect(T.validateTheme(t), t.id).toEqual([]);
  });

  it('six accents avec rampes 100–900 claire et sombre', () => {
    expect(T.ACCENTS.map(a => a.id)).toEqual(['terracotta', 'ocean', 'foret', 'violet', 'rose', 'soleil']);
    for (const a of T.ACCENTS) {
      expect(a.names.fr && a.names.en).toBeTruthy();
      for (const fam of ['light', 'dark']) for (const s of STEPS) expect(a[fam][s], `${a.id}.${fam}.${s}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('rampes cohérentes: même échelle de luminosité pour tous les accents (sombre = inversée)', () => {
    const ref = T.ACCENTS[0];
    for (const a of T.ACCENTS) for (const s of STEPS) {
      expect(Math.abs(okL(a.light[s]) - okL(ref.light[s])), `${a.id}.light.${s}`).toBeLessThan(0.02);
      expect(Math.abs(okL(a.dark[s]) - okL(ref.dark[s])), `${a.id}.dark.${s}`).toBeLessThan(0.02);
      expect(Math.abs(okL(a.dark[s]) - okL(a.light[1000 - s])), `${a.id}.dark.${s}`).toBeLessThan(0.02);
    }
    for (let i = 1; i < STEPS.length; i++) expect(okL(ref.light[STEPS[i]])).toBeLessThan(okL(ref.light[STEPS[i - 1]]));
  });

  it('DEFAULT_APPEARANCE', () => {
    expect(T.DEFAULT_APPEARANCE).toEqual({ mode: 'auto', lightTheme: 'clair', darkTheme: 'bleu-nuit', accent: 'terracotta' });
  });
});

describe('validateTheme refuse une fiche incorrecte', () => {
  it('variable manquante', () => {
    const bad = clone(theme('clair'));
    delete bad.tokens['--glass-bg'];
    expect(T.validateTheme(bad).join(' ')).toMatch(/--glass-bg/);
  });
  it('champ de structure manquant', () => {
    const bad = clone(theme('clair'));
    delete bad.background;
    expect(T.validateTheme(bad).length).toBeGreaterThan(0);
  });
  it('texte illisible sur le fond', () => {
    const bad = clone(theme('clair'));
    bad.tokens['--color-text'] = '#c8b8b0';
    expect(T.validateTheme(bad).join(' ')).toMatch(/--color-text/);
  });
  it('texte secondaire illisible sur une tache', () => {
    const bad = clone(theme('bleu-nuit'));
    bad.background.blobs[0] = 'rgba(176,183,206,1)';
    expect(T.validateTheme(bad).join(' ')).toMatch(/--color-text-muted/);
  });
  it('texte du bouton primaire illisible sur un accent', () => {
    const bad = clone(theme('clair'));
    bad.accentStep = 400;
    expect(T.validateTheme(bad).join(' ')).toMatch(/--color-on-accent/);
  });
  it('fiche nulle: erreur, pas d’exception', () => {
    expect(T.validateTheme(null).length).toBeGreaterThan(0);
  });
});

describe('normalizeAppearance', () => {
  it('entrées invalides → défaut, sans exception', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) expect(T.normalizeAppearance(raw)).toEqual(T.DEFAULT_APPEARANCE);
  });
  it('valeurs inconnues → défaut de la même famille', () => {
    expect(T.normalizeAppearance({ mode: 'nope', lightTheme: 'bleu-nuit', darkTheme: 'inconnu', accent: 'gris' }))
      .toEqual(T.DEFAULT_APPEARANCE);
  });
  it('conserve les valeurs valides et une position valide; ignore les autres champs', () => {
    expect(T.normalizeAppearance({ mode: 'dark', lightTheme: 'clair', darkTheme: 'bleu-nuit', accent: 'ocean', location: { lat: 45.76, lon: 4.84 }, foo: 1 }))
      .toEqual({ mode: 'dark', lightTheme: 'clair', darkTheme: 'bleu-nuit', accent: 'ocean', location: { lat: 45.76, lon: 4.84 } });
    expect(T.normalizeAppearance({ mode: 'light', location: { lat: 200, lon: 0 } })).not.toHaveProperty('location');
  });
});

describe('resolve', () => {
  const day = utc(2026, 12, 21, 12), night = utc(2026, 12, 21, 17);
  it('Auto: clair avant le coucher, bleu nuit après (Paris par défaut)', () => {
    expect(T.resolve({ mode: 'auto' }, { now: day })).toMatchObject({ isDark: false, theme: { id: 'clair' } });
    expect(T.resolve({ mode: 'auto' }, { now: night })).toMatchObject({ isDark: true, theme: { id: 'bleu-nuit' } });
  });
  it('Auto: utilise la position fournie', () => {
    // 17:00 UTC le 21/06 à Tokyo = 02:00 locale → nuit; à Paris → jour
    expect(T.resolve({ mode: 'auto' }, { now: utc(2026, 6, 21, 17), lat: 35.68, lon: 139.69 }).isDark).toBe(true);
    expect(T.resolve({ mode: 'auto' }, { now: utc(2026, 6, 21, 17) }).isDark).toBe(false);
  });
  it('modes forcés ignorent l’heure et le système', () => {
    expect(T.resolve({ mode: 'light' }, { now: night, systemDark: true }).isDark).toBe(false);
    expect(T.resolve({ mode: 'dark' }, { now: day, systemDark: false }).isDark).toBe(true);
  });
  it('systemDark seulement si le mode n’est pas défini', () => {
    expect(T.resolve(undefined, { now: day, systemDark: true }).isDark).toBe(true);
    expect(T.resolve({}, { now: night, systemDark: false }).isDark).toBe(false);
    expect(T.resolve({ mode: 'auto' }, { now: day, systemDark: true }).isDark).toBe(false);
    expect(T.resolve(undefined, { now: night }).isDark).toBe(true); // sans système → Auto
  });
  it('thème/accent inconnus → défaut', () => {
    const r = T.resolve({ mode: 'dark', darkTheme: 'disparu', accent: 'gris' }, { now: day });
    expect(r.theme.id).toBe('bleu-nuit');
    expect(r.accent.id).toBe('terracotta');
    expect(T.resolve({ mode: 'light', accent: 'rose' }, { now: day }).accent.id).toBe('rose');
  });
});

describe('cssVars', () => {
  it('Clair + Océan: variables existantes, accent de la famille claire, verre et fond', () => {
    const v = T.cssVars(theme('clair'), T.ACCENTS.find(a => a.id === 'ocean'));
    const ocean = T.ACCENTS.find(a => a.id === 'ocean');
    for (const s of STEPS) {
      expect(v[`--color-accent-${s}`]).toBe(ocean.light[s]);
      expect(v[`--color-neutral-${s}`]).toMatch(/^#/);
      expect(v[`--color-accent-2-${s}`]).toMatch(/^#/);
    }
    expect(v['--color-accent']).toBe(ocean.light[theme('clair').accentStep]);
    for (const k of ['--color-bg', '--color-surface', '--color-text', '--color-divider', '--color-on-accent',
      '--glass-bg', '--glass-border', '--glass-highlight', '--glass-blur', '--glass-shadow', '--bg-gradient', '--blob-1', '--blob-2'])
      expect(v[k], k).toBeTruthy();
    expect(v['--bg-gradient']).toMatch(/^linear-gradient\(/);
  });
  it('Bleu nuit utilise la rampe sombre', () => {
    const a = T.ACCENTS[0];
    expect(T.cssVars(theme('bleu-nuit'), a)['--color-accent-100']).toBe(a.dark[100]);
  });
});
