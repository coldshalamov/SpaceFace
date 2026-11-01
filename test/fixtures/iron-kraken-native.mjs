// Isolated native rig inspection. Production builders, surface shaders, score progression and
// warning painter are exercised. Optional encounter mode also runs the canonical combat/AI/
// Flight V3/Rapier owners with an input tape; neither mode is full-route or post-process acceptance.
import * as THREE from 'three';
import { createVisualFactory } from '../../src/render/visualFactory.js';
import { installVisualOverrides } from '../../src/render/visualOverrides.js';
import { disposeDetachedObject } from '../../src/render/partsLibrary.js';
import { entityVisualCullRadius } from '../../src/render/visualCullRadius.js';
import { IRON_KRAKEN_PROFILES } from '../../src/data/ironKraken.js';
import { requireCapitalBossEncounter } from '../../src/data/encounters/capital-boss.js';
import { createCapitalBossFight, stepCapitalBossFight } from '../../src/combat/capitalBossScore.js';
import { drawCapitalWarning, capitalShapeOutlines } from '../../src/presentation/capitalBossPresentation.js';
import { createIronKrakenDebris } from '../../src/render/ironKrakenDebris.js';
import { SHIPS } from '../../src/data/ships.js';
import { SECTORS } from '../../src/data/sectors.js';
import { resolveSectorVisualProfile } from '../../src/data/sectorVisualProfiles.js';
import { resolveLookLighting, resolveLookMoodId, resolveLookPost } from '../../src/data/lookMoods.js';
import { beginLookMood } from '../../src/render/look.js';
import { createBus } from '../../src/core/eventBus.js';
import { makeEnemySpawnSpec, combat } from '../../src/systems/combat.js';
import { aftermathWrecks } from '../../src/systems/aftermathWrecks.js';
import { zonesForSector } from '../../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../../src/data/sectorCoordinates.js';

const stage = document.querySelector('#stage');
const warningCanvas = document.querySelector('#warnings');
const warningContext = warningCanvas.getContext('2d');
const title = document.querySelector('#title');
const caption = document.querySelector('#caption');
const footer = document.querySelector('#footer');
const referenceLabel = document.querySelector('#reference');
const width = innerWidth, height = innerHeight;
const renderer = new THREE.WebGLRenderer({ canvas: stage, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
warningCanvas.width = width;
warningCanvas.height = height;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d16);
const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
const profile = resolveSectorVisualProfile(SECTORS.find(s => s.id === 'sector_helios_prime'));
const lighting = resolveLookLighting(profile);
beginLookMood(resolveLookMoodId(profile), 0);
const productionExposure = resolveLookPost(profile).exposure;
const productionLights = new THREE.Group();
productionLights.name = 'Helios production light profile';
productionLights.add(new THREE.AmbientLight(lighting.ambientColor, lighting.ambient));
for (const [channel, position] of [['key', [60, 140, 40]], ['rim', [-70, 50, -60]], ['fill', [20, 30, 120]]]) {
  const light = new THREE.DirectionalLight(lighting[`${channel}Color`], lighting[channel]);
  light.position.fromArray(position);
  productionLights.add(light);
}
const studioLights = new THREE.Group();
studioLights.name = 'Neutral reference inspection lights';
studioLights.add(new THREE.HemisphereLight(0xffffff, 0xc5c1b9, 1.8));
for (const [intensity, position] of [[2.5, [100, 180, 100]], [1.1, [40, 60, -160]], [1.1, [-100, 100, 30]]]) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.fromArray(position);
  studioLights.add(light);
}
scene.add(productionLights, studioLights);
let lightMode = 'production';
function setLighting(mode = 'production', inspection = false) {
  expect(mode === 'production' || mode === 'studio', `Unknown inspection lighting: ${mode}`);
  lightMode = mode;
  productionLights.visible = mode === 'production';
  studioLights.visible = mode === 'studio';
  renderer.toneMappingExposure = mode === 'studio' ? 1 : productionExposure;
  scene.background.set(mode === 'studio' ? 0xf3f0e9 : inspection ? 0x333a46 : 0x080d16);
  document.body.dataset.lighting = mode;
}
setLighting();
const factory = createVisualFactory({ renderer });
installVisualOverrides(factory, { directAuthoredMount: true, authoredShips: true });
const hitch = SHIPS.find(ship => ship.id === 'ship_kestrel');
const point = new THREE.Vector3();
let live = null;
let proxy = null;
let debris = null;
let nextId = 0;

