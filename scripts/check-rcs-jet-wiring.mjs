// Integration gate for the signed-actuator -> production RCS seam.
//
// The pure resolver has its own exhaustive mapping test. This checker invokes the shipped VFX
// adapter and proves that truthful flight telemetry reaches the pooled directional impulse system
// without reintroducing particle-puff RCS or disabling useful feedback under reduced motion.

import assert from 'node:assert/strict';
import * as THREE from 'three';

import { vfx } from '../src/render/vfx.js';
import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { resolveActuatorScale, resolveRcsFirings } from '../src/render/rcsJets.js';
import { resolveAccessibilityPresentation } from '../src/render/thruster/systems/accessibility.js';
import { KESTREL_MAIN_PLUME_RECIPE } from '../src/render/thruster/recipes/kestrelRecipes.js';

const DT = 1 / 60;
let checks = 0;
const pass = (message) => { checks++; console.log(`  ok  ${message}`); };

function actuatorsFrom(input, bodyOverrides = {}) {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const body = {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 20,
    inertia: 40,
    radius: 6,
    ...bodyOverrides,
  };
  const result = stepPropulsion({
    dt: DT,
    body,
    input,
    profile,
    runtime: createPropulsionRuntime(profile),
  });
  return computeFlightTelemetry({ body, profile, control: { telemetry: result.telemetry } }).actuators;
}

function shipAt(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    flags: {},
    data: { defId: 'ship_kestrel' },
    _flightFrame: { driveId: 'drive_reaction_m' },
    ...overrides,
  };
}

function harness(actuators, entity = shipAt()) {
  const fires = [];
  const updates = [];
  let particleSpawns = 0;
  const rcsSystem = {
    pool: { activeImpulseCount: 0 },
    fire(origin, axis, strength) {
      fires.push({ origin: [...origin], axis: [...axis], strength });
    },
    update(dt, a11y) { updates.push({ dt, a11y: { ...a11y } }); },
  };
  const ctx = Object.create(vfx);
  const defaultScale = resolveActuatorScale(null);
  const scaleCache = new Map([
    ['drive_reaction_m', resolveActuatorScale(PROPULSION_PROFILES.drive_reaction_m)],
  ]);
  const productionRcsFirings = [];
  Object.defineProperty(productionRcsFirings, '__rcsRecords', {
    value: [{}, {}, {}, {}],
    configurable: true,
  });
  Object.assign(ctx, {
    state: {
      playerId: entity.id,
      entities: new Map([[entity.id, entity]]),
      input: {},
      settings: { video: { engineTrails: true } },
      flightRuntime: { telemetry: { actuators } },
    },
    _energy: { rcsSystem, rcsCooldown: 0, plumeDrive: 0, boostBlend: 0 },
    _driveScratch: { drive: 0, throttle: 0, speed: 0, speedDrive: 0, boost: 0 },
    _mainDriveDemandScratch: { main: 0, reverse: 0, retroOnly: false },
    _rcsPoseScratch: { x: 0, z: 0, rot: 0, radius: 6 },
    _rcsDefaultScale: defaultScale,
    _rcsScaleCache: scaleCache,
    _rcsOrigins: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
    _rcsAxes: [[1, 0, 0], [-1, 0, 0], [1, 0, 0], [-1, 0, 0]],
    _socketWorldPos: new THREE.Vector3(),
    _socketWorldQuat: new THREE.Quaternion(),
    _socketWorldScale: new THREE.Vector3(),
    _socketForward: new THREE.Vector3(),
    _entityLocalXZ: { x: 0, z: 0 },
    _frameMembrane: null,
    _spawnLocalXZ: { x: 0, z: 0 },
    _productionRcsFirings: productionRcsFirings,
    _toLocalXZ(x, z, out) { out.x = x; out.z = z; return out; },
    _spawnParticle() { particleSpawns++; },
  });
  return { ctx, fires, updates, particleSpawns: () => particleSpawns };
}

function expectedFirings(actuators, entity) {
  return resolveRcsFirings(
    actuators,
    { x: entity.pos.x, z: entity.pos.z, rot: entity.rot, radius: entity.radius },
    resolveActuatorScale(PROPULSION_PROFILES.drive_reaction_m),
  );
}

