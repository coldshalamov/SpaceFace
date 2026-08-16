import assert from 'node:assert/strict';
import test from 'node:test';

import { BLUEPRINTS } from '../src/data/blueprints.js';
import { OUTPOSTS } from '../src/data/automation.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { automation } from '../src/systems/automation.js';
import { combat } from '../src/systems/combat.js';
import { crafting } from '../src/systems/crafting.js';
import { economy } from '../src/systems/economy.js';
import { fields } from '../src/systems/fields.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { mining } from '../src/systems/mining.js';

const FIELD_BLUEPRINTS = BLUEPRINTS.filter((bp) => bp.fieldCraftable === true);

function shipSpec({ team, x, hull = 180 }) {
  return {
    type: 'ship', team, collides: true,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 8, mass: 24, hull, hullMax: hull,
    armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: 0, shieldMax: 0, cap: 100, capMax: 100, capRegen: 4,
    flags: {},
    physicsBody: { schemaVersion: 1, radius: 8, mass: 24, inertiaY: 48, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', derived: { damageReductionMult: 1 } },
  };
}

test('the default field route mines iron, fabricates charges, and spends one in a physical combat blast', () => {
  const impulses = [];
  const sim = createSimulation({
    seed: 0x430043,
    helpers: {
      combatPhysics: {
        applyImpulse(request) { impulses.push(structuredClone(request)); return true; },
        applyTorqueImpulse() { return true; },
      },
    },
    systems: [cargo, crafting, mining, combat, impulseCharges],
  });
  const { state } = sim;
  try {
    state.mode = 'flight';
    state.ui.docked = false;
    state.ui.screenStack = [];
    state.input.actions = {};
    state.input.aimAngle = 0;
    state.input.aimWorld = { x: 50, z: 0 };
    state.rng = () => 0.99; // common-rock table: deterministic iron, not a synthetic cargo grant
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
    state.player.moduleInventory = [];
    state.player.researchedNodes = [];
    state.player.miningBeam = { tierId: 'beam_mk1', directToCargo: true };

    const player = sim.spawn(shipSpec({ team: 0, x: 0, hull: 500 }));
    player.data.miningBeam = state.player.miningBeam;
    state.playerId = player.id;
    const hostile = sim.spawn(shipSpec({ team: 1, x: 18, hull: 120 }));
    const rock = sim.spawn({
      type: 'asteroid', collides: true,
      pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 6, hull: 18, hullMax: 18,
      data: { typeId: 'ast_common_rock', oreHP: 18, oreHPMax: 18, yieldU: 8, tierCap: 0 },
    });

    state.input.fireGroup = 2;
    for (let tick = 0; tick < 180 && rock.alive !== false; tick++) sim.step(SIM_DT);
    state.input.fireGroup = null;
    assert.equal(rock.alive, false, 'the production mining beam physically exhausts the rock');
    assert.ok((state.player.cargo.items.cmdty_ore_iron || 0) >= 3,
      'the mined rock delivers enough physical iron for the two-step ordnance chain');

    const craftingOwner = sim.registry.get('crafting');
    assert.equal(craftingOwner.isBlueprintUnlocked('bp_field_impulse_charges'), true,
      'a real player mining yield unlocks the starter ordnance knowledge');
    assert.equal(craftingOwner.buildField('bp_field_explosive_compound'), true);
    assert.equal(craftingOwner.buildField('bp_field_impulse_charges'), true);
    assert.equal(state.player.cargo.items.cmdty_impulse_charge, 2,
      'refining and packing yield two usable charges without a station');

    const hullBefore = hostile.hull;
    state.input.actions.chargeThrow = true;
    sim.step(SIM_DT);
    assert.equal(state.player.cargo.items.cmdty_impulse_charge, 1,
      'throwing through the live weapon owner consumes exactly one crafted unit');
    let charge = state.entityList.find((entity) => entity.type === 'charge' && entity.alive !== false);
    assert.ok(charge, 'the spent unit exists as a deployed physical charge');
    for (let tick = 0; tick < 12 && !charge.data.armed; tick++) sim.step(SIM_DT);
    assert.equal(charge.data.hostId, hostile.id, 'the thrown charge sticks to the hostile hull in the fight');

    state.input.actions.chargeDetonate = true;
    sim.step(SIM_DT);
    assert.equal(charge.alive, false, 'detonation retires the physical charge entity');
    assert.ok(hostile.hull < hullBefore, 'the existing combat kernel applies the explosive packet');
    assert.ok(impulses.some((request) => request.entityId === hostile.id && request.reason === 'impulse_charge'),
      'the existing physics authority accepts the blast impulse');
    assert.equal(state.player.cargo.items.cmdty_impulse_charge, 1,
      'detonation does not duplicate or refund the consumed crafted unit');
  } finally {
    sim.dispose();
  }
});

test('all five short chains are play-unlocked and retain ordinary market alternatives', () => {
  const chains = new Set(FIELD_BLUEPRINTS.map((bp) => bp.fieldChain));
  assert.deepEqual([...chains].sort(), ['field_tech', 'fuel', 'ordnance', 'repairs', 'tether']);
  assert.ok(FIELD_BLUEPRINTS.every((bp) => bp.timeS === 0 && bp.unlock?.source),
    'field decisions are immediate and every blueprint names a play source');
  assert.ok(FIELD_BLUEPRINTS.every((bp) => ['mining', 'salvage', 'faction_rep', 'ace', 'cache'].includes(bp.unlock.source)),
    'no field blueprint uses a vendor-grind unlock');

  const commodities = new Map(COMMODITIES.map((item) => [item.id, item]));
  const modules = new Map(MODULES.map((item) => [item.id, item]));
  const weapons = new Map(WEAPONS.map((item) => [item.id, item]));
  for (const bp of FIELD_BLUEPRINTS) {
    const output = bp.outputs.kind === 'commodity'
      ? commodities.get(bp.outputs.id)
      : bp.outputs.kind === 'module'
        ? modules.get(bp.outputs.id)
        : weapons.get(bp.outputs.id);
    assert.ok(output, `${bp.id} resolves its output through a canonical owner catalog`);
    const marketPrice = bp.outputs.kind === 'commodity' ? output.basePrice : output.price;
    assert.ok(marketPrice > 0, `${bp.outputs.id} retains a paid market alternative`);
  }
});

test('specialist play receipts unlock pure factory recipe contracts without exposing writers', () => {
  const sim = createSimulation({ seed: 0x430099, systems: [cargo, crafting] });
  try {
    const owner = sim.registry.get('crafting');
    assert.equal(owner.automationRecipe('bp_field_tether_cable'), null);
    sim.bus.emit('salvage:completed', { sourceId: 'wreck_real' });
    const recipe = owner.automationRecipe('bp_field_tether_cable');
    assert.deepEqual(recipe, {
      blueprintId: 'bp_field_tether_cable',
      inputs: { cmdty_alloys: 1, cmdty_electronics: 1 },
      output: { cmdty_tether_cable: 2 },
    });
    assert.equal(Object.values(recipe).some((value) => typeof value === 'function'), false,
      'the automation handoff contains no cargo or wallet writer');
    recipe.inputs.cmdty_alloys = 999;
    assert.equal(owner.automationRecipe('bp_field_tether_cable').inputs.cmdty_alloys, 1,
      'the factory receives a detached conversion contract, not mutable blueprint authority');

    sim.bus.emit('faction:repChanged', { factionId: 'faction_scn', delta: 1 });
    sim.bus.emit('namedAce:defeated', { aceId: 'ace_real' });
    sim.bus.emit('vestaOreCache:resolved', { choiceId: 'extract' });
    assert.equal(owner.isBlueprintUnlocked('bp_field_jump_fuel'), true);
    assert.equal(owner.isBlueprintUnlocked('bp_field_vector_mine'), true);
    assert.equal(owner.isBlueprintUnlocked('bp_field_emitter_charge'), true);
  } finally {
    sim.dispose();
  }
});

test('crafted fuel, repair, and emitter supplies spend only after their owning system accepts', (t) => {
  const previousFieldsFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  t.after(() => { FIELD_FLAGS.enabled = previousFieldsFlag; });
  const sim = createSimulation({ seed: 0x430077, systems: [economy, cargo, fields, combat, crafting] });
  try {
    const { state } = sim;
    state.mode = 'paused';
    state.ui.docked = false;
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
    const player = sim.spawn(shipSpec({ team: 0, x: 0, hull: 180 }));
    player.hull = 100;
    state.playerId = player.id;
    const nearbyHostile = sim.spawn(shipSpec({ team: 1, x: 100, hull: 120 }));
    state.fuel = { current: 50, max: 100 };
    state.fields.cooldowns.well = state.simTime + 7;
    addCargo(state, 'cmdty_jump_fuel_canister', 1);
    addCargo(state, 'cmdty_patch_kit', 2);
    addCargo(state, 'cmdty_field_emitter_charge', 1);

    const owner = sim.registry.get('crafting');
    assert.equal(owner.useFieldSupply('cmdty_jump_fuel_canister').applied, 25);
    assert.equal(state.fuel.current, 75);
    assert.equal(state.player.cargo.items.cmdty_jump_fuel_canister, undefined);

    const denied = owner.useFieldSupply('cmdty_patch_kit');
    assert.equal(denied.reason, 'hostiles_nearby');
    assert.equal(state.player.cargo.items.cmdty_patch_kit, 2,
      'a combat-owner denial never burns the physical kit');
    nearbyHostile.pos.x = 1000;
    assert.equal(owner.useFieldSupply('cmdty_patch_kit').applied, 18);
    assert.equal(player.hull, 118);
    assert.equal(state.player.cargo.items.cmdty_patch_kit, 1);

    const emitter = owner.useFieldSupply('cmdty_field_emitter_charge', { kind: 'well' });
    assert.equal(emitter.ok, true);
    assert.equal(state.fields.cooldowns.well, state.simTime);
    assert.equal(state.player.cargo.items.cmdty_field_emitter_charge, undefined);
  } finally {
    sim.dispose();
  }
});

test('factory sites chain learned commodity recipes through automation-owned storage only', () => {
  const sim = createSimulation({ seed: 0x4300aa, systems: [crafting, automation] });
  try {
    const { state } = sim;
    const craftingOwner = sim.registry.get('crafting');
    const automationOwner = sim.registry.get('automation');
    craftingOwner.unlockSource('mining', { asteroidId: 'ast_real' });
    const source = {
      id: 41, defId: 'outpost_refinery', sectorId: 'sector_chain', level: 1,
      storage: 0, storageCap: 300, status: 'producing', autoSell: false,
    };
    const sink = {
      id: 42, defId: 'outpost_refinery', sectorId: 'sector_chain', level: 1,
      storage: 0, storageCap: 300, status: 'producing', autoSell: false,
    };
    state.world.currentSectorId = 'sector_chain';
    state.automation.outposts = [source, sink];
    state.automation.drones = [{
      id: 43, defId: 'drone_mk1', sectorId: 'sector_chain', oreType: 'cmdty_ore_iron',
      buffer: 10, bufferCap: 60, fuel: 240, status: 'idle',
    }];
    assert.equal(automationOwner.assignOutpostRecipe(source.id, 'bp_field_explosive_compound'), true);
    assert.equal(automationOwner.assignOutpostRecipe(sink.id, 'bp_field_impulse_charges'), true);
    source.storage = 4;
    const cargoBefore = structuredClone(state.player.cargo);
    const creditsBefore = state.player.credits;
    const ironBefore = state.automation.drones[0].buffer;
    const sourceBefore = source.storage;
    const def = OUTPOSTS.find((entry) => entry.id === sink.defId);

    const result = automationOwner._advanceOutpost(sink, def, 2, state.automation);
    assert.ok(result.produced > 0);
    assert.equal(sink.production.outputGoodId, 'cmdty_impulse_charge');
    assert.ok(source.storage < sourceBefore, 'the second factory consumes the first factory output');
    assert.ok(state.automation.drones[0].buffer < ironBefore, 'the second input comes from its local ore feeder');
    assert.deepEqual(state.player.cargo, cargoBefore, 'factory production never writes the player hold');
    assert.equal(state.player.credits, creditsBefore, 'factory production never becomes a wallet writer');
  } finally {
    sim.dispose();
  }
});
