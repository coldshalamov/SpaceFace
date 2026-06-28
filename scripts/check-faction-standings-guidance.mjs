import assert from 'node:assert/strict';

import {
  FACTION_AGGRO_THRESHOLD,
  factionLastDeltaText,
  factionNextTierText,
  factionStandingGuidance,
  tierFor,
} from '../src/ui/screens/factions.js';

const concord = { id: 'faction_scn', name: 'Solar Concord Navy', short: 'Concord' };
const reach = { id: 'faction_reach', name: 'Crimson Reach', short: 'Reach' };
const vael = { id: 'faction_vael', name: 'The Vael', short: 'Vael' };

function checkNeutralRunway() {
  const guidance = factionStandingGuidance(0, concord, null);

  assert.equal(FACTION_AGGRO_THRESHOLD, -150, 'UI guidance must stay pinned to the faction aggro threshold');
  assert.equal(tierFor(0).name, 'Neutral');
  assert.equal(guidance.next, '30 rep to Accepted (+30)');
  assert.equal(guidance.last, 'none recorded this save');
  assert.match(guidance.plan, /earn trust with Concord contracts/i);
  assert.match(guidance.risk, /150 rep above aggro/i);
}

function checkNearAggroRepairCopy() {
  const guidance = factionStandingGuidance(-120, vael, { value: -40, reason: 'caught_contraband' });

  assert.equal(tierFor(-120).name, 'Disliked');
  assert.equal(guidance.next, '91 rep to Neutral (-29)');
  assert.equal(guidance.last, '-40 rep from contraband scan');
  assert.match(guidance.plan, /repair reputation with Vael/i);
  assert.match(guidance.risk, /30 rep above aggro/i);
}

function checkAggroEscapeMath() {
  const guidance = factionStandingGuidance(-151, reach, { value: -25, reason: 'kill_faction_ship' });

  assert.equal(tierFor(-151).name, 'Hostile');
  assert.equal(guidance.next, '2 rep to Disliked (-149)');
  assert.equal(guidance.last, '-25 rep from faction ship kill');
  assert.match(guidance.plan, /repair standing with low-risk Reach contracts/i);
  assert.match(guidance.risk, /aggro active; earn 2 rep/i);
}

function checkHeroAndSpilloverCopy() {
  const guidance = factionStandingGuidance(720, concord, { value: 6, reason: 'spillover:kill_faction_enemy_ship' });

  assert.equal(tierFor(720).name, 'Hero');
  assert.equal(guidance.next, 'Hero tier secured (+1000 cap)');
  assert.equal(guidance.last, '+6 rep from ally/rival spillover (rival kill bounty)');
  assert.match(guidance.plan, /hold Hero standing/i);
  assert.match(guidance.risk, /high standing/i);
}

function checkReasonFallbacks() {
  assert.equal(factionLastDeltaText({ value: 0, reason: 'init' }), 'none recorded this save');
  assert.equal(factionLastDeltaText({ value: 4, reason: 'customs_warning_clear' }), '+4 rep from customs warning clear');
  assert.equal(factionNextTierText(1000), 'Hero tier secured (+1000 cap)');
}

checkNeutralRunway();
checkNearAggroRepairCopy();
checkAggroEscapeMath();
checkHeroAndSpilloverCopy();
checkReasonFallbacks();

console.log('Faction standings guidance OK - next-tier runway, last delta, aggro repair, and spillover copy are player-readable.');
