// Registre des thèmes et accents, résolution (Auto au coucher du soleil) et garde-fou de contraste.
// Script classique: expose globalThis.Themes (dépend de globalThis.Sun pour le mode Auto).
// Ajouter un thème = ajouter une fiche dans THEMES; validateTheme() (et test/themes.test.js) refusent une fiche
// incomplète ou illisible.
(function (g) {
  const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const ramp = (prefix, r) => Object.fromEntries(STEPS.map(s => [`${prefix}-${s}`, r[s]]));
  const R = a => Object.fromEntries(STEPS.map((s, i) => [s, a[i]]));

  // Rampes générées en OKLCH sur une échelle de luminosité commune
  // L = .97 .93 .87 .78 .67 .54 .45 .37 .29 (famille sombre: même échelle inversée, 100 = la plus sombre),
  // teinte et chroma de la couleur de base, chroma réduite pour rester dans le gamut sRGB. Valeurs figées.
  const ACCENTS = [
    { id: 'terracotta', names: { fr: 'Terracotta', en: 'Terracotta' },
      light: R(['#fef2ee', '#fce1d8', '#fac7b5', '#eea286', '#cb7f63', '#9e5940', '#7d432d', '#5d3323', '#3e241a']),
      dark: R(['#402217', '#61301e', '#833f26', '#a55538', '#d37a5a', '#f69d7e', '#ffc5b1', '#ffe0d6', '#fff2ed']) },
    { id: 'ocean', names: { fr: 'Océan', en: 'Ocean' },
      light: R(['#eff6ff', '#dae9ff', '#b9d7ff', '#87baff', '#4895fb', '#236dca', '#1153a2', '#123f78', '#112b4e']),
      dark: R(['#152d45', '#1a416a', '#1f578f', '#3171b3', '#5599e2', '#7fbcff', '#b5d8ff', '#d8eaff', '#eef6ff']) },
    { id: 'foret', names: { fr: 'Forêt', en: 'Forest' },
      light: R(['#ecf9f0', '#d3f1dc', '#a9e5be', '#6cd094', '#41ad71', '#12844d', '#006739', '#094d2b', '#0f331f']),
      dark: R(['#143320', '#174b2d', '#19653b', '#2b814f', '#51ab73', '#78cd96', '#afe3bf', '#d6f0dd', '#eef8f0']) },
    { id: 'violet', names: { fr: 'Violet', en: 'Purple' },
      light: R(['#f5f3ff', '#e8e4ff', '#d4cdff', '#b9a9ff', '#9a79ff', '#764dd6', '#5b37ad', '#442b7f', '#2d2053']),
      dark: R(['#302347', '#47326c', '#5f4192', '#7a58b7', '#a27de6', '#c2a5ff', '#dacaff', '#ebe3ff', '#f6f3ff']) },
    { id: 'rose', names: { fr: 'Rose', en: 'Pink' },
      light: R(['#fff1f5', '#ffdee7', '#ffc0d3', '#ff8fb5', '#ea5a93', '#b9336d', '#942053', '#6e1c3e', '#48172a']),
      dark: R(['#3f202c', '#5f2c42', '#803a58', '#a24f72', '#d07399', '#f397bb', '#fdc0d6', '#fedee9', '#fff1f5']) },
    { id: 'soleil', names: { fr: 'Soleil', en: 'Sun' },
      light: R(['#fef3e7', '#fde3c5', '#fcca8d', '#f2a534', '#cb8400', '#986100', '#764b00', '#593700', '#3e2500']),
      dark: R(['#372904', '#513c00', '#6b5100', '#8a6900', '#b88f14', '#dbb14c', '#ebd197', '#f4e7c9', '#faf5e8']) },
  ];

  // accentStep: palier de l'accent utilisé comme --color-accent (fond du bouton primaire, texte --color-on-accent).
  const THEMES = [
    { id: 'clair', names: { fr: 'Clair', en: 'Light' }, family: 'light', accentStep: 600, themeColor: '#f3d6c6',
      background: { gradient: 'linear-gradient(160deg, #fbe9df, #f3d6c6 55%, #e9c9d6)',
        blobs: ['rgba(240,163,127,.55)', 'rgba(201,166,232,.45)'] },
      tokens: {
        '--color-bg': '#f3d6c6', '--color-surface': '#fbf3ee', '--color-text': '#2b2320', '--color-text-muted': '#5a4a44',
        '--color-on-accent': '#ffffff', '--color-divider': 'color-mix(in srgb, #2b2320 16%, transparent)',
        ...ramp('--color-neutral', R(['#f7f4f3', '#ede6e4', '#ded1cd', '#c6b3ac', '#a4918a', '#7b6a64', '#60524c', '#483d39', '#302a27'])),
        '--color-accent-2': '#67754c',
        ...ramp('--color-accent-2', R(['#f4f6f0', '#e5eadc', '#ced9bd', '#aebf93', '#8c9d70', '#67754c', '#4e5b38', '#3b442b', '#282e1f'])),
        '--glass-bg': 'rgba(255,255,255,.45)', '--glass-border': 'rgba(255,255,255,.7)',
        '--glass-highlight': 'rgba(255,255,255,.8)', '--glass-blur': 'blur(18px) saturate(160%)',
        '--glass-shadow': '0 4px 16px rgba(120,70,50,.12)',
        '--shadow-sm': '0 1px 2px rgba(120,70,50,.12)', '--shadow-md': '0 3px 10px rgba(120,70,50,.14)',
        '--shadow-lg': '0 12px 32px rgba(120,70,50,.2)',
      } },
    { id: 'bleu-nuit', names: { fr: 'Bleu nuit', en: 'Midnight blue' }, family: 'dark', accentStep: 500, themeColor: '#1a1f45',
      background: { gradient: 'linear-gradient(160deg, #0f1530, #1a1f45 55%, #2a1f45)',
        blobs: ['rgba(58,79,208,.45)', 'rgba(155,79,208,.35)'] },
      tokens: {
        '--color-bg': '#1a1f45', '--color-surface': '#1e2648', '--color-text': '#eef1fb', '--color-text-muted': '#b0b7ce',
        '--color-on-accent': '#141833', '--color-divider': 'color-mix(in srgb, #eef1fb 18%, transparent)',
        ...ramp('--color-neutral', R(['#292b33', '#3b3f4c', '#4f5566', '#686e83', '#8d94ab', '#b0b7ce', '#cfd4e3', '#e5e8ef', '#f4f5f8'])),
        '--color-accent-2': '#8c9d70',
        ...ramp('--color-accent-2', R(['#282e1f', '#3b442b', '#4e5b38', '#67754c', '#8c9d70', '#aebf93', '#ced9bd', '#e5eadc', '#f4f6f0'])),
        '--glass-bg': 'rgba(30,38,70,.45)', '--glass-border': 'rgba(160,180,255,.22)',
        '--glass-highlight': 'rgba(190,205,255,.18)', '--glass-blur': 'blur(18px) saturate(160%)',
        '--glass-shadow': '0 4px 16px rgba(0,0,10,.45)',
        '--shadow-sm': '0 0 0 1px rgba(160,180,255,.12)', '--shadow-md': '0 3px 10px rgba(0,0,10,.4)',
        '--shadow-lg': '0 12px 32px rgba(0,0,10,.55)',
      } },
  ];

  const REQUIRED = ['--color-bg', '--color-surface', '--color-text', '--color-text-muted', '--color-on-accent', '--color-divider',
    '--color-accent-2', ...STEPS.map(s => `--color-neutral-${s}`), ...STEPS.map(s => `--color-accent-2-${s}`),
    '--glass-bg', '--glass-border', '--glass-highlight', '--glass-blur', '--glass-shadow', '--shadow-sm', '--shadow-md', '--shadow-lg'];

  const DEFAULT_APPEARANCE = { mode: 'auto', lightTheme: 'clair', darkTheme: 'bleu-nuit', accent: 'terracotta' };

  // — Contraste WCAG 2.x —
  function parse(c) {
    const s = String(c).trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)).concat(1);
    const m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (!m) throw new Error(`couleur non analysable: ${c}`);
    const [r, gr, b, a = 1] = m[1].split(',').map(Number);
    return [r, gr, b, a];
  }
  // `top` (éventuellement translucide) posé sur `bottom` (opaque, chaîne ou [r,g,b]) → [r,g,b].
  function composite(top, bottom) {
    const [r, gr, b, a] = parse(top);
    const under = Array.isArray(bottom) ? bottom : parse(bottom);
    return [r, gr, b].map((v, i) => v * a + under[i] * (1 - a));
  }
  const lum = rgb => {
    const [r, gr, b] = rgb.map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  };
  function contrast(a, b) {
    const [x, y] = [a, b].map(c => lum(Array.isArray(c) ? c : composite(c, [255, 255, 255])));
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  // Fonds possibles du texte: chaque stop du dégradé, chaque tache sur chaque stop, avec et sans verre.
  function backdrops(theme) {
    const stops = theme.background.gradient.match(/#[0-9a-f]{6}/gi) || [];
    const bases = stops.flatMap(s => [composite(s, [0, 0, 0]), ...theme.background.blobs.map(b => composite(b, s))]);
    return bases.flatMap(b => [b, composite(theme.tokens['--glass-bg'], b)]);
  }

  function validateTheme(theme) {
    if (!theme || typeof theme !== 'object') return ['fiche absente'];
    const errors = [];
    if (!/^[a-z0-9-]{1,32}$/.test(theme.id || '')) errors.push('id invalide');
    if (!theme.names || !theme.names.fr || !theme.names.en) errors.push('names.fr/en manquants');
    if (theme.family !== 'light' && theme.family !== 'dark') errors.push('family doit valoir light ou dark');
    if (!STEPS.includes(theme.accentStep)) errors.push('accentStep invalide');
    if (!theme.themeColor) errors.push('themeColor manquant');
    const bg = theme.background;
    if (!bg || !/#[0-9a-f]{6}/i.test(bg.gradient || '') || !Array.isArray(bg.blobs) || bg.blobs.length < 2) errors.push('background {gradient, blobs[2]} invalide');
    const tokens = theme.tokens || {};
    for (const k of REQUIRED) if (!tokens[k]) errors.push(`variable manquante: ${k}`);
    if (errors.length) return errors;

    try {
      const worst = col => Math.min(...backdrops(theme).map(b => contrast(col, b)));
      for (const k of ['--color-text', '--color-text-muted']) {
        const c = worst(tokens[k]);
        if (c < 4.5) errors.push(`${k}: contraste ${c.toFixed(2)} < 4.5 sur le pire fond`);
      }
      for (const a of ACCENTS) {
        const r = a[theme.family];
        for (const s of STEPS.filter(s => s >= theme.accentStep && s <= theme.accentStep + 200)) {
          const c = contrast(tokens['--color-on-accent'], r[s]);
          if (c < 4.5) errors.push(`--color-on-accent sur ${a.id}-${s}: contraste ${c.toFixed(2)} < 4.5`);
        }
      }
    } catch (e) { errors.push(e.message); }
    return errors;
  }

  // — Préférences —
  const findTheme = (id, family) => THEMES.find(t => t.id === id && t.family === family);
  const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
  function normalizeAppearance(raw) {
    const r = isPlain(raw) ? raw : {};
    const out = {
      mode: ['auto', 'light', 'dark'].includes(r.mode) ? r.mode : DEFAULT_APPEARANCE.mode,
      lightTheme: findTheme(r.lightTheme, 'light') ? r.lightTheme : DEFAULT_APPEARANCE.lightTheme,
      darkTheme: findTheme(r.darkTheme, 'dark') ? r.darkTheme : DEFAULT_APPEARANCE.darkTheme,
      accent: ACCENTS.some(a => a.id === r.accent) ? r.accent : DEFAULT_APPEARANCE.accent,
    };
    const loc = isPlain(r.location) ? r.location : null;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lon) <= 180)
      out.location = { lat: loc.lat, lon: loc.lon };
    return out;
  }

  // systemDark (prefers-color-scheme) ne sert que si l'appareil n'a aucun mode enregistré.
  function resolve(appearance, { now = Date.now(), lat, lon, systemDark } = {}) {
    const a = normalizeAppearance(appearance);
    const unset = !isPlain(appearance) || appearance.mode === undefined;
    let isDark;
    if (unset && typeof systemDark === 'boolean') isDark = systemDark;
    else if (a.mode === 'auto') isDark = g.Sun.isNight(now, lat ?? g.Sun.PARIS.lat, lon ?? g.Sun.PARIS.lon);
    else isDark = a.mode === 'dark';
    return {
      theme: isDark ? findTheme(a.darkTheme, 'dark') : findTheme(a.lightTheme, 'light'),
      accent: ACCENTS.find(x => x.id === a.accent),
      isDark,
    };
  }

  function cssVars(theme, accent) {
    const r = accent[theme.family];
    const [b1, b2] = theme.background.blobs;
    return { ...theme.tokens, ...ramp('--color-accent', r), '--color-accent': r[theme.accentStep],
      '--bg-gradient': theme.background.gradient, '--blob-1': b1, '--blob-2': b2 };
  }

  g.Themes = { THEMES, ACCENTS, DEFAULT_APPEARANCE, REQUIRED, normalizeAppearance, resolve, cssVars, validateTheme, contrast, composite };
})(globalThis);
