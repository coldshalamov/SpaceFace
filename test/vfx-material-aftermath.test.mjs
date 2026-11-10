import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { createShardStreakCloud, resizeShardStreakCloud } from '../src/render/particleShards.js';

function fixture() {
  const sparks = [], solids = [], surfaces = [];
  const miner = { pos: { x: -20, z: 0 } };
  const system = Object.assign(Object.create(vfx), {
    _scene: new THREE.Scene(), _burst: 1, _c0: new THREE.Color(), _c1: new THREE.Color(),
    _spawnLocalXZ: {}, state: { playerId: 1, simTime: 3 },
    helpers: { player: () => miner },
    _ent: () => miner,
    _posFrom: (p) => p.pos,
    _toLocalXZ: (x, z, out) => Object.assign(out, { x, z }),
    _spawnParticle: (...args) => sparks.push(args),
    _spawnSprite: (...args) => surfaces.push(args),
    _flashLight() {}, _emitJuiceCue() {},
    _weaponPresenter: { quarks: {
      spawnMiningEjecta: (...args) => solids.push({ kind: 'ore', args }),
      spawnCollisionSpall: (...args) => solids.push({ kind: 'rock', args }),
      // The debris layer is now a SUPPORTING pass of the composed impact recipe rather than a
      // direct call: one contact fills an impact record and arcadeStructuralFx hands it to this
      // entry point. Recording by materialId keeps the assertions about MATTER, not about which
      // function happened to spawn it.
      emitFromImpact: (rec) => { solids.push({ kind: rec.materialId, args: [rec] }); return 1; },
    } },
  });
  return { system, sparks, solids, surfaces };
}

test('mining contact ejects brief cutting sparks off the work face and delegates mineral mass to lit solids', () => {
  const { system, sparks, solids, surfaces } = fixture();
  system._onMiningTick({ pos: { x: 0, z: 0 }, oreType: 'iron' });
  // One contact, one composed recipe: the mineral yield AND the cut-face spall, which are
  // different materials, not the same burst emitted twice.
  assert.deepEqual(solids.map((s) => s.kind), ['ore', 'rock']);
  const ore = solids.find((s) => s.kind === 'ore');
  assert.ok(ore.args[3] < 0, 'chips leave the rock face toward the source, not through the rock');
  assert.ok(sparks.length > 0 && sparks.length <= 5, 'hot cutting accent is distinct from the mineral fragments');
  assert.ok(sparks.every((s) => s[2] < 0 && s[4] <= 0.28 && s[5] < 1));
  assert.ok(surfaces.length >= 2, 'contact and evolving dust remain');
});

test('yield and asteroid fracture carry solid matter without duplicating it as luminous glitter', () => {
  const { system, sparks, solids, surfaces } = fixture();
  system._onMiningYield({ pos: { x: 4, z: 8 }, qty: 6 });
  system._onAsteroidShatter({ pos: { x: 4, z: 8 } }, false);
  assert.deepEqual(solids.map((s) => s.kind), ['ore', 'rock']);
  assert.equal(sparks.length, 0);
  assert.ok(surfaces.length >= 4, 'fracture contact and dust still articulate both events');
});

test('collection resolves into the collector without a surrounding particle celebration', () => {
  const { system, sparks, surfaces } = fixture();
  system._onPickup({ pos: { x: 8, z: 0 }, amount: 2, qty: 2, kind: 'credits' });
  assert.equal(sparks.length, 0);
  assert.ok(surfaces.length > 1, 'the actual approach and intake still receive feedback');
});

test('shared contact slivers have tapered folded depth and preserve the pooled buffer contract on resize', () => {
  const cloud = createShardStreakCloud(new THREE.Scene(), 4);
  for (const capacity of [4, 8]) {
    if (capacity !== 4) resizeShardStreakCloud(cloud, capacity);
    const geometry = cloud.geometry;
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.max.z > geometry.boundingBox.min.z, 'fold has real transverse depth');
    assert.equal(cloud.position.count, capacity);
    assert.equal(cloud.trailAxis.count, capacity);
    assert.ok(geometry.getAttribute('position').array.every(Number.isFinite));
  }
  assert.equal(cloud.material.forceSinglePass, true);
  cloud.geometry.dispose(); cloud.material.dispose();
});
