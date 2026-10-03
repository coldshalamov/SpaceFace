// FB-064 — authored story decisions and Verge evidence events become Chronicler facts.
//
// The story owner already keeps its own row per event in `state.story.facts`; this test proves
// the SAME bus events land in `state.chronicler` as evidence-bearing facts — each carrying the
// source citation (`sourceEvent` + `sourceReceiptId`), grouped into one campaign file, readable
// through recall text, deduped on re-emission, and durable across serialize/deserialize.
//
// Run: node --test test/fb-story-choices-as-facts.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createChronicler } from '../src/systems/chronicler.js';
import { story as storyProto } from '../src/systems/story.js';
import { recallText } from '../src/chronicler/narrative.js';

function cloneSystem(proto) {
  return Object.assign({}, proto);
}

function makeHarness(seed = 4242) {
  const state = createGameState(seed);
  state.simTime = 60;
  state.tick = 3600;
  state.playerId = 1;
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 }, flags: {} });

  const bus = createBus();
  const chronicler = createChronicler();
  const story = cloneSystem(storyProto);
  const ctx = { state, bus, helpers: {}, registry: { get: () => null } };
  chronicler.init(ctx);
  story.init(ctx);
  return { state, bus, chronicler, story };
}

function flush(h) {
  h.chronicler.update(0.016, h.state);
}

function storyFacts(h) {
  return h.state.chronicler.stories
    .flatMap((s) => s.nodes)
    .filter((n) => n.stage === 'story');
}

function storyView(h) {
  flush(h);
  const record = h.state.chronicler.stories.find((s) => s.nodes.some((n) => n.stage === 'story'));
  assert.ok(record, 'a chronicler story holds the campaign file');
  return h.chronicler.getStory(record.id);
}

const CHOICE = {
  encounterId: 'enc_verge_01', shapeId: 'verge_kell',
  choiceId: 'spare_kell', line: 'I let him walk.', t: 60,
};
const VERGE_EVIDENCE = { key: 'kellPaperTrail', source: 'desk:kell', t: 61 };
const KURTZ = {
  rows: [
    { column: 'BENEFICIARY', name: 'VALE, D.', note: 'ADMINISTRATIVE COUNTERPARTY' },
    { column: 'COUNTERPARTY', name: 'ELROY', note: 'DECEASED (B2)' },
  ],
};
const REVOCATION = {
  id: 'gate_deep_reach_revoked', source: 'kell+archive+kurtz',
  subject: 'director_vale', revokedAt: 62, revocationCount: 1,
};

test('FB-064: a recorded player choice becomes a cited Chronicler fact with recall text', () => {
  const h = makeHarness();
  h.bus.emit('story:playerChoiceRecorded', { ...CHOICE });
  flush(h);

  const facts = storyFacts(h);
  assert.equal(facts.length, 1, 'one fact for one choice');
  const fact = facts[0];
  assert.equal(fact.event, 'story:playerChoiceRecorded');
  assert.equal(fact.actor.player, true, 'the player spoke the line');
  assert.equal(fact.details.choiceId, 'spare_kell');
  assert.ok(fact.externalId, 'the fact carries a citation id');

  // The story owner's own row exists alongside — two ledgers, one event.
  const ownRow = h.state.story.facts.find((f) => f.kind === 'choice');
  assert.ok(ownRow, 'state.story.facts still holds the story row');
  assert.equal(fact.externalId, ownRow.id, 'the citation mirrors the story fact id');

  const view = storyView(h);
  const cite = view.evidence.find((e) => e.stage === 'story');
  assert.ok(cite, 'the view carries the evidence row');
  assert.equal(cite.sourceEvent, 'story:playerChoiceRecorded');
  assert.equal(cite.sourceReceiptId, 'choice:enc_verge_01:spare_kell');

  const line = recallText(view, h.state.simTime);
  assert.ok(line && line.includes('I let him walk.'),
    `recall text repeats the recorded words, got: ${line}`);
});

test('FB-064: the Verge evidence trail becomes cited facts in one campaign file', () => {
  const h = makeHarness();
  h.bus.emit('story:vergeEvidenceRecorded', { ...VERGE_EVIDENCE });
  h.bus.emit('story:kurtzLedger', { ...KURTZ });
  h.bus.emit('story:vergeValeGatesRevoked', { ...REVOCATION });
  flush(h);

  const facts = storyFacts(h);
  assert.equal(facts.length, 3, 'three distinct facts — evidence, ledger, revocation');
  assert.deepEqual(
    facts.map((f) => f.details.kind),
    ['verge_evidence', 'kurtz_ledger', 'verge_revocation'],
  );
  // One campaign file: the evidence and revocation share a group.
  assert.ok(facts.every((f) => f.group === 'story:campaign'), 'the Verge trail files together');

  const view = storyView(h);
  const citations = new Set(view.evidence.filter((e) => e.stage === 'story').map((e) => e.sourceReceiptId));
  assert.deepEqual(
    [...citations].sort(),
    ['kurtz:ledger', 'verge:kellPaperTrail', 'verge:revocation:gate_deep_reach_revoked'],
    'each fact carries its own citation',
  );
  const line = recallText(view, h.state.simTime);
  assert.ok(line && /Vale|gates/i.test(line), `recall names the revocation, got: ${line}`);
});

test('FB-064: duplicate emissions are bounded — one citation per fact', () => {
  const h = makeHarness();
  for (let i = 0; i < 3; i++) h.bus.emit('story:playerChoiceRecorded', { ...CHOICE });
  // The ledger emits on every revisit; the chronicle keeps one row.
  h.bus.emit('story:kurtzLedger', { ...KURTZ });
  h.bus.emit('story:kurtzLedger', { ...KURTZ });
  flush(h);

  const facts = storyFacts(h);
  assert.equal(facts.length, 2, 'dedupe collapses repeats into one fact each');
  assert.equal(h.chronicler.diagnostics().duplicates, 3,
    'the repeats count as duplicates, not new facts');
});

test('FB-064: story facts and their dedupe survive serialize/deserialize', () => {
  const h = makeHarness();
  h.bus.emit('story:playerChoiceRecorded', { ...CHOICE });
  h.bus.emit('story:vergeEvidenceRecorded', { ...VERGE_EVIDENCE });
  flush(h);
  assert.equal(storyFacts(h).length, 2);

  const blob = JSON.parse(JSON.stringify(h.chronicler.serialize()));
  const h2 = makeHarness(4242);
  h2.chronicler.deserialize(blob);
  assert.equal(storyFacts(h2).length, 2, 'the archive loads its story facts');

  h2.state.simTime = 200;
  h2.bus.emit('story:playerChoiceRecorded', { ...CHOICE });
  h2.bus.emit('story:vergeEvidenceRecorded', { ...VERGE_EVIDENCE });
  h2.bus.emit('story:kurtzLedger', { ...KURTZ });
  flush(h2);

  const facts = storyFacts(h2);
  assert.equal(facts.length, 3, 're-emitted facts dedupe across the load; only the new ledger fact lands');
  assert.ok(facts.some((f) => f.details.kind === 'kurtz_ledger'));
});
