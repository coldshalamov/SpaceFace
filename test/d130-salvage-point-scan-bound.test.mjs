import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { salvage } from '../src/systems/salvage.js';

// D130 (sustained Adventure flight): code-judgment waste reduction. The salvage-point
// fallback must visit at most the live wrecks bucket — never a whole-map walk past
// rocks/ships/projectiles. Structural proof: deterministic visit counter, no timing.
function buildWorld({ rocks = 60, ships = 10, projectiles = 20 } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [salvage] });
  const { state } = sim;
  state.mode = 'flight';
  const spawns = [];
  for (let i = 0; i < rocks; i++) {
    spawns.push(sim.spawn({
      type: 'asteroid', pos: { x: 100 + i * 11, z: 200 }, radius: 8,
      hull: 50, hullMax: 50, data: {},
    }));
  }
  for (let i = 0; i < ships; i++) {
    spawns.push(sim.spawn({
      type: 'ship', team: 2, pos: { x: -100 - i * 13, z: -200 }, radius: 10,
      hull: 100, hullMax: 100, data: {},
    }));
  }
  for (let i = 0; i < projectiles; i++) {
    spawns.push(sim.spawn({
      type: 'projectile', pos: { x: 300 + i * 5, z: -400 }, radius: 1, data: {},
    }));
  }
  const wreck = sim.spawn({
    type: 'wreck', pos: { x: 0, z: 0 }, radius: 9, mass: 1800, hull: 1, hullMax: 1,
    data: { salvagePointId: 'd130:point', salvagePool: { cmdty_scrap_metal: 3 }, salvageTimeLeft: 8 },
  });
  assert.ok(wreck && wreck.id != null);
  return { sim, state, wreck, nonWrecks: rocks + ships + projectiles };
}

test('D130: salvage-point lookup answers from the wrecks bucket', () => {
  const { state } = buildWorld();
  const sys = Object.create(salvage);
  sys.state = state;
  if (typeof sys._ensureState === 'function') sys._ensureState();
  const found = sys._entityForPoint('d130:point');
  assert.ok(found && found.type === 'wreck');
  const visited = state.salvage && state.salvage.lastPointScanVisits;
  assert.ok(Number.isInteger(visited), `expected a visit counter, got ${visited}`);
  assert.ok(visited <= 8, `wreck-bucket visits bounded (got ${visited})`);
});

test('D130: salvage-point miss does not walk the whole map', () => {
  const { state, nonWrecks } = buildWorld({ rocks: 120, ships: 20, projectiles: 40 });
  const sys = Object.create(salvage);
  sys.state = state;
  if (typeof sys._ensureState === 'function') sys._ensureState();
  const found = sys._entityForPoint('d130:absent');
  assert.equal(found, null);
  const visited = state.salvage && state.salvage.lastPointScanVisits;
  assert.ok(Number.isInteger(visited), `expected a visit counter, got ${visited}`);
  assert.ok(visited < nonWrecks, `miss visits ${visited} < non-wreck bodies ${nonWrecks}`);
  assert.ok(visited <= 8, `miss visits bounded (got ${visited})`);
});
