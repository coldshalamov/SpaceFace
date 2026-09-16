import test from 'node:test';
import assert from 'node:assert/strict';

import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { FACTION_META } from '../src/data/factions.js';
import { SECTORS, STATION_GROWTH_LADDERS, stationGrowthLadderFor, stationGrowthRungFor } from '../src/data/sectors.js';
import { DEPOT_PATROL_LINES, depotPatrolLine, stationGrowthReaction } from '../src/data/conflictReactions.js';
import {
  claims as claimsBase,
  DEPOT_PATROL_ID_PREFIX,
  DEPOT_SUPPORT_GRACE_S,
} from '../src/systems/claims.js';
import { factions as factionsBase } from '../src/systems/factions.js';
import { addCargo } from '../src/systems/cargo.js';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { save } from '../src/save/saveSystem.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

// PQ-170.01 — "station growth and dependency". Two vision promises with no system before this:
//   (1) a station gains an authored module because of PLAYER-supplied throughput (market sells and
//       the player's own relay convoys), stamped on the live station and told on the dock card;
//   (2) a faction's patrols depend on the player's depot: a stocked Trade Relay keeps a Concord
//       patrol_beat rotation posted on its lane through the encounter director; let the stores run
//       dry and the rotation is withdrawn. Both survive save/load.

const STATION_ID = 'station_ceres';           // refinery, faction_dmc, sector_ceres_belt
const RUNG_1 = STATION_GROWTH_LADDERS.refinery[0];

// ── growth: pure data ─────────────────────────────────────────────────────────────────────────

test('every authored station type has a three-rung growth ladder with rising thresholds', () => {
  for (const type of ['trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research']) {
    const ladder = stationGrowthLadderFor({ type });
    assert.equal(ladder.length, 3, type + ' has three rungs');
    for (let i = 0; i < ladder.length; i++) {
      const rung = ladder[i];
      assert.ok(rung.id && rung.name && rung.tag && rung.line, type + ' rung ' + i + ' is fully authored');
      assert.match(rung.line, /\{station\}/, 'rung copy names the station');
      if (i > 0) assert.ok(rung.throughputU > ladder[i - 1].throughputU, 'thresholds rise');
      assert.ok(rung.relayFeeCut >= 0 && rung.relayFeeCut < 0.2, 'fee cut never exceeds the relay fee');
    }
  }
  // Every station SECTORS authors resolves to a ladder (unknown types fall back to trade_hub).
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      assert.ok(stationGrowthLadderFor(station).length === 3, station.id + ' resolves a ladder');
    }
  }
  assert.equal(stationGrowthRungFor(STATION_GROWTH_LADDERS.refinery, 0), 0);
  assert.equal(stationGrowthRungFor(STATION_GROWTH_LADDERS.refinery, RUNG_1.throughputU), 1);
  assert.equal(stationGrowthRungFor(STATION_GROWTH_LADDERS.refinery, 5000), 3);
  const reaction = stationGrowthReaction({
    stationId: STATION_ID, stationName: 'Ceres Refinery', moduleName: RUNG_1.name,
    throughputU: 150, line: RUNG_1.line,
  });
  assert.equal(reaction.factionId, 'faction_dmc', 'growth speaks in the station-owning faction voice');
  assert.match(reaction.text, /^DRIFT SHIFT BOARD: Ceres Refinery/);
  assert.match(reaction.text, /150u/);
  for (const kind of Object.keys(DEPOT_PATROL_LINES)) {
    assert.match(depotPatrolLine(kind, { depot: 'Rookery' }), /^CONCORD: Rookery/);
  }
});

// ── growth: the claims ledger ─────────────────────────────────────────────────────────────────

