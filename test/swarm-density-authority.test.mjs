import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { FRESH_RUN_SYSTEMS, resetFreshRunSystems } from '../src/core/runReset.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { claims, CLAIM_RAID_ATTACKER_RANGE } from '../src/systems/claims.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { missions } from '../src/systems/missions.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';
const IO_REACH = 'sector_io_reach';
const ASHFALL = 'sector_ashfall_reach';

function bootWorld(seed = 47, sectorId = HELIOS) {
  const sim = createSimulation({ seed, systems: [spawnBudget, world] });
  const origin = sectorGlobalOrigin(sectorId);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...origin }, vel: { x: 0, z: 0 },
    radius: 5, mass: 10, hull: 100, hullMax: 100, flags: {},
  });
  player.isPlayer = true;
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    player,
    budget: sim.helpers.spawnBudget,
    world: sim.registry.get('world'),
  };
}

function enterContinuous(h, sectorId) {
  const previous = h.state.world.currentSectorId;
  const origin = sectorGlobalOrigin(sectorId);
  h.player.pos.x = origin.x;
  h.player.pos.z = origin.z;
  h.world.enterSector(sectorId, {
    continuous: previous != null,
    noTeleport: previous != null,
    placePlayer: false,
    fromSectorId: previous,
  });
}

function assertExactWorldBudget(h, label) {
  const owners = h.state.spawnBudget.entityOwners;
  assert.equal(h.budget.current(), owners.size, `${label}: every world slot is entity-bound`);
  assert.ok(h.budget.current() <= h.budget.max(), `${label}: hard cap holds`);
  for (const [entityId, requester] of owners) {
    const entity = h.state.entities.get(Number.isNaN(Number(entityId)) ? entityId : Number(entityId));
    assert.ok(entity && entity.alive !== false, `${label}: ${requester} owns a live entity`);
    assert.match(requester, /^world:/, `${label}: focused harness has only world clients`);
  }
}

function makeClaimBody(id = 'claim_swarm_fixture') {
  return {
    id,
    sectorId: IO_REACH,
    poiId: `poi_${id}`,
    name: 'Swarm Test Claim',
    size: 'M',
    slots: 3,
    modules: ['mod_refinery'],
    linkedStationId: null,
    x: 200,
    z: -120,
    claimedAt: 100,
    spec: {
      id: 'spec_refinery',
      since: 100,
      status: 'active',
      statusUntil: 0,
      store: { input: { cmdty_ore_iron: 100 }, output: {} },
      convoy: null,
      acc: 0,
      nextDispatchAt: 0,
      destStationId: null,
      upkeepDebt: 0,
      deterrenceUntil: 0,
      outputFull: false,
      receipts: [],
      defense: null,
      totals: {
        refinedTotalU: 0,
        soldTotalCr: 0,
        lostU: 0,
        upkeepPaidCr: 0,
        raidsRepelled: 0,
        raidsSuffered: 0,
      },
    },
  };
}

function spawnFixturePlayer(sim, pos = { x: 0, z: 0 }) {
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...pos }, vel: { x: 0, z: 0 },
    radius: 5, mass: 10, hull: 100, hullMax: 100, flags: {},
  });
  player.isPlayer = true;
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  return player;
}

test('production order resets the outgoing ledger before restore and keeps incoming re-entry slots', () => {
  const h = bootWorld();
  assert.equal(h.budget.request(4, 'fixture:outgoing'), 4);
  h.bus.emit('save:restoring', { slot: 'swarm-authority' });
  assert.equal(h.budget.current(), 0, 'outgoing reservations clear at restore start');

  enterContinuous(h, CERES);
  const incoming = h.budget.current();
  assert.ok(incoming > 0, 'incoming Ceres ambient ships reserve live slots during world re-entry');
  h.bus.emit('save:loaded', { slot: 'swarm-authority' });
  assert.equal(h.budget.current(), incoming, 'late save:loaded cannot erase incoming live ownership');
  assertExactWorldBudget(h, 'post-load Ceres');
  h.sim.dispose();
});

