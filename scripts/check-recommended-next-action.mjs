import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STORY_BEATS } from '../src/data/missions.js';
import { recommendedActions } from '../src/ui/screens/missionLog.js';

const missionLogSrc = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');

assert.match(missionLogSrc, /sf-mlog-recommend/, 'mission log must render the recommended-next rail');
assert.match(missionLogSrc, /data-rec-act="track"/, 'untracked recommendations must render a Track Nav action button');
assert.match(missionLogSrc, /ui:trackMission/, 'recommendation actions must reuse the mission tracking intent');
assert.match(missionLogSrc, /_renderRecommendations/, 'mission log must refresh recommendations with live state');
assert.match(missionLogSrc, /export function recommendedActions/, 'recommendation policy must stay directly testable');

const honestWork = STORY_BEATS.find((beat) => beat && beat.id === 'honest_work');
assert(honestWork, 'honest_work story beat must exist');
assert.match(honestWork.objective, /low-risk haul or trade contract/i,
  'first contract story objective should bias new pilots toward safe paid work');
assert.match(honestWork.objective, /TRACKED in Mission Log/,
  'first contract story objective should teach where to verify tracked status');
assert.match(honestWork.objective, /marked station/i,
  'first contract story objective should connect contract acceptance to route following');

const baseState = {
  simTime: 100,
  story: { beatIndex: 1, branch: null, chainProgress: 0 },
  player: { credits: 120, cargo: { usedVolume: 0, capVolume: 40 } },
};

let actions = recommendedActions(baseState, [], null);
assert.equal(actions[0].label, 'CONTRACT', 'empty log on beat 1 should recommend a contract');
assert.match(actions[0].body, /station board/, 'contract recommendation should point at the mission board');
assert(actions.some((a) => a.label === 'READINESS'), 'starter cargo readiness should appear when the hold is open');

const activeMission = {
  id: 'mission_cargo_1',
  status: 'active',
  type: 'cargo_delivery',
  title: 'Helios Priority Run',
  objectiveProgress: 1,
  objectiveTarget: 2,
  deadline_s: 500,
  destStationId: 'station_helios',
};

actions = recommendedActions(baseState, [activeMission], null);
assert.equal(actions[0].label, 'UNTRACKED', 'active but untracked contracts should be first');
assert.match(actions[0].title, /Helios Priority Run/, 'untracked recommendation should name the contract');
assert.equal(actions[0].action, 'track', 'untracked recommendation should be actionable');
assert.equal(actions[0].actionLabel, 'TRACK NAV', 'untracked recommendation should name the Track Nav action');
assert.equal(actions[0].missionId, 'mission_cargo_1', 'untracked recommendation should carry the mission id to track');
assert(actions.some((a) => a.label === 'CONTRACT'), 'story action should remain visible behind active contract guidance');

actions = recommendedActions(baseState, [activeMission], 'mission_cargo_1');
assert.equal(actions[0].label, 'TRACKED', 'tracked contract should be first');
assert.equal(actions[0].meta, '50% complete', 'tracked contract should show progress');
assert.equal(actions[0].missionId, 'mission_cargo_1', 'tracked recommendation should carry the active mission id');
assert(!/^Next:/i.test(actions[0].body), 'tracked body should read as an action, not repeat the card prefix');

const lowFuelState = {
  ...baseState,
  fuel: { current: 9, max: 100 },
};
actions = recommendedActions(lowFuelState, [activeMission], 'mission_cargo_1');
assert.equal(actions[0].label, 'TRACKED', 'tracked mission should stay the top recommendation');
assert.equal(actions[1].label, 'SERVICE', 'critical fuel should add a service-readiness recommendation');
assert.equal(actions[1].title, 'Refuel before committing', 'critical fuel copy should name the required station service');
assert.equal(actions[1].meta, '9% fuel', 'fuel readiness should expose the live fuel fraction');

const riskyMission = {
  id: 'mission_bounty_1',
  status: 'active',
  type: 'bounty_hunt',
  title: 'Cutlass Wake',
  objectiveProgress: 0,
  objectiveTarget: 1,
  riskTier: 2,
  deadline_s: 700,
};
const damagedState = {
  ...baseState,
  fuel: { current: 80, max: 100 },
  playerId: 'ship_player',
  entities: new Map([['ship_player', { hull: 48, hullMax: 100, armorHp: 66, armorMax: 100 }]]),
};
actions = recommendedActions(damagedState, [riskyMission], 'mission_bounty_1');
assert.equal(actions[0].label, 'TRACKED', 'tracked combat work should stay first');
assert.equal(actions[1].label, 'SERVICE', 'risk work with damaged protection should add a repair recommendation');
assert.equal(actions[1].title, 'Patch hull before risk work', 'repair readiness should name combat preparation');
assert.equal(actions[1].meta, '48% protection', 'repair readiness should expose the weaker protection layer');

const fullHoldState = {
  ...baseState,
  player: { credits: 120, cargo: { usedVolume: 39, capVolume: 40 } },
};
actions = recommendedActions(fullHoldState, [], null);
assert(actions.some((a) => a.label === 'HOLD'), 'nearly full cargo should recommend unloading');

console.log('ok recommended next action rail');