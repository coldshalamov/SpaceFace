// PB-SLICE-A / SF-286 — first victory becomes the first useful wreck.
// Equivalent-feature gate: verify the shipped ordinary route end-to-end across the real
// owners (kill → aftermath marker → immediate wreck → salvage decision → custody → sale →
// a modest existing upgrade → the capability fits the next outing). Assertions land on
// authoritative results, not callbacks.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { mining } from '../src/systems/mining.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { ships, buildSlotList } from '../src/systems/ships.js';
import { actionForWreck } from '../src/data/salvageActions.js';
import { SHIPS } from '../src/data/ships.js';

const SEED = 28601;
const SECTOR_ID = 'sector_ceres_belt';
const SALE_STATION = 'station_ceres';
const UPGRADE_STATION = 'station_helios';
const COMMODITY = 'cmdty_food';
const MODEST_UPGRADE = 'mod_cargo_scanner_s'; // 4000 cr, utility S, no tech gate

function bootFirstFight() {
  const sim = createSimulation({
    seed: SEED,
    systems: [aftermathWrecks, salvageActions, mining, cargo, economy, ships],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 600;
  state.world.currentSectorId = SECTOR_ID;
  state.player.credits = 1200;
  state.player.heat = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 80 };
  state.player.moduleInventory = [];
  state.player.researchedNodes = [];
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [null, null, null, null, null, null, null] }];
  state.player.activeShipIndex = 0;

  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 140, hullMax: 140, radius: 14,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

function killHostileHauler({ sim, state, bus, player }) {
  const hauler = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach',
    pos: { x: 200, z: 60 }, vel: { x: 3, z: -1 },
    radius: 12, mass: 140, hull: 40, hullMax: 100,
    data: {
      role: 'hauler', shipClass: 'hauler',
      ai: { lawful: false },
      bountyCr: 220,
      cargoManifest: {
        manifestId: 'fm_first_victory',
        freighterKey: 'first:hauler:0',
        role: 'hauler',
        originStationId: 'station_beltout',
        destStationId: SALE_STATION,
        lines: [{ commodityId: COMMODITY, qty: 8 }],
        totalQty: 8,
      },
    },
  });
  hauler.alive = false;
  bus.emit('entity:killed', {
    id: hauler.id, killerId: player.id, type: 'ship', sectorId: SECTOR_ID,
    pos: { x: hauler.pos.x, z: hauler.pos.z },
    vel: { x: hauler.vel.x, z: hauler.vel.z },
    targetHostileToPlayer: true, factionLawful: false, bountyCr: 220,
  });
  return hauler;
}

