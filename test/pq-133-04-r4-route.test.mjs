// PQ-133.04 R4 — the public route: a bounded 'block' ruleset, the mirror demonstration kit, and
// the best-line relaunch mapping (CRU-030/027 + PQ-146 seam).
//
// The block is the SAME authored template the scored arc plays, with a ceiling of one block and
// an ending: wave ten is victory, never a refit bench. Everything here is the ordinary path —
// the ordinary planner, the ordinary phase machine, the ordinary launch config.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CRUCIBLE_DEFAULT_RULESET,
  CRUCIBLE_RULESETS,
  crucibleSetupFor,
  crucibleStarterIdForSetup,
  normalizeCrucibleRuleset,
  practiceLaunchFor,
} from '../src/ui/crucibleLaunch.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { DOOR_PUBLIC_STARTERS, SURVIVAL_UNLOCK_CATALOG } from '../src/data/survivalUnlocks.js';
import { validateCombatLabSetup } from '../src/contracts/combatLabSetupSchema.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { hashSemanticWavePlan, planWave } from '../src/systems/survivalWavePlanner.js';
import { SURVIVAL_TEMPLATE_BLOCK } from '../src/data/survivalActs.js';
import {
  BLOCK_RULESET,
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_CLEANUP_TICKS,
  SURVIVAL_REFIT_EVERY,
  SURVIVAL_RUN_WAVE_COUNT,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  isBlockRuleset,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { runSession } from '../src/systems/runSession.js';
import { isStarterAvailable, validateUnlockCatalog } from '../src/systems/survivalUnlocks.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const SEED = 13304;
const ARENA = 'helios_core';

// ── the block plans exactly what the scored template plans ─────────────────────────────────

test('block waves 1-10 are byte-identical to the scored template recipes', () => {
  assert.equal(SURVIVAL_TEMPLATE_BLOCK, 10);
  for (let wave = 1; wave <= 10; wave++) {
    const scored = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: 'scored' });
    const block = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: BLOCK_RULESET });
    assert.equal(scored.ok !== false, true, `scored wave ${wave} must plan`);
    assert.deepEqual(block, scored, `wave ${wave}: the block reuses the authored recipe, byte for byte`);
    assert.equal(hashSemanticWavePlan(block), hashSemanticWavePlan(scored));
  }
  // The ceiling holds in the planner's own terms: the block IS one template block, not the arc.
  assert.equal(planWave({ seed: SEED, arenaId: ARENA, wave: 10, ruleset: BLOCK_RULESET }).packages
    .find((p) => p.role === 'elite').enemyId, 'mirrorjaw_foreman',
  'the block ends on the authored committed ram');
});

// ── the wave machine: victory at ten, no bench ──────────────────────────────────────────────

function boot(seed = SEED, ruleset = BLOCK_RULESET) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  runSession.init({ state, bus });
  survivalRun.init({ state, bus });
  return { state, bus, emitted };
}

function transitions(emitted) {
  return emitted.filter((e) => e.event === 'run:transitionRequested')
    .map((e) => [e.payload.expectedPhase, e.payload.nextPhase, e.payload.reason]);
}

function tick(n = 1) {
  for (let i = 0; i < n; i++) survivalRun.update(DT);
}

function driveBlock(seed = SEED) {
  const h = boot(seed, BLOCK_RULESET);
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: BLOCK_RULESET, seed, arenaId: ARENA });
  h.bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  for (let wave = 1; wave <= 10; wave++) {
    tick(SURVIVAL_WAVE_INTRO_TICKS);
    h.bus.emit(WAVE_CLEARED_SEAM, { wave });
    tick(1);
    tick(wave === 10 ? 240 : SURVIVAL_CLEANUP_TICKS);
    if (wave < 10) {
      h.bus.emit('run:draftResolved', {});
      tick(1);
    }
  }
  return h;
}

