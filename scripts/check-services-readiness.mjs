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

function checkRefuelQuoteShowsAffordability() {
  const state = baseState({ player: { ...baseState().player, credits: 200 } });
  const quote = serviceQuote('refuel', state, playerShip());

  assert.equal(quote.cost, 360, 'refuel should price missing fuel at the economy unit rate');
  assert.equal(quote.disabled, true, 'unaffordable refuel should be disabled before click');
  assert.match(quote.disabledReason, /need 160 cr/i, 'refuel should show the missing credit delta');
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

checkRefuelQuoteShowsAffordability();
checkPartialRepairQuoteSpendsOnlyCurrentCredits();
checkAmmoQuoteRespectsWalletAndCargo();
checkInsuranceQuoteShowsDeductibleGate();

console.log('Services readiness checks OK');
