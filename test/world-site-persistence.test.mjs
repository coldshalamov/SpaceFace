import test from 'node:test';
import assert from 'node:assert/strict';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { save } from '../src/save/saveSystem.js';
import {
  initializePresentationAdmission,
  PRESENTATION_ADMISSION,
  setPresentationAdmission,
} from '../src/core/presentationAdmission.js';

const SITE_ID = 'world_site_helios_relay';

function makeBus() {
  const handlers = new Map();
  return {
    handlers,
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload || {});
    },
  };
}

function makeHarness({ browser = false } = {}) {
  const bus = makeBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 47 },
    entities,
    entityList,
    freeIds: [],
    playerId: 1,
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 } },
    world: { currentSectorId: 'sector_helios_prime' },
    content: { commodities: [] },
  };
  if (browser) state.render = { scene: {} };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec };
      entity.data = spec.data || {};
      initializePresentationAdmission(entity);
      entities.set(entity.id, entity);
      entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const registry = { get() { return null; } };
  const system = Object.create(asteroidSites);
  const ctx = { state, bus, helpers, registry };
  system.init(ctx);
  return { system, state, bus, helpers, ctx };
}

function aliveWorldEntities(state) {
  return [...state.entities.values()].filter((entity) => entity.alive !== false && entity.data && entity.data.worldSiteId === SITE_ID);
}

function byWorldRecord(state, worldRecordId) {
  return [...state.entities.values()].filter((entity) => entity.alive !== false
    && entity.data && entity.data.worldRecordId === worldRecordId);
}

test('natural producer is duplicate-safe and leave/return rematerializes stable identities once', () => {
  const h = makeHarness();
  assert.deepEqual(h.state.sites.worldOrder, [SITE_ID]);
  assert.equal(h.state.sites.worldById[SITE_ID].stageId, 'damaged');

  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const firstIds = aliveWorldEntities(h.state).map((entity) => entity.data.worldRecordId).sort();
  assert.equal(firstIds.length, 7, 'one root plus six component proxies');
  assert.equal(new Set(firstIds).size, firstIds.length);
  assert.equal(byWorldRecord(h.state, `${SITE_ID}/root`).length, 1);
  const relayCore = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  const receiver = byWorldRecord(h.state, `${SITE_ID}/component/receiver_collar`)[0];
  assert.equal(relayCore.data.worldSiteProxy.shape, 'circle');
  assert.equal(relayCore.data.worldSiteProxy.bodyType, 'solid');
  assert.equal(relayCore.collides, true);
  assert.equal(relayCore.physicsBody.dynamic, false);
  assert.equal(receiver.data.worldSiteProxy.bodyType, 'sensor');
  assert.equal(receiver.collides, false);
  assert.equal(receiver.physicsBody, false);
  assert.equal(relayCore.data.worldSiteTargetable, true);

  const listenersBefore = new Map([...h.bus.handlers].map(([name, list]) => [name, list.length]));
  h.system.init(h.ctx);
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  assert.equal(aliveWorldEntities(h.state).length, 7, 'duplicate init/enter cannot duplicate entities');
  for (const [name, count] of listenersBefore) assert.equal(h.bus.handlers.get(name).length, count, `${name} listener count`);

  h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  assert.equal(aliveWorldEntities(h.state).length, 0);
  h.state.world.currentSectorId = 'sector_ceres_belt';
  h.state.world.currentSectorId = 'sector_helios_prime';
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const returnedIds = aliveWorldEntities(h.state).map((entity) => entity.data.worldRecordId).sort();
  assert.deepEqual(returnedIds, firstIds, 'transient entity ids change but durable world identities do not');
});

