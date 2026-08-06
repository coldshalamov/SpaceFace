import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { STORY_BEATS } from '../src/data/missions.js';
import { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN } from '../src/story/endings/endingDefs.js';
import { story as storyPrototype } from '../src/systems/story.js';
import { world as worldPrototype } from '../src/systems/world.js';
import { storyActionForBeat } from '../src/ui/screens/missionLog.js';

function cloneSystem(prototype) {
  return Object.assign({}, prototype);
}

function makeHarness(seed = 4703) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 900;
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.ownedShips = [{ defId: 'ship_bastion' }];
  state.player.cargo = {
    items: {},
    usedVolume: 80,
    usedMass: 80,
    capVolume: 80,
    capMass: 200,
  };
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
  state.story.endgameDeclined = [];
  state.story.endgamePending = null;
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.missions.active = [];
  state.claims = { bodies: [{ id: 'claim_choice_c' }] };
  state.fuel.current = state.fuel.max = 100;

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
  for (const name of [
    'jump:chargeStart', 'jump:chargeTick', 'jump:start', 'jump:arrive', 'jump:chargeAbort',
    'endgame:promptChoiceC', 'endgame:chosen',
  ]) bus.on(name, (payload) => events.push({ name, payload }));
  const ctx = { state, bus, registry, helpers: { voice: { say: () => true } } };
  world.init(ctx);
  story.init(ctx);
  return { state, bus, world, story, events };
}

test('Choice C current action starts a held unfiled charge and confirms through the world owner', () => {
  const h = makeHarness();
  const action = storyActionForBeat(STORY_BEATS[7], h.state);
  assert.equal(action.action, 'endgameUnfiledJump');
  assert.equal(action.actionLabel, 'CHARGE UNFILED JUMP');

  h.bus.emit('ui:endgameUnfiledJump', { source: 'missionLog' });
  assert.equal(h.state.jump.state, 'CHARGING');
  assert.equal(h.state.jump.targetSectorId, 'sector_helios_prime');
  assert.equal(h.state.jump._unfiled, true);
  assert.equal(h.state.jump._unfiledConfirmed, false);
  assert.ok(h.events.some((event) => event.name === 'jump:chargeStart'
    && event.payload.unfiled === true && event.payload.targetSectorId === null));
  assert.equal(h.events.filter((event) => event.name === 'endgame:promptChoiceC').length, 1);

  h.world._tickCharging(2, h.state);
  assert.equal(h.state.jump.chargeT, 0, 'charge cannot advance under the confirmation prompt');
  assert.equal(h.state.story.endgameChoice, null);

  h.bus.emit('ui:endgameUnfiledJumpConfirm', { choice: 'C' });
  assert.equal(h.state.jump._unfiledConfirmed, true);
  assert.equal(h.state.story.endgameChoice, 'C');
  assert.equal(h.state.story.endgameResolved, true);

  const confirmedSave = h.world.serialize();
  assert.equal(confirmedSave.currentSectorId, 'sector_helios_prime',
    'Continue cannot strand a filed Choice C back at Ashfall');
  assert.equal(confirmedSave.jump.state, 'COOLDOWN');
  assert.equal(confirmedSave.jump.targetSectorId, null);
  assert.equal(confirmedSave.fuel.current, h.state.fuel.current - h.state.jump._fuelCost,
    'normalized arrival pays the same drive fuel as the live transition');

  const fuelBefore = h.state.fuel.current;
  h.world._tickCharging(h.state.jump.chargeNeeded + 0.01, h.state);
  assert.equal(h.state.jump.state, 'JUMPING');
  assert.ok(h.state.fuel.current < fuelBefore, 'confirmed drive charge spends normal drive fuel');
  assert.ok(h.events.some((event) => event.name === 'jump:start' && event.payload.unfiled === true));

  h.world.enterSector = (sectorId) => { h.state.world.currentSectorId = sectorId; };
  h.world._interdictChance = () => 0;
  h.state.rng = () => 1;
  h.world._tickJumping(2, h.state);
  assert.equal(h.state.world.currentSectorId, 'sector_helios_prime');
  assert.equal(h.state.jump._unfiled, false);
  assert.ok(h.events.some((event) => event.name === 'jump:arrive'
    && event.payload.unfiled === true && event.payload.sectorId === 'sector_helios_prime'));
});

test('declining Choice C aborts without filing an ending or granting fuel', () => {
  const h = makeHarness(4704);
  const fuelBefore = h.state.fuel.current;
  h.bus.emit('ui:endgameUnfiledJump');
  h.bus.emit('ui:endgameDecline', { choice: 'C' });
  h.bus.emit('world:abortJumpCharge', { reason: 'choice_c_declined' });

  assert.equal(h.state.jump.state, 'IDLE');
  assert.equal(h.state.jump.targetSectorId, null);
  assert.equal(h.state.fuel.current, fuelBefore);
  assert.equal(h.state.story.endgameChoice, null);
  assert.equal(h.state.story.endgameResolved, false);
  assert.ok(h.state.story.endgameDeclined.includes('C'));
  assert.equal(storyActionForBeat(STORY_BEATS[7], h.state).action, 'endgameSandbox');
});

test('ordinary registered jump charges never masquerade as Choice C', () => {
  const h = makeHarness(4705);
  h.bus.emit('jump:chargeStart', {
    targetSectorId: 'sector_charon_expanse',
    via: 'drive',
    chargeNeeded: 8,
  });
  assert.equal(h.events.filter((event) => event.name === 'endgame:promptChoiceC').length, 0);
  assert.equal(h.state.story.endgameChoice, null);
});
