// Notes: saisie validée (décimaux, fractions, appréciations). Script classique: expose globalThis.Grades.
(function (g) {
  const DEFAULT_SCALE = [
    { labels: ['tb', 'tres bien'], value: 18 },
    { labels: ['b', 'bien'], value: 15 },
    { labels: ['ab', 'assez bien'], value: 12 },
  ];
  // minuscules, sans accents ni points, espaces compactés: « T.B. » → « tb », « Très  Bien » → « tres bien »
  const normLabel = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const NUM = /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?$/;
  const num = s => parseFloat(s.replace(',', '.'));

  // → {ok:true, value20, text} ou {ok:false}; `scale` absent ou vide = tableau par défaut
  function parseGrade(raw, scale) {
    const text = raw == null ? '' : String(raw).trim();
    if (!text) return { ok: false };
    const m = text.match(NUM);
    if (m) {
      const v = num(m[1]), max = m[2] ? num(m[2]) : 20;
      return max > 0 && v <= max ? { ok: true, value20: (v / max) * 20, text } : { ok: false };
    }
    const key = normLabel(text);
    const rows = Array.isArray(scale) && scale.length ? scale : DEFAULT_SCALE;
    const row = rows.find(r => Array.isArray(r?.labels) && r.labels.some(l => normLabel(l) === key));
    return row ? { ok: true, value20: row.value, text } : { ok: false };
  }

  g.Grades = { DEFAULT_SCALE, normLabel, parseGrade };
})(globalThis);
