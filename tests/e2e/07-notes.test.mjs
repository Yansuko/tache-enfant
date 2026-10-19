// tests/e2e/07-notes.test.mjs
// Spec model: children[i].notes[] = { id, text, author, createdAt }; deletion is soft (deletedAt) so the audit trail stays in DB.
import assert from 'assert';
import { withFamily, mkChild, uniq, runAll } from './framework.mjs';

const mkNote = (text, author = 'parent') => ({ id: `note-${uniq()}`, text, author, createdAt: Date.now() });
const visible = c => c.notes.filter(n => !n.deletedAt);

export const test71AddNote = () =>
  withFamily('7.1 Add note for child', { children: [mkChild('Alice'), mkChild('Bob')] }, async ({ get, update }) => {
    const before = Date.now();
    await update(f => f.children[0].notes.push(mkNote("Alice a été très sage aujourd'hui!")));
    const [alice, bob] = (await get()).children;
    assert.strictEqual(alice.notes.length, 1);
    assert.strictEqual(alice.notes[0].text, "Alice a été très sage aujourd'hui!");
    assert.ok(alice.notes[0].createdAt >= before, 'timestamp recorded');
    assert.strictEqual(bob.notes.length, 0, 'note must not leak to another child');
  });

export const test72DeleteNote = () =>
  withFamily('7.2 Delete note (soft, audit kept)', { children: [mkChild('Alice', { notes: [mkNote('A'), mkNote('B')] })] },
    async ({ get, update }) => {
      await update(f => { f.children[0].notes[0].deletedAt = Date.now(); });
      const [alice] = (await get()).children;
      assert.deepStrictEqual(visible(alice).map(n => n.text), ['B']);
      assert.strictEqual(alice.notes.length, 2, 'audit trail kept in DB');
    });

export const runNoteTests = () => runAll('📝 NOTE TESTS', [test71AddNote, test72DeleteNote]);

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit((await runNoteTests()) ? 0 : 1);
}
