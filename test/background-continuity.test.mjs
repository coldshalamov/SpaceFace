import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpaceBackground, screenNdcToParallaxAnchor } from '../src/render/spaceBackground.js';
import { PaintedPlanets } from '../src/render/paintedPlanets.js';
import { PARALLAX_BANDS, PARALLAX_WRAP_ZOOM_CAP } from '../src/render/parallaxLayers.js';
import { RELEASE_COPY_MAPPINGS, copyReleaseRuntimeTrees } from '../scripts/lib/releasePackaging.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the entire extreme chase footprint remains inside the unshrunk debris cell', () => {
  const camera = new THREE.PerspectiveCamera(50, 4, 0.1, 20000);
  const distance = PARALLAX_WRAP_ZOOM_CAP;
  camera.position.set(0, distance * Math.sin(Math.PI / 3), -distance * 0.5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const spec of Object.values(PARALLAX_BANDS)) {
    assert.ok(spec.y + spec.yJitter / 2 + spec.radius1 * 2 < 0, 'dressing stays below gameplay');
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -spec.y + spec.yJitter / 2);
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
      assert.ok(point);
      assert.ok(Math.max(Math.abs(point.x), Math.abs(point.z)) + spec.radius1 * 2 < spec.tile * 0.5 * 0.78);
    }
  }
});

function heroHarness() {
  const bg = Object.assign(Object.create(SpaceBackground.prototype), {
    H: 96, quadSize: 1000, camX: 0, camZ: 0, skySeed: 47,
    group: new THREE.Group(), planets: [], wormhole: null,
    backgroundComposition: { planetChance: 1, ringChance: 0, wormholeChance: 0 },
  });
  bg._spawnPlanet = function(spec) {
    const sprite = new THREE.Sprite();
    sprite.scale.setScalar(20);
    this.group.add(sprite);
    this.planets.push({ sprite, mat: { dispose() {} }, spec });
  };
  bg._spawnWormhole = function(spec) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    this.group.add(mesh);
    this.wormhole = { mesh, material: mesh.material, spec };
  };
  return bg;
}

function heroesOnGlass(bg) {
  return bg.planets.length + (bg.wormhole ? 1 : 0);
}

// Camera-aware variant: a real chase-camera-shaped PerspectiveCamera plus a rig-locked group,
// so hero "on glass" is measured by projected body bounds, not the quad window.
function cameraHeroHarness() {
  const bg = heroHarness();
  bg.bgY = -211.2;
  bg.heroSizeK = 4;
  bg.group.position.set(bg.camX, bg.bgY, bg.camZ);
  bg.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 20000);
  bg.camera.position.set(0, 140, 80);
  bg.camera.lookAt(0, 0, 0);
  bg.camera.updateMatrixWorld(true);
  return bg;
}

// A planet spec whose body projects to the given NDC point through the harness camera.
function anchorPlanetSpec(bg, ndcX, ndcY, extra = {}) {
  const a = screenNdcToParallaxAnchor(bg.camera, ndcX, ndcY,
    { x: bg.camX, z: bg.camZ }, { bgY: bg.bgY, heroDepth: 12 });
  return { kind: 'planet', type: 'gas', frac: 0.15, seed: 7, bx: a.bx, bz: a.bz, ...extra };
}

// Same anchor, converted for the wormhole parallax band (WORM_PAR = 0.10).
function anchorWormholeSpec(bg, ndcX, ndcY, extra = {}) {
  const a = screenNdcToParallaxAnchor(bg.camera, ndcX, ndcY,
    { x: bg.camX, z: bg.camZ }, { bgY: bg.bgY, heroDepth: 12 });
  return {
    kind: 'wormhole', frac: 0.15,
    bx: a.worldX - bg.camX * (1 - 0.10), bz: a.worldZ - bg.camZ * (1 - 0.10),
    ...extra,
  };
}

// Move the whole chase rig: logical camX/camZ, the projection camera, and the rig-locked group.
// Hero parallax math only stays coherent when all three agree.
function moveRig(bg, camX, camZ = bg.camZ) {
  bg.camX = camX;
  bg.camZ = camZ;
  bg.camera.position.x = camX;
  bg.camera.position.z = camZ + 80;
  bg.camera.updateMatrixWorld(true);
  bg.group.position.set(camX, bg.bgY, camZ);
}

