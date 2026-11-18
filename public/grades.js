// Notes: saisie validée (décimaux, fractions, appréciations). Script classique: expose globalThis.Grades.
(function (g) {
  const DEFAULT_SCALE = [
    { labels: ['tb', 'tres bien'], value: 18 },
    { labels: ['b', 'bien'], value: 15 },
    { labels: ['ab', 'assez bien'], value: 12 },
  ];
  // minuscules, sans accents ni points, espaces compactés, lettres isolées recollées:
  // « T. B. » → « tb », « Très  Bien » → « tres bien »
  const normLabel = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\./g, '').replace(/\s+/g, ' ').trim()
    .replace(/(?<=(?:^| )\p{L}) (?=\p{L}(?: |$))/gu, '');
  const MAX_LEN = 30;   // = longueur max d'un libellé du tableau
  const NUM = /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?$/;
  const num = s => parseFloat(s.replace(',', '.'));
  // forme numérique (« 15,5 », « 25/20 »): jamais lue comme appréciation, donc interdite comme libellé
  const isNumber = s => NUM.test(String(s ?? '').trim());

  // → {ok:true, value20, text} ou {ok:false}; `scale` absent ou vide = tableau par défaut
  function parseGrade(raw, scale) {
    const text = raw == null ? '' : String(raw).trim();
    if (!text || text.length > MAX_LEN) return { ok: false };
    const m = text.match(NUM);
    if (m) {
      const v = num(m[1]), max = m[2] ? num(m[2]) : 20;
      return Number.isFinite(v) && Number.isFinite(max) && max > 0 && v <= max ? { ok: true, value20: (v / max) * 20, text } : { ok: false };
    }
    const key = normLabel(text);
    const rows = Array.isArray(scale) && scale.length ? scale : DEFAULT_SCALE;
    const row = rows.find(r => Array.isArray(r?.labels) && r.labels.some(l => normLabel(l) === key));
    return row ? { ok: true, value20: row.value, text } : { ok: false };
  }

  const list = a => (Array.isArray(a) ? a : []).filter(r => r && typeof r === 'object');
  const cmp = (a, b) => String(a).localeCompare(String(b), 'fr');

  // matières distinctes, triées
  const subjects = requests => [...new Set(list(requests).map(r => r.subject).filter(s => s != null && s !== ''))].sort(cmp);

  // moyenne /20 des notes convertibles (null si aucune) + nombre de notes
  const stats = (rows, scale) => {
    const vals = rows.map(r => parseGrade(r.grade, scale)).filter(p => p.ok).map(p => p.value20);
    return { avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, count: rows.length };
  };

  // une section par enfant (ordre de `children`); moyennes sur les notes approuvées
  function groupGrades(requests, children, scale, { child, subject } = {}) {
    const reqs = list(requests).filter(r => subject == null || subject === '' || r.subject === subject);
    return list(children).filter(c => child == null || child === '' || c.name === child).map(c => {
      const mine = reqs.filter(r => r.child === c.name);
      const pendingList = mine.filter(r => r.status === 'pending');
      const approvedList = mine.filter(r => r.status === 'approved')
        .sort((a, b) => (b.approvedAt ?? b.submittedAt ?? 0) - (a.approvedAt ?? a.submittedAt ?? 0));
      const bySubject = subjects(approvedList).map(s => ({ subject: s, ...stats(approvedList.filter(r => r.subject === s), scale) }));
      return { child: c.name, ...stats(approvedList, scale), pending: pendingList.length, bySubject,
        pendingList, approvedList, refusedList: mine.filter(r => r.status === 'refused') };
    });
  }

  g.Grades = { DEFAULT_SCALE, normLabel, isNumber, parseGrade, subjects, groupGrades };
})(globalThis);
