import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createEncounterChoicePrompt } from '../src/ui/encounterChoicePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

// The encounter adapter's contract is its event→deck mapping: normalize an offer into ONE deck
// decision, emit exactly one `encounter:choose` through the deck verb, and resolve the frame the
// moment the choice is submitted. Ladder placement, digit fencing and the input fence are the
// deck's own contracts (test/prompt-deck.test.mjs pins those; the browser harness sees them live).

test('encounter adapter normalizes the offer into one deck decision and emits exactly one choice', () => {
  const bus = createBus();
  const chosen = [];
  bus.on('encounter:choose', (payload) => chosen.push(payload));
  const deck = fakeDeck();
  setPromptDeck(deck);
  const prompt = createEncounterChoicePrompt({ state: { mode: 'flight', ui: {} }, bus });

  bus.emit('encounter:choiceOffered', {
    encounterId: 'e1:h1', kind: 'depth_h1_distress_from_inside', title: 'THE DISTRESS FROM INSIDE',
    options: [
      { id: 'listen', label: 'Listen', available: true },
      { id: 'board', label: 'Board the wreck', available: true },
      { id: 'leave', label: 'Leave quietly', available: false },
    ],
    deadlineAt: 45,
  });

  assert.equal(deck.offers.length, 1);
  const spec = deck.offers[0].spec;
  assert.equal(spec.id, 'encounter:e1:h1');
  assert.equal(spec.headline, 'THE DISTRESS FROM INSIDE');
  assert.equal(spec.deadlineAt, 45);
  assert.equal(spec.choices.length, 3);
  assert.equal(spec.choices[2].disabled, true, 'the unavailable option is offered but disabled');
  assert.equal(spec.choices[2].label, 'Leave quietly');

  spec.onChoose('listen', 'test');
  assert.deepEqual(chosen, [{ encounterId: 'e1:h1', choiceId: 'listen', source: 'test' }]);
  assert.ok(deck.resolved.includes('encounter:e1:h1'),
    'a submitted response immediately clears its decision surface');
  prompt.destroy();
});

test('encounter adapter resolve events tear down the decision without emitting a choice', () => {
  const bus = createBus();
  const chosen = [];
  bus.on('encounter:choose', (payload) => chosen.push(payload));
  const deck = fakeDeck();
  setPromptDeck(deck);
  const prompt = createEncounterChoicePrompt({ state: { mode: 'flight', ui: {} }, bus });

  bus.emit('encounter:choiceOffered', {
    encounterId: 'e1:h6', title: 'PATROL AMBUSH',
    options: [
      { id: 'concord', label: 'Aid Concord', available: true },
      { id: 'reach', label: 'Aid Reach', available: true },
    ],
  });
  assert.equal(deck.offers.length, 1);

  bus.emit('encounter:resolved', { encounterId: 'e1:h6' });
  assert.ok(deck.resolved.includes('encounter:e1:h6'));
  assert.deepEqual(chosen, [], 'a resolution is not a choice');
  assert.equal(deck.offers.length, 1, 'a resolution does not re-offer');

  prompt.destroy();
});

test('encounter adapter rejects malformed offers, inert without a deck, cleans listeners', () => {
  const bus = createBus();
  const chosen = [];
  bus.on('encounter:choose', (payload) => chosen.push(payload));
  const deck = fakeDeck();
  setPromptDeck(deck);
  const prompt = createEncounterChoicePrompt({ state: { mode: 'flight', ui: {} }, bus });

  bus.emit('encounter:choiceOffered', { encounterId: 'e1:x' });
  bus.emit('encounter:choiceOffered', { options: [{ id: 'a', label: 'A' }] });
  assert.equal(deck.offers.length, 0, 'an offer without options or id is not a decision');

  const offer = {
    encounterId: 'e1:h4', title: 'THE LOVE LETTER BUOY',
    options: [{ id: 'reseed', label: 'Re-seed on the grave route', available: true }],
  };
  bus.emit('encounter:choiceOffered', offer);
  assert.equal(deck.offers.length, 1);

  prompt.destroy();
  bus.emit('encounter:choiceOffered', { ...offer, encounterId: 'after-destroy' });
  assert.equal(deck.offers.length, 1, 'destroyed adapters stop listening');
  assert.deepEqual(chosen, []);

  // Headless inertness: with no live deck the adapter must not throw and must not emit.
  setPromptDeck(null);
  const inert = createEncounterChoicePrompt({ state: { mode: 'flight', ui: {} }, bus });
  bus.emit('encounter:choiceOffered', { ...offer, encounterId: 'no-deck' });
  assert.deepEqual(chosen, []);
  inert.destroy();
});

function fakeDeck() {
  const deck = { offers: [], updates: [], resolved: [] };
  const byId = new Map();
  deck.offerDecision = (spec) => { deck.offers.push({ spec }); byId.set(spec.id, spec); return true; };
  deck.updateDecision = (id, patch) => {
    deck.updates.push({ id, patch });
    const spec = byId.get(id);
    if (spec) Object.assign(spec, patch);
    return !!spec;
  };
  deck.resolveDecision = (id) => {
    if (!byId.has(id)) return false;
    byId.delete(id);
    deck.resolved.push(id);
    return true;
  };
  deck.hasDecision = (id) => byId.has(id);
  return deck;
}
