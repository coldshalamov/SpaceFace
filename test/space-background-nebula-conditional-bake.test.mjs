// The two nebula tiles (L1, L2) must not be baked when nothing can see them — and must come back
// intact the instant something can.
//
// LAYER_COMPOSITE_FRAG multiplies both tiles through the resolved sector opacity:
//     nebulaAlpha = clamp(l1.a * uNebulaOpacity * 1.35, 0.0, 1.0)
//     wispsAlpha  = clamp(l2.a * uNebulaOpacity * 0.55, 0.0, 1.0)
// so at nebulaOpacity 0 both mix() calls are identities. All five shipped sector profiles resolve
// to 0, which meant every sector change baked two full-resolution tiles (2048² RGBA each at the
// high tier) that contributed exactly zero pixels.
//
// This is a residency/cadence optimisation, NOT a quality reduction: the authored l1Alpha/l2Alpha
// values stay live in the profiles and the full-resolution bake is restored on demand. The tests
// below pin BOTH halves, because a deferral that never un-defers is indistinguishable from having
// deleted the feature.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpaceBackground } from '../src/render/spaceBackground.js';

const HIGH_TIER_GPU = { renderer: 'NVIDIA GeForce RTX 4080', vendor: 'NVIDIA', software: false, tier: 'discrete' };

