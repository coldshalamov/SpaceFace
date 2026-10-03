// Research F (ADMITTED_REPAIRS §F) — crafting respects custody and source capacity.
//
//   P02: preflight and the displayed "have" count the cargo-owned FREE quantity — sealed
//        contract freight and persistent story cargo ride in the hold but can never feed a
//        fabricator. Refusal lands before any mutation; the low-level removeCargo stays
//        usable for legitimate mission handovers.
//   P03: before consuming an exact FITTED source, the gate uses canonical post-input-
//        consumption ship capacity — eating a cargo pod off the flown hull shrinks the
//        hold under the load it carried. Loose duplicates, non-capacity sources and
//        inactive-ship sources keep working; the product lands in inventory, never
//        auto-fitted.

import test from 'node:test';
import assert from 'node:assert/strict';

import { crafting } from '../src/systems/crafting.js';
import { addCargo, removeCargo, reservedCargoQuantity } from '../src/systems/cargo.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SHIPS } from '../src/data/ships.js';
import { BLUEPRINT_BY_ID } from '../src/data/blueprints.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));

function sealedDelivery(cmdtyId, qty) {
  return {
    id: `m_sealed_${cmdtyId}`,
    type: 'cargo_delivery',
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId, qty },
  };
}

/** Minimal boot: crafting + a real ships system so the fitted-source path runs production code. */
function boot({ shipDefId = 'ship_mule', seed = 4242 } = {}) {
  const state = createGameState(seed);
  state.playerId = 1;
  state.missions = state.missions && Array.isArray(state.missions.active) ? state.missions : { active: [] };
  state.player.moduleInventory = [];
  state.player.ownedShips = [{
    defId: shipDefId,
    fittings: Array(buildSlotList(SHIP_BY_ID.get(shipDefId)).length).fill(null),
    fittedInstances: {},
  }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  const ships = Object.assign({}, shipsProto);
  ships.init({ state, bus, helpers: {} });
  const inst = Object.create(crafting);
  inst.init({ state, bus, registry: { get: (name) => (name === 'ships' ? ships : null) } });
  return { state, bus, ships, inst, toasts };
}

function slotIndexOfType(shipDefId, type) {
  return buildSlotList(SHIP_BY_ID.get(shipDefId)).findIndex((slot) => slot.type === type);
}

test('P02: a fully sealed input refuses before any mutation; the low-level remover still serves a handover', () => {
  const { state, inst, toasts } = boot();
  // Refine Metals: 3 iron + 1 titanium -> 2 refined metals (instant). All 3 held iron are sealed
  // manifest freight for an active delivery, so the FREE count is 0 — the six-fuel-cell overlap
  // shape (contract units matching a recipe need) must be a recoverable shortage, not a softlock.
  state.missions.active.push(sealedDelivery('cmdty_ore_iron', 3));
  state.player.cargo.capVolume = 40;
  addCargo(state, 'cmdty_ore_iron', 3);
  addCargo(state, 'cmdty_ore_titanium', 1);

  const before = { ...state.player.cargo.items };
  assert.equal(inst.build('bp_refine_metals', 'station_helios'), false, 'all-sealed inputs refuse');
  assert.deepEqual(state.player.cargo.items, before, 'a refused build consumes nothing');
  assert.equal(state.player.cargo.usedVolume, 4, 'used volume untouched');
  assert.equal(Object.keys(state.crafting.queues).length, 0, 'no job is enqueued');
  assert.equal(state.player.moduleInventory.length, 0);
  assert.equal(toasts.at(-1).text, 'Need 3 Iron Ore for Refine Metals',
    'the refusal names the free-quantity shortfall');

  // The low-level remover is intentionally NOT sealed-gated: missions deliver through it.
  assert.equal(removeCargo(state, 'cmdty_ore_iron', 3), 3, 'the writer still serves a manifest handover');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, undefined);
});

