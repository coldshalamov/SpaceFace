import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CARGO_SLOTS,
  fillSlots,
  freeSlotCount,
  packItemsIntoSlots,
  slotCountForCargoCap,
  slotUnitsFit,
  unitsPerSlotForDef,
} from '../src/data/cargoSlots.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  addCargo,
  addSalvage,
  cargo,
  ensureSlots,
  mergeCargoStacks,
  moveCargoStack,
  removeCargo,
  splitCargoStack,
  sortCargoBag,
  slotFitFor,
} from '../src/systems/cargo.js';
import { MIGRATIONS } from '../src/save/migrations.js';

const ORDINARY = 'cmdty_ore_iron';      // stack 20
const BULKY = 'cmdty_ice_water';        // stack 10
const NEVER = 'cmdty_live_specimen';    // stack 1
const PERSISTENT = 'cmdty_unclassified_composite';

function createHarness({ withShip = false } = {}) {
  const state = createGameState(31);
  state.playerId = 1;
  if (withShip) {
    const player = {
      id: 1, type: 'ship', alive: true, team: 0,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 18, radius: 4, flags: {},
    };
    state.entities.set(1, player);
    state.entityList = [player];
  }
  return { state, bus: createBus(), helpers: {} };
}

function heldQty(state, id) {
  return state.player.cargo.items[id] || 0;
}

function totalUnits(slots, id) {
  return (slots || []).filter((s) => s.commodityId === id).reduce((n, s) => n + s.qty, 0);
}

// ---------------------------------------------------------------------------
// Part A — slot law: counts, stack sizes, packing
// ---------------------------------------------------------------------------

test('slot count derives from hull capacity, rounds to rows of four, and respects bounds', () => {
  assert.equal(slotCountForCargoCap(250), 12);          // 250u → 12.5 slots → 12 (3 whole rows)
  assert.equal(slotCountForCargoCap(200), 12);          // 200u → 10 → 3 rows of four
  assert.equal(slotCountForCargoCap(1), CARGO_SLOTS.minSlots);
  assert.equal(slotCountForCargoCap(99999), CARGO_SLOTS.maxSlots);
  assert.equal(slotCountForCargoCap(0), CARGO_SLOTS.minSlots);
  assert.equal(slotCountForCargoCap(NaN), CARGO_SLOTS.minSlots);
  for (const cap of [80, 100, 160, 240, 320, 500]) {
    assert.equal(slotCountForCargoCap(cap) % 4, 0, `cap ${cap} must round to a whole row`);
  }
});

test('commodity stack sizes: ordinary 20, bulky 10, never-stack 1', () => {
  const defFor = (id) => COMMODITIES.find((c) => c.id === id);
  assert.equal(unitsPerSlotForDef(defFor(ORDINARY)), 20);
  assert.equal(unitsPerSlotForDef(defFor(BULKY)), 10);
  assert.equal(unitsPerSlotForDef(defFor(NEVER)), 1);
  assert.equal(unitsPerSlotForDef({ persistent: true }), 1);
  assert.equal(unitsPerSlotForDef({ volPerU: 2.5 }), 10);  // fallback: vol > 1.2 → bulky
  assert.equal(unitsPerSlotForDef({ volPerU: 0.5 }), 20);
});

test('packItemsIntoSlots packs greedily in sorted-id order and loses nothing', () => {
  const items = { cmdty_ice_water: 25, cmdty_ore_iron: 45 };
  const slots = packItemsIntoSlots(items, (id) => (id === 'cmdty_ice_water' ? 10 : 20));
  // sorted: ice_water < ore_iron? 'cmdty_ice_water' < 'cmdty_ore_iron' lexicographically.
  assert.deepEqual(
    slots.map((s) => [s.commodityId, s.qty]),
    [
      ['cmdty_ice_water', 10], ['cmdty_ice_water', 10], ['cmdty_ice_water', 5],
      ['cmdty_ore_iron', 20], ['cmdty_ore_iron', 20], ['cmdty_ore_iron', 5],
    ],
  );
  assert.equal(totalUnits(slots, 'cmdty_ice_water'), 25);
  assert.equal(totalUnits(slots, 'cmdty_ore_iron'), 45);
});

test('addCargo stacks ordinary goods at 20 and refuses past the slot bound', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 2;
  const accepted = addCargo(state, ORDINARY, 45);
  assert.equal(accepted, 40, 'two slots at 20/slot take 40 of 45');
  assert.equal(cargo.slots.length, 2);
  assert.equal(cargo.slots[0].qty, 20);
  assert.equal(cargo.slots[1].qty, 20);
  assert.equal(heldQty(state, ORDINARY), 40);
  assert.equal(addCargo(state, ORDINARY, 1), 0, 'a full bag admits nothing');
});

