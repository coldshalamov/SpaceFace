import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CYCLE_REGIMES,
  FORECAST_CONE_STATED_RATE,
  evaluateTwoLegItinerary,
  lostShipmentPressure,
  predictPriceCurve,
  regimeLabel,
} from '../src/systems/economyCycles.js';

// ECON-BUILD-1 — the per-listing wave equation (CYCLE_WEIGHT, blendFrom rows, the
// rolled cycle stream) was deleted with the five-second market pass. The regime
// factor now comes from src/economy/marketModel.js's seeded epoch grid and carries
// its own ±0.55..1.90 envelope, so there is no secondary weight to pin. What this
// file now guards is the shim contract surviving modules still import: the regime
// vocabulary, the forecast cone's stated coverage, the two-leg planner, and the
// loss-ledger pressure input.

test('the compat shim keeps the caller-facing economy vocabulary', () => {
  // Legacy regime words still label; the new six plain words label too.
  assert.equal(regimeLabel('sine'), 'Cyclic demand');
  assert.equal(regimeLabel('turbulent'), 'Turbulent market');
  assert.equal(typeof regimeLabel('climb'), 'string');
  assert.ok(regimeLabel('climb').length > 0);
  assert.ok(CYCLE_REGIMES.includes('sine'));

  // The forecast cone's stated coverage is a named constant, not a hardcode.
  assert.equal(FORECAST_CONE_STATED_RATE, 0.99);

  // The two-leg planner keeps the Part-F honesty marks: a stale remote sighting
  // stays an estimate and never settles at the remembered price.
  const plan = evaluateTwoLegItinerary({
    credits: 1000, cargoFree: 60, now: 5000,
    leg1: { qty: 4, unitCr: 10, unitVolume: 1, stock: 60 },
    leg2: { quoted: true, seenAt: 100, unitCr: 50, qty: 4 },
  });
  assert.equal(plan.stale, true);
  assert.equal(plan.estimate, true);
  assert.equal(plan.leg2SellQty, null);

  // The loss ledger's pressure input still resolves a manifest's primary line.
  assert.deepEqual(
    lostShipmentPressure({ destStationId: 'station_x', lines: [{ commodityId: 'cmdty_ore_iron', qty: 7 }] }),
    { stationId: 'station_x', commodityId: 'cmdty_ore_iron', vol: 7 },
  );
});

test('predictPriceCurve returns the closed-form cone shape', () => {
  const state = { meta: { seed: 'cycle-weight' }, simTime: 0, economy: { markets: {} } };
  const curve = predictPriceCurve(state, 'station_ceres', 'cmdty_ore_iron', 4, 5);
  assert.equal(curve.length, 4);
  for (const p of curve) {
    assert.ok(p.mid >= 1 && p.lo >= 1 && p.hi >= p.lo && p.statedRate === 0.99);
  }
});
