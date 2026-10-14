import assert from 'node:assert/strict';
import test from 'node:test';
import { closedWashVerdict, bayCashVerdict, replayVerdict, isAllowedGainReason } from './invariants.mjs';
import { assessWashTrace, assessBayTrace, admitFamilyEvidence, critique, playerVisibleSummary } from './reportEvidence.mjs';

const WASH = 'zero_spread_trade_cycles', BAY = 'contraband_relabel';
function wash(gain = -10) {
  const before = { credits: 1000, debt: 0, stock: 32.75, stationId: 'port', commodityId: 'iron',
    cargo: { iron: 2 }, bay: {}, capVolume: 100 };
  return { name: 'allied_minimized', before, after: { ...structuredClone(before), credits: 1000 + gain },
    creditsDelta: gain, stockDelta: 0, cargoDelta: 0, qty: 10, buyTotal: 100, sellTotal: 100 + gain,
    credits: [{ reason: 'trade:buy:iron', delta: -100, total: 900 },
      { reason: 'trade:sell:iron', delta: 100 + gain, total: 1000 + gain }],
    missionCompletions: 2, receipts: [{ missionId: 'one', outcome: 'completed', repDelta: 15 },
      { missionId: 'two', outcome: 'completed', repDelta: 18 }],
    repBefore: 0, repAfter: 33, repFromWriter: 33, alliedBand: 400 };
}
function bay() {
  return { name: 'bay_stolen_goods', recipeId: 'recipe', bay: { scrap: 10, munitions: 9 },
    unpaid: { munitions: 9 }, bayAfterDock: { munitions: 9 }, bayAfterSecondDock: { munitions: 9 },
    creditsDelta: 100, secondDockDelta: 0,
    legalCashIn: { credits: 100, units: 10, lots: [{ commodityId: 'scrap', qty: 10 }] },
    reasons: ['salvage:bay_sale'], reachesIllicitPay: false };
}
const family = (id, trace, status = 'tested-not-broken') => ({ id, status, summary: 'raw probe claim', traces: [trace],
  controls: (id === WASH ? ['neutral_standing_is_not_a_wash', 'standing_came_from_mission_completion']
    : ['legal_scrap_is_allowed', 'restricted_munitions_stay_unpaid', 'second_dock_does_not_pay'])
    .map((name) => ({ name, pass: true })) });
const completeSearch = () => ({ sequences: 500, sequencesCompleted: 500, stopped: false,
  walletWrites: 0, reset: 'reboot', findings: [] });
const admitted = () => [admitFamilyEvidence(family(WASH, wash())), admitFamilyEvidence(family(BAY, bay()))];

test('existing finite wash, salvage and replay verdicts are preserved', () => {
  assert.equal(closedWashVerdict({ creditsDelta: 16, stockDelta: 0, cargoDelta: 0 }).exploit, true);
  assert.equal(closedWashVerdict({ creditsDelta: -40, stockDelta: 0, cargoDelta: 0 }).exploit, false);
  assert.equal(closedWashVerdict({ creditsDelta: 100, stockDelta: 5, cargoDelta: 0 }).exploit, false);
  assert.equal(bayCashVerdict({ creditsDelta: 33, legality: 'legal', fineDelta: 0 }).exploit, false);
  assert.equal(bayCashVerdict({ creditsDelta: 193, legality: 'contraband', fineDelta: 0 }).exploit, true);
  assert.equal(bayCashVerdict({ creditsDelta: -400, legality: 'contraband', fineDelta: -400 }).exploit, false);
  assert.equal(replayVerdict({ firstDelta: 5, secondDelta: 0 }).exploit, false);
  assert.equal(replayVerdict({ firstDelta: 5, secondDelta: 5 }).exploit, true);
});

test('missing or malformed deltas are invalid evidence, never an implicit zero', () => {
  for (const value of [undefined, null, NaN, Infinity, '0']) {
    assert.equal(closedWashVerdict({ creditsDelta: 10, stockDelta: value, cargoDelta: 0 }).kind, 'invalid_evidence');
    assert.equal(replayVerdict({ firstDelta: 1, secondDelta: value }).kind, 'invalid_evidence');
    assert.equal(bayCashVerdict({ creditsDelta: value, legality: 'legal', fineDelta: 0 }).kind, 'invalid_evidence');
  }
  assert.equal(closedWashVerdict().kind, 'invalid_evidence');
  assert.equal(bayCashVerdict({ creditsDelta: 10, fineDelta: 0 }).kind, 'invalid_evidence');
  assert.equal(isAllowedGainReason(42), false);
});

