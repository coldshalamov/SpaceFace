import test from 'node:test';
import assert from 'node:assert/strict';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { mining } from '../src/systems/mining.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const SITE_ID = 'world_site_helios_relay';

function makeBus() {
  const handlers = new Map();
  return {
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

function harness() {
  const bus = makeBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 47 },
    rng: () => 0.5,
    entities,
    entityList,
    freeIds: [],
    playerId: 1,
    mode: 'flight',
    input: { fireGroup: 2, aimAngle: 0 },
    ui: { beamMode: 'auto', componentSelection: null },
    player: {
      credits: 900,
      reputation: { faction_scn: 0 },
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 },
      miningBeam: { tierId: 'beam_industrial', dps: 40, range: 500 },
    },
    world: { currentSectorId: 'sector_helios_prime' },
    content: { commodities: [] },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_player',
    pos: { x: 740, z: -620 },
    vel: { x: 0, z: 0 },
    radius: 10,
    flags: { docked: false },
    data: { miningBeam: state.player.miningBeam },
  };
  entities.set(player.id, player);
  entityList.push(player);
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec };
      entity.data = spec.data || {};
      entities.set(entity.id, entity);
      entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  let siteSystem;
  const registry = { get(name) { return name === 'asteroidSites' ? siteSystem : null; } };
  siteSystem = Object.create(asteroidSites);
  siteSystem.init({ state, bus, helpers, registry });
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const miningSystem = Object.create(mining);
  miningSystem.init({ state, bus, helpers, registry });
  return { state, bus, player, siteSystem, miningSystem };
}

function component(h, componentId) {
  return [...h.state.entities.values()].find((entity) => entity.alive !== false
    && entity.data && entity.data.worldSiteId === SITE_ID
    && entity.data.worldSiteComponentId === componentId);
}

function payloadCount(h) {
  return [...h.state.entities.values()].filter((entity) => entity.alive !== false
    && entity.data && entity.data.worldRecordId === `${SITE_ID}/payload/relay_field_coil`).length;
}

function fireAt(h, componentId, tick, dps = 40) {
  const target = component(h, componentId);
  assert.ok(target, `live ${componentId} proxy`);
  h.state.tick = tick;
  h.state.simTime = tick / 60;
  h.state.ui.componentSelection = {
    componentId,
    stableKey: `wr:${SITE_ID}/component/${componentId}`,
  };
  h.miningSystem._beaming = true;
  h.miningSystem._lockTargetId = target.id;
  h.miningSystem._activeVerb = null;
  h.miningSystem._runPlayerBeam(h.player, { dps, range: 500, directToCargo: false }, 1, h.state);
  return target;
}

test('live mining dispatches authored repair and cut to asteroidSites without proxy-local shadow state', () => {
  const h = harness();
  const repairProxy = fireAt(h, 'relay_core', 11, 40);
  assert.equal(h.state.sites.worldById[SITE_ID].components.relay_core.status, 'operational');
  assert.equal(repairProxy.data.cutProgress, undefined);
  assert.equal(repairProxy.hull, 1e9, 'generic repair/damage fields stay untouched');

  const cutProxy = fireAt(h, 'cargo_brace', 12, 32);
  assert.equal(h.state.sites.worldById[SITE_ID].components.cargo_brace.status, 'detached');
  assert.equal(cutProxy.data.cutProgress, undefined, 'generic _applyCut never owns authored components');
  assert.equal(payloadCount(h), 1);

  const before = {
    record: JSON.stringify(h.state.sites.worldById[SITE_ID]),
    entities: [...h.state.entities.values()].filter((entity) => entity.alive !== false).length,
    events: h.bus.events.length,
    credits: h.state.player.credits,
    reputation: JSON.stringify(h.state.player.reputation),
  };
  fireAt(h, 'cargo_brace', 12, 32);
  assert.equal(JSON.stringify(h.state.sites.worldById[SITE_ID]), before.record);
  assert.equal([...h.state.entities.values()].filter((entity) => entity.alive !== false).length, before.entities);
  assert.equal(h.bus.events.length, before.events);
  assert.equal(h.state.player.credits, before.credits);
  assert.equal(JSON.stringify(h.state.player.reputation), before.reputation);
  assert.equal(payloadCount(h), 1);
});

