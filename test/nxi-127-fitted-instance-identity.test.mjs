// NXI-127 — the same recovered instance shows in Shipworks detail. The chooser's hold rows key
// on instance identity (a recovered unit never collapses into pristine duplicates) and the
// equipped row reads the slot's fittedInstances record so the selected unit names its
// provenance/condition rather than a generic pristine catalog description — after fitting AND
// after removal. Sim pins the record the screen reads; the helper pins the display words.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { formatInstanceProvenance, instanceIdentityText } from '../src/systems/shipLedger.js';
import { SHIPS } from '../src/data/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const HERE = dirname(fileURLToPath(import.meta.url));
const UTILITY_DEF = 'mod_cargo_scanner_s';
const KESTREL_UTILITY_SLOT = 5;

function boot() {
  const state = createGameState(4242);
  state.playerId = 1;
  state.player.moduleInventory = [];
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: Array(buildSlotList(SHIP_BY_ID.get('ship_kestrel')).length).fill(null),
    fittedInstances: {},
  }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  const ships = Object.assign({}, shipsProto);
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships };
}

test('instance identity words: provenance + condition render, pristine stays silent', () => {
  assert.equal(instanceIdentityText({ provenance: 'recovered from wreck', condition: 0.62 }),
    'recovered from wreck · 62% condition');
  assert.equal(instanceIdentityText({ provenance: 'ace trophy' }), 'ace trophy');
  assert.equal(instanceIdentityText({ condition: 'worn' }), 'worn');
  assert.equal(instanceIdentityText({ condition: 40 }), '40% condition');
  assert.equal(instanceIdentityText({ instanceId: 'mi_1', defId: UTILITY_DEF }), '',
    'a pristine record with nothing recorded reads as the ordinary catalog unit');
  assert.equal(instanceIdentityText(null), '');
  assert.equal(formatInstanceProvenance({ instanceId: 'mi_1' }), 'unrecorded',
    'the NXI-126 neutral fallback is preserved');
});

test('the record Shipworks reads survives fit and unfit: hold → slot → hold keeps provenance', () => {
  const { state, ships } = boot();
  state.player.moduleInventory.push({
    instanceId: 'mi_recovered_1', defId: UTILITY_DEF,
    provenance: 'recovered from wreck', condition: 0.62,
  });

  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT, instanceId: 'mi_recovered_1' }), true);
  const fitted = state.player.ownedShips[0].fittedInstances[KESTREL_UTILITY_SLOT];
  assert.equal(fitted.instanceId, 'mi_recovered_1');
  assert.equal(instanceIdentityText(fitted), 'recovered from wreck · 62% condition',
    'the equipped row can name this exact unit');

  assert.equal(ships.unfitModule({ shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT }), true);
  const held = state.player.moduleInventory.find((m) => m.instanceId === 'mi_recovered_1');
  assert.ok(held, 'the same instance lands back in the hold');
  assert.equal(instanceIdentityText(held), 'recovered from wreck · 62% condition',
    'the hold row names it after removal — not a fresh pristine mint');

  // Neighbor: a pristine unit still mints an identity with nothing recorded — no line.
  assert.equal(ships.fitModule({ shipIndex: 0, slotIndex: KESTREL_UTILITY_SLOT, instanceId: 'mi_recovered_1' }), true);
  const pristine = { instanceId: 'mi_plain_1', defId: 'mod_market_data_s' };
  state.player.moduleInventory.push(pristine);
  assert.equal(instanceIdentityText(pristine), '');
});

test('the screen consumes the records: hold rows key on identity; the equipped row reads fittedInstances', () => {
  const src = readFileSync(join(HERE, '../src/ui/station/screens/shipworks.js'), 'utf8');
  assert.ok(/instanceIdentityText\(item\)/.test(src),
    'hold rows read each inventory item’s identity');
  assert.ok(/d\.id \+ '\|' \+ instText/.test(src),
    'hold rows group by catalog id AND instance identity — tagged units keep their own row');
  assert.ok(/sx-modrow__instance.*This unit:/.test(src),
    'a tagged hold unit names itself in the row');
  assert.ok(/instanceIdentityText\(\(s\.fittedInstances \|\| \{\}\)\[slotIndex\]\)/.test(src),
    'the equipped row reads the slot’s fittedInstances record');
  assert.ok(/equippedInstText \? `<span class="sx-modrow__instance">This unit:/.test(src),
    'a tagged fitted unit names itself instead of only the pristine catalog sentence');
});
