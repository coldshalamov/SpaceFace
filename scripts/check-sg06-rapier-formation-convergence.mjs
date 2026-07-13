import assert from 'node:assert/strict';

import { AI_CONTRACT_VERSION, wrapAngle } from '../src/ai/contracts.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const DT = 1 / 60;
const TICKS = 900;
const FORMATION_BOUND = 170;
const SEED = 0x4706f0;

const first = await runScenario();
const second = await runScenario();
const flybyFirst = await runHostileFlybyScenario();
const flybySecond = await runHostileFlybyScenario();
const capitalApproach = await runHostileFlybyScenario({ targetRadius: 34, targetMass: 800 });
const explicitRamApproach = await runHostileFlybyScenario({
  targetRadius: 34,
  targetMass: 800,
  interceptorMass: 240,
  ramPlate: true,
});

assert.deepEqual(second.summary, first.summary, 'SG-06 formation convergence harness should replay deterministically');
assert.equal(first.summary.allDynamic, true, 'all tactical ships should run as SG-02 dynamic bodies');
assert.equal(first.summary.acceptedManeuvers > 0, true, 'aiPorts should accept SG-06 maneuver requests');
assert.equal(first.summary.flushedManeuvers > 0, true, 'aiPorts should flush SG-06 maneuvers into SG-02');
assert(first.summary.maxStationaryTicks < 180, 'commanded moving ships should not remain stationary past the watchdog threshold');
for (const follower of first.summary.followers) {
  assert(follower.startError > FORMATION_BOUND, `follower ${follower.id} should start outside formation bound`);
  assert(follower.bestError < FORMATION_BOUND, `follower ${follower.id} should enter formation bound`);
  assert(follower.finalError < follower.startError * 0.55,
    `follower ${follower.id} should materially converge toward its slot: start=${follower.startError} final=${follower.finalError} best=${follower.bestError}`);
}
assert.deepEqual(flybySecond, flybyFirst, 'hostile flyby trajectory should replay deterministically through live ports');
assert(flybyFirst.phases.includes('extend'), `flyby must visibly overshoot: ${flybyFirst.phases.join(' -> ')}`);
assert(flybyFirst.phases.includes('reform'), `flyby must reacquire formation after overshoot: ${flybyFirst.phases.join(' -> ')}`);
assert(flybyFirst.bestReformHeadingError < 0.45,
  `reform thruster heading must reacquire the live wing slot, error=${flybyFirst.bestReformHeadingError}`);
assert(flybyFirst.minTargetSeparation >= 26,
  `flyby must clear both hulls instead of colliding, separation=${flybyFirst.minTargetSeparation}`);
assert(flybyFirst.acceptedManeuvers > 0 && flybyFirst.flushedManeuvers > 0,
  'hostile trajectory must pass through actual aiPorts maneuver authority');
assert(capitalApproach.minTargetSeparation >= 130,
  `ordinary interceptor must leave capital-mass approach room, separation=${capitalApproach.minTargetSeparation}`);
assert.equal(capitalApproach.ramAuthorized, false, 'ordinary interceptor never receives ram authority');
assert.equal(explicitRamApproach.ramAuthorized, true, 'heavy ram-plate actor receives explicit ram authority');
assert.equal(explicitRamApproach.sanctuaryRamAuthorized, false,
  'station-jurisdiction withdrawal revokes ram authority before planning');
assert(explicitRamApproach.phases.includes('commit'),
  `heavy ram-plate actor retains its committed approach: ${explicitRamApproach.phases.join(' -> ')}`);
assert(explicitRamApproach.phases.indexOf('engine_flare') < explicitRamApproach.phases.indexOf('commit'),
  'ram authorization remains downstream of the readable engine-flare telegraph');

console.log('SG-06 Rapier formation + hostile flyby trajectory checks OK', JSON.stringify({
  flyby: flybyFirst,
  capitalApproach,
  explicitRamApproach,
}));