test('the block wave machine reaches victory at wave ten and never opens a refit', () => {
  const h = driveBlock();
  const walk = transitions(h.emitted);
  assert.deepEqual(walk[0], ['loadout', 'arena_intro', 'ready']);
  assert.deepEqual(walk[1], ['arena_intro', 'wave_intro', 'intro_done']);
  walk.shift();
  walk.shift();
  for (let wave = 1; wave <= 10; wave++) {
    assert.deepEqual(walk.shift(), ['wave_intro', 'active', 'wave_start']);
    assert.deepEqual(walk.shift(), ['active', 'cleanup', 'wave_clear']);
    if (wave < 10) {
      assert.deepEqual(walk.shift(), ['cleanup', 'draft', 'draft_open'], `wave ${wave} stops for its card`);
      assert.deepEqual(walk.shift(), ['draft', 'wave_intro', 'pick_done']);
    } else {
      assert.deepEqual(walk.shift(), ['cleanup', 'victory', 'act_complete'], 'wave ten IS the ending');
    }
  }
  assert.equal(walk.length, 0, 'nothing follows the victory');
  assert.ok(!transitions(h.emitted).some(([, to]) => to === 'refit'), 'a block run never benches');
  assert.equal(h.state.run.wave, 10);
  assert.equal(h.state.run.phase, 'victory');
});

test('scored regression guards: the thirty-wave arc is untouched by the block branches', () => {
  assert.equal(SURVIVAL_RUN_WAVE_COUNT, 30);
  assert.equal(SURVIVAL_REFIT_EVERY, 10);
  assert.equal(SURVIVAL_CLEANUP_TICKS, 180);
  // A scored run still refits at wave ten and is NOT over at wave ten.
  const h = boot(SEED, 'scored');
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  for (let wave = 1; wave <= 11; wave++) {
    tick(SURVIVAL_WAVE_INTRO_TICKS);
    h.bus.emit(WAVE_CLEARED_SEAM, { wave });
    tick(1);
    tick(wave === 10 ? 240 : SURVIVAL_CLEANUP_TICKS);
    if (wave === 10) {
      assert.deepEqual(transitions(h.emitted).at(-1), ['cleanup', 'refit', 'refit_open'],
        'scored wave ten is still a bench');
      h.bus.emit('run:refitClosed', {});
      tick(1);
      assert.deepEqual(transitions(h.emitted).at(-1), ['refit', 'wave_intro', 'refit_done']);
      assert.notEqual(h.state.run.phase, 'victory', 'scored does not end at wave ten');
    } else {
      h.bus.emit('run:draftResolved', {});
      tick(1);
    }
  }
  assert.ok(h.state.run.wave > 10, 'scored keeps walking past the block ceiling');
  assert.notEqual(h.state.run.phase, 'victory');
  // The scored wave-ten plan is the recipe the block shares, but the RUN ceilings differ.
  assert.notEqual(SURVIVAL_RUN_WAVE_COUNT, SURVIVAL_TEMPLATE_BLOCK);
});

test('the block ruleset is a bounded public ruleset on the ordinary launch route', () => {
  assert.equal(BLOCK_RULESET, 'block');
  assert.ok(isBlockRuleset('block'));
  assert.ok(!isBlockRuleset('scored'));
  assert.deepEqual([...CRUCIBLE_RULESETS], [SWARM_RULESET, 'scored', 'boss_circuit', 'block']);
  assert.equal(CRUCIBLE_DEFAULT_RULESET, SWARM_RULESET, 'the default the button plays is unchanged');
  assert.equal(normalizeCrucibleRuleset('block'), 'block');
  assert.equal(normalizeCrucibleRuleset('scored'), 'scored');
  assert.equal(normalizeCrucibleRuleset('nonsense'), SWARM_RULESET);
  // A block launch validates as the ordinary combat-lab setup with the ruleset riding beside it.
  const setup = crucibleSetupFor({ starterId: 'mirror_demonstrator', seed: SEED, ruleset: BLOCK_RULESET });
  assert.equal(setup.ok, true, JSON.stringify(setup.issues || []));
  assert.equal(setup.ruleset, 'block');
});

// ── the mirror demonstrator ─────────────────────────────────────────────────────────────────

const MIRROR_DEMONSTRATOR = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.id === 'mirror_demonstrator');

