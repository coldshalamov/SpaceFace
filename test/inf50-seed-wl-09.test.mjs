import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MISSION_STANDING_LADDER, RANK_GATED_CONTRACTS, RANK_CONTRACT_SOURCE } from '../src/data/missions.js';
import { factionContractLadderRows } from '../src/ui/factionStanding.js';
import { factions, missionAvailable } from '../src/systems/factions.js';
import { missions } from '../src/systems/missions.js';
import { contractRungScaleState, contractRungWord } from '../src/ui/station/screens/factions.js';

const DRIFT = RANK_GATED_CONTRACTS.find((def) => def.factionId === 'faction_dmc');

function boot(rep) {
  const state = createGameState(4242);
  const bus = createBus();
  state.factions.faction_dmc = { rep };
  factions.init({ state, bus, helpers: {} });
  state.factions.faction_dmc.rep = rep;
  const system = Object.create(missions);
  system.init({ state, bus, helpers: { voice: { say() { return true; } } }, registry: { get() { return null; } } });
  return { state, system };
}

function alliedRow(rep) {
  return factionContractLadderRows(rep).find((row) => row.name === 'Allied Retainers');
}

test('seed 4242: allied standing posts one Drift haul a trusted pilot cannot see, and the rung can read reached', () => {
  assert.equal(DRIFT.minRep, 400);
  assert.equal(DRIFT.title, 'Drift allied retainer haul');
  assert.equal(MISSION_STANDING_LADDER.find((row) => row.name === 'Allied Retainers').minRep, 400);

  const trusted = boot(150);
  assert.equal(missionAvailable(DRIFT), false);
  const hidden = (trusted.system.ensureBoard('station_ceres').slots || [])
    .filter((offer) => offer && offer.source === RANK_CONTRACT_SOURCE);
  assert.equal(hidden.length, 0);
  assert.equal(contractRungWord(alliedRow(150), 150), 'sealed');

  const allied = boot(400);
  assert.equal(missionAvailable(DRIFT), true);
  const posted = (allied.system.ensureBoard('station_ceres').slots || [])
    .filter((offer) => offer && offer.source === RANK_CONTRACT_SOURCE);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].title, 'Drift allied retainer haul');
  assert.equal(posted[0].minRep, 400);
  assert.equal(contractRungWord(alliedRow(400), 400), 'reached');
  assert.equal(contractRungScaleState(alliedRow(400), 400), 'reached');
});
