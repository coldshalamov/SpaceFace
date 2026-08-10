import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { CERES_ACTIVITY_POCKETS_BY_ID, CERES_ACTIVITY_SECTOR_ID } from '../src/data/sectorActivityPockets.js';
import { planFactionPresence } from '../src/data/factionPresence.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 0x47a;
const REFINERY_POCKET = CERES_ACTIVITY_POCKETS_BY_ID.ceres_refinery_pocket;
const TENDER_SLOT = REFINERY_POCKET.actorSlots.find((slot) => slot.id === 'ceres_refinery_tender');
const TENDER_RECORD_ID = stableRecordId(
  SEED,
  CERES_ACTIVITY_SECTOR_ID,
  RECORD_KIND.NPC,
  TENDER_SLOT.worldRecordSlotId,
);
const TENDER_JOB_ID = `job:${TENDER_RECORD_ID}`;
const TENDER_POS = Object.freeze(sectorLocalToGlobalForSector({
  x: REFINERY_POCKET.activityAnchor.localPos.x + TENDER_SLOT.spawnOffset.x,
  z: REFINERY_POCKET.activityAnchor.localPos.z + TENDER_SLOT.spawnOffset.z,
}, CERES_ACTIVITY_SECTOR_ID));
// The projected route must reproduce the authored mark exactly, `targetRef` included — that is what
// lets npcJobsRuntime recognize the tender's service client as a real object rather than a bare
// coordinate. `speed` is the same distance/durationS the runtime re-derives when it validates the
// relationship, so it is part of the canonical spec rather than a planning hint.
const TENDER_ROUTE = Object.freeze(TENDER_SLOT.route.marks.map((mark) => Object.freeze({
  id: mark.id,
  label: mark.id,
  targetRef: mark.targetRef,
  pos: Object.freeze(sectorLocalToGlobalForSector({
    x: REFINERY_POCKET.activityAnchor.localPos.x + mark.offset.x,
    z: REFINERY_POCKET.activityAnchor.localPos.z + mark.offset.z,
  }, CERES_ACTIVITY_SECTOR_ID)),
})));
const TENDER_ROUTE_SPEED = Math.hypot(
  TENDER_ROUTE[1].pos.x - TENDER_ROUTE[0].pos.x,
  TENDER_ROUTE[1].pos.z - TENDER_ROUTE[0].pos.z,
) / TENDER_SLOT.route.durationS;

function runtime(sectorId = CERES_ACTIVITY_SECTOR_ID, seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.world.records = { byId: {} };
  const bus = createBus();
  const spawned = [];
  let nextEntityId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      bus.emit('entity:spawned', { id: entity.id, entity });
      return entity;
    },
  };
  const registry = { get() { return null; } };
  // Production initializes factionPresence before npcJobsRuntime. Both retain the same helpers
  // object, so the producer seam is available by the time sector:enter is emitted.
  const presence = Object.create(factionPresence);
  presence.init({ state, bus, helpers, registry });
  const jobs = Object.create(npcJobsRuntime);
  jobs.init({ state, bus, helpers, registry });
  return { state, bus, helpers, spawned, presence, jobs };
}

function xz(pos) {
  return { x: pos.x, z: pos.z };
}

