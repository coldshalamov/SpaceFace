// Economy-honesty batch — contract-state latches, station industry asymmetry, and the physical
// claim-relay convoy (spawn → ambient predation → kill/berth ledger resolution).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { claims } from '../src/systems/claims.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import {
  economy, compareTwoStopFreight, formatFreightComparison, compareDockedFreight,
  loanLimitFor, stationOffersService,
} from '../src/systems/economy.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';
import { LONG_BERTH_STATION_ID } from '../src/data/longBerth.js';
import { missions } from '../src/systems/missions.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { updateAmbientPredation, ambientObjective } from '../src/ai/ambientPredation.js';
import { protectedStationAt } from '../src/ai/engagementAuthority.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { addCargo } from '../src/systems/cargo.js';
import { stableRecordId, RECORD_KIND } from '../src/world/worldRecords.js';
import { stableManifestId } from '../src/economy/freightCausality.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector, globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { FIRST_TRADE_CONTRACT_STATION_ID } from '../src/data/economyContractTemplates.js';

const SEED = 9021;
// io_reach (security 0.35) hosts the claimable Pallas moon; charon_expanse (0.30) hosts
// poi_colony and owns the one lane whose edge clears lawful station cover — the geometry the
// ambient-predation evaluator demands.
const CLAIM_SECTOR = 'sector_io_reach';
const PREDATION_SECTOR = 'sector_charon_expanse';
const RELAY_GOOD = 'cmdty_refined_metals';
const LAWFUL_STATION_FACTIONS = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);
const LAW_PRESENCE_WU = 2800; // mirrors AMBIENT_PREDATION.lawPresenceRadiusWu

function bootContracts(seed = 4040) {
  const sim = createSimulation({ seed, systems: [missions, economyContracts] });
  sim.state.mode = 'flight';
  sim.state.onboarding = { active: false, finished: true };
  return sim;
}

function bootConvoy(seed = SEED, sectorId = CLAIM_SECTOR) {
  const sim = createSimulation({ seed, systems: [
    world, spawnBudget, npcJobsRuntime, economy, traffic, claims,
  ] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 500000;
  state.player.researchedNodes = ['tech_outpost_charter'];
  state.onboarding = { active: false, finished: true };
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', {
    team: 0, pos: sectorLocalToGlobalForSector({ x: 200, z: 0 }, sectorId),
  }));
  player.isPlayer = true;
  state.playerId = player.id;
  sim.registry.get('world').enterSector(sectorId);
  return sim;
}

/**
 * Claim the sector's claimable body, fit the depot module, commission the relay, and stock it
 * so the next dispatch window emits a physical leg. Returns the claims body.
 */
function commissionRelay(sim, { sectorId = CLAIM_SECTOR, localPos = { x: 200, z: 0 } } = {}) {
  const { state } = sim;
  const owner = sim.registry.get('claims');
  const poi = SECTORS.find((s) => s.id === sectorId).pois.find((p) => p.claimable);
  assert.ok(poi, `${sectorId} ships a claimable body`);
  assert.equal(owner.claim({ ...poi, pos: sectorLocalToGlobalForSector(localPos, sectorId) }), true);
  const body = state.claims.bodies[state.claims.bodies.length - 1];
  assert.equal(owner.buildModule(body.id, 'mod_depot'), true, 'depot module builds');
  assert.equal(owner.specialize(body.id, 'spec_relay'), true, 'relay commissions');
  addCargo(state, RELAY_GOOD, 60);
  const moved = owner.deliverToClaim(body.id, RELAY_GOOD, 60);
  assert.ok(moved >= 20, `relay store holds a dispatchable load (got ${moved})`);
  // Pull the 240s schedule forward — the leg, not the clock, is under test.
  body.spec.nextDispatchAt = state.simTime;
  return body;
}

function liveConvoyHull(sim, convoyId) {
  for (const ent of sim.state.entities.values()) {
    const mark = ent && ent.data && ent.data.claimConvoy;
    if (mark && mark.convoyId === convoyId && ent.alive !== false) return ent;
  }
  return null;
}

// ── 1. Contract-state honesty ───────────────────────────────────────────────────────────────

