// INF (WF-01) — a fresh kill that puts real freight on the ground draws a contest while the
// player is still looting. Wreck-field scavengers used to wait for the field to be a full
// wreck-day old (600 sim-seconds), so the "someone races you for the wreck" story could never
// fire in ordinary play. A field born from a manifested hull now dispatches its scavenger at
// WRECK_FRESH_SCAV_RESPONSE_S; generic-residue fields (fighter kills) and the squatter/trap
// role keep the day cadence, and the field budget is still 2, spent once, ever.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathForSector,
  aftermathWrecks,
  listWreckFieldInhabitants,
  WRECK_FRESH_SCAV_RESPONSE_S,
} from '../src/systems/aftermathWrecks.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { contactStateWord } from '../src/systems/scanner.js';

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

function boot(seed = 66013) {
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
        id: nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        rot: spec.rot || 0,
        data: spec.data ? JSON.parse(JSON.stringify(spec.data)) : {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const registry = { get: () => null };
  aftermathWrecks.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry };
}

function killAt(ctx, id, victimClass, data) {
  const pos = sectorLocalToGlobalForSector(zonesForSector(SECTOR_ID)[0].center, SECTOR_ID);
  const victim = {
    id,
    type: 'ship',
    alive: false,
    pos: { ...pos },
    vel: { x: 5, z: 2 },
    mass: 22,
    factionId: 'faction_reach',
    data,
  };
  ctx.state.entities.set(victim.id, victim);
  ctx.state.entityList.push(victim);
  ctx.state.simTime += 1;
  ctx.state.tick += 1;
  ctx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass,
    pos: { ...pos },
    sectorId: SECTOR_ID,
  });
  return aftermathForSector(ctx.state, SECTOR_ID).find((m) => m.victimId === id);
}

const HAULER_DATA = (name) => ({
  defId: 'ship_hauler',
  shipClass: 'hauler',
  name,
  cargoManifest: { manifestId: `mf_${name}`, lines: [{ commodityId: 'cmdty_ore_iron', qty: 12 }] },
});
const FIGHTER_DATA = (name) => ({ defId: 'ship_corsair', shipClass: 'corsair_raider', name });

function rolesOf(ctx) {
  return listWreckFieldInhabitants(ctx.state).map((e) => e.data.wreckEcologyRole).sort();
}

// The second ecology role is hash-derived per field (squatter or trap); the invariant is
// "scavenger plus exactly one of the two", never which one.
function assertFullRoster(ctx) {
  const roles = rolesOf(ctx);
  assert.equal(roles.length, 2);
  assert.equal(roles[0], 'scavenger');
  assert.ok(['squatter', 'trap'].includes(roles[1]), `second role is a day-role (got ${roles[1]})`);
}

test('a contested fresh kill dispatches its scavenger inside the response window', () => {
  const h = boot();
  try {
    const marker = killAt(h, 42, 'hauler_freighter', HAULER_DATA('Paydirt'));
    assert.ok(marker.manifestResidue, 'the kill put freight residue on the ground');
    h.state.simTime = 1 + WRECK_FRESH_SCAV_RESPONSE_S;
    aftermathWrecks.update(1 / 60, h.state);

    assert.deepEqual(rolesOf(h), ['scavenger'], 'the scavenger answers the fresh kill');
    const seeded = h.bus.log.filter((e) => e.name === 'wreckEcology:seeded');
    assert.equal(seeded.length, 1);
    assert.equal(seeded[0].payload.fresh, true, 'the dispatch is marked as a fresh contest');
    const scav = listWreckFieldInhabitants(h.state)[0];
    const dist = Math.hypot(scav.pos.x - marker.pos.x, scav.pos.z - marker.pos.z);
    assert.ok(dist >= 520, `it flies in from outside work range (dist ${dist})`);
  } finally {
    aftermathWrecks.destroy();
  }
});

