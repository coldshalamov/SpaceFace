import assert from 'node:assert/strict';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { flightV3 } from '../src/systems/flightV3.js';

function craft(partial = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 12, z: 0 },
    rot: 0,
    bank: 0,
    radius: 6,
    mass: 40,
    flags: { docked: false, boosting: false, defeated: false },
    data: { derived: { flightModel: { inertia: 8 } } },
    ...partial,
  };
}

function tick(player) {
  const state = {
    playerId: player.id,
    mode: 'flight',
    tick: 1,
    simTime: 1,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    settings: { gameplay: { physicsBackend: 'rapier-dynamic' } },
    input: { thrust: 1, yaw: 0, strafe: 0, boost: false },
    ui: { screenStack: [] },
    player: {},
  };
  const sys = Object.create(flightV3);
  sys.state = state;
  sys.bus = { emit() {}, on() { return () => {}; } };
  sys._diag = {};
  sys._warnedBackend = true;
  sys.update(1 / 60, state);
  return consumePhysicsCommand(player);
}

test('a live player still receives a flight physics command', () => {
  const command = tick(craft());
  assert.ok(command && command.control, 'live wreck-free hull must still step');
});

test('a dead player wreck does not receive a flight physics command', () => {
  const dead = craft({ alive: false, flags: { docked: false, boosting: false, defeated: true } });
  const command = tick(dead);
  assert.equal(command, null);
});

test('a recovered hull flies again once alive and not defeated', () => {
  const recovered = craft({ alive: false, flags: { docked: false, boosting: false, defeated: true } });
  recovered.alive = true;
  delete recovered.flags.defeated;
  const command = tick(recovered);
  assert.ok(command && command.control, 'recovery must restore flight stepping');
});
