import test from 'node:test';
import assert from 'node:assert/strict';
import { installStartupJournal, STARTUP_JOURNAL_KEY } from '../src/core/startupJournal.js';
import { buildDiagnosticsReport } from '../src/ui/diagnosticsReport.js';

function fixture({ storage = new Map(), support = true, timeOrigin = 1000 } = {}) {
  const listeners = new Map(), hostEvents = new Map(), documentEvents = new Map();
  const bus = {
    on(type, fn) {
      const rows = listeners.get(type) || new Set(); rows.add(fn); listeners.set(type, rows);
      return () => rows.delete(fn);
    },
    emit(type, payload = {}) { for (const fn of listeners.get(type) || []) fn(payload); },
  };
  const target = events => ({
    addEventListener(type, fn) { const rows = events.get(type) || new Set(); rows.add(fn); events.set(type, rows); },
    removeEventListener(type, fn) { events.get(type)?.delete(fn); },
  });
  const state = { mode: 'menu', tick: 0, render: {} };
  let interval = null, writes = 0, reads = 0, clock = 0;
  const document = { ...target(documentEvents), visibilityState: 'visible' };
  const host = { ...target(hostEvents), document, location: { search: support ? '?launchReport=1' : '' },
    performance: { timeOrigin }, setInterval(fn) { interval = fn; return 1; }, clearInterval() { interval = null; } };
  const journal = installStartupJournal({ bus, state, host,
    storage: { getItem: key => storage.get(key), setItem(key, value) { writes++; storage.set(key, value); } },
    now: () => ++clock });
  const pending = Array.from({ length: 25 }, (_, id) => ({ id, type: 'ship', defId: 'ship_kestrel', status: 'compiling-pipelines',
    hook: true, promised: true, privatePilotName: 'PRIVATE_PILOT' }));
  state.render.authoredVisualReadiness = () => { reads++; return {
    playerId: 1, playerStatus: 'compiling-pipelines', startingHubId: 2, startingHubStatus: 'authored',
    ready: false, pipelineReady: false, openingPipelinePending: pending,
    flightReadyBlockers: [{ kind: 'role', role: 'player-flight-package', metadata: { id: 1, type: 'ship' } }],
  }; };
  state.render.openingAuthoredQueueDiagnostics = () => ({ present: true, pending: 25, inFlight: 1,
    compiling: 1, openingHeld: true, jobs: pending.map(row => ({ key: `ship-${row.id}`, lifecycle: 'in-flight', status: row.status })) });
  state.render.pendingPipelineAdmissions = () => 7;
  state.render.pendingAuthoredGpuResidency = () => 3;
  const emit = (events, type, payload = {}) => { for (const fn of events.get(type) || []) fn(payload); };
  return { bus, state, host, storage, journal, pending,
    sample: () => interval?.(), reads: () => reads, writes: () => writes,
    documentEvent: (type, payload) => emit(documentEvents, type, payload),
    hostEvent: (type, payload) => emit(hostEvents, type, payload),
    launch() { bus.emit('game:new'); state.mode = 'loading'; bus.emit('mode:changed', { mode: 'loading', previousMode: 'menu' }); } };
}

test('support route retains the last resource checkpoint across abrupt document replacement', () => {
  const first = fixture(); first.launch();
  first.bus.emit('game:loadingProgress', { id: 'render-pipelines', progress: .81, detail: '32 of 73 resources prepared' });
  first.bus.emit('game:loadingProgress', { id: 'render-pipelines', progress: .82, detail: '33 of 73 resources prepared' });
  first.sample();
  const stored = JSON.parse(first.storage.get(STARTUP_JOURNAL_KEY));
  assert.ok(Number.isFinite(stored.current.loading.capturedAt));
  assert.equal(stored.current.loading.pendingPipelineAdmissions, 7);
  assert.equal(stored.current.loading.pendingAuthoredGpuResidency, 3);
  assert.equal(stored.current.loading.openingPipelinePendingCount, 25);
  assert.ok(stored.current.loading.openingPipelinePending.length <= 3);
  assert.equal(stored.current.loading.queue.jobs[0].key, 'ship-0');
  assert.equal(stored.current.events.findLast(row => row.event === 'game:loadingProgress').detail, '33 of 73 resources prepared');
  assert.ok(!first.storage.get(STARTUP_JOURNAL_KEY).includes('PRIVATE_PILOT'));
  // No pagehide/dispose callback from the first document: model a process/page replacement.
  const next = fixture({ storage: first.storage, timeOrigin: 2000 });
  const snapshot = next.journal.snapshot();
  assert.equal(snapshot.previous.status, 'loading');
  assert.equal(snapshot.previous.timeOrigin, 1000);
  assert.equal(snapshot.current.timeOrigin, 2000);
  assert.deepEqual(snapshot.previous.loading, stored.current.loading);
  const report = buildDiagnosticsReport(next.state, { startup: snapshot, errors: [], env: {} });
  assert.match(report, /Previous document: loading/);
  assert.match(report, /Retained opening staging: .*"pendingAuthoredGpuResidency":3/);
  assert.match(report, /33 of 73 resources prepared/);
  first.journal.dispose(); next.journal.dispose();
});

