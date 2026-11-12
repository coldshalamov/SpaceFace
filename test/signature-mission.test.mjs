/**
 * W-TENDER — "The Tender — Tethys to the Forge": the signature run, end to end.
 *
 * Behavioral coverage through the REAL missions owner in a headless sim (the fb-hearing
 * precedent: createSimulation with the missions system registered, every beat through the
 * owner's public seams — ensureBoard, acceptMission, the dock event, the trade event, the
 * per-tick drive). No world boot, no wall clock, no sleeps: the desk's intake window runs on
 * state.simTime and the drive is one real `update` tick.
 *
 * The arcs, in the order the desk tells them:
 *   1. the authored data — heist stays last, the roll can never pick the tender, terms are
 *      frozen tuning and a pure builder with no duration_s;
 *   2. the board — one desk row on the Tethys rail board, never on another board, and a
 *      settled run never reposts over its durable ledger;
 *   3. acceptance — the 25% stake is an economy intent, the window stamps on the instance,
 *      and the rival queue places two civilians at the Customs Gate;
 *   4. the wait — queue seconds are window seconds: a held scan face keeps the declare
 *      closed, the dwells free it, and the weigh stamps once;
 *   5. the honored sale — 1100 × 1.5 window × 1.10 declared pays through the ordinary trade
 *      event, the receipt speaks the bend, and a replayed trade event settles nothing twice;
 *   6. the late lot — the close arms the sell-out grace and re-prices at base; the shipped
 *      deadline branch never mints the red EXPIRED;
 *   7. the floor — a short lot with no desk contact fails forward into a posted spot row;
 *   8. the flagged intake — the forbid trips, duty stamps at the weigh, Concord moves −2,
 *      and the sale still settles at the window premium, without the paperwork premium.
 *
 * RUN: node --test test/signature-mission.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  MISSION_TYPES,
  OFFER_MIX,
  POSITIONAL_OFFER_TYPES,
  TENDER_HAUL_TUNING,
  TENDER_HAUL_TYPE,
  TENDER_HAUL_SOURCE,
  TENDER_HAUL_TAG,
  TENDER_HAUL_GATE_FACTION_ID,
  buildTenderOffer,
  tenderCollateralCr,
  offerMixWeight,
  validateOfferMix,
} from '../src/data/missionsData.js';
import {
  MISSION_CONDITION_EVENTS,
  TICK_CONDITION_IDS,
  missionConditionById,
} from '../src/data/missionConditions.js';
import { TENDER_RECORD_SCHEMA, TENDER_SPOT_SOURCE } from '../src/missions/tenderHaul.js';
// Load order matters: missionSpawningOps and missions.js import each other — missions.js must
// finish initializing before missionSpawningOps's own importers see it (the ops-object spread).
import { missions } from '../src/systems/missions.js';

const T = TENDER_HAUL_TUNING;
const SEED = 4242;
const DESK = T.deskStationId;
const GATE = T.gateStationId;
const RAIL = T.railStationId;

/** Boot the real missions owner in a focused sim; capture every intent the owner emits. */
function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.credits = 50000;
  state.factions.faction_dmc = { rep: 100 };  // the paying foundry desk
  state.factions.faction_scn = { rep: 0 };    // Concord's Customs Gate — the secondary channel
  // The ordinary route: the desk row posts on the Tethys rail board, so the pilot accepts in the
  // Tethys junction — the same sector as the Customs Gate, where the rival queue lives. The offer
  // carries gateSectorId, so the deferred-spawn lifecycle places the queue here at accept.
  state.world.currentSectorId = T.railSectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const seen = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => {
    seen.push({ name, payload });
    return origEmit(name, payload);
  };
  return { sim, state, bus, player, seen, missionsSys: sim.registry.get('missions') };
}

function byName(h, name) {
  return h.seen.filter((row) => row.name === name);
}

/** Post the board through the owner seam the station UI uses and return the desk's row. */
function postTenderRow(h) {
  const board = h.missionsSys.ensureBoard(RAIL);
  const row = board && board.slots.find((offer) => offer && offer.type === TENDER_HAUL_TYPE);
  assert.ok(row, 'the standing tender row posts on the Tethys rail board');
  return { board, row };
}

