// Production V3 autopilot acceptance: local-map nav autopilot must drive the live
// rapier-dynamic flight adapter, not the legacy flight.js controller.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import {
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
} from '../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  CERES_WRECK_CATHEDRAL_COURSE_ARRIVAL_RADIUS,
  CERES_WRECK_CATHEDRAL_COURSE_POS,
  CERES_WRECK_CATHEDRAL_GLOBAL_POS,
} from '../src/data/worldSiteManifests.js';
import { save } from '../src/save/saveSystem.js';
import { asteroidFormations } from '../src/systems/asteroidFormations.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import {
  flightV3 as workspaceFlightV3,
  resolveAutopilotArrivalRadius,
} from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import {
  CERES_TOOLKIT_ROUTE_RESERVE_TICKS,
  CERES_TOOLKIT_TRANSIT_HANDOFF_RESERVE_TICKS,
  CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU,
  ceresPreContinueLegReserveTicks,
  chooseCeresPocketApproachAction,
  planCeresToolkitTransitHandoff,
} from './lib/ceresFiveMinuteAcceptance.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
const CERES_CATHEDRAL_PROXY_WORLD_RECORD_IDS = Object.freeze([
  'world_site_wreck_cathedral/collision/lower_center',
  'world_site_wreck_cathedral/collision/lower_port',
  'world_site_wreck_cathedral/collision/lower_starboard',
  'world_site_wreck_cathedral/collision/upper_port_inner',
  'world_site_wreck_cathedral/collision/upper_port_outer',
  'world_site_wreck_cathedral/collision/upper_starboard_inner',
  'world_site_wreck_cathedral/collision/upper_starboard_outer',
]);
const CERES_CATHEDRAL_POST_HANDOFF_WINDOW_TICKS = CERES_TOOLKIT_ROUTE_RESERVE_TICKS
  - ceresPreContinueLegReserveTicks('ceres_cathedral_grave');
const CERES_CATHEDRAL_ACTUAL_MIN_PROXY_GAP_WU = 20;
const RECOVERED_SEED_47_TOOLKIT_ENDPOINT = Object.freeze({
  source: 'candidate-bound-recovered-seed-47-toolkit-endpoint',
  tick: 7955,
  pos: Object.freeze({ x: -8918.610595703125, z: 7112.6971435546875 }),
  vel: Object.freeze({ x: 59.91373825073242, z: -83.78228759765625 }),
  rot: -1.471084233247489,
  hull: 257.7484,
});
const FLIGHT_UNDER_TEST = process.argv.includes('--head-flight')
  ? await loadHeadFlightV3()
  : workspaceFlightV3;

