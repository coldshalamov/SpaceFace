import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { VoiceQueue } from '../src/ui/voiceArbiter.js';
import * as runtimeModule from '../src/systems/bandRadio.js';

function makeHarness(seed = 47) {
  const bus = createBus();
  const voices = [];
  const events = [];
  const queue = { active: null, pending: [] };
  const state = {
    meta: { seed }, simTime: 0, mode: 'flight', ui: { docked: false },
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime', factionId: 'faction_scn', tier: 0, security: 0.98,
          stations: [{ factionId: 'faction_scn' }],
        },
      },
    },
    factions: { faction_reach: { rep: 0 } },
  };
  const registry = { get: (name) => name === 'voiceArbiter' ? { queue } : null };
  const helpers = { voice: { say(message) { voices.push(structuredClone(message)); return true; } } };
  for (const name of ['band:status', 'band:bed', 'band:bearingRequest', 'band:bearingReceipt']) {
    bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  }
  assert.ok(runtimeModule.bandRadio && typeof runtimeModule.bandRadio.init === 'function',
    'bandRadio system export must exist');
  const system = Object.create(runtimeModule.bandRadio);
  system.init({ state, bus, helpers, registry });
  system.newGame();
  return { bus, voices, events, queue, state, system };
}

function tuneAndSpeak(h, channelId) {
  h.bus.emit('band:tune', { channelId, source: 'test' });
  h.system.update(0, h.state);
}

test('Band tuner is off-first, cycles deterministically, and speaks through the arbiter only', () => {
  const h = makeHarness();
  assert.equal(h.state.bandRadio.channelId, null);
  h.bus.emit('band:cycle', { source: 'test' });
  assert.equal(h.state.bandRadio.channelId, 'concord_bulletin');
  h.system.update(0, h.state);
  assert.equal(h.voices.length, 1);
  assert.equal(h.voices[0].channel, 'band');
  assert.equal(h.voices[0].priority, runtimeModule.BAND_PRIORITY);
  assert.match(h.voices[0].text, /Concord Bulletin/);
  assert.equal(h.events.some((row) => row.name === 'band:bed' && row.payload.active), true);
});

test('Band emits nothing while story or comms owns the one-voice floor', () => {
  const h = makeHarness();
  h.queue.active = { channel: 'story', text: 'Load-bearing story' };
  h.bus.emit('band:tune', { channelId: 'the_margin' });
  h.system.update(0, h.state);
  assert.equal(h.voices.length, 0);
  assert.equal(h.events.some((row) => row.name === 'band:bed' && row.payload.active), false);

  h.queue.active = null;
  h.state.simTime = 1;
  h.system.update(1, h.state);
  assert.equal(h.voices.length, 1);
  assert.equal(h.voices[0].channel, 'band');
});

test('Band keeps its carrier under its own ticker but yields to queued non-Band speech', () => {
  const h = makeHarness();
  h.queue.active = { channel: 'band', text: 'Current Band line' };
  h.bus.emit('band:tune', { channelId: 'concord_bulletin' });
  h.system.update(0, h.state);
  assert.equal(h.events.filter((row) => row.name === 'band:bed').at(-1).payload.active, true);

  h.queue.pending.push({ channel: 'comms', text: 'Incoming addressed call' });
  h.state.simTime = 1;
  h.system.update(1, h.state);
  const bed = h.events.filter((row) => row.name === 'band:bed').at(-1).payload;
  assert.equal(bed.active, false);
  assert.equal(bed.reason, 'voice-floor-busy');
});

test('Band priority loses the floor immediately to story in the real VoiceQueue', () => {
  const h = makeHarness();
  tuneAndSpeak(h, 'ballad_line');
  const message = h.voices[0];
  const queue = new VoiceQueue({ barkMinGapMs: 0 });
  queue.enqueue(message, 0);
  queue.step(0);
  assert.equal(queue.active.channel, 'band');
  queue.enqueue({ channel: 'story', text: 'Story owns the floor', ttl: 6 }, 10);
  queue.step(10);
  assert.equal(queue.active.channel, 'story');
});

test('same seed and context produce the same Band content without consuming state.rng', () => {
  const a = makeHarness(3107);
  const b = makeHarness(3107);
  for (const h of [a, b]) {
    h.state.rng = () => { throw new Error('Band must not consume the shared gameplay stream'); };
    tuneAndSpeak(h, 'the_static');
    h.state.simTime = 30;
    h.system.update(30, h.state);
  }
  assert.deepEqual(a.voices, b.voices);
});

