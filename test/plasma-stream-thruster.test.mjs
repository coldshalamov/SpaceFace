import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  smoothstep,
  PLAYER_PLASMA_STREAM_RECIPE,
  PLAYER_RETRO_VOLUME_RECIPE,
} from '../src/render/thruster/recipes/plasmaStreamRecipe.js';
import { createPathSampler } from '../src/render/thruster/systems/pathSampler.js';
import { PlasmaStreamSystem } from '../src/render/thruster/systems/plasmaStream.js';
import { VolumetricPlumeSystem } from '../src/render/thruster/systems/volumetricPlume.js';
import { inspectPlumeNoiseVolume } from '../src/render/thruster/volume/plumeNoiseVolume.js';

const THRUST = { drive: 1, throttle: 1, boost: 0, speed: 160 };

/** The raymarch proxies are the only meshes in the group with no uv channel. */
function collectProxies(group) {
  const out = [];
  group.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.attributes.uv) out.push(o);
  });
  return out;
}

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

test('player plasma recipe describes a volume, with no leftover sheet or parcel config', () => {
  assert.equal(PLAYER_PLASMA_STREAM_RECIPE.kind, 'raymarched_plasma_volume');
  assert.ok(PLAYER_PLASMA_STREAM_RECIPE.volume, 'recipe owns a volume block');
  // The layer stack and the wake-parcel cloud were the camera-facing sheets. Config left behind
  // after the renderer stops reading it is how a recipe starts lying about what ships.
  assert.equal(PLAYER_PLASMA_STREAM_RECIPE.layers, undefined, 'no dead layer stack');
  assert.equal(PLAYER_PLASMA_STREAM_RECIPE.wake, undefined, 'no dead wake-parcel block');
  const v = PLAYER_PLASMA_STREAM_RECIPE.volume;
  assert.ok(v.maxSteps > v.minSteps, 'march budget has room to scale with apparent size');
  assert.ok(v.threshold > 0 && v.threshold < 1, 'threshold opens veins between filaments');
  assert.ok(v.coreColor[0] > v.midColor[0], 'temperature ramp cools away from the throat');
});

test('the exhaust is a raymarched volume, not point beads or camera-facing sheets', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  assert.ok(stream.group);

  let points = 0;
  stream.group.traverse((o) => { if (o.isPoints) points += 1; });
  assert.equal(points, 0, 'must not use point-sprite bead medium');

  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
  const owner = { id: 'player' };
  for (let i = 0; i < 40; i++) {
    stream.update(1 / 60, sockets, { ...THRUST, boost: 0.25 }, { reducedMotion: false }, owner);
    sockets[0].x -= 2.5;
  }

  const info = stream.inspect();
  assert.equal(info.continuous, true);
  assert.equal(info.medium, 'raymarched-volume');
  assert.ok(info.volume, 'volume reports its own construction');
  assert.equal(info.volume.live, 1, 'one live nozzle proxy');
  assert.ok(info.volume.steps >= 8, `expected a real march budget, got ${info.volume.steps}`);
  assert.ok(info.volume.steps <= info.volume.maxSteps, 'march budget respects its ceiling');
  assert.ok(info.active, 'stream should be active under thrust');

  const proxies = collectProxies(stream.group);
  assert.ok(proxies.length >= 1, 'expected raymarch proxy boxes');
  const live = proxies.filter((m) => m.visible);
  assert.equal(live.length, 1, 'exactly one proxy per live socket');
  assert.equal(live[0].material.transparent, true, 'volume composites additively over the scene');
  assert.equal(live[0].material.depthWrite, false, 'a volume must not write depth');
  stream.dispose();
});

test('the volume proxy spans the plume envelope along the exhaust axis', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  // Socket ax points opposite the exhaust, so exhaust runs -X and the proxy must extend that way.
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  stream.update(1 / 60, sockets, THRUST, { reducedMotion: false }, { id: 'axis' });

  const live = collectProxies(stream.group).filter((m) => m.visible);
  assert.equal(live.length, 1);
  const mesh = live[0];
  mesh.updateMatrixWorld(true);
  // Proxy local +X is the flow direction; its far face must land aft of the nozzle.
  const tip = new THREE.Vector3(1, 0, 0).applyMatrix4(mesh.matrixWorld);
  assert.ok(tip.x < -5, `plume tip should extend aft of the nozzle, got x=${tip.x.toFixed(2)}`);
  assert.ok(Math.abs(tip.z) < 1e-3, 'plume should run straight down the exhaust axis');

  const info = stream.inspect();
  assert.ok(
    info.volume.steps > 0 && info.volume.proxyMargin > 1,
    'proxy carries headroom past the widest modelled radius so the fringe is not clipped',
  );
  stream.dispose();
});