test('detaching a status-conditioned solid rematerializes one stable noncolliding proxy', () => {
  const h = makeHarness();
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const worldRecordId = `${SITE_ID}/component/cargo_brace`;
  const before = byWorldRecord(h.state, worldRecordId)[0];
  assert.equal(before.data.worldSiteComponentStatus, 'attached');
  assert.equal(before.collides, true);
  assert.equal(before.physicsBody.dynamic, false);
  h.state.player.targetId = before.id;

  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'relay_core',
    verb: 'repair',
    amount: 40,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 1,
    tick: 1,
  });
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'safety_coupler',
    verb: 'repair',
    amount: 24,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 2,
    tick: 2,
  });
  const detached = h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'cargo_brace',
    verb: 'cut',
    amount: 32,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 3,
    tick: 3,
  });
  assert.equal(detached.ok, true);
  assert.equal(h.state.sites.worldById[SITE_ID].components.cargo_brace.status, 'detached');
  const after = byWorldRecord(h.state, worldRecordId);
  assert.equal(after.length, 1,
    'status transition keeps exactly one live entity under the durable component identity');
  assert.equal(before.alive, false,
    'the immutable static physics body is retired instead of mutated in place');
  assert.notEqual(after[0].id, before.id);
  assert.equal(after[0].data.worldRecordId, worldRecordId);
  assert.equal(after[0].data.worldSiteComponentStatus, 'detached');
  assert.equal(after[0].data.worldSiteProxy.bodyType, 'sensor');
  assert.equal(after[0].data.worldSiteProxy.authoredBodyType, 'solid');
  assert.equal(after[0].collides, false);
  assert.equal(after[0].physicsBody, false);
  assert.equal(h.state.player.targetId, after[0].id,
    'stable player targeting follows the status-driven proxy replacement');

  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'payload_cradle',
    verb: 'cut',
    amount: 18,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 4,
    tick: 4,
  });
  assert.equal(h.state.sites.worldById[SITE_ID].stageId, 'opened');
  let stagedBrace = byWorldRecord(h.state, worldRecordId)[0];
  assert.equal(stagedBrace.collides, false,
    'an opened-stage socket transform cannot re-solidify the detached brace');

  const payload = byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`)[0];
  const receiver = byWorldRecord(h.state, `${SITE_ID}/component/receiver_collar`)[0];
  payload.pos = { ...receiver.pos };
  payload.vel = { x: 0, z: 0 };
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'receiver_collar',
    verb: 'transfer',
    amount: 1,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 5,
    tick: 5,
  });
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'beacon_array',
    verb: 'repair',
    amount: 20,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 6,
    tick: 6,
  });
  assert.equal(h.state.sites.worldById[SITE_ID].stageId, 'recovered');
  stagedBrace = byWorldRecord(h.state, worldRecordId)[0];
  assert.equal(stagedBrace.collides, false,
    'the recovered-stage transform must preserve status-conditioned sensor authority');
  assert.equal(stagedBrace.physicsBody, false);
  const stableRuntimeId = stagedBrace.id;
  h.system.update(1 / 60, h.state);
  assert.equal(byWorldRecord(h.state, worldRecordId).length, 1);
  assert.equal(byWorldRecord(h.state, worldRecordId)[0].id, stableRuntimeId,
    'an idempotent sync may not churn the already-correct sensor proxy');

  const saved = structuredClone(h.system.serialize());
  h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  h.system.deserialize(saved);
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const restored = byWorldRecord(h.state, worldRecordId);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].data.worldRecordId, worldRecordId);
  assert.equal(restored[0].data.worldSiteComponentStatus, 'detached');
  assert.equal(restored[0].collides, false);
  assert.equal(restored[0].physicsBody, false,
    'save/load plus sector re-entry must derive sensor authority from durable detached status');
});

test('sector exit clears recyclable World Site handles while retaining durable nav identity', () => {
  const h = makeHarness();
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const relay = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  h.state.player.targetId = relay.id;
  h.state.nav = {
    waypoint: { targetEntityId: relay.id, pos: { ...relay.pos } },
    autopilot: {
      active: true,
      status: 'armed',
      targetEntityId: relay.id,
      target: { ...relay.pos },
    },
  };

  h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  assert.equal(h.state.player.targetId, null);
  assert.equal(h.state.nav.waypoint.targetEntityId, null);
  assert.equal(h.state.nav.waypoint.targetWorldRecordId, relay.data.worldRecordId);
  assert.equal(h.state.nav.autopilot.targetEntityId, null);
  assert.equal(h.state.nav.autopilot.targetWorldRecordId, relay.data.worldRecordId);
  assert.equal(h.state.nav.autopilot.active, false);
  assert.equal(h.state.nav.autopilot.status, 'lost-target');
});

test('save nav uses durable World Site identity and ignores an aliased legacy runtime id', () => {
  const h = makeHarness();
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const relay = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  h.state.nav = {
    route: null,
    autoTravel: false,
    waypoint: { targetEntityId: relay.id, pos: { ...relay.pos }, label: 'Relay Core' },
    autopilot: {
      active: true,
      status: 'armed',
      targetEntityId: relay.id,
      target: { ...relay.pos },
      label: 'Relay Core',
      arrivalRadius: 36,
    },
  };
  const saveInstance = Object.create(save);
  saveInstance.state = h.state;
  saveInstance.bus = h.bus;
  const serialized = saveInstance._serializeNav();
  assert.equal(serialized.waypoint.targetEntityId, undefined);
  assert.equal(serialized.waypoint.targetWorldRecordId, relay.data.worldRecordId);
  assert.equal(serialized.autopilot.targetEntityId, null);
  assert.equal(serialized.autopilot.targetWorldRecordId, relay.data.worldRecordId);

  h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  const foreign = {
    id: relay.id,
    type: 'ship',
    alive: true,
    pos: { x: 1, z: 1 },
    vel: { x: 0, z: 0 },
    data: { role: 'foreign-runtime-id-alias' },
  };
  h.state.entities.set(foreign.id, foreign);
  h.state.entityList.push(foreign);
  saveInstance._restoreNav(serialized);
  assert.equal(h.state.nav.autopilot.targetEntityId, null,
    'restored numeric runtime handles remain cleared before stable-owner rematerialization');
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const replacement = byWorldRecord(h.state, relay.data.worldRecordId)[0];
  assert.ok(replacement);
  assert.notEqual(replacement.id, foreign.id);
  assert.equal(h.state.nav.waypoint.targetEntityId, replacement.id);
  assert.equal(h.state.nav.autopilot.targetEntityId, replacement.id);
  assert.equal(h.state.nav.autopilot.active, true);
  assert.equal(h.state.entities.get(foreign.id), foreign,
    'stable World Site identity wins over a live entity occupying the retired numeric id');
});

test('payload/remediation state round-trips exactly and malformed old world collections normalize', () => {
  const h = makeHarness();
  const requests = [
    ['relay_core', 'repair', 40, 'beam:core'],
    ['safety_coupler', 'repair', 24, 'beam:coupler'],
    ['cargo_brace', 'cut', 32, 'beam:brace'],
  ];
  for (let i = 0; i < requests.length; i += 1) {
    const [componentId, verb, amount, receiptId] = requests[i];
    h.state.tick = i + 1;
    const result = h.system.applyWorldSiteBeamOperation({
      siteId: SITE_ID, componentId, verb, amount, receiptId, tick: h.state.tick,
    });
    assert.equal(result.ok, true);
  }
  assert.equal(byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`).length, 1);

  const eventCount = h.bus.events.length;
  const liveCount = aliveWorldEntities(h.state).length;
  const recordBeforeReplay = JSON.stringify(h.state.sites.worldById[SITE_ID]);
  const replay = h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID, componentId: 'cargo_brace', verb: 'cut', amount: 32, receiptId: 'beam:brace', tick: 3,
  });
  assert.equal(replay.duplicate, true);
  assert.equal(JSON.stringify(h.state.sites.worldById[SITE_ID]), recordBeforeReplay);
  assert.equal(aliveWorldEntities(h.state).length, liveCount);
  assert.equal(h.bus.events.length, eventCount, 'replay emits no receipt or external-owner intent');

  const livePayload = byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`)[0];
  livePayload.pos.x = 812.25;
  livePayload.pos.z = -577.5;
  livePayload.vel.x = 3.75;
  livePayload.vel.z = -1.125;
  const expectedMotion = { pos: { x: 812.25, z: -577.5 }, vel: { x: 3.75, z: -1.125 } };
  const firstBlob = h.system.serialize();
  assert.deepEqual(firstBlob.worldById[SITE_ID].payloads.relay_field_coil.motion, expectedMotion);
  h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  assert.equal(byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`).length, 0);
  h.system.deserialize(JSON.parse(JSON.stringify(firstBlob)));
  const secondBlob = h.system.serialize();
  assert.deepEqual(secondBlob, firstBlob, 'serialize/deserialize is a fixed point');
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  assert.equal(byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`).length, 1, 'released payload rematerializes once');
  const restoredPayload = byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`)[0];
  assert.deepEqual({
    pos: { x: restoredPayload.pos.x, z: restoredPayload.pos.z },
    vel: { x: restoredPayload.vel.x, z: restoredPayload.vel.z },
  }, expectedMotion, 'live physics pose is read into durable site state and restored exactly');

  h.system.deserialize({
    schemaVersion: 1,
    nextSiteNum: 1,
    order: [],
    byId: {},
    meta: { rngSeed: 0 },
    worldOrder: [SITE_ID, SITE_ID, 'ghost_site'],
    worldById: {
      [SITE_ID]: { manifestId: SITE_ID, worldObjectId: SITE_ID, components: 'bad' },
      ghost_site: { manifestId: 'ghost_site', worldObjectId: 'ghost_site' },
    },
  });
  assert.deepEqual(h.state.sites.worldOrder, [SITE_ID]);
  assert.equal(h.state.sites.worldById.ghost_site, undefined);
  assert.equal(h.state.sites.worldById[SITE_ID].components.relay_core.status, 'damaged');
});