test('numbers station waits for an external canonical resolution and receipts it exactly once', () => {
  assert.equal(typeof runtimeModule.numbersBearingDue, 'function');
  const h = makeHarness(9001);
  tuneAndSpeak(h, 'numbers_station');
  h.voices.length = 0;

  let dueSequence = 0;
  while (!runtimeModule.numbersBearingDue(h.state.meta.seed, dueSequence) && dueSequence < 10000) {
    dueSequence += 1;
  }
  assert.ok(dueSequence < 10000, 'a deterministic rare request sequence exists');
  h.state.bandRadio.sequence = dueSequence;
  h.state.bandRadio.nextLineAtS = 0;
  h.state.bandRadio.identPending = false;
  h.state.simTime = 40;
  h.system.update(40, h.state);

  const requestRows = h.events.filter((row) => row.name === 'band:bearingRequest');
  assert.equal(requestRows.length, 1);
  assert.equal(h.state.bandRadio.numbersReceipt, null,
    'request alone is not evidence of a real bearing');
  const requestId = requestRows[0].payload.requestId;

  h.bus.emit('band:bearingResolved', {
    requestId: 'wrong-request', canonical: true, wreckId: 'd1',
    sourceRef: 'future.band.d1', bearingLabel: '044-218',
  });
  assert.equal(h.state.bandRadio.numbersReceipt, null);

  const canonical = {
    requestId, canonical: true, wreckId: 'd1', sourceRef: 'future.band.d1',
    bearingLabel: '044-218', sectorId: 'sector_ceres_belt',
  };
  h.bus.emit('band:bearingResolved', canonical);
  h.bus.emit('band:bearingResolved', canonical);
  assert.equal(h.events.filter((row) => row.name === 'band:bearingReceipt').length, 1);
  assert.equal(h.state.bandRadio.numbersReceipt.wreckId, 'd1');
  assert.equal(h.state.bandRadio.numbersReceipt.sourceRef, 'future.band.d1');

  h.state.simTime = 41;
  h.system.update(1, h.state);
  assert.equal(h.voices.filter((row) => row.text.includes('044-218')).length, 1);

  const saved = h.system.serialize();
  const restored = makeHarness(9001);
  restored.system.deserialize(saved);
  assert.deepEqual(restored.state.bandRadio.numbersReceipt, h.state.bandRadio.numbersReceipt);
  restored.state.bandRadio.sequence = dueSequence;
  restored.state.bandRadio.nextLineAtS = 0;
  restored.state.bandRadio.identPending = false;
  restored.state.simTime = 80;
  restored.bus.emit('band:tune', { channelId: 'numbers_station' });
  restored.state.bandRadio.identPending = false;
  restored.system.update(80, restored.state);
  assert.equal(restored.events.filter((row) => row.name === 'band:bearingRequest').length, 0,
    'one accepted receipt caps the numbers drop for this save');
});

test('Quiessence overrides the tuned carrier while the Hush produces an RF hole', () => {
  const h = makeHarness();
  tuneAndSpeak(h, 'concord_bulletin');
  h.voices.length = 0;
  h.bus.emit('band:sourceProximity', { sourceId: 'landmark_quiessence', strength: 0.9 });
  h.state.bandRadio.nextLineAtS = 0;
  h.state.bandRadio.identPending = true;
  h.state.simTime = 30;
  h.system.update(30, h.state);
  assert.match(h.voices[0].text, /QUIET MEMORIAL/);

  h.bus.emit('band:sourceProximity', { sourceId: 'planet_hush', strength: 1 });
  h.voices.length = 0;
  h.state.bandRadio.nextLineAtS = 0;
  h.state.simTime = 60;
  h.system.update(30, h.state);
  assert.equal(h.voices.length, 0);
  const lastBed = h.events.filter((row) => row.name === 'band:bed').at(-1).payload;
  assert.equal(lastBed.active, false);
  assert.equal(lastBed.silence, true);
});

