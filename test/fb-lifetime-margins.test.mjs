// FB-047 — lifetime per-commodity margin roll-up beside the ten-receipt ledger cap.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { lifetimeMarginFor, marketIntelligence } from '../src/ui/marketIntelligence.js';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [economy] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  state.playerId = player.id;
  state.player.credits = 5_000_000;
  state.player.cargo.capVolume = 10_000;
  return { sim, state, econ: sim.registry.get('economy') };
}

test('30 trades roll into a bounded per-commodity margin record', () => {
  const { state, econ } = boot();
  const st = 'station_helios';
  const cid = 'cmdty_ore_iron';
  econ.ensureMarket(st);
  // Fifteen round trips: buy 10 then sell 10, over and over — far past the ledger's ten rows.
  for (let i = 0; i < 15; i++) {
    const b = econ.execute(st, cid, 'buy', 10);
    assert.ok(b.ok, `buy ${i} executes`);
    const s = econ.execute(st, cid, 'sell', 10);
    assert.ok(s.ok, `sell ${i} executes`);
  }
  const margins = state.player.tradeMargins;
  assert.ok(margins && margins[cid], 'the roll-up exists');
  const m = margins[cid];
  assert.equal(m.sales, 15);
  assert.equal(m.units, 150);
  assert.ok(Number.isFinite(m.profitCr), 'total margin recorded');
  assert.ok(m.worstMarginUnit <= m.bestMarginUnit, 'best/worst bracket the run');
  // The ledger cap still binds — the roll-up is what survives.
  assert.ok(state.player.tradeLedger.length <= 20, `ledger stays capped (${state.player.tradeLedger.length})`);
  // The intel view reads the roll-up beside the receipts.
  const intel = marketIntelligence(state, cid);
  assert.ok(intel.lifetime, 'the intel view carries the lifetime row');
  assert.equal(intel.lifetime.units, 150);
  assert.equal(intel.lifetime.profitCr, m.profitCr);
});

test('a commodity never sold through reports no bucket, not a zero row', () => {
  const { state } = boot();
  assert.equal(lifetimeMarginFor(state.player.tradeMargins || {}, 'cmdty_water'), null);
  const intel = marketIntelligence(state, 'cmdty_water');
  assert.equal(intel.lifetime, null);
});

test('the roll-up is bounded by the commodity catalog, not by trade count', () => {
  const { state, econ } = boot();
  const st = 'station_helios';
  econ.ensureMarket(st);
  const cids = Object.keys(state.economy.markets[st] || {});
  assert.ok(cids.length > 3, 'market lists several commodities');
  for (const cid of cids.slice(0, 4)) {
    for (let i = 0; i < 10; i++) {
      econ.execute(st, cid, 'buy', 2);
      econ.execute(st, cid, 'sell', 2);
    }
  }
  assert.ok(Object.keys(state.player.tradeMargins).length <= 4, 'one bucket per commodity');
});
