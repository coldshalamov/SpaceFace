#!/usr/bin/env node
// Guards accepted-contract trust in Mission Log: active cards must show payout, timer,
// route/risk, stake, and failure terms using the same consequence math as preflight.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { activeMissionContractTerms } from '../src/ui/screens/missionLog.js';
import { CONTRACT_47A_B0_BODY } from '../src/data/narrative.js';

const source = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');

assert.match(source, /missionConsequenceSummary/, 'Mission Log must reuse shared preflight consequence math');
assert.match(source, /missionTimePacing/, 'Mission Log must reuse shared timer pacing math');
assert.match(source, /export function activeMissionContractTerms/, 'accepted contract terms must stay directly testable');
assert.match(source, /class="k-rows sf-mlog-terms"/, 'the focused mission must render its contract terms as kit rows');
assert.match(source, /aria-label="Contract terms"/, 'contract terms row must be named for assistive tech');
assert.match(source, /sf-mlog-term--warn/, 'contract terms must have warning styling for stakes and misses');
assert.match(source, /sf-mlog-term--bad/, 'contract terms must have danger styling for smuggling heat');

const baseState = {
  simTime: 120,
  world: { currentSectorId: 'sector_helios_prime' },
  missions: { config: { cruiseSpeedRef: 120 } },
};

const cargoMission = {
  id: 'mission_terms_cargo',
  status: 'active',
  type: 'bulk_trade',
  title: 'Tethys Food Run',
  factionId: 'faction_scn',
  reward_cr: 1200,
  collateral_cr: 300,
  riskTier: 2,
  deadline_s: 420,
  distance: 480,
  destStationId: 'station_tethys',
  destSectorId: 'sector_tethys_junction',
  objectiveProgress: 0,
  objectiveTarget: 8,
  params: { cmdtyId: 'cmdty_food', qty: 8, taskTime: 180 },
};

let terms = activeMissionContractTerms(cargoMission, baseState);
assert.deepEqual(terms.map((term) => term.label), ['Pays', 'Clock', 'Risk', 'Stake', 'Miss'],
  'standard accepted contracts should expose success, timer, risk, stake, and miss terms');
assert.equal(terms.find((term) => term.label === 'Pays').text, '+1,200 cr / +5 rep',
  'pay terms should combine credits and offering-faction rep reward');
assert.match(terms.find((term) => term.label === 'Clock').text, /Tight|Critical|timer/,
  'clock terms should expose the active absolute deadline');
assert.equal(terms.find((term) => term.label === 'Risk').text, 'R2 / off-sector route',
  'risk terms should combine risk tier with route scope');
assert.equal(terms.find((term) => term.label === 'Stake').text, '300 cr collateral',
  'stake terms should show collateral already committed on accepted jobs');
assert.equal(terms.find((term) => term.label === 'Miss').text, '-3 rep / stake forfeited / no payout',
  'miss terms should name the failure cost and withheld payout');

terms = activeMissionContractTerms({
  ...cargoMission,
  type: 'smuggling_run',
  title: 'Quiet Bay Customs Run',
  reward_cr: 1800,
  collateral_cr: 450,
  riskTier: 3,
}, {
  ...baseState,
  world: { currentSectorId: 'sector_tethys_junction' },
});
assert.equal(terms.some((term) => term.label === 'Heat' && term.kind === 'bad'), true,
  'smuggling contracts should keep customs heat visible after acceptance');
assert.equal(terms.find((term) => term.label === 'Risk').text, 'R3 / local route',
  'risk terms should call out local route scope when the target sector matches the current sector');

terms = activeMissionContractTerms({
  id: 'mission_terms_probe',
  status: 'active',
  type: 'recon_scan',
  reward_cr: 0,
  riskTier: 0,
  objectiveProgress: 0,
  objectiveTarget: 1,
  deadline_s: 0,
}, baseState);
assert.equal(terms.find((term) => term.label === 'Pays').text, 'close cleanly',
  'contracts with no listed payout should still render an honest success term');
assert.equal(terms.some((term) => term.label === 'Stake'), false,
  'contracts with no collateral should not invent a stake term');
assert.equal(terms.find((term) => term.label === 'Risk').text, 'R0 / route pending',
  'contracts without route intel should show pending route scope');

// RC-48 — the opening contract's installed record (the same shape the ui-bench 47-A
// fixture seeds) must show its authored terms, not the generic fallbacks.
terms = activeMissionContractTerms({
  id: 'mission_helios_run',
  status: 'active',
  type: 'salvage_retrieval',
  title: CONTRACT_47A_B0_BODY.title,
  summary: CONTRACT_47A_B0_BODY.summary,
  description: CONTRACT_47A_B0_BODY.fullText,
  authorization: CONTRACT_47A_B0_BODY.authorization,
  objectiveProgress: 0,
  objectiveTarget: 1,
  deadline_s: null,
  reward_cr: 0,
  collateral_cr: 0,
  riskTier: 0,
  factionId: null,
  distance: 600,
  destStationId: 'station_helios',
  destSectorId: 'sector_helios_prime',
  storyTag: 'campaign47a:b0:recovery',
  campaign47aBeat: 0,
  params: {
    cmdtyId: 'cmdty_47a_assay_sample', qty: 1, sampleRecovered: false, samplePos: null,
    massAcceptT: CONTRACT_47A_B0_BODY.massAcceptT, massDeliverT: CONTRACT_47A_B0_BODY.massDeliverT,
    authorization: CONTRACT_47A_B0_BODY.authorization, code: CONTRACT_47A_B0_BODY.code,
    contractId: CONTRACT_47A_B0_BODY.contractId,
  },
}, baseState);
assert.equal(terms.find((term) => term.label === 'Pays').text,
  'Payment pending — nothing released on acceptance',
  '47-A must name its pending payment, not the generic close-cleanly fallback');
assert.equal(terms.some((term) => term.text.includes('12.4t on accept')), true,
  '47-A must show its mass-on-accept term');
assert.equal(terms.some((term) => term.text.includes('VALE-ALA-47A')), true,
  '47-A must show its contract code');
assert.equal(terms.some((term) => term.text.includes('REF 44-C')), true,
  '47-A must show its authorization');
assert.equal(terms.find((term) => term.label === 'Miss').text, 'no payout',
  '47-A keeps an honest no-payout miss term');
assert.equal(terms.some((term) => term.label === 'Clock'), false,
  '47-A has no clock — no invented timer row');

console.log('Mission Log contract terms OK: accepted cards show payout, clock, risk, stake, miss, and heat.');
