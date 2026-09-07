import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_OPERATIONS,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
  KILL_MACHINES,
  PALLAS_REEF_FIELD,
  PALLAS_REEF_SECTOR_ID,
  PALLAS_REEF_SITE_ID,
  cinderSluicePhase,
  killMachinePhase,
  pallasReefPhase,
  pointInsideCinderSluice,
  pointInsideKillMachine,
  pointInsidePallasReef,
} from '../src/data/environmentalMachinery.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { traffic } from '../src/systems/traffic.js';
import {
  applyWorldSiteOperation,
  createWorldSiteRecord,
  normalizeWorldSiteRecord,
  planWorldSiteMaterialization,
  validateWorldSiteManifest,
} from '../src/systems/worldSiteKernel.js';
import { fieldHud } from '../src/ui/fieldHud.js';

function apply(manifest, record, operationId, sequence, tick, extra = {}) {
  const result = applyWorldSiteOperation(manifest, record, {
    operationId,
    requestStreamId: 'player-industrial-beam',
    requestSequence: sequence,
    amount: 10_000,
    tick,
    earnedAtS: tick / 60,
    ...extra,
  });
  assert.equal(result.ok, true, `${operationId}: operation accepted`);
  assert.equal(result.receipt.complete, true, `${operationId}: operation completed`);
  return result.record;
}

function settledRecord(manifest) {
  let record = createWorldSiteRecord(manifest, { tick: 0 });
  record = apply(manifest, record, CINDER_SLUICE_OPERATIONS.regulate, 1, 1_200);
  record = apply(manifest, record, CINDER_SLUICE_OPERATIONS.release, 2, 1_201);
  const plan = planWorldSiteMaterialization(manifest, record);
  const payload = plan.payloads.find((entry) => entry.payloadId === 'sluice_ballast');
  const receiver = plan.components.find((entry) => entry.componentId === 'settling_socket');
  assert.ok(payload && receiver, 'released ballast and receiver materialize');
  assert.ok(payload.vel.x * CINDER_SLUICE_FIELD.dir.x + payload.vel.z * CINDER_SLUICE_FIELD.dir.z > 0,
    'cutting the clamp ejects the ballast into the authored current');
  const boundaryHold = applyWorldSiteOperation(manifest, record, {
    operationId: CINDER_SLUICE_OPERATIONS.settle,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 3,
    amount: 1,
    tick: 1_202,
    earnedAtS: 1_202 / 60,
    delivery: {
      payloadId: payload.payloadId,
      payloadWorldObjectId: payload.worldRecordId,
      receiverId: 'sluice_receiver',
      payloadPos: { ...payload.pos },
      receiverPos: { ...receiver.pos },
    },
  });
  assert.equal(boundaryHold.ok, false, 'freshly cut ballast is outside settlement range');
  assert.equal(boundaryHold.reason, 'payload-not-delivered');
  return apply(manifest, record, CINDER_SLUICE_OPERATIONS.settle, 3, 1_202, {
    delivery: {
      payloadId: payload.payloadId,
      payloadWorldObjectId: payload.worldRecordId,
      receiverId: 'sluice_receiver',
      payloadPos: { ...receiver.pos },
      receiverPos: { ...receiver.pos },
    },
  });
}

test('Cinder Sluice is a reachable World Site whose regulator changes the timed current', () => {
  const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  assert.ok(manifest, 'Cinder Sluice manifest is on the production World Site route');
  assert.deepEqual(validateWorldSiteManifest(manifest), { ok: true, errors: [] });

  let record = createWorldSiteRecord(manifest, { tick: 0 });
  assert.equal(cinderSluicePhase(record, 0).phase, 'warning');
  assert.equal(cinderSluicePhase(record, 2.1).phase, 'surge');
  assert.equal(cinderSluicePhase(record, 9.1).phase, 'calm');

  record = apply(manifest, record, CINDER_SLUICE_OPERATIONS.regulate, 1, 1_200);
  assert.deepEqual({
    phase: cinderSluicePhase(record, 20).phase,
    regulated: cinderSluicePhase(record, 20).regulated,
    strength: cinderSluicePhase(record, 20).fieldStrength,
  }, { phase: 'warning', regulated: true, strength: 0 });
  assert.equal(cinderSluicePhase(record, 23.1).phase, 'surge');
  assert.equal(cinderSluicePhase(record, 28.1).phase, 'calm');

  const quiet = settledRecord(manifest);
  assert.deepEqual(cinderSluicePhase(quiet, 10_000), {
    phase: 'quiet', regulated: true, fieldActive: false, fieldStrength: 0,
    anchorS: 20, cycleS: 0, elapsedS: 0, remainingS: Infinity,
  });
});