test('canonical New Game resets spawnBudget before world rematerialization', () => {
  assert.ok(FRESH_RUN_SYSTEMS.indexOf('spawnBudget') >= 0);
  assert.ok(FRESH_RUN_SYSTEMS.indexOf('spawnBudget') < FRESH_RUN_SYSTEMS.indexOf('world'));

  const h = bootWorld();
  assert.equal(h.budget.request(3, 'fixture:previous-run'), 3);
  const resetOrder = [];
  resetFreshRunSystems(h.sim.registry, {
    afterEach(name, system) {
      if (system) resetOrder.push(name);
    },
  });
  assert.deepEqual(resetOrder.slice(0, 2), ['spawnBudget', 'world']);
  assert.equal(h.budget.current(), 0);
  h.sim.dispose();
});

test('continuous H-C-T-H handoff has per-sector/entity ambient parity without ledger growth', () => {
  const h = bootWorld();
  const counts = new Map();
  for (const sectorId of [HELIOS, CERES, TETHYS, HELIOS, CERES]) {
    enterContinuous(h, sectorId);
    assertExactWorldBudget(h, sectorId);
    if (!counts.has(sectorId)) counts.set(sectorId, h.budget.current());
    else assert.equal(h.budget.current(), counts.get(sectorId), `${sectorId} returns to its stable count`);
  }
  assert.ok(counts.get(CERES) > 0 && counts.get(TETHYS) > 0, 'ordinary corridor sectors materialize combat presence');
  h.sim.dispose();
});

test('saturated bounty spawns clamp while a critical boss remains queued and retries deterministically', () => {
  const bounty = bootWorld(47, IO_REACH);
  bounty.state.player.heat = 1;
  const limited = [];
  bounty.bus.on('world:spawnLimited', (payload) => limited.push(payload));
  assert.equal(bounty.budget.request(bounty.budget.max(), 'fixture:saturated'), bounty.budget.max());
  const reachOrigin = sectorGlobalOrigin(IO_REACH);
  bounty.player.pos.x = reachOrigin.x + 2800;
  bounty.player.pos.z = reachOrigin.z + 2400;
  bounty.world.enterSector(IO_REACH, { placePlayer: false });
  assert.equal(bounty.budget.current(), bounty.budget.max());
  assert.ok(limited.some((row) => row.kind === 'bounty_hunter' && row.granted === 0));
  assert.equal(bounty.state.entityList.filter((entity) => (
    entity.alive && entity.data?.ai?.spawnContext === 'bounty_hunter'
  )).length, 0, 'bounty consequence never bypasses the cap');
  bounty.sim.dispose();

  const liveBounty = bootWorld(47, IO_REACH);
  liveBounty.state.player.heat = 1;
  liveBounty.player.pos.x = reachOrigin.x + 2800;
  liveBounty.player.pos.z = reachOrigin.z + 2400;
  liveBounty.world.enterSector(IO_REACH, { placePlayer: false });
  const hunter = liveBounty.state.entityList.find((entity) => (
    entity.alive && entity.data?.ai?.spawnContext === 'bounty_hunter'
  ));
  assert.ok(hunter, 'ordinary hot entry materializes a bounty consequence');
  assert.match(liveBounty.budget.ownerForEntity(hunter.id), /^world:bounty:/);
  const beforeHunterLoss = liveBounty.budget.current();
  hunter.alive = false;
  liveBounty.sim.step();
  assert.equal(liveBounty.budget.current(), beforeHunterLoss - 1,
    'destroyed bounty hunter releases its exact bound slot');
  liveBounty.sim.dispose();

  const boss = bootWorld(47, ASHFALL);
  const deferred = [];
  boss.bus.on('world:criticalSpawnDeferred', (payload) => deferred.push(payload));
  assert.equal(boss.budget.request(boss.budget.max(), 'fixture:saturated'), boss.budget.max());
  enterContinuous(boss, ASHFALL);
  assert.equal(boss.state.world.activeSector.boss, undefined);
  assert.deepEqual(deferred.map((row) => row.kind), ['boss']);

  assert.equal(boss.budget.releaseSome('fixture:saturated', 1), 1);
  boss.sim.runTicks(16);
  const bossId = boss.state.world.activeSector.boss?.entityId;
  assert.ok(bossId != null, 'the queued authored boss consumes the first released slot');
  assert.equal(boss.budget.current(), boss.budget.max());
  assert.match(boss.budget.ownerForEntity(bossId), /^world:boss:/);
  const bossEntity = boss.state.entities.get(bossId);
  bossEntity.alive = false;
  boss.sim.step();
  assert.equal(boss.budget.current(), boss.budget.max() - 1, 'boss destruction releases its exact slot');
  boss.sim.dispose();
});