function assertProductionBinding(input, bodyOverrides = {}) {
  const entity = shipAt(bodyOverrides);
  const actuators = actuatorsFrom(input, bodyOverrides);
  const expected = expectedFirings(actuators, entity);
  const h = harness(actuators, entity);
  h.ctx._updateProductionRcs(entity, DT, {
    reducedMotion: false,
    reducedFlash: false,
    lowQuality: false,
    qualityTier: 'high',
  });
  assert.equal(h.fires.length, expected.length, 'production pool must receive every resolved nozzle');
  for (let i = 0; i < expected.length; i++) {
    const actual = h.fires[i];
    const want = expected[i];
    assert.ok(Math.abs(actual.origin[0] - want.x) < 1e-9);
    assert.ok(Math.abs(actual.origin[2] - want.z) < 1e-9);
    assert.ok(Math.abs(actual.axis[0] - want.dirX) < 1e-9);
    assert.ok(Math.abs(actual.axis[2] - want.dirZ) < 1e-9);
    assert.ok(Math.abs(actual.strength - want.intensity) < 1e-9);
  }
  assert.equal(h.particleSpawns(), 0, 'production RCS must not fall back to particle puffs');
  assert.equal(h.updates.length, 1, 'the production pool lifecycle must advance');
  return { h, actuators, expected };
}

console.log('RCS production wiring — signed actuator truth into pooled directional impulses\n');

assertProductionBinding({ turn: 1 });
assertProductionBinding({ turn: -1 });
pass('yaw in both directions reaches the correct bow/stern production impulses');

assertProductionBinding({ strafe: 1 });
assertProductionBinding({ brake: true }, { vel: { x: 40, z: 0 } });
pass('strafe and braking reach their distinct production nozzles');

assertProductionBinding({ turn: 0 }, { angVel: 2.4 });
assertProductionBinding({ throttle: 1 }, { vel: { x: 10, z: 30 } });
pass('assist and counter-torque RCS remain visible without corresponding input keys');

{
  const entity = shipAt();
  const actuators = actuatorsFrom({ turn: 1 });
  const h = harness(actuators, entity);
  const reduced = { reducedMotion: true, reducedFlash: true, lowQuality: false, qualityTier: 'high' };
  h.ctx._updateProductionRcs(entity, DT, reduced);
  assert.ok(h.fires.length > 0, 'reduced motion must retain useful directional RCS feedback');
  assert.equal(h.updates[0].a11y.reducedMotion, true);
  assert.equal(h.updates[0].a11y.reducedFlash, true);
  assert.equal(h.ctx._energy.rcsCooldown, 0.18, 'reduced motion lowers event cadence instead of disabling RCS');
  pass('accessibility preserves feedback while reducing cadence and flash');
}

{
  const entity = shipAt({ vel: { x: 40, z: 0 }, maxSpeed: 120 });
  const braking = actuatorsFrom({ brake: true }, { vel: { x: 40, z: 0 } });
  const truthful = harness(braking, entity);
  const brakingDrive = truthful.ctx._engineDriveFor(entity).drive;

  const blind = harness(null, entity);
  blind.ctx.state.flightRuntime = null;
  const speedOnlyDrive = blind.ctx._engineDriveFor(entity).drive;
  assert.ok(brakingDrive < speedOnlyDrive, 'retro-only truth must cool the main nozzle');

  const thrusting = harness(actuatorsFrom({ throttle: 1 }), shipAt({ maxSpeed: 120 }));
  assert.ok(thrusting.ctx._engineDriveFor(thrusting.ctx.state.entities.get(1)).drive > 0.2);
  pass('the main plume follows authoritative drive demand and cools during retro-only braking');
}

{
  const entity = shipAt();
  const actuators = actuatorsFrom({ turn: 0 }, { angVel: 2.4 });
  const h = harness(actuators, entity);
  assert.equal(h.ctx._energyPlumeRelevant(), true,
    'coasting assist RCS must wake the production energy subsystem even with the main drive idle');
  const npc = { ...entity, id: 2 };
  assert.equal(h.ctx._actuatorsFor(npc), null,
    'render must not re-simulate NPC flight telemetry to manufacture actuator data');
  pass('coasting RCS wakes the pool, while NPC render-time physics recomputation stays absent');
}

