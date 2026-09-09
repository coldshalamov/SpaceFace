import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { fnv1a } from '../src/save/checksum.js';
import { save } from '../src/save/saveSystem.js';
import { ZONE_CERES_THROUGHLINE } from '../src/data/authoredPlaces.js';
import { CERES_ACTIVITY_POCKETS } from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SHIPS } from '../src/data/ships.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { NPC_JOB_PHASE, routePosition } from '../src/systems/npcJobs.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const CERES = 'sector_ceres_belt';
const AMBUSH_ID = 'ceres:activity:throughline-ambush';
const AMBUSH_ZONE = 'zone_ceres_ambush';
const AMBUSH_PHASE_KEY = 'ceresActivityAmbushPhase';
const AMBUSH_RESTORE_KEY = 'ceresActivityAmbushRestore';
const THROUGHLINE_GLOBAL = sectorLocalToGlobalForSector(ZONE_CERES_THROUGHLINE.center, CERES);

function dynamicJobShip() {
  return {
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: -50, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 8,
    collides: true,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    mass: 20,
    flightClass: 'hauler',
    flightModel: { inertia: 40 },
    physicsBody: {
      schemaVersion: 1,
      radius: 8,
      mass: 20,
      inertiaY: 40,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: {
      worldRecordId: 'ceres:test:route-hull',
      ai: { passive: true, roe: 'hold_fire' },
      intent: null,
    },
  };
}

function routeSpec() {
  return {
    kind: 'hauler',
    sectorId: CERES,
    speed: 10,
    commissionS: 0.1,
    loadS: 0.1,
    departS: 0.1,
    approachS: 0.1,
    unloadS: 0.1,
    route: [
      { id: 'ceres:test:route:a', label: 'A', pos: { x: -50, z: 0 } },
      { id: 'ceres:test:route:b', label: 'B', pos: { x: 50, z: 0 } },
    ],
  };
}

function rangerFieldSailJobShip() {
  const ranger = SHIPS.find((ship) => ship.id === 'ship_ranger');
  assert.ok(ranger, 'the production Ranger hull remains authored');
  const propulsion = PROPULSION_PROFILES[ranger.driveId];
  assert.equal(propulsion && propulsion.id, 'drive_field_sail_m',
    'the focused actor uses the Ranger-authored field-sail family');
  const spec = makeShipEntitySpec(ranger.id, {
    team: 2,
    pos: { x: 0, z: 0 },
    ai: { passive: true, roe: 'hold_fire' },
  });
  assert.equal(spec.propulsion && spec.propulsion.id, ranger.driveId,
    'the unmodified production Ranger spec publishes its authored drive identity');
  assert.equal(spec.data.derived && spec.data.derived.propulsion.id, ranger.driveId,
    'the derived production profile reaches Flight V3 without a test-only override');
  spec.data.worldRecordId = 'ceres:test:field-sail-surveyor';
  spec.vel = { x: 0, z: 0 };
  spec.angVel = 0;
  spec.alive = true;
  spec.collides = true;
  spec.physicsBody = {
    schemaVersion: 1,
    radius: spec.radius,
    mass: spec.mass,
    inertiaY: spec.flightModel.inertia,
    dynamic: true,
    ccd: true,
    material: 'ship',
    revision: 0,
  };
  return spec;
}

function ceresSurveyorRouteSpec() {
  const pocket = CERES_ACTIVITY_POCKETS.find((candidate) => (
    candidate.actorSlots.some((actor) => actor.id === 'ceres_seam_surveyor')
  ));
  const slot = pocket && pocket.actorSlots.find((candidate) => candidate.id === 'ceres_seam_surveyor');
  assert.ok(pocket && slot, 'the released Ceres seam surveyor route remains authored');
  const route = slot.route.marks.map((mark) => ({
    id: mark.id,
    label: mark.id,
    pos: sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + mark.offset.x,
      z: pocket.activityAnchor.localPos.z + mark.offset.z,
    }, CERES),
  }));
  const distance = Math.hypot(
    route[1].pos.x - route[0].pos.x,
    route[1].pos.z - route[0].pos.z,
  );
  return {
    kind: slot.jobKind,
    sectorId: CERES,
    speed: distance / slot.route.durationS,
    route,
  };
}

function ceresActivityActorRouteSpec(actorSlotId) {
  const pocket = CERES_ACTIVITY_POCKETS.find((candidate) => (
    candidate.actorSlots.some((actor) => actor.id === actorSlotId)
  ));
  const slot = pocket && pocket.actorSlots.find((candidate) => candidate.id === actorSlotId);
  assert.ok(pocket && slot, `the released Ceres ${actorSlotId} route remains authored`);
  const route = slot.route.marks.map((mark) => ({
    id: mark.id,
    label: mark.id,
    pos: sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + mark.offset.x,
      z: pocket.activityAnchor.localPos.z + mark.offset.z,
    }, CERES),
    targetRef: mark.targetRef,
  }));
  const distance = Math.hypot(
    route[1].pos.x - route[0].pos.x,
    route[1].pos.z - route[0].pos.z,
  );
  return {
    kind: slot.jobKind,
    sectorId: CERES,
    routeId: slot.route.id,
    speed: distance / slot.route.durationS,
    route,
    actorSlotId: slot.id,
    worldRecordSlotId: slot.worldRecordSlotId,
  };
}

function ceresSeamMinerRouteSpec() {
  return ceresActivityActorRouteSpec('ceres_seam_miner');
}

function spawnCanonicalCeresJob(sim, actorSlotId, seed = 47) {
  const spec = ceresActivityActorRouteSpec(actorSlotId);
  const worldRecordId = stableRecordId(seed, CERES, RECORD_KIND.CONVOY, spec.worldRecordSlotId);
  const entitySpec = dynamicJobShip();
  entitySpec.homeSectorId = CERES;
  entitySpec.data.worldRecordId = worldRecordId;
  entitySpec.data.identityKey = spec.worldRecordSlotId;
  entitySpec.data.homeSectorId = CERES;
  entitySpec.data.sectorId = CERES;
  entitySpec.data.activityActorSlotId = actorSlotId;
  entitySpec.data.ceresActivityCast = true;
  entitySpec.data.ceresActivityJobOwned = true;
  entitySpec.pos = { ...spec.route[0].pos };
  const entity = sim.spawn(entitySpec);
  const jobId = sim.helpers.npcJobs.assign(entity, spec);
  assert.equal(jobId, `job:${worldRecordId}`);
  return { entity, entry: sim.state.npcJobs.byId[jobId], jobId, spec };
}

function spawnCeresTarget(sim, row, pos) {
  const data = { homeSectorId: CERES, sectorId: CERES };
  data[row.identityField] = row.identityValue;
  const target = sim.spawn({
    type: row.type,
    alive: true,
    collides: row.type !== 'fx',
    radius: row.radius,
    pos: { ...pos },
    data,
  });
  target.homeSectorId = CERES;
  return target;
}

function moraleShape(ai) {
  return Object.prototype.hasOwnProperty.call(ai, 'moraleImmune')
    ? { had: true, value: ai.moraleImmune }
    : { had: false, value: undefined };
}

function assertMoraleShape(entity, expected, message) {
  assert.deepEqual(moraleShape(entity.data.ai), expected, message);
}

function ambushShip(index) {
  const ai = {
    spawnContext: 'zone_hostile',
    archetype: 'reaver_pirate',
    motive: 'cargo_extortion',
    zoneId: AMBUSH_ZONE,
    squadId: AMBUSH_ZONE,
    passive: false,
    roe: 'weapons_free',
    activity: {
      kind: 'attack_run',
      reason: `world_zone_hostile:${index}`,
      anchor: { x: THROUGHLINE_GLOBAL.x + 145, z: THROUGHLINE_GLOBAL.z },
    },
  };
  if (index === 1) ai.moraleImmune = false;
  if (index === 2) ai.moraleImmune = true;
  return {
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: THROUGHLINE_GLOBAL.x + 145 + index * 4, z: THROUGHLINE_GLOBAL.z + index * 2 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 40,
    hull: 20,
    hullMax: 100,
    data: {
      worldRecordId: `wr_ceres_runtime_ambush_${index}`,
      intent: { fire: true, moveX: 0, moveZ: 0 },
      ai,
    },
  };
}