function buildProbe() {
  const baked = [];

  class ProbeBackground extends SpaceBackground {
    _measureGeometry() {
      this.heroDist = 400; this.heroSizeK = 4; this.quadSize = 800;
      this.starCell = 1800; this.windowBiasZ = 0; this.perspScale = 973; this.starPxToWorld = 0.4;
    }
    _bakeFlareAtlas() { return null; }
    _warmPlanetBakePipeline() { return true; }
    // Canvas/DOM builders, irrelevant to the bake path under test.
    _createStars() {}
    _createFlares() {}
    _createComet() {}
    _refreshHeroes() {}
    // The only GPU-touching leaf in the bake path. Counting it measures real work performed.
    _bakeLayer(material, rt) { baked.push(rt); }
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  camera.position.set(0, 120, 90);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const state = {
    meta: { seed: 4242 },
    render: { gpu: HIGH_TIER_GPU },
    settings: { video: { particleQuality: 'medium' } },
  };
  return { bg: new ProbeBackground(scene, state, { camera }), baked };
}

// ---------------------------------------------------------------------------------------------
// 1. At zero opacity the tiles are stubs and no nebula fragment work is performed.
// ---------------------------------------------------------------------------------------------
const a = buildProbe();
assert.equal(a.bg.nebulaOpacity, 0, 'default sector state resolves the nebula fully suppressed');
assert.deepEqual(a.bg.bakeSizes, { L0_void: 2048, L1_nebula: 2048, L2_wisps: 2048 },
  'authored tile sizes are untouched - this packet changes WHEN they bake, never how large they are');

assert.equal(a.bg.l1Target.isNebulaStub, true, 'L1 defers to a stand-in while invisible');
assert.equal(a.bg.l2Target.isNebulaStub, true, 'L2 defers to a stand-in while invisible');
assert.equal(a.bg.l1Target.width, 1, 'the stand-in carries no tile residency');
assert.equal(a.bg.l2Target.width, 1);
assert.deepEqual(a.bg._nebulaBakePending, { L1: true, L2: true },
  'the deferral is recorded PER LAYER so each tile can be undone independently');

// L0 is unconditional; only the two opacity-gated tiles are skipped.
assert.equal(a.baked.length, 1, 'exactly one tile is rendered at zero opacity (L0), not three');
assert.equal(a.baked[0], a.bg.l0Target, 'the tile that did bake is the deep-field base');

// ---------------------------------------------------------------------------------------------
// 2. Promotion restores full-resolution tiles and repoints every consumer.
// ---------------------------------------------------------------------------------------------
const beforePromote = a.baked.length;
a.bg._ensureNebulaBake();

assert.deepEqual(a.bg._nebulaBakePending, { L1: false, L2: false }, 'promotion clears both deferrals');
assert.notEqual(a.bg.l1Target.isNebulaStub, true, 'L1 is a real tile after promotion');
assert.notEqual(a.bg.l2Target.isNebulaStub, true, 'L2 is a real tile after promotion');
assert.equal(a.bg.l1Target.width, 2048, 'promotion restores the FULL authored resolution');
assert.equal(a.bg.l2Target.width, 2048);
assert.equal(a.baked.length - beforePromote, 2, 'promotion bakes exactly the two deferred tiles');

// A stale sampler is invisible in review and shows up only as a tile that never appears.
assert.equal(a.bg.layerMaterial.uniforms.uL1.value, a.bg.l1Target.texture,
  'the composite material samples the promoted L1');
assert.equal(a.bg.layerMaterial.uniforms.uL2.value, a.bg.l2Target.texture,
  'the composite material samples the promoted L2');
assert.equal(a.bg.layers[1].tex, a.bg.l1Target.texture, 'the L1 layer descriptor is repointed too');
assert.equal(a.bg.layers[2].tex, a.bg.l2Target.texture, 'the L2 layer descriptor is repointed too');

// ---------------------------------------------------------------------------------------------
// 3. Promotion is idempotent — defensive calls are free.
// ---------------------------------------------------------------------------------------------
const afterPromote = a.baked.length;
a.bg._ensureNebulaBake();
a.bg._ensureNebulaBake();
assert.equal(a.baked.length, afterPromote, 'a satisfied bake never repeats');

// ---------------------------------------------------------------------------------------------
// 4. The wormhole is the consumer that bypasses uNebulaOpacity, so it must force promotion.
//    Without this, a wormhole spawning in a suppressed-nebula sector would lens a 1x1 stand-in.
// ---------------------------------------------------------------------------------------------
const b = buildProbe();
assert.equal(b.bg.l1Target.isNebulaStub, true, 'starts deferred');
const beforeWormhole = b.baked.length;
b.bg._spawnWormhole({ frac: 0.3, seed: 7 });

assert.notEqual(b.bg.l1Target.isNebulaStub, true, 'L1 is real once a wormhole exists');
assert.equal(b.bg.l1Target.width, 2048, 'the wormhole lenses a full-resolution tile');
assert.equal(b.bg.wormhole.material.uniforms.uL1.value, b.bg.l1Target.texture,
  'the wormhole samples the promoted tile, not the stand-in it would have captured');

// The saving must not be handed back wholesale. The lens reads uL1 and nothing else, so L2 has no
// consumer here and stays deferred — at the high tier that alone is a 2048² tile left unallocated.
assert.equal(b.bg.l2Target.isNebulaStub, true, 'L2 has no wormhole consumer and stays deferred');
assert.deepEqual(b.bg._nebulaBakePending, { L1: false, L2: true },
  'a wormhole promotes L1 ONLY - promoting both would return the larger half of the saving for free');
assert.equal(b.baked.length - beforeWormhole, 1, 'exactly one tile is baked for a wormhole, not two');

// ---------------------------------------------------------------------------------------------
// 5. A sector that actually shows its nebula bakes both tiles immediately — no deferral, no stub.
// ---------------------------------------------------------------------------------------------
const c = buildProbe();
const beforeVisible = c.baked.length;
c.bg.nebulaOpacity = 0.28;
c.bg.bakeAll();

assert.deepEqual(c.bg._nebulaBakePending, { L1: false, L2: false }, 'a visible nebula is never deferred');
assert.notEqual(c.bg.l1Target.isNebulaStub, true, 'visible sectors get real tiles up front');
assert.notEqual(c.bg.l2Target.isNebulaStub, true);
assert.equal(c.bg.l1Target.width, 2048);
assert.equal(c.bg.l2Target.width, 2048);
assert.equal(c.baked.length - beforeVisible, 3, 'a visible-nebula bake renders all three tiles');

console.log('space-background nebula conditional bake: OK');
