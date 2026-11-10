// Owner contract 2026-09-08: ink is steering intent, NOT a speed-limited rail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoTargetRuntime, tickAutoTarget } from '../src/combat/autoTargetMode.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { applyAutoTargetHelmProfile, applyAutoTargetPathProfile } from '../src/systems/flightV3.js';

const DT = 1 / 60;
function rig(points) {
  const player = { id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass: 1, inertia: 1,
    data: {}, maxSpeed: 120 };
  const state = { mode: 'flight', simTime: 0, playerId: 1, entities: new Map([[1, player]]),
    player: { targetId: null }, input: { autoFire: true, aimWorld: { x: 0, z: 0 },
      actions: {}, autoTargetPath: { active: true, drawing: false, points, pointIndex: 1 } } };
  const profile = applyAutoTargetPathProfile(applyAutoTargetHelmProfile(resolvePropulsionProfile(player, state)));
  player.vel.x = profile.combatSpeed;
  const runtime = createAutoTargetRuntime();
  let propulsion = createPropulsionRuntime(profile);
  const trace = [];
  function step(n) {
    for (let i = 0; i < n; i++) {
      state.input.moveX = state.input.moveZ = state.input.turnIntent = 0;
      state.input.brake = false;
      tickAutoTarget(state, DT, null, runtime);
      const result = stepPropulsion({ dt: DT, body: player, profile, runtime: propulsion,
        input: { ...state.input, throttle: state.input.moveZ, strafe: state.input.moveX,
          turn: state.input.turnIntent, assistMode: 'assisted' } });
      propulsion = result.runtime;
      player.vel.x += result.force.x / player.mass * DT;
      player.vel.z += result.force.z / player.mass * DT;
      player.angVel += result.torque.y / player.inertia * DT;
      player.rot += player.angVel * DT;
      player.pos.x += player.vel.x * DT;
      player.pos.z += player.vel.z * DT;
      state.simTime += DT;
      trace.push({ t: state.simTime, ...player.pos, speed: Math.hypot(player.vel.x, player.vel.z),
        heading: Math.atan2(player.vel.z, player.vel.x), brake: state.input.brake,
        progress: runtime.path?.progressS ?? 0, command: state.input.drawFlight?.heading });
    }
  }
  return { player, state, profile, runtime, trace, step };
}

test('a 90-degree dodge preserves cruise speed instead of braking into the ink', () => {
  const r = rig([{ x: 0, z: 0 }, { x: 55, z: 0 }, { x: 55, z: 180 }]);
  r.step(120);
  const min = Math.min(...r.trace.map(p => p.speed)) / r.profile.combatSpeed;
  assert.ok(min >= 0.98, `corner speed floor ${min.toFixed(3)} of cruise`);
  assert.ok(r.player.vel.z > 0.90 * r.profile.combatSpeed, 'actually executes the turn');
  assert.ok(r.trace.every(p => !p.brake), 'geometry never presses the brake');
});

test('a short flick is a heading, not a destination at which to park', () => {
  const r = rig([{ x: 0, z: 0 }, { x: 6, z: 0 }]);
  r.step(180);
  assert.ok(r.player.pos.x > 2.9 * r.profile.combatSpeed, 'keeps flying after ink runs out');
  assert.ok(Math.hypot(r.player.vel.x, r.player.vel.z) >= r.profile.combatSpeed * 0.98);
});

test('a reversal turns at speed without first nulling forward momentum', () => {
  const r = rig([{ x: 0, z: 0 }, { x: -200, z: 0 }]);
  r.step(150);
  assert.ok(Math.min(...r.trace.map(p => p.speed)) >= r.profile.combatSpeed * 0.98);
  assert.ok(r.player.vel.x < -0.95 * r.profile.combatSpeed, 'reversal completed');
});
