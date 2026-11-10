// Rows 509/510/511: deterministic rock substances, tiered fracture, and the ladder census.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ROCK_SUBSTANCES, rockSubstanceFor, rockSubstanceForSlot, applyRockSubstance,
  rockTierForRadius, ROCK_LADDER_RADII, ROCK_LADDER_MIN_PER_TIER,
} from '../src/data/rockSubstances.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';

test('rock substance catalog is deterministic and complete', () => {
  const ids = Object.keys(ROCK_SUBSTANCES);
  assert.ok(ids.length >= 6, `expected >=6 substances, got ${ids.length}`);
  for (const s of Object.values(ROCK_SUBSTANCES)) {
    assert.ok(typeof s.densityMult === 'number' && s.densityMult > 0);
    assert.ok(typeof s.restitution === 'number');
    assert.ok(typeof s.breakSpeed === 'number' && s.breakSpeed > 0);
  }
  // slot pick is stable per seed/field/slot and lands on a real substance
  const a = rockSubstanceForSlot('seed-1', 'f_ceres_1', 7);
  const b = rockSubstanceForSlot('seed-1', 'f_ceres_1', 7);
  assert.equal(a, b);
  assert.ok(rockSubstanceFor(a));
});

test('applyRockSubstance stamps identity; physics uses substance restitution only when unauthored', () => {
  const data = {};
  const sub = rockSubstanceFor('ice');
  const density = applyRockSubstance(data, 'ice');
  assert.ok(density > 1 || density > 0);
  assert.equal(data.substance, 'ice');
  // unauthored contact -> substance restitution applies
  const spec = resolvePhysicsBodySpec({ type: 'asteroid', radius: 10, mass: 100, data });
  assert.equal(spec.contact.restitution, sub.restitution);
  // explicit contact override wins over substance default
  const spec2 = resolvePhysicsBodySpec({
    type: 'asteroid', radius: 10, mass: 100, data,
    physicsBody: { schemaVersion: 1, mass: 100, radius: 10, contact: { restitution: 0.91 } },
  });
  assert.equal(spec2.contact.restitution, 0.91);
});

test('ladder radii map to distinct tiers T0-T4', () => {
  assert.deepEqual(ROCK_LADDER_RADII.map(rockTierForRadius), [0, 1, 2, 3, 4]);
  assert.equal(rockTierForRadius(4), 0);
  assert.equal(rockTierForRadius(9), 1);
  assert.equal(rockTierForRadius(17), 2);
  assert.equal(rockTierForRadius(27), 3);
  assert.equal(rockTierForRadius(41), 4);
});

test('rock census: every stocked sector holds the T0-T4 ladder floor', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = execFileSync('node', ['scripts/rock-census.mjs'], { cwd: repo, encoding: 'utf8' });
  assert.match(out, /OK — every stocked sector/);
  assert.ok(ROCK_LADDER_MIN_PER_TIER >= 6);
});
