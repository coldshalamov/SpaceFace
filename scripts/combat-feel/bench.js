// Fixed-seed combat-feel bench. Mounts the shipped Kestrel and Wasp hulls, the production weapon
// presenter, the production hull micro-motion / tumble presentation, the production shield
// presentation, and the production bloom. No second VFX renderer: every visible beat comes from
// src/render owners. See README.md for the exact production boundary.
import * as THREE from 'three';
import { resolveHitstunLaw, signedHitSide } from '../../src/combat/impulseKernel.js';
import { SHIPS } from '../../src/data/ships.js';
import { loadAuthoredPart } from '../../src/render/assetLoader.js';
import { createBloom } from '../../src/render/bloom.js';
import { renderPackagePilotForSourceUrl } from '../../src/render/renderPackageManifest.js';
import { createShipMicroMotionTracker } from '../../src/render/shipMicroMotion.js';
import { updateShipPitchPresentation } from '../../src/render/shipPitchPresentation.js';
import { createShieldBubble } from '../../src/render/ships/shipKit.js';
import { clearShieldContacts } from '../../src/render/weapons/shieldContacts.js';
import { updateEntityShieldBubblePresentation } from '../../src/render/weapons/shieldBubblePresentation.js';
import {
  ALL_EVIDENCE,
  CATALOG_VERSION,
  DEFAULT_SEED,
  DEFAULT_VIEW,
  FIXED_ARENA,
  SCENARIOS,
  STEP_SECONDS,
  VIEWS,
  catalogSummary,
  scenarioById,
  weaponForShot,
} from './catalog.mjs';
import { buildBeatTimes, frameForTime, roundTime } from './beatMath.mjs';
import { createWeaponSequence } from './sequence.js';

const OWNER_URL = 'assets/ships/release/parts/wholeships/kestrel.glb';
const TARGET_URL = 'assets/ships/release/parts/wholeships/wasp_production_v1.glb';
// Same authored hulls, pre-package source. The bench prefers the release package (the shipping
// route) but must still boot while that package is mid-regeneration in a shared tree; `assetRoute`
// records which one produced the picture so the evidence never claims the release lane silently.
const OWNER_SOURCE_URL = 'assets/ships/parts/wholeships/kestrel.glb';
const TARGET_SOURCE_URL = 'assets/ships/parts/wholeships/wasp_production_v1.glb';
let assetRoute = 'release';
let ownerUrl = OWNER_URL;
let targetUrl = TARGET_URL;
const OWNER_SHIP_ID = 'ship_kestrel';
const TARGET_SHIP_ID = 'ship_wasp';
const TARGET_ID = 2;
const OWNER_ID = 1;

const OWNER_DEF = SHIPS.find((ship) => ship.id === OWNER_SHIP_ID);
const TARGET_DEF = SHIPS.find((ship) => ship.id === TARGET_SHIP_ID);

const OWNERS = Object.freeze({
  weaponPresenter: 'src/render/weapons/presenter.js · WeaponVfxPresenter',
  beamPool: 'src/render/combat/persistentBeams.js · PersistentCombatBeamPool',
  hullResponse: 'src/render/shipMicroMotion.js · createShipMicroMotionTracker',
  tumblePose: 'src/render/shipPitchPresentation.js · updateShipPitchPresentation',
  tumbleLaw: 'src/combat/impulseKernel.js · resolveHitstunLaw',
  shieldResponse: 'src/render/weapons/shieldBubblePresentation.js · updateEntityShieldBubblePresentation',
  bloom: 'src/render/bloom.js · createBloom',
  assets: 'src/render/assetLoader.js · loadAuthoredPart (release GLBs)',
});

function degToRad(value) {
  return (Number(value) * Math.PI) / 180;
}

