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
import { save } from '../src/save/saveSystem.js';
import { flightV3 as workspaceFlightV3 } from '../src/systems/flightV3.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;
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

console.log('--- V3 AUTOPILOT ACCEPTANCE ---');

{
  const h = runHarness({ target: { x: 1200, z: 0 }, initialDistance: 1200 });
  assert(h.command.force.x > 0, 'clear-course autopilot must thrust toward the selected map fix');
  assert.equal(h.state.input.boost, true, 'clear-course autopilot must request boost on a long aligned route');
  assert.equal(h.player.flags.boosting, true, 'autopilot boost must flow through the normal boost resource gate');
  assert.equal(h.state.nav.autopilot.status, 'boosting', 'autopilot status must expose boosting');
  console.log('Check 1 PASSED: clear route thrusts and boosts through live V3.');
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
  neutralizeGeneratedAutopilotInput(manual.state);
  manual.state.input.moveX = 0.5;
  manual.state.tick++;
  manual.system.update(DT, manual.state);
  consumePhysicsCommand(manual.player);
  assert.equal(manual.state.nav.autopilot.active, false, 'manual input must stop autopilot');
  assert.equal(manual.state.nav.autopilot.status, 'manual', 'manual stop must publish its reason');
  assert.equal(manual.state.nav.autopilot._avoidanceSide, 0, 'manual stop must clear avoidance commitment');

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
