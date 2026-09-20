// Scavenger work loop — a wreck-field scavenger is a worker, not a parked prop: it approaches the
// field's durable wreck, strips the shared salvage pool into its own hold on the sim clock, then
// departs with the goods. Killed while laden, it spills the stolen hold through the ordinary
// kill-cargo path. Pool drains ride the marker's own pool object, so they persist across
// rematerialization exactly like a player beam drain.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathForSector,
  aftermathWrecks,
  listWreckFieldInhabitants,
  WRECK_ECOLOGY_DAY_S,
} from '../src/systems/aftermathWrecks.js';
import { rollKillRewardItems } from '../src/data/killRewards.js';
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

function entries(bus, name) {
  return bus.log.filter((entry) => entry.name === name);
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

function scavengerOf(ctx, fieldId) {
  const people = listWreckFieldInhabitants(ctx.state, fieldId);
  return people.find((entity) => entity.data && entity.data.wreckEcologyRole === 'scavenger') || null;
}

function wreckOf(ctx) {
  return ctx.state.entityList.find((entity) => entity.type === 'wreck' && entity.alive !== false);
}

test('a scavenger flies to the field wreck and strips its pool into a real hold', () => {
  const h = boot();
  try {
    const marker = plantWreck(h, 0);
    h.state.simTime = WRECK_ECOLOGY_DAY_S;
    aftermathWrecks.update(1 / 60, h.state);

    const scav = scavengerOf(h, `aft:${SECTOR_ID}:${marker.zoneId}`);
    assert.ok(scav, 'scavenger spawned');
    assert.ok(scav.data.cargo && scav.data.cargo.items, 'spawn carries a kill-spill shaped hold');
    assert.equal(scav.data.scavengerWork.state, 'approach');

    // It spawns outside work range and flies in: nonzero steer intent aimed at the wreck,
    // and no work tick has fired yet.
    aftermathWrecks.update(1 / 60, h.state);
    const dist = Math.hypot(scav.pos.x - wreckOf(h).pos.x, scav.pos.z - wreckOf(h).pos.z);
    assert.ok(dist > 70, `spawn keeps the approach honest (dist ${dist})`);
    assert.ok(
      Math.abs(scav.data.intent.moveZ) + Math.abs(scav.data.intent.moveX) > 0.01,
      'approach writes nonzero steer intent',
    );

    // Arrive: park on the wreck. The first work tick fires on arrival (its clock starts at zero),
    // announcing the strip.
    const wreck = wreckOf(h);
    const poolBefore = Object.values(wreck.data.salvagePool).reduce((a, b) => a + b, 0);
    scav.pos.x = wreck.pos.x + 5;
    scav.pos.z = wreck.pos.z;
    h.state.simTime += 5;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(scav.data.scavengerWork.state, 'work');
    const heldAfterFirst = Object.values(scav.data.cargo.items).reduce((a, b) => a + b, 0);
    assert.equal(heldAfterFirst, 1, 'the arrival tick took one unit into the hold');
    assert.equal(scav.data.scavengerWork.holdQty, 1);

    let scavenged = entries(h.bus, 'wreckEcology:scavenged');
    assert.equal(scavenged.length, 1);
    assert.equal(scavenged[0].payload.first, true, 'the first take announces the strip');

    // One more work tick, one more unit off the shared pool.
    h.state.simTime += 4;
    aftermathWrecks.update(1 / 60, h.state);
    const poolAfter = Object.values(wreck.data.salvagePool).reduce((a, b) => a + b, 0);
    assert.equal(poolAfter, poolBefore - 2, 'each work tick moves one unit out of the pool');
    scavenged = entries(h.bus, 'wreckEcology:scavenged');
    assert.equal(scavenged.length, 2);
    assert.equal(scavenged[1].payload.first, false);
  } finally {
    aftermathWrecks.destroy();
  }
});

test('a fully stripped wreck retires its marker and the laden scavenger departs and despawns', () => {
  const h = boot();
  try {
    const marker = plantWreck(h, 0);
    h.state.simTime = WRECK_ECOLOGY_DAY_S;
    aftermathWrecks.update(1 / 60, h.state);
    const scav = scavengerOf(h, `aft:${SECTOR_ID}:${marker.zoneId}`);
    scav.pos.x = wreckOf(h).pos.x + 3;
    scav.pos.z = wreckOf(h).pos.z;

    // Work until the pool is gone (default pool is small: 3 scrap + 1 electronics).
    for (let i = 0; i < 40 && wreckOf(h); i++) {
      h.state.simTime += 4;
      aftermathWrecks.update(1 / 60, h.state);
    }
    assert.equal(wreckOf(h), undefined, 'stripped wreck is retired');
    assert.equal(aftermathForSector(h.state, SECTOR_ID).length, 0, 'its marker is retired too');
    assert.ok(entries(h.bus, 'aftermathWreck:completed').length >= 1);
    assert.equal(scav.data.scavengerWork.state, 'depart', 'laden scavenger leaves');
    const held = Object.values(scav.data.cargo.items).reduce((a, b) => a + b, 0);
    assert.ok(held >= 1, 'it left with the goods');

    // Finishing the run despawns the worker and closes the slot (no respawn loop).
    scav.pos.x += 2600;
    scav.pos.z += 0;
    const before = h.state.entityList.length;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(scav.alive, false, 'departed scavenger despawns');
    const departed = entries(h.bus, 'wreckEcology:departed');
    assert.equal(departed.length, 1);
    assert.ok(departed[0].payload.holdQty >= 1);
    assert.ok(h.state.entityList.length <= before, 'no body left behind');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('a laden scavenger killed in the black spills its stolen hold through the ordinary path', () => {
  const h = boot();
  try {
    const marker = plantWreck(h, 0);
    h.state.simTime = WRECK_ECOLOGY_DAY_S;
    aftermathWrecks.update(1 / 60, h.state);
    const scav = scavengerOf(h, `aft:${SECTOR_ID}:${marker.zoneId}`);
    scav.pos.x = wreckOf(h).pos.x + 3;
    scav.pos.z = wreckOf(h).pos.z;
    h.state.simTime += 4;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(scav.data.scavengerWork.holdQty, 1);
    const stolenId = Object.keys(scav.data.cargo.items)[0];

    // Open-space kill (no zone): the scavenger is shiplike, so unit 1's durable path applies,
    // and the kill-reward roll must see the stolen hold as cargo lines.
    scav.alive = false;
    h.bus.emit('entity:killed', { id: scav.id, type: 'ship', killerId: 1, pos: { ...scav.pos }, sectorId: SECTOR_ID });
    const items = rollKillRewardItems(h.state.rng, scav)
      .filter((item) => item.commodityId === stolenId);
    assert.ok(items.length >= 1, 'the stolen commodity spills on death');
  } finally {
    aftermathWrecks.destroy();
  }
});