test('mission patrol targets defer, partially fill, top up in order, and release by entity', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, missions] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 5, mass: 10, hull: 100, hullMax: 100,
  });
  player.isPlayer = true;
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = CERES;
  const mission = {
    id: 'mission_cap_fixture', type: 'patrol_clear', status: 'active', needsTargets: true,
    destSectorId: CERES, objectiveTarget: 3, objectiveProgress: 0,
    targetEntityIds: [], riskTier: 1, params: {},
  };
  sim.state.missions.active = [mission];
  const budget = sim.helpers.spawnBudget;
  const deferred = [];
  sim.bus.on('mission:spawnDeferred', (payload) => deferred.push(payload));
  assert.equal(budget.request(budget.max(), 'fixture:saturated'), budget.max());
  sim.registry.get('missions')._ensureMissionTargets(mission);
  assert.deepEqual(mission.targetEntityIds, []);
  assert.deepEqual(deferred.map((row) => [row.requested, row.granted]), [[3, 0]]);

  assert.equal(budget.releaseSome('fixture:saturated', 2), 2);
  sim.step();
  assert.equal(mission.targetEntityIds.length, 2, 'first retry uses exactly the two available slots');
  assert.equal(budget.current(), budget.max());
  assert.equal(budget.releaseSome('fixture:saturated', 1), 1);
  sim.runTicks(15);
  assert.equal(mission.targetEntityIds.length, 3, 'bounded retry tops up the remaining authored target');
  assert.equal(budget.current(), budget.max());
  for (const id of mission.targetEntityIds) assert.equal(budget.ownerForEntity(id), `mission:${mission.id}`);

  const destroyed = sim.state.entities.get(mission.targetEntityIds[0]);
  destroyed.alive = false;
  sim.step();
  assert.equal(budget.current(), budget.max() - 1, 'target destruction releases only its own mission slot');
  sim.dispose();
});

test('spawn:request shares the world cap, clamps partial grants, and releases unused grants on throw', () => {
  const h = bootWorld(47, IO_REACH);
  const reachOrigin = sectorGlobalOrigin(IO_REACH);
  h.player.pos.x = reachOrigin.x + 2800;
  h.player.pos.z = reachOrigin.z + 2400;
  enterContinuous(h, IO_REACH);

  const triggered = [];
  h.bus.on('interdiction:triggered', (payload) => triggered.push(payload));
  const fixtureCount = h.budget.available();
  assert.equal(h.budget.request(fixtureCount, 'fixture:spawn-request-saturation'), fixtureCount);
  h.bus.emit('spawn:request', {
    entityType: 'pirate', sectorId: IO_REACH, count: 3,
    position: { x: h.player.pos.x, z: h.player.pos.z }, refId: 'swarm:saturated',
  });
  assert.equal(h.state.entityList.filter((entity) => entity.data?.spawnRefId === 'swarm:saturated').length, 0);
  assert.equal(triggered.length, 0, 'a saturated request has no false interdiction receipt');
  assert.equal(h.budget.current(), h.budget.max());

  assert.equal(h.budget.releaseSome('fixture:spawn-request-saturation', 2), 2);
  h.bus.emit('spawn:request', {
    entityType: 'pirate', sectorId: IO_REACH, count: 3,
    position: { x: h.player.pos.x, z: h.player.pos.z }, refId: 'swarm:partial',
  });
  const partial = h.state.entityList.filter((entity) => entity.alive && entity.data?.spawnRefId === 'swarm:partial');
  assert.equal(partial.length, 2, 'request materializes only the two admitted hulls');
  assert.deepEqual(triggered.at(-1)?.entityIds, partial.map((entity) => entity.id));
  for (const entity of partial) {
    assert.equal(h.budget.ownerForEntity(entity.id), 'world:spawn-request:swarm:partial');
    assert.ok(h.state.world.activeSector.enemies.includes(entity.id));
    entity.alive = false;
  }
  h.sim.step();

  const beforeThrow = h.budget.current();
  const originalSpawn = h.sim.helpers.spawnEntity;
  let attempts = 0;
  h.sim.helpers.spawnEntity = (spec) => {
    attempts++;
    if (attempts === 2) throw new Error('fixture spawn failure');
    return originalSpawn(spec);
  };
  try {
    assert.throws(() => h.world._onSpawnRequest({
      entityType: 'pirate', sectorId: IO_REACH, count: 2,
      position: { x: h.player.pos.x, z: h.player.pos.z }, refId: 'swarm:throw',
    }), /fixture spawn failure/);
  } finally {
    h.sim.helpers.spawnEntity = originalSpawn;
  }
  const survivedThrow = h.state.entityList.filter((entity) => entity.alive && entity.data?.spawnRefId === 'swarm:throw');
  assert.equal(survivedThrow.length, 1);
  assert.equal(h.budget.current(), beforeThrow + 1, 'only the successful hull retains a slot');
  assert.equal(h.budget.ownerForEntity(survivedThrow[0].id), 'world:spawn-request:swarm:throw');
  assert.ok(h.state.world.activeSector.enemies.includes(survivedThrow[0].id),
    'the successful prefix cannot become an orphan when a later spawn throws');
  h.sim.dispose();
});

