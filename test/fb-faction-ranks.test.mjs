// FB-044 — standing has four named ranks. The yard discount starts at the second step.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { RANK_GATED_CONTRACTS } from '../src/data/missions.js';
import { FACTION_META } from '../src/data/factions.js';
import {
  factions,
  missionAvailable,
  rankFromRep,
  rankServiceDiscount,
} from '../src/systems/factions.js';
import { serviceQuote } from '../src/ui/station/serviceQuotes.js';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  factions.init({ state, bus, helpers: {} });
  factions.newGame();
  return { state, bus };
}

test('ranks rise with reputation and never step backward', () => {
  const samples = [-1000, -100, -29, 0, 149, 150, 699, 700, 1000];
  let previous = -1;
  for (const rep of samples) {
    const rank = rankFromRep(rep, 'faction_scn');
    assert.ok(rank.step >= previous, `${rep} stepped down`);
    previous = rank.step;
  }
  assert.equal(rankFromRep(-100, 'faction_scn').step, 0);
  assert.equal(rankFromRep(-29, 'faction_scn').step, 1);
  assert.equal(rankFromRep(150, 'faction_scn').step, 2);
  assert.equal(rankFromRep(700, 'faction_scn').step, 3);
  assert.equal(rankFromRep(150, 'faction_scn').name, 'Trusted');
});

test('the yard discount is zero below the second step and ten percent at it', () => {
  const { state } = boot();
  state.dock = { factionId: 'faction_scn' };
  state.fuel = { current: 0, max: 10 };
  state.player.credits = 100000;
  state.factions.faction_scn.rep = 0;
  const full = serviceQuote('refuel', state, null);
  state.factions.faction_scn.rep = 150;
  const trusted = serviceQuote('refuel', state, null);
  assert.equal(rankServiceDiscount(state, 'faction_scn'), 0.1);
  assert.ok(trusted.cost < full.cost, 'Trusted pays less to refuel');
  state.factions.faction_scn.rep = -100;
  assert.equal(rankServiceDiscount(state, 'faction_scn'), 0);
  const entity = { hull: 40, hullMax: 100, armorHp: 10, armorMax: 10 };
  state.factions.faction_scn.rep = 700;
  const hero = serviceQuote('repair', state, entity);
  state.factions.faction_scn.rep = 0;
  const known = serviceQuote('repair', state, entity);
  assert.ok(hero.cost < known.cost);
});

test('one announcement per rank-name crossing on seed 4242', () => {
  const { state, bus } = boot();
  const lines = [];
  bus.on('news:publish', (payload) => lines.push(payload));
  bus.on('comms:log', (payload) => lines.push(payload));
  state.factions.faction_dmc.rep = 140;
  factions.applyRep('faction_dmc', 20, 'seed-4242');
  const first = lines.filter((row) => row && row.kind === 'faction_rank');
  assert.equal(first.length, 1);
  factions.applyRep('faction_dmc', 5, 'seed-4242-again');
  const second = lines.filter((row) => row && row.kind === 'faction_rank');
  assert.equal(second.length, 1);
});

test('each faction hides its rank contract below the first named step', () => {
  const { state } = boot();
  assert.equal(RANK_GATED_CONTRACTS.length, FACTION_META.length);
  for (const mission of RANK_GATED_CONTRACTS) {
    state.factions[mission.factionId].rep = -100;
    assert.equal(missionAvailable(mission), false, mission.id);
    state.factions[mission.factionId].rep = 0;
    assert.equal(missionAvailable(mission), true, mission.id);
  }
});
