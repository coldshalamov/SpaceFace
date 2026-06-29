#!/usr/bin/env node
// Guards mission settlement receipts: completed/failed/expired contracts must persist a compact
// latest-first ledger and Mission Log must render it without replacing career totals.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  missionReceiptFor,
  missionRepDeltaFor,
} from '../src/systems/missions.js';
import { missionReceiptRows } from '../src/ui/screens/missionLog.js';

const gameStateSrc = readFileSync(new URL('../src/core/gameState.js', import.meta.url), 'utf8');
const missionsSrc = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
const saveSrc = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
const missionLogSrc = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');

assert.match(gameStateSrc, /completedLog: \[\], receipts: \[\]/,
  'core game state should default mission receipts beside completed aggregates');
assert.match(missionsSrc, /const MISSION_RECEIPT_LIMIT = 10/,
  'mission receipts should stay capped to bound save growth');
assert.match(missionsSrc, /function normalizeMissionReceipts/,
  'mission receipts should be normalized through one capped restore path');
assert.match(missionsSrc, /MISSION_TUNING\.BASE_REP/,
  'receipt rep math should reuse shared mission tuning, not a duplicate table');
assert.match(missionsSrc, /export function missionReceiptFor/,
  'receipt construction must stay pure and directly testable');
assert.match(missionsSrc, /export function missionRepDeltaFor/,
  'rep delta math must be centralized for completion and loss receipts');
