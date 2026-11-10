import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import { save } from '../src/save/saveSystem.js';
import { saveErrorText } from '../src/ui/saveFeedback.js';

function harness(t, { temporary = true, stored = {} } = {}) {
  const priorStorage = globalThis.localStorage;
  const map = new Map(Object.entries(stored));
  globalThis.localStorage = {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
  const state = createGameState(4242);
  state.mode = 'paused';
  state.tick = 1_800;
  state.simTime = 30;
  if (temporary) {
    state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
    state.run.phase = 'active';
    state.run.wave = 3;
  }
  const bus = createBus();
  const receipts = [];
  for (const name of ['run:ended', 'run:endRequested', 'save:error', 'save:restoring', 'save:profile-imported']) {
    bus.on(name, payload => receipts.push({ name, payload }));
  }
  const runs = Object.create(runSession);
  runs.init({ state, bus });
  const owner = Object.create(save);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  owner._hasPlayerEntity = () => false;
  t.after(() => {
    owner.destroy();
    runs.destroy();
    if (priorStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorStorage;
  });
  return { owner, runs, state, bus, receipts, map,
    events: name => receipts.filter(row => row.name === name) };
}

function gate() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('a missing or corrupt public load leaves the live run and its record unsettled', t => {
  const h = harness(t, { stored: { 'sf.save.broken': '{not-json' } });
  const originalRun = h.state.run;
  for (const slot of ['missing', 'broken']) h.bus.emit('game:load', { slot });
  assert.equal(h.state.run, originalRun);
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.events('run:ended').length, 0);
  assert.equal(h.events('save:restoring').length, 0);
  assert.equal(h.events('save:error').length, 2);
  assert.equal(h.owner._campaignSaveSuppressed(), true);
});

test('a rollback-capture refusal does not retire a run before destructive restore', t => {
  const h = harness(t, { stored: { 'sf.save.target': 'valid-fixture' } });
  h.owner._prepareEnvelopeString = () => ({ ok: true, data: {}, env: {} });
  h.owner._hasPlayerEntity = () => true;
  h.owner._captureRollbackSnapshot = () => { throw new Error('cannot capture current world'); };
  const originalRun = h.state.run;
  h.bus.emit('game:load', { slot: 'target' });
  assert.equal(h.state.run, originalRun);
  assert.equal(h.events('run:ended').length, 0);
  assert.equal(h.events('save:restoring').length, 0);
  assert.equal(h.events('save:error').at(-1).payload.reason, 'restore_prepare_failed');
});

test('the committed restore boundary retires a temporary run once at its real tick', t => {
  const h = harness(t);
  const session = h.owner._openRestoreSession({}, 'target', { deferRestoringEmit: true });
  assert.equal(h.events('run:ended').length, 0, 'capture can still fail before this boundary');
  h.owner._firePendingRestoringEmit(session);
  h.owner._firePendingRestoringEmit(session);
  assert.equal(h.events('run:ended').length, 1);
  const request = h.events('run:endRequested')[0].payload;
  assert.equal(request.reason, 'load_during_run');
  assert.equal(request.tick, 1_800);
  assert.equal(h.receipts.findIndex(row => row.name === 'run:ended')
    < h.receipts.findIndex(row => row.name === 'save:restoring'), true);
  assert.equal(h.state.run.phase, 'inactive');
  h.owner._closeRestoreSession(session, null);
  assert.equal(h.owner._campaignSaveSuppressed(), false);
});

for (const verdict of [{ ok: false, reason: 'checksum' }, { ok: true, env: {}, data: {} }]) {
  test(`a newer game supersedes an async slot ${verdict.ok ? 'success' : 'failure'}`, async t => {
    const h = harness(t, { stored: { 'sf.save.target': 'fixture' } });
    const preparation = gate();
    h.owner._prepareEnvelopeStringAsync = () => preparation.promise;
    let restored = false;
    h.owner._restoreAsync = async () => { restored = true; return { restored: true }; };
    const pending = h.owner.loadAsync('target');
    h.bus.emit('game:new', { seed: 888 });
    const successor = { ...h.state.run, seed: 888 };
    h.state.run = successor;
    preparation.resolve(verdict);
    assert.equal(await pending, true);
    assert.equal(restored, false);
    assert.equal(h.state.run, successor);
    assert.equal(h.events('save:error').length, 0);
    assert.equal(h.events('run:ended').length, 0);
  });
}

test('a stale successful import cannot merge medals or replace a newer game', async t => {
  const h = harness(t);
  const preparation = gate();
  h.owner._prepareEnvelopeStringAsync = () => preparation.promise;
  let imported = 0, restored = 0;
  h.owner._importProfileSideBags = () => { imported++; };
  h.owner._restoreAsync = async () => { restored++; return { restored: true }; };
  const pending = h.owner.importString('fixture', 'imported');
  h.bus.emit('game:new', { seed: 888 });
  preparation.resolve({ ok: true, env: { profile: { achievements: {} } }, data: {} });
  assert.equal(await pending, false);
  assert.equal(imported, 0);
  assert.equal(restored, 0);
});

test('a run launched during rollback capture supersedes the older accepted import', async t => {
  const h = harness(t);
  const capture = gate();
  h.owner._hasPlayerEntity = () => true;
  h.owner._frozenTickBoundary = () => true;
  h.owner._captureRollbackSnapshotAsync = () => capture.promise;
  let restored = 0;
  h.owner._restoreAsync = async () => { restored++; return { restored: true }; };
  const pending = h.owner._restorePreparedEnvelopeAsync({ data: {} }, 'target', {
    acceptSeq: h.owner._restoreSequence, acceptEpoch: h.owner._runEpoch,
  });
  h.bus.emit('game:new', { seed: 888 });
  capture.resolve({ data: {}, slot: 'original' });
  assert.equal(await pending, true, 'supersession stays handled');
  assert.equal(restored, 0);
  assert.equal(h.events('run:ended').length, 0);
  assert.equal(h.events('save:error').length, 0);
});

test('an import superseded during capture cannot tell its UI that it was imported', async t => {
  const h = harness(t);
  const capture = gate(), started = gate();
  h.owner._prepareEnvelopeStringAsync = async () => ({ ok: true, data: {}, env: {} });
  h.owner._hasPlayerEntity = () => true;
  h.owner._frozenTickBoundary = () => true;
  h.owner._captureRollbackSnapshotAsync = () => { started.resolve(); return capture.promise; };
  const pending = h.owner.importString('fixture', 'imported');
  await started.promise;
  h.bus.emit('game:new', { seed: 888 });
  capture.resolve({ data: {}, slot: 'original' });
  assert.equal(await pending, false);
  assert.equal(h.events('save:restoring').length, 0);
  assert.equal(h.events('save:error').length, 0);
});

for (const supersede of [false, true]) {
  test(`an import queued behind restore waits for ${supersede ? 'cancellation' : 'its own commit'}`, async t => {
    const h = harness(t, { temporary: false });
    const session = h.owner._openRestoreSession({}, 'outer', {});
    h.owner._restoreChunks = function* () {};
    let settled = null;
    const pending = h.owner._restorePreparedEnvelopeAsync({ data: {} }, 'imported', {
      acceptSeq: h.owner._restoreSequence, acceptEpoch: h.owner._runEpoch, requireCommit: true,
    }).then(ok => { settled = ok; return ok; });
    await Promise.resolve();
    assert.equal(settled, null, 'queue acceptance is not a world import receipt');
    if (supersede) h.owner.deferRunTransition(() => { h.state.fixtureRoute = 'successor'; });
    h.owner._closeRestoreSession(session, null);
    assert.equal(await pending, !supersede);
    assert.equal(h.events('save:error').length, 0);
    if (supersede) assert.equal(h.state.fixtureRoute, 'successor');
    else assert.equal(h.events('save:restoring').filter(row => row.payload.slot === 'imported').length, 1);
  });
}

test('a destructive failure keeps temporary state quarantined and offers a usable next route', t => {
  const h = harness(t, { stored: { 'sf.save.quick': 'previous Adventure' } });
  h.owner._restoreChunks = function* () { throw new Error('restore unavailable'); };
  assert.equal(h.owner._restorePreparedEnvelope({ data: {} }, 'target'), false);
  assert.equal(h.events('run:ended').length, 1);
  assert.equal(h.owner._campaignSaveSuppressed(), true, 'discarded arena cannot become campaign state');
  assert.equal(h.map.get('sf.save.quick'), 'previous Adventure');
  const failure = h.events('save:error').at(-1).payload;
  assert.equal(failure.temporarySession, true);
  const message = saveErrorText(failure);
  assert.match(message, /Adventure saves are untouched/);
  assert.match(message, /Load another save/);
  assert.match(message, /main menu/);
  // A subsequent valid load is still admitted, and releases the old temporary lease.
  h.owner._restoreChunks = function* () {};
  assert.equal(h.owner._restorePreparedEnvelope({ data: {} }, 'replacement'), true);
  assert.equal(h.owner._campaignSaveSuppressed(), false);
  assert.equal(h.events('run:ended').length, 1, 'retry cannot settle the departed run twice');
});

test('failure feedback distinguishes unchanged, unrestorable and temporary flights', () => {
  assert.match(saveErrorText({ slot: '2', reason: 'restore_prepare_failed' }), /current flight is unchanged/);
  const rollback = saveErrorText({ slot: '2', reason: 'load_failed', rollback: 'failed' });
  assert.match(rollback, /previous flight could not be restored/);
  assert.match(rollback, /Load another save/);
  assert.match(saveErrorText({ reason: 'temporary_session' }), /Load or start Adventure/);
});

test('a file chosen before a different run cannot start a fresh import when reading finishes', async t => {
  const h = harness(t);
  const priorReader = globalThis.FileReader;
  let reader;
  globalThis.FileReader = class {
    constructor() { reader = this; }
    readAsText() {}
  };
  t.after(() => {
    if (priorReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = priorReader;
  });
  let imports = 0, result;
  h.owner.importString = () => { imports++; return true; };
  h.owner.importFile({ size: 10 }, ok => { result = ok; });
  h.bus.emit('game:new', { seed: 888 });
  reader.result = 'fixture';
  reader.onload();
  assert.equal(imports, 0);
  assert.equal(result, false);
  assert.equal(h.events('save:error').length, 0);
});