test('a rejected first-trade offer stays uncommitted and retries the identical row', () => {
  const sim = bootContracts();
  try {
    const { state, bus } = sim;
    const missionsSys = sim.registry.get('missions');
    const offered = [];
    const boarded = [];
    bus.on('mission:offered', (p) => offered.push(p && p.id));
    bus.on('mission:offerBoarded', (p) => boarded.push(p && p.offerId));

    // Occupy the one-row-per-source slot so the board refuses the offer.
    const board = missionsSys.ensureBoard(FIRST_TRADE_CONTRACT_STATION_ID);
    board.slots.unshift({
      id: 'fixture_blocker', source: 'firstTradeContract', type: 'cargo_delivery',
      stationId: FIRST_TRADE_CONTRACT_STATION_ID, params: { qty: 1 }, title: 'fixture',
    });

    bus.emit('dock:docked', { stationId: FIRST_TRADE_CONTRACT_STATION_ID });
    assert.equal(state.economyContracts.firstTradeOffered, false,
      'a refused offer must not spend the one-shot latch');
    assert.equal(board.slots.filter((o) => o && o.source === 'firstTradeContract').length, 1,
      'only the blocker row stands — the authored offer did not board');
    const firstIds = offered.filter((id) => typeof id === 'string' && id.startsWith('first_trade'));
    assert.equal(firstIds.length, 1, 'the offer was emitted exactly once this dock');

    // Board frees up → the NEXT dock retries the identical deterministic offer.
    board.slots.length = 0;
    bus.emit('dock:docked', { stationId: FIRST_TRADE_CONTRACT_STATION_ID });
    const retried = offered.filter((id) => typeof id === 'string' && id.startsWith('first_trade'));
    assert.equal(retried.length, 2, 'the retry re-emitted the offer');
    assert.equal(retried[0], retried[1], 'retry carries the identical offer id — deterministic');
    assert.equal(state.economyContracts.firstTradeOffered, true,
      'the latch commits only after the board took the row');
    assert.equal(boarded.filter((id) => id === retried[1]).length, 1,
      'mission:offerBoarded fired exactly once for the row');
    assert.equal(board.slots.filter((o) => o && o.id === retried[1]).length, 1,
      'exactly one copy sits on the board');

    bus.emit('dock:docked', { stationId: FIRST_TRADE_CONTRACT_STATION_ID });
    assert.equal(offered.filter((id) => id === retried[1]).length, 2,
      'a committed latch never re-emits');
  } finally { sim.dispose(); }
});

test('a refused epoch offer leaves the station-epoch unevaluated and retries deterministically', () => {
  const sim = bootContracts();
  try {
    const { state, bus } = sim;
    const econ = sim.registry.get('economyContracts');
    const missionsSys = sim.registry.get('missions');
    const stationId = 'station_ceres';
    const epoch = econ._epoch();
    const epochOffer = {
      id: `eco_${stationId}_${epoch}`, source: 'economyContract', type: 'bounty_hunt',
      stationId, factionId: 'faction_scn', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
      params: { clearCount: 2, killCount: 0, targetStrength: 1.4, fValue: 1.4, taskTime: 60 },
      reward_cr: 900, time_limit_s: 900, duration_s: 900, expiresAtEpoch: epoch + 4,
      title: 'field contract', summary: 'seeded field work', storyTag: null,
    };
    // The planner is field-state dependent; pin it so the latch itself is what is under test.
    econ.planOffer = () => epochOffer;
    econ.planMaintenanceOffer = () => null;

    // Only the field-evaluation row is under test. Ceres also hosts the AL-STORY-1 manifest
    // case (_offerMassScale), which deliberately re-emits on EVERY dock outside the epoch
    // latch while the board refuses it — its retries are a separate contract, not this latch.
    const offered = [];
    bus.on('mission:offered', (p) => {
      if (p && typeof p.id === 'string' && p.id.startsWith('eco_mass_scale_')) return;
      offered.push(p && p.id);
    });
    const board = missionsSys.ensureBoard(stationId);
    board.slots.unshift({
      id: 'fixture_blocker', source: 'economyContract', type: 'cargo_delivery',
      stationId, params: { qty: 1 }, title: 'fixture',
    });

    bus.emit('dock:docked', { stationId });
    assert.equal(offered.length, 1);
    assert.equal(state.economyContracts.evaluatedEpochByStation[stationId], undefined,
      'the epoch stays open while the board refused the offer');
    assert.equal(board.slots.some((o) => o && o.id === epochOffer.id), false);

    // Same dock again while still blocked: the identical offer retries.
    bus.emit('dock:docked', { stationId });
    assert.equal(offered.length, 2);
    assert.equal(offered[0], offered[1], 'same epoch, same seeded offer id');

    board.slots.length = 0;
    bus.emit('dock:docked', { stationId });
    assert.equal(state.economyContracts.evaluatedEpochByStation[stationId], epoch,
      'confirmed boarding marks the epoch evaluated exactly once');
    bus.emit('dock:docked', { stationId });
    assert.equal(offered.filter((id) => id === epochOffer.id).length, 3,
      'a marked epoch is silent — no fourth emit');
  } finally { sim.dispose(); }
});

// ── 2. Station industry asymmetry ───────────────────────────────────────────────────────────

