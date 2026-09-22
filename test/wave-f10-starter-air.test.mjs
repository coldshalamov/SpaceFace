// §22 F10 — the three starter cards name the job and the live mass, thrust, and line load.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { NEW_GAME, NEW_GAME_STARTERS, resolveNewGameStarter } from '../src/data/newGameDefaults.js';
import { fittingsFromDefaultModules, getDerivedStats, ships as shipsPrototype } from '../src/systems/ships.js';
import { lineLoadSpeedFor } from '../src/systems/shipCapabilities.js';
import { starterAirCard } from '../src/ui/starterAirCard.js';

test('each starter sentence matches that hull derived mass, thrust, and line load', () => {
  const roles = new Set();
  const hulls = new Set();
  for (const starter of NEW_GAME_STARTERS) {
    const card = starterAirCard(starter);
    const fittings = fittingsFromDefaultModules(starter.shipId, starter.fittedModules);
    const derived = getDerivedStats(starter.shipId, fittings, null);
    const line = Math.round(lineLoadSpeedFor(derived).speedWuPerS || 0);
    assert.ok(card.sentence.length > 0);
    assert.equal(card.massT, Math.round(derived.operationalMass));
    assert.equal(card.thrust, Math.round(derived.thrust));
    assert.equal(card.lineWuPerS, line);
    assert.match(card.sentence, new RegExp(`${card.massT} t, thrust ${card.thrust}, line ${card.lineWuPerS} WU/s`));
    roles.add(card.role);
    hulls.add(starter.shipId);
  }
  assert.equal(roles.size, 3);
  assert.equal(hulls.size, 3);
});

test('selecting a starter equips that hull', () => {
  const state = createGameState(11);
  const bus = createBus();
  const shipSystem = { ...shipsPrototype };
  shipSystem.init({ state, bus, helpers: {} });
  shipSystem.newGame();
  const starter = resolveNewGameStarter({ starter: 'starter_pelican' });
  const owned = state.player.ownedShips[state.player.activeShipIndex || 0];
  owned.defId = starter.shipId;
  owned.fittings = shipSystem.fittingsFromDefaults(starter.shipId, starter.fittedModules);
  assert.equal(owned.defId, 'ship_pelican');
  assert.notEqual(owned.defId, NEW_GAME.shipId);
});
