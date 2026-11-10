import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { claims } from '../src/systems/claims.js';
import { automation } from '../src/systems/automation.js';
import { crafting } from '../src/systems/crafting.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { BLUEPRINTS, BLUEPRINT_BY_ID } from '../src/data/blueprints.js';
import { MATERIAL_RECIPE_BY_GOOD, SITE_RECIPE_BY_ID } from '../src/data/sites.js';
import { OUTPOSTS, BUILDABLE_OUTPOSTS } from '../src/data/automation.js';
import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { stepContinuousRecipe, stepFabricator } from '../src/systems/siteProduction.js';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [economy, cargo, claims, automation, crafting], updateOrder: [] });
  sim.state.mode = 'flight'; sim.state.simTime = 100;
  sim.state.world.currentSectorId = 'sector_helios_prime';
  sim.state.player.credits = 200000;
  sim.state.player.researchedNodes = ['tech_outpost_charter'];
  sim.state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 1000, capMass: 1000 };
  sim.registry.get('economy').newGame(); sim.registry.get('claims').newGame();
  return sim;
}

test('402: every overlapping material bill comes from one book, including hull plates and refined metals', () => {
  for (const blueprint of BLUEPRINTS) {
    const recipe = blueprint.outputs.kind === 'commodity' && MATERIAL_RECIPE_BY_GOOD[blueprint.outputs.id];
    if (!recipe) continue;
    assert.deepEqual(blueprint.inputs, recipe.inputs, blueprint.id);
    assert.equal(blueprint.outputs.qty, recipe.output[blueprint.outputs.id], blueprint.id);
  }
  const fuel = OUTPOSTS.find(row => row.id === 'outpost_fuelsynth');
  assert.equal(fuel.recipe, MATERIAL_RECIPE_BY_GOOD.cmdty_fuel_cells);
  assert.ok(OUTPOSTS.some(row => row.id === 'outpost_refinery'), 'saved ids stay resolvable');
  assert.ok(!BUILDABLE_OUTPOSTS.some(row => row.id === 'outpost_refinery'), 'the duplicate producer leaves the shop');
});

test('402: 100 iron makes 50 metals through actual hold crafting, site and native claim production', () => {
  const sim = boot(), { state } = sim;
  try {
    const craft = sim.registry.get('crafting'), owner = sim.registry.get('claims');
    addCargo(state, 'cmdty_ore_iron', 100);
    for (let i = 0; i < 50; i++) assert.equal(craft.build('bp_refine_metals', 'station_helios'), true);
    assert.equal(state.player.cargo.items.cmdty_refined_metals, 50);
    assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0);
    const store = { cmdty_ore_iron: 100 };
    stepContinuousRecipe({ recipeId: 'sr_smelt_iron', dtMin: 1000, powerRatio: 1, store, roomFor: () => Infinity, carry: {}, throughputBudget: null });
    assert.equal(store.cmdty_refined_metals, 50);
    const def = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');
    const body = { id: 'claim_1', sectorId: state.world.currentSectorId, spec: owner._freshSpec(def) };
    body.spec.store.input.cmdty_ore_iron = 100;
    owner._tickSpecRefinery(body, def, 10000);
    assert.equal(body.spec.store.output.cmdty_refined_metals, 50);
  } finally { sim.dispose(); }
});

