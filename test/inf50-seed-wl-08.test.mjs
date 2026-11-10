import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { RANK_GATED_CONTRACTS, RANK_CONTRACT_SOURCE } from '../src/data/missions.js';
import { factions, missionAvailable, rankTitleForStep } from '../src/systems/factions.js';
import { missions } from '../src/systems/missions.js';

const CHOIR = RANK_GATED_CONTRACTS.find((def) => def.factionId === 'faction_choir');
const FREE = RANK_GATED_CONTRACTS.find((def) => def.factionId === 'faction_free');

function boot(rep) {
  const state = createGameState(4242);
  const bus = createBus();
  state.factions.faction_choir = { rep: rep.choir };
  state.factions.faction_free = { rep: rep.free };
  factions.init({ state, bus, helpers: {} });
  state.factions.faction_choir.rep = rep.choir;
  state.factions.faction_free.rep = rep.free;
  const system = Object.create(missions);
  system.init({ state, bus, helpers: { voice: { say() { return true; } } }, registry: { get() { return null; } } });
  return { state, system };
}

function rankRows(board) {
  return (board && board.slots || []).filter((offer) => offer && offer.source === RANK_CONTRACT_SOURCE);
}

test('seed 4242: rank steps 2 and 3 are real board rows a step-1 pilot cannot take', () => {
  assert.equal(CHOIR.minRankStep, 2);
  assert.equal(FREE.minRankStep, 3);
  const low = boot({ choir: 0, free: 0 });
  assert.equal(missionAvailable(CHOIR), false);
  assert.equal(missionAvailable(FREE), false);
  assert.equal(rankRows(low.system.ensureBoard('station_depot3')).length, 0);
  assert.equal(rankRows(low.system.ensureBoard('station_veil')).length, 0);

  const high = boot({ choir: 150, free: 700 });
  assert.equal(missionAvailable(CHOIR), true);
  assert.equal(missionAvailable(FREE), true);
  const choirRow = rankRows(high.system.ensureBoard('station_depot3'));
  const freeRow = rankRows(high.system.ensureBoard('station_veil'));
  assert.equal(choirRow.length, 1);
  assert.equal(choirRow[0].minRankStep, 2);
  assert.equal(freeRow.length, 1);
  assert.equal(freeRow[0].minRankStep, 3);

  high.state.factions.faction_choir.rep = 0;
  const refused = high.system._acceptPreflight(choirRow[0]);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, new RegExp(rankTitleForStep('faction_choir', 2)));
});