test('P02: a sealed lot plus own units spends only the free units and leaves the reservation usable', () => {
  const { state, inst } = boot();
  state.missions.active.push(sealedDelivery('cmdty_ore_iron', 3));
  state.player.cargo.capVolume = 40;
  addCargo(state, 'cmdty_ore_iron', 6); // 3 sealed + 3 the player's own
  addCargo(state, 'cmdty_ore_titanium', 1);

  assert.equal(inst.build('bp_refine_metals', 'station_helios'), true, 'free units cover the recipe');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 3,
    'exactly the sealed remainder survives the swap');
  assert.equal(state.player.cargo.items.cmdty_refined_metals, 2);
  assert.equal(reservedCargoQuantity(state, 'cmdty_ore_iron'), 3,
    'the delivery claim still holds its units');
});

test('P03: a fitted capacity-bearing source refuses atomically when the hold would overflow', () => {
  const { state, inst, toasts } = boot();
  const p = state.player;
  p.researchedNodes = ['tech_bulk_logistics'];
  // Mule base cargo 1500 + Cargo Pod M (cargoFlat +50) fitted = 1550 working capacity.
  const cargoSlot = slotIndexOfType('ship_mule', 'cargo');
  assert.ok(cargoSlot >= 0);
  p.moduleInventory.push({ instanceId: 'mi_pod', defId: 'mod_cargo_pod_m' });
  assert.equal(inst._ships.fitModule({ shipIndex: 0, slotIndex: cargoSlot, instanceId: 'mi_pod' }), true);

  // Inputs for bp_aug_cargopod_m_to_l free 5.5 vol (hullplate 3×0.7, alloys 2×0.5, polymers 2×1.2);
  // alloy ballast stands in for unrelated freight filling the hold.
  p.cargo.capVolume = 1550;
  addCargo(state, 'cmdty_comp_hullplate', 3);
  addCargo(state, 'cmdty_polymers', 2);
  addCargo(state, 'cmdty_alloys', 3011); // 2 needed + 3009 ballast → used = 5.5 + 1504.5 = 1510

  assert.equal(inst.build('bp_aug_cargopod_m_to_l', 'station_helios'), false,
    'post-input load 1504.5 exceeds the post-consumption cap 1500');
  assert.equal(state.player.ownedShips[0].fittings[cargoSlot], 'mod_cargo_pod_m',
    'the fitted source is still installed — the refusal mutated nothing');
  assert.equal(state.player.cargo.items.cmdty_alloys, 3011);
  assert.equal(state.player.cargo.items.cmdty_comp_hullplate, 3);
  assert.equal(Object.keys(state.crafting.queues).length, 0, 'no half-written job');
  assert.ok(toasts.some((t) => /overflow the hold/i.test(t.text)),
    'the refusal names the fitted source as the reason');
});

test('P03: just-below-cap fitted consumption commits and the L expander lands in inventory, not the slot', () => {
  const { state, inst } = boot();
  const p = state.player;
  p.researchedNodes = ['tech_bulk_logistics'];
  const cargoSlot = slotIndexOfType('ship_mule', 'cargo');
  p.moduleInventory.push({ instanceId: 'mi_pod', defId: 'mod_cargo_pod_m' });
  assert.equal(inst._ships.fitModule({ shipIndex: 0, slotIndex: cargoSlot, instanceId: 'mi_pod' }), true);

  p.cargo.capVolume = 1550;
  addCargo(state, 'cmdty_comp_hullplate', 3);
  addCargo(state, 'cmdty_polymers', 2);
  addCargo(state, 'cmdty_alloys', 3002); // used 1505.5 → post-input load exactly 1500 = post cap

  assert.equal(inst.build('bp_aug_cargopod_m_to_l', 'station_helios'), true,
    'post-input load equal to post-consumption capacity still fits');
  assert.equal(state.player.ownedShips[0].fittings[cargoSlot], null,
    'the fitted source was consumed out of its slot');
  assert.ok(state.crafting.queues.station_helios, 'the timed augment is queued');

  inst.update(40, state); // augment default 35s → completes
  assert.equal(state.crafting.queues.station_helios, null);
  assert.equal(p.moduleInventory.filter((m) => m && m.defId === 'mod_cargo_expander_l').length, 1,
    'the L expander lands in module inventory after the timed job');
  assert.equal(state.player.ownedShips[0].fittings.filter((f) => f === 'mod_cargo_expander_l').length, 0,
    'the product is never auto-fitted into the emptied slot');
});

