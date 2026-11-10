import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList, getDerivedStats, outfitBudgetForFittings } from '../src/systems/ships.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';

const hull = SHIPS.find(row => row.id === 'ship_kestrel');
const slots = buildSlotList(hull);
const engineSlot = slots.findIndex(slot => slot.type === 'engine');
function fitted(id, cargoMass = 0) {
  const fittings = slots.map(() => null); fittings[engineSlot] = id;
  return { fittings, derived: getDerivedStats(hull.id, fittings, { cargo: { usedMass: cargoMass } }) };
}
function fly(profile, seconds, travel = false) {
  const dt = 1 / 60, body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, angVel: 0, mass: 26, inertia: 104 };
  let runtime = createPropulsionRuntime(profile);
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) {
    const input = { moveZ: 1, moveX: 0, turnIntent: 0, boost: false, brake: false,
      travelDrive: travel ? { state: 'engaged', cap: profile.travelCeiling, ceiling: profile.travelCeiling } : undefined };
    const result = stepPropulsion({ dt, body, input, profile, runtime, environment: {} });
    runtime = result.runtime;
    body.vel.x += result.force.x / body.mass * dt;
    body.vel.z += result.force.z / body.mass * dt;
    body.pos.x += body.vel.x * dt; body.pos.z += body.vel.z * dt;
  }
  return Math.hypot(body.pos.x, body.pos.z);
}

test('both sidegrades fit the starter engine bay and are ordinary purchasable drive-tuning modules', () => {
  assert.ok(engineSlot >= 0);
  for (const id of ['mod_engine_sprint_m', 'mod_engine_endurance_m']) {
    const mod = MODULES.find(row => row.id === id);
    assert.equal(mod.requiresTech, 'tech_drive_tuning'); assert.ok(mod.price > 0);
    assert.notEqual(mod.purchasable, false);
    assert.equal(outfitBudgetForFittings(hull, fitted(id).fittings).fits, true);
    assert.ok(mod.sentence.length > 20, 'outfitting describes the actual trade');
  }
});

test('Sprint buys acceleration and Endurance buys travel speed without buying steering authority', () => {
  const sprint = fitted('mod_engine_sprint_m').derived;
  const endurance = fitted('mod_engine_endurance_m').derived;
  const fusion = fitted('mod_engine_fusion_m').derived;
  assert.ok(sprint.propulsion.mainAccel > fusion.propulsion.mainAccel);
  assert.ok(endurance.propulsion.mainAccel < fusion.propulsion.mainAccel);
  assert.ok(sprint.propulsion.travelCeiling < fusion.propulsion.travelCeiling);
  assert.ok(endurance.propulsion.travelCeiling > fusion.propulsion.travelCeiling);
  assert.ok(sprint.continuousDrain > fusion.continuousDrain);
  assert.ok(endurance.continuousDrain < fusion.continuousDrain);
  for (const key of ['yawAccel', 'yawBrake', 'strafeAccel', 'reverseAccel', 'maxYawRate', 'combatSpeed']) {
    assert.equal(sprint.propulsion[key], endurance.propulsion[key], key);
  }
});

test('the live propulsion kernel gives Sprint the launch and Endurance the long straight', () => {
  const sprint = fitted('mod_engine_sprint_m').derived.propulsion;
  const endurance = fitted('mod_engine_endurance_m').derived.propulsion;
  assert.ok(fly(sprint, 0.25) > fly(endurance, 0.25) * 1.2);
  const previous = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.travelBurn = true;
  try {
    const long = fly(endurance, 20, true), short = fly(sprint, 20, true);
    assert.ok(long > short * 1.1, `Endurance ${long.toFixed(0)} wu, Sprint ${short.toFixed(0)} wu`);
  } finally { TRAVEL_FLAGS.travelBurn = previous; }
});

test('loaded cargo still costs acceleration for both drives without changing their chosen travel ceiling', () => {
  for (const id of ['mod_engine_sprint_m', 'mod_engine_endurance_m']) {
    const empty = fitted(id).derived.propulsion, laden = fitted(id, 80).derived.propulsion;
    assert.ok(laden.mainAccel < empty.mainAccel);
    assert.equal(laden.travelCeiling, empty.travelCeiling);
  }
});
