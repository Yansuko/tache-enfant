// tests/e2e/run-all.mjs — run: node tests/e2e/run-all.mjs
import { runAuthTests } from './01-auth.test.mjs';
import { runFamilyTests } from './02-families.test.mjs';
import { runChildrenTests } from './03-children.test.mjs';
import { runTaskTests } from './04-tasks.test.mjs';
import { runRewardTests } from './05-rewards.test.mjs';
import { runLevelTests } from './06-levels.test.mjs';
import { runNoteTests } from './07-notes.test.mjs';
import { runNavigationTests } from './08-navigation.test.mjs';
import { runSyncTests } from './09-sync.test.mjs';
import { runRegressionTests } from './10-regression.test.mjs';
import { runChildActionTests } from './11-child-actions.test.mjs';
import { runStatisticsTests } from './12-statistics.test.mjs';
import { runBugTests } from './13-bug-multiple-notes.test.mjs';
import { runSanctionTests } from './14-sanctions.test.mjs';
import { runLegacyGradeTests } from './15-bug-grades-object.test.mjs';
import { runGradesReplaceTests } from './16-bug-grades-replace.test.mjs';

const sections = [
  ['Authentication', runAuthTests], ['Families', runFamilyTests], ['Children', runChildrenTests],
  ['Tasks', runTaskTests], ['Rewards', runRewardTests], ['Levels', runLevelTests],
  ['Notes', runNoteTests], ['Navigation', runNavigationTests], ['Sync', runSyncTests],
  ['Regression', runRegressionTests], ['Child Actions', runChildActionTests], ['Statistics', runStatisticsTests],
  ['Bug Regression', runBugTests], ['Sanctions', runSanctionTests], ['Legacy Format Bug', runLegacyGradeTests],
  ['Grade Merge Fix', runGradesReplaceTests]
];

console.log('🧪 DAILYKIDS QUEST - E2E TEST SUITE\n');
console.log('═══════════════════════════════════════\n');

const start = Date.now();
const results = [];
try {
  for (const [name, fn] of sections) results.push({ name, ok: await fn() });
} catch (err) {
  console.error('💥 Test runner crashed:', err.message);
  process.exit(1);
}

const duration = ((Date.now() - start) / 1000).toFixed(2);
const passed = results.filter(r => r.ok).length;
const total = results.length;

console.log('\n═══════════════════════════════════════');
console.log(`\n📊 RESULTS: ${passed}/${total} sections passed (${((passed / total) * 100).toFixed(1)}%)`);
console.log(`⏱️  Duration: ${duration}s\n`);
results.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.name}`));
console.log('\n═══════════════════════════════════════\n');

if (passed === total) {
  console.log('🎉 ALL TESTS PASSED!\n');
  process.exit(0);
}
console.log(`⚠️  ${total - passed} section(s) failed\n`);
process.exit(1);