test('writer receipts reconcile a completed losing round trip without claiming Allied coverage', () => {
  const evidence = assessWashTrace(wash());
  assert.equal(evidence.complete, true);
  assert.equal(evidence.exploit, false);
  assert.equal(evidence.observedRep, 33);
  assert.equal(evidence.alliedReached, false);
  assert.equal(evidence.evidenceClass, 'writer-settlement');
});

test('a closed positive settlement is detected independently of a quote-derived flag', () => {
  const trace = wash(12); trace.reachesCreditPrint = false;
  assert.equal(assessWashTrace(trace).exploit, true);
  assert.equal(admitFamilyEvidence(family(WASH, trace)).status, 'exploit');
});

test('positive quotes alone do not prove a trade took place', () => {
  const trace = wash(12); trace.credits = []; trace.reachesCreditPrint = true;
  assert.equal(assessWashTrace(trace).reason, 'trade-not-exercised');
  assert.equal(admitFamilyEvidence(family(WASH, trace, 'exploit')).status, 'unavailable');
});

test('loan credits, other commodities and unrelated grants cannot masquerade as a wash', () => {
  for (const reason of ['service:loan', 'mission:reward', 'trade:sell:gold']) {
    const trace = wash(12); trace.credits[1].reason = reason;
    assert.equal(assessWashTrace(trace).reason, 'non-trade-credit-source');
  }
  const debt = wash(12); debt.after.debt = 12;
  assert.equal(assessWashTrace(debt).reason, 'route-not-closed');
});

test('stock, every cargo/bay commodity, station and capacity must close', () => {
  for (const alter of [(t) => { t.after.stock += 1; }, (t) => { t.after.cargo.gold = 1; },
    (t) => { t.after.bay.scrap = 1; }, (t) => { t.after.capVolume += 1; },
    (t) => { t.after.stationId = 'elsewhere'; }]) {
    const trace = wash(); alter(trace);
    assert.equal(assessWashTrace(trace).complete, false);
  }
});

test('missing or malformed capacity cannot attest a closed wash ledger', () => {
  for (const value of [undefined, null, NaN, Infinity, '100', -1]) {
    const trace = wash();
    trace.before.capVolume = value;
    trace.after.capVolume = value;
    assert.equal(assessWashTrace(trace).complete, false, String(value));
  }
});

test('intermediate writer totals and final quote totals must match the wallet', () => {
  const mid = wash(); mid.credits[0].total += 1;
  assert.equal(assessWashTrace(mid).reason, 'credit-receipts-do-not-reconcile');
  const quote = wash(); quote.sellTotal += 5;
  assert.equal(assessWashTrace(quote).reason, 'quote-settlement-mismatch');
  const wallet = wash(); wallet.after.credits += 5;
  assert.equal(assessWashTrace(wallet).complete, false);
});

test('missing, duplicated or inconsistent mission receipts cannot attest standing', () => {
  for (const alter of [(t) => { t.receipts.pop(); }, (t) => { t.receipts[1].missionId = 'one'; },
    (t) => { t.receipts[1].outcome = 'failed'; }, (t) => { t.repFromWriter = 400; },
    (t) => { t.repAfter = 400; }, (t) => { t.missionCompletions = 0; }]) {
    const trace = wash(); alter(trace);
    assert.equal(assessWashTrace(trace).complete, false);
  }
});

test('negative controls must actually pass before a non-exploit result is admitted', () => {
  const raw = family(WASH, wash()); raw.controls[1].pass = false;
  assert.equal(admitFamilyEvidence(raw).evidence.reason, 'negative-control-failed');
  assert.equal(admitFamilyEvidence(raw).status, 'unavailable');
});

test('legal cash-in, retained restricted custody and an idempotent dock establish the negative case', () => {
  assert.deepEqual(assessBayTrace(bay()), { complete: true, exploit: false, reason: null,
    evidenceClass: 'writer-settlement', excessCredits: 0 });
});

test('restricted disappearance without extra cash is an anomaly, not a laundering proof', () => {
  const trace = bay(); trace.bayAfterDock = {}; trace.bayAfterSecondDock = {}; trace.reachesIllicitPay = true;
  assert.equal(assessBayTrace(trace).reason, 'restricted-custody-changed-without-payment-proof');
  assert.equal(admitFamilyEvidence(family(BAY, trace, 'exploit')).status, 'unavailable');
});