function bootAmbush() {
  const sim = createSimulation({ seed: 47, systems: [pirateDisengage, encounterDirector] });
  const { state, bus, helpers } = sim;
  const director = sim.registry.get('encounterDirector');
  const disengage = sim.registry.get('pirateDisengage');
  state.mode = 'flight';
  state.world.currentSectorId = CERES;
  const player = sim.spawn({
    type: 'ship', team: 0, alive: true,
    pos: { x: THROUGHLINE_GLOBAL.x + 220, z: THROUGHLINE_GLOBAL.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 100, hullMax: 100,
    data: { ai: {}, intent: {} },
  });
  state.playerId = player.id;
  const cohort = [0, 1, 2].map((index) => sim.spawn(ambushShip(index)));
  const originals = cohort.map((entity) => moraleShape(entity.data.ai));
  helpers.spawnBudget = {
    request() { return 0; },
    release() {},
    releaseSome() {},
  };
  const disengageEvents = [];
  bus.on('pirateDisengage:triggered', (payload) => disengageEvents.push(payload));
  bus.emit('sector:enter', { sectorId: CERES });
  return { sim, state, bus, director, disengage, player, cohort, originals, disengageEvents };
}

function crossAndFireAmbush(h) {
  h.player.pos.x = THROUGHLINE_GLOBAL.x - 220;
  h.director.update(1 / 60, h.state);
  const dir = h.state.encounterDirector;
  h.state.simTime = 31;
  dir.pressure.combat = 140;
  dir.lastMeaningfulAt = 0;
  dir.lastMajorAt = -1e9;
  dir.window = [];
  dir.cooldowns = {};
  h.director.update(1, h.state);
  const live = dir.live[AMBUSH_ID];
  assert.ok(live, 'the fixed-seed physical crossing reaches the authored live ambush');
  return live;
}

test('prepared Rapier job hull tracks kernel route speed/bounds, completes, and recommissions', async () => {
  const sim = createSimulation({
    seed: 47,
    systems: [flightV3, npcJobsRuntime, physics],
  });
  const physicsSystem = sim.registry.get('physics');
  try {
    const { state, helpers } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await physicsSystem.prepareBackend(state), true,
      'the focused route proof uses the real prepared Rapier authority');

    const hull = sim.spawn(dynamicJobShip());
    const spec = routeSpec();
    const jobId = helpers.npcJobs.assign(hull, spec);
    assert.equal(jobId, 'job:ceres:test:route-hull');

    let sawTransit = false;
    let maxSpeed = 0;
    let maxX = hull.pos.x;
    let minX = hull.pos.x;
    let maxAbsZ = 0;
    let maxRouteError = 0;
    for (let tick = 0; tick < 900; tick++) {
      const entry = state.npcJobs.byId[jobId];
      if (entry && (entry.job.phase === 'transit' || entry.job.phase === 'return')) {
        const expected = routePosition(entry.job);
        sawTransit = true;
        maxRouteError = Math.max(maxRouteError,
          Math.hypot(hull.pos.x - expected.x, hull.pos.z - expected.z));
      }
      sim.step(SIM_DT);
      maxSpeed = Math.max(maxSpeed, Math.hypot(hull.vel.x, hull.vel.z));
      maxX = Math.max(maxX, hull.pos.x);
      minX = Math.min(minX, hull.pos.x);
      maxAbsZ = Math.max(maxAbsZ, Math.abs(hull.pos.z));
    }

    assert.equal(sawTransit, true);
    assert.equal(state.npcJobs.byId[jobId], undefined, 'the one-shot kernel job reaches COMPLETE');
    assert.ok(maxSpeed <= spec.speed + 0.5,
      `physical speed remains bounded by the authored kernel speed (max ${maxSpeed})`);
    assert.ok(maxX <= spec.route[1].pos.x + hull.radius,
      `the hull stays inside the authored route pocket (max x ${maxX})`);
    assert.ok(minX >= spec.route[0].pos.x - hull.radius,
      `the hull does not escape behind the route pocket (min x ${minX})`);
    assert.ok(maxAbsZ <= hull.radius,
      `cross-track drift stays within one hull radius (max |z| ${maxAbsZ})`);
    assert.ok(hull.pos.x > spec.route[0].pos.x + hull.radius,
      `the physical hull makes finite forward progress before completion (final x ${hull.pos.x})`);
    assert.equal(Number.isFinite(maxRouteError), true,
      'the physical-to-kernel tracking observation stays finite without inventing an acceptance threshold');
    assert.equal(hull.data.intent && hull.data.intent.brake, false,
      'terminal release clears the route controller brake bit');

    const recommissioned = helpers.npcJobs.assign(hull, spec);
    assert.equal(recommissioned, jobId, 'the stable world-record identity recommissions deterministically');
    assert.ok(state.npcJobs.byId[jobId]);
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});

test('prepared Rapier Ranger field sail follows the authored Ceres survey leg without coasting out', async () => {
  const sim = createSimulation({
    seed: 47,
    systems: [flightV3, npcJobsRuntime, physics],
  });
  const physicsSystem = sim.registry.get('physics');
  try {
    const { state, helpers } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await physicsSystem.prepareBackend(state), true,
      'the field-sail proof uses the real prepared Rapier authority');

    const spec = ceresSurveyorRouteSpec();
    const hullSpec = rangerFieldSailJobShip();
    hullSpec.pos = { ...spec.route[0].pos };
    const hull = sim.spawn(hullSpec);
    const jobId = helpers.npcJobs.assign(hull, spec);
    const start = { ...hull.pos };
    const routeDx = spec.route[1].pos.x - start.x;
    const routeDz = spec.route[1].pos.z - start.z;
    const routeLength = Math.hypot(routeDx, routeDz);
    let maxSpeed = 0;
    let maxCrossTrack = 0;
    let reachedFirstStop = false;
    let resumedAfterStop = false;
    let firstStopPos = null;
    let maxStationaryDrift = 0;
    let stationaryEntrySpeed = Number.POSITIVE_INFINITY;
    let stationaryExitSpeed = Number.POSITIVE_INFINITY;
    let stationaryPhase = null;
    let stationaryPhaseStart = null;
    const stationaryDriftByPhase = {};
    let provedControllerReadOnly = false;
    for (let tick = 0; tick < 3600; tick++) {
      sim.step(SIM_DT);
      const speed = Math.hypot(hull.vel.x, hull.vel.z);
      maxSpeed = Math.max(maxSpeed, speed);
      const relX = hull.pos.x - start.x;
      const relZ = hull.pos.z - start.z;
      maxCrossTrack = Math.max(maxCrossTrack,
        Math.abs(relX * routeDz - relZ * routeDx) / routeLength);
      const entry = state.npcJobs.byId[jobId];
      if (!provedControllerReadOnly && entry && entry.job.phase === NPC_JOB_PHASE.TRANSIT) {
        const authoritativeBefore = {
          phase: entry.job.phase,
          progress: entry.job.progress,
          simTime: entry.job.simTime,
          routeIndex: entry.job.routeIndex,
          loopCount: entry.job.loopCount,
        };
        sim.registry.get('npcJobsRuntime')._drive(entry, hull);
        assert.deepEqual({
          phase: entry.job.phase,
          progress: entry.job.progress,
          simTime: entry.job.simTime,
          routeIndex: entry.job.routeIndex,
          loopCount: entry.job.loopCount,
        }, authoritativeBefore,
        'the field-sail actuator never takes kernel phase, progress, route, or clock ownership');
        provedControllerReadOnly = true;
      }
      if (!firstStopPos && entry
        && entry.job.routeIndex === 1
        && entry.job.phase !== NPC_JOB_PHASE.TRANSIT) {
        reachedFirstStop = true;
        firstStopPos = { ...hull.pos };
        stationaryEntrySpeed = speed;
      } else if (firstStopPos && entry && entry.job.routeIndex === 1) {
        if (entry.job.phase === NPC_JOB_PHASE.TRANSIT) {
          stationaryExitSpeed = speed;
          resumedAfterStop = true;
          break;
        }
        if (entry.job.phase !== stationaryPhase) {
          stationaryPhase = entry.job.phase;
          stationaryPhaseStart = { ...hull.pos };
          stationaryDriftByPhase[stationaryPhase] = 0;
        }
        stationaryDriftByPhase[stationaryPhase] = Math.max(
          stationaryDriftByPhase[stationaryPhase],
          Math.hypot(hull.pos.x - stationaryPhaseStart.x, hull.pos.z - stationaryPhaseStart.z),
        );
        maxStationaryDrift = Math.max(maxStationaryDrift,
          Math.hypot(hull.pos.x - firstStopPos.x, hull.pos.z - firstStopPos.z));
      }
      if (!entry) {
        break;
      }
    }

    const observedStop = firstStopPos || hull.pos;
    const forwardProgress = (
      (observedStop.x - start.x) * routeDx + (observedStop.z - start.z) * routeDz
    ) / routeLength;
    const profile = PROPULSION_PROFILES.drive_field_sail_m;
    assert.equal(reachedFirstStop, true, 'the kernel reaches the first authored survey stop');
    assert.equal(resumedAfterStop, true, 'the actual survey approach/work cadence reaches its next leg');
    assert.equal(provedControllerReadOnly, true);
    assert.ok(forwardProgress > hull.radius,
      `the field-sail hull makes visible progress along the survey leg (${forwardProgress} WU)`);
    assert.ok(maxSpeed <= spec.speed + profile.trimAccel * SIM_DT,
      `field-sail physical speed stays within the authored envelope (${maxSpeed} <= ${spec.speed})`);
    assert.ok(maxCrossTrack <= hull.radius,
      `field-sail cross-track drift stays within one Ranger radius (${maxCrossTrack})`);
    assert.ok(forwardProgress <= routeLength + hull.radius,
      `field-sail braking keeps the hull inside the authored leg (${forwardProgress} <= ${routeLength})`);
    assert.ok(maxStationaryDrift <= hull.radius,
      `residual field-sail coast stays inside one Ranger hull during stationary work (${maxStationaryDrift})`);
    assert.deepEqual(Object.keys(stationaryDriftByPhase).sort(), [
      NPC_JOB_PHASE.APPROACH,
      NPC_JOB_PHASE.WORK,
    ].sort(), 'the proof observes each actual stationary phase before the return leg');
    for (const [phase, drift] of Object.entries(stationaryDriftByPhase)) {
      assert.ok(drift <= hull.radius,
        `${phase} residual drift stays inside one authored Ranger hull (${drift})`);
    }
    assert.ok(stationaryExitSpeed < stationaryEntrySpeed,
      `stationary cadence reduces residual sail speed (${stationaryExitSpeed} < ${stationaryEntrySpeed})`);
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});

test('Ceres seam miner follows its unique live ore clast, then fails closed to the authored route mark', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state, helpers } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const spec = ceresSeamMinerRouteSpec();
    const minerSpec = dynamicJobShip();
    const worldRecordId = stableRecordId(
      47,
      CERES,
      RECORD_KIND.CONVOY,
      spec.worldRecordSlotId,
    );
    minerSpec.homeSectorId = CERES;
    minerSpec.data.worldRecordId = worldRecordId;
    minerSpec.data.identityKey = spec.worldRecordSlotId;
    minerSpec.data.homeSectorId = CERES;
    minerSpec.data.sectorId = CERES;
    minerSpec.data.activityActorSlotId = spec.actorSlotId;
    minerSpec.data.ceresActivityCast = true;
    minerSpec.data.ceresActivityJobOwned = true;
    minerSpec.pos = { ...spec.route[0].pos };
    const miner = sim.spawn(minerSpec);
    const jobId = helpers.npcJobs.assign(miner, spec);
    const entry = state.npcJobs.byId[jobId];
    entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    entry.job.routeIndex = 0;
    entry.job.progress = 0;

    const authored = spec.route[1].pos;
    const oreClast = sim.spawn({
      type: 'asteroid',
      alive: true,
      collides: true,
      radius: 46,
      pos: { x: authored.x + 900, z: authored.z + 700 },
      data: {
        activityObjectSlotId: 'ceres_seam_ore_clast',
        homeSectorId: CERES,
        sectorId: CERES,
      },
    });
    const runtime = sim.registry.get('npcJobsRuntime');
    const standoff = miner.radius + oreClast.radius;
    const liveAim = Math.atan2(oreClast.pos.z - miner.pos.z, oreClast.pos.x - miner.pos.x);
    const authoredAim = Math.atan2(authored.z - miner.pos.z, authored.x - miner.pos.x);
    assert.ok(Math.hypot(oreClast.pos.x - miner.pos.x, oreClast.pos.z - miner.pos.z) > standoff,
      'the injected canonical ore clast is far enough away to require a collision-safe approach');
    assert.ok(Math.abs(liveAim - authoredAim) > 0.2,
      'the live target is intentionally distinct from the authored route waypoint');

    miner.rot = liveAim;
    runtime._drive(entry, miner);
    assert.ok(Math.abs(miner.data.intent.aimAngle - liveAim) < 1e-9,
      'the real Ceres runtime drives toward the unique live ore clast rather than its authored waypoint');
    assert.equal(miner.data.intent.brake, false,
      'a distant live target produces a closing intent instead of braking at the stale authored mark');

    oreClast.alive = false;
    runtime._drive(entry, miner);
    assert.ok(Math.abs(miner.data.intent.aimAngle - authoredAim) < 1e-9,
      'a missing live target fails closed to the exact authored waypoint');
  } finally {
    sim.dispose();
  }
});

test('prepared Rapier seam miner physically closes to its live ore-clast standoff during work', async () => {
  const sim = createSimulation({ seed: 47, systems: [flightV3, npcJobsRuntime, physics] });
  const physicsSystem = sim.registry.get('physics');
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await physicsSystem.prepareBackend(state), true);
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    const authored = miner.spec.route[1].pos;
    miner.entity.pos = { ...authored };
    miner.entry.job.phase = NPC_JOB_PHASE.WORK;
    miner.entry.job.routeIndex = 1;
    miner.entry.job.progress = 0;
    const target = spawnCeresTarget(sim, {
      type: 'asteroid', radius: 46,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    }, { x: authored.x + 140, z: authored.z + 70 });
    miner.entity.rot = Math.atan2(target.pos.z - miner.entity.pos.z, target.pos.x - miner.entity.pos.x);
    const standoff = miner.entity.radius + target.radius + 12;
    const initialDistance = Math.hypot(
      target.pos.x - miner.entity.pos.x,
      target.pos.z - miner.entity.pos.z,
    );
    let minimumDistance = initialDistance;
    let finalDistance = initialDistance;
    for (let tick = 0; tick < 1200; tick++) {
      sim.step(SIM_DT);
      finalDistance = Math.hypot(
        target.pos.x - miner.entity.pos.x,
        target.pos.z - miner.entity.pos.z,
      );
      minimumDistance = Math.min(minimumDistance, finalDistance);
    }
    assert.ok(minimumDistance <= standoff + 12,
      `the real hull closes to the live work envelope (${minimumDistance} <= ${standoff + 12})`);
    assert.ok(initialDistance - minimumDistance >= 60,
      `the live target produces material physical closure (${initialDistance} -> ${minimumDistance})`);
    assert.ok(minimumDistance >= standoff - 3,
      `the collision-safe controller never penetrates the ore envelope (${minimumDistance} >= ${standoff - 3})`);
    assert.ok(finalDistance <= standoff + 18,
      `the prepared hull settles near the admitted work berth (${finalDistance} <= ${standoff + 18})`);
    assert.ok(Math.hypot(miner.entity.vel.x, miner.entity.vel.z) <= 4,
      `the prepared hull sheds closing speed at the berth (${Math.hypot(miner.entity.vel.x, miner.entity.vel.z)})`);
    assert.equal(miner.entry.job.routeIndex, 1,
      'physical closure never takes kernel route-index ownership');
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});