/** Accept the desk row through the owner and return the live run. */
function acceptTender(h) {
  const { board, row } = postTenderRow(h);
  assert.equal(h.missionsSys.acceptMission(row.id), true, 'the desk row accepts through the owner');
  const m = h.state.missions.active.find((cand) => cand && cand.type === TENDER_HAUL_TYPE);
  assert.ok(m, 'the tender run is live');
  assert.equal(board.slots.some((offer) => offer && offer.id === row.id), false,
    'acceptance removes the row from the board');
  return { m, row };
}

/** Arrange the hold. Production writes are cargo authority's; the economy system is not
 * registered in this lab, so the fixture places the stacks the arcs name directly. */
function loadHold(h, items) {
  const cargo = h.state.player.cargo;
  cargo.capVolume = Math.max(cargo.capVolume || 0, 1000);
  cargo.capMass = Math.max(cargo.capMass || 0, 5000);
  for (const [id, qty] of Object.entries(items)) cargo.items[id] = qty;
}

const sellLot = (h, qty, extra = {}) => h.bus.emit('economy:tradeCompleted', {
  commodityId: T.cmdtyId, side: 'sell', qty, stationId: DESK, ...extra,
});

// ── 1. The authored data ──────────────────────────────────────────────────────────────────────

test('the tender row is authored-only data: heist stays last, the roll can never pick it', () => {
  const types = MISSION_TYPES.map((row) => row.type);
  const tenderIdx = types.indexOf(TENDER_HAUL_TYPE);
  const heistIdx = types.indexOf('heist_intercept');
  assert.ok(tenderIdx > 0, 'the tender sits in the registry');
  assert.equal(heistIdx, types.length - 1, 'heist_intercept stays last');
  assert.equal(tenderIdx, heistIdx - 1, 'the tender inserts immediately before the heist');
  const row = MISSION_TYPES[tenderIdx];
  assert.equal(row.proceduralWeight, 0, 'authored-only: structural zero weight');
  assert.equal(row.chainable, false, 'a settled tender never mints a procedural sequel');
  assert.equal(row.collateral, true, 'the desk holds a stake');
  assert.equal(row.constraints && row.constraints.authoredOnly, true);

  // Zero structural weight, read by NAME: no mix row carries it and the positional rows
  // stay ten columns so inserting the type cannot shift anyone onto a wrong column.
  assert.equal(validateOfferMix().ok, true, 'the shipped mixes still validate beside the new type');
  for (const [profile, weights] of Object.entries(OFFER_MIX)) {
    assert.equal(offerMixWeight(weights, TENDER_HAUL_TYPE), 0,
      `${profile} can never roll the tender`);
  }
  assert.deepEqual(POSITIONAL_OFFER_TYPES.filter((id) => id === TENDER_HAUL_TYPE), [],
    'never a positional mix column');

  // The tender terms are live catalog rows: the dual-half window rides the tick slot
  // beside honest_sling, and its event half reads the verified trade event.
  assert.equal(TICK_CONDITION_IDS.includes('tender_window'), true,
    'tender_window sits in TICK_CONDITION_IDS beside honest_sling');
  assert.equal(MISSION_CONDITION_EVENTS.includes('economy:tradeCompleted'), true);
  const window = missionConditionById('tender_window');
  assert.equal(window.blocking, false, 'the window re-prices; it never voids');
  assert.equal(window.rewardMult, 1.5);
  const declared = missionConditionById('grader_declared');
  assert.equal(declared.blocking, false, 'running the chord is the priced alternative arm');
  assert.equal(declared.rewardMult, 1.10);
  const flagged = missionConditionById('manifest_undisclosed');
  assert.equal(flagged.onBreach, 'forfeit', 'the contract still settles; the flag costs duty and Concord');
  for (const id of ['tender_window', 'grader_declared', 'manifest_undisclosed']) {
    assert.deepEqual(missionConditionById(id).appliesTo, [TENDER_HAUL_TYPE],
      `${id} carries the tender family only`);
  }
});

