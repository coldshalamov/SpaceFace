// The space background must be BUILT ONCE AT ITS TRUE TIER during boot.
//
// SpaceBackground resolves its quality tier inside its constructor by reading state.render.gpu.
// renderer.js used to call detectGpu() ~400 lines AFTER createSpaceBackground(), so the constructor
// saw an empty object, guessed 'mid', and built the whole procedural backdrop — nebula bakes up to
// 2048², 6-16k stars, the flare set, the comet, the hero impostors — before applyGpuTier() threw it
// away and built it again. Every machine whose true tier is not 'mid' paid that twice at boot, with
// the largest stall on the fastest hardware.
//
// This test pins both halves: the ordering inside renderer.js, and the behaviour that ordering buys.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SpaceBackground } from '../src/render/spaceBackground.js';

const HIGH_TIER_GPU = { renderer: 'NVIDIA GeForce RTX 4080', vendor: 'NVIDIA', software: false, tier: 'discrete' };
const SOFTWARE_GPU = { renderer: 'Google SwiftShader', vendor: 'Google Inc.', software: true, tier: 'software' };

// Build a SpaceBackground whose GPU-touching entry points are counted instead of executed. Only the
// WebGL/canvas work is replaced; the tier resolution and the constructor's build SEQUENCE — the
// thing under test — run for real.
function buildProbe(gpu, { particleQuality = 'medium' } = {}) {
  const calls = {
    bakeAll: 0, _createStars: 0, _createFlares: 0, _createComet: 0,
    _refreshHeroes: 0, _rebuildStarsAndFlares: 0, _warmPlanetBakePipeline: 0,
  };

  class ProbeBackground extends SpaceBackground {
    _measureGeometry() {
      // real one casts through a live camera + renderer drawing buffer
      this.heroDist = 400; this.heroSizeK = 4; this.quadSize = 800;
      this.starCell = 1800; this.windowBiasZ = 0; this.perspScale = 973; this.starPxToWorld = 0.4;
    }
    _bakeFlareAtlas() { return null; }
    _warmPlanetBakePipeline() { calls._warmPlanetBakePipeline += 1; return true; }
    bakeAll() { calls.bakeAll += 1; }
    _createStars() { calls._createStars += 1; }
    _createFlares() { calls._createFlares += 1; }
    _createComet() { calls._createComet += 1; }
    _refreshHeroes() { calls._refreshHeroes += 1; }
    // mirrors the real method: it is the star/flare rebuild path
    _rebuildStarsAndFlares() {
      calls._rebuildStarsAndFlares += 1;
      this._createStars();
      this._createFlares();
    }
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  camera.position.set(0, 120, 90);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const state = {
    meta: { seed: 4242 },
    render: gpu ? { gpu } : {},          // gpu === null models the OLD detect-after-construct order
    settings: { video: { particleQuality } },
  };

  return { bg: new ProbeBackground(scene, state, { camera }), calls, state };
}

// ---------------------------------------------------------------------------------------------
// 1. Shipped ordering: GPU known first => exactly one build of every expensive entry point.
// ---------------------------------------------------------------------------------------------
const high = buildProbe(HIGH_TIER_GPU);
assert.equal(high.bg.tierName, 'high', 'a discrete GPU published before construction resolves the high tier immediately');
assert.deepEqual(high.calls, {
  bakeAll: 1, _createStars: 1, _createFlares: 1, _createComet: 1,
  _refreshHeroes: 1, _rebuildStarsAndFlares: 0, _warmPlanetBakePipeline: 1,
}, 'construction builds the backdrop exactly once');

high.bg.applyGpuTier(HIGH_TIER_GPU);
assert.deepEqual(high.calls, {
  bakeAll: 1, _createStars: 1, _createFlares: 1, _createComet: 1,
  _refreshHeroes: 1, _rebuildStarsAndFlares: 0, _warmPlanetBakePipeline: 1,
}, "renderer.js's applyGpuTier call is a no-op safety net once detection runs first");

high.bg.applyGpuTier(HIGH_TIER_GPU);
assert.equal(high.calls.bakeAll, 1, 'an unchanged tier never rebuilds, however often applyGpuTier is called');

// No quality was traded away: the surviving build carries the authored high-tier numbers.
assert.deepEqual(high.bg.bakeSizes, { L0_void: 2048, L1_nebula: 2048, L2_wisps: 2048 });
assert.equal(high.bg.starCount, 16000);
assert.equal(high.bg.flareCount, 72);
assert.equal(high.bg.lowTier, false);

// ---------------------------------------------------------------------------------------------
// 2. The defect this packet removes: detect-after-construct builds everything TWICE.
// ---------------------------------------------------------------------------------------------
const legacy = buildProbe(null);
assert.equal(legacy.bg.tierName, 'mid', 'with no GPU published the constructor can only guess (mid)');
assert.equal(legacy.calls.bakeAll, 1, 'the guessed-tier build happens first');

legacy.state.render.gpu = HIGH_TIER_GPU;   // detectGpu() lands ~400 lines later, as it used to
legacy.bg.applyGpuTier(HIGH_TIER_GPU);
assert.equal(legacy.bg.tierName, 'high');
assert.deepEqual(legacy.calls, {
  bakeAll: 2, _createStars: 2, _createFlares: 2, _createComet: 2,
  _refreshHeroes: 2, _rebuildStarsAndFlares: 1, _warmPlanetBakePipeline: 1,
}, 'the old ordering discards a complete backdrop build and pays for a second one');

// ---------------------------------------------------------------------------------------------
// 3. Weak hardware still gets the cheap path — and gets it from the first build.
// ---------------------------------------------------------------------------------------------
const low = buildProbe(SOFTWARE_GPU);
assert.equal(low.bg.tierName, 'low');
assert.equal(low.bg.lowTier, true);
assert.deepEqual(low.bg.bakeSizes, { L0_void: 512, L1_nebula: 1024, L2_wisps: 512 });
assert.equal(low.bg.starCount, 6000);
assert.equal(low.bg.flareCount, 36);
low.bg.applyGpuTier(SOFTWARE_GPU);
assert.equal(low.calls.bakeAll, 1, 'the software tier is resolved once, not guessed then corrected');
assert.equal(low.calls._warmPlanetBakePipeline, 1,
  'every quality tier admits the same planet shader once during loading');

// The one behavioural delta of the hoist. _bakePlanetTarget sizes off this.lowTier and memoizes into
// planetCache, which applyGpuTier does NOT invalidate — so under the old ordering a software machine
// baked 512² planet impostors at the mid guess and kept them forever after dropping to 'low'.
// Detecting first makes lowTier true before the first hero spawn, restoring the authored 256².
assert.equal(buildProbe(null).bg.lowTier, false,
  'the mid guess reported lowTier=false, which is how software machines got stuck with 512² planets');
// A particleQuality:'low' profile already guessed low, so that route never had the discrepancy.
assert.equal(buildProbe(null, { particleQuality: 'low' }).bg.lowTier, true);

// ---------------------------------------------------------------------------------------------
// 4. The ordering guard. Section 2 above proves the cost of the wrong order but constructs the
//    background itself, so only this pins renderer.js. Anchor on call-site strings (the imports
//    appear far earlier in the file and would make a bare identifier search meaningless).
// ---------------------------------------------------------------------------------------------
const rendererSrc = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');   // worktrees may check out CRLF; the primary is LF

const detectAt = rendererSrc.indexOf('const gpu = detectGpu(renderer);');
const publishAt = rendererSrc.indexOf('state.render.gpu = gpu;');
const constructAt = rendererSrc.indexOf('const spaceBg = createSpaceBackground(');
const applyAt = rendererSrc.indexOf('spaceBg.applyGpuTier(gpu)');

assert.ok(detectAt >= 0, 'renderer.js must still contain the `const gpu = detectGpu(renderer);` call site');
assert.ok(publishAt >= 0, 'renderer.js must still publish `state.render.gpu = gpu;`');
assert.ok(constructAt >= 0, 'renderer.js must still contain the createSpaceBackground call site');
assert.ok(applyAt >= 0, 'renderer.js must keep the applyGpuTier safety net / live re-tier call');

assert.ok(detectAt < constructAt,
  'detectGpu(renderer) must run BEFORE createSpaceBackground, or the background is built twice at boot');
assert.ok(publishAt < constructAt,
  'state.render.gpu must be published BEFORE createSpaceBackground: the constructor reads it to pick its tier');
assert.ok(constructAt < applyAt,
  'applyGpuTier stays after construction (no-op safety net + live re-tier entry point)');

const detectCallSites = rendererSrc.split('detectGpu(renderer)').length - 1;
assert.equal(detectCallSites, 1, 'GPU detection runs exactly once per renderer init');

console.log('space-background-boot-tier-single-build: PASS');