test('the five admitted Ceres target tuples bind once and drive without a steady entity scan', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  const originalEntityList = sim.state.entityList;
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const jobs = {
      ceres_refinery_hauler: spawnCanonicalCeresJob(sim, 'ceres_refinery_hauler'),
      ceres_seam_miner: spawnCanonicalCeresJob(sim, 'ceres_seam_miner'),
      ceres_cathedral_salvor: spawnCanonicalCeresJob(sim, 'ceres_cathedral_salvor'),
    };
    assert.deepEqual(Object.fromEntries(Object.entries(jobs).map(([slotId, job]) => [slotId, {
      routeId: job.spec.routeId,
      jobKind: job.spec.kind,
      worldRecordSlotId: job.spec.worldRecordSlotId,
    }])), {
      ceres_refinery_hauler: {
        routeId: 'ceres_refinery_freight_loop', jobKind: 'hauler',
        worldRecordSlotId: 'ceres:activity:ceres_refinery_hauler',
      },
      ceres_seam_miner: {
        routeId: 'ceres_seam_extraction_loop', jobKind: 'miner',
        worldRecordSlotId: 'ceres:activity:ceres_seam_miner',
      },
      ceres_cathedral_salvor: {
        routeId: 'ceres_cathedral_salvage_loop', jobKind: 'salvor',
        worldRecordSlotId: 'ceres:activity:ceres_cathedral_salvor',
      },
    }, 'the real-target actors pin exact route, kind, and seed-record input identities');
    const rows = [
      {
        actorSlotId: 'ceres_refinery_hauler', waypointIndex: 0, phase: NPC_JOB_PHASE.COMMISSION,
        targetRef: 'object:ceres_refinery_cargo_pod', type: 'fx', radius: 48,
        identityField: 'activityObjectSlotId', identityValue: 'ceres_refinery_cargo_pod',
        envelopeWU: 24,
      },
      {
        actorSlotId: 'ceres_refinery_hauler', waypointIndex: 1, phase: NPC_JOB_PHASE.TRANSIT,
        targetRef: 'dest:station_ceres', type: 'station', radius: 70,
        identityField: 'stationId', identityValue: 'station_ceres',
        envelopeWU: 90,
      },
      {
        actorSlotId: 'ceres_seam_miner', waypointIndex: 1, phase: NPC_JOB_PHASE.TRANSIT,
        targetRef: 'field:slot:ceres_seam_ore_clast', type: 'asteroid', radius: 42,
        identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
        envelopeWU: 62,
      },
      {
        actorSlotId: 'ceres_cathedral_salvor', waypointIndex: 0, phase: NPC_JOB_PHASE.COMMISSION,
        targetRef: 'object:ceres_cathedral_grave_shard', type: 'fx', radius: 26,
        identityField: 'activityObjectSlotId', identityValue: 'ceres_cathedral_grave_shard',
        envelopeWU: 32,
      },
      {
        actorSlotId: 'ceres_cathedral_salvor', waypointIndex: 1, phase: NPC_JOB_PHASE.TRANSIT,
        targetRef: 'world-site:world_site_wreck_cathedral', type: 'fx', radius: 96,
        identityField: 'worldRecordId', identityValue: 'world_site_wreck_cathedral/root',
        envelopeWU: 48,
      },
    ];
    const targets = rows.map((row, index) => {
      const job = jobs[row.actorSlotId];
      assert.equal(job.spec.route[row.waypointIndex].targetRef, row.targetRef,
        `${row.actorSlotId} keeps the literal admitted target authority`);
      return spawnCeresTarget(sim, row, {
        x: job.spec.route[row.waypointIndex].pos.x + 260 + index * 31,
        z: job.spec.route[row.waypointIndex].pos.z + 180 + index * 23,
      });
    });

    state.entityList = {
      [Symbol.iterator]() {
        throw new Error('steady Ceres target drive must not scan entityList');
      },
    };
    const runtime = sim.registry.get('npcJobsRuntime');
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const target = targets[index];
      const job = jobs[row.actorSlotId];
      job.entry.job.routeIndex = row.phase === NPC_JOB_PHASE.TRANSIT ? 0 : row.waypointIndex;
      job.entry.job.phase = row.phase;
      job.entry.job.progress = 0;
      job.entity.pos = { ...job.spec.route[0].pos };
      const saveBeforeDrive = runtime.serialize();
      const routeRefBeforeDrive = job.entry.job.route;
      const waypointRefsBeforeDrive = [...routeRefBeforeDrive];
      const actorPosRefBeforeDrive = job.entity.pos;
      const actorVelRefBeforeDrive = job.entity.vel;
      const targetPosRefBeforeDrive = target.pos;
      const actorPosBeforeDrive = [job.entity.pos.x, job.entity.pos.y, job.entity.pos.z];
      const actorVelBeforeDrive = [job.entity.vel.x, job.entity.vel.y, job.entity.vel.z];
      const targetPosBeforeDrive = [target.pos.x, target.pos.y, target.pos.z];
      const intentRefBeforeDrive = job.entity.data.intent;
      const simTimeBeforeDrive = state.simTime;
      const seedBeforeDrive = state.meta.seed;
      const rngBeforeDrive = typeof state.rng?.getState === 'function'
        ? state.rng.getState()
        : null;
      const expectedAim = Math.atan2(
        target.pos.z - job.entity.pos.z,
        target.pos.x - job.entity.pos.x,
      );
      job.entity.rot = expectedAim;
      runtime._drive(job.entry, job.entity);
      assert.ok(Math.abs(job.entity.data.intent.aimAngle - expectedAim) < 1e-9,
        `${row.targetRef} drives from the cached exact live target without scanning`);
      assert.equal(job.entity.data.intent.boost, false);
      assert.ok(job.entity.data.intent.moveZ > 0 && job.entity.data.intent.moveZ <= 0.65,
        `${row.targetRef} uses a bounded non-boost closing command`);
      assert.deepEqual(runtime.serialize(), saveBeforeDrive,
        `${row.targetRef} leaves the persisted kernel/runtime job state byte-shape unchanged`);
      assert.strictEqual(job.entry.job.route, routeRefBeforeDrive);
      assert.deepEqual(job.entry.job.route, waypointRefsBeforeDrive);
      assert.strictEqual(job.entity.pos, actorPosRefBeforeDrive);
      assert.strictEqual(job.entity.vel, actorVelRefBeforeDrive);
      assert.strictEqual(target.pos, targetPosRefBeforeDrive);
      assert.deepEqual([job.entity.pos.x, job.entity.pos.y, job.entity.pos.z], actorPosBeforeDrive);
      assert.deepEqual([job.entity.vel.x, job.entity.vel.y, job.entity.vel.z], actorVelBeforeDrive);
      assert.deepEqual([target.pos.x, target.pos.y, target.pos.z], targetPosBeforeDrive);
      if (intentRefBeforeDrive) assert.strictEqual(job.entity.data.intent, intentRefBeforeDrive);
      const initializedIntentRef = job.entity.data.intent;
      runtime._drive(job.entry, job.entity);
      assert.strictEqual(job.entity.data.intent, initializedIntentRef,
        `${row.targetRef} reuses the initialized intent object in the steady controller`);
      assert.equal(state.simTime, simTimeBeforeDrive);
      assert.equal(state.meta.seed, seedBeforeDrive);
      if (rngBeforeDrive != null) assert.deepEqual(state.rng.getState(), rngBeforeDrive,
        `${row.targetRef} consumes no gameplay RNG`);

      job.entity.pos = { x: target.pos.x - row.envelopeWU * 0.5, z: target.pos.z };
      job.entity.vel = { x: 0, z: 0 };
      job.entity.rot = Math.PI;
      runtime._drive(job.entry, job.entity);
      assert.ok(Math.abs(Math.abs(job.entity.data.intent.aimAngle) - Math.PI) < 1e-9,
        `${row.targetRef} drives outward when the hull starts inside its exact berth envelope`);
      assert.ok(job.entity.data.intent.moveZ > 0 && job.entity.data.intent.moveZ <= 0.65,
        `${row.targetRef} uses the same bounded throttle while clearing overlap`);
    }

    const miner = jobs.ceres_seam_miner;
    const ore = targets[2];
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    miner.entity.pos = { x: ore.pos.x - rows[2].envelopeWU - 80, z: ore.pos.z };
    miner.entity.vel = { x: 120, z: 0 };
    miner.entity.rot = 0;
    runtime._drive(miner.entry, miner.entity);
    assert.equal(miner.entity.data.intent.brake, true,
      'high inward speed brakes before the ore collision envelope even while position is outside');
    assert.equal(miner.entity.data.intent.moveZ, 0);
  } finally {
    sim.state.entityList = originalEntityList;
    sim.dispose();
  }
});

test('the production Ceres world and traffic cast bind all five admitted live relationships', () => {
  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites, npcJobsRuntime, traffic] });
  const originalEntityList = sim.state.entityList;
  try {
    const { state } = sim;
    state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship', team: 0, alive: true, collides: false, radius: 8, mass: 1,
      pos: sectorLocalToGlobalForSector({ x: 0, z: 0 }, CERES),
      vel: { x: 0, z: 0 }, data: {},
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(CERES, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    const runtime = sim.registry.get('npcJobsRuntime');
    const rows = [
      {
        slotId: 'ceres_refinery_hauler', routeIndex: 0, type: 'fx',
        identityField: 'activityObjectSlotId', identityValue: 'ceres_refinery_cargo_pod',
        targetRef: 'object:ceres_refinery_cargo_pod', phase: NPC_JOB_PHASE.LOAD,
        standoffKind: 'fixed', standoffWU: 24,
      },
      {
        slotId: 'ceres_refinery_hauler', routeIndex: 1, type: 'station',
        identityField: 'stationId', identityValue: 'station_ceres',
        targetRef: 'dest:station_ceres', phase: NPC_JOB_PHASE.UNLOAD,
        standoffKind: 'dock', standoffWU: 72,
      },
      {
        slotId: 'ceres_seam_miner', routeIndex: 1, type: 'asteroid',
        identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
        targetRef: 'field:slot:ceres_seam_ore_clast', phase: NPC_JOB_PHASE.WORK,
        standoffKind: 'collision', standoffWU: 30,
      },
      {
        slotId: 'ceres_cathedral_salvor', routeIndex: 0, type: 'fx',
        identityField: 'activityObjectSlotId', identityValue: 'ceres_cathedral_grave_shard',
        targetRef: 'object:ceres_cathedral_grave_shard', phase: NPC_JOB_PHASE.UNLOAD,
        standoffKind: 'fixed', standoffWU: 32,
      },
      {
        slotId: 'ceres_cathedral_salvor', routeIndex: 1, type: 'fx',
        identityField: 'worldRecordId', identityValue: 'world_site_wreck_cathedral/root',
        targetRef: 'world-site:world_site_wreck_cathedral', phase: NPC_JOB_PHASE.WORK,
        standoffKind: 'fixed', standoffWU: 48,
      },
    ];
    const live = [...state.entities.values()];
    const actors = new Map(live
      .filter((entity) => rows.some((row) => row.slotId === entity.data?.activityActorSlotId))
      .map((entity) => [entity.data.activityActorSlotId, entity]));
    const targets = rows.map((row) => live.filter((entity) => (
      entity.type === row.type
        && entity.data?.[row.identityField] === row.identityValue
        && entity.alive !== false
    )));
    assert.equal(actors.size, 3, 'the production traffic cast materializes all three exact job actors');
    assert.deepEqual(targets.map((matches) => matches.length), [1, 1, 1, 1, 1],
      'the production world materializes one live authority for every admitted target tuple');

    state.entityList = {
      [Symbol.iterator]() {
        throw new Error('production steady target drive must consume its lifecycle cache');
      },
    };
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const { slotId, routeIndex, phase } = row;
      const actor = actors.get(slotId);
      const entry = state.npcJobs.byId[actor.data.jobId];
      const target = targets[index][0];
      assert.ok(entry && entry.job, `${slotId} keeps its production npcJobs wrapper`);
      assert.equal(entry.job.route[routeIndex].targetRef, row.targetRef,
        `${slotId} keeps the exact admitted production target ref`);
      entry.job.phase = phase;
      entry.job.routeIndex = routeIndex;
      const actorRadius = Math.max(0, Number.isFinite(actor.radius) ? actor.radius : 0);
      const targetRadius = Math.max(0, Number.isFinite(target.radius) ? target.radius : 0);
      let standoff = row.standoffWU;
      if (row.standoffKind === 'collision') {
        standoff = Math.max(standoff, actorRadius + targetRadius + 12);
      } else if (row.standoffKind === 'dock') {
        standoff = Math.max(
          standoff,
          Number.isFinite(target.data?.dockRadius) ? target.data.dockRadius : 0,
          actorRadius + targetRadius + 12,
        );
      }
      const dx = target.pos.x - actor.pos.x;
      const dz = target.pos.z - actor.pos.z;
      const distance = Math.hypot(dx, dz);
      const gap = distance - standoff;
      const sign = gap >= 0 ? 1 : -1;
      const expectedAim = Math.atan2(sign * dz, sign * dx);
      actor.vel.x = 0;
      actor.vel.z = 0;
      actor.rot = expectedAim;
      runtime._drive(entry, actor);
      assert.ok(Math.abs(actor.data.intent.aimAngle - expectedAim) < 1e-9,
        `${slotId}:${row.targetRef} steers on the correct side of its production berth`);
      if (Math.abs(gap) > 6) {
        assert.ok(actor.data.intent.moveZ > 0 && actor.data.intent.moveZ <= 0.65,
          `${slotId}:${row.targetRef} applies bounded closing/clearing throttle`);
        assert.equal(actor.data.intent.brake, false,
          `${slotId}:${row.targetRef} does not brake while stationary outside its deadband`);
        const probeDistance = Math.hypot(
          target.pos.x - (actor.pos.x + Math.cos(actor.data.intent.aimAngle)),
          target.pos.z - (actor.pos.z + Math.sin(actor.data.intent.aimAngle)),
        );
        assert.ok(Math.abs(probeDistance - standoff) < Math.abs(gap),
          `${slotId}:${row.targetRef} points in the direction that reduces berth error`);
      }
    }
  } finally {
    sim.state.entityList = originalEntityList;
    sim.dispose();
  }
});