test('mirror_demonstrator carries the three-spec Pulse demonstration and validates', () => {
  assert.ok(MIRROR_DEMONSTRATOR, 'the demonstration kit is authored');
  assert.equal(MIRROR_DEMONSTRATOR.hullId, 'ship_drifter');
  assert.deepEqual(MIRROR_DEMONSTRATOR.loadout, [
    { slotIndex: 0, defId: 'wpn_pulse_laser_s' },
    { slotIndex: 7, defId: 'mod_bank_shot' },
    { slotIndex: 8, defId: 'mod_smart_bank' },
  ]);
  const setup = validateCombatLabSetup({
    schema: 'spaceface.combatLabSetup.v1',
    hullId: MIRROR_DEMONSTRATOR.hullId,
    loadout: MIRROR_DEMONSTRATOR.loadout.map((e) => ({ slotIndex: e.slotIndex, defId: e.defId })),
    enemyPackageId: 'wasp_flight',
    arenaId: ARENA,
    seed: SEED,
    wave: 1,
  });
  assert.equal(setup.ok, true, JSON.stringify(setup.issues || []));
  // Its three AttackSpecs compile: the direct gun, the bank, and the aimed rebound.
  for (const [label, modifiers] of [
    ['direct', []],
    ['bank', [['mod_bank_shot', 1]]],
    ['smart', [['mod_bank_shot', 1], ['mod_smart_bank', 1]]],
  ]) {
    const result = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers });
    assert.equal(result.ok, true, `${label} spec must compile`);
    assert.ok(result.spec.digest);
    if (label !== 'direct') {
      assert.ok(result.spec.trajectory.bounces > 0, `${label} carries a ricochet lineage`);
    }
  }
  // The door's starter row resolves from a matching setup.
  const probeSetup = { hullId: MIRROR_DEMONSTRATOR.hullId, loadout: MIRROR_DEMONSTRATOR.loadout };
  assert.equal(crucibleStarterIdForSetup(probeSetup), 'mirror_demonstrator');
});

test('mirror_demonstrator is public: it appears on an empty profile through a zero-power row', () => {
  assert.ok(DOOR_PUBLIC_STARTERS.includes('mirror_demonstrator'));
  assert.equal(isStarterAvailable(null, 'mirror_demonstrator'), true, 'available on a fresh profile');
  assert.equal(isStarterAvailable({}, 'mirror_demonstrator'), true);
  const row = SURVIVAL_UNLOCK_CATALOG.find((entry) => entry.id === 'unlock_kit_mirror');
  assert.ok(row, 'the catalog row is authored');
  assert.equal(row.defaultUnlocked, true);
  assert.deepEqual(row.grants.starters, ['mirror_demonstrator']);
  for (const axis of ['damage', 'hull', 'shield', 'speed', 'credits', 'xp', 'score']) {
    assert.equal(row.power[axis], 0, `the row stays zero-power on ${axis}`);
  }
  const report = validateUnlockCatalog();
  assert.equal(report.ok, true, report.issues.join('\n'));
});

// ── best-line relaunch mapping ──────────────────────────────────────────────────────────────

function bestLineWithMode(mode) {
  return {
    points: 10,
    seed: 4242,
    recordRules: { mode, arenaId: ARENA },
    acts: [{ episodeId: 1, trickId: 'bank', name: 'bank', points: 10, evidence: [{ kind: 'contact' }] }],
  };
}

test('practiceLaunchFor maps a block best line back to the block', () => {
  const block = practiceLaunchFor(bestLineWithMode('block'));
  assert.ok(block, 'a block line relaunches');
  assert.equal(block.ruleset, 'block');
  assert.equal(block.seed, 4242);
  assert.equal(block.arenaId, ARENA);
  // The established mappings hold: scored stays scored, everything else stays the swarm floor.
  assert.equal(practiceLaunchFor(bestLineWithMode('scored')).ruleset, 'scored');
  assert.equal(practiceLaunchFor(bestLineWithMode('swarm')).ruleset, SWARM_RULESET);
  assert.equal(practiceLaunchFor(bestLineWithMode('practice')).ruleset, SWARM_RULESET);
  // A line that cannot name its seed never launches.
  const noSeed = bestLineWithMode('block');
  delete noSeed.seed;
  assert.equal(practiceLaunchFor(noSeed), null);
});