async function runScenario() {
  const harness = makeHarness();
  const { state, helpers } = harness;
  const leader = helpers.spawnEntity(makeShipSpec({
    x: 0,
    z: 0,
    ai: { squadId: 'sg06_formation_wing', doctrine: 'official', preferredRole: 'leader', formation: 'line' },
  }));
  const left = helpers.spawnEntity(makeShipSpec({
    x: -520,
    z: 260,
    ai: { squadId: 'sg06_formation_wing', doctrine: 'official', preferredRole: 'screen', formation: 'line' },
  }));
  const right = helpers.spawnEntity(makeShipSpec({
    x: 540,
    z: -260,
    ai: { squadId: 'sg06_formation_wing', doctrine: 'official', preferredRole: 'support', formation: 'line', capabilities: ['ranged'] },
  }));
  state.playerId = -1;
  harness.rebuildSpatialHash();
  await ensureSg02Ready(harness);

  const tacticalAI = createTacticalAISystem({
    seed: state.meta.seed,
    config: {
      squad: {
        formationBound: FORMATION_BOUND,
        formationSpacing: 72,
        minTacticTicks: 60,
      },
      maneuver: {
        stationaryLimitTicks: 180,
        formationRejoinFraction: 0.8,
        arrivalRadius: 18,
      },
    },
    actionPortFactory: () => noopActions(),
  });
  tacticalAI.init(harness.ctx);

  const followerIds = [left.id, right.id];
  const stats = new Map(followerIds.map((id) => [id, {
    id,
    startError: null,
    finalError: null,
    bestError: Infinity,
    maxStationaryTicks: 0,
    movingStationaryTicks: 0,
  }]));

  for (let tick = 0; tick < TICKS; tick++) {
    harness.core.preStep(DT, state);
    harness.rebuildSpatialHash();
    tacticalAI.update(DT, state);
    const result = tacticalAI.inspect().lastResult;
    harness.flight.update(DT, state);
    harness.aiPorts.update(DT, state);
    harness.physics.update(DT, state);
    recordFormationStats(state, result, tacticalAI, stats);
    harness.core.lifetimeSweep(DT, state);
  }

  const inspect = harness.aiPorts.inspect();
  const allShips = [leader, left, right];
  const summary = {
    followers: [...stats.values()].map((item) => ({
      id: item.id,
      startError: round3(item.startError),
      finalError: round3(item.finalError),
      bestError: round3(item.bestError),
      maxStationaryTicks: item.maxStationaryTicks,
    })).sort((a, b) => a.id - b.id),
    acceptedManeuvers: inspect.acceptedManeuvers,
    flushedManeuvers: inspect.flushedManeuvers,
    droppedManeuvers: inspect.droppedManeuvers,
    maxStationaryTicks: Math.max(...[...stats.values()].map((item) => item.maxStationaryTicks)),
    allDynamic: allShips.every((ship) => {
      const telemetry = readPhysicsTelemetry(ship);
      return telemetry && telemetry.mode === 'rapier-dynamic' && telemetry.dynamic === true;
    }),
  };

  disposeHarness(harness);
  return { summary };
}

async function runHostileFlybyScenario(options = {}) {
  const harness = makeHarness();
  const { state, helpers } = harness;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  const player = helpers.spawnEntity(makeTargetSpec({
    x: 420,
    z: 0,
    radius: options.targetRadius,
    mass: options.targetMass,
  }));
  const interceptor = helpers.spawnEntity(makeShipSpec({
    x: -80,
    z: -42,
    mass: options.interceptorMass,
    ai: {
      squadId: 'sg06_hostile_flyby',
      doctrine: 'scavenger',
      preferredRole: 'striker',
      formation: 'wedge',
      combatDoctrineId: 'interceptor_flyby',
      spawnContext: 'encounter',
      motive: 'assigned_interdiction',
      engagementTrigger: 'authorized_hostile_spawn',
      zoneId: 'zone_ceres_ambush',
      approachTelegraph: 'engine_flare',
      noFireResponseWindowS: 1,
      forcePlayerTarget: true,
      roe: 'weapons_free',
      activity: {
        kind: 'attack_run',
        reason: 'live_port_flyby',
        anchor: { x: -80, z: -42 },
        leashRadius: 3600,
        preferredRange: 150,
        startedTick: 0,
        targetId: player.id,
      },
    },
  }));
  interceptor.data.combat = { targetId: player.id };
  if (options.ramPlate) interceptor.data.intent = { ramPlate: true };
  state.playerId = player.id;
  harness.rebuildSpatialHash();
  await ensureSg02Ready(harness);
  const initialSensor = helpers.aiSensors.frameFor(interceptor.id, state.tick | 0);
  const ramAuthorized = initialSensor.self.ramAuthorized === true;
  interceptor.data.ai.sanctuaryWithdrawn = true;
  const sanctuarySensor = helpers.aiSensors.frameFor(interceptor.id, state.tick | 0);
  const sanctuaryRamAuthorized = sanctuarySensor.self.ramAuthorized === true;
  interceptor.data.ai.sanctuaryWithdrawn = false;

  const tacticalAI = createTacticalAISystem({
    seed: state.meta.seed,
    config: {
      squad: { formationBound: FORMATION_BOUND, formationSpacing: 72, minTacticTicks: 60 },
      maneuver: { stationaryLimitTicks: 180, formationRejoinFraction: 0.8, arrivalRadius: 18 },
    },
    actionPortFactory: () => noopActions(),
  });
  tacticalAI.init(harness.ctx);

  const phases = [];
  let minTargetSeparation = Infinity;
  let bestReformHeadingError = Infinity;
  for (let tick = 0; tick < 1500; tick++) {
    harness.core.preStep(DT, state);
    harness.rebuildSpatialHash();
    tacticalAI.update(DT, state);
    const result = tacticalAI.inspect().lastResult;
    const decision = result && result.decisions && result.decisions.find((entry) => entry.entityId === interceptor.id);
    const doctrine = decision && decision.combatDoctrine;
    if (doctrine && phases[phases.length - 1] !== doctrine.phase) phases.push(doctrine.phase);
    if (doctrine && doctrine.phase === 'reform' && decision.maneuver && decision.directive && decision.directive.formation) {
      const slot = decision.directive.formation.slot;
      const expected = Math.atan2(slot.z - interceptor.pos.z, slot.x - interceptor.pos.x);
      bestReformHeadingError = Math.min(bestReformHeadingError,
        Math.abs(wrapAngle(decision.maneuver.targetHeading - expected)));
    }
    harness.flight.update(DT, state);
    harness.aiPorts.update(DT, state);
    harness.physics.update(DT, state);
    minTargetSeparation = Math.min(minTargetSeparation, distance(interceptor.pos, player.pos));
    harness.core.lifetimeSweep(DT, state);
  }

  const inspect = harness.aiPorts.inspect();
  const summary = {
    phases,
    minTargetSeparation: round3(minTargetSeparation),
    bestReformHeadingError: round3(bestReformHeadingError),
    acceptedManeuvers: inspect.acceptedManeuvers,
    flushedManeuvers: inspect.flushedManeuvers,
    ramAuthorized,
    sanctuaryRamAuthorized,
  };
  disposeHarness(harness);
  return summary;
}