test('duplicate and same-id replacement target authority fail closed without a neutral prewrite', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    const authored = miner.spec.route[1].pos;
    const row = {
      type: 'asteroid', radius: 40,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    };
    const target = spawnCeresTarget(sim, row, { x: authored.x + 300, z: authored.z + 190 });
    const runtime = sim.registry.get('npcJobsRuntime');
    miner.entity.rot = Math.atan2(target.pos.z - miner.entity.pos.z, target.pos.x - miner.entity.pos.x);
    runtime._drive(miner.entry, miner.entity);
    const admittedAim = miner.entity.data.intent.aimAngle;
    const authoredAim = Math.atan2(
      authored.z - miner.spec.route[0].pos.z,
      authored.x - miner.spec.route[0].pos.x,
    );

    const canonicalTargetRef = miner.entry.job.route[1].targetRef;
    miner.entry.job.route[1].targetRef = 'field:slot:tampered_route_authority';
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'a changed canonical waypoint immediately falls through to the authored route controller');
    miner.entry.job.route[1].targetRef = canonicalTargetRef;
    miner.entity.rot = admittedAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'restoring equal waypoint text cannot revive invalidated object authority without a lifecycle seam');
    sim.bus.emit('sector:enter', { sectorId: CERES });
    miner.entity.rot = admittedAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - admittedAim) < 1e-9,
      'the bounded sector-enter seam can prove and reacquire the restored canonical route');

    const replacement = { ...target, pos: { x: target.pos.x + 80, z: target.pos.z + 40 } };
    state.entities.set(target.id, replacement);
    miner.entity.data.intent = {
      moveX: 0.75, moveZ: 0.25, boost: true, brake: false,
      fire: false, fireGroup: null, aimAngle: 1.234,
    };
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'same numeric target id with a replacement object cannot inherit cached authority');
    assert.notEqual(miner.entity.data.intent.aimAngle, admittedAim,
      'replacement fallback does not reuse the prior live-target aim');

    state.entities.set(target.id, target);
    const duplicate = spawnCeresTarget(sim, row, { x: target.pos.x - 60, z: target.pos.z + 70 });
    assert.ok(duplicate.id !== target.id);
    miner.entity.data.intent.aimAngle = 2.345;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'two live matching targets are ambiguous and fall back to the authored route');

    sim.helpers.removeEntity(duplicate.id);
    sim.step(SIM_DT);
    assert.equal(state.entities.has(duplicate.id), false,
      'core removes the duplicate before flushing its identity-free destroyed payload');
    miner.entity.rot = admittedAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - admittedAim) < 1e-9,
      'a target-loss lifecycle event rebinds the sole surviving stable target');

    const originalRefresh = runtime._refreshCeresRealTargetsForEntry;
    let unrelatedRefreshes = 0;
    runtime._refreshCeresRealTargetsForEntry = function countedRefresh(...args) {
      unrelatedRefreshes++;
      return originalRefresh.apply(this, args);
    };
    bus.emit('entity:destroyed', { id: 987654321, type: 'projectile' });
    runtime._refreshCeresRealTargetsForEntry = originalRefresh;
    assert.equal(unrelatedRefreshes, 0,
      'an id-only unrelated projectile destruction cannot trigger a real-target entity scan');
  } finally {
    sim.dispose();
  }
});

test('duplicate Ceres job actors fail assignment and rematerialization until exact authority is unique', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    const authored = miner.spec.route[1].pos;
    const target = spawnCeresTarget(sim, {
      type: 'asteroid', radius: 40,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    }, { x: authored.x + 310, z: authored.z + 205 });
    const runtime = sim.registry.get('npcJobsRuntime');
    const admittedAim = Math.atan2(
      target.pos.z - miner.entity.pos.z,
      target.pos.x - miner.entity.pos.x,
    );
    const authoredAim = Math.atan2(
      authored.z - miner.spec.route[0].pos.z,
      authored.x - miner.spec.route[0].pos.x,
    );

    const duplicateSpec = dynamicJobShip();
    duplicateSpec.homeSectorId = CERES;
    duplicateSpec.data.worldRecordId = miner.entry.worldRecordId;
    duplicateSpec.data.identityKey = miner.spec.worldRecordSlotId;
    duplicateSpec.data.homeSectorId = CERES;
    duplicateSpec.data.sectorId = CERES;
    duplicateSpec.data.activityActorSlotId = 'ceres_seam_miner';
    duplicateSpec.data.ceresActivityCast = true;
    duplicateSpec.data.ceresActivityJobOwned = true;
    duplicateSpec.pos = { x: miner.entity.pos.x + 20, z: miner.entity.pos.z + 20 };
    const duplicate = sim.spawn(duplicateSpec);
    assert.equal(sim.helpers.npcJobs.assign(duplicate, miner.spec), null,
      'a second live actor with the seed-derived world record cannot adopt the existing job');
    sim.bus.emit('sector:enter', { sectorId: CERES });
    assert.equal(runtime._findEntityByRecordId(miner.entry.worldRecordId), null,
      'the bounded enter/rematerialization scans reject and clear retained duplicate identity');

    const originalWriteIntent = runtime._writeIntent;
    let writes = 0;
    runtime._writeIntent = function countedWriteIntent(...args) {
      writes++;
      return originalWriteIntent.apply(this, args);
    };
    runtime._drive(miner.entry, miner.entity);
    runtime._writeIntent = originalWriteIntent;
    assert.equal(writes, 1, 'ambiguous actor authority falls through directly to one authored-route write');
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'the original actor cannot keep real-target authority while its durable identity is ambiguous');

    sim.helpers.removeEntity(duplicate.id);
    sim.step(SIM_DT);
    assert.equal(state.entities.has(duplicate.id), false,
      'the real core sweep deletes the actor before lifecycle listeners run');
    miner.entity.rot = admittedAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - admittedAim) < 1e-9,
      'the lifecycle seam rebinds the sole surviving exact actor and target objects');
  } finally {
    sim.dispose();
  }
});

test('a malformed same-record contender invalidates a canonical actor until real post-delete recovery', () => {
  let watchedDestroyId = null;
  let reusedEntity = null;
  const idReuseBeforeRuntime = {
    name: 'ceresRealTargetIdReuseProbe',
    init({ bus, helpers }) {
      bus.on('entity:destroyed', (payload) => {
        if (payload?.id !== watchedDestroyId || reusedEntity) return;
        reusedEntity = helpers.spawnEntity({
          type: 'projectile', alive: true, collides: false, radius: 1,
          pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
        });
      });
    },
  };
  const sim = createSimulation({
    seed: 47,
    systems: [idReuseBeforeRuntime, npcJobsRuntime],
    updateOrder: [],
  });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    const target = spawnCeresTarget(sim, {
      type: 'asteroid', radius: 40,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    }, {
      x: miner.spec.route[1].pos.x + 320,
      z: miner.spec.route[1].pos.z + 210,
    });
    const runtime = sim.registry.get('npcJobsRuntime');
    const liveAim = Math.atan2(
      target.pos.z - miner.entity.pos.z,
      target.pos.x - miner.entity.pos.x,
    );
    const authoredAim = Math.atan2(
      miner.spec.route[1].pos.z - miner.spec.route[0].pos.z,
      miner.spec.route[1].pos.x - miner.spec.route[0].pos.x,
    );
    miner.entity.rot = liveAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9,
      'the canonical actor begins with exact retained target authority');

    const malformedSpec = dynamicJobShip();
    malformedSpec.type = 'fx';
    malformedSpec.homeSectorId = CERES;
    malformedSpec.data = {
      worldRecordId: miner.entry.worldRecordId,
      identityKey: 'ceres:activity:malformed_duplicate',
      homeSectorId: CERES,
      sectorId: CERES,
    };
    malformedSpec.pos = { x: miner.entity.pos.x + 18, z: miner.entity.pos.z + 22 };
    const malformed = sim.spawn(malformedSpec);
    assert.equal(malformed.type, 'fx');
    assert.equal(Object.hasOwn(malformed.data, 'ceresActivityCast'), false,
      'the duplicate deliberately fails both actor type and cast-authority preflight');
    const originalRefresh = runtime._refreshCeresRealTargetsForEntry;
    let unrelatedRefreshes = 0;
    runtime._refreshCeresRealTargetsForEntry = function countedRefresh(...args) {
      unrelatedRefreshes++;
      return originalRefresh.apply(this, args);
    };
    sim.bus.emit('entity:destroyed', { id: 987654322, type: 'projectile' });
    sim.bus.emit('entity:destroyed', { id: malformed.id, type: malformed.type });
    runtime._refreshCeresRealTargetsForEntry = originalRefresh;
    assert.equal(unrelatedRefreshes, 0,
      'ambiguity ignores unrelated deaths and a fake event while the retained contender is still live');
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'spawn alone invalidates the original actor before any producer can call assign');

    watchedDestroyId = malformed.id;
    sim.helpers.removeEntity(malformed.id);
    sim.step(SIM_DT);
    assert.ok(reusedEntity);
    assert.equal(reusedEntity.id, malformed.id,
      'an earlier destruction listener reuses the core-freed numeric id before runtime observes it');
    assert.strictEqual(state.entities.get(malformed.id), reusedEntity,
      'the current map occupant is deliberately unrelated to the removed retained object');
    miner.entity.rot = liveAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9,
      'retained object identity recovers authority even when the numeric id already has a replacement');

    watchedDestroyId = null;
    let replacementDeathRefreshes = 0;
    runtime._refreshCeresRealTargetsForEntry = function countedReplacementRefresh(...args) {
      replacementDeathRefreshes++;
      return originalRefresh.apply(this, args);
    };
    sim.helpers.removeEntity(reusedEntity.id);
    sim.step(SIM_DT);
    runtime._refreshCeresRealTargetsForEntry = originalRefresh;
    assert.equal(replacementDeathRefreshes, 0,
      'the later death of the unrelated id replacement cannot reuse stale ambiguity authority');

    const spawnMalformedContender = (dx, dz) => sim.spawn({
      ...malformedSpec,
      pos: { x: miner.entity.pos.x + dx, z: miner.entity.pos.z + dz },
      vel: { x: 0, z: 0 },
      data: { ...malformedSpec.data },
    });
    const duplicateA = spawnMalformedContender(26, 18);
    const duplicateB = spawnMalformedContender(-22, 31);
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9);
    sim.helpers.removeEntity(duplicateA.id);
    sim.step(SIM_DT);
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'removing one of two malformed contenders remains ambiguous and keeps authored fallback');
    sim.helpers.removeEntity(duplicateB.id);
    sim.step(SIM_DT);
    miner.entity.rot = liveAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9,
      'the second exact contender removal re-counts and recovers the sole canonical actor');

    const releaseDuplicate = spawnMalformedContender(34, -19);
    assert.ok(releaseDuplicate);
    sim.bus.emit('sector:enter', { sectorId: CERES });
    const releaseBindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId
    ));
    assert.ok(releaseBindings.length > 0 && releaseBindings.every((binding) => (
      binding.entryRef === null && binding.actorAmbiguous === true
        && binding.actorAmbiguousRefs?.length === 2
        && binding.terminalEntryRef === miner.entry
        && binding.terminalJobRef === miner.entry.job
        && binding.terminalActorRef === miner.entity
        && binding.terminalActorDataRef === miner.entity.data
    )), 'same-sector ambiguity keeps only previously admitted terminal cleanup authority');
    sim.helpers.removeEntity(releaseDuplicate.id);
    sim.step(SIM_DT);
    assert.ok(releaseBindings.every((binding) => (
      binding.terminalEntryRef === miner.entry
        && binding.terminalJobRef === miner.entry.job
        && binding.terminalActorRef === miner.entity
        && binding.terminalActorDataRef === miner.entity.data
    )), 'the real removal seam revalidates the sole canonical actor terminal identity');
    miner.entity.data.intent.brake = true;
    assert.equal(runtime.release(miner.jobId), true);
    assert.equal(state.npcJobs.byId[miner.jobId], undefined);
    assert.equal(Object.hasOwn(miner.entity.data, 'jobId'), false);
    assert.equal(miner.entity.data.intent.brake, false);
    assert.ok(releaseBindings.every((binding) => (
      binding.entryRef === null && binding.actorRef === null
        && binding.actorAmbiguous === false && binding.actorAmbiguousRefs === null
        && binding.terminalEntryRef === null && binding.terminalActorRef === null
    )), 'release consumes both movement and terminal identity authority before bag deletion');
  } finally {
    sim.dispose();
  }
});

test('canonical actor death with immediate numeric-id reuse never mutates the replacement entity', () => {
  let watchedDestroyId = null;
  let replacement = null;
  let replacementJobId = null;
  const idReuseBeforeRuntime = {
    name: 'ceresActorDeathIdReuseProbe',
    init({ bus, helpers }) {
      bus.on('entity:destroyed', (payload) => {
        if (payload?.id !== watchedDestroyId || replacement) return;
        replacement = helpers.spawnEntity({
          type: 'projectile', alive: true, collides: false, radius: 1,
          pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
          data: {
            jobId: replacementJobId,
            intent: { brake: true },
            unrelatedReplacement: true,
          },
        });
      });
    },
  };
  const sim = createSimulation({
    seed: 47,
    systems: [idReuseBeforeRuntime, npcJobsRuntime],
    updateOrder: [],
  });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    watchedDestroyId = miner.entity.id;
    replacementJobId = miner.jobId;

    sim.helpers.removeEntity(miner.entity.id);
    sim.step(SIM_DT);

    assert.ok(replacement);
    assert.equal(replacement.id, miner.entity.id,
      'the earlier listener reuses the actor id before npcJobsRuntime handles destruction');
    assert.strictEqual(state.entities.get(replacement.id), replacement);
    assert.equal(state.npcJobs.byId[miner.jobId], undefined,
      'the dead canonical actor still releases its job terminally');
    assert.deepEqual(replacement.data, {
      jobId: miner.jobId,
      intent: { brake: true },
      unrelatedReplacement: true,
    }, 'release cannot clear brake or delete a marker on the unrelated same-id replacement');
  } finally {
    sim.dispose();
  }
});