async function loadHeadFlightV3() {
  const source = execFileSync('git', ['show', 'HEAD:src/systems/flightV3.js'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  const moduleSource = source.replace(/from\s+(['"])(\.\.\/[^'"]+)\1/g, (_match, _quote, specifier) => {
    return `from '${pathToFileURL(resolve(ROOT, 'src/systems', specifier)).href}'`;
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`;
  const loaded = await import(moduleUrl);
  assert(loaded.flightV3, 'HEAD flightV3 probe must load the complete committed controller');
  return loaded.flightV3;
}

function makeBus() {
  const handlers = {};
  const events = [];
  return {
    events,
    on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); return () => {}; },
    emit(name, payload) { events.push({ name, payload }); (handlers[name] || []).forEach((fn) => fn(payload)); },
  };
}

function makeState({ mode = 'assisted', pos = { x: 0, z: 0 }, vel = { x: 0, z: 0 }, rot = 0, target = { x: 1000, z: 0 }, initialDistance = null, autopilotActive = true } = {}) {
  const player = {
    id: 'p1',
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'player',
    pos: { ...pos },
    vel: { ...vel },
    rot,
    angVel: 0,
    radius: 8,
    mass: 12,
    flags: {},
    bank: 0,
    bankFactor: 1,
    boost: { energy: 100, max: 100, drainRate: 5, regenRate: 18, dashImpulse: 0, dashCd: 3, dashCdT: 0 },
    physicsBody: { mass: 12, inertiaY: 80, radius: 8 },
    propulsion: {
      id: 'check_autopilot_reaction',
      family: 'reaction',
      label: 'Autopilot check drive',
      mainAccel: 90,
      reverseAccel: 75,
      strafeAccel: 52,
      maxSpeed: 220,
      boostAccelMult: 1.7,
      yawAccel: 8,
      yawBrake: 10,
      maxYawRate: 2.4,
      bankMax: 0.5,
      assist: {
        neutralBrakeFraction: 0.18,
        lateralKillFraction: 0.18,
        commandedAxisDamping: 0,
        stopHorizonS: 6,
        driftStopHorizonS: 10,
        deadSpeed: 0.2,
        deadInput: 0.025,
      },
    },
    data: { derived: {} },
  };
  const state = {
    mode: 'flight',
    tick: 12,
    simTime: 4,
    playerId: player.id,
    player: {},
    entities: new Map([[player.id, player]]),
    entityList: [player],
    entityIndex: { ships: [player], weaponShips: [player], projectiles: [] },
    settings: { gameplay: { physicsBackend: 'rapier-dynamic' }, controls: { flightMode: mode }, video: {} },
    ui: { screenStack: [] },
    world: { currentSector: {} },
    input: {
      moveX: 0,
      moveZ: 0,
      turnIntent: 0,
      boost: false,
      brake: false,
      fire: false,
      aimAngle: 0,
      actions: { autopursuit: false, brake: false },
    },
    nav: {
      route: null,
      autoTravel: false,
      waypoint: null,
      autopilot: {
        active: autopilotActive,
        target: { ...target },
        targetEntityId: null,
        label: 'Check fix',
        arrivalRadius: 36,
        status: 'armed',
      },
    },
    flight: { mode: 'manual', previousMode: 'manual', modeReason: 'boot', modeChangedTick: 0 },
  };
  if (initialDistance != null) state.nav.autopilot.initialDistance = initialDistance;
  return { state, player };
}

function runHarness(opts) {
  const bus = makeBus();
  const { state, player } = makeState(opts);
  const system = Object.create(FLIGHT_UNDER_TEST);
  system.init({ state, bus });
  system.update(DT, state);
  const command = consumePhysicsCommand(player);
  assert(command && command.control, 'flightV3 must write an SG-02 physics control command');
  return { bus, state, player, command: command.control };
}

function neutralizeGeneratedAutopilotInput(state) {
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  state.input.brake = false;
  state.input.autopilot = false;
  if (state.input.actions) state.input.actions.brake = false;
}

function makeCenteredAvoidanceHarness() {
  const bus = makeBus();
  const { state, player } = makeState({ target: { x: 1000, z: 0 }, vel: { x: 60, z: 0 }, initialDistance: 1000 });
  const obstacle = { id: 'lifecycle-rock', type: 'asteroid', alive: true, pos: { x: 220, z: 0 }, vel: { x: 0, z: 0 }, radius: 90 };
  state.entities.set(obstacle.id, obstacle);
  state.entityList.push(obstacle);
  const system = Object.create(FLIGHT_UNDER_TEST);
  system.init({ state, bus });
  neutralizeGeneratedAutopilotInput(state);
  system.update(DT, state);
  consumePhysicsCommand(player);
  assert.equal(Math.abs(state.nav.autopilot._avoidanceSide), 1, 'fixture must establish a live avoidance commitment');
  bus.events.length = 0;
  return { bus, state, player, obstacle, system };
}

function stepAutopilotHarness(harness) {
  neutralizeGeneratedAutopilotInput(harness.state);
  harness.state.tick++;
  harness.system.update(DT, harness.state);
  return consumePhysicsCommand(harness.player);
}

async function runRapierAvoidanceScenario(order, options = {}) {
  const state = createGameState(0x4a11);
  const { player } = makeState({ target: { x: 700, z: 0 }, vel: { x: 60, z: 0 }, initialDistance: 700 });
  player.id = 1;
  player.collides = true;
  player.prevPos = { ...player.pos };
  player.prevRot = player.rot;
  state.mode = 'flight';
  state.playerId = player.id;
  state.world.currentSector = {};
  state.entities.clear();
  state.entityList.length = 0;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.nav.autopilot = {
    active: true,
    target: { x: 700, z: 0 },
    targetEntityId: null,
    label: 'Rapier avoidance target',
    arrivalRadius: 38,
    initialDistance: 700,
    status: 'armed',
  };
  state.input.actions = { autopursuit: false, brake: false };

  const denseObstacles = {
    upper: { id: 10, type: 'asteroid', alive: true, collides: true, pos: { x: 250, z: 52 }, vel: { x: 0, z: 0 }, radius: 68 },
    lower: { id: 11, type: 'asteroid', alive: true, collides: true, pos: { x: 250, z: -52 }, vel: { x: 0, z: 0 }, radius: 68 },
    center: { id: 12, type: 'asteroid', alive: true, collides: true, pos: { x: 390, z: 0 }, vel: { x: 0, z: 0 }, radius: 62 },
  };
  const symmetricCorridor = {
    upper: { id: 10, type: 'asteroid', alive: true, collides: true, pos: { x: 260, z: 80 }, vel: { x: 0, z: 0 }, radius: 60 },
    lower: { id: 11, type: 'asteroid', alive: true, collides: true, pos: { x: 260, z: -80 }, vel: { x: 0, z: 0 }, radius: 60 },
  };
  const obstacles = options.symmetricCorridor ? symmetricCorridor : denseObstacles;
  for (const key of order) {
    const obstacle = obstacles[key];
    state.entities.set(obstacle.id, obstacle);
    state.entityList.push(obstacle);
  }

  const bus = makeBus();
  const helpers = {};
  const flightSystem = Object.create(FLIGHT_UNDER_TEST);
  const physicsSystem = Object.create(physics);
  flightSystem.init({ state, bus, helpers });
  physicsSystem.init({ state, bus, helpers });
  const ready = await physicsSystem.prepareBackend(state, { reset: true });
  assert.equal(ready, true, 'Rapier avoidance fixture must use the ready production physics authority');

  const initialDistance = Math.hypot(state.nav.autopilot.target.x - player.pos.x, state.nav.autopilot.target.z - player.pos.z);
  let maxLateral = 0;
  let avoidingSeen = false;
  let fieldPassed = false;
  let passCompleted = false;
  let reaccelerated = false;
  let completionTick = null;
  try {
    for (let tick = 0; tick < 1800; tick++) {
      state.tick = tick;
      state.simTime = tick * DT;
      neutralizeGeneratedAutopilotInput(state);
      flightSystem.update(DT, state);
      physicsSystem.update(DT, state);
      maxLateral = Math.max(maxLateral, Math.abs(player.pos.z));
      const status = state.nav.autopilot.status;
      if (status === 'avoiding') avoidingSeen = true;
      if (player.pos.x > 480) fieldPassed = true;
      if (avoidingSeen && fieldPassed && status !== 'avoiding') passCompleted = true;
      if (passCompleted && Math.hypot(player.vel.x, player.vel.z) > 45) reaccelerated = true;
      if (state.nav.autopilot.active === false && status === 'arrived') {
        completionTick = tick;
        break;
      }
    }
  } finally {
    physicsSystem._disableSg02DynamicAuthority();
  }

  const finalDistance = Math.hypot(state.nav.autopilot.target.x - player.pos.x, state.nav.autopilot.target.z - player.pos.z);
  return {
    initialDistance,
    finalDistance,
    maxLateral,
    avoidingSeen,
    fieldPassed,
    passCompleted,
    reaccelerated,
    completionTick,
    status: state.nav.autopilot.status,
    pos: { ...player.pos },
  };
}

async function runRapierHeliosTerminalScenario() {
  const state = createGameState(0x47a);
  const { player } = makeState({
    pos: { x: 0, z: 0 },
    rot: 0,
    target: { x: 1280, z: -420 },
    initialDistance: Math.hypot(1280, -420),
  });
  player.id = 1;
  player.radius = 14;
  player.mass = 32;
  player.data = { role: 'starter', derived: {} };
  delete player.propulsion;
  player.physicsBody.mass = 32;
  player.physicsBody.inertiaY = 26.95970695970696;
  player.physicsBody.radius = 14;
  player.collides = true;
  player.prevPos = { ...player.pos };
  player.prevRot = player.rot;
  const station = {
    id: 2,
    type: 'station',
    alive: true,
    collides: true,
    pos: { x: 1280, z: -420 },
    vel: { x: 0, z: 0 },
    radius: 42,
    mass: 1e6,
    data: { stationId: 'station_helios', dockRadius: 90, name: 'Helios Station' },
  };
  // Deterministic seed-47 slice of the authored Helios belt. This is the obstacle geometry that
  // made the public Kestrel course exit avoidance at boost speed with a kilometer of cross-track
  // error, then orbit the station because away/lateral velocity never entered the brake branch.
  const belt = [
    [8, 512.52176210511, -146.0193639593829, 8.367559840902686, 534.7023936361074],
    [44, 513.2840889877223, -149.80504009402833, 10.103003617376089, 604.1201446950436],
    [29, 565.2483666605806, -184.67563491107853, 12.343275625258684, 693.7310250103474],
    [28, 570.8143800245178, -180.58854538475694, 12.90486803650856, 716.1947214603424],
    [25, 600.0798474513562, -238.76031261206515, 12.887068318203092, 715.4827327281237],
    [16, 625.3196034402945, -218.36894819977886, 12.610429167747498, 704.4171667098999],
    [17, 658.5633485060841, -213.53438439863714, 7.330031916499138, 493.2012766599655],
    [24, 666.3165655658528, -226.96045656136732, 13.423339577391744, 736.9335830956697],
    [11, 675.9838496401424, -217.14981330829744, 12.478578509762883, 699.1431403905153],
    [18, 679.0438427051621, -255.91518657562818, 11.190595895051956, 647.6238358020782],
    [22, 690.024135678615, -242.5061921510127, 9.552236685529351, 582.089467421174],
    [20, 721.9997257477593, -231.08845170147356, 12.477446053177118, 699.0978421270847],
    [33, 723.333344687083, -252.30734558704538, 10.75633093714714, 630.2532374858856],
    [32, 734.4516295317034, -195.94116117222936, 7.712364956736565, 508.4945982694626],
    [10, 759.7333276989908, -298.29508668134423, 13.34228645823896, 733.6914583295584],
    [14, 753.0429721051537, -318.8989555431299, 11.509959502145648, 660.3983800858259],
    [31, 782.361784370081, -384.97401946323714, 8.177172522991896, 527.0869009196758],
    [37, 875.0378433811643, -386.71677750939625, 11.002711994573474, 640.108479782939],
    [34, 937.7154537329609, -319.4816352876163, 12.77204997651279, 710.8819990605116],
    [7, 939.8619772562213, -295.06696864660256, 10.195844253525138, 607.8337701410055],
  ].map(([id, x, z, radius, mass]) => ({
    id,
    type: 'asteroid',
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius,
    mass,
  }));
  state.mode = 'flight';
  state.playerId = player.id;
  state.world.currentSector = {};
  state.entities.clear();
  state.entityList.length = 0;
  for (const entity of [player, station, ...belt]) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }
  state.nav.autopilot = {
    active: true,
    target: { x: station.pos.x, z: station.pos.z },
    targetEntityId: station.id,
    label: 'Helios Station',
    arrivalRadius: 90,
    initialDistance: Math.hypot(1280, -420),
    status: 'armed',
  };
  state.input.actions = { autopursuit: false, brake: false };

  const bus = makeBus();
  const helpers = {};
  const flightSystem = Object.create(FLIGHT_UNDER_TEST);
  const physicsSystem = Object.create(physics);
  flightSystem.init({ state, bus, helpers });
  physicsSystem.init({ state, bus, helpers });
  const ready = await physicsSystem.prepareBackend(state, { reset: true });
  assert.equal(ready, true, 'Helios terminal fixture must use the production Rapier authority');

  const dockRange = ((station.data.dockRadius || station.radius) + player.radius) * 1.5;
  let closestDistance = Infinity;
  let maxCrossTrack = 0;
  let maxSpeed = 0;
  let completionTick = null;
  let terminal = null;
  try {
    for (let tick = 0; tick < 1800; tick++) {
      state.tick = tick;
      state.simTime = tick * DT;
      neutralizeGeneratedAutopilotInput(state);
      flightSystem.update(DT, state);
      physicsSystem.update(DT, state);
      const distance = Math.hypot(station.pos.x - player.pos.x, station.pos.z - player.pos.z);
      const speed = Math.hypot(player.vel.x, player.vel.z);
      closestDistance = Math.min(closestDistance, distance);
      maxSpeed = Math.max(maxSpeed, speed);
      maxCrossTrack = Math.max(maxCrossTrack, Math.abs(player.pos.x * -420 - player.pos.z * 1280) / Math.hypot(1280, -420));
      terminal = {
        tick,
        distance,
        speed,
        rot: player.rot,
        angVel: player.angVel,
        status: state.nav.autopilot.status,
        active: state.nav.autopilot.active,
        input: {
          moveX: state.input.moveX,
          moveZ: state.input.moveZ,
          turnIntent: state.input.turnIntent,
          boost: state.input.boost,
          brake: state.input.brake,
        },
      };
      if (distance <= dockRange) {
        completionTick = tick;
        break;
      }
    }
  } finally {
    physicsSystem._disableSg02DynamicAuthority();
  }
  return { dockRange, closestDistance, maxCrossTrack, maxSpeed, completionTick, terminal };
}

async function runRapierCeresHornetReserveScenario() {
  // Seed-47 PQ-048 Throughline leg begins on the authored Belt Outpost center's public 90-WU
  // completion shell. Derive the handoff from the same data authority as the Browser route so an
  // anchor move cannot leave this exact production-physics reserve regression on a stale point.
  const sectorId = CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId;
  const seamAnchor = sectorLocalToGlobalForSector(
    CERES_ACTIVITY_POCKETS_BY_ID.ceres_working_seam.activityAnchor.localPos,
    sectorId,
  );
  const beltOutpostAnchor = SECTOR_ANCHORS[sectorId].stations
    .find((station) => station.id === 'station_beltout');
  assert.ok(beltOutpostAnchor?.pos, 'PQ-048 reserve fixture requires the authored Belt Outpost');
  const beltOutpost = sectorLocalToGlobalForSector(beltOutpostAnchor.pos, sectorId);
  const egressX = beltOutpost.x - seamAnchor.x;
  const egressZ = beltOutpost.z - seamAnchor.z;
  const egressDistance = Math.hypot(egressX, egressZ);
  const start = {
    x: beltOutpost.x - (egressX / egressDistance) * 90,
    z: beltOutpost.z - (egressZ / egressDistance) * 90,
  };
  const target = sectorLocalToGlobalForSector(
    CERES_ACTIVITY_POCKETS_BY_ID.ceres_ambush_run.activityAnchor.localPos,
    sectorId,
  );
  const startRot = Math.atan2(start.z - seamAnchor.z, start.x - seamAnchor.x);
  const reserveTicks = 2400;
  const sim = createSimulation({
    seed: 47,
    systems: [world, asteroidSites, asteroidFormations, FLIGHT_UNDER_TEST, physics],
  });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true,
    player: state.player,
    pos: { ...start },
    rot: startRot,
    fittings: [],
  }));
  player.vel = { x: Math.cos(startRot) * 0.8, z: Math.sin(startRot) * 0.8 };
  player.angVel = 0;
  player.collides = true;
  player.prevRot = player.rot;
  state.playerId = player.id;

  const worldSystem = sim.registry.get('world');
  worldSystem.enterSector(sectorId, {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  const physicsSystem = sim.registry.get('physics');
  const ready = await physicsSystem.prepareBackend(state, { reset: true });
  assert.equal(ready, true, 'Ceres Hornet fixture must use the ready production physics authority');

  const initialDistance = Math.hypot(target.x - start.x, target.z - start.z);
  state.nav.autopilot = {
    active: true,
    target: { ...target },
    targetEntityId: null,
    label: 'Throughline Weigh Beacon',
    arrivalRadius: 48,
    initialDistance,
    status: 'armed',
  };
  state.input.actions = { autopursuit: false, brake: false };

  let completionTick = null;
  let maxSpeed = 0;
  let avoidingTicks = 0;
  let brakingTicks = 0;
  let boostingTicks = 0;
  try {
    // Run past the acceptance reserve so a failure reports the actual deterministic arrival,
    // rather than only saying that the ship was still active at tick 2400.
    for (let tick = 0; tick < 6000; tick++) {
      state.tick = tick;
      state.simTime = tick * DT;
      neutralizeGeneratedAutopilotInput(state);
      sim.step(DT);
      maxSpeed = Math.max(maxSpeed, Math.hypot(player.vel.x, player.vel.z));
      if (state.nav.autopilot.status === 'avoiding') avoidingTicks++;
      if (state.input.brake) brakingTicks++;
      if (state.input.boost) boostingTicks++;
      if (state.nav.autopilot.active === false && state.nav.autopilot.status === 'arrived') {
        completionTick = tick;
        break;
      }
    }
  } finally {
    physicsSystem._disableSg02DynamicAuthority();
    sim.dispose();
  }

  return {
    reserveTicks,
    initialDistance,
    entityCount: state.entities.size,
    completionTick,
    completionSeconds: completionTick == null ? null : completionTick * DT,
    finalDistance: Math.hypot(target.x - player.pos.x, target.z - player.pos.z),
    maxSpeed,
    avoidingTicks,
    brakingTicks,
    boostingTicks,
    status: state.nav.autopilot.status,
  };
}

async function runProductionLeviathanCathedralCourseScenario() {
  const sectorId = CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId;
  const transitPlan = planCeresToolkitTransitHandoff();
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: 47,
  });
  const { state, bus } = runtime;
  let physicsSystem = null;
  try {
    state.mode = 'flight';
    state.tick = 9265;
    state.simTime = state.tick * DT;
    state.world.currentSectorId = sectorId;
    const start = transitPlan.targetPos;
    const startRot = Math.atan2(
      CERES_WRECK_CATHEDRAL_COURSE_POS.z - start.z,
      CERES_WRECK_CATHEDRAL_COURSE_POS.x - start.x,
    );
    const player = runtime.spawn(makeShipEntitySpec('ship_leviathan', {
      isPlayer: true,
      player: state.player,
      pos: { ...start },
      rot: startRot,
      fittings: [],
    }));
    player.vel = { x: 0, z: 0 };
    player.angVel = 0;
    player.collides = true;
    state.playerId = player.id;

    const playerImpacts = [];
    bus.on('physics:impact', (event) => {
      if (event.aId === player.id || event.bId === player.id) {
        playerImpacts.push({ tick: state.tick, aId: event.aId, bId: event.bId });
      }
    });
    runtime.getSystem('world').enterSector(sectorId, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    physicsSystem = runtime.getSystem('physics');
    assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true,
      'Leviathan Cathedral course requires ready production Rapier authority');
    bus.emit('ui:setCourse', {
      pos: { ...CERES_WRECK_CATHEDRAL_COURSE_POS },
      label: 'Wreck Cathedral',
      arrivalRadius: CERES_WRECK_CATHEDRAL_COURSE_ARRIVAL_RADIUS,
      autopilot: true,
    });
    const effectiveArrivalRadius = resolveAutopilotArrivalRadius(
      player,
      state.nav.autopilot,
      { radius: 0 },
    );
    const inputSystem = runtime.getSystem('input');
    const proxyIds = new Set();
    let minProxyGap = Infinity;
    let maxSpeed = 0;
    let brakingTicks = 0;
    let boostingTicks = 0;
    let avoidingTicks = 0;
    const startTick = state.tick;
    for (let tick = 0; tick < CERES_CATHEDRAL_POST_HANDOFF_WINDOW_TICKS; tick++) {
      if (state.nav.autopilot?.active === false
          && state.nav.autopilot?.status === 'arrived') break;
      for (const code in inputSystem._keys) inputSystem._keys[code] = false;
      runtime.step(DT);
      maxSpeed = Math.max(maxSpeed, Math.hypot(player.vel.x, player.vel.z));
      if (state.input.brake) brakingTicks++;
      if (state.input.boost) boostingTicks++;
      if (state.nav.autopilot?.status === 'avoiding') avoidingTicks++;
      for (const entity of state.entityList) {
        const worldRecordId = String(entity?.data?.worldRecordId || '');
        if (!worldRecordId.startsWith('world_site_wreck_cathedral/collision/')) continue;
        proxyIds.add(worldRecordId);
        minProxyGap = Math.min(minProxyGap, Math.hypot(
          entity.pos.x - player.pos.x,
          entity.pos.z - player.pos.z,
        ) - Number(entity.radius || 0) - Number(player.radius || 0));
      }
    }
    return {
      runtime: {
        evidenceClass: runtime.manifest.evidenceClass,
        flightBackend: runtime.manifest.selectedSlots.flightBackend,
      },
      physics: {
        backend: state.physicsRuntime?.diagnostics?.backend || null,
        sg02Ready: state.physicsRuntime?.diagnostics?.sg02Ready === true,
      },
      hullId: player.data?.defId || null,
      hullRadius: player.radius,
      requestedArrivalRadius: CERES_WRECK_CATHEDRAL_COURSE_ARRIVAL_RADIUS,
      effectiveArrivalRadius,
      ticks: state.tick - startTick,
      status: state.nav.autopilot?.status || null,
      finalDistance: Math.hypot(
        CERES_WRECK_CATHEDRAL_COURSE_POS.x - player.pos.x,
        CERES_WRECK_CATHEDRAL_COURSE_POS.z - player.pos.z,
      ),
      finalSpeed: Math.hypot(player.vel.x, player.vel.z),
      minProxyGap,
      proxyWorldRecordIds: [...proxyIds].sort(),
      playerImpacts,
      maxSpeed,
      brakingTicks,
      boostingTicks,
      avoidingTicks,
    };
  } finally {
    if (physicsSystem) physicsSystem._disableSg02DynamicAuthority();
    runtime.dispose();
  }
}

async function runProductionRecoveredCeresCorridorScenario() {
  const sectorId = 'sector_ceres_belt';
  const encounterId = 'ceres:activity:throughline-ambush';
  const survivorWorldRecordId = 'wr_npc_cc9f0184';
  const transitReserveTicks = CERES_TOOLKIT_TRANSIT_HANDOFF_RESERVE_TICKS;
  const cathedralReserveTicks = CERES_CATHEDRAL_POST_HANDOFF_WINDOW_TICKS;
  const requiredMarginTicks = 100;
  const startTick = RECOVERED_SEED_47_TOOLKIT_ENDPOINT.tick;
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: 47,
  });
  const { state, bus } = runtime;
  let player = null;
  let survivor = null;
  let physicsSystem = null;

  const stageMetrics = Object.create(null);
  const metricsFor = (stage) => (stageMetrics[stage] ||= {
    maxSpeed: 0,
    brakingTicks: 0,
    boostingTicks: 0,
    avoidingTicks: 0,
    minCathedralProxyGap: Infinity,
    minCathedralProxyWorldRecordId: null,
    cathedralProxyWorldRecordIds: [],
    minTrafficGap: Infinity,
    minTrafficWorldRecordId: null,
  });
  let stage = 'handoff';
  const playerImpacts = [];
  const encounterResolutions = [];

  try {
    state.mode = 'flight';
    state.tick = startTick;
    state.simTime = startTick * DT;
    state.world.currentSectorId = sectorId;

    player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
      isPlayer: true,
      player: state.player,
      pos: { ...RECOVERED_SEED_47_TOOLKIT_ENDPOINT.pos },
      rot: RECOVERED_SEED_47_TOOLKIT_ENDPOINT.rot,
      fittings: [
        'wpn_concussion_cannon_m',
        'wpn_gravity_marker_s',
        'wpn_momentum_sink_s',
      ],
    }));
    player.vel = { ...RECOVERED_SEED_47_TOOLKIT_ENDPOINT.vel };
    player.angVel = 0;
    player.collides = true;
    player.hull = RECOVERED_SEED_47_TOOLKIT_ENDPOINT.hull;
    state.playerId = player.id;
    state.player.tether = {
      ...(state.player.tether || {}),
      active: false,
      targetId: null,
      attachmentId: null,
    };
    const initialHull = player.hull;

    const survivorSpec = makeEnemySpawnSpec(
      'wasp_swarmer',
      3,
      { x: player.pos.x + 70, z: player.pos.z + 15 },
      { startedTick: state.tick, zoneId: 'zone_ceres_ambush' },
    );
    survivorSpec.vel = { x: 0, z: 0 };
    survivorSpec.data.worldRecordId = survivorWorldRecordId;
    Object.assign(survivorSpec.data.ai, {
      squadId: 'zone_ceres_ambush',
      zoneId: 'zone_ceres_ambush',
      ceresActivityAmbushPhase: 'conflict',
      passive: false,
      roe: 'weapons_free',
      spawnContext: 'zone_hostile',
    });
    survivor = runtime.spawn(survivorSpec);

    bus.on('physics:impact', (event) => {
      if (event.aId === player.id || event.bId === player.id) {
        playerImpacts.push({ tick: state.tick, aId: event.aId, bId: event.bId });
      }
    });
    bus.on('encounter:resolved', (event) => {
      if (event.encounterId !== encounterId) return;
      encounterResolutions.push({
        tick: state.tick,
        encounterId: event.encounterId,
        outcome: event.outcome,
        survivorDistance: Math.hypot(
          player.pos.x - survivor.pos.x,
          player.pos.z - survivor.pos.z,
        ),
      });
    });

    runtime.getSystem('world').enterSector(sectorId, {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    assert.equal(survivor.data.ai.ceresActivityAmbushPhase, 'armed',
      'sector entry must park the durable Throughline actor through production ownership');
    survivor.data.ai.ceresActivityAmbushPhase = 'conflict';
    state.encounterDirector.stats.ceresActivityAmbush = { phase: 'revealed' };
    bus.emit('save:restoring', { slot: 'seed47-cathedral-regression' });
    bus.emit('save:loaded', { slot: 'seed47-cathedral-regression' });
    assert.equal(state.encounterDirector.live[encounterId]?.phase, 'conflict',
      'Continue must resume the real authored Throughline conflict');

    physicsSystem = runtime.getSystem('physics');
    assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true,
      'combined Ceres route requires ready production Rapier authority');
    const physics = {
      backend: state.physicsRuntime?.diagnostics?.backend || null,
      sg02Ready: state.physicsRuntime?.diagnostics?.sg02Ready === true,
    };
    const inputSystem = runtime.getSystem('input');
    const releaseInput = () => {
      for (const code in inputSystem._keys) inputSystem._keys[code] = false;
      inputSystem._m0 = false;
      inputSystem._m1 = false;
    };
    const sample = () => {
      const metrics = metricsFor(stage);
      metrics.maxSpeed = Math.max(metrics.maxSpeed, Math.hypot(player.vel.x, player.vel.z));
      if (state.input.brake) metrics.brakingTicks++;
      if (state.input.boost) metrics.boostingTicks++;
      if (state.nav.autopilot?.status === 'avoiding') metrics.avoidingTicks++;
      for (const entity of state.entityList) {
        if (!entity || entity.id === player.id || entity.alive === false
            || entity.collides !== true || !entity.pos) continue;
        const gap = Math.hypot(
          entity.pos.x - player.pos.x,
          entity.pos.z - player.pos.z,
        ) - Number(entity.radius || 0) - Number(player.radius || 0);
        const worldRecordId = String(entity.data?.worldRecordId || '');
        if (worldRecordId.startsWith('world_site_wreck_cathedral/collision/')) {
          if (gap < metrics.minCathedralProxyGap) {
            metrics.minCathedralProxyGap = gap;
            metrics.minCathedralProxyWorldRecordId = worldRecordId;
          }
          if (!metrics.cathedralProxyWorldRecordIds.includes(worldRecordId)) {
            metrics.cathedralProxyWorldRecordIds.push(worldRecordId);
            metrics.cathedralProxyWorldRecordIds.sort();
          }
        }
        if (entity.type === 'ship' && gap < metrics.minTrafficGap) {
          metrics.minTrafficGap = gap;
          metrics.minTrafficWorldRecordId = worldRecordId || null;
        }
      }
    };
    const step = (heldKeys = null) => {
      releaseInput();
      if (heldKeys) {
        for (const code of heldKeys) inputSystem._keys[code] = true;
      }
      runtime.step(DT);
      sample();
    };
    const runCourse = (pos, label, arrivalRadius, limit) => {
      bus.emit('ui:setCourse', {
        pos: { x: pos.x, z: pos.z },
        label,
        arrivalRadius,
        autopilot: true,
      });
      const legStartTick = state.tick;
      for (let tick = 0; tick < limit; tick++) {
        if (state.nav.autopilot?.active === false
            && state.nav.autopilot?.status === 'arrived') break;
        step();
      }
      return {
        startTick: legStartTick,
        completionTick: state.tick,
        ticks: state.tick - legStartTick,
        status: state.nav.autopilot?.status || null,
        distance: Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z),
        speed: Math.hypot(player.vel.x, player.vel.z),
      };
    };

    const pointStatus = (pos) => {
      const dx = pos.x - player.pos.x;
      const dz = pos.z - player.pos.z;
      let headingError = Math.atan2(dz, dx) - player.rot;
      while (headingError > Math.PI) headingError -= Math.PI * 2;
      while (headingError < -Math.PI) headingError += Math.PI * 2;
      return {
        distanceWU: Math.hypot(dx, dz),
        headingError,
        speed: Math.hypot(player.vel.x, player.vel.z),
      };
    };
    const runFixedTickApproach = (pos, arrivalRadius, maxPulses = 220) => {
      const legStartTick = state.tick;
      let pulses = 0;
      let settleHolds = 0;
      let boostActions = 0;
      let complete = false;
      while (pulses < maxPulses) {
        const action = chooseCeresPocketApproachAction(pointStatus(pos), {
          arrivalRadiusWU: arrivalRadius,
          allowBoost: false,
        });
        if (action.kind === 'complete') {
          complete = true;
          break;
        }
        assert.notEqual(action.kind, 'invalid', 'fixed-tick public approach requires finite telemetry');
        if (action.kind === 'settle') {
          settleHolds++;
          for (let tick = 0; tick < 600 && pointStatus(pos).speed > 1; tick++) {
            step(['Digit0']);
          }
          continue;
        }
        pulses++;
        if (action.boost === true) boostActions++;
        assert.equal(action.boost === true, false,
          'fixed-tick Ceres point approaches must remain dash-safe');
        const pulseTicks = Math.max(1, Math.round(action.durationMs / 1000 / DT));
        const heldKeys = action.kind === 'turn'
          ? [action.key]
          : action.kind === 'decelerate'
            ? ['KeyS']
            : ['KeyW'];
        for (let tick = 0; tick < pulseTicks; tick++) step(heldKeys);
      }
      const terminal = pointStatus(pos);
      return {
        startTick: legStartTick,
        completionTick: state.tick,
        ticks: state.tick - legStartTick,
        status: complete ? 'arrived' : 'incomplete',
        distance: terminal.distanceWU,
        speed: terminal.speed,
        pulses,
        settleHolds,
        boostActions,
      };
    };

    const transitPlan = planCeresToolkitTransitHandoff();
    const handoff = runFixedTickApproach(
      transitPlan.targetPos,
      transitPlan.arrivalRadiusWU,
    );
    releaseInput();
    step();
    const handoffNeutralInput = {
      moveX: state.input.moveX,
      moveZ: state.input.moveZ,
      turnIntent: state.input.turnIntent,
      boost: state.input.boost,
      brake: state.input.brake,
    };
    const survivorDistanceAtHandoff = Math.hypot(
      player.pos.x - survivor.pos.x,
      player.pos.z - survivor.pos.z,
    );

    stage = 'cathedral-safe-course';
    const cathedralStartTick = state.tick;
    const safeCourse = runCourse(
      CERES_WRECK_CATHEDRAL_COURSE_POS,
      'Wreck Cathedral',
      CERES_WRECK_CATHEDRAL_COURSE_ARRIVAL_RADIUS,
      cathedralReserveTicks,
    );

    stage = 'cathedral-center';
    const settleStartTick = state.tick;
    while (state.tick - settleStartTick < 600
        && Math.hypot(player.vel.x, player.vel.z) > 1) step();
    const safeCourseSettleTicks = state.tick - settleStartTick;
    const centerApproach = runFixedTickApproach(CERES_WRECK_CATHEDRAL_GLOBAL_POS, 90);
    releaseInput();

    return {
      runtime: {
        evidenceClass: runtime.manifest.evidenceClass,
        aiBackend: runtime.manifest.selectedSlots.aiBackend,
        flightBackend: runtime.manifest.selectedSlots.flightBackend,
      },
      physics,
      continuationFixture: RECOVERED_SEED_47_TOOLKIT_ENDPOINT.source,
      hull: {
        id: player.data?.defId || null,
        radius: player.radius,
      },
      transitPlan,
      handoff: {
        ...handoff,
        reserveTicks: transitReserveTicks,
        marginTicks: transitReserveTicks - handoff.ticks,
        survivorDistance: survivorDistanceAtHandoff,
        neutralInput: handoffNeutralInput,
      },
      encounterResolution: encounterResolutions[0] || null,
      survivor: {
        alive: survivor.alive !== false,
        worldRecordId: survivor.data?.worldRecordId || null,
      },
      safeCourse: {
        ...safeCourse,
        pos: { ...CERES_WRECK_CATHEDRAL_COURSE_POS },
        arrivalRadius: CERES_WRECK_CATHEDRAL_COURSE_ARRIVAL_RADIUS,
        settleTicks: safeCourseSettleTicks,
      },
      cathedral: {
        startTick: cathedralStartTick,
        completionTick: state.tick,
        ticks: state.tick - cathedralStartTick,
        reserveTicks: cathedralReserveTicks,
        marginTicks: cathedralReserveTicks - (state.tick - cathedralStartTick),
        centerDriveTicks: centerApproach.ticks,
        centerPulses: centerApproach.pulses,
        centerSettleHolds: centerApproach.settleHolds,
        centerBoostActions: centerApproach.boostActions,
        distanceWU: centerApproach.distance,
        speed: centerApproach.speed,
        status: centerApproach.status,
      },
      metrics: stageMetrics,
      playerImpacts,
      playerAlive: player.alive !== false && player.hull > 0,
      hullLoss: initialHull - player.hull,
      requiredMarginTicks,
    };
  } finally {
    if (physicsSystem) physicsSystem._disableSg02DynamicAuthority();
    runtime.dispose();
  }
}

console.log('--- V3 AUTOPILOT ACCEPTANCE ---');
assert.equal(
  CERES_CATHEDRAL_POST_HANDOFF_WINDOW_TICKS,
  CERES_TOOLKIT_TRANSIT_HANDOFF_RESERVE_TICKS,
  'the shared Ceres route must leave one fixed post-toolkit window for each handoff/Cathedral stage',
);

{
  const result = await runProductionLeviathanCathedralCourseScenario();
  assert.deepEqual(result.runtime, {
    evidenceClass: 'production-manifest',
    flightBackend: 'v3',
  });
  assert.deepEqual(result.physics, { backend: 'rapier-dynamic', sg02Ready: true });
  assert.equal(result.hullId, 'ship_leviathan');
  assert.equal(result.hullRadius, 45);
  assert.equal(result.requestedArrivalRadius, 48);
  assert.equal(result.effectiveArrivalRadius, 63,
    'Leviathan must exercise Flight V3\'s hull-expanded arrival shell');
  assert.equal(result.status, 'arrived');
  assert(result.ticks <= CERES_CATHEDRAL_POST_HANDOFF_WINDOW_TICKS,
    `Leviathan must arrive inside the shared post-handoff window: ${JSON.stringify(result)}`);
  assert(result.finalDistance <= result.effectiveArrivalRadius && result.finalSpeed < 11,
    `Leviathan must physically settle on its effective arrival shell: ${JSON.stringify(result)}`);
  assert.deepEqual(result.proxyWorldRecordIds, CERES_CATHEDRAL_PROXY_WORLD_RECORD_IDS);
  assert(Number.isFinite(result.minProxyGap)
      && result.minProxyGap > CERES_CATHEDRAL_ACTUAL_MIN_PROXY_GAP_WU,
  `Leviathan course must retain its named runtime proxy gap: ${JSON.stringify(result)}`);
  assert.deepEqual(result.playerImpacts, []);
  console.log('Check Cathedral Leviathan PASSED: the largest canonical hull arrives through live Flight V3 + Rapier without impact.', result);
}

{
  const result = await runProductionRecoveredCeresCorridorScenario();
  assert.deepEqual(result.runtime, {
    evidenceClass: 'production-manifest',
    aiBackend: 'sg06-tactical',
    flightBackend: 'v3',
  });
  assert.equal(result.continuationFixture,
    RECOVERED_SEED_47_TOOLKIT_ENDPOINT.source,
    'the deterministic geometry regression must identify its recovered post-toolkit fixture honestly');
  assert.deepEqual(result.hull, { id: 'ship_hornet', radius: 16 },
    'the pocket-center continuation is deliberately bounded to the route\'s Hornet fixture');
  assert.deepEqual(result.physics, { backend: 'rapier-dynamic', sg02Ready: true });
  assert.equal(result.handoff.status, 'arrived');
  assert(result.handoff.distance <= result.transitPlan.arrivalRadiusWU
      && result.handoff.speed <= 1,
  `fixed-tick handoff must settle on its authored completion shell: ${JSON.stringify(result)}`);
  assert(result.handoff.pulses < 220 && result.handoff.boostActions === 0,
    `handoff must use the bounded no-boost public controller: ${JSON.stringify(result)}`);
  assert.deepEqual(result.handoff.neutralInput, {
    moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false,
  });
  assert(result.handoff.marginTicks >= result.requiredMarginTicks,
    `Throughline handoff needs a non-fragile route margin: ${JSON.stringify(result)}`);
  assert.deepEqual(result.encounterResolution && {
    encounterId: result.encounterResolution.encounterId,
    outcome: result.encounterResolution.outcome,
  }, { encounterId: 'ceres:activity:throughline-ambush', outcome: 'escaped' });
  assert(result.encounterResolution.survivorDistance >= CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU,
    `canonical encounter receipt must bind the 2600-WU escape boundary: ${JSON.stringify(result)}`);
  assert(result.handoff.completionTick - result.encounterResolution.tick >= result.requiredMarginTicks,
    `canonical escape must precede handoff completion with real time margin: ${JSON.stringify(result)}`);
  assert(result.handoff.survivorDistance >= CERES_TOOLKIT_TRANSIT_ESCAPE_RADIUS_WU + 100,
    `handoff endpoint must retain physical separation margin: ${JSON.stringify(result)}`);
  assert.deepEqual(result.survivor, { alive: true, worldRecordId: 'wr_npc_cc9f0184' });
  assert.equal(result.safeCourse.status, 'arrived');
  assert.equal(result.safeCourse.arrivalRadius, 48);
  assert(result.safeCourse.distance <= result.safeCourse.arrivalRadius);
  assert(result.cathedral.status === 'arrived'
      && result.cathedral.distanceWU <= 90 && result.cathedral.speed <= 1,
    `public center approach must settle inside the Cathedral pocket: ${JSON.stringify(result)}`);
  assert(result.cathedral.centerPulses < 220 && result.cathedral.centerBoostActions === 0,
    `Cathedral center approach must use the bounded no-boost controller: ${JSON.stringify(result)}`);
  assert(result.cathedral.marginTicks >= result.requiredMarginTicks,
    `safe-course and center completion need route margin: ${JSON.stringify(result)}`);
  assert.deepEqual(
    result.metrics['cathedral-safe-course'].cathedralProxyWorldRecordIds,
    CERES_CATHEDRAL_PROXY_WORLD_RECORD_IDS,
  );
  assert.deepEqual(
    result.metrics['cathedral-center'].cathedralProxyWorldRecordIds,
    CERES_CATHEDRAL_PROXY_WORLD_RECORD_IDS,
  );
  assert(Number.isFinite(result.metrics['cathedral-safe-course'].minCathedralProxyGap)
      && result.metrics['cathedral-safe-course'].minCathedralProxyGap > 10,
    `authored Cathedral course needs a positive collision envelope: ${JSON.stringify(result)}`);
  assert(Number.isFinite(result.metrics['cathedral-center'].minCathedralProxyGap)
      && result.metrics['cathedral-center'].minCathedralProxyGap > 10,
    `center completion must retain a positive solid-proxy envelope: ${JSON.stringify(result)}`);
  assert.deepEqual(result.playerImpacts, []);
  assert.equal(result.playerAlive, true);
  console.log('Check PQ-048 Cathedral PASSED: the candidate-bound recovered seed-47 Hornet continuation resolves the resumed ambush, reaches the authored safe course, and settles inside the wreck pocket.', result);
}

{
  const result = await runRapierCeresHornetReserveScenario();
  assert.notEqual(result.completionTick, null,
    `seed-47 Ceres Hornet must reach Throughline through the production physics authority: ${JSON.stringify(result)}`);
  assert(result.completionTick <= result.reserveTicks,
    `seed-47 Ceres Hornet must reach Throughline inside the 2400-tick acceptance reserve: ${JSON.stringify(result)}`);
  console.log('Check PQ-048 PASSED: seed-47 Hornet reaches Throughline inside the fixed route reserve.', result);
}

{
  const result = await runRapierHeliosTerminalScenario();
  assert.notEqual(result.completionTick, null,
    `seed-47 Kestrel course must enter the physical Helios dock envelope within 30 sim seconds: ${JSON.stringify(result)}`);
  assert(result.closestDistance <= result.dockRange,
    `Helios course must close within the live dock range: ${JSON.stringify(result)}`);
  console.log('Check 0 PASSED: seed-47 Kestrel clears the authored belt and reaches Helios without an overspeed orbit.', result);
}

{
  const h = runHarness({ target: { x: 1200, z: 0 }, initialDistance: 1200 });
  assert(h.command.force.x > 0, 'clear-course autopilot must thrust toward the selected map fix');
  assert.equal(h.state.input.boost, true, 'clear-course autopilot must request boost on a long aligned route');
  assert.equal(h.player.flags.boosting, true, 'autopilot boost must flow through the normal boost resource gate');
  assert.equal(h.state.nav.autopilot.status, 'boosting', 'autopilot status must expose boosting');
  console.log('Check 1 PASSED: clear route thrusts and boosts through live V3.');
}

{
  const bus = makeBus();
  const { state, player } = makeState({
    target: { x: 999, z: 999 },
    vel: { x: -120, z: 0 },
    initialDistance: 900,
  });
  const movingTarget = {
    id: 'moving-convoy',
    type: 'ship',
    alive: true,
    pos: { x: 700, z: 80 },
    vel: { x: 20, z: -4 },
    radius: 14,
  };
  state.entities.set(movingTarget.id, movingTarget);
  state.entityList.push(movingTarget);
  state.nav.autopilot.targetEntityId = movingTarget.id;
  const system = Object.create(FLIGHT_UNDER_TEST);
  system.init({ state, bus });
  system.update(DT, state);
  consumePhysicsCommand(player);
  const telemetry = player._flightFrame.autopilot;
  assert.equal(telemetry.target.entity, movingTarget,
    'capture braking must keep resolving the live targetEntityId instead of the stale point fix');
  assert.deepEqual({ x: telemetry.target.x, z: telemetry.target.z }, movingTarget.pos,
    'moving-target guidance must use the entity current position');
  assert.equal(telemetry.captureBraking, true,
    'away velocity should enter capture braking after the moving target has been resolved');
  console.log('Check 1b PASSED: capture braking preserves live moving-entity target resolution.');
}

{
  const h = runHarness({ vel: { x: 170, z: 0 }, target: { x: 190, z: 0 }, initialDistance: 900 });
  assert.equal(h.state.input.brake, true, 'arrival envelope must set the brake action');
  assert(h.state.input.moveZ < 0, 'arrival envelope must command reverse thrust');
  assert(h.command.force.x < 0, 'reverse-brake autopilot must write counter-thrust into SG-02');
  const thrust = h.bus.events.find((e) => e.name === 'ship:thrust');
  assert(thrust, 'reverse-brake autopilot must emit ship:thrust for VFX');
  assert(thrust.payload.reverse > 0, 'ship:thrust must expose reverse strength');
  assert(thrust.payload.nozzles.some((n) => n.role === 'reverse-left'), 'reverse cue must include left angled nozzle');
  assert(thrust.payload.nozzles.some((n) => n.role === 'reverse-right'), 'reverse cue must include right angled nozzle');
  console.log('Check 2 PASSED: arrival brake writes reverse thrust and angled nozzle cues.');
}

{
  const h = runHarness({ vel: { x: 285, z: 0 }, target: { x: 500, z: 0 }, initialDistance: 1000 });
  assert.equal(h.state.nav.autopilot.status, 'braking', 'halfway high-speed route must enter braking status');
  assert.equal(h.state.input.brake, true, 'halfway high-speed route must set the brake action');
  assert(h.state.input.moveZ < 0, 'halfway high-speed route must command reverse thrust instead of coasting');
  assert(h.command.force.x < 0, 'halfway high-speed route must write reverse counter-thrust into SG-02');
  console.log('Check 3 PASSED: high-speed routes begin reverse burn around halfway instead of overshooting.');
}

{
  const bus = makeBus();
  const { state, player } = makeState({ target: { x: 1000, z: 0 }, vel: { x: 60, z: 0 }, initialDistance: 1000 });
  const obstacle = { id: 'rock', type: 'asteroid', alive: true, pos: { x: 220, z: 0 }, vel: { x: 0, z: 0 }, radius: 90 };
  state.entities.set(obstacle.id, obstacle);
  state.entityList.push(obstacle);
  const system = Object.create(FLIGHT_UNDER_TEST);
  system.init({ state, bus });
  system.update(DT, state);
  const command = consumePhysicsCommand(player).control;
  assert.equal(state.nav.autopilot.status, 'avoiding', 'blocking obstacle must put autopilot in avoiding status');
  assert(Math.abs(state.input.moveX) > 0.05 || Math.abs(command.force.z) > 1,
    'blocking obstacle must produce lateral avoidance input/force');
  console.log('Check 4 PASSED: obstacle avoidance steers around a blocking body.');
}

{
  const bus = makeBus();
  const { state, player } = makeState({
    target: { x: 1000, z: 0 },
    vel: { x: 0, z: -180 },
    initialDistance: 1000,
  });
  const obstacle = { id: 'capture-rock', type: 'asteroid', alive: true, pos: { x: 220, z: 0 }, vel: { x: 0, z: 0 }, radius: 90 };
  state.entities.set(obstacle.id, obstacle);
  state.entityList.push(obstacle);
  const system = Object.create(FLIGHT_UNDER_TEST);
  system.init({ state, bus });
  system.update(DT, state);
  consumePhysicsCommand(player);
  const telemetry = player._flightFrame.autopilot;
  const avoidanceSide = state.nav.autopilot._avoidanceSide;
  assert.equal(telemetry.avoiding, true,
    'capture braking must retain obstacle guidance while countering misaligned momentum');
  assert.equal(telemetry.captureBraking, true,
    'high cross-track velocity during an avoidance pass must engage capture braking');
  assert.equal(Math.sign(state.input.turnIntent), avoidanceSide,
    'avoidance guidance must continue to own desired heading while capture braking owns thrust');
  console.log('Check 4e PASSED: capture braking preserves obstacle-guidance heading authority.');
}

{
  const bus = makeBus();
  const { state, player } = makeState({
    pos: { x: 2.34877, z: 7.66702 },
    vel: { x: 1.12576, z: 3.86076 },
    target: { x: 502.28462, z: -338.93962 },
    initialDistance: 608.41,
  });
  player.radius = 14;
  const claimedSpindle = {
    id: 295,
    type: 'payload',
    alive: true,
    collides: false,
    pos: { x: 91.90555, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 10,
  };
  state.entities.set(claimedSpindle.id, claimedSpindle);
  state.entityList.push(claimedSpindle);
  const system = Object.create(FLIGHT_UNDER_TEST);
  system.init({ state, bus });
  neutralizeGeneratedAutopilotInput(state);
  system.update(DT, state);
  consumePhysicsCommand(player);
  assert.notEqual(state.nav.autopilot.status, 'avoiding',
    'the claimed non-colliding 47-A spindle must not trap B0 autopilot in obstacle avoidance');
  assert.equal(state.nav.autopilot._avoidanceSide || 0, 0,
    'non-colliding mission payloads must not establish an avoidance-side commitment');
  console.log('Check 5 PASSED: non-colliding mission payloads do not obstruct B0 autopilot.');
}

{
  const corridorForward = await runRapierAvoidanceScenario(['upper', 'lower'], { symmetricCorridor: true });
  const corridorReverse = await runRapierAvoidanceScenario(['lower', 'upper'], { symmetricCorridor: true });
  const forwardOrder = await runRapierAvoidanceScenario(['upper', 'lower', 'center']);
  const reverseOrder = await runRapierAvoidanceScenario(['center', 'lower', 'upper']);
  for (const [label, result] of [
    ['corridor-forward', corridorForward],
    ['corridor-reverse', corridorReverse],
    ['dense-forward', forwardOrder],
    ['dense-reverse', reverseOrder],
  ]) {
    assert.equal(result.avoidingSeen, true, `${label} Rapier run must encounter the blocking field`);
    assert(result.maxLateral > 125,
      `${label} Rapier run must establish physical lateral clearance: ${JSON.stringify(result)}`);
    assert.equal(result.fieldPassed, true, `${label} Rapier run must physically pass the dense field`);
    assert.equal(result.passCompleted, true, `${label} Rapier run must leave avoidance after clearing the field`);
    assert.equal(result.reaccelerated, true, `${label} Rapier run must reaccelerate after its avoidance pass`);
    assert(result.finalDistance < result.initialDistance - 600,
      `${label} Rapier run must make meaningful target progress, got ${result.finalDistance}`);
    assert.equal(result.status, 'arrived',
      `${label} Rapier run must arrive within the bounded simulation: ${JSON.stringify(result)}`);
    assert.notEqual(result.completionTick, null, `${label} Rapier run must record a bounded arrival tick`);
  }
  assert(Math.abs(forwardOrder.finalDistance - reverseOrder.finalDistance) < 8,
    'entity-list order must produce equivalent successful arrival distance');
  assert(Math.abs(forwardOrder.completionTick - reverseOrder.completionTick) < 120,
    'entity-list order must produce equivalent bounded completion time');
  assert(Math.abs(corridorForward.finalDistance - corridorReverse.finalDistance) < 8,
    'corridor entity-list order must produce equivalent successful arrival distance');
  assert(Math.abs(corridorForward.completionTick - corridorReverse.completionTick) < 120,
    'corridor entity-list order must produce equivalent bounded completion time');
  console.log('Check 4a PASSED: live V3 + Rapier clears centered corridors/dense fields, reaccelerates, and arrives.', {
    corridorForward: { completionTick: corridorForward.completionTick, maxLateral: corridorForward.maxLateral, finalDistance: corridorForward.finalDistance },
    corridorReverse: { completionTick: corridorReverse.completionTick, maxLateral: corridorReverse.maxLateral, finalDistance: corridorReverse.finalDistance },
    forward: { completionTick: forwardOrder.completionTick, maxLateral: forwardOrder.maxLateral, finalDistance: forwardOrder.finalDistance },
    reverse: { completionTick: reverseOrder.completionTick, maxLateral: reverseOrder.maxLateral, finalDistance: reverseOrder.finalDistance },
  });
}

{
  const bus = makeBus();
  const { state, player } = makeState({ target: { x: 1000, z: 0 }, vel: { x: 60, z: 0 }, initialDistance: 1000 });
  const obstacle = { id: 'centered-rock', type: 'asteroid', alive: true, pos: { x: 220, z: 0 }, vel: { x: 0, z: 0 }, radius: 90 };
  state.entities.set(obstacle.id, obstacle);
  state.entityList.push(obstacle);
  const system = Object.create(FLIGHT_UNDER_TEST);
  system.init({ state, bus });
  const lateralInputs = [];
  const turnInputs = [];
  const lateralForces = [];
  const yawTorques = [];

  for (let tick = 40; tick < 48; tick++) {
    state.tick = tick;
    neutralizeGeneratedAutopilotInput(state);
    system.update(DT, state);
    const command = consumePhysicsCommand(player).control;
    assert.equal(state.nav.autopilot.status, 'avoiding', 'centered blocker must remain in avoidance while the pass is unresolved');
    lateralInputs.push(state.input.moveX);
    turnInputs.push(state.input.turnIntent);
    lateralForces.push(command.force.z);
    yawTorques.push(command.torque.y);
  }

  const committedSign = Math.sign(lateralInputs[0]);
  assert.notEqual(committedSign, 0, 'centered blocker must select a non-zero avoidance side');
  assert(lateralInputs.every((value) => Math.sign(value) === committedSign),
    `centered-blocker lateral input must keep one escape side, got ${lateralInputs.join(', ')}`);
  assert(turnInputs.every((value) => Math.sign(value) === committedSign),
    `centered-blocker turn input must keep one escape side, got ${turnInputs.join(', ')}`);
  assert(lateralForces.every((value) => Math.sign(value) === committedSign),
    `centered-blocker lateral force must keep one escape side, got ${lateralForces.join(', ')}`);
  assert(yawTorques.every((value) => Math.sign(value) === committedSign),
    `centered-blocker yaw torque must keep one escape side, got ${yawTorques.join(', ')}`);
  console.log('Check 4b PASSED: centered-obstacle avoidance commits to one side across consecutive ticks.');
}

{
  function symmetricAvoidanceSign(order) {
    const bus = makeBus();
    const { state, player } = makeState({ target: { x: 1000, z: 0 }, vel: { x: 60, z: 0 }, initialDistance: 1000 });
    const obstacles = {
      upper: { id: 'upper-rock', type: 'asteroid', alive: true, pos: { x: 220, z: 24 }, vel: { x: 0, z: 0 }, radius: 90 },
      lower: { id: 'lower-rock', type: 'asteroid', alive: true, pos: { x: 220, z: -24 }, vel: { x: 0, z: 0 }, radius: 90 },
    };
    for (const key of order) {
      const obstacle = obstacles[key];
      state.entities.set(obstacle.id, obstacle);
      state.entityList.push(obstacle);
    }
    const system = Object.create(FLIGHT_UNDER_TEST);
    system.init({ state, bus });
    neutralizeGeneratedAutopilotInput(state);
    system.update(DT, state);
    const command = consumePhysicsCommand(player).control;
    assert.equal(state.nav.autopilot.status, 'avoiding', 'symmetric blockers must engage avoidance');
    assert(Math.abs(state.input.moveX) > 0.05, 'symmetric blockers must select an escape side instead of cancelling');
    assert(Math.abs(command.force.z) > 1, 'symmetric blockers must produce a non-zero lateral escape force');
    return Math.sign(state.input.moveX);
  }

  const forwardOrder = symmetricAvoidanceSign(['upper', 'lower']);
  const reverseOrder = symmetricAvoidanceSign(['lower', 'upper']);
  assert.equal(forwardOrder, reverseOrder, 'symmetric avoidance side must not depend on entity-list order');
  console.log('Check 4c PASSED: dense symmetric blockers choose one order-independent escape side.');
}

{
  const external = makeCenteredAvoidanceHarness();
  external.state.nav.autopilot.active = false;
  stepAutopilotHarness(external);
  assert.equal(external.state.nav.autopilot._avoidanceSide, 0,
    'externally inactive autopilot must clear its avoidance commitment on the next flight update');
  assert.equal(external.state.nav.autopilot._avoidanceTargetEntityId, '',
    'externally inactive autopilot must clear its avoidance entity context');
  assert.equal(external.state.nav.autopilot._avoidanceTargetX, null,
    'externally inactive autopilot must clear its avoidance point context');
  assert(!external.bus.events.some((event) => event.name === 'nav:autopilot' || event.name === 'toast'),
    'passive cleanup of an externally inactive course must not emit disengage events');

  const modal = makeCenteredAvoidanceHarness();
  const modalSide = modal.state.nav.autopilot._avoidanceSide;
  modal.state.ui.screenStack.push({ id: 'temporary-modal' });
  stepAutopilotHarness(modal);
  assert.equal(modal.state.nav.autopilot.active, true, 'temporary modal must not cancel an active course');
  assert.equal(modal.state.nav.autopilot._avoidanceSide, modalSide,
    'temporary modal must preserve the active pass commitment until controls return');
  assert(!modal.bus.events.some((event) => event.name === 'nav:autopilot' || event.name === 'toast'),
    'temporary modal must not emit autopilot disengage events');

  const retarget = makeCenteredAvoidanceHarness();
  const firstSide = retarget.state.nav.autopilot._avoidanceSide;
  retarget.state.nav.autopilot.target = { x: -1000, z: 0 };
  retarget.obstacle.pos.x = -220;
  stepAutopilotHarness(retarget);
  assert.equal(retarget.state.nav.autopilot._avoidanceTargetX, -1000,
    'course replacement must refresh the avoidance point context');
  assert.equal(retarget.state.nav.autopilot._avoidanceSide, -firstSide,
    'opposite replacement course must select a fresh deterministic pass side');

  const clearPass = makeCenteredAvoidanceHarness();
  clearPass.state.entities.delete(clearPass.obstacle.id);
  clearPass.state.entityList = [clearPass.player];
  stepAutopilotHarness(clearPass);
  assert.equal(clearPass.state.nav.autopilot._avoidanceSide, 0,
    'clear course must release the completed avoidance commitment');

  const manual = makeCenteredAvoidanceHarness();
  manual.player.vel.x = -180;
  manual.player.vel.z = 120;
  neutralizeGeneratedAutopilotInput(manual.state);
  manual.state.input.moveX = 0.5;
  manual.state.tick++;
  manual.system.update(DT, manual.state);
  const manualCommand = consumePhysicsCommand(manual.player);
  assert.equal(manual.state.nav.autopilot.active, false, 'manual input must stop autopilot');
  assert.equal(manual.state.nav.autopilot.status, 'manual', 'manual stop must publish its reason');
  assert.equal(manual.state.nav.autopilot._avoidanceSide, 0, 'manual stop must clear avoidance commitment');
  assert.equal(manual.state.input.brake, false,
    'high lateral/away velocity under manual input must not inherit autopilot capture braking');
  assert.equal(manual.player._flightFrame.autopilot, null,
    'manual control must not publish an autopilot capture frame after disengaging the course');
  assert(manualCommand && manualCommand.control,
    'manual counterexample must still write an ordinary V3 physics command');

  const arrival = makeCenteredAvoidanceHarness();
  arrival.player.pos.x = 975;
  arrival.player.pos.z = 0;
  arrival.player.vel.x = 0;
  arrival.player.vel.z = 0;
  stepAutopilotHarness(arrival);
  assert.equal(arrival.state.nav.autopilot.active, false, 'arrival must stop autopilot');
  assert.equal(arrival.state.nav.autopilot.status, 'arrived', 'arrival must publish arrived status');
  assert.equal(arrival.state.nav.autopilot._avoidanceSide, 0, 'arrival must clear avoidance commitment');

  const lost = makeCenteredAvoidanceHarness();
  lost.state.nav.autopilot.target = null;
  lost.state.nav.autopilot.targetEntityId = 'missing-target';
  stepAutopilotHarness(lost);
  assert.equal(lost.state.nav.autopilot.active, false, 'lost target must stop autopilot');
  assert.equal(lost.state.nav.autopilot.status, 'lost-target', 'lost target must publish its reason');
  assert.equal(lost.state.nav.autopilot._avoidanceSide, 0, 'lost target must clear avoidance commitment');

  const persisted = makeCenteredAvoidanceHarness();
  const saveSystem = Object.create(save);
  saveSystem.state = persisted.state;
  const serializedNav = saveSystem._serializeNav();
  assert.equal(serializedNav.autopilot._avoidanceSide, undefined,
    'save sanitizer must omit transient avoidance commitment');
  assert.equal(serializedNav.autopilot._avoidanceTargetX, undefined,
    'save sanitizer must omit transient avoidance context');
  const restored = makeState({ autopilotActive: false }).state;
  saveSystem.state = restored;
  saveSystem.bus = makeBus();
  saveSystem._restoreNav(serializedNav);
  assert.equal(restored.nav.autopilot._avoidanceSide, undefined,
    'loaded navigation state must not restore a stale avoidance commitment');
  assert.equal(restored.nav.autopilot._avoidanceTargetEntityId, undefined,
    'loaded navigation state must not restore stale avoidance context');
  console.log('Check 4d PASSED: avoidance lifecycle clears, suspends, retargets, and sanitizes deliberately.');
}

for (const mode of ['assisted', 'drift', 'newtonian']) {
  const cruise = runHarness({ mode, target: { x: 900, z: 0 }, initialDistance: 900 });
  assert.equal(cruise.player._flightFrame.mode, mode, `autopilot should preserve ${mode} assist profile`);
  assert(cruise.command.force.x > 0, `autopilot should thrust forward in ${mode}`);

  const brake = runHarness({ mode, vel: { x: 170, z: 0 }, target: { x: 190, z: 0 }, initialDistance: 900 });
  assert.equal(brake.player._flightFrame.mode, mode, `autopilot brake should preserve ${mode} assist profile`);
  assert(brake.state.input.brake, `autopilot should brake near arrival in ${mode}`);
  assert(brake.command.force.x < 0, `autopilot should counter-thrust near arrival in ${mode}`);
}
console.log('Check 5 PASSED: autopilot works in assisted, drift, and newtonian modes.');

{
  const vfxSrc = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
  assert.match(vfxSrc, /reverse-left/);
  assert.match(vfxSrc, /reverse-right/);
  assert.match(vfxSrc, /_emitReverseNozzleTrail/);
  console.log('Check 6 PASSED: VFX has explicit reverse-left/reverse-right nozzle rendering.');
}

{
  const h = runHarness({ autopilotActive: false, vel: { x: 110, z: 0 } });
  assert(h.command.force.x < 0, 'assisted neutral release must apply reverse counter-thrust through SG-02');
  assert.equal(h.player._flightFrame.assistReason, 'neutral-counterthrust',
    'assisted neutral release must report the neutral counter-thrust assist reason');
  const thrust = h.bus.events.find((e) => e.name === 'ship:thrust');
  assert(thrust, 'assisted neutral counter-thrust must emit ship:thrust for VFX');
  assert(thrust.payload.reverse > 0, 'assisted neutral counter-thrust must expose reverse thrust strength');
  assert(thrust.payload.nozzles.some((n) => n.role === 'reverse-left'), 'assisted counter-thrust must cue left reverse nozzle');
  assert(thrust.payload.nozzles.some((n) => n.role === 'reverse-right'), 'assisted counter-thrust must cue right reverse nozzle');
  console.log('Check 7 PASSED: assisted release counter-thrusts and lights reverse nozzles.');
}

{
  const localmapSrc = readFileSync(resolve(ROOT, 'src/ui/screens/localmap.js'), 'utf8');
  const worldSrc = readFileSync(resolve(ROOT, 'src/systems/world.js'), 'utf8');
  assert.match(localmapSrc, /_lastClickTargets\.push\(\{[\s\S]*targetEntityId:[\s\S]*pos:[\s\S]*arrivalRadius:/,
    'local map must expose object click targets with entity id, position, and arrival radius');
  assert.match(localmapSrc, /bus\.emit\('ui:setCourse'[\s\S]*targetEntityId:\s*fix\.targetEntityId[\s\S]*autopilot:\s*true/,
    'local map clicks must emit ui:setCourse with autopilot armed');
  assert.match(worldSrc, /this\.state\.nav\.autopilot\s*=\s*\{[\s\S]*active:\s*payload\.autopilot !== false[\s\S]*targetEntityId[\s\S]*arrivalRadius[\s\S]*status:\s*'armed'/,
    'world ui:setCourse handler must turn map selections into live nav.autopilot state');
  console.log('Check 8 PASSED: local-map object clicks arm the live autopilot course.');
}

{
  const bus = makeBus();
  const state = {
    nav: {
      route: { legs: [{ from: 'old', to: 'route', fuel: 1 }] },
      autoTravel: true,
      waypoint: null,
      autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' },
    },
  };
  const worldSystem = Object.create(world);
  worldSystem.state = state;
  worldSystem.bus = bus;
  const armed = worldSystem._onSetCourse({
    pos: { x: 333, z: -44 },
    targetEntityId: 'rock_42',
    label: 'Rock 42',
    waypointKind: 'asteroid',
    arrivalRadius: 77,
    autopilot: true,
  });
  assert.equal(armed, state.nav.autopilot, 'world handler must return the live nav.autopilot object');
  assert.equal(state.nav.route, null, 'map-object autopilot must clear the multi-sector route');
  assert.equal(state.nav.autoTravel, false, 'map-object autopilot must disable route autotravel');
  assert.deepEqual(state.nav.autopilot.target, { x: 333, z: -44 }, 'map-object autopilot must preserve the clicked fix');
  assert.equal(state.nav.autopilot.targetEntityId, 'rock_42', 'map-object autopilot must preserve targetEntityId');
  assert.equal(state.nav.autopilot.label, 'Rock 42', 'map-object autopilot must preserve target label');
  assert.equal(state.nav.autopilot.arrivalRadius, 77, 'map-object autopilot must preserve arrival radius');
  assert.equal(state.nav.autopilot.status, 'armed', 'map-object autopilot must enter armed status');
  assert.equal(state.nav.waypoint.targetEntityId, 'rock_42', 'map-object autopilot must mirror targetEntityId onto waypoint');
  assert(bus.events.some((e) => e.name === 'nav:autopilot' && e.payload === state.nav.autopilot),
    'map-object autopilot must emit nav:autopilot with the live object');
  console.log('Check 9 PASSED: ui:setCourse map-object events produce live nav.autopilot state.');
}

console.log('--- ALL V3 AUTOPILOT CHECKS PASSED ---');
