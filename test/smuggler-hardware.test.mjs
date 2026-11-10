import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODULES } from '../src/data/modules.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';

test('Smuggler and sensor scrambler module catalog records exist and have valid structure', () => {
  const modMap = new Map(MODULES.map((m) => [m.id, m]));

  const holdM = modMap.get('mod_smuggler_hold_m');
  assert.ok(holdM, 'mod_smuggler_hold_m must exist');
  assert.equal(holdM.slotType, 'cargo');
  assert.equal(holdM.size, 'M');
  assert.equal(holdM.tier, 3);
  assert.equal(holdM.legality, 'contraband');
  assert.equal(holdM.mods.hiddenCargoPct, 0.35);
  assert.equal(holdM.mods.cargoFlat, 20);

  const scramblerS = modMap.get('mod_sensor_scrambler_s');
  assert.ok(scramblerS, 'mod_sensor_scrambler_s must exist');
  assert.equal(scramblerS.slotType, 'utility');
  assert.equal(scramblerS.size, 'S');
  assert.equal(scramblerS.tier, 1);
  assert.equal(scramblerS.mods.scannerCloak, 0.25);

  const scramblerM = modMap.get('mod_sensor_scrambler_m');
  assert.ok(scramblerM, 'mod_sensor_scrambler_m must exist');
  assert.equal(scramblerM.slotType, 'utility');
  assert.equal(scramblerM.size, 'M');
  assert.equal(scramblerM.tier, 3);
  assert.equal(scramblerM.mods.scannerCloak, 0.50);

  const phantom = modMap.get('unique_phantom_scrambler');
  assert.ok(phantom, 'unique_phantom_scrambler must exist');
  assert.equal(phantom.unique, true);
  assert.equal(phantom.mods.scannerCloak, 0.70);
});

test('getDerivedStats computes hiddenCargoPct and scannerCloak accurately', () => {
  const statsBaseline = getDerivedStats('ship_kestrel', []);
  assert.equal(statsBaseline.hiddenCargoPct, 0);
  assert.equal(statsBaseline.scannerCloak, 0);

  // Kestrel has cargo slots and utility slots
  const statsSmuggler = getDerivedStats('ship_kestrel', [
    'wpn_pulse_laser_s',
    'mod_shield_light_s',
    'mod_engine_standard_s',
    'mod_smuggler_hold',
    'mod_sensor_scrambler_s',
  ]);
  assert.equal(statsSmuggler.hiddenCargoPct, 0.20);
  assert.equal(statsSmuggler.scannerCloak, 0.25);

  const statsAdv = getDerivedStats('ship_atlas', [
    'wpn_pulse_laser_s',
    'mod_shield_light_s',
    'mod_engine_standard_s',
    'mod_smuggler_hold_m',
    'mod_sensor_scrambler_m',
  ]);
  assert.equal(statsAdv.hiddenCargoPct, 0.35);
  assert.equal(statsAdv.scannerCloak, 0.50);
});

test('economy smuggling capabilities and scan integration', () => {
  const mockState = {
    playerId: 'p1',
    player: {
      derived: {
        hiddenCargoPct: 0.35,
        scannerCloak: 0.50,
      },
      cargo: {
        items: {
          cmdty_narcotics: 10,
        },
      },
    },
    entities: {
      get: () => ({ x: 0, z: 0 }),
    },
    rng: () => 0.40,
  };

  const caps = economy.smugglingCapabilities(mockState);
  assert.equal(caps.hiddenCargoPct, 0.35);
  assert.equal(caps.scannerCloak, 0.50);
});

test('moduleRiskGlyphs correctly flags contraband smuggler hardware', async () => {
  const { moduleRiskGlyphs } = await import('../src/ui/panels/moduleRisk.js');
  const risks = moduleRiskGlyphs('mod_smuggler_hold_m');
  assert.ok(risks.some((r) => r.id === 'contraband'));

  const scramblerRisks = moduleRiskGlyphs('mod_sensor_scrambler_m');
  assert.ok(scramblerRisks.some((r) => r.id === 'contraband'));
});
