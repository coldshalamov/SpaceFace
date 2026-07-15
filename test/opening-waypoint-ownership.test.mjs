// Opening waypoint ownership — New Game cold-start must not install a competing
// kind:'mission' marker while the staged tutorial owns the first-session rail.
// Mission Log CURRENT ACTION must carry the story first-route ("Follow the anomaly")
// during teaching so the public first-15 route has one unmistakable opening objective.
//
// Companion to check:first-15-runtime (browser) and contract-47a-first-loop
// (tutorial off). Run:
//   node --test test/opening-waypoint-ownership.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CONTRACT_47A_B0_TAG,
  missions as missionsProto,
} from '../src/systems/missions.js';
import {
  buildOnboardingObjectiveWaypoint,
  onboarding as onboardingProto,
} from '../src/systems/onboarding.js';
import {
  recommendedActions,
  stagedOpeningOwnsCommand,
} from '../src/ui/screens/missionLog.js';

function harness({ tutorialHints = true, seed = 47 } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  state.settings.gameplay.tutorialHints = tutorialHints;
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  });
  const beacon = {
    id: 2, type: 'beacon', alive: true,
    pos: { x: 220, z: -40 },
    data: { kind: 'kessler_handoff_beacon' },
  };
  const asteroid = {
    id: 3, type: 'asteroid', alive: true,
    pos: { x: 180, z: -60 }, data: { typeId: 'ast_common_rock' },
  };
  const station = {
    id: 4, type: 'station', alive: true,
    pos: { x: -420, z: 100 },
    data: { stationId: 'station_helios', name: 'Helios Station' },
  };
  state.entities.set(2, beacon);
  state.entities.set(3, asteroid);
  state.entities.set(4, station);
  state.entityList.push(beacon, asteroid, station);
  // Default new-game onboarding is absent until game:started; leave unset so
  // _tutorialOwnsOpening treats the opening as tutorial-owned when hints are on.

  const bus = createBus();
  const helpers = {
    voice: { say: () => true },
    mulberry32: (value) => {
      let a = value >>> 0;
      return () => ((a = (a + 0x6D2B79F5) >>> 0) / 4294967296);
    },
  };
  const missions = Object.assign({}, missionsProto);
  const onboarding = Object.assign({}, onboardingProto);
  // Headless: skip DOM panel injection from game:started.
  onboarding._injectStyle = () => {};
  onboarding._buildPanel = () => {};
  onboarding._refreshBeatPanel = () => {};
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  onboarding.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, missions, onboarding, beacon, asteroid };
}

function isStoryOrOnboardingOwned(wp) {
  return !!(wp && (wp.kind === 'story' || wp.onboarding === true));
}