test('stage socket changes respawn static component bodies instead of teleporting them', () => {
  const h = makeHarness();
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const original = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  const originalPos = { ...original.pos };
  h.state.player.targetId = original.id;
  h.state.nav = {
    waypoint: { targetEntityId: original.id, pos: { x: -1, z: -1 } },
    autopilot: {
      active: true,
      status: 'armed',
      targetEntityId: original.id,
      target: { x: -1, z: -1 },
    },
  };

  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID, componentId: 'relay_core', verb: 'repair', amount: 40,
    requestStreamId: 'player-industrial-beam', requestSequence: 1, tick: 1,
  });
  assert.equal(byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0], original,
    'status-only synchronization keeps the same static body');
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID, componentId: 'safety_coupler', verb: 'repair', amount: 24,
    requestStreamId: 'player-industrial-beam', requestSequence: 2, tick: 2,
  });

  const replacement = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  assert.notEqual(replacement.id, original.id, 'stage transform creates a fresh static body');
  assert.equal(original.alive, false);
  assert.deepEqual(original.pos, originalPos, 'retired static body was never assigned a new transform');
  assert.equal(replacement.physicsBody.dynamic, false);
  assert.equal(h.state.player.targetId, replacement.id,
    'selected component follows its stable world identity across body replacement');
  assert.equal(h.state.nav.waypoint.targetEntityId, replacement.id);
  assert.deepEqual(h.state.nav.waypoint.pos, { x: replacement.pos.x, z: replacement.pos.z });
  assert.equal(h.state.nav.autopilot.targetEntityId, replacement.id,
    'autopilot cannot retain a recycled runtime id after rematerialization');
  assert.deepEqual(h.state.nav.autopilot.target, { x: replacement.pos.x, z: replacement.pos.z });
  assert.equal(h.state.nav.autopilot.active, true);
});

