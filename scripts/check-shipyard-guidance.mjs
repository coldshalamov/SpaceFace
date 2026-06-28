import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import {
  bestShipyardMissionFit,
  describeShipyardMissionFit,
  describeShipyardPurchase,
  missionHullGuide,
  missionPickForShipyard,
} from '../src/ui/screens/shipyard.js';

const source = readFileSync(new URL('../src/ui/screens/shipyard.js', import.meta.url), 'utf8');
const stationSource = readFileSync(new URL('../src/ui/screens/stationHub.js', import.meta.url), 'utf8');
const ship = (id) => SHIPS.find((entry) => entry.id === id);

let guidance = describeShipyardPurchase(ship('ship_wasp'), { credits: 100000 }, false);
assert.equal(guidance.state, 'locked');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Research Combat Basics');
assert.match(guidance.title, /requires Combat Basics/);

guidance = describeShipyardPurchase(ship('ship_pelican'), { credits: 500 }, true);
assert.equal(guidance.state, 'funding');
assert.equal(guidance.disabled, true);
assert.equal(guidance.label, 'Need 21,500 cr');
assert.match(guidance.title, /need 21,500 more credits/i);

guidance = describeShipyardPurchase(ship('ship_pelican'), { credits: 22000 }, true);
assert.equal(guidance.state, 'available');
assert.equal(guidance.disabled, false);
assert.equal(guidance.label, 'Buy');
assert.match(guidance.title, /After purchase/);

guidance = describeShipyardPurchase(ship('ship_kestrel'), { credits: 0 }, true);
assert.equal(guidance.state, 'free');
assert.equal(guidance.label, 'Claim');

const trackedPick = missionPickForShipyard({
  ui: { trackedMissionId: 'm_bounty' },
  missions: {
    active: [
      { id: 'm_haul', type: 'cargo_delivery', status: 'active' },
      { id: 'm_bounty', type: 'bounty_hunt', status: 'active', title: 'Clear the Toll Gate' },
    ],
  },
});
assert.equal(trackedPick.tracked, true, 'shipyard advisor should prefer the tracked mission');
assert.equal(trackedPick.mission.id, 'm_bounty');

const fallbackPick = missionPickForShipyard({
  ui: { trackedMissionId: 'missing' },
  missions: {
    active: [
      { id: 'm_done', type: 'bulk_trade', status: 'completed' },
      { id: 'm_mine', type: 'mining_quota', status: 'active' },
    ],
  },
});
assert.equal(fallbackPick.tracked, false, 'shipyard advisor should mark untracked active fallback honestly');
assert.equal(fallbackPick.mission.id, 'm_mine');

assert.deepEqual(missionHullGuide({ type: 'bounty_hunt' }).wants, ['weapon', 'shield', 'engine'],
  'combat contracts should guide hull buying toward weapons, shields, and engines');
assert.deepEqual(missionHullGuide({ type: 'mining_quota' }).roles, ['mining', 'mining_barge', 'multirole'],
  'mining contracts should prefer mining hull roles');

let fit = describeShipyardMissionFit(ship('ship_wasp'), { id: 'm_bounty', type: 'bounty_hunt', status: 'active' });
assert.equal(fit.kind, 'ok');
assert.equal(fit.label, 'JOB FIT');
assert.equal(fit.score, 9);
assert.match(fit.body, /matches weapon, shield, engine/i);
assert.match(fit.body, /role match/i);

fit = describeShipyardMissionFit(ship('ship_mule'), { id: 'm_bounty', type: 'bounty_hunt', status: 'active' });
assert.equal(fit.kind, 'warn');
assert.equal(fit.label, 'WORKABLE');
assert.match(fit.body, /role is freighter/i);

fit = describeShipyardMissionFit(ship('ship_pelican'), { id: 'm_mine', type: 'mining_quota', status: 'active' });
assert.equal(fit.kind, 'ok');
assert.equal(fit.score, 9);
assert.match(fit.title, /Pelican for Mining Hull/);

let best = bestShipyardMissionFit({ id: 'm_haul', type: 'cargo_delivery', status: 'active' });
assert.equal(best.def.id, 'ship_mule', 'haulage best fit should prefer the first low-tier full-role freighter');
assert.equal(best.fit.score, 9);

best = bestShipyardMissionFit({ id: 'm_bounty', type: 'bounty_hunt', status: 'active' });
assert.equal(best.def.id, 'ship_wasp', 'combat best fit should prefer the first low-tier full-role fighter');

assert.match(source, /export function describeShipyardPurchase/);
assert.match(source, /export function missionPickForShipyard/);
assert.match(source, /export function missionHullGuide/);
assert.match(source, /export function describeShipyardMissionFit/);
assert.match(source, /bestShipyardMissionFit\(mission, unlockedCatalog\.length \? unlockedCatalog : SHIPS\)/);
assert.match(source, /const unlockedCatalog = SHIPS\.filter\(\(def\) => isUnlocked\(def\)\)/);
assert.match(source, /HULL FIT ADVISOR/);
assert.match(source, /mission-fit-/);
assert.match(source, /st-sy-fitline/);
assert.match(source, /Research ' \+ req/);
assert.match(source, /const purchaseTitle = purchase\.title \+ \(fit \?/);
assert.match(source, /aria-label="' \+ escapeHtml\(purchaseTitle\)/);
assert.match(stationSource, /\.st-sy-job-guide/);
assert.match(stationSource, /\.st-shipyard \.st-row\.mission-fit-ok/);
assert.doesNotMatch(source, /Requires ' \+ escapeHtml\(def\.requiresTech\)/);
assert.doesNotMatch(source, />Locked<\/button>/);

console.log('Shipyard guidance OK - hull purchase buttons and job-fit advisor explain blockers and mission fit.');