test('station industry consumes feedstock and emits product through real stock, deterministically', () => {
  const sim = createSimulation({ seed: SEED, systems: [economy] });
  try {
    const { state } = sim;
    const econ = sim.registry.get('economy');
    econ.populateSector({ sectorId: 'sector_charon_expanse' }); // station_expanse: tier-2 refinery
    econ.populateSector({ sectorId: 'sector_pallas_drift' });   // station_drift: trade_hub, no book
    const m = state.economy.markets;
    const s = (sid, cid) => m[sid][cid].stock;
    const expanse = () => ({
      ore: s('station_expanse', 'cmdty_ore_iron'),
      titanium: s('station_expanse', 'cmdty_ore_titanium'),
      refined: s('station_expanse', 'cmdty_refined_metals'),
      plate: s('station_expanse', 'cmdty_comp_hullplate'),
    });
    const before = expanse();
    const driftOre0 = s('station_drift', 'cmdty_ore_iron');
    const driftRef0 = s('station_drift', 'cmdty_refined_metals');

    const ran = econ.applyStationIndustry(60); // one authored minute of line time
    assert.ok(ran >= 3, `the tier-2 refinery ran its smelt/alloy/plate lines (ran ${ran})`);
    const after = expanse();
    assert.ok(after.ore < before.ore, 'iron ore burned');
    assert.ok(after.titanium < before.titanium, 'titanium ore burned');
    assert.ok(after.plate > before.plate, 'hull plate minted');
    assert.equal(s('station_drift', 'cmdty_ore_iron'), driftOre0,
      'a station with no industry book is untouched');
    assert.equal(s('station_drift', 'cmdty_refined_metals'), driftRef0,
      'the trade hub mints nothing');
  } finally { sim.dispose(); }
});

test('sustained ticks keep industrial and hub prices materially apart, deterministically', () => {
  const run = (seed) => {
    const sim = createSimulation({ seed, systems: [economy] });
    try {
      const { state } = sim;
      const econ = sim.registry.get('economy');
      for (const sid of ['sector_ceres_belt', 'sector_helios_prime', 'sector_tethys_junction',
        'sector_charon_expanse', 'sector_pallas_drift']) {
        econ.populateSector({ sectorId: sid });
      }
      for (let i = 0; i < 120; i += 1) { state.simTime += 5; econ.econTick(5, state); }
      const ceres = state.economy.markets.station_ceres;
      const beltout = state.economy.markets.station_beltout;
      return {
        // Producer vs consumer-world spread on the yard's own product.
        plateSpread: econ.priceOf('station_expanse', 'cmdty_comp_hullplate', 'sell')
          / econ.priceOf('station_drift', 'cmdty_comp_hullplate', 'sell'),
        // Smelted product is cheaper at the refinery than at the big hub. Tethys is the
        // comparison hub because ECON-01 keeps marketTier-1 goods off tier-0 Helios's book.
        refinedSpread: econ.priceOf('station_ceres', 'cmdty_refined_metals', 'sell')
          / econ.priceOf('station_tethys', 'cmdty_refined_metals', 'sell'),
        // Feedstock asks more at the refinery gate than at the pit head next door.
        oreSpread: econ.priceOf('station_ceres', 'cmdty_ore_iron', 'sell')
          / econ.priceOf('station_beltout', 'cmdty_ore_iron', 'sell'),
        // The running smelter holds refined stock up while the mining camp's sits flat.
        refinedCeres: ceres.cmdty_refined_metals.stock,
        refinedBeltout: beltout.cmdty_refined_metals.stock,
        snap: { ceres, beltout },
      };
    } finally { sim.dispose(); }
  };
  const a = run(SEED);
  assert.ok(a.plateSpread < 0.9, `yard plate undersells the hub (${a.plateSpread.toFixed(2)}x)`);
  assert.ok(a.refinedSpread < 0.95, `refinery refined undersells the hub (${a.refinedSpread.toFixed(2)}x)`);
  assert.ok(a.oreSpread > 1.05, `refinery pays a feedstock premium (${a.oreSpread.toFixed(2)}x)`);
  assert.ok(a.refinedCeres > a.refinedBeltout * 2,
    `the smelter's product piles up at the smelter (${a.refinedCeres.toFixed(0)} vs ${a.refinedBeltout.toFixed(0)})`);
  const b = run(SEED);
  assert.deepEqual(b.snap, a.snap, 'same seed reproduces the identical market state');
});

// ── 3. Physical claim convoy ────────────────────────────────────────────────────────────────

