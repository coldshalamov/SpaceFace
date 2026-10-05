// PQ-047 residual — a second convoy hauler's cargo must not vanish.
//
// Source: design/program/roadmap/receipts/PQ-047-composition-REPORT.md §Follow-ups — custody
// stamps land on every hauler but death-spill routed only the selected target, so a second
// hauler's cargo was deleted with the hull that was not the raid's target. This fixture runs a
// real authored size-2 predation convoy (329 curtain_convoy) on seed 4242 and drives the kills
// through the production combat owner: whichever hauler dies, ITS custody-stamped manifest
// spills as loose grabbable pods through the one existing spill writer (spawnFreightCargo),
// and neither kill strands the other hauler's freight.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });
const SEED = 4242;

function boot(seed = SEED) {
  // Production listener order matters: combat owns kills, civilian recovery sees them before the
  // encounter observer, and cargo owns player pickup acceptance before the custody observer.
  const systems = [combat, surrenderRecovery, cargo, spawnBudget, encounterDirector, actions];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, name: 'Tethys Hub' }],
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 200, hullMax: 200,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts',
    pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, radius: 42,
    data: { stationId: STATION_ID, factionId: 'faction_mts', sectorId: SECTOR_ID, dockRadius: 72 },
  });
  const names = [
    'freight:cargoSpilled', 'freight:custodyChanged', 'freight:manifestRemaining',
    'freight:custodyReceipt', 'loot:drop', 'pickup:collected', 'encounter:predationCleared',
  ];
  const events = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => events[name].push(structuredClone(payload)));
  return {
    sim,
    state,
    bus,
    player,
    events,
    director: sim.registry.get('encounterDirector'),
  };
}

function fire(h, suffix) {
  const encounterId = `pq047-residual:hauler-death-spill${suffix}`;
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId });
  const live = h.state.encounterDirector.live[encounterId];
  assert.ok(live, 'the authored curtain convoy was admitted');
  return live;
}

function haulers(h, live) {
  const list = h.director.entsOf(live, 'hauler');
  assert.equal(list.length, 2, 'the authored convoy flies two manifest haulers');
  return list;
}

function kill(h, entity, killerId) {
  h.sim.registry.get('combat').kill(entity, killerId);
}

function livePods(h, live) {
  return live.ids
    .filter((id) => live.roles[id] === 'freight_pod')
    .map((id) => h.state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false);
}

function assertConserved(record) {
  const livePodQty = record.pods.reduce((sum, pod) => sum + (pod.status === 'live' ? pod.qty : 0), 0);
  assert.equal(
    record.carrierQty + livePodQty + record.playerCollectedQty + record.raiderSecuredQty
      + record.stationRecoveredQty + record.deliveredQty + record.lostQty,
    record.initialQty,
    `custody record ${record.custodyId} conserved its manifest`,
  );
}

function spilledFor(h, manifestId) {
  return h.events['freight:cargoSpilled'].filter((event) => event.manifestId === manifestId);
}

function grabByPlayer(h, pod) {
  const payload = {
    pickupId: pod.id,
    collectorId: h.state.playerId,
    kind: pod.data.kind,
    amount: pod.data.amount,
    commodityId: pod.data.commodityId,
    pos: { x: pod.pos.x, z: pod.pos.z },
  };
  const before = h.state.player.cargo.items[pod.data.commodityId] || 0;
  h.bus.emit('pickup:collected', payload);
  const accepted = payload.acceptedAmount == null ? pod.data.amount : payload.acceptedAmount;
  if (accepted > 0) pod.alive = false;
  return { accepted, delta: (h.state.player.cargo.items[pod.data.commodityId] || 0) - before };
}

test('a size-2 predation convoy stamps custody on both haulers with distinct per-hauler manifests', () => {
  const h = boot();
  const live = fire(h, ':stamps');
  const [a, b] = haulers(h, live);

  for (const hauler of [a, b]) {
    const data = hauler.data;
    assert.equal(data.freightRewardOwner, 'manifest_custody');
    assert.equal(data.freightCustody.status, 'carrier');
    assert.equal(data.freightCustody.carrierId, hauler.id);
    assert.ok(data.cargoManifest.totalQty > 0, 'each hauler carries authored freight');
    assert.equal(data.cargoManifest.totalQty, data.cargoManifest.lines[0].qty);
  }
  assert.notEqual(a.data.cargoManifest.manifestId, b.data.cargoManifest.manifestId,
    'multi-hauler convoys mint one manifest per carrier');
  assert.equal(h.state.entities.get(live.data.predationTargetId), a,
    'the raid selects one stable carrier');
});

