import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import { save } from '../src/save/saveSystem.js';
import { missionDossierSummary } from '../src/ui/station/screens/contracts.js';

let runtimeModule = null;
try {
  runtimeModule = await import('../src/systems/v2FlavorRuntime.js');
} catch (_) {
  // RED phase: keep the missing production module as an assertion failure, not a loader error.
}

function requireRuntime() {
  assert.ok(runtimeModule, 'production V2 flavor runtime must exist');
  assert.ok(runtimeModule.v2FlavorRuntime, 'production V2 flavor system export must exist');
  return runtimeModule;
}

function makeHarness({ seed = 0x47020001, sectorId = 'sector_ceres_belt' } = {}) {
  const { v2FlavorRuntime } = requireRuntime();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  state.world.currentSectorId = sectorId;
  state.world.activeSector = { id: sectorId, pois: [] };
  state.bandRadio = { channelId: 'concord_bulletin' };
  state.livingPoiBehaviors = { activeByZone: {} };
  const bus = createBus();
  const messages = [];
  const toasts = [];
  const presented = [];
  const proximity = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('v2:flavorPresented', (payload) => presented.push(payload));
  bus.on('band:sourceProximity', (payload) => proximity.push(payload));
  const system = Object.create(v2FlavorRuntime);
  system.init({
    state,
    bus,
    helpers: { voice: { say: (payload) => { messages.push(payload); return true; } } },
    registry: { get: () => null },
  });
  system.newGame();
  return { state, bus, system, messages, toasts, presented, proximity };
}

function installConvoyCarrier(h, {
  encounterId = 'enc_convoy_runtime',
  zoneId = 'zone_ceres_refinery',
  kind = 'convoy_departure',
  fingerprint = 'fp-convoy-runtime',
} = {}) {
  h.state.livingPoiBehaviors.activeByZone[zoneId] = {
    behaviorId: `poib:${h.state.world.currentSectorId}:convoy_industrial_route:${zoneId}`,
    familyId: 'convoy_industrial_route',
    sectorId: h.state.world.currentSectorId,
    zoneId,
    status: 'entered',
  };
  const entity = spawnEntity(h.state, {
    id: 400 + h.state.entityList.length,
    data: { ai: { encounterId, sectorId: h.state.world.currentSectorId, zoneId } },
  });
  h.bus.emit('encounter:spawned', {
    encounterId,
    kind,
    sectorId: h.state.world.currentSectorId,
    zoneId,
    fingerprint,
  });
  return { encounterId, zoneId, entity };
}

