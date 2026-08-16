import assert from 'node:assert/strict';
import test from 'node:test';

import {
  presentEquippedItemComparison,
  presentShopModuleDelta,
} from '../src/ui/presenters/engineeringPreview.js';
import {
  lootItemComparison,
  normalizeLootHistoryEntry,
} from '../src/ui/lootHistory.js';
import { factionLicensedFitComparison } from '../src/ui/station/screens/factions.js';

function fittedPlayer() {
  return {
    ownedShips: [{
      defId: 'ship_kestrel',
      fittings: ['wpn_pulse_laser_s', null, 'mod_engine_ion_m', null, null, null],
    }],
    activeShipIndex: 0,
    cargo: { usedMass: 0 },
    efficiencyMods: {},
  };
}

test('Plan54 shops and collected-module inspection share one fitted-delta authority', () => {
  const player = fittedPlayer();
  const outfitting = presentShopModuleDelta({
    defId: 'ship_kestrel',
    fittings: player.ownedShips[0].fittings,
    moduleId: 'wpn_autocannon_s',
    slotIndex: 0,
    player,
  });
  const everywhere = presentEquippedItemComparison({
    player,
    moduleId: 'wpn_autocannon_s',
    slotIndex: 0,
  });

  assert.equal(everywhere.ok, true);
  assert.deepEqual(everywhere.chips, outfitting.chips,
    'loot and specialty shops consume the same packet as Outfitting/Shipworks');
  assert.equal(everywhere.fittedModuleName, 'Pulse Laser S');
  assert.deepEqual(everywhere.chips.slice(0, 3).map((chip) => chip.label), [
    '-13 dps',
    '-80 range',
    '+4 heat/shot',
  ]);
  assert.match(everywhere.feel, /Against fitted Pulse Laser S: lighter fire and shorter reach\./);

  const state = { player };
  const licensed = factionLicensedFitComparison({ defId: 'wpn_flak_turret_s' }, state);
  assert.equal(licensed.ok, true);
  assert.equal(licensed.fittedModuleName, 'Pulse Laser S');
  assert.match(licensed.feel, /Against fitted Pulse Laser S/);
  assert.ok(licensed.chips.some((chip) => chip.key === 'weaponDps'));

  const entry = normalizeLootHistoryEntry({
    kind: 'module',
    commodityId: 'wpn_autocannon_s',
    amount: 1,
    simTime: 54,
  }, state);
  assert.equal(entry.label, 'Module acquired · Autocannon S');
  assert.equal(entry.moduleId, 'wpn_autocannon_s');
  const loot = lootItemComparison(entry, state);
  assert.deepEqual(loot.chips, everywhere.chips);
  assert.equal(loot.feel, everywhere.feel);
});

test('Plan54 item comparison fails closed when there is no active fitted hull', () => {
  const comparison = presentEquippedItemComparison({
    player: { ownedShips: [], activeShipIndex: 0 },
    moduleId: 'wpn_autocannon_s',
  });
  assert.equal(comparison.ok, false);
  assert.equal(comparison.reason, 'missing_ship');
  assert.equal(comparison.feel, 'No hull selected.');
  assert.deepEqual(comparison.chips, []);
});
