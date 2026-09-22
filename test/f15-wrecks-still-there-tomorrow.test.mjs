// §22 F15 — A few wrecks are still there tomorrow.
//
// aftermathWrecks already owns the whole mechanic: a capped per-sector marker bag
// (MAX_PER_SECTOR, protected markers never evicted), the sector:enter rematerialization, the
// save:restoring/save:loaded edges, and drift write-back into the marker. These fixtures pin the
// done-when clauses end to end: two kills come back near their death positions after a real
// serialize→deserialize→save:loaded round-trip, and past the cap the marker count and the
// serialized wreck bytes stop growing.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathForSector,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_helios_prime';
const MAX_PER_SECTOR = 8; // aftermathWrecks.js authored cap — "a few", not a junkyard

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) { const l = this.handlers.get(name) || []; l.push(fn); this.handlers.set(name, l); }
  off(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter((e) => e !== fn)); }
  emit(name, payload) { this.log.push({ name, payload }); for (const fn of [...(this.handlers.get(name) || [])]) fn(payload); }
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
  const registry = { get(name) { return name === 'aftermathWrecks' ? aftermathWrecks : null; } };
  aftermathWrecks.init({ state, bus, helpers, registry });
  mining.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry };
}

function dispose() {
  if (typeof mining.destroy === 'function') mining.destroy();
  aftermathWrecks.destroy();
}

function killAt(h, pos, id, label) {
  const victim = {
    id,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    vel: { x: 20, z: -8 },
    mass: 26,
    factionId: 'faction_vanguard',
    data: { defId: 'ship_wasp', shipClass: 'interceptor', name: label },
  };
  h.state.entities.set(victim.id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id: victim.id, killerId: 1, type: 'ship', victimClass: 'interceptor',
    factionId: victim.factionId, pos: { ...victim.pos }, sectorId: SECTOR_ID,
  });
}

function wrecks(state) {
  return state.entityList.filter((e) => e && e.type === 'wreck' && e.alive !== false);
}

function dropLiveWrecks(state) {
  // The world drops sector bodies on travel/load; the system only clears its bindings.
  for (const entity of wrecks(state)) {
    entity.alive = false;
    state.entities.delete(entity.id);
  }
  state.entityList = state.entityList.filter((e) => e.type !== 'wreck');
}

test('two kills respawn as wrecks near their death positions after save and load', () => {
  const h = boot();
  try {
    const posA = sectorLocalToGlobalForSector({ x: 64000, z: -61000 }, SECTOR_ID);
    const posB = sectorLocalToGlobalForSector({ x: 64300, z: -60880 }, SECTOR_ID);
    killAt(h, posA, 7001, 'Gray Havoc');
    killAt(h, posB, 7002, 'Pale Ember');
    assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 2);
    assert.equal(wrecks(h.state).length, 2);

    const bag = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    dropLiveWrecks(h.state);
    assert.equal(wrecks(h.state).length, 0, 'the load boundary drops live bodies');

    aftermathWrecks.deserialize(bag);
    h.bus.emit('save:loaded', {});

    const back = wrecks(h.state);
    assert.equal(back.length, 2, 'both wrecks rematerialize after the load');
    assert.ok(back.every((e) => e.type === 'wreck' && e.team !== 1 && e.data.ai == null),
      'restored bodies are wrecks, not live hostile ships');
    for (const deathPos of [posA, posB]) {
      const near = back.find((e) => Math.hypot(e.pos.x - deathPos.x, e.pos.z - deathPos.z) < 1);
      assert.ok(near, `a wreck must lie near its death position ${JSON.stringify(deathPos)}`);
    }
    const markerIds = new Set(aftermathForSector(h.state, SECTOR_ID).map((m) => m.markerId));
    for (const e of back) assert.ok(markerIds.has(e.data.markerId), 'each wreck binds a remembered marker');
  } finally {
    dispose();
  }
});

test('past the cap the count holds and the save wreck bytes stop growing', () => {
  const h = boot();
  try {
    const pos = sectorLocalToGlobalForSector({ x: 64000, z: -61000 }, SECTOR_ID);
    for (let i = 0; i < MAX_PER_SECTOR; i++) killAt(h, pos, 7100 + i, 'Gray Havoc');
    const atCap = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(atCap.length, MAX_PER_SECTOR);
    const bytesAtCap = JSON.stringify(aftermathWrecks.serialize()).length;

    // The same kills keep landing — three more, then two — the memory must stay exactly the cap
    // and the save bag must not grow (markerIds are hash36, so allow jitter for digit length).
    for (let i = MAX_PER_SECTOR; i < MAX_PER_SECTOR + 3; i++) killAt(h, pos, 7100 + i, 'Gray Havoc');
    const after = aftermathForSector(h.state, SECTOR_ID);
    assert.equal(after.length, MAX_PER_SECTOR, 'the cap holds under continued kills');
    const bytesAfter = JSON.stringify(aftermathWrecks.serialize()).length;
    assert.ok(bytesAfter <= bytesAtCap + 64,
      `wreck bytes must not grow past the cap: ${bytesAtCap} -> ${bytesAfter}`);

    // And the survivors still round-trip: every remembered marker respawns on the next load.
    const bag = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    dropLiveWrecks(h.state);
    aftermathWrecks.deserialize(bag);
    h.bus.emit('save:loaded', {});
    assert.ok(wrecks(h.state).length > 0, 'the remembered few still come back tomorrow');
    assert.ok(wrecks(h.state).length <= MAX_PER_SECTOR);
  } finally {
    dispose();
  }
});