function spawnEntity(state, spec) {
  const id = spec.id;
  const entity = {
    alive: true,
    type: spec.type || 'ship',
    pos: spec.pos || { x: 0, z: 0 },
    data: spec.data || {},
    ...spec,
  };
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

test('V2 flavor runtime is registered on the canonical production registry', () => {
  requireRuntime();
  const state = createGameState(47);
  const bus = createBus();
  const registry = createRegistry({ state, bus, helpers: {}, registry: null });
  assert.equal(registry.get('v2Flavor'), runtimeModule.v2FlavorRuntime);
});

test('a live convoy carrier deterministically binds roaming corpus and routes native surfaces through one voice', () => {
  const a = makeHarness();
  const b = makeHarness();
  const carrier = installConvoyCarrier(a);
  installConvoyCarrier(b);

  assert.equal(a.messages.length, 1, 'tuned Band should receive the moving story on encounter spawn');
  assert.deepEqual(a.messages, b.messages, 'same seed and encounter fingerprint must select byte-identical copy');
  assert.equal(a.messages[0].channel, 'band');
  const roamingBandCopy = FLAVOR_PACKS.roaming_events.entries.flatMap((entry) => (
    entry.lines.filter((line) => line.surface === 'band').map((line) => line.text)
  ));
  assert.ok(roamingBandCopy.includes(a.messages[0].text), 'runtime must consume the generated corpus directly');
  assert.deepEqual(a.toasts, [], 'V2 flavor may not bypass the one-voice arbiter');

  const record = a.state.v2Flavor.roamingByEncounter[carrier.encounterId];
  assert.ok(record);
  assert.ok(FLAVOR_PACKS.roaming_events.entries.some((entry) => entry.eventId === record.eventId));

  const target = spawnEntity(a.state, {
    id: 404,
    data: { ai: { encounterId: carrier.encounterId, zoneId: carrier.zoneId } },
  });
  a.bus.emit('contactHail:offer', { targetId: target.id });
  assert.equal(a.messages.at(-1).channel, 'comms');
  const bound = FLAVOR_PACKS.roaming_events.entries.find((entry) => entry.eventId === record.eventId);
  assert.ok(bound.lines.filter((line) => line.surface === 'hail').some((line) => line.text === a.messages.at(-1).text));

  a.bus.emit('encounter:spawned', {
    encounterId: carrier.encounterId,
    kind: 'convoy_departure',
    sectorId: a.state.world.currentSectorId,
    zoneId: carrier.zoneId,
    fingerprint: 'fp-convoy-runtime',
  });
  assert.equal(a.messages.length, 2, 'duplicate carrier receipts may not replay already-presented surfaces');
});

test('roaming corpus fails closed without the physical convoy behavior gate', () => {
  const h = makeHarness();
  h.bus.emit('encounter:spawned', {
    encounterId: 'enc_unowned_convoy',
    kind: 'convoy_departure',
    sectorId: h.state.world.currentSectorId,
    zoneId: 'zone_missing',
    fingerprint: 'fp-missing',
  });
  h.bus.emit('encounter:spawned', {
    encounterId: 'enc_wrong_shape',
    kind: 'ambush_snare',
    sectorId: h.state.world.currentSectorId,
    zoneId: 'zone_missing',
    fingerprint: 'fp-wrong',
  });
  assert.deepEqual(h.messages, []);
  assert.deepEqual(h.state.v2Flavor.roamingByEncounter, {});

  h.state.livingPoiBehaviors.activeByZone.zone_empty_convoy = {
    behaviorId: 'poib:empty',
    familyId: 'convoy_industrial_route',
    sectorId: h.state.world.currentSectorId,
    zoneId: 'zone_empty_convoy',
    status: 'entered',
  };
  h.bus.emit('encounter:spawned', {
    encounterId: 'enc_payload_without_entity',
    kind: 'convoy_departure',
    sectorId: h.state.world.currentSectorId,
    zoneId: 'zone_empty_convoy',
    fingerprint: 'fp-empty',
  });
  assert.deepEqual(h.state.v2Flavor.roamingByEncounter, {},
    'behavior metadata without an alive stamped encounter entity is not a physical carrier');
});

test('existing physical POI identification carries landmark lore but spoofed targets fail closed', () => {
  const h = makeHarness({ sectorId: 'sector_hyperion_cut' });
  h.bus.emit('poi:identified', { poiId: 'poi_hyperion_driller', type: 'derelict' });
  assert.equal(h.messages.length, 0, 'payload-only landmark claims must not fabricate a physical target');

  const poiEntity = spawnEntity(h.state, {
    id: 606,
    type: 'fx',
    data: { poi: true, poiId: 'poi_hyperion_driller', sectorId: 'sector_hyperion_cut' },
  });
  h.state.world.activeSector.pois.push({
    id: poiEntity.id,
    poiId: 'poi_hyperion_driller',
    type: 'derelict',
    pos: { ...poiEntity.pos },
  });
  h.bus.emit('poi:identified', { poiId: 'poi_hyperion_driller', type: 'derelict' });
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].channel, 'info');
  const c6 = FLAVOR_PACKS.landmark_lore.entries.find((entry) => entry.programSlot === 'C6');
  assert.ok(c6.lines.some((line) => line.text === h.messages[0].text));
  assert.equal(h.presented[0].packId, 'landmark_lore');
  assert.equal(h.presented[0].sourceRef, c6.targetRef);
});

test('Hush and Quiessence scanner copy requires explicit physical identity and never invents Band proximity', () => {
  const hush = makeHarness({ sectorId: 'sector_eunomia_gulf' });
  hush.bus.emit('signal:scanResults', {
    sectorId: 'sector_eunomia_gulf',
    signals: [{ sourceId: 'planet_hush', entityId: null, stage: 1, scanCount: 1 }],
  });
  assert.deepEqual(hush.messages, [], 'source-id text alone is not a physical Hush carrier');
  assert.deepEqual(hush.proximity, [], 'runtime must not fabricate Hush proximity from sector identity');

  const hushEntity = spawnEntity(hush.state, {
    id: 701,
    type: 'anomaly',
    data: { flavorSourceId: 'planet_hush', sectorId: 'sector_eunomia_gulf' },
  });
  hush.bus.emit('signal:scanResults', {
    sectorId: 'sector_eunomia_gulf',
    signals: [{ sourceId: hushEntity.id, entityId: hushEntity.id, stage: 1, scanCount: 1 }],
  });
  assert.equal(hush.messages.length, 1);
  assert.ok(FLAVOR_PACKS.hush.entries.filter((entry) => entry.phase === 'passive')
    .some((entry) => entry.text === hush.messages[0].text));
  assert.deepEqual(hush.proximity, [], 'physical scanner identity still does not invent a distance sample');

  const quiet = makeHarness({ sectorId: 'sector_pallas_drift' });
  const ship = spawnEntity(quiet.state, {
    id: 817,
    data: {
      flavorTargetRef: 'landmark_c14_quiessence',
      quiessenceShipIndex: 7,
      sectorId: 'sector_pallas_drift',
    },
  });
  quiet.bus.emit('signal:scanResults', {
    sectorId: 'sector_pallas_drift',
    signals: [{ sourceId: ship.id, entityId: ship.id, stage: 2, scanCount: 1 }],
  });
  assert.equal(quiet.messages.length, 1);
  assert.equal(quiet.messages[0].text, FLAVOR_PACKS.quiessence.entries[6].text,
    'physical formation index must select its authored incompatible census exactly');
  assert.deepEqual(quiet.proximity, []);
});