test('a dispatched relay leg manifests one durable civilian hauler with a stamped manifest', () => {
  const sim = bootConvoy();
  try {
    const { state } = sim;
    const body = commissionRelay(sim);
    sim.runTicks(240); // dispatch window + a few traffic maintenance passes
    const convoy = body.spec.convoy;
    assert.ok(convoy && convoy.convoyId, 'claims dispatched a convoy leg');
    assert.equal(convoy.manifested, true, 'traffic reported the hull manifested');
    const hull = state.entities.get(convoy.entityId);
    assert.ok(hull && hull.alive !== false, 'the convoy is a live entity, not a ledger ghost');
    assert.equal(hull.type, 'ship');
    assert.equal(hull.data.defId, 'ship_mule');
    assert.equal(hull.team, 2, 'civilian team');
    assert.equal(hull.data.trafficRole, 'hauler');
    assert.equal(hull.data.role, 'hauler');
    assert.equal(hull.data.ai.passive, true, 'passive civilian profile');
    assert.equal(hull.data.claimConvoy.bodyId, body.id);
    assert.equal(hull.data.claimConvoy.destStationId, convoy.destStationId);
    assert.ok(hull.flags.persistent, 'the hull survives Continue/shelving');
    // Durable identity is the ledger's id — kill/loss paths key on it.
    assert.equal(hull.data.worldRecordId, convoy.worldRecordId);
    assert.equal(convoy.worldRecordId, stableRecordId(
      state.meta.seed, CLAIM_SECTOR, RECORD_KIND.CONVOY,
      `claim-convoy:${body.id}:${convoy.convoyId.split(':cv')[1]}`,
    ), 'the record id is the deterministic claim-convoy derivation');
    const manifest = hull.data.cargoManifest;
    assert.ok(manifest && manifest.manifestId === stableManifestId(state.meta.seed, convoy.worldRecordId, 'hauler'),
      'the manifest is the deterministic convoy manifest');
    assert.deepEqual(manifest.lines.map((l) => ({ c: l.commodityId, q: l.qty })),
      [{ c: RELAY_GOOD, q: convoy.qty }],
      'the hold is exactly the dispatched freight');
    assert.equal(manifest.claimConvoyId, convoy.convoyId);
    assert.ok(state.traffic.freighters.some((r) => r && r.id === hull.id && r.role === 'hauler'),
      'traffic tracks the carrier as an ordinary hauler');
    assert.equal(hull.data.jobId, `job:${convoy.worldRecordId}`,
      'the npc hauler job is keyed to the durable record');
    assert.equal(hull.data.itinerary.kind, 'claim_convoy');
    // Maintenance is idempotent — no second hull, no re-stocked manifest.
    const count = () => state.traffic.freighters.filter((r) => {
      const e = r && state.entities.get(r.id);
      return e && e.data && e.data.claimConvoy && e.data.claimConvoy.convoyId === convoy.convoyId;
    }).length;
    sim.runTicks(300);
    assert.equal(count(), 1, 'still exactly one carrier for the leg');
    const ent = liveConvoyHull(sim, convoy.convoyId);
    assert.equal(ent && ent.id, hull.id, 'same hull, not a respawn');
  } finally { sim.dispose(); }
});

