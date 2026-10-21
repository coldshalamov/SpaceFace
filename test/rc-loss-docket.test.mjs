// RC-21 / RC-22 — the loss docket and the court card's settlement range.
//
// RC-21: the five authored loss shapes (lossLedger's trader/drone/fleet/outpost/ship) route
// deterministically to real Wreck Court case ids, and across the five shapes the whole authored
// docket is reachable — case data itself is never touched.
// RC-22: the court offer tells the card what the court pays — a min–max settlement over the
// case's authored ruling payouts — while reward stays 0 on acceptance and the ruling remains the
// only writer of credits.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOSS_SHAPE_CASES,
  caseIdForLoss,
  lossDocketCoverage,
  assertValidLossDocket,
} from '../src/data/wreckCourt/caseForLoss.js';
import { WRECK_COURT_CASE_IDS, WRECK_COURT_ENTRY_CASE, caseDef } from '../src/data/wreckCourt/index.js';
import {
  buildAdventureOffer,
  settlementRangeForCase,
  courtOfferPresentation,
} from '../src/systems/wreckCourt.js';
import { lossInvestigation } from '../src/systems/lossInvestigation.js';
import { MISSION_TUNING } from '../src/data/missions.js';

const LOSS_KINDS = ['trader', 'drone', 'fleet', 'outpost', 'ship'];

test('RC-21: the five authored loss shapes map to the whole authored docket', () => {
  assert.ok(assertValidLossDocket(), 'every table entry names a real case');
  assert.deepEqual(Object.keys(LOSS_SHAPE_CASES).sort(), LOSS_KINDS.slice().sort(),
    'the table covers exactly the five authored loss shapes');
  const coverage = lossDocketCoverage();
  assert.deepEqual(coverage, WRECK_COURT_CASE_IDS.slice().sort(),
    `all ${WRECK_COURT_CASE_IDS.length} lab-only cases are reachable from live losses`);
});

test('RC-21: a loss lands one of its shape\'s cases, deterministically', () => {
  for (const kind of LOSS_KINDS) {
    const loss = { lossId: `loss_${kind}_4242`, kind, sectorId: 'sector_test' };
    const first = caseIdForLoss(loss, { seed: 4242, sectorId: 'sector_test' });
    const again = caseIdForLoss(loss, { seed: 4242, sectorId: 'sector_test' });
    assert.equal(first, again, `${kind}: the same loss must always land the same case`);
    assert.ok(LOSS_SHAPE_CASES[kind].includes(first),
      `${kind}: ${first} must come from the shape's own list`);
    assert.ok(WRECK_COURT_CASE_IDS.includes(first), `${kind}: ${first} must be a real case`);
    assert.ok(caseDef(first), `${kind}: ${first} must materialize`);
  }
  // An unrecognized shape cannot pick a mystery case — the docket's entry case is the floor.
  assert.equal(caseIdForLoss({ lossId: 'loss_x', kind: 'unknown_shape', sectorId: 's' }, { seed: 1 }), WRECK_COURT_ENTRY_CASE);
  assert.equal(caseIdForLoss(null, { seed: 1 }), WRECK_COURT_ENTRY_CASE);
});

function bootPromote({ seed = 4242, loss, points }) {
  const state = {
    meta: { seed },
    simTime: 1200,
    world: { sectors: { sector_test: { name: 'Test Sector' } }, currentSectorId: 'sector_test' },
    salvage: { points },
    entities: new Map(),
    entityList: [],
    missions: { config: MISSION_TUNING, active: [], boards: {}, receipts: [] },
    lossLedger: { bySector: { sector_test: [loss] }, entries: [loss], seed },
  };
  const sys = Object.create(lossInvestigation);
  sys._state = state;
  sys._bus = { on() {}, off() {}, emit() {} };
  return { sys, state };
}

test('RC-21: a promoted communicator carries the loss\'s own deterministic case', () => {
  const promoted = [];
  for (const kind of LOSS_KINDS) {
    const loss = { lossId: `loss_${kind}_prom`, kind, sectorId: 'sector_test', assetId: 'h1', factionId: 'faction_dmc', simDay: 0 };
    const point = { id: `p_${kind}`, sectorId: 'sector_test', entityId: null, offered: false, pos: { x: 0, z: 0 } };
    const { sys, state } = bootPromote({ seed: 4242, loss, points: [point] });
    sys._promoteSector('sector_test');
    assert.equal(point.wreckCourtCaseId, caseIdForLoss(loss, { seed: state.meta.seed, sectorId: 'sector_test' }),
      `${kind}: the promoted point must carry the selector's own answer`);
    assert.ok(LOSS_SHAPE_CASES[kind].includes(point.wreckCourtCaseId), `${kind}: ${point.wreckCourtCaseId}`);
    promoted.push(point.wreckCourtCaseId);
  }
  assert.equal(new Set(promoted).size, promoted.length,
    'five loss shapes land five distinct cases on this fixture — no shape is a copy of another');
});

test('RC-22: the offer card says what the court settles, and pays nothing on acceptance', () => {
  const entry = buildAdventureOffer(4242);
  assert.equal(entry.reward_cr, 0, 'accepting a court case must not pay');
  assert.deepEqual(entry.params.settlement_cr, { min: 260, max: 980 },
    'the entry case card quotes its real authored settlements');
  assert.match(entry.summary, /settles 260–980 cr by ruling/, 'the dossier names the range');
  assert.match(entry.riskNote, /260–980 cr/, 'the risk line names the same range');
  assert.equal(entry.params.settlesExternally, true, 'settlement stays at the ruling');

  // The range is read off the authored consequence table, not invented: two different cases
  // quote two different ranges.
  assert.deepEqual(settlementRangeForCase('wc_faked_collision'), { min: 420, max: 1600 });
  assert.deepEqual(settlementRangeForCase('wc_cookoff_chain'), { min: 540, max: 1010 });
  assert.equal(courtOfferPresentation('wc_desperate_rescue').text, '260–980 cr');
  const far = buildAdventureOffer(7, { caseId: 'wc_slingshot_disappearance' });
  assert.deepEqual(far.params.settlement_cr, { min: 520, max: 2100 });
  assert.equal(far.reward_cr, 0);
});

test('RC-22: the provenance stamp keeps the card honest about the case it actually convenes', () => {
  // salvage._buildOffer mints the entry-case card then re-points params at the loss's case.
  // The stamp (mission:offered, before missions clones the offer for the board) must restamp
  // everything the card reads for THAT case — and must not invent a reward.
  const offer = buildAdventureOffer(4242);
  offer.params = { ...offer.params, wreckCourtCaseId: 'wc_clamp_shear' };
  const sys = Object.create(lossInvestigation);
  sys._state = { missions: { active: [], boards: {}, receipts: [] } };
  sys._stampOffer(offer);
  assert.equal(offer.title, caseDef('wc_clamp_shear').title, 'the card names the real case');
  assert.equal(offer.brief, caseDef('wc_clamp_shear').briefing);
  assert.deepEqual(offer.params.settlement_cr, { min: 460, max: 1420 });
  assert.match(offer.summary, /460–1,420 cr/, 'the stamped card quotes the real case\'s range');
  assert.match(offer.riskNote, /460–1,420 cr/);
  assert.equal(offer.reward_cr, 0, 'the stamp never turns a settlement range into an acceptance payout');
});
