/**
 * The spine speaks the vocabulary the live Book 1/2 contracts actually emit.
 * Run: node --test test/story-spine-live-vocabulary.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  ensureCampaign47aState,
  failEncounter,
  recordBeatStep,
} from '../src/story/campaign47a/index.js';
import {
  methodFromPayload,
  readSpine,
  spineGreeting,
  spineRoadFrom,
} from '../src/story/campaign47a/storySpine.js';
import { reckoningCallbacks } from '../src/story/campaign47a/reckoningCallbacks.js';

function fresh(beatIndex, branch = null) {
  const state = createGameState(4242);
  state.simTime = 100;
  state.story.beatIndex = beatIndex;
  state.story.branch = branch;
  ensureCampaign47aState(state);
  return state;
}

function step(state, signal, payload) {
  const out = recordBeatStep(state, signal, payload, state.simTime);
  assert.equal(out.ok, true, `${signal} ${JSON.stringify(payload)} -> ${out.reason}`);
  return out;
}

const solved = (state, beat) => readSpine(state).solved[String(beat)];

test('methodFromPayload names the live Book 1/2 pairs and still the retired ones', () => {
  for (const [beat, method] of [
    [1, 'sealed_delivery'], [1, 'partial_settle'], [1, 'mites_then_furnace'], [1, 'furnace_then_mites'],
    [2, 'clear_and_tow'], [2, 'tow_under_fire'], [2, 'terminal_register_kill'], [2, 'custody_reel'],
    [1, 'cut_down'], [2, 'corridor_pull'], [3, 'tow_in'],
  ]) {
    assert.equal(methodFromPayload({ completionMethod: method }, beat, null), method, `${beat}:${method}`);
  }
  // A method from another beat's vocabulary is still refused.
  assert.equal(methodFromPayload({ completionMethod: 'clear_and_tow' }, 1, null), null);
  assert.equal(methodFromPayload({ completionMethod: 'sealed_delivery' }, 2, null), null);
  assert.equal(methodFromPayload({ failedMethod: 'custody_reel' }, 2, null), 'custody_reel');
});

test('Book 1 route files the played verb and method, and the Ashfall plate callback fires', () => {
  const state = fresh(1);
  step(state, 'mission:completed', { storyTag: 'campaign47a:b1:alloy_run', physicalVerb: 'weigh', completionMethod: 'sealed_delivery' });
  assert.deepEqual(
    { verb: solved(state, 1).verb, method: solved(state, 1).method, stepId: solved(state, 1).stepId },
    { verb: 'weigh', method: 'sealed_delivery', stepId: 'alloy_run' },
  );
  assert.deepEqual(reckoningCallbacks(state), [], 'weighing alone is not the furnace');
  step(state, 'kesslerPod:weighed', { variance: true, physicalVerb: 'weigh' });
  step(state, 'mission:completed', { storyTag: 'campaign47a:b1:infested', physicalVerb: 'burn', completionMethod: 'mites_then_furnace' });
  const row = solved(state, 1);
  assert.equal(row.verb, 'burn');
  assert.equal(row.method, 'mites_then_furnace');
  assert.equal(row.stepId, 'infested');
  const rows = reckoningCallbacks(state);
  assert.deepEqual(rows.map((r) => r.id), ['b1_cut']);
  assert.equal(rows[0].kind, 'plate');
  const log = state.story.campaign47a.choiceLog.filter((r) => r.kind === 'spine_solved' && r.beat === 1);
  assert.ok(log.some((r) => r.method === 'mites_then_furnace' && r.verb === 'burn'));
  assert.match(spineRoadFrom(state).cite, /hauler fed to the furnace/);
});

test('retired knock methods still map to the retired callbacks', () => {
  const cut = fresh(1);
  cut.story.campaign47a.flags.spine = { v: 1, solved: { 1: { method: 'cut_down' } } };
  assert.deepEqual(reckoningCallbacks(cut).map((r) => r.id), ['b1_cut']);
  const ram = fresh(1);
  ram.story.campaign47a.flags.spine = { v: 1, solved: { 1: { method: 'wrecking_ball' } } };
  assert.deepEqual(reckoningCallbacks(ram).map((r) => r.id), ['b1_ram']);
});

test('Book 2 route files the hunt, and Mara greets by it', () => {
  const state = fresh(2);
  assert.equal(spineGreeting('contact_mara_children', state), null, 'nothing played yet');
  step(state, 'mission:completed', { storyTag: 'campaign47a:b2:cinder', physicalVerb: 'hunt', completionMethod: 'clear_and_tow' });
  assert.equal(solved(state, 2).method, 'clear_and_tow');
  // Compost and the Nest take verified world receipts; their own gates are covered elsewhere.
  state.story.campaign47a.stepProgress['2'].completed.push('compost', 'nest');
  step(state, 'mission:completed', { storyTag: 'campaign47a:b2:elroy', physicalVerb: 'hunt', completionMethod: 'custody_reel' });
  assert.equal(solved(state, 2).method, 'custody_reel');
  assert.equal(solved(state, 2).stepId, 'elroy');
  const line = spineGreeting('contact_mara_children', state);
  assert.equal(line, 'You reeled the mark in whole. Three of us still wait.');
  const plain = fresh(2);
  plain.story.campaign47a.flags.spine = { v: 1, solved: { 2: { verb: 'hunt', stepId: 'elroy' } } };
  assert.equal(spineGreeting('contact_mara_children', plain), 'You answered the writ. Three of us still wait.');
  const old = fresh(2);
  old.story.campaign47a.flags.spine = { v: 1, solved: { 2: { method: 'stage_tow', verb: 'pull' } } };
  assert.equal(spineGreeting('contact_mara_children', old), 'You towed them in. Three of us still wait.');
});

test('a Book 1 miss files a live ask and does not talk about a tower', () => {
  const state = fresh(1);
  failEncounter(state, 'mission_failed', 100, { encounterId: 'm1', failedMethod: 'sealed_delivery' });
  const sit = readSpine(state).situation;
  assert.equal(sit.beat, 1);
  assert.equal(sit.failedMethod, 'sealed_delivery');
  assert.equal(sit.closedMethod, 'sealed_delivery');
  assert.equal(sit.openMethod, 'partial_settle');
  assert.equal(sit.askId, 'b1_a1_sealed_delivery');
  assert.doesNotMatch(spineGreeting('contact_maera_vols', state) || '', /tower/i);
  assert.match(spineGreeting('contact_halev_doss', state), /^Filed: a miss/);

  const bare = fresh(1);
  failEncounter(bare, 'mission_failed', 100, { encounterId: 'm2' });
  assert.equal(readSpine(bare).situation.closedMethod, null);
  assert.equal(spineGreeting('contact_maera_vols', bare), 'The honest work came up short. It is still yours.');
});

function furnaceRun(state) {
  state.story.campaign47a.flags.spine = {
    v: 1,
    solved: { 1: { verb: 'burn', method: 'mites_then_furnace', stepId: 'infested', atS: 5 } },
    closed: [{ beat: 1, attempt: 1, reason: 'x', askId: 'b1_a1_scar', instruction: 'Miss.' }],
  };
}

test('door and R-07 are not shadowed by the persistent furnace row or by a closed miss', () => {
  const state = fresh(5, 'patrol');
  furnaceRun(state);
  state.morrow = { met: true, destroyed: false, launches: 0, visits: 1 };
  assert.equal(spineGreeting('contact_maera_vols', state), 'You took the patrol door. I kept the others.');
  assert.equal(spineGreeting('contact_halev_doss', state), 'Filed: the patrol door. Grain and free refused.');
  assert.equal(spineGreeting('contact_dustwife_senna', state), 'I wrote the door. The dark kept the rest.');
  assert.equal(spineGreeting('contact_yune', state), 'Your door is sealed. The fee still stands.');
  assert.equal(spineGreeting('contact_orrin', state), 'The audit names your patrol. Clean enough.');

  // With no door taken, the filed furnace row still leads — R-07 speaks only when
  // nothing fresher is on file (matching the long-standing greeting order).
  const earlier = fresh(2, null);
  furnaceRun(earlier);
  earlier.morrow = { met: true, destroyed: false, launches: 0, visits: 1 };
  assert.equal(spineGreeting('contact_maera_vols', earlier), 'You fed the hauler to the furnace.');
  assert.equal(spineGreeting('contact_halev_doss', earlier), 'Filed: a miss, then the furnace.');

  const furnaceOnly = fresh(2, null);
  furnaceOnly.story.campaign47a.flags.spine = { v: 1, solved: { 1: { verb: 'burn', stepId: 'infested' } } };
  assert.equal(spineGreeting('contact_maera_vols', furnaceOnly), 'You fed the hauler to the furnace.');
  assert.equal(spineGreeting('contact_halev_doss', furnaceOnly), 'Filed: the furnace. The scale still lies.');
});

test('the filed ending names the door before the furnace, and the furnace when no door was taken', () => {
  const state = fresh(7, 'traders');
  furnaceRun(state);
  state.story.endgameChoice = 'ending_a';
  assert.equal(spineGreeting('contact_maera_vols', state), 'You took the grain door. I watched you file and leave.');
  assert.equal(spineGreeting('contact_halev_doss', state), 'Filed: the grain door, then the disposition.');
  const bare = fresh(7, null);
  bare.story.campaign47a.flags.spine = { v: 1, solved: { 1: { verb: 'burn', stepId: 'infested' } } };
  bare.story.endgameChoice = 'ending_a';
  assert.equal(spineGreeting('contact_maera_vols', bare), 'You fed the furnace. I watched you file and leave.');
  assert.equal(spineGreeting('contact_halev_doss', bare), 'Filed: the furnace, then the disposition.');
});

test('every spoken line stays inside twelve words', () => {
  const state = fresh(5, 'patrol');
  furnaceRun(state);
  state.story.campaign47a.flags.spine.solved['2'] = { verb: 'hunt', method: 'terminal_register_kill', stepId: 'elroy' };
  for (const id of ['contact_maera_vols', 'contact_halev_doss', 'contact_mara_children', 'contact_dustwife_senna',
    'contact_orrin', 'contact_yune']) {
    const line = spineGreeting(id, state);
    assert.ok(line, `${id} speaks`);
    assert.ok(line.split(/\s+/).length <= 12, line);
  }
});