test('the manifested convoy is an eligible ambient-predation victim on an uncovered lane', () => {
  const sim = bootConvoy(SEED, PREDATION_SECTOR);
  try {
    const { state, bus } = sim;
    const body = commissionRelay(sim, {
      sectorId: PREDATION_SECTOR, localPos: { x: -620, z: 1420 }, // colony zone
    });
    sim.runTicks(240);
    const convoy = body.spec.convoy;
    const hull = state.entities.get(convoy.entityId);
    assert.ok(hull && hull.data.claimConvoy, 'convoy manifested');
    assert.equal(convoy.destStationId, 'station_expanse', 'the leg ships to the sector berth');

    // Park the carrier on the ambush lane where no lawful station or gate reaches —
    // discovered against the LIVE sector, since lawful cover includes gate proxies.
    const lane = zonesForSector(PREDATION_SECTOR).find((z) => z.id === 'zone_charon_ambush');
    assert.ok(lane, 'charon_expanse ships an ambush lane');
    const reach = (Number(lane.radius) || 0) + 500; // laneMarginWu
    const lawful = [];
    for (const e of state.entities.values()) {
      if (e && e.type === 'station' && e.alive !== false
        && LAWFUL_STATION_FACTIONS.has(e.factionId || (e.data && e.data.factionId))) {
        lawful.push(e);
      }
    }
    let spot = null; let bestD = -1;
    // rr capped at 0.95: the true margin edge is a float knife-edge — laneZoneNear's own
    // `d2 <= reach*reach` decides acceptance on a single unit² at rr 1.0.
    for (let a = 0; a < 96; a += 1) {
      for (let rr = 0.3; rr <= 0.95; rr += 0.1) {
        const local = {
          x: lane.center.x + Math.cos(a / 96 * Math.PI * 2) * reach * rr,
          z: lane.center.z + Math.sin(a / 96 * Math.PI * 2) * reach * rr,
        };
        const g = sectorLocalToGlobalForSector(local, PREDATION_SECTOR);
        if (protectedStationAt(state, { pos: g })) continue; // inside a patrol bubble — not raid space
        const d = Math.min(...lawful.map((s) => Math.hypot(s.pos.x - g.x, s.pos.z - g.z)));
        if (d > bestD) { bestD = d; spot = g; }
      }
    }
    assert.ok(spot && bestD > LAW_PRESENCE_WU + 50,
      `an uncovered in-lane spot exists (best ${Math.round(bestD)}wu of cover clearance)`);
    hull.pos.x = spot.x; hull.pos.z = spot.z;
    // The depot supply hauler is also a manifest carrier — clear rival candidacy so the pair
    // under test is the convoy specifically.
    for (const e of state.entities.values()) {
      if (e !== hull && e.data && e.data.cargoManifest) {
        e.data.cargoManifest = { lines: [], totalQty: 0 };
      }
    }
    // A fresh pirate beside the carrier: whichever eligible raider wins the deterministic
    // pairing, the victim must be the convoy.
    sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: spot.x + 400, z: spot.z }, vel: { x: 0, z: 0 },
      hull: 120, hullMax: 120, radius: 8, collides: true,
      data: {
        defId: 'ship_hornet',
        ai: { archetype: 'pirate', combatDoctrineId: 'interceptor_flyby' },
        weapons: [{ id: 'wpn_pulse_laser_s' }],
      },
    });
    const telegraphs = [];
    bus.on('encounter:ambientPredationTelegraph', (p) => telegraphs.push(p));
    updateAmbientPredation(state, { emit: (name, p) => bus.emit(name, p) });
    assert.equal(hull.data.predationRole, 'manifest_carrier',
      'the convoy hull entered the raid as the manifest carrier');
    const raidId = hull.data.predationEncounterId;
    assert.ok(typeof raidId === 'string' && raidId.startsWith('ambient:raid:'),
      'an ambient raid bound the convoy');
    assert.equal(telegraphs.length, 1, 'exactly one telegraph fired');
    assert.equal(telegraphs[0].targetId, hull.id);
    assert.equal(telegraphs[0].manifestId, hull.data.cargoManifest.manifestId);
    const raider = state.entities.get(telegraphs[0].raiderId);
    assert.equal(ambientObjective(raider).targetId, hull.id,
      'the bound raider tracks the convoy as its objective target');
  } finally { sim.dispose(); }
});

test('killing the convoy resolves the claim leg through freight:loss exactly once', () => {
  const sim = bootConvoy();
  try {
    const { state, bus } = sim;
    const body = commissionRelay(sim);
    sim.runTicks(240);
    const convoy = body.spec.convoy;
    const hull = state.entities.get(convoy.entityId);
    assert.ok(hull && hull.data.claimConvoy, 'convoy manifested');
    const losses = [];
    bus.on('freight:loss', (p) => losses.push(p));
    const before = body.spec.totals.lostU;
    hull.alive = false;
    bus.emit('entity:killed', {
      id: hull.id, killerId: 4242, sectorId: CLAIM_SECTOR, entity: hull,
    });
    assert.equal(losses.length, 1, 'the ordinary freight-loss ledger fired once');
    assert.equal(losses[0].freighterKey, convoy.worldRecordId,
      'the loss is keyed to the convoy durable record');
    assert.equal(body.spec.convoy, null, 'claims cleared the leg');
    assert.equal(body.spec.totals.lostU, before + convoy.qty,
      'the dispatched units book as lost exactly once');
    assert.ok(body.spec.receipts.some((r) => r && r.kind === 'convoy_lost'),
      'a convoy_lost receipt explains the loss to the player');
    // The world record is terminal — a concluded leg can never rematerialize.
    const rec = state.world.records && state.world.records.byId
      && state.world.records.byId[convoy.worldRecordId];
    assert.ok(rec && rec.alive === false, 'the durable record is closed');
  } finally { sim.dispose(); }
});