function expect(condition, message) { if (!condition) throw new Error(message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function makeRun(variant = 'heavy', entityId = null) {
  const p = IRON_KRAKEN_PROFILES[variant];
  expect(p, `Unknown Kraken variant: ${variant}`);
  const id = entityId || `kraken-render-${++nextId}`;
  const fightId = `inspect:${id}`;
  const entity = { id, type: 'ship', alive: true, rot: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: p.coreRadius, visualRadius: p.armReach,
    hull: p.hull, hullMax: p.hull, mass: p.mass,
    data: { shipId: 'ship_bastion', enemyTypeId: p.enemyId, lootTableId: p.enemyId,
      ironKraken: { variant: p.variant, scale: p.scale, fightId }, weapons: [], fittings: [] } };
  const target = { id: `${id}:reference`, alive: true, hull: hitch.hull, hullMax: hitch.hull,
    pos: { x: p.armReach * 1.2, z: 0 }, radius: hitch.collisionRadius };
  const fight = createCapitalBossFight({ encounterId: p.scoreId, fightId, bossId: id, targetId: target.id });
  const state = { simTime: 0, entities: new Map([[id, entity], [target.id, target]]),
    render: { scene, camera, renderer, frameOrigin: { x: 0, z: 0 } },
    capitalBossEncounters: { version: 1, fights: { [fightId]: fight }, orders: {} } };
  return { p, entity, target, fight, state, tick: -1, warning: null, recovery: null,
    score: requireCapitalBossEncounter(p.scoreId).score };
}

function advance(run) {
  run.tick++;
  run.state.simTime = run.tick / 60;
  const facts = stepCapitalBossFight(run.fight, { tick: run.tick, simTime: run.state.simTime,
    boss: run.entity, target: run.target, active: true });
  for (const fact of facts) {
    if (fact.type === 'telegraph' || fact.type === 'attack') run.warning = clone(fact);
    if (fact.type === 'telegraphEnd') run.warning = null;
    if (fact.type === 'recovery') run.recovery = { beatId: fact.beatId, start: run.fight.clock - 1, duration: fact.durationTicks };
  }
}

function seek(run, { beatId = null, phase = 'intro', progress = 0.5 } = {}) {
  for (let attempts = 0; attempts < 6000; attempts++) {
    advance(run);
    const fight = run.fight;
    if (fight.phase !== phase) continue;
    if (!beatId && phase === 'intro' && fight.clock >= run.score.introTicks * progress) return run;
    const beat = run.score.beats.find(item => item.id === beatId);
    if (!beat) continue;
    if (phase === 'recovery' && run.recovery?.beatId === beatId
      && fight.clock - run.recovery.start >= run.recovery.duration * progress) return run;
    if (fight.cast?.beatId !== beatId) continue;
    const age = fight.clock - fight.cast.startedAt;
    const offset = phase === 'active' ? beat.tellTicks : 0;
    const duration = phase === 'active' ? beat.activeTicks : beat.tellTicks;
    if (age - offset >= duration * progress) return run;
  }
  throw new Error(`Score did not reach ${beatId || 'intro'}/${phase}`);
}

function release(root, state) {
  if (!root) return;
  root.removeFromParent();
  // The detached-object owner releases hooks and private geometry/materials. Live renderer
  // teardown also disposes instance buffers; mirror that documented extra step here.
  disposeDetachedObject(root, state);
  root.traverse(node => { if (node.isInstancedMesh || node.isBatchedMesh) node.dispose(); });
}

function removeProxy() {
  if (!proxy) return;
  release(proxy);
  proxy = null;
  referenceLabel.hidden = true;
}

function build(run) {
  const root = factory.build(run.entity);
  expect(root?.isObject3D && root.userData.ironKrakenRig, 'Production factory did not return the articulated Kraken');
  expect(run.entity.presentationAdmission === 'ready', 'Kraken is blocked by authored presentation admission');
  expect(typeof root.userData.updateAuthoredMotion === 'function', 'Kraken motion driver is missing');
  expect(!root.userData.requestAuthoredUpgrade, 'Kraken still has the generic ship upgrade path');
  return root;
}

function mount(run) {
  if (live) release(live.root, live.run.state);
  debris?.clear();
  removeProxy();
  resetWarningCanvas();
  const root = build(run);
  scene.add(root);
  live = { run, root };
  return root;
}

function update(run, root, a11y = {}) {
  const origin = run.state.render?.frameOrigin || { x: 0, z: 0 };
  root.position.set(run.entity.pos.x - origin.x, 0, run.entity.pos.z - origin.z);
  root.rotation.y = -run.entity.rot;
  root.userData.updateAuthoredMotion(run.entity, run.state.simTime, a11y, run.state);
  root.updateMatrixWorld(true);
}

function bounds(root) {
  // Bounds are sampled only in this diagnostic, never scanned in the production frame loop.
  root.traverse(node => { if (node.isInstancedMesh) node.computeBoundingBox(); });
  return new THREE.Box3().setFromObject(root);
}

function resetWarningCanvas() {
  // Reset the backing bitmap and clip/state stack at the capture boundary. Explicit visibility
  // also prevents a previous GPU-backed canvas layer from appearing over a later idle capture.
  warningCanvas.hidden = true;
  warningCanvas.width = width;
  warningCanvas.height = height;
}

function painted() {
  // WebGL, the warning canvas and DOM labels use separate compositor layers. Give all three a
  // presentation boundary before Playwright samples pixels from the next capture.
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function visibleFitPoints(root) {
  const points = [];
  const matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverseVisible(node => {
    if (!node.geometry) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const box = node.geometry.boundingBox;
    const count = node.isInstancedMesh ? node.count : 1;
    for (let i = 0; i < count; i++) {
      if (node.isInstancedMesh) {
        node.getMatrixAt(i, instance);
        matrix.multiplyMatrices(node.matrixWorld, instance);
      } else matrix.copy(node.matrixWorld);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  });
  return points;
}

function poseHash(root) {
  let hash = 2166136261;
  const feed = value => {
    const integer = Math.round(value * 100000);
    hash = Math.imul(hash ^ integer, 16777619) >>> 0;
  };
  root.updateMatrixWorld(true);
  root.traverse(node => {
    for (const number of node.matrix.elements) feed(number);
    if (node.isInstancedMesh) for (const number of node.instanceMatrix.array) feed(number);
  });
  return hash.toString(16).padStart(8, '0');
}

function objectResources(root) {
  const geometries = new Set(), materials = new Set();
  let instances = 0, instanceBatches = 0, renderNodes = 0;
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const mat of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) materials.add(mat);
    if (node.isInstancedMesh) { instances += node.count; instanceBatches++; }
    if (node.isMesh || node.isLine || node.isPoints) renderNodes++;
  });
  return { geometries, materials, instances, instanceBatches, renderNodes };
}

function frameCamera(box, view, fitPoints = null) {
  camera.fov = 45;
  camera.updateProjectionMatrix();
  const center = box.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3();
  camera.up.set(0, 1, 0);
  if (view === 'top') { camera.up.set(1, 0, 0); direction.set(0, 1, 0); }
  else if (view === 'front') direction.set(1, 0.16, 0).normalize();
  else if (view === 'gameplay') direction.set(0, Math.sin(Math.PI / 3), -0.5);
  else direction.set(0.72, 0.57, -0.53).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * camera.aspect;
  const points = fitPoints || [];
  if (!points.length) {
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z));
    }
  }
  let distance = 1;
  const offset = new THREE.Vector3();
  for (const p of points) {
    offset.copy(p).sub(center);
    const near = offset.dot(direction);
    distance = Math.max(distance, near + Math.abs(offset.dot(right)) / (tanH * 0.84),
      near + Math.abs(offset.dot(up)) / (tanV * 0.70));
  }
  camera.position.copy(center).addScaledVector(direction, distance * 1.025);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
}

