/**
 * B7 place required: endgame offer only after Ashfall dock/desk.
 * Run: node --test test/story-weakpoints-b7-place.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { story as storyProto } from '../src/systems/story.js';

function harness() {
  const state = createGameState(77);
  state.mode = 'flight';
  state.simTime = 100;
  state.playerId = 1;
  state.player.credits = 200_000;
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 80 };
  state.story = {
    beatIndex: 7,
    branch: 'patrol',
    flags: {
      endgame: true,
      deep_reach_operation_complete: true,
      elroy_outcome: 'custody',
    },
    chainProgress: 0,
    persistentCargo: [],
  };
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;

  const bus = createBus();
  const offers = [];
  bus.on('comms:popup', (p) => {
    if (p && p.id === 'endgame_offer') offers.push(p);
  });
  bus.on('endgame:eligibility', (p) => offers.push({ kind: 'eligibility', ...p }));

  const story = Object.assign({}, storyProto);
  story.init({
    state, bus,
    helpers: { voice: { say: () => true } },
    registry: { get: () => null },
  });
  // Skip full new-game wipe; just ensure narrative fields.
  story._ensureState();
  story._endgameGateMet = () => true;
  return { state, bus, story, offers };
}

test('endgame offer blocked until Ashfall place flag', () => {
  const h = harness();
  h.story._maybeOfferEndgame();
  assert.equal(h.state.story.endgameOffered, false);
  assert.equal(h.offers.length, 0);

  h.state.world.currentSectorId = 'sector_ashfall_reach';
  h.bus.emit('sector:enter', { sectorId: 'sector_ashfall_reach', firstVisit: true });
  // Sector enter sets ashfall_visited and may offer.
  h.story._maybeOfferEndgame();
  assert.equal(h.state.story.flags.ashfall_visited, true);
  assert.equal(h.state.story.endgameOffered, true);
});

test('dock ashcache opens Kurtz desk and can offer endgame', () => {
  const h = harness();
  h.state.story.flags.ashfall_visited = false;
  h.state.story.endgameOffered = false;
  h.bus.emit('dock:docked', { stationId: 'station_ashcache' });
  assert.equal(h.state.story.flags.deep_reach_ashfall_docked, true);
  assert.equal(h.state.story.flags.kurtz_desk_opened, true);
  assert.ok(Array.isArray(h.state.story.kurtzLedgerRows));
  assert.ok(h.state.story.kurtzLedgerRows.some((r) => /ELROY/i.test(r.name)));
  assert.equal(h.state.story.endgameOffered, true);
});
