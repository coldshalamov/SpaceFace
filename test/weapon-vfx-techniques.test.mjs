import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  activeWeaponRenderGraph,
  EVENT_LIGHT_POOL_SIZE,
  visiblePointLightBudget,
  weaponPresenterDepthTexture,
} from '../src/render/vfx.js';
import { SpaceRenderGraph } from '../src/render/post/spaceRenderGraph.js';
import {
  clearShieldContacts,
  ENERGY_BOLT_CAPACITY,
  FLIGHT_MODE,
  FLIPBOOK_ROLE,
  SHIELD_HIT_SLOTS,
  WEAPON_LIGHT_POOL_SIZE,
  WeaponVfxPresenter,
  readShieldContacts,
  resolveWeaponRecipe,
  CHASE_CAMERA_DISTANCE,
  DEFAULT_BOLT_MIN_PIXELS,
  EnergyBoltPool,
  WeaponRibbonPool,
} from '../src/render/weapons/index.js';

function chaseCamera() {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 4000);
  camera.position.set(0, 54.9, -CHASE_CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);
  return camera;
}

function pulseProjectile(id, x, z) {
  return {
    id,
    type: 'projectile',
    alive: true,
    team: 0,
    pos: { x, z },
    prevPos: { x: x - 4, z },
    vel: { x: 320, z: 0 },
    data: { weaponId: 'wpn_pulse_laser_s', damageType: 'energy' },
  };
}

test('weapon lights are a dedicated pool and do not steal the six event lights', () => {
  assert.equal(EVENT_LIGHT_POOL_SIZE, 6);
  assert.equal(WEAPON_LIGHT_POOL_SIZE, 16);
  assert.equal(visiblePointLightBudget(), 22);
  const scene = new THREE.Scene();
  const presenter = new WeaponVfxPresenter({ scene });
  const eventLights = scene.children.filter((child) => child.isPointLight);
  assert.equal(eventLights.length, 0, 'weapon lights must not be dumped as scene-root event lights');
  const nested = [];
  scene.traverse((object) => { if (object.isPointLight) nested.push(object); });
  assert.equal(nested.length, WEAPON_LIGHT_POOL_SIZE);
  assert.equal(presenter.lights.size, WEAPON_LIGHT_POOL_SIZE);
});

test('shield contact writes four bubble hit slots instead of a spark in empty space', () => {
  clearShieldContacts();
  const scene = new THREE.Scene();
  const target = new THREE.Object3D();
  target.position.set(8, 0, 2);
  const presenter = new WeaponVfxPresenter({ scene });
  presenter.state = { render: { meshes: new Map([['foe', target]]) } };
  presenter.handleHit({
    weaponId: 'wpn_pulse_laser_s',
    targetId: 'foe',
    pos: { x: 8, z: 2 },
    normal: { x: -1, z: 0 },
    approach: { x: 1, z: 0 },
  }, true);
  const hits = readShieldContacts('foe');
  assert.ok(hits, 'pulse shield contact must write the live bubble slots');
  assert.equal(hits.length, SHIELD_HIT_SLOTS * 4);
  assert.ok(hits[3] > 0, 'slot 0 age/strength is live');
  assert.ok(hits[0] < 0, 'contact direction faces the inbound hit');
  const impact = presenter.flipbooks.slots.find((slot) => slot.alive && slot.role === FLIPBOOK_ROLE.IMPACT);
  assert.ok(impact, 'shield hit also keeps a surface flipbook');
  assert.equal(impact.followTarget, 1);
  clearShieldContacts();
});

test('distortion is a graph pass and stays off when nothing is live', () => {
  const clearColor = new THREE.Color(0x060912);
  let clearAlpha = 1;
  const clearHistory = [];
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget() {},
    getClearColor(target) { return target.copy(clearColor); },
    getClearAlpha() { return clearAlpha; },
    setClearColor(color, alpha) {
      clearColor.set(color);
      clearAlpha = alpha;
      clearHistory.push({ color: clearColor.getHex(), alpha });
    },
    clear() { clearHistory.push({ clear: true, color: clearColor.getHex(), alpha: clearAlpha }); },
    render() {},
  };
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  graph.setSize(64, 64);
  assert.ok(graph.distortionTarget, 'half-res distortion target is allocated');
  assert.equal(graph.diagnostics().passFamilies.distortion, 0);
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  graph.attachDistortionField(presenter.distortion);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 0);
  presenter.distortion.spawn({ x: 0, y: 0, z: 0, radius: 4, strength: 1, life: 1 });
  presenter.distortion.update(0);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 1);
  assert.ok(clearHistory.some((entry) => entry.clear && entry.alpha === 0
    && entry.color === new THREE.Color(0.5, 0.5, 0).getHex()),
  'distortion target must clear to encoded neutral with an empty envelope');
  assert.equal(clearColor.getHex(), 0x060912, 'graph restores the renderer clear color');
  assert.equal(clearAlpha, 1, 'graph restores the renderer clear alpha');
  graph.dispose();
});