test('a station gains its first module after enough player sells; buys and sealed runs count nothing', () => {
  const h = bootClaims();
  const before = h.state.entityIndex.byStationId.get(STATION_ID).data.name;
  assert.equal(before, 'Ceres Refinery');

  sell(h, 60);
  sell(h, 60);
  assert.equal(h.sys.stationGrowth(STATION_ID).throughputU, 120);
  assert.equal(h.sys.stationGrowth(STATION_ID).rung, 0, 'below the first rung nothing is gained');
  assert.equal(events(h, 'station:moduleGained').length, 0);

  h.bus.emit('economy:tradeCompleted', { stationId: STATION_ID, side: 'buy', qty: 500, commodityId: 'cmdty_food' });
  assert.equal(h.sys.stationGrowth(STATION_ID).throughputU, 120, 'buying from a station supplies nothing');

  h.state.run = { kind: 'survival', phase: 'active' };
  sell(h, 500);
  assert.equal(h.sys.stationGrowth(STATION_ID).throughputU, 120, 'a sealed Crucible run never grows the campaign');
  delete h.state.run;

  sell(h, 40);
  const rec = h.sys.stationGrowth(STATION_ID);
  assert.equal(rec.throughputU, 160);
  assert.equal(rec.rung, 1, 'crossing the authored threshold gains the rung');
  assert.equal(rec.modules[0].id, RUNG_1.id);
  assert.equal(rec.factionId, 'faction_dmc');
  assert.equal(rec.sources.market_sell, 160);

  const gained = events(h, 'station:moduleGained');
  assert.equal(gained.length, 1);
  assert.equal(gained[0].payload.moduleName, RUNG_1.name);
  assert.equal(gained[0].payload.factionId, 'faction_dmc');
  assert.equal(gained[0].payload.receiptId, `station-growth:${STATION_ID}:${RUNG_1.id}`);

  const news = events(h, 'news:publish');
  assert.equal(news.length, 1, 'the module is told once, in the station voice, on the news surface');
  assert.equal(news[0].payload.stationId, STATION_ID);
  assert.ok(news[0].payload.receiptId && news[0].payload.sourceRef, 'ticker citation present');
  assert.match(news[0].payload.text, /DRIFT SHIFT BOARD: Ceres Refinery fits a Bulk Intake Dock/);

  const station = h.state.entityIndex.byStationId.get(STATION_ID);
  assert.equal(station.data.name, 'Ceres Refinery · ' + RUNG_1.tag, 'the live station wears the module');
  assert.equal(station.data.stationBaseName, 'Ceres Refinery');
  assert.deepEqual(station.data.stationGrowth.modules, [RUNG_1.name]);

  // A respawned station (sector re-entry) is re-stamped from the ledger.
  station.data.name = 'Ceres Refinery';
  delete station.data.stationBaseName;
  h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.equal(station.data.name, 'Ceres Refinery · ' + RUNG_1.tag);

  // Toasts are not doubled from claims: the news surface owns the voice.
  assert.equal(events(h, 'toast').filter((e) => /Bulk Intake/.test(e.payload.text)).length, 0);
  console.log(JSON.stringify({
    seed: 17001, station: STATION_ID, throughputU: rec.throughputU, rung: rec.rung, module: rec.modules[0].id,
  }));
});

test('the player relay convoys count as station throughput and a grown station cuts the relay fee', () => {
  const price = 80;
  const h = bootClaims({ economy: makeEconomyStub({ cmdty_refined_metals: price }) });
  const relayDef = BODY_SPECIALIZATION_BY_ID.get('spec_relay');
  const body = commissionRelay(h);
  addCargo(h.state, 'cmdty_refined_metals', 300);
  assert.equal(h.sys.deliverToClaim(body.id, 'cmdty_refined_metals', 300), 300);

  // 5 convoys × 60u; the third one crosses 150u at the destination station.
  runSim(h, (relayDef.dispatchEveryS + relayDef.transitS) * 5 + 30, 0.5);
  const sold = body.spec.receipts.concat(events(h, 'claim:receipt').map((e) => e.payload.receipt))
    .filter((r) => r.kind === 'convoy_sold');
  assert.ok(sold.length >= 4, 'several convoys sold (' + sold.length + ')');
  const rec = h.sys.stationGrowth(STATION_ID);
  assert.ok(rec.sources.relay_convoy >= RUNG_1.throughputU, 'relay freight is player-supplied throughput');
  assert.equal(rec.rung, 1);
  assert.equal(rec.modules[0].source, 'relay_convoy');
  assert.ok(events(h, 'claim:receipt').some((e) => e.payload.receipt.kind === 'station_grew'),
    'the relay that fed the station carries the receipt too');

  const fees = sold.map((r) => r.data.saleFee);
  assert.equal(fees[0], relayDef.saleFee, 'before growth the published fee applies');
  assert.equal(fees[fees.length - 1], round4(relayDef.saleFee - RUNG_1.relayFeeCut),
    'after growth the grown station keeps less of the sale');
  const last = sold[sold.length - 1];
  assert.equal(last.data.revenueCr, Math.round(last.data.qty * price * (1 - fees[fees.length - 1])),
    'revenue is computed from the cut fee');
});

