import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { kesslerScaleWaypoint } from '../src/systems/kesslerScaleWorksite.js';
import { missionLogScreen, recommendedActions, storyActionForBeat } from '../src/ui/screens/missionLog.js';
import { takeMapOpenIntent } from '../src/ui/mapAuthority.js';
import { ensurePadWalkDocument } from '../scripts/lib/pq16400-gamepad-screens.mjs';

function scaleState(currentSectorId, waypoint = null) {
  const state = createGameState(4747);
  state.story.beatIndex = 1;
  state.story.campaign47a = createCampaign47aState();
  state.story.campaign47a.stepProgress['1'] = { completed: ['alloy_run'], updatedAtS: 12 };
  state.world.currentSectorId = currentSectorId;
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.nav.waypoint = waypoint;
  return state;
}

function mapClickContext(state) {
  const pushed = [];
  return {
    state,
    bus: createBus(),
    screenManager: {
      pushScreen(id) { pushed.push(id); },
      top() { return 'missionLog'; },
    },
    pushed,
  };
}

function releaseMountedRoot(root) {
  if (typeof missionLogScreen.unmount === 'function') missionLogScreen.unmount();
  else if (typeof missionLogScreen.onHide === 'function') missionLogScreen.onHide();
  root.remove();
}

test('the Mission Log current action describes the existing scale step across sectors without mutating state', () => {
  ensurePadWalkDocument();
  const expected = kesslerScaleWaypoint(scaleState('sector_tethys_junction'));
  assert.ok(expected, 'the recorded alloy handoff opens the existing Scale 4 projection');

  for (const sectorId of ['sector_tethys_junction', 'sector_helios_prime']) {
    const manualPin = {
      kind: 'local', label: 'Pilot pin', sectorId,
      pos: { x: 42, z: -18 },
    };
    const state = scaleState(sectorId, manualPin);
    const stepProgressBefore = JSON.stringify(state.story.campaign47a.stepProgress);
    const waypointBefore = JSON.stringify(state.nav.waypoint);
    const beatBefore = state.story.beatIndex;

    const action = storyActionForBeat(STORY_BEATS[1], state);
    const currentAction = recommendedActions(state, state.missions.active, state.ui.trackedMissionId)[0];

    assert.equal(action.title, expected.label);
    assert.equal(action.body, expected.reason,
      'the log uses the exact worksite instructions shown by the existing Scale 4 projection');
    assert.equal(action.meta, 'Tethys Junction');
    assert.equal(action.mapAction.focus, sectorId === expected.sectorId ? 'local' : 'galaxy');
    assert.equal(action.mapAction.sectorId, expected.sectorId);
    assert.deepEqual(action.mapAction.pos, sectorId === expected.sectorId ? expected.pos : null);
    assert.equal(action.mapAction.title, sectorId === expected.sectorId
      ? 'Open Scale 4 on the Local Map' : 'Open Tethys on the Star Map');
    assert.equal(currentAction.title, expected.label,
      'the actual single CURRENT ACTION reader exposes the scale instruction');
    assert.equal(currentAction.body, expected.reason);

    assert.equal(JSON.stringify(state.story.campaign47a.stepProgress), stepProgressBefore);
    assert.equal(JSON.stringify(state.nav.waypoint), waypointBefore,
      'reading the story action preserves a player-owned pin');
    assert.equal(state.story.beatIndex, beatBefore,
      'the Mission Log remains a read-only presenter');

    // Click the actual story action's existing map button so its encoder, decoder and the
    // shared map authority all carry the same sector/local-fix distinction.
    const ctx = mapClickContext(state);
    const root = document.createElement('div');
    document.body.appendChild(root);
    missionLogScreen.mount(root, ctx);
    const button = root.querySelector('.sf-mlog-rec-action.sf-mlog-rec-map[data-rec-act="openMap"]');
    assert.ok(button, 'the Scale 4 current action has a map handoff');
    button.click();
    assert.deepEqual(ctx.pushed, ['galaxyMap']);
    assert.deepEqual(takeMapOpenIntent(state), {
      focus: sectorId === expected.sectorId ? 'local' : 'galaxy',
      sectorId: expected.sectorId,
      missionId: null,
      stationId: null,
      pos: sectorId === expected.sectorId ? expected.pos : null,
      label: null,
      source: 'missionLog-story-scale-4',
    });
    assert.deepEqual(state.nav.waypoint, manualPin, 'the map handoff does not replace the pilot pin');
    assert.equal(JSON.stringify(state.story.campaign47a.stepProgress), stepProgressBefore,
      'the map handoff does not write campaign progress');
    releaseMountedRoot(root);
  }
});

