import test from 'node:test';
import assert from 'node:assert/strict';
import { machineCapability, contactProfile, stepContinuousRecipe, stepFabricator } from '../src/systems/siteProduction.js';
import { SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID } from '../src/data/sites.js';
import { planSiteProduction } from '../src/systems/siteIndustryPlanner.js';
const sum = (store) => Object.values(store).reduce((s, n) => s + n, 0);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const clone = (x) => JSON.parse(JSON.stringify(x));
function fabricator(overrides = {}) {
  return { machine: { job: null }, recipeId: 'sr_cast_regocrete', dtS: 1, powerRatio: 1,
    store: { cmdty_silicate: 2, cmdty_refined_metals: 1 }, roomFor: () => 100,
    wantsBuild: true, ...overrides };
}
function refinery(overrides = {}) {
  return { recipeId: 'sr_smelt_iron', dtMin: 1 / 60, powerRatio: 1,
    store: { cmdty_ore_iron: 10 }, roomFor: () => 100, carry: {}, throughputBudget: Infinity, ...overrides };
}

test('unknown machine definition safely has no production or power', () => {
  assert.deepEqual(machineCapability(null, null, null), {
    outputsPerMin: {}, powerGen: 0, powerDraw: 0, usesGeology: false, geologyLive: false,
  });
});

test('boring a contact removes its capability permanently; no planner compensation', () => {
  const field = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ type: 'dirt' })));
  field[1][1] = { type: 'empty' };
  const def = SITE_MACHINE_BY_ID.get('sm_extractor');
  const before = machineCapability(def, contactProfile(field, 1, 1, 3, 3));
  field[1][0] = { type: 'empty' };
  const after = machineCapability(def, contactProfile(field, 1, 1, 3, 3));
  close(before.outputsPerMin.cmdty_silicate - after.outputsPerMin.cmdty_silicate, 0.9);
});

test('paid refinery carry uses the space processing frees without overflowing the lane', () => {
  const args = refinery({ dtMin: 1, carry: { cmdty_refined_metals: 0.9 }, roomFor: () => 0.2 });
  const result = stepContinuousRecipe(args);
  assert.equal(result.status, 'running');
  assert.equal(args.store.cmdty_ore_iron, 7);
  assert.equal(args.store.cmdty_refined_metals, 2);
  close(args.carry.cmdty_refined_metals, 0.4);
  assert.ok(sum(args.store) <= 10.2);
});

test('continuous production conserves paid carry across different time partitions', () => {
  const a = refinery({ dtMin: 2 });
  const b = refinery();
  stepContinuousRecipe(a);
  for (let i = 0; i < 120; i++) stepContinuousRecipe(b);
  close(a.store.cmdty_ore_iron, b.store.cmdty_ore_iron);
  assert.equal(a.store.cmdty_refined_metals, b.store.cmdty_refined_metals);
  close(a.carry.cmdty_refined_metals || 0, b.carry.cmdty_refined_metals || 0);
  assert.equal(a.store.cmdty_refined_metals, 3);
});

test('continuous save/resume retains the paid output fraction exactly once', () => {
  const a = refinery();
  for (let i = 0; i < 13; i++) stepContinuousRecipe(a);
  const resumed = refinery(clone({ store: a.store, carry: a.carry }));
  for (let i = 0; i < 67; i++) { stepContinuousRecipe(a); stepContinuousRecipe(resumed); }
  assert.deepEqual(a.store, resumed.store);
  assert.deepEqual(a.carry, resumed.carry);
  assert.equal(resumed.store.cmdty_refined_metals, 2);
});

test('completed fabricator waits for output space, survives Continue, and emits once', () => {
  const args = fabricator();
  assert.equal(stepFabricator(args).started, true);
  assert.equal(sum(args.store), 0);
  args.roomFor = () => 0;
  args.dtS = 1000;
  const held = stepFabricator(args);
  assert.equal(held.status, 'backlogged');
  assert.equal(held.completed, null);
  assert.deepEqual(args.machine.job, { recipeId: 'sr_cast_regocrete', progressS: 45 });
  const restored = fabricator({ machine: clone(args.machine), store: clone(args.store), roomFor: () => 0, wantsBuild: false });
  for (let i = 0; i < 300; i++) assert.equal(stepFabricator(restored).completed, null);
  assert.equal(restored.machine.job.progressS, 45);
  restored.roomFor = () => 2;
  assert.deepEqual(stepFabricator(restored).completed, { outputId: 'cmdty_regocrete', qty: 2 });
  assert.equal(stepFabricator(restored).completed, null);
  assert.equal(restored.store.cmdty_regocrete, 2);
});

