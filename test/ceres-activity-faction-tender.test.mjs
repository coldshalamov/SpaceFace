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
const TENDER_ROUTE = Object.freeze(TENDER_SLOT.route.marks.map((mark) => Object.freeze({
  id: mark.id,
  pos: Object.freeze(sectorLocalToGlobalForSector({
    x: REFINERY_POCKET.activityAnchor.localPos.x + mark.offset.x,
    z: REFINERY_POCKET.activityAnchor.localPos.z + mark.offset.z,
  }, CERES_ACTIVITY_SECTOR_ID)),
})));

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
  assert.deepEqual(entry.job.route.map(({ id, pos }) => ({ id, pos })), TENDER_ROUTE,
    'the job consumes the released route marks in pocket-anchor world space');
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
  const staleHull = addRematerializedTender(rt);
  assert.equal(rt.helpers.npcJobs.assign(staleHull, {
    kind: TENDER_SLOT.jobKind,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    route: TENDER_ROUTE,
  }), TENDER_JOB_ID);
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