test('same-sector enter preserves prior terminal cleanup authority through live actor ambiguity', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    const runtime = sim.registry.get('npcJobsRuntime');
    const bindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId
    ));
    assert.ok(bindings.length > 0 && bindings.every((binding) => (
      binding.terminalEntryRef === miner.entry
        && binding.terminalJobRef === miner.entry.job
        && binding.terminalActorRef === miner.entity
        && binding.terminalActorDataRef === miner.entity.data
    )), 'canonical admission establishes terminal identity before ambiguity');

    miner.entity.data.intent = { brake: true };
    const duplicateSpec = dynamicJobShip();
    duplicateSpec.type = 'fx';
    duplicateSpec.homeSectorId = CERES;
    duplicateSpec.data = {
      worldRecordId: miner.entity.data.worldRecordId,
      homeSectorId: CERES,
      sectorId: CERES,
      jobId: miner.jobId,
      intent: { brake: true },
      malformedLiveDuplicate: true,
    };
    const duplicate = sim.spawn(duplicateSpec);
    const duplicateDataRef = duplicate.data;
    const duplicateIntentRef = duplicate.data.intent;
    const duplicateBeforeRelease = JSON.stringify(duplicate);
    assert.ok(bindings.every((binding) => (
      binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
        && binding.actorRef === null && binding.actorDataRef === null
        && binding.targetRef === null && binding.targetDataRef === null
        && binding.actorAmbiguous === true && binding.actorAmbiguousRefs?.length === 2
        && binding.terminalEntryRef === miner.entry
        && binding.terminalJobRef === miner.entry.job
        && binding.terminalActorRef === miner.entity
        && binding.terminalActorDataRef === miner.entity.data
    )), 'ambiguity disables movement but preserves the already-admitted exact terminal identity');

    sim.bus.emit('sector:enter', { sectorId: CERES });
    const postEnterBindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId
    ));
    assert.ok(postEnterBindings.length > 0 && postEnterBindings.every((binding) => (
      binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
        && binding.actorRef === null && binding.actorDataRef === null
        && binding.targetRef === null && binding.targetDataRef === null
        && binding.actorAmbiguous === true && binding.actorAmbiguousRefs?.length === 2
        && binding.terminalEntryRef === miner.entry
        && binding.terminalJobRef === miner.entry.job
        && binding.terminalActorRef === miner.entity
        && binding.terminalActorDataRef === miner.entity.data
    )), 'same-sector lifecycle refresh keeps only the strict pre-admitted terminal identity');
    assert.equal(runtime._currentCeresRealTargetBinding(miner.entry, miner.entity), null,
      'persistent ambiguity remains movement-blocking after same-sector enter');

    assert.equal(runtime.release(miner.jobId), true);
    assert.equal(state.npcJobs.byId[miner.jobId], undefined);
    assert.equal(Object.hasOwn(miner.entity.data, 'jobId'), false,
      'the previously admitted canonical actor loses its terminal marker');
    assert.equal(miner.entity.data.intent.brake, false,
      'the previously admitted canonical actor has its terminal brake neutralized');
    assert.strictEqual(duplicate.data, duplicateDataRef);
    assert.strictEqual(duplicate.data.intent, duplicateIntentRef);
    assert.equal(JSON.stringify(duplicate), duplicateBeforeRelease,
      'the live malformed same-record duplicate remains byte-for-byte untouched');
    assert.ok(postEnterBindings.every((binding) => (
      binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
        && binding.routeWaypointRefs === null && binding.canonicalRoutePositions === null
        && binding.canonicalSpeed === null && binding.waypointRef === null
        && binding.actorRef === null && binding.actorDataRef === null
        && binding.terminalEntryRef === null && binding.terminalJobRef === null
        && binding.terminalActorRef === null && binding.terminalActorDataRef === null
        && binding.targetRef === null && binding.targetDataRef === null
        && binding.targetMatches === 0 && binding.ambiguous === false
        && binding.actorAmbiguous === false && binding.actorAmbiguousRefs === null
        && binding.targetAmbiguous === false
    )), 'release consumes all movement, ambiguity, target, and terminal authority');
  } finally {
    sim.dispose();
  }
});

test('ambiguous same-sector enter consumes stale entry and job wrapper terminal authority', () => {
  const rows = [
    { name: 'entry wrapper', replace: (entry) => ({ ...entry }) },
    { name: 'entry and job wrappers', replace: (entry) => ({ ...entry, job: { ...entry.job } }) },
  ];
  for (const row of rows) {
    const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
    try {
      const { state } = sim;
      state.mode = 'flight';
      state.world.currentSectorId = CERES;
      const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
      const runtime = sim.registry.get('npcJobsRuntime');
      const bindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
        binding.jobId === miner.jobId
      ));

      const duplicateSpec = dynamicJobShip();
      duplicateSpec.type = 'fx';
      duplicateSpec.homeSectorId = CERES;
      duplicateSpec.data = {
        worldRecordId: miner.entity.data.worldRecordId,
        homeSectorId: CERES,
        sectorId: CERES,
        malformedLiveDuplicate: true,
      };
      const duplicate = sim.spawn(duplicateSpec);
      assert.ok(bindings.length > 0 && bindings.every((binding) => (
        binding.actorAmbiguous === true && binding.actorAmbiguousRefs?.includes(miner.entity)
          && binding.terminalEntryRef === miner.entry
          && binding.terminalJobRef === miner.entry.job
      )), `${row.name}: ambiguity begins with exact pre-admitted terminal wrappers`);

      const replacement = row.replace(miner.entry);
      state.npcJobs.byId[miner.jobId] = replacement;
      sim.bus.emit('sector:enter', { sectorId: CERES });
      assert.ok(bindings.every((binding) => (
        binding.entryRef === null && binding.jobRef === null && binding.actorRef === null
          && binding.actorAmbiguous === true && binding.actorAmbiguousRefs?.includes(miner.entity)
          && binding.terminalEntryRef === null && binding.terminalJobRef === null
          && binding.terminalActorRef === null && binding.terminalActorDataRef === null
      )), `${row.name}: enter preserves fail-closed contenders but consumes stale terminal wrappers`);

      state.npcJobs.byId[miner.jobId] = miner.entry;
      assert.equal(runtime._currentCeresRealTargetBinding(miner.entry, miner.entity), null,
        `${row.name}: restoring equal wrappers cannot revive movement authority`);
      assert.ok(bindings.every((binding) => (
        binding.terminalEntryRef === null && binding.terminalActorRef === null
      )), `${row.name}: restoring equal wrappers cannot revive terminal authority`);

      miner.entity.data.intent = { brake: true };
      const actorBeforeRelease = JSON.stringify(miner.entity);
      const duplicateBeforeRelease = JSON.stringify(duplicate);
      assert.equal(runtime.release(miner.jobId), true);
      assert.equal(JSON.stringify(miner.entity), actorBeforeRelease,
        `${row.name}: release cannot clean an actor whose terminal wrapper authority was consumed`);
      assert.equal(JSON.stringify(duplicate), duplicateBeforeRelease,
        `${row.name}: release never touches the malformed contender`);
      assert.ok(bindings.every((binding) => (
        binding.actorAmbiguous === false && binding.actorAmbiguousRefs === null
          && binding.terminalEntryRef === null && binding.terminalActorRef === null
      )), `${row.name}: release consumes the remaining fail-closed ambiguity refs`);
    } finally {
      sim.dispose();
    }
  }
});

test('route-invalidated production actor release consumes exact terminal cleanup authority', () => {
  const sim = createSimulation({ seed: 47, systems: [world, asteroidSites, npcJobsRuntime, traffic] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship', team: 0, alive: true, collides: false, radius: 8, mass: 1,
      pos: sectorLocalToGlobalForSector({ x: 0, z: 0 }, CERES),
      vel: { x: 0, z: 0 }, data: {},
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(CERES, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    const actor = [...state.entities.values()].find((entity) => (
      entity.data?.activityActorSlotId === 'ceres_seam_miner'
    ));
    assert.ok(actor && typeof actor.data.jobId === 'string');
    const jobId = actor.data.jobId;
    const entry = state.npcJobs.byId[jobId];
    const runtime = sim.registry.get('npcJobsRuntime');
    entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    entry.job.routeIndex = 0;
    runtime._drive(entry, actor);

    entry.job.route[1].targetRef = 'field:slot:tampered_terminal_release';
    runtime._drive(entry, actor);
    const movementBindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === jobId
    ));
    assert.ok(movementBindings.length > 0 && movementBindings.every((binding) => (
      binding.entryRef === null && binding.actorRef === null && binding.actorDataRef === null
    )), 'normal drive invalidation clears the unsafe route/target movement cache');

    sim.bus.emit('sector:enter', { sectorId: CERES });
    const refreshedBindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === jobId
    ));
    assert.ok(refreshedBindings.length > 0 && refreshedBindings.every((binding) => (
      binding.entryRef === null && binding.actorRef === null && binding.actorDataRef === null
        && binding.terminalEntryRef === entry && binding.terminalJobRef === entry.job
        && binding.terminalActorRef === actor && binding.terminalActorDataRef === actor.data
    )), 'same-sector lifecycle refresh retains route-free terminal authority without restoring movement');

    actor.data.intent.brake = true;
    assert.equal(runtime.release(jobId), true);
    assert.equal(state.npcJobs.byId[jobId], undefined,
      'terminal release still deletes the invalidated job');
    assert.equal(Object.hasOwn(actor.data, 'jobId'), false,
      'the separately retained exact actor authority removes its terminal marker');
    assert.equal(actor.data.intent.brake, false,
      'the separately retained exact actor authority neutralizes its terminal brake');
    assert.ok(refreshedBindings.every((binding) => (
      binding.terminalEntryRef === null && binding.terminalJobRef === null
        && binding.terminalActorRef === null && binding.terminalActorDataRef === null
    )), 'release consumes the route-free authority admitted by the lifecycle refresh');
  } finally {
    sim.dispose();
  }
});

test('in-place semantic reclassification cannot inherit exact Ceres terminal cleanup', () => {
  const rows = [
    {
      name: 'world record id',
      mutate({ entity }) { entity.data.worldRecordId = 'world-record:foreign-in-place'; },
    },
    {
      name: 'identity key',
      mutate({ entity }) { entity.data.identityKey = 'ceres:activity:foreign-in-place'; },
    },
    {
      name: 'actor slot',
      mutate({ entity }) { entity.data.activityActorSlotId = 'ceres_refinery_hauler'; },
    },
    {
      name: 'cast ownership',
      mutate({ entity }) { entity.data.ceresActivityCast = false; },
    },
    {
      name: 'job ownership',
      mutate({ entity }) { entity.data.ceresActivityJobOwned = false; },
    },
    {
      name: 'sector authority',
      mutate({ entity }) { entity.data.sectorId = 'sector_foreign_in_place'; },
    },
    {
      name: 'entity type',
      mutate({ entity }) { entity.type = 'projectile'; },
    },
    {
      name: 'durable world record',
      mutate({ state, entity }) {
        state.world.records = {
          byId: {
            [entity.data.worldRecordId]: {
              recordId: entity.data.worldRecordId,
              kind: RECORD_KIND.CONVOY,
              sectorId: CERES,
              alive: false,
              outcome: 'destroyed',
            },
          },
        };
      },
    },
  ];

  for (const row of rows) {
    const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
    try {
      const { state } = sim;
      state.mode = 'flight';
      state.world.currentSectorId = CERES;
      const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
      const runtime = sim.registry.get('npcJobsRuntime');
      const bindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
        binding.jobId === miner.jobId
      ));
      const exactEntity = miner.entity;
      const exactData = miner.entity.data;
      assert.ok(bindings.length > 0 && bindings.every((binding) => (
        binding.terminalEntryRef === miner.entry
          && binding.terminalJobRef === miner.entry.job
          && binding.terminalActorRef === exactEntity
          && binding.terminalActorDataRef === exactData
      )), `${row.name}: precondition retains the canonical actor identity`);

      exactData.intent = { brake: true };
      row.mutate({ state, entity: exactEntity });
      assert.strictEqual(miner.entity, exactEntity);
      assert.strictEqual(miner.entity.data, exactData,
        `${row.name}: the regression mutates semantics in place without replacing retained refs`);
      assert.equal(runtime.release(miner.jobId), true);
      assert.equal(state.npcJobs.byId[miner.jobId], undefined,
        `${row.name}: terminal release still consumes the corrupt job`);
      assert.equal(exactData.jobId, miner.jobId,
        `${row.name}: a semantically foreign actor keeps its copied job marker`);
      assert.equal(exactData.intent.brake, true,
        `${row.name}: a semantically foreign actor keeps its unrelated brake state`);
      assert.ok(bindings.every((binding) => (
        binding.entryRef === null && binding.actorRef === null
          && binding.terminalEntryRef === null && binding.terminalJobRef === null
          && binding.terminalActorRef === null && binding.terminalActorDataRef === null
      )), `${row.name}: release consumes all retained authority after semantic loss`);
    } finally {
      sim.dispose();
    }
  }
});

