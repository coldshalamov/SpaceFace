// What a cell does for the machine beside it, beyond paying out material (design/overhaul
// 05_ADVENTURE 3.3). Each rule is a reason to leave a cell in the rock, and each one ends the
// moment that cell is dug out:
//   ice cools a processing machine; crystal and copper carry power with no cable laid;
//   basalt on three sides seats a heavy machine so it does not shake a roof down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT_RULES, SITE_MACHINE_BY_ID } from '../src/data/sites.js';
import { contactProfile, machineCapability, machineIsHeavy } from '../src/systems/siteProduction.js';
import { buildPowerComponents, conductsPower } from '../src/systems/siteLogistics.js';
import { stepSiteStructure, SITE_STRUCTURE } from '../src/systems/siteStructuralModel.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { generateDrillField, tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { contactGiftLine, machineLensModel } from '../src/ui/asteroid/inspector.js';

const { COLS, ROWS } = DRILL_CONST;
const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const DIRT = () => ({ type: 'dirt', hp: 4, maxHp: 4, ore: null, hazard: false, tierReq: 1, hardness: 0.7 });
const ROCK = () => ({ type: 'rock', hp: 9, maxHp: 9, ore: null, hazard: false, tierReq: 1, hardness: 1.4 });
const VEIN = (ore) => ({ type: 'vein', hp: 6, maxHp: 6, ore, hazard: false, tierReq: 1, hardness: 1, yieldU: 2 });

function field(fill = DIRT) {
  const out = [];
  for (let c = 0; c < COLS; c++) { out[c] = []; for (let r = 0; r < ROWS; r++) out[c][r] = fill(); }
  return out;
}

test('ice cools: one ice contact is half again as fast, two or more is twice, and digging it out ends it', () => {
  const refinery = SITE_MACHINE_BY_ID.get('sm_refinery');
  const f = field();
  f[10][10] = EMPTY();
  const speed = () => machineCapability(refinery, contactProfile(f, 10, 10, COLS, ROWS), 'sr_smelt_iron');
  assert.equal(speed().processMultiplier, 1);
  f[9][10] = VEIN('cmdty_ice_water');
  assert.equal(speed().processMultiplier, 1.5);
  assert.equal(speed().iceContacts, 1);
  f[11][10] = VEIN('cmdty_ice_water');
  f[10][9] = VEIN('cmdty_ice_water');
  assert.equal(speed().processMultiplier, 2, 'three ice cells are no better than two');
  // It multiplies the matched-face bonus: an iron face beside an iron smelter still counts.
  f[10][11] = VEIN('cmdty_ore_iron');
  assert.equal(speed().processMultiplier, 2.3);
  // Dig the ice out and the machine is back to its bare faces.
  f[9][10] = EMPTY(); f[11][10] = EMPTY(); f[10][9] = EMPTY();
  assert.equal(speed().processMultiplier, 1.15);
  // Diamond is cold to look at and cools nothing; an extractor is not a processing machine.
  f[9][10] = VEIN('cmdty_gem_diamond');
  assert.equal(speed().coolMultiplier, 1);
  f[9][10] = VEIN('cmdty_ice_water');
  const extractor = machineCapability(SITE_MACHINE_BY_ID.get('sm_extractor'), contactProfile(f, 10, 10, COLS, ROWS), null);
  assert.equal(extractor.coolMultiplier, undefined);
  for (const id of CONTACT_RULES.cooledMachines) assert.ok(SITE_MACHINE_BY_ID.get(id), `${id} is a real machine`);
});

