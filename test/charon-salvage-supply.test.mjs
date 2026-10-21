import test from 'node:test';
import { mining } from '../src/systems/mining.js';
import { charonSupplyFacts, materializeCharonSupply, normalizeCharonSupply, charonSupplyPickupReceipt, settleCharonSupply, inheritCharonSupplySplit, ownsFiniteCharonSupplyManifest, bindRestoredCharonSupply } from '../src/world/charonSalvageSupply.js';
import assert from 'node:assert/strict';
import { ACTIVITY_POCKETS, ACTIVITY_POCKETS_BY_SECTOR, ACTIVITY_POCKET_SECTOR_IDS, LIVED_FRONTIER_SECTOR_IDS, LIVED_FRONTIER_SETS, activityActorSlotById, activityPocketById, activityPocketsForSector, activityRouteTopologyForSector, distanceFromPocketAnchor, routeTopologyClass } from '../src/data/sectorActivityPockets.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { TRAFFIC_ROLES, traffic } from '../src/systems/traffic.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
const SEED = 4242;
function enterSector(sectorId, beforeEnter = null) {
  const sectorDef = SECTORS.find(s => s.id === sectorId);
  assert.ok(sectorDef, `${sectorId} exists`);
  const systems = [spawnBudget, cargo, traffic, economy, factions, heat, encounterDirector, npcJobsRuntime, mining];
  const sim = createSimulation({
    seed: SEED,
    systems
  });
  const {
    state,
    bus
  } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  for (const station of SECTOR_ANCHORS[sectorId].stations) {
    sim.spawn({
      type: 'station',
      team: 2,
      pos: sectorLocalToGlobalForSector(station.pos, sectorId),
      radius: 42,
      mass: 1e6,
      data: {
        stationId: station.id,
        name: station.id
      }
    });
  }
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: sectorLocalToGlobalForSector({
      x: 0,
      z: -3200
    }, sectorId),
    vel: {
      x: 0,
      z: 0
    },
    hull: 200,
    hullMax: 200,
    radius: 6
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.onboarding = {
    active: false,
    finished: true
  };
  beforeEnter?.(sim, sim.registry.get('traffic'));
  bus.emit('sector:enter', {
    sectorId,
    sector: sectorDef
  });
  sim.runTicks(60);
  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = entity.data && entity.data.activityActorSlotId || rec.activityActorSlotId;
    if (slotId) bySlot.set(slotId, {
      rec,
      entity
    });
  }
  return {
    state,
    bySlot,
    sim,
    owner: sim.registry.get('traffic'),
    jobs: sim.registry.get('npcJobs') || sim.registry.get('npcJobsRuntime')
  };
}
test('Charon authored air source is physically materialized', () => {
  const {
    state,
    bySlot
  } = enterSector('sector_charon_expanse');
  assert.ok(bySlot.has('charon_colony_hauler'));
  assert.ok(bySlot.has('charon_colony_salvor'));
  assert.ok(state.entityList.find(e => e.alive && e.data?.activityObjectSlotId === 'charon_colony_air_pod'), 'original authored air source has a real body');
});
const source = f => f.state.entityList.find(e => e.alive && e.data?.activityObjectSlotId === 'charon_colony_air_pod');
const total = f => {
  const x = charonSupplyFacts(f.state);
  return x.loose + x.aboard + x.delivered + x.consumed + x.player + x.other + x.lost;
};
test('elapsed original commission jobs retain ownership until their real boundary; time alone never supplies the cutter', () => {
  const f = enterSector('sector_charon_expanse', (sim, owner) => {
    const original = owner._materializeAuthoredActivityCast;
    owner._materializeAuthoredActivityCast = function (...args) {
      const result = original.apply(this, args);
      for (const e of sim.state.entityList.filter(e => ['charon_colony_hauler', 'charon_colony_salvor'].includes(e.data?.activityActorSlotId))) {
        const rec = this.helpers.npcJobs.get(e.data.jobId);
        rec.job.progress = 0.25;
        rec.job.simTime = 0.5;
        rec.lastAdvanceSimT = 0.5;
      }
      return result;
    };
  });
  const b = f.state.traffic.charonSalvageSupply;
  const ids = [...f.bySlot.values()].map(x => x.entity.data.jobId);
  f.sim.runTicks(600);
  assert.equal(charonSupplyFacts(f.state).delivered, 0);
  assert.equal(charonSupplyFacts(f.state).loose, 6);
  assert.equal(materializeCharonSupply(f.owner), false);
  assert.equal(f.state.entityList.filter(e => e.alive && e.data?.activityObjectSlotId === 'charon_colony_air_pod').length, 1);
  assert.deepEqual([...f.bySlot.values()].map(x => x.entity.data.jobId), ids);
  assert.equal(total(f), 6);
  assert.deepEqual(normalizeCharonSupply(b), b);
});
test('ordinary player partial scoop debits original pod without taking the crew route', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f),
    player = f.state.entities.get(f.state.playerId);
  f.state.player.cargo.capVolume = 1;
  f.state.player.cargo.usedVolume = 0;
  assert.equal(f.sim.registry.get('mining')._collectPayload(p, player), true);
  assert.equal(p.data.amount, 5);
  assert.equal(charonSupplyFacts(f.state).player, 1);
  assert.equal(charonSupplyFacts(f.state).loose, 5);
  assert.equal(total(f), 6);
  assert.equal(materializeCharonSupply(f.owner), false);
});
test('real mining split preserves finite source quantity and rejects replayed child', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f);
  f.sim.registry.get('mining')._splitCargoPod(f.state.entities.get(f.state.playerId), p);
  const children = f.state.entityList.filter(e => e.alive && e.data?.charonSupplyPod && e !== p);
  assert.equal(p.alive, false);
  assert.ok(children.length > 0);
  assert.equal(children.reduce((n, e) => n + e.data.amount, 0), 6);
  assert.equal(total(f), 6);
  assert.equal(charonSupplyFacts(f.state).loose, 6);
  assert.equal(inheritCharonSupplySplit(f.state, p, children[0]), false);
  assert.equal(total(f), 6);
});
test('remote fabricated hauler receipt cannot consume source or supply recipient', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f),
    h = f.bySlot.get('charon_colony_hauler').entity;
  const receipt = {
    pickupId: p.id,
    collectorId: h.id,
    acceptedAmount: 6
  };
  assert.equal(charonSupplyPickupReceipt(f.owner, receipt), false);
  assert.equal(receipt.acceptedAmount, 0);
  assert.equal(charonSupplyFacts(f.state).aboard, 0);
  assert.equal(settleCharonSupply(f.owner), false);
  assert.equal(p.data.amount, 6);
});
test('malformed finite labels and foreign hulls do not suppress ordinary death salvage', () => {
  const f = enterSector('sector_charon_expanse'),
    h = f.bySlot.get('charon_colony_hauler').entity;
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, h), false);
  h.data.cargoManifest = {
    finiteSource: 'charon_colony_supply'
  };
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, h, true), false);
  h.data.cargoManifest = {
    finiteSource: 'charon_colony_supply',
    manifestId: `charon_colony_supply:${h.data.worldRecordId}`,
    freighterKey: h.data.worldRecordId,
    lotId: 'charon_colony_air_pod',
    totalQty: 0,
    lines: []
  };
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, h, true), true);
  const foreign = f.sim.spawn({
    type: 'ship',
    data: {
      ...h.data,
      activityActorSlotId: 'other'
    }
  });
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, foreign, true), false);
  h.data.cargoManifest.lines = [{
    commodityId: 'cmdty_consumer_goods',
    qty: 6
  }];
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, h, true), false);
});
test('save normalizer rejects quantity inflation and duplicate source leaves', () => {
  const f = enterSector('sector_charon_expanse'),
    b = f.owner.serialize().charonSalvageSupply;
  assert.ok(normalizeCharonSupply(b));
  const bad = structuredClone(b);
  bad.pods[0].loose++;
  assert.equal(normalizeCharonSupply(bad), null);
  const dup = structuredClone(b);
  dup.pods.push(dup.pods[0]);
  assert.equal(normalizeCharonSupply(dup), null);
});

