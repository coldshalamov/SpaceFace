import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { PhasedExplosionLifecycle } from '../src/render/combat/phasedExplosions.js';
import {
  DEATH_MASS_TIER_THRESHOLDS,
  DEATH_TIER_CLASS_ID,
  DEATH_TIER_RADIUS_SCALE,
  resolveDeathPresentationClass,
  scaleDeathExplosionRadius,
  vfx,
} from '../src/render/vfx.js';

const LIGHT_HEAVY = 'A light dies small and fast, a heavy dies large and slow.';
const CAUSE_READ = 'The player should still understand: what caused it, what moved, and why.';
const POOL_CLASS_IDS = ['small', 'ordinary', 'capital'];
const TIERS = ['light', 'medium', 'heavy', 'capital'];

function record(victim) {
  return resolveDeathPresentationClass(victim);
}

test('four mass tiers from the real ship table, each a larger death than the one below', () => {
  const light = record({ mass: 16 });
  const medium = record({ mass: 48 });
  const heavy = record({ mass: 90 });
  const capital = record({ mass: 300 });

  assert.equal(light.tier, 'light', `${LIGHT_HEAVY} scout mass 16 is light`);
  assert.equal(medium.tier, 'medium', `${LIGHT_HEAVY} mass 48 is medium`);
  assert.equal(heavy.tier, 'heavy', `${LIGHT_HEAVY} hauler mass 90 is heavy`);
  assert.equal(capital.tier, 'capital', `${LIGHT_HEAVY} capital mass 300 is capital`);

  assert.equal(light.classId, 'small', `${LIGHT_HEAVY} light maps to pool class small`);
  assert.equal(medium.classId, 'ordinary', `${LIGHT_HEAVY} medium maps to pool class ordinary`);
  assert.equal(heavy.classId, 'ordinary', `${LIGHT_HEAVY} heavy maps to pool class ordinary`);
  assert.equal(capital.classId, 'capital', `${LIGHT_HEAVY} capital maps to pool class capital`);

  assert.ok(
    DEATH_TIER_RADIUS_SCALE.light < DEATH_TIER_RADIUS_SCALE.medium,
    `${LIGHT_HEAVY} light radius scale ${DEATH_TIER_RADIUS_SCALE.light} < medium ${DEATH_TIER_RADIUS_SCALE.medium}`,
  );
  assert.ok(
    DEATH_TIER_RADIUS_SCALE.medium < DEATH_TIER_RADIUS_SCALE.heavy,
    `${LIGHT_HEAVY} medium radius scale ${DEATH_TIER_RADIUS_SCALE.medium} < heavy ${DEATH_TIER_RADIUS_SCALE.heavy}`,
  );
  assert.ok(
    DEATH_TIER_RADIUS_SCALE.heavy < DEATH_TIER_RADIUS_SCALE.capital,
    `${LIGHT_HEAVY} heavy radius scale ${DEATH_TIER_RADIUS_SCALE.heavy} < capital ${DEATH_TIER_RADIUS_SCALE.capital}`,
  );
  assert.ok(
    DEATH_MASS_TIER_THRESHOLDS.lightMaxExclusive === 30
      && DEATH_MASS_TIER_THRESHOLDS.mediumMaxExclusive === 80
      && DEATH_MASS_TIER_THRESHOLDS.heavyMaxExclusive === 200,
    `${LIGHT_HEAVY} mass seams are light<30, medium<80, heavy<200`,
  );
});

test('never downgrade a capital death even when the mass is a scout', () => {
  const flagged = record({ capital: true, mass: 16 });
  const large = record({ radius: 60, mass: 16 });
  const named = record({ victimClass: 'cruiser', mass: 16 });

  assert.equal(flagged.tier, 'capital', `${LIGHT_HEAVY} explicit capital flag stays capital`);
  assert.equal(large.tier, 'capital', `${LIGHT_HEAVY} radius 60 stays capital`);
  assert.equal(named.tier, 'capital', `${LIGHT_HEAVY} cruiser class stays capital`);
  assert.equal(flagged.classId, 'capital', `${LIGHT_HEAVY} flagged capital uses pool class capital`);
  assert.equal(large.classId, 'capital', `${LIGHT_HEAVY} large-radius capital uses pool class capital`);
  assert.equal(named.classId, 'capital', `${LIGHT_HEAVY} named capital uses pool class capital`);
});

test('cause and direction survive on the death record so terrain and gun reads differ', () => {
  const terrain = record({
    mass: 16,
    presentation: { cause: 'terrain_collision', normal: { x: 1, z: 0 } },
  });
  const generic = record({ mass: 16 });
  const gun = record({
    mass: 16,
    presentation: { cause: 'weapon_kinetic', direction: { x: 0, z: 1 } },
  });

  assert.equal(terrain.cause, 'terrain_collision', `${CAUSE_READ} terrain cause is forwarded`);
  assert.equal(terrain.directional, true, `${CAUSE_READ} terrain normal makes the death directional`);
  assert.equal(generic.cause, 'generic', `${CAUSE_READ} missing presentation is generic`);
  assert.equal(generic.directional, false, `${CAUSE_READ} a generic death does not point`);
  assert.equal(gun.cause, 'weapon_kinetic', `${CAUSE_READ} gun cause is forwarded`);
  assert.equal(gun.directional, true, `${CAUSE_READ} gun direction makes the death directional`);
  assert.notEqual(terrain.cause, gun.cause, `${CAUSE_READ} terrain and gun deaths are different records`);
});