test('the desk constants are frozen tuning and the offer builder is pure with no deadline', () => {
  assert.equal(Object.isFrozen(T), true, 'the desk cannot be talked off its numbers');
  assert.equal(T.lotUnits, 440);
  assert.equal(T.manifestUnits, 460);
  assert.equal(T.dutyPerUnitCr, 4);
  assert.equal(T.rewardCr, 1100);
  assert.equal(T.windowS, 2400);
  assert.equal(T.graceS, 90);
  assert.equal(T.floorUnits, 220);
  assert.equal(tenderCollateralCr(), 275, 'the 25% stake, rounded up');

  const offer = buildTenderOffer({ epoch: 7 });
  assert.equal(offer.id, 'tender_tethys_forge_iron');
  assert.equal(offer.source, TENDER_HAUL_SOURCE);
  assert.equal(offer.stationId, RAIL, 'the desk posts through the Tethys junction rail');
  assert.equal(offer.destStationId, DESK);
  assert.equal(offer.duration_s, undefined,
    'no duration_s — the shipped deadline branch can never mint the red EXPIRED');
  assert.equal(offer.time_limit_s, T.windowS, 'the window prints on the pacing chip only');
  assert.equal(offer.params.tenderTag, TENDER_HAUL_TAG);
  assert.equal(offer.params.qty, T.lotUnits);
  assert.equal(offer.params.manifestUnits, T.manifestUnits);
  assert.equal(offer.params.gateSectorId, T.gateSectorId,
    'the queue\'s sector rides the offer — the deferred spawn keys on it, not on the desk');
  assert.match(offer.adminField,
    /LOT 440U IRON ORE · MANIFEST: THE 440U LOT ONLY — ALL OTHER MASS WEIGHS 4 CR\/U · FEE 1,100 CR · STAKE 275 CR RETURNED ON SETTLE/,
    'the manifest line states the weigh\'s truth: only the lot rides duty-free');
  assert.match(offer.description, /Desk fee: 1,100 cr, up to 1,815 cr with the window and paperwork premiums; the 275 cr stake is held at accept and returned on settle\./);
  assert.doesNotMatch(offer.description, /Net of stake/, 'the refundable stake is never subtracted from the fee');
  assert.doesNotMatch(offer.description, /spike/, 'no promised market spike — the junction field is the supply');
  assert.deepEqual(buildTenderOffer({ epoch: 7 }), offer, 'the builder is pure');
});

// ── 2. The board ──────────────────────────────────────────────────────────────────────────────

test('the rail board carries one desk row and a settled run never reposts', () => {
  const h = boot();
  const { board, row } = postTenderRow(h);
  assert.equal(row.id, 'tender_tethys_forge_iron');
  assert.equal(row.stationId, RAIL);
  assert.deepEqual(row.clauses.map((c) => c.conditionId),
    ['tender_window', 'grader_declared', 'manifest_undisclosed'],
    'the three terms stamp onto the board row');
  assert.equal(row.duration_s, undefined, 'the board row carries no deadline either');

  // Same-epoch re-sync mints no duplicate.
  const again = h.missionsSys.ensureBoard(RAIL);
  assert.equal(again.slots.filter((offer) => offer && offer.type === TENDER_HAUL_TYPE).length, 1);

  // Only the rail board carries it — and a zero-weight type can never roll there either.
  const forge = h.missionsSys.ensureBoard(DESK);
  assert.ok(forge, 'the Forge desk board exists');
  assert.equal(forge.slots.some((offer) => offer && offer.type === TENDER_HAUL_TYPE), false);

  // A settled run promotes to the durable ledger; a fresh board never reposts the row.
  h.state.missions.tenderTally = { missionId: 'm_settled', outcome: 'completed' };
  delete h.state.missions.boards[RAIL];
  const afterLedger = h.missionsSys.ensureBoard(RAIL);
  assert.equal(afterLedger.slots.some((offer) => offer && offer.type === TENDER_HAUL_TYPE), false,
    'the durable ledger blocks the repost');

  // Same block through the story flag alone.
  h.state.missions.tenderTally = null;
  h.state.story.flags.tender_tally_filed = true;
  delete h.state.missions.boards[RAIL];
  const afterFlag = h.missionsSys.ensureBoard(RAIL);
  assert.equal(afterFlag.slots.some((offer) => offer && offer.type === TENDER_HAUL_TYPE), false,
    'the filed flag blocks the repost');
  h.sim.dispose();
});