test('timing and permanent quiet state survive World Site normalization at the same sim clock', () => {
  const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  let record = createWorldSiteRecord(manifest, { tick: 0 });
  record = apply(manifest, record, CINDER_SLUICE_OPERATIONS.regulate, 1, 1_200);
  const restored = normalizeWorldSiteRecord(manifest, JSON.parse(JSON.stringify(record)));
  assert.deepEqual(cinderSluicePhase(restored, 27.25), cinderSluicePhase(record, 27.25));

  const quiet = settledRecord(manifest);
  const restoredQuiet = normalizeWorldSiteRecord(manifest, JSON.parse(JSON.stringify(quiet)));
  assert.equal(cinderSluicePhase(restoredQuiet, 2_000).phase, 'quiet');
});

test('the shared cone law moves player and ballast downstream while leaving points outside untouched', () => {
  const field = normalizeField({ ...CINDER_SLUICE_FIELD, strength: CINDER_SLUICE_FIELD.strength });
  const inside = {
    x: field.center.x + field.dir.x * 180,
    z: field.center.z + field.dir.z * 180,
  };
  const outside = {
    x: field.center.x - field.dir.x * 180,
    z: field.center.z - field.dir.z * 180,
  };
  assert.equal(pointInsideCinderSluice(inside), true);
  assert.equal(pointInsideCinderSluice(outside), false);

  for (const profile of [
    { id: 1, type: 'ship', mass: 28, team: 0, marked: false },
    { id: 2, type: 'wreck', mass: 240, team: 2, marked: false },
  ]) {
    const accel = sampleFieldAcceleration(inside, { x: 0, z: 0 }, [field], 4, profile, { ax: 0, az: 0 });
    assert.ok(accel.ax * field.dir.x + accel.az * field.dir.z > 0,
      `${profile.type} receives the same downstream field law`);
  }
  assert.deepEqual(
    sampleFieldAcceleration(outside, { x: 0, z: 0 }, [field], 4,
      { id: 3, type: 'ship', mass: 28, team: 0, marked: false }, { ax: 0, az: 0 }),
    { ax: 0, az: 0 },
  );
});

test('runtime registers warning before force, exits during calm, and publishes hazard boundaries once', () => {
  const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  const record = createWorldSiteRecord(manifest, { tick: 0 });
  const events = [];
  const fields = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec }; return this.byId[spec.id]; },
    updateExternal(id, patch) {
      assert.ok(this.byId[id], `updateExternal unknown field ${id}`);
      Object.assign(this.byId[id], patch);
      return this.byId[id];
    },
    unregisterExternal(id) {
      const had = !!this.byId[id];
      delete this.byId[id];
      return had;
    },
    hasExternal(id) { return !!this.byId[id]; },
    get live() { return this.byId[CINDER_SLUICE_FIELD.id] || null; },
  };
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: 1,
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true,
      pos: { x: CINDER_SLUICE_FIELD.center.x, z: CINDER_SLUICE_FIELD.center.z },
    }]]),
    sites: { worldOrder: [CINDER_SLUICE_SITE_ID], worldById: { [CINDER_SLUICE_SITE_ID]: record } },
  };
  const listeners = new Map();
  const bus = {
    on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); },
    emit(name, payload) { events.push({ name, payload }); },
  };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({ state, bus, registry: { get(name) { return name === 'fields' ? fields : null; } } });
    system.update(1 / 60, state);
    assert.equal(fields.live.strength, 0, 'warning geometry exists before force');
    assert.equal(fields.live.tag, undefined, 'fields owns the environmental presentation tag');
    assert.equal(events.filter((entry) => entry.name === 'hazard:enter').length, 1);

    state.simTime = 3;
    state.tick = 180;
    system.update(1 / 60, state);
    assert.equal(fields.live.strength, CINDER_SLUICE_FIELD.strength, 'surge uses authored force');
    assert.equal(events.filter((entry) => entry.name === 'hazard:enter').length, 1,
      'warning to surge does not duplicate hazard entry');

    state.simTime = 10;
    state.tick = 600;
    system.update(1 / 60, state);
    assert.equal(fields.live, null, 'calm window unregisters the current');
    assert.equal(events.filter((entry) => entry.name === 'hazard:exit').length, 1);
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});