assert.match(missionsSrc, /_recordMissionReceipt\(m, 'completed'/,
  'completed missions must record a settlement receipt');
assert.match(missionsSrc, /_recordMissionReceipt\(m, 'failed'/,
  'failed missions must record a settlement receipt');
assert.match(missionsSrc, /_recordMissionReceipt\(m, 'expired'/,
  'expired missions must record a settlement receipt');
assert.match(missionsSrc, /receipts: normalizeMissionReceipts\(m\.receipts\)/,
  'mission serializer must persist normalized receipts');
assert.match(missionsSrc, /state\.missions\.receipts = normalizeMissionReceipts\(data\.receipts\)/,
  'mission deserializer must restore normalized capped receipts');
assert.match(saveSrc, /payload\.receipts/,
  'save fallback restore must preserve receipts when missions system is unavailable');
assert.match(saveSrc, /mission:failed[\s\S]*requestAutosave\('mission'\)/,
  'failed mission settlements must request autosave');
assert.match(saveSrc, /mission:expired[\s\S]*requestAutosave\('mission'\)/,
  'expired mission settlements must request autosave');
assert.match(missionLogSrc, /export function missionReceiptRows/,
  'Mission Log receipt rows must stay directly testable');
assert.match(missionLogSrc, /sf-mlog-receipt-row/,
  'Mission Log completed drawer must render receipt rows');
assert.match(missionLogSrc, /CAREER TOTALS/,
  'Mission Log completed drawer must preserve aggregate career totals');

function assertReceiptBeforeEvent(outcome) {
  const receiptCall = `_recordMissionReceipt(m, '${outcome}'`;
  const eventCall = `this.bus.emit('mission:${outcome}'`;
  const receiptIndex = missionsSrc.indexOf(receiptCall);
  const eventIndex = missionsSrc.indexOf(eventCall);
  assert.ok(receiptIndex >= 0 && eventIndex >= 0 && receiptIndex < eventIndex,
    outcome + ' receipt must be recorded before the synchronous mission event autosaves');
}

assertReceiptBeforeEvent('completed');
assertReceiptBeforeEvent('failed');
assertReceiptBeforeEvent('expired');

const baseMission = {
  id: 'mission_receipt_bulk',
  type: 'bulk_trade',
  title: 'Tethys Food Run',
  factionId: 'faction_scn',
  stationId: 'station_helios',
  destStationId: 'station_tethys',
  destSectorId: 'sector_tethys_junction',
  reward_cr: 1200,
  collateral_cr: 300,
  riskTier: 2,
};

assert.equal(missionRepDeltaFor(baseMission, 'completed'), 5,
  'completed R2 bulk trade should report the same +rep as mission settlement');
assert.equal(missionRepDeltaFor(baseMission, 'failed'), -3,
  'failed R2 bulk trade should report the same penalty as mission settlement');

const completed = missionReceiptFor(baseMission, 'completed', null, { at_s: 220, researchPoints: 2 });
assert.equal(completed.rewardCr, 1200, 'completed receipt should include exact payout');
assert.equal(completed.collateralRefundCr, 300, 'completed receipt should include collateral refund');
assert.equal(completed.collateralLostCr, 0, 'completed receipt should not report lost collateral');
assert.equal(completed.repDelta, 5, 'completed receipt should include rep reward');
assert.equal(completed.researchPoints, 2, 'completed receipt should include research payout when present');

const failed = missionReceiptFor(baseMission, 'failed', 'abandoned', { at_s: 240 });
assert.equal(failed.rewardCr, 0, 'failed receipt should show no payout');
assert.equal(failed.collateralRefundCr, 0, 'failed receipt should not refund collateral');
assert.equal(failed.collateralLostCr, 300, 'failed receipt should show forfeited collateral');
assert.equal(failed.repDelta, -3, 'failed receipt should include rep penalty');
assert.equal(failed.reason, 'abandoned', 'failed receipt should preserve reason');

const expired = missionReceiptFor({
  ...baseMission,
  id: 'mission_receipt_scan',
  type: 'recon_scan',
  title: 'Cold Wake Scan',
  reward_cr: 900,
  collateral_cr: 0,
  riskTier: 1,
  destStationId: null,
  destSectorId: 'sector_helios_prime',
}, 'expired', 'deadline', { at_s: 260 });
assert.equal(expired.rewardCr, 0, 'expired receipt should show no payout');
assert.equal(expired.repDelta, -4, 'expired R1 recon scan should include rep penalty');
assert.equal(expired.collateralLostCr, 0, 'expired no-collateral mission should not invent lost collateral');

const rows = missionReceiptRows({
  missions: { receipts: [failed, completed, expired] },
}, 2);
assert.equal(rows.length, 2, 'Mission Log rows should respect the requested cap');
assert.equal(rows[0].outcome, 'Failed', 'receipt rows should preserve latest-first order');
assert.equal(rows[0].title, 'Tethys Food Run', 'receipt row should name the contract');
assert.match(rows[0].body, /No payout/, 'failed row should show no payout');
assert.match(rows[0].body, /-3 contract standing/, 'failed row should show contract standing penalty');
assert.match(rows[0].body, /300 cr stake forfeited/, 'failed row should show collateral loss as stake loss');
assert.match(rows[0].meta, /Bulk Trade/, 'failed row should show mission type');
assert.match(rows[0].meta, /Tethys/, 'failed row should show destination');
assert.match(rows[0].meta, /Reason: Abandoned by pilot/, 'failed row should show player-safe reason');
assert.doesNotMatch(rows[0].meta, /abandoned/, 'failed row should not expose raw reason tokens');
assert.match(rows[1].body, /Paid \+1,200 cr/, 'completed row should show payout');
assert.match(rows[1].body, /\+5 contract standing/, 'completed row should show contract standing gain');
assert.match(rows[1].body, /300 cr stake returned/, 'completed row should show collateral refund as stake return');
assert.match(rows[1].body, /\+2 research/, 'completed row should show research payout');

const expiredRows = missionReceiptRows({ missions: { receipts: [expired] } });
assert.equal(expiredRows[0].outcome, 'Expired', 'expired receipt should render as expired');
assert.match(expiredRows[0].meta, /Helios Prime/, 'sector-only expired receipt should render sector destination');
assert.match(expiredRows[0].meta, /Reason: Deadline missed/, 'expired receipt should render deadline reason');

console.log('Mission receipt ledger OK: settlement receipts persist and render recent completed/failed/expired outcomes.');
