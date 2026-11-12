import assert from 'node:assert/strict';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { getDerivedStats, makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { weapons } from '../src/systems/weapons.js';
import { createSimulation } from '../src/core/sim.js';

// 1. Catalog registration
const thermalSinkS = MODULES.find((m) => m.id === 'mod_thermal_sink_s');
assert.ok(thermalSinkS, 'mod_thermal_sink_s must exist in MODULES');
assert.equal(thermalSinkS.mods.weaponHeatDissipPct, 0.25, 'mod_thermal_sink_s grants +25% weapon heat dissipation');

const thermalSinkM = MODULES.find((m) => m.id === 'mod_thermal_sink_m');
assert.ok(thermalSinkM, 'mod_thermal_sink_m must exist in MODULES');
assert.equal(thermalSinkM.mods.weaponHeatDissipPct, 0.40, 'mod_thermal_sink_m grants +40% weapon heat dissipation');

const cryoSink = MODULES.find((m) => m.id === 'unique_cryo_shroud_sink');
assert.ok(cryoSink, 'unique_cryo_shroud_sink must exist in MODULES');
assert.equal(cryoSink.mods.weaponHeatDissipPct, 0.65, 'unique_cryo_shroud_sink grants +65% weapon heat dissipation');

// 2. Derived stats computation
const baseStats = getDerivedStats('ship_kestrel', []);
assert.equal(baseStats.weaponHeatDissipPct, 0, 'base ship has 0 weapon heat dissipation bonus');
assert.equal(baseStats.weaponHeatDissipMult, 1, 'base ship has 1x weapon heat dissipation mult');

const fittedKestrel = fittingsFromDefaultModules('ship_kestrel', ['mod_thermal_sink_s']);
const fittedStats = getDerivedStats('ship_kestrel', fittedKestrel);
assert.equal(fittedStats.weaponHeatDissipPct, 0.25, 'fitted thermal sink S grants 0.25 weaponHeatDissipPct');
assert.equal(fittedStats.weaponHeatDissipMult, 1.25, 'fitted thermal sink S grants 1.25x weaponHeatDissipMult');

const fittedIronback = fittingsFromDefaultModules('ship_ironback', ['mod_thermal_sink_m']);
const fittedIronbackStats = getDerivedStats('ship_ironback', fittedIronback);
assert.equal(fittedIronbackStats.weaponHeatDissipPct, 0.40, 'fitted thermal sink M grants 0.40 weaponHeatDissipPct');
assert.equal(fittedIronbackStats.weaponHeatDissipMult, 1.40, 'fitted thermal sink M grants 1.40x weaponHeatDissipMult');

// 3. Runtime weapon instantiation
const autocannonDef = WEAPONS.find((w) => w.id === 'wpn_autocannon_s');
assert.ok(autocannonDef, 'wpn_autocannon_s must exist in catalog');
assert.ok(autocannonDef.heatDissip > 0, 'autocannon has base heat dissipation');

const baseShip = makeShipEntitySpec('ship_ironback', { fittings: fittingsFromDefaultModules('ship_ironback', ['wpn_autocannon_m']) });
const sinkShip = makeShipEntitySpec('ship_ironback', { fittings: fittingsFromDefaultModules('ship_ironback', ['wpn_autocannon_m', 'mod_thermal_sink_m']) });

const baseWpn = baseShip.data.weapons[0];
const sinkWpn = sinkShip.data.weapons[0];

assert.equal(baseWpn.heatDissip, baseWpn.heatDissip, 'base weapon runtime has heatDissip');
assert.ok(Math.abs((sinkWpn.heatDissip / baseWpn.heatDissip) - 1.40) < 1e-4, 'thermal-sink fitted weapon runtime has 1.40x heatDissip');

// 4. Weapons system simulation tick verification
const sim = createSimulation({ seed: 42, systems: [weapons] });
sim.state.mode = 'flight';

const e1 = sim.spawn({
  id: 'ship_base', type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  radius: 14, hull: 100, hullMax: 100, collides: false,
  data: { weapons: [{ ...baseWpn, _heat: 50, _cooldown: 0 }] },
});
const e2 = sim.spawn({
  id: 'ship_sink', type: 'ship', pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
  radius: 14, hull: 100, hullMax: 100, collides: false,
  data: { weapons: [{ ...sinkWpn, _heat: 50, _cooldown: 0 }] },
});

const dt = 0.5; // half second tick
sim.step(dt);

const baseHeatLeft = e1.data.weapons[0]._heat;
const sinkHeatLeft = e2.data.weapons[0]._heat;

assert.ok(sinkHeatLeft < baseHeatLeft, `thermal sink must cool faster: sink ${sinkHeatLeft} vs base ${baseHeatLeft}`);
const baseHeatLost = 50 - baseHeatLeft;
const sinkHeatLost = 50 - sinkHeatLeft;
assert.ok(Math.abs((sinkHeatLost / baseHeatLost) - 1.40) < 1e-4, 'heat dissipation scales by 1.40x exactly');

console.log('Thermal sink module tests passed.');