test('weapon depth binding follows the active graph route rather than a retained graph object', () => {
  const graph = { depthTexture: new THREE.Texture() };
  const state = { settings: { video: { renderGraph: true } }, render: { renderGraph: graph } };
  assert.equal(activeWeaponRenderGraph(state), graph);
  assert.equal(weaponPresenterDepthTexture(graph), null,
    'the scene-target depth attachment must not feed back into its own bolt draw');
  state.settings.video.renderGraph = false;
  assert.equal(activeWeaponRenderGraph(state), null,
    'switching to bloom/native must clear stale graph depth from weapon presentation');
});

test('pulse chase-camera evidence: dash, barrel flipbook, and contact survive bloom-off', () => {
  const scene = new THREE.Scene();
  const camera = chaseCamera();
  const projectile = pulseProjectile(7, 0, 0);
  const presenter = new WeaponVfxPresenter({
    scene,
    helpers: {
      socketWorldPose: () => ({ x: 12, y: 0.82, z: 0, forwardX: 1, forwardY: 0, forwardZ: 0 }),
    },
  });
  presenter.state = {
    playerId: 'pilot',
    entityList: [projectile],
    entities: new Map([['foe', { id: 'foe', pos: { x: 20, z: 0 }, rot: 0 }]]),
    settings: { video: { bloom: false, motionReduce: false }, accessibility: { flashReduce: false } },
    render: { meshes: new Map() },
  };
  presenter.handleFire({
    weaponId: 'wpn_pulse_laser_s',
    ownerId: 'pilot',
    origin: { x: 0, z: 0 },
  }, { x: 0, z: 0 }, 0);
  presenter.update(1 / 60, {
    state: presenter.state,
    camera,
    interpolationAlpha: 1,
    viewportHeight: 1000,
  });
  assert.equal(presenter.bolts.live, 1, 'flight is the energy-card pool, not a tube mesh');
  assert.equal(presenter.bolts.mesh.geometry.type, 'PlaneGeometry');
  assert.equal(presenter.ribbons.byEntity.has(7), true, 'pulse keeps a ribbon wake');
  assert.ok(presenter.flipbooks.live >= 1, 'barrel ignition is live at the chase camera');
  assert.equal(presenter.bolts.material.uniforms.uMinPixels.value, DEFAULT_BOLT_MIN_PIXELS);
  assert.ok(presenter.bolts.material.vertexShader.includes('worldPerPx * uMinPixels'),
    'pixel floor is in the dash shader, not a fatter cylinder');
  presenter.handleHit({
    weaponId: 'wpn_pulse_laser_s',
    targetId: 'foe',
    pos: { x: 20, z: 0 },
    normal: { x: -1, z: 0 },
    approach: { x: 1, z: 0 },
  }, true);
  assert.ok(readShieldContacts('foe'), 'shield contact remains with bloom off');
  clearShieldContacts();
});

test('reduced-flash and reduced-motion keep the dash and contact mark, not haze', () => {
  const camera = chaseCamera();
  const projectile = pulseProjectile(3, 0, 0);
  const run = (settings) => {
    const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
    presenter.state = {
      playerId: 'pilot',
      entityList: [projectile],
      entities: new Map(),
      settings,
      render: { meshes: new Map() },
    };
    presenter.handleFire({
      weaponId: 'wpn_pulse_laser_s',
      ownerId: 'pilot',
      origin: { x: 0, z: 0 },
    }, { x: 0, z: 0 }, 0);
    presenter.handleHit({
      weaponId: 'wpn_pulse_laser_s',
      targetId: 'foe',
      pos: { x: 6, z: 0 },
      normal: { x: -1, z: 0 },
      approach: { x: 1, z: 0 },
    }, true);
    presenter.update(1 / 60, { state: presenter.state, camera, interpolationAlpha: 1, viewportHeight: 1000 });
    return presenter;
  };

  const reducedFlash = run({
    video: { bloom: false },
    accessibility: { flashReduce: true },
  });
  assert.equal(reducedFlash.bolts.live, 1);
  assert.ok(readShieldContacts('foe'));
  assert.equal(reducedFlash.distortion.live, 0, 'reduced-flash kills muzzle/hit haze');
  clearShieldContacts();

  const reducedMotion = run({
    video: { bloom: false, motionReduce: true },
    accessibility: { flashReduce: false },
  });
  assert.equal(reducedMotion.bolts.live, 1);
  assert.ok(readShieldContacts('foe'));
  assert.equal(reducedMotion.distortion.live, 0, 'reduced-motion keeps dash+mark and drops distortion');
  clearShieldContacts();
});

test('energy-card recipes never fall back to a cylinder identity', () => {
  assert.equal(ENERGY_BOLT_CAPACITY, 256);
  for (const weaponId of [
    'wpn_pulse_laser_s',
    'wpn_plasma_cannon_m',
    'wpn_railgun_m',
    'wpn_autocannon_m',
    'wpn_emp_disruptor_m',
  ]) {
    const recipe = resolveWeaponRecipe(weaponId);
    assert.equal(recipe.flight.mode, FLIGHT_MODE.ENERGY_CARD);
  }
});

