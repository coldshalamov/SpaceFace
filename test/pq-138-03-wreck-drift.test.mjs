// PQ-138.03 — A kill at speed leaves a wreck that keeps moving and turning.
// Save/reload must rematerialize the same drift, tumble, and off-plane pose.
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEntity } from '../src/core/entity.js';
import {
  aftermathForSector,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_helios_prime';

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
    nextEntityId: 1000,
    freeIds: [],
    player: {
      cargo: { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 },
      miningBeam: null,
    },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    rng() { return 0.9; },
  };
}

function integratedHarness(state = baseState()) {
  const bus = new Bus();
  const helpers = {
    spawnEntity(spec) {
      const entity = Object.assign(makeEntity(spec), { id: state.nextEntityId++ });
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const registry = {
    get(name) { return name === 'aftermathWrecks' ? aftermathWrecks : null; },
  };
  aftermathWrecks.init({ state, bus, helpers, registry });
  mining.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry };
}

function namedZonePos() {
  const zone = zonesForSector(SECTOR_ID)[0];
  assert.ok(zone && zone.center, 'Helios named-zone fixture exists');
  return sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
}

function addMovingVictim(state, extra = {}) {
  const victim = {
    id: extra.id || 40,
    type: 'ship',
    alive: false,
    pos: extra.pos || { ...namedZonePos() },
    vel: extra.vel || { x: 120, z: 90 },
    angVel: extra.angVel != null ? extra.angVel : 1.4,
    mass: extra.mass != null ? extra.mass : 40,
    rot: extra.rot != null ? extra.rot : 0.8,
    pitch: extra.pitch != null ? extra.pitch : 0.35,
    bank: extra.bank != null ? extra.bank : -0.22,
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

function wrecks(state) {
  return state.entityList.filter((entity) => entity && entity.type === 'wreck');
}

function xz(vel) {
  return { x: Number(vel && vel.x), z: Number(vel && vel.z) };
}

test('a kill at speed leaves a wreck that keeps the victim velocity, spin, mass, and off-plane pose', () => {
  const h = integratedHarness();
  const victim = addMovingVictim(h.state);
  h.bus.emit('entity:killed', killPayload(victim));

  const marker = aftermathForSector(h.state, SECTOR_ID)[0];
  const wreck = wrecks(h.state)[0];
  assert.ok(marker && wreck, 'named-zone kill records a marker and one live wreck');
  assert.deepEqual(xz(wreck.vel), { x: 120, z: 90 },
    'inheritance already worked: the live wreck keeps cruise velocity');
  assert.equal(wreck.angVel, 1.4, 'the live wreck keeps the victim spin');
  assert.equal(wreck.mass, 40);
  assert.equal(wreck.rot, 0.8);
  assert.equal(wreck.pitch, 0.35, 'wreck must not park flat — inherit the victim pitch');
  assert.equal(wreck.bank, -0.22, 'wreck must not park flat — inherit the victim bank');
  assert.deepEqual(marker.victimVel, { x: 120, z: 90 });
  assert.equal(marker.victimAngVel, 1.4);
  assert.equal(marker.victimRot, 0.8);
  assert.equal(marker.victimPitch, 0.35);
  assert.equal(marker.victimBank, -0.22);
  aftermathWrecks.destroy();
});

test('bindImmediateWreck does not overwrite inherited motion or an already-tilted pose', () => {
  const h = integratedHarness();
  const victim = addMovingVictim(h.state);
  h.bus.emit('entity:killed', killPayload(victim));
  const wreck = wrecks(h.state)[0];
  const marker = aftermathForSector(h.state, SECTOR_ID)[0];

  wreck.vel = { x: 33, z: 11 };
  wreck.angVel = 0.25;
  wreck.rot = 1.1;
  wreck.pitch = 0.5;
  wreck.bank = -0.4;
  aftermathWrecks.bindImmediateWreck(marker.markerId, wreck);

  assert.deepEqual(xz(wreck.vel), { x: 33, z: 11 },
    'a wreck that is already moving must keep that motion');
  assert.equal(wreck.angVel, 0.25);
  assert.equal(wreck.rot, 1.1);
  assert.equal(wreck.pitch, 0.5);
  assert.equal(wreck.bank, -0.4);
  aftermathWrecks.destroy();
});

test('bindImmediateWreck adopts inherited pose onto a parked-flat wreck', () => {
  const h = integratedHarness();
  const victim = addMovingVictim(h.state, { vel: { x: 80, z: 20 }, angVel: 0.9 });
  h.bus.emit('entity:killed', killPayload(victim));
  const marker = aftermathForSector(h.state, SECTOR_ID)[0];

  const parked = h.helpers.spawnEntity({
    type: 'wreck',
    pos: { x: marker.pos.x, z: marker.pos.z },
    vel: { x: 0, z: 0 },
    angVel: 0,
    rot: 0,
    pitch: 0,
    bank: 0,
    mass: 1e6,
    data: {},
  });
  aftermathWrecks._spawned.delete(marker.markerId);
  const bound = aftermathWrecks.bindImmediateWreck(marker.markerId, parked);

  assert.equal(bound, parked);
  assert.deepEqual(xz(parked.vel), { x: 80, z: 20 });
  assert.equal(parked.angVel, 0.9);
  assert.equal(parked.mass, 40);
  assert.equal(parked.rot, 0.8);
  assert.equal(parked.pitch, 0.35);
  assert.equal(parked.bank, -0.22);
  aftermathWrecks.destroy();
});

test('save/reload round-trips marker motion and rematerializes the drifting, tilted wreck', () => {
  const first = integratedHarness();
  const victim = addMovingVictim(first.state);
  first.bus.emit('entity:killed', killPayload(victim));
  const live = wrecks(first.state)[0];
  live.vel = { x: 88, z: 44 };
  live.angVel = 0.9;
  live.pos = { x: live.pos.x + 12, z: live.pos.z - 7 };
  live.rot = 1.05;
  live.pitch = 0.41;
  live.bank = -0.17;

  const saved = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
  const savedMarker = saved.bySector[SECTOR_ID][0];
  assert.deepEqual(savedMarker.victimVel, { x: 88, z: 44 },
    'serialize write-back keeps the wreck last-known velocity, not the kill-frame victim');
  assert.equal(savedMarker.victimAngVel, 0.9);
  assert.equal(savedMarker.victimRot, 1.05);
  assert.equal(savedMarker.victimPitch, 0.41);
  assert.equal(savedMarker.victimBank, -0.17);
  assert.equal(savedMarker.pos.x, live.pos.x);
  assert.equal(savedMarker.pos.z, live.pos.z);
  aftermathWrecks.destroy();

  const resumed = integratedHarness(baseState());
  aftermathWrecks.deserialize(saved);
  const marker = aftermathForSector(resumed.state, SECTOR_ID)[0];
  assert.deepEqual(marker.victimVel, { x: 88, z: 44 });
  assert.equal(marker.victimAngVel, 0.9);
  assert.equal(marker.victimPitch, 0.41);
  assert.equal(marker.victimBank, -0.17);
  resumed.bus.emit('save:loaded', {});

  const rematerialized = wrecks(resumed.state)[0];
  assert.ok(rematerialized, 'Continue rematerializes the wreck from the marker');
  assert.deepEqual(xz(rematerialized.vel), { x: 88, z: 44 });
  assert.equal(rematerialized.angVel, 0.9);
  assert.equal(rematerialized.rot, 1.05);
  assert.equal(rematerialized.pitch, 0.41);
  assert.equal(rematerialized.bank, -0.17);
  assert.equal(rematerialized.mass, 40);
  assert.equal(rematerialized.pos.x, savedMarker.pos.x);
  assert.equal(rematerialized.pos.z, savedMarker.pos.z);
  aftermathWrecks.destroy();
});

test('a legacy marker without pose fields rematerializes flat and still loadable', () => {
  const h = integratedHarness();
  aftermathWrecks.deserialize({
    schemaVersion: 2,
    seed: 1,
    bySector: {
      [SECTOR_ID]: [{
        markerId: 'aft_legacy_pose',
        sectorId: SECTOR_ID,
        pos: { x: 5, z: 6 },
        victimClass: 'ship',
        victimVel: { x: 40, z: 10 },
        victimAngVel: 0.5,
        victimMass: 22,
      }],
    },
    causes: {},
  });
  h.bus.emit('save:loaded', {});

  const marker = aftermathForSector(h.state, SECTOR_ID)[0];
  const wreck = wrecks(h.state)[0];
  assert.equal(marker.victimRot, 0);
  assert.equal(marker.victimPitch, 0);
  assert.equal(marker.victimBank, 0);
  assert.equal(Number.isNaN(marker.victimPitch), false);
  assert.deepEqual(xz(wreck.vel), { x: 40, z: 10 });
  assert.equal(wreck.angVel, 0.5);
  assert.equal(wreck.pitch, 0);
  assert.equal(wreck.bank, 0);
  aftermathWrecks.destroy();
});
