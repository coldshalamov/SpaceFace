import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ForceParticleFlow } from '../src/render/vfx/forceParticleFlow.js';
import { QuarksVfxSystem } from '../src/render/vfx/quarksSystem.js';

const sample = flow => flow.system.particles.slice(0, flow.live).map(p => [
  p.position.x, p.position.y, p.position.z, p.life, p.size.x, p.size.y,
  p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w,
]);
const radius = p => Math.hypot(p.position.x, p.position.z);

test('first burst uploads immediately and zero dt preserves that first visible frame', () => {
  const scene = new THREE.Scene();
  const f = new ForceParticleFlow(scene, { capacity: 8 });
  try {
    assert.equal(f.batch.geometry.instanceCount, 0);
    assert.equal(f.emit({ kind: 'well', x: 120, z: -80, count: 3, seed: 2 }), 3);
    assert.equal(f.batch.geometry.instanceCount, 3, 'draw count is ready before the next update');
    assert.equal(f.renderer.visible, true);
    const offsets = f.batch.geometry.getAttribute('offset');
    const p = f.system.particles[0];
    assert.equal(offsets.getX(0), Math.fround(p.position.x));
    assert.equal(offsets.getZ(0), Math.fround(p.position.z));
    const before = sample(f);
    f.update(0);
    assert.deepEqual(sample(f), before);
    assert.equal(p.age, 0);
    assert.equal(f.batch.geometry.instanceCount, 3);
  } finally { f.dispose(); }
});

test('seeded Quarks transport varies by event and ordinal, reuses bounded particle objects', () => {
  const scene = new THREE.Scene();
  const a = new ForceParticleFlow(scene, { capacity: 12 });
  const b = new ForceParticleFlow(scene, { capacity: 12 });
  try {
    const cached = new Set(a.system.particles);
    const event = { kind: 'heat', x: 0, z: 0, seed: 482, count: 24, radius: 18 };
    assert.equal(a.emit(event), 12);
    assert.equal(b.emit(event), 12);
    assert.equal(a.emit(event), 0);
    a.update(0.05); b.update(0.05);
    assert.equal(a.system.particles[0].age, 0.05, 'first update advances exactly once');
    assert.deepEqual(sample(a), sample(b));
    assert.notDeepEqual(sample(a)[0], sample(a)[1], 'individual parcels have stable different trajectories');
    b.clear(); b.emit({ ...event, seed: 483 }); b.update(0.05);
    assert.notDeepEqual(sample(a), sample(b));
    a.update(3.5);
    assert.equal(a.live, 0, 'a time jump retires all particles rather than advancing only .1 seconds');
    a.emit(event);
    assert.ok(a.system.particles.every(p => cached.has(p)));
    assert.equal(a.batch.maxParticles, 12);
    assert.equal(a.renderer.batches.length, 1);
  } finally { a.dispose(); b.dispose(); }
  assert.equal(scene.children.length, 0);
});

test('families follow their actual force and tool footprint, not shared radial expansion', () => {
  const scene = new THREE.Scene();
  const f = new ForceParticleFlow(scene, { capacity: 24 });
  try {
    for (const kind of ['well', 'repulsor', 'cone', 'skim', 'seed', 'heat', 'current', 'repair', 'transfer']) {
      f.clear(); f.emit({ kind, x: 0, z: 0, radius: 40, halfAngle: 0.04, halfWidth: 0.3, seed: 66, life: 1.2, count: 16 });
      const before = radius(f.system.particles[0]);
      for (let step = 0; step < 6; step++) {
        f.update(0.05);
        for (let i = 0; i < f.live; i++) {
          const p = f.system.particles[i];
          assert.ok(sample(f)[i].every(Number.isFinite));
          assert.ok(p.size.x > p.size.y * 7, 'parcels remain streaks rather than square sparks');
          if (kind === 'cone') assert.ok(Math.abs(p.position.z) <= p.position.x * Math.tan(0.04) + 1e-7);
          if (kind === 'skim') assert.ok(Math.abs(p.position.z) < 0.3);
        }
      }
      const after = radius(f.system.particles[0]);
      if (['well', 'seed', 'repair'].includes(kind)) assert.ok(after < before, `${kind} converges`);
      else assert.ok(after > before, `${kind} transports away from its source`);
    }
  } finally { f.dispose(); }
});

test('pause, reduced motion and flash preserve lifetime and floating origin contracts', () => {
  const scene = new THREE.Scene();
  const f = new ForceParticleFlow(scene, { capacity: 4 });
  try {
    f.emit({ kind: 'well', x: 12, z: 44, seed: 71, life: 1, count: 2 });
    f.update(0.1);
    const frozen = sample(f), p = f.system.particles[0], age = p.age;
    for (const dt of [0, -1, NaN]) f.update(dt);
    assert.deepEqual(sample(f), frozen);
    assert.equal(p.age, age);
    const bright = p.color.x;
    f.update(0.1, { reducedMotion: true, reducedFlash: true });
    assert.deepEqual(sample(f), frozen, 'reduced motion freezes size and orientation as well as transport');
    assert.deepEqual([p.position.x, p.position.y, p.position.z], frozen[0].slice(0, 3));
    assert.ok(p.color.x < bright * 0.5);
    assert.ok(p.age > age, 'reduced motion still permits finite retirement');
    const beforeShift = p.position.clone();
    f.reproject(-800, 350);
    f.update(0.05, { reducedMotion: true });
    assert.equal(p.position.x, beforeShift.x - 800);
    assert.equal(p.position.z, beforeShift.z + 350);
    f.update(3.1, { reducedMotion: true });
    assert.equal(f.live, 0);
    assert.equal(f.renderer.visible, false);
    f.dispose(); f.dispose();
    assert.equal(f.emit({ kind: 'heat', x: 0, z: 0 }), 0);
  } finally { f.dispose(); }
});

