import test from 'node:test';
import assert from 'node:assert/strict';

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
  let rngCalls = 0;
  return {
    meta: { seed },
    tick: 470,
    simTime: 47,
    playerId: 1,
    player: {
      cargo: { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 },
      miningBeam: null,
    },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    rng() {
      rngCalls++;
      return 0.9;
    },
    rngCalls() { return rngCalls; },
  };
}

function integratedHarness(state = baseState()) {
  const bus = new Bus();
  let nextEntityId = 1000;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextEntityId++,
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
  // This is the production listener order. The durable owner records first; mining then asks it for
  // the immediate wreck plan instead of independently minting a second identity and salvage pool.
  aftermathWrecks.init({ state, bus, helpers, registry });
  mining.init({ state, bus, helpers, registry });
  return {
    state,
    bus,
    helpers,
    registry,
    resetEntityIds(nextId = 1000) { nextEntityId = nextId; },
  };
}

function namedZonePos() {
  const zone = zonesForSector(SECTOR_ID)[0];
  assert.ok(zone && zone.center, 'Helios named-zone fixture exists');
  return sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
}

function outsideZonePos() {
  return sectorLocalToGlobalForSector({ x: 100000, z: 100000 }, SECTOR_ID);
}

function addVictim(state, pos = namedZonePos(), id = 40, extraData = {}) {
  const victim = {
    id,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    factionId: 'faction_reach',
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Red Wake', ...extraData },
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

function removeLiveEntity(state, entity) {
  entity.alive = false;
  state.entities.delete(entity.id);
  state.entityList = state.entityList.filter((entry) => entry !== entity);
}

function entries(bus, name) {
  return bus.log.filter((entry) => entry.name === name);
}

test('production-order kill creates one immediate marker-backed wreck with durable provenance and pool', () => {
  const h = integratedHarness();
  const victim = addVictim(h.state);
  h.bus.emit('entity:killed', killPayload(victim));

  const markers = aftermathForSector(h.state, SECTOR_ID);
  assert.equal(markers.length, 1);
  assert.equal(wrecks(h.state).length, 1);
  const wreck = wrecks(h.state)[0];
  assert.equal(wreck.data.markerId, markers[0].markerId);
  assert.equal(wreck.data.aftermath.markerId, markers[0].markerId);
  assert.equal(wreck.data.provenance.source, 'battle-aftermath');
  assert.equal(wreck.data.provenance.victimLabel, 'Red Wake');
  assert.strictEqual(wreck.data.salvagePool, markers[0].salvagePool, 'live and durable state share one pool');
  assert.deepEqual(wreck.data.salvagePool, {
    cmdty_scrap_metal: 3,
    cmdty_salvage_electronics: 1,
  });
  assert.equal(h.state.rngCalls(), 0, 'named aftermath does not also roll mining fallback loot');
  assert.equal(entries(h.bus, 'aftermathWreck:spawned').length, 1);
  aftermathWrecks.destroy();
});

test('repeat sector entry and duplicate kill delivery retain the same live wreck and single news receipt', () => {
  const h = integratedHarness();
  const victim = addVictim(h.state);
  const payload = killPayload(victim);
  h.bus.emit('entity:killed', payload);
  const immediate = wrecks(h.state)[0];

  h.bus.emit('entity:killed', { ...payload });
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID, continuous: true, noTeleport: true });

  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 1);
  assert.deepEqual(wrecks(h.state).map((wreck) => wreck.id), [immediate.id]);
  assert.equal(entries(h.bus, 'aftermathWreck:recorded').length, 1);
  assert.equal(entries(h.bus, 'aftermathWreck:spawned').length, 1);
  assert.equal(entries(h.bus, 'news:headline').filter((entry) => entry.payload.kind === 'battle-aftermath').length, 1);
  aftermathWrecks.destroy();
});

