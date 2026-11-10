// STORY-04: story:postEndingContinuity puts one unfinished objective on the
// mission-log model. A finished continuity record does not put that objective back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { story as storyProto } from '../src/systems/story.js';
import { STORY_BEATS } from '../src/data/missions.js';
import {
  advancePostEndingContinuity,
  createPostEndingContinuity,
  endingDef,
} from '../src/story/endings/index.js';
import {
  missionLogScreen,
  postEndingContinuityObjective,
  recommendedActions,
  storyActionForBeat,
} from '../src/ui/screens/missionLog.js';

function bootStory() {
  const state = createGameState(4242);
  const bus = createBus();
  const story = Object.assign({}, storyProto);
  story.init({
    state,
    bus,
    helpers: { voice: { say: () => true } },
    registry: { get() { return null; } },
  });
  return { state, bus, story };
}

function armContinuity(state) {
  const continuity = createPostEndingContinuity('A', state.simTime || 0, state.meta.seed);
  assert.ok(continuity, 'ending A publishes a continuity record');
  state.story.endgameResolved = true;
  state.story.endgameChoice = continuity.choiceId;
  state.story.postEnding = continuity;
  return continuity;
}

function earnCompletion(record, simTime) {
  const contract = endingDef(record.choiceId).continuity;
  let earned = record;
  let steps = 0;
  while (earned.status !== 'complete') {
    const evidence = { missionId: `mission_log_${steps}` };
    if (contract.missionTypes.length) evidence.type = contract.missionTypes[0];
    const next = advancePostEndingContinuity(
      earned,
      earned.signal,
      evidence,
      simTime + steps + 1,
    );
    assert.equal(next.changed, true, next.reason || 'continuity did not advance');
    earned = next.state;
    steps += 1;
    assert.ok(steps <= contract.target, 'continuity finished within its own target');
  }
  return earned;
}

function beatAction(state) {
  return storyActionForBeat(STORY_BEATS[state.story.beatIndex || 0], state);
}

function recommendedBodies(state, objective) {
  return recommendedActions(state, [], null).filter((action) => action && action.body === objective);
}

test('a published continuity event adds one unfinished objective and drops it when the record is complete', () => {
  const { state, bus, story } = bootStory();
  const published = [];
  bus.on('story:postEndingContinuity', (payload) => published.push(payload));
  const continuity = armContinuity(state);

  const payload = story._publishPostEndingContinuity('resolved');
  assert.equal(published.length, 1);
  assert.equal(published[0], payload);
  assert.equal(state.story.postEnding.seed, state.meta.seed);
  assert.equal(payload.status, state.story.postEnding.status);
  assert.equal(payload.status, 'active');
  assert.equal(payload.objective, state.story.postEnding.objective);
  assert.equal(payload.title, state.story.postEnding.title);

  const row = postEndingContinuityObjective(state);
  assert.ok(row);
  assert.equal(row.body, payload.objective);
  assert.equal(row.title, payload.title);
  assert.equal(row.label.includes(state.story.endgameChoice), true);
  assert.equal(String(row.meta).includes(String(continuity.progress)), true);
  assert.equal(String(row.meta).includes(String(continuity.target)), true);
  assert.equal(recommendedBodies(state, payload.objective).length, 1);
  assert.equal(beatAction(state).body, payload.objective);

  const unfinished = payload.objective;
  state.story.postEnding = earnCompletion(state.story.postEnding, state.simTime || 0);
  const loaded = story._publishPostEndingContinuity('loaded');
  assert.equal(published.length, 2);
  assert.equal(loaded.status, 'complete');
  assert.equal(loaded.status, state.story.postEnding.status);
  assert.equal(postEndingContinuityObjective(state), null);
  assert.equal(recommendedBodies(state, unfinished).length, 0);
  assert.notEqual(beatAction(state) && beatAction(state).body, unfinished);
});

test('an open log refreshes from current state and ignores a stale continuity payload', () => {
  const { state, bus } = bootStory();
  const continuity = armContinuity(state);
  const open = Object.assign({}, missionLogScreen, {
    _subbed: false,
    _ctx: { bus, state },
    _visible() { return true; },
    renders: 0,
    _render() { this.renders += 1; },
  });
  const shut = Object.assign({}, missionLogScreen, {
    _subbed: false,
    _ctx: { bus, state },
    _visible() { return false; },
    renders: 0,
    _render() { this.renders += 1; },
  });
  open._subscribe();
  shut._subscribe();

  bus.emit('story:postEndingContinuity', {
    objective: continuity.objective,
    title: continuity.title,
    status: 'active',
  });
  assert.equal(open.renders, 1);
  assert.equal(shut.renders, 0);
  assert.equal(postEndingContinuityObjective(state).body, continuity.objective);

  const earned = earnCompletion(state.story.postEnding, state.simTime || 0);
  state.story.postEnding = earned;
  const before = state.story.postEnding;
  bus.emit('story:postEndingContinuity', {
    objective: continuity.objective,
    title: continuity.title,
    status: 'active',
  });
  assert.equal(open.renders, 2);
  assert.equal(shut.renders, 0);
  assert.equal(state.story.postEnding, before);
  assert.equal(state.story.postEnding.status, 'complete');
  assert.equal(postEndingContinuityObjective(state), null);
});
