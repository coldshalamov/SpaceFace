// I028 — a blocked unfiled jump must say the missing prerequisite from the
// same eligibility predicate, in plain words.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { evaluateEndingEligibility } from '../src/story/endings/index.js';
import { story as storyProto } from '../src/systems/story.js';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 1000;
  state.player.credits = 100000;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200,
  };
  state.player.ownedShips = [{ defId: 'ship_bastion', fittings: [] }];
  state.claims = { bodies: [{ id: 'claim_test' }] };
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.missions.active = [];
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

  const said = [];
  const prompts = [];
  const bus = createBus();
  bus.on('endgame:promptChoiceC', (payload) => prompts.push(payload));
  const story = Object.assign({}, storyProto);
  story.init({
    state,
    bus,
    helpers: {
      voice: {
        say(payload) {
          said.push(payload && payload.text);
          return true;
        },
      },
    },
    registry: { get() { return null; } },
  });
  return { state, bus, story, said, prompts };
}

function rawId(text) {
  return /\b[a-z]+_[a-z0-9_]+\b/.test(text) || /choice_c_ineligible/.test(text);
}

test('an ineligible unfiled jump names the missing cargo hold', () => {
  const { state, bus, said, prompts } = boot();
  const expected = evaluateEndingEligibility(state, 'C').unmet[0].text;
  assert.match(expected, /full cargo load/i);

  bus.emit('jump:chargeStart', { unfiled: true, via: 'drive', targetSectorId: null });
  bus.emit('jump:chargeStart', { unfiled: true, via: 'drive', targetSectorId: null });

  const spoken = said.filter((line) => line === expected);
  assert.equal(spoken.length, 2);
  assert.equal(rawId(expected), false);
  assert.equal(prompts.length, 0);

  said.length = 0;
  state.player.cargo.usedVolume = state.player.cargo.capVolume;
  bus.emit('jump:chargeStart', { unfiled: true, via: 'drive', targetSectorId: null });
  assert.equal(said.includes(expected), false);
  assert.equal(prompts.length, 1);
});
