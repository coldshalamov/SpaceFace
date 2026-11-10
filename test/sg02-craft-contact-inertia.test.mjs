import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

test('early ship-stat imports fall back before census load and recompute after it', () => {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = String.raw`
    process.getBuiltinModule = undefined;
    const { getDerivedStats, makeShipEntitySpec } = await import('./src/systems/ships.js');
    const { isModelTruthCensusLoaded, loadModelTruthCensus } = await import('./src/data/modelTruth.js');
    const beforeReady = isModelTruthCensusLoaded();
    const early = makeShipEntitySpec('ship_kestrel').flightModel.inertia;
    await loadModelTruthCensus();
    const afterReady = isModelTruthCensusLoaded();
    const late = makeShipEntitySpec('ship_kestrel').flightModel.inertia;
    const direct = getDerivedStats('ship_kestrel').flightModel.inertia;
    console.log(JSON.stringify({ beforeReady, early, afterReady, late, direct }));
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(run.status, 0, run.stderr || 'cold-import child should exit successfully');
  const observed = JSON.parse(run.stdout.trim());
  assert.equal(observed.beforeReady, false, 'the child starts before browser-style census readiness');
  assert.ok(Number.isFinite(observed.early) && observed.early > 0,
    'ship stats remain synchronously available before the census is loaded');
  assert.equal(observed.afterReady, true, 'the explicit census load establishes readiness');
  assert.ok(observed.late > observed.early * 10,
    'post-load stats replace the temporary fallback with measured-hull inertia');
  assert.equal(observed.direct, observed.late,
    'synchronous derived-stat reads share the post-load measured value');
});

async function collideAtSpeed(speed, id) {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const ship = {
    ...makeShipEntitySpec('ship_kestrel', { isPlayer: false, pos: { x: -48, z: 5 } }),
    id,
    vel: { x: speed, z: 0 },
    angVel: 0,
  };
  const rock = {
    id: id + 1,
    type: 'asteroid',
    radius: 10,
    mass: 1e6,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1, dynamic: false, mass: 1e6, radius: 10,
      inertiaY: 1e6, ccd: false, revision: 0,
    },
  };
  const entities = [rock, ship];
  owner.syncFromEntities(entities);
  const record = owner.records.get(id);
  const initialVelocity = { ...ship.vel };
  let contacted = false;
  try {
    for (let tick = 0; tick < 300; tick += 1) {
      writePhysicsControl(ship, { source: 'contact-inertia-fixture', mode: 'tumbling' });
      owner.step(1 / 60, entities);
      const nativeAngular = record.body.angvel();
      if (Math.abs(nativeAngular.y) > 1e-4) {
        contacted = true;
        break;
      }
    }
    const nativeAngular = record.body.angvel();
    return {
      contacted,
      inertia: record.spec.inertiaY,
      mass: record.spec.mass,
      colliders: record.colliders.length,
      initialSpeed: Math.hypot(initialVelocity.x, initialVelocity.z),
      finalSpeed: Math.hypot(ship.vel.x, ship.vel.z),
      gameYawRate: ship.angVel,
      nativeYawRate: -nativeAngular.y,
    };
  } finally {
    owner.dispose();
  }
}

test('measured Kestrel hull inertia resists glancing spin while heavy impacts keep their force', async () => {
  const priorTumbleFling = COMBAT_FLAGS.tumbleFling;
  COMBAT_FLAGS.tumbleFling = true;
  try {
    const light = await collideAtSpeed(12, 87001);
    const heavy = await collideAtSpeed(65, 87003);

    assert.equal(light.contacted, true, 'the low-speed case reaches a real Rapier contact');
    assert.equal(heavy.contacted, true, 'the high-speed case reaches a real Rapier contact');
    assert.equal(light.mass, 18, 'the canonical Kestrel mass is retained');
    assert.ok(light.inertia > 650 && light.inertia < 850,
      `yaw inertia reflects the measured Kestrel footprint, got ${light.inertia}`);
    assert.ok(light.colliders > 1, 'the contact uses the authored compound hull skin');
    assert.ok(Math.abs(light.gameYawRate) < 1,
      `a small glancing contact should not fling the ship into a fast spin, got ${light.gameYawRate}`);
    assert.ok(heavy.finalSpeed > light.finalSpeed * 3,
      'the larger impact still transfers substantially more linear motion');
    assert.ok(Math.abs(heavy.gameYawRate) > Math.abs(light.gameYawRate),
      'the heavier off-center impact still produces a stronger physical response');
    assert.ok(Math.abs(heavy.gameYawRate) < 6,
      'a large impact remains inside the native yaw-rate safety envelope');
    assert.ok(Math.abs(light.gameYawRate - light.nativeYawRate) < 1e-4,
      'the entity mirror follows the native body yaw rate');
  } finally {
    COMBAT_FLAGS.tumbleFling = priorTumbleFling;
  }
});
