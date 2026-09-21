import test from 'node:test';
import assert from 'node:assert/strict';
import { vfx } from '../src/render/vfx.js';
import { resolveActuatorScale } from '../src/render/rcsJets.js';

// INF-046 — thrusters explain the maneuver for every ship, not just the player. The
// propulsion kernel publishes applied acceleration into each stepped entity's _flightFrame;
// the renderer used to throw the NPC block away (player-only gate) and fall back to
// speed-derived glow, so a braking NPC showed forward thrust into its own brake.

function makeShip(id, vel, rot, frame) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { ...vel },
    rot,
    angVel: 0,
    radius: 12,
    mass: 60,
    flags: {},
    presentation: null,
    _flightFrame: { ...frame },
  };
}

function driveSystem() {
  const player = makeShip(1, { x: 0, z: 0 }, 0, {});
  const system = Object.create(vfx);
  system.state = {
    playerId: 1,
    player: { cruise: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    input: {},
    settings: { video: {} },
    flightRuntime: {},
  };
  system._actuatorScratch = {};
  system._rcsScaleCache = new Map();
  system._rcsDefaultScale = resolveActuatorScale(null);
  system._plumeDashPending = false;
  return system;
}

test('INF-046: a braking NPC reads reverse on its applied axis, main bell dark', () => {
  const system = driveSystem();
  // Nose +X, travelling +X at 60, drive spending 30 WU/s^2 against its own velocity.
  const npc = makeShip(7, { x: 60, z: 0 }, 0, { acceleration: { x: -30, z: 0 }, throttle: 0 });
  const actuators = system._actuatorsFor(npc);
  assert.ok(actuators, 'NPC applied acceleration is no longer discarded');
  assert.ok(actuators.reverse > 1, `reverse demand present (${actuators.reverse})`);
  assert.equal(actuators.main, 0, 'no forward demand while braking');
  const drive = system._engineDriveFor(npc);
  assert.ok(drive.reverse > 0.05, 'reverse crosses the retro threshold');
  assert.equal(drive.retroOnly, true, 'retros own the picture');
  assert.ok(drive.brake > 0.1, 'brake continuum engages');
  assert.equal(drive.drive, 0, 'main nozzle dark at speed — no thrust-into-brake');
});

test('INF-046: a thrusting NPC keeps a lit main bell and no brake', () => {
  const system = driveSystem();
  const npc = makeShip(7, { x: 20, z: 0 }, 0, { acceleration: { x: 25, z: 0 }, throttle: 0.6 });
  const drive = system._engineDriveFor(npc);
  assert.equal(drive.retroOnly, false);
  assert.ok(drive.reverse <= 0.05);
  assert.equal(drive.brake, 0, 'no brake while the pilot-equivalent commands forward');
  assert.ok(drive.throttle > 0.05 && drive.drive > 0, 'commanded thrust lights the bell');
});

test('INF-046: a legacy NPC frame without acceleration keeps the old fallback', () => {
  const system = driveSystem();
  const npc = makeShip(7, { x: 60, z: 0 }, 0, { throttle: 0 });
  assert.equal(system._actuatorsFor(npc), null, 'nothing applied, nothing claimed');
  const drive = system._engineDriveFor(npc);
  assert.ok(drive.drive >= 0, 'speed-derived fallback still answers');
});

test('INF-046: the player still reads the richer runtime telemetry first', () => {
  const system = driveSystem();
  const runtimeActuators = { main: 5, reverse: 0, lateral: 0, yaw: 0 };
  system.state.flightRuntime = { telemetry: { actuators: runtimeActuators } };
  const player = system.state.entities.get(1);
  assert.equal(system._actuatorsFor(player), runtimeActuators, 'player runtime block wins');
  assert.equal(system._actuatorsFor(null), runtimeActuators, 'null entity keeps the old lookup');
});