test('a berth unload settles only the freight that survived aboard', () => {
  const sim = bootConvoy();
  try {
    const { state, bus } = sim;
    const body = commissionRelay(sim);
    sim.runTicks(240);
    const convoy = body.spec.convoy;
    const hull = state.entities.get(convoy.entityId);
    assert.ok(hull && hull.data.claimConvoy, 'convoy manifested');
    // Simulate a raider skimming part of the hold before arrival.
    hull.data.cargoManifest.lines = [
      { commodityId: RELAY_GOOD, qty: convoy.qty - 10 },
      { commodityId: 'cmdty_scrap_metal', qty: 4 }, // picked up dross — not claim freight
    ];
    hull.data.cargoManifest.totalQty = convoy.qty - 6;
    const docked = [];
    bus.on('claim:convoyDocked', (p) => docked.push(p));
    const jobId = `job:${convoy.worldRecordId}`;
    // A wrong-destination unload must be ignored — even when the payload lies about its berth.
    bus.emit('npcjobs:unload', {
      event: 'npcjobs:unload', kind: 'hauler', jobId, completed: true,
      destination: 'dest:not_the_station',
      payload: { claimConvoy: { bodyId: body.id, convoyId: convoy.convoyId, destStationId: 'not_the_station' } },
    });
    assert.equal(docked.length, 0, 'a mismatched berth cannot settle the leg');
    assert.ok(body.spec.convoy, 'leg still open');
    // The honest arrival at the real berth.
    bus.emit('npcjobs:unload', {
      event: 'npcjobs:unload', kind: 'hauler', jobId, completed: true,
      destination: `dest:${convoy.destStationId}`,
      payload: {
        claimConvoy: {
          bodyId: body.id, convoyId: convoy.convoyId, destStationId: convoy.destStationId,
        },
      },
    });
    assert.equal(docked.length, 1);
    assert.equal(docked[0].qty, convoy.qty - 10,
      'only the claim freight that survived aboard settles — dross does not count');
    assert.equal(body.spec.convoy, null, 'the leg closed on physical arrival');
    assert.ok(body.spec.receipts.some((r) => r && (r.kind === 'convoy_sold' || r.kind === 'convoy_returned')),
      'the sale/return receipt books the arrived quantity');
    assert.equal(hull.alive, false, 'the completed carrier is retired, not left wandering');
    const rec = state.world.records && state.world.records.byId
      && state.world.records.byId[convoy.worldRecordId];
    assert.ok(rec && rec.alive === false, 'the delivered record is terminal');
    assert.equal(rec.outcome, 'delivered');
  } finally { sim.dispose(); }
});

test('an unwitnessed leg still completes abstractly when no hull ever manifested', () => {
  const sim = bootConvoy();
  try {
    const { state } = sim;
    // Suppress physical manifestation before the leg exists — the same case as the player being
    // out-of-sector for the whole transit, only synchronous.
    const helpers = sim.helpers;
    const spawnEntity = helpers.spawnEntity;
    helpers.spawnEntity = () => null;
    const body = commissionRelay(sim);
    sim.runTicks(120);
    const convoy = body.spec.convoy;
    assert.ok(convoy && convoy.convoyId, 'a leg is dispatched');
    assert.equal(convoy.manifested !== true, true, 'no hull ever materialized');
    state.simTime = convoy.arriveAt + 1;
    sim.runTicks(240);
    helpers.spawnEntity = spawnEntity;
    assert.equal(body.spec.convoy, null, 'the leg resolved on schedule');
    assert.equal(body.spec.totals.lostU, 0,
      'an unwitnessed convoy cannot be killed — the ledger never fabricates a loss');
    assert.ok(body.spec.receipts.some((r) => r && (r.kind === 'convoy_sold' || r.kind === 'convoy_returned')),
      'the abstract leg settled as a sale or a return');
  } finally { sim.dispose(); }
});

// ── 4. Honesty packet (fix-economy-honesty): refused-sale restock, toll truth, route
//       estimate honesty, unknown-berth services, hardship note, bribe + debt rescue ──────

function bootBerth(seed = 9021) {
  const sim = createSimulation({ seed, systems: [economy] });
  const { state } = sim;
  state.mode = 'flight';
  state.onboarding = { active: false, finished: true };
  return sim;
}

test('a refused biohazard sale mints no restocking book — the listing stays empty', () => {
  const sim = bootBerth();
  try {
    const { state } = sim;
    const econ = sim.registry.get('economy');
    econ.populateSector({ sectorId: 'sector_tethys_junction' });
    addCargo(state, 'cmdty_live_specimen', 3);
    // Customs Gate is faction_scn in a clean sector: the quarantine policy refuses the lot.
    const res = econ.execute('station_customs', 'cmdty_live_specimen', 'sell', 3);
    assert.equal(res.ok, false, 'the berth refuses the biohazard lot');
    assert.equal(res.reason, 'contamination_refusal');
    assert.ok(res.policyNote, 'the quarantine note reaches the caller');
    const listing = state.economy.markets['station_customs']['cmdty_live_specimen'];
    assert.ok(listing, 'the refusal still mints the liquidation row');
    assert.equal(listing.stock, 0, 'nothing was delivered');
    // Forty recovery ticks: the drift target must be the stock actually delivered (zero),
    // never the old full neutral book that refilled itself within seconds.
    for (let i = 0; i < 40; i += 1) { state.simTime += 5; econ.econTick(5, state); }
    assert.equal(state.economy.markets['station_customs']['cmdty_live_specimen'].stock, 0,
      'the refused listing never restocked itself into sellable stock');
  } finally { sim.dispose(); }
});