test('removed world identity clears selected navigation handles instead of allowing id aliasing', () => {
  const h = makeHarness();
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  for (const [componentId, verb, amount, requestSequence] of [
    ['relay_core', 'repair', 40, 1],
    ['cargo_brace', 'cut', 32, 2],
  ]) {
    h.system.applyWorldSiteBeamOperation({
      siteId: SITE_ID, componentId, verb, amount,
      requestStreamId: 'player-industrial-beam', requestSequence, tick: requestSequence,
    });
  }
  const payload = byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`)[0];
  const receiver = byWorldRecord(h.state, `${SITE_ID}/component/receiver_collar`)[0];
  assert.ok(payload && receiver);
  payload.pos.x = receiver.pos.x;
  payload.pos.z = receiver.pos.z;
  h.state.player.targetId = payload.id;
  h.state.nav = {
    waypoint: { targetEntityId: payload.id, pos: { ...payload.pos } },
    autopilot: {
      active: true,
      status: 'armed',
      targetEntityId: payload.id,
      target: { ...payload.pos },
    },
  };

  const result = h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'receiver_collar',
    verb: 'transfer',
    amount: 1,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 3,
    tick: 3,
  });
  assert.equal(result.ok, true);
  assert.equal(byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`).length, 0);
  assert.equal(h.state.player.targetId, null);
  assert.equal(h.state.nav.waypoint.targetEntityId, null);
  assert.equal(h.state.nav.autopilot.targetEntityId, null);
  assert.equal(h.state.nav.autopilot.active, false);
  assert.equal(h.state.nav.autopilot.status, 'lost-target');
});

