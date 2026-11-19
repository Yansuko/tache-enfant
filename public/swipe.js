// Swipe horizontal entre enfants. Script classique: expose globalThis.Swipe.
(function (g) {
  // 'next' (vers la gauche) | 'prev' (vers la droite) | null; pas de boucle aux extrémités.
  function decide({ x0, y0, t0 }, { x1, y1, t1 }, { count, index }, opts = {}) {
    const { minDx = 60, ratio = 1.5, maxMs = 600 } = opts;
    const dx = x1 - x0, dy = y1 - y0;
    if (count < 2 || Math.abs(dx) < minDx || Math.abs(dx) <= ratio * Math.abs(dy) || t1 - t0 > maxMs) return null;
    if (dx < 0) return index < count - 1 ? 'next' : null;
    return index > 0 ? 'prev' : null;
  }
  g.Swipe = { decide };
})(globalThis);