function frameReferenceCamera(run) {
  // Frozen visual approximation of the supplied 4.8/6.0 s side-three-quarter frames: the near
  // optic sits at the right edge of the pressure hull and the far optic is occluded. Keep the
  // pressure-body origin as the target and distance fixed in core-radius units, never auto-fit
  // to the arms. The paired full-body view reveals tips outside this reference composition.
  camera.fov = 42;
  camera.up.set(0, 1, 0);
  const target = new THREE.Vector3(0, 0, 0);
  const direction = new THREE.Vector3(0.18, 0.28, 0.94).normalize();
  camera.position.copy(target).addScaledVector(direction, run.p.coreRadius * 9);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function frameDetailCamera(run, headDiameterPx) {
  expect(Number.isFinite(headDiameterPx) && headDiameterPx > 0, 'Detail capture requires a positive projected head diameter');
  camera.fov = 42;
  camera.up.set(0, 1, 0);
  camera.updateProjectionMatrix();
  const distance = run.p.coreRadius * height * Math.abs(camera.projectionMatrix.elements[5]) / headDiameterPx;
  camera.position.copy(new THREE.Vector3(0.18, 0.28, 0.94).normalize()).multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
}

function useCamera(run, root, spec, box = bounds(root), fitPoints = visibleFitPoints(root)) {
  camera.fov = 45;
  camera.updateProjectionMatrix();
  if (Number.isFinite(spec.headDiameterPx)) frameDetailCamera(run, spec.headDiameterPx);
  else if (spec.view === 'reference') frameReferenceCamera(run);
  else frameCamera(box, spec.view, fitPoints);
}

function addScaleReference(run, box) {
  proxy = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x9ce3ee });
  const radius = hitch.collisionRadius;
  const ring = new THREE.EllipseCurve(0, 0, radius, radius).getPoints(48);
  const geometry = new THREE.BufferGeometry().setFromPoints(ring.map(p => new THREE.Vector3(p.x, 0, p.y)));
  proxy.add(new THREE.LineLoop(geometry, material));
  const direction = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(radius * 0.8, 0, 0), new THREE.Vector3(-radius * 0.55, 0, -radius * 0.45),
    new THREE.Vector3(-radius * 0.25, 0, 0), new THREE.Vector3(-radius * 0.55, 0, radius * 0.45),
    new THREE.Vector3(radius * 0.8, 0, 0),
  ]);
  proxy.add(new THREE.Line(direction, material));
  proxy.position.set(box.max.x + radius * 2.1, 0, box.max.z - radius);
  scene.add(proxy);
  proxy.updateMatrixWorld(true);
  box.union(new THREE.Box3().setFromObject(proxy));
  referenceLabel.textContent = `Hitch collision diameter: ${radius * 2} WU · scale reference`;
  referenceLabel.hidden = false;
}

function project(x, z) {
  if (typeof x === 'object') { z = x.z; x = x.x; }
  point.set(x, 0, z).project(camera);
  return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
}

function draw(run, { warnings = false, reducedMotion = false } = {}) {
  renderer.render(scene, camera);
  const showWarning = !!(warnings && run.warning);
  warningCanvas.hidden = !showWarning;
  warningContext.clearRect(0, 0, width, height);
  if (showWarning) drawCapitalWarning(warningContext, run.warning, run.fight.clock, project, { reducedMotion });
  if (proxy) {
    const screen = project(proxy.position.x, proxy.position.z);
    referenceLabel.style.left = `${screen.x}px`;
    referenceLabel.style.top = `${screen.y + 23}px`;
  }
}

function counters() {
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    lines: renderer.info.render.lines, points: renderer.info.render.points,
    geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length || 0 };
}

function detailInfo(run, root) {
  const rig = root.userData.ironKrakenRig;
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const center = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
  const projectedHeadDiameterPx = run.p.coreRadius * height * Math.abs(camera.projectionMatrix.elements[5]) / -center.z;
  const visibleInstanceBatches = [];
  root.traverseVisible(node => { if (node.isInstancedMesh) visibleInstanceBatches.push({ name: node.name, count: node.count }); });
  return { detailLevel: rig.detailLevel ?? null, headDiameterPx: rig.headDiameterPx ?? null,
    projectedHeadDiameterPx, visibleInstanceBatches,
    cameraDistance: camera.position.length(), viewport: { width, height, pixelRatio: renderer.getPixelRatio() } };
}

async function capture(spec) {
  const run = seek(makeRun(spec.variant), spec);
  const root = mount(run);
  const a11y = { reducedMotion: !!spec.reducedMotion, reducedFlash: !!spec.reducedMotion };
  update(run, root, a11y);
  const box = bounds(root);
  const actualBounds = { min: box.min.toArray(), max: box.max.toArray() };
  const cullRadius = entityVisualCullRadius(run.entity, root);
  const actualXZRadius = Math.max(...[box.min.x, box.max.x].flatMap(x =>
    [box.min.z, box.max.z].map(z => Math.hypot(x, z))));
  expect(cullRadius + 0.1 >= actualXZRadius, `Animated pose exceeds its visual cull radius (${cullRadius} < ${actualXZRadius})`);
  const fitPoints = visibleFitPoints(root);
  if (spec.scaleReference) { addScaleReference(run, box); fitPoints.push(...visibleFitPoints(proxy)); }
  if (spec.warnings && run.warning) {
    for (const shape of run.warning.shapes) for (const line of capitalShapeOutlines(shape)) {
      for (const p of line) {
        const position = new THREE.Vector3(p.x, 0, p.z);
        box.expandByPoint(position); fitPoints.push(position);
      }
    }
  }
  useCamera(run, root, spec, box, fitPoints);
  // The production detail owner reads the real camera even while the score is paused.
  // Its final camera must be installed before the corresponding native draw is sampled.
  update(run, root, a11y);
  setLighting(spec.lighting, spec.inspection);
  title.textContent = `${run.p.name} · ${spec.title}`;
  const viewLabel = spec.view === 'gameplay' ? '60° gameplay-angle inspection' : `${spec.view} inspection`;
  caption.textContent = `${viewLabel} · ${run.fight.phase}${run.fight.cast ? ` / ${run.fight.cast.beatId}` : ''} · tick ${run.tick}${spec.reducedMotion ? ' · reduced motion + flash' : ''}`;
  footer.textContent = `Production model, materials and score clock · ${lightMode === 'studio' ? 'neutral studio lights / fixed reference camera available' : 'Helios lighting'} · no post effects · stationary diagnostic`;
  draw(run, spec);
  await painted();
  const resources = objectResources(root);
  return { name: spec.name, variant: run.p.variant, spec, tick: run.tick,
    simulationTime: run.state.simTime, phase: run.fight.phase, beatId: run.fight.cast?.beatId || run.recovery?.beatId || null,
    scale: run.p.scale, coreRadius: run.p.coreRadius, armReach: run.p.armReach,
    actualBounds, cullRadius, actualXZRadius, poseHash: poseHash(root),
    render: counters(), detail: detailInfo(run, root), resources: { geometries: resources.geometries.size, materials: resources.materials.size,
      renderNodes: resources.renderNodes, instanceBatches: resources.instanceBatches, instances: resources.instances },
    warningVisible: !warningCanvas.hidden, warningShapeCount: warningCanvas.hidden ? 0 : run.warning.shapes.length,
    lighting: lightMode,
    camera: { fov: camera.fov, position: camera.position.toArray(), up: camera.up.toArray(),
      framing: Number.isFinite(spec.headDiameterPx) ? `real perspective distance for ${spec.headDiameterPx}px head diameter`
        : spec.view === 'reference' ? 'fixed 9 core radii, pressure-body origin; side-three-quarter approximation of supplied 4.8/6.0 s frames' : 'visible geometry fit' },
    scaleReference: spec.scaleReference ? { kind: 'collision-diameter-proxy', sourceId: hitch.id, diameter: hitch.collisionRadius * 2 } : null };
}

