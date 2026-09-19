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
  IMPACT_KIND,
  SHIELD_HIT_SLOTS,
  SURFACE_ROLE,
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
  // P1: pool sized to measured p90 occupancy — 8 total visible point lights (6 event + 2 weapon),
  // so NUM_POINT_LIGHTS stops running a 22-wide unrolled loop on every lit fragment.
  assert.equal(EVENT_LIGHT_POOL_SIZE, 6);
  assert.equal(WEAPON_LIGHT_POOL_SIZE, 2);
  assert.equal(visiblePointLightBudget(), 8);
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
  const impact = presenter.discharges.slots.find(
    (slot) => slot.alive && slot.role === SURFACE_ROLE.IMPACT,
  );
  assert.ok(impact, 'shield hit also keeps a swept contact surface');
  assert.equal(impact.kind, IMPACT_KIND.SHIELD);
  assert.equal(impact.attached, true, 'shield contact stays retained to the target hull');
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
  assert.equal(presenter.bolts.live, 1, 'flight uses the pooled energy presentation');
  const boltGeometry = presenter.bolts.mesh.geometry;
  boltGeometry.computeBoundingBox();
  assert.ok(boltGeometry.boundingBox.max.y > 0 && boltGeometry.boundingBox.min.y < 0
    && boltGeometry.boundingBox.max.z > 0 && boltGeometry.boundingBox.min.z < 0,
  'folded projectile has thickness in both transverse directions');
  assert.equal(presenter.ribbons.byEntity.has(7), true, 'pulse keeps a ribbon wake');
  assert.ok(presenter.discharges.mesh.count >= 1, 'source surfaces are live at the chase camera');
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

function sortableBolt(entityId, currentX, previousX, lateralZ = 10) {
  return {
    entityId, x: currentX, y: 0, z: lateralZ, prevX: previousX, prevY: 0, prevZ: lateralZ,
    ax: currentX + 1, ay: 0.2, az: previousX + 2,
    length: currentX + 3, width: 1.1, intensity: previousX + 4, variant: 4,
    coreR: currentX / 100, coreG: 0.3, coreB: previousX / 100,
    sheathR: 0.1, sheathG: previousX / 100, sheathB: currentX / 100,
    minPixels: currentX / 100 + 2,
  };
}

test('normal-blended bolts sort swept midpoints in camera depth with every slot attribute and mapping', () => {
  const scene = new THREE.Scene();
  const pool = new EnergyBoltPool(scene, { capacity: 8 });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 10);
  camera.lookAt(1, 0, 10);
  camera.updateMatrixWorld();
  pool.setCamera(camera, 1000);
  pool.beginFrame();
  const bolts = [
    sortableBolt(11, 8, 2),             // midpoint depth 5, nearest
    sortableBolt(22, 2, 58),            // midpoint depth 30, farthest despite near endpoint
    sortableBolt(33, 34, 6),            // midpoint depth 20
    sortableBolt('lateral', 13, 7, 210), // radial distance is farthest, camera depth is only 10
  ];
  for (const bolt of bolts) pool.writeBolt(bolt);
  const attributes = Object.entries(pool.geometry.attributes).filter(([, attr]) => attr.isInstancedBufferAttribute);
  const original = attributes.map(([name, attr]) => [name, attr.array.slice()]);
  const buffers = attributes.map(([, attr]) => attr.array);
  const scratch = [pool._sortOrder, pool._sortOrderScratch, pool._sortAttributeScratch];
  pool.commit();
  const order = [1, 2, 3, 0];
  assert.equal(scene.children.filter((child) => child.isInstancedMesh).length, 1);
  assert.equal(pool.mesh.count, 4);
  assert.equal(pool.material.blending, THREE.NormalBlending);
  assert.deepEqual(Array.from(pool.entityIds.slice(0, 4)), [22, 33, 0, 11]);
  for (let slot = 0; slot < order.length; slot++) {
    assert.equal(pool.byEntity.get(bolts[order[slot]].entityId), slot);
    for (const [name, values] of original) {
      const attr = pool.geometry.getAttribute(name);
      const source = order[slot] * attr.itemSize;
      const target = slot * attr.itemSize;
      assert.deepEqual(Array.from(attr.array.slice(target, target + attr.itemSize)),
        Array.from(values.slice(source, source + attr.itemSize)), `${name} follows entity into slot ${slot}`);
    }
  }
  assert.equal(pool._sortBackToFront(), false, 'already-sorted active slots skip permutation');
  for (let i = 0; i < attributes.length; i++) {
    assert.equal(attributes[i][1].array, buffers[i], 'GPU attribute storage is retained');
    assert.deepEqual(Array.from(buffers[i].slice(4 * attributes[i][1].itemSize)),
      Array.from(original[i][1].slice(4 * attributes[i][1].itemSize)), 'inactive capacity stays untouched');
  }
  assert.equal(pool._sortOrder, scratch[0]);
  assert.equal(pool._sortOrderScratch, scratch[1]);
  assert.equal(pool._sortAttributeScratch, scratch[2]);
  // A camera turn reverses depth even without a projectile rewrite.
  camera.lookAt(-1, 0, 10);
  pool.commit();
  assert.deepEqual([11, 'lateral', 33, 22].map((id) => pool.byEntity.get(id)), [0, 1, 2, 3]);
  pool.beginFrame();
  pool.commit();
  assert.equal(pool.mesh.count, 0);
  assert.equal(pool.byEntity.size, 0);
  pool.dispose();
});

