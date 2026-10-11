import test from 'node:test';
import assert from 'node:assert/strict';
import { asteroidSites, makeSiteRecord } from '../src/systems/asteroidSites.js';
import { DRILL_CONST, tileIndex, generateDrillField } from '../src/systems/drill.js';
import { contactProfile, machineCapability, oreContactRate, stepFabricator, stepContinuousRecipe } from '../src/systems/siteProduction.js';
import { laneThroughput } from '../src/systems/siteLogistics.js';
import { planSiteKit, summarizeIndustryCargo } from '../src/systems/siteIndustryPlanner.js';
import { SITE_MACHINE_BY_ID, SITE_BALANCE, SITE_RECIPES } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ghostLensModel, machineLensModel, tileLensModel } from '../src/ui/asteroid/inspector.js';
import { siteDrawerModel } from '../src/ui/asteroid/asteroidScreen.js';

const { COLS, ROWS } = DRILL_CONST;
const value = (goods) => summarizeIndustryCargo(goods, COMMODITIES).nominalValue;
const empty = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const profile = (ores = {}, extra = {}) => ({ matrix: 0, basalt: 0, gas: 0, ores, cells: [], ...extra });

test('first claim fits a starter hold and good common geology repays its kit in a working visit', (t) => {
  const kit = summarizeIndustryCargo(planSiteKit('first_claim').manifest, COMMODITIES);
  assert.ok(kit.volume <= 20 && kit.nominalValue <= 1000);
  const field = generateDrillField(90130);
  let bestRate = 0;
  // Scout a pocket, leaving an actual cardinal entry. Exclude rare jackpots from bootstrap.
  for (let c = 1; c < COLS - 1; c++) for (let r = 3; r < 12; r++) {
    const p = contactProfile(field, c, r, COLS, ROWS);
    const entry = p.cells.find((cell) => cell.col === c && cell.row === r - 1);
    if (entry.kind === 'ore') p.ores[entry.ore]--;
    else if (entry.kind !== 'empty') p[entry.kind]--;
    for (const ore of Object.keys(p.ores)) if (!['cmdty_ore_iron', 'cmdty_ore_bronzium'].includes(ore)) delete p.ores[ore];
    const cap = machineCapability(SITE_MACHINE_BY_ID.get('sm_extractor'), p, null);
    bestRate = Math.max(bestRate, value(cap.outputsPerMin));
  }
  const minutes = kit.nominalValue / bestRate;
  assert.ok(minutes >= 5 && minutes <= 20, `common deposit payback ${minutes} minutes`);
  t.diagnostic(`seed90130: starter kit ${kit.nominalValue}cr / ${kit.volume} cargo; productive common pocket ${bestRate.toFixed(1)}cr/min, ${minutes.toFixed(1)}min nominal payback`);
});

test('precious extraction cannot erase the value of building a processing chain', () => {
  for (const c of COMMODITIES.filter((c) => c.id.startsWith('cmdty_gem_') || c.id.startsWith('cmdty_exotic_'))) {
    assert.ok(oreContactRate(c.id) * c.basePrice <= 24 + 1e-8, c.id);
  }
  close(oreContactRate('cmdty_ore_iron'), 1.2);
  const mixed = machineCapability(SITE_MACHINE_BY_ID.get('sm_extractor'), profile({ cmdty_silicate: 1 }, { matrix: 1 }));
  close(mixed.outputsPerMin.cmdty_silicate, 2.4);
  // Three preserved iron faces power an early smelter; its gross value beats those raw inputs.
  const recipe = SITE_RECIPES.find((r) => r.id === 'sr_smelt_iron');
  assert.ok(value(recipe.output) > value(recipe.inputs) * 2);
});

test('matched geology accelerates real recipes, never grants free inputs or bypasses power', () => {
  const refinery = SITE_MACHINE_BY_ID.get('sm_refinery');
  const matched = machineCapability(refinery, profile({ cmdty_ore_iron: 4 }), 'sr_smelt_iron');
  const wrong = machineCapability(refinery, profile({ cmdty_ore_copper: 4 }), 'sr_smelt_iron');
  close(matched.processMultiplier, 1.6); close(wrong.processMultiplier, 1);
  const run = (mult, power = 1) => {
    const store = { cmdty_ore_iron: 50 };
    const result = stepContinuousRecipe({ recipeId: 'sr_smelt_iron', dtMin: 1, powerRatio: power,
      processMultiplier: mult, store, roomFor: () => 100, carry: {}, throughputBudget: 100 });
    return { store, result };
  };
  close(run(1.6).result.consumed.cmdty_ore_iron / run(1).result.consumed.cmdty_ore_iron, 1.6);
  assert.equal(run(1.6, 0).result.moved, 0);
  const recipe = SITE_RECIPES.find((r) => r.id === 'sr_fab_electronics');
  const machine = { job: null };
  const store = { ...recipe.inputs };
  const args = { machine, recipeId: recipe.id, powerRatio: 1, processMultiplier: 1.6,
    store, roomFor: () => 100, wantsBuild: true, dtS: 1 };
  assert.equal(stepFabricator(args).started, true);
  args.dtS = recipe.buildS / 1.6;
  assert.deepEqual(stepFabricator(args).completed, { outputId: 'cmdty_electronics', qty: 3 });
  assert.equal(store.cmdty_purified_silica, 0);
  assert.equal(stepFabricator(args).started, false, 'bonus cannot start another batch without inputs');
});