function recordFormationStats(state, result, tacticalAI, stats) {
  const directives = new Map();
  for (const squad of result.squads) for (const directive of squad.directives) directives.set(directive.memberId, directive);
  for (const item of stats.values()) {
    const entity = state.entities.get(item.id);
    const directive = directives.get(item.id);
    if (!entity || !directive) continue;
    const error = distance(entity.pos, directive.formation.slot);
    if (item.startError == null) item.startError = error;
    item.finalError = error;
    item.bestError = Math.min(item.bestError, error);
    const maneuver = tacticalAI.inspect({ entityId: item.id }).maneuver;
    const commanded = maneuver && maneuver.lastRequest
      ? Math.hypot(maneuver.lastRequest.forceLocal.forward, maneuver.lastRequest.forceLocal.right)
      : 0;
    const speed = Math.hypot(entity.vel.x, entity.vel.z);
    if (commanded > 0.2 && speed < 0.25) item.movingStationaryTicks++;
    else item.movingStationaryTicks = 0;
    item.maxStationaryTicks = Math.max(item.maxStationaryTicks, item.movingStationaryTicks);
  }
}

function makeHarness() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  const runtime = {
    state,
    bus,
    helpers,
    ctx,
    core: Object.create(core),
    physics: Object.create(physics),
    flight: Object.create(flightV3),
    aiPorts: Object.create(aiPorts),
    rebuildSpatialHash() {
      state.spatialHash.rebuild(state.entityList);
    },
  };
  runtime.core.init(ctx);
  runtime.physics.init(ctx);
  runtime.aiPorts.init(ctx);
  runtime.flight.init(ctx);
  return runtime;
}

async function ensureSg02Ready(harness) {
  harness.physics.update(DT, harness.state);
  if (harness.physics._sg02Init) await harness.physics._sg02Init;
  harness.physics.update(DT, harness.state);
  assert(harness.physics._sg02, 'SG-02 dynamic owner should initialize for SG-06 formation fixture');
  assert.equal(harness.state.physicsRuntime.diagnostics.sg02Ready, true, 'physics diagnostics should mark SG-02 ready');
}

function makeShipSpec({ x, z, ai, mass = 32 }) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass,
    thrust: 90,
    turnRate: 3,
    drag: 1.2,
    maxSpeed: 140,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    team: 1,
    factionId: 'faction_scn',
    hull: 150,
    hullMax: 150,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 60,
    shieldMax: 60,
    cap: 100,
    capMax: 100,
    capRegen: 8,
    flightModel: { inertia: 88 },
    data: {
      ai,
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

function makeTargetSpec({ x, z, radius = 14, mass = 34 }) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius,
    mass,
    thrust: 90,
    turnRate: 3,
    drag: 1.2,
    maxSpeed: 140,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: Math.PI,
    team: 0,
    factionId: 'faction_free',
    hull: 180,
    hullMax: 180,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 70,
    shieldMax: 70,
    cap: 100,
    capMax: 100,
    capRegen: 8,
    flightModel: { inertia: 88 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  };
}

function noopActions() {
  return Object.freeze({
    list() { return Object.freeze([]); },
    canStart() { return { ok: false, reason: 'formation_convergence_no_actions' }; },
    start() { return null; },
    status() { return 'failed'; },
    interrupt() { return false; },
  });
}

function disposeHarness(harness) {
  if (harness.physics && typeof harness.physics._disableSg02DynamicAuthority === 'function') {
    harness.physics._disableSg02DynamicAuthority();
  }
}

function createBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
    queue(event, payload) {
      this.emit(event, payload);
    },
    flush() {},
  };
}

function distance(a, b) {
  return Math.hypot((a && a.x || 0) - (b && b.x || 0), (a && a.z || 0) - (b && b.z || 0));
}

function round3(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