test('station growth survives save/load and re-stamps the station on the restored world', () => {
  const h = bootClaims();
  sell(h, 100);
  sell(h, 100);
  const snapshot = JSON.parse(JSON.stringify(h.sys.serialize()));
  assert.ok(snapshot.stationGrowth && snapshot.stationGrowth[STATION_ID], 'serialize carries the growth ledger');
  assert.equal(snapshot.stationGrowth[STATION_ID].rung, 1);

  const cold = bootClaims();
  cold.sys.deserialize(snapshot);
  const rec = cold.sys.stationGrowth(STATION_ID);
  assert.equal(rec.throughputU, 200);
  assert.equal(rec.rung, 1);
  assert.equal(rec.modules[0].id, RUNG_1.id);
  assert.equal(cold.state.entityIndex.byStationId.get(STATION_ID).data.name, 'Ceres Refinery · ' + RUNG_1.tag,
    'Continue re-stamps the module on the freshly spawned station');
  assert.equal(JSON.stringify(cold.sys.serialize().stationGrowth), JSON.stringify(snapshot.stationGrowth),
    'second serialize is stable');

  // Growth resumes from the restored count: 250 more units reach rung 2.
  sell(cold, 250);
  assert.equal(cold.sys.stationGrowth(STATION_ID).rung, 2);
  assert.equal(events(cold, 'station:moduleGained').length, 1);

  // Untouched saves keep their exact shape: no ledger key unless something was ever supplied.
  const untouched = bootClaims();
  assert.equal('stationGrowth' in untouched.sys.serialize(), false);
});

// ── factions: power and standing read the claims facts, through the sole rep writer ───────────

test('a grown station and a provisioned depot feed faction power and earn standing through applyRep', () => {
  const f = factionsHarness();
  f.state.world.sectors = {};
  f.state.claims = {
    bodies: [{ id: 'claim_1', sectorId: 'sector_ceres_belt', depotSupport: { supported: true } }],
    stationGrowth: {
      [STATION_ID]: { stationId: STATION_ID, factionId: 'faction_dmc', type: 'refinery', rung: 2, modules: [] },
    },
  };
  const baseline = factionsHarness();
  baseline.state.world.sectors = {};
  baseline.sys._recomputeFactionPower(baseline.state);
  f.sys._recomputeFactionPower(f.state);
  const dmcGain = f.state.factions.faction_dmc.power - baseline.state.factions.faction_dmc.power;
  const scnGain = f.state.factions.faction_scn.power - baseline.state.factions.faction_scn.power;
  assert.equal(dmcGain, STATION_GROWTH_LADDERS.refinery[1].powerBonus * 0.5, 'rung 2 powerBonus eases in at half');
  assert.equal(scnGain, 3 * 0.5, 'a supported depot is Concord reach');

  const dmcRep = f.state.factions.faction_dmc.rep;
  f.bus.emit('station:moduleGained', { stationId: STATION_ID, factionId: 'faction_dmc', moduleId: RUNG_1.id });
  assert.equal(f.state.factions.faction_dmc.rep, dmcRep + 8, 'a module the player built earns Drift standing');
  const scnRep = f.state.factions.faction_scn.rep;
  f.bus.emit('claim:depotPatrolCompleted', { bodyId: 'claim_1', factionId: 'faction_scn', rotation: 1 });
  assert.equal(f.state.factions.faction_scn.rep, scnRep + 2, 'a completed rotation earns Concord standing');
  assert.ok(f.events.some((e) => e.event === 'faction:repChanged' && e.payload.reason === 'station_growth'));
});

