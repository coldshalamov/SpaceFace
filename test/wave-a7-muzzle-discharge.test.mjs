// §22 A7 (build_map §22.3 row A7) — default-kit muzzles move: the discharge flow for the
// starter weapons is non-zero for the life of the shot, and no new particle family carries it.
//
// Two layers:
//  1. The live route — the starter kits' weapon modules resolve through the one weapon
//     classifier to the pool's recipes; each starter muzzle is spawned the way
//     WeaponPresenter.handleFire spawns it (full accessibility profile) and the drawn flow
//     term (descriptor 16, the `life * flow * 5` band transport the fragment shader advances)
//     is sampled at ignition and on every frame up to the last frame before the shot dies.
//  2. The continuous budget — `dischargeFlowAt` × the discharge envelope is strictly positive
//     for every age in [0, life) and lands on zero exactly when the shot ends, and one flash
//     carries the band across the bore (2π) before it dies.
//
// "No new particle family" is pinned by the census: DISCHARGE_FLOW stays exactly the two
// existing source beats the discharge pool already draws (machined-burst, split-aperture),
// and every starter weapon's flow is read out of that existing map.

import test from 'node:test';
import assert from 'node:assert/strict';

import { NEW_GAME, NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import {
  DISCHARGE_FLOW,
  WeaponDischargePool,
  dischargeFlowAt,
} from '../src/render/forceLanguage/weaponDischargePool.js';
import { weaponSignature } from '../src/render/forceLanguage/catalog.js';
import { sampleDischargeLifecycle } from '../src/render/forceLanguage/effectLifecycle.js';
import {
  recipeUsesSweptMuzzle,
  resolveWeaponRecipe,
} from '../src/render/weapons/recipes.js';

// The default kit a new pilot spawns with: the legacy NEW_GAME fit plus every PQ-156 starter.
const STARTER_WEAPON_IDS = [
  ...new Set(
    [NEW_GAME, ...NEW_GAME_STARTERS]
      .flatMap((kit) => kit.fittedModules)
      .filter((id) => id.startsWith('wpn_')),
  ),
];

const POSE = { x: 0, y: 0.4, z: 0, ax: 1, ay: 0, az: 0 };
const DT = 1 / 60;

/** Replace the swept batch with a collector so the drawn flow term is readable per frame. */
function collectingPool() {
  const pool = new WeaponDischargePool(null, { capacity: 4 });
  const frames = [];
  let current = null;
  pool.batch.dispose();
  pool.batch = {
    begin() { current = []; frames.push(current); },
    add(values) { current.push(Float32Array.from(values)); return true; },
    end() {},
    reproject() {},
    dispose() {},
  };
  pool.frames = frames;
  return pool;
}

/** Muzzle flash exactly as WeaponPresenter.handleFire builds it on the full a11y profile
 *  (FULL: flashMinLife 0, size/opacity scales 1) — the default player route. */
function muzzleFlash(recipe) {
  const muzzle = recipe.muzzle;
  return { life: muzzle.life, size0: muzzle.width, size1: muzzle.height, opacity0: 1.35, pxw: 0 };
}

/** Fire one starter muzzle and walk it frame by frame, returning the flow term per frame. */
function fireAndWalk(recipe) {
  const pool = collectingPool();
  pool.spawn(recipe, POSE, 'player', muzzleFlash(recipe), 1);
  const samples = [];
  const flowOf = (strips) => Math.min(...strips.map((d) => d[16]));
  pool.update(0, null, null); // the true ignition frame: age 0, transport already live
  samples.push({ age: 0, flow: flowOf(pool.frames.at(-1)), strips: pool.frames.at(-1).length });
  let guard = 0;
  while (pool.activeCount > 0 && guard++ < 64) {
    pool.update(DT, null, null);
    const frame = pool.frames.at(-1);
    if (frame.length > 0) {
      samples.push({ age: pool.slots.find((s) => s.alive).age, flow: flowOf(frame), strips: frame.length });
    }
  }
  const framesAfterLife = pool.frames.length;
  pool.update(DT, null, null); // after death the pool publishes nothing at all
  const retired = pool.activeCount === 0;
  const postMortemFrames = pool.frames.length - framesAfterLife;
  pool.dispose();
  return { samples, retired, postMortemFrames };
}

test('the starter kits ride the existing discharge sources, and the flow census is unchanged', () => {
  // No new particle family: the flow map stays exactly the two source beats the discharge
  // pool already draws. A third key here would be a new family arriving through the back door.
  assert.deepEqual(
    Object.keys(DISCHARGE_FLOW).sort(),
    ['machined-burst', 'split-aperture'],
    'DISCHARGE_FLOW is the frozen two-source census',
  );
  assert.equal(DISCHARGE_FLOW['machined-burst'], 18);
  assert.equal(DISCHARGE_FLOW['split-aperture'], 14);

  // The known default-kit guns are covered: pulse laser on every starter, autocannon on the Wasp.
  assert.ok(STARTER_WEAPON_IDS.includes('wpn_pulse_laser_s'), 'the starter pulse gun is in the kit union');
  assert.ok(STARTER_WEAPON_IDS.includes('wpn_autocannon_s'), 'the Wasp shove gun is in the kit union');

  for (const weaponId of STARTER_WEAPON_IDS) {
    const recipe = resolveWeaponRecipe(weaponId);
    assert.ok(recipeUsesSweptMuzzle(recipe), `${weaponId} fires a swept muzzle through the discharge pool`);
    const signature = weaponSignature(recipe.variant);
    assert.ok(signature, `${weaponId} has a real force-language signature (no silent fallback)`);
    const speed = DISCHARGE_FLOW[signature.source];
    assert.ok(
      Number.isFinite(speed) && speed > 0,
      `${weaponId} (${recipe.variant}) draws its flow from the existing ${signature.source} beat`,
    );
  }
});

for (const weaponId of STARTER_WEAPON_IDS) {
  test(`${weaponId}: discharge flow is non-zero for the life of the shot`, () => {
    const recipe = resolveWeaponRecipe(weaponId);
    const { source } = weaponSignature(recipe.variant);
    const speed = DISCHARGE_FLOW[source];
    const life = Math.max(0.035, recipe.muzzle.life);

    // 1. Frame walk at the sim rate: never a single-frame burst, alive at ignition and still
    //    moving on the last frame before the shot dies.
    const { samples, retired, postMortemFrames } = fireAndWalk(recipe);
    assert.ok(retired, 'the shot retires on its own life budget');
    assert.equal(postMortemFrames, 0, 'nothing is emitted after the shot dies');
    assert.ok(
      samples.length >= 3,
      `${weaponId} lives ${samples.length} frames at 60 Hz — a one-frame burst would fail this`,
    );
    for (const sample of samples) {
      assert.ok(sample.flow > 0, `flow at age ${sample.age.toFixed(4)}s must move (${sample.flow})`);
      assert.ok(sample.strips > 0, 'every live frame draws source geometry');
    }
    const lastAge = samples.at(-1).age;
    assert.ok(
      lastAge >= life * 0.5,
      `the last emitted frame sits at ${lastAge.toFixed(4)}s of a ${life}s shot — near-death flow must survive`,
    );

    // 2. Continuous budget: transport is strictly positive for EVERY age inside the shot, holds
    //    one steady speed, and lands on zero exactly when the shot ends.
    const env = { length: 1, width: 1, opacity: 1 };
    const N = 240;
    for (let i = 0; i < N; i++) {
      const age = (i / N) * life;
      const flowTerm = dischargeFlowAt(source, age, life) * sampleDischargeLifecycle(age, life, false, env).opacity;
      assert.ok(flowTerm > 0, `flow term at t=${(i / N).toFixed(3)} of life must be non-zero (${flowTerm})`);
    }
    assert.equal(dischargeFlowAt(source, life, life), 0, 'flow dies with the shot');
    assert.equal(dischargeFlowAt(source, life * 1.5, life), 0, 'no flow outlives the shot');

    // 3. The band's travel RATE crosses the bore within the flash's life: peak-flow rate times
    //    life exceeds 2π. This is a peak-rate proxy, not integrated travel — the CPU envelope
    //    scales the flow term down over the flash's life (and the fragment integrates
    //    vCycle.z * vFlow.x * 5), so real integrated travel is a fraction of this figure. The
    //    row's claim this test owns is per-frame flow non-zero, which block 2 pins directly.
    assert.ok(
      life * speed * 5 >= Math.PI * 2,
      `${weaponId} peak band-travel rate ${life * speed * 5} rad/life must exceed 2π`,
    );
  });
}