test('kill hauler B then A: each spills its own custody-stamped cargo and neither strands the other', () => {
  const h = boot();
  const live = fire(h, ':b-then-a');
  const [carrierA, haulerB] = haulers(h, live);
  const manifestA = carrierA.data.cargoManifest;
  const manifestB = haulerB.data.cargoManifest;
  const manifestBQty = manifestB.lines[0].qty;
  assert.equal(h.state.entities.get(live.data.predationTargetId), carrierA);

  // Kill B — the hauler the raid was NOT pointed at. Its cargo must spill, not vanish.
  kill(h, haulerB, h.player.id);
  assert.equal(haulerB.alive, false);
  const spillsB = spilledFor(h, manifestB.manifestId);
  assert.equal(spillsB.length, 1, 'exactly one B spill through the custody writer');
  assert.equal(spillsB[0].carrierId, haulerB.id);
  assert.equal(spillsB[0].cause, 'carrier_destroyed');
  assert.ok(spillsB[0].qty > 0);
  assert.equal(spillsB[0].qty, manifestBQty,
    'the spill books exactly the dead hauler authored manifest quantity');

  const bPods = livePods(h, live);
  assert.ok(bPods.length >= 1, 'B spilled loose pods you can fly to');
  const bSpillQty = bPods.reduce((sum, pod) => sum + pod.data.amount, 0);
  assert.equal(bSpillQty, spillsB[0].qty, 'B pods carry exactly the spilled manifest quantity');
  for (const pod of bPods) {
    assert.equal(pod.data.commodityId, manifestB.lines[0].commodityId,
      'B pods carry B commodities, not aggregate convoy freight');
    assert.equal(pod.data.freightCustodyPod.manifestId, manifestB.manifestId);
    assert.equal(pod.data.freightCustodyPod.carrierIdentityKey, haulerB.data.freightCustody.carrierIdentityKey);
    assert.equal(pod.data.freightCustodyPod.custodySourceKind, 'lawful_carrier',
      'a civilian convoy hauler spills titled freight');
    assert.equal(pod.flags.persistent, true, 'B pods survive on their own authored TTL');
  }

  // The existing custody writer kept its ledger: a terminal side record conserved B's manifest,
  // and the raid's selected-carrier slot record was not displaced or invented.
  const sideRecord = live.data.freightSideCustody[haulerB.data.freightCustody.carrierIdentityKey];
  assert.ok(sideRecord, 'B custody ran through the encounter custody stack (side record)');
  assert.equal(sideRecord.terminal, true);
  assert.equal(sideRecord.outcome, 'carrier_destroyed');
  assert.equal(sideRecord.carrierQty, 0);
  assertConserved(sideRecord);
  assert.equal(haulerB.data.freightCustody.status, 'spilled',
    'the spill flips the dead hauler custody stamp exactly once');
  assert.equal(live.data.freightCargoCustody, undefined,
    'the raid slot stays free for the selected carrier');
  assert.equal(live.data.predationTargetId, carrierA.id,
    "B's death does not end the predation relation on A");
  assert.equal(h.events['encounter:predationCleared'].length, 0,
    "spilling B must not tear down the live raid on the selected carrier");

  // The player can grab B's spill through the real pickup seam.
  const grabbed = grabByPlayer(h, bPods[0]);
  assert.equal(grabbed.accepted, bPods[0].data.amount, 'the pod is fully collectable');
  assert.ok(grabbed.delta > 0, 'a grabbed B pod lands in player cargo');

  // Kill A — the selected target. Its own manifest spills into the raid's slot record.
  kill(h, carrierA, h.player.id);
  const spillsA = spilledFor(h, manifestA.manifestId);
  assert.equal(spillsA.length, 1, 'exactly one A spill through the custody writer');
  assert.equal(spillsA[0].carrierId, carrierA.id);
  assert.notEqual(spillsA[0].custodyId, spillsB[0].custodyId, 'one custody chain per hauler');
  const recordA = live.data.freightCargoCustody;
  assert.ok(recordA, "A's custody record occupies the raid slot after its death");
  assert.equal(recordA.carrierId, carrierA.id);
  assert.equal(recordA.manifestId, manifestA.manifestId);
  assertConserved(recordA);
  const aPods = livePods(h, live).filter((pod) => pod.data.freightCustodyPod.manifestId === manifestA.manifestId);
  assert.ok(aPods.length >= 1, 'A spilled its own loose pods');
  assert.equal(aPods.reduce((sum, pod) => sum + pod.data.amount, 0), spillsA[0].qty);

  // Neither kill strands the other's freight: both chains' pods are still live bodies.
  const remaining = livePods(h, live);
  const qtyByManifest = new Map();
  for (const pod of remaining) {
    const key = pod.data.freightCustodyPod.manifestId;
    qtyByManifest.set(key, (qtyByManifest.get(key) || 0) + pod.data.amount);
  }
  assert.ok((qtyByManifest.get(manifestA.manifestId) || 0) > 0, "A's freight is still on the field");
  assert.ok((qtyByManifest.get(manifestB.manifestId) || 0) > 0, "B's freight is still on the field");
  assert.equal(h.events['loot:drop'].length, 0,
    'manifest cargo exists only as custody pods, never the archetype loot roll');
});

