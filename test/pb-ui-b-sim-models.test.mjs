// PB-UI-B row 148 — SF-243 + SF-244 + SF-245 SIM HALVES.
//
// Focused proof for the three pure models under src/ui/sim/ that a screen consumes:
//   • SF-243 custodyProjection  — the projection matches the cargo custody truth at the query
//     moment (hold / operation shipment / physical pod), operation cargo is never sellable as
//     personal cargo, a read never mints state, and unavailable custody is not zero stock.
//   • SF-244 stableSelection    — a selection keyed to stable world identity survives entity
//     replacement; a recycled transient id closes the selection instead of pointing at the
//     recycled body.
//   • SF-245 discoveryKnowledge — knowledge, not world truth: undiscovered facts never appear,
//     sub-exact tiers never carry a position, and `exactPos` on a raw bearing record never leaks.
//
// Deterministic by construction: hand-built states, no Math.random, no wall clock. The models are
// pure readers — a full-state JSON snapshot must be byte-identical across every projection call.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  custodyTotals,
  personalSellableQty,
  projectCargoCustody,
} from '../src/ui/sim/custodyProjection.js';
import {
  captureEntitySelection,
  refreshEntitySelection,
  resolveEntitySelection,
  selectionKeyForEntity,
  stampMatchesEntity,
} from '../src/ui/sim/stableSelection.js';
import {
  canNavigateToKnowledge,
  discoveryKnowledge,
  knowledgeById,
} from '../src/ui/sim/discoveryKnowledge.js';

const SEED = 20261002;

function makeState() {
  const entities = new Map();
  const state = {
    meta: { seed: SEED },
    simTime: 5000,
    playerId: 1,
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 60 },
      uniqueWrecks: { bearings: {} },
    },
    entities,
    entityList: null,
    missions: { active: [] },
    automation: { drones: [] },
    sites: { byId: {} },
    world: { currentSectorId: 'sector_a', scanPings: {}, frontierRumors: { byId: {} } },
    scanReveal: { investigated: {}, milestones: {} },
    story: {},
  };
  return state;
}