test('travel clears only the live binding and rematerializes the same marker and remaining pool once', () => {
  const h = integratedHarness();
  const victim = addVictim(h.state);
  h.bus.emit('entity:killed', killPayload(victim));
  const immediate = wrecks(h.state)[0];
  const markerId = immediate.data.markerId;
  immediate.data.salvagePool.cmdty_scrap_metal = 1;

  h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  assert.equal(immediate.alive, true, 'aftermath exit does not own/despawn the world entity');
  assert.equal(aftermathForSector(h.state, SECTOR_ID)[0].salvagePool.cmdty_scrap_metal, 1);
  removeLiveEntity(h.state, immediate); // world/travel owns live-entity teardown
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID, continuous: true });

  const returned = wrecks(h.state);
  assert.equal(returned.length, 1);
  assert.notEqual(returned[0].id, immediate.id);
  assert.equal(returned[0].data.markerId, markerId);
  assert.deepEqual(returned[0].data.salvagePool, {
    cmdty_scrap_metal: 1,
    cmdty_salvage_electronics: 1,
  });
  assert.equal(entries(h.bus, 'aftermathWreck:spawned').length, 2, 'one immediate plus one return materialization');
  aftermathWrecks.destroy();
});

test('JSON Continue rematerializes one stable marker with normalized remaining salvage', () => {
  const first = integratedHarness();
  const victim = addVictim(first.state);
  first.bus.emit('entity:killed', killPayload(victim));
  const immediate = wrecks(first.state)[0];
  const markerId = immediate.data.markerId;
  immediate.data.salvagePool.cmdty_scrap_metal = 1;
  const saved = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
  aftermathWrecks.destroy();

  const resumed = integratedHarness(baseState());
  aftermathWrecks.deserialize(saved);
  resumed.bus.emit('save:loaded', {});
  resumed.bus.emit('sector:enter', { sectorId: SECTOR_ID });

  assert.equal(wrecks(resumed.state).length, 1);
  assert.equal(wrecks(resumed.state)[0].data.markerId, markerId);
  assert.deepEqual(wrecks(resumed.state)[0].data.salvagePool, {
    cmdty_scrap_metal: 1,
    cmdty_salvage_electronics: 1,
  });
  assert.equal(entries(resumed.bus, 'aftermathWreck:spawned').length, 1);
  aftermathWrecks.destroy();
});

test('production restore order cannot materialize outgoing markers before incoming aftermath is deserialized', () => {
  const incomingSource = integratedHarness(baseState(99047));
  const incomingVictim = addVictim(incomingSource.state, namedZonePos(), 88, { name: 'Incoming Wake' });
  incomingSource.bus.emit('entity:killed', killPayload(incomingVictim));
  const incomingSaved = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
  const incomingMarkerId = incomingSaved.bySector[SECTOR_ID][0].markerId;
  aftermathWrecks.destroy();

  const h = integratedHarness(baseState(47047));
  const outgoingVictim = addVictim(h.state, namedZonePos(), 40, { name: 'Outgoing Wake' });
  h.bus.emit('entity:killed', killPayload(outgoingVictim));
  const outgoingMarkerId = aftermathForSector(h.state, SECTOR_ID)[0].markerId;
  const spawnedBeforeRestore = entries(h.bus, 'aftermathWreck:spawned').length;

  // Exact production ordering from saveSystem: restoration starts, live entities are cleared,
  // world enters the incoming sector, then owner data is deserialized and save:loaded is emitted.
  h.bus.emit('save:restoring', {});
  for (const entity of h.state.entityList) entity.alive = false;
  h.state.entities.clear();
  h.state.entityList = [];
  h.resetEntityIds(2000);
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  assert.equal(wrecks(h.state).length, 0, 'intermediate sector entry spawns no outgoing marker');
  assert.equal(entries(h.bus, 'aftermathWreck:spawned').length, spawnedBeforeRestore);

  aftermathWrecks.deserialize(incomingSaved);
  h.bus.emit('save:loaded', {});

  const live = wrecks(h.state).filter((entity) => entity.alive !== false);
  const markers = aftermathForSector(h.state, SECTOR_ID);
  assert.equal(live.length, 1);
  assert.equal(markers.length, 1);
  assert.equal(live[0].data.markerId, incomingMarkerId);
  assert.equal(markers[0].markerId, incomingMarkerId);
  assert.notEqual(live[0].data.markerId, outgoingMarkerId);
  assert.strictEqual(live[0].data.salvagePool, markers[0].salvagePool,
    'incoming live wreck aliases only the incoming durable pool');
  assert.equal(aftermathWrecks._saveRestoring, false);
  aftermathWrecks.destroy();
});

