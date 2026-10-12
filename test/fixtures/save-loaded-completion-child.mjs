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
let failureBoundaryContexts = 0;
const seen = [];
const sectorSeen = [];
const nativeBoundaries = [];
const listenerContexts = [];
const originalDrain = bus.drainEmitSlice;
const originalPending = bus.pendingEmitSliceCount;
const originalComplete = physics.completeRestore;

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

  const envelope = JSON.parse(JSON.stringify(save.serialize('loaded-listener-completion')));
  const savedTick = state.tick;
  if (mode === 'queued-sector') {
    bus.setEmitSliceBudget('sector:enter', 1);
    for (let i = 0; i < 80; i++) bus.on('sector:enter', () => sectorSeen.push(i));
    bus.on('save:loaded', () => {
      if (sectorPublished) return;
      sectorPublished = true;
      bus.emit('sector:enter', {
        sectorId: state.world.currentSectorId, continuous: true, noTeleport: true,
        enterSerial: state.world.enterSerial, reason: 'restore-completion-test',
      });
    });
  }
  for (let i = 0; i < 160; i++) {
    bus.on('save:loaded', payload => {
      seen.push(i);
      listenerContexts.push({ index: i, slot: payload.slot, credits: state.player.credits });
    });
  }
  physics.completeRestore = function (...args) {
    nativeBoundaries.push({
      pending: bus.pendingEmitSliceCount(), seen: seen.length,
      sectorSeen: sectorSeen.length, tick: state.tick,
    });
    return originalComplete.apply(this, args);
  };
  bus.drainEmitSlice = function (...args) {
    drains++;
    if (mode === 'fail-once' && drains === 1) {
      failureBoundaryContexts = listenerContexts.length;
      return 0;
    }
    return originalDrain.apply(this, args);
  };
  if (mode === 'fail-once') {
    envelope.data.player.credits = 98765;
    delete envelope.checksum;
  }
  if (mode === 'stalled' || mode === 'rearming') {
    bus.pendingEmitSliceCount = () => 1;
    bus.drainEmitSlice = () => { drains++; return mode === 'stalled' ? 0 : 1; };
  }
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => mode === 'fast' ? clock : (clock += 10),
  });

  const ok = await save.loadEnvelope(envelope, 'loaded-listener-completion');
  console.log(JSON.stringify({
    probe: 'save-loaded-completion', mode, ok, drains, savedTick, tick: state.tick,
    seen, sectorSeen, sectorPublished, nativeBoundaries, listenerContexts,
    failureBoundaryContexts, credits: state.player.credits,
    pending: bus.pendingEmitSliceCount(),
  }));
} finally {
  if (descriptor) Object.defineProperty(performance, 'now', descriptor);
  else delete performance.now;
  bus.drainEmitSlice = originalDrain;
  bus.pendingEmitSliceCount = originalPending;
  physics.completeRestore = originalComplete;
  runtime.dispose();
}