test('addCargo tops a partial stack before claiming a new slot', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 2;
  assert.equal(addCargo(state, ORDINARY, 7), 7);
  assert.equal(cargo.slots.length, 1);
  assert.equal(addCargo(state, ORDINARY, 20), 20);
  assert.equal(cargo.slots.length, 2);
  assert.equal(cargo.slots[0].qty, 20, 'partial stack filled first');
  assert.equal(cargo.slots[1].qty, 7);
});

test('bulky goods stack at 10; never-stack goods take a slot each', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 3;
  assert.equal(addCargo(state, BULKY, 25), 25);
  assert.equal(cargo.slots.length, 3);
  assert.deepEqual(cargo.slots.map((s) => s.qty), [10, 10, 5]);
  // reset
  cargo.slots = []; cargo.items = {}; cargo.usedVolume = 0; cargo.usedMass = 0;
  assert.equal(addCargo(state, NEVER, 3), 3);
  assert.deepEqual(cargo.slots.map((s) => s.qty), [1, 1, 1]);
  assert.equal(addCargo(state, NEVER, 1), 0, 'three slots hold exactly three never-stack units');
});

test('persistent story items are never refused and land as the over-cap tail', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 1;
  cargo.slots = [{ commodityId: ORDINARY, qty: 20 }];
  assert.equal(slotFitFor(state, PERSISTENT), Infinity);
  const accepted = addCargo(state, PERSISTENT, 2);
  assert.equal(accepted, 2);
  assert.equal(cargo.slots.length, 3, 'over-cap tail keeps the whole grant aboard');
  assert.equal(addCargo(state, ORDINARY, 1), 0, 'over-cap hold refuses new adds until it drains');
});

test('an over-slot hold drains first: removal frees real capacity again', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 1;
  cargo.slots = [{ commodityId: ORDINARY, qty: 20 }, { commodityId: ORDINARY, qty: 15 }];
  cargo.items = { [ORDINARY]: 35 };
  cargo.usedVolume = 35;
  assert.equal(slotFitFor(state, ORDINARY), 0);
  assert.equal(removeCargo(state, ORDINARY, 15), 15);
  // 20 in one slot remains; the bag has 0 free slots so nothing new fits anyway
  assert.equal(slotFitFor(state, ORDINARY), 0);
  assert.equal(removeCargo(state, ORDINARY, 5), 5);
  assert.equal(slotFitFor(state, ORDINARY), 5, 'a 15-unit stack admits 5 more to reach 20');
});

// ---------------------------------------------------------------------------
// Part B — stack intents: split, merge, move, sort
// ---------------------------------------------------------------------------

test('split halves a stack into the next free slot', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 3;
  addCargo(state, ORDINARY, 14);
  const moved = splitCargoStack(state, 0);
  assert.equal(moved, 7);
  assert.deepEqual(cargo.slots.map((s) => s.qty), [7, 7]);
  assert.equal(heldQty(state, ORDINARY), 14);
  assert.equal(splitCargoStack(state, 0, 3), 3, 'explicit split count');
  assert.deepEqual(cargo.slots.map((s) => s.qty), [4, 7, 3]);
  assert.equal(splitCargoStack(state, 1, 1), 0, 'bag full — no free slot to split into');
});

test('merge pours `from` into `to` up to the stack size; empties vanish', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 4;
  cargo.slots = [{ commodityId: ORDINARY, qty: 7 }, { commodityId: ORDINARY, qty: 12 }];
  cargo.items = { [ORDINARY]: 19 };
  const moved = mergeCargoStacks(state, 0, 1);
  assert.equal(moved, 7, 'the whole 7-unit stack pours into the 12-unit stack');
  assert.equal(cargo.slots.length, 1);
  assert.equal(cargo.slots[0].qty, 19);
  // headroom smaller than the source leaves the drained stack behind
  cargo.slots.push({ commodityId: ORDINARY, qty: 17 });
  assert.equal(mergeCargoStacks(state, 0, 1), 3, 'only 3 fit; the 16-unit remainder stays');
  assert.equal(cargo.slots.length, 2);
  assert.equal(cargo.slots[1].qty, 20);
  // different commodities refuse
  cargo.slots.push({ commodityId: BULKY, qty: 4 });
  assert.equal(mergeCargoStacks(state, 1, 2), 0);
});