{
  const entity = shipAt();
  const root = new THREE.Group();
  root.userData.authoredAssetState = 'loading';
  const traverse = root.traverse.bind(root);
  let traversals = 0;
  root.traverse = (fn) => { traversals++; return traverse(fn); };
  entity.view = { root };
  const h = harness(null, entity);
  assert.deepEqual(h.ctx._trailSocketObjects(entity), [], 'loading boundary begins without a socket');
  const stableEmptyCache = entity.view.__vfxTrailSockets;
  assert.deepEqual(h.ctx._trailSocketObjects(entity), []);
  assert.equal(entity.view.__vfxTrailSockets, stableEmptyCache,
    'a stable empty boundary must not be traversed again every frame');
  assert.equal(traversals, 1);
  assert.equal(h.ctx._rcsSocketObjects(entity).port, null);

  const trail = new THREE.Object3D();
  trail.name = 'SOCKET_Trail_Main';
  trail.userData = { spacefaceSocket: true, forward: [-1, 0, 0] };
  const port = new THREE.Object3D();
  port.name = 'SOCKET_RCS_Port';
  port.userData = { spacefaceSocket: true, forward: [0, 0, -1] };
  root.add(trail, port);
  root.userData.authoredAssetState = 'authored';
  root.userData.authoredCompositionId = 'ship_kestrel_borrowed_time_v3';

  assert.equal(h.ctx._trailSocketObjects(entity)[0], trail,
    'authored promotion must invalidate an empty main-plume socket cache');
  assert.equal(h.ctx._rcsSocketObjects(entity).port, port,
    'authored promotion must invalidate an empty RCS socket cache');

  const replacement = new THREE.Object3D();
  replacement.name = 'SOCKET_Trail_Main';
  replacement.userData = { spacefaceSocket: true, forward: [-1, 0, 0] };
  root.remove(trail);
  root.add(replacement);
  root.userData.authoredCompositionId = 'ship_kestrel_borrowed_time_v3_reconfigured';
  assert.equal(root.children.length, 2, 'precondition: replacement keeps child count stable');
  assert.equal(h.ctx._trailSocketObjects(entity)[0], replacement,
    'composition identity must invalidate a cache even when root and child count stay stable');
  pass('authored promotion invalidates empty propulsion socket caches');
}

{
  const entity = shipAt({ pos: { x: 14, z: -8 } });
  const root = new THREE.Group();
  root.position.set(entity.pos.x, 0, entity.pos.z);
  root.userData.authoredAssetState = 'authored';
  root.userData.authoredCompositionId = 'ship_kestrel_borrowed_time_v3';
  const port = new THREE.Object3D();
  port.name = 'SOCKET_RCS_Port';
  port.position.set(1.6, 0.45, -6.6);
  port.userData = { spacefaceSocket: true, forward: [0, 0, -1] };
  const starboard = new THREE.Object3D();
  starboard.name = 'SOCKET_RCS_Starboard';
  starboard.position.set(1.6, 0.45, 6.6);
  starboard.userData = { spacefaceSocket: true, forward: [0, 0, 1] };
  root.add(port, starboard);
  root.updateMatrixWorld(true);
  entity.view = { root };

  const actuators = actuatorsFrom({ strafe: 1 });
  const h = harness(actuators, entity);
  h.ctx._updateProductionRcs(entity, DT, {
    reducedMotion: false,
    reducedFlash: false,
    lowQuality: false,
    qualityTier: 'high',
  });
  assert.equal(h.fires.length, 1,
    'one authored side nozzle must not receive duplicate bow and stern translation impulses');
  assert.deepEqual(h.fires[0].origin, [15.6, 0.45, -14.6]);
  assert.deepEqual(h.fires[0].axis, [0, 0, -1]);
  pass('production RCS fires from the authored nozzle transform and direction');
}

{
  const entity = shipAt({ pos: { x: 5, z: 7 }, rot: Math.PI / 2 });
  const root = new THREE.Group();
  root.position.set(entity.pos.x, 0, entity.pos.z);
  root.rotation.y = -entity.rot;
  root.userData.authoredAssetState = 'authored';
  root.userData.authoredCompositionId = 'ship_kestrel_borrowed_time_v3';
  for (const [name, z, forwardZ] of [
    ['SOCKET_RCS_Port', -6.6, -1],
    ['SOCKET_RCS_Starboard', 6.6, 1],
  ]) {
    const socket = new THREE.Object3D();
    socket.name = name;
    socket.position.set(1.6, 0.45, z);
    socket.userData = { spacefaceSocket: true, forward: [0, 0, forwardZ] };
    root.add(socket);
  }
  root.updateMatrixWorld(true);
  entity.view = { root };
  const scale = resolveActuatorScale(PROPULSION_PROFILES.drive_reaction_m);
  const blended = {
    lateral: scale.strafe * 0.8,
    yaw: scale.yaw * 0.2,
    reverse: 0,
  };
  const h = harness(blended, entity);
  h.ctx._frameMembrane = { toGlobal(value, out) { out.x = value.x + 100; out.z = value.z - 50; return out; } };
  h.ctx._toLocalXZ = (x, z, out) => { out.x = x - 100; out.z = z + 50; return out; };
  h.ctx._updateProductionRcs(entity, DT, {
    reducedMotion: false,
    reducedFlash: false,
    lowQuality: false,
    qualityTier: 'high',
  });
  assert.equal(h.fires.length, 1,
    'an unequal same-side blend must keep only the stronger authored-nozzle impulse');
  assert.ok(Math.abs(h.fires[0].strength - 1) < 1e-9);
  assert.ok(Math.abs(h.fires[0].axis[0] - 1) < 1e-9 && Math.abs(h.fires[0].axis[2]) < 1e-9,
    'the starboard/port socket exhaust must rotate with the authored root');
  pass('authored RCS survives rotation and floating-origin conversion without duplicate weaker jets');
}