// ── 3. Acceptance ─────────────────────────────────────────────────────────────────────────────

test('acceptance charges the stake, stamps the window, and places the rival queue', () => {
  const h = boot();
  const { m } = acceptTender(h);

  assert.equal(m.deadline_s, null, 'no mission deadline — the drive owns the clock');
  assert.equal(m.objectiveTarget, T.lotUnits, 'the desk counts the lot');
  assert.equal(m.tender.schema, TENDER_RECORD_SCHEMA, 'the durable run record rides the instance');
  assert.equal(m.params.tenderCloseAt_s, m.acceptedAt_s + T.windowS,
    'the window was already running at accept, as the dossier said');
  assert.equal(m.tender.closeAtS, m.params.tenderCloseAt_s,
    'the record and the params read one close');

  const charges = byName(h, 'economy:chargeCredits');
  assert.deepEqual(charges.map((e) => [e.payload.amount, e.payload.reason]),
    [[275, 'collateral:tender_tethys_forge_iron']],
    'the 25% stake is an economy intent — the wallet is never missions\' to write');

  // The queue is placed world content: two civilians holding the Customs Gate face,
  // staggered on their own authored dwells. The hulls are placed through the owner's
  // deferred-spawn seam at accept (the pilot accepts in the gate's own sector).
  assert.equal(m.params.gateSectorId, T.gateSectorId, 'the live run carries the queue\'s sector');
  assert.equal(m.tender.rivals.length, 2, 'one durable slot per queued hauler');
  const names = [];
  for (const row of m.tender.rivals) {
    assert.equal(row.issued, true, 'each slot issues once');
    const hull = h.state.entities.get(row.id);
    assert.ok(hull && hull.alive !== false, 'each issued slot has a live hull');
    assert.equal(hull.data.tenderRivalOf, String(m.id), 'the hull is stamped for this queue');
    assert.equal(hull.homeSectorId, T.gateSectorId, 'the hull is filed under the gate sector');
    assert.equal(hull.data.homeSectorId, T.gateSectorId, 'and so is its world record identity');
    names.push(hull.data.name);
  }
  assert.deepEqual(names, ['FLAT RATE', 'COLDER LEDGER']);
  const [first, second] = m.tender.rivals.map((row) => row.dwellUntil);
  assert.equal(second - first, T.rivalStaggerS, 'the second hold starts after the first begins');
  h.sim.dispose();
});

// ── 4. The wait ───────────────────────────────────────────────────────────────────────────────

test('queue seconds are window seconds: the declare waits for the scan face', () => {
  const h = boot();
  const { m } = acceptTender(h);
  loadHold(h, { [T.cmdtyId]: T.lotUnits }); // the contract lot — manifest-covered

  // First dock: both rivals still hold the face. Nothing latches and nobody moves.
  h.bus.emit('dock:docked', { stationId: GATE });
  assert.equal(m._clauseState && m._clauseState.grader_declared, undefined,
    'a held face keeps the declare closed');
  assert.equal(m.params.weighDeclared, undefined, 'nothing stamps while queued');
  assert.deepEqual(byName(h, 'faction:repDelta'), [], 'no Concord movement before a weigh');

  // The dwells elapse in flight — window seconds — and the next dock latches the declare.
  h.state.simTime += T.rivalStaggerS + T.rivalDwellS + 1;
  h.bus.emit('dock:docked', { stationId: GATE });
  assert.equal(m._clauseState.grader_declared.satisfied, true,
    'the face frees as the dwells elapse and the declare latches');
  assert.equal(m.params.weighDeclared, true, 'the Tally weigh stamps at the latch');
  assert.equal(m.params.weighOverU, 0, 'the contract lot is manifest-covered');
  assert.equal(m.params.weighDutyCr, 0);
  assert.deepEqual(byName(h, 'faction:repDelta').map((e) => [e.payload.factionId, e.payload.delta]),
    [[TENDER_HAUL_GATE_FACTION_ID, 1]], 'Concord moves +1 through the secondary channel');

  // A duplicate dock never re-weighs and never re-moves Concord.
  h.bus.emit('dock:docked', { stationId: GATE });
  assert.equal(byName(h, 'faction:repDelta').length, 1, 'the weigh stamps once');

  // The clean hold at the Forge never trips the intake weigh.
  h.bus.emit('dock:docked', { stationId: DESK });
  assert.equal(Number.isFinite(m.tender.deskContactAt_s), true, 'the desk counts contact from the dock');
  assert.equal(m._clauseState.manifest_undisclosed, undefined,
    'a manifest-clean hold is never flagged');
  h.sim.dispose();
});