test('Mission Log map button decoding requires a finite, complete coordinate pair but accepts explicit zero', () => {
  ensurePadWalkDocument();
  const state = scaleState('sector_tethys_junction');
  const ctx = mapClickContext(state);
  const root = document.createElement('div');
  document.body.appendChild(root);
  missionLogScreen.mount(root, ctx);
  const button = root.querySelector('.sf-mlog-rec-action.sf-mlog-rec-map[data-rec-act="openMap"]');
  assert.ok(button);

  const cases = [
    { name: 'both missing', x: null, z: null, expected: null },
    { name: 'one missing', x: '12', z: null, expected: null },
    { name: 'blank', x: ' ', z: '3', expected: null },
    { name: 'malformed', x: 'north', z: '3', expected: null },
    { name: 'infinite', x: 'Infinity', z: '3', expected: null },
    { name: 'explicit zero pair', x: '0', z: '0', expected: { x: 0, z: 0 } },
    { name: 'ordinary pair', x: '12.5', z: '-3', expected: { x: 12.5, z: -3 } },
  ];
  for (const entry of cases) {
    if (entry.x == null) button.removeAttribute('data-map-pos-x');
    else button.setAttribute('data-map-pos-x', entry.x);
    if (entry.z == null) button.removeAttribute('data-map-pos-z');
    else button.setAttribute('data-map-pos-z', entry.z);
    button.click();
    assert.deepEqual(takeMapOpenIntent(state).pos, entry.expected, entry.name);
  }
  releaseMountedRoot(root);
});

test('the scale action preserves existing tracked-mission, trade-route, and unfinished B0 tutorial routing', () => {
  const state = scaleState('sector_tethys_junction');
  const unrelated = {
    id: 'local-contract', status: 'active', type: 'cargo_delivery',
    title: 'Local contract', destStationId: 'station_tethys', destSectorId: 'sector_tethys_junction',
    params: { qty: 1, cmdtyId: 'cmdty_iron' }, objectiveProgress: 0, objectiveTarget: 1,
  };
  state.missions.active = [unrelated];
  state.ui.trackedMissionId = unrelated.id;
  assert.equal(recommendedActions(state, state.missions.active, unrelated.id)[0].label, 'TRACKED');

  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.nav.waypoint = {
    kind: 'trade', stationId: 'station_tethys', sectorId: 'sector_tethys_junction',
    commodityId: 'cmdty_iron', pos: { x: 1, z: 2 },
  };
  assert.equal(recommendedActions(state, [], null)[0].label, 'TRADE ROUTE');

  // The intro tutorial is a live B0 command owner, not a completed placeholder. Even a tracked
  // competing contract loses to the authored first-route action; B1 sidecar data cannot promote
  // the later Scale 4 step while the canonical beat remains at zero.
  state.nav.waypoint = null;
  state.story.beatIndex = 0;
  state.missions.active = [unrelated];
  state.ui.trackedMissionId = unrelated.id;
  state.settings.gameplay.tutorialHints = true;
  state.onboarding = { active: true, finished: false };
  assert.equal(kesslerScaleWaypoint(state), null);
  assert.equal(recommendedActions(state, state.missions.active, unrelated.id)[0].title, 'Follow the anomaly',
    'the unfinished staged tutorial preserves the B0 first-route action');
});

test('Scale 4 is not inferred from a beat number, old flag, or already-weighed record', () => {
  const state = scaleState('sector_tethys_junction');
  state.story.campaign47a.stepProgress['1'].completed = [];
  assert.equal(kesslerScaleWaypoint(state), null);
  assert.equal(storyActionForBeat(STORY_BEATS[1], state).title, 'Take a haul',
    'without the alloy receipt the ordinary beat-1 fallback remains');
  state.story.campaign47a.stepProgress['1'].completed = ['alloy_run', 'scale_4'];
  assert.equal(kesslerScaleWaypoint(state), null);
  assert.equal(storyActionForBeat(STORY_BEATS[1], state).title, 'Take a haul',
    'after Scale 4 the Scale 4 instruction is no longer projected');
  state.story.campaign47a.stepProgress['1'].completed = ['alloy_run', 'infested'];
  assert.equal(kesslerScaleWaypoint(state), null);
  assert.equal(storyActionForBeat(STORY_BEATS[1], state).title, 'Take a haul',
    'after the furnace leg the Scale 4 instruction is no longer projected');
  state.story.beatIndex = 2;
  state.story.campaign47a.stepProgress['1'].completed = ['alloy_run'];
  assert.equal(kesslerScaleWaypoint(state), null);
  assert.equal(storyActionForBeat(STORY_BEATS[2], state).title, 'Arm for a bounty');
});
