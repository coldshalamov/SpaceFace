#!/usr/bin/env node
// Guards accepted-contract trust in Mission Log: active cards must show payout, timer,
// route/risk, stake, and failure terms using the same consequence math as preflight.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { activeMissionContractTerms } from '../src/ui/screens/missionLog.js';

const source = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');

assert.match(source, /missionConsequenceSummary/, 'Mission Log must reuse shared preflight consequence math');
assert.match(source, /missionTimePacing/, 'Mission Log must reuse shared timer pacing math');
assert.match(source, /export function activeMissionContractTerms/, 'accepted contract terms must stay directly testable');
assert.match(source, /class="sf-mlog-terms mono"/, 'active mission cards must render a contract terms row');
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

console.log('Mission Log contract terms OK: accepted cards show payout, clock, risk, stake, miss, and heat.');