test('released World Site payload is a non-colliding Massline target and cannot self-rollback the site', async () => {
  const h = harness();
  fireAt(h, 'relay_core', 3758, 40);
  fireAt(h, 'safety_coupler', 3759, 24);
  fireAt(h, 'cargo_brace', 3760, 32);

  const payload = [...h.state.entities.values()].find((entity) => entity.alive !== false
    && entity.data?.worldRecordId === `${SITE_ID}/payload/relay_field_coil`);
  assert.ok(payload, 'cargo completion materializes the authored physical payload');
  assert.equal(payload.collides, false, 'payload is a sensor body, not a component-colliding rigid body');
  assert.deepEqual(Object.keys(payload.pos).sort(), ['x', 'z']);
  assert.deepEqual(Object.keys(payload.vel).sort(), ['x', 'z']);
  assert.equal(payload.mass, 180);
  assert.equal(payload.data?.worldSiteTargetable, true,
    'released payload is reachable through the shipped scanner target cycle');
  assert.equal(payload.data?.worldSitePresentationAdmitted, true,
    'released payload publishes player-facing presentation admission');
  assert.equal(payload.physicsBody?.material, 'massline_sensor',
    'SG-02 keeps an attachable body but assigns it to no contact groups');
  assert.equal(isAttachable(payload, h.player.id), true,
    'non-colliding payload remains eligible for ordinary Massline acquisition');

  const coupler = component(h, 'safety_coupler');
  payload.pos.x = coupler.pos.x;
  payload.pos.z = coupler.pos.z;
  payload.vel.z = 2;
  const source = {
    ...h.player,
    collides: true,
    mass: 20,
    pos: { x: coupler.pos.x - 40, z: coupler.pos.z },
    vel: { x: 0, z: 0 },
  };
  const physics = await createSg02DynamicBodyOwner({
    fixedDt: 1 / 60,
    publishTelemetry: false,
    captureContactImpacts: true,
  });
  try {
    physics.syncFromEntities([source, coupler, payload]);
    assert.ok(physics.records.get(payload.id), 'sensor payload retains its SG-02 body');
    assert.ok(physics.createAttachment({
      attachmentId: 'world-site-payload-test',
      defId: 'tether_standard',
      ownerId: source.id,
      targetId: payload.id,
      sourceWorld: source.pos,
      targetWorld: payload.pos,
      restLength: 40,
    }), 'ordinary SG-02 Massline attachment accepts the sensor payload');
    const beforeStep = { ...payload.pos };
    physics.step(1 / 60);
    physics.step(1 / 60);
    assert.notDeepEqual(payload.pos, beforeStep, 'sensor payload retains dynamic SG-02 motion');
    assert.equal(physics.drainContactImpacts().some((impact) => (
      impact.aId === payload.id || impact.bId === payload.id
    )), false, 'overlap with an authored component produces no SG-02 contact receipt');
  } finally {
    physics.dispose();
  }

  h.state.tick = 3761;
  h.state.simTime = 3761 / 60;
  h.siteSystem.update(1 / 60, h.state);
  const record = h.state.sites.worldById[SITE_ID];
  assert.equal(record.components.safety_coupler.status, 'operational');
  assert.ok(record.completedOperations.recover_safety_coupler);
  assert.equal(record.stageId, 'powered');
  assert.equal(record.failures.length, 0);
  assert.equal(h.bus.events.some((event) => event.name === 'worldSite:failureReceipt'), false,
    'payload materialization/update cannot create a component-impact rollback');
});

test('receiver settlement through mining emits owner intents once and never claims a zero-move success', () => {
  const h = harness();
  fireAt(h, 'relay_core', 21, 40);
  fireAt(h, 'cargo_brace', 22, 32);
  const creditsBefore = h.state.player.credits;
  const reputationBefore = JSON.stringify(h.state.player.reputation);
  const eventsBefore = h.bus.events.length;

  fireAt(h, 'receiver_collar', 23, 1);
  assert.equal(h.state.sites.worldById[SITE_ID].payloads.relay_field_coil.status, 'released');
  assert.equal(h.bus.events.slice(eventsBefore).some((event) => event.name === 'economy:grantCredits'), false,
    'remote receiver beam cannot settle an undelivered physical payload');
  const payload = [...h.state.entities.values()].find((entity) => entity.alive !== false
    && entity.data && entity.data.worldRecordId === `${SITE_ID}/payload/relay_field_coil`);
  const receiver = component(h, 'receiver_collar');
  payload.pos.x = receiver.pos.x;
  payload.pos.z = receiver.pos.z;
  fireAt(h, 'receiver_collar', 24, 1);
  const record = h.state.sites.worldById[SITE_ID];
  assert.equal(record.payloads.relay_field_coil.status, 'settled');
  assert.equal(record.receivers.relay_receiver.settledReceiptId,
    `${SITE_ID}/operation/settle_field_coil/player-industrial-beam/24`);
  assert.equal(payloadCount(h), 0);
  assert.equal(h.state.player.credits, creditsBefore, 'site returns economy intent instead of writing credits');
  assert.equal(JSON.stringify(h.state.player.reputation), reputationBefore, 'site returns faction intent instead of writing reputation');
  assert.deepEqual(h.bus.events.slice(eventsBefore).filter((event) => [
    'economy:grantCredits', 'faction:repDelta',
  ].includes(event.name)).map((event) => event.name), [
    'economy:grantCredits', 'faction:repDelta',
  ]);
  const rep = h.bus.events.find((event) => event.name === 'faction:repDelta');
  assert.equal(rep.payload.delta, 1);

  const afterSettlementEvents = h.bus.events.length;
  fireAt(h, 'receiver_collar', 24, 1);
  assert.equal(h.bus.events.length, afterSettlementEvents, 'same-tick replay emits neither success nor owner intents');
});