test('only powered ports on this network expand its throughput', () => {
  const comp = { machineIds: ['port', 'extractor'] };
  const defs = (id) => id === 'port' ? 'sm_cargo_port' : 'sm_extractor';
  assert.equal(laneThroughput(comp, defs), 24);
  assert.equal(laneThroughput(comp, defs, SITE_BALANCE, () => 0), 12);
  assert.equal(laneThroughput(comp, defs, SITE_BALANCE, () => 0.5), 18);
  assert.equal(laneThroughput({ machineIds: ['extractor'] }, defs), 12);
});

// A deliberately carved training asteroid: separate ore islands above a shared access spine.
// All production uses the live site owner and its power/lane budgets, not an idealized recipe sum.
const layout = [
  ['iron', 'sm_extractor', 3, 5, null, 'cmdty_ore_iron'],
  ['copper', 'sm_extractor', 7, 5, null, 'cmdty_ore_copper'],
  ['titanium', 'sm_extractor', 11, 5, null, 'cmdty_ore_titanium'],
  ['matrix', 'sm_extractor', 15, 5, null, 'dirt'],
  ['power1', 'sm_gas_tap', 19, 5, 'generate', 'gas'],
  ['power2', 'sm_gas_tap', 23, 5, 'generate', 'gas'],
  ['feed', 'sm_gas_tap', 3, 9, 'feedstock', 'gas'],
  ['alloys', 'sm_refinery', 7, 9, 'sr_blend_alloys'],
  ['silica', 'sm_refinery', 11, 9, 'sr_fuse_silica'],
  ['fuel', 'sm_refinery', 15, 9, 'sr_synthesize_fuel'],
  ['circuits', 'sm_fabricator', 19, 9, 'sr_fab_circuitry'],
  ['controllers', 'sm_fabricator', 23, 9, 'sr_fab_control_unit'],
  ['core', 'sm_massline_core', 3, 13],
  ['port1', 'sm_cargo_port', 7, 13],
  ['port2', 'sm_cargo_port', 11, 13],
  ['matrix2', 'sm_extractor', 15, 13, null, 'dirt'],
];
function factory(saved) {
  const state = { simTime: 0, tick: 0, meta: { seed: 90130 }, entities: new Map(),
    player: { cargo: { items: {}, capVolume: 40, usedVolume: 0 } }, playerId: 1,
    world: { currentSectorId: 'sec_core_alpha' }, content: { commodities: COMMODITIES } };
  const bus = { on() { return () => {}; }, emit() {} };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  if (saved) sys.deserialize(saved);
  else {
    const site = makeSiteRecord({ id: 'site_balance', asteroidId: 42, sectorId: 'sec_core_alpha' });
    site.anchored = true; site.boreSeed = 90130;
    site.anchor = { x: 0, z: 0, radius: 30, typeId: 'rock_metallic', yieldU: 20 };
    site.machines = layout.map(([id, defId, col, row, mode]) => ({ id, defId, col, row, mode: mode || null, carry: {}, job: null }));
    const lines = new Set();
    for (let c = 1; c <= 24; c++) for (const r of [6, 10, 14]) lines.add(tileIndex(c, r));
    for (let r = 0; r <= 14; r++) lines.add(tileIndex(1, r));
    site.overlays = { power: [...lines], lane: [...lines] };
    state.sites.byId[site.id] = site; state.sites.order.push(site.id);
  }
  const site = sys.getSite('site_balance');
  const field = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, empty));
  for (const [, , col, row, , material] of layout) if (material) {
    for (const [dc, dr] of [[-1, -1], [0, -1], [1, -1], [-1, 0]]) {
      field[col + dc][row + dr] = material.startsWith('cmdty_')
        ? { type: 'vein', ore: material, hp: 10, maxHp: 10, yieldU: 3 }
        : { type: material, hp: 4, maxHp: 4 };
    }
  }
  field[20][5] = { type: 'gas', hp: 4, maxHp: 4 };
  const rt = sys._runtime(site);
  rt.field = field; rt.fieldDirty = false; rt.geoDirty = true;
  sys._runtime(site);
  const run = (seconds) => {
    for (let i = 0; i < seconds; i++) { state.simTime++; sys._tickSite(site, 1, state, { workbench: true }); }
  };
  const goods = () => Object.assign({}, ...site.laneStores.map((s) => s.store));
  return { sys, state, site, field, run, goods };
}

