// AL-LG-11 — three player-caused rams mint ONE Scarred Ram Plate bound to the hull that did
// them, and the identical twin lacks it. Row 401 · seed 4242. This is the compact catalog-bar
// pin; the full spec seam (save/continue, presets, souvenirs, impound carry, naming collisions)
// is test/al-long-3-scarred-ram-plate-4242.test.mjs.
//
//   node --test test/al-lg-11-scarred-ram-plate-4242.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import {
  buildSlotList,
  normalizeRamPlateHistory,
  ships as shipsProto,
} from '../src/systems/ships.js';

const SEED = 4242;
const KESTREL = 'ship_kestrel';
const SCARRED = 'mod_ram_plate_scarred';
const PLAYER_ID = 1;
const RAM_TARGET_ID = 2;

const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const SCARRED_DEF = MODULES.find((def) => def.id === SCARRED);
const KESTREL_SLOTS = buildSlotList(SHIP_BY_ID.get(KESTREL));
const UTILITY_SLOT = KESTREL_SLOTS.findIndex((slot) => slot.type === 'utility' && slot.size === 'S');

function hullRecord() {
  return {
    defId: KESTREL,
    fittings: new Array(KESTREL_SLOTS.length).fill(null),
    fittedInstances: {},
  };
}

function playerEntity() {
  return {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 60,
    hull: 480,
    hullMax: 480,
    flags: {},
    data: { defId: KESTREL, fittings: [], derived: {} },
  };
}

/** One live world: two owned copies of the SAME hull def, the player flying berth 0. */
function world() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.playerId = PLAYER_ID;
  state.player.credits = 100_000;
  state.player.moduleInventory = [];
  state.player.loadoutPresets = [];
  state.player.ownedShips = [hullRecord(), hullRecord()];
  state.player.activeShipIndex = 0;
  const player = playerEntity();
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  const ships = Object.create(shipsProto);
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, toasts };
}

/** One committed player-caused ram through the canonical receipt channel. */
function recordRam(w, tick, { targetId = RAM_TARGET_ID } = {}) {
  w.state.tick = tick;
  w.bus.emit('combat:collisionConsequence', {
    tick,
    targetId,
    otherId: PLAYER_ID,
    targetType: 'ship',
    targetHostile: true,
    damageApplied: true,
    impactDamage: 24,
    provenance: { actorId: PLAYER_ID, weaponId: null, tag: 'direct_contact', appliedTick: tick },
  });
}

function scarredItems(state) {
  return (state.player.moduleInventory || []).filter((item) => item && item.defId === SCARRED);
}

test('three player-caused rams mint exactly ONE bound plate on the hull that did them', () => {
  const w = world();
  recordRam(w, 600);
  recordRam(w, 606);
  assert.equal(scarredItems(w.state).length, 0, 'two rams is not yet the deed');
  recordRam(w, 612);
  const minted = scarredItems(w.state);
  assert.equal(minted.length, 1, 'the third ram mints one plate — not a stack');
  const history = normalizeRamPlateHistory(w.state.player.ownedShips[0].ramPlateHistory);
  assert.equal(history.rewardInstanceId, minted[0].instanceId, 'the record binds THE minted copy');
  // A fourth ram and a replayed receipt mint nothing more.
  recordRam(w, 618);
  w.bus.emit('combat:collisionConsequence', {
    tick: 612, targetId: RAM_TARGET_ID, otherId: PLAYER_ID, targetType: 'ship',
    targetHostile: true, damageApplied: true, impactDamage: 24,
    provenance: { actorId: PLAYER_ID, weaponId: null, tag: 'direct_contact', appliedTick: 612 },
  });
  w.state.tick = 624;
  assert.equal(scarredItems(w.state).length, 1, 'no second plate, ever');
  assert.ok(w.toasts.some((t) => /Scarred Ram Plate earned/.test(t.text)));
  // The twin hull has no record at all.
  assert.equal(w.state.player.ownedShips[1].ramPlateHistory, undefined);
});

test('the twin hull lacks the plate: its fitting check refuses what the earning hull accepts', () => {
  const w = world();
  recordRam(w, 600);
  recordRam(w, 606);
  recordRam(w, 612);
  const bound = scarredItems(w.state)[0].instanceId;

  // The twin: same def, same slots, no deeds — refused at the blocker check and at the fit,
  // even naming the earning hull's bound instance (moduleInventory is shared; the hull is not).
  const twinBlocker = w.ships.moduleFitBlocker({ shipIndex: 1, slotIndex: UTILITY_SLOT, def: SCARRED_DEF });
  assert.equal(twinBlocker && twinBlocker.reason, 'hull_history_required');
  assert.equal(w.ships.fitModule({ shipIndex: 1, slotIndex: UTILITY_SLOT, instanceId: bound }), false);
  // The earning hull's own check clears, and THE bound instance fits.
  const earnerBlocker = w.ships.moduleFitBlocker({ shipIndex: 0, slotIndex: UTILITY_SLOT, def: SCARRED_DEF });
  assert.equal(earnerBlocker, null, `earning hull should accept the plate, got ${earnerBlocker && earnerBlocker.reason}`);
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: bound }), true);
});
