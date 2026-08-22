// CRU-009 — wave-recipe schema: live ids, frozen catalog, validator issues.
import test from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  SURVIVAL_GATE_GROUPS,
  SURVIVAL_WAVE_ROLES,
  SURVIVAL_WAVES,
  peakConcurrentDemand,
  validateWaveRecipe,
} from '../src/data/survivalWaves.js';

const ENEMY_IDS = new Set(ENEMY_TYPES.map((enemy) => enemy.id));
const ARENA_IDS = COMBAT_LAB_ARENAS.map((arena) => arena.id);
const DOCTRINE_BY_ENEMY = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy.combatDoctrineId || null]));

function blockFor(arenaId) {
  return SURVIVAL_WAVES
    .filter((recipe) => recipe.arenaId === arenaId)
    .sort((a, b) => a.wave - b.wave);
}

/** Tick the last body of a package actually arrives on: atTick + gap * (batches - 1). */
function lastBatchTick(pkg) {
  const size = Number.isInteger(pkg.batchSize) && pkg.batchSize > 0 ? pkg.batchSize : pkg.count;
  const batches = Math.max(1, Math.ceil(pkg.count / size));
  const gap = Number.isInteger(pkg.batchGapTicks) ? pkg.batchGapTicks : 0;
  return pkg.atTick + gap * (batches - 1);
}

function archetypeMix(recipe) {
  return [...new Set(recipe.packages.map((pkg) => pkg.enemyId))].sort().join(',');
}

function issuePaths(result) {
  return (result.issues || []).map((entry) => entry && entry.path);
}

function assertIssuePath(result, path) {
  assert.equal(result.ok, false, `expected rejection for ${path}`);
  assert.ok(
    issuePaths(result).includes(path),
    `expected issue path ${path}, got ${JSON.stringify(result.issues)}`,
  );
}

function cloneRecipe(overrides = {}) {
  const base = SURVIVAL_WAVES[0];
  return {
    id: base.id,
    schemaVersion: base.schemaVersion,
    arenaId: base.arenaId,
    wave: base.wave,
    objective: { ...base.objective },
    threatBudget: base.threatBudget,
    packages: base.packages.map((pkg) => ({ ...pkg })),
    arenaPhase: base.arenaPhase,
    completion: {
      ...base.completion,
      blockingRolesResolved: [...base.completion.blockingRolesResolved],
    },
    rewards: { ...base.rewards },
    ...overrides,
  };
}

function assertDeepFrozen(value, path = '$') {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value), `expected frozen at ${path}`);
    if (Array.isArray(value)) {
      value.forEach((item, i) => assertDeepFrozen(item, `${path}[${i}]`));
      return;
    }
    for (const key of Object.keys(value)) {
      assertDeepFrozen(value[key], `${path}.${key}`);
    }
  }
}

test('validateWaveRecipe accepts every authored recipe in SURVIVAL_WAVES', () => {
  assert.ok(SURVIVAL_WAVES.length > 0);
  for (const recipe of SURVIVAL_WAVES) {
    const result = validateWaveRecipe(recipe);
    assert.equal(result.ok, true, `${recipe.id}: ${JSON.stringify(result.issues)}`);
    assert.deepEqual(result.issues, []);
  }
});

test('validateWaveRecipe rejects illegal fields with the exact issue path', () => {
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], enemyId: 'not_a_real_enemy' }],
    })),
    'packages[0].enemyId',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], count: 0 }],
    })),
    'packages[0].count',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], count: 1.5 }],
    })),
    'packages[0].count',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], count: 4, batchSize: 5 }],
    })),
    'packages[0].batchSize',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], atTick: -1 }],
    })),
    'packages[0].atTick',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], role: 'minion' }],
    })),
    'packages[0].role',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      packages: [{ ...SURVIVAL_WAVES[0].packages[0], gateGroup: 'northwest_portal' }],
    })),
    'packages[0].gateGroup',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({ objective: null })),
    'objective',
  );
  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      completion: {
        requiredPackagesMaterialized: true,
        blockingRolesResolved: ['elite'],
        cleanupTicks: 180,
      },
    })),
    'completion.blockingRolesResolved[0]',
  );

  const overCap = cloneRecipe({
    packages: [{
      atTick: 0,
      gateGroup: 'nw',
      role: 'mass',
      enemyId: 'wasp_swarmer',
      count: 25,
      batchSize: 25,
      batchGapTicks: 0,
    }],
  });
  // 24 is DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
  assertIssuePath(validateWaveRecipe(overCap), 'packages');

  const emptyCompletion = validateWaveRecipe(cloneRecipe({ completion: {} }));
  assertIssuePath(emptyCompletion, 'completion.requiredPackagesMaterialized');
  assertIssuePath(emptyCompletion, 'completion.blockingRolesResolved');
  assertIssuePath(emptyCompletion, 'completion.cleanupTicks');

  assertIssuePath(
    validateWaveRecipe(cloneRecipe({
      completion: {
        requiredPackagesMaterialized: true,
        blockingRolesResolved: 'mass',
        cleanupTicks: 180,
      },
    })),
    'completion.blockingRolesResolved',
  );
});