test('a connected factory makes repeatable construction controllers from preserved deposits and survives Continue', (t) => {
  const a = factory();
  const originalGeology = JSON.stringify(a.field);
  a.run(600);
  const halfway = a.sys.serialize();
  const b = factory(JSON.parse(JSON.stringify(halfway)));
  b.state.simTime = a.state.simTime;
  a.run(1200); b.run(1200);
  assert.deepEqual(a.goods(), b.goods(), 'cold continuation keeps every stock and paid job');
  assert.equal(JSON.stringify(a.field), originalGeology, 'industry does not consume the deposit');
  const controllers = a.goods().cmdty_control_unit || 0;
  assert.ok(controllers >= 6, `thirty-minute factory delivered ${controllers} controllers: ${JSON.stringify({ goods: a.goods(), machines: a.sys.projection(a.site.id).machines.map((m) => ({ id: m.id, power: m.powerRatio, status: m.status, job: m.job })), power: a.sys.projection(a.site.id).power.map((p) => ({ gen: p.gen, draw: p.draw })) })}`);
  assert.equal(a.site.exportBuffer.cmdty_ore_iron || 0, 0, 'port does not steal new factory feedstocks');
  assert.equal(a.site.exportBuffer.cmdty_gas_hydrogen || 0, 0);
  t.diagnostic(`connected thirty-minute factory: ${controllers.toFixed(2)} controllers; ${a.sys.projection(a.site.id).lanes[0].throughputPerMin}u/min powered lane`);
});

test('strip-mining the same islands destroys the continuing factory benefit', () => {
  const live = factory();
  const stripped = factory();
  for (const column of stripped.field) for (let r = 0; r < ROWS; r++) column[r] = empty();
  stripped.sys._runtime(stripped.site).geoDirty = true;
  // The harvested veins pay a finite lump; even imported power cannot regenerate the source.
  for (const [, , , , , material] of layout) if (material?.startsWith('cmdty_')) {
    stripped.sys._runtime(stripped.site).stores[stripped.sys._runtime(stripped.site).laneComps[0].key][material] = 12;
  }
  live.run(1800); stripped.run(1800);
  assert.ok((live.goods().cmdty_control_unit || 0) > (stripped.goods().cmdty_control_unit || 0));
  const cap = machineCapability(SITE_MACHINE_BY_ID.get('sm_extractor'), contactProfile(stripped.field, 3, 5, COLS, ROWS));
  assert.deepEqual(cap.outputsPerMin, {});
});

test('placement and cutting show the exact preserved processing or power advantage', () => {
  const p = profile({ cmdty_ore_iron: 2 });
  assert.match(ghostLensModel('sm_refinery', { ok: true, profile: p }).body, /30%/);
  const cap = machineCapability(SITE_MACHINE_BY_ID.get('sm_refinery'), p, 'sr_smelt_iron');
  assert.match(machineLensModel({ defId: 'sm_refinery', capability: cap, geo: p, status: { state: 'running' } }).numerals, /30%/);
  const cut = tileLensModel({ tile: { type: 'gas' }, cutPreview: { contactsLost: 1, powerLost: 8, processBonusLost: 0.15 } });
  assert.match(cut.body, /8 MW/); assert.match(cut.body, /15% process speed/);
});

test('factory outputs and imported lane stock have reachable Hold/Ship choices before production', () => {
  const f = factory();
  const rt = f.sys._runtime(f.site);
  rt.stores[rt.laneComps[0].key].cmdty_electronics = 2;
  const model = siteDrawerModel({ siteSys: f.sys, siteId: f.site.id });
  assert.ok(model.verbs.export.goods.some((g) => g.id === 'cmdty_control_unit' && !g.shipped));
  assert.ok(model.verbs.export.goods.some((g) => g.id === 'cmdty_electronics' && !g.shipped));
  assert.ok(!model.verbs.export.goods.some((g) => g.id === 'pod'));
});