test('history filament traces where the ship has been, aft of the live nozzle', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const owner = { id: 'dir-test' };
  for (let i = 0; i < 50; i++) {
    sockets[0].x = i * 2.0;
    stream.update(1 / 60, sockets, THRUST, { reducedMotion: false }, owner);
  }
  const info = stream.inspect();
  assert.ok(info.active, 'stream active');
  assert.ok(info.pointCount >= 8, `expected long trail samples, got ${info.pointCount}`);

  let mesh = null;
  stream.group.traverse((o) => {
    if (o.isMesh && o.visible && o.geometry?.attributes?.uv) mesh = o;
  });
  assert.ok(mesh, 'expected a visible strip mesh for the history filament');
  const pos = mesh.geometry.attributes.position.array;
  const uvs = mesh.geometry.attributes.uv.array;
  const liveX = sockets[0].x;
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

test('cutting thrust kills the exhaust immediately but drains the history filament', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const owner = { id: 'snake-cutoff' };
  for (let i = 0; i < 40; i++) {
    sockets[0].x = i * 1.5;
    stream.update(1 / 60, sockets, { ...THRUST, speed: 120 }, { reducedMotion: false }, owner);
  }

  const cutoff = { drive: 0, throttle: 0, boost: 0, speed: 0 };
  for (let i = 0; i < 50; i++) {
    stream.update(1 / 60, sockets, cutoff, { reducedMotion: false }, owner);
  }

  const info = stream.inspect();
  // Exhaust is produced, not stored: the moment the engine stops, there is nothing to integrate.
  assert.equal(info.volume.live, 0, 'no plume survives the drive being cut');
  assert.ok(info.snakePoints >= 2, 'released history filament remains drawable');
  assert.equal(info.active, true, 'inspection remains active while the released snake is visible');
  stream.dispose();
});

test('plasma stream reuses one fallback identity without sockets or an owner', () => {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  const fallback = stream._fallbackNozzle;

  for (let i = 0; i < 20; i++) {
    fallback.x = i * 0.75;
    stream.update(1 / 60, null, { ...THRUST, speed: 0 }, { reducedMotion: false });
  }

  const info = stream.inspect();
  assert.strictEqual(stream._fallbackNozzle, fallback, 'fallback nozzle identity stays stable');
  assert.strictEqual(stream._owner, fallback, 'omitted owner resolves to the same fallback identity');
  assert.equal(info.volume.live, 1, 'socketless callers still get a plume');
  assert.ok(info.path.historyCount > 8,
    `fallback identity must retain path history across frames, got ${info.path.historyCount}`);
  stream.dispose();
});

test('retro jets are the same continuous volume as the main drive, only smaller', () => {
  // The bow thrusters used to be drawn by the impulse-burst system, which can only emit discrete
  // pops — that mismatch against a held brake input is what read as a dotted line.
  const scene = new THREE.Scene();
  const retro = new VolumetricPlumeSystem(THREE, {
    name: 'sf-test-retro',
    maxNozzles: 2,
    minSteps: PLAYER_RETRO_VOLUME_RECIPE.minSteps,
    maxSteps: PLAYER_RETRO_VOLUME_RECIPE.maxSteps,
  });
  retro.attach(scene);

  const sockets = [{ x: 0, y: 0, z: 0, ax: -1, ay: 0, az: 0 }];
  const params = {
    drive: 1,
    lengthWU: PLAYER_RETRO_VOLUME_RECIPE.lengthWU,
    exitRadiusWU: PLAYER_RETRO_VOLUME_RECIPE.exitRadiusWU,
    tailRadiusWU: PLAYER_RETRO_VOLUME_RECIPE.exitRadiusWU * PLAYER_RETRO_VOLUME_RECIPE.tailFlare,
    radiance: PLAYER_RETRO_VOLUME_RECIPE.radiance,
  };

  // Held input across many frames must stay continuously lit, never strobing frame to frame.
  for (let i = 0; i < 30; i++) {
    const info = retro.update(1 / 60, sockets, params);
    assert.equal(info.live, 1, `retro plume must stay lit on frame ${i}`);
  }
  assert.ok(
    PLAYER_RETRO_VOLUME_RECIPE.lengthWU < PLAYER_PLASMA_STREAM_RECIPE.jet.lengthWU * 0.5,
    'a braking jet is a short high-pressure burst, not a cruising plume',
  );

  retro.update(1 / 60, sockets, { ...params, drive: 0 });
  assert.equal(retro.inspect().live, 0, 'released brake stops the jet');
  retro.dispose();
});

test('the noise volume is baked once and shared across every plume system', () => {
  const scene = new THREE.Scene();
  const a = new VolumetricPlumeSystem(THREE, { name: 'sf-test-a' });
  const b = new VolumetricPlumeSystem(THREE, { name: 'sf-test-b' });
  a.attach(scene);
  const first = inspectPlumeNoiseVolume();
  b.attach(scene);
  const second = inspectPlumeNoiseVolume();
  assert.ok(first.baked, 'volume bakes on first acquire');
  assert.equal(second.bakes, first.bakes, 'second system reuses the baked texture');
  assert.ok(second.refs > first.refs, 'refcount tracks live holders');
  a.dispose();
  assert.ok(inspectPlumeNoiseVolume().baked, 'texture survives while a holder remains');
  b.dispose();
  assert.equal(inspectPlumeNoiseVolume().refs, 0, 'released once the last holder is gone');
});