test('route-invalid actor ambiguity removal re-admits terminal-only cleanup authority', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    const runtime = sim.registry.get('npcJobsRuntime');
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    runtime._drive(miner.entry, miner.entity);
    miner.entry.job.route[1].targetRef = 'field:slot:tampered_ambiguity_release';
    runtime._drive(miner.entry, miner.entity);
    miner.entity.data.ceresActivityCast = false;
    runtime._drive(miner.entry, miner.entity);
    miner.entity.data.ceresActivityCast = true;
    const invalidatedBindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId
    ));
    assert.ok(invalidatedBindings.length > 0 && invalidatedBindings.every((binding) => (
      binding.terminalEntryRef === null && binding.terminalActorRef === null
    )), 'semantic loss clears terminal identity and equal-value restoration cannot self-admit it');

    const duplicateSpec = dynamicJobShip();
    duplicateSpec.type = 'fx';
    duplicateSpec.homeSectorId = CERES;
    duplicateSpec.data = {
      worldRecordId: miner.entity.data.worldRecordId,
      homeSectorId: CERES,
      sectorId: CERES,
      malformedSameRecordContender: true,
    };
    const duplicate = sim.spawn(duplicateSpec);
    sim.bus.emit('sector:enter', { sectorId: CERES });
    const ambiguousBindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId
    ));
    assert.ok(ambiguousBindings.length > 0 && ambiguousBindings.every((binding) => (
      binding.actorAmbiguous === true && binding.actorAmbiguousRefs?.length === 2
        && binding.entryRef === null && binding.actorRef === null
        && binding.terminalEntryRef === null && binding.terminalActorRef === null
    )), 'bounded lifecycle refresh establishes ambiguity despite malformed contender semantics');

    sim.helpers.removeEntity(duplicate.id);
    sim.step(SIM_DT);
    assert.ok(ambiguousBindings.every((binding) => (
      binding.entryRef === null && binding.actorRef === null && binding.actorAmbiguous === false
        && binding.terminalEntryRef === miner.entry
        && binding.terminalJobRef === miner.entry.job
        && binding.terminalActorRef === miner.entity
        && binding.terminalActorDataRef === miner.entity.data
    )), 'real removal re-admits route-free terminal identity while movement stays disabled');

    miner.entity.data.intent.brake = true;
    assert.equal(runtime.release(miner.jobId), true);
    assert.equal(state.npcJobs.byId[miner.jobId], undefined);
    assert.equal(Object.hasOwn(miner.entity.data, 'jobId'), false);
    assert.equal(miner.entity.data.intent.brake, false);
    assert.ok(ambiguousBindings.every((binding) => (
      binding.terminalEntryRef === null && binding.terminalJobRef === null
        && binding.terminalActorRef === null && binding.terminalActorDataRef === null
    )), 'terminal release consumes the ambiguity-recovered route-free identity');
  } finally {
    sim.dispose();
  }
});

test('authoritative Ceres job release rejects a foreign-record same-id successor and consumes authority', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    const runtime = sim.registry.get('npcJobsRuntime');
    const bindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId
    ));
    assert.ok(bindings.length > 0 && bindings.every((binding) => (
      binding.terminalEntryRef === miner.entry
        && binding.terminalJobRef === miner.entry.job
        && binding.terminalActorRef === miner.entity
        && binding.terminalActorDataRef === miner.entity.data
    )), 'the canonical assignment retains exact terminal cleanup authority before corruption');

    const replacement = {
      ...miner.entity,
      data: {
        jobId: miner.jobId,
        intent: { brake: true },
        unrelatedSameIdSuccessor: true,
      },
    };
    const successorEntry = {
      ...miner.entry,
      job: { ...miner.entry.job },
      worldRecordId: 'world-record:foreign-release-successor',
      entityId: replacement.id,
    };
    state.entities.set(replacement.id, replacement);
    state.npcJobs.byId[miner.jobId] = successorEntry;

    assert.equal(runtime.release(miner.jobId), true);
    assert.equal(state.npcJobs.byId[miner.jobId], undefined,
      'the authoritative bag key remains terminal even when its entry metadata is foreign');
    assert.deepEqual(replacement.data, {
      jobId: miner.jobId,
      intent: { brake: true },
      unrelatedSameIdSuccessor: true,
    }, 'mutable entry metadata cannot transfer cleanup to an unrelated same-id replacement');
    assert.ok(bindings.every((binding) => (
      binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
        && binding.routeWaypointRefs === null && binding.canonicalRoutePositions === null
        && binding.canonicalSpeed === null && binding.waypointRef === null
        && binding.actorRef === null && binding.actorDataRef === null
        && binding.terminalEntryRef === null && binding.terminalJobRef === null
        && binding.terminalActorRef === null && binding.terminalActorDataRef === null
        && binding.targetRef === null && binding.targetDataRef === null
        && binding.targetMatches === 0 && binding.ambiguous === false
        && binding.actorAmbiguous === false && binding.actorAmbiguousRefs === null
        && binding.targetAmbiguous === false
    )), 'release consumes every transient binding field by immutable authoritative job id');
  } finally {
    sim.dispose();
  }
});

test('same-sector enter rejects a scalar-identical same-id actor clone without cleanup transfer', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    const target = spawnCeresTarget(sim, {
      type: 'asteroid', radius: 40,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    }, {
      x: miner.spec.route[1].pos.x + 330,
      z: miner.spec.route[1].pos.z + 205,
    });
    const runtime = sim.registry.get('npcJobsRuntime');
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    const liveAim = Math.atan2(
      target.pos.z - miner.entity.pos.z,
      target.pos.x - miner.entity.pos.x,
    );
    const authoredAim = Math.atan2(
      miner.spec.route[1].pos.z - miner.spec.route[0].pos.z,
      miner.spec.route[1].pos.x - miner.spec.route[0].pos.x,
    );
    miner.entity.rot = liveAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9);

    const originalActor = miner.entity;
    const clone = {
      ...originalActor,
      data: {
        ...originalActor.data,
        intent: { ...originalActor.data.intent },
      },
    };
    assert.notStrictEqual(clone, originalActor);
    assert.notStrictEqual(clone.data, originalActor.data);
    assert.equal(clone.id, originalActor.id);
    state.entities.set(clone.id, clone);
    state.entityList = state.entityList.map((candidate) => (
      candidate === originalActor ? clone : candidate
    ));

    sim.bus.emit('sector:enter', { sectorId: CERES });
    const bindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId
    ));
    assert.ok(bindings.length > 0 && bindings.every((binding) => (
      binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
        && binding.actorRef === null && binding.actorDataRef === null
        && binding.targetRef === null && binding.targetDataRef === null
        && binding.terminalEntryRef === null && binding.terminalJobRef === null
        && binding.terminalActorRef === null && binding.terminalActorDataRef === null
    )), 'materialized enter cannot admit a scalar-identical replacement without retained identity');

    let writes = 0;
    const originalWriteIntent = runtime._writeIntent;
    runtime._writeIntent = function countedCloneFallback(...args) {
      writes++;
      return originalWriteIntent.apply(this, args);
    };
    runtime._drive(miner.entry, clone);
    runtime._writeIntent = originalWriteIntent;
    assert.equal(writes, 1, 'replacement rejection falls through without a prewrite');
    assert.ok(Math.abs(clone.data.intent.aimAngle - authoredAim) < 1e-9,
      'the scalar-identical clone receives only the ordinary authored fallback');

    clone.data.intent.brake = true;
    const cloneDataRef = clone.data;
    const cloneIntentRef = clone.data.intent;
    const cloneBeforeRelease = JSON.stringify(clone);
    assert.equal(runtime.release(miner.jobId), true);
    assert.equal(state.npcJobs.byId[miner.jobId], undefined);
    assert.strictEqual(clone.data, cloneDataRef);
    assert.strictEqual(clone.data.intent, cloneIntentRef);
    assert.equal(JSON.stringify(clone), cloneBeforeRelease,
      'terminal release leaves the unadmitted same-id clone byte-for-byte untouched');
    assert.ok(bindings.every((binding) => (
      binding.entryRef === null && binding.actorRef === null
        && binding.terminalEntryRef === null && binding.terminalActorRef === null
        && binding.actorAmbiguousRefs === null && binding.targetRef === null
    )), 'release consumes the job bag and every transient authority ref');
  } finally {
    sim.dispose();
  }
});

test('observed entry and job wrapper replacements invalidate authority until explicit reassignment', () => {
  const rows = [
    { name: 'entry wrapper', replace: (entry) => ({ ...entry }) },
    { name: 'entry and job wrappers', replace: (entry) => ({ ...entry, job: { ...entry.job } }) },
  ];
  for (const row of rows) {
    const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
    try {
      const { state } = sim;
      state.mode = 'flight';
      state.world.currentSectorId = CERES;
      const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
      const target = spawnCeresTarget(sim, {
        type: 'asteroid', radius: 40,
        identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
      }, {
        x: miner.spec.route[1].pos.x + 340,
        z: miner.spec.route[1].pos.z + 215,
      });
      const runtime = sim.registry.get('npcJobsRuntime');
      miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
      miner.entry.job.routeIndex = 0;
      const liveAim = Math.atan2(
        target.pos.z - miner.entity.pos.z,
        target.pos.x - miner.entity.pos.x,
      );
      const authoredAim = Math.atan2(
        miner.spec.route[1].pos.z - miner.spec.route[0].pos.z,
        miner.spec.route[1].pos.x - miner.spec.route[0].pos.x,
      );
      miner.entity.rot = liveAim;
      runtime._drive(miner.entry, miner.entity);
      assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9);

      const originalEntry = miner.entry;
      const replacement = row.replace(originalEntry);
      state.npcJobs.byId[miner.jobId] = replacement;
      let writes = 0;
      const originalWriteIntent = runtime._writeIntent;
      runtime._writeIntent = function countedReplacementFallback(...args) {
        writes++;
        return originalWriteIntent.apply(this, args);
      };
      runtime._drive(replacement, miner.entity);
      runtime._writeIntent = originalWriteIntent;
      assert.equal(writes, 1, `${row.name}: replacement observation performs one fallback write`);
      const bindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
        binding.jobId === miner.jobId
      ));
      assert.ok(bindings.length > 0 && bindings.every((binding) => (
        binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
          && binding.actorRef === null && binding.actorDataRef === null
          && binding.terminalEntryRef === null && binding.terminalJobRef === null
          && binding.terminalActorRef === null && binding.terminalActorDataRef === null
      )), `${row.name}: immutable job-id invalidation clears movement and terminal authority`);

      state.npcJobs.byId[miner.jobId] = originalEntry;
      runtime._drive(originalEntry, miner.entity);
      assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
        `${row.name}: equal-value restoration remains authored fallback without a seam`);
      assert.equal(runtime.assign(miner.entity, miner.spec), miner.jobId,
        `${row.name}: exact producer reassignment is the bounded re-admission seam`);
      miner.entity.rot = liveAim;
      runtime._drive(originalEntry, miner.entity);
      assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9,
        `${row.name}: explicit reassignment restores live-target movement`);
    } finally {
      sim.dispose();
    }
  }
});

