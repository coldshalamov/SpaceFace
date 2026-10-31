import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AMMO_BATCH, serviceQuote, serviceReadinessRecommendation } from '../src/ui/station/serviceQuotes.js';
import { economy, EMERGENCY_FUEL_U, SERVICE_PRICES, serviceUnitCr } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';

const servicesSource = readFileSync(new URL('../src/ui/station/serviceQuotes.js', import.meta.url), 'utf8');
const stationAppSource = readFileSync(new URL('../src/ui/station/stationApp.js', import.meta.url), 'utf8');

function baseState(overrides = {}) {
  return {
    fuel: { current: 40, max: 100 },
    ui: { docked: true, dockedStationId: 'station_helios' },
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

function checkRefuelQuoteOffersEmergencyNoteForZeroCredits() {
  const state = baseState({ player: { ...baseState().player, credits: 0 } });
  const quote = serviceQuote('refuel', state, playerShip());

  const reserve = Math.min(EMERGENCY_FUEL_U, state.fuel.max - state.fuel.current);
  const debtCr = Math.round(reserve * serviceUnitCr(state, SERVICE_PRICES.fuelCrPerUnit, 'refuel'));
  assert.equal(quote.disabled, false, 'the canonical hardship reserve should remain actionable with no credits');
  assert.equal(quote.buttonLabel, 'Refuel on the Note', 'the broke-pilot path should identify the debt-financed service');
  assert.equal(quote.amount, reserve, 'the quote should offer only the canonical smallest-jump reserve');
  assert.equal(quote.cost, 0, 'the reserve must not pretend to charge credits the pilot does not have');
  assert.equal(quote.debtCr, debtCr, 'the quote should disclose the exact debt the economy will file');
  assert.match(quote.detail, new RegExp(`${reserve}u on the note \\(${debtCr} cr debt\\)`, 'i'),
    'zero-credit refuel should explain the reserve and its filed debt');
}

function checkEmergencyQuoteMatchesEconomyAndYardExecution() {
  const state = baseState({ player: { ...baseState().player, credits: 0, debt: 0 } });
  state.meta = { seed: 47 };
  state.simTime = 0;
  state.days = 0;

  const events = [];
  const listeners = new Map();
  const bus = {
    on(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const listener of listeners.get(name) || []) listener(payload);
    },
  };
  const registry = { get(name) { return name === 'stationServices' ? stationServices : null; } };

  stationServices.init({ state, bus, registry });
  stationServices.newGame();
  stationServices._onPlayerDocked({ stationId: state.ui.dockedStationId });
  economy.init({ state, bus, registry });

  const quote = serviceQuote('refuel', state, playerShip());
  bus.emit('ui:service', { type: 'refuel', amount: Number.NaN });
  assert.equal(state.player.debt, 0, 'a malformed request must not file emergency debt');
  assert.equal(state.fuel.current, 40, 'a malformed request must not alter fuel');
  assert.equal(state.stationServices.player.jobs.length, 0, 'a malformed request must not reach the yard queue');
  assert.ok(events.some((event) => event.name === 'toast' && /amount must be a finite number/i.test(event.payload.text)),
    'the economy owner should explain why the malformed amount was refused');

  bus.emit('ui:service', { type: 'refuel', amount: quote.amount });

  const queued = state.stationServices.player.jobs.filter((job) => job.type === 'refuel');
  assert.equal(queued.length, 1, 'the quoted emergency reserve should reach the canonical yard as one job');
  assert.equal(queued[0].total, quote.amount, 'the yard must receive the exact bounded amount the UI quoted');
  assert.equal(queued[0].meta.cost, quote.cost, 'the yard should not add a credit charge the UI did not quote');
  assert.equal(queued[0].meta.debtCr, quote.debtCr, 'the yard should carry the exact note amount the UI disclosed');
  assert.equal(state.player.credits, 0, 'emergency refuel should not debit unavailable credits');
  assert.equal(state.player.debt, quote.debtCr, 'the economy owner should file the quote debt exactly once');
  assert.equal(state.fuel.current, 40, 'a production dock should wait for the yard to pump the queued fuel');
  assert.match(events.find((event) => event.name === 'toast' && /Refuel on the note/i.test(event.payload.text))?.payload.text || '',
    new RegExp(`${quote.amount}u .*${quote.debtCr} cr filed`, 'i'), 'the live economy response should disclose the queued reserve and debt');
}

function checkRefuelQuoteHandlesExactAndSufficientFunds() {
  const fullUnits = 100 - 40;
  const pricingState = baseState();
  const exactCost = Math.round(fullUnits * serviceUnitCr(pricingState, SERVICE_PRICES.fuelCrPerUnit, 'refuel'));
  const exactState = baseState({ player: { ...baseState().player, credits: exactCost } });
  const exactQuote = serviceQuote('refuel', exactState, playerShip());
  assert.equal(exactQuote.disabled, false, 'exactly enough credits should allow a full refuel quote');
  assert.equal(exactQuote.buttonLabel, 'Refuel', 'exact funds should not be mislabeled as partial');
  assert.equal(exactQuote.amount, fullUnits, 'exact funds should buy the full requested top-off');
  assert.equal(exactQuote.cost, exactCost, 'exact funds should be spent without rounding into an unfunded unit');

  const fundedState = baseState({ player: { ...baseState().player, credits: exactCost + 50 } });
  const fundedQuote = serviceQuote('refuel', fundedState, playerShip());
  assert.equal(fundedQuote.disabled, false, 'sufficient funds should leave refuel actionable');
  assert.equal(fundedQuote.amount, fullUnits, 'sufficient funds should offer the full top-off');
  assert.equal(fundedQuote.cost, exactQuote.cost, 'surplus credits should not change the service price');
}

function checkRefuelQuoteMarksFullTankAsNoOp() {
  const state = baseState({ fuel: { current: 100, max: 100 } });
  const quote = serviceQuote('refuel', state, playerShip());
  assert.equal(quote.disabled, true, 'a full tank should not offer another paid action');
  assert.equal(quote.buttonLabel, 'Full', 'a full tank should be presented as a completed no-op');
  assert.equal(quote.amount, 0, 'a full-tank quote should request no fuel');
  assert.equal(quote.cost, 0, 'a full-tank quote should charge nothing');
}

function checkRefuelQuoteBlocksDuplicateYardBooking() {
  const state = baseState({
    stationServices: { player: { stationId: 'station_helios', jobs: [{ type: 'refuel', total: 8, applied: 0 }] } },
  });
  const quote = serviceQuote('refuel', state, playerShip());
  assert.equal(quote.disabled, true, 'a second click while a refuel job is active should not book or charge again');
  assert.equal(quote.amount, 0, 'the duplicate booking should request no additional fuel');
  assert.match(quote.disabledReason, /already on your refuel job/i, 'the duplicate should explain that the yard is still working');
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
  assert.match(inactive.detail, /recovery on/i, 'insurance detail should name the priced hull recovery');
  assert.match(inactive.detail, /deductible/i, 'insurance detail should name the deductible it charges');
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
  assert.match(active.detail, /deductible/i, 'active insurance detail should preserve the deductible it covers');
  assert.match(active.detail, /cargo loss still applies/i, 'active insurance detail should preserve cargo-loss copy');
}

function checkInsuranceCancelIsConfirmed() {
  // This is a visible StationApp contract. serviceQuote only computes the active, free Cancel
  // quote; the live control must require an explicit confirmation before it emits ui:service.
  assert.match(stationAppSource, /vitalActHtml\('insurance'/,
    'the live Station vitals must expose the insurance action');
  assert.match(stationAppSource, /typeMap\s*=\s*\{[^}]*insurance:\s*'insurance'/,
    'the live Station must map the insurance vital to the canonical service type');
  assert.match(stationAppSource, /type === 'insurance'[\s\S]*confirm\(/,
    'active insurance cancellation must await the shared confirmation dialog');
  assert.match(stationAppSource, /title:\s*'Cancel hull insurance\?'/,
    'insurance cancellation confirmation must name the destructive action');
  assert.match(stationAppSource, /confirmLabel:\s*'Cancel Insurance'/,
    'insurance cancellation confirmation must name its destructive commit');
  assert.match(stationAppSource, /cancelLabel:\s*'Keep Insurance'/,
    'insurance cancellation confirmation must provide the safe escape');
  assert.match(stationAppSource, /if \(!ok\)[\s\S]{0,160}return;/,
    'declining insurance cancellation must return before a service intent is emitted');
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

function checkReadinessOffersEmergencyRefuelWhenBroke() {
  const state = baseState({
    fuel: { current: 10, max: 100 },
    player: { ...baseState().player, credits: 0 },
  });
  const rec = serviceReadinessRecommendation(state, playerShip({ hull: 100, armorHp: 60 }), ['refuel', 'repair']);
  assert.equal(rec.service, 'refuel', 'critical fuel should stay the first readiness concern');
  assert.equal(rec.type, 'refuel', 'the canonical emergency reserve should remain actionable from readiness');
  assert.equal(rec.amount, EMERGENCY_FUEL_U, 'readiness should carry the canonical emergency amount to the button');
  assert.equal(rec.actionLabel, 'Refuel on the Note', 'readiness should preserve the debt-financed action label');
  assert.match(rec.chips.map((chip) => chip.text).join(' '), /cr debt/i, 'readiness should surface the debt cost before the click');
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
checkRefuelQuoteOffersEmergencyNoteForZeroCredits();
checkEmergencyQuoteMatchesEconomyAndYardExecution();
checkRefuelQuoteHandlesExactAndSufficientFunds();
checkRefuelQuoteMarksFullTankAsNoOp();
checkRefuelQuoteBlocksDuplicateYardBooking();
checkPartialRepairQuoteSpendsOnlyCurrentCredits();
checkAmmoQuoteRespectsWalletAndCargo();
checkInsuranceQuoteShowsDeductibleGate();
checkInsuranceCancelIsConfirmed();
checkReadinessRecommendsPartialRefuel();
checkReadinessOffersEmergencyRefuelWhenBroke();
checkReadinessPrefersCriticalRepair();
checkReadinessSurfacesUnavailableRefuel();
checkReadinessAllClear();

console.log('Services readiness checks OK');