test('environmental cone presentation never steals the player field HUD voice', () => {
  assert.deepEqual(fieldHud._resolve({
    active: [{ id: CINDER_SLUICE_FIELD.id, kind: 'cone', tag: 'environmental', expireAt: Infinity }],
    cooldowns: {},
  }, 5), { text: '', cls: '' });
});

test('the occupied Cinder Sluice corridor exposes its phase clock through the field HUD', () => {
  const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: CINDER_SLUICE_FIELD.center.x, z: CINDER_SLUICE_FIELD.center.z },
  };
  const state = {
    mode: 'flight', playerId: player.id,
    world: { currentSectorId: CINDER_SLUICE_SECTOR_ID },
    entities: new Map([[player.id, player]]),
    sites: { worldById: { [CINDER_SLUICE_SITE_ID]: createWorldSiteRecord(manifest, { tick: 0 }) } },
  };
  const hud = Object.create(fieldHud);
  hud._cinderPhaseOut = {};

  let read = hud._resolveEnvironmental(state, 0);
  assert.deepEqual(hud._resolve(null, 0, read), {
    text: 'CINDER SLUICE — WARNING 2s', cls: 'field-current-warning',
  });

  read = hud._resolveEnvironmental(state, 3);
  assert.deepEqual(hud._resolve({
    active: [{ id: 'player_cone', kind: 'cone', engaged: true }], cooldowns: {},
  }, 3, read), {
    text: 'CINDER SLUICE — SURGE 6s', cls: 'field-current-surge',
  }, 'the current clock keeps the one HUD voice while the player is inside');

  read = hud._resolveEnvironmental(state, 10);
  assert.deepEqual(hud._resolve(null, 10, read), {
    text: 'CINDER SLUICE — CALM 2s', cls: 'field-current-calm',
  });

  state.sites.worldById[CINDER_SLUICE_SITE_ID] = settledRecord(manifest);
  read = hud._resolveEnvironmental(state, 10_000);
  assert.deepEqual(hud._resolve(null, 10_000, read), {
    text: 'CINDER SLUICE — CURRENT QUIET', cls: 'field-current-calm',
  });

  player.pos.x = CINDER_SLUICE_FIELD.center.x - CINDER_SLUICE_FIELD.dir.x * 180;
  player.pos.z = CINDER_SLUICE_FIELD.center.z - CINDER_SLUICE_FIELD.dir.z * 180;
  assert.equal(hud._resolveEnvironmental(state, 10_000), null,
    'the clock does not occupy the HUD outside the authored corridor');
});