test('route and waypoint invalidation clears movement before null applicability can early-return', () => {
  const rows = [
    {
      name: 'empty route',
      mutate(job) { job.route = []; },
      restore(job, originalRoute, originalIndex) { job.route = originalRoute; job.routeIndex = originalIndex; },
    },
    {
      name: 'out-of-range route index',
      mutate(job) { job.routeIndex = 99; },
      restore(job, originalRoute, originalIndex) { job.route = originalRoute; job.routeIndex = originalIndex; },
    },
    {
      name: 'route array wrapper',
      mutate(job) { job.route = [...job.route]; },
      restore(job, originalRoute, originalIndex) { job.route = originalRoute; job.routeIndex = originalIndex; },
    },
  ];
  for (const row of rows) {
    const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
    try {
      const { state } = sim;
      state.mode = 'flight';
      state.world.currentSectorId = CERES;
      const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
      const target = spawnCeresTarget(sim, {
        type: 'asteroid', radius: 40,
        identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
      }, {
        x: miner.spec.route[1].pos.x + 350,
        z: miner.spec.route[1].pos.z + 225,
      });
      const runtime = sim.registry.get('npcJobsRuntime');
      const job = miner.entry.job;
      job.phase = NPC_JOB_PHASE.TRANSIT;
      job.routeIndex = 0;
      const originalRoute = job.route;
      const originalIndex = job.routeIndex;
      const liveAim = Math.atan2(
        target.pos.z - miner.entity.pos.z,
        target.pos.x - miner.entity.pos.x,
      );
      const authoredAim = Math.atan2(
        miner.spec.route[1].pos.z - miner.spec.route[0].pos.z,
        miner.spec.route[1].pos.x - miner.spec.route[0].pos.x,
      );
      miner.entity.rot = liveAim;
      runtime._drive(miner.entry, miner.entity);
      assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9);

      row.mutate(job);
      let writes = 0;
      const originalWriteIntent = runtime._writeIntent;
      runtime._writeIntent = function countedMalformedRouteFallback(...args) {
        writes++;
        return originalWriteIntent.apply(this, args);
      };
      runtime._drive(miner.entry, miner.entity);
      runtime._writeIntent = originalWriteIntent;
      assert.equal(writes, 1, `${row.name}: malformed route performs one fallback write`);
      const bindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
        binding.jobId === miner.jobId
      ));
      assert.ok(bindings.length > 0 && bindings.every((binding) => (
        binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
          && binding.actorRef === null && binding.actorDataRef === null
          && binding.terminalEntryRef === miner.entry
          && binding.terminalJobRef === miner.entry.job
          && binding.terminalActorRef === miner.entity
          && binding.terminalActorDataRef === miner.entity.data
      )), `${row.name}: route-only invalidation clears movement but preserves strict terminal identity`);

      row.restore(job, originalRoute, originalIndex);
      runtime._drive(miner.entry, miner.entity);
      assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
        `${row.name}: restoration stays on authored fallback until lifecycle revalidation`);
      sim.bus.emit('sector:enter', { sectorId: CERES });
      miner.entity.rot = liveAim;
      runtime._drive(miner.entry, miner.entity);
      assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9,
        `${row.name}: same-sector bounded revalidation restores live-target movement`);
    } finally {
      sim.dispose();
    }
  }
});

test('canonical actor preflight rejects malformed identity and retained-wrapper replacement without mutation', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const spec = ceresActivityActorRouteSpec('ceres_seam_miner');
    const worldRecordId = stableRecordId(47, CERES, RECORD_KIND.CONVOY, spec.worldRecordSlotId);
    const malformedSpec = dynamicJobShip();
    malformedSpec.homeSectorId = CERES;
    Object.assign(malformedSpec.data, {
      worldRecordId,
      identityKey: 'ceres:activity:not-the-miner',
      activityActorSlotId: 'ceres_seam_miner',
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      homeSectorId: CERES,
      sectorId: CERES,
    });
    const malformed = sim.spawn(malformedSpec);
    const beforeMalformed = {
      jobs: Object.keys(state.npcJobs.byId),
      jobIdOwned: Object.hasOwn(malformed.data, 'jobId'),
      jobId: malformed.data.jobId,
    };
    assert.equal(sim.helpers.npcJobs.assign(malformed, spec), null);
    assert.deepEqual({
      jobs: Object.keys(state.npcJobs.byId),
      jobIdOwned: Object.hasOwn(malformed.data, 'jobId'),
      jobId: malformed.data.jobId,
    }, beforeMalformed, 'malformed unique seed-derived identity is rejected before any bag or marker write');

    sim.helpers.removeEntity(malformed.id);
    sim.step(SIM_DT);
    const canonical = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    const runtime = sim.registry.get('npcJobsRuntime');
    const originalEntry = canonical.entry;
    const originalJob = originalEntry.job;
    const originalData = canonical.entity.data;
    const originalRoute = originalJob.route;

    const replacementEntry = { ...originalEntry };
    state.npcJobs.byId[canonical.jobId] = replacementEntry;
    assert.equal(runtime.assign(canonical.entity, canonical.spec), null,
      'a same-id entry wrapper cannot become valid merely because the bag points at it');
    assert.strictEqual(state.npcJobs.byId[canonical.jobId], replacementEntry);
    assert.strictEqual(replacementEntry.job, originalJob);
    state.npcJobs.byId[canonical.jobId] = originalEntry;

    originalEntry.job = { ...originalJob };
    assert.equal(runtime.assign(canonical.entity, canonical.spec), null,
      'a same-id job wrapper cannot replace the admitted kernel object');
    assert.strictEqual(originalEntry.job.route, originalRoute);
    originalEntry.job = originalJob;

    canonical.entity.data = { ...originalData };
    assert.equal(runtime.assign(canonical.entity, canonical.spec), null,
      'a same-id actor data wrapper cannot replace retained cast authority');
    assert.strictEqual(canonical.entity.data.jobId, canonical.jobId);
    canonical.entity.data = originalData;
  } finally {
    sim.dispose();
  }
});

test('Ceres sector exit virtualizes jobs but cleans only the retained exact actor identity', () => {
  const rows = [
    {
      name: 'same-id scalar actor clone',
      expectCleanup: false,
      select(state, miner) {
        const original = miner.entity;
        const clone = {
          ...original,
          data: {
            ...original.data,
            intent: { ...original.data.intent },
          },
        };
        assert.notStrictEqual(clone, original);
        assert.notStrictEqual(clone.data, original.data);
        state.entities.set(clone.id, clone);
        state.entityList = state.entityList.map((candidate) => candidate === original ? clone : candidate);
        return clone;
      },
    },
    {
      name: 'same retained object reclassified in place',
      expectCleanup: false,
      select(_state, miner) {
        miner.entity.data.ceresActivityCast = false;
        return miner.entity;
      },
    },
    {
      name: 'unchanged canonical actor',
      expectCleanup: true,
      select(_state, miner) { return miner.entity; },
    },
  ];

  for (const row of rows) {
    const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
    try {
      const { state, bus } = sim;
      state.mode = 'flight';
      state.world.currentSectorId = CERES;
      const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
      const runtime = sim.registry.get('npcJobsRuntime');
      miner.entity.data.intent = { ...(miner.entity.data.intent || {}), brake: true };
      const actor = row.select(state, miner);
      const actorDataRef = actor.data;
      const actorIntentRef = actor.data.intent;
      const actorBeforeExit = JSON.stringify(actor);

      bus.emit('sector:exit', { sectorId: CERES, continuous: true, noTeleport: true });

      assert.equal(miner.entry.entityId, null, `${row.name}: exit drops the live numeric link`);
      assert.equal(miner.entry.threatId, null, `${row.name}: exit drops transient threat authority`);
      assert.equal(miner.entry.job.materialized, false, `${row.name}: kernel job is virtualized`);
      assert.strictEqual(actor.data, actorDataRef, `${row.name}: exit never swaps the actor data wrapper`);
      assert.strictEqual(actor.data.intent, actorIntentRef,
        `${row.name}: exit never swaps the actor intent wrapper`);
      if (row.expectCleanup) {
        assert.equal(Object.hasOwn(actor.data, 'jobId'), false,
          `${row.name}: exact retained actor loses the runtime marker`);
        assert.equal(actor.data.intent.brake, false,
          `${row.name}: exact retained actor has route braking neutralized`);
      } else {
        assert.equal(JSON.stringify(actor), actorBeforeExit,
          `${row.name}: unadmitted or semantically foreign actor remains byte-for-byte untouched`);
      }
      const bindings = runtime._ensureCeresRealTargetAuthority().bindings;
      assert.ok(bindings.every((binding) => (
        binding.entryRef === null && binding.jobRef === null && binding.routeRef === null
          && binding.actorRef === null && binding.actorDataRef === null
          && binding.terminalEntryRef === null && binding.terminalJobRef === null
          && binding.terminalActorRef === null && binding.terminalActorDataRef === null
          && binding.targetRef === null && binding.actorAmbiguousRefs === null
      )), `${row.name}: Ceres exit consumes all transient real-target authority`);
    } finally {
      sim.dispose();
    }
  }
});

test('virtual exact-Ceres relink and adoption reject a foreign live job marker without mutation', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    Object.assign(miner.entry.job, {
      phase: NPC_JOB_PHASE.TRANSIT,
      routeIndex: 0,
      progress: 0.375,
      sequence: 19,
      simTime: 41.25,
    });
    miner.entry.lastAdvanceSimT = 37.5;
    bus.emit('sector:exit', { sectorId: CERES });
    assert.equal(miner.entry.entityId, null);
    assert.equal(miner.entry.job.materialized, false);
    miner.entity.data.jobId = 'job:foreign-live-owner';
    const before = {
      phase: miner.entry.job.phase,
      progress: miner.entry.job.progress,
      sequence: miner.entry.job.sequence,
      simTime: miner.entry.job.simTime,
      lastAdvanceSimT: miner.entry.lastAdvanceSimT,
      entityId: miner.entry.entityId,
      marker: miner.entity.data.jobId,
      materialized: miner.entry.job.materialized,
    };
    const runtime = sim.registry.get('npcJobsRuntime');
    assert.equal(runtime._tryRelink(miner.entry, 99), false,
      'the direct virtual relink rejects a foreign live marker');
    assert.equal(sim.helpers.npcJobs.assign(miner.entity, miner.spec), null,
      'the producer adoption seam rejects the same foreign live marker');
    assert.deepEqual({
      phase: miner.entry.job.phase,
      progress: miner.entry.job.progress,
      sequence: miner.entry.job.sequence,
      simTime: miner.entry.job.simTime,
      lastAdvanceSimT: miner.entry.lastAdvanceSimT,
      entityId: miner.entry.entityId,
      marker: miner.entity.data.jobId,
      materialized: miner.entry.job.materialized,
    }, before, 'rejection precedes catch-up, timestamping, materialization, linking, and marker writes');
  } finally {
    sim.dispose();
  }
});

test('Continue-style restore reacquires changed numeric actor and target ids through stable authority', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const original = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    const targetRow = {
      type: 'asteroid', radius: 44,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    };
    const originalTarget = spawnCeresTarget(sim, targetRow, {
      x: original.spec.route[1].pos.x + 240,
      z: original.spec.route[1].pos.z + 160,
    });
    const runtime = sim.registry.get('npcJobsRuntime');
    const saved = runtime.serialize();
    runtime.deserialize(saved);

    state.entities.delete(original.entity.id);
    state.entities.delete(originalTarget.id);
    state.entityList = state.entityList.filter((candidate) => (
      candidate !== original.entity && candidate !== originalTarget
    ));

    const restoredSpec = dynamicJobShip();
    restoredSpec.homeSectorId = CERES;
    restoredSpec.data.worldRecordId = original.entry.worldRecordId;
    restoredSpec.data.identityKey = original.spec.worldRecordSlotId;
    restoredSpec.data.homeSectorId = CERES;
    restoredSpec.data.sectorId = CERES;
    restoredSpec.data.activityActorSlotId = 'ceres_seam_miner';
    restoredSpec.data.ceresActivityCast = true;
    restoredSpec.data.ceresActivityJobOwned = true;
    restoredSpec.pos = { ...original.spec.route[0].pos };
    const restoredActor = sim.spawn(restoredSpec);
    const restoredTarget = spawnCeresTarget(sim, targetRow, {
      x: original.spec.route[1].pos.x + 310,
      z: original.spec.route[1].pos.z + 205,
    });
    assert.notEqual(restoredActor.id, original.entity.id);
    assert.notEqual(restoredTarget.id, originalTarget.id);

    bus.emit('save:loaded', { slot: 'ceres-real-target-reacquire' });
    const restoredEntry = state.npcJobs.byId[original.jobId];
    assert.equal(restoredEntry.entityId, restoredActor.id,
      'restored job relinks to the new actor id through its stable world record');
    restoredEntry.job.phase = NPC_JOB_PHASE.TRANSIT;
    restoredEntry.job.routeIndex = 0;
    const expectedAim = Math.atan2(
      restoredTarget.pos.z - restoredActor.pos.z,
      restoredTarget.pos.x - restoredActor.pos.x,
    );
    restoredActor.rot = expectedAim;
    runtime._drive(restoredEntry, restoredActor);
    assert.ok(Math.abs(restoredActor.data.intent.aimAngle - expectedAim) < 1e-9,
      'restored movement consumes only the newly rebound target object');
  } finally {
    sim.dispose();
  }
});