test('crossing a wormhole-only grid boundary retains resident planets and their transforms', () => {
  const bg = heroHarness();
  bg.camX = 6719; // planet grid is still zero; worm grid crosses at 6720
  const spec = { bx: bg.camX * 0.055, bz: 0, seed: 5, kind: 'planet' };
  bg._spawnPlanet(spec);
  bg._refreshHeroes(false);
  const resident = bg.planets[0];
  const matrix = resident.sprite.matrix.clone();
  bg.camX = 6721;
  bg._refreshHeroes(false);
  assert.ok(bg.planets.includes(resident), 'unrelated grid must not respawn a visible landmark');
  assert.equal(resident.spec, spec);
  assert.deepEqual(resident.sprite.matrix, matrix);
});

// ---------------------------------------------------------------------------
// One sky (ZERO_TO_HERO §4 Phase 2): at most ONE hero celestial body on glass at
// a time, planet or wormhole counting both. "On glass" is projected body bounds
// against the real camera; without a camera the wide quad window is the
// conservative fallback. The wide window still owns pruning/retention only.
// ---------------------------------------------------------------------------

test('one sky: the sector signature hero claims the single slot on initial entry', () => {
  const bg = cameraHeroHarness();
  bg.quadSize = 4000;
  bg.backgroundComposition = { planetChance: 1, ringChance: 0, wormholeChance: 1 };
  const signature = anchorPlanetSpec(bg, 0.3, 0.2, { signature: 'vesta', ring: true });
  bg._signatureHeroAnchor = signature;
  bg._refreshHeroes(true);
  assert.equal(bg.planets.length, 1, 'the signature planet is the one resident');
  assert.equal(bg.planets[0].spec, signature, 'the signature spec itself was admitted first');
  assert.equal(bg.wormhole, null, 'no wormhole joins the signature on glass');
});

test('one sky: an offscreen signature does not steal the slot from a visible hero', () => {
  const bg = cameraHeroHarness();
  const signature = anchorPlanetSpec(bg, 3.0, -0.4, { signature: 'vesta' });
  const visible = anchorPlanetSpec(bg, -0.2, 0);
  bg._signatureHeroAnchor = signature;
  bg.heroPlacement = [signature, visible];
  bg._admitHero();
  assert.equal(bg.planets.length, 1);
  assert.equal(bg.planets[0].spec, visible, 'the projected-visible hero fills the slot');
});

test('one sky: planet and wormhole candidates together never yield more than one hero', () => {
  const bg = heroHarness();
  bg.quadSize = 4000;
  bg.backgroundComposition = { planetChance: 1, ringChance: 0, wormholeChance: 1 };
  bg._refreshHeroes(true);
  assert.ok(bg.heroPlacement.some(s => s.kind === 'planet'), 'planet candidates were generated');
  assert.ok(bg.heroPlacement.some(s => s.kind === 'wormhole'), 'wormhole candidates were generated');
  assert.equal(heroesOnGlass(bg), 1, 'exactly one hero body owns the glass');
  // A later grid crossing must not add a second body alongside the resident.
  bg.camX += 9600;
  bg._refreshHeroes(false);
  assert.ok(heroesOnGlass(bg) <= 1, 'a grid crossing still leaves at most one hero');
});

test('one sky: wormhole candidates alone still present exactly one hero', () => {
  const bg = heroHarness();
  bg.quadSize = 4000;
  bg.backgroundComposition = { planetChance: 0, ringChance: 0, wormholeChance: 1 };
  bg._refreshHeroes(true);
  assert.equal(bg.planets.length, 0);
  assert.ok(bg.wormhole, 'a wormhole fills the single hero slot');
  assert.equal(heroesOnGlass(bg), 1);
});

test('one sky: a visible resident keeps the slot across an unrelated grid crossing', () => {
  const bg = cameraHeroHarness();
  bg.quadSize = 4000;
  moveRig(bg, 6719); // worm grid crosses at 6720; planet grid stays put
  const resident = anchorPlanetSpec(bg, -0.3, 0.1);
  bg._spawnPlanet(resident);
  const sprite = bg.planets[0].sprite;
  const pose = sprite.position.clone();
  const wgxBefore = Math.floor(bg.camX * 0.10 / (bg.H * 7.0));
  moveRig(bg, 6721);
  assert.notEqual(Math.floor(bg.camX * 0.10 / (bg.H * 7.0)), wgxBefore,
    'the wormhole grid really crossed');
  bg._refreshHeroes(false);
  assert.equal(bg.planets[0].sprite, sprite, 'resident sprite survives the crossing');
  assert.ok(sprite.position.equals(pose), 'resident pose is untouched');
  assert.equal(bg.planets.length, 1, 'no second hero joins the visible resident');
});

