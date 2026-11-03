// Boot-level retry (NO GL / route=none): one retry, first attempt recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRetryNote, bootAttemptRecord } from '../scripts/player-truth/run.mjs';

test('NO GL boot is retried', () => {
  assert.match(bootRetryNote({ verdict: 'FAIL', stopReason: 'Graphics could not start', reachedPlay: false }), /NO GL/);
  assert.match(bootRetryNote({ verdict: 'FAIL', stopReason: 'x', noGl: true, reachedPlay: true }), /NO GL/);
});

test('route=none (never reached play) is retried', () => {
  assert.match(bootRetryNote({ verdict: 'FAIL', stopReason: 'Error: main menu did not appear', reachedPlay: false }), /route=none/);
});

test('a run that reached play is not retried', () => {
  assert.equal(bootRetryNote({ verdict: 'FAIL', stopReason: 'duration reached', reachedPlay: true, noGl: false }), null);
});

test('only one retry, and environment losses keep their own path', () => {
  assert.equal(bootRetryNote({ stopReason: 'main menu did not appear', reachedPlay: false, retried: true }), null);
  assert.equal(bootRetryNote({ stopReason: 'x', reachedPlay: false, environmentLoss: { environment: true } }), null);
  assert.equal(bootRetryNote(null), null);
});

test('first attempt record keeps its evidence', () => {
  const r = bootAttemptRecord({ verdict: 'FAIL', stopReason: 'main menu did not appear', reachedPlay: false, noGl: false }, 'note', 'out/x-attempt1');
  assert.deepEqual(r, { attempt: 1, verdict: 'FAIL', stopReason: 'main menu did not appear', reachedPlay: false, noGl: false, retryNote: 'note', outDir: 'out/x-attempt1' });
});