async function captureBreakup() {
  setLighting();
  const run = seek(makeRun(), { beatId: 'siphon_jet', phase: 'recovery', progress: 0.4 });
  const root = mount(run);
  update(run, root);
  debris ||= createIronKrakenDebris(scene);
  const before = debris.diagnostics();
  expect(!before.initialized, 'Debris geometry was allocated before the first death');
  const receipt = { id: run.entity.id, type: 'ship', lootTableId: run.p.enemyId,
    pos: { ...run.entity.pos }, presentation: { targetVelocity: { ...run.entity.vel } } };
  const spawned = debris.spawn(receipt, run.entity, root, run.state.simTime,
    { frameOrigin: { x: 0, z: 0 }, reducedMotion: false, reducedFlash: false });
  expect(spawned === before.perDeath, 'Death did not emit the authored bounded fragment set');
  expect(debris.spawn(receipt, run.entity, root, run.state.simTime) === 0, 'Duplicate kill receipt emitted duplicate pieces');
  release(root, run.state);
  live = null;
  debris.update(run.state.simTime + 0.8);
  const box = bounds(debris.group);
  frameCamera(box, 'inspect', visibleFitPoints(debris.group));
  title.textContent = 'Iron Kraken · mechanical breakup';
  caption.textContent = 'Arm sleeves, dark joints, suction rims and death-only pump sections · 0.8 simulation seconds after the kill';
  footer.textContent = 'Canonical kill receipt shape · model pieces sampled before teardown · no living interior geometry';
  scene.background.set(0x080d16);
  draw(run);
  await painted();
  const after = debris.diagnostics();
  const result = { name: '09-mechanical-breakup', variant: run.p.variant, tick: run.tick,
    simulationTime: run.state.simTime + 0.8, render: counters(),
    lazyBeforeFirstDeath: !before.initialized, spawned, diagnostics: after,
    actualBounds: { min: box.min.toArray(), max: box.max.toArray() } };
  expect(after.snapshots > 0, 'Breakup did not sample the real articulated model');
  return result;
}

async function captureWreck() {
  setLighting();
  if (live) release(live.root, live.run.state);
  live = null;
  debris?.clear(); removeProxy(); resetWarningCanvas();
  const p = IRON_KRAKEN_PROFILES.heavy, sectorId = 'sector_helios_prime';
  const bus = createBus();
  const state = { meta: { seed: 4242 }, tick: 470, simTime: 47, playerId: 1,
    world: { currentSectorId: sectorId }, entities: new Map(), entityList: [],
    rng() { throw new Error('Wreck presentation consumed simulation RNG'); } };
  const pos = sectorLocalToGlobalForSector(zonesForSector(sectorId)[0].center, sectorId);
  const victim = { ...makeEnemySpawnSpec(p.enemyId, 1, pos), id: 40, alive: false };
  state.entities.set(victim.id, victim); state.entityList.push(victim);
  const owner = Object.create(aftermathWrecks);
  owner.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  let wreck;
  try {
    const receipt = { id: victim.id, killerId: 1, type: 'ship', lootTableId: p.enemyId,
      victimClass: 'capital', factionId: victim.factionId, pos: { ...pos }, sectorId };
    bus.emit('entity:killed', receipt);
    const plan = owner.immediateWreckPlan(receipt);
    expect(plan?.spec, 'Production aftermath did not create a static wreck plan');
    wreck = { ...plan.spec, id: 901, alive: true };
  } finally { owner.destroy(); }
  const root = factory.build(wreck);
  expect(root?.userData.ironKrakenWreck && wreck.presentationAdmission === 'ready', 'Production factory did not admit the static Kraken wreck');
  expect(!root.userData.updateAuthoredMotion && !root.userData.ironKrakenRig, 'Static wreck retained a live attack rig');
  scene.add(root);
  live = { root, run: { state } };
  const box = bounds(root);
  frameCamera(box, 'inspect', visibleFitPoints(root));
  title.textContent = 'Iron Kraken · persistent mechanical wreck';
  caption.textContent = 'Production aftermath plan + authored factory · four curled arms, broken roots, dead optics and splayed mantle';
  footer.textContent = 'Static salvage body · no live animation, pressure jet, hidden pump or added simulation controller';
  scene.background.set(0x080d16);
  draw({});
  await painted();
  return { name: '10-persistent-wreck', variant: p.variant, render: counters(),
    identity: root.userData.ironKrakenWreck, animated: root.userData.animated,
    actualBounds: { min: box.min.toArray(), max: box.max.toArray() },
    camera: { fov: camera.fov, position: camera.position.toArray(), up: camera.up.toArray() } };
}