test('real legacy Continue adopts miner refs before strict relink and resumes live target motion', () => {
  const sim = createSimulation({
    seed: 47,
    systems: [world, asteroidSites, npcJobsRuntime, traffic, save],
  });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship', team: 0, alive: true, collides: false, radius: 8, mass: 1,
      pos: sectorLocalToGlobalForSector({ x: 0, z: 0 }, CERES),
      vel: { x: 0, z: 0 }, data: {},
    });
    state.playerId = player.id;
    sim.registry.get('world').enterSector(CERES, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    const minerActor = [...state.entities.values()].find((entity) => (
      entity.data?.activityActorSlotId === 'ceres_seam_miner'
    ));
    assert.ok(minerActor && typeof minerActor.data.jobId === 'string');
    const minerJobId = minerActor.data.jobId;
    const saveSystem = sim.registry.get('save');
    const envelope = saveSystem.serialize('ceres-real-target-legacy-continue');
    const saved = envelope.data.npcJobs.byId[minerJobId];
    assert.ok(saved && Array.isArray(saved.job.route));
    saved.job.route = saved.job.route.map((waypoint) => {
      const legacy = { ...waypoint, pos: { ...waypoint.pos } };
      delete legacy.targetRef;
      return legacy;
    });
    assert.equal(saved.job.route.some((waypoint) => Object.hasOwn(waypoint, 'targetRef')), false);
    let restoring = 0;
    let loaded = 0;
    const saveErrors = [];
    bus.on('save:restoring', () => { restoring++; });
    bus.on('save:loaded', () => { loaded++; });
    bus.on('save:error', (payload) => { saveErrors.push(payload?.reason); });
    assert.equal(saveSystem.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      'ceres-real-target-legacy-continue-stale',
    ), false, 'the real loader rejects the targetRef-stripped envelope before checksum repair');
    assert.deepEqual({ restoring, loaded, saveErrors }, {
      restoring: 0,
      loaded: 0,
      saveErrors: ['checksum'],
    }, 'stale-checksum rejection is side-effect-free and never reaches the restore lifecycle');

    envelope.checksum = fnv1a(JSON.stringify(envelope.data));
    assert.equal(saveSystem.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      'ceres-real-target-legacy-continue',
    ), true);
    assert.deepEqual({ restoring, loaded }, { restoring: 1, loaded: 1 },
      'the proof crosses the real checksum-valid Continue lifecycle');

    const restoredEntry = state.npcJobs.byId[minerJobId];
    const canonical = ceresSeamMinerRouteSpec();
    assert.deepEqual(restoredEntry.job.route, canonical.route,
      'traffic adopts both exact stable target refs before runtime relinks');
    assert.equal(restoredEntry.job.materialized, true);
    assert.ok(restoredEntry.entityId != null);
    const restoredActor = state.entities.get(restoredEntry.entityId);
    const liveOre = [...state.entities.values()].find((entity) => (
      entity.type === 'asteroid'
        && entity.data?.activityObjectSlotId === 'ceres_seam_ore_clast'
        && entity.alive !== false
    ));
    assert.ok(restoredActor && liveOre);
    assert.equal(restoredActor.data.jobId, minerJobId);
    restoredEntry.job.phase = NPC_JOB_PHASE.TRANSIT;
    restoredEntry.job.routeIndex = 0;
    restoredActor.pos = { x: liveOre.pos.x - 200, z: liveOre.pos.z };
    restoredActor.vel = { x: 0, z: 0 };
    const liveAim = Math.atan2(
      liveOre.pos.z - restoredActor.pos.z,
      liveOre.pos.x - restoredActor.pos.x,
    );
    const authoredWaypoint = restoredEntry.job.route[1].pos;
    const authoredAim = Math.atan2(
      authoredWaypoint.z - restoredActor.pos.z,
      authoredWaypoint.x - restoredActor.pos.x,
    );
    const aimSeparation = Math.abs(Math.atan2(
      Math.sin(liveAim - authoredAim),
      Math.cos(liveAim - authoredAim),
    ));
    assert.ok(aimSeparation > 0.25,
      'the fixture makes live-target aim causally distinct from authored-waypoint fallback');
    restoredActor.rot = liveAim;
    sim.registry.get('npcJobsRuntime')._drive(restoredEntry, restoredActor);
    assert.ok(Math.abs(restoredActor.data.intent.aimAngle - liveAim) < 1e-9,
      'the restored controller aims at the current live ore object');
    assert.ok(restoredActor.data.intent.moveZ > 0 && restoredActor.data.intent.moveZ <= 0.65);
    assert.equal(restoredActor.data.intent.brake, false);
  } finally {
    sim.dispose();
  }
});

test('unsupported, wrong-kind, and foreign target refs retain the authored route controller', () => {
  const sim = createSimulation({ seed: 47, systems: [npcJobsRuntime] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = CERES;
    const runtime = sim.registry.get('npcJobsRuntime');

    const surveyor = spawnCanonicalCeresJob(sim, 'ceres_seam_surveyor');
    surveyor.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    surveyor.entry.job.routeIndex = 0;
    const surveyTarget = surveyor.spec.route[1].pos;
    spawnCeresTarget(sim, {
      type: 'fx', radius: 20,
      identityField: 'activityObjectSlotId', identityValue: 'scan-mark-b',
    }, { x: surveyTarget.x + 400, z: surveyTarget.z + 300 });
    const surveyAuthoredAim = Math.atan2(
      surveyTarget.z - surveyor.spec.route[0].pos.z,
      surveyTarget.x - surveyor.spec.route[0].pos.x,
    );
    runtime._drive(surveyor.entry, surveyor.entity);
    assert.ok(Math.abs(surveyor.entity.data.intent.aimAngle - surveyAuthoredAim) < 1e-9,
      'activity:* remains outside the admitted real-target language');

    const miner = spawnCanonicalCeresJob(sim, 'ceres_seam_miner');
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    const minerTarget = miner.spec.route[1].pos;
    spawnCeresTarget(sim, {
      type: 'fx', radius: 40,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    }, { x: minerTarget.x + 500, z: minerTarget.z + 350 });
    const foreign = spawnCeresTarget(sim, {
      type: 'asteroid', radius: 40,
      identityField: 'activityObjectSlotId', identityValue: 'ceres_seam_ore_clast',
    }, { x: minerTarget.x + 600, z: minerTarget.z + 420 });
    foreign.homeSectorId = 'sector_helios_prime';
    foreign.data.homeSectorId = 'sector_helios_prime';
    foreign.data.sectorId = 'sector_helios_prime';
    // The spawn event observed the Ceres tags; rebuild at the bounded enter seam after mutation so
    // the test exercises the authoritative current tags rather than event ordering.
    sim.bus.emit('sector:enter', { sectorId: CERES });
    const minerAuthoredAim = Math.atan2(
      minerTarget.z - miner.spec.route[0].pos.z,
      minerTarget.x - miner.spec.route[0].pos.x,
    );
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - minerAuthoredAim) < 1e-9,
      'wrong entity kind and foreign sector authority both fail closed');
  } finally {
    sim.dispose();
  }
});

test('route braking is transient across stationary, flee, control, and release ownership', () => {
  const actor = dynamicJobShip();
  actor.id = 41;
  actor.data.jobId = 'job:ceres:test:brake';
  actor.data.intent = {
    moveX: 0, moveZ: 0, boost: false, brake: true,
    fire: false, fireGroup: null, aimAngle: 0,
  };
  const threat = { id: 9, alive: true, pos: { x: 10, z: 0 } };
  const entry = {
    job: { phase: NPC_JOB_PHASE.HOLD, corrupt: false },
    entityId: actor.id,
    worldRecordId: 'ceres:test:brake',
    threatId: null,
  };
  const runtime = Object.create(npcJobsRuntime);
  runtime.state = {
    simTime: 12,
    entities: new Map([[actor.id, actor], [threat.id, threat]]),
    npcJobs: { byId: { 'job:ceres:test:brake': entry } },
  };

  runtime._drive(entry, actor);
  assert.equal(actor.data.intent.brake, false, 'stationary kernel phases clear route braking');

  actor.data.intent.brake = true;
  entry.job.phase = NPC_JOB_PHASE.FLEE;
  entry.threatId = threat.id;
  runtime._drive(entry, actor);
  assert.equal(actor.data.intent.brake, false, 'the active-hostile flee reflex is never brake-latched');
  assert.equal(actor.data.intent.boost, true, 'active-hostile flee remains the existing boosted reflex');

  actor.data.intent.brake = true;
  entry.job.phase = NPC_JOB_PHASE.TRANSIT;
  assert.equal(runtime.claimControl('job:ceres:test:brake', { claimId: 'test:controller' }).granted, true);
  assert.equal(actor.data.intent.brake, false, 'control handoff does not inherit route braking');

  actor.data.intent.brake = true;
  assert.equal(runtime.release('job:ceres:test:brake'), true);
  assert.equal(actor.data.intent.brake, false, 'terminal job release clears route braking');
});

test('live Ceres ambush resists pirate disengage and resolve restores morale ownership exactly', () => {
  const h = bootAmbush();
  try {
    for (let index = 0; index < h.cohort.length; index++) {
      assertMoraleShape(h.cohort[index], h.originals[index],
        'merely parking the pre-trigger cohort does not claim morale ownership');
    }

    const live = crossAndFireAmbush(h);
    h.player.pos.x = THROUGHLINE_GLOBAL.x + 145;
    h.player.pos.z = THROUGHLINE_GLOBAL.z;
    h.state.simTime = live.data.springAt + 0.01;
    h.director.update(1, h.state);
    assert.equal(live.phase, 'conflict');

    h.disengage.update(1 / 60, h.state);
    h.state.simTime += 1.1;
    h.disengage.update(1 / 60, h.state);
    assert.equal(h.disengageEvents.length, 0,
      'the live authored conflict cannot be rewritten into a generic pirate retreat');
    assert.equal(live.phase, 'conflict');
    for (const entity of h.cohort) {
      assert.equal(entity.data.ai.moraleImmune, true,
        'adoption grants the existing transient morale exemption to every live member');
      assert.equal(entity.data.ai.pirateDisengaged, undefined);
    }

    h.director.resolve(live, 'cleared', { speak: false });
    for (let index = 0; index < h.cohort.length; index++) {
      assertMoraleShape(h.cohort[index], h.originals[index],
        'normal resolution restores absent, false, and true own-property states');
    }
  } finally {
    h.sim.dispose();
  }
});

test('Continue resume reapplies live immunity and hard exit restores without replacement', () => {
  const h = bootAmbush();
  try {
    crossAndFireAmbush(h);
    const retired = h.cohort[2];
    retired.alive = false;
    const entityCount = h.state.entityList.length;

    h.bus.emit('save:restoring', { slot: 'ceres-runtime-lifecycle' });
    h.bus.emit('save:loaded', { slot: 'ceres-runtime-lifecycle' });
    const resumed = h.state.encounterDirector.live[AMBUSH_ID];
    assert.ok(resumed, 'revealed one-shot truth resumes through the production Continue boundary');
    assert.deepEqual(resumed.ids, h.cohort.slice(0, 2).map((entity) => entity.id),
      'the terminal durable member is not adopted or replaced');
    assert.equal(h.state.entityList.length, entityCount);
    for (const entity of h.cohort.slice(0, 2)) {
      assert.equal(entity.data.ai.moraleImmune, true,
        'Continue re-adoption reapplies live encounter immunity');
    }

    h.bus.emit('sector:exit', { sectorId: CERES, continuous: false, noTeleport: false });
    assert.equal(h.state.encounterDirector.live[AMBUSH_ID], undefined);
    for (let index = 0; index < 2; index++) {
      assertMoraleShape(h.cohort[index], h.originals[index],
        'hard-exit abort restores the original own-property state');
    }
    assert.equal(retired.data.despawnAt, undefined, 'terminal world actors are never encounter-despawned');
  } finally {
    h.sim.dispose();
  }
});

test('legacy Continue snapshots preserve morale own-property truth through adoption and exit', () => {
  const parked = bootAmbush();
  try {
    for (const entity of parked.cohort) {
      delete entity.data.ai[AMBUSH_RESTORE_KEY].moraleImmune;
    }
    parked.bus.emit('sector:exit', { sectorId: CERES, continuous: false, noTeleport: false });
    for (let index = 0; index < parked.cohort.length; index++) {
      assertMoraleShape(parked.cohort[index], parked.originals[index],
        'a legacy parked snapshot never deletes morale state it did not own');
    }
  } finally {
    parked.sim.dispose();
  }

  const resumed = bootAmbush();
  try {
    for (const entity of resumed.cohort) {
      delete entity.data.ai[AMBUSH_RESTORE_KEY].moraleImmune;
      entity.data.ai[AMBUSH_PHASE_KEY] = 'offer';
    }
    resumed.state.encounterDirector.stats.ceresActivityAmbush = { phase: 'revealed' };
    resumed.bus.emit('save:restoring', { slot: 'legacy-morale-snapshot' });
    resumed.bus.emit('save:loaded', { slot: 'legacy-morale-snapshot' });
    assert.ok(resumed.state.encounterDirector.live[AMBUSH_ID]);
    for (const entity of resumed.cohort) {
      assert.equal(entity.data.ai.moraleImmune, true,
        'legacy Continue adoption claims the live morale exemption');
    }
    resumed.bus.emit('sector:exit', { sectorId: CERES, continuous: false, noTeleport: false });
    for (let index = 0; index < resumed.cohort.length; index++) {
      assertMoraleShape(resumed.cohort[index], resumed.originals[index],
        'legacy Continue adoption snapshots then restores absent, false, and true exactly');
    }
  } finally {
    resumed.sim.dispose();
  }
});

test('explicit ambush abort restores morale ownership without encounter despawn', () => {
  const h = bootAmbush();
  try {
    const live = crossAndFireAmbush(h);
    h.director.abort(live, 'focused_test');
    for (let index = 0; index < h.cohort.length; index++) {
      assertMoraleShape(h.cohort[index], h.originals[index],
        'direct abort restores absent, false, and true own-property states');
      assert.equal(h.cohort[index].data.despawnAt, undefined);
    }
  } finally {
    h.sim.dispose();
  }
});
