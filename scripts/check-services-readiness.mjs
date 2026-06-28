import assert from 'node:assert/strict';

import { AMMO_BATCH, serviceQuote, serviceReadinessRecommendation } from '../src/ui/screens/services.js';

function baseState(overrides = {}) {
  return {
    fuel: { current: 40, max: 100 },
    player: {
      credits: 500,
      cargo: { usedVolume: 0, capVolume: 40, items: {} },
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false },
    },
    ...overrides,
  };
}

function playerShip(overrides = {}) {
  return {
    hull: 60,
    hullMax: 100,
    armorHp: 20,
    armorMax: 60,
    ...overrides,
  };
}

function checkRefuelQuoteAllowsPartialTopOff() {
  const state = baseState({ player: { ...baseState().player, credits: 200 } });
  const quote = serviceQuote('refuel', state, playerShip());

  assert.equal(quote.buttonLabel, 'Partial Refuel', 'underfunded refuel should be labeled as partial');
  assert.equal(quote.disabled, false, 'partial refuel should remain actionable when at least one fuel unit is affordable');
  assert.equal(quote.amount, 33, 'partial refuel should request only the affordable fuel amount');
  assert.equal(quote.cost, 198, 'partial refuel should quote only the emitted affordable amount');
  assert.match(quote.detail, /partial 33\/60u/i, 'refuel detail should show partial amount vs full missing fuel');
}

function checkRefuelQuoteBlocksZeroCreditTopOff() {
  const state = baseState({ player: { ...baseState().player, credits: 0 } });
  const quote = serviceQuote('refuel', state, playerShip());

  assert.equal(quote.disabled, true, 'zero-credit refuel should remain blocked');
  assert.match(quote.disabledReason, /need 6 cr\/u/i, 'zero-credit refuel should explain the per-unit threshold');
}

function checkPartialRepairQuoteSpendsOnlyCurrentCredits() {
  const state = baseState({ player: { ...baseState().player, credits: 50 } });
  const quote = serviceQuote('repair', state, playerShip());

  assert.equal(quote.buttonLabel, 'Partial Repair', 'underfunded repair should be labeled as partial');
  assert.equal(quote.disabled, false, 'partial repair should remain actionable when credits are positive');
  assert.equal(quote.cost, 50, 'partial repair quote should spend the current wallet');
  assert.match(quote.detail, /partial/i, 'repair detail should say the result is partial');
}

function checkAmmoQuoteRespectsWalletAndCargo() {
  const state = baseState({
    player: {
      ...baseState().player,
      credits: 900,
      cargo: { usedVolume: 10, capVolume: 40, items: {} },
    },
  });
  const quote = serviceQuote('ammo', state, playerShip());

  assert(quote.amount > 0, 'ammo should be purchasable when some wallet and cargo room remain');
  assert(quote.amount < AMMO_BATCH, 'ammo purchase should be clipped by hold/wallet instead of overquoting 100 units');
  assert.equal(quote.cost, quote.amount * 12, 'ammo cost should match the actual amount that will be requested');
  assert.match(quote.detail, new RegExp(String(quote.amount) + '/' + AMMO_BATCH), 'ammo detail should show actual vs batch size');
}

function checkInsuranceQuoteShowsDeductibleGate() {
  const state = baseState({ player: { ...baseState().player, credits: 200 } });
  const inactive = serviceQuote('insurance', state, playerShip());
  assert.equal(inactive.disabled, true, 'inactive insurance should be disabled when deductible is unaffordable');
  assert.match(inactive.disabledReason, /need 300 cr/i, 'insurance should show missing deductible credits');
  assert.match(inactive.detail, /station recovery/i, 'insurance detail should explain the recovery destination');
  assert.match(inactive.detail, /cargo loss still applies/i, 'insurance detail should not imply cargo is protected');

  const activeState = baseState({
    player: {
      ...baseState().player,
      credits: 0,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: true },
    },
  });
  const active = serviceQuote('insurance', activeState, playerShip());
  assert.equal(active.disabled, false, 'active insurance cancellation should stay free');
  assert.equal(active.buttonLabel, 'Cancel', 'active insurance should expose cancel action');
  assert.match(active.detail, /station recovery/i, 'active insurance detail should preserve recovery copy');
  assert.match(active.detail, /cargo loss still applies/i, 'active insurance detail should preserve cargo-loss copy');
}

function checkReadinessRecommendsPartialRefuel() {
  const state = baseState({
    fuel: { current: 10, max: 100 },
    player: { ...baseState().player, credits: 200 },
  });
  const rec = serviceReadinessRecommendation(state, playerShip({ hull: 100, armorHp: 60 }), ['refuel', 'repair']);

  assert.equal(rec.service, 'refuel', 'low fuel should recommend refuel first when hull is safe');
  assert.equal(rec.type, 'refuel', 'available low-fuel recommendation should be actionable');
  assert.equal(rec.amount, 33, 'readiness action should reuse the partial refuel quote amount');
  assert.equal(rec.actionLabel, 'Partial Refuel', 'readiness action should preserve the precise service label');
  assert.match(rec.reason, /Fuel is at 10%/i, 'readiness copy should state the fuel problem plainly');
}

function checkReadinessPrefersCriticalRepair() {
  const state = baseState({ fuel: { current: 90, max: 100 } });
  const rec = serviceReadinessRecommendation(state, playerShip({ hull: 20, hullMax: 100, armorHp: 20, armorMax: 60 }), ['refuel', 'repair']);

  assert.equal(rec.service, 'repair', 'critical hull should outrank non-critical service work');
  assert.equal(rec.type, 'repair', 'available critical repair should be actionable');
  assert.equal(rec.actionLabel, 'Repair Hull', 'readiness action should use the normal repair button label');
  assert.match(rec.title, /Repair before undock/i, 'critical repair should use explicit departure-blocking language');
}

function checkReadinessSurfacesUnavailableRefuel() {
  const state = baseState({ fuel: { current: 10, max: 100 } });
  const rec = serviceReadinessRecommendation(state, playerShip({ hull: 100, armorHp: 60 }), ['repair']);

  assert.equal(rec.service, 'refuel', 'low fuel should still surface when this station lacks refuel');
  assert.equal(rec.type, null, 'unavailable refuel recommendation should not emit a service action');
  assert.equal(rec.actionLabel, 'Unavailable', 'unavailable recommendation should render as disabled guidance');
  assert.match(rec.reason, /does not offer Refuel/i, 'unavailable recommendation should explain the station limitation');
}

function checkReadinessAllClear() {
  const state = baseState({ fuel: { current: 90, max: 100 } });
  const rec = serviceReadinessRecommendation(state, playerShip({ hull: 100, armorHp: 60 }), ['refuel', 'repair']);

  assert.equal(rec.service, null, 'healthy fuel and hull should not invent a service upsell');
  assert.equal(rec.type, null, 'all-clear recommendation should be non-actionable');
  assert.equal(rec.kind, 'ok', 'all-clear recommendation should be positive');
  assert.match(rec.reason, /Choose a job or trade route/i, 'all-clear copy should point back to the player-facing loop');
}

checkRefuelQuoteAllowsPartialTopOff();
checkRefuelQuoteBlocksZeroCreditTopOff();
checkPartialRepairQuoteSpendsOnlyCurrentCredits();
checkAmmoQuoteRespectsWalletAndCargo();
checkInsuranceQuoteShowsDeductibleGate();
checkReadinessRecommendsPartialRefuel();
checkReadinessPrefersCriticalRepair();
checkReadinessSurfacesUnavailableRefuel();
checkReadinessAllClear();

console.log('Services readiness checks OK');