test('canonical game:new clears same-instance state, bindings, and offers before entity IDs are reused', () => {
  const h = integratedHarness();
  const firstVictim = addVictim(h.state);
  h.bus.emit('entity:killed', killPayload(firstVictim));
  const firstWreck = wrecks(h.state)[0];
  aftermathWrecks._pendingOffers.set('stale-cause', 'stale-offer');

  h.bus.emit('game:new', { seed: h.state.meta.seed });
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 0);
  assert.equal(aftermathWrecks._spawned.size, 0);
  assert.equal(aftermathWrecks._pendingOffers.size, 0);

  h.state.entities.clear();
  h.state.entityList = [];
  h.resetEntityIds(firstWreck.id);
  const reusedVictim = addVictim(h.state, namedZonePos(), firstVictim.id);
  h.bus.emit('entity:killed', killPayload(reusedVictim));
  const reusedWreck = wrecks(h.state)[0];
  assert.equal(reusedWreck.id, firstWreck.id, 'fixture reuses the prior live entity ID');
  assert.notStrictEqual(reusedWreck, firstWreck);
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 1);
  assert.equal(aftermathWrecks._spawned.get(reusedWreck.data.markerId), reusedWreck.id);
  h.bus.emit('game:started', {});
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 1, 'game:started does not erase the fresh run');
  aftermathWrecks.destroy();
});

test('live binding resolution evicts mismatched or recycled IDs and rejects stale completion', () => {
  const h = integratedHarness();
  const victim = addVictim(h.state);
  h.bus.emit('entity:killed', killPayload(victim));
  const marker = aftermathForSector(h.state, SECTOR_ID)[0];
  const first = wrecks(h.state)[0];
  first.data.markerId = 'foreign-marker';

  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const replacement = wrecks(h.state).find((wreck) => wreck.data.markerId === marker.markerId);
  assert.ok(replacement && replacement !== first, 'mismatched binding cannot suppress rematerialization');
  assert.equal(aftermathWrecks._spawned.get(marker.markerId), replacement.id);

  h.bus.emit('salvage:completed', { wreckId: replacement.id });
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 1, 'numeric ID alone cannot complete a marker');
  h.bus.emit('salvage:completed', { wreckId: replacement.id, markerId: 'stale-marker' });
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 1, 'claimed stale marker cannot clear current identity');

  removeLiveEntity(h.state, replacement);
  const recycled = {
    id: replacement.id,
    type: 'wreck',
    alive: true,
    pos: { ...marker.pos },
    data: { markerId: 'recycled-marker', provenance: { markerId: 'recycled-marker' } },
  };
  h.state.entities.set(recycled.id, recycled);
  h.state.entityList.push(recycled);
  h.bus.emit('salvage:completed', { wreckId: recycled.id, markerId: marker.markerId });
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 1, 'recycled numeric ID cannot clear the durable marker');
  assert.equal(entries(h.bus, 'aftermathWreck:completed').length, 0);
  assert.equal(aftermathWrecks._spawned.has(marker.markerId), false, 'mismatched binding is evicted');

  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const rebound = wrecks(h.state).find((wreck) => wreck !== first && wreck !== recycled
    && wreck.data.markerId === marker.markerId);
  assert.ok(rebound, 'sector entry can bind a fresh exact-identity wreck after eviction');
  aftermathWrecks.destroy();
});

test('freight marker persists only bounded manifest identity through immediate wreck and JSON Continue', () => {
  const first = integratedHarness();
  const freightIdentity = {
    manifestId: 'manifest_convoy_47',
    freighterKey: 'encounter:convoy_47:carrier:0',
    role: 'hauler',
  };
  const victim = addVictim(first.state, namedZonePos(), 47, {
    cargoManifest: {
      ...freightIdentity,
      lines: [{ commodityId: 'cmdty_food', qty: 99 }],
      totalQty: 99,
      sourceStationId: 'station_secret',
    },
  });
  first.bus.emit('entity:killed', killPayload(victim));
  const marker = aftermathForSector(first.state, SECTOR_ID)[0];
  const immediate = wrecks(first.state)[0];
  assert.deepEqual(marker.freightIdentity, freightIdentity);
  assert.deepEqual(immediate.data.provenance.freightIdentity, freightIdentity);
  assert.deepEqual(immediate.data.aftermath.freightIdentity, freightIdentity);
  assert.equal('lines' in marker.freightIdentity, false, 'cargo contents are not copied into aftermath state');
  assert.equal(JSON.stringify(marker).includes('station_secret'), false);
  const saved = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
  aftermathWrecks.destroy();

  const resumed = integratedHarness(baseState());
  aftermathWrecks.deserialize(saved);
  resumed.bus.emit('save:loaded', {});
  const continued = wrecks(resumed.state)[0];
  assert.deepEqual(aftermathForSector(resumed.state, SECTOR_ID)[0].freightIdentity, freightIdentity);
  assert.deepEqual(continued.data.provenance.freightIdentity, freightIdentity);
  assert.deepEqual(continued.data.aftermath.freightIdentity, freightIdentity);
  aftermathWrecks.destroy();
});