test('P03: a loose duplicate answers the recipe even when the hold is full to the pod-boosted cap', () => {
  const { state, inst } = boot();
  const p = state.player;
  p.researchedNodes = ['tech_bulk_logistics'];
  const cargoSlot = slotIndexOfType('ship_mule', 'cargo');
  p.moduleInventory.push({ instanceId: 'mi_fitted', defId: 'mod_cargo_pod_m' });
  assert.equal(inst._ships.fitModule({ shipIndex: 0, slotIndex: cargoSlot, instanceId: 'mi_fitted' }), true);
  p.moduleInventory.push({ instanceId: 'mi_loose', defId: 'mod_cargo_pod_m' });

  p.cargo.capVolume = 1550;
  addCargo(state, 'cmdty_comp_hullplate', 3);
  addCargo(state, 'cmdty_polymers', 2);
  addCargo(state, 'cmdty_alloys', 3089); // hold at the brim — but no fitted consume happens

  assert.equal(inst.build('bp_aug_cargopod_m_to_l', 'station_helios'), true,
    'a loose source never touches hold capacity');
  assert.equal(state.player.ownedShips[0].fittings[cargoSlot], 'mod_cargo_pod_m',
    'the fitted twin stays installed');
  assert.equal(p.moduleInventory.some((m) => m && m.instanceId === 'mi_loose'), false,
    'the loose duplicate is the one consumed');
});

test('P03: a source fitted on an inactive ship does not gate the flown hold', () => {
  const { state, inst } = boot();
  const p = state.player;
  p.researchedNodes = ['tech_bulk_logistics'];
  const cargoSlot = slotIndexOfType('ship_mule', 'cargo');
  // The pod rides a parked second hull; the flown ship's hold is only its own capacity.
  p.ownedShips.push({
    defId: 'ship_mule',
    fittings: Array(buildSlotList(SHIP_BY_ID.get('ship_mule')).length).fill(null),
    fittedInstances: {},
  });
  p.ownedShips[1].fittings[cargoSlot] = 'mod_cargo_pod_m';
  p.ownedShips[1].fittedInstances[cargoSlot] = { instanceId: 'mi_parked', defId: 'mod_cargo_pod_m' };

  p.cargo.capVolume = 1500;
  addCargo(state, 'cmdty_comp_hullplate', 3);
  addCargo(state, 'cmdty_polymers', 2);
  addCargo(state, 'cmdty_alloys', 3000); // flown hold effectively full at its own cap

  assert.equal(inst.build('bp_aug_cargopod_m_to_l', 'station_helios'), true,
    'consuming a pod off a parked hull cannot overflow the flown hold');
  assert.equal(p.ownedShips[1].fittings[cargoSlot], null);
});

test('P03: a fitted non-capacity source augments fine under a full hold', () => {
  const { state, inst } = boot();
  const p = state.player;
  p.researchedNodes = ['tech_deflector_theory'];
  const shieldSlot = slotIndexOfType('ship_mule', 'shield');
  p.moduleInventory.push({ instanceId: 'mi_boost', defId: 'mod_shield_booster_s' });
  assert.equal(inst._ships.fitModule({ shipIndex: 0, slotIndex: shieldSlot, instanceId: 'mi_boost' }), true);

  p.cargo.capVolume = 1500;
  addCargo(state, 'cmdty_comp_circuitry', 2);
  addCargo(state, 'cmdty_alloys', 2);
  addCargo(state, 'cmdty_quantum_cores', 1);
  addCargo(state, 'cmdty_ore_iron', 1490); // brim-full hold; the shield source carries no capacity

  assert.equal(inst.build('bp_aug_shield_s_to_m', 'station_helios'), true,
    'removing a non-cargo source cannot overflow the hold');
});
