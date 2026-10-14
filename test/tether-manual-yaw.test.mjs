import assert from 'node:assert/strict';
import test from 'node:test';
import { flightV3 } from '../src/systems/flightV3.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { ORBIT_ASSIST_TUNING_V1 } from '../src/core/flight/orbitAssist.js';

const DT = 1 / 60;

function fixture({ direction = 1, radius = 120, speed = 30, rot = Math.PI / 2,
  forward = 1, turn = direction } = {}) {
  const player = { id: 'player', type: 'ship', alive: true,
    pos: { x: radius, z: 0 }, vel: { x: 0, z: speed * direction }, rot, angVel: 0,
    mass: 20, radius: 10, maxSpeed: 180, flags: {}, data: {},
    physicsBody: { mass: 20, inertiaY: 100, radius: 10 } };
  const anchor = { id: 'anchor', type: 'asteroid', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 2000, radius: 40 };
  const state = { mode: 'flight', tick: 20, simTime: 1, playerId: player.id,
    player: { tether: { active: true, targetId: anchor.id, restLength: radius, phase: 'loaded' } },
    settings: { gameplay: { physicsBackend: 'rapier-dynamic', orbitAssistStrength: 'standard' },
      controls: { flightMode: 'assisted' } },
    input: { moveX: 0, moveZ: forward, turnIntent: turn, boost: false, brake: false,
      actions: { massline: { lineControl: false, lineLength: 0, orbitDirection: 0 }, throwArm: false } },
    ui: { screenStack: [] }, world: {}, nav: {}, flight: { mode: 'manual' },
    entities: new Map([[player.id, player], [anchor.id, anchor]]), entityList: [player, anchor] };
  const system = Object.create(flightV3);
  system.init({ state, bus: { on() { return () => {}; }, emit() {} } });
  const step = () => {
    system.update(DT, state);
    state.tick++;
    state.simTime += DT;
    return { command: consumePhysicsCommand(player), assist: player._flightFrame.orbitAssist };
  };
  return { state, player, step };
}

test('live forward-plus-turn reversal immediately obeys the held key across the heading wrap', () => {
  for (const direction of [-1, 1]) {
    const run = fixture({ direction, rot: direction * Math.PI / 2, radius: 30, speed: 150 });
    run.step();
    run.state.input.turnIntent = -direction;
    const reversed = run.step();
    assert.equal(Math.sign(reversed.command.control.torque.y), -direction,
      'the next physics command must turn toward the reversed key, not the old orbit');
    assert.equal(reversed.assist.active, false, 'countersteering belongs to the pilot');
  }
});

test('a backwards-facing tether never takes the full heading away from manual yaw', () => {
  for (const direction of [-1, 1]) {
    const run = fixture({ direction, rot: -direction * Math.PI / 2 });
    const result = run.step();
    assert.equal(result.assist.active, false, 'a 180-degree tangent capture is not a small correction');
    assert.equal(Math.sign(result.command.control.torque.y), direction);
  }
});

test('near-tangent orbital trim remains useful, bounded, and inside the hull yaw authority', () => {
  for (const direction of [-1, 1]) {
    const run = fixture({ direction, rot: direction * (Math.PI / 2 - 0.15) });
    const { assist } = run.step();
    assert.equal(assist.active, true);
    assert.equal(Math.sign(assist.desiredYawRate), direction);
    assert.ok(Math.abs(assist.alignmentYawRate)
      <= assist.hullMaxYawRate * ORBIT_ASSIST_TUNING_V1.maxHeadingCorrectionRateFraction + 1e-9);
    assert.equal(assist.maxYawRate, assist.hullMaxYawRate);
    assert.equal(assist.lentYawRate, null);
    const fast = fixture({ direction, rot: direction * Math.PI / 2, radius: 30, speed: 150 }).step();
    assert.ok(Math.abs(fast.assist.desiredYawRate) <= fast.assist.hullMaxYawRate + 1e-9,
      'the rope does not change the fitted hull turn rate');
  }
});

test('turn without forward and opposite-key recovery remain direct manual commands', () => {
  for (const direction of [-1, 1]) {
    const run = fixture({ direction, rot: direction * Math.PI / 2 });
    run.step();
    run.state.input.moveZ = 0;
    for (const turn of [-direction, direction, 0]) {
      run.state.input.turnIntent = turn;
      const result = run.step();
      if (turn !== 0) {
        assert.equal(result.assist.active, false);
        assert.equal(Math.sign(result.command.control.torque.y), turn);
      } else {
        assert.equal(result.assist.carry, true, 'unsteered carry follows actual swing without heading capture');
        assert.ok(Math.abs(result.assist.desiredYawRate - direction * 30 / 120) < 1e-9);
      }
    }
  }
});
