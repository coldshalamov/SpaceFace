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

test('Continue rebuilds the tracker panel on every resume branch and re-speaks the live rescue verb', () => {
  const { state, owner } = host('claimed');
  const ob = state.onboarding;
  ob.claimed = { active: true, resolved: false, ids: { patrol: null, pickups: [] }, taken: false };
  owner._resumeMainTutorial = true;
  let panelBuilds = 0;
  let styles = 0;
  owner._injectStyle = () => { styles += 1; };
  owner._buildPanel = () => { panelBuilds += 1; };
  owner._spawnClaimedCast = () => {};
  assert.equal(owner._resumeSavedRail(), true);
  assert.equal(panelBuilds, 1, 'the step strip / Range chip mounts on the claimed resume branch');
  assert.equal(styles, 1);
  assert.equal(ob.claimed.active, true);
  // No rescue verb is current, so the saved main beat's line re-speaks through the one voice.
  assert.equal(owner.spoken.at(-1), ob.beatAction);
});

test('Continue mounts the panel even when only a side rail resumes', () => {
  const { state, owner } = host('thrust');
  const ob = state.onboarding;
  ob.currentBeat = -1; // saved before the main rail ever spoke
  ob.missingThree = {
    active: true, completed: false, current: 'well',
    beats: { well: { state: 'current' } },
  };
  let panelBuilds = 0;
  owner._buildPanel = () => { panelBuilds += 1; };
  const restaged = [];
  owner._startMissingThreeBeat = key => {
    restaged.push(key);
    ob.missingThree.current = key;
  };
  assert.equal(owner._resumeSavedRail(), true);
  assert.deepEqual(restaged, ['well'], 'the current drill beat rewinds and re-stages');
  assert.equal(panelBuilds, 1);
  assert.equal(ob.active, true);
});

test('a raid beat with no live raider restages the lesson instead of waiting forever', () => {
  const { state, owner } = host('raid');
  const ob = state.onboarding;
  ob.raid = { active: true, ids: { raider: null, hauler: null, throwRock: null }, gunKills: 0 };
  let restaged = 0;
  owner._respawnRaidRaider = () => { restaged += 1; };
  owner._resolveRaidDone();
  assert.equal(restaged, 1, 'an empty raider slot restages (Continue wiped the ids)');
  // A dead occupant at the recorded id — a sweep that never emitted entity:killed — restages too.
  state.entities.set(20, { id: 20, alive: false });
  ob.raid.ids.raider = 20;
  owner._resolveRaidDone();
  assert.equal(restaged, 2, 'a dead occupant at the raider slot restages');
  // A resolved beat never restages, no matter the slot state.
  ob.beatDoneAt.raid = 50;
  ob.raid.ids.raider = null;
  owner._resolveRaidDone();
  assert.equal(restaged, 2);
});

test('claimed resolves a taken cargo whose heat never escalated', () => {
  const { state, owner } = host('claimed');
  const ob = state.onboarding;
  ob.claimed = {
    active: true, resolved: false, enteredAt: 0, taken: true, takenAt: 0,
    wantedFired: false, clearSince: null, ids: { patrol: null, pickups: [] },
  };
  owner._beatDone = beat => { ob.beatDoneAt[beat.key] = state.simTime; };
  owner._emitMilestone = () => {};
  state.simTime = 119;
  owner._tickClaimed();
  assert.equal(ob.claimed.resolved, false, 'the stand-down clock honors the full window');
  state.simTime = 121;
  owner._tickClaimed();
  assert.equal(ob.claimed.resolved, true, 'taken cargo with no escalation resolves on the take clock');
  assert.equal(ob.beatDoneAt.claimed, 121);
});

test('claimed re-arms the clear clock from live wanted state after a restore', () => {
  const { state, owner } = host('claimed');
  const ob = state.onboarding;
  ob.claimed = {
    active: true, resolved: false, enteredAt: 0, taken: true, takenAt: 0,
    wantedFired: true, clearSince: null, ids: { patrol: null, pickups: [] },
  };
  owner._beatDone = beat => { ob.beatDoneAt[beat.key] = state.simTime; };
  owner._emitMilestone = () => {};
  state.simTime = 10;
  owner._tickClaimed();
  assert.equal(ob.claimed.clearSince, 10, 'level-0 read re-arms the grace without a heat:changed emit');
  state.simTime = 13;
  owner._tickClaimed();
  assert.equal(ob.claimed.resolved, true);
  assert.equal(ob.beatDoneAt.claimed, 13);
});

