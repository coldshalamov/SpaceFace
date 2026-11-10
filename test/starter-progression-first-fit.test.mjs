// Starter progression (SR-01): the Hitch's first useful fit is earned, understood and really fitted.
// Pure guidance reads a fixture board row shaped like missions._injectStarterJob's; the transaction
// half drives the production ships owner through ui:buyModule.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { STARTER_JOBS } from '../src/data/starterJobs.js';
import { buildSlotList, getDerivedStats, ships as shipsPrototype, stationShopOffer } from '../src/systems/ships.js';
import {
  describeOutfittingPurchase,
  outfittingJobImpact,
  outfittingWorkDirection,
  recommendOutfittingPurchase,
} from '../src/ui/station/outfittingGuidance.js';
import { describeOutfittingSpendConfirm } from '../src/ui/outfittingSpendConfirm.js';

const SWING_S = MODULES.find((d) => d.id === 'mod_swing_drive_s');
const KESTREL = SHIPS.find((s) => s.id === 'ship_kestrel');
const SLOTS = buildSlotList(KESTREL);
const STARTER_FIT = ['wpn_pulse_laser_s', 'mod_shield_booster_s', 'mod_engine_ion_m', null, 'mod_mining_laser_s', 'mod_drill_amp', null];
const UTIL = STARTER_FIT.indexOf('mod_drill_amp');
const HITCH_JOB = STARTER_JOBS.find((j) => j.requiredModule === 'mod_drill_amp');

function harness(credits = NEW_GAME.credits) {
  const state = createGameState(4242);
  state.player.credits = credits;
  state.player.researchedNodes = [];
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: STARTER_FIT.slice() }];
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [];
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.missions = state.missions || {};
  state.missions.active = [];
  state.missions.boards = {
    station_helios: { slots: [{
      id: `starter-${HITCH_JOB.id}-1`, title: HITCH_JOB.steps[0].title, source: 'starterJob', riskTier: 0,
      reward_cr: HITCH_JOB.steps[0].rewardCr, params: { requiredModule: 'mod_drill_amp', starterJobId: HITCH_JOB.id, starterStep: 1 },
    }] },
  };
  const bus = createBus();
  const events = [];
  for (const ev of ['module:purchased', 'module:equipped', 'module:fitRefused', 'economy:chargeCredits']) {
    bus.on(ev, (p) => events.push({ ev, p }));
  }
  bus.on('economy:chargeCredits', ({ amount }) => { state.player.credits -= amount; });
  const ships = Object.assign({}, shipsPrototype, { _instSeq: 0 });
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, events };
}

test('starter-progression: the Helios rack is earned — the stake alone falls short, one raider bounty clears it', () => {
  const offer = stationShopOffer(SWING_S, 'station_helios');
  assert.ok(offer.price > NEW_GAME.credits, 'the first fit must be earned, not handed over');
  assert.ok(offer.price <= NEW_GAME.credits + 120, 'the opening raider bounty alone closes the gap');
  assert.ok(offer.price <= NEW_GAME.credits + HITCH_JOB.steps[0].rewardCr, 'one Hitch starter step closes it');
  assert.ok(offer.price < SWING_S.price && SWING_S.requiresTech, 'the rack undercuts the catalog; elsewhere research stands');
  assert.ok(SLOTS[UTIL] && SLOTS[UTIL].type === 'utility' && SLOTS[UTIL].size === 'S');
});

test('starter-progression: short of the price, the row names the shortfall and real work here', () => {
  const { state } = harness();
  const view = describeOutfittingPurchase(SWING_S, state.player, SLOTS, STARTER_FIT, KESTREL,
    { stationId: 'station_helios', state });
  const shortfall = stationShopOffer(SWING_S, 'station_helios').price - NEW_GAME.credits;
  assert.equal(view.state, 'funding');
  assert.equal(view.label, `Need ${shortfall} cr`);
  assert.match(view.title, new RegExp(HITCH_JOB.steps[0].title));
  assert.match(view.title, /pays 420 cr on this board/);
  assert.doesNotMatch(view.title, /get more money|Run a contract or trade loop/i);

  // A tracked job outranks the board.
  state.missions.active.push({ id: 'm1', title: 'Haul Fuel Cells to Ceres', reward_cr: 900, status: 'active' });
  state.ui.trackedMissionId = 'm1';
  assert.match(outfittingWorkDirection(state, shortfall), /^Finish Haul Fuel Cells to Ceres \(\+900 cr\) to cover it\./);

  // The recommendation keeps one earning direction, not a second generic tail.
  const rec = recommendOutfittingPurchase(state.player, SLOTS, STARTER_FIT,
    { items: [SWING_S], shipDef: KESTREL, stationId: 'station_helios', state });
  assert.match(rec.detail, /Finish Haul Fuel Cells/);
  assert.doesNotMatch(rec.detail, /Run a contract or trade loop/);
});