// ── 5. The honored sale ───────────────────────────────────────────────────────────────────────

test('the honored sale pays the premiums through the ordinary trade event', () => {
  const h = boot();
  const { m } = acceptTender(h);
  loadHold(h, { [T.cmdtyId]: T.lotUnits });
  h.state.simTime += T.rivalStaggerS + T.rivalDwellS + 1;
  h.bus.emit('dock:docked', { stationId: GATE }); // declared at the Tally, clean weigh

  const closeAt = m.params.tenderCloseAt_s;
  const spare = closeAt - h.state.simTime;
  sellLot(h, T.lotUnits, { priceImpactPct: -4.2 });

  assert.equal(m.status, 'completed', 'the desk count settles through economy:tradeCompleted');
  assert.equal(h.state.missions.active.some((cand) => cand.id === m.id), false,
    'the settled run leaves the active list');

  const grants = byName(h, 'economy:grantCredits');
  const pay = grants.find((e) => e.payload.reason === `mission:${m.id}`);
  assert.equal(pay.payload.amount, 1815, '1100 × 1.5 window × 1.10 declared');
  const refund = grants.find((e) => e.payload.reason === `collateral_refund:${m.id}`);
  assert.equal(refund.payload.amount, 275, 'the stake comes home on a settled run');
  assert.deepEqual(byName(h, 'contract:clauseHonored').map((e) => e.payload.clauseId),
    ['tender_window', 'grader_declared', 'manifest_undisclosed'],
    'the honored terms each speak once — the clean forbid rides at ×1.0');
  const completed = byName(h, 'mission:completed');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].payload.rewardCr, 1815);
  assert.equal(m.params.tenderSoldBeforeClose, true, 'the lot landed before the close');
  assert.equal(m.params.windowSpareS, spare, 'the window words have their number');
  assert.deepEqual(byName(h, 'economy:chargeCredits').filter((e) => (
    String(e.payload.reason || '').startsWith('tender_duty'))), [],
    'a clean weigh charges no duty');

  const payday = byName(h, 'toast').map((e) => e.payload.text)
    .find((text) => text.startsWith('PAYDAY'));
  assert.match(payday, /PAYDAY 1,815 cr — Desk buy -4\.2% on your 440 u/,
    'the bend prints as the tender\'s own line');
  assert.match(payday, new RegExp(`${Math.round(spare)} s to spare`),
    'the window words ride the same receipt');

  // The settlement promotes past the receipt ring, with the desk's own count.
  const tally = h.state.missions.tenderTally;
  assert.equal(tally.outcome, 'completed');
  assert.equal(tally.deskCountUnits, T.lotUnits, 'the on-time sale records the full desk count');
  assert.equal(tally.declaredAtTally, true);
  assert.equal(tally.soldBeforeClose, true);
  assert.equal(tally.weighOverU, 0);
  assert.equal(h.state.story.flags.tender_tally_filed, true);
  const logRow = h.state.missions.completedLog.find((rec) => rec.type === TENDER_HAUL_TYPE);
  assert.equal(logRow && logRow.success, 1, 'the completion ledger counts the run once');

  // ADVERSARIAL: the same trade event replayed settles nothing twice.
  sellLot(h, T.lotUnits, { priceImpactPct: -4.2 });
  h.missionsSys.update(SIM_DT, h.state);
  assert.equal(byName(h, 'mission:completed').length, 1, 'a duplicate event never re-settles');
  assert.equal(grants.filter((e) => e.payload.reason === `mission:${m.id}`).length, 1,
    'the desk pays once');
  assert.equal(h.state.missions.tenderTally, tally, 'the ledger entry never rewrites');
  h.sim.dispose();
});

