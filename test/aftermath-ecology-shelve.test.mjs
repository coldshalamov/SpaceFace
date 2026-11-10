// Wreck-field ecology shelve residency — an aftermath scavenger/squatter is virtualizable by
// design, but its roster slot must stay bound across the shelf: the lean far row carries the
// ecology identity (wreckFieldId/wreckEcologyRole/scavengerWork), the slot resolves the shelved
// row as occupied instead of minting a twin every tick, and promotion returns the same body to
// the same slot. Run 104/106 churn evidence: without this, one slot minted ~14k ship rows.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathForSector,
  aftermathWrecks,
  isWreckEcologyInhabitant,
  listWreckFieldInhabitants,
  wreckFieldEcology,
  WRECK_ECOLOGY_DAY_S,
} from '../src/systems/aftermathWrecks.js';
import {
  getFarActor,
  insertFarActor,
  promoteFarActor,
} from '../src/world/farActorTable.js';
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

function boot(seed = 66012) {
  const state = {
    meta: { seed },
    tick: 60,
    simTime: 0,
    playerId: 1,
    player: { cargo: { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 }, miningBeam: null },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    rng() { return 0.35; },
  };
  const bus = new Bus();
  let nextEntityId = 900;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: Number.isSafeInteger(spec.id) && spec.id > 0 ? spec.id : nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        rot: spec.rot || 0,
        data: spec.data ? JSON.parse(JSON.stringify(spec.data)) : {},
      };
      if (spec.id != null && spec.id >= nextEntityId) nextEntityId = spec.id + 1;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      state.entities.delete(id);
      const at = state.entityList.indexOf(entity);
      if (at >= 0) state.entityList.splice(at, 1);
      return entity;
    },
  };
  const registry = { get: () => null };
  aftermathWrecks.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry };
}

function plantWreck(ctx, t = 0) {
  const zone = zonesForSector(SECTOR_ID)[0];
  const pos = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
  const victim = {
    id: 42,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    vel: { x: 5, z: 2 },
    mass: 22,
    factionId: 'faction_reach',
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Red Wake' },
  };
  ctx.state.entities.set(victim.id, victim);
  ctx.state.entityList.push(victim);
  ctx.state.simTime = t;
  ctx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass: 'corsair_raider',
    pos: { ...pos },
    sectorId: SECTOR_ID,
  });
  return aftermathForSector(ctx.state, SECTOR_ID)[0];
}

function shelve(ctx, entity) {
  insertFarActor(ctx.state, entity, ctx.state.simTime);
  ctx.state.entities.delete(entity.id);
  const at = ctx.state.entityList.indexOf(entity);
  if (at >= 0) ctx.state.entityList.splice(at, 1);
}

