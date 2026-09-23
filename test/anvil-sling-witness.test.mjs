// CR-ANVIL — a hauler is already on the Tethys sling, coasting.
// The well bends that coast. A hull outside the influence does not get the same curve.
import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeField, projectFieldTrajectory } from '../src/core/fields/fieldKernel.js';
import {
  ANVIL_SLING_WITNESS,
  PLANET_SITE,
  anvilSlingWitnessPose,
  classifyPlanetRegion,
} from '../src/data/planets.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';

const PROFILE = { mass: 90, type: 'ship' };
const STEPS = 180;

function wellField(center) {
  return normalizeField({
    id: 'planet_tethys_anvil_pull',
    kind: 'well',
    center,
    radius: PLANET_SITE.field.radius,
    strength: PLANET_SITE.field.strength,
    falloff: PLANET_SITE.field.falloff,
    innerRadius: PLANET_SITE.field.innerRadius,
    innerSoft: PLANET_SITE.field.innerSoft,
  });
}

function coast(center, radius) {
  return projectFieldTrajectory(
    { x: center.x + radius, z: center.z },
    { x: 0, z: ANVIL_SLING_WITNESS.speed },
    [wellField(center)],
    PROFILE,
    { dt: 1 / 60, steps: STEPS },
  );
}

function straight(center, radius) {
  return projectFieldTrajectory(
    { x: center.x + radius, z: center.z },
    { x: 0, z: ANVIL_SLING_WITNESS.speed },
    [],
    PROFILE,
    { dt: 1 / 60, steps: STEPS },
  );
}

test('the waiting hauler sits in the sling band and the well bends its coast', () => {
  const center = { x: 0, z: 0 };
  const pose = anvilSlingWitnessPose(center);
  assert.equal(pose.region, 'sling');
  assert.equal(classifyPlanetRegion(PLANET_SITE, ANVIL_SLING_WITNESS.radius), 'sling');
  assert.ok(ANVIL_SLING_WITNESS.radius > PLANET_SITE.field.innerRadius);
  assert.ok(ANVIL_SLING_WITNESS.radius < PLANET_SITE.bands.sling);

  const bent = coast(center, ANVIL_SLING_WITNESS.radius);
  const flat = straight(center, ANVIL_SLING_WITNESS.radius);
  const inward = flat.end.x - bent.end.x;
  console.log(`anvil sling inward=${inward.toFixed(1)} WU over ${STEPS / 60}s`);
  assert.ok(inward > 15, `the sling coast must fall inward (${inward.toFixed(1)} WU)`);

  const outsideR = PLANET_SITE.field.radius + 400;
  const farBent = coast(center, outsideR);
  const farFlat = straight(center, outsideR);
  const farInward = farFlat.end.x - farBent.end.x;
  assert.ok(farInward < inward * 0.25,
    `outside the influence the coast stays straighter (${farInward.toFixed(1)} vs ${inward.toFixed(1)})`);
});

test('registering the Anvil places one coasting hauler and leaving removes it', () => {
  const spawned = [];
  let nextId = 1;
  const entities = new Map();
  const state = {
    entityList: [],
    entities,
    simTime: 0,
    tick: 0,
  };
  const sys = Object.create(planetRuntime);
  const spawnEntity = (spec) => {
    const entity = { id: nextId++, alive: true, ...spec };
    spawned.push(entity);
    entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const center = { x: 100, z: -40 };
  const first = sys._spawnSlingWitness(state, spawnEntity, center);
  const second = sys._spawnSlingWitness(state, spawnEntity, center);
  assert.equal(spawned.length, 1, 'a second visit must not stack another hauler');
  assert.equal(second, first);
  assert.equal(first.data.anvilSlingWitness, true);
  assert.equal(first.data.defId, 'ship_mule');
  assert.equal(first.data.ai.passive, true);
  assert.equal(first.pos.x, center.x + ANVIL_SLING_WITNESS.radius);
  assert.equal(first.vel.z, ANVIL_SLING_WITNESS.speed);
  assert.equal(first.vel.x, 0, 'the hauler coasts; it does not thrust');

  state.planet = {
    schemaVersion: 1,
    active: true,
    witnessId: first.id,
    entityId: null,
    fieldId: null,
    siteId: 'planet_tethys_anvil',
  };
  sys.state = state;
  sys.registry = { get() { return null; } };
  sys.bus = { emit() {} };
  sys._unwind('sector_exit');
  assert.equal(first.alive, false);
});