test('kill A then B: the same writer serves both orders and B never strands A freight', () => {
  const h = boot();
  const live = fire(h, ':a-then-b');
  const [carrierA, haulerB] = haulers(h, live);
  const manifestA = carrierA.data.cargoManifest;
  const manifestB = haulerB.data.cargoManifest;

  kill(h, carrierA, h.player.id);
  const recordA = live.data.freightCargoCustody;
  assert.ok(recordA && recordA.carrierId === carrierA.id);
  assert.equal(spilledFor(h, manifestA.manifestId).length, 1);

  kill(h, haulerB, h.player.id);
  const spillsB = spilledFor(h, manifestB.manifestId);
  assert.equal(spillsB.length, 1, "killing B after A still spills B's own cargo");
  const sideRecord = live.data.freightSideCustody[haulerB.data.freightCustody.carrierIdentityKey];
  assert.ok(sideRecord && sideRecord.terminal, 'B custody settled through the same stack');
  assertConserved(sideRecord);
  assertConserved(recordA);

  const remaining = livePods(h, live);
  const aQty = remaining
    .filter((pod) => pod.data.freightCustodyPod.manifestId === manifestA.manifestId)
    .reduce((sum, pod) => sum + pod.data.amount, 0);
  const bQty = remaining
    .filter((pod) => pod.data.freightCustodyPod.manifestId === manifestB.manifestId)
    .reduce((sum, pod) => sum + pod.data.amount, 0);
  assert.ok(aQty > 0, "B's death did not strand A's spilled freight");
  assert.ok(bQty > 0, "A's death did not strand B's spilled freight");

  // Duplicate kill events cannot re-spill: the custody writer's own guards hold.
  h.bus.emit('entity:killed', { id: haulerB.id, killerId: h.player.id, pos: { x: 0, z: 0 } });
  h.bus.emit('entity:killed', { id: carrierA.id, killerId: h.player.id, pos: { x: 0, z: 0 } });
  assert.equal(spilledFor(h, manifestA.manifestId).length, 1);
  assert.equal(spilledFor(h, manifestB.manifestId).length, 1);

  // Every spill in this file came out of the encounter custody writer: each cargoSpilled names a
  // custody chain minted by the encounter (fm_encounter_*), not a parallel spill system.
  for (const event of [...spilledFor(h, manifestA.manifestId), ...spilledFor(h, manifestB.manifestId)]) {
    assert.match(event.custodyId, /^fm_encounter_.*:custody:/);
  }

  // A's open chain still settles through the ordinary custody window machinery.
  recordA.deadlineAt = h.state.simTime;
  h.sim.runTicks(61);
  assert.equal(recordA.terminal, true);
  assert.equal(h.events['freight:custodyReceipt'].length, 2,
    'each hauler custody chain settled with exactly one terminal receipt');
});