function addPod(state, id, commodityId, amount, pos, ownerId = 1) {
  const pod = {
    id,
    type: 'payload',
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    factionId: 'player',
    data: {
      kind: 'cargo',
      payloadType: 'jettisoned_cargo',
      jettisonedCargo: true,
      commodityId,
      amount,
      ownerId,
    },
  };
  state.entities.set(id, pod);
  return pod;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// SF-243 — custody projection
// ───────────────────────────────────────────────────────────────────────────────────────────────

test('SF-243: projection matches custody truth at the query moment', () => {
  const state = makeState();
  state.player.cargo.items = { cmdty_ore: 30, cmdty_meds: 4 };
  state.sites.byId = {
    site_1: {
      id: 'site_1', name: 'Belt Claim',
      shipment: { id: 'shipment:site_1', owner: 'operation:site_1', items: { cmdty_ore: 12 }, deliveryState: 'loading' },
    },
  };
  state.automation.drones = [{
    id: 'drone_1', defId: 'drone_hauler',
    shipment: { id: 'shipment:drone_1', owner: 'operation:drone_1', items: { cmdty_ore: 5 }, deliveryState: 'loading' },
  }];
  addPod(state, 501, 'cmdty_ore', 7, { x: 10, z: 20 });
  addPod(state, 502, 'cmdty_ore', 3, { x: -5, z: 8 }, 7);

  const projection = projectCargoCustody(state);
  const totals = custodyTotals(state, 'cmdty_ore');

  // Folded totals equal the source sums exactly.
  assert.deepEqual(totals, { hold: 30, holdSellable: 30, operation: 17, pod: 10, total: 57 });
  assert.equal(custodyTotals(state, 'cmdty_meds').total, 4);

  // Each custody location is a distinct lot with the truthful holder and quantity.
  const oreLots = projection.lots.filter((lot) => lot.commodityId === 'cmdty_ore');
  assert.equal(oreLots.length, 5); // 1 hold + 2 operation shipments + 2 pods
  const holdLot = oreLots.find((lot) => lot.custody === 'hold');
  const siteLot = oreLots.find((lot) => lot.custody === 'operation' && lot.holder.id === 'operation:site_1');
  const droneLot = oreLots.find((lot) => lot.custody === 'operation' && lot.holder.id === 'operation:drone_1');
  const pods = oreLots.filter((lot) => lot.custody === 'pod');
  assert.equal(holdLot.qty, 30);
  assert.equal(siteLot.qty, 12);
  assert.equal(droneLot.qty, 5);
  assert.deepEqual(pods.map((p) => p.qty).sort(), [3, 7]);
  // The pod lot copies the live position (a later sim move cannot rewrite the projected row).
  assert.deepEqual(pods.find((p) => p.key === 'pod:501:cmdty_ore').pos, { x: 10, z: 20 });
});

test('SF-243: operation cargo is never sellable as personal cargo; pods must be recovered', () => {
  const state = makeState();
  state.player.cargo.items = { cmdty_ore: 30 };
  state.sites.byId = {
    site_1: {
      id: 'site_1', name: 'Belt Claim',
      shipment: { id: 'shipment:site_1', owner: 'operation:site_1', items: { cmdty_ore: 12 }, deliveryState: 'loading' },
    },
  };
  addPod(state, 501, 'cmdty_ore', 7, { x: 1, z: 2 });

  const projection = projectCargoCustody(state);
  const oreLots = projection.lots.filter((lot) => lot.commodityId === 'cmdty_ore');
  for (const lot of oreLots) {
    if (lot.custody === 'hold') {
      assert.equal(lot.sellable, true);
      assert.equal(lot.sellableQty, 30);
      assert.equal(lot.recoverable, false);
    } else {
      assert.equal(lot.sellable, false, `${lot.custody} cargo must not read as sellable personal cargo`);
      assert.equal(lot.sellableQty, 0);
    }
  }
  assert.equal(oreLots.find((lot) => lot.custody === 'pod').recoverable, true);
  // The personal-sellable read counts ONLY the hold's own reader, never operation or pod stock.
  assert.equal(personalSellableQty(state, 'cmdty_ore'), 30);
  assert.equal(custodyTotals(state, 'cmdty_ore').operation, 12);
});

test('SF-243: sealed contract freight is unavailable custody, not zero stock', () => {
  const state = makeState();
  state.player.cargo.items = { cmdty_alloy: 10 };
  // A preloaded contract seals 6 of the 10 held units.
  state.missions.active = [{
    id: 'm1', status: 'active', preloadedCargo: true,
    params: { cmdtyId: 'cmdty_alloy', qty: 6 },
  }];
  const holdLot = projectCargoCustody(state).lots.find((lot) => lot.commodityId === 'cmdty_alloy');
  assert.equal(holdLot.qty, 10); // still aboard
  assert.equal(holdLot.sellableQty, 4); // only the unsealed remainder may be sold
  assert.equal(holdLot.sellable, true);
  assert.match(holdLot.note, /sealed/);
  assert.equal(personalSellableQty(state, 'cmdty_alloy'), 4);
});

test('SF-243: a projection read never writes state and never mints shipments', () => {
  const state = makeState();
  state.player.cargo.items = { cmdty_ore: 5 };
  state.sites.byId = {
    loaded: { id: 'loaded', shipment: { id: 'shipment:loaded', owner: 'operation:loaded', items: { cmdty_ore: 2 } } },
    // A group WITHOUT a shipment: cargoCustody.ensureShipment would mint one — a read must not.
    empty: { id: 'empty' },
  };
  state.automation.drones = [{ id: 'drone_1', defId: 'drone_hauler' }];
  const before = JSON.stringify(state);
  projectCargoCustody(state);
  custodyTotals(state, 'cmdty_ore');
  personalSellableQty(state, 'cmdty_ore');
  assert.equal(JSON.stringify(state), before, 'custody projection is read-only');
  assert.equal(state.sites.byId.empty.shipment, undefined);
  assert.equal(state.automation.drones[0].shipment, undefined);
});

test('SF-243: state changes underneath are reflected at the next query moment', () => {
  const state = makeState();
  state.player.cargo.items = { cmdty_ore: 30 };
  addPod(state, 501, 'cmdty_ore', 7, { x: 0, z: 0 });
  assert.equal(custodyTotals(state, 'cmdty_ore').pod, 7);

  // The selected pod is destroyed while the transfer decision is open: the projection no longer
  // claims it, and the hold total tracks the writer's truth exactly.
  state.entities.get(501).alive = false;
  state.player.cargo.items.cmdty_ore = 22;
  const totals = custodyTotals(state, 'cmdty_ore');
  assert.equal(totals.hold, 22);
  assert.equal(totals.pod, 0);
  assert.equal(totals.total, 22);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// SF-244 — stable-identity selection
// ───────────────────────────────────────────────────────────────────────────────────────────────

test('SF-244: a recycled transient id closes the selection instead of redirecting', () => {
  const state = makeState();
  const mule = {
    id: 47, type: 'ship', alive: true, factionId: 'faction_haul',
    data: { role: 'hauler', name: 'Mule', kind: 'ship' },
    pos: { x: 10, z: 10 },
  };
  state.entities.set(47, mule);

  const selection = captureEntitySelection(mule);
  assert.equal(selection.durable, false);
  assert.equal(selection.key, 'entity:47');
  assert.equal(resolveEntitySelection(state, selection), mule);

  // The hull dies; the core recycles id 47 onto an unrelated body.
  state.entities.delete(47);
  const ravager = {
    id: 47, type: 'ship', alive: true, factionId: 'faction_raider',
    data: { role: 'pirate', name: 'Ravager', kind: 'ship' },
    pos: { x: 900, z: -300 },
  };
  state.entities.set(47, ravager);

  // The recycled id is NOT the selected target: the selection closes (null), never redirects.
  assert.equal(resolveEntitySelection(state, selection), null);
  assert.equal(refreshEntitySelection(state, selection), null);
});

test('SF-244: the stamp catches a same-type same-role recycler, too', () => {
  const mule = {
    id: 9, type: 'ship', alive: true, factionId: 'faction_haul',
    data: { role: 'hauler', name: 'Mule', kind: 'ship' },
  };
  const selection = captureEntitySelection(mule);
  // Even a near-identical body on the recycled id fails the name descriptor.
  const muleTwo = {
    id: 9, type: 'ship', alive: true, factionId: 'faction_haul',
    data: { role: 'hauler', name: 'Mule II', kind: 'ship' },
  };
  assert.equal(stampMatchesEntity(muleTwo, selection.stamp), false);
  // ...and the genuine survivor passes.
  assert.equal(stampMatchesEntity(mule, selection.stamp), true);
});

test('SF-244: a station selection survives entity replacement by stable station id', () => {
  const state = makeState();
  const helios = {
    id: 12, type: 'station', alive: true,
    data: { stationId: 'station_helios', name: 'Helios Station' },
    pos: { x: 0, z: 0 },
  };
  state.entities.set(12, helios);
  const selection = captureEntitySelection(helios);
  assert.equal(selection.durable, true);
  assert.equal(selection.key, 'station:station_helios');

  // Instance swap: id 12 is recycled by a ship; the station rematerializes as id 99.
  state.entities.delete(12);
  state.entities.set(12, { id: 12, type: 'ship', alive: true, data: { role: 'hauler' } });
  const heliosTwo = {
    id: 99, type: 'station', alive: true,
    data: { stationId: 'station_helios', name: 'Helios Station' },
    pos: { x: 0, z: 0 },
  };
  state.entities.set(99, heliosTwo);

  // The selection follows the identity, not the instance id.
  assert.equal(resolveEntitySelection(state, selection), heliosTwo);
  const rebound = refreshEntitySelection(state, selection);
  assert.equal(rebound.entityId, 99);
  assert.equal(resolveEntitySelection(state, rebound), heliosTwo);
});

test('SF-244: a world-record selection survives rematerialization and uses the live index', () => {
  const state = makeState();
  const wreck = { id: 20, type: 'wreck', alive: true, data: { worldRecordId: 'wr_lung' } };
  state.entities.set(20, wreck);
  const selection = captureEntitySelection(wreck);
  assert.equal(selection.key, 'record:wr_lung');

  state.entities.delete(20);
  const wreckTwo = { id: 21, type: 'wreck', alive: true, data: { worldRecordId: 'wr_lung' } };
  state.entities.set(21, wreckTwo);
  assert.equal(resolveEntitySelection(state, selection), wreckTwo);
});

test('SF-244: destroyed durable identity and missing targets close cleanly', () => {
  const state = makeState();
  const wreck = { id: 20, type: 'wreck', alive: true, data: { worldRecordId: 'wr_lung' } };
  state.entities.set(20, wreck);
  const selection = captureEntitySelection(wreck);
  state.entities.delete(20);
  assert.equal(resolveEntitySelection(state, selection), null);
  assert.equal(refreshEntitySelection(state, selection), null);
  // Malformed input fails closed.
  assert.equal(resolveEntitySelection(state, null), null);
  assert.equal(resolveEntitySelection(state, {}), null);
  assert.equal(selectionKeyForEntity(null), null);
  assert.equal(selectionKeyForEntity({ id: 3, type: 'ship', alive: true, data: {} }), null);
  assert.equal(captureEntitySelection(null), null);
});

test('SF-244: the station index answers before a scan, and a dead index row fails to scan', () => {
  const state = makeState();
  const helios = { id: 12, type: 'station', alive: true, data: { stationId: 'station_helios' } };
  state.entities.set(12, helios);
  state.entityIndex = { byStationId: new Map([['station_helios', helios]]) };
  const selection = captureEntitySelection(helios);
  assert.equal(resolveEntitySelection(state, selection), helios);
  // A stale index row (dead instance) must not answer over the live entity list.
  state.entities.set(12, { id: 12, type: 'ship', alive: true, data: { role: 'hauler' } });
  const heliosTwo = { id: 55, type: 'station', alive: true, data: { stationId: 'station_helios' } };
  state.entities.set(55, heliosTwo);
  assert.equal(resolveEntitySelection(state, selection), heliosTwo);
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// SF-245 — discovery knowledge (knowledge, not world truth)
// ───────────────────────────────────────────────────────────────────────────────────────────────

test('SF-245: a rumored bearing never exposes the exact position the record carries', () => {
  const state = makeState();
  state.player.uniqueWrecks.bearings['wreck_vigilant'] = {
    wreckId: 'wreck_vigilant',
    name: 'The Vigilant',
    sectorId: 'sector_a',
    phase: 'rumored',
    bearingCenter: { x: 100, z: 200 },
    radius: 150,
    // World truth sits on the raw record — the knowledge row must never copy it.
    exactPos: { x: 123, z: 222 },
    fixedPos: null,
  };
  const entry = knowledgeById(state, 'uniqueWreck:wreck_vigilant');
  assert.ok(entry, 'a heard bearing is knowledge the player earned');
  assert.equal(entry.tier, 'bearing');
  assert.equal(entry.exact, false);
  assert.deepEqual(entry.center, { x: 100, z: 200 });
  assert.equal(entry.radius, 150);
  assert.equal(entry.pos, null);
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('123'), 'exact x must not leak through any row field');
  assert.ok(!serialized.includes('222'), 'exact z must not leak through any row field');
  assert.ok(!/exactPos|fixedPos/.test(serialized), 'raw record fields must not leak through any row field');
  assert.equal(canNavigateToKnowledge(entry), false);
});

test('SF-245: only an earned fix upgrades to an exact, navigable entry', () => {
  const state = makeState();
  const record = {
    wreckId: 'wreck_vigilant',
    name: 'The Vigilant',
    sectorId: 'sector_a',
    bearingCenter: { x: 100, z: 200 },
    radius: 150,
    exactPos: { x: 123, z: 222 },
    fixedPos: null,
  };
  state.player.uniqueWrecks.bearings['wreck_vigilant'] = record;

  // Half-fixed record (phase moved, fix not earned yet): fails closed to a bearing — exactPos
  // must not silently become the position.
  record.phase = 'fixed';
  let entry = knowledgeById(state, 'uniqueWreck:wreck_vigilant');
  assert.equal(entry.tier, 'bearing');
  assert.equal(entry.pos, null);
  assert.equal(canNavigateToKnowledge(entry), false);

  // The player pulses the scanner in range and the canonical owner stamps fixedPos: now exact.
  record.fixedPos = { x: 130, z: 210 };
  entry = knowledgeById(state, 'uniqueWreck:wreck_vigilant');
  assert.equal(entry.tier, 'exact');
  assert.equal(entry.exact, true);
  assert.deepEqual(entry.pos, { x: 130, z: 210 });
  assert.equal(canNavigateToKnowledge(entry), true);
});

test('SF-245: purchased rumors are actionable circles until the player confirms them', () => {
  const state = makeState();
  state.world.frontierRumors.byId = {
    rumor_cache: {
      id: 'rumor_cache', kind: 'cache', kindLabel: 'Supply Cache',
      sectorId: 'sector_a', phase: 'rumored',
      bearingCenter: { x: -40, z: 70 }, radius: 220,
      // Raw records may carry more; the whitelist is what a screen gets.
      targetGlobal: { x: -41, z: 71 },
    },
  };
  let entry = knowledgeById(state, 'rumor:rumor_cache');
  assert.equal(entry.tier, 'bearing');
  assert.equal(canNavigateToKnowledge(entry), false);
  let serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('-41') && !serialized.includes('71,'), 'rumor target coordinates must not leak');

  state.world.frontierRumors.byId.rumor_cache.phase = 'resolved';
  entry = knowledgeById(state, 'rumor:rumor_cache');
  assert.equal(entry.tier, 'resolved');
  assert.equal(entry.pos, null);
  serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('-41'), 'resolved rumor must not start granting coordinates');
});

test('SF-245: surveys name the sector, never the (recycled) entity id', () => {
  const state = makeState();
  state.scanReveal.investigated = {
    loss_9: { at: 100, sectorId: 'sector_a', entityId: 999 },
  };
  const entry = knowledgeById(state, 'survey:loss_9');
  assert.ok(entry);
  assert.equal(entry.tier, 'survey');
  assert.equal(entry.sectorId, 'sector_a');
  const serialized = JSON.stringify(entry);
  assert.ok(!/entityId/.test(serialized), 'a recycled sim id is provenance, not a place');
  assert.equal(canNavigateToKnowledge(entry), false);
});

test('SF-245: pings are approximate contacts, never exact targets', () => {
  const state = makeState();
  state.world.scanPings.sector_a = [{ id: 'p1', pos: { x: 12, z: 34 }, kind: 'unknown' }];
  const entry = knowledgeById(state, 'ping:sector_a:p1');
  assert.ok(entry);
  assert.equal(entry.tier, 'ping');
  assert.deepEqual(entry.pos, { x: 12, z: 34 });
  assert.equal(entry.exact, false);
  assert.equal(canNavigateToKnowledge(entry), false);
});

test('SF-245: undiscovered facts never appear — the model is knowledge, not world truth', () => {
  const state = makeState();
  // The world holds three things the player has NOT discovered.
  state.entities.set(999, { id: 999, type: 'wreck', alive: true, data: { worldRecordId: 'wr_hidden' } });
  state.entities.set(998, { id: 998, type: 'ship', alive: true, data: { role: 'pirate', name: 'Hidden hull' } });
  state.lossLedger = { bySector: { sector_a: [{ lossId: 'loss_secret', hull: 'Liner' }] } };

  const { entries } = discoveryKnowledge(state);
  assert.equal(entries.length, 0, 'no knowledge records means no knowledge entries');
  const serialized = JSON.stringify(entries);
  for (const secret of ['wr_hidden', 'loss_secret', 'Hidden hull', '999']) {
    assert.ok(!serialized.includes(secret), `undiscovered fact must not appear: ${secret}`);
  }
});

test('SF-245: entries are frozen snapshots — a screen cannot mutate the knowledge set', () => {
  const state = makeState();
  state.player.uniqueWrecks.bearings['wreck_a'] = {
    wreckId: 'wreck_a', name: 'A', sectorId: 'sector_a', phase: 'rumored',
    bearingCenter: { x: 1, z: 2 }, radius: 50, exactPos: { x: 3, z: 4 }, fixedPos: null,
  };
  const { entries } = discoveryKnowledge(state);
  assert.throws(() => { entries[0].tier = 'exact'; });
  assert.throws(() => { entries.push({ id: 'forged' }); });
  // And the underlying record keeps its truth untouched by the projection.
  assert.equal(state.player.uniqueWrecks.bearings.wreck_a.phase, 'rumored');
});