test('validateWaveRecipe never throws', () => {
  const samples = [null, undefined, 1, 'recipe', [], { packages: null }, { packages: [null] }];
  for (const sample of samples) {
    assert.doesNotThrow(() => validateWaveRecipe(sample));
    const result = validateWaveRecipe(sample);
    assert.equal(result.ok, false);
    assert.ok(Array.isArray(result.issues));
  }
});

test('every authored recipe is deeply frozen and names only live enemy ids', () => {
  assertDeepFrozen(SURVIVAL_WAVES);
  assert.ok(Object.isFrozen(SURVIVAL_WAVE_ROLES));
  assert.ok(Object.isFrozen(SURVIVAL_GATE_GROUPS));
  for (const recipe of SURVIVAL_WAVES) {
    for (const pkg of recipe.packages) {
      assert.ok(ENEMY_IDS.has(pkg.enemyId), `invented enemyId ${pkg.enemyId} on ${recipe.id}`);
    }
  }
});

test('authored set covers waves 1-10 for every Combat Lab arena with non-decreasing threatBudget', () => {
  for (const arenaId of ARENA_IDS) {
    const block = blockFor(arenaId);
    const waves = block.map((recipe) => recipe.wave);
    assert.deepEqual(waves, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], `waves 1-10 for ${arenaId}`);
    for (let i = 1; i < block.length; i++) {
      assert.ok(
        block[i].threatBudget >= block[i - 1].threatBudget,
        `${arenaId} wave ${block[i].wave} threatBudget dipped below wave ${block[i - 1].wave}`,
      );
    }
  }
});

// ── Authored intent (CRU-009 re-author) ────────────────────────────────────────────────────────
// These pin the CONTENT decision, not the schema: a ten-wave block that reads as the same fight
// ten times passes every assertion above it. Each test below fails the shape the block used to
// have (one archetype, three doctrines, three phases, no batching, one gate).

test('the ten-wave block is a varied roster, not one archetype ten times', () => {
  for (const arenaId of ARENA_IDS) {
    const block = blockFor(arenaId);
    const archetypes = new Set();
    for (const recipe of block) {
      for (const pkg of recipe.packages) archetypes.add(pkg.enemyId);
    }
    assert.ok(
      archetypes.size >= 10,
      `${arenaId} uses only ${archetypes.size} enemy archetypes across ten waves: ${[...archetypes].sort().join(', ')}`,
    );
  }
});

test('every legal combat doctrine is exercised at least once in a block', () => {
  // Six ids in src/ai/combatDoctrine.js. The pre-rewrite block reached only three of them, so a
  // whole tactical vocabulary (brawler_commit, tether_control_raider, field_anchor_controller)
  // was authored and never shipped to a player.
  for (const arenaId of ARENA_IDS) {
    const doctrines = new Set();
    for (const recipe of blockFor(arenaId)) {
      for (const pkg of recipe.packages) {
        const doctrine = DOCTRINE_BY_ENEMY.get(pkg.enemyId);
        if (doctrine) doctrines.add(doctrine);
      }
    }
    for (const required of [
      'interceptor_flyby',
      'brawler_commit',
      'tether_control_raider',
      'field_anchor_controller',
      'ranged_disengager',
      'capital_broadside',
    ]) {
      assert.ok(doctrines.has(required), `${arenaId} never fields a ${required} enemy`);
    }
  }
});

test('the arena is asked to do something different across the block', () => {
  for (const arenaId of ARENA_IDS) {
    const phases = new Set(blockFor(arenaId).map((recipe) => recipe.arenaPhase));
    assert.ok(
      phases.size >= 7,
      `${arenaId} only ever asks for ${phases.size} arena phases: ${[...phases].sort().join(', ')}`,
    );
  }
});

test('no two consecutive waves field the same archetype mix', () => {
  for (const arenaId of ARENA_IDS) {
    const block = blockFor(arenaId);
    for (let i = 1; i < block.length; i++) {
      assert.notEqual(
        archetypeMix(block[i]),
        archetypeMix(block[i - 1]),
        `${arenaId} waves ${block[i - 1].wave} and ${block[i].wave} are the same fight (${archetypeMix(block[i])})`,
      );
    }
  }
});

test('arrival shape is authored: batching, multiple gates, and more than one role slot', () => {
  for (const arenaId of ARENA_IDS) {
    const block = blockFor(arenaId);

    const batched = block.filter((recipe) => recipe.packages.some((pkg) => pkg.batchSize < pkg.count));
    assert.ok(batched.length >= 5, `${arenaId} trickles in only ${batched.length} of ten waves`);

    const multiGate = block.filter(
      (recipe) => new Set(recipe.packages.map((pkg) => pkg.gateGroup)).size > 1,
    );
    assert.ok(multiGate.length >= 6, `${arenaId} uses more than one gate in only ${multiGate.length} of ten waves`);

    // Every authored role slot earns its place. `anchor` and `disruptor` existed in the schema
    // with no wave that ever asked for one.
    const roles = new Set();
    for (const recipe of block) {
      for (const pkg of recipe.packages) roles.add(pkg.role);
    }
    for (const role of SURVIVAL_WAVE_ROLES) {
      assert.ok(roles.has(role), `${arenaId} never fills the ${role} role slot`);
    }
  }
});

