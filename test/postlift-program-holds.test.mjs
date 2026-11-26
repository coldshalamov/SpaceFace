// Post-lift program holds (Perf Lane, 2026-11-26). Four first-use programs still linked inside
// presented flight on master 1e21de3b71 because their owners never existed (or never sat in a
// walked scene) while the first-flight cohort compiled: the weapon/well distortion producers draw
// private scenes, beacon lamp beads and the L5 planet impostor mount only once their beacon or cell
// comes into range. Each now compiles its REAL material behind the shell.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createBloom } from '../src/render/bloom.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { BEACON_LAMP_HOLD_NAME, BeaconLampLayer } from '../src/render/beaconLampLife.js';
import { collectFirstFlightEffectRoots, collectFirstFlightLayerDrawables } from '../src/render/latePipelineAdmission.js';
import { PLANET_PROGRAM_HOLD_NAME, SpaceBackground } from '../src/render/spaceBackground.js';

function compileRecorder() {
  let target = null;
  const compiles = [];
  const renderer = {
    capabilities: { isWebGL2: false, maxSamples: 0 }, autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    getClearColor(out) { return out; },
    getClearAlpha: () => 1,
    setClearColor() {},
    clear() {},
    initRenderTarget() {},
    render() {},
    compile(scene) { compiles.push({ scene, target }); },
  };
  return { renderer, compiles };
}

test('bloom prepareResources links every attached distortion producer against the distortion target', async () => {
  const h = compileRecorder();
  const bloom = createBloom(h.renderer, 640, 360);
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  try {
    presenter.attachGraph(bloom);
    const target = bloom.contextLossResources().find((rt) => rt && rt.texture && rt.texture.name === 'Bloom:Distortion');
    assert.ok(target, 'attaching producers allocates the distortion target');
    await bloom.prepareResources();
    const producerCompiles = h.compiles.filter((c) => c.scene === presenter.distortion.scene
      || c.scene === presenter.wellDistortion.scene);
    assert.equal(producerCompiles.length, 2, 'weapon haze and Well lens both link behind the shell');
    for (const c of producerCompiles) assert.equal(c.target, target, 'compiled against the target it draws into');
    assert.equal(presenter.distortion.mesh.name, 'SF_WeaponDistortion');
  } finally { bloom.dispose(); }
});

test('bloom without producers compiles no distortion scene', async () => {
  const h = compileRecorder();
  const bloom = createBloom(h.renderer, 640, 360);
  try {
    await bloom.prepareResources();
    assert.ok(h.compiles.every((c) => c.scene.name !== 'SF_WeaponDistortionScene'));
  } finally { bloom.dispose(); }
});

test('beacon lamp hold bead joins the first-flight cohort and hands its material to the first live bead', () => {
  const scene = new THREE.Scene();
  const layer = new BeaconLampLayer();
  const bead = layer.mountProgramHold(scene);
  assert.equal(bead.name, BEACON_LAMP_HOLD_NAME);
  assert.equal(bead.visible, false, 'the hold never draws');
  assert.equal(bead.parent, scene);
  assert.equal(layer.mountProgramHold(scene), bead, 'idempotent');
  const roots = collectFirstFlightEffectRoots(scene);
  assert.ok(roots.includes(bead), 'cohort picks the hold up by name');
  assert.ok(collectFirstFlightLayerDrawables(roots).includes(bead), 'hidden drawable still compiles');
  const material = bead.material;
  let disposed = 0;
  material.addEventListener('dispose', () => { disposed++; });
  assert.equal(layer.releaseProgramHold(), true);
  assert.equal(bead.parent, null);
  assert.equal(disposed, 0, 'release never disposes the compiled material (keeps its program)');
  const root = new THREE.Group();
  layer.update([{ id: 7, type: 'beacon', alive: true, pos: { x: 0, z: 0 }, radius: 5,
    data: { storyPropKind: 'route_buoy' }, view: { root } }], 10, false);
  const live = root.children.find((c) => String(c.name).startsWith('sf-beacon-lamp-'));
  assert.ok(live, 'a live beacon in range mounts a bead');
  assert.equal(live.material, material, 'first live bead draws with the compiled material');
  assert.equal(layer.releaseProgramHold(), false);
  layer.dispose();
});

test('planet program hold name is a first-flight cohort root', () => {
  const scene = new THREE.Scene();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  sprite.name = PLANET_PROGRAM_HOLD_NAME;
  sprite.visible = false;
  const group = new THREE.Group();
  group.add(sprite);
  scene.add(group);
  assert.deepEqual(collectFirstFlightEffectRoots(scene), [sprite]);
});

