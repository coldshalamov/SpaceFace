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
  const source = readFileSync(new URL('../src/ui/recoveryEncounterPrompt.js', import.meta.url), 'utf8');
  assert.match(source, /\.sf-recovery__actions\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/,
    'component CSS must let the hidden attribute win over the actions flex rule');
});
