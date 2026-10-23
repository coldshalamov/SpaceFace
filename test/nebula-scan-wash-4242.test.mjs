import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { writeHazardPresence } from '../src/data/hazardLanguage.js';
import { NEBULA_SCAN_MULT, nebulaScanMult, scannerProfileForState } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';

function pilot() {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  const player = { id: 1, alive: true, pos: { x: 0, y: 0, z: 0 } };
  state.playerId = 1;
  state.entities.set(1, player);
  state.world.activeSector = state.world.activeSector || {};
  return { state, player };
}

test('seed 4242 a nebula washes the hull scanner and leaves the fitting alone', () => {
  const { state } = pilot();
  const clear = scannerProfileForState(state);
  assert.equal(nebulaScanMult(state), 1);
  state.world.hazardPresence = { nebula: true, radiation: false };
  const washed = scannerProfileForState(state);
  assert.equal(washed.wash, NEBULA_SCAN_MULT);
  assert.ok(Math.abs(washed.nearRadius / clear.nearRadius - NEBULA_SCAN_MULT) < 1e-9);
  assert.equal(washed.radiusMult, clear.radiusMult);
  state.world.hazardPresence = { nebula: false, radiation: true };
  const hot = scannerProfileForState(state);
  assert.equal(hot.nearRadius, clear.nearRadius);
});

test('seed 4242 the live hazard tick records nebula only while the hull is inside', () => {
  const { state, player } = pilot();
  const nebula = { type: 'nebula', center: { x: 0, z: 0 }, radius: 400, intensity: 0.5 };
  const far = { type: 'nebula', center: { x: 5000, z: 0 }, radius: 100, intensity: 0.5 };
  state.world.activeSector.hazards = [nebula, far];
  const host = {
    bus: { emit() {} },
    _hazardSet: new Set(),
    _hazardNextSet: new Set(),
    _resolveMovingHazards() {},
    _emitHazardPresence() {},
    _hazardEffectiveIntensity() { return 0.5; },
    _applyRadiationTick() {},
  };
  world._tickHazards.call(host, 1 / 60, state);
  assert.equal(state.world.hazardPresence.nebula, true);
  assert.equal(state.world.hazardPresence.radiation, false);
  player.pos.x = 2000;
  player.pos.z = 2000;
  world._tickHazards.call(host, 1 / 60, state);
  assert.equal(state.world.hazardPresence.nebula, false);
  const slot = { nebula: true, radiation: true };
  writeHazardPresence([{ type: 'nebula_fog', center: { x: 10, z: 10 }, radius: 30 }], { x: 10, z: 10 }, slot);
  assert.equal(slot.nebula, true);
  assert.equal(slot.radiation, false);
});