test('one sky: a resident wormhole is not displaced by an unrelated planet-grid crossing', () => {
  const bg = cameraHeroHarness();
  bg.quadSize = 4000;
  bg.backgroundComposition = { planetChance: 1, ringChance: 0, wormholeChance: 0 };
  moveRig(bg, 8727); // planet cell boundary at ~8727.3; worm cell stays inside its own
  bg.wormhole = {
    mesh: { material: { uniforms: { uTime: { value: 0 } } } },
    material: { dispose() {} },
    spec: anchorWormholeSpec(bg, 0.4, -0.1),
    radius: 20,
  };
  bg.wormhole.mesh.geometry = { dispose() {} };
  const pgxBefore = Math.floor(bg.camX * 0.055 / (bg.H * 5.0));
  const wgxBefore = Math.floor(bg.camX * 0.10 / (bg.H * 7.0));
  moveRig(bg, 8729);
  assert.notEqual(Math.floor(bg.camX * 0.055 / (bg.H * 5.0)), pgxBefore,
    'the planet grid really crossed');
  assert.equal(Math.floor(bg.camX * 0.10 / (bg.H * 7.0)), wgxBefore,
    'the wormhole grid did not cross');
  bg._refreshHeroes(false);
  assert.ok(bg.wormhole, 'the resident wormhole survived the planet-grid crossing');
  assert.equal(bg.planets.length, 0, 'no planet joined the resident wormhole');
});

test('one sky: a resident beyond the viewport but inside the quad yields to a visible hero', () => {
  const bg = cameraHeroHarness();
  bg.quadSize = 8000;
  const offscreen = anchorPlanetSpec(bg, 1.8, 0.6);
  assert.ok(Math.abs(offscreen.bx - bg.camX * 0.055) < bg.quadSize * 0.5,
    'the resident is still inside the wide quad window');
  bg._spawnPlanet(offscreen);
  const visible = anchorPlanetSpec(bg, 0, 0);
  bg.heroPlacement = [visible];
  bg._admitHero();
  assert.equal(bg.planets.length, 1, 'offscreen resident yielded; visible hero admitted');
  assert.equal(bg.planets[0].spec, visible);
});

test('one sky: a hero that leaves the window retires and the next candidate is admitted', () => {
  const bg = heroHarness();
  bg.quadSize = 4000;
  bg._refreshHeroes(true);
  const first = bg.planets[0];
  assert.ok(first, 'an initial hero was admitted');
  const firstSpec = first.spec;
  bg.camX += bg.quadSize * 20; // far past the retention margin and across several grid cells
  bg._refreshHeroes(false);
  assert.ok(!bg.planets.includes(first), 'the departed hero was retired');
  assert.equal(bg.planets.length, 1, 'the next seeded candidate took the slot');
  assert.notEqual(bg.planets[0].spec, firstSpec);
});

test('one sky: camera movement alone refreshes a visible candidate without a grid crossing', () => {
  const bg = cameraHeroHarness();
  moveRig(bg, 8700); // anchor where the candidate will land once the rig arrives
  const spec = anchorPlanetSpec(bg, 0, 0);
  moveRig(bg, 0); // back before the candidate's parallax drift reaches the glass
  bg.heroPlacement = [spec];
  bg._admitHero();
  assert.equal(bg.planets.length, 0, 'the candidate starts offscreen');
  const pgx = Math.floor(bg.camX * 0.055 / (bg.H * 5.0));
  moveRig(bg, 8700);
  assert.equal(Math.floor(bg.camX * 0.055 / (bg.H * 5.0)), pgx,
    'the hero grid did not cross');
  bg._reconcileHeroViewport();
  assert.equal(bg.planets.length, 1, 'viewport reconcile admits the now-visible hero');
  assert.equal(bg.planets[0].spec, spec);
});

test('one sky: an offscreen retained hero cannot hold the slot empty', () => {
  const bg = heroHarness(); // windowR 500, retention margin = sprite scale
  const spec = { bx: 600, bz: 0, seed: 5, kind: 'planet' };
  bg._spawnPlanet(spec);
  bg.planets[0].sprite.scale.setScalar(300); // retained out to windowR + 300, but off-glass
  bg._refreshHeroes(false);
  assert.equal(bg.planets.length, 1, 'one hero on glass');
  assert.notEqual(bg.planets[0].spec, spec,
    'the offscreen survivor yielded the slot to an in-window candidate');
});

