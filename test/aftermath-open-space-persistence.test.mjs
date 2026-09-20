// Open-space aftermath persistence — a kill in the black between named zones is remembered
// exactly like a kill inside one: durable marker, bound immediate wreck with provenance, news
// headline, zone-less wreck-field registration, sector round-trip, and save round-trip.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathFieldId,
  aftermathForSector,
  aftermathWrecks,
  wreckFieldEcology,
} from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
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

function entries(bus, name) {
  return bus.log.filter((entry) => entry.name === name);
}

function boot(seed = 90210) {
  const state = {
    meta: { seed },
    tick: 120,
    simTime: 30,
    playerId: 1,
    player: { cargo: { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 }, miningBeam: null },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    rng() { return 0.42; },
  };
  const bus = new Bus();
  let nextEntityId = 500;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || {}) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: spec.data ? { ...spec.data } : {},
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
  mining.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry };
}

function dispose() {
  if (typeof mining.destroy === 'function') mining.destroy();
  aftermathWrecks.destroy();
}

function killInOpenSpace(ctx, pos, id = 77, label = 'Gray Havoc') {
  const victim = {
    id,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    vel: { x: 30, z: -12 },
    mass: 26,
    factionId: 'faction_vanguard',
    data: { defId: 'ship_wasp', shipClass: 'interceptor', name: label },
  };
  ctx.state.entities.set(victim.id, victim);
  ctx.state.entityList.push(victim);
  ctx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass: 'interceptor',
    factionId: victim.factionId,
    pos: { ...victim.pos },
    sectorId: SECTOR_ID,
  });
}

function openPos() {
  // Far outside every authored Helios zone radius.
  return sectorLocalToGlobalForSector({ x: 64000, z: -61000 }, SECTOR_ID);
}

function wrecks(state) {
  return state.entityList.filter((entity) => entity && entity.type === 'wreck' && entity.alive !== false);
}

test('an open-space kill leaves a durable marker, a bound wreck, and a headline', () => {
  const h = boot();
  try {
    killInOpenSpace(h, openPos());

    const markers = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(markers.length, 1);
    const marker = markers[0];
    assert.equal(marker.zoneId, null, 'marker is zone-less but durable');
    assert.equal(marker.zoneName, 'open space');
    assert.equal(marker.victimLabel, 'Gray Havoc');

    const live = wrecks(h.state);
    assert.equal(live.length, 1, 'mining spawned the immediate wreck through the plan');
    assert.equal(live[0].data.markerId, marker.markerId);
    assert.equal(live[0].data.provenance.source, 'battle-aftermath');
    assert.equal(live[0].data.provenance.zoneName, 'open space');
    assert.ok(live[0].data.salvagePool && Object.keys(live[0].data.salvagePool).length > 0);

    const spawned = entries(h.bus, 'aftermathWreck:spawned');
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].payload.markerId, marker.markerId);
    assert.equal(spawned[0].payload.zoneId, null);

    const news = entries(h.bus, 'news:headline');
    assert.equal(news.length, 1, 'the world reports the open-space loss');
    assert.match(news[0].payload.headline, /open space/);
    assert.match(news[0].payload.headline, /drifting in the open/);

    // The player news surface presents authored copy from news:publish (marketNews is its only
    // presenter); news:headline alone is a system-side record no UI ever shows.
    const published = entries(h.bus, 'news:publish');
    assert.equal(published.length, 1, 'the loss reaches the player news surface');
    assert.equal(published[0].payload.text, news[0].payload.headline);

    // The zone-less markers group into one shared zone-less field for ecology eligibility.
    const fieldId = aftermathFieldId(SECTOR_ID, null);
    h.state.simTime += 1;
    aftermathWrecks.update(1 / 60, h.state);
    const field = wreckFieldEcology(h.state, fieldId);
    assert.ok(field, 'zone-less markers register the sector wreck field');
    assert.equal(field.sectorId, SECTOR_ID);
    assert.equal(field.zoneId, null);
  } finally {
    dispose();
  }
});

function dropLiveWrecks(state) {
  // The world drops sector bodies on travel; the system only clears its bindings.
  for (const entity of wrecks(state)) {
    entity.alive = false;
    state.entities.delete(entity.id);
  }
  state.entityList = state.entityList.filter((entry) => entry.type !== 'wreck');
}

test('an open-space wreck survives sector exit and re-entry at its drifted position', () => {
  const h = boot();
  try {
    killInOpenSpace(h, openPos());
    const marker = aftermathForSector(h.state, SECTOR_ID)[0];
    const live = wrecks(h.state)[0];

    // Drift the live body, then leave: the marker writes back where the body actually is.
    live.pos.x += 500;
    live.pos.z += -260;
    h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    dropLiveWrecks(h.state);
    assert.equal(wrecks(h.state).length, 0, 'leaving the sector drops the body');

    h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    const again = wrecks(h.state);
    assert.equal(again.length, 1, 're-entering rematerializes the open-space wreck');
    assert.equal(again[0].data.markerId, marker.markerId);
    assert.equal(again[0].pos.x, live.pos.x, 'rematerialization continues the drift');
    assert.equal(again[0].pos.z, live.pos.z);
    assert.equal(again[0].data.provenance.victimLabel, 'Gray Havoc');
  } finally {
    dispose();
  }
});

test('an open-space marker survives a save round-trip', () => {
  const h = boot();
  try {
    killInOpenSpace(h, openPos(), 91, 'Pale Ember');
    const before = aftermathForSector(h.state, SECTOR_ID)[0];

    const bag = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    dropLiveWrecks(h.state);
    aftermathWrecks.deserialize(bag);

    const after = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(after.length, 1);
    assert.equal(after[0].markerId, before.markerId);
    assert.equal(after[0].zoneId, null);
    assert.equal(after[0].zoneName, 'open space');
    assert.deepEqual(after[0].salvagePool, before.salvagePool);

    h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    assert.equal(wrecks(h.state).length, 1, 'the open-space wreck comes back after load');
  } finally {
    dispose();
  }
});