test('marker-cap truncation evicts matching live bindings and keeps the identity map bounded', () => {
  const h = integratedHarness();
  const markerIds = [];
  for (let index = 0; index < 10; index++) {
    h.state.tick = 470 + index;
    const victim = addVictim(h.state, namedZonePos(), 40 + index);
    h.bus.emit('entity:killed', killPayload(victim));
    markerIds.push(wrecks(h.state).at(-1).data.markerId);
  }

  const retained = aftermathForSector(h.state, SECTOR_ID);
  assert.equal(retained.length, 8);
  assert.equal(aftermathWrecks._spawned.size, 8);
  assert.equal(aftermathWrecks._spawned.has(markerIds[0]), false);
  assert.equal(aftermathWrecks._spawned.has(markerIds[1]), false);
  assert.deepEqual(new Set(aftermathWrecks._spawned.keys()), new Set(retained.map((marker) => marker.markerId)));
  for (const marker of retained) {
    const entity = h.state.entities.get(aftermathWrecks._spawned.get(marker.markerId));
    assert.equal(entity.data.markerId, marker.markerId);
    assert.equal(entity.data.provenance.markerId, marker.markerId);
  }
  aftermathWrecks.destroy();
});

test('salvaging the immediate wreck clears its durable marker exactly once and cannot ghost', () => {
  const h = integratedHarness();
  const victim = addVictim(h.state);
  h.bus.emit('entity:killed', killPayload(victim));
  const immediate = wrecks(h.state)[0];

  h.bus.emit('salvage:completed', {
    wreckId: immediate.id, markerId: immediate.data.markerId, loot: { cmdty_scrap_metal: 3 },
  });
  h.bus.emit('salvage:completed', {
    wreckId: immediate.id, markerId: immediate.data.markerId, loot: { cmdty_scrap_metal: 3 },
  });
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 0);
  assert.equal(entries(h.bus, 'aftermathWreck:completed').length, 1);

  h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  removeLiveEntity(h.state, immediate);
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const saved = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
  aftermathWrecks.deserialize(saved);
  h.bus.emit('save:loaded', {});
  assert.equal(wrecks(h.state).length, 0, 'completed immediate wreck does not return after travel or Continue');
  aftermathWrecks.destroy();
});

test('salvaging a travel-rematerialized wreck clears the same marker and cannot ghost', () => {
  const h = integratedHarness();
  const victim = addVictim(h.state);
  h.bus.emit('entity:killed', killPayload(victim));
  const immediate = wrecks(h.state)[0];
  const markerId = immediate.data.markerId;
  h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  removeLiveEntity(h.state, immediate);
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const durable = wrecks(h.state)[0];
  assert.equal(durable.data.markerId, markerId);

  h.bus.emit('salvage:completed', { wreckId: durable.id, markerId: durable.data.markerId });
  h.bus.emit('salvage:completed', { wreckId: durable.id, markerId: durable.data.markerId });
  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 0);
  assert.equal(entries(h.bus, 'aftermathWreck:completed').length, 1);
  h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  removeLiveEntity(h.state, durable);
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  assert.equal(wrecks(h.state).length, 0);
  aftermathWrecks.destroy();
});

test('ship kill outside every named zone retains the ordinary anonymous mining wreck path', () => {
  const h = integratedHarness();
  const victim = addVictim(h.state, outsideZonePos());
  h.bus.emit('entity:killed', killPayload(victim));

  assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 0);
  assert.equal(wrecks(h.state).length, 1);
  const wreck = wrecks(h.state)[0];
  assert.equal(wreck.data.name, 'Salvage Wreck');
  assert.equal(wreck.data.markerId, undefined);
  assert.equal(wreck.data.provenance, undefined);
  assert.deepEqual(wreck.data.salvagePool, { cmdty_scrap_metal: 4 });
  assert.equal(h.state.rngCalls(), 2, 'ordinary fallback keeps its existing deterministic loot rolls');
  assert.equal(entries(h.bus, 'aftermathWreck:spawned').length, 0);
  aftermathWrecks.destroy();
});
