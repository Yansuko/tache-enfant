import { it } from 'vitest';

// test/stats-api.test.mjs est un script Node autonome (assert + await de haut niveau): l'importer l'exécute.
it('stats-api.test.mjs (getGradeStats / getRewardStats / getSanctionStats)', async () => {
  await import('./stats-api.test.mjs');
}, 20000);