test('two completed fabricators cannot both claim the same remaining lane space', () => {
  const store = {};
  const args = () => fabricator({ machine: { job: { recipeId: 'sr_cast_regocrete', progressS: 45 } },
    store, roomFor: () => Math.max(0, 2 - sum(store)), wantsBuild: false });
  const first = args(); const second = args();
  assert.ok(stepFabricator(first).completed);
  assert.equal(stepFabricator(second).status, 'backlogged');
  assert.equal(sum(store), 2);
  assert.ok(second.machine.job);
});

test('pause and nonfinite deltas do not start, finish or abandon assembly jobs', () => {
  for (const dtS of [0, -1, NaN, Infinity]) {
    const args = fabricator({ dtS });
    const before = clone({ machine: args.machine, store: args.store });
    assert.equal(stepFabricator(args).started, false);
    assert.deepEqual({ machine: args.machine, store: args.store }, before);
  }
});

test('continuous invalid deltas are no-ops, including an infinite backlog', () => {
  for (const dtMin of [0, -1, NaN, Infinity]) {
    const args = refinery({ dtMin });
    const before = clone({ store: args.store, carry: args.carry });
    stepContinuousRecipe(args);
    assert.deepEqual({ store: args.store, carry: args.carry }, before);
  }
});

test('invalid room reports fail closed for both assembly and refining', () => {
  for (const room of [NaN, -1]) {
    const assembly = fabricator({ roomFor: () => room });
    assert.equal(stepFabricator(assembly).started, false);
    assert.equal(sum(assembly.store), 3);
    const continuous = refinery({ dtMin: 1, roomFor: () => room });
    assert.equal(stepContinuousRecipe(continuous).moved, 0);
  }
});

test('nonfinite power cannot consume assembly inputs or advance its committed job', () => {
  const args = fabricator({ powerRatio: NaN });
  assert.equal(stepFabricator(args).status, 'no-power');
  assert.equal(sum(args.store), 3);
  args.powerRatio = 1;
  stepFabricator(args);
  args.powerRatio = NaN;
  assert.equal(stepFabricator(args).status, 'no-power');
  assert.equal(args.machine.job.progressS, 0);
});

test('invalid carry fails closed instead of laundering a corrupt output balance', () => {
  for (const bad of [NaN, Infinity, -1, 1]) {
    const args = refinery({ carry: { cmdty_refined_metals: bad } });
    const result = stepContinuousRecipe(args);
    assert.equal(result.limit, 'invalid-carry');
    assert.equal(args.store.cmdty_ore_iron, 10);
    assert.ok(Object.is(args.carry.cmdty_refined_metals, bad));
  }
});

test('courier output remains fleet equipment, not a commodity or a second delivery', () => {
  const args = fabricator({ recipeId: 'sr_fab_courier',
    store: { cmdty_refined_metals: 1, cmdty_purified_silica: 1, cmdty_electronics: 1 },
    roomFor: () => { throw new Error('pod must not ask cargo capacity'); } });
  stepFabricator(args);
  args.dtS = 90;
  assert.deepEqual(stepFabricator(args).completed, { outputId: 'pod', qty: 1 });
  assert.equal(args.store.pod, undefined);
  args.wantsBuild = false;
  assert.equal(stepFabricator(args).completed, null);
});

test('deliberate mode swap retains the existing abandoned-batch cost contract', () => {
  const args = fabricator();
  stepFabricator(args);
  args.recipeId = 'sr_fab_electronics'; args.wantsBuild = false;
  assert.equal(stepFabricator(args).completed, null);
  assert.equal(args.machine.job, null);
  assert.equal(sum(args.store), 0);
});

test('bounded lane budgets and missing inputs never produce free output', () => {
  assert.equal(stepContinuousRecipe(refinery({ throughputBudget: 0 })).moved, 0);
  assert.equal(stepContinuousRecipe(refinery({ store: {} })).moved, 0);
  const args = refinery({ dtMin: 1, throughputBudget: 0.3 });
  close(stepContinuousRecipe(args).moved, 0.3);
  close(args.store.cmdty_ore_iron, 9.8);
});