// ── depot dependency: a real headless sim with the real encounter director ─────────────────────

const SEED = 17001;
const SECTOR = 'sector_ceres_belt';

test('a stocked relay depot keeps a Concord patrol rotation on its lane; dry stores withdraw it; Continue re-posts it', () => {
  const sim = bootSim();
  try {
    const { state } = sim;
    const owner = sim.registry.get('claims');
    const body = commissionDepot(sim, owner);
    assert.equal(body.depotSupport, undefined, 'an empty relay is not yet a depot anyone depends on');
    sim.runTicks(60);
    assert.equal(body.depotSupport.supported, false, 'no stock, no support');
    assert.equal(liveRotations(state).length, 0);

    // Stock it: the player hauls freight into the relay.
    addCargo(state, 'cmdty_refined_metals', 120);
    assert.equal(owner.deliverToClaim(body.id, 'cmdty_refined_metals', 120), 120);
    sim.runTicks(120);
    assert.equal(body.depotSupport.supported, true, 'stocked relay is a supported depot');
    // The player is still ~2200 WU away: a rotation is a physical presence, so nothing posts yet
    // (the far-actor table would virtualize the hulls two ticks after they spawned).
    assert.equal(liveRotations(state).length, 0, 'no rotation posts while the player is far from the lane');
    assert.equal(body.depotSupport.patrol.lastDenied, 'player_far');
    assert.equal(body.depotSupport.rotations, 0);
    movePlayerTo(sim, body);
    sim.runTicks(60 * 12);
    let live = liveRotations(state);
    assert.equal(live.length, 1, 'one Concord rotation posted on the depot lane');
    assert.equal(live[0].id, `${DEPOT_PATROL_ID_PREFIX}${body.id}:1`);
    assert.equal(live[0].shapeId, 'patrol_beat');
    const ships = live[0].ids.map((id) => state.entities.get(id)).filter((e) => e && e.alive);
    assert.ok(ships.length >= 2, 'the rotation is real hulls (' + ships.length + ')');
    for (const ship of ships) {
      assert.equal(ship.factionId, 'faction_scn', 'they fly the Concord flag');
      assert.ok(Math.hypot(ship.pos.x - live[0].anchor.x, ship.pos.z - live[0].anchor.z) < 900,
        'they hold near the depot lane anchor');
    }
    const laneToDepot = Math.hypot(live[0].anchor.x - body.x, live[0].anchor.z - body.z);
    const laneToStation = (() => {
      const station = state.entityIndex.byStationId.get(body.spec.destStationId);
      return station ? Math.hypot(live[0].anchor.x - station.pos.x, live[0].anchor.z - station.pos.z) : null;
    })();
    assert.ok(laneToStation == null || laneToDepot < laneToStation, 'the anchor sits on the depot side of the lane');
    const posted = eventsOf(sim).filter((e) => e.name === 'claim:depotPatrolRotation');
    assert.equal(posted.length, 1);
    assert.ok(eventsOf(sim).some((e) => e.name === 'toast' && /CONCORD: .*patrol rotation posted/.test(e.payload.text)),
      'the player is told the rotation is theirs');
    console.log(JSON.stringify({
      seed: SEED, depot: body.name, supported: true, rotationId: live[0].id, patrolHulls: ships.length,
      hullFaction: ships[0].factionId, anchorFromDepotWU: Math.round(laneToDepot),
    }));

    // Relief: the beat resolves on its own and the next rotation is posted while support holds.
    sim.runTicks(60 * 200);
    assert.ok(body.depotSupport.completedRotations >= 1, 'a beat completed');
    assert.ok(body.depotSupport.rotations >= 2, 'a relief rotation was posted (' + body.depotSupport.rotations + ')');
    assert.equal(body.depotSupport.supported, true);
    assert.ok(eventsOf(sim).filter((e) => e.name === 'toast' && /patrol rotation posted/.test(e.payload.text)).length === 1,
      'reliefs stay quiet');

    // Withdraw the support right after a fresh rotation posts, so the beat is still live when the
    // grace runs out and the stand-down (not a natural relief gap) is what removes it.
    const rotationsBeforeWithdraw = body.depotSupport.rotations;
    for (let guard = 0; guard < 400 && body.depotSupport.rotations === rotationsBeforeWithdraw; guard++) sim.runTicks(30);
    assert.equal(liveRotations(state).length, 1, 'a fresh rotation is live at the moment of withdrawal');
    const stock = body.spec.store.input.cmdty_refined_metals || 0;
    assert.ok(stock > 0);
    assert.equal(owner.withdrawFromClaim(body.id, 'cmdty_refined_metals', stock), stock);
    sim.runTicks(60 * (DEPOT_SUPPORT_GRACE_S - 5));
    assert.equal(body.depotSupport.supported, true, 'a short dry spell is tolerated');
    sim.runTicks(60 * 10);
    assert.equal(body.depotSupport.supported, false, 'dry past the grace lapses the support');
    assert.equal(body.depotSupport.lapseReason, 'withdrawn');
    assert.equal(liveRotations(state).length, 0, 'the rotation is withdrawn with the support');
    const lapse = eventsOf(sim).find((e) => e.name === 'claim:depotSupport' && e.payload.supported === false);
    assert.ok(lapse && lapse.payload.reason === 'withdrawn');
    assert.ok(eventsOf(sim).some((e) => e.name === 'encounter:resolved'
      && String(e.payload.encounterId).startsWith(DEPOT_PATROL_ID_PREFIX)
      && e.payload.outcome === 'aborted:depot_support_lapsed'), 'the director stood the patrol down');
    assert.ok(eventsOf(sim).some((e) => e.name === 'toast' && /stores are dry — patrol rotation withdrawn/.test(e.payload.text)));
    sim.runTicks(60 * 30);
    assert.equal(liveRotations(state).length, 0, 'nothing re-posts while the depot stays dry');
    const rotationsBeforeRestock = body.depotSupport.rotations;
    console.log(JSON.stringify({
      seed: SEED, lapsed: true, reason: body.depotSupport.lapseReason, liveRotations: liveRotations(state).length,
      rotationsPosted: rotationsBeforeRestock, completed: body.depotSupport.completedRotations,
    }));

    // Restock, then Continue: the ledger rides the save; the director rebuilds fresh; the rotation
    // is re-posted because the depot is still stocked after the load.
    assert.equal(owner.deliverToClaim(body.id, 'cmdty_refined_metals', 100), 100);
    sim.runTicks(120);
    assert.equal(body.depotSupport.supported, true);
    assert.equal(liveRotations(state).length, 1);
    const rotationsBeforeSave = body.depotSupport.rotations;
    const snapshot = JSON.parse(JSON.stringify(sim.registry.get('save').serialize('quick')));
    assert.equal(snapshot.data.claims.bodies[0].depotSupport.supported, true, 'depot support is in the save');

    const cold = bootSim();
    try {
      assert.equal(cold.registry.get('save').loadEnvelope(snapshot, 'quick'), true);
      const restored = cold.registry.get('claims').list()[0];
      assert.equal(restored.depotSupport.supported, true, 'Continue restores the support');
      assert.equal(restored.depotSupport.rotations, rotationsBeforeSave);
      assert.equal(restored.depotSupport.patrol.encounterId, null, 'a live encounter never rides the save');
      cold.runTicks(120);
      const coldLive = liveRotations(cold.state);
      assert.equal(coldLive.length, 1, 'Continue re-posts the rotation on the still-stocked depot');
      assert.equal(coldLive[0].id, `${DEPOT_PATROL_ID_PREFIX}${restored.id}:${rotationsBeforeSave + 1}`);
      const coldShips = coldLive[0].ids.map((id) => cold.state.entities.get(id)).filter((e) => e && e.alive);
      assert.ok(coldShips.length >= 2, 'real Concord hulls after Continue');
      assert.ok(coldShips.every((s) => s.factionId === 'faction_scn'));
      console.log(JSON.stringify({
        seed: SEED, afterContinue: true, supported: restored.depotSupport.supported,
        rotationId: coldLive[0].id, patrolHulls: coldShips.length,
      }));
    } finally { cold.dispose(); }
  } finally {
    sim.dispose();
  }
});