function addRematerializedTender(rt, pos = { x: TENDER_POS.x + 17, z: TENDER_POS.z - 9 }, {
  genericShell = false,
  hull = 37,
  shield = 11,
  // World rematerialization builds a bare shell and factionPresence stamps the authored identity onto
  // it during adoption. A caller that needs the hull to already BE the canonical tender — because it
  // is standing in for an already-adopted body from a previous session — opts in here.
  canonicalIdentity = false,
} = {}) {
  const spec = genericShell
    ? {
        type: 'ship', team: 2, factionId: 'faction_pitborn', pos,
        radius: 8, mass: 20,
        hull, hullMax: 211, shield, shieldMax: 73, armorHp: 19, armorMax: 91,
        cap: 1, capMax: 17, capRegen: 0,
        boost: { energy: 2, max: 5, drainRate: 1, regenRate: 1, dashImpulse: 1, dashCd: 1, dashCdT: 3 },
        data: { defId: 'ship_ironback', ai: { archetype: 'passive', passive: true } },
      }
    : makeShipEntitySpec('ship_ironback', {
        team: 2,
        factionId: 'faction_pitborn',
        pos,
      });
  const entity = makeEntity(spec);
  entity.id = 50;
  entity.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
  entity.data = entity.data || {};
  entity.data.worldRecordId = stableRecordId(
    rt.state.meta.seed,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.NPC,
    TENDER_SLOT.worldRecordSlotId,
  );
  entity.data.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
  entity.data.sectorId = CERES_ACTIVITY_SECTOR_ID;
  if (canonicalIdentity) {
    entity.data.identityKey = TENDER_SLOT.worldRecordSlotId;
    entity.data.activityActorSlotId = TENDER_SLOT.id;
    entity.data.durable = true;
    entity.data.factionPresence = { source: 'depth-program-k1', yardTender: true };
  }
  rt.state.entities.set(entity.id, entity);
  rt.state.entityList.push(entity);
  return entity;
}

test('Ceres reuses the Pitborn yard tender as the authored stable actor and exact two-mark job', () => {
  const rt = runtime();
  const untouchedRng = createGameState(SEED).rng();
  const trafficBefore = JSON.stringify(rt.state.traffic);
  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });

  const tender = rt.spawned.find((entity) => entity.data?.factionPresence?.yardTender === true);
  assert.ok(tender, 'the existing Ceres Pitborn yard-tender plan materializes');
  assert.equal(rt.spawned.filter((entity) => entity.data?.factionPresence?.yardTender === true).length, 1);
  assert.deepEqual(xz(tender.pos), TENDER_POS, 'fresh spawn uses the released pocket anchor plus actor offset');
  assert.equal(tender.data.worldRecordId, TENDER_RECORD_ID);
  assert.equal(tender.data.identityKey, TENDER_SLOT.worldRecordSlotId);
  assert.equal(tender.data.activityActorSlotId, TENDER_SLOT.id);
  assert.equal(tender.data.recordCreatedTick, rt.state.tick | 0);
  assert.equal(tender.homeSectorId, CERES_ACTIVITY_SECTOR_ID);
  assert.equal(tender.data.homeSectorId, CERES_ACTIVITY_SECTOR_ID);
  assert.equal(tender.data.trafficRole, undefined, 'factionPresence remains the actor owner');

  const entry = rt.state.npcJobs.byId[TENDER_JOB_ID];
  assert.ok(entry, 'the stable actor receives a durable npcJobsRuntime job');
  assert.equal(entry.kind, TENDER_SLOT.jobKind);
  assert.equal(entry.worldRecordId, TENDER_RECORD_ID);
  assert.equal(entry.entityId, tender.id);
  assert.equal(tender.data.jobId, TENDER_JOB_ID);
  assert.deepEqual(
    entry.job.route.map(({ id, label, targetRef, pos }) => ({ id, label, targetRef, pos })),
    TENDER_ROUTE,
    'the job consumes the released route marks in pocket-anchor world space, targetRef intact',
  );
  assert.equal(entry.job.speed, TENDER_ROUTE_SPEED,
    'the projected job carries the canonical route speed, not the generic tender default');
  assert.equal(rt.state.rng(), untouchedRng, 'the data-planned cast binding consumes no state RNG');
  assert.equal(JSON.stringify(rt.state.traffic), trafficBefore, 'faction presence does not claim traffic state');
});