test('mission save top-up preserves survivors and deterministically fills the lowest durable slot', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, missions] });
  spawnFixturePlayer(sim);
  sim.state.world.currentSectorId = CERES;
  const mission = {
    id: 'mission_slot_fixture', type: 'patrol_clear', status: 'active', needsTargets: true,
    destSectorId: CERES, objectiveTarget: 3, objectiveProgress: 0,
    targetEntityIds: [], riskTier: 1, params: {},
  };
  sim.state.missions.active = [mission];
  const budget = sim.helpers.spawnBudget;
  const missionSys = sim.registry.get('missions');
  assert.equal(budget.request(budget.max(), 'fixture:mission-slot-saturation'), budget.max());
  assert.equal(budget.releaseSome('fixture:mission-slot-saturation', 2), 2);
  missionSys._ensureMissionTargets(mission);

  const bySlot = new Map(mission.targetEntityIds.map((id) => {
    const entity = sim.state.entities.get(id);
    return [entity.data.missionTargetSlot, entity];
  }));
  assert.deepEqual([...bySlot.keys()].sort((a, b) => a - b), [0, 1]);
  const originalSlot0 = bySlot.get(0);
  const survivor = bySlot.get(1);
  const slot0Identity = {
    worldRecordId: originalSlot0.data.worldRecordId,
    identityKey: originalSlot0.data.identityKey,
    pos: { ...originalSlot0.pos },
    defId: originalSlot0.data.defId,
  };
  const survivorIdentity = {
    id: survivor.id,
    worldRecordId: survivor.data.worldRecordId,
    identityKey: survivor.data.identityKey,
    pos: { ...survivor.pos },
  };

  originalSlot0.alive = false;
  sim.bus.emit('entity:destroyed', { id: originalSlot0.id });
  const snapshot = JSON.parse(JSON.stringify(missionSys.serialize()));
  missionSys.deserialize(snapshot);
  const restored = sim.state.missions.active.find((entry) => entry.id === mission.id);
  missionSys._ensureMissionTargets(restored);

  const restoredBySlot = new Map(restored.targetEntityIds.map((id) => {
    const entity = sim.state.entities.get(id);
    return [entity.data.missionTargetSlot, entity];
  }));
  assert.deepEqual([...restoredBySlot.keys()].sort((a, b) => a - b), [0, 1],
    'one available slot fills the durable zero gap instead of renumbering the survivor');
  assert.deepEqual({
    id: restoredBySlot.get(1).id,
    worldRecordId: restoredBySlot.get(1).data.worldRecordId,
    identityKey: restoredBySlot.get(1).data.identityKey,
    pos: { ...restoredBySlot.get(1).pos },
  }, survivorIdentity, 'Continue adopts the exact surviving slot-one identity');
  assert.deepEqual({
    worldRecordId: restoredBySlot.get(0).data.worldRecordId,
    identityKey: restoredBySlot.get(0).data.identityKey,
    pos: { ...restoredBySlot.get(0).pos },
    defId: restoredBySlot.get(0).data.defId,
  }, slot0Identity, 'mission+slot seed reconstructs the missing slot exactly');
  assert.equal(budget.current(), budget.max());
  sim.dispose();
});