test('a relay that goes cold loses its patrol at once, without waiting out the dry grace', () => {
  const sim = bootSim();
  try {
    const { state } = sim;
    const owner = sim.registry.get('claims');
    const body = commissionDepot(sim, owner);
    movePlayerTo(sim, body);
    addCargo(state, 'cmdty_refined_metals', 60);
    owner.deliverToClaim(body.id, 'cmdty_refined_metals', 60);
    sim.runTicks(120);
    assert.equal(body.depotSupport.supported, true);
    assert.equal(liveRotations(state).length, 1);
    // Upkeep goes unpaid: the site goes cold on the next settlement (the real path, not a flag).
    state.player.credits = 0;
    body.spec.upkeepDebt = 500;
    state.claims.meta.upkeepAccum = 59.9;
    sim.runTicks(30);
    assert.equal(body.spec.status, 'cold');
    assert.equal(body.depotSupport.supported, false);
    assert.equal(body.depotSupport.lapseReason, 'cold');
    assert.equal(liveRotations(state).length, 0, 'a cold depot provisions nothing');
    const ledger = owner.ledger(body.id);
    assert.equal(ledger.depot.supported, false);
    assert.equal(ledger.depot.lapseReason, 'cold');
  } finally {
    sim.dispose();
  }
});

// ── harnesses ─────────────────────────────────────────────────────────────────────────────────