test('one sky: a deferred wormhole reservation blocks planet admission', () => {
  const bg = heroHarness();
  bg.quadSize = 4000;
  bg.backgroundComposition = { planetChance: 1, ringChance: 0, wormholeChance: 0 };
  bg._deferredWormhole = { kind: 'wormhole', bx: 10, bz: 10, frac: 0.15 };
  bg._refreshHeroes(false);
  assert.equal(bg.planets.length, 0,
    'no planet may jump a parked wormhole reservation and steal the slot');
});

test('one sky: an on-glass deferred wormhole blocks admission, a stale one clears', () => {
  const bg = cameraHeroHarness();
  bg.heroPlacement = [anchorPlanetSpec(bg, 0, 0)];
  bg._deferredWormhole = anchorWormholeSpec(bg, 0.4, 0);
  bg._admitHero();
  assert.equal(bg.planets.length, 0, 'a visible reservation keeps the slot');
  bg._deferredWormhole = anchorWormholeSpec(bg, 3.0, -0.4);
  bg._admitHero();
  assert.equal(bg._deferredWormhole, null, 'the stale reservation clears');
  assert.equal(bg.planets.length, 1, 'the visible planet is admitted once the stale hold clears');
});

test('window resize does not rebuild or rescale the sky geography', () => {
  const bg = Object.assign(Object.create(SpaceBackground.prototype), {
    H: 96, bgY: -211.2, starCell: 1800, heroSizeK: 4, quadSize: 5000,
    _computePerspScale: () => 1200, _publishOpeningSubmissionPackage() {},
    _buildLayers() { assert.fail('resize rebuilt layers'); },
    _rebuildStarsAndFlares() { assert.fail('resize reseeded stars'); },
    _refreshHeroes() { assert.fail('resize respawned heroes'); },
  });
  bg.onResize();
  assert.deepEqual([bg.H, bg.bgY, bg.starCell, bg.heroSizeK, bg.quadSize], [96, -211.2, 1800, 4, 5000]);
  assert.equal(bg.perspScale, 1200);
});

test('sector re-priming preserves the accumulated background phase', () => {
  const bg = Object.assign(Object.create(SpaceBackground.prototype), {
    _sectorId: 'same', layers: [{ streamU: 0.17, streamV: -0.23 }], camX: 300, camZ: 500,
  });
  bg.onSectorEnter({ id: 'same' });
  assert.deepEqual(bg.layers[0], { streamU: 0.17, streamV: -0.23 });
  assert.equal(bg._streamPrimed, false);
});

test('painted planet variants share image storage, update after decode, and dispose safely in flight', () => {
  const callbacks = [];
  const texture = new THREE.Texture();
  const library = new PaintedPlanets({ load(url, onLoad) {
    callbacks.push(onLoad); return callbacks.length === 1 ? texture : new THREE.Texture();
  } });
  for (const view of library.views) {
    assert.equal(view.source, texture.source);
    assert.deepEqual(view.repeat.toArray(), [0.5, 0.5]);
  }
  assert.equal(library.get({ type: 'gas', seed: 1 }), library.views[1]);
  const version = library.views[1].version;
  callbacks[1](); // the ring image may arrive before the atlas
  assert.equal(library.views[1].version, version, 'ring decode cannot upload an empty atlas');
  assert.equal(library.ready, false);
  callbacks[0]();
  assert.ok(library.views[1].version > version);
  assert.equal(library.ready, true);
  library.failed = true;
  assert.equal(library.get({ type: 'gas' }), null, 'missing art must allow the reported bake fallback');
  library.dispose();
  callbacks[0](); // late callback cannot re-upload disposed textures
  assert.equal(library.get({ type: 'gas' }), null);
});

test('the retail copy path contains the exact authored background pixels', async () => {
  const output = await mkdtemp(join(tmpdir(), 'spaceface-quiet-sky-'));
  try {
    const mappings = RELEASE_COPY_MAPPINGS.filter(m => m.source === 'assets/background');
    assert.equal(mappings.length, 1);
    await copyReleaseRuntimeTrees({ root: process.cwd(), webRoot: output, mappings });
    assert.deepEqual(await readFile(join(output, 'assets/background/quiet-planets.png')),
      await readFile('assets/background/quiet-planets.png'));
  } finally {
    await rm(output, { recursive: true, force: true }); // exact mkdtemp directory owned by this test
  }
});