test('the berth toll collects and names what the wallet actually paid', () => {
  const sim = bootBerth();
  try {
    const { state, bus } = sim;
    const econ = sim.registry.get('economy');
    const toasts = [];
    bus.on('toast', (p) => toasts.push(p && p.text));
    const tollLine = () => toasts.filter((t) => /BERTH TOLL/.test(t || '')).pop() || '';

    // Full wallet: the posted price and the charge agree, nothing goes on the note.
    state.player.credits = 5000;
    state.player.debt = 0;
    econ._runDockedCustomsPost('station_customs');
    const posted = Number((tollLine().match(/(\d+) cr posted/) || [])[1]);
    assert.ok(posted > 0, 'the toll posts a visible price');
    assert.equal(state.player.credits, 5000 - posted, 'charged exactly the posted toll');
    assert.equal(state.player.debt | 0, 0, 'no shortfall is filed');

    // Shallow wallet: collect what exists, file the shortfall, say both numbers.
    state.player.credits = 100;
    state.player.debt = 0;
    econ._runDockedCustomsPost('station_customs');
    assert.equal(state.player.credits, 0, 'the wallet pays what it holds');
    assert.equal(state.player.debt, posted - 100, 'the unpaid remainder lands on the note');
    assert.match(tollLine(), /100 cr posted/, 'the line names the collected share');
    assert.match(tollLine(), new RegExp(`${posted - 100} cr filed`), 'the line names the filed share');
    assert.doesNotMatch(tollLine(), new RegExp(`${posted} cr posted`), 'the full toll is never claimed');

    // Dry wallet: nothing moves, but the note and the line still tell the truth.
    state.player.credits = 0;
    state.player.debt = 0;
    econ._runDockedCustomsPost('station_customs');
    assert.equal(state.player.debt, posted, 'the whole toll is filed, not waived silently');
    assert.match(tollLine(), new RegExp(`${posted} cr filed on the note`), 'the dry wallet hears it');
    assert.doesNotMatch(tollLine(), /cr posted/, 'a free pass is never implied');
  } finally { sim.dispose(); }
});

test('the two-stop card prices every remembered leg and keeps the best margin', () => {
  const sim = bootBerth();
  try {
    const { state } = sim;
    state.player.credits = 100000;
    state.player.cargo = { items: {}, usedVolume: 0, capVolume: 200 };
    state.economy.markets.station_ceres = {
      cmdty_ore_iron: { stock: 50, lastBuy: 100, lastSell: 110 },
    };
    state.economy.marketIntel.station_b = { snapshot: {
      cmdty_ore_titanium: { buy: 20, stock: 60 },
      cmdty_refined_metals: { buy: 200, stock: 30 },
    }, seenAtT: state.simTime };
    state.economy.marketIntel.station_c = { snapshot: {
      cmdty_ore_titanium: { sell: 25 },   // alphabetically first, +5/u
      cmdty_refined_metals: { sell: 400 }, // the leg that actually earns, +200/u
    }, seenAtT: state.simTime };
    const trade = {
      cmdtyId: 'cmdty_ore_iron', destStation: 'station_b',
      buyHere: 100, sellThere: 120, seenAtT: state.simTime,
    };
    const result = compareDockedFreight(state, 'station_ceres', trade);
    assert.ok(result, 'a positive second leg exists');
    assert.equal(result.basis.leg2Buy, 200,
      'the best-margin leg wins — not the alphabetically first commodity');
    assert.equal(result.basis.leg2Sell, 400);
    assert.ok(result.net > 0, 'the printed estimate is a real credit figure');
    const line = formatFreightComparison(result);
    assert.match(line, /two-stop estimate/, 'the card still labels itself an estimate');

    // Every remembered leg loses money → no estimate at all, never an invented one.
    state.economy.marketIntel.station_c.snapshot.cmdty_ore_titanium.sell = 10;
    state.economy.marketIntel.station_c.snapshot.cmdty_refined_metals.sell = 150;
    assert.equal(compareDockedFreight(state, 'station_ceres', trade), null,
      'no positive leg prints no route');
  } finally { sim.dispose(); }
});

test('a missing future price is named, never spliced in as "limited by unknown"', () => {
  const res = compareTwoStopFreight({
    credits: 1000, capVolume: 10, usedVolume: 0, operatingCost: 0,
    midStationId: 'a', destStationId: 'b',
    leg1: { buy: 10, sell: 15, stock: 5, volume: 1 },
    leg2: { buy: null, sell: 50, stock: 5, volume: 1 },
  });
  const line = formatFreightComparison(res);
  assert.match(line, /leg 2 limited by route price unavailable/,
    'the unpriced leg admits what it does not know');
  assert.doesNotMatch(line, /limited by unknown/, 'the raw limit token never reaches the player');
});