function round4(value) { return Math.round(value * 10000) / 10000; }

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeEconomyStub(priceTable = {}) {
  return {
    name: 'economy',
    prices: priceTable,
    priceOf(stationId, goodId) {
      return this.prices[goodId] != null ? this.prices[goodId] : 50;
    },
  };
}

function makeStationEntity() {
  return {
    id: 90,
    type: 'station',
    alive: true,
    collides: true,
    factionId: 'faction_dmc',
    pos: { x: 2200, z: 0 },
    radius: 50,
    data: { stationId: STATION_ID, name: 'Ceres Refinery', stationTypeId: 'refinery', factionId: 'faction_dmc', services: [] },
  };
}

function bootClaims({ economy = makeEconomyStub() } = {}) {
  const station = makeStationEntity();
  const state = {
    simTime: 1000,
    meta: { seed: SEED },
    playerId: 'player',
    mode: 'flight',
    player: {
      credits: 200000,
      heat: 0,
      stats: {},
      researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 },
      ownedShips: [],
    },
    factions: Object.freeze({}), // any reputation write from claims throws
    world: { currentSectorId: SECTOR, activeSector: null },
    entities: new Map([[station.id, station]]),
    entityList: [station],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      dockStations: [station],
      stations: [station],
      asteroids: [],
      statics: [station],
      byStationId: new Map([[STATION_ID, station]]),
    },
    claims: null,
  };
  const bus = makeBus();
  const peers = new Map();
  if (economy) peers.set('economy', economy);
  const registry = { get: (name) => peers.get(name) || null };
  bus.on('economy:chargeCredits', (p) => { state.player.credits -= Math.max(0, Math.round(p.amount || 0)); });
  bus.on('economy:grantCredits', (p) => { state.player.credits += Math.max(0, Math.round(p.amount || 0)); });
  const sys = { ...claimsBase };
  sys.init({ state, bus, helpers: {}, registry });
  if (!state.claims) state.claims = { bodies: [] };
  return { state, bus, sys };
}

function sell(h, qty) {
  h.bus.emit('economy:tradeCompleted', {
    stationId: STATION_ID, commodityId: 'cmdty_ore_iron', side: 'sell', qty, unitAvg: 28, total: qty * 28,
    factionId: 'faction_dmc',
  });
}

