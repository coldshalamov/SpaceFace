import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  samplePlasmaEnvelope,
  smoothstep,
  PLAYER_PLASMA_STREAM_RECIPE,
} from '../src/render/thruster/recipes/plasmaStreamRecipe.js';
import { createPathSampler } from '../src/render/thruster/systems/pathSampler.js';
import { PlasmaStreamSystem } from '../src/render/thruster/systems/plasmaStream.js';

test('plasma envelope is wider and hotter at the nozzle than the wake', () => {
  const root = samplePlasmaEnvelope(0, 1, 0);
  const mid = samplePlasmaEnvelope(0.45, 1, 0);
  const wake = samplePlasmaEnvelope(0.9, 1, 0);
  assert.ok(root.width > mid.width, `root width ${root.width} > mid ${mid.width}`);
  assert.ok(mid.width >= wake.width * 0.9, 'width should taper toward the wake');
  assert.ok(root.heat > wake.heat, `root heat ${root.heat} > wake ${wake.heat}`);
  assert.ok(root.rootWindow > 0.8, 'nozzle is in root window');
});

test('smoothstep is monotonic on unit interval', () => {
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = smoothstep(0, 1, i / 20);
    assert.ok(v >= prev - 1e-9);
    prev = v;
  }
});

test('path sampler retains equal-spacing history', () => {
  const sampler = createPathSampler(20);
  const owner = { id: 1 };
  for (let i = 0; i < 40; i++) {
    sampler.follow(i * 2.0, 0, 0, 1 / 60, owner, 2.0, 200, 1 / 30);
  }
  const xs = new Float32Array(20);
  const zs = new Float32Array(20);
  const ss = new Float32Array(20);
  const n = sampler.sampleInto(xs, zs, ss, 20);
  assert.ok(n >= 4, `expected history samples, got ${n}`);
  assert.equal(ss[0], 0, 'live head age is 0');
  assert.ok(ss[n - 1] >= 0.9, 'oldest sample near age 1');
});

test('PlasmaStreamSystem is continuous liquid strips, not point beads', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  assert.ok(stream.group);

  let points = 0;
  let meshes = 0;
  stream.group.traverse((o) => {
    if (o.isPoints) points += 1;
    if (o.isMesh) meshes += 1;
  });
  assert.equal(points, 0, 'must not use point-sprite bead medium');
  assert.ok(meshes >= 3, `expected multi-layer continuous meshes, got ${meshes}`);

  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
  const drive = { drive: 1, throttle: 1, boost: 0.25, speed: 140 };
  const owner = { id: 'player' };
  for (let i = 0; i < 40; i++) {
    stream.update(1 / 60, sockets, drive, { reducedMotion: false }, owner);
    sockets[0].x -= 2.5;
  }
  const info = stream.inspect();
  assert.equal(info.continuous, true);
  assert.ok(
    info.medium === 'liquid-billboard-layers' || info.medium === 'liquid-strip-layers',
    `expected continuous liquid medium, got ${info.medium}`,
  );
  assert.ok(info.path.historyCount > 0 || info.path.visiblePointCount > 2, 'path history active');
  assert.ok(info.active, 'stream should be active under thrust');
  // Layers visible with geometry drawn
  let drawn = 0;
  stream.group.traverse((o) => {
    if (o.isMesh && o.visible && o.geometry && o.geometry.drawRange
      && o.geometry.drawRange.count > 0) drawn += 1;
  });
  assert.ok(drawn >= 2, `expected continuous layers drawing, got ${drawn}`);
  stream.dispose();
});

test('player plasma recipe is continuous liquid not dual bead/cone stack', () => {
  assert.equal(PLAYER_PLASMA_STREAM_RECIPE.kind, 'unified_liquid_plasma');
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.layers.length >= 3);
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.layers.some((l) => l.role === 'core'));
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.layers.some((l) => l.role === 'body'));
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.layers.some((l) => l.role === 'sheath'));
});
