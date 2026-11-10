import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function probe(mode) {
  const result = spawnSync(process.execPath, ['test/fixtures/save-loaded-completion-child.mjs', mode], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '' },
  });
  assert.equal(result.error, undefined, `${mode}: ${result.error?.message}`);
  assert.equal(result.status, 0, `${mode}: ${result.stderr}\n${result.stdout}`);
  const row = result.stdout.split('\n').filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line)).find(row => row.probe === 'save-loaded-completion');
  assert(row, `${mode}: missing completion receipt`);
  return row;
}

for (const mode of ['fast', 'slow', 'queued-sector']) {
  test(`production async restore completes every legitimate listener before native completion (${mode})`, () => {
    const row = probe(mode);
    assert.equal(row.ok, true);
    assert.equal(row.tick, row.savedTick, 'restore does not advance the gameplay clock');
    assert.deepEqual(row.seen, Array.from({ length: 160 }, (_, i) => i),
      'all save-loaded listeners run once in registration order');
    assert.equal(row.pending, 0, 'successful restore leaves no deferred semantic listeners');
    assert.equal(row.nativeBoundaries.length, 1, 'one native completion boundary');
    assert.equal(row.nativeBoundaries[0].pending, 0, 'native completion cannot precede listeners');
    assert.equal(row.nativeBoundaries[0].seen, 160, 'native completion sees all restored owners');
    if (mode !== 'fast') assert(row.drains > 65, 'slow listener progress must outlive the old fixed loop guard');
    if (mode === 'queued-sector') {
      assert.equal(row.sectorPublished, true);
      assert.equal(row.sectorSeen.length, 160, 'both the restored sector and queued sector payload complete');
      assert.equal(row.nativeBoundaries[0].sectorSeen, 160,
        'queued sector callbacks finish before native completion');
    }
  });
}

for (const mode of ['stalled', 'rearming']) {
  test(`production async restore fails closed on a bounded ${mode} listener drain`, () => {
    const row = probe(mode);
    assert.equal(row.ok, false, 'a stuck or endlessly rearmed restore cannot report success');
    assert.equal(row.nativeBoundaries.length, 0, 'failure never crosses native completion');
    assert(row.drains > 0 && row.drains <= 10000,
      'hostile drains have a finite safety bound, including rollback');
  });
}

test('failed async restore cancels its pending callbacks before a successful rollback completes', () => {
  const row = probe('fail-once');
  assert.equal(row.ok, false, 'requested load failed even though rollback succeeds');
  assert.equal(row.credits, 0, 'rollback restores the prior player value');
  assert.equal(row.pending, 0, 'rollback leaves no semantic event tail');
  const afterFailure = row.listenerContexts.slice(row.failureBoundaryContexts);
  assert.equal(afterFailure.some(entry => entry.slot === 'loaded-listener-completion'), false,
    'failed-session callbacks cannot execute against rollback state');
  assert.equal(afterFailure.length, 160, 'all rollback listeners still execute');
  assert(afterFailure.every(entry => entry.slot === 'quick' && entry.credits === 0));
  assert.equal(row.nativeBoundaries.length, 1, 'only valid rollback reaches native completion');
  assert.equal(row.nativeBoundaries[0].pending, 0);
  assert.equal(row.nativeBoundaries[0].seen, row.failureBoundaryContexts + 160);
});

test('failed async drain cancels the active and queued tails before a newer transition emits', () => {
  const row = probe('takeover');
  assert.equal(row.ok, true, 'the queued newer route supersedes the interrupted load');
  assert.equal(row.sectorPublished, true, 'the interrupted restore published a sector payload');
  assert(row.pendingAfterSectorPublish > 0, 'the interrupted sector payload leaves a live tail');
  assert(row.failureBoundaryPending > 0, 'the failed drain still owns active/queued semantic work');
  assert.equal(row.transitionPendingAtEntry, 0, 'the transition enters after old semantic tails are cancelled');
  assert.equal(row.transitionPendingAfterDrain, 0, 'the newer route drains its own fresh semantic tails');
  assert.deepEqual(row.listenerContexts.slice(row.failureBoundaryContexts).map(entry => entry.slot),
    Array(160).fill('newer-route'), 'no failed-slot callback runs after the cancellation boundary');
  assert.equal(row.sectorSeen.slice(row.failureBoundarySectorSeen).length, 80,
    'newer sector listeners survive cancellation and all finish');
  assert(row.sectorSeen.slice(row.failureBoundarySectorSeen).every(entry => entry.slot === 'newer-route'));
  assert.equal(row.nativeBoundaries.length, 0, 'supersession is not mistaken for a rollback/native completion');
  assert.deepEqual(row.saveErrors, [], 'a superseded failure does not leak a stale restore error');
  assert.equal(row.pending, 0);
});