// ── 6. The late lot ───────────────────────────────────────────────────────────────────────────

test('a late lot re-prices at base and the red EXPIRED can never mint', () => {
  const h = boot();
  const { m } = acceptTender(h);
  loadHold(h, { [T.cmdtyId]: T.lotUnits });
  h.bus.emit('dock:docked', { stationId: DESK }); // desk contact; 440u aboard is manifest-clean

  // Multi-sale scoring: a partial sale keeps the run live.
  sellLot(h, 200);
  assert.equal(m.status, 'active', 'a partial sale keeps the run live');
  assert.equal(m.objectiveProgress, 200, 'the desk counts partial landings');

  // First flight tick past the close: the sell-out grace arms (desk contact, lot still coming).
  h.state.simTime = m.params.tenderCloseAt_s + 0.5;
  h.missionsSys.update(SIM_DT, h.state);
  assert.equal(m.status, 'active', 'the close re-prices; it never voids');
  assert.equal(Number.isFinite(m.tender.windowClosedAt_s), true, 'the close armed');
  assert.equal(m.tender.graceUntilS, m.params.tenderCloseAt_s + T.graceS,
    'the sell-out grace is the authored 90 s');
  assert.deepEqual(byName(h, 'mission:failed'), [], 'no failure at the close');
  assert.deepEqual(byName(h, 'mission:expired'), [], 'no EXPIRED — the offer carries no deadline');
  assert.equal(byName(h, 'toast').some((e) => /intake window has closed/.test(e.payload.text)),
    true, 'the close speaks its honest words');

  // The rest of the lot lands inside the grace: base terms, premium unmet.
  sellLot(h, 240);
  assert.equal(m.status, 'completed', 'late still sells — the contract settles');
  const pay = byName(h, 'economy:grantCredits').find((e) => e.payload.reason === `mission:${m.id}`);
  assert.equal(pay.payload.amount, 1100, 'base desk fee — no honored premium');
  assert.deepEqual(byName(h, 'contract:clauseHonored').map((e) => e.payload.clauseId),
    ['manifest_undisclosed'],
    'neither premium was honored — only the clean ×1.0 forbid speaks');
  assert.equal(m.params.tenderSoldBeforeClose, false, 'the window was closed; unmet, not breached');
  assert.equal(m._clauseState.tender_window.breached, undefined, 'unmet is not a breach');
  assert.equal(byName(h, 'toast').some((e) => String(e.payload.text).startsWith('PAYDAY')), false,
    'a late settle prints no bend and names no spare seconds');
  assert.deepEqual(byName(h, 'mission:expired'), [], 'still no EXPIRED anywhere in the run');
  h.sim.dispose();
});

// ── 7. The floor ──────────────────────────────────────────────────────────────────────────────

