// RC-461 — restitution follows the hull, the yard is a physical place, and the court offer that
// reaches the board still quotes an externally settled range with no acceptance payout.
//
// Contract under test (build-map row 461, controller amendment §8):
//   * `quoteImpoundBill` scales the restitution half of the bill off the catalog price of the hull
//     actually flown — Mule 35,000 → 1,200 cr, Ironback 130,000 → 3,100 cr, unknown/absent hull →
//     the 1,200 cr floor, insured modules → the 500 cr deductible alone. A parked expensive hull
//     never reprices the active one, and a posted/open bill is never repriced.
//   * Impound labor stays physical: off the yard pad the debt does not move, standing on the pad
//     accrues the shift, walking away pauses it, and the completed shift closes only the impound
//     bill — never credits, never an unrelated composed obligation.
//   * A saved partial bill round-trips through JSON unchanged (owedCr / remainingCr / workS), and
//     changing hull afterwards does not reprice the posted obligation.
//   * A lost asset's communicator offer reaches the real mission board with the authored case's
//     `params.settlement_cr`, matching summary/risk text, and `reward_cr === 0`.
//
// Deliberately NOT asserted here: the contracts-card renderer (`missionDossierHtml` hero /
// "cr on delivery" / risk sentence / payout animation). That file is outside this row's write
// boundary and the deferred remainder is recorded in the plan's §8.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT, createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import {
  IMPOUND_RESTITUTION_CR,
  IMPOUND_RESTITUTION_RATE,
  IMPOUND_WORK_S,
  custodyConsequences,
  impoundBillFor,
  openImpoundBill,
  quoteImpoundBill,
} from '../src/systems/custodyConsequences.js';
import { economy } from '../src/systems/economy.js';
import { heat, WANTED_TIER } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { lossInvestigation } from '../src/systems/lossInvestigation.js';
import { salvage } from '../src/systems/salvage.js';
import { missions } from '../src/systems/missions.js';
import { caseIdForLoss } from '../src/data/wreckCourt/caseForLoss.js';
import { caseDef } from '../src/data/wreckCourt/index.js';
import { courtOfferPresentation } from '../src/systems/wreckCourt.js';

const SEED = 4242;
const LAW_SECTOR = 'sector_helios_prime';
const LOSS_SECTOR = 'sector_ceres_belt';
const START_CREDITS = 5000;

/** A player blob with exactly the fields the quote reads. */
function hullPlayer({ defId = null, index = 0, ships = null, deductibleCr = 500, insuredModules = false } = {}) {
  return {
    ownedShips: ships || (defId ? [{ defId }] : []),
    activeShipIndex: index,
    insurance: { deductibleCr, insuredModules },
  };
}