test('a shelved scavenger keeps its roster slot — no re-mint, and it promotes back intact', () => {
  const h = boot();
  try {
    const marker = plantWreck(h, 0);
    h.state.simTime = WRECK_ECOLOGY_DAY_S;
    aftermathWrecks.update(1 / 60, h.state);

    const fieldId = `aft:${SECTOR_ID}:${marker.zoneId}`;
    const scav = listWreckFieldInhabitants(h.state, fieldId)
      .find((e) => e.data && e.data.wreckEcologyRole === 'scavenger');
    assert.ok(scav, 'scavenger spawned');
    const scavId = scav.id;

    // Virtualization: body leaves the live set, its actor becomes a far row.
    shelve(h, scav);
    const row = getFarActor(h.state, scavId);
    assert.ok(row, 'far row exists for the shelved scavenger');
    // The lean row must carry the ecology identity or promotion returns a stranger.
    assert.equal(row.data.wreckFieldId, fieldId, 'row keeps wreckFieldId');
    assert.equal(row.data.wreckEcologyRole, 'scavenger', 'row keeps wreckEcologyRole');
    assert.ok(row.data.scavengerWork, 'row keeps scavengerWork');

    // The slot stays bound across the shelf: repeated materialize ticks mint no twin.
    // (The roster may also seed a squatter/trap slot — that body is legitimate, so the
    // assertions below key on the scavenger role only.)
    const scavengers = (list) => list
      .filter((e) => e.data && e.data.wreckEcologyRole === 'scavenger');
    for (let i = 0; i < 30; i++) {
      h.state.simTime += 1 / 60;
      aftermathWrecks.update(1 / 60, h.state);
    }
    assert.equal(
      scavengers(listWreckFieldInhabitants(h.state, fieldId)).length,
      0,
      'no live scavenger twin minted while the occupant is shelved',
    );
    assert.ok(getFarActor(h.state, scavId), 'the same row still owns the slot');

    // Promotion returns the same body to the same slot — identity intact, no respawn.
    const back = promoteFarActor(h.state, scavId, h.helpers);
    assert.ok(back, 'shelved scavenger promotes back');
    assert.equal(back.id, scavId, 'promotion reuses the reserved id');
    assert.ok(isWreckEcologyInhabitant(back, fieldId), 'promoted body is the field inhabitant');
    for (let i = 0; i < 10; i++) {
      h.state.simTime += 1 / 60;
      aftermathWrecks.update(1 / 60, h.state);
    }
    const after = scavengers(listWreckFieldInhabitants(h.state, fieldId));
    assert.equal(after.length, 1, 'exactly one scavenger after the round trip');
    assert.equal(after[0].id, scavId, 'and it is the same body, not a minted twin');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('sector exit keeps a shelved occupant bound — re-entry promotes it instead of twinning', () => {
  const h = boot();
  try {
    const marker = plantWreck(h, 0);
    h.state.simTime = WRECK_ECOLOGY_DAY_S;
    aftermathWrecks.update(1 / 60, h.state);

    const fieldId = `aft:${SECTOR_ID}:${marker.zoneId}`;
    const scav = listWreckFieldInhabitants(h.state, fieldId)
      .find((e) => e.data && e.data.wreckEcologyRole === 'scavenger');
    assert.ok(scav, 'scavenger spawned');
    const scavId = scav.id;
    shelve(h, scav);

    // Sector hop: the exit sweep used to drop the ecology bind, so a returning player got a
    // fresh spawn beside the promoted original.
    h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    h.state.world.currentSectorId = 'sector_charon_expanse';
    h.state.world.currentSectorId = SECTOR_ID;
    h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    for (let i = 0; i < 10; i++) {
      h.state.simTime += 1 / 60;
      aftermathWrecks.update(1 / 60, h.state);
    }
    const scavengers = (list) => list
      .filter((e) => e.data && e.data.wreckEcologyRole === 'scavenger');
    assert.equal(
      scavengers(listWreckFieldInhabitants(h.state, fieldId)).length,
      0,
      're-entry minted no replacement while the occupant sits shelved',
    );

    const back = promoteFarActor(h.state, scavId, h.helpers);
    assert.ok(back && back.id === scavId, 'the shelved occupant promotes back');
    for (let i = 0; i < 10; i++) {
      h.state.simTime += 1 / 60;
      aftermathWrecks.update(1 / 60, h.state);
    }
    const after = scavengers(listWreckFieldInhabitants(h.state, fieldId));
    assert.equal(after.length, 1, 'exactly one scavenger after re-entry + promote');
    assert.equal(after[0].id, scavId);
  } finally {
    aftermathWrecks.destroy();
  }
});

test('a decayed field drops the shelved row, leaving no promote-blocked tombstone', () => {
  const h = boot();
  try {
    const marker = plantWreck(h, 0);
    h.state.simTime = WRECK_ECOLOGY_DAY_S;
    aftermathWrecks.update(1 / 60, h.state);

    const fieldId = `aft:${SECTOR_ID}:${marker.zoneId}`;
    const scav = listWreckFieldInhabitants(h.state, fieldId)
      .find((e) => e.data && e.data.wreckEcologyRole === 'scavenger');
    assert.ok(scav, 'scavenger spawned');
    const scavId = scav.id;
    shelve(h, scav);
    assert.ok(getFarActor(h.state, scavId), 'row shelved');

    const field = wreckFieldEcology(h.state, fieldId);
    assert.ok(field, 'field resolvable');
    aftermathWrecks._decayField(field);

    assert.equal(getFarActor(h.state, scavId), null, 'decay drops the shelved row');
    const back = promoteFarActor(h.state, scavId, h.helpers);
    assert.ok(!back, 'nothing promotes back from a decayed slot');
  } finally {
    aftermathWrecks.destroy();
  }
});