test('live stamped landmark carriers derive and clear Band proximity from player distance', () => {
  const h = makeHarness();
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const quiessence = {
    id: 817,
    type: 'ship',
    alive: true,
    pos: { x: 100, z: 0 },
    data: {
      sectorId: 'sector_pallas_drift',
      flavorTargetRef: 'landmark_c14_quiessence',
      quiessenceShipIndex: 7,
    },
  };
  h.state.playerId = player.id;
  h.state.entities = new Map([[player.id, player], [quiessence.id, quiessence]]);
  h.state.world.currentSectorId = 'sector_pallas_drift';
  h.state.world.sectors.sector_pallas_drift = {
    id: 'sector_pallas_drift', factionId: 'faction_quiet', tier: 2, security: 0.45, stations: [],
  };

  h.bus.emit('band:tune', { channelId: 'concord_bulletin' });
  h.state.simTime = 1;
  h.system.update(1, h.state);
  assert.ok(h.state.bandRadio.proximitySources.landmark_quiessence >= 0.55,
    'a nearby physical Quiessence carrier should supply the existing landmark override');
  assert.equal(h.state.bandRadio.effectiveSourceId, 'landmark_quiessence');

  player.pos.x = 10000;
  h.state.simTime = 2;
  h.system.update(1, h.state);
  assert.equal(h.state.bandRadio.proximitySources.landmark_quiessence, undefined,
    'moving beyond the physical carrier range should clear the derived sample');
  assert.equal(h.state.bandRadio.effectiveSourceId, null);

  const hush = {
    id: 701,
    type: 'anomaly',
    alive: true,
    pos: { x: 30, z: 0 },
    data: { sectorId: 'sector_eunomia_gulf', flavorSourceId: 'planet_hush' },
  };
  player.pos.x = 0;
  h.state.entities = new Map([[player.id, player], [hush.id, hush]]);
  h.state.world.currentSectorId = 'sector_eunomia_gulf';
  h.state.world.sectors.sector_eunomia_gulf = {
    id: 'sector_eunomia_gulf', factionId: 'faction_free', tier: 3, security: 0.2, stations: [],
  };
  h.bus.emit('sector:enter', { sectorId: 'sector_eunomia_gulf' });
  h.state.simTime = 3;
  h.system.update(1, h.state);
  assert.ok(h.state.bandRadio.proximitySources.planet_hush >= 0.6,
    'a nearby physical Hush carrier should supply the existing RF-hole override');
  assert.equal(h.state.bandRadio.effectiveSourceId, 'planet_hush');
  assert.equal(h.events.filter((row) => row.name === 'band:bed').at(-1).payload.silence, true);

  h.state.entities.delete(hush.id);
  h.state.simTime = 4;
  h.system.update(1, h.state);
  assert.deepEqual(h.state.bandRadio.proximitySources, {},
    'removing the physical carrier should clear its derived proximity on the next sample');
  assert.equal(h.state.bandRadio.effectiveSourceId, null);

  h.state.bandRadio.proximitySources.planet_hush = 1;
  h.state.entities.delete(player.id);
  h.state.simTime = 5;
  h.system.update(1, h.state);
  assert.deepEqual(h.state.bandRadio.proximitySources, {},
    'a live entity graph with no resolvable player must clear stale derived proximity');
});

test('landmark bleed is transient across sector entry and save restore', () => {
  const h = makeHarness();
  tuneAndSpeak(h, 'concord_bulletin');
  h.bus.emit('band:sourceProximity', { sourceId: 'landmark_quiessence', strength: 0.9 });
  h.state.simTime = 30;
  h.state.bandRadio.nextLineAtS = 0;
  h.system.update(30, h.state);
  assert.equal(h.state.bandRadio.effectiveSourceId, 'landmark_quiessence');

  const saved = h.system.serialize();
  assert.deepEqual(saved.proximitySources, {});
  assert.equal(saved.effectiveSourceId, null);
  assert.equal(saved.signalStrength, 0);

  h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.deepEqual(h.state.bandRadio.proximitySources, {});
  assert.equal(h.state.bandRadio.effectiveSourceId, null);

  const restored = makeHarness();
  restored.system._nextLandmarkProximitySampleAtS = 9999;
  restored.system.deserialize({
    ...saved,
    proximitySources: { planet_hush: 1 },
    effectiveKey: 'landmark:planet_hush',
    effectiveChannelId: 'landmark_bleed',
    effectiveSourceId: 'planet_hush',
    signalStrength: 1,
  });
  assert.deepEqual(restored.state.bandRadio.proximitySources, {});
  assert.equal(restored.state.bandRadio.effectiveSourceId, null);
  assert.equal(restored.state.bandRadio.effectiveChannelId, 'concord_bulletin');
  assert.equal(restored.system._nextLandmarkProximitySampleAtS, 0,
    'loading an older sim clock must make live landmark proximity eligible immediately');
  restored.system.destroy();
  h.system.destroy();
});
