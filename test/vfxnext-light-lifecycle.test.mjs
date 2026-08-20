// VFX NEXT light-pool lifecycle and reduced-flash coverage.
//
// Two defects this pins, both found by independent review AFTER the pool was changed to keep its
// PointLights permanently visible:
//
//  1. LIFETIME. The pool is added to the SCENE, not to the stage's disposable `root` Group, so
//     `dispose()` removing `root` left the lights behind. Because pool lights are visible-forever by
//     design, orphans keep counting toward the visible-light total, and dispose-then-recreate took
//     the scene from 4 visible PointLights to 8 — which is precisely the whole-scene shader
//     recompile that the visible-forever rule exists to prevent. Leaving them was strictly worse
//     than the `.visible` toggling it replaced.
//
//  2. ACCESSIBILITY. `stage.intensity` is the declared reduced-flash hook. It reached sparks, smoke,
//     fronts and ribbons but never the light pool, so turning it down dimmed every particle to
//     nothing and left the four dynamic PointLights — the brightest and most flash-sensitive element
//     in the frame — at full peak.
//
// Both are asserted here rather than in prose because neither is observable from a triangle count,
// a draw call, or any existing check: nothing in the game imports src/vfxnext, so no other gate can
// reach this code at all.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { createStage } from '../src/vfxnext/core/stage.js';
import { LightPool } from '../src/vfxnext/core/lights.js';

const POOL_LIGHT_NAME = /^vfxnext:eventLight\d+$/;

function poolLightsIn(scene) {
  return scene.children.filter((c) => c.isPointLight && POOL_LIGHT_NAME.test(c.name || ''));
}

test('createStage adds its whole light pool to the scene, all permanently visible', () => {
  const scene = new THREE.Scene();
  const stage = createStage(scene, { budgets: { lights: 4 } });

  const lights = poolLightsIn(scene);
  assert.equal(lights.length, 4, 'pool capacity should be present in the scene');
  assert.ok(lights.every((l) => l.visible === true),
    'pool lights must be visible at construction: toggling .visible mutates the shader cache key');
  assert.ok(lights.every((l) => l.intensity === 0),
    'an unspawned slot is dark, not hidden');

  stage.dispose();
});

test('dispose removes the light pool from the scene', () => {
  const scene = new THREE.Scene();
  const stage = createStage(scene, { budgets: { lights: 4 } });
  assert.equal(poolLightsIn(scene).length, 4);

  stage.dispose();

  assert.equal(poolLightsIn(scene).length, 0,
    'dispose() removes `root`, which never contained the lights; they must be removed explicitly');
});

test('dispose then recreate does not grow the visible PointLight count', () => {
  const scene = new THREE.Scene();

  const first = createStage(scene, { budgets: { lights: 4 } });
  assert.equal(poolLightsIn(scene).length, 4);
  first.dispose();

  const second = createStage(scene, { budgets: { lights: 4 } });

  // The regression: orphaned visible lights from the first stage made this 8, changing the
  // visible-light count that three bakes into every shader program.
  assert.equal(poolLightsIn(scene).length, 4,
    'recreate must not accumulate orphaned pool lights (4 -> 8 forces a whole-scene recompile)');

  second.dispose();
  assert.equal(poolLightsIn(scene).length, 0);
});

test('a spawn/expire cycle never changes the visible-light count', () => {
  const scene = new THREE.Scene();
  const stage = createStage(scene, { budgets: { lights: 4 } });
  const visibleCount = () => poolLightsIn(scene).filter((l) => l.visible).length;

  assert.equal(visibleCount(), 4);
  stage.lights.spawn({ x: 0, y: 0, z: 0, peak: 40, life: 0.25 });
  assert.equal(visibleCount(), 4, 'spawning must not flip .visible');

  stage.lights.update(1.0); // past `life`, so the slot expires
  assert.equal(visibleCount(), 4, 'expiry must dim to intensity 0, not hide');
  assert.equal(stage.lights.lights[0].intensity, 0);

  stage.lights.clear();
  assert.equal(visibleCount(), 4, 'clear() must not hide either');

  stage.dispose();
});

test('reduced flash reaches the lights, not only the particles', () => {
  const pool = new LightPool({ capacity: 2 });

  // spawn() returns the claimed slot and the claim cursor advances, so never assume slot 0.
  const unscaled = pool.spawn({ x: 0, y: 0, z: 0, peak: 40, life: 1 });
  assert.equal(pool.lights[unscaled].intensity, 40, 'unscaled peak is unchanged');

  pool.clear();
  pool.setIntensityScale(0.5);
  const scaled = pool.spawn({ x: 0, y: 0, z: 0, peak: 40, life: 1 });
  assert.equal(pool.lights[scaled].intensity, 20, 'reduced flash must scale the spawn peak');

  // Lowering the dial mid-flight must dim lights already in the air, not just the next one.
  pool.setIntensityScale(0);
  pool.update(0.1);
  assert.equal(pool.lights[scaled].intensity, 0, 'scale must apply on update, not only at spawn');
});

test('stage.intensity drives the light pool scale', () => {
  const scene = new THREE.Scene();
  const stage = createStage(scene, { budgets: { lights: 4 } });

  stage.intensity = 0.25;
  stage.lights.spawn({ x: 0, y: 0, z: 0, peak: 40, life: 10 });
  stage.update(1 / 60, new THREE.PerspectiveCamera());

  assert.ok(stage.lights.intensityScale === 0.25,
    'stage.update must push its reduced-flash scalar into the pool');
  assert.ok(stage.lights.lights[0].intensity < 40,
    'the live light value must carry the reduced-flash scale');

  stage.dispose();
});

test('stage.update without a camera does not throw', () => {
  const scene = new THREE.Scene();
  const stage = createStage(scene, { budgets: { lights: 2, ribbons: 2 } });
  assert.doesNotThrow(() => stage.update(1 / 60, null));
  assert.doesNotThrow(() => stage.update(1 / 60));
  stage.dispose();
});

test('NaN-lived lights are refused so a dead slot cannot leak intensity', () => {
  const pool = new LightPool({ capacity: 2 });
  assert.equal(pool.spawn({ x: 0, y: 0, z: 0, peak: 40, life: Number.NaN }), -1);
  assert.equal(pool.spawn({ x: Number.NaN, y: 0, z: 0, peak: 40, life: 1 }), -1);
  const slot = pool.spawn({ x: 0, y: 0, z: 0, peak: 40, life: 1 });
  assert.ok(slot >= 0);
  assert.equal(pool.lights[slot].intensity, 40);
});