test('distortion encodes signed offsets around neutral and composite decodes them', () => {
  const scene = new THREE.Scene();
  const presenter = new WeaponVfxPresenter({ scene });
  assert.match(presenter.distortion.material.fragmentShader, /offset \* 0\.5 \+ 0\.5/);
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget() {}, clear() {}, render() {},
  };
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  assert.match(graph.compositeMaterial.fragmentShader, /distortion\.xy \* 2\.0 - 1\.0/);
  assert.match(graph.compositeMaterial.fragmentShader, /step\(1e-5, distortion\.z\)/);
  graph.dispose();
});

test('presenter clears stale depth and carries recipe pixel floors per bolt', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  const depth = new THREE.Texture();
  presenter.state = { entityList: [], entities: new Map(), settings: {}, render: { meshes: new Map() } };
  presenter.update(1 / 60, { state: presenter.state, depthTexture: depth, depthWidth: 32, depthHeight: 16 });
  assert.equal(presenter.bolts.material.uniforms.uDepthEnabled.value, 1);
  presenter.update(1 / 60, { state: presenter.state });
  assert.equal(presenter.bolts.material.uniforms.uDepthEnabled.value, 0);
  assert.equal(presenter.bolts.material.uniforms.uSceneDepth.value, null);

  const pool = new EnergyBoltPool(null, { capacity: 2 });
  pool.beginFrame();
  pool.writeBolt({ entityId: 1, x: 0, y: 0, z: 0, prevX: 0, prevY: 0, prevZ: 0,
    ax: 1, ay: 0, az: 0, length: 2, width: 1, intensity: 1, variant: 0,
    coreR: 1, coreG: 1, coreB: 1, sheathR: 1, sheathG: 1, sheathB: 1, minPixels: 7 });
  pool.commit();
  assert.equal(pool.minPixels.getX(0), 7);
  assert.match(pool.material.vertexShader, /aBoltMinPixels/);
  pool.dispose();
});

test('weapon ribbons stay on WebGL1-compatible uint16 indices', () => {
  const ribbon = new WeaponRibbonPool(null);
  assert.ok(ribbon.geometry.index.array instanceof Uint16Array);
  assert.equal(Math.max(...ribbon.geometry.index.array), 12287);
  ribbon.dispose();
});

test('weapon pose and velocity preserve zero components', () => {
  const presenter = new WeaponVfxPresenter({
    scene: new THREE.Scene(),
    helpers: { socketWorldPose: () => ({ x: 0, y: 0.4, z: 0, forwardX: 0, forwardY: 0, forwardZ: -1 }) },
  });
  presenter.handleFire({ weaponId: 'wpn_pulse_laser_s', ownerId: 'pilot' }, { x: 0, z: 0 }, 0);
  const muzzle = presenter.flipbooks.slots.find((slot) => slot.alive && slot.role === FLIPBOOK_ROLE.MUZZLE);
  assert.equal(muzzle.ax, 0);
  assert.equal(muzzle.az, -1);
  const projectile = pulseProjectile(44, 0, 0);
  projectile.vel.x = 0;
  projectile.vel.z = -320;
  presenter.state = { entityList: [projectile], entities: new Map(), settings: {}, render: { meshes: new Map() } };
  presenter.update(1 / 60, { state: presenter.state, interpolationAlpha: 1 });
  assert.equal(presenter.bolts.axis.getX(0), 0);
  assert.equal(presenter.bolts.axis.getZ(0), -1);
  presenter.dispose();
});

test('accessibility scales flash geometry and reproject keeps target-local marks', () => {
  const target = new THREE.Object3D();
  target.position.set(4, 0, 2);
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  presenter.state = {
    settings: { accessibility: { flashReduce: true } },
    render: { meshes: new Map([['foe', target]]) },
  };
  presenter.handleFire({ weaponId: 'wpn_pulse_laser_s', ownerId: 'pilot' }, { x: 0, z: 0 }, 0);
  const muzzle = presenter.flipbooks.slots.find((slot) => slot.alive && slot.role === FLIPBOOK_ROLE.MUZZLE);
  assert.ok(muzzle.width < 1.55);
  assert.ok(muzzle.intensity < 1.35);
  presenter.handleHit({ weaponId: 'wpn_pulse_laser_s', targetId: 'foe', pos: { x: 4, z: 2 },
    normal: { x: -1, z: 0 }, approach: { x: 1, z: 0 } }, false);
  const scorch = presenter.scorches.slots.find((slot) => slot.alive);
  const before = { x: scorch.localX, z: scorch.localZ };
  presenter.reproject(10, 20);
  assert.deepEqual({ x: scorch.localX, z: scorch.localZ }, before);
  presenter.dispose();
  presenter.dispose();
  assert.deepEqual(presenter.getOwnerRoots().length, 6);
});