test('ordinary launches keep the no-census sampler and progress coalescing avoids a write storm', () => {
  const f = fixture({ support: false }); f.launch();
  f.bus.emit('game:loadingProgress', { id: 'render-pipelines', detail: '0 of 73 resources prepared' });
  const writes = f.writes();
  for (let i = 1; i <= 500; i++) f.bus.emit('game:loadingProgress', {
    id: 'render-pipelines', progress: i / 1000, detail: `${i} resources prepared`,
  });
  assert.equal(f.writes(), writes, 'same-stage progress persists at the existing sampler boundary');
  f.sample();
  const stored = JSON.parse(f.storage.get(STARTUP_JOURNAL_KEY));
  assert.equal(f.reads(), 0, 'normal launch never runs a staging census');
  assert.equal(stored.current.loading, undefined);
  assert.equal(stored.current.events.filter(row => row.event === 'game:loadingProgress').length, 1);
  assert.equal(stored.current.events.at(-1).detail, '500 resources prepared');
  assert.equal(stored.current.events.at(-1).progress, .5);
  f.journal.dispose();
});

test('context loss checkpoints the main canvas immediately and distinguishes preview loss', () => {
  const f = fixture(); f.launch();
  const canvas = { id: 'game', width: 1170, height: 2532 };
  f.state.render.renderer = { domElement: canvas };
  // Document capture runs before the renderer's target listener publishes its lost flag.
  f.state.render.contextLost = false;
  f.documentEvent('webglcontextlost', { target: canvas, statusMessage: 'GPU reset' });
  const stored = JSON.parse(f.storage.get(STARTUP_JOURNAL_KEY));
  const lost = stored.current.events.at(-1);
  assert.equal(lost.canvas, 'game'); assert.equal(lost.mainCanvas, true);
  assert.equal(lost.width, 1170); assert.equal(lost.height, 2532);
  assert.equal(stored.current.sample.contextLost, false, 'retain the owner observation without inventing a later flag');
  assert.equal(stored.current.loading.playerStatus, 'compiling-pipelines');
  f.documentEvent('webglcontextlost', { target: { id: 'preview' } });
  assert.equal(f.journal.snapshot().current.events.at(-1).mainCanvas, false);
  delete f.state.render.renderer;
  f.documentEvent('webglcontextcreationerror', { target: canvas });
  assert.equal(f.journal.snapshot().current.events.at(-1).mainCanvas, undefined, 'an unknown renderer is not a preview verdict');
  assert.equal(f.state.mode, 'loading', 'observation cannot recover or hide the failure');
  f.journal.dispose();
});

test('a normal exit and BFCache return keep document identity and a retry clears old staging', () => {
  const f = fixture(); f.launch(); f.sample();
  f.bus.emit('game:exitToMenu', { source: 'pause' });
  f.state.mode = 'menu'; f.bus.emit('mode:changed', { mode: 'menu', previousMode: 'loading' });
  f.hostEvent('pagehide', { persisted: true }); f.hostEvent('pageshow', { persisted: true });
  const snapshot = f.journal.snapshot();
  assert.equal(snapshot.previous, null);
  assert.equal(snapshot.current.timeOrigin, 1000);
  assert.ok(snapshot.current.events.some(row => row.event === 'game:exitToMenu'));
  assert.equal(snapshot.current.events.at(-1).event, 'pageshow');
  assert.equal(snapshot.current.events.at(-1).id, 'cached');
  f.bus.emit('game:new');
  assert.equal(f.journal.snapshot().current.loading, undefined, 'a fresh attempt cannot inherit the previous resource checkpoint');
  f.journal.dispose();
});

test('persisted staging is bounded, sanitized and detached from mutable owner rows', () => {
  const f = fixture(); f.launch();
  for (const row of f.pending) { row.defId = 'd'.repeat(10000); row.type = 't'.repeat(10000); row.status = 's'.repeat(10000); }
  f.sample();
  const fillEvents = target => {
    for (let i = 0; i < 16; i++) target.bus.emit('game:startFailed', Object.fromEntries(
      ['id', 'code', 'stage', 'mode', 'previousMode', 'source', 'error', 'detail', 'canvas'].map(key => [key, 'x'.repeat(10000)]),
    ));
  };
  fillEvents(f);
  const before = f.storage.get(STARTUP_JOURNAL_KEY);
  f.pending[0].status = 'mutated';
  const next = fixture({ storage: f.storage, timeOrigin: 2000 }); next.launch(); next.sample();
  fillEvents(next);
  assert.ok(before.length < 32768);
  assert.ok(next.storage.get(STARTUP_JOURNAL_KEY).length < 32768);
  assert.notEqual(next.journal.snapshot().previous.loading.openingPipelinePending[0].status, 'mutated');
  assert.ok(next.journal.snapshot().previous.loading.openingPipelinePending[0].status.length <= 80);
  f.journal.dispose(); next.journal.dispose();
});
