import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { ensureCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { spineRoadFrom } from '../src/story/campaign47a/storySpine.js';
import { snapshotEndingFacts } from '../src/story/endings/eligibility.js';
import { createWrittenFinale, normalizeWrittenFinale } from '../src/story/endings/finaleRuntime.js';

for (const outcome of ['cleared_unverified', null, 'exposed']) {
  test(`combat verb is not an evidence verdict (${outcome})`, () => {
    const state = createGameState(8008);
    state.story.branch = 'patrol'; state.story.beatIndex = 7;
    ensureCampaign47aState(state);
    state.story.campaign47a.flags.spine = { v: 1, solved: { 4: { stepId: 'operation', verb: 'clear' } } };
    if (outcome) state.story.flags.weighing_receipt = { version: 1, missionId: 'm_test', at: 500, outcome };
    const before = JSON.stringify(state.story);
    assert.match(spineRoadFrom(state).cite, /Weighing operation cleared/);
    assert.doesNotMatch(spineRoadFrom(state).cite, /unmasked|verified/);
    const facts = snapshotEndingFacts(state);
    const written = createWrittenFinale('E', facts, 'evidence_test');
    const archive = written.beats.find(b => b.evidenceSlot === 'archive');
    assert.match(archive.text, /Weighing operation cleared/);
    assert.doesNotMatch(archive.text, /pack unmasked/);
    const loaded = normalizeWrittenFinale(JSON.parse(JSON.stringify(written)));
    assert.equal(loaded.beats.find(b => b.evidenceSlot === 'archive').text, archive.text);
    assert.equal(JSON.stringify(state.story), before, 'reader does not rewrite earned receipt or spine');
  });
}


import { createBus } from '../src/core/eventBus.js';
import { story as storyPrototype } from '../src/systems/story.js';
import { livingHullWithGraffiti } from '../src/core/livingHull.js';

for (const [name, held, cursor, expected] of [
  ['completed afterword', 'THE RECEIPT IS NOT THE REASON.', 1, 'THE RECEIPT IS NOT THE REASON.'],
  ['later earned writing', 'A LATER MARK.', 1, 'A LATER MARK.'],
  ['played fallback without hull record', null, 1, 'THE RECEIPT IS NOT THE REASON.'],
  ['not yet played', null, 0, null],
]) {
  test(`sector entry and Continue retain ${name}`, () => {
    const state = createGameState(8008), bus = createBus(), messages = [];
    state.story.beatIndex = 7; state.story.endgameResolved = true; state.story.endgameChoice = 'E';
    state.story.writtenFinale = { cursor, beats: [{ kind: 'graffiti', where: 'bulkhead', line: 'THE RECEIPT IS NOT THE REASON.' }] };
    state.entities.set(state.playerId, { data: { livingHull: { graffitiLine: held, graffitiAuthor: null, updatedAtT: 10 } } });
    const story = Object.assign({}, storyPrototype);
    story.state = state; story.bus = bus; story._acknowledgeEndingReturn = () => {};
    const flags = JSON.stringify(state.story);
    bus.on('graffiti:show', p => { if (p.where === 'bulkhead') messages.push(p); });
    story._onSectorEnter({ sectorId: 'sector_charon_expanse' });
    story._onSectorEnter({ sectorId: 'sector_charon_expanse' });
    assert.deepEqual(messages.map(p => p.line), expected ? [expected, expected] : []);
    assert.equal(JSON.stringify(state.story), flags, 'no finale progress or earned story mutation');
    if (held) {
      const before = livingHullWithGraffiti(null, { line: held }, 10);
      assert.deepEqual(livingHullWithGraffiti(before, messages[0], 9000), before, 'resurfacing does not re-date the hull writing');
    }
  });
}
