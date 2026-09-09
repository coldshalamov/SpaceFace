// PQ-154.01 — a wreck field older than one day has ≥ 2 inhabitants.
// Ecology is a finite budget that decays. Scavengers do not respawn forever.
import assert from 'node:assert/strict';
import test from 'node:test';

import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  aftermathFieldId,
  aftermathForSector,
  aftermathWrecks,
  countWreckFieldInhabitants,
  listWreckFieldInhabitants,
  wreckFieldEcology,
  WRECK_ECOLOGY_DAY_S,
  WRECK_ECOLOGY_DECAY_S,
} from '../src/systems/aftermathWrecks.js';
import { salvage } from '../src/systems/salvage.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const SEED = 15410;
const SECTOR_ID = 'sector_helios_prime';
const CERES_ID = 'sector_ceres_belt';

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

function namedZonePos(sectorId = SECTOR_ID) {
  const zone = zonesForSector(sectorId)[0];
  assert.ok(zone && zone.center, `${sectorId} named-zone fixture exists`);
  return { zone, pos: sectorLocalToGlobalForSector(zone.center, sectorId) };
}

function boot(seed = SEED, sectorId = SECTOR_ID) {
  const state = {
    meta: { seed },
    tick: 10,
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    player: { uniqueWrecks: null, flags: {} },
    world: { currentSectorId: sectorId },
    entities: new Map(),
    entityList: [],
    salvage: { points: [], plannedSectorId: null, sources: {} },
  };
  const bus = new Bus();
  let nextId = 1000;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: spec.data ? { ...spec.data } : {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const systems = { aftermathWrecks, uniqueWrecks, salvage, survivorPod };
  const registry = { get: (name) => systems[name] || null };
  aftermathWrecks.init({ state, bus, helpers, registry });
  uniqueWrecks.init({ state, bus, helpers, registry });
  salvage.init({ state, bus, helpers, registry });
  survivorPod.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry, nextId: () => nextId };
}

function plantAftermathWreck(ctx, t = 0) {
  const { zone, pos } = namedZonePos(ctx.state.world.currentSectorId);
  const victim = {
    id: 40,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    vel: { x: 12, z: -4 },
    angVel: 0.2,
    mass: 22,
    factionId: 'faction_reach',
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Red Wake' },
  };
  ctx.state.entities.set(victim.id, victim);
  ctx.state.entityList.push(victim);
  ctx.state.simTime = t;
  ctx.state.tick = 40;
  ctx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass: 'corsair_raider',
    pos: { ...pos },
    sectorId: ctx.state.world.currentSectorId,
  });
  const markers = aftermathForSector(ctx.state, ctx.state.world.currentSectorId);
  assert.ok(markers.length >= 1, 'kill inside a named zone must record an aftermath wreck');
  return {
    zone,
    pos,
    fieldId: aftermathFieldId(ctx.state.world.currentSectorId, markers[0].zoneId),
    marker: markers[0],
  };
}

function ageAndSync(ctx, simTime) {
  ctx.state.simTime = simTime;
  aftermathWrecks.update(1 / 60, ctx.state);
}

function dispose(ctx) {
  if (typeof aftermathWrecks.destroy === 'function') aftermathWrecks.destroy();
  if (typeof uniqueWrecks.destroy === 'function') uniqueWrecks.destroy();
  if (typeof salvage.destroy === 'function') salvage.destroy();
  if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
  void ctx;
}

test('a fresh wreck field has no ecology yet', () => {
  const ctx = boot(SEED);
  try {
    const planted = plantAftermathWreck(ctx, 0);
    assert.equal(countWreckFieldInhabitants(ctx.state, planted.fieldId), 0);
    const field = wreckFieldEcology(ctx.state, planted.fieldId);
    assert.ok(field, 'the wreck zone must register as a field');
    assert.ok(ctx.state.simTime - field.bornAt < WRECK_ECOLOGY_DAY_S);
  } finally {
    dispose(ctx);
  }
});