async function lodChecks() {
  const run = seek(makeRun());
  const root = mount(run);
  setLighting('studio');
  const clock = run.fight.clock, time = run.state.simTime;
  const fightBefore = JSON.stringify(run.fight);
  const samples = [];
  for (const [label, headDiameterPx] of [['near', 240], ['distant', 110], ['restored', 200]]) {
    frameDetailCamera(run, headDiameterPx);
    update(run, root);
    draw(run);
    await painted();
    samples.push({ label, requestedHeadDiameterPx: headDiameterPx, ...detailInfo(run, root),
      poseHash: poseHash(root), render: counters(), tick: run.tick, fightClock: run.fight.clock, simulationTime: run.state.simTime });
  }
  const [near, distant, restored] = samples;
  expect(near.detailLevel === 'close' && distant.detailLevel === 'distant' && restored.detailLevel === 'close',
    'Actual camera movement did not switch close → distant → close detail');
  expect(samples.every(sample => Math.abs(sample.headDiameterPx - sample.requestedHeadDiameterPx) < 0.5),
    'Detail owner did not report the measured real camera projection');
  expect(samples.every(sample => sample.poseHash === near.poseHash), 'Paused camera zoom changed articulated transforms');
  expect(run.fight.clock === clock && run.state.simTime === time && JSON.stringify(run.fight) === fightBefore,
    'Detail selection advanced or mutated the simulation fight');
  expect(distant.render.triangles < near.render.triangles, 'Distant detail did not reduce native submitted triangles');
  return { kind: 'actual-camera-projection', forcedDetailOverride: false, pausedPoseStable: true,
    simulationReadOnly: true, detailRestored: true, samples,
    distantTriangleRatio: distant.render.triangles / near.render.triangles };
}

async function checks() {
  setLighting();
  const run = seek(makeRun(), { beatId: 'ink_ring', phase: 'recovery', progress: 0.4 });
  const root = mount(run);
  // Resource identity is compared at one explicit close distance. The separate camera proof
  // above tests swaps; a colossus must not turn this ownership check into a mixed-detail census.
  frameDetailCamera(run, 240);
  const serializedFight = JSON.stringify(run.fight);
  update(run, root);
  const pausedBefore = poseHash(root);
  for (let i = 0; i < 8; i++) update(run, root);
  const pausedAfter = poseHash(root);
  expect(pausedBefore === pausedAfter, 'Repeated paused render time changed the articulated pose');
  expect(JSON.stringify(run.fight) === serializedFight, 'Rendering mutated the simulation fight');
  update(run, root, { reducedMotion: true, reducedFlash: true });
  const reducedBefore = poseHash(root);
  update(run, root, { reducedMotion: true, reducedFlash: true });
  expect(reducedBefore === poseHash(root), 'Reduced-motion repeated time is not stable');
  const resources = objectResources(root);
  const sharedMaterials = [...resources.materials].filter(material => material.userData.spacefaceSharedAsset);
  const privateMaterials = [...resources.materials].filter(material => !material.userData.spacefaceSharedAsset);
  const instances = [...resources.geometries, ...sharedMaterials];
  expect([...resources.geometries].every(resource => resource.userData.spacefaceSharedAsset), 'A reusable rig geometry lacks the shared-resource disposal guard');
  const privateMatrices = [];
  root.traverse(node => { if (node.isInstancedMesh) privateMatrices.push(node.instanceMatrix); });
  let sharedDisposeCount = 0;
  const disposed = () => sharedDisposeCount++;
  for (const resource of instances) resource.addEventListener('dispose', disposed);
  const lifecycle = [];
  frameDetailCamera(run, 240);
  update(run, root, { reducedMotion: true, reducedFlash: true });
  draw(run);
  const warm = counters();
  try {
    for (let i = 0; i < 5; i++) {
      const nextRun = seek(makeRun(i % 2 ? 'colossus' : 'heavy'));
      const nextRoot = build(nextRun);
      const nextResources = objectResources(nextRoot);
      expect([...nextResources.geometries].every(item => resources.geometries.has(item)), 'Repeated build allocated different shape geometry');
      expect([...nextResources.materials].filter(item => item.userData.spacefaceSharedAsset)
        .every(item => resources.materials.has(item)), 'Repeated build allocated different shared palette materials');
      expect([...nextResources.materials].filter(item => !item.userData.spacefaceSharedAsset)
        .every(item => !privateMaterials.includes(item)), 'Separate creatures share mutable glow/jet materials');
      nextRoot.traverse(node => {
        if (node.isInstancedMesh) expect(!privateMatrices.includes(node.instanceMatrix), 'Different characters share a mutable instance matrix buffer');
      });
      scene.add(nextRoot);
      update(nextRun, nextRoot);
      draw(run);
      release(nextRoot, nextRun.state);
      draw(run);
      lifecycle.push(counters());
    }
    expect(sharedDisposeCount === 0, 'One character teardown disposed resources used by another');
    expect(lifecycle.every(item => item.geometries === warm.geometries && item.textures === warm.textures), 'Repeated character lifetimes grow resident geometry/texture counts');
  } finally {
    for (const resource of instances) resource.removeEventListener('dispose', disposed);
  }
  // Compare a complete score pose, not a set of hand-authored matrices.
  const moving = seek(makeRun(), { beatId: 'siphon_jet', phase: 'active', progress: 0.4 });
  const movingRoot = build(moving);
  update(moving, movingRoot);
  const activeHash = poseHash(movingRoot);
  release(movingRoot, moving.state);
  expect(activeHash !== pausedBefore, 'Jet and mantle recovery have the same articulated pose');
  return { pausedPoseStable: true, simulationReadOnly: true, reducedMotionStable: true,
    activeDiffersFromRecovery: true, sharedGeometryAndMaterialIdentity: true,
    privateInstanceMatrices: true, privateMutableMaterials: true, sharedResourcesSurviveTeardown: true,
    pausedBefore, pausedAfter, reducedMotionHash: reducedBefore, activeHash,
    warm, repeatedLifecycle: lifecycle, sharedDisposeCount };
}

let motion = null;
let motionWarmup = null;

function finishMotion() {
  if (!motionWarmup) return;
  release(motionWarmup.root, motionWarmup.state);
  motionWarmup = null;
}