test('a berth the catalog cannot resolve offers nothing; the Long Berth offers its stage grants', () => {
  const sim = bootBerth();
  try {
    const { state } = sim;
    state.ui = state.ui || {};
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_does_not_exist';
    assert.equal(stationOffersService(state, 'refuel'), false,
      'a missing station row is not the whole yard');
    state.ui.dockedStationId = LONG_BERTH_STATION_ID;
    state.longBerth = { stage: 1 };
    assert.equal(stationOffersService(state, 'refuel'), false,
      'the un-restored tug sells no services');
    state.longBerth.stage = 3;
    assert.equal(stationOffersService(state, 'refuel'), true,
      'stage 3 hangs the pump');
    assert.equal(stationOffersService(state, 'repair'), true,
      'stage 3 hangs the patch rail');
  } finally { sim.dispose(); }
});

test('a rep-shaken starter on a zero-list hull still sees a note limit', () => {
  const sim = bootBerth();
  try {
    const { state } = sim;
    state.player.credits = 0;
    state.player.activeShipIndex = 0;
    state.player.ownedShips = [{ defId: 'ship_kestrel' }]; // the Hitch lists at 0 cr
    state.factions = state.factions || {};
    state.factions.faction_mts = { rep: -2 }; // one dock slam — still 'Known' at the berth
    const limit = loanLimitFor(state, 'station_tethys');
    assert.ok(limit > 0,
      `a -2 rep on the zero-list starter hull keeps a hardship note limit (got ${limit})`);
  } finally { sim.dispose(); }
});

test('a bribe with no live offer is declined by name instead of charged anyway', () => {
  const sim = bootBerth();
  try {
    const { state } = sim;
    const econ = sim.registry.get('economy');
    state.player.credits = 500;
    const refused = econ.payBribe({ fine: 0 });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'no_fine', 'no fine on the table buys nothing');
    assert.equal(state.player.credits, 500, 'the refusal never touches the wallet');
    const paid = econ.payBribe({ fine: 1000 });
    assert.equal(paid.ok, true);
    assert.equal(paid.charged, 300, 'a live offer charges its stated 30%');
    assert.equal(state.player.credits, 200);
    const short = econ.payBribe({ fine: 4000 });
    assert.equal(short.ok, false, 'short money cannot pay the quoted bribe');
    assert.equal(state.player.credits, 200, 'the failed bribe never half-charges');
  } finally { sim.dispose(); }
});

test('a zero-credit pilot reaches the debt refuel and weld when the verb arrives', () => {
  const sim = bootBerth();
  try {
    const { state } = sim;
    const econ = sim.registry.get('economy');
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { team: 0, pos: { x: 0, z: 0 } }));
    player.isPlayer = true;
    state.playerId = player.id;
    player.hull = 10; player.hullMax = 100; player.armorHp = 0; player.armorMax = 0;
    state.ui = state.ui || {};
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_tethys'; // pump + repair yard
    state.player.credits = 0;
    state.fuel = { current: 0, max: 40 };

    econ.handleService({ type: 'refuel' });
    assert.ok(state.fuel.current > 0, 'the hardship fill lands in the tank');
    assert.ok(state.player.debt > 0, 'the unpaid fill is filed on the note');
    const debtAfterFuel = state.player.debt;

    econ.handleService({ type: 'repair' });
    assert.ok(player.hull > 10, 'the emergency weld restores hull');
    assert.ok(state.player.debt > debtAfterFuel, 'the weld files its own note line');
  } finally { sim.dispose(); }
});

test('the service quote offers the debt refuel and weld at zero credits', () => {
  const sim = bootBerth();
  try {
    const { state } = sim;
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { team: 0, pos: { x: 0, z: 0 } }));
    player.isPlayer = true;
    state.playerId = player.id;
    player.hull = 10; player.hullMax = 100; player.armorHp = 0; player.armorMax = 0;
    state.ui = state.ui || {};
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_tethys';
    state.player.credits = 0;
    state.fuel = { current: 0, max: 40 };
    // Packet: serviceQuotes.js must offer the hardship paths the engine already owns — a
    // disabled verb at zero credits strands a pilot the note would otherwise carry.
    const offers = {
      refuel: serviceQuote('refuel', state, player).disabled,
      repair: serviceQuote('repair', state, player).disabled,
    };
    assert.deepEqual(offers, { refuel: false, repair: false },
      'broke at the pump: both verbs must stay offered as on-the-note services');
  } finally { sim.dispose(); }
});