test('equal-depth bolts retain write order and a reused pool handles partial and full volleys', () => {
  const pool = new EnergyBoltPool(null, { capacity: 17 });
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  pool.setCamera(camera, 1000);
  for (const count of [17, 6, 1, 0, 13]) {
    pool.beginFrame();
    const expected = [];
    for (let id = 1; id <= count; id++) {
      const z = -((id * 7) % 5 + 1);
      pool.writeBolt(sortableBolt(id, id, id, z));
      expected.push({ id, z });
    }
    expected.sort((a, b) => a.z - b.z);
    pool.commit();
    assert.deepEqual(Array.from(pool.entityIds.slice(0, count)), expected.map(({ id }) => id));
    for (let index = 0; index < count; index++) assert.equal(pool.byEntity.get(expected[index].id), index);
    assert.equal(pool.mesh.count, count);
  }
  pool.dispose();
});

test('shared accessibility freezes bolt decoration and removes crackle without stopping EMP travel', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  const projectile = pulseProjectile(77, 0, 0);
  projectile.data.weaponId = 'wpn_emp_disruptor_m';
  const state = {
    entityList: [projectile], entities: new Map(), settings: {}, render: { meshes: new Map() },
  };
  const advance = () => {
    projectile.prevPos.x = projectile.pos.x;
    projectile.pos.x += 5;
    presenter.update(1 / 60, { state, interpolationAlpha: 1 });
    assert.equal(presenter.bolts.pos.getX(0), projectile.pos.x);
    assert.equal(presenter.bolts.prev.getX(0), projectile.prevPos.x);
    assert.equal(presenter.bolts.size.getW(0), 4, 'EMP family remains selected');
    assert.equal(presenter.bolts.live, 1);
  };
  const uniforms = presenter.bolts.material.uniforms;
  advance();
  const fullTime = uniforms.uBoltTime.value;
  assert.ok(fullTime > 0);
  assert.equal(uniforms.uBoltFlicker.value, 1);
  state.settings.video = { motionReduce: true };
  advance();
  advance();
  assert.equal(uniforms.uBoltTime.value, fullTime, 'only decorative time freezes');
  state.settings.accessibility = { flashReduce: true };
  advance();
  assert.equal(uniforms.uBoltTime.value, fullTime);
  assert.equal(uniforms.uBoltFlicker.value, 0);
  state.settings.video.motionReduce = false;
  advance();
  assert.ok(uniforms.uBoltTime.value > fullTime, 'reduced flash permits arc drift');
  assert.equal(uniforms.uBoltFlicker.value, 0);
  const flashTime = uniforms.uBoltTime.value;
  state.settings.accessibility.flashReduce = false;
  advance();
  assert.ok(uniforms.uBoltTime.value > flashTime);
  assert.equal(uniforms.uBoltFlicker.value, 1);
  assert.match(presenter.bolts.material.fragmentShader, /empCrackle = 0\.78 \+ uBoltFlicker \*/,
    'accessibility uniform controls the rapid EMP brightness term');
  presenter.dispose();
});

test('ballistic narrowing precedes the pixel floor and concussion deformation excludes kinetic and rail', () => {
  const pool = new EnergyBoltPool(null);
  const shader = pool.material.vertexShader;
  assert.match(shader, /float width = max\(aBoltSize\.y \* ballisticWidth, worldPerPx \* minPixels\)/);
  assert.match(shader, /else if \(aBoltSize\.w >= 4\.5 && aBoltSize\.w < 5\.5\)/);
  assert.doesNotMatch(shader, /else if \(aBoltSize\.w < 5\.5\)/);
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
  const muzzle = presenter.discharges.slots.find((slot) => slot.alive);
  assert.equal(muzzle.angle, -Math.PI / 2);
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
  const muzzle = presenter.discharges.slots.find((slot) => slot.alive);
  assert.ok(muzzle.width < 1.55);
  assert.ok(muzzle.opacity < 1);
  presenter.handleHit({ weaponId: 'wpn_pulse_laser_s', targetId: 'foe', pos: { x: 4, z: 2 },
    normal: { x: -1, z: 0 }, approach: { x: 1, z: 0 } }, false);
  const scorch = presenter.scorches.slots.find((slot) => slot.alive);
  const before = { x: scorch.localX, z: scorch.localZ };
  presenter.reproject(10, 20);
  assert.deepEqual({ x: scorch.localX, z: scorch.localZ }, before);
  presenter.dispose();
  presenter.dispose();
  // Seven live roots: bolts, swept discharge surfaces, ribbons, scorch, two distortion stages, lights.
  assert.equal(presenter.getOwnerRoots().length, 7, 'the card atlas pool no longer owns a live root');
});
