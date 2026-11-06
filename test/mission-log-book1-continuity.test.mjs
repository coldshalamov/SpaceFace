import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
import { recommendedActions, storyActionForBeat } from '../src/ui/screens/missionLog.js';
import { STORY_BEATS } from '../src/data/missions.js';

test('Book 1 Journal follows the ordered offer, scale work and handoff without taking the course', () => {
  const state = createGameState(4242);
  state.story.beatIndex = 1;
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;
  state.story.campaign47a = { stepProgress: { '1': { completed: [] } } };
  const course = { kind: 'local', label: 'Pilot course', pos: { x: 10, z: 20 } };
  state.nav.waypoint = course;

  const offer = buildMissionBoardContract(1, { state });
  assert.equal(offer.storyTag, 'campaign47a:b1:alloy_run');
  assert.equal(offer.stationId, 'station_helios');
  const first = recommendedActions(state, [], null)[0];
  assert.match(first.title, /Weigh-In/i);
  assert.match(first.body, /Helios.*Missions/i);
  assert.match(first.body, /preloaded alloys.*Tethys/i);
  state.missions.active = [{ ...offer, id: 'alloy', status: 'active' }];
  assert.equal(storyActionForBeat(STORY_BEATS[1], state), null, 'an accepted offer is not offered again');
  state.missions.active = [];

  state.story.campaign47a.stepProgress['1'].completed.push('alloy_run');
  assert.equal(buildMissionBoardContract(1, { state }), null, 'world work precedes the next board offer');
  const scale = recommendedActions(state, [], null)[0];
  assert.match(`${scale.title} ${scale.body}`, /Tethys Junction/);
  assert.match(scale.body, /manifest.*re-coded/i);
  assert.match(scale.body, /Scale 4.*fresh jettisoned unreserved cargo pod/i);
  assert.match(scale.body, /8 WU\/s or less/i);
  assert.match(scale.body, /buy or mine.*delivered alloys are gone/i);
  assert.equal(state.nav.waypoint, course);

  const tracked = { id: 'other', status: 'active', title: 'Other job', type: 'cargo_delivery', params: { qty: 1 } };
  state.missions.active = [tracked];
  state.ui.trackedMissionId = tracked.id;
  assert.equal(recommendedActions(state, state.missions.active, tracked.id)[0].missionId, tracked.id);
  assert.equal(state.nav.waypoint, course);
  assert.equal(state.ui.trackedMissionId, tracked.id);

  state.story.campaign47a.stepProgress['1'].completed.push('scale_4');
  const furnace = buildMissionBoardContract(1, { state });
  assert.equal(furnace.storyTag, 'campaign47a:b1:infested');
  assert.equal(storyActionForBeat(STORY_BEATS[1], state), null, 'no advice for an unposted offer');
  state.missions.boards.station_tethys = { slots: [furnace] };
  const next = storyActionForBeat(STORY_BEATS[1], state);
  assert.match(next.title, /Furnace Detail/i);
  assert.match(next.body, /Tethys Junction.*Missions.*Ceres refinery/i);
  assert.equal(recommendedActions(state, state.missions.active, tracked.id)[0].missionId, tracked.id);
  assert.equal(state.nav.waypoint, course);
  state.missions.active = [{ ...furnace, id: 'furnace', status: 'active' }];
  assert.equal(storyActionForBeat(STORY_BEATS[1], state), null, 'accepted work is not re-offered');
  state.missions.active = [];
  state.story.campaign47a.stepProgress['1'].completed.push('infested');
  assert.equal(storyActionForBeat(STORY_BEATS[1], state), null);
});
