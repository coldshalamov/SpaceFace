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

  // ContinuousPlume convention: ax opposite exhaust. Ship moves -X, exhaust +X (trail) ⇒ ax=-1.
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

test('plasma stream trail extends along ContinuousPlume -ax exhaust and keeps history wake', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  // Ship moves +X (nose +X). Production ax = -exhaust = -(-X wait):
  // exhaust aft = -X, ContinuousPlume ax = -exhaust = +X.
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const drive = { drive: 1, throttle: 1, boost: 0, speed: 160 };
  const owner = { id: 'dir-test' };
  for (let i = 0; i < 50; i++) {
    sockets[0].x = i * 2.0;
    stream.update(1 / 60, sockets, drive, { reducedMotion: false }, owner);
  }
  const info = stream.inspect();
  assert.ok(info.active, 'stream active');
  assert.ok(info.pointCount >= 8, `expected long trail samples, got ${info.pointCount}`);
  // Strip mesh positions: root near live nozzle, tip further aft (lower X than nozzle)
  let mesh = null;
  stream.group.traverse((o) => {
    if (o.isMesh && o.visible && o.geometry?.attributes?.position) mesh = o;
  });
  assert.ok(mesh, 'expected a visible strip mesh');
  const pos = mesh.geometry.attributes.position.array;
  const liveX = sockets[0].x;
  // Sample a mid-strip vertex pair near the tip (high path UV stored in uvs)
  const uvs = mesh.geometry.attributes.uv.array;
  let tipX = liveX;
  let rootX = liveX;
  let tipN = 0;
  let rootN = 0;
  const vCount = pos.length / 3;
  for (let i = 0; i < vCount; i++) {
    const s = uvs[i * 2];
    const x = pos[i * 3];
    if (s < 0.08) { rootX += x; rootN += 1; }
    if (s > 0.75) { tipX += x; tipN += 1; }
  }
  assert.ok(rootN > 0 && tipN > 0, 'need root and tip verts');
  rootX /= rootN;
  tipX /= tipN;
  // Exhaust aft (-X): tip should be behind live nozzle (smaller X)
  assert.ok(
    tipX < liveX - 2.0,
    `trail tip should be aft of nozzle: tipX=${tipX.toFixed(2)} liveX=${liveX.toFixed(2)}`,
  );
  assert.ok(
    tipX < rootX - 1.0,
    `tip should be further aft than root: tip=${tipX.toFixed(2)} root=${rootX.toFixed(2)}`,
  );
  stream.dispose();
});