test('tether-lesson salvage pods never pre-fill the SAMPLE ore readout', () => {
  const { state, owner } = host('seam');
  const ob = state.onboarding;
  const done = [];
  owner._beatDone = beat => done.push(beat.key);
  owner._recordOreCollected({
    pickupId: 7, collectorId: state.playerId,
    kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 2,
  });
  assert.equal(ob.oreCollected, 2, 'cargo-kind tableau drops are not seam ore');
  owner._recordOreCollected({
    pickupId: 8, collectorId: state.playerId,
    kind: 'ore', commodityId: 'cmdty_ore_ferrite', amount: 1,
  });
  assert.equal(ob.oreCollected, 3, 'real ore still counts toward the seam target');
  assert.deepEqual(done, ['seam']);
});

test('contextual hints deferred under the rail voice replay after it releases', () => {
  const { state, owner } = host('seam');
  const emitted = [];
  owner.bus = { emit: (ev, p) => emitted.push([ev, p]) };
  owner._showHint('firstHub', 'Hubs are the working ports.');
  assert.equal(state.player.hints.firstHub == null, true, 'the rail owns the voice: nothing speaks');
  owner._drainHintQueue();
  assert.equal(state.player.hints.firstHub == null, true, 'still deferred while the rail is active');
  state.onboarding.active = false;
  owner._drainHintQueue();
  assert.equal(state.player.hints.firstHub, true, 'the owed hint lands after the rail releases');
  assert.deepEqual(emitted.map(([ev]) => ev), ['hud:firstUse']);
});

test('a trainer restage leaves the staged power situation standing', () => {
  const { state, owner } = host('marker');
  const removed = [];
  owner.helpers = { removeEntity: id => removed.push(id) };
  const prop = { id: 42, alive: true, data: { powerSituation: 'pull' } };
  state.entities.set(42, prop);
  owner._powerSitIds = [42];
  state.onboarding.powerSit = { next: 1, doneAt: {}, active: { power: 'pull', placedAtS: 0 }, nextAtS: 0 };
  owner._removeTrainingActors();
  assert.equal(prop.alive, true);
  assert.deepEqual(removed, [], 'power-situation props are not training actors');
  assert.deepEqual(owner._powerSitIds, [42], 'the situation record keeps its ids');
  assert.equal(state.onboarding.powerSit.active.power, 'pull');
});

test('a power situation whose props vanished requeues instead of blocking the ladder', () => {
  const { state, owner } = host('marker');
  const ob = state.onboarding;
  state.mode = 'flight'; // the ladder only runs in open flight
  state.entities.set(state.playerId, { id: state.playerId, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  state.simTime = 90;
  ob.powerSit = { next: 1, doneAt: {}, active: { power: 'pull', placedAtS: 80 }, nextAtS: 0 };
  owner._powerSitIds = [42]; // id points at nothing: a Continue wiped the session-local props
  owner._tickPowerSituations(state);
  assert.equal(ob.powerSit.active, null);
  assert.equal(ob.powerSit.next, 0, 'the emptied setup requeues its power');
  assert.equal(ob.powerSit.nextAtS, 102, 'and waits the ordinary gap before re-placing');
});

test('the missing three advance when a scenario slice has no rescue rail', () => {
  const { state, owner } = host('seam');
  const ob = state.onboarding;
  delete ob.rescue; // scenario slices keep no rescue — the spine gate must dissolve
  ob.missingThree = {
    active: true, completed: false, current: null,
    beats: Object.fromEntries(
      ['boost', 'stroke', 'well', 'repulsor', 'cone']
        .map(k => [k, { state: 'pending', fails: 0, doneAt: null }])),
    used: {}, ids: { scrap: null, clump: [], lane: [] },
  };
  owner.bus = { emit: () => {} };
  owner._maybeAdvanceMissingThree();
  assert.equal(ob.missingThree.current, 'boost', 'the drills still owe the pilot their lessons');
});

test('completing the missing three despawns the drill props', () => {
  const { state, owner } = host('seam');
  const ob = state.onboarding;
  const removed = [];
  owner.helpers = { removeEntity: id => removed.push(id) };
  state.entities.set(31, { id: 31, alive: true });
  ob.missingThree = {
    active: true, completed: false, current: null,
    beats: {},
    ids: { scrap: 31, clump: [32], lane: [33] },
  };
  owner.bus = { emit: () => {} };
  owner._missingThreeAllDone();
  assert.equal(ob.missingThree.completed, true);
  assert.equal(ob.missingThree.active, false);
  assert.deepEqual(removed, [31, 32, 33], 'the drill props despawn with the rail');
  assert.equal(ob.missingThree.ids.scrap, null);
  assert.deepEqual(ob.missingThree.ids.clump, []);
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
