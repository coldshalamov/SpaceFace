// PQ-138.03 — Wrecks drift and tumble (dead man's mass).
// A damaged ship is not merely an entity with low health. It is now a problem.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathForSector,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_helios_prime';
const MAX_WRECK_DRIFT_SPEED = 400;
const MAX_WRECK_TUMBLE = 3.0;

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
  }

  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }

  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function baseState(seed = 47047) {
  return {
    meta: { seed },
    tick: 470,
    simTime: 47,
    playerId: 1,
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
  };
}

function integratedHarness(state = baseState()) {
  const bus = new Bus();
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: 9000 + state.entities.size,
        alive: true,
        pos: { ...(spec.pos || {}) },
        data: spec.data || {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const registry = {
    get(name) { return name === 'aftermathWrecks' ? aftermathWrecks : null; },
  };
  aftermathWrecks.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry };
}

function namedZonePos() {
  const zone = zonesForSector(SECTOR_ID)[0];
  assert.ok(zone && zone.center, 'Helios named-zone fixture exists');
  return sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
}

function addMovingVictim(state, motion, id = 40) {
  const victim = {
    id,
    type: 'ship',
    alive: false,
    pos: { ...namedZonePos() },
    vel: { ...motion.vel },
    angVel: motion.angVel,
    mass: motion.mass,
    factionId: 'faction_reach',
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Red Wake' },
  };
  state.entities.set(victim.id, victim);
  state.entityList.push(victim);
  return victim;
}

function killPayload(victim) {
  return {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass: 'corsair_raider',
    factionId: victim.factionId,
    pos: { ...victim.pos },
    sectorId: SECTOR_ID,
  };
}

function speedOf(vel) {
  return Math.hypot(vel.x, vel.z);
}

test('a marker recorded from a kill at cruise carries the victim velocity, spin and mass', () => {
  const h = integratedHarness();
  const victim = addMovingVictim(h.state, { vel: { x: 120, z: 90 }, angVel: 1.4, mass: 40 });
  h.bus.emit('entity:killed', killPayload(victim));

  const markers = aftermathForSector(h.state, SECTOR_ID);
  assert.equal(markers.length, 1, 'the kill inside the named zone records one marker');
  const marker = markers[0];
  assert.deepEqual(marker.victimVel, { x: 120, z: 90 },
    'a damaged ship is not merely an entity with low health; the marker must remember its motion');
  assert.equal(marker.victimAngVel, 1.4);
  assert.equal(marker.victimMass, 40);
  aftermathWrecks.destroy();
});

test('the wreck spec inherits at least 80% of the victim speed, the exact spin and the real mass', () => {
  const h = integratedHarness();
  const victim = addMovingVictim(h.state, { vel: { x: 120, z: 90 }, angVel: 1.4, mass: 40 });
  h.bus.emit('entity:killed', killPayload(victim));
  const marker = aftermathForSector(h.state, SECTOR_ID)[0];

  const spec = aftermathWrecks._specForMarker(marker);
  const inherited = speedOf(spec.vel);
  assert.ok(inherited >= 0.8 * speedOf(victim.vel),
    `wreck keeps ${inherited} of ${speedOf(victim.vel)} WU/s: a wreck is dead man's mass, not a decoration`);
  assert.equal(spec.angVel, victim.angVel,
    'a wreck is dead man\'s mass, not a decoration — it tumbles with the spin the ship had');
  assert.equal(spec.mass, victim.mass,
    'a wreck is dead man\'s mass, not a decoration — it carries the victim mass, not a prop tonnage');
  assert.notEqual(spec.mass, 1e6, 'the wreck must be shoveable, never an immovable 1e6 prop');
  aftermathWrecks.destroy();
});

test('velocity, spin and mass survive a serialize round trip through marker normalization', () => {
  const first = integratedHarness();
  const victim = addMovingVictim(first.state, { vel: { x: 120, z: 90 }, angVel: 1.4, mass: 40 });
  first.bus.emit('entity:killed', killPayload(victim));
  const saved = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
  aftermathWrecks.destroy();

  const resumed = integratedHarness(baseState());
  aftermathWrecks.deserialize(saved);
  const marker = aftermathForSector(resumed.state, SECTOR_ID)[0];
  assert.deepEqual(marker.victimVel, { x: 120, z: 90 },
    'Continue must not flatten a drifting wreck back into a decoration');
  assert.equal(marker.victimAngVel, 1.4);
  assert.equal(marker.victimMass, 40);
  const spec = aftermathWrecks._specForMarker(marker);
  assert.deepEqual(spec.vel, { x: 120, z: 90 });
  assert.equal(spec.angVel, 1.4);
  assert.equal(spec.mass, 40);
  aftermathWrecks.destroy();
});

test('a legacy marker without motion fields normalizes to zero velocity, zero spin and null mass', () => {
  const h = integratedHarness();
  const legacy = {
    markerId: 'aft_legacy',
    sectorId: SECTOR_ID,
    pos: { x: 5, z: 6 },
    victimClass: 'ship',
  };
  aftermathWrecks.deserialize({ schemaVersion: 2, seed: 1, bySector: { [SECTOR_ID]: [legacy] }, causes: {} });

  const marker = aftermathForSector(h.state, SECTOR_ID)[0];
  assert.ok(marker, 'the save-compat clause keeps the legacy marker loadable');
  assert.deepEqual(marker.victimVel, { x: 0, z: 0 });
  assert.equal(marker.victimAngVel, 0);
  assert.equal(marker.victimMass, null);
  assert.equal(marker.victimVel.x, 0);
  assert.equal(marker.victimVel.z, 0);
  assert.equal(Number.isNaN(marker.victimVel.x), false, 'never NaN');
  assert.equal(Number.isNaN(marker.victimAngVel), false, 'never NaN');
  const spec = aftermathWrecks._specForMarker(marker);
  assert.deepEqual(spec.vel, { x: 0, z: 0 });
  assert.equal(spec.angVel, 0);
  assert.equal(spec.mass, 1e6, 'no real mass known keeps the legacy immovable default');
  aftermathWrecks.destroy();
});

test('an absurd 5000 WU/s victim yields a capped wreck whose direction is unchanged', () => {
  const h = integratedHarness();
  const victim = addMovingVictim(h.state, { vel: { x: 4000, z: 3000 }, angVel: 10, mass: 40 });
  const victimSpeed = speedOf(victim.vel);
  const victimUnit = { x: victim.vel.x / victimSpeed, z: victim.vel.z / victimSpeed };
  h.bus.emit('entity:killed', killPayload(victim));
  const marker = aftermathForSector(h.state, SECTOR_ID)[0];
  const spec = aftermathWrecks._specForMarker(marker);

  const inherited = speedOf(spec.vel);
  assert.ok(Math.abs(inherited - MAX_WRECK_DRIFT_SPEED) < 1e-9,
    `bounds cap the drift at ${MAX_WRECK_DRIFT_SPEED} WU/s, got ${inherited}`);
  const inheritedUnit = { x: spec.vel.x / inherited, z: spec.vel.z / inherited };
  assert.ok(Math.abs(inheritedUnit.x - victimUnit.x) < 1e-9
    && Math.abs(inheritedUnit.z - victimUnit.z) < 1e-9,
    'the cap scales the whole vector; direction is preserved to within 1e-9');
  assert.equal(spec.angVel, MAX_WRECK_TUMBLE, 'spin clamps by magnitude at the tumble bound');
  aftermathWrecks.destroy();
});