test('real save restore ordering cannot leak a pre-load payload pose into the restored record', () => {
  const h = makeHarness();
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  for (const [componentId, verb, amount, requestSequence] of [
    ['relay_core', 'repair', 40, 1],
    ['safety_coupler', 'repair', 24, 2],
    ['cargo_brace', 'cut', 32, 3],
  ]) {
    h.system.applyWorldSiteBeamOperation({
      siteId: SITE_ID,
      componentId,
      verb,
      amount,
      requestStreamId: 'player-industrial-beam',
      requestSequence,
      tick: requestSequence,
    });
  }
  const livePayload = byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`)[0];
  livePayload.pos = { x: 811, z: -588 };
  livePayload.vel = { x: 2, z: -3 };
  const saved = h.system.serialize();
  const savedMotion = structuredClone(saved.worldById[SITE_ID].payloads.relay_field_coil.motion);

  livePayload.pos = { x: 9999, z: 9999 };
  livePayload.vel = { x: 99, z: 99 };
  h.bus.emit('save:restoring', { slot: 'quick' });
  for (const entity of h.state.entities.values()) entity.alive = false; // save._clearEntities()
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' }); // world.enterSector before deserialize
  assert.equal(aliveWorldEntities(h.state).length, 0, 'old record stays fenced during restore ordering window');

  h.system.deserialize(structuredClone(saved));
  h.bus.emit('save:loaded', { slot: 'quick' });
  assert.deepEqual(h.state.sites.worldById[SITE_ID].payloads.relay_field_coil.motion, savedMotion);
  const restored = byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`)[0];
  assert.deepEqual({ pos: restored.pos, vel: restored.vel }, savedMotion);
});