test('held partial world-site beam emits one mining start edge', () => {
  const h = harness();
  const beam = { dps: 10, range: 500, directToCargo: false };
  h.state.tick = 31;
  h.miningSystem._runPlayerBeam(h.player, beam, 1, h.state);
  h.state.tick = 32;
  h.miningSystem._runPlayerBeam(h.player, beam, 1, h.state);

  assert.equal(h.state.sites.worldById[SITE_ID].components.relay_core.progress.repair_relay_core, 20);
  assert.equal(h.bus.events.filter((event) => event.name === 'mining:start').length, 1);
});

test('authored coupler impact fails once, survives reload, and restores without duplicate rewards', () => {
  const h = harness();
  const impact = (dp, tick) => {
    h.state.tick = tick;
    const coupler = component(h, 'safety_coupler');
    h.bus.emit('physics:impact', {
      consequenceKernelVersion: 1,
      tick,
      aId: h.player.id,
      bId: coupler.id,
      dp,
      impulse: dp,
      playerInvolved: true,
    });
  };

  impact(999, 1);
  assert.equal(h.state.sites.worldById[SITE_ID].components.safety_coupler.failureCount, 0,
    'the authored initially-failed coupler does not create a second failure');

  fireAt(h, 'relay_core', 2, 40);
  fireAt(h, 'safety_coupler', 3, 24);
  fireAt(h, 'cargo_brace', 4, 32);
  fireAt(h, 'payload_cradle', 5, 18);
  const payload = [...h.state.entities.values()].find((entity) => entity.alive !== false
    && entity.data && entity.data.worldRecordId === `${SITE_ID}/payload/relay_field_coil`);
  const receiver = component(h, 'receiver_collar');
  payload.pos.x = receiver.pos.x;
  payload.pos.z = receiver.pos.z;
  fireAt(h, 'receiver_collar', 6, 1);
  fireAt(h, 'beacon_array', 7, 20);

  let record = h.state.sites.worldById[SITE_ID];
  assert.equal(record.stageId, 'recovered');
  const rewardEvents = () => h.bus.events.filter((event) => [
    'economy:grantCredits', 'faction:repDelta',
  ].includes(event.name));
  assert.equal(rewardEvents().length, 2);

  const coupler = component(h, 'safety_coupler');
  const courier = {
    id: 70,
    type: 'ship',
    alive: true,
    pos: { ...coupler.pos },
    vel: { x: 0, z: 0 },
    data: { role: 'courier', worldSiteTrafficHookId: 'helios_recovery_service' },
  };
  h.state.entities.set(courier.id, courier);
  h.state.entityList.push(courier);
  h.bus.emit('physics:impact', {
    tick: 8, aId: courier.id, bId: coupler.id, dp: 720, playerInvolved: true,
  });
  assert.equal(h.state.sites.worldById[SITE_ID], record,
    'service traffic cannot trigger a player-authored failure even with a spoofed event flag');
  const relay = component(h, 'relay_core');
  h.bus.emit('physics:impact', { tick: 8, aId: relay.id, bId: coupler.id, dp: 999 });
  assert.equal(h.state.sites.worldById[SITE_ID], record,
    'site components cannot fail one another during materialization');

  h.bus.emit('physics:impact', {
    tick: 8, aId: coupler.id, bId: h.player.id, dp: 159, playerInvolved: true,
  });
  assert.equal(h.state.sites.worldById[SITE_ID], record, 'subthreshold impact is an exact no-op');
  impact(160, 9);
  record = h.state.sites.worldById[SITE_ID];
  assert.equal(record.components.safety_coupler.status, 'failed');
  assert.equal(record.components.safety_coupler.failureCount, 1);
  assert.equal(record.stageId, 'damaged', 'cumulative stage requirements roll the visible root back');
  assert.equal(h.bus.events.filter((event) => event.name === 'worldSite:failureReceipt').length, 1);

  impact(500, 10);
  assert.equal(h.state.sites.worldById[SITE_ID], record, 'contact while failed is an exact no-op');
  assert.equal(h.bus.events.filter((event) => event.name === 'worldSite:failureReceipt').length, 1);

  const saved = h.siteSystem.serialize();
  h.siteSystem.deserialize(JSON.parse(JSON.stringify(saved)));
  assert.equal(h.state.sites.worldById[SITE_ID].stageId, 'damaged');
  fireAt(h, 'safety_coupler', 11, 24);
  record = h.state.sites.worldById[SITE_ID];
  assert.equal(record.stageId, 'recovered');
  assert.equal(record.components.safety_coupler.status, 'operational');
  assert.equal(record.failures.length, 1);
  assert.equal(rewardEvents().length, 2, 'recovery does not replay settled credit or reputation intents');
});