{
  const entity = shipAt({ pos: { x: 3, z: 2 }, vel: { x: 40, z: 0 } });
  const root = new THREE.Group();
  root.position.set(entity.pos.x, 0, entity.pos.z);
  root.userData.authoredAssetState = 'authored';
  root.userData.authoredCompositionId = 'ship_kestrel_borrowed_time_v3';
  for (const [name, z, forwardZ] of [
    ['SOCKET_RCS_Port', -6.6, -1],
    ['SOCKET_RCS_Starboard', 6.6, 1],
  ]) {
    const socket = new THREE.Object3D();
    socket.name = name;
    socket.position.set(1.6, 0.45, z);
    socket.userData = { spacefaceSocket: true, forward: [0, 0, forwardZ] };
    root.add(socket);
  }
  root.updateMatrixWorld(true);
  entity.view = { root };
  const braking = actuatorsFrom({ brake: true }, { vel: { x: 40, z: 0 } });
  const h = harness(braking, entity);
  h.ctx._updateProductionRcs(entity, DT, {
    reducedMotion: false,
    reducedFlash: false,
    lowQuality: false,
    qualityTier: 'high',
  });
  assert.equal(h.fires.length, 2, 'reverse remains a balanced geometric retro pair');
  assert.ok(h.fires.every((entry) => entry.axis[0] > 0.999 && Math.abs(entry.axis[2]) < 1e-9),
    'lateral authored sockets must not redirect longitudinal retro exhaust');
  pass('authored lateral sockets preserve the distinct geometric reverse-jet fallback');
}

{
  const entity = shipAt();
  const h = harness(actuatorsFrom({ turn: 1 }), entity);
  h.ctx.state.settings.video.engineTrails = false;
  assert.equal(h.ctx._productionThrusterEnabled(), true,
    'the trail preference must not erase compact propulsion feedback');
  assert.equal(h.ctx._extendedEngineTrailsEnabled(), false);
  assert.equal(h.ctx._energyPlumeRelevant(), true,
    'compact RCS feedback must still wake the production subsystem');
  h.ctx.state.settings.video.particleQuality = 'high';
  h.ctx.state.settings.accessibility = {};
  h.ctx._productionThrusterA11y = {
    reducedMotion: false,
    reducedFlash: false,
    lowQuality: false,
    qualityTier: 'high',
  };
  h.ctx._productionThrusterOpts = { boost: 0, a11y: h.ctx._productionThrusterA11y };
  h.ctx._productionPlumeSockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  h.ctx._productionPlumeSocketView = h.ctx._productionPlumeSockets;
  h.ctx._writeProductionPlumeSockets = () => 1;
  let capturedA11y = null;
  h.ctx._energy.plumeSystem = {
    update(dt, drive, sockets, opts) {
      capturedA11y = { ...opts.a11y };
      return { drive, boostBlend: opts.boost };
    },
    reset() {},
  };
  h.ctx._updateEnergyPlume(DT);
  assert.equal(capturedA11y.lowQuality, true);
  assert.equal(capturedA11y.qualityTier, 'low');
  const presentation = resolveAccessibilityPresentation(KESTREL_MAIN_PLUME_RECIPE, capturedA11y);
  assert.deepEqual(presentation.roles, ['core', 'inner'],
    'compact preference must retain a bright directional two-layer silhouette');
  pass('disabling extended trails preserves compact main-drive and RCS readability');
}

console.log(`\nAll ${checks} RCS production wiring checks PASSED.`);
