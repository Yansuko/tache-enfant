// Événements de bonus (XP / or multipliés sur une période). Script classique: expose globalThis.Events.
(function (g) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' });
  // Jour (AAAA-MM-JJ) à l'heure de Paris, quel que soit le fuseau de l'appareil
  const parisDay = (ms = Date.now()) => fmt.format(new Date(ms));

  // Multiplicateurs actifs pour un enfant un jour donné (bornes incluses); plusieurs événements: le plus élevé par ressource.
  function activeMultipliers(events, childId, dayISO) {
    const out = { xpMult: 1, goldMult: 1, names: [] };
    for (const e of Array.isArray(events) ? events : []) {
      if (!e || !(e.start <= dayISO && dayISO <= e.end)) continue;
      if (Array.isArray(e.childIds) && e.childIds.length && !e.childIds.includes(childId)) continue;
      out.xpMult = Math.max(out.xpMult, Number(e.xpMult) || 1);
      out.goldMult = Math.max(out.goldMult, Number(e.goldMult) || 1);
      out.names.push(e.name);
    }
    return out;
  }

  const applyMult = (value, mult) => Math.round((Number(value) || 0) * (Number(mult) || 1));

  g.Events = { activeMultipliers, applyMult, parisDay };
})(globalThis);
