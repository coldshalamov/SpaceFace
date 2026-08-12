import assert from 'node:assert/strict';
import test from 'node:test';

import {
  samplePlasmaEnvelope,
  smoothstep,
  PLAYER_PLASMA_STREAM_RECIPE,
} from '../src/render/thruster/recipes/plasmaStreamRecipe.js';
import { createPathSampler } from '../src/render/thruster/systems/pathSampler.js';
import { PlasmaStreamSystem } from '../src/render/thruster/systems/plasmaStream.js';
import * as THREE from 'three';

test('plasma envelope is wider and hotter at the nozzle than the wake', () => {
  const root = samplePlasmaEnvelope(0, 1, 0);
  const mid = samplePlasmaEnvelope(0.45, 1, 0);
  const wake = samplePlasmaEnvelope(0.9, 1, 0);
  assert.ok(root.width > mid.width, `root width ${root.width} > mid ${mid.width}`);
  assert.ok(mid.width > wake.width * 0.85, `mid should stay thicker than far wake`);
  assert.ok(root.heat > wake.heat, `root heat ${root.heat} > wake ${wake.heat}`);
  assert.ok(root.density > wake.density, 'root density exceeds wake density');
  assert.ok(root.rootWindow > 0.8, 'nozzle is in root window');
  assert.ok(wake.wakeWindow > 0 || wake.s > 0.5, 'far samples leave the root window');
});

test('smoothstep is monotonic on unit interval', () => {
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = smoothstep(0, 1, i / 20);
    assert.ok(v >= prev - 1e-9);
    prev = v;
  }
});

test('path sampler retains equal-spacing history without solid geometry', () => {
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
  // Live head is newest position
  assert.ok(Math.abs(xs[0] - 78) < 4 || xs[0] > 20, `live x advanced, got ${xs[0]}`);
});

test('PlasmaStreamSystem spawns soft particles and never builds a ribbon mesh', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE, { capacity: 200 });
  stream.attach(scene);
  assert.ok(stream.group);
  assert.ok(stream.group.children[0].isPoints, 'hero medium is Points, not a solid ribbon Mesh');

  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
  const drive = { drive: 1, throttle: 1, boost: 0.2, speed: 120 };
  const owner = { id: 'player' };
  for (let i = 0; i < 30; i++) {
    stream.update(1 / 60, sockets, drive, { reducedMotion: false }, owner);
    // Advance nozzle so history grows
    sockets[0].x -= 3;
  }
  const info = stream.inspect();
  assert.ok(info.live > 20, `expected living plasma particles, got ${info.live}`);
  assert.ok(info.path.historyCount > 0 || info.path.visiblePointCount > 1, 'path history active');
  stream.dispose();
});

test('player plasma recipe declares unified kind not dual ribbon+cone', () => {
  assert.equal(PLAYER_PLASMA_STREAM_RECIPE.kind, 'unified_plasma_stream');
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.roles.core);
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.roles.body);
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.roles.filament);
});
