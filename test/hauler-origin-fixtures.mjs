// Fixtures/helpers for isolated Hauler origin-chain tests (M3 candidate).
// No package.json wiring; run via: node test/hauler-origin-chain.test.mjs

import { createBus } from '../src/core/eventBus.js';

/** Minimal game-state stub — enough for origin FSM + optional market quotes. */
export function makeHaulerState(overrides = {}) {
  const state = {
    simTime: 0,
    meta: { seed: 47 },
    player: {
      credits: 5000,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100 },
      dockedStationId: null,
    },
    ui: { dockedStationId: null },
    economy: {
      markets: {
        station_helios: {
          cmdty_food: { stock: 80, lastMid: 18, lastBuy: 20, lastSell: 16, role: 'produce' },
          cmdty_fuel_cells: { stock: 60, lastMid: 28, lastBuy: 30, lastSell: 26, role: 'produce' },
        },
        station_coalition: {
          cmdty_food: { stock: 20, lastMid: 26, lastBuy: 28, lastSell: 24, role: 'consume' },
        },
        station_ceres: {
          cmdty_fuel_cells: { stock: 15, lastMid: 38, lastBuy: 40, lastSell: 36, role: 'consume' },
          cmdty_ore_iron: { stock: 20, lastMid: 34, lastBuy: 36, lastSell: 32, role: 'consume' },
        },
        station_beltout: {
          cmdty_ore_iron: { stock: 80, lastMid: 24, lastBuy: 26, lastSell: 22, role: 'produce' },
        },
      },
    },
    careers: {},
    ...overrides,
  };
  if (overrides.careers) state.careers = { ...overrides.careers };
  if (overrides.player) state.player = { ...state.player, ...overrides.player };
  if (overrides.economy) state.economy = { markets: {}, ...overrides.economy };
  return state;
}

/** Seed producer/consumer quotes so market-truth snapshots are live-economy shaped. */
export function seedIronSpreadMarkets(state) {
  state.economy = state.economy || { markets: {} };
  state.economy.markets = state.economy.markets || {};
  state.economy.markets.station_beltout = {
    ...(state.economy.markets.station_beltout || {}),
    cmdty_ore_iron: {
      stock: 80, lastMid: 24, lastBuy: 26, lastSell: 22, role: 'produce',
    },
  };
  state.economy.markets.station_ceres = {
    ...(state.economy.markets.station_ceres || {}),
    cmdty_ore_iron: {
      stock: 20, lastMid: 34, lastBuy: 36, lastSell: 32, role: 'consume',
    },
  };
  return state;
}

export function collectBusEvents(bus) {
  const log = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    log.push({ event, payload });
    return origEmit(event, payload);
  };
  log.clear = () => { log.length = 0; };
  log.of = (name) => log.filter((e) => e.event === name);
  return log;
}

export function makeBus() {
  return createBus();
}

/** Credit ledger that honors economy:grantCredits / chargeCredits for intent tests. */
export function attachCreditAuthority(bus, state) {
  bus.on('economy:grantCredits', (p) => {
    const amount = Math.max(0, Math.floor((p && p.amount) || 0));
    state.player.credits = (state.player.credits | 0) + amount;
  });
  bus.on('economy:chargeCredits', (p) => {
    const amount = Math.max(0, Math.floor((p && p.amount) || 0));
    state.player.credits = Math.max(0, (state.player.credits | 0) - amount);
  });
  bus.on('faction:repDelta', (p) => {
    state._repLog = state._repLog || [];
    state._repLog.push(p);
  });
}

/** Scan source text for forbidden sim nondeterminism. */
export function findNondeterminism(sourceText) {
  const hits = [];
  if (/\bMath\.random\s*\(/.test(sourceText)) hits.push('Math.random');
  if (/\bDate\.now\s*\(/.test(sourceText)) hits.push('Date.now');
  if (/\bperformance\.now\s*\(/.test(sourceText)) hits.push('performance.now');
  if (/\bnew\s+Date\s*\(/.test(sourceText)) hits.push('new Date');
  return hits;
}