test('Ceres adopts and canonically rehydrates one rematerialized shell without healing saved vitals', () => {
  const fresh = runtime();
  fresh.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  const canonical = fresh.spawned.find((entity) => entity.data?.activityActorSlotId === TENDER_SLOT.id);
  const rt = runtime();
  const savedPos = { x: TENDER_POS.x + 17, z: TENDER_POS.z - 9 };
  const tender = addRematerializedTender(rt, savedPos, { genericShell: true, hull: 37, shield: 11 });
  tender.data.weapons = canonical.data.weapons.map((weapon) => ({
    ...weapon,
    _cooldown: 2.5,
    _heat: 37,
  }));

  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  assert.equal(rt.spawned.length, 0, 'the exact durable record is adopted rather than duplicated');
  assert.deepEqual(xz(tender.pos), savedPos, 'rematerialized world-record pose remains authoritative');
  assert.equal(tender.data.factionPresence.yardTender, true, 'transient ownership marker is rehydrated');
  assert.equal(tender.data.activityActorSlotId, TENDER_SLOT.id);
  assert.equal(tender.data.trafficRole, undefined);
  assert.equal(tender.hull, 37, 'adoption preserves saved hull damage');
  assert.equal(tender.shield, 11, 'adoption preserves saved shield damage');
  assert.equal(tender.cap, 1, 'adoption preserves live capacitor charge');
  assert.equal(tender.boost.energy, 2, 'adoption preserves live boost charge');
  assert.equal(tender.boost.dashCdT, 3, 'adoption preserves live dash cooldown');
  assert.equal(tender.data.weapons[0]._cooldown, 2.5, 'adoption preserves matching weapon cooldown');
  assert.equal(tender.data.weapons[0]._heat, 37, 'adoption preserves matching weapon heat');
  for (const field of ['radius', 'mass', 'flightClass', 'thrust', 'turnRate', 'maxSpeed', 'drag']) {
    assert.deepEqual(tender[field], canonical[field], `adoption restores canonical ${field}`);
  }
  for (const field of ['defId', 'fittings', 'derived']) {
    assert.deepEqual(tender.data[field], canonical.data[field], `adoption restores canonical data.${field}`);
  }
  assert.deepEqual(
    tender.data.weapons.map(({ defId, slotIndex }) => ({ defId, slotIndex })),
    canonical.data.weapons.map(({ defId, slotIndex }) => ({ defId, slotIndex })),
    'adoption restores the canonical weapon-slot identity',
  );
  assert.deepEqual(tender.data.ai, canonical.data.ai, 'adoption restores the K1 tender AI contract');
  assert.equal(rt.state.factionPresence.receipts.length, 0, 'adoption emits no second spawn receipt');
  assert.equal(rt.state.npcJobs.byId[TENDER_JOB_ID].entityId, tender.id);
  const job = rt.state.npcJobs.byId[TENDER_JOB_ID];

  tender.cap = 0.5;
  tender.boost.energy = 1.25;
  tender.boost.dashCdT = 3.5;
  tender.data.weapons[0]._cooldown = 1.75;
  tender.data.weapons[0]._heat = 23;
  const liveAi = tender.data.ai;
  tender.data.ai.activity.targetId = 'runtime-target';
  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  assert.equal(rt.spawned.length, 0, 'repeated entry remains spawn-idempotent');
  assert.equal(rt.state.npcJobs.byId[TENDER_JOB_ID], job, 'repeated entry preserves the existing job record');
  assert.equal(Object.values(rt.state.factionPresence.active).filter((row) => row.entityId === tender.id).length, 1);
  assert.equal(tender.cap, 0.5, 'repeated entry does not refill capacitor charge');
  assert.equal(tender.boost.energy, 1.25, 'repeated entry does not refill boost charge');
  assert.equal(tender.boost.dashCdT, 3.5, 'repeated entry does not clear dash cooldown');
  assert.equal(tender.data.weapons[0]._cooldown, 1.75, 'repeated entry does not clear weapon cooldown');
  assert.equal(tender.data.weapons[0]._heat, 23, 'repeated entry does not clear weapon heat');
  assert.equal(tender.data.ai, liveAi, 'repeated entry preserves live AI state identity');
  assert.equal(tender.data.ai.activity.targetId, 'runtime-target');
});

test('active durable ownership without a live body suppresses an additive tender spawn', () => {
  const rt = runtime();
  rt.state.world.records.byId[TENDER_RECORD_ID] = {
    recordId: TENDER_RECORD_ID,
    kind: RECORD_KIND.NPC,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    pos: { ...TENDER_POS },
    alive: true,
    outcome: 'active',
  };

  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  assert.equal(rt.spawned.length, 0);
  assert.deepEqual(rt.state.npcJobs.byId, {});
  assert.deepEqual(rt.state.factionPresence.active, {});
});

