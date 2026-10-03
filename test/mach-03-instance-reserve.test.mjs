// INFERENCE MACH-03: "Instance buffers reserve capacity on arrival so population spikes do not
// rebuild the matrix buffer."
//
// Contract: on arrival the renderer censuses the field and calls
// reserveAsteroidInstanceCapacity with the roster count (plus the residency byte ceiling) —
// the bucket mesh is born at roster size, so registering the full roster never triggers a
// power-of-two instanceMatrix rebuild mid-round. The control pool proves the counter counts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  createAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  reserveAsteroidInstanceCapacity,
} from '../src/render/asteroidInstancePool.js';

const RENDERER_SOURCE = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const ROSTER = 500; // Ceres-scale census: 5 variants × 100 rocks — past the 64-slot birth capacity
const PER_VARIANT = 100;

function makeCommonRock(id, variant, geometry, material) {
  const root = new THREE.Group();
  const leaf = new THREE.Mesh(geometry, material);
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = variant;
  root.userData.asteroidInstanceBody = leaf;
  root.add(leaf);
  return { entity: { id, type: 'asteroid' }, root };
}

function registerRoster(pool, geometry, material) {
  let nextId = 1;
  let registered = 0;
  for (let variant = 0; variant < 5; variant += 1) {
    for (let i = 0; i < PER_VARIANT; i += 1) {
      const rock = makeCommonRock(nextId++, variant, geometry, material);
      if (registerAsteroidBaseLeaf(pool, rock.entity, rock.root)) registered += 1;
    }
  }
  return registered;
}

test('the arrival census calls the reserve with the roster count and the residency ceiling', () => {
  // Both call sites (first-flight census + per-sector reserve) must pass the field's total
  // roster, not a guess — a wrong count is the defect this line exists to keep out.
  const calls = RENDERER_SOURCE.match(/reserveAsteroidInstanceCapacity\(pool,\s*requiredByVariant,\s*\{[^}]*\}\)|reserveAsteroidInstanceCapacity\(this\._asteroidInstancePool,\s*requiredByVariant,\s*\{[^}]*\}\)/gs);
  assert.ok(calls && calls.length >= 2, 'both arrival reserve sites are live');
  for (const call of calls) {
    assert.match(call, /rosterCount/, 'the roster count is handed to the reserve');
    assert.match(call, /byteCeiling:\s*GOVERNOR_RESIDENCY_BYTE_CEILING/, 'the reserve stays inside the residency ceiling');
  }
});

test('a roster-sized reserve registers the whole field with zero power-of-two rebuilds', () => {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshStandardMaterial();
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);

  const reserved = reserveAsteroidInstanceCapacity(pool, [100, 100, 100, 100, 100], {
    rosterCount: ROSTER,
    byteCeiling: Number.POSITIVE_INFINITY,
  });
  assert.equal(reserved, true);
  assert.equal(pool.stats.reservedRosterCount, ROSTER, 'the roster count is stamped');
  assert.equal(pool.stats.reservedCapacityCount, ROSTER, 'every variant bucket reserved its share');

  assert.equal(registerRoster(pool, geometry, material), ROSTER);
  assert.equal(pool.stats.powerOfTwoRebuilds, 0,
    'the reserve pre-sized every bucket — no mid-round matrix rebuild');
});

test('without the reserve the same roster rebuilds — the counter is live, not decorative', () => {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const material = new THREE.MeshStandardMaterial();
  const pool = createAsteroidInstancePool(new THREE.Scene());
  assert.equal(registerRoster(pool, geometry, material), ROSTER);
  assert.ok(pool.stats.powerOfTwoRebuilds >= 5,
    `an unreserved pool pays a rebuild chain (got ${pool.stats.powerOfTwoRebuilds}) — the pin would catch a missing reserve`);
});

test('the reserve honors the residency byte ceiling instead of reserving blindly', () => {
  const pool = createAsteroidInstancePool(new THREE.Scene());
  // 64 bytes per slot; a 640-byte ceiling affords 10 slots, not 40.
  const reserved = reserveAsteroidInstanceCapacity(pool, [40, 40, 40, 40, 40], {
    rosterCount: ROSTER,
    byteCeiling: 640,
  });
  assert.equal(reserved, true, 'an affordable slice still reserves');
  assert.ok(pool.stats.reservedCapacityCount <= 10, 'the ceiling bounds total reserved slots');
});