test('classId is always one the explosion pool already knows', () => {
  for (const tier of TIERS) {
    const classId = DEATH_TIER_CLASS_ID[tier];
    assert.ok(
      POOL_CLASS_IDS.includes(classId),
      `${LIGHT_HEAVY} tier ${tier} maps to pool class ${classId}`,
    );
  }
  const samples = [
    { mass: 16 },
    { mass: 48 },
    { mass: 90 },
    { mass: 300 },
    { capital: true, mass: 16 },
    { radius: 60, mass: 16 },
    { victimClass: 'cruiser', mass: 16 },
    {},
    null,
  ];
  for (const victim of samples) {
    const death = record(victim);
    assert.ok(
      POOL_CLASS_IDS.includes(death.classId),
      `${LIGHT_HEAVY} ${JSON.stringify(victim)} classId ${death.classId} is small|ordinary|capital`,
    );
  }
});

function deathHarness(bodies) {
  const entities = new Map(bodies.map((body) => [body.id, body]));
  const cues = [];
  const harness = Object.create(vfx);
  harness.state = {
    entities,
    settings: { video: {}, accessibility: {} },
  };
  harness.bus = {
    emit(name, payload) {
      if (name === 'presentation:vfxCue') cues.push(payload);
    },
  };
  harness._scene = new THREE.Scene();
  harness._explosions = new PhasedExplosionLifecycle({ capacity: 8 });
  harness._admitAndSpawnArcadeStructural = () => false;
  return { harness, cues };
}

test('_onKilled reads live mass, scales radius, and keeps the kill juice cue', () => {
  const lightBody = {
    id: 1, type: 'ship', mass: 16, radius: 10, pos: { x: 3, z: 4 },
  };
  const heavyBody = {
    id: 2, type: 'ship', mass: 90, radius: 10, pos: { x: 5, z: 6 },
  };
  const { harness, cues } = deathHarness([lightBody, heavyBody]);

  harness._onKilled({
    id: 1,
    type: 'ship',
    pos: lightBody.pos,
    presentation: { cause: 'kinetic', direction: { x: 0, z: 1 } },
  });
  harness._onKilled({
    id: 2,
    type: 'ship',
    pos: heavyBody.pos,
    presentation: { cause: 'terrain_collision', normal: { x: 1, z: 0 } },
  });

  const entries = harness._explosions.entries.filter((entry) => entry.active);
  const lightDeath = entries.find((entry) => entry.x === 3);
  const heavyDeath = entries.find((entry) => entry.x === 5);

  assert.equal(lightDeath.classId, 'small', `${LIGHT_HEAVY} live scout mass 16 dies as pool class small`);
  assert.equal(heavyDeath.classId, 'ordinary', `${LIGHT_HEAVY} live hauler mass 90 dies as pool class ordinary`);
  assert.equal(
    lightDeath.radius,
    scaleDeathExplosionRadius(10, 'light'),
    `${LIGHT_HEAVY} light death radius is the light scale of the victim radius`,
  );
  assert.equal(
    heavyDeath.radius,
    scaleDeathExplosionRadius(10, 'heavy'),
    `${LIGHT_HEAVY} heavy death radius is the heavy scale of the same victim radius`,
  );
  // The resolved record is the single decision point: mass picks the class and the radius, cause
  // picks the cadence. If the cause did not reach the pool entry, a terrain death and a gun death
  // would run the identical schedule and the player could not read what killed the ship.
  assert.equal(lightDeath.cause, 'kinetic',
    `${CAUSE_READ} the gun death carries its cause into the explosion pool`);
  assert.equal(heavyDeath.cause, 'terrain_collision',
    `${CAUSE_READ} the terrain death carries a DIFFERENT cause into the explosion pool`);
  assert.notEqual(lightDeath.cause, heavyDeath.cause,
    `${CAUSE_READ} a gun death and a terrain death are not the same event`);
  assert.ok(
    heavyDeath.radius > lightDeath.radius,
    `${LIGHT_HEAVY} same-radius hulls still explode at different sizes`,
  );
  assert.equal(lightDeath.cause, 'kinetic', `${CAUSE_READ} gun cause reaches the explosion`);
  assert.equal(heavyDeath.cause, 'terrain_collision', `${CAUSE_READ} terrain cause reaches the explosion`);
  assert.equal(cues.length, 2, `${LIGHT_HEAVY} kill juice cue still fires once per death`);
  assert.equal(cues[0].id, 'combat.damage.kill', `${LIGHT_HEAVY} juice cue id is unchanged`);
  assert.equal(cues[0].magnitude, 2, `${LIGHT_HEAVY} juice cue count stays 2`);
  assert.equal(cues[1].id, 'combat.damage.kill', `${LIGHT_HEAVY} second death keeps the same juice cue`);
  assert.equal(cues[1].magnitude, 2, `${LIGHT_HEAVY} second death keeps cue magnitude 2`);
});

test('missing mass/radius still returns a frozen deterministic record', () => {
  const empty = record({});
  const missing = record(null);
  const again = record({});

  assert.ok(Object.isFrozen(empty), `${LIGHT_HEAVY} death record is frozen`);
  assert.ok(Object.isFrozen(missing), `${LIGHT_HEAVY} null victim still returns a frozen record`);
  assert.ok(TIERS.includes(empty.tier), `${LIGHT_HEAVY} missing mass still names a tier`);
  assert.ok(POOL_CLASS_IDS.includes(empty.classId), `${LIGHT_HEAVY} missing mass still names a pool class`);
  assert.ok(Number.isFinite(empty.mass), `${LIGHT_HEAVY} missing mass still reports a finite mass`);
  assert.equal(empty.cause, 'generic', `${CAUSE_READ} missing presentation is generic`);
  assert.equal(empty.directional, false, `${CAUSE_READ} missing presentation does not point`);
  assert.deepEqual(empty, again, `${LIGHT_HEAVY} the same input twice returns equal values`);
  assert.deepEqual(missing, record(null), `${LIGHT_HEAVY} null victim is deterministic`);
});