test('exit/reentry advances one durable tender job once and repeated lifecycle signals are idempotent', () => {
  const rt = runtime();
  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  const tender = rt.spawned[0];
  const entry = rt.state.npcJobs.byId[TENDER_JOB_ID];
  rt.state.simTime = 4;
  rt.jobs.update(4, rt.state);
  const beforeExit = entry.job.simTime;

  rt.bus.emit('sector:exit', {
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    continuous: true,
    noTeleport: true,
  });
  assert.equal(entry.entityId, null);
  assert.equal(tender.alive, true, 'factionPresence leaves the durable hull alive for world capture');
  rt.state.simTime = 14;
  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  const once = entry.job.simTime;
  assert.equal(entry.entityId, tender.id);
  assert.ok(once > beforeExit, 'reentry applies bounded offscreen catch-up');
  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  assert.equal(entry.job.simTime, once, 'repeated sector:enter does not advance twice');
  assert.equal(rt.spawned.length, 1);
});

test('real hard transition captures and removes the old tender, then rematerializes exactly one body', () => {
  const sim = createSimulation({
    seed: SEED,
    systems: [factionPresence, world, npcJobsRuntime],
  });
  const worldSystem = sim.registry.get('world');
  worldSystem.enterSector(CERES_ACTIVITY_SECTOR_ID, { placePlayer: false });
  const original = sim.state.entityList.find((entity) => (
    entity?.alive && entity.data?.worldRecordId === TENDER_RECORD_ID
  ));
  assert.ok(original, 'the real Ceres entry contains the authored tender');
  const job = sim.state.npcJobs.byId[TENDER_JOB_ID];
  assert.equal(job.entityId, original.id);

  worldSystem.enterSector('sector_helios_prime', {
    fromSectorId: CERES_ACTIVITY_SECTOR_ID,
    placePlayer: false,
  });
  const captured = sim.state.world.records.byId[TENDER_RECORD_ID];
  assert.ok(captured && captured.alive, 'hard exit captures the live durable record first');
  assert.equal(original.alive, false, 'the old live body is scoped for removal');
  assert.equal(job.entityId, null, 'npcJobs virtualizes the captured tender job');
  sim.step(1 / 60);
  assert.equal(sim.state.entities.has(original.id), false, 'the core sweep removes the old body');

  worldSystem.enterSector(CERES_ACTIVITY_SECTOR_ID, {
    fromSectorId: 'sector_helios_prime',
    placePlayer: false,
  });
  const live = sim.state.entityList.filter((entity) => (
    entity?.alive && entity.data?.worldRecordId === TENDER_RECORD_ID
  ));
  assert.equal(live.length, 1, 'return rematerializes exactly one tender record');
  assert.notEqual(live[0], original);
  assert.equal(sim.state.npcJobs.byId[TENDER_JOB_ID].entityId, live[0].id);
  assert.equal(live[0].data.factionPresence.yardTender, true);
  assert.equal(
    sim.state.world.sectorContents[CERES_ACTIVITY_SECTOR_ID].enemies.includes(live[0].id),
    false,
    'faction adoption removes the generic world FULL-extra membership',
  );

  worldSystem.enterSector('sector_helios_prime', {
    fromSectorId: CERES_ACTIVITY_SECTOR_ID,
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  assert.equal(live[0].alive, true, 'post-rematerialization continuous handoff preserves the live tender');
  assert.equal(sim.state.entities.get(live[0].id), live[0]);
  assert.equal(sim.state.npcJobs.byId[TENDER_JOB_ID].entityId, null);

  worldSystem.enterSector(CERES_ACTIVITY_SECTOR_ID, {
    fromSectorId: 'sector_helios_prime',
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  const continuousReturn = sim.state.entityList.filter((entity) => (
    entity?.alive && entity.data?.worldRecordId === TENDER_RECORD_ID
  ));
  assert.deepEqual(continuousReturn, [live[0]], 'continuous return reuses the same one live body');
  assert.equal(sim.state.npcJobs.byId[TENDER_JOB_ID].entityId, live[0].id);
});

test('save:loaded restores or creates exactly one tender job after authoritative job deserialize', () => {
  const rt = runtime();
  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  const tender = rt.spawned[0];
  const savedJobs = rt.jobs.serialize();

  rt.presence.deserialize({});
  rt.jobs.deserialize(savedJobs);
  rt.state.simTime = 12;
  rt.bus.emit('save:loaded', {});
  const restored = rt.state.npcJobs.byId[TENDER_JOB_ID];
  assert.equal(restored.entityId, tender.id);
  assert.equal(tender.data.jobId, TENDER_JOB_ID);
  assert.equal(Object.keys(rt.state.npcJobs.byId).length, 1);
  const restoredTime = restored.job.simTime;
  rt.bus.emit('save:loaded', {});
  assert.equal(restored.job.simTime, restoredTime, 'repeated save:loaded does not catch up twice');
  assert.equal(Object.keys(rt.state.npcJobs.byId).length, 1);

  rt.presence.deserialize({});
  rt.jobs.deserialize({ byId: {} });
  rt.bus.emit('save:loaded', {});
  assert.equal(Object.keys(rt.state.npcJobs.byId).length, 1, 'empty incoming job bag is re-commissioned once');
  assert.equal(rt.state.npcJobs.byId[TENDER_JOB_ID].entityId, tender.id);
});

test('a destroyed authored tender tombstone suppresses respawn and releases a stale virtual job', () => {
  const rt = runtime();
  const staleHull = addRematerializedTender(rt, undefined, { canonicalIdentity: true });
  assert.equal(rt.helpers.npcJobs.assign(staleHull, {
    kind: TENDER_SLOT.jobKind,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    route: TENDER_ROUTE,
    speed: TENDER_ROUTE_SPEED,
  }), TENDER_JOB_ID, 'the stale job this test releases is genuinely created first');
  rt.jobs._onSectorExit({ sectorId: CERES_ACTIVITY_SECTOR_ID });
  rt.state.entities.delete(staleHull.id);
  rt.state.entityList.splice(rt.state.entityList.indexOf(staleHull), 1);
  rt.state.world.records.byId[TENDER_RECORD_ID] = {
    recordId: TENDER_RECORD_ID,
    kind: 'npc',
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    pos: { ...TENDER_POS },
    alive: false,
    outcome: 'destroyed',
  };

  rt.bus.emit('sector:enter', { sectorId: CERES_ACTIVITY_SECTOR_ID });
  assert.equal(rt.spawned.length, 0, 'no replacement tender is created for a destroyed stable slot');
  assert.equal(rt.state.npcJobs.byId[TENDER_JOB_ID], undefined, 'the stale owner job is released');
  assert.equal(Object.keys(rt.state.factionPresence.active).length, 0);
});

test('non-Ceres Pitborn yard tenders retain their existing position and transient lifecycle', () => {
  const sectorId = 'sector_vesta_forge';
  const seed = 0x47a;
  const expectedPlan = planFactionPresence({ sectorId, seed, losses: [] })
    .find((plan) => plan.factionId === 'faction_pitborn' && plan.yardTender === true);
  assert.ok(expectedPlan);
  const rt = runtime(sectorId, seed);

  rt.bus.emit('sector:enter', { sectorId });
  const tender = rt.spawned.find((entity) => entity.data?.factionPresence?.yardTender === true);
  assert.ok(tender);
  assert.deepEqual(xz(tender.pos), expectedPlan.pos, 'the Ceres override does not move Vesta presence');
  assert.equal(tender.data.worldRecordId, undefined);
  assert.equal(tender.data.activityActorSlotId, undefined);
  assert.equal(tender.data.jobId, undefined);
  assert.equal(tender.data.trafficRole, undefined);
  assert.deepEqual(rt.state.npcJobs.byId, {});
});

// ── PQ-045.tender-client-materialization ────────────────────────────────────────────────────────
// The tender used to fly a service call-out to `activity:disabled-hull` — a route reference that
// named a physical client no object in the world actually was. These cover the whole chain that
// makes it real: authored slot -> world object -> job projection -> live binding -> steering, and
// the same chain again after a save/Continue rather than only on a fresh entry.

const DISABLED_HULL_SLOT_ID = 'ceres_refinery_disabled_hull';
const CLIENT_MARK = TENDER_SLOT.route.marks.find((mark) => mark.id === 'refinery_tender_client');

function liveDisabledHulls(state) {
  return state.entityList.filter((entity) => (
    entity?.alive !== false && entity.data?.activityObjectSlotId === DISABLED_HULL_SLOT_ID
  ));
}

function tenderRuntime() {
  const sim = createSimulation({ seed: SEED, systems: [factionPresence, world, npcJobsRuntime] });
  sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID, { placePlayer: false });
  return sim;
}

test('the tender services one live disabled-hull object bound to its exact authored targetRef', () => {
  const sim = tenderRuntime();
  try {
    assert.equal(CLIENT_MARK.targetRef, 'object:ceres_refinery_disabled_hull',
      'the client mark names a real object rather than an abstract activity choreography mark');

    const clients = liveDisabledHulls(sim.state);
    assert.equal(clients.length, 1, 'exactly one disabled-hull object materializes, from one writer');
    const client = clients[0];
    assert.equal(client.type, 'fx');
    assert.equal(client.collides, false, 'the client adds no collider to the Ceres budget');
    assert.equal(client.mass, 0);
    assert.equal(client.data.worldDressing, true);
    assert.equal(client.data.placeId, 'place_dead_hulk');

    const slot = REFINERY_POCKET.objectSlots.find((row) => row.id === DISABLED_HULL_SLOT_ID);
    const expected = sectorLocalToGlobalForSector({
      x: REFINERY_POCKET.activityAnchor.localPos.x + slot.offset.x,
      z: REFINERY_POCKET.activityAnchor.localPos.z + slot.offset.z,
    }, CERES_ACTIVITY_SECTOR_ID);
    assert.deepEqual(xz(client.pos), { x: expected.x, z: expected.z },
      'the object sits at its authored pocket offset, not at an ambient dressing position');

    const entry = sim.state.npcJobs.byId[TENDER_JOB_ID];
    const clientWaypoint = entry.job.route.find((row) => row.id === 'refinery_tender_client');
    assert.equal(clientWaypoint.targetRef, CLIENT_MARK.targetRef,
      'the factionPresence job projection preserves the authored targetRef exactly');

    // The string surviving projection is not the same claim as the runtime resolving it. Drive the
    // job to the leg that heads for the client and assert the controller owns the LIVE object.
    const runtime = sim.registry.get('npcJobsRuntime');
    const tender = sim.state.entities.get(entry.entityId);
    entry.job.phase = 'transit';
    entry.job.routeIndex = 0;
    const binding = runtime._currentCeresRealTargetBinding(entry, tender);
    assert.ok(binding, 'the tender/client tuple is an admitted real-target relationship');
    assert.equal(binding.targetRef, client, 'the binding names the one live disabled-hull entity');
    assert.equal(binding.spec.waypointId, 'refinery_tender_client');
  } finally {
    sim.dispose();
  }
});

test('the tender steers to a safe berth off its client through the existing job owner', () => {
  const sim = tenderRuntime();
  try {
    const entry = sim.state.npcJobs.byId[TENDER_JOB_ID];
    const runtime = sim.registry.get('npcJobsRuntime');
    const tender = sim.state.entities.get(entry.entityId);
    const client = liveDisabledHulls(sim.state)[0];
    entry.job.phase = 'transit';
    entry.job.routeIndex = 0;

    const authoredWaypoint = entry.job.route[1].pos;
    const authoredAim = Math.atan2(
      authoredWaypoint.z - tender.pos.z,
      authoredWaypoint.x - tender.pos.x,
    );
    const liveAim = Math.atan2(client.pos.z - tender.pos.z, client.pos.x - tender.pos.x);
    const separation = Math.abs(Math.atan2(
      Math.sin(liveAim - authoredAim),
      Math.cos(liveAim - authoredAim),
    ));
    assert.ok(separation > 0.25,
      'the fixture makes servicing the real client causally distinct from the authored waypoint');

    tender.rot = liveAim;
    runtime._drive(entry, tender);
    assert.ok(Math.abs(tender.data.intent.aimAngle - liveAim) < 1e-9,
      'the tender aims at its live client, not at the authored coordinate');
    assert.ok(tender.data.intent.moveZ > 0, 'and closes on it rather than holding station');

    // A safe berth means it stops CLEAR of the casualty rather than intersecting it. Both hulls have
    // real size here, so the clearance that matters is the sum of the two radii — checking only the
    // client's radius would call a berth "safe" while the tender's own 24 WU hull sat inside the
    // wreck. Derive it the way the controller does instead of restating a number.
    const spec = runtime._currentCeresRealTargetBinding(entry, tender).spec;
    assert.equal(spec.standoffKind, 'collision',
      'the work berth tracks live hull geometry rather than a hand-tuned constant');
    const standoff = Math.max(spec.standoffWU, tender.radius + client.radius + 12);
    assert.ok(standoff > tender.radius + client.radius,
      'the berth clears both hulls, not merely the client centre');
    tender.pos = { x: client.pos.x + standoff, z: client.pos.z };
    tender.vel = { x: 0, z: 0 };
    runtime._drive(entry, tender);
    assert.equal(tender.data.intent.brake, true, 'at the berth the tender holds rather than closing');
    assert.equal(tender.data.intent.moveZ, 0);
  } finally {
    sim.dispose();
  }
});

test('Continue restores a tender still servicing the same client, not a bare coordinate', () => {
  const sim = tenderRuntime();
  try {
    const before = sim.state.npcJobs.byId[TENDER_JOB_ID];
    const savedJobs = sim.registry.get('npcJobsRuntime').serialize();
    const savedWaypoint = savedJobs.byId[TENDER_JOB_ID].job.route
      .find((row) => row.id === 'refinery_tender_client');
    assert.equal(savedWaypoint.targetRef, CLIENT_MARK.targetRef,
      'the save envelope itself carries the service relationship');
    assert.equal(savedJobs.byId[TENDER_JOB_ID].job.speed, before.job.speed);

    const runtime = sim.registry.get('npcJobsRuntime');
    runtime.deserialize(savedJobs);
    sim.state.simTime = 30;
    sim.bus.emit('save:loaded', {});

    const restored = sim.state.npcJobs.byId[TENDER_JOB_ID];
    assert.ok(restored, 'Continue restores exactly one tender job');
    assert.equal(Object.keys(sim.state.npcJobs.byId).length, 1);
    const restoredWaypoint = restored.job.route.find((row) => row.id === 'refinery_tender_client');
    assert.equal(restoredWaypoint.targetRef, CLIENT_MARK.targetRef,
      'the restored ship is still servicing the same client');

    const clients = liveDisabledHulls(sim.state);
    assert.equal(clients.length, 1, 'Continue leaves exactly one client object, never a duplicate');
    const restoredTender = sim.state.entities.get(restored.entityId);
    restored.job.phase = 'transit';
    restored.job.routeIndex = 0;
    const binding = runtime._currentCeresRealTargetBinding(restored, restoredTender);
    assert.ok(binding, 'the relationship rebinds after restore rather than silently degrading');
    assert.equal(binding.targetRef, clients[0],
      'and it rebinds to the live object, proving more than a preserved string');
  } finally {
    sim.dispose();
  }
});

test('a hard sector round trip rebuilds both bodies and rebinds the same service relationship', () => {
  const sim = tenderRuntime();
  try {
    const worldSystem = sim.registry.get('world');
    const runtime = sim.registry.get('npcJobsRuntime');
    const originalTender = sim.state.entities.get(sim.state.npcJobs.byId[TENDER_JOB_ID].entityId);
    const originalClient = liveDisabledHulls(sim.state)[0];

    worldSystem.enterSector('sector_helios_prime', {
      fromSectorId: CERES_ACTIVITY_SECTOR_ID,
      placePlayer: false,
    });
    sim.step(1 / 60); // let the core sweep actually remove the departed bodies
    worldSystem.enterSector(CERES_ACTIVITY_SECTOR_ID, {
      fromSectorId: 'sector_helios_prime',
      placePlayer: false,
    });

    // Both ends of the relationship are genuinely new objects here: the tender is a rematerialized
    // shell re-stamped by factionPresence adoption, and the client is a freshly dressed prop. If the
    // adoption path dropped any identity marker, or if the previous client lingered and made the
    // target ambiguous, the tender would silently fall back to flying at a bare coordinate.
    const clients = liveDisabledHulls(sim.state);
    assert.equal(clients.length, 1, 'the return leaves exactly one client, never a stale duplicate');
    assert.notEqual(clients[0], originalClient, 'the client really was rebuilt, not merely retained');

    const entry = sim.state.npcJobs.byId[TENDER_JOB_ID];
    const tender = sim.state.entities.get(entry.entityId);
    assert.notEqual(tender, originalTender, 'the tender really was rebuilt too');
    assert.equal(tender.data.factionPresence.yardTender, true);
    assert.equal(tender.data.durable, true);
    assert.equal(tender.data.identityKey, TENDER_SLOT.worldRecordSlotId);
    assert.equal(tender.data.activityActorSlotId, TENDER_SLOT.id);
    // The work berth is derived from the LIVE actor radius, so canonical hull restoration is load
    // bearing for clearance and not only for presentation: a rematerialized shell that kept a
    // generic radius would compute a berth small enough to seat the tender inside the wreck.
    assert.equal(tender.radius, 24, 'adoption restores the canonical hull the berth is derived from');
    // Geometry pin only: collision standoff formula used by the controller. Steering-at-berth is
    // covered on fresh spawn by the dedicated safe-berth test; here we only prove the rematerialized
    // radius would yield the same clearance input.
    assert.equal(
      Math.max(56, tender.radius + clients[0].radius + 12), 78,
      'rebuilt tender+client radii recompute the same collision standoff input as a fresh spawn',
    );

    entry.job.phase = 'transit';
    entry.job.routeIndex = 0;
    const binding = runtime._currentCeresRealTargetBinding(entry, tender);
    assert.ok(binding, 'the restored ship is still an admitted service relationship');
    assert.equal(binding.targetRef, clients[0],
      'and it is servicing the same client, now bound to the rebuilt object');
    assert.equal(binding.ambiguous, false);
  } finally {
    sim.dispose();
  }
});

test('remaining activity: choreography marks stay abstract and do not spawn object-slot entities', () => {
  // Seven abstract activity: marks are intentional scan/throughline/perimeter choreography.
  // Only the deliberate disabled-hull object: slot may materialize as an activityObjectSlotId body.
  const abstractRefs = [];
  for (const pocket of Object.values(CERES_ACTIVITY_POCKETS_BY_ID)) {
    for (const slot of pocket.actorSlots || []) {
      for (const mark of slot.route?.marks || []) {
        if (typeof mark.targetRef === 'string' && mark.targetRef.startsWith('activity:')) {
          abstractRefs.push(mark.targetRef);
        }
      }
    }
  }
  assert.equal(abstractRefs.length, 7, 'exactly seven abstract activity: marks remain authored');
  assert.ok(abstractRefs.every((ref) => !ref.includes('disabled')),
    'the old activity:disabled-hull ghost is not among abstract marks');

  const sim = tenderRuntime();
  try {
    const activityBodies = sim.state.entityList.filter((entity) => (
      entity?.alive !== false && entity.data?.activityObjectSlotId
    ));
    const slotIds = activityBodies.map((entity) => entity.data.activityObjectSlotId).sort();
    // Object slots that re-point ambient dressing may include disabled hull + other real object:* slots.
    // None of them may be named after an activity: choreography string.
    for (const id of slotIds) {
      assert.equal(String(id).startsWith('activity:'), false,
        `no live body may bind an activity: choreography id (got ${id})`);
    }
    assert.ok(slotIds.includes(DISABLED_HULL_SLOT_ID),
      'the one deliberate disabled-hull object slot is present');
    // Abstract marks never become object slots in data.
    for (const pocket of Object.values(CERES_ACTIVITY_POCKETS_BY_ID)) {
      for (const slot of pocket.objectSlots || []) {
        assert.equal(String(slot.id).startsWith('activity:'), false);
        assert.notEqual(slot.targetRef?.startsWith?.('activity:'), true);
      }
    }
  } finally {
    sim.dispose();
  }
});
