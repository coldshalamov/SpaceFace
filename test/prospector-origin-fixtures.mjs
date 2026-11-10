// Isolated fixtures for Prospector origin chain tests.
// No package.json registration required; imported by prospector-origin.test.mjs.

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  ensureProspectorOriginState,
  prospectorOrigin,
} from '../src/careers/origins/prospectorOrigin.js';

export function makePlayerCargo(overrides = {}) {
  return {
    items: {},
    usedVolume: 0,
    usedMass: 0,
    capVolume: 40,
    capMass: 80,
    ...overrides,
  };
}

export function makeAsteroid(id, typeId = 'ast_common_rock', extraData = {}) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    pos: { x: 100, z: 0 },
    data: {
      typeId,
      scanOreGlyph: null,
      scanHighlightUntil: 0,
      ...extraData,
    },
  };
}

export function makeState(options = {}) {
  const seed = options.seed != null ? options.seed : 9001;
  const playerId = options.playerId != null ? options.playerId : 1;
  const asteroids = options.asteroids || [
    makeAsteroid(10, 'ast_common_rock'),
    makeAsteroid(11, 'ast_metallic'),
  ];
  const entities = new Map();
  const entityList = [];
  const player = {
    id: playerId,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  };
  entities.set(playerId, player);
  entityList.push(player);
  for (const a of asteroids) {
    entities.set(a.id, a);
    entityList.push(a);
  }

  const state = {
    mode: options.mode || 'station',
    simTime: options.simTime != null ? options.simTime : 0,
    tick: 0,
    playerId,
    rng: mulberry32(seed),
    meta: { seed },
    player: {
      credits: options.credits != null ? options.credits : 5000,
      cargo: makePlayerCargo(options.cargo),
      heat: 0,
    },
    entities,
    entityList,
    world: {
      currentSectorId: options.sectorId || 'sec_helios',
    },
    careers: options.careers || {},
  };

  if (options.ensureOrigin !== false) {
    ensureProspectorOriginState(state, state.simTime);
  }
  return state;
}

export function makeRuntime(options = {}) {
  const state = makeState(options);
  const bus = createBus();
  const events = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    events.push({ event, payload });
    return origEmit(event, payload);
  };

  const system = Object.assign({}, prospectorOrigin);
  system.init({ state, bus });
  return { state, bus, system, events };
}

export function advanceSim(state, seconds) {
  state.simTime = (state.simTime || 0) + seconds;
}

export function grantOreInHold(state, commodityId = 'cmdty_ore_iron', qty = 3) {
  const cargo = state.player.cargo;
  cargo.items[commodityId] = (cargo.items[commodityId] || 0) + qty;
  cargo.usedVolume += qty;
  cargo.usedMass += qty * 0.8;
}

export function clearHold(state) {
  state.player.cargo.items = {};
  state.player.cargo.usedVolume = 0;
  state.player.cargo.usedMass = 0;
}

/** Drive happy-path through accept + three steps via live event names. */
export function playthroughHappyPath(runtime, options = {}) {
  const { state, bus, system } = runtime;
  const targetOre = options.targetOre != null ? options.targetOre : 3;

  bus.emit('dock:docked', { stationId: 'st_helios' });
  const accepted = system.accept();
  if (!accepted.ok) return { ok: false, stage: 'accept', accepted };

  // Step 1: scan with rocks in range.
  for (const e of state.entityList) {
    if (e.type === 'asteroid') {
      e.data.scanOreGlyph = 'Fe';
      e.data.scanHighlightUntil = state.simTime + 20;
    }
  }
  bus.emit('scan:completed', {
    targetId: null,
    sectorId: state.world.currentSectorId,
    found: { asteroids: 2, wrecks: 0, anomalies: 0 },
  });

  // Step 2: mining yields.
  for (let i = 0; i < targetOre; i++) {
    bus.emit('mining:yield', {
      commodityId: 'cmdty_ore_iron',
      qty: 1,
      minerId: state.playerId,
      pos: { x: 100, z: 0 },
    });
    grantOreInHold(state, 'cmdty_ore_iron', 1);
  }

  // Step 3: sell.
  bus.emit('economy:tradeCompleted', {
    stationId: 'st_helios',
    commodityId: 'cmdty_ore_iron',
    side: 'sell',
    qty: targetOre,
    total: targetOre * 12,
    unitAvg: 12,
  });

  return {
    ok: true,
    progress: system.getProgress(),
    own: state.careers.origins.prospector,
  };
}
