// Réinitialisation des quêtes par période (jour / semaine / mois). Script classique: expose globalThis.Rollover.
(function (g) {
  const pad = n => String(n).padStart(2, '0');
  const dayOf = ts => { const d = new Date(Number(ts)); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const weekOf = ts => {
    const d = new Date(Number(ts));
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi
    return dayOf(d.getTime());
  };
  const monthOf = ts => dayOf(ts).slice(0, 7);
  const periodOf = { daily: dayOf, weekly: weekOf, monthly: monthOf };

  // Idempotent: ne touche que les tâches faites dont la validation n'est pas dans la période courante.
  function rolloverTasks(tasks, today, now, opts = {}) {
    const [y, m, d] = today.split('-').map(Number);
    const todayTs = new Date(y, m - 1, d, 12).getTime();
    const seen = new Set();
    return (tasks || [])
      .filter(t => !(t && (t.frequency || 'daily') === 'unique' && t.done))
      .map(t => {
        if (!t || !t.done) return t;
        // cochée sans date = en attente de validation parent: on ne la touche qu'au changement de jour
        if (!t.completedAt && !opts.dayChanged) return t;
        const key = periodOf[t.frequency || 'daily'] || dayOf;
        if (t.completedAt && key(t.completedAt) === key(todayTs)) return t;
        return { ...t, done: false, resetAt: now };
      })
      // doublons exacts dans le même état (une faite + sa réassignation à faire restent distinctes)
      .filter(t => {
        if (!t) return true;
        const k = [t.name, t.xp, t.gold, t.frequency || 'daily', !!t.done].join('|');
        return seen.has(k) ? false : (seen.add(k), true);
      });
  }

  // PULL: reprend les tâches serveur, en gardant une validation locale plus récente que la dernière remise à faire du serveur.
  // Appariement par id; repli nom|xp seulement si l'un des deux n'a pas d'id (anciennes données).
  function mergeValidations(serverTasks, localTasks) {
    const byId = new Map(), byKey = new Map();
    (localTasks || []).forEach(t => {
      if (!t || !t.done || !t.completedAt) return;
      if (t.id) byId.set(t.id, t);
      byKey.set(`${t.name}|${t.xp}`, t);
    });
    return (serverTasks || []).map(st => {
      if (!st || (st.done && st.completedAt)) return st;
      const local = st.id ? byId.get(st.id) || (byKey.get(`${st.name}|${st.xp}`)?.id ? null : byKey.get(`${st.name}|${st.xp}`)) : byKey.get(`${st.name}|${st.xp}`);
      if (local && Number(local.completedAt) > Number(st.resetAt || 0)) return { ...st, done: true, completedAt: Number(local.completedAt) };
      return st;
    });
  }

  g.Rollover = { rolloverTasks, mergeValidations };
})(globalThis);
