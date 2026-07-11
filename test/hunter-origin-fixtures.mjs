// Isolated fixtures for the M3 Hunter origin chain candidate.
// No shared registries; pure entity/state builders for headless tests.

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createHunterOriginState, ensureHunterOriginState } from '../src/careers/origins/hunterOriginSave.js';

export function makeState(seed = 3101) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 0;
  if (!state.player) state.player = {};
  state.player.heat = 0;
  if (!state.entities) {
    // gameState normally has Map entities; keep compatible.
    state.entities = new Map();
  }
  ensureHunterOriginState(state, seed);
  return state;
}

export function makeBus() {
  return createBus();
}

export function makeHostilePirate({
  id = 50,
  doctrineId = 'interceptor_flyby',
  name = 'Reaver Mark',
} = {}) {
  return {
    id,
    type: 'ship',
    team: 1,
    name,
    alive: true,
    factionId: 'faction_reach',
    data: {
      name,
      enemyTypeId: 'reaver_pirate',
      illegalToKill: false,
      factionLawful: false,
      ai: {
        archetype: 'pirate',
        spawnContext: 'mission',
        combatDoctrineId: doctrineId,
        lawful: false,
        passive: false,
        fsm: 'attack',
      },
      combat: { targetId: 1 },
    },
  };
}

export function makeLawfulPatrol({ id = 60 } = {}) {
  return {
    id,
    type: 'ship',
    team: 1,
    name: 'Patrol Interceptor',
    alive: true,
    factionId: 'faction_scn',
    data: {
      name: 'Patrol Interceptor',
      enemyTypeId: 'patrol_lawman',
      factionLawful: true,
      illegalToKill: false,
      ai: {
        archetype: 'brawler',
        spawnContext: 'ambient',
        combatDoctrineId: 'interceptor_flyby',
        lawful: true,
        passive: false,
      },
    },
  };
}

export function makeCivilianTrader({ id = 70 } = {}) {
  return {
    id,
    type: 'ship',
    team: 2,
    name: 'Hauler',
    alive: true,
    factionId: 'faction_free',
    data: {
      name: 'Hauler',
      enemyTypeId: 'mule_trader',
      illegalToKill: true,
      ai: {
        archetype: 'fleeing_trader',
        spawnContext: 'ambient',
        combatDoctrineId: null,
        lawful: false,
        passive: true,
      },
    },
  };
}

export function installPlayer(state, id = 1) {
  state.playerId = id;
  const player = {
    id,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    data: { ai: {} },
  };
  if (state.entities && typeof state.entities.set === 'function') {
    state.entities.set(id, player);
  }
  return player;
}

export function collectEvents(bus, names) {
  const bag = Object.fromEntries(names.map((n) => [n, []]));
  for (const name of names) {
    bus.on(name, (p) => bag[name].push(p));
  }
  return bag;
}

export function freshOwn(seed = 1) {
  return createHunterOriginState(seed);
}
