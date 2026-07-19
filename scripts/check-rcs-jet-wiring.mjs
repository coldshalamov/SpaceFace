// Integration gate for the signed-actuator -> production RCS seam.
//
// The pure resolver has its own exhaustive mapping test. This checker invokes the shipped VFX
// adapter and proves that truthful flight telemetry reaches the pooled directional impulse system
// without reintroducing particle-puff RCS or disabling useful feedback under reduced motion.

import assert from 'node:assert/strict';

import { vfx } from '../src/render/vfx.js';
import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { resolveActuatorScale, resolveRcsFirings } from '../src/render/rcsJets.js';

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
    _rcsOrigins: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
    _rcsAxes: [[1, 0, 0], [-1, 0, 0], [1, 0, 0], [-1, 0, 0]],
    _spawnLocalXZ: { x: 0, z: 0 },
    _productionRcsFirings: [],
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

console.log(`\nAll ${checks} RCS production wiring checks PASSED.`);
