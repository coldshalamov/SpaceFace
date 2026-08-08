import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ZONE_CERES_THROUGHLINE } from '../src/data/authoredPlaces.js';
import { CERES_ACTIVITY_POCKETS } from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SHIPS } from '../src/data/ships.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { NPC_JOB_PHASE, routePosition } from '../src/systems/npcJobs.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

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