async function prepareMotion(spec = {}) {
  finishMotion();
  const startPose = { beatId: 'arm_rake', phase: 'tell', progress: 0.1 };
  let run = seek(makeRun(), startPose);
  let root = mount(run);
  setLighting(spec.lighting);
  const warmPoses = [
    { phase: 'intro' },
    { beatId: 'arm_rake', phase: 'tell' }, { beatId: 'arm_rake', phase: 'active' },
    { beatId: 'siphon_jet', phase: 'tell' }, { beatId: 'siphon_jet', phase: 'active' },
    { beatId: 'siphon_jet', phase: 'recovery' }, { beatId: 'ink_ring', phase: 'active' },
    { beatId: 'ink_ring', phase: 'recovery' },
  ];
  const box = new THREE.Box3();
  const fitPoints = [];
  // Warm real visibility/material states with the owning entity identity. A fresh production
  // rig then starts the movie so warm-up seeking cannot rewind its stateful motion envelopes.
  for (const pose of warmPoses) {
    const warmRun = seek(makeRun('heavy', run.entity.id), pose);
    update(warmRun, root);
    box.union(bounds(root));
    fitPoints.push(...visibleFitPoints(root));
    useCamera(warmRun, root, spec, box, fitPoints);
    update(warmRun, root);
    await renderer.compileAsync(scene, camera);
    draw(warmRun);
  }
  renderer.getContext().finish();
  const warmRoot = root, warmState = run.state;
  warmRoot.visible = false;
  // Hidden effects on the fresh rig do not acquire their programs until their first live phase.
  // Retain this non-drawing warm rig until encoding finishes, then release its temporary
  // private buffers through the normal owner. Both rigs use the production factory.
  motionWarmup = { root: warmRoot, state: warmState };
  live = null;
  run = seek(makeRun(), startPose);
  root = mount(run);
  update(run, root);
  useCamera(run, root, { view: spec.view || 'inspect' }, box, fitPoints);
  update(run, root);
  await renderer.compileAsync(scene, camera);
  draw(run);
  renderer.getContext().finish();
  title.textContent = 'Iron Kraken · real score motion';
  footer.textContent = `Production motion driver · ${lightMode} lighting · prewarmed fixed-tick frames · stationary diagnostic, not an FPS benchmark`;
  motion = { run, root, startTick: run.tick, frames: 0, spec };
  draw(run);
  await painted();
  return { startTick: run.tick, prewarmedPoses: warmPoses, lighting: lightMode,
    camera: { fov: camera.fov, position: camera.position.toArray() }, programs: counters().programs,
    warmRigVisibleDuringMovie: false, warmProgramsRetainedUntilMovieEnd: true };
}

function motionFrame(ticks = 2) {
  expect(motion && live?.root === motion.root, 'Call prepareMotion before requesting movie frames');
  expect(Number.isInteger(ticks) && ticks >= 0 && ticks <= 60, 'Movie frame tick count must be a bounded integer');
  const { run, root, spec } = motion;
  for (let i = 0; i < ticks; i++) advance(run);
  update(run, root);
  caption.textContent = `${run.fight.phase} / ${run.fight.cast?.beatId || run.recovery?.beatId || 'idle'} · simulation tick ${run.tick}`;
  draw(run, spec);
  motion.frames++;
  return { frames: motion.frames, fixedTicks: run.tick - motion.startTick,
    finalPhase: run.fight.phase, finalTick: run.tick, poseHash: poseHash(root) };
}

let movieCanvas = null;
function motionPixels(ticks = 2) {
  const frame = motionFrame(ticks);
  // Read the rendered native canvas directly. Playwright screenshots wait for unrelated DOM
  // compositor work on every frame; this keeps the inner art loop short without skipping ticks.
  movieCanvas ||= Object.assign(document.createElement('canvas'), { width, height });
  const ctx = movieCanvas.getContext('2d');
  ctx.drawImage(stage, 0, 0);
  if (!warningCanvas.hidden) ctx.drawImage(warningCanvas, 0, 0);
  ctx.fillStyle = lightMode === 'studio' ? '#252626' : '#e5eaf2';
  ctx.font = '600 22px system-ui'; ctx.fillText('Iron Kraken · native score motion', 25, 34);
  ctx.font = '14px system-ui'; ctx.fillText(caption.textContent, 25, 60);
  ctx.font = '12px system-ui'; ctx.fillText(`${lightMode} lighting · fixed simulation ticks · not a hardware FPS measurement`, 25, height - 20);
  return { frame, png: movieCanvas.toDataURL('image/png').split(',')[1] };
}

async function animate(seconds = 12, spec = {}) {
  const warmup = await prepareMotion(spec);
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    motionFrame(1);
  }
  finishMotion();
  return { seconds, ...warmup, ...motionFrame(0), timing: 'one fixed simulation tick per presented frame; playback speed depends on host' };
}

// Dynamic encounter diagnostic. Spawn setup and the pilot's input packet are the only writes
// outside canonical owners. It never integrates velocity, rotates a body, or applies damage.
let encounter = null;

function finishEncounter() {
  if (!encounter) return;
  for (const off of encounter.listeners) off?.();
  for (const root of encounter.projectileViews.values()) release(root, encounter.run.state);
  release(encounter.grid);
  encounter.host.dispose();
  encounter = null;
}

function pilotTape(time) {
  // A deliberately imperfect pilot: counterfire during the first recovery, absorb the first
  // locked jet, then strafe out and return. No target coordinates or hidden AI state are read.
  const outward = time >= 9.1 && time < 10.3;
  const inward = time >= 17.8 && time < 18.6;
  return { moveX: outward ? .65 : inward ? -.65 : 0, moveZ: 0,
    turnIntent: 0, brake: !outward && !inward, boost: false,
    fire: (time >= 4.7 && time < 6.1) || (time >= 11.5 && time < 12.5) };
}