test('default New Game: cold-start tracks 47-A without claiming a mission waypoint while tutorial owns opening', () => {
  const h = harness({ tutorialHints: true });
  h.bus.emit('game:started');

  const mission = h.state.missions.active.find((m) => m && m.storyTag === CONTRACT_47A_B0_TAG);
  assert.ok(mission, 'cold-start still installs the 47-A recovery contract');
  assert.equal(h.state.ui.trackedMissionId, mission.id, 'contract remains tracked for later handoff');
  assert.equal(h.state.onboarding.active, true, 'tutorial is active after game:started');
  assert.equal(h.state.onboarding.finished, false);
  assert.equal(stagedOpeningOwnsCommand(h.state), true);

  // Mission must not leave an unowned / mission-kind opening marker.
  const wp0 = h.state.nav.waypoint;
  if (wp0) {
    assert.ok(
      isStoryOrOnboardingOwned(wp0),
      `opening waypoint must be story/onboarding-owned (got kind=${wp0.kind} onboarding=${wp0.onboarding})`,
    );
    assert.notEqual(wp0.kind, 'mission', 'mission kind must not own the opening marker during tutorial');
  }

  // Onboarding lesson stamps a beat-stable opening marker; mission refresh must not clobber it.
  h.state.onboarding.currentBeat = 0;
  h.state.onboarding.beatAction = 'Thrust toward the beacon.';
  h.onboarding._setObjectiveWaypoint(true);
  const onboardingWp = h.state.nav.waypoint;
  assert.ok(onboardingWp, 'B0 thrust must plant an opening waypoint');
  assert.equal(onboardingWp.onboarding, true);
  assert.equal(onboardingWp.markerId, 'onboarding:thrust');
  assert.deepEqual(onboardingWp.pos, h.beacon.pos);

  // Stale mission-kind claims are reclaimed by the teaching rail.
  h.state.nav.waypoint = {
    kind: 'mission',
    missionId: mission.id,
    label: '47-A Recovery Site',
    pos: h.asteroid.pos,
  };
  h.onboarding._setObjectiveWaypoint(false);
  assert.equal(h.state.nav.waypoint.onboarding, true, 'periodic onboarding update reclaims mission marker');
  assert.equal(h.state.nav.waypoint.markerId, 'onboarding:thrust');

  h.missions.update(1.0, h.state);
  assert.equal(h.state.nav.waypoint.onboarding, true, 'mission update must preserve onboarding waypoint');
  assert.equal(h.state.nav.waypoint.markerId, 'onboarding:thrust');
  assert.notEqual(h.state.nav.waypoint.kind, 'mission');

  // Mission Log CURRENT ACTION: story first-route, not competing 47-A TRACKED card.
  const actions = recommendedActions(
    h.state,
    h.state.missions.active,
    h.state.ui.trackedMissionId,
  );
  assert.equal(actions[0].label, 'STORY', 'opening CURRENT ACTION is the story first-route');
  assert.match(actions[0].title, /Follow the anomaly/i);
});

test('tutorial:finished hands nav ownership back to the tracked 47-A mission', () => {
  const h = harness({ tutorialHints: true });
  h.bus.emit('game:started');
  const mission = h.state.missions.active.find((m) => m && m.storyTag === CONTRACT_47A_B0_TAG);
  assert.ok(mission);

  h.state.nav.waypoint = buildOnboardingObjectiveWaypoint(
    { key: 'dock', line: 'Dock at Helios.' },
    { pos: { x: -420, z: 100 }, label: 'HELIOS' },
  );
  // Finish tutorial the same way production does (finished first, then event).
  h.state.onboarding.finished = true;
  h.state.onboarding.active = false;
  h.state.nav.waypoint = null; // _clearObjectiveWaypoint
  h.bus.emit('tutorial:finished', {});

  assert.ok(h.state.nav.waypoint, 'mission/story nav must restore a waypoint after tutorial handoff');
  assert.equal(h.state.nav.waypoint.kind, 'mission', 'tracked 47-A owns nav after tutorial');
  assert.equal(h.state.nav.waypoint.missionId, mission.id);
  assert.match(h.state.nav.waypoint.label, /47-A|Recovery/i);

  const actions = recommendedActions(
    h.state,
    h.state.missions.active,
    h.state.ui.trackedMissionId,
  );
  assert.equal(actions[0].label, 'TRACKED', 'post-tutorial CURRENT ACTION returns to tracked 47-A');
  assert.match(actions[0].title, /47-A|Sample/i);
});

test('tutorialHints off: cold-start still installs mission-owned 47-A waypoint immediately', () => {
  const h = harness({ tutorialHints: false });
  // Match contract-47a-first-loop: no active tutorial.
  h.state.onboarding = { active: false, finished: true };
  h.missions.newGame();

  const mission = h.state.missions.active.find((m) => m && m.storyTag === CONTRACT_47A_B0_TAG);
  assert.ok(mission);
  assert.ok(h.state.nav.waypoint, 'without tutorial, cold-start claims nav immediately');
  assert.equal(h.state.nav.waypoint.kind, 'mission');
  assert.equal(h.state.nav.waypoint.missionId, mission.id);
  assert.deepEqual(h.state.nav.waypoint.pos, h.asteroid.pos);
  assert.equal(stagedOpeningOwnsCommand(h.state), false);

  const actions = recommendedActions(
    h.state,
    h.state.missions.active,
    h.state.ui.trackedMissionId,
  );
  assert.equal(actions[0].label, 'TRACKED');
});
