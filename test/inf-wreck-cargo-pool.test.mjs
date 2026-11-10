// INF (WF-06) — a wreck's salvage pool carries what the ship actually carried. Until now every
// durable aftermath wreck drained the same generic 3 scrap + 1 electronics no matter what died:
// robbing an ore hauler's wreck paid exactly like robbing a fighter. The durable marker now
// derives its pool from the victim's cargoManifest — the scoured remainder (floor 30%/line,
// capped) plus one unit of hull scrap — while the lootShards D2 pod still carries the full
// shipment, and manifest-less hulls keep the generic residue.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aftermathForSector,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
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

function killAt(ctx, id, victimClass, data, zone = true) {
  const local = zone ? zonesForSector(SECTOR_ID)[0].center : { x: 52000, z: 47000 };
  const pos = sectorLocalToGlobalForSector(local, SECTOR_ID);
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
  ctx.bus.emit('entity:killed', {
    id: victim.id,
    killerId: 1,
    type: 'ship',
    victimClass,
    pos: { ...pos },
    sectorId: SECTOR_ID,
  });
  return aftermathForSector(ctx.state, SECTOR_ID).find((m) => m.victimId === id) || null;
}

const manifest = (lines) => ({ manifestId: 'mf_test', lines });

test('a manifested hauler wreck holds its freight residue plus hull scrap, live and durable', () => {
  const h = boot();
  try {
    const marker = killAt(h, 42, 'hauler_freighter', {
      defId: 'ship_hauler',
      shipClass: 'hauler',
      name: 'Oxline',
      cargoManifest: manifest([{ commodityId: 'cmdty_ore_iron', qty: 10 }]),
    });
    assert.ok(marker, 'marker recorded');
    assert.deepEqual(marker.manifestResidue, { cmdty_ore_iron: 3 }, 'floor(10 * 0.3) survives');
    assert.deepEqual(marker.salvagePool, { cmdty_scrap_metal: 1, cmdty_ore_iron: 3 });

    // The materialized wreck drains the same derived pool, not the generic residue — and the
    // scanner names the hulk as freight-laced before the player spends the beam.
    const wreck = h.state.entityList.find((e) => e.type === 'wreck' && e.alive !== false
      && e.data && e.data.markerId === marker.markerId);
    assert.ok(wreck, 'wreck materialized in-sector');
    assert.deepEqual(wreck.data.salvagePool, { cmdty_scrap_metal: 1, cmdty_ore_iron: 3 });
    assert.equal(wreck.data.scanLabel, 'Freight-Laced Hulk');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('a near-empty carry leaves no residue — the manifest pod already took it all', () => {
  const h = boot();
  try {
    const marker = killAt(h, 43, 'hauler_freighter', {
      defId: 'ship_hauler',
      shipClass: 'hauler',
      name: 'Lightfoot',
      cargoManifest: manifest([{ commodityId: 'cmdty_ore_iron', qty: 2 }]),
    });
    assert.equal(marker.manifestResidue, null, 'floor(2 * 0.3) = 0 — nothing scoured loose');
    assert.deepEqual(marker.salvagePool, { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 },
      'generic residue unchanged for a hull whose freight died with it');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('the residue cap bounds a rich hold: first line in canonical order wins', () => {
  const h = boot();
  try {
    const marker = killAt(h, 44, 'hauler_freighter', {
      defId: 'ship_hauler',
      shipClass: 'hauler',
      name: 'Deephold',
      cargoManifest: manifest([
        { commodityId: 'cmdty_medical', qty: 20 },
        { commodityId: 'cmdty_ore_iron', qty: 30 },
      ]),
    });
    // floor(20*0.3)=6 capped to 4 for cmdty_medical; the ore line gets nothing.
    assert.deepEqual(marker.manifestResidue, { cmdty_medical: 4 });
    assert.deepEqual(marker.salvagePool, { cmdty_scrap_metal: 1, cmdty_medical: 4 });
  } finally {
    aftermathWrecks.destroy();
  }
});

test('manifest-less and military kills keep their class pools', () => {
  const h = boot();
  try {
    const fighter = killAt(h, 45, 'corsair_raider', { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Red Wake' });
    assert.equal(fighter.manifestResidue, null);
    assert.deepEqual(fighter.salvagePool, { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 });

    const drone = killAt(h, 46, 'combat_drone', { defId: 'drone_wasp', shipClass: 'drone' });
    assert.deepEqual(drone.salvagePool, { cmdty_scrap_metal: 2, cmdty_ore_iron: 1 });

    const patrol = killAt(h, 47, 'patrol_cutter', { defId: 'ship_patrol', shipClass: 'patrol', name: 'Stern Watch' });
    assert.deepEqual(patrol.salvagePool, { cmdty_scrap_metal: 2, cmdty_salvage_electronics: 2 });

    // A manifest that itself carried scrap must not swallow the +1 hull scrap — it is additive.
    const scrapCarrier = killAt(h, 48, 'hauler_freighter', {
      defId: 'ship_hauler',
      shipClass: 'hauler',
      name: 'Junkline',
      cargoManifest: manifest([{ commodityId: 'cmdty_scrap_metal', qty: 10 }]),
    });
    assert.deepEqual(scrapCarrier.salvagePool, { cmdty_scrap_metal: 4 }, 'floor(3) residue + 1 hull scrap');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('residue survives the save round trip and legacy markers keep their pools', () => {
  const h = boot();
  try {
    const marker = killAt(h, 48, 'hauler_freighter', {
      defId: 'ship_hauler',
      shipClass: 'hauler',
      name: 'Keepsake',
      cargoManifest: manifest([{ commodityId: 'cmdty_ore_iron', qty: 10 }]),
    });
    const bag = aftermathWrecks.serialize();
    aftermathWrecks.deserialize(JSON.parse(JSON.stringify(bag)));
    const restored = aftermathForSector(h.state, SECTOR_ID).find((m) => m.markerId === marker.markerId);
    assert.ok(restored, 'marker restored');
    assert.deepEqual(restored.manifestResidue, { cmdty_ore_iron: 3 });
    assert.deepEqual(restored.salvagePool, { cmdty_scrap_metal: 1, cmdty_ore_iron: 3 });

    // A pre-unit legacy marker (no residue field) rebuilds its generic pool, never throws.
    delete restored.manifestResidue;
    restored.salvagePool = undefined;
    const legacy = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    aftermathWrecks.deserialize(legacy);
    const again = aftermathForSector(h.state, SECTOR_ID).find((m) => m.markerId === marker.markerId);
    assert.deepEqual(again.salvagePool, { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 });
  } finally {
    aftermathWrecks.destroy();
  }
});

test('the contested wreck feeds the scavenger the real freight, not just scrap', () => {
  const h = boot();
  try {
    const marker = killAt(h, 49, 'hauler_freighter', {
      defId: 'ship_hauler',
      shipClass: 'hauler',
      name: 'Paydirt',
      cargoManifest: manifest([{ commodityId: 'cmdty_ore_iron', qty: 10 }]),
    });
    h.state.simTime = 601; // born at simTime 1 (killAt ticks once): age reaches WRECK_ECOLOGY_DAY_S
    aftermathWrecks.update(1 / 60, h.state);
    const scav = h.state.entityList.find((e) => e.data && e.data.wreckEcologyRole === 'scavenger');
    assert.ok(scav, 'ecology scavenger spawned');
    const wreck = h.state.entityList.find((e) => e.type === 'wreck' && e.alive !== false
      && e.data && e.data.markerId === marker.markerId);
    scav.pos.x = wreck.pos.x + 3;
    scav.pos.z = wreck.pos.z;
    h.state.simTime += 5;
    aftermathWrecks.update(1 / 60, h.state);
    assert.equal(scav.data.cargo.items.cmdty_ore_iron, 1,
      'the first stripped unit is freight (canonical order), not hull scrap');
  } finally {
    aftermathWrecks.destroy();
  }
});
