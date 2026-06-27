import assert from 'node:assert/strict';

import { AMMO_BATCH, serviceQuote } from '../src/ui/screens/services.js';

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
}

checkRefuelQuoteAllowsPartialTopOff();
checkRefuelQuoteBlocksZeroCreditTopOff();
checkPartialRepairQuoteSpendsOnlyCurrentCredits();
checkAmmoQuoteRespectsWalletAndCargo();
checkInsuranceQuoteShowsDeductibleGate();

console.log('Services readiness checks OK');
