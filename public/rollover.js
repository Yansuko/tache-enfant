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
  function rolloverTasks(tasks, today, now) {
    const [y, m, d] = today.split('-').map(Number);
    const todayTs = new Date(y, m - 1, d, 12).getTime();
    return (tasks || [])
      .filter(t => !(t && (t.frequency || 'daily') === 'unique' && t.done))
      .map(t => {
        if (!t || !t.done) return t;
        const key = periodOf[t.frequency || 'daily'] || dayOf;
        if (t.completedAt && key(t.completedAt) === key(todayTs)) return t;
        return { ...t, done: false, resetAt: now };
      });
  }

  g.Rollover = { rolloverTasks };
})(globalThis);
