import test from 'node:test';
import assert from 'node:assert/strict';
import { installStartupJournal, STARTUP_JOURNAL_KEY } from '../src/core/startupJournal.js';
import { buildDiagnosticsReport } from '../src/ui/diagnosticsReport.js';

function fixture(storage = new Map()) {
  const listeners = new Map();
  const bus = {
    on(type, fn) { const rows = listeners.get(type) || []; rows.push(fn); listeners.set(type, rows); return () => rows.splice(rows.indexOf(fn), 1); },
    emit(type, data) { for (const fn of listeners.get(type) || []) fn(data); },
  };
  const state = { mode: 'menu', tick: 0, render: {}, player: { name: 'PRIVATE_PILOT' } };
  let interval;
  const host = { addEventListener() {}, removeEventListener() {},
    setInterval(fn) { interval = fn; return 1; }, clearInterval() { interval = null; },
    performance: { timeOrigin: 1000 }, navigator: {} };
  const store = { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) };
  let time = 0;
  const journal = installStartupJournal({ bus, state, host, storage: store, now: () => ++time });
  return { bus, state, host, storage, journal, sample: () => interval?.() };
}

test('loading snapshot captures bounded detached authored blockers only on request', () => {
  const f = fixture();
  let reads = 0;
  const pending = Array.from({ length: 15 }, (_, id) => ({ id, type: 'ship', status: 'loading', hook: true, promised: true }));
  f.state.render.authoredVisualReadiness = () => { reads++; return { playerId: 1, playerStatus: 'loading',
    startingHubId: 2, startingHubStatus: 'authored', pipelineReady: false, ready: false,
    flightReadyBlockers: [{ kind: 'role', role: 'player', metadata: { id: 1, type: 'ship' } }], openingPipelinePending: pending }; };
  f.state.render.openingAuthoredQueueDiagnostics = () => ({ present: true, pending: 15, inFlight: 1,
    jobs: [{ key: 'ship-1', lifecycle: 'in-flight', status: 'loading' }] });
  f.state.render.pendingPipelineAdmissions = () => 2;
  f.state.mode = 'loading'; f.bus.emit('game:loadingProgress', { id: 'authored-visuals' }); f.sample();
  assert.equal(reads, 0, 'periodic sampling does not scan authored state');
  const snapshot = f.journal.snapshot();
  assert.equal(reads, 1); assert.equal(snapshot.loading.playerStatus, 'loading');
  assert.equal(snapshot.loading.openingPipelinePendingCount, 15);
  assert.equal(snapshot.loading.openingPipelinePending.length, 12);
  assert.equal(snapshot.loading.pendingPipelineAdmissions, 2);
  assert.equal(snapshot.loading.pendingAuthoredGpuResidency, null);
  pending[0].status = 'changed';
  assert.equal(snapshot.loading.openingPipelinePending[0].status, 'loading');
  const report = buildDiagnosticsReport(f.state, { startup: snapshot, errors: [], env: {} });
  assert.match(report, /Opening staging: .*"playerStatus":"loading"/);
  f.state.mode = 'flight'; assert.equal(f.journal.snapshot().loading, undefined);
  assert.equal(reads, 1, 'flight snapshots do not scan');
  f.journal.dispose();
});

test('first-picture hold remains observable after mode advances to flight', () => {
  const f = fixture();
  let reads = 0;
  f.state.mode = 'flight'; f.state.tick = 0;
  f.state.render.firstPlayableFrameAt = null;
  f.state.render.releaseOpeningPresentationHold = () => false;
  f.state.render.authoredVisualReadiness = () => { reads++; return { playerStatus: 'loading' }; };
  assert.equal(f.journal.snapshot().loading.playerStatus, 'loading');
  delete f.state.render.releaseOpeningPresentationHold;
  f.state.render.firstPlayableFrameAt = 100;
  assert.equal(f.journal.snapshot().loading, undefined);
  assert.equal(reads, 1, 'released flight does not perform the staging census');
  f.journal.dispose();
});

