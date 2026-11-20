// HARMONY-FIX 3 (R23): being hit never changes how the ship steers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

test('a cruise drop from a hit leaves the yaw profile exactly as it was', () => {
  const entity = { id: 1, driveId: 'drive_reaction_s' };
  const state = { playerId: 1, player: { cruise: { phase: 'off', t: 0, stumbleT: 0, stumbleCdT: 0 } }, settings: {} };
  const before = resolvePropulsionProfile(entity, state);
  // Even a save that still carries a live stumble timer must not nerf the stick.
  state.player.cruise.stumbleT = 0.5;
  const after = resolvePropulsionProfile(entity, state);
  assert.equal(after.maxYawRate, before.maxYawRate, 'yaw rate unchanged after a hit-drop');
  assert.equal(after.yawAccel, before.yawAccel);
  assert.equal(after.yawBrake, before.yawBrake);
});