function events(h, name) {
  return h.bus.emitLog.filter((e) => e.evt === name);
}

function commissionRelay(h) {
  assert.equal(h.sys.claim({ id: 'poi_growth_rock', name: 'Growth Rock', size: 'M', pos: { x: 0, z: 0 } }), true);
  const body = h.state.claims.bodies.at(-1);
  assert.equal(h.sys.buildModule(body.id, 'mod_depot'), true);
  assert.equal(h.sys.specialize(body.id, 'spec_relay'), true);
  return body;
}

function runSim(h, seconds, dt = 0.1) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    h.state.simTime += dt;
    h.sys.update(dt, h.state);
  }
}

function factionsHarness() {
  const factions = {};
  for (const f of FACTION_META) {
    factions[f.id] = {
      rep: f.startingRep || 0, tier: 'Neutral', aggro: false, bribesPaid: 0,
      lastDelta: { value: 0, reason: 'init', t: 0 }, knownContrabandStrikes: 0, discoveredHostileBy: 0,
      power: 10, powerNonce: 0,
    };
  }
  const state = {
    playerId: 'player_ship', simTime: 5, meta: { seed: 'growth' },
    world: { currentSectorId: SECTOR, sectors: {} },
    factions, conflicts: {}, entityList: [], entities: new Map(),
  };
  const events = [];
  const handlers = new Map();
  const bus = {
    on(event, fn) { const list = handlers.get(event) || []; list.push(fn); handlers.set(event, list); },
    emit(event, payload) { events.push({ event, payload }); for (const fn of handlers.get(event) || []) fn(payload); },
  };
  const sys = { ...factionsBase };
  sys.init({ state, bus, helpers: { queryRadius: () => [] } });
  return { state, events, bus, sys };
}

const SIM_EVENTS = new WeakMap();
function eventsOf(sim) { return SIM_EVENTS.get(sim) || []; }

function bootSim() {
  const sim = createSimulation({ seed: SEED, systems: [world, claimsBase, encounterDirector, save] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 60000;
  state.player.researchedNodes = ['tech_outpost_charter'];
  // The default hold is 40 volume; the depot scenario hauls a couple of relay loads at once.
  state.player.cargo.capVolume = 400;
  state.player.cargo.capMass = 400;
  state.onboarding = { active: false, finished: true };
  const events = [];
  SIM_EVENTS.set(sim, events);
  for (const name of ['claim:depotPatrolRotation', 'claim:depotSupport', 'claim:depotPatrolCompleted', 'encounter:resolved', 'toast']) {
    sim.bus.on(name, (payload) => events.push({ name, payload }));
  }
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', {
    team: 0, pos: sectorLocalToGlobalForSector({ x: -1100, z: 620 }, SECTOR),
  }));
  player.isPlayer = true;
  state.playerId = player.id;
  sim.registry.get('world').enterSector(SECTOR);
  return sim;
}

function movePlayerTo(sim, body) {
  const player = sim.state.entities.get(sim.state.playerId);
  Object.assign(player.pos, { x: body.x + 120, z: body.z });
  if (player.vel) Object.assign(player.vel, { x: 0, z: 0 });
}

function commissionDepot(sim, owner) {
  const poi = SECTORS.find((sector) => sector.id === SECTOR).pois.find((p) => p.claimable);
  assert.ok(poi, 'the shipped Ceres pocket has a claimable body');
  assert.equal(owner.claim({ ...poi, pos: sectorLocalToGlobalForSector(poi.pos, SECTOR) }), true);
  const body = owner.list()[0];
  assert.equal(owner.buildModule(body.id, 'mod_depot'), true, 'Cargo Depot builds');
  assert.equal(owner.specialize(body.id, 'spec_relay'), true, 'Trade Relay commissions');
  return body;
}

function liveRotations(state) {
  const live = state.encounterDirector && state.encounterDirector.live;
  return Object.values(live || {}).filter((entry) => entry && String(entry.id).startsWith(DEPOT_PATROL_ID_PREFIX)
    && entry.phase !== 'done');
}
