import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { formatInstanceProvenance } from '../src/systems/shipLedger.js';
import { ships as shipsProto } from '../src/systems/ships.js';

test('NXI-126: formatInstanceProvenance provides a neutral fallback for missing optional provenance', () => {
  // Missing or absent provenance returns neutral 'unrecorded'
  assert.equal(formatInstanceProvenance(null), 'unrecorded');
  assert.equal(formatInstanceProvenance(undefined), 'unrecorded');
  assert.equal(formatInstanceProvenance({}), 'unrecorded');
  assert.equal(formatInstanceProvenance({ instanceId: 'mi_1', defId: 'mod_cargo_scanner_s' }), 'unrecorded');
  assert.equal(formatInstanceProvenance({ instanceId: 'mi_2', defId: 'mod_cargo_scanner_s', provenance: null }), 'unrecorded');
  assert.equal(formatInstanceProvenance({ instanceId: 'mi_3', defId: 'mod_cargo_scanner_s', provenance: '' }), 'unrecorded');

  // Does not invent legal history or fabricate dates
  const legacyItem = { instanceId: 'mi_legacy', defId: 'mod_beam_focus_s' };
  const label = formatInstanceProvenance(legacyItem);
  assert.equal(label, 'unrecorded');
  assert.equal(Object.prototype.hasOwnProperty.call(legacyItem, 'stolen'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(legacyItem, 'acquiredAt'), false);
});

test('NXI-126: formatInstanceProvenance preserves legitimate provenance strings and structured records', () => {
  assert.equal(
    formatInstanceProvenance({ provenance: 'salvaged:wreck_nestbreaker' }),
    'salvaged:wreck_nestbreaker'
  );
  assert.equal(
    formatInstanceProvenance({ provenance: { label: 'Nestbreaker Recovery' } }),
    'Nestbreaker Recovery'
  );
  assert.equal(
    formatInstanceProvenance({ provenance: { sourceRef: 'wreck_choir_tender' } }),
    'wreck_choir_tender'
  );
  assert.equal(
    formatInstanceProvenance({ provenanceRef: 'wreck_cathedral/c1_01' }),
    'wreck_cathedral/c1_01'
  );
});

test('NXI-126: a legacy owned module without provenance retains full usability and fit capability', () => {
  const state = createGameState(4242);
  state.playerId = 1;
  state.player.ownedShips = [{
    defId: 'ship_kestrel',
    fittings: Array(6).fill(null),
  }];
  state.player.moduleInventory = [
    { instanceId: 'mi_legacy_1', defId: 'mod_cargo_scanner_s' },
    { instanceId: 'mi_provenanced_1', defId: 'mod_mining_laser_s', provenance: 'salvaged:wreck_nestbreaker' },
  ];

  const bus = createBus();
  const ships = Object.assign({}, shipsProto);
  ships.init({ state, bus, helpers: {} });

  // Fit legacy module with missing optional provenance — must succeed and retain usability
  const fitLegacySuccess = ships.fitModule({
    slotIndex: 5,
    instanceId: 'mi_legacy_1',
  });
  assert.equal(fitLegacySuccess, true, 'legacy module without provenance fits successfully');
  assert.equal(state.player.ownedShips[0].fittings[5], 'mod_cargo_scanner_s');
  assert.equal(formatInstanceProvenance(state.player.ownedShips[0].fittings[5]), 'unrecorded');

  // Neighboring success: fit module WITH legitimate provenance into its matching slot (mining slot 4) — also succeeds
  const fitProvenancedSuccess = ships.fitModule({
    slotIndex: 4,
    instanceId: 'mi_provenanced_1',
  });
  assert.equal(fitProvenancedSuccess, true, 'module with provenance fits successfully');
  assert.equal(state.player.ownedShips[0].fittings[4], 'mod_mining_laser_s');
});