test('Cinder service traffic stages for unsafe inbound phases without physics immunity', () => {
  const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  const record = createWorldSiteRecord(manifest, { tick: 0 });
  const station = {
    id: 90, type: 'station', alive: true,
    pos: { x: CINDER_SLUICE_TRAFFIC_STAGING_POS.x + 800, z: CINDER_SLUICE_TRAFFIC_STAGING_POS.z },
    data: { stationId: 'station_beltout' },
  };
  const site = {
    id: 91, type: 'poi', alive: true,
    pos: { ...CINDER_SLUICE_FIELD.center },
    data: { worldRecordId: `${CINDER_SLUICE_SITE_ID}/root` },
  };
  const hauler = {
    id: 92, type: 'ship', alive: true,
    pos: { ...CINDER_SLUICE_TRAFFIC_STAGING_POS },
    vel: { x: 7, z: -3 }, rot: 0, data: {},
  };
  const state = {
    simTime: 3, playerId: 1,
    sites: { worldById: { [CINDER_SLUICE_SITE_ID]: record } },
    entities: new Map([[station.id, station], [site.id, site], [hauler.id, hauler]]),
  };
  const rec = {
    waitT: 0,
    worldSiteRoute: {
      hookId: 'ceres_cinder_sluice_service',
      siteId: CINDER_SLUICE_SITE_ID,
      stationId: 'station_beltout',
      siteWorldRecordId: `${CINDER_SLUICE_SITE_ID}/root`,
      endpoint: 'site',
      label: 'Belt Outpost ↔ Cinder Sluice',
      hazardPolicy: 'cinder-sluice-phase-gate',
      stagingPos: { ...CINDER_SLUICE_TRAFFIC_STAGING_POS },
    },
  };
  const system = Object.create(traffic);
  system.state = state;
  const posBefore = { ...hauler.pos };
  const velBefore = { ...hauler.vel };

  system._stepWorldSiteRoute(hauler, rec, [station], 1 / 60);
  assert.equal(hauler.data.intent.moveZ, 0, 'inbound service holds beyond the surge boundary');
  assert.deepEqual(rec.worldSiteRoute.hazardHold.phase, 'surge');
  assert.deepEqual(hauler.pos, posBefore, 'traffic policy never writes position');
  assert.deepEqual(hauler.vel, velBefore, 'traffic policy never writes velocity');

  state.simTime = 10;
  system._stepWorldSiteRoute(hauler, rec, [station], 1 / 60);
  assert.equal(hauler.data.intent.moveZ, 1, 'the same craft enters under ordinary thrust during calm');
  assert.equal(rec.worldSiteRoute.hazardHold, undefined);

  state.simTime = 3;
  hauler.pos.x = CINDER_SLUICE_FIELD.center.x + CINDER_SLUICE_FIELD.dir.x * 120;
  hauler.pos.z = CINDER_SLUICE_FIELD.center.z + CINDER_SLUICE_FIELD.dir.z * 120;
  system._stepWorldSiteRoute(hauler, rec, [station], 1 / 60);
  assert.equal(hauler.data.intent.moveZ, 1,
    'a craft already inside keeps flying instead of receiving a hidden rescue controller');

  rec.worldSiteRoute.endpoint = 'station';
  hauler.pos = { ...site.pos };
  system._stepWorldSiteRoute(hauler, rec, [station], 1 / 60);
  assert.equal(hauler.data.intent.moveZ, 1, 'outbound service may ride the same downstream surge');
});

test('three Ceres kill machines have a schedule and a shove volume', () => {
  assert.equal(KILL_MACHINES.length, 3);
  assert.deepEqual(KILL_MACHINES.map((row) => row.id), [
    'excavator_jaws', 'furnace_mouth', 'mass_driver_breech',
  ]);
  const excavator = KILL_MACHINES[0];
  assert.equal(killMachinePhase(excavator, 0).phase, 'warning');
  assert.equal(killMachinePhase(excavator, 0).fieldStrengthScale, 0);
  assert.equal(killMachinePhase(excavator, 2.1).phase, 'surge');
  assert.equal(killMachinePhase(excavator, 2.1).fieldStrengthScale, 1);
  assert.equal(killMachinePhase(excavator, 5.6).phase, 'calm');
  const pinched = {
    x: excavator.globalPos.x + excavator.perp.x * 16 + excavator.dir.x * 10,
    z: excavator.globalPos.z + excavator.perp.z * 16 + excavator.dir.z * 10,
  };
  assert.equal(pointInsideKillMachine(excavator, pinched), true);
  assert.equal(pointInsideKillMachine(excavator, {
    x: excavator.globalPos.x + excavator.perp.x * 80,
    z: excavator.globalPos.z + excavator.perp.z * 80,
  }), false);
});