test('production startup evidence survives a new document without an unload callback', () => {
  const first = fixture();
  first.bus.emit('game:new', { name: 'PRIVATE_PILOT', seed: 999 });
  first.state.mode = 'loading';
  first.state.render.openingFirstPicturePhase = { stage: 'current-sector', outcome: 'pending' };
  first.bus.emit('game:loadingProgress', { id: 'render-pipelines', label: 'Preparing the visuals' });
  first.sample();
  const next = fixture(first.storage);
  assert.equal(next.journal.snapshot().previous.status, 'loading');
  assert.equal(next.journal.snapshot().previous.phase, 'current-sector');
  assert.equal(next.journal.snapshot().current.status, 'boot');
  assert.ok(!first.storage.get(STARTUP_JOURNAL_KEY).includes('PRIVATE_PILOT'));
  assert.equal(first.state.mode, 'loading', 'the observer cannot recover or mutate the run');
  first.journal.dispose(); next.journal.dispose();
});

test('a same-document menu return is distinct from a reload and retains the failure', () => {
  const f = fixture();
  f.bus.emit('game:new', {});
  f.state.mode = 'loading';
  f.bus.emit('mode:changed', { mode: 'loading', previousMode: 'menu' });
  f.state.mode = 'menu';
  f.bus.emit('mode:changed', { mode: 'menu', previousMode: 'loading' });
  assert.equal(f.journal.snapshot().current.status, 'returned-to-menu');
  f.bus.emit('game:startFailed', { code: 'GPU_CONTEXT_LOST', stage: 'gpu-resources', error: 'context lost' });
  const snapshot = f.journal.snapshot();
  assert.equal(snapshot.current.status, 'failed');
  assert.equal(snapshot.current.events.at(-1).code, 'GPU_CONTEXT_LOST');
  assert.equal(snapshot.previous, null);
  f.journal.dispose();
});

test('flight mode alone is not a completed launch; first presented picture is', () => {
  const f = fixture();
  f.bus.emit('game:new', {});
  f.state.mode = 'flight';
  f.bus.emit('mode:changed', { mode: 'flight' });
  f.sample();
  assert.notEqual(f.journal.snapshot().current.status, 'playing');
  f.state.render.firstPlayableFrameAt = 123;
  f.state.render.flightVeilHoldsSim = false;
  f.sample();
  assert.equal(f.journal.snapshot().current.status, 'playing');
  f.journal.dispose();
});

test('repeated progress is coalesced, storage is bounded and hostile storage is harmless', () => {
  const f = fixture();
  f.bus.emit('game:new', {});
  for (let i = 0; i < 500; i++) f.bus.emit('game:loadingProgress', { id: 'render-pipelines', detail: 'x'.repeat(10000) });
  assert.ok(f.journal.snapshot().current.events.length < 10);
  assert.ok(f.storage.get(STARTUP_JOURNAL_KEY).length < 16000);
  for (let i = 0; i < 100; i++) f.bus.emit('game:startFailed', {
    id: 'i'.repeat(10000), stage: 's'.repeat(10000), code: 'c'.repeat(10000), error: 'e'.repeat(10000),
  });
  const next = fixture(f.storage);
  for (let i = 0; i < 100; i++) next.bus.emit('game:startFailed', { error: 'x'.repeat(10000) });
  assert.ok(f.storage.get(STARTUP_JOURNAL_KEY).length < 32768);
  assert.ok(next.journal.snapshot().previous.events.length <= 16);
  next.journal.dispose();
  f.journal.dispose();
  const broken = installStartupJournal({ bus: f.bus, state: f.state, host: f.host,
    storage: { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } } });
  assert.doesNotThrow(() => f.bus.emit('game:new', {}));
  broken.dispose();
});

test('a previous flight picture cannot certify a fresh launch before its world is built', () => {
  const f = fixture();
  f.state.mode = 'flight'; f.state.render.firstPlayableFrameAt = 123;
  f.bus.emit('game:new', {});
  assert.equal(f.journal.snapshot().current.status, 'launch-requested');
  f.sample();
  assert.equal(f.journal.snapshot().current.status, 'launch-requested');
  f.journal.dispose();
});