test('move reorders within the bound and sort consolidates by commodity', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 8;
  cargo.slots = [
    { commodityId: ORDINARY, qty: 5 },
    { commodityId: BULKY, qty: 10 },
    { commodityId: ORDINARY, qty: 9 },
    { commodityId: NEVER, qty: 1 },
  ];
  assert.equal(moveCargoStack(state, 0, 3), true);
  assert.equal(cargo.slots[3].qty, 5);
  assert.equal(moveCargoStack(state, 0, 99), false, 'out-of-range target refuses');
  sortCargoBag(state);
  assert.deepEqual(
    cargo.slots.map((s) => [s.commodityId, s.qty]),
    [
      [NEVER, 1],
      [BULKY, 10],
      [ORDINARY, 14],      // 5 + 9 consolidated, sorted by commodity id
    ].sort(([a], [b]) => a.localeCompare(b)),
  );
  // sort uses pack order: 'cmdty_ice_water' < 'cmdty_live_specimen' < 'cmdty_ore_iron'
  assert.deepEqual(cargo.slots.map((s) => s.commodityId),
    [BULKY, NEVER, ORDINARY].sort());
});

// ---------------------------------------------------------------------------
// Part C — migration packs items → slots and never deletes cargo
// ---------------------------------------------------------------------------

test('v23→v24 migration packs the hold, the salvage bay and parked hulls', () => {
  const migration = MIGRATIONS.find((m) => m.from === 23 && m.to === 24);
  assert.ok(migration, 'a 23→24 migration exists');
  const data = {
    cargo: {
      items: { [ORDINARY]: 45, [BULKY]: 25, [PERSISTENT]: 2 },
      capVolume: 250,
      capMass: 60,
      salvageBay: { items: { [ORDINARY]: 7 } },
    },
    player: {
      ownedShips: [
        { id: 'ship_a', cargo: { items: { [ORDINARY]: 3 } } },
      ],
    },
  };
  migration.fn(data);
  assert.ok(Array.isArray(data.cargo.slots));
  assert.equal(data.cargo.slotCount, 12);
  assert.equal(totalUnits(data.cargo.slots, ORDINARY), 45);
  assert.equal(totalUnits(data.cargo.slots, BULKY), 25);
  assert.equal(totalUnits(data.cargo.slots, PERSISTENT), 2);
  // 3 ordinary + 3 bulky... sorted ids: bulky 'cmdty_ice_water', specimen?, persistent
  assert.ok(Array.isArray(data.cargo.salvageBay.slots));
  assert.equal(totalUnits(data.cargo.salvageBay.slots, ORDINARY), 7);
  assert.equal(totalUnits(data.player.ownedShips[0].cargo.slots, ORDINARY), 3);
  // Re-runnable: a second pass must not repack or drop units.
  const snapshot = JSON.stringify(data);
  migration.fn(data);
  assert.equal(JSON.stringify(data), snapshot);
});

test('migration keeps an over-capacity legacy hold aboard as the over-cap tail', () => {
  const migration = MIGRATIONS.find((m) => m.from === 23 && m.to === 24);
  const data = {
    cargo: { items: { [ORDINARY]: 500 }, capVolume: 40 },
    player: {},
  };
  migration.fn(data);
  // slotCountForCargoCap(40) = 8 slots → 160 units fit; the 500-unit hold keeps ALL units.
  assert.equal(data.cargo.slotCount, 8);
  assert.equal(totalUnits(data.cargo.slots, ORDINARY), 500);
  const { state } = createHarness();
  state.player.cargo = data.cargo;
  assert.equal(slotFitFor(state, ORDINARY), 0, 'over-cap tail refuses new adds');
  assert.equal(removeCargo(state, ORDINARY, 500), 500);
  assert.equal(slotFitFor(state, ORDINARY), 160, 'drained to zero, the whole bound opens');
});

// ---------------------------------------------------------------------------
// Part B — jettison through the system: real pod, contents preserved
// ---------------------------------------------------------------------------

test('slot-scoped jettison removes only that stack and reports it', () => {
  const { state, bus } = createHarness({ withShip: true });
  const system = Object.create(cargo);
  const spawned = [];
  try {
    system.init({ state, bus, helpers: {
      spawnEntity: (spec) => { spawned.push(spec); return { id: 'pod1', data: spec }; },
    } });
    const cargoRec = state.player.cargo;
    cargoRec.slotCount = 4;
    addCargo(state, ORDINARY, 20);
    addCargo(state, ORDINARY, 9);
    const events = [];
    bus.on('cargo:jettisoned', (p) => events.push(p));
    const dumped = system.jettison(null, 9, { slotIndex: 1 });
    assert.equal(dumped, 9);
    assert.equal(heldQty(state, ORDINARY), 20);
    assert.equal(cargoRec.slots.length, 1);
    assert.equal(spawned.length >= 1, true, 'a real pod body spawns beside the hull');
    const pod = spawned[0];
    assert.equal(pod && pod.data && (pod.data.commodityId || pod.commodityId), ORDINARY);
    assert.equal(pod && pod.data && (pod.data.amount ?? pod.data.qty ?? pod.qty ?? pod.amount), 9);
    assert.equal(events.length, 1);
  } finally {
    system.destroy?.();
    bus.clear();
  }
});

