import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN } from '../src/story/endings/endingDefs.js';
import { isChoiceECourierReady } from '../src/story/endings/eligibility.js';
import { story as storyPrototype } from '../src/systems/story.js';
import { buildReply, generateContacts, getChoices } from '../src/ui/screens/bar.js';

const ASHCACHE = 'station_ashcache';

function makeHarness(seed = 4720) {
  const state = createGameState(seed);
  state.mode = 'station';
  state.simTime = 1400;
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.ownedShips = [{ defId: 'ship_bastion' }];
  state.factions.faction_mts = { rep: ENDGAME_REP_MIN, aggro: false };
  state.story.beatIndex = 7;
  state.story.branch = 'traders';
  state.story.flags = {
    endgame: true,
    deep_reach_operation_complete: true,
    ashfall_visited: true,
    deep_reach_ashfall_docked: true,
    kurtz_desk_opened: true,
  };
  state.story.endgameOffered = true;
  state.story.endgameChoice = null;
  state.story.endgameResolved = false;
  state.story.endgameDeclined = ['A', 'B', 'C', 'D'];
  state.story.endgamePending = null;
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.ui.dockedStationId = ASHCACHE;
  state.claims = { bodies: [{ id: 'claim_choice_e' }] };

  const bus = createBus();
  const story = Object.assign({}, storyPrototype);
  const missions = {
    postEndgameDispositionOffers() { return false; },
    clearEndgameDispositionOffers() { return false; },
  };
  const registry = { get: (name) => (name === 'story' ? story : (name === 'missions' ? missions : null)) };
  const events = [];
  for (const name of ['economy:grantCredits', 'endgame:chosen']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  story.init({ state, bus, registry, helpers: { voice: { say: () => true } } });
  return { state, bus, story, events, ctx: { state, bus, registry } };
}

test('declining A-D adds the authored courier as the first Ash Cache contact', () => {
  const h = makeHarness();
  assert.equal(isChoiceECourierReady(h.state, ASHCACHE), true);
  assert.equal(isChoiceECourierReady(h.state, 'station_helios'), false);

  const contacts = generateContacts(ASHCACHE, h.state);
  const courier = contacts[0];
  assert.equal(courier.id, 'contact_ashcache_next_run_courier');
  assert.equal(courier.line, "Contract settled. New one's open.");
  assert.deepEqual(getChoices(courier.role, courier).map((choice) => choice.id), [
    'accept_next_run', 'not_yet',
  ]);
});

test('not yet leaves the physical courier offer available without declining another ending', () => {
  const h = makeHarness(4721);
  const courier = generateContacts(ASHCACHE, h.state)[0];
  const result = buildReply(courier.role, 'not_yet', h.ctx, ASHCACHE, courier);

  assert.match(result.text, /stays open/i);
  assert.deepEqual(h.state.story.endgameDeclined, ['A', 'B', 'C', 'D']);
  assert.equal(h.state.story.endgameChoice, null);
  assert.equal(isChoiceECourierReady(h.state, ASHCACHE), true);
});

test('accepting the courier files E, pays 47-A once, and opens 47-B without resetting the world', () => {
  const h = makeHarness(4722);
  const sectorBefore = h.state.world.currentSectorId;
  const courier = generateContacts(ASHCACHE, h.state)[0];
  const result = buildReply(courier.role, 'accept_next_run', h.ctx, ASHCACHE, courier);

  assert.equal(result.endgameResolved, true);
  assert.equal(h.state.story.endgameChoice, 'E');
  assert.equal(h.state.story.endgameResolved, true);
  assert.equal(h.state.story.flags.contract47bPending, true);
  assert.equal(h.state.world.currentSectorId, sectorBefore);
  assert.deepEqual(h.events.filter((event) => event.name === 'economy:grantCredits').map((event) => event.payload.amount), [1200]);
  assert.equal(h.events.filter((event) => event.name === 'endgame:chosen').length, 1);
  assert.equal(isChoiceECourierReady(h.state, ASHCACHE), false);
  assert.notEqual(generateContacts(ASHCACHE, h.state)[0].id, courier.id);

  buildReply(courier.role, 'accept_next_run', h.ctx, ASHCACHE, courier);
  assert.deepEqual(h.events.filter((event) => event.name === 'economy:grantCredits').map((event) => event.payload.amount), [1200]);
});
