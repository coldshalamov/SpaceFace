import test from 'node:test';
import assert from 'node:assert/strict';
import { planSiteKit, planSiteProduction, summarizeIndustryCargo, INDUSTRY_KITS } from '../src/systems/siteIndustryPlanner.js';
import { SITE_MACHINES, SITE_RECIPES, SITE_RECIPE_BY_ID } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';

const plan = (targets, opts = {}) => planSiteProduction({ targets, ...opts });
const fakeRecipe = (id, inputs, output, extra = {}) => ({ id, machine: 'sm_fabricator', inputs, output, buildS: 10, ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('first claim imports the actual construction bill; no circular self-funding', () => {
  const result = planSiteKit('first_claim');
  assert.deepEqual(result.manifest, { cmdty_control_unit: 2, cmdty_refined_metals: 2, cmdty_regocrete: 7 });
  assert.equal(result.minimumGasContacts, 0);
  assert.equal(result.placementValidated, false);
});

test('existing core is subtracted once from incremental kit, not from power requirements', () => {
  const result = planSiteKit('first_claim', { alreadyBuilt: { sm_massline_core: 1 } });
  assert.deepEqual(result.manifest, { cmdty_control_unit: 1, cmdty_regocrete: 3 });
  assert.equal(result.baseMW, 12);
  assert.deepEqual(result.missingMachines, { sm_extractor: 1 });
});

test('courier kit admits its power debt instead of promising a free infinite factory', () => {
  const result = planSiteKit('courier');
  assert.equal(result.drawMW, 52);
  assert.equal(result.baseMW, 12);
  assert.equal(result.minimumGasContacts, 5);
  assert.equal(result.laneThroughputPerMin, 12);
  assert.equal(result.machineCount, 10);
});

test('all kit manifests resolve to live machines and commodity metadata', () => {
  for (const kit of INDUSTRY_KITS) {
    const p = planSiteKit(kit.id);
    assert.ok(summarizeIndustryCargo(p.manifest, COMMODITIES).complete);
    for (const id of Object.keys(p.machines)) assert.ok(SITE_MACHINES.some((m) => m.id === id));
  }
});

test('controller chain reaches real rare raw feedstocks and respects discrete batches', () => {
  const result = plan({ cmdty_control_unit: 1 });
  assert.deepEqual(result.procurement, { cmdty_ore_copper: 2, cmdty_ore_iron: 2, cmdty_ore_titanium: 1, cmdty_silicate: 5 });
  assert.deepEqual(result.remainingStock, { cmdty_control_unit: 1 });
  assert.deepEqual(result.machineTypes, ['sm_fabricator', 'sm_refinery']);
  assert.equal(result.steps.at(-1).recipeId, 'sr_fab_control_unit');
  close(result.machineSeconds, 60 + 40 + 75 + 180);
  assert.equal(result.executionValidated, false);
});

test('manufacturing existing stock consumes no recipe time', () => {
  const result = plan({ cmdty_control_unit: 2 }, { stock: { cmdty_control_unit: 3 } });
  assert.deepEqual(result.procurement, {});
  assert.deepEqual(result.usedStock, { cmdty_control_unit: 2 });
  assert.deepEqual(result.remainingStock, { cmdty_control_unit: 1 });
  assert.equal(result.machineSeconds, 0);
});

test('diamond dependency shares inventory exactly once', () => {
  const recipes = [fakeRecipe('left', { ingot: 1 }, { left_good: 1 }), fakeRecipe('right', { ingot: 1 }, { right_good: 1 })];
  const stock = { ingot: 1 };
  const result = plan({ left_good: 1, right_good: 1 }, { recipes, stock });
  assert.deepEqual(result.procurement, { ingot: 1 });
  assert.deepEqual(result.usedStock, { ingot: 1 });
  assert.deepEqual(stock, { ingot: 1 });
});

test('batch surplus satisfies a second branch rather than rounding each branch independently', () => {
  const recipes = [fakeRecipe('make_two', { rock: 3 }, { ingot: 2 }),
    fakeRecipe('left', { ingot: 1 }, { left_good: 1 }), fakeRecipe('right', { ingot: 1 }, { right_good: 1 })];
  const result = plan({ left_good: 1, right_good: 1 }, { recipes });
  assert.deepEqual(result.procurement, { rock: 3 });
  assert.equal(result.steps.filter((s) => s.recipeId === 'make_two').length, 1);
  assert.deepEqual(result.remainingStock, {});
});

test('final stock is reserved before any branch can consume it', () => {
  const recipes = [fakeRecipe('make_a', { z_final: 1 }, { a_final: 1 })];
  const result = plan({ a_final: 1, z_final: 1 }, { recipes, stock: { z_final: 1 } });
  assert.deepEqual(result.usedStock, { z_final: 1 });
  assert.deepEqual(result.procurement, { z_final: 1 });
});

test('manufacturing plan is independent of object insertion order', () => {
  const a = plan({ cmdty_electronics: 1, cmdty_regocrete: 3 });
  const b = plan({ cmdty_regocrete: 3, cmdty_electronics: 1 });
  assert.deepEqual(a, b);
});

test('inputs, goals and recipe definitions remain untouched', () => {
  const targets = { cmdty_regocrete: 3 };
  const stock = { cmdty_silicate: 2, cmdty_refined_metals: 1 };
  const before = JSON.stringify({ targets, stock, recipes: SITE_RECIPES });
  plan(targets, { stock });
  assert.equal(JSON.stringify({ targets, stock, recipes: SITE_RECIPES }), before);
});

test('import preference deliberately stops recursion at controller or intermediate goods', () => {
  const result = plan({ cmdty_control_unit: 3 }, { importGoods: ['cmdty_control_unit'] });
  assert.deepEqual(result.procurement, { cmdty_control_unit: 3 });
  assert.equal(result.steps.length, 0);
});

test('cyclic recipes fail with the dependency path rather than hanging', () => {
  const recipes = [fakeRecipe('make_a', { b: 1 }, { a: 1 }), fakeRecipe('make_b', { a: 1 }, { b: 1 })];
  assert.throws(() => plan({ a: 1 }, { recipes }), /a -> b -> a/);
});

test('ambiguous producers require an explicit recipe choice', () => {
  const recipes = [fakeRecipe('make_a', { ore_a: 1 }, { metal: 1 }), fakeRecipe('make_b', { ore_b: 1 }, { metal: 1 })];
  assert.throws(() => plan({ metal: 1 }, { recipes }), /Choose/);
  assert.deepEqual(plan({ metal: 1 }, { recipes, recipeChoice: { metal: 'make_b' } }).procurement, { ore_b: 1 });
});

test('fractional continuous batches are distinct from whole assembly batches', () => {
  const recipes = [fakeRecipe('continuous', { ore: 3 }, { metal: 1 }, { buildS: undefined, inputRatePerMin: 3 })];
  const result = plan({ metal: 0.5 }, { recipes });
  assert.deepEqual(result.procurement, { ore: 1.5 });
  assert.equal(result.steps[0].batches, 0.5);
  assert.equal(result.machineSeconds, 30);
});

test('invalid quantity maps and prototype-like ids are rejected', () => {
  for (const n of [-1, NaN, Infinity, 1_000_001, '2']) assert.throws(() => plan({ ore: n }));
  assert.throws(() => plan(JSON.parse('{"__proto__":1}')), /invalid id/);
  assert.throws(() => plan({ constructor: 1 }), /invalid id/);
  assert.throws(() => planSiteKit('unknown'));
  assert.throws(() => planSiteKit('first_claim', { alreadyBuilt: { sm_extractor: 0.5 } }));
});

test('unknown metadata never yields a deceptively complete cargo or price estimate', () => {
  const result = summarizeIndustryCargo({ pod: 1 }, COMMODITIES);
  assert.equal(result.complete, false);
  assert.deepEqual(result.unknownGoods, ['pod']);
});

test('new recipes use lighter, smaller outputs worth more at catalog baseline than their inputs', () => {
  for (const id of ['sr_blend_alloys', 'sr_fab_hullplate', 'sr_fab_circuitry', 'sr_fab_control_unit']) {
    const recipe = SITE_RECIPE_BY_ID.get(id);
    const input = summarizeIndustryCargo(recipe.inputs, COMMODITIES);
    const output = summarizeIndustryCargo(recipe.output, COMMODITIES);
    assert.ok(input.complete && output.complete, id);
    assert.ok(output.mass < input.mass, `${id}: mass`);
    assert.ok(output.volume < input.volume, `${id}: volume`);
    assert.ok(output.nominalValue > input.nominalValue, `${id}: value`);
    const machine = SITE_MACHINES.find((m) => m.id === recipe.machine);
    assert.ok(machine.modes.includes(id), `${id}: selectable through existing mode owner`);
  }
});