function makeRandom(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function addBlueprint(container, blueprint) {
  if (!blueprint || !Array.isArray(blueprint.primitives) || !blueprint.primitives.length) {
    throw new Error(`Authored asset has no primitives: ${blueprint && blueprint.url ? blueprint.url : 'unknown'}`);
  }
  for (const primitive of blueprint.primitives) {
    const mesh = new THREE.Mesh(primitive.geometry, primitive.material);
    mesh.name = primitive.name;
    mesh.matrix.copy(primitive.matrix);
    mesh.matrixAutoUpdate = false;
    container.add(mesh);
  }
  for (const marker of blueprint.markers || []) {
    const object = new THREE.Object3D();
    object.name = marker.name;
    object.matrix.copy(marker.matrix);
    object.matrixAutoUpdate = false;
    if (marker.userData) object.userData = { ...marker.userData };
    container.add(object);
  }
  container.updateMatrixWorld(true);
  return {
    primitiveCount: blueprint.primitives.length,
    markerCount: Array.isArray(blueprint.markers) ? blueprint.markers.length : 0,
    bounds: blueprint.bounds ? {
      center: blueprint.bounds.center ? Array.from(blueprint.bounds.center) : null,
      size: blueprint.bounds.size ? Array.from(blueprint.bounds.size) : null,
    } : null,
    socketNames: (blueprint.markers || [])
      .filter((marker) => marker.tags && marker.tags.socket)
      .map((marker) => marker.name),
  };
}

function addStarfield(scene, seed) {
  const random = makeRandom(seed);
  const positions = [];
  const colors = [];
  for (let index = 0; index < 260; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 260 + random() * 520;
    positions.push(Math.cos(angle) * radius, -380 - random() * 80, Math.sin(angle) * radius);
    const tint = 0.18 + random() * 0.5;
    colors.push(tint, tint * 1.08, tint * 1.22);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.85,
    vertexColors: true,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'CombatFeelStarfield';
  scene.add(points);
  return points;
}

function makeShipEntity({ id, pos, rot, def, hullFraction, shield, target }) {
  const hullMax = Number(def.hull) || 150;
  return {
    id,
    type: 'ship',
    alive: true,
    pos: { x: pos.x, z: pos.z },
    prevPos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot,
    radius: Number(def.collisionRadius) || 14,
    mass: Number(def.mass) || 16,
    hull: hullMax * hullFraction,
    hullMax,
    shield,
    shieldMax: Number(def.shield) || 0,
    maxSpeed: 105,
    angVel: 0,
    bank: 0,
    pitch: 0,
    presentation: {},
    flags: {},
    data: {
      defId: def.id,
      shipId: def.id,
      shipClass: target ? 'fighter' : 'scout',
      ...(target ? { targetId: OWNER_ID } : {}),
    },
  };
}

function makeSettings() {
  return {
    video: {
      motionReduce: false,
      flashReduce: false,
      particleQuality: 'high',
      renderGraph: true,
      bloom: true,
      fov: FIXED_ARENA.camera.fov,
    },
    accessibility: {},
    gameplay: {},
    audio: {},
  };
}

export async function bootCombatFeelBench({ canvas, statusElement, errorElement } = {}) {
  const errors = [];
  const recordError = (kind, message) => {
    errors.push({ kind, message: String(message) });
    if (errorElement) errorElement.textContent = `${kind}: ${message}`;
  };
  if (!canvas) throw new Error('Combat-feel bench needs a canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.setSize(globalThis.innerWidth, globalThis.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x050911);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050911);
  scene.fog = new THREE.FogExp2(0x050911, 0.00028);
  const camera = new THREE.PerspectiveCamera(
    FIXED_ARENA.camera.fov,
    globalThis.innerWidth / globalThis.innerHeight,
    0.1,
    2400,
  );
  let view = DEFAULT_VIEW;
  let seed = DEFAULT_SEED;

  function applyCamera() {
    const distance = FIXED_ARENA.camera.distanceWu[view] || FIXED_ARENA.camera.distanceWu.normal;
    const tilt = degToRad(FIXED_ARENA.camera.tiltDeg);
    const azimuth = degToRad(FIXED_ARENA.camera.azimuthDeg || 0);
    const horizontal = distance * Math.cos(tilt);
    camera.position.set(
      -horizontal * Math.sin(azimuth),
      distance * Math.sin(tilt),
      -horizontal * Math.cos(azimuth),
    );
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    return {
      distance,
      tiltDeg: FIXED_ARENA.camera.tiltDeg,
      azimuthDeg: FIXED_ARENA.camera.azimuthDeg || 0,
      fov: camera.fov,
    };
  }
  let cameraState = applyCamera();

  scene.add(new THREE.HemisphereLight(0xaac7e1, 0x111a29, 0.95));
  const key = new THREE.DirectionalLight(0xc6ddf4, 2.5);
  key.position.set(-35, 90, -55);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4daaff, 1.15);
  rim.position.set(60, 40, 32);
  scene.add(rim);
  addStarfield(scene, 0x9e3779b9 ^ seed);
  const bloom = createBloom(renderer, globalThis.innerWidth, globalThis.innerHeight);
  bloom.enabled = true;

  const ownerDef = OWNER_DEF || { id: OWNER_SHIP_ID, hull: 140, shield: 55, mass: 18, collisionRadius: 14 };
  const targetDef = TARGET_DEF || { id: TARGET_SHIP_ID, hull: 150, shield: 110, mass: 16, collisionRadius: 14 };

  const ownerRoot = new THREE.Group();
  ownerRoot.name = 'CombatFeelOwnerRoot';
  const ownerHull = new THREE.Group();
  ownerHull.name = 'CombatFeelOwnerHull';
  ownerRoot.add(ownerHull);
  ownerRoot.userData.hull = ownerHull;
  scene.add(ownerRoot);

  const targetRoot = new THREE.Group();
  targetRoot.name = 'CombatFeelTargetRoot';
  const targetHull = new THREE.Group();
  targetHull.name = 'CombatFeelTargetHull';
  targetRoot.add(targetHull);
  targetRoot.userData.hull = targetHull;
  scene.add(targetRoot);

  if (statusElement) statusElement.textContent = 'Loading released Kestrel + Wasp hulls…';
  let ownerBlueprint;
  let targetBlueprint;
  try {
    [ownerBlueprint, targetBlueprint] = await Promise.all([
      loadAuthoredPart(OWNER_URL, { renderer, slot: 'hull' }),
      loadAuthoredPart(TARGET_URL, { renderer, slot: 'hull' }),
    ]);
  } catch (error) {
    recordError('asset', error instanceof Error ? error.message : error);
    throw error;
  }
  if (!ownerBlueprint || !targetBlueprint) {
    assetRoute = 'source';
    ownerUrl = OWNER_SOURCE_URL;
    targetUrl = TARGET_SOURCE_URL;
    try {
      [ownerBlueprint, targetBlueprint] = await Promise.all([
        loadAuthoredPart(OWNER_SOURCE_URL, { renderer, slot: 'hull' }),
        loadAuthoredPart(TARGET_SOURCE_URL, { renderer, slot: 'hull' }),
      ]);
    } catch (error) {
      recordError('asset', error instanceof Error ? error.message : error);
      throw error;
    }
  }
  if (!ownerBlueprint || !targetBlueprint) {
    const message = `The shipping loader did not return both authored hulls: ${OWNER_URL} / ${TARGET_URL}`;
    recordError('asset', message);
    throw new Error(message);
  }
  const ownerAsset = addBlueprint(ownerHull, ownerBlueprint);
  const targetAsset = addBlueprint(targetHull, targetBlueprint);
  if (!ownerAsset.primitiveCount || !targetAsset.primitiveCount) {
    throw new Error('Authored hulls produced zero drawable primitives');
  }
  ownerRoot.position.set(FIXED_ARENA.ownerX, 0, 0);
  ownerRoot.rotation.y = 0;
  targetRoot.position.set(FIXED_ARENA.targetX, 0, 0);
  targetRoot.rotation.y = -FIXED_ARENA.targetRot;
  scene.updateMatrixWorld(true);

  const ownerEntity = makeShipEntity({
    id: OWNER_ID,
    pos: { x: FIXED_ARENA.ownerX, z: 0 },
    rot: FIXED_ARENA.ownerRot,
    def: ownerDef,
    hullFraction: 1,
    shield: 100,
    target: false,
  });
  const targetEntity = makeShipEntity({
    id: TARGET_ID,
    pos: { x: FIXED_ARENA.targetX, z: 0 },
    rot: FIXED_ARENA.targetRot,
    def: targetDef,
    hullFraction: 0.8,
    shield: 0,
    target: true,
  });
  ownerEntity.data.defId = OWNER_SHIP_ID;
  targetEntity.data.defId = TARGET_SHIP_ID;
  // A hull contact belongs on the authored nose, not on the conservative collision sphere. The
  // Wasp collision radius is 14 WU while its authored X half-extent is ~10.8; using the sphere put
  // the flash 3 WU in front of the hull. Shield contact keeps the true bubble radius.
  const targetHalfExtentX = targetAsset.bounds && targetAsset.bounds.size
    ? Number(targetAsset.bounds.size[0]) * 0.5
    : targetEntity.radius;
  targetEntity.contactRadius = Math.max(
    4,
    Math.min(targetEntity.radius, Number.isFinite(targetHalfExtentX) ? targetHalfExtentX - 0.6 : targetEntity.radius),
  );

  const targetShieldBubble = createShieldBubble('#5fd0ff', targetEntity.radius);
  targetShieldBubble.name = 'CombatFeelTargetShieldBubble';
  targetShieldBubble.visible = false;
  targetHull.add(targetShieldBubble);
  targetRoot.userData.shieldBubble = targetShieldBubble;

  const state = {
    simTime: 0,
    tick: 0,
    playerId: OWNER_ID,
    mode: 'flight',
    settings: makeSettings(),
    render: {
      camera,
      bloom,
      scene,
      meshes: new Map([[OWNER_ID, ownerRoot], [TARGET_ID, targetRoot]]),
    },
    entities: new Map([[OWNER_ID, ownerEntity], [TARGET_ID, targetEntity]]),
    entityList: [ownerEntity, targetEntity],
    entityIndex: null,
    fields: { active: [] },
    combat: {
      entities: {
        [OWNER_ID]: { statuses: {}, capabilities: {} },
        [TARGET_ID]: { statuses: {}, capabilities: {} },
      },
    },
  };

  let selected = null;
  let scenario = SCENARIOS[0];
  let frame = 0;
  let time = 0;
  let microMotion = createShipMicroMotionTracker();
  let weaponSequence = null;
  let beatPlan = [];
  let shotPlan = [];
  let evidence = {};
  let contactLog = [];
  let firstContact = null;
  let firstHullContact = null;
  let hullContactLocal = null;
  let hullContactNormalLocal = null;
  let tumble = null;
  let tumbleLaw = null;
  let ventingRemaining = 0;
  let ventingNextAt = Infinity;
  let lightPeakMax = 0;
  let reactionPeak = { energy: 0, atS: null, tumbleActive: false };
  let lastRender = { calls: 0, triangles: 0 };
  let disposed = false;

  function resetEvidence() {
    evidence = Object.fromEntries(ALL_EVIDENCE.map((name) => [name, { seen: false, atS: null }]));
  }
  resetEvidence();

  function markEvidence(name, atS) {
    if (!evidence[name] || evidence[name].seen) return;
    evidence[name].seen = true;
    evidence[name].atS = roundTime(atS);
  }

  function resetHulls() {
    ownerRoot.position.set(FIXED_ARENA.ownerX, 0, 0);
    ownerRoot.rotation.set(0, 0, 0);
    ownerHull.position.set(0, 0, 0);
    ownerHull.rotation.set(0, 0, 0);
    ownerHull.scale.set(1, 1, 1);
    targetRoot.position.set(FIXED_ARENA.targetX, 0, 0);
    targetRoot.rotation.set(0, -FIXED_ARENA.targetRot, 0);
    targetHull.position.set(0, 0, 0);
    targetHull.rotation.set(0, 0, 0);
    targetHull.scale.set(1, 1, 1);
    ownerRoot.updateMatrixWorld(true);
    targetRoot.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
  }

  function resetShield() {
    targetEntity.shield = Number(scenario.target.shield) || 0;
    targetEntity.shieldMax = Math.max(1, targetEntity.shield, Number(targetDef.shield) || 110);
    targetShieldBubble.visible = false;
    targetShieldBubble.material.uniforms.uFlash.value = 0;
    targetShieldBubble.material.uniforms.uBase.value = 0;
    targetShieldBubble.userData._prevShield = targetEntity.shield;
    targetShieldBubble.userData._prevFlashT = 0;
    targetShieldBubble.userData._collapseTimer = 0;
    targetShieldBubble.userData._sfShieldQuietLatched = false;
    clearShieldContacts();
  }

  function resetEntities() {
    ownerEntity.alive = true;
    ownerEntity.pos = { x: FIXED_ARENA.ownerX, z: 0 };
    ownerEntity.prevPos = { ...ownerEntity.pos };
    ownerEntity.vel = { x: 0, z: 0 };
    ownerEntity.rot = FIXED_ARENA.ownerRot;
    ownerEntity.angVel = 0;
    ownerEntity.bank = 0;
    ownerEntity.pitch = 0;
    ownerEntity.presentation = {};
    ownerEntity.hull = ownerEntity.hullMax;
    ownerEntity.shield = 100;
    targetEntity.alive = true;
    targetEntity.pos = { x: FIXED_ARENA.targetX, z: 0 };
    targetEntity.prevPos = { ...targetEntity.pos };
    targetEntity.vel = { x: 0, z: 0 };
    targetEntity.rot = FIXED_ARENA.targetRot;
    targetEntity.angVel = 0;
    targetEntity.bank = 0;
    targetEntity.pitch = 0;
    targetEntity.presentation = {};
    targetEntity.hull = targetEntity.hullMax * Number(scenario.target.hullFraction || 0.8);
    targetEntity.shield = Number(scenario.target.shield) || 0;
    state.combat.entities[String(OWNER_ID)] = { statuses: {}, capabilities: {} };
    state.combat.entities[String(TARGET_ID)] = { statuses: {}, capabilities: {} };
    state.entities.set(OWNER_ID, ownerEntity);
    state.entities.set(TARGET_ID, targetEntity);
    state.entityList = [ownerEntity, targetEntity];
  }

  function select(id, options = {}) {
    if (disposed) throw new Error('Combat-feel bench is disposed');
    const nextScenario = scenarioById(id);
    if (!nextScenario) throw new Error(`Unknown combat-feel scenario ${id}`);
    scenario = nextScenario;
    if (options.seed != null) seed = Number(options.seed) >>> 0;
    selected = scenario.id;
    frame = 0;
    time = 0;
    state.simTime = 0;
    state.tick = 0;
    resetEvidence();
    contactLog = [];
    firstContact = null;
    firstHullContact = null;
    hullContactLocal = null;
    hullContactNormalLocal = null;
    tumble = null;
    tumbleLaw = null;
    ventingRemaining = 0;
    ventingNextAt = Infinity;
    lightPeakMax = 0;
    reactionPeak = { energy: 0, atS: null, tumbleActive: false };
    resetHulls();
    resetEntities();
    resetShield();
    microMotion = createShipMicroMotionTracker();
    if (weaponSequence) weaponSequence.dispose();
    weaponSequence = createWeaponSequence({
      scene,
      camera,
      state,
      ownerMesh: ownerRoot,
      targetMesh: targetRoot,
      ownerEntity,
      targetEntity,
      viewportHeight: globalThis.innerHeight,
      seed,
      onImpact: handleWeaponImpact,
      onFire: ({ weapon }) => {
        microMotion.onFire({ ownerId: OWNER_ID, weaponId: weapon.id, hardpointIdx: 0 });
      },
    });
    shotPlan = [];
    for (let index = 0; index < scenario.shots.length; index += 1) {
      const shot = scenario.shots[index];
      const weapon = weaponForShot(scenario, index);
      if (!weapon) throw new Error(`${scenario.id}: missing weapon row for shot ${index}`);
      const timing = weaponSequence.arm({
        weaponId: weapon.id,
        contact: shot.contact,
        fireAt: shot.fireAt,
        releaseAfterSeconds: shot.releaseAfterSeconds,
      });
      shotPlan.push({ ...timing, contact: shot.contact });
    }
    if (!shotPlan.length) throw new Error(`${scenario.id}: no shots armed`);
    beatPlan = buildBeatTimes(scenario, shotPlan);
    // Warm the presentation transforms so the first sampled frame is already on the arena.
    updatePresentation(0);
    renderFrame();
    return inspect();
  }

  function startTumble({ shot, point, atS }) {
    if (!scenario.tumble || tumble) return;
    const law = resolveHitstunLaw({
      deltaV: (Number(shot.weapon.impulsePerHit) || 0) / Math.max(1, targetEntity.mass),
      victimCruise: FIXED_ARENA.targetCruise,
      attackerMass: ownerEntity.mass,
      victimMass: targetEntity.mass,
      shove: scenario.tumble.shove === true,
    });
    tumbleLaw = { ...law };
    if (!(law.durationS > 0) || !(law.entrySpin > 0)) return;
    const direction = signedHitSide(
      targetEntity,
      { x: shot.axis.x, z: shot.axis.z },
      { pos: point },
      targetEntity.id,
    );
    const startedAt = roundTime(atS);
    const until = roundTime(startedAt + law.durationS);
    state.combat.entities[String(TARGET_ID)].statuses.status_tumbling = {
      id: 'status_tumbling',
      data: {
        kind: 'weapon_tumble',
        startedAt,
        until,
        cause: 'weapon',
        source: 'weapon',
        spin: law.entrySpin,
        u: law.u,
        k: law.k,
        mF: law.mF,
        shoveBeatS: law.shoveBeatS,
        chainCount: 0,
      },
    };
    tumble = {
      active: true,
      startedAt,
      until,
      spin: law.entrySpin,
      dir: direction,
      baseRot: targetEntity.rot,
      yaw: 0,
      law: { ...law },
    };
    targetEntity.data.tumbledAt = startedAt;
    targetEntity.data.recoveringUntil = until + 0.9;
  }

  function handleWeaponImpact({ shot, weapon, contact, point, normal, approach, damage, atS }) {
    firstContact = firstContact || { kind: contact, atS, point: { ...point } };
    contactLog.push({ kind: contact, atS, point: { ...point }, weaponId: shot.weaponId, damage });
    markEvidence('contact', atS);
    if (contact === 'shield') {
      const before = Number(targetEntity.shield) || 0;
      const after = scenario.id === 'shield-contact'
        ? Math.max(0, before - 64)
        : 0;
      targetEntity.shield = after;
      microMotion.onDamage({
        targetId: TARGET_ID,
        weaponId: shot.weaponId,
        damageType: weapon.damageType,
        amount: damage,
        shieldHit: true,
        hullHit: false,
        approach,
        normal,
        pos: point,
        origin: { kind: 'weapon' },
      });
      if (before > 0 && after <= 0 && weaponSequence && weaponSequence.presenter) {
        weaponSequence.presenter.quarks.spawnShieldBreak(point.x, 0.55, point.z, 24);
      }
      return;
    }
    targetEntity.shield = 0;
    targetEntity.hull = Math.max(0, targetEntity.hull - Number(damage || 0));
    microMotion.onDamage({
      targetId: TARGET_ID,
      weaponId: shot.weaponId,
      damageType: weapon.damageType,
      hullDamage: damage,
      amount: damage,
      hullHit: true,
      shieldHit: false,
      approach,
      normal,
      pos: point,
      origin: { kind: 'weapon' },
    });
    if (firstHullContact == null) {
      firstHullContact = atS;
      // Retain the breach in the hull's local frame so scheduled venting follows the tumble
      // instead of hanging at the pre-hit world point.
      targetHull.updateWorldMatrix(true, false);
      const localPoint = new THREE.Vector3(point.x, point.y, point.z);
      targetHull.worldToLocal(localPoint);
      const localNormal = new THREE.Vector3(normal.x, normal.y, normal.z);
      const inverse = new THREE.Quaternion();
      targetHull.getWorldQuaternion(inverse).invert();
      localNormal.applyQuaternion(inverse);
      hullContactLocal = { x: localPoint.x, y: localPoint.y, z: localPoint.z };
      hullContactNormalLocal = { x: localNormal.x, y: localNormal.y, z: localNormal.z };
      if (scenario.venting) {
        ventingRemaining = Math.max(0, Number(scenario.venting.repeats) || 0);
        ventingNextAt = roundTime(firstHullContact + (Number(scenario.venting.fromContactS) || 0));
      }
    }
    if (scenario.tumble && !tumble) {
      startTumble({ shot, point, atS });
    }
  }

  function updateTumble(now) {
    if (!tumble || !tumble.active) return;
    if (now >= tumble.until - 1e-9) {
      tumble.active = false;
      targetEntity.angVel = 0;
      delete state.combat.entities[String(TARGET_ID)].statuses.status_tumbling;
      return;
    }
    const age = Math.max(0, now - tumble.startedAt);
    const spin = tumble.spin * Math.exp(-0.05 * age);
    tumble.yaw += spin * STEP_SECONDS;
    targetEntity.rot = tumble.baseRot + tumble.dir * tumble.yaw;
    targetEntity.angVel = tumble.dir * spin;
    targetRoot.rotation.y = -targetEntity.rot;
  }

  function updateVenting(now) {
    if (!scenario.venting || firstHullContact == null || ventingRemaining <= 0) return;
    if (!hullContactLocal || !hullContactNormalLocal) return;
    if (now + 1e-9 < ventingNextAt) return;
    const index = (Number(scenario.venting.repeats) || 0) - ventingRemaining;
    const random = makeRandom(seed + index * 977 + 13);
    const jitterX = (random() - 0.5) * targetEntity.radius * 0.5;
    const jitterY = (random() - 0.5) * 1.2;
    const jitterZ = (random() - 0.5) * targetEntity.radius * 0.5;
    targetHull.updateWorldMatrix(true, false);
    const worldPoint = new THREE.Vector3(hullContactLocal.x, hullContactLocal.y, hullContactLocal.z);
    targetHull.localToWorld(worldPoint);
    const worldNormal = new THREE.Vector3(
      hullContactNormalLocal.x,
      hullContactNormalLocal.y,
      hullContactNormalLocal.z,
    );
    const quaternion = new THREE.Quaternion();
    targetHull.getWorldQuaternion(quaternion);
    worldNormal.applyQuaternion(quaternion).normalize();
    weaponSequence.presenter.quarks.spawnDamageVenting(
      worldPoint.x + jitterX,
      worldPoint.y + jitterY,
      worldPoint.z + jitterZ,
      worldNormal.x,
      0.30,
      worldNormal.z,
      Math.max(1, Number(scenario.venting.count) || 3),
    );
    ventingRemaining -= 1;
    ventingNextAt = roundTime(ventingNextAt + Math.max(0.05, Number(scenario.venting.everyS) || 0.2));
  }

  function microMotionOptions() {
    return {
      motionReduce: false,
      flashReduce: false,
      playerId: OWNER_ID,
      playerTargetId: TARGET_ID,
      entities: state.entities,
      tetherActive: false,
      tetherTargetId: null,
      tetherLoad: 0,
      tetherPhase: '',
    };
  }

  function resetHullPoseForMicroMotion(entity, hull) {
    // The live renderer re-applies the flight bank/pitch pose before the render-phase
    // micro-motion owner runs, then the owner adds its channels. Without this reset the owner's
    // ADDITIVE hull.rotation.x/z writes integrate every frame (a single hit would slowly roll the
    // hull upside down). `hull.rotation.y` is absolute in the owner; position is absolute too.
    hull.rotation.x = Number(entity.bank) || 0;
    hull.rotation.z = Number(entity.pitch) || 0;
    hull.rotation.y = 0;
    hull.position.set(0, 0, 0);
  }

  function updatePresentation(dt) {
    state.simTime = time;
    state.tick = frame;
    updateTumble(time);
    updateShipPitchPresentation(state, dt);
    const options = microMotionOptions();
    resetHullPoseForMicroMotion(ownerEntity, ownerHull);
    microMotion.updateCraftMicroMotion(ownerEntity, ownerRoot, time, dt, options);
    resetHullPoseForMicroMotion(targetEntity, targetHull);
    microMotion.updateCraftMicroMotion(targetEntity, targetRoot, time, dt, options);
    updateEntityShieldBubblePresentation(
      targetEntity,
      targetShieldBubble,
      time,
      time,
      false,
      dt,
    );
    updateVenting(time);
  }

  function reactionSnapshot() {
    const record = microMotion.peekRecord(TARGET_ID) || {};
    const energy = Math.abs(Number(record.flinchRoll) || 0)
      + Math.abs(Number(record.flinchPitch) || 0)
      + Math.abs(Number(record.impactYaw) || 0)
      + Math.abs(Number(record.flinchShudder) || 0)
      + Math.abs(Number(record.yieldAmt) || 0);
    return {
      flinchRoll: roundTime(Number(record.flinchRoll) || 0),
      flinchPitch: roundTime(Number(record.flinchPitch) || 0),
      impactYaw: roundTime(Number(record.impactYaw) || 0),
      flinchShudder: roundTime(Number(record.flinchShudder) || 0),
      yieldAmt: roundTime(Number(record.yieldAmt) || 0),
      energy: roundTime(energy),
      bank: roundTime(Number(targetEntity.bank) || 0),
      pitch: roundTime(Number(targetEntity.pitch) || 0),
      rootYaw: roundTime(Number(targetEntity.rot) || 0),
      tumbleActive: !!(tumble && tumble.active),
      tumbleRemaining: tumble && tumble.active ? roundTime(Math.max(0, tumble.until - time)) : 0,
      tumbleYaw: tumble ? roundTime(tumble.yaw) : 0,
      tumbleBaseRot: tumble ? roundTime(tumble.baseRot) : null,
      tumbleDir: tumble ? tumble.dir : null,
      tumbleLaw: tumbleLaw ? {
        durationS: tumbleLaw.durationS,
        entrySpin: tumbleLaw.entrySpin,
        u: tumbleLaw.u,
        k: tumbleLaw.k,
        mF: tumbleLaw.mF,
        shoveBeatS: tumbleLaw.shoveBeatS,
      } : null,
    };
  }

  function updateEvidence(now) {
    const counts = weaponSequence.inspect().counts;
    lightPeakMax = Math.max(lightPeakMax, Number(counts.lightPeak) || 0);
    if (counts.muzzle > 0) markEvidence('muzzle', now);
    if (counts.travel > 0) markEvidence('travel', now);
    // A muzzle flash is not the hit. The contact-light beat only counts after a real contact
    // (hull OR shield); a shield bubble answers with its own light even without hull damage.
    if (firstContact != null && counts.lights > 0) markEvidence('light', now);
    const reaction = reactionSnapshot();
    if (reaction.energy > reactionPeak.energy) {
      reactionPeak = { energy: reaction.energy, atS: roundTime(now), tumbleActive: reaction.tumbleActive };
    }
    if (reaction.energy > 0.012 || reaction.tumbleActive) markEvidence('reaction', now);
    if (counts.impactSpall + counts.shieldShards + counts.damageVenting + counts.shrapnel > 0) {
      markEvidence('debris', now);
    }
    if (firstHullContact != null && now >= firstHullContact + 0.55) {
      if (counts.scorches > 0 || counts.damageVenting > 0 || counts.particles > 0) {
        markEvidence('cooling', now);
      }
    }
    if (firstHullContact != null && now >= firstHullContact + 1.35) {
      const stillWorking = counts.travel > 0 || counts.lights > 0;
      // Settled AND visibly damaged: a quiet empty frame is not an aftermath.
      const visibleDamage = counts.scorches > 0 || counts.damageVenting > 0 || counts.particles > 0;
      if (!stillWorking && reaction.energy < 0.02 && !reaction.tumbleActive && visibleDamage) {
        markEvidence('aftermath', now);
      }
    }
  }

  // Frame-local evidence. The cumulative `evidence` map answers "did this ever happen"; a beat
  // frame must answer "is it on this frame". A muzzle flash does not prove a contact light, and
  // an earlier debris puff does not prove a cooling beat.
  function evidenceSnapshot(now) {
    const counts = weaponSequence ? weaponSequence.inspect().counts : {};
    const reaction = reactionSnapshot();
    const visibleDebris = (Number(counts.impactSpall) || 0)
      + (Number(counts.shieldShards) || 0)
      + (Number(counts.damageVenting) || 0)
      + (Number(counts.shrapnel) || 0) > 0;
    const visibleDamage = (Number(counts.scorches) || 0) > 0
      || (Number(counts.damageVenting) || 0) > 0
      || (Number(counts.particles) || 0) > 0;
    return {
      muzzle: (Number(counts.muzzle) || 0) > 0,
      travel: (Number(counts.travel) || 0) > 0,
      contact: firstContact != null,
      light: firstContact != null && (Number(counts.lights) || 0) > 0,
      reaction: reaction.energy > 0.012 || reaction.tumbleActive,
      tumble: !!reaction.tumbleActive,
      debris: visibleDebris,
      cooling: firstHullContact != null && now >= firstHullContact + 0.55 && visibleDamage,
      aftermath: firstHullContact != null && now >= firstHullContact + 1.35
        && visibleDamage && !reaction.tumbleActive,
    };
  }

  function advanceOneFrame() {
    frame += 1;
    time = roundTime(frame * STEP_SECONDS);
    state.simTime = time;
    state.tick = frame;
    weaponSequence.advance(time);
    updatePresentation(STEP_SECONDS);
    weaponSequence.present(STEP_SECONDS);
    updateEvidence(time);
  }

  function sample(targetTime) {
    if (disposed) throw new Error('Combat-feel bench is disposed');
    const targetFrame = Math.max(0, frameForTime(targetTime));
    if (targetFrame < frame) {
      select(selected || scenario.id, { seed });
    }
    while (frame < targetFrame) advanceOneFrame();
    renderFrame();
    return inspect();
  }

  function renderFrame() {
    renderer.info.reset();
    bloom.attachDistortionProducers(
      weaponSequence && weaponSequence.presenter ? weaponSequence.presenter.distortionProducers : null,
    );
    bloom.render(scene, camera);
    lastRender = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      programs: renderer.info.programs ? renderer.info.programs.length : null,
    };
    return lastRender;
  }

  function requiredChecks() {
    const sequence = weaponSequence ? weaponSequence.inspect() : { counts: {} };
    const reaction = reactionSnapshot();
    const checks = [];
    const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });
    add('assets-loaded', ownerAsset.primitiveCount > 0 && targetAsset.primitiveCount > 0,
      `owner ${ownerAsset.primitiveCount} primitives / target ${targetAsset.primitiveCount} primitives`);
    add('catalog-valid', catalogSummary(seed).errors.length === 0, 'catalog constants validated');
    add('shots-armed', shotPlan.length === scenario.shots.length,
      `${shotPlan.length} authored shot(s) armed`);
    for (const name of scenario.requiredEvidence) {
      const detail = name === 'reaction'
        ? `peak energy ${reactionPeak.energy} at ${reactionPeak.atS}s / tumble ${reactionPeak.tumbleActive}`
        : name === 'light'
          ? `light evidence ${evidence[name] && evidence[name].seen ? `seen at ${evidence[name].atS}s` : 'not seen'} / peak ${roundTime(lightPeakMax)}`
          : `${name} evidence ${evidence[name] && evidence[name].seen ? `seen at ${evidence[name].atS}s` : 'not seen'}`;
      add(`${name}-seen`, evidence[name] && evidence[name].seen, detail);
    }
    if (scenario.tumble) {
      add('tumble-law', !!(tumbleLaw && tumbleLaw.durationS > 0 && tumbleLaw.entrySpin > 0),
        tumbleLaw ? `duration ${tumbleLaw.durationS}s / entry spin ${tumbleLaw.entrySpin} rad/s`
          : 'production hitstun law produced no tumble');
      add('tumble-yaw', !!(tumble && Math.abs(tumble.yaw) > 0.2),
        tumble ? `${roundTime(tumble.yaw)} rad integrated from the production entry spin` : 'no root yaw');
    }
    add('render-draws', lastRender.calls > 0 && lastRender.triangles > 0,
      `${lastRender.calls} calls / ${lastRender.triangles} triangles`);
    add('no-errors', errors.length === 0, errors.length ? `${errors.length} recorded error(s)` : 'clean');
    return checks;
  }

  function inspect() {
    const sequence = weaponSequence ? weaponSequence.inspect() : { counts: {}, shots: [], stage: 'idle' };
    const reaction = reactionSnapshot();
    const checks = requiredChecks();
    const transformOf = (root, hull) => ({
      root: {
        position: { x: roundTime(root.position.x), y: roundTime(root.position.y), z: roundTime(root.position.z) },
        rotation: { x: roundTime(root.rotation.x), y: roundTime(root.rotation.y), z: roundTime(root.rotation.z) },
        scale: { x: roundTime(root.scale.x), y: roundTime(root.scale.y), z: roundTime(root.scale.z) },
      },
      hull: {
        position: { x: roundTime(hull.position.x), y: roundTime(hull.position.y), z: roundTime(hull.position.z) },
        rotation: { x: roundTime(hull.rotation.x), y: roundTime(hull.rotation.y), z: roundTime(hull.rotation.z) },
        scale: { x: roundTime(hull.scale.x), y: roundTime(hull.scale.y), z: roundTime(hull.scale.z) },
      },
    });
    const targetAssetInfo = {
      url: targetUrl,
      route: assetRoute,
      pilot: renderPackagePilotForSourceUrl(targetUrl),
      ...targetAsset,
      radius: targetEntity.radius,
    };
    const ownerAssetInfo = {
      url: ownerUrl,
      route: assetRoute,
      pilot: renderPackagePilotForSourceUrl(ownerUrl),
      ...ownerAsset,
      radius: ownerEntity.radius,
    };
    const evidenceBooleans = Object.fromEntries(ALL_EVIDENCE.map((name) => [name, !!(evidence[name] && evidence[name].seen)]));
    const evidenceTimes = Object.fromEntries(ALL_EVIDENCE.map((name) => [name, evidence[name] ? evidence[name].atS : null]));
    return {
      ready: true,
      catalogVersion: CATALOG_VERSION,
      scenario: scenario.id,
      label: scenario.label,
      seed,
      frame,
      time: roundTime(time),
      fps: 60,
      durationSeconds: scenario.durationSeconds,
      beatPlan: beatPlan.map((beat) => ({ ...beat })),
      shotPlan: shotPlan.map((shot) => ({
        weaponId: shot.weaponId,
        contact: shot.contact,
        fireAt: shot.fireAt,
        contactAt: shot.contactAt,
        releaseAt: shot.releaseAt,
        travelSeconds: shot.travelSeconds,
        flightFrames: shot.flightFrames,
        distanceWu: shot.distanceWu,
        beam: shot.beam,
        socketMode: shot.socketMode,
      })),
      camera: { ...cameraState, view },
      scene: { stage: sequence.stage, shots: sequence.shots, counts: sequence.counts },
      contact: firstContact,
      contactLog: contactLog.map((entry) => ({ ...entry })),
      reaction,
      reactionPeak: { ...reactionPeak },
      lightPeakMax: roundTime(lightPeakMax),
      transforms: {
        owner: transformOf(ownerRoot, ownerHull),
        target: transformOf(targetRoot, targetHull),
      },
      evidence: evidenceBooleans,
      evidenceAt: evidenceTimes,
      evidenceNow: evidenceSnapshot(time),
      checks,
      requiredEvidence: scenario.requiredEvidence.slice(),
      assets: { owner: ownerAssetInfo, target: targetAssetInfo },
      owners: { ...OWNERS },
      render: { ...lastRender, pixelRatio: renderer.getPixelRatio(), width: renderer.domElement.width, height: renderer.domElement.height },
      errors: errors.map((error) => ({ ...error })),
      boundary: {
        simMounted: false,
        note: 'Presentation bench: the harness feeds production-shaped fire/hit/tumble receipts. '
          + 'Weapons/damage/tumbleStates/physics/renderer.js are not mounted.',
      },
    };
  }

  function configure(options = {}) {
    if (options.seed != null) seed = Number(options.seed) >>> 0;
    if (options.view != null) {
      if (!VIEWS.includes(options.view)) throw new Error(`Unknown view ${options.view}`);
      view = options.view;
    }
    cameraState = applyCamera();
    const width = globalThis.innerWidth;
    const height = globalThis.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    bloom.setSize(width, height);
    return select(selected || scenario.id, { seed });
  }

  function resize() {
    const width = globalThis.innerWidth;
    const height = globalThis.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    bloom.setSize(width, height);
    if (weaponSequence) {
      // The weapon presenter reads viewportHeight per frame; a resize only needs a redraw at the
      // already-sampled deterministic time.
      renderFrame();
    }
  }

  globalThis.addEventListener('resize', resize);

  // Fire the first scenario once the assets are live. This is the startup smoke test: if the
  // production presenter or authored socket cannot arm a shot, boot rejects loudly.
  select(SCENARIOS[0].id, { seed });
  if (!weaponSequence.inspect().shots.length) throw new Error('Startup armed zero weapon shots');

  const bench = {
    get ready() { return true; },
    get catalog() { return catalogSummary(seed); },
    get errors() { return errors.map((error) => ({ ...error })); },
    select,
    configure,
    sample,
    draw: renderFrame,
    capture: () => canvas.toDataURL('image/png'),
    inspect,
    pause: () => {},
    resume: () => {},
    dispose: () => {
      if (disposed) return;
      disposed = true;
      globalThis.removeEventListener('resize', resize);
      weaponSequence?.dispose();
      bloom.dispose?.();
      renderer.dispose();
    },
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get state() { return state; },
    get weaponSequence() { return weaponSequence; },
    get microMotion() { return microMotion; },
  };
  if (statusElement) statusElement.textContent = 'Ready · fixed arena · production presenters';
  return bench;
}
