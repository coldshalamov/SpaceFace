// Isolated production restore probe: clock controls never escape this child process.
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';

const mode = process.argv[2];
const runtime = createAuthoritativeRuntime({ profileId: 'production', seed: 2013, nodeSafeOnly: true });
const { state, bus } = runtime;
const save = runtime.getSystem('save');
const physics = runtime.getSystem('physics');
const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
let clock = performance.now();
let drains = 0;
let sectorPublished = false;
let transitionScheduled = false;
let failureBoundaryContexts = 0;
let failureBoundarySectorSeen = 0;
let failureBoundaryPending = 0;
let pendingAfterSectorPublish = 0;
let transitionPendingAtEntry = null;
let transitionPendingAfterDrain = null;
const seen = [];
const sectorSeen = [];
const nativeBoundaries = [];
const listenerContexts = [];
const saveErrors = [];
const restoreFrameYield = save._restoreFrameYield;
const originalDrain = bus.drainEmitSlice;
const originalPending = bus.pendingEmitSliceCount;
const originalEmit = bus.emit;
const originalCompleteSteps = physics.completeRestoreSteps;
const loadedSlot = 'loaded-listener-completion';

function finish(busToFinish) {
  let guard = 0;
  while (busToFinish.pendingEmitSliceCount() > 0 && guard++ < 1000) {
    originalDrain(4, 16);
  }
  if (busToFinish.pendingEmitSliceCount() > 0) throw new Error('newer_route_slice_did_not_finish');
}

try {
  state.mode = 'flight';
  state.settings.gameplay.tutorialHints = false;
  runtime.spawn({
    type: 'ship', team: 0,
    pos: { x: 120, z: -80 }, vel: { x: 0, z: 0 },
    rot: 0, hull: 100, hullMax: 100, radius: 6,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = state.entityList[state.entityList.length - 1].id;
  runtime.getSystem('world').newGame();
  runtime.getSystem('economy').newGame();
  bus.emit('game:started', {});
  if (!await physics.prepareBackend(state, { reset: true })) throw new Error('native backend setup failed');

  const envelope = JSON.parse(JSON.stringify(save.serialize(loadedSlot)));
  const savedTick = state.tick;
  if (['queued-sector', 'fail-once', 'takeover'].includes(mode)) {
    bus.setEmitSliceBudget('sector:enter', 1);
    for (let i = 0; i < 80; i++) {
      bus.on('sector:enter', payload => sectorSeen.push({ index: i, slot: payload?.slot }));
    }
  }
  for (let i = 0; i < 160; i++) {
    bus.on('save:loaded', payload => {
      seen.push(i);
      listenerContexts.push({ index: i, slot: payload?.slot, credits: state.player.credits });
    });
  }
  bus.on('save:error', payload => saveErrors.push(payload));
  physics.completeRestoreSteps = function* (...args) {
    nativeBoundaries.push({
      pending: bus.pendingEmitSliceCount(), seen: seen.length,
      sectorSeen: sectorSeen.length, tick: state.tick,
    });
    return yield* originalCompleteSteps.apply(this, args);
  };
  bus.emit = function (event, payload) {
    if (event === 'save:loaded' && payload?.slot === loadedSlot && !sectorPublished
        && ['queued-sector', 'fail-once', 'takeover'].includes(mode)) {
      sectorPublished = true;
      // Leave both an active sector tail and a queued save:loaded payload for the restore
      // drain to own. Failure injection below must cancel both before a newer route runs.
      originalEmit('sector:enter', { slot: loadedSlot });
      pendingAfterSectorPublish = originalPending.call(bus);
    }
    if (event === 'save:loaded' && payload?.slot === loadedSlot && mode === 'takeover'
        && !transitionScheduled) {
      transitionScheduled = true;
      save.deferRunTransition(() => {
        transitionPendingAtEntry = bus.pendingEmitSliceCount();
        originalEmit('save:loaded', { slot: 'newer-route' });
        finish(bus);
        originalEmit('sector:enter', { slot: 'newer-route' });
        finish(bus);
        transitionPendingAfterDrain = bus.pendingEmitSliceCount();
        return 'newer-route';
      });
    }
    return originalEmit(event, payload);
  };
  bus.drainEmitSlice = function (...args) {
    drains++;
    if (['fail-once', 'takeover'].includes(mode) && drains === 1) {
      failureBoundaryContexts = listenerContexts.length;
      failureBoundarySectorSeen = sectorSeen.length;
      failureBoundaryPending = originalPending.call(bus);
      return 0;
    }
    return originalDrain.apply(this, args);
  };
  if (mode === 'fail-once' || mode === 'takeover') {
    envelope.data.player.credits = 98765;
    delete envelope.checksum;
  }
  if (mode === 'stalled' || mode === 'rearming') {
    bus.pendingEmitSliceCount = () => 1;
    bus.drainEmitSlice = () => { drains++; return mode === 'stalled' ? 0 : 1; };
  }
  save._restoreFrameYield = async () => {};
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => mode === 'fast' ? clock : (clock += 10),
  });

  const prepared = save._prepareEnvelope(envelope);
  if (!prepared.ok) throw new Error(`probe_envelope_invalid:${prepared.reason}`);
  const ok = await save._restorePreparedEnvelopeAsync(prepared, loadedSlot);
  console.log(JSON.stringify({
    probe: 'save-loaded-completion', mode, ok, drains, savedTick, tick: state.tick,
    seen, sectorSeen, sectorPublished, nativeBoundaries, listenerContexts,
    failureBoundaryContexts, failureBoundarySectorSeen,
    failureBoundaryPending, pendingAfterSectorPublish, saveErrors,
    transitionPendingAtEntry, transitionPendingAfterDrain,
    credits: state.player.credits, pending: bus.pendingEmitSliceCount(),
  }));
} finally {
  if (descriptor) Object.defineProperty(performance, 'now', descriptor);
  else delete performance.now;
  save._restoreFrameYield = restoreFrameYield;
  bus.emit = originalEmit;
  bus.drainEmitSlice = originalDrain;
  bus.pendingEmitSliceCount = originalPending;
  physics.completeRestoreSteps = originalCompleteSteps;
  runtime.dispose();
}