// ---------------------------------------------------------------------------
// Part B — bag intents route through the bus into the owner (no dead ends)
// ---------------------------------------------------------------------------

test('bus intents split, merge, move, sort and jettison through the cargo binding', () => {
  const { state, bus } = createHarness({ withShip: true });
  const system = Object.create(cargo);
  const spawned = [];
  try {
    system.init({ state, bus, helpers: {
      spawnEntity: (spec) => { spawned.push(spec); return { id: 'pod9', data: spec }; },
    } });
    const c = state.player.cargo;
    c.slotCount = 6;
    addCargo(state, ORDINARY, 34);           // [20, 14]
    addCargo(state, BULKY, 5);               // [20, 14, 5]

    bus.emit('cargo:splitStack', { slotIndex: 1 });      // 14 → 7 + 7
    assert.deepEqual(c.slots.map((s) => s.qty), [20, 7, 5, 7]);

    bus.emit('cargo:mergeStacks', { from: 3, to: 1 });   // 7 pours into 7 → 14
    assert.deepEqual(c.slots.map((s) => s.qty), [20, 14, 5]);

    bus.emit('cargo:moveStack', { from: 2, to: 0 });     // bulky stack to front
    assert.equal(c.slots[0].commodityId, BULKY);

    bus.emit('cargo:sortBag');                           // sorted id order
    assert.deepEqual(c.slots.map((s) => s.commodityId), [BULKY, ORDINARY, ORDINARY].sort());

    bus.emit('cargo:jettisonStack', { slotIndex: 1, qty: 4 });
    assert.equal(heldQty(state, ORDINARY), 30);
    assert.equal(spawned.length, 1, 'the stack jettison drops a real pod');

    bus.emit('cargo:splitStack', { slotIndex: 99 });
    assert.equal(c.slots.length, 3, 'an out-of-range intent refuses quietly');
  } finally {
    system.destroy?.();
    bus.clear();
  }
});

// ---------------------------------------------------------------------------
// Sealed freight: a breach emits confirmation data and refuses until confirmed
// ---------------------------------------------------------------------------

test('sealed freight refuses a plain jettison and lands only with confirmSealed', () => {
  const { state, bus } = createHarness({ withShip: true });
  const system = Object.create(cargo);
  const spawned = [];
  try {
    system.init({ state, bus, helpers: {
      spawnEntity: (spec) => { spawned.push(spec); return { id: 'pod7', data: spec }; },
    } });
    const c = state.player.cargo;
    c.slotCount = 4;
    addCargo(state, ORDINARY, 20);
    state.fixtureSealed = [ORDINARY];      // whole stack under a contract seal
    const sealed = [];
    bus.on('cargo:jettisonSealed', (p) => sealed.push(p));
    bus.emit('cargo:jettisonStack', { slotIndex: 0, qty: 5 });
    assert.equal(sealed.length, 1, 'the breach asks the screen to confirm');
    assert.equal(sealed[0].slotIndex, 0);
    assert.equal(heldQty(state, ORDINARY), 20, 'nothing leaves before confirmation');
    bus.emit('cargo:jettisonStack', { slotIndex: 0, qty: 5, confirmSealed: true });
    assert.equal(heldQty(state, ORDINARY), 15, 'confirmed breach dumps the sealed units');
    assert.equal(spawned.length, 1);
  } finally {
    system.destroy?.();
    bus.clear();
  }
});

// ---------------------------------------------------------------------------
// Salvage bay — same slot shape
// ---------------------------------------------------------------------------

test('the salvage bay packs into slots and caps at its own bound', () => {
  const { state } = createHarness();
  state.player.salvageBay = { items: {}, usedVolume: 0 };
  const accepted = addSalvage(state, ORDINARY, 30);
  assert.equal(accepted, 30);
  const bay = state.player.salvageBay;
  assert.ok(Array.isArray(bay.slots));
  assert.equal(totalUnits(bay.slots, ORDINARY), 30);
  assert.equal(bay.items[ORDINARY], 30, 'items mirror stays authoritative for reads');
});

// ---------------------------------------------------------------------------
// Slot-fit integration: slotFitFor answers the admission question callers ask
// ---------------------------------------------------------------------------

test('slotFitFor counts partial-stack headroom plus empty slots', () => {
  const { state } = createHarness();
  const cargo = state.player.cargo;
  cargo.slotCount = 3;
  cargo.slots = [{ commodityId: ORDINARY, qty: 13 }];
  // 7 headroom + 2 free slots × 20 = 47
  assert.equal(slotFitFor(state, ORDINARY), 47);
  assert.equal(slotFitFor(state, BULKY), 20, 'bulky goods only claim the two empty slots');
});
