import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN } from '../src/story/endings/endingDefs.js';
import { story as storyPrototype } from '../src/systems/story.js';
import { world as worldPrototype } from '../src/systems/world.js';

const ASHFALL = 'sector_ashfall_reach';
const CHARON = 'sector_charon_expanse';

function cloneSystem(prototype) {
  return Object.assign({}, prototype);
}

function makeHarness(seed = 4710) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 1200;
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.ownedShips = [{ defId: 'ship_bastion' }];
  state.player.cargo = {
    items: { cmdty_personal_ledger: 1 },
    usedVolume: 1,
    usedMass: 0.4,
    capVolume: 80,
    capMass: 200,
  };
  state.factions.faction_mts = { rep: ENDGAME_REP_MIN, aggro: false };
  state.story.beatIndex = 7;
  state.story.branch = 'traders';
  state.story.flags = {
    endgame: true,
    hasLedger: true,
    deep_reach_operation_complete: true,
    ashfall_visited: true,
    deep_reach_ashfall_docked: true,
    kurtz_desk_opened: true,
  };
  state.story.endgameOffered = true;
  state.story.endgameChoice = null;
  state.story.endgameResolved = false;
  state.story.endgameDeclined = [];
  state.story.endgamePending = null;
  state.world.currentSectorId = ASHFALL;
  state.missions.active = [];
  state.claims = { bodies: [{ id: 'claim_choice_d' }] };

  const bus = createBus();
  const world = cloneSystem(worldPrototype);
  const story = cloneSystem(storyPrototype);
  const missions = {
    postEndgameDispositionOffers() { return false; },
    clearEndgameDispositionOffers() { return false; },
  };
  const registry = {
    get(name) {
      if (name === 'world') return world;
      if (name === 'story') return story;
      if (name === 'missions') return missions;
      return null;
    },
  };
  const events = [];
  for (const name of ['endgame:promptChoiceD', 'endgame:chosen', 'jump:chargeStart']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  const ctx = { state, bus, registry, helpers: { voice: { say: () => true } } };
  world.init(ctx);
  story.init(ctx);
  return { state, bus, world, story, events };
}

test('ledger holder departure is deferred before jump state until the physical decision', () => {
  const h = makeHarness();
  h.bus.emit('world:requestJump', { targetSectorId: CHARON, via: 'gate' });

  assert.equal(h.state.jump.state, 'IDLE', 'departure cannot advance underneath the prompt');
  assert.equal(h.events.filter((event) => event.name === 'jump:chargeStart').length, 0);
  const prompt = h.events.find((event) => event.name === 'endgame:promptChoiceD');
  assert.ok(prompt);
  assert.equal(prompt.payload.promptText, 'DEPART ASHFALL REACH?');
  assert.equal(prompt.payload.targetSectorId, CHARON);
  assert.equal(prompt.payload.via, 'gate');
});

test('Yes declines Choice D and resubmits the same validated departure once', () => {
  const h = makeHarness(4711);
  h.bus.emit('world:requestJump', { targetSectorId: CHARON, via: 'gate' });
  h.bus.emit('ui:endgameDepartAshfall', { targetSectorId: CHARON, via: 'gate' });

  assert.ok(h.state.story.endgameDeclined.includes('D'));
  assert.equal(h.state.story.endgameChoice, null);
  assert.equal(h.state.story.endgameResolved, false);
  assert.equal(h.state.jump.state, 'CHARGING');
  assert.equal(h.state.jump.targetSectorId, CHARON);
  assert.equal(h.events.filter((event) => event.name === 'endgame:promptChoiceD').length, 1,
    'the resubmitted departure must not reopen the declined choice');
  assert.equal(h.events.filter((event) => event.name === 'jump:chargeStart').length, 1);
});

test('No files Choice D and leaves the player stationary in Ashfall', () => {
  const h = makeHarness(4712);
  h.bus.emit('world:requestJump', { targetSectorId: CHARON, via: 'gate' });
  h.bus.emit('ui:endgameStayAshfall');

  assert.equal(h.state.story.endgameChoice, 'D');
  assert.equal(h.state.story.endgameResolved, true);
  assert.equal(h.state.story.flags.stayedAtAshfall, true);
  assert.equal(h.state.world.currentSectorId, ASHFALL);
  assert.equal(h.state.jump.state, 'IDLE');
  assert.equal(h.events.filter((event) => event.name === 'jump:chargeStart').length, 0);
  assert.ok(h.events.some((event) => event.name === 'endgame:chosen'
    && event.payload.choice === 'D'));
});

test('ordinary departures remain direct when Choice D is ineligible', () => {
  const h = makeHarness(4713);
  h.state.story.flags.hasLedger = false;
  h.state.player.cargo.items = {};
  h.bus.emit('world:requestJump', { targetSectorId: CHARON, via: 'gate' });

  assert.equal(h.events.filter((event) => event.name === 'endgame:promptChoiceD').length, 0);
  assert.equal(h.state.jump.state, 'CHARGING');
  assert.equal(h.state.jump.targetSectorId, CHARON);
});
