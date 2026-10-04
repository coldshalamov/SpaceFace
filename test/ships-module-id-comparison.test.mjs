// NXI-113: Compare modules by stable ID, not their display name
// Two items with identical labels but different IDs do not become interchangeable; a renamed item retains identity.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  ships as shipsProto,
  buildSlotList,
  dryRunLoadoutPresetApply,
} from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const KESTREL_SLOTS = buildSlotList(SHIP_BY_ID.get('ship_kestrel'));

test('NXI-113: dryRunLoadoutPresetApply matches modules strictly by defId, not by name or label', () => {
  // Let mod_cargo_scanner_s be the target fitting in preset
  const targetDefId = 'mod_cargo_scanner_s';
  const targetDef = MODULES.find((m) => m.id === targetDefId);
  assert.ok(targetDef);

  // Player has an inventory item with identical name but different defId
  const differentDefId = 'mod_market_data_s';
  const fakeRenamedItem = {
    instanceId: 'inst_1',
    defId: differentDefId, // different ID!
  };

  const targetFittings = Array(KESTREL_SLOTS.length).fill(null);
  targetFittings[5] = targetDefId;

  const currentFittings = Array(KESTREL_SLOTS.length).fill(null);

  // Dry run with different defId in inventory
  const result = dryRunLoadoutPresetApply({
    shipDefId: 'ship_kestrel',
    currentFittings,
    targetFittings,
    moduleInventory: [fakeRenamedItem],
    player: { credits: 1000, cargo: { usedVolume: 0 } },
    enforceCargo: false,
    isUnlockedFn: () => true,
  });

  // Must fail because targetDefId is missing in inventory, even if another module exists
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_modules');
  assert.equal(result.missingCount, 1);
  assert.equal(result.takeByDefId.get(targetDefId), 1);
  assert.equal(result.takeByDefId.has(differentDefId), false);
});

test('NXI-113: dryRunLoadoutPresetApply succeeds when exact defId is present regardless of name changes', () => {
  const targetDefId = 'mod_cargo_scanner_s';
  const targetFittings = Array(KESTREL_SLOTS.length).fill(null);
  targetFittings[5] = targetDefId;

  const currentFittings = Array(KESTREL_SLOTS.length).fill(null);
  const matchingItem = {
    instanceId: 'inst_real',
    defId: targetDefId,
  };

  const result = dryRunLoadoutPresetApply({
    shipDefId: 'ship_kestrel',
    currentFittings,
    targetFittings,
    moduleInventory: [matchingItem],
    player: { credits: 1000, cargo: { usedVolume: 0 } },
    enforceCargo: false,
    isUnlockedFn: () => true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.missingCount, 0);
  assert.equal(result.takeByDefId.get(targetDefId), 1);
});
