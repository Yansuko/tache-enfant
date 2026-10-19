// tests/e2e/06-levels.test.mjs
import assert from 'assert';
import { db, withFamily, mkChild, defaultLevelConfig, runAll } from './framework.mjs';

const seed = () => ({ children: [mkChild('Alice')], levelConfig: defaultLevelConfig() });
const readConfig = async familyId => (await db.ref(`levelConfigs/${familyId}`).once('value')).val();

export const test61ViewLevelConfig = () =>
  withFamily('6.1 View level config', seed(), async ({ familyId }) => {
    const { levels } = await readConfig(familyId);
    assert.strictEqual(levels.length, 50);
    levels.forEach((l, i) => {
      assert.strictEqual(l.level, i + 1);
      assert.strictEqual(l.xpRequired, (i + 1) * 100, `default is 100 XP per level (level ${i + 1})`);
    });
  });

export const test62ModifyLevelConfig = () =>
  withFamily('6.2 Modify level config', seed(), async ({ familyId }) => {
    const config = await readConfig(familyId);
    config.levels[1].xpRequired = 150;
    // same validation as updateLevelConfig in netlify/functions/_core.mjs
    config.levels.forEach((l, i) => {
      assert.strictEqual(l.level, i + 1);
      if (i) assert.ok(l.xpRequired > config.levels[i - 1].xpRequired, `XP must increase (level ${i + 1})`);
    });
    await db.ref(`levelConfigs/${familyId}`).set({ name: config.name, levels: config.levels, updatedAt: Date.now() });
    const { levels } = await readConfig(familyId);
    assert.strictEqual(levels[1].xpRequired, 150);
    assert.strictEqual(levels[0].xpRequired, 100);
    assert.strictEqual(levels[2].xpRequired, 300);
  });

export const runLevelTests = () => runAll('📈 LEVEL TESTS', [test61ViewLevelConfig, test62ModifyLevelConfig]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runLevelTests()) ? 0 : 1);
}
