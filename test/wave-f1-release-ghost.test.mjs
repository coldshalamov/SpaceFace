// §22 F1 — a taut line on a lighter body previews that body's live coast, then clears on release.
import assert from 'node:assert/strict';
import test from 'node:test';

import { payloadReleaseGhost } from '../src/presentation/releaseGhost.js';
import { masslineTelemetry } from '../src/systems/masslineTelemetry.js';

function pair({ phase, playerMass, payloadMass, vx, vz }) {
  const player = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: playerMass };
  const payload = { id: 2, pos: { x: 40, z: 0 }, vel: { x: vx, z: vz }, mass: payloadMass };
  const state = {
    playerId: 1,
    tick: 10,
    simTime: 1,
    player: { tether: { active: true, phase, targetId: 2, restLength: 40, strain: 0.2, load: 0.2 } },
    entities: new Map([[1, player], [2, payload]]),
  };
  return { state, player, payload };
}

function angleDelta(a, b) {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

test('the ghost first segment matches the lighter body velocity and adds no speed', () => {
  const { state, payload } = pair({ phase: 'loaded', playerMass: 80, payloadMass: 12, vx: 0, vz: 48 });
  const vx = payload.vel.x;
  const vz = payload.vel.z;
  const ghost = payloadReleaseGhost(state);
  assert.ok(ghost && ghost.active);
  const ghostAngle = Math.atan2(ghost.z1 - ghost.z0, ghost.x1 - ghost.x0);
  const velAngle = Math.atan2(vz, vx);
  assert.ok(angleDelta(ghostAngle, velAngle) < 0.05, `ghost drifted ${angleDelta(ghostAngle, velAngle)}`);
  assert.equal(ghost.addsSpeed, false);
  assert.equal(payload.vel.x, vx);
  assert.equal(payload.vel.z, vz);
});

test('releasing the line clears the ghost on that tick', () => {
  const { state } = pair({ phase: 'loaded', playerMass: 80, payloadMass: 12, vx: 10, vz: 30 });
  const sys = Object.create(masslineTelemetry);
  sys.init({ state, bus: null });
  sys.update(1 / 60, state);
  assert.equal(state.player.masslineTelemetry.payloadReleaseGhost.active, true);
  state.player.tether.phase = 'slack';
  sys.update(1 / 60, state);
  assert.equal(state.player.masslineTelemetry.payloadReleaseGhost, null);
});

test('a heavy anchor does not draw a ghost for the body that will move', () => {
  const { state } = pair({ phase: 'overload', playerMass: 14, payloadMass: 120, vx: 0, vz: 40 });
  assert.equal(payloadReleaseGhost(state), null);
});