test('every wave stays under the spawn cap and every recipe validates', () => {
  for (const recipe of SURVIVAL_WAVES) {
    // 24 is DEFAULT_MAX at src/systems/spawnBudget.js:26 — do not import the private constant.
    const peak = peakConcurrentDemand(recipe.packages);
    assert.ok(peak <= 24, `${recipe.id} demands ${peak} concurrent bodies, over the 24 cap`);
    assert.equal(validateWaveRecipe(recipe).ok, true, `${recipe.id} does not validate`);
  }
});

test('every authored batch lands by tick 200 and cleanup fits the phase machine', () => {
  // Cross-file invariant, promoted here from a comment. The wave 1-7 walk in
  // test/crucible-wave-materialization.mjs ticks 200 and then requires the wave to be clearable,
  // then ticks 181 to leave cleanup. A later batch or a longer cleanup strands the run mid-phase
  // with nothing in this file's own suite to say why.
  for (const recipe of SURVIVAL_WAVES) {
    for (const pkg of recipe.packages) {
      assert.ok(
        lastBatchTick(pkg) <= 200,
        `${recipe.id} owes a batch at tick ${lastBatchTick(pkg)}; the wave walk only ticks 200`,
      );
    }
    const cleanupCap = recipe.wave === 10 ? 240 : 180;
    assert.ok(
      recipe.completion.cleanupTicks <= cleanupCap,
      `${recipe.id} cleanupTicks ${recipe.completion.cleanupTicks} exceeds ${cleanupCap}`,
    );
  }
});

test('rewards rise smoothly across the block and never dip', () => {
  for (const arenaId of ARENA_IDS) {
    const block = blockFor(arenaId);
    for (let i = 1; i < block.length; i++) {
      assert.ok(
        block[i].rewards.xp > block[i - 1].rewards.xp,
        `${arenaId} wave ${block[i].wave} pays no more XP than wave ${block[i - 1].wave}`,
      );
      assert.ok(
        block[i].rewards.credits > block[i - 1].rewards.credits,
        `${arenaId} wave ${block[i].wave} pays no more credits than wave ${block[i - 1].wave}`,
      );
    }
  }
});

test('the three arenas differ only by their authored gate pair, never by content', () => {
  // tenWaveBlock(arenaId, gateA, gateB) is called for three arenas. A wave that reads well for
  // one gate pair must read the same for the others, so roles, counts, batching and timing are
  // identical across blocks and only gateGroup may vary.
  const blocks = ARENA_IDS.map((arenaId) => blockFor(arenaId));
  const [first, ...rest] = blocks;
  for (const block of rest) {
    for (let i = 0; i < first.length; i++) {
      const shape = (recipe) => recipe.packages.map(
        (pkg) => `${pkg.atTick}:${pkg.role}:${pkg.enemyId}:${pkg.count}:${pkg.batchSize}:${pkg.batchGapTicks}`,
      ).join('|');
      assert.equal(shape(block[i]), shape(first[i]), `wave ${first[i].wave} differs between arenas`);
      assert.equal(block[i].arenaPhase, first[i].arenaPhase);
      assert.deepEqual(block[i].rewards, first[i].rewards);
    }
  }
});

test('no wave fields two different archetypes that wear the same silhouette', () => {
  // Fifteen archetypes share only six silhouettes (wasp/choir = drone_swarm, lancer/ghost =
  // sniper_lance, bruiser/pd-screen/anchor = bruiser_armor, reaver/mine-layer = pirate_swoop,
  // corsair/tether = corsair_blade). Bodies persist for the whole wave and the recipe has no
  // death model, so "not at the same tick" would be vacuous — this is the whole-wave rule.
  // Breaking it must be an authored choice, not an accident.
  const SILHOUETTE = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy.silhouette || enemy.id]));
  const DELIBERATE = new Set([8]); // wave 8: the misread IS the question this wave asks.
  for (const recipe of SURVIVAL_WAVES) {
    if (DELIBERATE.has(recipe.wave)) continue;
    const bySilhouette = new Map();
    for (const pkg of recipe.packages) {
      const key = SILHOUETTE.get(pkg.enemyId);
      const seen = bySilhouette.get(key);
      assert.ok(
        !seen || seen === pkg.enemyId,
        `${recipe.id} fields ${seen} and ${pkg.enemyId} with the same silhouette (${key})`,
      );
      bySilhouette.set(key, pkg.enemyId);
    }
  }
});