test('RC-461: restitution follows the catalog price of the hull in the pound', () => {
  assert.equal(IMPOUND_RESTITUTION_RATE, 0.02);
  assert.equal(IMPOUND_RESTITUTION_CR, 700);

  assert.equal(quoteImpoundBill(hullPlayer({ defId: 'ship_mule' })), 1_200,
    'Mule (catalog 35,000) owes the 500 deductible plus the 700 floor');
  assert.equal(quoteImpoundBill(hullPlayer({ defId: 'ship_ironback' })), 3_100,
    'Ironback (catalog 130,000) owes the 500 deductible plus 2,600 restitution');

  // Missing, unknown, zero-priced, and invalid-index hulls all use the flat floor — the yard
  // never guesses at another owned hull.
  assert.equal(quoteImpoundBill({}), 1_200, 'no player blob falls back to the floor');
  assert.equal(quoteImpoundBill(hullPlayer({ defId: 'ship_does_not_exist' })), 1_200, 'unknown defId falls back');
  assert.equal(quoteImpoundBill(hullPlayer({ defId: 'ship_kestrel' })), 1_200, 'a catalog-zero starter weighs the floor');

  // An unreadable index is rejected, not repaired by reading some other slot: the expensive hull
  // parked at slot 0 must not price a bill whose active hull cannot be identified.
  assert.equal(quoteImpoundBill(hullPlayer({ defId: 'ship_mule', index: 3 })), 1_200, 'an out-of-range index falls back');
  assert.equal(quoteImpoundBill(hullPlayer({ ships: [{ defId: 'ship_ironback' }], index: 0.5 })), 1_200,
    'a non-integer index falls back instead of reading slot 0');
  assert.equal(
    quoteImpoundBill({ ownedShips: [{ defId: 'ship_ironback' }], insurance: { deductibleCr: 500, insuredModules: false } }),
    1_200,
    'a missing index falls back instead of reading slot 0',
  );

  // A parked hull is not the hull being held: only the active slot prices the bill.
  const parked = hullPlayer({ ships: [{ defId: 'ship_ironback' }, { defId: 'ship_mule' }], index: 1 });
  assert.equal(quoteImpoundBill(parked), 1_200, 'the inactive Ironback does not price the active Mule');
  parked.activeShipIndex = 0;
  assert.equal(quoteImpoundBill(parked), 3_100, 'the active Ironback prices its own bill');

  // Insured modules keep the existing exemption: deductible only, whatever the hull.
  assert.equal(quoteImpoundBill(hullPlayer({ defId: 'ship_ironback', insuredModules: true })), 500);
  // The existing deductible denominator holds: a zero/absent deductible still reads the 500 default.
  assert.equal(quoteImpoundBill(hullPlayer({ defId: 'ship_mule', deductibleCr: 0, insuredModules: true })), 500);
});

// ── physical impound work ───────────────────────────────────────────────────────────────────────

function bootLaw(seed = SEED, { hull = 'ship_mule' } = {}) {
  const sim = createSimulation({
    seed,
    systems: [economy, heat, lawSecurity, custodyConsequences, spawnBudget],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = LAW_SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[LAW_SECTOR] = { id: LAW_SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  state.player.credits = START_CREDITS;
  // The hull actually flown is part of the fixture: the bill is priced off this catalog hull.
  state.player.ownedShips = [{ defId: hull }];
  state.player.activeShipIndex = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, hull: 200, hullMax: 200, radius: 8, mass: 28,
  });
  state.playerId = player.id;
  const recovered = [];
  const charges = [];
  bus.on('law:impoundRecovered', (p) => recovered.push(structuredClone(p)));
  bus.on('credits:changed', (p) => charges.push(structuredClone(p)));
  return { sim, state, bus, player, recovered, charges };
}

function killLawman(sim, state, seedId) {
  const player = state.entities && state.entities.get(state.playerId);
  const pos = player && player.pos ? player.pos : { x: 0, z: 0 };
  // The victim is a real spawned hull so lawSecurity's kill adjudication reads a true entity
  // (a synthetic id would leave its victim lookup empty and dirty the witness log).
  const victim = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x + 40, z: pos.z + seedId % 7 },
    hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true } },
  });
  const eye = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x + 30, z: pos.z },
    hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true }, witnessEye: true },
  });
  sim.bus.emit('entity:killed', {
    id: victim.id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_scn',
    factionLawful: true,
    targetHostileToPlayer: false,
  });
  victim.alive = false;
  victim.hull = 0;
  eye.alive = false;
  eye.hull = 0;
}

function raiseToImpound(sim, state) {
  sim.bus.emit('faction:aggro', { isAggro: true, factionId: 'faction_scn' });
  killLawman(sim, state, 4611);
  killLawman(sim, state, 4612);
}

function liveEntity(state, flag) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data[flag] === true
  ));
}

function runTicks(t, count) {
  for (let i = 0; i < count; i++) t.sim.step();
}