test('starter-progression: no runnable board work falls back to the Market and the board, still concrete', () => {
  const { state } = harness();
  state.player.ownedShips[0].fittings[UTIL] = null; // drill amp gone: the starter row is not runnable
  const text = outfittingWorkDirection(state, 100);
  assert.match(text, /Market/);
  assert.match(text, /haul, bounty or survey/);
});

test('starter-progression: replacing the drill amp names the starter job it pauses; confirm says Replace', () => {
  const { state } = harness();
  const impact = outfittingJobImpact(state, SWING_S, 'mod_drill_amp');
  assert.match(impact, new RegExp(`${HITCH_JOB.steps[0].title} needs Drill Amp`));
  assert.match(impact, /refuse it until you refit it from inventory/);
  state.missions.active.push({ id: 's1', title: HITCH_JOB.steps[0].title, status: 'active', reward_cr: 420, params: { requiredModule: 'mod_drill_amp' } });
  assert.match(outfittingJobImpact(state, SWING_S, 'mod_drill_amp'), /stops progressing until you refit/);
  assert.equal(outfittingJobImpact(state, SWING_S, null), '', 'filling an empty slot touches no job');

  const confirm = describeOutfittingSpendConfirm(SWING_S, 5172, {
    fitSlotIndex: UTIL, price: 5100, replacesName: 'Drill Amp', jobImpact: impact,
  });
  assert.equal(confirm.confirmLabel, 'Buy & Replace');
  assert.match(confirm.body, /Cost: 5,100 CR\. Replaces Drill Amp on confirmation; Drill Amp goes to module inventory\./);
  assert.match(confirm.body, /needs Drill Amp/);
  const inventoryOnly = describeOutfittingSpendConfirm(SWING_S, 5172, { price: 5100 });
  assert.equal(inventoryOnly.confirmLabel, 'Buy');
  assert.match(inventoryOnly.body, /Goes to module inventory/);
});

test('starter-progression: Buy & Replace charges once, displaces the drill amp to inventory and fits a live Swing Drive', () => {
  const { state, bus, events } = harness(5172);
  const price = stationShopOffer(SWING_S, 'station_helios').price;
  bus.emit('ui:buyModule', { defId: SWING_S.id, fitSlotIndex: UTIL, expectedPrice: price, hullDefId: 'ship_kestrel' });
  const fit = state.player.ownedShips[0].fittings;
  assert.equal(fit[UTIL], SWING_S.id);
  assert.equal(state.player.credits, 5172 - price);
  assert.deepEqual(state.player.moduleInventory.map((m) => m.defId), ['mod_drill_amp'], 'displaced, not destroyed');
  assert.equal(events.filter((e) => e.ev === 'economy:chargeCredits').length, 1);
  assert.equal(getDerivedStats('ship_kestrel', fit, state.player).swingDrive, true, 'the capability is live in derived stats');

  // A repeated click cannot buy a second one on the remaining 72 CR, and charges nothing.
  bus.emit('ui:buyModule', { defId: SWING_S.id, fitSlotIndex: UTIL, expectedPrice: price, hullDefId: 'ship_kestrel' });
  assert.equal(events.filter((e) => e.ev === 'economy:chargeCredits').length, 1);
  assert.equal(events.at(-1).ev, 'module:fitRefused');
  assert.equal(events.at(-1).p.reason, 'insufficient_credits');
  assert.equal(state.player.credits, 5172 - price);
});

test('starter-progression: a stale quote or a different viewed hull refuses before any charge', () => {
  const { state, bus, events } = harness(9000);
  bus.emit('ui:buyModule', { defId: SWING_S.id, fitSlotIndex: UTIL, expectedPrice: 7400, hullDefId: 'ship_kestrel' });
  bus.emit('ui:buyModule', { defId: SWING_S.id, fitSlotIndex: UTIL, expectedPrice: 5100, hullDefId: 'ship_drifter' });
  assert.deepEqual(events.map((e) => e.p.reason), ['price_changed', 'different_hull']);
  assert.equal(state.player.credits, 9000);
  assert.equal(state.player.ownedShips[0].fittings[UTIL], 'mod_drill_amp');
});
