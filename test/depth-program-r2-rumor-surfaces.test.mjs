import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import { buildReply, generateContacts } from '../src/ui/station/barContacts.js';
import { uniqueWreckBarRumor } from '../src/ui/uniqueWreckRumorSurface.js';

const BAR_CASES = Object.freeze([
  ['station_sker', 'wreck_nestbreaker', 'bar.sker.nestbreaker'],
  ['station_haumea_rift', 'wreck_deepsurvey', 'bar.rift_observatory.deepsurvey'],
  ['station_reach', 'wreck_smokesong', 'bar.io_mercenary.smokesong'],
  ['station_helios', 'wreck_mts_silver_draft', 'bar.helios_meridian.silver_draft'],
]);

function stateWithBearings(bearings = {}) {
  return { player: { uniqueWrecks: { bearings } } };
}

function exactSourceText(sourceRef) {
  return FLAVOR_SOURCE_BY_REF[sourceRef].lines.map((line) => line.text).join(' ');
}

test('bar rumors reveal no wreck knowledge until the player deliberately asks', () => {
  for (const [stationId] of BAR_CASES) {
    const state = stateWithBearings();
    const before = structuredClone(state);
    assert.equal(uniqueWreckBarRumor(state, stationId, 'drink'), null);
    assert.equal(uniqueWreckBarRumor(state, stationId, 'work'), null);
    assert.equal(uniqueWreckBarRumor(state, stationId, null), null);
    assert.deepEqual(state, before, 'the pure carrier cannot mutate map knowledge');
  }
  assert.equal(uniqueWreckBarRumor(stateWithBearings(), 'station_unknown', 'rumors'), null);
});

test('the four bar carriers return their exact V2 source only for the rumor choice', () => {
  for (const [stationId, wreckId, sourceRef] of BAR_CASES) {
    const rumor = uniqueWreckBarRumor(stateWithBearings(), stationId, 'rumors');
    assert.deepEqual(rumor, {
      wreckId,
      sourceRef,
      channelId: 'bar',
      text: exactSourceText(sourceRef),
    });
    assert.equal(Object.isFrozen(rumor), true);
  }
});

test('a previously read bar rumor cannot be sold or surfaced twice', () => {
  for (const [stationId, wreckId] of BAR_CASES) {
    const state = stateWithBearings({ [wreckId]: { wreckId, phase: 'rumored' } });
    assert.equal(uniqueWreckBarRumor(state, stationId, 'rumors'), null);
  }
});

test('Sker canonical barkeep yields once to the authored wreck lead, then resumes canonical voice', () => {
  const state = createGameState(47);
  const contact = generateContacts('station_sker', state).find((entry) => entry.role === 'barkeep');
  assert.ok(contact && contact.canonicalKey === 'quinn', 'Sker must exercise canonical reply precedence');

  const first = buildReply(contact.role, 'rumors', { state }, 'station_sker', contact);
  assert.deepEqual(first.uniqueWreckRumor, uniqueWreckBarRumor(state, 'station_sker', 'rumors'));
  assert.equal(first.text, exactSourceText('bar.sker.nestbreaker'));

  state.player.uniqueWrecks = {
    bearings: { wreck_nestbreaker: { wreckId: 'wreck_nestbreaker', phase: 'rumored' } },
  };
  const repeated = buildReply(contact.role, 'rumors', { state }, 'station_sker', contact);
  assert.equal(repeated.uniqueWreckRumor, undefined, 'recorded bearing must suppress duplicate rumor copy');
  assert.notEqual(repeated.text, first.text, 'canonical Quinn dialogue resumes after the one-shot lead');
});

test('the live Bar bridge emits the durable rumor receipt only after a returned rumor', () => {
  const source = readFileSync(new URL('../src/ui/station/screens/bar.js', import.meta.url), 'utf8');
  assert.match(source, /let result = null;[\s\S]*result = buildReply[\s\S]*if \(result && result\.uniqueWreckRumor && ctx\.bus\) ctx\.bus\.emit\('uniqueWreck:rumorHeard', result\.uniqueWreckRumor\)/);
});

test('a settled unique-wreck receipt cannot leave its obsolete choice buttons visible', () => {
  // The 2026-09-18 refactor (recovery adapter -> src/ui/promptDeck.js) retired the hand-rolled
  // `.sf-recovery__actions[hidden]` card entirely; there is no longer any CSS in
  // recoveryEncounterPrompt.js to guard. The deck now owns hiding: a settled receipt retires its
  // decision through resolveDecision, and the deck's remove() makes the card's buttons inert
  // (pointer-events: none) immediately, then deletes the frame from the DOM outright rather than
  // leaving it hidden by CSS.
  const adapterSource = readFileSync(new URL('../src/ui/recoveryEncounterPrompt.js', import.meta.url), 'utf8');
  assert.match(
    adapterSource,
    /showUniqueReceipt = \(payload\) => \{[\s\S]*?deck\.resolveDecision\(ID_UNIQUE_WRECK\);[\s\S]*?if \(!receipt \|\| !canSurface\(\)\) return false;/,
    'a unique-wreck receipt must resolve (retire) its deck decision before the canSurface/no-receipt gate, so a docked or receiptless settle still retires the obsolete card',
  );

  const deckSource = readFileSync(new URL('../src/ui/promptDeck.js', import.meta.url), 'utf8');
  assert.match(
    deckSource,
    /function remove\(id\)[\s\S]*?frame\.style\.pointerEvents = 'none';[\s\S]*?frame\.remove\(\);/,
    'a resolved decision must be made unclickable immediately and removed from the DOM, not merely hidden with CSS',
  );
});