test('SF-286: one early fight → useful wreck → salvage → custody → sale → modest upgrade', () => {
  const ctx = bootFirstFight();
  const { sim, state, bus } = ctx;
  const hauler = killHostileHauler(ctx);

  // The salvage-verb annotation pass runs on the system tick — step so the wreck has been
  // annotated exactly as it would be on the ordinary route.
  for (let i = 0; i < 30; i += 1) sim.step(1 / 60);

  // 1. The defeated body enters the aftermath path immediately: a live wreck bound to a
  //    durable marker, not a despawned encounter prop.
  const wreck = state.entityList.find((e) => e && e.alive !== false && e.type === 'wreck'
    && e.data && e.data.markerId && e.data.provenance);
  assert.ok(wreck, 'the kill materializes a live wreck');
  assert.ok(wreck.data.markerId, 'the wreck is bound to a durable aftermath marker');
  assert.ok(wreck.data.salvagePool && typeof wreck.data.salvagePool === 'object', 'the wreck carries a pool');
  assert.ok(
    (wreck.data.salvagePool[COMMODITY] || 0) > 0,
    `the pool is traceable to the body — residue of the victim's own ${COMMODITY} freight, not a generic drop`,
  );
  // The marker owns the pool by reference — partial salvage writes through to the durable
  // record instead of forking an anonymous pool.
  const marker = sim.registry.get('aftermathWrecks')._markerById(wreck.data.markerId);
  assert.ok(marker, 'the bound marker exists');
  assert.equal(wreck.data.salvagePool, marker.salvagePool,
    'the live wreck pool IS the marker pool — the annotation pass must not detach it');

  // 2. A tangible salvage decision: the wreck resolves a named salvage verb through the
  //    shipped annotation path, and the pool itself is the player's to take or leave.
  const action = actionForWreck(wreck);
  assert.ok(action && action.id, 'the wreck surfaces a distinct salvage action');
  assert.ok(
    wreck.data.provenance && (wreck.data.provenance.victimLabel || wreck.data.provenance.killerId != null
      || (wreck.data.provenance.freightIdentity && wreck.data.provenance.freightIdentity.manifestId)),
    'the wreck remembers whose body it was',
  );

  // 3. Work the wreck with the shipped beam cut → a payload entity carrying the pool.
  const miningSys = sim.registry.get('mining');
  const payloadBefore = state.entityList.filter((e) => e && e.type === 'payload').length;
  miningSys._applyCut(ctx.player, wreck, { dps: 80 }, 80, 1);
  const payload = state.entityList.find((e) => e && e.alive !== false && e.type === 'payload'
    && e.data && e.data.salvagePool && Object.keys(e.data.salvagePool).length > 0);
  assert.ok(state.entityList.filter((e) => e && e.type === 'payload').length > payloadBefore,
    'a beam cut yields a salvage payload');
  assert.ok(payload, 'the payload carries the recovered goods');

  // 4. Custody: overlap collection routes the goods through pickup:collected → cargo hold.
  const cargoSys = sim.registry.get('cargo');
  void cargoSys;
  const collected = miningSys._collectPayload(payload, ctx.player);
  assert.equal(collected, true, 'the player takes custody');
  assert.ok(
    Object.keys(state.player.cargo.items).length > 0,
    'the hold actually gained the recovered commodities',
  );

  // 5. Sale: the recovered value lands through economy.execute at a real station.
  const econ = sim.registry.get('economy');
  econ.ensureMarket(SALE_STATION);
  const creditsBefore = state.player.credits;
  const sellable = Object.entries(state.player.cargo.items)
    .find(([, qty]) => qty > 0);
  assert.ok(sellable, 'there is something recovered to sell');
  const sale = econ.execute(SALE_STATION, sellable[0], 'sell', sellable[1]);
  assert.equal(sale.ok, true, 'the recovered goods sell');
  assert.ok(state.player.credits > creditsBefore, 'the sale pays out');
  assert.equal(state.player.heat, 0, 'honest salvage of a hostile hauler writes no heat');

  // 6. The modest existing upgrade: dock at the shipyard station and buy a tier-1 module
  //    through the ships-owned purchase path (economy sole-writes the charge).
  state.ui.docked = true;
  state.ui.dockedStationId = UPGRADE_STATION;
  state.player.credits = 6000;
  const shipsSys = sim.registry.get('ships');
  const bought = shipsSys.buyModule({ defId: MODEST_UPGRADE });
  assert.equal(bought, true, 'the shipyard sells the modest upgrade');
  assert.equal(state.player.credits, 2000, 'the purchase charges real credits');
  assert.ok(
    state.player.moduleInventory.some((item) => item.defId === MODEST_UPGRADE),
    'the module is in inventory for the next outing',
  );

  // 7. The capability actually fits the starter hull: the Hitch carries a utility S slot.
  const kestrel = SHIPS.find((s) => s.id === 'ship_kestrel');
  const utilitySlot = buildSlotList(kestrel).find((s) => s.type === 'utility' && s.size === 'S');
  assert.ok(utilitySlot, 'the starter hull has the slot the upgrade needs');
  const equipped = shipsSys.fitModule({
    shipIndex: 0, slotIndex: utilitySlot.index,
    instanceId: state.player.moduleInventory.find((i) => i.defId === MODEST_UPGRADE).instanceId,
  });
  assert.equal(equipped, true, 'the upgrade fits the starter hull — the loop closes into the next outing');
});

test('SF-286 refusal: ignoring the wreck leaves it, persistent and playable', () => {
  const ctx = bootFirstFight();
  const { sim, state } = ctx;
  const hauler = killHostileHauler(ctx);
  const wreck = state.entityList.find((e) => e && e.alive !== false && e.type === 'wreck' && e.data && e.data.markerId);
  assert.ok(wreck, 'the wreck exists whether or not the player cares');
  const marker = sim.registry.get('aftermathWrecks')._markerById(wreck.data.markerId);
  assert.ok(marker, 'a durable marker outlives the choice to walk away');
  assert.equal(state.player.heat, 0, 'walking away is not a crime');
});

test('SF-286 bound-pool legality remap is idempotent across re-annotation', () => {
  const ctx = bootFirstFight();
  const { sim, state, bus } = ctx;
  // A military victim binds a restricted wreck — electronics must remap to classified exactly
  // once, not mint +1 every time a materialization/annotation pass re-runs.
  const cutter = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach',
    pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 200, hull: 40, hullMax: 120,
    data: { role: 'warship', shipClass: 'military_patrol' },
  });
  cutter.alive = false;
  bus.emit('entity:killed', {
    id: cutter.id, killerId: ctx.player.id, type: 'ship', sectorId: SECTOR_ID,
    pos: { x: cutter.pos.x, z: cutter.pos.z }, vel: { x: 0, z: 0 },
    targetHostileToPlayer: true, factionLawful: false,
  });
  for (let i = 0; i < 30; i += 1) sim.step(1 / 60);

  const wreck = state.entityList.find((e) => e && e.alive !== false && e.type === 'wreck'
    && e.data && e.data.markerId && e.data.parentType === 'military');
  assert.ok(wreck, 'the military kill binds a restricted wreck');
  const afterFirst = { ...wreck.data.salvagePool };
  assert.ok(
    (afterFirst.cmdty_classified_salvage || 0) > 0,
    'the restricted remap already ran — the idempotence assertion below is discriminating',
  );

  const actionsSys = sim.registry.get('salvageActions');
  for (let i = 0; i < 5; i += 1) actionsSys._annotate(wreck);
  assert.deepEqual(
    wreck.data.salvagePool, afterFirst,
    're-annotating a bound wreck changes nothing — the durable marker pool is not a mint',
  );
  const marker = sim.registry.get('aftermathWrecks')._markerById(wreck.data.markerId);
  assert.equal(wreck.data.salvagePool, marker.salvagePool,
    'the bound pool still shares identity with the marker after repeated passes');
});