test('veins conduct: a run of crystal or copper joins two machines, and one dug cell splits them', () => {
  const f = field();
  const cells = new Map([[tileIndex(5, 10), 'a'], [tileIndex(9, 10), 'b']]);
  f[5][10] = EMPTY(); f[9][10] = EMPTY();
  const networks = () => buildPowerComponents(f, [], cells, COLS, ROWS);
  assert.equal(networks().length, 2, 'plain rock between them carries nothing');
  f[6][10] = VEIN('cmdty_crystal_silica'); f[7][10] = VEIN('cmdty_ore_copper'); f[8][10] = VEIN('cmdty_crystal_lumin');
  const joined = networks();
  assert.equal(joined.length, 1);
  assert.deepEqual(joined[0].machineIds.slice().sort(), ['a', 'b']);
  assert.deepEqual(joined[0].conductorCells, [tileIndex(6, 10), tileIndex(7, 10), tileIndex(8, 10)]);
  assert.deepEqual(joined[0].overlayCells, [], 'no cable was laid');
  // Iron does not conduct, and a diagonal touch is not a join.
  f[7][10] = VEIN('cmdty_ore_iron');
  assert.equal(networks().length, 2);
  f[7][10] = DIRT(); f[7][11] = VEIN('cmdty_ore_copper');
  assert.equal(networks().length, 2);
  // Dig one cell of a whole run out and the path is cut there.
  f[7][10] = VEIN('cmdty_ore_copper');
  assert.equal(networks().length, 1);
  f[7][10] = EMPTY();
  assert.equal(networks().length, 2);
  // A vein that reaches no machine and no cable is just rock, not a network.
  const lonely = field();
  lonely[20][20] = VEIN('cmdty_ore_copper'); lonely[21][20] = VEIN('cmdty_ore_copper');
  assert.equal(buildPowerComponents(lonely, [], new Map(), COLS, ROWS).length, 0);
  // Cable and vein mix: the cable cells stay the network's cable.
  const mixed = field();
  mixed[5][5] = EMPTY(); mixed[6][5] = EMPTY(); mixed[7][5] = VEIN('cmdty_ore_copper'); mixed[8][5] = EMPTY();
  const net = buildPowerComponents(mixed, [tileIndex(6, 5)], new Map([[tileIndex(5, 5), 'a'], [tileIndex(8, 5), 'b']]), COLS, ROWS);
  assert.equal(net.length, 1);
  assert.deepEqual(net[0].overlayCells, [tileIndex(6, 5)]);
  assert.deepEqual(net[0].conductorCells, [tileIndex(7, 5)]);
  assert.equal(conductsPower(EMPTY()), false);
});

test('veins conduct in a real claim: the Core powers a relay across copper, until the copper is cut', () => {
  const state = createGameState(11);
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.cargo = { items: { cmdty_regocrete: 60, cmdty_control_unit: 12, cmdty_refined_metals: 20, cmdty_electronics: 8 },
    capVolume: 900, usedVolume: 0, usedMass: 0 };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  const asteroidId = 7001;
  const ent = { id: asteroidId, type: 'asteroid', alive: true, pos: { x: 10, z: 10 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'f', boreFamily: 'ast_common_rock' } };
  state.entities.set(asteroidId, ent); state.entityList.push(ent);
  const live = generateDrillField(asteroidId, 'ast_common_rock');
  const pocket = [[14, 0], [14, 1], [14, 2], [13, 2], [12, 2], [16, 2], [17, 2], [16, 1], [15, 1]];
  for (const [c, r] of pocket) live[c][r] = EMPTY();
  ent.data.drillCleared = pocket.map(([c, r]) => tileIndex(c, r));
  state.drill = { active: true, asteroidId, field: live, avatar: { col: 14, row: 2 } };
  const core = sys.installMachine({ asteroidId, defId: 'sm_massline_core', col: 13, row: 2 });
  assert.equal(core.ok, true, `core: ${core.reason}`);
  state.drill.avatar = { col: 16, row: 1 };
  const relay = sys.installMachine({ asteroidId, defId: 'sm_relay', col: 17, row: 2 });
  assert.equal(relay.ok, true, `relay: ${relay.reason}`);
  const site = sys.getSite(core.siteId);
  const networkOf = (machineId) => sys.projection(site.id).power.find((row) => row.machineIds.includes(machineId));
  // Cells 14,2 and 16,2 are hollow and 15,2 is solid rock: the Core and the relay are apart.
  assert.notEqual(networkOf(core.machineId).key, networkOf(relay.machineId).key);
  assert.equal(networkOf(relay.machineId).gen, 0);
  // Leave copper standing in the solid cells between them and they are one network.
  const rt = sys._runtime(site);
  const lay = (ore) => {
    for (const col of [14, 15, 16]) rt.field[col][2] = ore ? VEIN(ore) : DIRT();
    rt.netDirty = true;
  };
  lay('cmdty_ore_copper');
  const shared = networkOf(relay.machineId);
  assert.ok(shared.machineIds.includes(core.machineId), 'the copper run joins the two machines');
  assert.equal(shared.gen, 12, 'the relay now runs on the Core');
  assert.deepEqual(shared.conductorCells, [tileIndex(14, 2), tileIndex(15, 2), tileIndex(16, 2)]);
  // Dig the middle of the run out: split again.
  rt.field[15][2] = EMPTY(); rt.netDirty = true;
  assert.notEqual(networkOf(core.machineId).key, networkOf(relay.machineId).key);
});

