// Production V3 autopilot acceptance: local-map nav autopilot must drive the live
// rapier-dynamic flight adapter, not the legacy flight.js controller.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DT = 1 / 60;

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
  const system = Object.create(flightV3);
  system.init({ state, bus });
  system.update(DT, state);
  const command = consumePhysicsCommand(player);
  assert(command && command.control, 'flightV3 must write an SG-02 physics control command');
  return { bus, state, player, command: command.control };
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
  const system = Object.create(flightV3);
  system.init({ state, bus });
  system.update(DT, state);
  const command = consumePhysicsCommand(player).control;
  assert.equal(state.nav.autopilot.status, 'avoiding', 'blocking obstacle must put autopilot in avoiding status');
  assert(Math.abs(state.input.moveX) > 0.05 || Math.abs(command.force.z) > 1,
    'blocking obstacle must produce lateral avoidance input/force');
  console.log('Check 4 PASSED: obstacle avoidance steers around a blocking body.');
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
