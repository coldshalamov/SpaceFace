import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { onboarding, BEATS, taughtVerbLine } from '../src/systems/onboarding.js';

function host(beatKey, done = false) {
  const state = createGameState(113);
  const owner = Object.create(onboarding);
  owner.state = state;
  const currentBeat = BEATS.findIndex(beat => beat.key === beatKey);
  state.onboarding = { active: true, finished: false, currentBeat,
    beatDoneAt: done ? { [beatKey]: 80 } : {}, firedFollowups: {}, trainingOre: 2, oreCollected: 2,
    rescue: { completed: true }, missingThree: { completed: true } };
  owner.entered = [];
  owner.spoken = [];
  owner._enterBeat = beat => owner.entered.push(beat.key);
  owner._sayTutorial = text => owner.spoken.push(text);
  owner._refreshBeatPanel = () => {};
  owner._injectStyle = () => {};
  owner._buildPanel = () => {};
  return { state, owner };
}

test('Continue retains an unfinished main mining lesson after the side rails finish', () => {
  const { owner } = host('seam');
  const record = owner.serialize();
  assert.ok(record, 'the active main lesson must have a save record');
  const restored = host('thrust');
  restored.owner.deserialize(JSON.parse(JSON.stringify(record)));
  restored.state.onboarding.active = false; // save:loaded teardown
  assert.equal(restored.owner._resumeSavedRail(), true);
  assert.equal(restored.state.onboarding.active, true);
  assert.equal(restored.state.onboarding.trainingOre, 2);
  assert.deepEqual(restored.owner.entered, ['seam']);
  assert.equal(restored.owner.spoken.at(-1),
    taughtVerbLine(restored.state, 'seam', BEATS.find(beat => beat.key === 'seam').line));
});

test('Continue restages every overlapping unfinished lesson and rewinds the lost tether', () => {
  const { state, owner } = host('raid');
  const ob = state.onboarding;
  ob.rescue = {
    active: true, completed: false, current: 'shove',
    beats: { shove: { state: 'current' } },
    rockLatched: true, rockReeled: true, rockReleasedAfterReel: true,
    podLatched: true, shoveShots: 3,
  };
  ob.raid = { active: true, ids: { raider: 20 }, gunKills: 1 };
  ob.claimed = { active: true, resolved: false, ids: { pickups: [21] }, taken: false };
  ob.missingThree = {
    active: true, completed: false, current: 'boost',
    beats: { boost: { state: 'current' } },
  };
  owner._resumeMainTutorial = true;
  const restaged = [];
  owner._spawnRescueCast = () => restaged.push('rescue');
  owner._spawnRaidCast = () => restaged.push('raid');
  owner._spawnClaimedCast = () => restaged.push('claimed');
  owner._startMissingThreeBeat = key => {
    restaged.push(`missingThree:${key}`);
    ob.missingThree.current = key;
    ob.missingThree.beats[key].state = 'current';
  };

  assert.equal(owner._resumeSavedRail(), true);
  assert.deepEqual(restaged, ['rescue', 'raid', 'claimed', 'missingThree:boost']);
  assert.equal(ob.active, true);
  assert.equal(ob.rescue.rockLatched, false);
  assert.equal(ob.rescue.rockReeled, false);
  assert.equal(ob.rescue.rockReleasedAfterReel, false);
  assert.equal(ob.rescue.podLatched, false);
  assert.equal(ob.rescue.shoveShots, 0);
  assert.equal(ob.raid.active, true);
  assert.equal(ob.claimed.active, true);
  assert.equal(ob.missingThree.beats.boost.state, 'current');
  assert.equal(owner.entered.includes('raid'), false,
    'the current beat must not rebuild over its already-restaged side-rail record');
});

test('a completed main beat waits for its successor rather than restaging its reward', () => {
  const { owner } = host('tether', true);
  const record = owner.serialize();
  assert.ok(record);
  const restored = host('thrust');
  restored.owner.deserialize(record);
  restored.state.onboarding.active = false;
  assert.equal(restored.owner._resumeSavedRail(), true);
  assert.deepEqual(restored.owner.entered, []);
  assert.deepEqual(restored.owner.spoken, []);
});

test('completed tutorials still hand Continue to the returning-pilot route', () => {
  const { state, owner } = host('choice', true);
  state.onboarding.finished = true;
  state.onboarding.active = false;
  assert.equal(owner.serialize(), null);
  assert.equal(owner._resumeSavedRail(), false);
});

test('Continue respects tutorial opt-out even when an unfinished rail was saved', () => {
  const record = host('seam').owner.serialize();
  const restored = host('thrust');
  restored.state.settings.gameplay.tutorialHints = false;
  restored.owner.deserialize(record);
  restored.state.onboarding.active = false;
  assert.equal(restored.owner._resumeSavedRail(), false);
  assert.deepEqual(restored.owner.entered, []);
});