test('restricted custody reduction plus wallet gain above legal preview proves the cash-in anomaly', () => {
  const trace = bay(); trace.bayAfterDock = {}; trace.bayAfterSecondDock = {}; trace.creditsDelta = 150;
  assert.equal(assessBayTrace(trace).exploit, true);
  assert.equal(assessBayTrace(trace).excessCredits, 50);
});

test('a false illicit flag cannot override a reconciled legal cash-in', () => {
  const trace = bay(); trace.reachesIllicitPay = true;
  assert.equal(assessBayTrace(trace).exploit, false);
  assert.equal(admitFamilyEvidence(family(BAY, trace, 'exploit')).status, 'tested-not-broken');
});

test('second-dock wallet or custody changes do not get called idempotent', () => {
  for (const delta of [1, -1]) {
    const trace = bay(); trace.secondDockDelta = delta;
    assert.equal(assessBayTrace(trace).reason, 'second-dock-not-idempotent');
  }
  const trace = bay(); trace.bayAfterSecondDock.munitions = 8;
  assert.equal(assessBayTrace(trace).reason, 'second-dock-not-idempotent');
});

test('missing recipe, cash preview, restricted goods or payout receipts do not produce green evidence', () => {
  for (const alter of [(t) => { delete t.recipeId; }, (t) => { t.legalCashIn = null; },
    (t) => { t.unpaid = {}; }, (t) => { t.reasons = []; },
    (t) => { t.legalCashIn.lots.push({ commodityId: 'munitions' }); },
    (t) => { t.bayAfterDock.munitions = NaN; }, (t) => { t.creditsDelta = 101; }]) {
    const trace = bay(); alter(trace);
    assert.equal(assessBayTrace(trace).complete, false);
  }
});

test('admission preserves raw evidence and its original status without mutating either', () => {
  const raw = family(WASH, wash(12), 'tested-not-broken'), snapshot = structuredClone(raw);
  const result = admitFamilyEvidence(raw);
  assert.deepEqual(raw, snapshot);
  assert.equal(result.reportedStatus, 'tested-not-broken');
  assert.equal(result.status, 'exploit');
});

test('critique uses the current restricted-bay control, not the removed customs-scanner control', () => {
  const report = critique(admitted(), completeSearch(), { degenerate: false });
  assert.equal(report.holds, true);
  assert.equal(report.attempts.every((row) => row.disproved), true);
  assert.equal(report.coverageComplete, true);
});

test('a family name is not evidence for an exploit', () => {
  const raw = family(WASH, null, 'exploit');
  const report = critique([raw], completeSearch(), { degenerate: false });
  assert.deepEqual(report.confirmed, []);
  assert.equal(report.unconfirmed.length, 1);
  assert.equal(report.holds, false);
});

test('stopped or partial searches and unavailable families cannot be integration-ready', () => {
  for (const change of [{ sequencesCompleted: 499 }, { stopped: true }, { sequences: 0 }]) {
    assert.equal(critique(admitted(), { ...completeSearch(), ...change }, {}).holds, false);
  }
  const families = admitted(); families.push({ id: 'missing-verb', status: 'unavailable' });
  assert.equal(critique(families, completeSearch(), {}).coverageComplete, false);
});

test('player impact describes only confirmed findings, not two hard-coded historic exploits', () => {
  const message = playerVisibleSummary([{ family: 'stock', summary: 'A stock floor was breached.' }]);
  assert.ok(message.includes('stock floor'));
  assert.equal(message.includes('allied'), false);
  assert.equal(message.includes('contraband'), false);
  assert.ok(playerVisibleSummary([]).includes('Unavailable probes'));
});

test('missing trace data is diagnosed rather than throwing', () => {
  assert.equal(assessWashTrace().complete, false);
  assert.equal(assessBayTrace().complete, false);
  assert.equal(admitFamilyEvidence({ id: WASH, status: 'clean' }).status, 'unavailable');
});

test('unrelated docking income cannot be attributed to restricted salvage', () => {
  const trace = bay(); trace.bayAfterDock = {}; trace.bayAfterSecondDock = {};
  trace.creditsDelta = 150; trace.reasons.push('mission:reward');
  assert.equal(assessBayTrace(trace).reason, 'mixed-salvage-credit-sources');
});