test('basalt braces: a heavy machine seated against three basalt cells does not shake the roof down', () => {
  assert.equal(machineIsHeavy(SITE_MACHINE_BY_ID.get('sm_refinery')), true);
  assert.equal(machineIsHeavy(SITE_MACHINE_BY_ID.get('sm_extractor')), false);
  const build = (bedrock) => {
    const f = field();
    // A hall: two refineries on one row with an open span between them and a hollow bore below.
    for (let c = 8; c <= 14; c++) { f[c][10] = EMPTY(); f[c][11] = EMPTY(); }
    if (bedrock) { f[7][9] = ROCK(); f[7][10] = ROCK(); f[7][11] = ROCK(); }
    return f;
  };
  const machines = [
    { id: 'm1', defId: 'sm_refinery', col: 8, row: 10, powerRatio: 1 },
    { id: 'm2', defId: 'sm_refinery', col: 14, row: 10, powerRatio: 1 },
  ];
  const run = (f) => {
    let structure = null; let fell = false;
    for (let t = 0; t < SITE_STRUCTURE.fractureS + 2; t++) {
      const out = stepSiteStructure({ dtS: 1, cols: COLS, rows: ROWS, machines, field: f, avatar: null, structure });
      structure = out.structure;
      if (out.fracture) fell = true;
    }
    return { fell, stress: structure ? structure.stressS : 0 };
  };
  const loose = run(build(false));
  assert.equal(loose.fell, true, 'two running refineries across an open span bring the roof down');
  const seated = run(build(true));
  assert.equal(seated.fell, false);
  assert.equal(seated.stress, 0, 'basalt on three sides of one of them carries the load');
  // The card says so, and says what ice is doing.
  const f = build(true);
  const cap = machineCapability(SITE_MACHINE_BY_ID.get('sm_refinery'), contactProfile(f, 8, 10, COLS, ROWS), 'sr_smelt_iron');
  assert.equal(cap.braced, true);
  assert.equal(contactGiftLine(cap), 'Basalt on three sides: braced');
  f[8][9] = VEIN('cmdty_ice_water'); f[9][9] = VEIN('cmdty_ice_water');
  const cooled = machineCapability(SITE_MACHINE_BY_ID.get('sm_refinery'), contactProfile(f, 8, 10, COLS, ROWS), 'sr_smelt_iron');
  assert.equal(contactGiftLine(cooled), 'Ice beside it: runs twice as fast · Basalt on three sides: braced');
  const card = machineLensModel({ defId: 'sm_refinery', capability: cooled, status: { state: 'running' }, geo: null });
  assert.match(card.body, /Ice beside it: runs twice as fast/);
});