test('space background holds one hidden sprite on the real shared planet material of the nearest candidate', () => {
  const bg = Object.create(SpaceBackground.prototype);
  bg.group = new THREE.Group();
  bg.camX = 0; bg.camZ = 0;
  const near = { kind: 'planet', bx: 10, bz: 0, type: 'rocky', seed: 1 };
  const far = { kind: 'planet', bx: 900, bz: 0, type: 'gas', seed: 2 };
  bg.heroPlacement = [{ kind: 'wormhole', bx: 1, bz: 0 }, far, near];
  const textures = new Map([[near, new THREE.Texture()], [far, new THREE.Texture()]]);
  const asked = [];
  bg._getPlanetTexture = (spec) => { asked.push(spec); return textures.get(spec); };
  bg._holdPlanetProgram();
  const hold = bg.group.children.find((c) => c.name === PLANET_PROGRAM_HOLD_NAME);
  assert.ok(hold && hold.isSprite, 'hold sprite mounted on the background group');
  assert.equal(hold.visible, false);
  assert.deepEqual(asked, [near], 'nearest planet candidate only');
  assert.equal(hold.material, bg._getPlanetSpriteMaterial(textures.get(near)), 'the cache-owned material a live admission reuses');
  assert.equal(hold.material.customProgramCacheKey(), 'spaceface-illustrated-planet-v3');
  bg._holdPlanetProgram();
  assert.equal(bg.group.children.filter((c) => c.name === PLANET_PROGRAM_HOLD_NAME).length, 1, 'one hold per background');
  const empty = Object.create(SpaceBackground.prototype);
  empty.group = new THREE.Group(); empty.camX = 0; empty.camZ = 0; empty.heroPlacement = [{ kind: 'wormhole', bx: 0, bz: 0 }];
  empty._getPlanetTexture = () => { throw new Error('no planet, no bake'); };
  empty._holdPlanetProgram();
  assert.equal(empty.group.children.length, 0, 'a sector with no planet candidates pays nothing');
});

test('sector machine program hold builds one real body per site machine kind, and joins the cohort', async () => {
  const { buildSectorMachineProgramHold, MACHINE_PROGRAM_HOLD_NAME } = await import('../src/render/machineVisuals.js');
  const hold = buildSectorMachineProgramHold('sector_helios_prime');
  assert.ok(hold, 'Helios opening has the unanswered-survey prism');
  assert.equal(hold.name, MACHINE_PROGRAM_HOLD_NAME);
  assert.equal(hold.visible, false);
  const body = hold.getObjectByName('Surveyor_PrismBody');
  assert.ok(body && body.material && body.material.map, 'the live builder: map + vertex colours');
  assert.equal(body.material.vertexColors, true);
  assert.equal(buildSectorMachineProgramHold('sector_does_not_exist'), null);
  assert.equal(buildSectorMachineProgramHold(null), null);
  const scene = new THREE.Scene();
  scene.add(hold);
  assert.deepEqual(collectFirstFlightEffectRoots(scene), [hold]);
  assert.ok(collectFirstFlightLayerDrawables([hold]).includes(body));
});

test('asteroid leaf warm group carries one optic cell per skin, and the keyed census collects their body pairs', async () => {
  const { buildAsteroidLeafWarmGroup } = await import('../src/render/visualFactory.js');
  const { collectAsteroidInstancePoolLeafResources } = await import('../src/render/asteroidInstancePool.js');
  const { opticCellBodyMaterial } = await import('../src/render/opticCellPresentation.js');
  const previous = globalThis.document;
  // makeNoiseTexture needs a 2D canvas; plain node has none (same stub as rock-family-library).
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
  let group;
  try { group = buildAsteroidLeafWarmGroup(); } finally { globalThis.document = previous; }
  const optic = group.children.filter((c) => String(c.userData.rosterPrewarmLeaf || '').startsWith('asteroid:optic:'));
  assert.deepEqual(optic.map((c) => c.userData.rosterPrewarmLeaf).sort(),
    ['asteroid:optic:diamond', 'asteroid:optic:metal', 'asteroid:optic:spent', 'asteroid:optic:stone']);
  const metal = optic.find((c) => c.userData.rosterPrewarmLeaf === 'asteroid:optic:metal');
  assert.equal(metal.userData.asteroidBody.material, opticCellBodyMaterial('metal', 0), 'shared live skin material');
  assert.equal(metal.userData.asteroidBody.material.customProgramCacheKey().startsWith('spaceface-optic-forged-iron-v1'), true);
  const pairs = collectAsteroidInstancePoolLeafResources([group]);
  const metalBody = metal.userData.asteroidInstanceBody;
  assert.ok(pairs.some((p) => p.geometry === metalBody.geometry && p.material === metalBody.material),
    'forged-iron body pair reaches the keyed specimen warm');
  // Unflagged nested exemplars keep their old behaviour (no new twins for the AST_TYPE builds).
  const plain = group.children.find((c) => c.userData.rosterPrewarmLeaf === 'asteroid:ast_common_rock:tinted');
  if (plain && plain.userData.asteroidInstanceBody) {
    assert.ok(!pairs.some((p) => p.material === plain.userData.asteroidInstanceBody.material
      && p.geometry === plain.userData.asteroidInstanceBody.geometry));
  }
});