test('automatic claim raids use the authored deterministic four-to-six ship range', () => {
  function rollRaid() {
    const sim = createSimulation({ seed: 47, systems: [claims] });
    sim.state.mode = 'flight';
    sim.state.simTime = 1000;
    sim.state.world.currentSectorId = IO_REACH;
    sim.state.onboarding = { active: false, finished: true };
    const body = makeClaimBody();
    sim.state.claims = {
      bodies: [body],
      meta: { rngSeed: 5, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 },
    };
    const draws = [0, 0.999, 0.999]; // trip, fail abstract repel, top of authored size band
    const sys = sim.registry.get('claims');
    sys._rng = () => draws.shift() ?? 0;
    sys._rollRaids([body], sim.state);
    const count = body.spec.defense?.attackerCount;
    sim.dispose();
    return count;
  }

  assert.deepEqual(CLAIM_RAID_ATTACKER_RANGE, [4, 6]);
  assert.deepEqual(ENCOUNTERS.claim_threat.squad.size, [4, 6]);
  assert.equal(rollRaid(), 6);
  assert.equal(rollRaid(), 6, 'identical production draws produce the same authored raid strength');
});

test('claim defense partial grants always lead with one anchor and fill every remainder with lights', () => {
  for (let grant = 1; grant <= 6; grant++) {
    const sim = createSimulation({ seed: 47, systems: [spawnBudget, encounterDirector] });
    const origin = sectorGlobalOrigin(IO_REACH);
    spawnFixturePlayer(sim, origin);
    sim.state.world.currentSectorId = IO_REACH;
    const body = makeClaimBody(`claim_grant_${grant}`);
    sim.state.claims = { bodies: [body] };
    const budget = sim.helpers.spawnBudget;
    assert.equal(budget.request(budget.max() - grant, `fixture:claim-grant:${grant}`), budget.max() - grant);
    const director = sim.registry.get('encounterDirector');
    const encounterId = `claim-defense:${body.id}:1`;
    const result = director.requestClaimDefense({
      encounterId,
      claimId: body.id,
      defenseId: `${body.id}:1`,
      sectorId: IO_REACH,
      anchor: { x: body.x, z: body.z },
      attackerCount: 6,
      attackerName: 'Reach scavengers',
    });
    assert.equal(result.ok, true, `grant ${grant} admits the authored defense`);
    const live = sim.state.encounterDirector.live[encounterId];
    assert.equal(live.ids.length, grant);
    const roles = live.ids.map((id) => sim.state.entities.get(id)?.data?.ai?.encounterCompositionRole);
    assert.equal(roles.filter((role) => role === 'identity_anchor').length, 1, `grant ${grant} has one anchor`);
    assert.equal(roles.filter((role) => role === 'light').length, grant - 1, `grant ${grant} fills with lights`);
    assert.equal(roles[0], 'identity_anchor', 'the anchor owns the first admitted slot');
    assert.equal(budget.current(), budget.max());
    sim.dispose();
  }
});

