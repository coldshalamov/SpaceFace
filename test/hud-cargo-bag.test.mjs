// CARGO-BAG-UI: the bag's read model — square slots four across, counts and partial fills,
// Bulky / illegal / over-capacity marks, three tabs — and the gestures speak only owner intents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bagModel, bagItemName, BAG_TABS } from '../src/ui/cargoBag.js';

function stateWith(slots, slotCount = 8, extra = {}) {
  const items = {};
  for (const s of slots) items[s.commodityId] = (items[s.commodityId] || 0) + s.qty;
  return {
    player: { cargo: { slots, slotCount, items, capVolume: slotCount * 20 }, moduleInventory: extra.gear || [] },
    missions: { active: [] },
    entities: new Map(),
  };
}

test('three tabs: Cargo, Gear, Salvage', () => {
  assert.deepEqual(BAG_TABS.map((t) => t.label), ['Cargo', 'Gear', 'Salvage']);
});

test('a stack shows its count, its stack size and whether it is partial; empty slots stay slots', () => {
  const m = bagModel(stateWith([{ commodityId: 'cmdty_ore_iron', qty: 13 }, { commodityId: 'cmdty_ice_water', qty: 10 }], 8));
  assert.equal(m.slots.length, 8, 'the grid shows every slot the hull has');
  assert.equal(m.slots[0].qty, 13);
  assert.equal(m.slots[0].cap, 20);
  assert.equal(m.slots[1].cap, 10, 'water ice is bulky: ten to a slot');
  assert.equal(m.slots[1].bulky, true);
  assert.equal(m.slots[2], null);
  assert.equal(m.droppable, true);
  assert.equal(bagItemName(m.slots[0]), 'Iron Ore');
});

test('an over-capacity hold is flagged and its extra stacks are marked', () => {
  const slots = Array.from({ length: 10 }, () => ({ commodityId: 'cmdty_ore_iron', qty: 20 }));
  const m = bagModel(stateWith(slots, 8));
  assert.equal(m.overCapacity, true);
  assert.equal(m.slots[9].over, true);
  assert.equal(m.slots[7].over, false);
});

test('gear lists unfitted parts by name and cannot be dropped in space', () => {
  const m = bagModel(stateWith([], 8, { gear: [{ defId: 'mod_shield_booster_s', instanceId: 'a' }] }), 'gear');
  assert.equal(m.slots[0].name, 'Shield Booster S');
  assert.equal(m.droppable, false);
});