test('a short lot with no desk contact fails forward into a posted spot row', () => {
  const h = boot();
  const { m } = acceptTender(h);
  loadHold(h, { [T.cmdtyId]: 100 }); // nowhere near the floor, and the desk never sees the hull

  h.state.simTime = m.params.tenderCloseAt_s + 0.5;
  h.missionsSys.update(SIM_DT, h.state);

  assert.deepEqual(byName(h, 'mission:failed').map((e) => e.payload.reason), ['tender_floor'],
    'the desk refused the short lot at the close');
  assert.equal(m.status, 'failed');
  assert.equal(h.state.missions.active.some((cand) => cand.id === m.id), false);
  assert.equal(byName(h, 'toast').some((e) => (
    /Mission FAILED/.test(e.payload.text) && /the desk refused the short lot/.test(e.payload.text))),
  true, 'the failure names the market, not a scolding');

  // The fail-forward: a posted board row at the desk — posted, never an accept.
  const board = h.state.missions.boards[DESK];
  const spot = board && board.slots.find((offer) => offer && offer.source === TENDER_SPOT_SOURCE);
  assert.ok(spot, 'the spot row posts');
  assert.equal(spot.id, `tender_spot_${m.id}`);
  assert.equal(spot.destStationId, RAIL, "the remainder's market is the Tethys rail");
  assert.match(spot.brief, /100u still in your hold/, 'the row says what the market is for');
  assert.equal(h.state.missions.active.some((cand) => cand && cand.source === TENDER_SPOT_SOURCE),
    false, 'the spot row is posted work, never auto-accepted');

  // The settlement promotes; the standing row never reposts; the spot row survives refresh.
  const tally = h.state.missions.tenderTally;
  assert.equal(tally.outcome, 'failed');
  assert.equal(tally.reason, 'tender_floor');
  assert.equal(h.state.story.flags.tender_tally_filed, true);
  delete h.state.missions.boards[RAIL];
  const fresh = h.missionsSys.ensureBoard(RAIL);
  assert.equal(fresh.slots.some((offer) => offer && offer.type === TENDER_HAUL_TYPE), false,
    'the durable ledger outlives the receipt ring');
  h.state.missions.boards[DESK].refreshEpoch = -1; // force an epoch refresh at the desk
  const refreshed = h.missionsSys.ensureBoard(DESK);
  assert.equal(refreshed.slots.some((offer) => offer && offer.source === TENDER_SPOT_SOURCE), true,
    'the posted spot row carries through the refresh while unresolved');
  h.sim.dispose();
});

// ── 8. The flagged intake ─────────────────────────────────────────────────────────────────────

test('flagged at intake: duty stamps at the weigh, Concord moves −2, the sale still settles', () => {
  const h = boot();
  const { m } = acceptTender(h);
  loadHold(h, { [T.cmdtyId]: T.lotUnits, cmdty_silicate: 30 }); // the lot + 30u of side silicate

  // Running the chord direct: the intake weighs the side mass while undeclared.
  h.bus.emit('dock:docked', { stationId: DESK });
  assert.equal(m._clauseState.manifest_undisclosed.breached, true, 'the forbid trips at the dock');
  assert.equal(m.params.weighDeclared, true, 'the intake weigh stamps the duty');
  assert.equal(m.params.weighAtDesk, true, 'the stamp is the intake\'s own act');
  assert.equal(m.params.weighOverU, 30, 'everything aboard that is not the contract ore is weighed');
  assert.equal(m.params.weighDutyCr, 120, '4 cr/u on the side mass');
  assert.deepEqual(byName(h, 'faction:repDelta').map((e) => [e.payload.factionId, e.payload.delta]),
    [[TENDER_HAUL_GATE_FACTION_ID, -2]], 'flagged at intake is −2 Concord');

  // The sale still settles — forfeit drops the premium, it never voids.
  sellLot(h, T.lotUnits, { priceImpactPct: -3.0 });
  assert.equal(m.status, 'completed', 'a flagged run still settles');
  const pay = byName(h, 'economy:grantCredits').find((e) => e.payload.reason === `mission:${m.id}`);
  assert.equal(pay.payload.amount, 1650, '1.5× window only — the paperwork premium was never earned');
  assert.deepEqual(byName(h, 'contract:clauseHonored').map((e) => e.payload.clauseId),
    ['tender_window'], 'only the window premium was honored — the flagged forbid never rides');

  // The weigh stamp charges at settle, once, from the stamp — never from the hold.
  const duty = byName(h, 'economy:chargeCredits')
    .find((e) => e.payload.reason === `tender_duty:${m.id}`);
  assert.equal(duty.payload.amount, 120, 'the weigh happened; the duty charges even on the honor path');

  // The receipt remembers what the pilot did: the durable receipt settles honest basics and
  // the ledger carries the weigh facts past the receipt ring.
  const receipt = h.state.missions.receipts[h.state.missions.receipts.length - 1];
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.rewardCr, 1650);
  const tally = h.state.missions.tenderTally;
  assert.equal(tally.flaggedAtIntake, true);
  assert.equal(tally.weighDutyCr, 120);
  assert.equal(tally.weighOverU, 30);
  assert.equal(tally.soldBeforeClose, true);
  h.sim.dispose();
});