test('the response is not instant — the wreck gets a grace window first', () => {
  const h = boot();
  try {
    killAt(h, 43, 'hauler_freighter', HAULER_DATA('Freshstart'));
    h.state.simTime = 20;
    aftermathWrecks.update(1 / 60, h.state);
    assert.deepEqual(rolesOf(h), [], 'no contest before the response window');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('generic-residue fields keep the day cadence', () => {
  const h = boot();
  try {
    killAt(h, 44, 'corsair_raider', FIGHTER_DATA('Red Wake'));
    h.state.simTime = 1 + WRECK_FRESH_SCAV_RESPONSE_S;
    aftermathWrecks.update(1 / 60, h.state);
    assert.deepEqual(rolesOf(h), [], 'a fighter kill draws nobody early');
    h.state.simTime = 601;
    aftermathWrecks.update(1 / 60, h.state);
    assertFullRoster(h);
  } finally {
    aftermathWrecks.destroy();
  }
});

test('the field budget still caps at two: the fresh scavenger, then one day-role', () => {
  const h = boot();
  try {
    killAt(h, 45, 'hauler_freighter', HAULER_DATA('Contested'));
    h.state.simTime = 1 + WRECK_FRESH_SCAV_RESPONSE_S;
    aftermathWrecks.update(1 / 60, h.state);
    assert.deepEqual(rolesOf(h), ['scavenger']);
    h.state.simTime = 601;
    aftermathWrecks.update(1 / 60, h.state);
    assertFullRoster(h);
    h.state.simTime = 1202;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(listWreckFieldInhabitants(h.state).length, 2, 'never a third inhabitant');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('the dispatched contest is durable: it survives a save round trip and re-entry', () => {
  const h = boot();
  try {
    const marker = killAt(h, 46, 'hauler_freighter', HAULER_DATA('Longhand'));
    h.state.simTime = 1 + WRECK_FRESH_SCAV_RESPONSE_S;
    aftermathWrecks.update(1 / 60, h.state);
    assert.deepEqual(rolesOf(h), ['scavenger']);

    const bag = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
    for (const e of h.state.entityList) {
      if (e.data && e.data.wreckEcologyRole) e.alive = false;
    }
    aftermathWrecks.deserialize(bag);
    h.state.simTime = 90;
    aftermathWrecks.update(1 / 60, h.state);
    const roles = rolesOf(h);
    assert.deepEqual(roles, ['scavenger'], 'the dispatched scavenger rematerializes on return');
    const field = Object.values(h.state.aftermathWrecks.ecology)[0];
    assert.equal(field.roster.length, 1, 'roster shape survives the round trip');
    assert.equal(aftermathForSector(h.state, SECTOR_ID)[0].markerId, marker.markerId);
  } finally {
    aftermathWrecks.destroy();
  }
});

test('a killed fresh scavenger is never replaced — the budget was spent once', () => {
  const h = boot();
  try {
    killAt(h, 47, 'hauler_freighter', HAULER_DATA('Bait'));
    h.state.simTime = 1 + WRECK_FRESH_SCAV_RESPONSE_S;
    aftermathWrecks.update(1 / 60, h.state);
    const scav = listWreckFieldInhabitants(h.state)[0];
    assert.equal(scav.data.wreckEcologyRole, 'scavenger');

    // Kill the contest before the wreck-day: the slot stays gone.
    scav.alive = false;
    h.bus.emit('entity:destroyed', { id: scav.id });
    h.state.simTime = 40;
    aftermathWrecks.update(1 / 60, h.state);
    assert.deepEqual(rolesOf(h), [], 'no instant respawn');

    // The day role still joins on cadence — and it is the only thing that ever does. The spent
    // scavenger slot is never re-minted: one live day-role, zero live scavengers, forever.
    h.state.simTime = 601;
    aftermathWrecks.update(1 / 60, h.state);
    const roles = rolesOf(h);
    assert.equal(roles.length, 1, 'only the day-role lives');
    assert.ok(['squatter', 'trap'].includes(roles[0]), `the day role joined (got ${roles[0]})`);
    h.state.simTime = 900;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(listWreckFieldInhabitants(h.state).length, 1, 'never a second scavenger');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('a scavenger whose field was already stripped departs instead of idling', () => {
  const h = boot();
  try {
    const marker = killAt(h, 48, 'hauler_freighter', HAULER_DATA('Latecomer'));
    h.state.simTime = 1 + WRECK_FRESH_SCAV_RESPONSE_S;
    aftermathWrecks.update(1 / 60, h.state);
    const scav = listWreckFieldInhabitants(h.state)[0];
    assert.equal(scav.data.scavengerWork.state, 'approach');

    // The player drained the wreck while the scavenger was inbound.
    const wreck = h.state.entityList.find((e) => e.type === 'wreck' && e.alive !== false
      && e.data && e.data.markerId === marker.markerId);
    wreck.data.salvagePool = {};
    h.state.simTime += 1;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(scav.data.scavengerWork.state, 'depart', 'nothing to take: the worker leaves');

    // Out of the field's range, the departure finalizes and the body despawns.
    scav.pos.x += 2600;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(scav.alive, false, 'departed empty-hold scavenger despawns');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('the scanner names the contest: a wreck-field scavenger reads SCAVENGER, not TRADER', () => {
  const h = boot();
  try {
    killAt(h, 49, 'hauler_freighter', HAULER_DATA('Labeled'));
    h.state.simTime = 1 + WRECK_FRESH_SCAV_RESPONSE_S;
    aftermathWrecks.update(1 / 60, h.state);
    const scav = listWreckFieldInhabitants(h.state)[0];
    assert.equal(scav.data.wreckEcologyRole, 'scavenger');
    assert.equal(scav.data.trafficRole, undefined, 'no traffic role: adoption must not hijack the hull');
    assert.equal(contactStateWord(scav, 0, h.state), 'SCAVENGER',
      'the reticle word names the looter, not a fictional trader');
  } finally {
    aftermathWrecks.destroy();
  }
});
