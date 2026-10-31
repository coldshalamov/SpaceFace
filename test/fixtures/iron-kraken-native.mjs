// Isolated native rig inspection. Production builders, surface shaders, score progression and
// warning painter are exercised; the main game, physics, post route and player input are not.
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
import { makeEnemySpawnSpec } from '../../src/systems/combat.js';
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
renderer.toneMappingExposure = resolveLookPost(profile).exposure;
scene.add(new THREE.AmbientLight(lighting.ambientColor, lighting.ambient));
for (const [channel, position] of [['key', [60, 140, 40]], ['rim', [-70, 50, -60]], ['fill', [20, 30, 120]]]) {
  const light = new THREE.DirectionalLight(lighting[`${channel}Color`], lighting[channel]);
  light.position.fromArray(position);
  scene.add(light);
}
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

function makeRun(variant = 'heavy') {
  const p = IRON_KRAKEN_PROFILES[variant];
  expect(p, `Unknown Kraken variant: ${variant}`);
  const id = `kraken-render-${++nextId}`;
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
  frameCamera(box, spec.view, fitPoints);
  scene.background.set(spec.inspection ? 0x333a46 : 0x080d16);
  title.textContent = `${run.p.name} · ${spec.title}`;
  const viewLabel = spec.view === 'gameplay' ? '60° gameplay-angle inspection' : `${spec.view} inspection`;
  caption.textContent = `${viewLabel} · ${run.fight.phase}${run.fight.cast ? ` / ${run.fight.cast.beatId}` : ''} · tick ${run.tick}${spec.reducedMotion ? ' · reduced motion + flash' : ''}`;
  footer.textContent = 'Production model, illustrated surfaces and score clock · Helios lighting · no post effects · stationary diagnostic';
  draw(run, spec);
  await painted();
  const resources = objectResources(root);
  return { name: spec.name, variant: run.p.variant, spec, tick: run.tick,
    simulationTime: run.state.simTime, phase: run.fight.phase, beatId: run.fight.cast?.beatId || run.recovery?.beatId || null,
    scale: run.p.scale, coreRadius: run.p.coreRadius, armReach: run.p.armReach,
    actualBounds, cullRadius, actualXZRadius, poseHash: poseHash(root),
    render: counters(), resources: { geometries: resources.geometries.size, materials: resources.materials.size,
      renderNodes: resources.renderNodes, instanceBatches: resources.instanceBatches, instances: resources.instances },
    warningVisible: !warningCanvas.hidden, warningShapeCount: warningCanvas.hidden ? 0 : run.warning.shapes.length,
    camera: { fov: camera.fov, position: camera.position.toArray(), up: camera.up.toArray() },
    scaleReference: spec.scaleReference ? { kind: 'collision-diameter-proxy', sourceId: hitch.id, diameter: hitch.collisionRadius * 2 } : null };
}

async function captureBreakup() {
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

async function checks() {
  const run = seek(makeRun(), { beatId: 'siphon_jet', phase: 'recovery', progress: 0.4 });
  const root = mount(run);
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
  frameCamera(bounds(root), 'inspect');
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

async function animate(seconds = 12) {
  const run = seek(makeRun(), { beatId: 'arm_rake', phase: 'tell', progress: 0.1 });
  const root = mount(run);
  update(run, root);
  frameCamera(bounds(root), 'inspect');
  scene.background.set(0x080d16);
  title.textContent = 'Iron Kraken · real score motion';
  footer.textContent = 'Production motion driver and fixed score ticks · stationary body diagnostic · playback is not an FPS benchmark';
  const startTick = run.tick;
  const start = performance.now();
  await new Promise(resolve => {
    function frame(now) {
      const elapsed = Math.min(seconds, (now - start) / 1000);
      const desired = startTick + Math.floor(elapsed * 60);
      while (run.tick < desired) advance(run);
      update(run, root);
      caption.textContent = `${run.fight.phase} / ${run.fight.cast?.beatId || run.recovery?.beatId || 'idle'} · simulation tick ${run.tick}`;
      draw(run);
      if (elapsed >= seconds) resolve(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  return { seconds, fixedTicks: run.tick - startTick, finalPhase: run.fight.phase, finalTick: run.tick };
}

function runtime() {
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return { webglVersion: gl.getParameter(gl.VERSION), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    threeRevision: THREE.REVISION, width, height, pixelRatio: renderer.getPixelRatio(),
    scope: 'Isolated native character rig with production factory, materials, light profile and score clock. No full game route, physics or production post effects.',
    measurement: 'Renderer counters are workload diagnostics for this exact capture; no hardware FPS claim.' };
}

window.ironKrakenProbe = { capture, captureBreakup, captureWreck, checks, animate, runtime,
  dispose() { if (live) release(live.root, live.run.state); removeProxy(); debris?.dispose(); renderer.dispose(); } };
window.ironKrakenReady = true;