test('V2 flavor receipts survive a plain JSON save boundary without replaying heard copy', () => {
  const h = makeHarness();
  const carrier = installConvoyCarrier(h);
  const saved = JSON.parse(JSON.stringify(h.system.serialize()));
  const restored = makeHarness();
  restored.system.deserialize(saved);
  assert.deepEqual(restored.system.serialize(), saved);

  restored.state.livingPoiBehaviors.activeByZone[carrier.zoneId] = {
    behaviorId: `poib:${restored.state.world.currentSectorId}:convoy_industrial_route:${carrier.zoneId}`,
    familyId: 'convoy_industrial_route',
    sectorId: restored.state.world.currentSectorId,
    zoneId: carrier.zoneId,
    status: 'entered',
  };
  spawnEntity(restored.state, {
    id: 499,
    data: { ai: {
      encounterId: carrier.encounterId,
      sectorId: restored.state.world.currentSectorId,
      zoneId: carrier.zoneId,
    } },
  });
  restored.bus.emit('encounter:spawned', {
    encounterId: carrier.encounterId,
    kind: 'convoy_departure',
    sectorId: restored.state.world.currentSectorId,
    zoneId: carrier.zoneId,
    fingerprint: 'fp-convoy-runtime',
  });
  assert.deepEqual(restored.messages, [], 'restored surface receipt must suppress duplicate copy');
});

test('roaming news rejects aborted outcomes but accepts a completed outcome', () => {
  const h = makeHarness();
  const carrier = installConvoyCarrier(h);
  h.bus.emit('encounter:resolved', {
    encounterId: carrier.encounterId,
    shape: 'convoy_departure',
    outcome: 'aborted:script_error',
    sectorId: h.state.world.currentSectorId,
    zoneId: carrier.zoneId,
  });
  assert.equal(h.messages.length, 1, 'a director abort means the encounter never happened');
  h.bus.emit('encounter:resolved', {
    encounterId: carrier.encounterId,
    shape: 'convoy_departure',
    outcome: 'arrived',
    sectorId: h.state.world.currentSectorId,
    zoneId: carrier.zoneId,
  });
  assert.equal(h.messages.at(-1).channel, 'news');
});

test('canonical save capture includes the same V2 flavor semantic payload', () => {
  const h = makeHarness();
  installConvoyCarrier(h);
  const expected = h.system.serialize();
  const saveRuntime = Object.create(save);
  saveRuntime.init({
    state: h.state,
    bus: h.bus,
    helpers: {},
    registry: { get: (name) => name === 'v2Flavor' ? h.system : null },
  });
  assert.deepEqual(saveRuntime.serializeData().v2Flavor, expected);
  assert.equal(saveRuntime._saveCapturePlan().some(([key]) => key === 'v2Flavor'), true);
});

test('Contracts dossier exposes authored set-piece instructions without inventing fallback copy', () => {
  const instruction = FLAVOR_PACKS.set_piece_missions.entries.find((entry) => (
    entry.sourceRef === 'mission.sp1.long_read.rumor_survey.instruction'
  ));
  assert.ok(instruction && instruction.text);
  assert.equal(missionDossierSummary({ summary: instruction.text }), instruction.text,
    'the compiled offer summary must reach the live dossier unchanged');
  assert.equal(missionDossierSummary({ description: 'generic fallback' }), '',
    'offers without an authored summary retain the existing mechanical dossier');
  assert.equal(missionDossierSummary({ summary: '  filed copy  ' }), 'filed copy',
    'presentation trims transport whitespace only');
});