test('browser admission changes replace inert static proxies without touching durable site state', () => {
  const h = makeHarness({ browser: true });
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const rootId = `${SITE_ID}/root`;
  let root = byWorldRecord(h.state, rootId)[0];
  let proxy = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  const serializedPending = JSON.stringify(h.system.serialize().worldById[SITE_ID]);
  assert.equal(root.presentationAdmission, PRESENTATION_ADMISSION.pending);
  assert.equal(proxy.data.worldSitePresentationAdmitted, false);
  assert.equal(proxy.data.worldSiteTargetable, false);
  assert.equal(proxy.collides, false);
  assert.equal(proxy.physicsBody, false);

  setPresentationAdmission(root, PRESENTATION_ADMISSION.ready);
  h.system.update(1 / 60, h.state);
  const admitted = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  assert.notEqual(admitted.id, proxy.id, 'admission transition retires the inert static proxy');
  assert.equal(proxy.alive, false);
  assert.equal(admitted.data.worldSitePresentationAdmitted, true);
  assert.equal(admitted.data.worldSiteTargetable, true);
  assert.equal(admitted.collides, true);
  assert.equal(admitted.physicsBody.dynamic, false);
  assert.equal(JSON.stringify(h.system.serialize().worldById[SITE_ID]), serializedPending,
    'transient admission never changes record, revision, or receipts');

  setPresentationAdmission(root, PRESENTATION_ADMISSION.unavailable);
  h.system.update(1 / 60, h.state);
  const unavailable = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  assert.notEqual(unavailable.id, admitted.id);
  assert.equal(unavailable.data.worldSitePresentationAdmitted, false);
  assert.equal(unavailable.collides, false);
  assert.equal(unavailable.physicsBody, false);

  setPresentationAdmission(root, PRESENTATION_ADMISSION.ready);
  h.system.update(1 / 60, h.state);
  root = byWorldRecord(h.state, rootId)[0];
  const activeBeforeStage = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID, componentId: 'relay_core', verb: 'repair', amount: 40,
    requestStreamId: 'player-industrial-beam', requestSequence: 1, tick: 1,
  });
  h.system.applyWorldSiteBeamOperation({
    siteId: SITE_ID, componentId: 'safety_coupler', verb: 'repair', amount: 24,
    requestStreamId: 'player-industrial-beam', requestSequence: 2, tick: 2,
  });
  const replacementRoot = byWorldRecord(h.state, rootId)[0];
  const retracted = byWorldRecord(h.state, `${SITE_ID}/component/relay_core`)[0];
  assert.notEqual(replacementRoot.id, root.id, 'stage transition replaces the authored root');
  assert.equal(replacementRoot.presentationAdmission, PRESENTATION_ADMISSION.pending);
  assert.notEqual(retracted.id, activeBeforeStage.id);
  assert.equal(retracted.data.worldSitePresentationAdmitted, false,
    'old ready admission cannot leak through a root replacement sync');
  assert.equal(retracted.collides, false);
});

test('moving payload capture is cadence-bounded while forced save remains exact', () => {
  const h = makeHarness();
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  for (const [componentId, verb, amount, requestSequence] of [
    ['relay_core', 'repair', 40, 1],
    ['safety_coupler', 'repair', 24, 2],
    ['cargo_brace', 'cut', 32, 3],
  ]) {
    h.system.applyWorldSiteBeamOperation({
      siteId: SITE_ID, componentId, verb, amount,
      requestStreamId: 'player-industrial-beam', requestSequence, tick: requestSequence,
    });
  }
  const payload = byWorldRecord(h.state, `${SITE_ID}/payload/relay_field_coil`)[0];
  const startRevision = h.state.sites.worldById[SITE_ID].revision;
  for (let tick = 4; tick <= 2_004; tick += 1) {
    h.state.tick = tick;
    payload.pos.x += 0.01;
    payload.pos.z -= 0.005;
    payload.vel.x = 0.6;
    payload.vel.z = -0.3;
    h.system.update(1 / 60, h.state);
  }
  const beforeForce = h.state.sites.worldById[SITE_ID];
  assert.ok(beforeForce.revision - startRevision < 200,
    `capture revision must be cadence-bounded, got ${beforeForce.revision - startRevision}`);

  payload.pos.x += 0.00123;
  payload.pos.z -= 0.00456;
  payload.vel.x = 0.61234;
  payload.vel.z = -0.34567;
  const saved = h.system.serialize();
  assert.deepEqual(saved.worldById[SITE_ID].payloads.relay_field_coil.motion, {
    pos: { x: payload.pos.x, z: payload.pos.z },
    vel: { x: payload.vel.x, z: payload.vel.z },
  }, 'serialize forces the exact live physics snapshot below cadence/epsilon');
});
