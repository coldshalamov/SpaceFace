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
import { economy } from '../src/systems/economy.js';
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

    const offered = [];
    bus.on('mission:offered', (p) => offered.push(p && p.id));
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
      for (const sid of ['sector_ceres_belt', 'sector_helios_prime',
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
        // Smelted product is cheaper at the refinery than at the big hub.
        refinedSpread: econ.priceOf('station_ceres', 'cmdty_refined_metals', 'sell')
          / econ.priceOf('station_helios', 'cmdty_refined_metals', 'sell'),
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