test('explosions, braking and damage use transport without replacing solid debris; zero dt stays paused', () => {
  const scene = new THREE.Scene();
  const q = new QuarksVfxSystem({ scene });
  try {
    q.spawnExplosion(0, 0, 0, 20, { radius: 18, seed: 112 });
    assert.ok(q.shrapnel.particleNum > 0);
    assert.ok(q.flow.live > 0);
    const first = q.flow.system.particles[0], before = sample(q.flow);
    q.update(0); q.update(-1);
    assert.deepEqual(sample(q.flow), before);
    assert.equal(q.shrapnel.particles[0].age, 0);
    q.update(0.1, { id: 'reduced-motion-and-flash' });
    assert.equal(first.age, 0.1);
    assert.deepEqual([first.position.x, first.position.y, first.position.z], before[0].slice(0, 3));
    q.reproject(120, -50);
    assert.equal(first.position.x, before[0][0] + 120);
    assert.equal(first.position.z, before[0][2] - 50);
    const live = q.flow.live;
    q.spawnRetroVenting(0, 0, 0, 1, 0, 0, 0.8);
    q.spawnDamageVenting(0, 0, 0, 1, 0, 0, 4);
    assert.ok(q.flow.live > live);
    q.reset(); assert.equal(q.flow.live, 0); assert.equal(q.shrapnel.particleNum, 0);
    assert.ok(q.renderer.batches.every(batch => batch.geometry.instanceCount === 0),
      'reset publishes empty GPU draws even when playback remains paused');
  } finally { q.dispose(); }
  assert.equal(scene.children.length, 0);
});

test('goo creeps, stretches upward and rejoins with a thicker cooling neck, distinct from inward repair', () => {
  const scene = new THREE.Scene(), f = new ForceParticleFlow(scene, { capacity: 4 });
  const event = { kind: 'goo', x: 0, y: 0.8, z: 0, radius: 70, seed: 19, count: 1, life: 2 };
  try {
    f.emit(event);
    const p = f.system.particles[0], life = p.life, initial = sample(f)[0];
    const startColor = p.color.y;
    f.clear(); f.emit({ ...event, age: life * 0.5 });
    const lifted = sample(f)[0];
    assert.ok(lifted[1] > initial[1] + 2, 'a lifted parcel visibly clears its surface');
    assert.ok(lifted[4] > initial[4] * 1.5 && lifted[5] < initial[5], 'viscosity stretches and narrows the neck');
    assert.ok(initial[5] > initial[4] * 0.15, 'matter is thicker than an energy filament');
    f.clear(); f.emit({ ...event, age: life * 0.97 });
    const rejoined = sample(f)[0], last = f.system.particles[0];
    assert.ok(rejoined[1] < initial[1] + 0.1, 'the parcel settles back instead of becoming an outward spark');
    assert.ok(Math.hypot(rejoined[0], rejoined[2]) > Math.hypot(initial[0], initial[2]), 'slow creep stays distinct from repair convergence');
    assert.ok(last.color.y < startColor && last.color.w < 0.02, 'rejoined material cools and retires');
    f.clear(); f.emit({ ...event, kind: 'repair', age: life * 0.5 });
    assert.notDeepEqual(sample(f)[0], lifted);
  } finally { f.dispose(); }
});

test('absolute-age emission matches stepped transport and publishes one shared batch after sampling', () => {
  const scene = new THREE.Scene(), a = new ForceParticleFlow(scene, { capacity: 12 }),
    b = new ForceParticleFlow(scene, { capacity: 12 });
  try {
    for (const kind of ['well', 'goo']) {
      const event = { kind, x: 14, z: -8, radius: 65, seed: 92, count: 6, life: 1.5 };
      a.clear(); b.clear(); a.emit(event); a.update(0.25);
      assert.equal(b.emit({ ...event, age: 0.25, deferUpload: true }), 6);
      assert.equal(b.batch.geometry.instanceCount, 0, 'several fields can share one final upload');
      b.publish();
      assert.equal(b.batch.geometry.instanceCount, 6);
      const sampled = sample(b);
      for (const [i, values] of sample(a).entries()) values.forEach((v, j) => {
        assert.ok(Math.abs(v - sampled[i][j]) < 1e-9, `sampled ${kind} component ${j} matches native integration`);
      });
      b.clear();
      assert.equal(b.emit({ ...event, age: 2 }), 0, 'expired sampled parcels are returned to the pool');
      assert.equal(b.live, 0); assert.equal(b.renderer.visible, false);
    }
  } finally { a.dispose(); b.dispose(); }
});