test('402: hull plating consumes the same exact bill at the crafting bench and site fabricator', () => {
  const sim = boot(), { state } = sim;
  try {
    const blueprint = BLUEPRINT_BY_ID.get('bp_refine_hullplate'), recipe = SITE_RECIPE_BY_ID.get('sr_fab_hullplate');
    for (const [id, qty] of Object.entries(recipe.inputs)) addCargo(state, id, qty);
    assert.equal(sim.registry.get('crafting').build(blueprint.id, 'station_helios'), true);
    assert.equal(state.player.cargo.items.cmdty_comp_hullplate, 2);
    for (const id of Object.keys(recipe.inputs)) assert.equal(state.player.cargo.items[id] || 0, 0);
    const store = { ...recipe.inputs }, machine = {};
    for (let i = 0; i < 3; i++) stepFabricator({ machine, recipeId: recipe.id, dtS: 100, powerRatio: 1, store, roomFor: () => Infinity, wantsBuild: true });
    assert.equal(store.cmdty_comp_hullplate, 2);
    for (const id of Object.keys(recipe.inputs)) assert.equal(store[id] || 0, 0);
  } finally { sim.dispose(); }
});

test('402: current-version retirement preserves fractional goods, position, debt and Continue without a free POI', () => {
  const sim = boot(), { state, bus } = sim;
  const auto = sim.registry.get('automation'), owner = sim.registry.get('claims');
  try {
    owner._findFreeClaimablePoi = () => null;
    state.automation.accumulators.upkeepDebt = 17;
    state.automation.outposts.push({ id: 'old-refinery', defId: 'outpost_refinery', sectorId: state.world.currentSectorId,
      pos: { x: 1700, z: 900 }, storage: 23.75, storageGoodId: 'cmdty_refined_metals', level: 3, status: 'producing' });
    const credits = state.player.credits;
    assert.equal(auto.buildOutpost('outpost_refinery'), false);
    assert.equal(state.player.credits, credits, 'retired offer never charges');
    bus.emit('save:loaded', {});
    assert.equal(state.automation.outposts.length, 0);
    const body = state.claims.bodies[0];
    assert.equal(body.spec.id, 'spec_refinery');
    assert.equal(body.spec.store.output.cmdty_refined_metals, 23.75);
    assert.deepEqual({ x: body.x, z: body.z }, { x: 1700, z: 900 });
    assert.equal(state.automation.accumulators.upkeepDebt, 17);
    assert.equal(state.player.credits, credits);
    assert.ok([...state.entities.values()].some(entity => entity.alive && entity.data?.retiredRefineryClaimId === body.id), 'the fallback claim has a real world shell');
    const claimSave = JSON.parse(JSON.stringify(owner.serialize())), autoSave = JSON.parse(JSON.stringify(auto.serialize()));
    const snapshot = JSON.stringify(claimSave);
    auto.deserialize(autoSave); owner.deserialize(claimSave); bus.emit('save:loaded', {});
    assert.equal(JSON.stringify(owner.serialize()), snapshot, 'Continue neither duplicates nor re-charters the bank');
    assert.equal(state.automation.outposts.length, 0);
    assert.equal(owner.migrateRetiredRefineries(), 0);
    assert.equal(state.claims.bodies[0].spec.receipts.filter(receipt => receipt.kind === 'outpost_refinery_retired').length, 1);
  } finally { sim.dispose(); }
});

test('402: old paid queues retain their old product while new commits snapshot the canonical product through Continue', () => {
  const sim = boot(), { state } = sim, owner = sim.registry.get('crafting');
  try {
    owner.deserialize({ queues: { old: { bpId: 'bp_refine_metals', elapsed: 2, total: 3, stationId: 'old' } } });
    owner.update(1, state);
    assert.equal(state.player.cargo.items.cmdty_refined_metals, 2, 'old materials already paid for two metals');
    addCargo(state, 'cmdty_ore_iron', 2);
    owner.buildTime = () => 3;
    assert.equal(owner.build('bp_refine_metals', 'new'), true);
    assert.deepEqual(state.crafting.queues.new.product, { kind: 'commodity', id: 'cmdty_refined_metals', qty: 1 });
    owner.deserialize(JSON.parse(JSON.stringify(owner.serialize())));
    owner.update(3, state);
    assert.equal(state.player.cargo.items.cmdty_refined_metals, 3, 'new bill adds exactly its one canonical metal');
  } finally { sim.dispose(); }
});