async function prepareEncounter(spec = {}) {
  finishMotion(); finishEncounter();
  const [{ bootRealPath, OPEN_SPACE_BOUNDS, writeRealPathInput }, { createProductionCapitalBossEncounters }, { loadModelTruthCensus }] = await Promise.all([
    import('../../scripts/lib/bench/realPath.mjs'), import('../../src/systems/capitalBossRuntime.js'), import('../../src/data/modelTruth.js'),
  ]);
  await loadModelTruthCensus();
  const p = IRON_KRAKEN_PROFILES[spec.variant || 'heavy'];
  const fightId = 'inspect:kraken_native', room = 'kraken_native_diagnostic';
  const host = await bootRealPath({ seed: 74231, bounds: OPEN_SPACE_BOUNDS,
    // Combat initializes the damage helpers used by capital. The flight/AI force-owner order
    // matches the production manifest; this focused harness settles combat before physics.
    systems: [combat, createProductionCapitalBossEncounters(), 'tacticalAI', 'actions', 'flightV3', 'aiPorts', 'weapons'],
    hulls: [{ hullId: hitch.id, isPlayer: true, pos: { x: 0, z: 0 }, rot: Math.PI, team: 0,
      fittings: ['wpn_pulse_laser_s'] }],
    prepareState({ state }) {
      // Browser builds publish body telemetry only on demand. This observation flag lets
      // the shared harness assert that both actors really own native bodies.
      state.physicsRuntime ||= {};
      state.physicsRuntime.publishSg02Telemetry = true;
      state.world.currentSectorId = room;
      state.missions.active.push({ id: fightId, status: 'active', destSectorId: room });
    } });
  const spawn = makeEnemySpawnSpec(p.enemyId, 1, { x: -230 * p.scale, z: 0 });
  spawn.rot = .65;
  Object.assign(spawn.data.ai, { forcePlayerTarget: true, huntPlayer: true, spawnContext: 'encounter', moraleImmune: true });
  const entity = host.runtime.spawn(spawn), target = host.player;
  host.bus.emit('capitalBoss:start', { fightId, encounterId: p.scoreId, bossId: entity.id, targetId: target.id });
  host.step(1); host.assertBodies([entity, target], 'native Kraken encounter');
  expect(host.proof().backend === 'rapier-dynamic', 'Dynamic capture requires the real Rapier backend');
  host.state.render = { scene, camera, renderer, frameOrigin: { x: 0, z: 0 } };
  const run = { p, entity, target, state: host.state, fight: host.state.capitalBossEncounters.fights[fightId],
    score: requireCapitalBossEncounter(p.scoreId).score, tick: host.state.tick, warning: null, recovery: null };
  const root = mount(run);
  const grid = new THREE.GridHelper(900 * p.scale, 18, 0x344659, 0x1c2a3a);
  grid.position.set(-80 * p.scale, -75 * p.scale, 0); scene.add(grid);
  addScaleReference(run, new THREE.Box3(new THREE.Vector3(-1,-1,-1), new THREE.Vector3(1,1,1)));
  referenceLabel.textContent = 'Hitch pilot · collision glyph';
  setLighting(spec.lighting || 'production');
  camera.fov = 46; camera.up.set(0,1,0);
  const center = new THREE.Vector3(-65 * p.scale, -8 * p.scale, 0);
  camera.position.copy(center).addScaledVector(new THREE.Vector3(0,.866,-.5), 590 * p.scale);
  camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const events = [], listeners = [], locked = new Map(), projectileViews = new Map();
  const initial = { boss: { x: entity.pos.x, z: entity.pos.z, rot: entity.rot, hull: entity.hull },
    player: { x: target.pos.x, z: target.pos.z, hull: target.hull, shield: target.shield } };
  encounter = { host, run, root, grid, spec, writeInput: writeRealPathInput, events, listeners, locked, projectileViews,
    initial, frames: 0, samples: 0, distance: 0, playerDistance: 0, maxSpeed: 0, lockedShapesStable: true,
    minimumPlayerShield: target.shield, minimumPlayerHull: target.hull, minimumBossHull: entity.hull,
    eventCounts: { telegraph: 0, attack: 0, recovery: 0, damage: 0, fire: 0 }, lastPhase: null,
    systems: host.runtime.manifest.systemIds || host.runtime.manifest.authoritativeSystemIds || null };
  const seenWarnings = new Set();
  for (const name of ['telegraph', 'attack', 'telegraphEnd', 'recovery']) listeners.push(host.bus.on(`capitalBoss:${name}`, fact => {
    if (fact.fightId !== fightId) return;
    if (name === 'telegraph' || name === 'attack') run.warning = clone(fact);
    if (name === 'telegraphEnd') run.warning = null;
    if (name === 'recovery') run.recovery = { beatId: fact.beatId, start: run.fight.clock - 1, duration: fact.durationTicks };
    const key = `${fact.castId || fact.beatId}:${!!fact.locked}`;
    if (name === 'telegraph' && seenWarnings.has(key)) return;
    if (name === 'telegraph') seenWarnings.add(key);
    if (name in encounter.eventCounts) encounter.eventCounts[name]++;
    events.push({ kind: name, tick: host.state.tick, beatId: fact.beatId || null,
      castId: fact.castId || null, locked: !!fact.locked });
  }));
  listeners.push(host.bus.on('capitalBoss:damage', fact => {
    if (fact.fightId !== fightId) return;
    encounter.eventCounts.damage++;
    events.push({ kind: 'score-damage', tick: host.state.tick, targetId: fact.targetId,
      packet: fact.packet ? clone(fact.packet) : null, origin: fact.origin ? clone(fact.origin) : null });
  }));
  listeners.push(host.bus.on('combat:fire', fact => {
    encounter.eventCounts.fire++;
    if (encounter.eventCounts.fire <= 20) events.push({ kind: 'weapon-fire', tick: host.state.tick,
      entityId: fact.entityId ?? fact.shooterId ?? fact.ownerId, weaponId: fact.weaponId });
  }));
  listeners.push(host.bus.on('combat:damage', fact => {
    events.push({ kind: 'combat-damage', tick: host.state.tick, targetId: fact.targetId ?? fact.id,
      hull: target.hull, shield: target.shield, bossHull: entity.hull });
  }));
  title.textContent = 'Iron Kraken · canonical moving encounter';
  footer.textContent = 'Real tactical AI / Flight V3 / Rapier / combat · scripted pilot input · collision glyph for Hitch · focused diagnostic, not full Swarm route';
  update(run, root); syncEncounterViews();
  await renderer.compileAsync(scene,camera); draw(run,{warnings:true}); await painted();
  return { kind: 'canonical-focused-encounter', acceptance: 'not-a-public-route-playtest', seed:74231,
    backend:host.proof(), pilot:'fixed input tape; no direct position, velocity, heading or health writes',
    playerVisual:'labelled collision glyph, not authored Hitch model', initial,
    updateOrder: ['combat', 'capitalBossEncounters', 'tacticalAI', 'actions', 'flightV3', 'aiPorts', 'weapons', 'physics'],
    camera:{fov:camera.fov,position:camera.position.toArray(),up:camera.up.toArray()},
    scope:'Production authoritative runtime with explicit focused systems; no Swarm progression, production renderer/post route or target-hardware FPS claim.' };
}

