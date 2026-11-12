/**
 * W-TENDER — The Tender (Tethys → Forge): the fork is honest at every branch.
 *
 * Covers the contract side of the authored tender run, per the set-piece pattern (stub owner over
 * the real owners' methods — no world, no spawns beyond the rival-ledger issuance stub):
 *   * the authorship guard keeps ordinary contracts and legacy rows on current behavior;
 *   * accept stamps the intake window's close and the durable run record, idempotently;
 *   * the drive adjudicator settles the window — open means nothing, a short lot with no desk
 *     contact fails forward at the close (spot row posted via the owner's post-only seam), a lot
 *     still coming arms the sell-out grace, and the grace settles what sold at base terms;
 *   * the two weigh stamps are one-time, and settle never re-reads the hold after one;
 *   * the desk sale scores the quota through the same trade event bulk_trade uses and stamps the
 *     "sold before close" premium BEFORE settlement (missions registers ahead of the clause
 *     observer, so the completing sale races the catalog's own event half);
 *   * the board row carries its three condition rows and never reposts over a settled run;
 *   * the payday receipt prints the bend as the tender's own line — read-only derivations only.
 *
 * RUN: node --test test/tender-haul-fork.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTenderOffer, TENDER_HAUL_TUNING, TENDER_HAUL_TYPE } from '../src/data/missionsData.js';
import { missionConditionById, serializableMissionCondition } from '../src/data/missionConditions.js';
import { failReasonWord } from '../src/data/missionFailReasons.js';
import {
  authoredTenderHaul,
  createTenderRecord,
  initializeTenderHaul,
  driveTender,
  settleTenderPastGrace,
  onGraderDeclared,
  onFlaggedAtIntake,
  tenderWeighStamped,
  tenderWeighFacts,
  tenderPaydayLine,
  tenderLedgerEntry,
  tenderScanFaceClear,
  flashReducedCue,
  spawnTenderRivals,
  TENDER_RIVAL_QUEUE,
  TENDER_SPOT_SOURCE,
} from '../src/missions/tenderHaul.js';
// Load order matters: missionSpawningOps and missions.js import each other — missions.js must
// finish initializing before missionSpawningOps's own importers see it (the ops-object spread).
import '../src/systems/missions.js';
import { missions } from '../src/systems/missions.js';
import { missionBoardOps } from '../src/systems/missionBoardOps.js';

const T = TENDER_HAUL_TUNING;

function makeBus() {
  const emitted = [];
  return {
    emitted,
    emit: (n, p) => emitted.push({ n, p }),
    on: () => {},
  };
}

function tenderMission(overrides = {}) {
  const body = { ...overrides };
  const params = { ...body.params };
  delete body.params;
  const base = {
    id: 'm_tender',
    type: TENDER_HAUL_TYPE,
    status: 'active',
    acceptedAt_s: 100,
    deadline_s: null,
    reward_cr: T.rewardCr,
    collateral_cr: Math.ceil(T.rewardCr * T.collateralPct),
    riskTier: 1,
    objectiveTarget: T.lotUnits,
    objectiveProgress: 0,
    stationId: T.railStationId,
    destStationId: T.deskStationId,
    destSectorId: T.deskSectorId,
    targetEntityIds: [],
    title: 'The Tender — Tethys to the Forge',
    params: {
      tenderHaulVersion: 1,
      tenderTag: 'tender:tethys-forge',
      cmdtyId: 'cmdty_ore_iron',
      qty: T.lotUnits,
      manifestUnits: T.manifestUnits,
      dutyPerUnitCr: T.dutyPerUnitCr,
      floorUnits: T.floorUnits,
      graceS: T.graceS,
      windowS: T.windowS,
      gateStationId: T.gateStationId,
      gateSectorId: T.gateSectorId,
      fieldId: T.fieldId,
      ...params,
    },
    clauses: ['tender_window', 'grader_declared', 'manifest_undisclosed']
      .map((id) => serializableMissionCondition(id)),
    ...body,
  };
  if (base.tender === undefined) {
    base.tender = createTenderRecord({
      missionId: base.id,
      tick: 1,
      closeAtS: base.acceptedAt_s + T.windowS,
      graceS: base.params.graceS,
      floorUnits: base.params.floorUnits,
      lotUnits: base.params.qty,
      manifestUnits: base.params.manifestUnits,
    });
  }
  return base;
}

function makeOwner(m, { simTime = 100, holdItems = {}, credits = 5000 } = {}) {
  const state = {
    playerId: 1,
    simTime,
    tick: 1,
    mode: 'flight',
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} }]]),
    player: {
      credits,
      cargo: { items: { ...holdItems }, usedVolume: 0, usedMass: 0, capVolume: 250, capMass: 999 },
    },
    missions: { active: [m], boards: {}, receipts: [], completedLog: [], nextId: 2 },
    story: { flags: {} },
    world: { currentSectorId: T.gateSectorId },
    settings: {},
  };
  const owner = {
    state,
    bus: makeBus(),
    completed: [],
    failed: [],
    posted: [],
    said: [],
    _completeMission: (mm) => { mm.status = 'completed'; owner.completed.push(mm.id); },
    _failMission: (mm, _index, reason) => { mm.status = 'failed'; owner.failed.push({ id: mm.id, reason }); },
    postBoardOffer: (offer) => { owner.posted.push(offer); return { ok: true, offerId: offer.id }; },
    _epoch: () => 3,
    _sayStoryLine: (text) => owner.said.push(text),
    // _onTrade dispatches the tender family through this._onTenderTrade — the stub carries the
    // real composite methods so the production code, not a copy, runs under test.
    _onTenderTrade: missions._onTenderTrade,
    _clearCompletedTradeWaypoint: missions._clearCompletedTradeWaypoint,
    _refreshTrackedMissionNav: () => {},
  };
  return owner;
}

const repDeltas = (owner, factionId) => owner.bus.emitted
  .filter((e) => e.n === 'faction:repDelta' && e.p.factionId === factionId)
  .map((e) => e.p.delta);

test('the authorship guard keeps foreign and legacy rows on current behavior', () => {
  const authored = tenderMission();
  assert.equal(authoredTenderHaul(authored), true, 'the exact authored version drives the run');

  const ordinary = tenderMission({ type: 'cargo_delivery', tender: undefined });
  delete ordinary.tender;
  const before = JSON.stringify(ordinary);
  assert.equal(authoredTenderHaul(ordinary), false);
  assert.equal(initializeTenderHaul(makeOwner(ordinary), ordinary), false,
    'an ordinary contract never initializes a tender run');
  assert.equal(JSON.stringify(ordinary), before, 'ordinary contract body untouched');

  const legacy = tenderMission({ params: { tenderHaulVersion: undefined } });
  assert.equal(authoredTenderHaul(legacy), false,
    'a tender_haul row without this authored version is not this run');
});

test('accept stamps the window close and the durable record, idempotently', () => {
  const m = tenderMission({ tender: undefined });
  delete m.tender;
  const owner = makeOwner(m);
  assert.equal(initializeTenderHaul(owner, m), true);
  assert.equal(m.tender.schema, 'spaceface.tenderHaul.v1');
  assert.equal(m.tender.closeAtS, m.acceptedAt_s + T.windowS);
  assert.equal(m.params.tenderCloseAt_s, m.acceptedAt_s + T.windowS);
  assert.equal(m.deadline_s, null, 'no mission deadline — the window is the drive clock, never a red EXPIRED');
  const stampedClose = m.tender.closeAtS;
  initializeTenderHaul(owner, m);
  assert.equal(m.tender.closeAtS, stampedClose, 're-initialization never moves the close');
  const ledger = tenderLedgerEntry(m, 'completed', null);
  assert.equal(ledger.missionId, m.id, 'the settlement ledger names the run');
});

test('the window open means nothing to adjudicate', () => {
  const m = tenderMission();
  const owner = makeOwner(m, { simTime: 500 });
  assert.equal(driveTender(owner, m, 0), false, 'before the close the drive is silent');
  assert.equal(m.status, 'active', 'the run is still live');
  assert.equal(m.tender.windowClosedAt_s, null, 'the close has not armed');
});

test('a short lot with no desk contact fails forward at the close', () => {
  const m = tenderMission({ tender: createTenderRecord({ missionId: 'm_tender', closeAtS: 90 }) });
  const owner = makeOwner(m, { simTime: 100, holdItems: { cmdty_ore_iron: 80 } });
  assert.equal(driveTender(owner, m, 0), true, 'the close adjudicates');
  assert.deepEqual(owner.failed, [{ id: m.id, reason: 'tender_floor' }],
    'the desk refused the short lot');
  assert.equal(m.tender.settledOutcome, 'failed');
  assert.equal(owner.posted.length, 1, 'the fail-forward spot row posts');
  const spot = owner.posted[0];
  assert.equal(spot.source, TENDER_SPOT_SOURCE);
  assert.equal(spot.destStationId, T.railStationId, 'the spot row carries the remainder to the rail market');
  assert.equal(spot.brief.includes('80u still in your hold'), true,
    'the row names the remainder the post exists for');
  assert.equal(failReasonWord('tender_floor'), 'the desk refused the short lot',
    'the failure toast names the market, not a scolding');

  // An empty hold has no remainder: the row's reason is already gone (retention would drop it at
  // the first refresh), so neither the post nor its toast fires.
  const empty = tenderMission({ tender: createTenderRecord({ missionId: 'm_tender', closeAtS: 90 }) });
  const emptyOwner = makeOwner(empty, { simTime: 100 });
  assert.equal(driveTender(emptyOwner, empty, 0), true);
  assert.deepEqual(emptyOwner.failed, [{ id: empty.id, reason: 'tender_floor' }]);
  assert.equal(emptyOwner.posted.length, 0, 'no spot row over an empty hold');
  assert.equal(emptyOwner.bus.emitted.some((e) => e.n === 'toast'), false,
    'no market toast over an empty hold');
});

test('a lot still coming arms the grace; the grace settles what sold', () => {
  const m = tenderMission({ tender: createTenderRecord({ missionId: 'm_tender', closeAtS: 90 }) });
  const owner = makeOwner(m, { simTime: 100, holdItems: { cmdty_ore_iron: 440 } });
  assert.equal(driveTender(owner, m, 0), false, 'a full hold is a lot still coming — the grace arms');
  assert.equal(Number.isFinite(m.tender.windowClosedAt_s), true, 'the close armed');
  assert.equal(m.tender.graceUntilS, 90 + T.graceS, 'the sell-out grace is the authored 90 s');

  owner.state.simTime = 90 + T.graceS + 1;
  m.objectiveProgress = 300;
  assert.equal(settleTenderPastGrace(owner, m, 0), true);
  assert.deepEqual(owner.completed, [m.id], 'at or above the floor the contract completes');
  assert.equal(m.status, 'completed');
  assert.equal(m.reward_cr, Math.round(T.rewardCr * 300 / 440),
    'base terms scale to the count the desk finished — premium unmet');
  assert.equal(m.params.tenderSettledLate, true);
});

test('grace end under the floor fails forward into the posted spot row', () => {
  const m = tenderMission({ tender: createTenderRecord({ missionId: 'm_tender', closeAtS: 90 }) });
  const owner = makeOwner(m, { simTime: 90 + T.graceS + 5, holdItems: { cmdty_ore_iron: 120 } });
  m.objectiveProgress = 80;
  assert.equal(settleTenderPastGrace(owner, m, 0), true);
  assert.deepEqual(owner.failed, [{ id: m.id, reason: 'tender_unsold' }],
    'a grace-end sell-out miss is its own reason — not the refuse-now floor fail');
  assert.equal(failReasonWord('tender_unsold'), 'the desk never finished the count',
    'the words do not call a full hold short');
  assert.equal(owner.posted.length, 1);
  assert.equal(owner.posted[0].brief.includes('120u still in your hold'), true,
    'the spot row says what the market is for');
  assert.equal(owner.posted[0].brief.startsWith('The desk never finished the count'), true,
    'the spot row lead names the same miss its fail reason names');
});

test('the desk sale scores the quota and stamps the premium before settlement', () => {
  const m = tenderMission();
  const owner = makeOwner(m, { simTime: 500 });
  missions._onTrade.call(owner, {
    commodityId: 'cmdty_ore_iron', side: 'sell', qty: T.lotUnits,
    stationId: T.deskStationId, priceImpactPct: -4.2,
  });
  assert.deepEqual(owner.completed, [m.id], 'the quota completes through the ordinary trade event');
  assert.equal(m.params.tenderSoldBeforeClose, true, 'sold before the close');
  assert.equal(m.params.windowSpareS, m.tender.closeAtS - 500, 'the window words have their number');
  assert.equal(m._clauseState.tender_window.satisfied, true,
    'the premium stamp is written BEFORE the settlement reads it');
  assert.equal(m.params.deskBuyImpactPct, -4.2, 'the bend prints from the trade payload');
});

test('a non-desk sale never scores the desk count', () => {
  const m = tenderMission();
  const owner = makeOwner(m, { simTime: 500 });
  missions._onTrade.call(owner, {
    commodityId: 'cmdty_ore_iron', side: 'sell', qty: 440, stationId: 'station_drift',
  });
  assert.equal(owner.completed.length, 0);
  assert.equal(m.objectiveProgress, 0, 'the desk counts only what lands at the desk');
});

test('a completing sale after the close stamps base terms, never the premium', () => {
  const m = tenderMission();
  const owner = makeOwner(m, { simTime: m.tender.closeAtS + 10 });
  missions._onTrade.call(owner, {
    commodityId: 'cmdty_ore_iron', side: 'sell', qty: T.lotUnits,
    stationId: T.deskStationId, priceImpactPct: -1.0,
  });
  assert.deepEqual(owner.completed, [m.id], 'late still sells — the contract settles');
  assert.equal(m.params.tenderSoldBeforeClose, false, 'the premium is unmet');
  assert.equal(m._clauseState.tender_window.satisfied, false);
  assert.equal(m._clauseState.tender_window.breached, undefined, 'unmet is not a breach');
});

test('the weigh stamps once, moves Concord once, and settle never re-reads the hold', () => {
  const m = tenderMission();
  const owner = makeOwner(m, { simTime: 400, holdItems: { cmdty_ore_iron: 440, cmdty_silicate: 40 } });
  const facts = tenderWeighFacts(owner.state, m);
  assert.equal(facts.unmanifestedUnits, 40, 'the 40u of side silicate is unmanifested; the 440u lot is covered');
  assert.equal(facts.dutyCr, 160, 'at 4 cr/u');

  assert.equal(onGraderDeclared(owner, m), true, 'the Tally weigh stamps');
  assert.equal(m.params.weighOverU, 40);
  assert.equal(m.params.weighDutyCr, 160);
  assert.equal(m.params.weighAtDesk, false);
  assert.deepEqual(repDeltas(owner, 'faction_scn'), [1], 'Concord +1, secondary channel only');
  assert.equal(tenderWeighStamped(m), true);

  assert.equal(onGraderDeclared(owner, m), false, 'the weigh stamps once');
  assert.deepEqual(repDeltas(owner, 'faction_scn'), [1], 'no second rep move');

  // The intake flag on a run already weighed is the same one stamp.
  assert.equal(onFlaggedAtIntake(owner, m), false, 'an already-weighed run never re-weighs');
  assert.deepEqual(repDeltas(owner, 'faction_scn'), [1]);

  // The flagged run: the stamp is the intake's own act, and settle reads only the stamp.
  const flagged = tenderMission();
  const flaggedOwner = makeOwner(flagged, {
    simTime: 400,
    holdItems: { cmdty_ore_iron: 440, cmdty_silicate: 50 }, // the lot + 50u of side silicate
  });
  assert.equal(onFlaggedAtIntake(flaggedOwner, flagged), true);
  assert.equal(flagged.params.weighOverU, 50);
  assert.equal(flagged.params.weighAtDesk, true);
  assert.deepEqual(repDeltas(flaggedOwner, 'faction_scn'), [-2], 'flagged at intake is −2 Concord');
  flaggedOwner.state.player.cargo.items = {}; // dump everything after the weigh
  assert.equal(flagged.params.weighOverU, 50, 'settle never re-reads the hold — the receipt remembers');
});

test('the declare waits for the slot: a rival holding the scan face keeps it closed', () => {
  const m = tenderMission();
  const now = 100;
  m.tender.rivals = [
    { slot: 0, id: 11, dwellUntil: now + 40, departed: false, issued: true },
    { slot: 1, id: 12, dwellUntil: now + 10, departed: false, issued: true },
  ];
  const entities = new Map([
    [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} }],
    [11, { id: 11, type: 'ship', alive: true, data: { tenderRivalOf: 'm_tender' } }],
    [12, { id: 12, type: 'ship', alive: true, data: { tenderRivalOf: 'm_tender' } }],
  ]);
  const owner = makeOwner(m);
  owner.state.entities = entities;
  assert.equal(tenderScanFaceClear(m, owner.state, now), false, 'both rivals hold the face');
  owner.state.simTime = now + 12;
  assert.equal(tenderScanFaceClear(m, owner.state, now + 12), false, 'one rival still holds');
  owner.state.simTime = now + 41;
  assert.equal(tenderScanFaceClear(m, owner.state, now + 41), true, 'the face frees as each departs');
  entities.get(11).alive = false;
  assert.equal(tenderScanFaceClear(m, owner.state, now + 12), true,
    'a dead rival frees the face for good — heat owns the piracy, not the mission');
});

test('the rival ledger issues each durable slot exactly once', () => {
  const m = tenderMission();
  const owner = makeOwner(m);
  const spawnedBodies = [];
  let nextId = 100;
  owner.helpers = {
    spawnEntity: (spec) => {
      const ent = { id: nextId++, type: 'ship', alive: true, pos: { ...spec.pos }, data: { ...spec.data } };
      spawnedBodies.push(ent);
      owner.state.entities.set(ent.id, ent);
      return ent;
    },
  };
  const first = spawnTenderRivals(owner, m);
  assert.equal(first, TENDER_RIVAL_QUEUE.length, 'one hauler per authored queue slot');
  assert.equal(m.tender.rivals.length, TENDER_RIVAL_QUEUE.length, 'the ledger tombstones each slot');
  const issuedIds = m.tender.rivals.map((row) => row.id);
  const second = spawnTenderRivals(owner, m);
  assert.equal(second, 0, 'a filled slot is a tombstone, never a second hauler');
  assert.deepEqual(m.tender.rivals.map((row) => row.id), issuedIds);
  const third = spawnTenderRivals(owner, m);
  assert.equal(third, 0, 'a killed rival never respawns — the face freed for good');
  assert.equal(spawnedBodies.length, TENDER_RIVAL_QUEUE.length);
  for (const row of m.tender.rivals) {
    assert.equal(row.issued, true);
    assert.equal(Number.isFinite(row.dwellUntil), true, 'each rival holds on its own authored dwell');
  }
});

test('the board row carries its three conditions and never reposts over a settled run', () => {
  const state = {
    simTime: 0,
    meta: { seed: 47 },
    player: { credits: 5000, cargo: { items: {}, usedVolume: 0, capVolume: 250 } },
    missions: { active: [], boards: {}, receipts: [], tenderTally: null, completedLog: [], nextId: 1 },
    story: { flags: {} },
    world: { currentSectorId: T.railSectorId },
    entities: new Map(),
  };
  const owner = {
    state,
    bus: makeBus(),
    _epoch: () => 3,
  };
  const info = { id: T.railStationId };
  const board = { refreshEpoch: 3, slots: [] };

  assert.equal(missionBoardOps._syncTenderOffer.call(
    { state, bus: owner.bus, _epoch: owner._epoch }, { id: 'station_drift' }, board, 3,
  ), false, 'only the rail board carries the desk row');
  assert.equal(missionBoardOps._syncTenderOffer.call(owner, info, board, 3), true, 'the row posts');
  const row = board.slots.find((offer) => offer.type === TENDER_HAUL_TYPE);
  assert.ok(row, 'the standing tender row is on the board');
  assert.deepEqual(row.clauses.map((c) => c.conditionId),
    ['tender_window', 'grader_declared', 'manifest_undisclosed'],
    'the fork rides the same clauses array the physics conditions use');
  assert.equal(row.duration_s, undefined, 'no duration_s — the shipped deadline path can never fire');
  assert.equal(row.params.tenderHaulVersion, 1);
  assert.equal(missionBoardOps._syncTenderOffer.call(owner, info, board, 3), false, 'never a duplicate');

  // A settled run never reposts: the durable ledger outlives the receipt ring.
  state.missions.tenderTally = { missionId: 'm_done' };
  const afterLedger = JSON.stringify({ missions: state.missions, story: state.story });
  assert.equal(missionBoardOps._syncTenderOffer.call(owner, info, board, 3), false,
    'the ledger blocks the repost');
  assert.equal(JSON.stringify({ missions: state.missions, story: state.story }), afterLedger,
    'a settled sync is read-only — no writes behind the block');
});

test('the tender conditions are live catalog rows with honest terms', () => {
  const window = missionConditionById('tender_window');
  assert.equal(window.kind, 'require');
  assert.equal(window.blocking, false, 'late re-prices; the window never voids');
  assert.equal(window.rewardMult, 1.5);
  assert.equal(window.event, 'economy:tradeCompleted', 'the verified emitter economy.js:3480');
  assert.equal(window.count, 2, 'dual-half: the desk sale, then "sold before close"');
  const declared = missionConditionById('grader_declared');
  assert.equal(declared.blocking, false, 'running the chord is the priced alternative arm');
  assert.equal(declared.rewardMult, 1.10);
  const flagged = missionConditionById('manifest_undisclosed');
  assert.equal(flagged.kind, 'forbid');
  assert.equal(flagged.onBreach, 'forfeit', 'the contract still settles; the flag costs duty and Concord');
  for (const id of ['tender_window', 'grader_declared', 'manifest_undisclosed']) {
    assert.deepEqual(missionConditionById(id).appliesTo, [TENDER_HAUL_TYPE],
      `${id} carries the tender family only`);
  }
  const offer = buildTenderOffer({ epoch: 1 });
  assert.equal(offer.reward_cr, T.rewardCr);
  assert.equal(offer.collateral_cr, Math.ceil(T.rewardCr * T.collateralPct), 'the 25% stake');
  assert.equal(offer.destStationId, T.deskStationId);
  assert.equal(offer.params.qty, T.lotUnits);
  assert.equal(offer.params.manifestUnits, T.manifestUnits);
});

test('the payday receipt prints the bend as the tender\'s own line', () => {
  const m = tenderMission({ params: { deskBuyImpactPct: -4.2, windowSpareS: 41, tenderSoldBeforeClose: true } });
  const before = JSON.stringify(m);
  const line = tenderPaydayLine(m, T.rewardCr);
  assert.match(line, /Desk buy -4\.2% on your 440 u/, 'the bend is the tender\'s own line');
  assert.match(line, /41 s to spare/, 'the window words ride the same receipt');
  assert.equal(JSON.stringify(m), before, 'the payday line is read-only');
  const late = tenderMission({ params: { deskBuyImpactPct: -1.0, tenderSoldBeforeClose: false } });
  assert.equal(tenderPaydayLine(late, T.rewardCr), null,
    'a late settle prints no bend and names no spare seconds (a real late sale stamps the impact)');
  const lateWithCount = tenderMission({
    objectiveProgress: 240,
    params: { deskBuyImpactPct: -1.0, tenderSoldBeforeClose: true, tenderSettledLate: true },
  });
  const lateLine = tenderPaydayLine(lateWithCount, 600);
  assert.match(lateLine, /Desk buy -1\.0% on your 240 u/,
    'a stamped-late settle names the desk\'s settled count, never the untouched lot');
});

test('the accessibility cue reads the house two gates', () => {
  assert.equal(flashReducedCue({ settings: {} }), false);
  assert.equal(flashReducedCue({ settings: { video: { flashReduce: true } } }), true);
  assert.equal(flashReducedCue({ settings: { video: { motionReduce: true } } }), true);
  assert.equal(flashReducedCue({ settings: { accessibility: { flashReduce: true } } }), true);
  assert.equal(flashReducedCue({ settings: { video: { flashReduce: false } } }), false);
});