test('genuine distress remains queued until two slots exist and emits nothing before admission', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, encounterDirector] });
  const origin = sectorGlobalOrigin(ASHFALL);
  spawnFixturePlayer(sim, origin);
  sim.state.world.currentSectorId = ASHFALL;
  const director = sim.registry.get('encounterDirector');
  const dir = sim.state.encounterDirector;
  const shape = ENCOUNTERS.distress_call;
  const zone = zonesForSector(ASHFALL).find((entry) => shape.zoneTypes.includes(entry.type));
  assert.ok(zone, 'Ashfall has a distress-compatible authored zone');
  const seeded = mulberry32(hash32(47, 'genuine-distress-admission'));
  let first = true;
  const item = planEncounterShape(shape, zone, ASHFALL, 0, 0, () => {
    if (first) { first = false; return 0; }
    return seeded();
  });
  assert.equal(item.variantKind, 'distress_genuine');
  sim.state.simTime = 100;
  item.dueAt = sim.state.simTime;
  dir.pending = [item];
  dir.pressure.civilian = 100;
  dir.lastMeaningfulAt = -1e9;
  dir.window = [];
  const log = { telegraph: [], voice: [], payout: [] };
  sim.bus.on('encounter:telegraph', (payload) => log.telegraph.push(payload));
  sim.bus.on('encounter:voice', (payload) => log.voice.push(payload));
  sim.bus.on('economy:grantCredits', (payload) => log.payout.push(payload));
  const budget = sim.helpers.spawnBudget;
  assert.equal(budget.request(budget.max(), 'fixture:distress-saturation'), budget.max());

  director._pump(dir, sim.state, sim.state.simTime);
  assert.equal(dir.pending.length, 1);
  assert.equal(dir.stats.fired, 0);
  assert.deepEqual(log, { telegraph: [], voice: [], payout: [] });

  assert.equal(budget.releaseSome('fixture:distress-saturation', 1), 1);
  sim.state.simTime = item.dueAt;
  director._pump(dir, sim.state, sim.state.simTime);
  assert.equal(dir.pending.length, 1, 'one slot cannot truthfully stage victim plus threat');
  assert.equal(dir.stats.fired, 0);
  assert.deepEqual(log, { telegraph: [], voice: [], payout: [] });

  assert.equal(budget.releaseSome('fixture:distress-saturation', 1), 1);
  sim.state.simTime = item.dueAt;
  director._pump(dir, sim.state, sim.state.simTime);
  assert.equal(dir.pending.length, 0);
  assert.equal(dir.stats.fired, 1);
  assert.equal(log.telegraph.length, 1);
  assert.equal(log.voice.length, 1);
  assert.equal(log.payout.length, 0, 'admission itself cannot fabricate rescue payout');
  const live = sim.state.encounterDirector.live[item.encounterId];
  assert.ok(live);
  assert.equal(live.ids.length, 2);
  assert.ok(live.ids.some((id) => live.roles[id] === 'victim'));
  assert.ok(live.ids.some((id) => live.roles[id] === 'threat'));
  assert.equal(budget.current(), budget.max());
  sim.dispose();
});

test('encounter spawn exceptions release every unused grant while retaining the successful prefix', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, encounterDirector] });
  spawnFixturePlayer(sim);
  sim.state.world.currentSectorId = IO_REACH;
  const director = sim.registry.get('encounterDirector');
  const live = {
    id: 'throwing-encounter', squadId: 'throwing-encounter', sectorId: IO_REACH,
    zoneId: 'fixture-zone', zoneName: 'Fixture Zone', shapeId: 'claim_threat',
    shape: ENCOUNTERS.claim_threat,
    plan: { motive: 'fixture', engagementTrigger: 'fixture', ships: [] },
    causality: null, ids: [], roles: {},
  };
  const ships = [0, 1, 2].map((index) => ({
    archetype: 'wasp_swarmer', level: 1, context: 'encounter', factionId: 'faction_reach',
    role: 'squad', compositionRole: index === 0 ? 'identity_anchor' : 'light',
    pos: { x: 100 + index * 30, z: 200 },
  }));
  const originalSpawn = sim.helpers.spawnEntity;
  let attempts = 0;
  sim.helpers.spawnEntity = (spec) => {
    attempts++;
    if (attempts === 2) throw new Error('fixture encounter spawn failure');
    return originalSpawn(spec);
  };
  try {
    assert.throws(() => director.spawnShips(live, ships), /fixture encounter spawn failure/);
  } finally {
    sim.helpers.spawnEntity = originalSpawn;
  }
  assert.equal(live.ids.length, 1);
  assert.deepEqual(sim.state.encounterDirector.active[live.squadId].ids, live.ids);
  assert.equal(sim.helpers.spawnBudget.current(), 1,
    'the failed and never-attempted hulls release their two unused grants');
  sim.state.entities.get(live.ids[0]).alive = false;
  sim.step();
  assert.equal(sim.helpers.spawnBudget.current(), 0, 'the successful prefix retains normal release semantics');
  sim.dispose();
});