test('real planned controller chain executes through the existing production helpers', () => {
  const plan = planSiteProduction({ targets: { cmdty_control_unit: 2 } });
  let store = { ...plan.procurement };
  for (const step of plan.steps) {
    const recipe = SITE_RECIPE_BY_ID.get(step.recipeId);
    if (recipe.buildS) {
      const args = fabricator({ recipeId: recipe.id, store });
      for (let n = 0; n < step.batches; n++) {
        assert.equal(stepFabricator(args).started, true);
        args.machine = clone(args.machine); // cold-save boundary after paying inputs
        args.dtS = recipe.buildS;
        const result = stepFabricator(args);
        assert.ok(result.completed, recipe.id);
        args.dtS = 1;
      }
    } else {
      const result = stepContinuousRecipe(refinery({ recipeId: recipe.id, store,
        dtMin: step.machineSeconds / 60 }));
      assert.ok(result.moved > 0, recipe.id);
    }
    store = clone(store);
  }
  assert.equal(store.cmdty_control_unit, 2);
  close(sum(store), 2);
});

test('a full input store can process itself into a smaller output', () => {
  const store = { cmdty_ore_iron: 80 };
  const refined = stepContinuousRecipe(refinery({ store, roomFor: () => 80 - sum(store) }));
  assert.ok(refined.moved > 0, 'full ore stock can feed the refinery');
  assert.ok(sum(store) < 80);
  const assembly = fabricator({ roomFor: () => 0 });
  assert.equal(stepFabricator(assembly).started, true, 'committing inputs makes room for the output');
  assert.equal(sum(assembly.store), 0);
});

test('full input stores with paid refinery carry keep processing and cold-resume without loss', () => {
  for (const initialCarry of [0.4, 0.9]) {
    let args = refinery({ store: { cmdty_ore_iron: 4 },
      carry: { cmdty_refined_metals: initialCarry }, throughputBudget: 0.2 });
    args.roomFor = () => Math.max(0, 4 - sum(args.store));
    let stepped = 0;
    for (let i = 0; i < 80; i++) {
      const result = stepContinuousRecipe(args);
      if (result.moved > 0) stepped++;
      assert.ok(sum(args.store) <= 4 + 1e-9, `carry=${initialCarry}, tick=${i}: capacity`);
      assert.ok(args.carry.cmdty_refined_metals >= 0 && args.carry.cmdty_refined_metals < 1,
        `carry=${initialCarry}, tick=${i}: persisted carry remains valid`);
      close((args.store.cmdty_refined_metals || 0) + args.carry.cmdty_refined_metals,
        initialCarry + (4 - args.store.cmdty_ore_iron) / 2);
      if (i === 9) Object.assign(args, clone({ store: args.store, carry: args.carry }));
    }
    assert.equal(stepped, 80, 'a full store never stalls on its own paid carry');
    close(args.store.cmdty_ore_iron, 0);
    close((args.store.cmdty_refined_metals || 0) + args.carry.cmdty_refined_metals, 2 + initialCarry);
  }
});

test('fabricators stage real material within the lane budget, with exact cold-resume accounting', () => {
  let args = fabricator({ throughputBudget: 0.2 });
  let completed = 0;
  let moved = 0;
  for (let i = 0; i < 90; i++) {
    const result = stepFabricator(args);
    assert.ok(result.moved <= 0.2 + 1e-9, `tick ${i} moved ${result.moved}`);
    moved += result.moved;
    if (result.completed) { completed++; args.wantsBuild = false; }
    if ([4, 25, 65].includes(i)) {
      args = fabricator({ ...args, ...clone({ machine: args.machine, store: args.store }) });
    }
  }
  assert.equal(completed, 1);
  close(moved, 5); // 3 input + 2 output units, charged exactly once.
  close(args.store.cmdty_regocrete, 2);
  close(sum(args.store), 2);
  assert.equal(args.machine.job, null);
});

test('zero lane budget cannot start an assembly batch or spend its inputs', () => {
  const args = fabricator({ throughputBudget: 0 });
  assert.equal(stepFabricator(args).limit, 'lane');
  assert.equal(sum(args.store), 3);
  assert.equal(args.machine.job, null);
});
