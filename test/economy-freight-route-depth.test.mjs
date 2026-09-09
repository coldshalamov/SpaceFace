// M3 freight compounding guard — proves live economy role/spread/depth tunables keep
// producer→consumer freestyle margins bounded and sequential hauls self-decay.
//
// Run: node --test test/economy-freight-route-depth.test.mjs
// Authority under test: src/systems/economy.js (ROLE_FACTOR, SPREAD_BASE, price impact).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  economy,
  ECONOMY_PRICE_TUNING,
  economySpotPriceForRole,
} from '../src/systems/economy.js';

const CMDTY = 'cmdty_refined_metals';
const PRODUCE_STATION = 'station_forge'; // refinery (produces refined)
const CONSUME_STATION = 'station_coalition'; // fab-ish consumer if present; fall back via market roles

function installWorld(state) {
  state.world.currentSectorId = 'sector_helios_prime';
  state.world.sectors = Object.fromEntries(SECTORS.map((s) => [s.id, s]));
}

function bootEconomy(seed = 0xF8E1_6011) {
  const sim = createSimulation({ seed, systems: [economy] });
  const state = sim.state;
  installWorld(state);
  state.mode = 'flight';
  state.player.credits = 80_000;
  state.player.cargo = {
    items: {},
    usedVolume: 0,
    usedMass: 0,
    capVolume: 5_000,
    capMass: 5_000,
  };
  return { sim, state, econ: sim.registry.get('economy') };
}

function findRoleStations(econ, state, cmdtyId) {
  let produceId = null;
  let consumeId = null;
  for (const sec of SECTORS) {
    for (const st of sec.stations || []) {
      econ.ensureMarket(st.id);
      const entry = state.economy.markets[st.id]?.[cmdtyId];
      if (!entry) continue;
      if (!produceId && entry.role === 'produce') produceId = st.id;
      if (!consumeId && entry.role === 'consume') consumeId = st.id;
      if (produceId && consumeId) return { produceId, consumeId };
    }
  }
  return { produceId, consumeId };
}

test('ECONOMY_PRICE_TUNING exposes moderated produce/consume role factors and shallower books', () => {
  const rf = ECONOMY_PRICE_TUNING.roleFactor;
  assert.ok(rf.produce > 1.0 && rf.produce < 1.90,
    `produce role ${rf.produce} should be surplus but below the legacy 2.0 free-ride`);
  assert.ok(rf.consume > 0.40 && rf.consume < 0.70,
    `consume role ${rf.consume} should be scarce but above the legacy 0.35 free-ride`);
  assert.ok(rf.produce / rf.consume < 4.0,
    `stock-target ratio ${rf.produce / rf.consume} must stay under legacy 2.0/0.35 ≈ 5.7`);
  assert.ok(ECONOMY_PRICE_TUNING.baseEqDefault > 400 && ECONOMY_PRICE_TUNING.baseEqDefault < 1000,
    `baseEqDefault ${ECONOMY_PRICE_TUNING.baseEqDefault} should be shallower than legacy 1000`);
  assert.ok(ECONOMY_PRICE_TUNING.spreadBase >= 0.08 && ECONOMY_PRICE_TUNING.spreadBase <= 0.12);
});

test('structural produce→consumer spot margin stays under a freestyle free-ride band', () => {
  const def = COMMODITIES.find((c) => c.id === CMDTY);
  assert.ok(def, 'refined metals commodity');
  const buy = economySpotPriceForRole(def, 'produce', 'buy');
  const sell = economySpotPriceForRole(def, 'consume', 'sell');
  assert.ok(buy > 0 && sell > buy, 'consumer sell must beat producer buy');
  const marginPct = ((sell - buy) / buy) * 100;
  // Legacy 2.0/0.35 + 8% spread was ~85% at el≈0.4. M3 band keeps trade worthwhile but not runaway.
  assert.ok(marginPct < 60, `spot margin ${marginPct.toFixed(1)}% must stay below free-ride band`);
  assert.ok(marginPct > 18, `spot margin ${marginPct.toFixed(1)}% must remain worthwhile for missions/freight`);
});

test('repeated same-route freestyle lots self-decay unit profit through live stock impact', () => {
  const r = Math.random;
  const n = Date.now;
  Math.random = () => { throw new Error('Math.random forbidden in freight depth test'); };
  Date.now = () => { throw new Error('Date.now forbidden in freight depth test'); };
  try {
    const { econ, state } = bootEconomy();
    const { produceId, consumeId } = findRoleStations(econ, state, CMDTY);
    assert.ok(produceId && consumeId, `need produce+consume stations for ${CMDTY}`);

    const lot = 28;
    const profits = [];
    for (let i = 0; i < 4; i++) {
      const buyQ = econ.quote(produceId, CMDTY, 'buy', lot);
      assert.equal(buyQ.ok, true, `buy quote ${i}: ${buyQ.reason || ''}`);
      const buy = econ.execute(produceId, CMDTY, 'buy', lot);
      assert.equal(buy.ok, true, `buy exec ${i}: ${buy.reason || ''}`);
      const have = state.player.cargo.items[CMDTY] | 0;
      assert.ok(have >= lot, 'cargo received');
      const sell = econ.execute(consumeId, CMDTY, 'sell', lot);
      assert.equal(sell.ok, true, `sell exec ${i}: ${sell.reason || ''}`);
      profits.push(sell.total - buy.total);
    }
    // Later hauls on the same pair must not keep full first-haul unit profit (price impact + no instant re-eq).
    assert.ok(profits[0] > 0, `first haul must still profit (${profits[0]})`);
    assert.ok(profits[3] < profits[0] * 0.92,
      `4th haul profit ${profits[3]} must decay vs first ${profits[0]}`);
    assert.ok(profits[3] < profits[1] || profits[2] < profits[0],
      'monotonic-ish decay evidence across the sequence');
  } finally {
    Math.random = r;
    Date.now = n;
  }
});

// Silence unused-import lint-style keep for station id constants used as documentation anchors.
void PRODUCE_STATION;
void CONSUME_STATION;