test('RC-461: the posted impound bill prices the flown hull, and yard labor is physical', () => {
  const t = bootLaw(SEED, { hull: 'ship_ironback' });
  raiseToImpound(t.sim, t.state);
  t.sim.step();

  assert.equal(t.state.player.wantedTier, WANTED_TIER.IMPOUND, 'the fixture actually reaches the impound band');
  const bill = impoundBillFor(t.state);
  assert.ok(bill && bill.status === 'open', 'the yard posted a bill');
  assert.equal(bill.owedCr, 3_100, 'an Ironback in the pound posts the hull-scaled bill, not the flat floor');
  assert.equal(bill.owedCr, quoteImpoundBill(t.state.player), 'the posted bill is the live quote for this hull');
  assert.equal(bill.remainingCr, bill.owedCr, 'nothing is pre-worked');

  const yard = liveEntity(t.state, 'wantedImpoundYard');
  assert.ok(yard && yard.pos, 'the yard is a physical body in the world');

  // Off the pad: two seconds of sim time move nothing. Labor is a place, not a timer.
  t.player.pos.x = yard.pos.x + 4000;
  t.player.pos.z = yard.pos.z;
  runTicks(t, Math.round(2 / SIM_DT));
  assert.equal(bill.workS, 0, 'time away from the yard does not work the bill');
  assert.equal(bill.remainingCr, 3_100);
  assert.equal(bill.status, 'open');

  // On the pad: 120 fixed ticks is two seconds of shift, and the debt accrues exactly.
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  runTicks(t, Math.round(2 / SIM_DT));
  assert.ok(Math.abs(bill.workS - 2) < 0.05, `120 ticks accrued about two seconds (${bill.workS})`);
  const expectedRemaining = bill.owedCr - Math.round(bill.owedCr * (bill.workS / bill.workNeedS));
  assert.equal(bill.remainingCr, expectedRemaining, 'the outstanding obligation is exact mid-shift');
  assert.ok(bill.remainingCr > 0, 'half a shift is not a settled bill');

  // Leaving pauses: the clock keeps running, the shift does not.
  const pausedWork = bill.workS;
  t.player.pos.x = yard.pos.x + 4000;
  t.player.pos.z = yard.pos.z;
  runTicks(t, Math.round(2 / SIM_DT));
  assert.equal(bill.workS, pausedWork, 'leaving the pad stops the shift where it stood');
  assert.equal(t.recovered.length, 0, 'a paused shift closes nothing');

  // An unrelated composed obligation exists before the shift completes.
  const law = t.sim.registry.get('lawSecurity');
  const other = law.noteComposedObligation({
    kind: 'restitution', causeId: 'rc461:unrelated', forPerson: 'a stranded hauler', amountCr: 400,
  });
  assert.equal(other.accepted, true);

  // Return and finish the shift: it closes once, as labor, without minting credits.
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  runTicks(t, Math.ceil((IMPOUND_WORK_S - pausedWork) / SIM_DT) + 4);

  assert.equal(t.recovered.length, 1, 'the completed shift closes the impound once');
  assert.equal(t.recovered[0].method, 'work');
  assert.equal(bill.status, 'worked');
  assert.equal(bill.remainingCr, 0);
  assert.equal(t.state.player.credits, START_CREDITS, 'yard labor is never a payout');
  assert.equal(t.charges.filter((c) => c.reason === 'impound:pay').length, 0, 'no credits were charged for work');
  const standing = law.composedDisposition().find((row) => row.causeId === 'rc461:unrelated');
  assert.ok(standing, 'the unrelated obligation still exists');
  assert.equal(standing.remainingCr, 400, 'impound labor settles only the impound bill');
  assert.equal(standing.status, 'open');

  t.sim.dispose();
});

// ── saved partial bills ────────────────────────────────────────────────────────────────────────

