import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendedActions } from '../src/ui/screens/missionLog.js';

const missionLogSrc = readFileSync(new URL('../src/ui/screens/missionLog.js', import.meta.url), 'utf8');

assert.match(missionLogSrc, /sf-mlog-recommend/, 'mission log must render the recommended-next rail');
assert.match(missionLogSrc, /_renderRecommendations/, 'mission log must refresh recommendations with live state');
assert.match(missionLogSrc, /export function recommendedActions/, 'recommendation policy must stay directly testable');

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
assert(actions.some((a) => a.label === 'CONTRACT'), 'story action should remain visible behind active contract guidance');

actions = recommendedActions(baseState, [activeMission], 'mission_cargo_1');
assert.equal(actions[0].label, 'TRACKED', 'tracked contract should be first');
assert.equal(actions[0].meta, '50% complete', 'tracked contract should show progress');
assert(!/^Next:/i.test(actions[0].body), 'tracked body should read as an action, not repeat the card prefix');

const fullHoldState = {
  ...baseState,
  player: { credits: 120, cargo: { usedVolume: 39, capVolume: 40 } },
};
actions = recommendedActions(fullHoldState, [], null);
assert(actions.some((a) => a.label === 'HOLD'), 'nearly full cargo should recommend unloading');

console.log('ok recommended next action rail');