test('PQ-154.01 seed 15410: a wreck field older than one day has ≥ 2 inhabitants', () => {
  const first = boot(SEED);
  let inhabitantCount = 0;
  let roles = [];
  try {
    const planted = plantAftermathWreck(first, 0);
    ageAndSync(first, WRECK_ECOLOGY_DAY_S);
    const people = listWreckFieldInhabitants(first.state, planted.fieldId);
    inhabitantCount = people.length;
    roles = people.map((entity) => entity.data.wreckEcologyRole).sort();
    const field = wreckFieldEcology(first.state, planted.fieldId);

    console.log(
      `PQ-154.01 inhabitants=${inhabitantCount} roles=${roles.join(',')} `
      + `field=${planted.fieldId} ageS=${WRECK_ECOLOGY_DAY_S} seed=${SEED}`,
    );

    assert.ok(inhabitantCount >= 2, `inhabitant count ${inhabitantCount} must be ≥ 2`);
    assert.ok(roles.includes('scavenger'), 'PQ-138 scavengers must show up at the old field');
    assert.equal(field.spent, inhabitantCount);
    assert.equal(field.budget, 0, 'the ecology budget is spent, not refilled');
    assert.equal(field.decayed, false);
  } finally {
    dispose(first);
  }

  const replay = boot(SEED);
  try {
    const planted = plantAftermathWreck(replay, 0);
    ageAndSync(replay, WRECK_ECOLOGY_DAY_S);
    const again = listWreckFieldInhabitants(replay.state, planted.fieldId);
    assert.equal(again.length, inhabitantCount, 'same seed must reprint the same inhabitant count');
    assert.deepEqual(again.map((entity) => entity.data.wreckEcologyRole).sort(), roles);
  } finally {
    dispose(replay);
  }
});

test('ecology does not respawn scavengers after the budget is spent', () => {
  const ctx = boot(SEED);
  try {
    const planted = plantAftermathWreck(ctx, 0);
    ageAndSync(ctx, WRECK_ECOLOGY_DAY_S);
    const before = listWreckFieldInhabitants(ctx.state, planted.fieldId);
    assert.ok(before.length >= 2);

    for (const entity of before) {
      entity.alive = false;
      ctx.bus.emit('entity:killed', { id: entity.id, type: entity.type });
    }
    assert.equal(countWreckFieldInhabitants(ctx.state, planted.fieldId), 0);

    ctx.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    ctx.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    ageAndSync(ctx, WRECK_ECOLOGY_DAY_S + 30);
    assert.equal(
      countWreckFieldInhabitants(ctx.state, planted.fieldId),
      0,
      'spent ecology must not mint a second crew',
    );
    const field = wreckFieldEcology(ctx.state, planted.fieldId);
    assert.equal(field.budget, 0);
    assert.ok(field.roster.every((slot) => slot.status === 'gone'));
  } finally {
    dispose(ctx);
  }
});

test('a four-day wreck field decays and stays empty', () => {
  const ctx = boot(SEED);
  try {
    const planted = plantAftermathWreck(ctx, 0);
    ageAndSync(ctx, WRECK_ECOLOGY_DAY_S);
    assert.ok(countWreckFieldInhabitants(ctx.state, planted.fieldId) >= 2);

    ageAndSync(ctx, WRECK_ECOLOGY_DECAY_S);
    assert.equal(countWreckFieldInhabitants(ctx.state, planted.fieldId), 0);
    const field = wreckFieldEcology(ctx.state, planted.fieldId);
    assert.equal(field.decayed, true);
    assert.equal(field.budget, 0);

    ageAndSync(ctx, WRECK_ECOLOGY_DECAY_S + WRECK_ECOLOGY_DAY_S);
    ctx.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    assert.equal(countWreckFieldInhabitants(ctx.state, planted.fieldId), 0);
  } finally {
    dispose(ctx);
  }
});

test('an authored derelict field is already a day old on the Ceres route', () => {
  const ctx = boot(SEED, CERES_ID);
  try {
    ctx.bus.emit('sector:enter', { sectorId: CERES_ID });
    const fieldId = 'salvage:zone_ceres_derelict';
    const field = wreckFieldEcology(ctx.state, fieldId);
    const count = countWreckFieldInhabitants(ctx.state, fieldId);
    assert.ok(field, 'salvage must register the Abandoned Driller as a wreck field');
    assert.ok(count >= 2, `Ceres derelict inhabitants ${count} must be ≥ 2`);
    assert.equal(field.kind, 'salvage');
  } finally {
    dispose(ctx);
  }
});