test('RC-461: a saved partial bill round-trips unchanged and a later hull change cannot reprice it', () => {
  const t = bootLaw(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const bill = impoundBillFor(t.state);
  const yard = liveEntity(t.state, 'wantedImpoundYard');
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  runTicks(t, Math.round(1.5 / SIM_DT));
  assert.ok(bill.workS > 0 && bill.workS < bill.workNeedS, 'the fixture quit mid-shift');

  const savedLedger = JSON.parse(JSON.stringify(t.state.player.custodyLedger));
  const snapshot = {
    owedCr: savedLedger.impound.owedCr,
    remainingCr: savedLedger.impound.remainingCr,
    workS: savedLedger.impound.workS,
    billId: savedLedger.impound.billId,
    status: savedLedger.impound.status,
  };
  assert.equal(snapshot.owedCr, 1_200, 'the Mule posted the scaled 1,200 cr bill');
  assert.ok(snapshot.remainingCr > 0 && snapshot.remainingCr < snapshot.owedCr, 'the save carries a partial debt');
  t.sim.dispose();

  // Reload into a fresh state whose pilot is now flying the expensive hull.
  const state = createGameState(SEED);
  state.player.ownedShips = [{ defId: 'ship_ironback' }];
  state.player.activeShipIndex = 0;
  state.player.custodyLedger = savedLedger;
  const reloaded = createSimulation({ state, systems: [custodyConsequences] });
  reloaded.step();

  const restored = impoundBillFor(state);
  assert.ok(restored, 'the ledger survived the JSON round-trip');
  assert.equal(restored.owedCr, snapshot.owedCr, 'owedCr is unchanged');
  assert.equal(restored.remainingCr, snapshot.remainingCr, 'remainingCr is unchanged');
  assert.equal(restored.workS, snapshot.workS, 'workS is unchanged');
  assert.equal(restored.billId, snapshot.billId);
  assert.equal(restored.status, 'open');

  // The live quote for the new hull is different — but the posted obligation is not repriced.
  assert.equal(quoteImpoundBill(state.player), 3_100, 'an Ironback hull quotes the scaled bill');
  const reopened = openImpoundBill(state, { yard: restored.yard, work: restored.work });
  assert.equal(reopened.owedCr, snapshot.owedCr, 're-posting an open bill keeps its posted amount');
  assert.equal(reopened.remainingCr, snapshot.remainingCr, 'and its exact partial progress');
  assert.equal(reopened.workS, snapshot.workS);
  reloaded.dispose();
});

test('RC-461: a pre-dedup saved bill missing billId is backfilled on repost, not softlocked', () => {
  const state = createGameState(SEED);
  state.player.custodyLedger = {
    impound: {
      status: 'open', owedCr: 1200, remainingCr: 800, workS: 12, workNeedS: 60,
      // billId deliberately absent — the shape that predates the receipt-dedup packet.
    },
  };
  const sim = createSimulation({ state, systems: [custodyConsequences] });
  sim.step();
  const bill = impoundBillFor(state);
  assert.equal(bill.billId, undefined, 'the loaded bill really lacks the id');
  const reposted = openImpoundBill(state, { billId: 'impound:4242' });
  assert.equal(reposted.billId, 'impound:4242', 'the repost backfills the missing identity');
  assert.equal(reposted.remainingCr, 800, 'backfilling never reprices');
  sim.dispose();
});

// ── the court offer that reaches the board ────────────────────────────────────────────────────

function bootDocket() {
  const sim = createSimulation({
    seed: SEED,
    systems: [lossLedger, lossInvestigation, salvage, missions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.credits = 500_000;
  state.world.currentSectorId = LOSS_SECTOR;
  state.world.sectors[LOSS_SECTOR] = { id: LOSS_SECTOR, name: 'Ceres Belt', owner: 'faction_dmc' };
  // Standing at the sector's board station: the recovery desk must be reachable, not guessed.
  for (const factionId of ['faction_dmc', 'faction_scn', 'faction_mts', 'faction_reach', 'faction_choir']) {
    state.factions[factionId] = { rep: 100 };
  }
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

test('RC-461: a lost asset reaches the real board as a court row that quotes its settlement', () => {
  const h = bootDocket();
  h.bus.emit('automation:assetLost', { kind: 'trader', id: 'hauler_4242', value: 400, sectorId: LOSS_SECTOR });
  const loss = (h.state.lossLedger.entries || []).find((entry) => entry && entry.assetId === 'hauler_4242');
  assert.ok(loss && loss.lossId, 'the real loss ledger recorded the loss');

  // A physical communicator in the sector; the promotion stamps it with the loss's own case.
  h.state.salvage.points = [{
    id: 'sp_rc461_0',
    sectorId: LOSS_SECTOR,
    zoneId: `${LOSS_SECTOR}:z1`,
    pos: { x: 60, z: 40 },
    entityId: null,
    offered: false,
  }];
  h.bus.emit('salvage:placed', { sectorId: LOSS_SECTOR });

  const point = h.state.salvage.points[0];
  assert.equal(point.isCommunicator, true, 'the loss promoted the communicator');
  const caseId = caseIdForLoss(loss, { seed: SEED, sectorId: LOSS_SECTOR });
  assert.equal(point.wreckCourtCaseId, caseId, 'the communicator carries the loss\'s deterministic case');

  // Walk the player within the salvage discovery radius; the real owner emits the offer and the
  // real missions owner adopts it onto its board.
  h.player.pos.x = 0;
  h.player.pos.z = 0;
  h.sim.step();
  assert.equal(point.offered, true, 'proximity discovery fired');

  const boards = Object.values(h.state.missions.boards || {});
  const rows = boards.flatMap((board) => (board && Array.isArray(board.slots) ? board.slots : []))
    .filter((row) => row && row.source === 'wreckCourt' && row.params && row.params.wreckCourtCaseId === caseId);
  assert.equal(rows.length, 1, 'the court row sits on the board exactly once');
  const row = rows[0];

  const def = caseDef(caseId);
  const presentation = courtOfferPresentation(def);
  assert.deepEqual(row.params.settlement_cr, presentation.range,
    'the board row quotes the authored settlement range for its case');
  assert.equal(row.reward_cr, 0, 'accepting a court case pays nothing');
  assert.equal(row.params.settlesExternally, true, 'the range settles at the ruling, not on delivery');
  assert.match(row.summary, new RegExp(presentation.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the dossier sentence names the same range');
  assert.match(row.riskNote, new RegExp(presentation.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the risk line names the same range');
  assert.match(row.title, new RegExp(def.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'the row is titled for the case it actually convenes');

  h.sim.dispose();
});

test('RC-461: accepting the court row pays nothing — the ruling is the only writer of credits', () => {
  const h = bootDocket();
  const grants = [];
  h.bus.on('economy:grantCredits', (p) => grants.push(structuredClone(p)));
  const creditsBefore = h.state.player.credits;

  h.bus.emit('automation:assetLost', { kind: 'trader', id: 'hauler_4242_paid', value: 400, sectorId: LOSS_SECTOR });
  h.state.salvage.points = [{
    id: 'sp_rc461_paid',
    sectorId: LOSS_SECTOR,
    zoneId: `${LOSS_SECTOR}:z1`,
    pos: { x: 60, z: 40 },
    entityId: null,
    offered: false,
  }];
  h.bus.emit('salvage:placed', { sectorId: LOSS_SECTOR });
  h.player.pos.x = 0;
  h.player.pos.z = 0;
  h.sim.step();

  const rows = Object.values(h.state.missions.boards || {})
    .flatMap((board) => (board && Array.isArray(board.slots) ? board.slots : []))
    .filter((row) => row && row.source === 'wreckCourt');
  assert.equal(rows.length, 1, 'the court row sits on the board');
  const row = rows[0];
  assert.equal(row.reward_cr, 0, 'the boarded row carries no acceptance payout');

  // Accept through the real missions owner — the same call the board UI makes.
  const owner = h.sim.registry.get('missions');
  assert.equal(owner.acceptMission(row.id), true, 'the real missions owner accepts the court row');
  const active = h.state.missions.active.find((m) => m && m.sourceOfferId === row.id);
  assert.ok(active, 'the accepted court case is a live mission');
  assert.equal(active.params.wreckCourtCaseId, row.params.wreckCourtCaseId,
    'the accepted mission convenes the same case the row quoted');
  assert.equal(active.reward_cr, 0, 'the live mission instance carries no acceptance payout');
  assert.equal(grants.length, 0, 'accepting a court case grants no credits');
  assert.equal(h.state.player.credits, creditsBefore, 'the wallet is untouched by acceptance');

  h.sim.dispose();
});