// Save/Continue itself, not merely a JSON-copy assertion.
import { charonSupplySaveFixture } from './fixtures/charon-salvage-supply-save.mjs';
test('real Continue retains original staged source, partial recovery and no remint', () => {
  const f = charonSupplySaveFixture();
  try {
    const original = f.state.traffic.charonSalvageSupply;
    const p = f.source(),
      player = f.state.entities.get(f.state.playerId);
    f.state.player.cargo.capVolume = 1;
    f.state.player.cargo.usedVolume = 0;
    assert.equal(f.runtime.getSystem('mining')._collectPayload(p, player), true);
    assert.equal(charonSupplyFacts(f.state).player, 1);
    const envelope = f.save.serialize('charon-partial-original-air');
    assert.equal(f.save.loadEnvelope(envelope), true);
    assert.equal(charonSupplyFacts(f.state).original, 6);
    assert.equal(charonSupplyFacts(f.state).player, 1);
    assert.equal(charonSupplyFacts(f.state).loose, 5);
    assert.equal(f.source().data.amount, 5);
    assert.equal(f.state.traffic.charonSalvageSupply.haulerId, original.haulerId);
    assert.equal(materializeCharonSupply(f.owner), false);
    assert.equal(f.state.entityList.filter(e => e.alive && e.data?.activityObjectSlotId === 'charon_colony_air_pod').length, 1);
  } finally {
    f.close();
  }
});
import { charonSupplyDestroyed, consumeCharonSupply } from '../src/world/charonSalvageSupply.js';
const finiteManifest = (e, n) => ({
  finiteSource: 'charon_colony_supply',
  manifestId: `charon_colony_supply:${e.data.worldRecordId}`,
  freighterKey: e.data.worldRecordId,
  lotId: 'charon_colony_air_pod',
  totalQty: n,
  totalValue: 0,
  lines: n ? [{
    commodityId: 'cmdty_consumer_goods',
    qty: n
  }] : []
});
// Explicit lifecycle setup, not a claim of native collection or handoff.
function heldFixture(recipient = false) {
  const f = enterSector('sector_charon_expanse'),
    b = f.state.traffic.charonSalvageSupply,
    p = source(f),
    key = recipient ? 'charon_colony_salvor' : 'charon_colony_hauler',
    x = f.bySlot.get(key);
  p.alive = false;
  b.pods[0].loose = 0;
  b.pods[0][recipient ? 'delivered' : 'aboard'] = 6;
  b.phase = recipient ? 'delivered' : 'collect';
  f.owner.helpers.npcJobs.release(x.entity.data.jobId);
  x.entity.data.itinerary = {
    kind: 'charon_colony_supply',
    sourceId: 'charon_colony_air_pod'
  };
  b.haulerReady = b.salvorReady = true;
  f.owner._setTrafficManifest(x.entity, x.rec, finiteManifest(x.entity, 6));
  return {
    ...f,
    held: x.entity
  };
}
test('duplicate original actor identity cannot suppress ordinary salvage', () => {
  const f = heldFixture(),
    duplicate = f.sim.spawn({
      type: 'ship',
      data: structuredClone(f.held.data)
    });
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, duplicate), false);
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, f.held), false);
});
test('stale source destruction and foreign copied provenance cannot debit original', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f);
  charonSupplyDestroyed(f.owner, {
    entity: {
      ...p,
      hull: 0,
      data: structuredClone(p.data)
    },
    reason: 'destroyed'
  });
  assert.equal(charonSupplyFacts(f.state).loose, 6);
  const foreign = f.sim.spawn({
      type: 'payload',
      data: structuredClone(p.data)
    }),
    child = f.sim.spawn({
      type: 'pickup',
      data: {
        commodityId: 'cmdty_consumer_goods',
        amount: 2
      }
    });
  assert.equal(inheritCharonSupplySplit(f.state, foreign, child), false);
  assert.equal(p.data.amount, 6);
  assert.equal(total(f), 6);
});
test('stale player and foreign receipt source lives do not debit current pod', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f);
  for (const collectorId of [f.state.playerId, 99999]) {
    assert.equal(charonSupplyPickupReceipt(f.owner, {
      pickupId: p.id,
      collectorId,
      acceptedAmount: 1,
      amount: 6,
      richLotSource: structuredClone(p.data.richLotSource)
    }), false);
  }
  assert.equal(charonSupplyFacts(f.state).loose, 6);
});
test('invalid future-schema save with surviving original stock cannot remint', () => {
  const f = enterSector('sector_charon_expanse');
  f.state.traffic.charonSalvageSupply = normalizeCharonSupply({
    ...f.state.traffic.charonSalvageSupply,
    schema: 999
  });
  assert.equal(materializeCharonSupply(f.owner), false);
  assert.equal(f.state.entityList.filter(e => e.alive && e.data?.charonSupplyPod).reduce((n, e) => n + e.data.amount, 0), 6);
});
test('actual violence spill reconciles already-debited manifest and preserves spill title', () => {
  const f = heldFixture(),
    h = f.held;
  const child = f.owner._spillHaulerCargoFromViolence(h, f.state.entities.get(f.state.playerId));
  assert.ok(child);
  assert.equal(h.data.cargoManifest.totalQty, 5);
  assert.equal(charonSupplyFacts(f.state).aboard, 5);
  assert.equal(charonSupplyFacts(f.state).loose, 1);
  assert.ok(child.data.charonSupplyPod);
  assert.equal(total(f), 6);
  assert.notEqual(child.data.ownerId, null);
});
test('held reserve is consumed only after actual next-round admission and only once', () => {
  const f = heldFixture(true),
    r = f.held;
  assert.equal(consumeCharonSupply(f.owner), true);
  assert.ok(f.owner.helpers.npcJobs.get(r.data.jobId));
  assert.equal(r.data.cargoManifest.totalQty, 0);
  assert.equal(charonSupplyFacts(f.state).consumed, 6);
  assert.equal(charonSupplyFacts(f.state).delivered, 0);
  assert.equal(consumeCharonSupply(f.owner), false);
  assert.equal(total(f), 6);
  assert.equal(ownsFiniteCharonSupplyManifest(f.state, r), false);
});
test('failed next-round admission keeps physical reserve and its itinerary', () => {
  const f = heldFixture(true),
    r = f.held,
    assign = f.owner._assignActivityJob;
  f.owner._assignActivityJob = () => null;
  try {
    assert.equal(consumeCharonSupply(f.owner), false);
    assert.equal(r.data.cargoManifest.totalQty, 6);
    assert.equal(charonSupplyFacts(f.state).delivered, 6);
    assert.equal(charonSupplyFacts(f.state).consumed, 0);
    assert.equal(r.data.itinerary.kind, 'charon_colony_supply');
  } finally {
    f.owner._assignActivityJob = assign;
  }
});
import { reconcileCharonSupply } from '../src/world/charonSalvageSupply.js';
for (const recipient of [false, true]) for (const reverse of [false, true]) test(`real death owners conserve original six-unit ${recipient ? 'held recipient' : 'carrier'} reserve; loot first=${reverse}`, () => {
  const f = charonSupplySaveFixture();
  try {
    const b = f.state.traffic.charonSalvageSupply,
      e = f.state.entityList.find(e => e.alive && e.data?.activityActorSlotId === (recipient ? 'charon_colony_salvor' : 'charon_colony_hauler')),
      rec = f.state.traffic.freighters.find(x => x.id === e.id);
    f.source().alive = false;
    b.pods[0].loose = 0;
    b.pods[0][recipient ? 'delivered' : 'aboard'] = 6;
    b.phase = recipient ? 'delivered' : 'collect';
    f.owner._setTrafficManifest(e, rec, finiteManifest(e, 6));
    const aftermath = f.runtime.getSystem('aftermathWrecks');
    if (reverse) {
      f.runtime.bus.off('entity:killed', aftermath._onKilled);
      f.runtime.bus.on('entity:killed', aftermath._onKilled);
    }
    assert.equal(f.runtime.getSystem('combat').onHit({
      targetId: e.id,
      ownerId: null,
      damage: 100000,
      damageType: 'kinetic',
      pos: {
        ...e.pos
      }
    }).ok, true);
    reconcileCharonSupply(f.owner);
    const facts = charonSupplyFacts(f.state);
    assert.equal(facts.aboard + facts.delivered, 0);
    assert.equal(facts.loose + facts.lost, 6);
    const spills = f.state.entityList.filter(x => x.alive && x.data?.charonSupplyPod?.id.includes(':spill:'));
    assert.equal(spills.reduce((n, x) => n + x.data.amount, 0), 6);
    const markers = Object.values(f.state.aftermathWrecks.bySector).flat();
    assert.ok(markers.length);
    assert.ok(markers.every(m => !m.manifestResidue?.cmdty_consumer_goods));
  } finally {
    f.close();
  }
});
test('ordinary and mislabeled foreign cargo retain ordinary wreck salvage', () => {
  for (const foreign of [false, true]) {
    const f = charonSupplySaveFixture();
    try {
      const e = f.state.entityList.find(e => e.alive && e.data?.activityActorSlotId === 'charon_colony_hauler'),
        rec = f.state.traffic.freighters.find(x => x.id === e.id);
      const m = finiteManifest(e, 6);
      m.finiteSource = foreign ? 'charon_colony_supply' : 'ordinary';
      m.lotId = 'unrelated-load';
      f.owner._setTrafficManifest(e, rec, m);
      e.hull = 0;
      e.alive = false;
      f.runtime.getSystem('aftermathWrecks')._onKilled({
        id: e.id,
        type: 'ship',
        pos: {
          ...e.pos
        }
      });
      assert.ok(Object.values(f.state.aftermathWrecks.bySector).flat().some(m => m.manifestResidue?.cmdty_consumer_goods > 0));
    } finally {
      f.close();
    }
  }
});
test('used air history never spills again on cutter death', () => {
  const f = charonSupplySaveFixture();
  try {
    const b = f.state.traffic.charonSalvageSupply,
      r = f.state.entityList.find(e => e.alive && e.data?.activityActorSlotId === 'charon_colony_salvor'),
      rec = f.state.traffic.freighters.find(x => x.id === r.id);
    f.source().alive = false;
    b.pods[0].loose = 0;
    b.pods[0].delivered = 6;
    b.phase = 'delivered';
    f.owner.helpers.npcJobs.release(r.data.jobId);
    r.data.itinerary = {
      kind: 'charon_colony_supply',
      sourceId: 'charon_colony_air_pod'
    };
    f.owner._setTrafficManifest(r, rec, finiteManifest(r, 6));
    assert.equal(consumeCharonSupply(f.owner), true);
    f.runtime.getSystem('combat').onHit({
      targetId: r.id,
      ownerId: null,
      damage: 100000,
      damageType: 'kinetic',
      pos: {
        ...r.pos
      }
    });
    reconcileCharonSupply(f.owner);
    assert.equal(charonSupplyFacts(f.state).consumed, 6);
    assert.equal(f.state.entityList.filter(e => e.alive && e.data?.charonSupplyPod).length, 0);
    assert.equal(charonSupplyFacts(f.state).lost, 0);
  } finally {
    f.close();
  }
});
test('real leave and return rebind healthy durable original hulls without replacing source or book', () => {
  const f = charonSupplySaveFixture();
  try {
    const b = f.state.traffic.charonSalvageSupply,
      before = charonSupplyFacts(f.state),
      p = f.source();
    f.runtime.getSystem('world').enterSector('sector_dione_lane');
    f.runtime.getSystem('world').enterSector('sector_charon_expanse');
    const after = charonSupplyFacts(f.state);
    assert.equal(f.state.traffic.charonSalvageSupply, b);
    assert.ok(after.haulerId);
    assert.ok(after.salvorId);
    assert.notEqual(after.haulerId, before.haulerId);
    assert.notEqual(after.salvorId, before.salvorId);
    assert.equal(f.source(), p);
    assert.equal(after.loose, 6);
    assert.equal(materializeCharonSupply(f.owner), false);
  } finally {
    f.close();
  }
});
test('Continue between handoff and use retains physical reserve then admits one cutting round', () => {
  const f = charonSupplySaveFixture();
  try {
    const b = f.state.traffic.charonSalvageSupply,
      r = f.state.entityList.find(e => e.alive && e.data?.activityActorSlotId === 'charon_colony_salvor'),
      rec = f.state.traffic.freighters.find(x => x.id === r.id);
    f.source().alive = false;
    b.pods[0].loose = 0;
    b.pods[0].delivered = 6;
    b.phase = 'delivered';
    f.owner.helpers.npcJobs.release(r.data.jobId);
    r.data.itinerary = {
      kind: 'charon_colony_supply',
      sourceId: 'charon_colony_air_pod'
    };
    b.salvorReady = true;
    f.owner._setTrafficManifest(r, rec, finiteManifest(r, 6));
    const envelope = f.save.serialize('charon-held-before-use');
    assert.equal(f.save.loadEnvelope(envelope), true);
    const current = f.state.entities.get(charonSupplyFacts(f.state).salvorId);
    assert.equal(current.data.cargoManifest.totalQty, 6);
    assert.equal(charonSupplyFacts(f.state).delivered, 6);
    assert.equal(consumeCharonSupply(f.owner), true);
    assert.equal(charonSupplyFacts(f.state).consumed, 6);
  } finally {
    f.close();
  }
});
test('spawn publication is already unowned and reentrant admission cannot mint twice', () => {
  let observed = 0;
  const f = enterSector('sector_charon_expanse', (sim, owner) => {
    const spawn = owner.helpers.spawnEntity;
    owner.helpers = {
      ...owner.helpers,
      spawnEntity(spec) {
        if (spec.data?.charonSupplyPod) {
          observed++;
          assert.equal(spec.ownerId, null);
          assert.equal(spec.data.ownerId, null);
          assert.equal(materializeCharonSupply(owner), false);
          assert.equal(sim.state.traffic.charonSalvageSupply.phase, 'admitting');
        }
        return spawn(spec);
      }
    };
  });
  assert.equal(observed, 1);
  assert.equal(source(f).data.amount, 6);
  assert.equal(total(f), 6);
});
test('failed original source creation is terminal rather than a refill opportunity', () => {
  const f = enterSector('sector_charon_expanse', (sim, owner) => {
    const spawn = owner.helpers.spawnEntity;
    owner.helpers = {
      ...owner.helpers,
      spawnEntity(spec) {
        if (spec.data?.charonSupplyPod) return null;
        return spawn(spec);
      }
    };
  });
  assert.equal(charonSupplyFacts(f.state).phase, 'lost');
  assert.equal(charonSupplyFacts(f.state).lost, 6);
  assert.equal(materializeCharonSupply(f.owner), false);
  assert.equal(source(f), undefined);
});
import { CLAIMABLE_BODY_SITES, CLAIM_COST } from '../src/data/claimableBodies.js';
test('claiming the evacuated colony neither remints air nor replaces visiting workers', () => {
  const f = charonSupplySaveFixture();
  try {
    const b = f.state.traffic.charonSalvageSupply,
      p = f.source(),
      before = charonSupplyFacts(f.state);
    f.state.player.credits = CLAIM_COST;
    const site = CLAIMABLE_BODY_SITES.find(x => x.id === 'poi_colony' || x.poiId === 'poi_colony');
    assert.ok(site);
    assert.equal(f.runtime.getSystem('claims').claim(site), true);
    assert.equal(f.state.traffic.charonSalvageSupply, b);
    assert.equal(f.source(), p);
    assert.deepEqual(charonSupplyFacts(f.state), before);
    assert.equal(materializeCharonSupply(f.owner), false);
  } finally {
    f.close();
  }
});
import { stepCharonSupply } from '../src/world/charonSalvageSupply.js';
test('unrelated traffic and finished supply do not scan the live entity population', () => {
  const f = enterSector('sector_charon_expanse'),
    list = f.state.entityList,
    filter = list.filter;
  let scans = 0;
  list.filter = function (...args) {
    scans++;
    return filter.apply(this, args);
  };
  try {
    for (let i = 0; i < 1000; i++) assert.equal(stepCharonSupply(f.owner, {
      id: 10000 + i,
      data: {
        activityActorSlotId: 'other',
        worldRecordId: 'other-' + i
      }
    }, {}), false);
    assert.equal(scans, 0);
    f.state.traffic.charonSalvageSupply.phase = 'working';
    for (const x of f.bySlot.values()) assert.equal(stepCharonSupply(f.owner, x.entity, x.rec), false);
    assert.equal(scans, 0);
  } finally {
    list.filter = filter;
  }
});
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
test('actual canonical cargo cap eviction records finite loss after map removal', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f);
  for (let i = 0; i < 49; i++) spawnJettisonedCargoPod(f.state, {
    commodityId: 'cmdty_consumer_goods',
    amount: 1,
    pos: {
      x: 10000 + i * 10,
      z: 0
    }
  }, f.owner.helpers);
  f.sim.runTicks(1); // Flush the canonical queued destruction receipt.
  assert.equal(p.alive, false);
  assert.notEqual(f.state.entities.get(p.id), p);
  assert.equal(charonSupplyFacts(f.state).loose, 0);
  assert.equal(charonSupplyFacts(f.state).lost, 6);
  assert.equal(materializeCharonSupply(f.owner), false);
  charonSupplyDestroyed(f.owner, {
    entity: {
      ...p,
      data: structuredClone(p.data)
    },
    reason: 'jettisoned_cargo_pod_cap'
  });
  assert.equal(charonSupplyFacts(f.state).lost, 6);
});
test('existing salvor selector excludes the genuine managed air lot, not ordinary nearby salvage', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f),
    r = f.bySlot.get('charon_colony_salvor').entity,
    j = f.owner.helpers.npcJobs.get(r.data.jobId),
    runtime = f.sim.registry.get('npcJobsRuntime');
  assert.equal(p.data.lotId, p.data.richLotSource.lotId);
  assert.notEqual(runtime._findSalvorTractorTarget(j, r), p);
  delete p.data.lotId;
  assert.equal(runtime._findSalvorTractorTarget(j, r), p);
});
test('Continue then immediate canonical cap eviction retains exact finite loss', () => {
  const f = charonSupplySaveFixture();
  try {
    assert.equal(f.save.loadEnvelope(f.save.serialize('charon-before-cap')), true);
    const p = f.source();
    for (let i = 0; i < 49; i++) spawnJettisonedCargoPod(f.state, {
      commodityId: 'cmdty_consumer_goods',
      amount: 1,
      pos: {
        x: 10000 + i * 10,
        z: 0
      }
    }, f.owner.helpers);
    f.runtime.step(1 / 60);
    assert.equal(p.alive, false);
    assert.equal(charonSupplyFacts(f.state).loose, 0);
    assert.equal(charonSupplyFacts(f.state).lost, 6);
  } finally {
    f.close();
  }
});
import { getCombatKernel } from '../src/combat/kernel.js';
test('canonical native player line can attach and release the managed original air stock', async () => {
  const f = charonSupplySaveFixture();
  try {
    f.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await f.runtime.getSystem('physics').prepareBackend(f.state), true);
    f.runtime.step(1 / 60);
    const p = f.source(),
      player = f.state.entities.get(f.state.playerId),
      attachments = getCombatKernel({
        state: f.state,
        bus: f.runtime.bus
      }).attachments;
    assert.equal(p.data.lotId, p.data.richLotSource.lotId);
    const result = attachments.create({
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: p.id,
      sourceWorld: {
        ...player.pos,
        y: 0
      },
      targetWorld: {
        ...p.pos,
        y: 0
      }
    });
    assert.equal(result.ok, true, result.reason);
    assert.ok(result.attachment.physicsHandle);
    assert.equal(result.attachment.targetId, p.id);
    assert.equal(attachments.cut(result.attachment.id, player.id, 'pilot_cut').ok, true);
    assert.equal(p.data.amount, 6);
    assert.equal(charonSupplyFacts(f.state).loose, 6);
  } finally {
    f.close();
  }
});
test('new original crew waits before its first round without a hidden job clock', () => {
  const f = enterSector('sector_charon_expanse');
  const b = f.state.traffic.charonSalvageSupply;
  assert.equal(b.haulerReady, true);
  assert.equal(b.salvorReady, true);
  for (const slot of ['charon_colony_hauler', 'charon_colony_salvor']) {
    const e = f.bySlot.get(slot).entity;
    assert.equal(e.data.jobId, undefined);
    assert.equal(f.owner.helpers.npcJobs.get(`job:${e.data.worldRecordId}`), null);
  }
  assert.equal(total(f), 6);
});
test('preexisting cast snapshot never releases even pristine original commissions', () => {
  const f = enterSector('sector_charon_expanse', (sim, owner) => {
    const original = owner._materializeAuthoredActivityCast;
    owner._materializeAuthoredActivityCast = function (...args) {
      const result = original.apply(this, args);
      const prior = {
        entities: new Set(sim.state.entityList),
        records: new Set(Object.keys(sim.state.world?.records?.byId || {}))
      };
      assert.equal(materializeCharonSupply(this, prior), true);
      return result;
    };
  });
  assert.equal(f.state.traffic.charonSalvageSupply.haulerReady, false);
  assert.equal(f.state.traffic.charonSalvageSupply.salvorReady, false);
  for (const slot of ['charon_colony_hauler', 'charon_colony_salvor']) assert.ok(f.bySlot.get(slot).entity.data.jobId);
  assert.equal(total(f), 6);
});
test('real Continue restores proven active supply lease rather than ambient full throttle', () => {
  const f = charonSupplySaveFixture();
  try {
    f.runtime.step(1 / 60);
    const save = f.save.serialize('active-supply-lease');
    assert.equal(f.save.loadEnvelope(save), true);
    for (const id of [charonSupplyFacts(f.state).haulerId, charonSupplyFacts(f.state).salvorId]) {
      const e = f.state.entities.get(id);
      assert.equal(e.data.itinerary?.kind, 'charon_colony_supply');
      assert.equal(e.data.intent?.charonSupplyOwned, true);
    }
  } finally {
    f.close();
  }
});
test('restored finite labels never steal foreign itinerary, job or control', () => {
  const f = enterSector('sector_charon_expanse'),
    e = f.bySlot.get('charon_colony_hauler').entity;
  delete e.data.itinerary;
  e.data.itinerary = {
    kind: 'foreign'
  };
  bindRestoredCharonSupply(f.owner);
  assert.equal(e.data.itinerary.kind, 'foreign');
  delete e.data.itinerary;
  e.data.jobId = 'foreign-job';
  bindRestoredCharonSupply(f.owner);
  assert.equal(e.data.itinerary, undefined);
  delete e.data.jobId;
  const previous = f.owner.helpers.npcJobs.controlClaim;
  f.owner.helpers.npcJobs.controlClaim = () => ({
    owner: 'foreign'
  });
  try {
    bindRestoredCharonSupply(f.owner);
    assert.equal(e.data.itinerary, undefined);
  } finally {
    f.owner.helpers.npcJobs.controlClaim = previous;
  }
  e.data.cargoManifest.manifestId = 'wrong';
  bindRestoredCharonSupply(f.owner);
  assert.equal(e.data.itinerary, undefined);
});
test('Continue before first tick restores only ready pristine staging, never active jobs', () => {
  const f = charonSupplySaveFixture();
  try {
    assert.equal(f.state.traffic.charonSalvageSupply.phase, 'awaiting_round');
    assert.equal(f.save.loadEnvelope(f.save.serialize('pristine-ready')), true);
    const facts = charonSupplyFacts(f.state);
    for (const id of [facts.haulerId, facts.salvorId]) assert.equal(f.state.entities.get(id).data.itinerary?.kind, 'charon_colony_supply');
    const h = f.state.entities.get(facts.haulerId);
    delete h.data.itinerary;
    f.state.traffic.charonSalvageSupply.haulerReady = false;
    bindRestoredCharonSupply(f.owner);
    assert.equal(h.data.itinerary, undefined);
  } finally {
    f.close();
  }
});
test('authored air-system supply is actual habitat goods, not corrosive ice', () => {
  const f = enterSector('sector_charon_expanse'),
    p = source(f);
  assert.equal(p.data.commodityId, 'cmdty_consumer_goods');
  assert.equal(p.data.volatileClass, undefined);
  assert.match(p.data.name, /scrubber/i);
});
test('contradictory active saved phases cannot reconstruct a spent or fictional lease', () => {
  for (const phase of ['collect', 'delivered', 'shortfall']) {
    const f = enterSector('sector_charon_expanse'),
      h = f.bySlot.get('charon_colony_hauler').entity,
      b = f.state.traffic.charonSalvageSupply;
    delete h.data.itinerary;
    b.phase = phase;
    if (phase === 'collect') {
      b.pods[0].loose = 0;
      b.pods[0].consumed = 6;
    }
    bindRestoredCharonSupply(f.owner);
    assert.equal(h.data.itinerary, undefined);
  }
});