test('kill machines register surge force and request anvils without a Cinder site record', () => {
  const events = [];
  const fields = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec }; return this.byId[spec.id]; },
    updateExternal(id, patch) { Object.assign(this.byId[id], patch); return this.byId[id]; },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const excavator = KILL_MACHINES[0];
  const state = {
    mode: 'flight', tick: 0, simTime: 2.2, playerId: 1,
    world: { currentSectorId: CINDER_SLUICE_SECTOR_ID },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true,
      pos: {
        x: excavator.globalPos.x + excavator.perp.x * 16 + excavator.dir.x * 10,
        z: excavator.globalPos.z + excavator.perp.z * 16 + excavator.dir.z * 10,
      },
    }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const bus = {
    on() { return () => {}; },
    emit(name, payload) { events.push({ name, payload }); },
  };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({ state, bus, registry: { get(name) { return name === 'fields' ? fields : null; } } });
    system.update(1 / 60, state);
    const sheet = fields.byId[excavator.fields[0].id];
    assert.ok(sheet, 'excavator sheet registers during surge');
    assert.ok(sheet.strength > 0, 'surge writes force, not a damage aura');
    assert.equal(sheet.kind, 'sheet');
    assert.ok(events.some((entry) => entry.name === 'environmentalMachinery:ensureAnvil'
      && entry.payload.machineId === 'excavator_jaws'));
    assert.ok(events.some((entry) => entry.name === 'hazard:enter'
      && entry.payload.zoneType === 'debris'
      && entry.payload.zoneId === 'excavator_jaws'));
    assert.equal(fields.byId[CINDER_SLUICE_FIELD.id], undefined, 'missing sluice site does not invent a current');
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});

test('Pallas reef warning/surge/calm registers in Pallas without a Cinder site', () => {
  assert.equal(pallasReefPhase(0).phase, 'warning');
  assert.equal(pallasReefPhase(0).fieldStrength, 0);
  assert.equal(pallasReefPhase(0).fieldActive, true);
  assert.equal(pallasReefPhase(2.1).phase, 'surge');
  assert.equal(pallasReefPhase(2.1).fieldStrength, PALLAS_REEF_FIELD.strength);
  assert.equal(pallasReefPhase(10.1).phase, 'calm');
  assert.equal(pallasReefPhase(10.1).fieldActive, false);
  assert.equal(pallasReefPhase(10.1).fieldStrength, 0);

  const inside = {
    x: PALLAS_REEF_FIELD.center.x + PALLAS_REEF_FIELD.dir.x * 120,
    z: PALLAS_REEF_FIELD.center.z + PALLAS_REEF_FIELD.dir.z * 120,
  };
  const outside = {
    x: PALLAS_REEF_FIELD.center.x - PALLAS_REEF_FIELD.dir.x * 120,
    z: PALLAS_REEF_FIELD.center.z - PALLAS_REEF_FIELD.dir.z * 120,
  };
  assert.equal(pointInsidePallasReef(inside), true);
  assert.equal(pointInsidePallasReef(outside), false);

  const events = [];
  const fields = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec }; return this.byId[spec.id]; },
    updateExternal(id, patch) { Object.assign(this.byId[id], patch); return this.byId[id]; },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: 1,
    world: { currentSectorId: PALLAS_REEF_SECTOR_ID },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true,
      pos: { x: PALLAS_REEF_FIELD.center.x, z: PALLAS_REEF_FIELD.center.z },
    }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const bus = {
    on() { return () => {}; },
    emit(name, payload) { events.push({ name, payload }); },
  };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({ state, bus, registry: { get(name) { return name === 'fields' ? fields : null; } } });
    system.update(1 / 60, state);
    const reef = fields.byId[PALLAS_REEF_FIELD.id];
    assert.ok(reef, 'warning registers the reef cone');
    assert.equal(reef.strength, 0, 'warning is geometry with no force');
    assert.equal(fields.byId[CINDER_SLUICE_FIELD.id], undefined, 'Pallas does not invent a Cinder current');
    assert.equal(events.filter((entry) => entry.name === 'environmentalMachinery:ensureReef').length, 1);

    state.simTime = 2.2;
    state.tick = 132;
    system.update(1 / 60, state);
    assert.equal(fields.byId[PALLAS_REEF_FIELD.id].strength, PALLAS_REEF_FIELD.strength, 'surge writes force');
    assert.equal(events.filter((entry) => entry.name === 'environmentalMachinery:ensureReef').length, 1,
      'ensureReef fires once');

    state.simTime = 10.2;
    state.tick = 612;
    system.update(1 / 60, state);
    assert.equal(fields.byId[PALLAS_REEF_FIELD.id], undefined, 'calm unregisters the reef current');
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});