function syncEncounterViews() {
  if (!encounter) return;
  const {run,projectileViews}=encounter;
  if (proxy) { proxy.position.set(run.target.pos.x,0,run.target.pos.z); proxy.rotation.y=-run.target.rot; }
  for (const entity of run.state.entityList) {
    if(entity.type!=='projectile'||entity.alive===false)continue;
    let root=projectileViews.get(entity.id);
    if(!root){root=factory.build(entity);if(!root)continue;projectileViews.set(entity.id,root);scene.add(root);}
    root.position.set(entity.pos.x,0,entity.pos.z);root.rotation.y=-(entity.rot||0);
  }
  for(const [id,root] of projectileViews){const entity=run.state.entities.get(id);
    if(!entity||entity.alive===false){release(root,run.state);projectileViews.delete(id);}}
}

function encounterFrame(ticks=2, { render = true } = {}) {
  expect(encounter&&live?.root===encounter.root,'Call prepareEncounter before requesting encounter frames');
  expect(Number.isInteger(ticks)&&ticks>=0&&ticks<=60,'Encounter tick count must be a bounded integer');
  const e=encounter,{host,run,root}=e;
  for(let i=0;i<ticks;i++) {
    const x=run.entity.pos.x,z=run.entity.pos.z,px=run.target.pos.x,pz=run.target.pos.z;
    e.writeInput(run.state,pilotTape(run.state.simTime));
    run.state.input.aimAngle=Math.PI; // the tape's fixed cursor bearing, not a hidden target read
    host.step(1);run.tick=run.state.tick;
    e.distance+=Math.hypot(run.entity.pos.x-x,run.entity.pos.z-z);
    e.playerDistance+=Math.hypot(run.target.pos.x-px,run.target.pos.z-pz);
    e.maxSpeed=Math.max(e.maxSpeed,Math.hypot(run.entity.vel.x,run.entity.vel.z));
    e.minimumPlayerShield=Math.min(e.minimumPlayerShield,run.target.shield);
    e.minimumPlayerHull=Math.min(e.minimumPlayerHull,run.target.hull);
    e.minimumBossHull=Math.min(e.minimumBossHull,run.entity.hull);
    const cast=run.fight.cast;
    if(cast?.locked){const shape=JSON.stringify(cast.shapes),previous=e.locked.get(cast.id);
      if(previous!==undefined&&previous!==shape)e.lockedShapesStable=false;
      else if(previous===undefined)e.locked.set(cast.id,shape);}
    update(run,root);
  }
  syncEncounterViews();
  const beat=run.fight.cast?.beatId||run.fight.recovery?.beatId||'approach';
  caption.textContent=`${run.fight.phase} / ${beat} · ${Math.hypot(run.entity.vel.x,run.entity.vel.z).toFixed(1)} WU/s · `
    +`Hitch hull ${Math.ceil(run.target.hull)} / shield ${Math.ceil(run.target.shield)} · Kraken ${Math.ceil(run.entity.hull)}`;
  e.samples++;
  if (render) { draw(run,{warnings:true}); e.frames++; }
  return {frames:e.frames,samples:e.samples,tick:run.tick,simulationTime:run.state.simTime,phase:run.fight.phase,beatId:beat,
    boss:{x:run.entity.pos.x,z:run.entity.pos.z,rot:run.entity.rot,hull:run.entity.hull,speed:Math.hypot(run.entity.vel.x,run.entity.vel.z)},
    player:{x:run.target.pos.x,z:run.target.pos.z,hull:run.target.hull,shield:run.target.shield},
    distance:e.distance,playerDistance:e.playerDistance,maxSpeed:e.maxSpeed,
    minimumPlayerShield:e.minimumPlayerShield,minimumPlayerHull:e.minimumPlayerHull,minimumBossHull:e.minimumBossHull,
    lockedShapesStable:e.lockedShapesStable,eventCounts:{...e.eventCounts},events:e.events.slice(),backend:host.proof()};
}

function encounterPixels(ticks=2){
  const frame=encounterFrame(ticks);
  movieCanvas ||= Object.assign(document.createElement('canvas'),{width,height});
  const ctx=movieCanvas.getContext('2d');ctx.drawImage(stage,0,0);
  if(!warningCanvas.hidden)ctx.drawImage(warningCanvas,0,0);
  ctx.fillStyle='#e5eaf2';ctx.font='600 22px system-ui';ctx.fillText('Iron Kraken · canonical moving encounter',25,34);
  ctx.font='14px system-ui';ctx.fillText(caption.textContent,25,60);
  ctx.font='12px system-ui';ctx.fillText('AI + Flight V3 + Rapier + combat · scripted inputs · Hitch collision glyph · fixed ticks, not a hardware FPS result',25,height-20);
  if(proxy){const p=project(proxy.position.x,proxy.position.z);ctx.fillStyle='#9ce3ee';ctx.fillText('Hitch pilot',p.x-25,p.y+28);}
  return {frame,png:movieCanvas.toDataURL('image/png').split(',')[1]};
}

function runtime() {
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { webglVersion: gl.getParameter(gl.VERSION), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    threeRevision: THREE.REVISION, width, height, pixelRatio: renderer.getPixelRatio(),
    scope: 'Reference mode: stationary production rig and score. Optional encounter mode: canonical focused AI/Flight V3/Rapier/combat with scripted input. Neither mode is full-route or production-post acceptance.',
    measurement: 'Renderer counters are workload diagnostics for this exact capture; no hardware FPS claim.' };
}

window.ironKrakenProbe = { capture, captureBreakup, captureWreck, lodChecks, checks, prepareMotion, finishMotion, motionFrame, motionPixels, animate, runtime, prepareEncounter, encounterFrame, encounterPixels, finishEncounter,
  dispose() { finishMotion(); finishEncounter(); if (live) release(live.root, live.run.state); removeProxy(); debris?.dispose(); renderer.dispose(); } };
window.ironKrakenReady = true;