test('reinforcement faction enters makeEnemySpawnSpec before doctrine/contact derivation', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, aiEncounter] });
  sim.state.aiEncounter.commands.push({
    version: 1, seq: 1, tick: 0, type: 'request_reinforcement',
    packageId: 'fixture_wing_pair', budgetRemaining: sim.helpers.spawnBudget.available(),
  });
  sim.runTicks(2);
  const reinforcements = sim.state.entityList.filter((entity) => (
    entity.alive && entity.data?.ai?.spawnContext === 'sg06_reinforcement'
  ));
  assert.equal(reinforcements.length, 2);
  const reinforcement = reinforcements[0];
  assert.ok(reinforcement);
  const expected = makeEnemySpawnSpec('wasp_swarmer', 1, reinforcement.pos, { factionId: 'faction_vael' });
  const wrongReach = makeEnemySpawnSpec('wasp_swarmer', 1, reinforcement.pos);
  assert.equal(reinforcement.factionId, 'faction_vael');
  assert.equal(reinforcement.data.ai.factionPresenceDoctrine.formation,
    expected.data.ai.factionPresenceDoctrine.formation);
  assert.equal(reinforcement.data.ai.factionPresenceDoctrine.combatDoctrineId,
    expected.data.ai.factionPresenceDoctrine.combatDoctrineId);
  assert.notEqual(reinforcement.data.ai.factionPresenceDoctrine.formation,
    wrongReach.data.ai.factionPresenceDoctrine.formation,
    'top-level faction patching would leave the Reach doctrine behind');

  const owner = sim.helpers.spawnBudget.ownerForEntity(reinforcements[0].id);
  assert.match(owner, /^sg06_fixture_wing_/);
  assert.equal(sim.helpers.spawnBudget.ownerForEntity(reinforcements[1].id), owner);
  const beforeLoss = sim.helpers.spawnBudget.current();
  reinforcements[0].alive = false;
  sim.step();
  assert.equal(sim.helpers.spawnBudget.current(), beforeLoss - 1,
    'one destroyed wingmate releases exactly one slot');
  assert.equal(sim.helpers.spawnBudget.ownerForEntity(reinforcements[1].id), owner,
    'the surviving wingmate keeps its own reservation');
  sim.dispose();
});

test('Iron Maw calls its authored Wasp screen once below half hull', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, aiEncounter] });
  const boss = sim.helpers.spawnEntity(makeEnemySpawnSpec('dreadnought_boss', 10, { x: 400, z: -200 }));
  boss.hull = boss.hullMax * 0.49;

  sim.step();

  const scheduled = sim.state.aiEncounter.owner.scheduled;
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].packageId, 'iron_maw_screen');
  assert.equal(scheduled[0].callerId, boss.id);
  assert.equal(boss.data.ai._calledReinforcements, true);
  assert.ok(scheduled[0].count >= 2 && scheduled[0].count <= 4);
  assert.equal(sim.state.aiEncounter.owner.pendingReinforcements.length, scheduled[0].count);

  sim.runTicks(90);
  const screen = sim.state.entityList.filter((entity) => (
    entity.alive && entity.data?.ai?.spawnContext === 'sg06_reinforcement'
      && entity.data?.encounter?.packageId === 'iron_maw_screen'
  ));
  assert.equal(screen.length, scheduled[0].count);
  assert.ok(screen.every((entity) => entity.data.lootTableId === 'wasp_swarmer'));
  assert.ok(screen.every((entity) => entity.factionId === 'faction_vael'));
  assert.ok(screen.every((entity) => entity.data.reinforcements == null),
    'screen ships cannot recursively call another wave');
  assert.ok(screen.every((entity) => Math.hypot(entity.pos.x - boss.pos.x, entity.pos.z - boss.pos.z) >= 180),
    'the wave arrives around Iron Maw rather than around the player');

  boss.hull = boss.hullMax * 0.2;
  sim.runTicks(120);
  assert.equal(sim.state.aiEncounter.owner.scheduled.length, 1,
    'later phase thresholds do not duplicate the authored one-shot wave');
  sim.dispose();
});
