import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createShardStreakCloud } from '../src/render/particleShards.js';
import { ForceParticleFlow } from '../src/render/vfx/forceParticleFlow.js';

const event = { kind: 'well', x: 0, z: 0, radius: 36, seed: 17, count: 1, life: 1 };

test('additive sparks apply coverage once, not to both radiance and alpha', () => {
  const scene = new THREE.Scene();
  const cloud = createShardStreakCloud(scene, 8);
  try {
    assert.equal(cloud.material.blending, THREE.AdditiveBlending);
    assert.match(cloud.material.fragmentShader, /vec4\(hot \* radiance, intensity\)/);
    assert.equal(cloud.mesh.count, 0);
    assert.equal(cloud.capacity, 8);
    assert.equal(cloud.material.forceSinglePass, true);
  } finally {
    cloud.geometry.dispose(); cloud.material.dispose();
  }
});

test('flow parcels divert at a snapshotted asteroid surface without querying or changing it', () => {
  const empty = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  const touching = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  const repeat = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  try {
    empty.emit(event);
    const original = empty.system.particles[0].position.clone();
    const rock = { x: original.x + 2, z: original.z, radius: 4,
      vx: 3, vz: 0, material: 1, strength: 1 };
    const environment = { count: 1, records: [rock] };
    const before = JSON.stringify(environment);
    touching.emit({ ...event, environment });
    repeat.emit({ ...event, environment });
    const p = touching.system.particles[0];
    assert.notDeepEqual(p.position.toArray(), original.toArray());
    assert.ok(Math.hypot(p.position.x - rock.x, p.position.z - rock.z) >= rock.radius);
    assert.deepEqual(p.position.toArray(), repeat.system.particles[0].position.toArray());
    assert.equal(JSON.stringify(environment), before);
    rock.x = rock.z = 9999;
    touching.update(0.05); repeat.update(0.05);
    assert.deepEqual(p.position.toArray(), repeat.system.particles[0].position.toArray(),
      'producer slot reuse cannot teleport an existing parcel');
    assert.equal(touching.batch.maxParticles, 4);
    assert.equal(touching.renderer.batches.length, 1);
  } finally { empty.dispose(); touching.dispose(); repeat.dispose(); }
});

test('contact snapshots are bounded, rebase while paused and recycle without stale contacts', () => {
  const flow = new ForceParticleFlow(new THREE.Scene(), { capacity: 2 });
  try {
    flow.emit(event);
    const original = flow.system.particles[0].position.clone();
    flow.clear();
    const rock = { x: original.x + 2, z: original.z, radius: 4, strength: 1, material: 1 };
    flow.emit({ ...event, environment: { count: 20, records: Array(20).fill(rock) } });
    const p = flow.system.particles[0];
    assert.equal(p.forceContactCount, 3);
    const memory = p.forceContacts;
    const before = p.position.clone(), age = p.age;
    flow.update(0);
    assert.deepEqual(p.position.toArray(), before.toArray());
    assert.equal(p.age, age);
    flow.reproject(-200, 80);
    flow.update(0.05, { reducedMotion: true, reducedFlash: true });
    assert.deepEqual(p.position.toArray(), [before.x - 200, before.y, before.z + 80]);
    flow.update(3.1, { reducedMotion: true });
    assert.equal(flow.live, 0);
    flow.emit(event);
    const recycled = flow.system.particles[0];
    assert.equal(recycled.forceContacts, memory);
    assert.equal(recycled.forceContactCount, 0);
    assert.deepEqual(recycled.position.toArray(), original.toArray());
  } finally { flow.dispose(); }
});

test('liquid parcel heat varies smoothly, cools, and obeys reduced flash', () => {
  const full = new ForceParticleFlow(new THREE.Scene(), { capacity: 2 });
  const reduced = new ForceParticleFlow(new THREE.Scene(), { capacity: 2 });
  try {
    full.emit(event); reduced.emit(event);
    full.update(0.15); reduced.update(0.15, { reducedFlash: true });
    const a = full.system.particles[0], b = reduced.system.particles[0];
    assert.ok(a.color.z > 1);
    assert.ok(b.color.z < a.color.z * 0.5);
    const bright = a.color.z;
    full.update(0.55);
    assert.ok(a.color.z < bright);
    assert.ok(a.size.x > a.size.y * 7);
  } finally { full.dispose(); reduced.dispose(); }
});

test('malformed or disabled records never become invented contacts', () => {
  const empty = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  const flow = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  try {
    empty.emit(event);
    const original = empty.system.particles[0].position.clone();
    const rock = { x: original.x + 2, z: original.z, radius: 4, vx: 0, vz: 0,
      material: 1, strength: 1 };
    flow.emit({ ...event, environment: { count: 4, records: [
      null,
      { x: NaN, z: original.z, radius: 4, strength: 1 },
      { x: original.x + 2, z: original.z, radius: 0, strength: 1 },
      rock,
    ] } });
    // The only valid record is beyond the scan bound, so nothing deflects.
    assert.equal(flow.system.particles[0].forceContactCount, 0);
    assert.deepEqual(flow.system.particles[0].position.toArray(), original.toArray());
    flow.clear();
    // A strength-0 record is disabled: it is skipped, and the valid record behind it wins.
    flow.emit({ ...event, environment: { count: 2, records: [
      { ...rock, strength: 0 }, rock] } });
    const p = flow.system.particles[0];
    assert.equal(p.forceContactCount, 1);
    assert.notDeepEqual(p.position.toArray(), original.toArray());
    flow.clear();
    // An infinite-radius record is malformed too: it must not become a collider that writes NaN.
    flow.emit({ ...event, environment: { count: 2, records: [
      { ...rock, radius: Infinity }, rock] } });
    const q = flow.system.particles[0];
    assert.equal(q.forceContactCount, 1);
    assert.ok(Number.isFinite(q.position.x) && Number.isFinite(q.position.z));
    assert.notDeepEqual(q.position.toArray(), original.toArray());
  } finally { empty.dispose(); flow.dispose(); }
});

test('contact heat stays per-parcel when the pose is frozen, and the parcel turns to its deflected path', () => {
  const probe = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  const flow = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  const empty = new ForceParticleFlow(new THREE.Scene(), { capacity: 4 });
  try {
    probe.emit(event);
    const spawn = probe.system.particles[0].position.clone();
    const rock = { x: spawn.x, z: spawn.z, radius: 4, vx: 0, vz: 0, material: 1, strength: 1 };
    flow.emit({ ...event, count: 2, environment: { count: 1, records: [rock] } });
    empty.emit({ ...event, count: 2 });
    const a = flow.system.particles[0], b = flow.system.particles[1];
    assert.ok(a.forceContactHeat > 0, 'the parcel born inside the rock carries contact heat');
    assert.equal(b.forceContactHeat, 0, 'the distant parcel does not');
    flow.update(0.05, { reducedMotion: true, reducedFlash: true });
    assert.ok(a.forceContactHeat > 0 && b.forceContactHeat === 0,
      'frozen updates cannot leak one parcel\'s contact heat into another');
    assert.notDeepEqual(a.rotation.toArray(), empty.system.particles[0].rotation.toArray(),
      'orientation follows the deflected trajectory, not the undeflected tangent');
  } finally { probe.dispose(); flow.dispose(); empty.dispose(); }
});
