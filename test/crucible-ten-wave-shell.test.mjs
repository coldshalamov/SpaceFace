// PQ-133.02 completion — the ten-wave shell closes its own shared-change requests.
//
// Covers the additive fixes that finish the leaf without moving pinned behavior:
// canonical arenaPhase ownership (data owns, arena re-exports, validator pins),
// the survivalArenas / runModifiers catalogs, the crucibleResults owner alias,
// damageTrail attacker labels, and structured stop reasons.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { SURVIVAL_ARENA_PHASES as ARENA_PHASES_FROM_SYSTEM } from '../src/systems/survivalArena.js';
import {
  stopReasonFor,
  survivalResults,
} from '../src/systems/survivalResults.js';
import {
  SURVIVAL_ARENA_PHASES as ARENA_PHASES_FROM_DATA,
  SURVIVAL_WAVES,
  hasArenaPhase,
  validateWaveRecipe,
} from '../src/data/survivalWaves.js';
import {
  SURVIVAL_ARENAS,
  SURVIVAL_EXERCISED_ARENAS,
  survivalArenaById,
  survivalArenaSpawn,
} from '../src/data/survivalArenas.js';
import {
  RUN_MODIFIER_VERBS,
  runModifierRecord,
  validateRunModifier,
} from '../src/data/runModifiers.js';
import { crucibleResultsScreen as RESULTS_FROM_SURFACE } from '../src/ui/screens/crucible.js';
import {
  damageBreakdown,
  resultTitle,
  resultRows,
  weaponDisplayName,
} from '../src/ui/screens/crucible.js';
import { CRUCIBLE_ARENA_ID } from '../src/ui/crucibleLaunch.js';
import { resetCrucibleMetaForTests } from '../src/systems/survivalRecords.js';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
    queue: raw.queue.bind(raw),
    flush: raw.flush.bind(raw),
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  resetCrucibleMetaForTests();
  runSession.init(ctx);
  survivalResults.init(ctx);
  // A fresh boot publishes nothing: a previous run's plate must never linger.
  assert.equal(survivalResults.lastResult(), null);
  return { state, bus, ctx };
}

function beginActive(harness) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: CRUCIBLE_ARENA_ID });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
}

test('arenaPhase is owned once: data and system export the same canonical list', () => {
  assert.deepEqual([...ARENA_PHASES_FROM_SYSTEM], [...ARENA_PHASES_FROM_DATA]);
  assert.equal(hasArenaPhase('boss'), true);
  assert.equal(hasArenaPhase('murky_depths'), false);
  assert.equal(hasArenaPhase(null), false);
  assert.equal(hasArenaPhase(42), false);
});

test('every authored recipe phase is canonical, and an unknown phase is rejected', () => {
  assert.ok(SURVIVAL_WAVES.length > 0, 'the loop below pins nothing on an empty catalog');
  for (const recipe of SURVIVAL_WAVES) {
    assert.ok(ARENA_PHASES_FROM_DATA.includes(recipe.arenaPhase), recipe.id);
  }
  const bad = { ...SURVIVAL_WAVES[0], id: 'probe_bad_phase', arenaPhase: 'murky_depths' };
  const checked = validateWaveRecipe(bad);
  assert.equal(checked.ok, false);
  assert.ok(checked.issues.some((issue) => issue.path === 'arenaPhase'));
});

test('survivalArenas resolves the greybox room and its spawn mapping', () => {
  assert.ok(SURVIVAL_ARENAS.length >= 1);
  assert.ok(SURVIVAL_EXERCISED_ARENAS.includes('helios_core'));
  const arena = survivalArenaById('helios_core');
  assert.ok(arena && typeof arena.sectorId === 'string');
  const spawn = survivalArenaSpawn('helios_core');
  assert.ok(spawn && typeof spawn.sectorId === 'string');
  assert.ok(spawn.pos && Number.isFinite(spawn.pos.x) && Number.isFinite(spawn.pos.z));
  assert.equal(survivalArenaById('no_such_room'), null);
  assert.equal(survivalArenaSpawn('no_such_room'), null);
  assert.equal(survivalArenaById('__proto__'), null);
});

test('runModifiers validate the live v0 draft-pick record', () => {
  // Live shape (survivalDraft resolvePick): display verb on the card, catalog id,
  // slot it landed in. This is what runSession stamps verbatim.
  const live = {
    kind: 'weapon', offerId: 'throw', verb: 'Throw',
    defId: 'wpn_concussion_cannon_m', slotIndex: 0, replaced: null, wave: 1,
  };
  assert.equal(validateRunModifier(live).ok, true);
  assert.equal(validateRunModifier(runModifierRecord(live)).ok, true);
  assert.equal(validateRunModifier({ ...live, verb: 'cover_charge' }).ok, false);
  assert.equal(validateRunModifier({ ...live, verb: 'throw' }).ok, false);
  assert.equal(validateRunModifier({ ...live, defId: '   ' }).ok, false);
  assert.equal(validateRunModifier({ ...live, offerId: {} }).ok, false);
  assert.equal(validateRunModifier({ ...live, kind: '' }).ok, false);
  assert.equal(validateRunModifier(null).ok, false);
  assert.equal(validateRunModifier(runModifierRecord(null)).ok, false);
  assert.equal(validateRunModifier(runModifierRecord(undefined)).ok, false);
});

test('every live draft verb validates, and no validator verb is orphaned', async () => {
  const [{ SURVIVAL_DRAFT_OFFERS }, { SWARM_DRAFT_OFFERS }] = await Promise.all([
    import('../src/data/survivalDraft.js'),
    import('../src/data/swarmDraft.js'),
  ]);
  const catalogVerbs = new Set(
    [...SURVIVAL_DRAFT_OFFERS, ...SWARM_DRAFT_OFFERS].map((offer) => offer.verb),
  );
  for (const verb of catalogVerbs) {
    assert.ok(
      RUN_MODIFIER_VERBS.includes(verb),
      `catalog verb ${JSON.stringify(verb)} must validate`,
    );
  }
  for (const verb of RUN_MODIFIER_VERBS) {
    assert.ok(catalogVerbs.has(verb), `validator verb ${JSON.stringify(verb)} is orphaned`);
  }
});

test('stopReason distinguishes quitting from the arena failing', () => {
  assert.equal(stopReasonFor('victory', null, null), 'victory');
  assert.equal(stopReasonFor('extracted', 'extracted', null), 'extracted');
  assert.equal(stopReasonFor('aborted', 'wave_plan_failed', null), 'wave_plan_failed');
  assert.equal(stopReasonFor('defeat', 'player_death', null), 'player_death');
  assert.equal(stopReasonFor('aborted', 'exit_to_menu', null), 'player_exit');
  assert.equal(stopReasonFor('defeat', null, null), null);
  assert.equal(stopReasonFor('defeat', null, 'player_death'), 'player_death');
  // A specific recorded cause wins over a generic later reason; the outcome wins over
  // a contradictory reason.
  assert.equal(stopReasonFor('aborted', 'exit_to_menu', 'wave_plan_failed'), 'wave_plan_failed');
  assert.equal(stopReasonFor('defeat', 'extracted', null), 'player_exit');
  // A stale terminal latch never overrides a contradictory outcome, and an unknown
  // fallback degrades to the generic exit instead of leaking into the union.
  assert.equal(stopReasonFor('defeat', null, 'victory'), 'player_exit');
  assert.equal(stopReasonFor('aborted', 'exit_to_menu', 'victory'), 'player_exit');
  assert.equal(stopReasonFor('aborted', null, 'quit_to_menu'), 'player_exit');
});

test('a published defeat carries a labeled damage trail and a death stop reason', () => {
  const harness = boot();
  beginActive(harness);
  const foe = {
    id: 9, alive: true, pos: { x: 10, z: 0 }, type: 'ship',
    data: { lootTableId: 'wasp_swarmer', runCohort: 'survival' },
  };
  harness.state.entities.set(foe.id, foe);
  harness.state.entityList.push(foe);
  harness.bus.emit('combat:damage', {
    targetId: harness.state.playerId,
    attackerId: foe.id,
    amount: 41,
    applied: 41,
    type: 'kinetic',
    weaponId: 'wpn_autocannon_m',
  });
  harness.bus.emit('player:death', { attacker: 'Wasp Swarmer', weapon: 'Heavy Autocannon M' });
  const result = survivalResults.lastResult();
  assert.ok(result, 'a defeat publishes a result');
  assert.equal(result.outcome, 'defeat');
  assert.equal(result.stopReason, 'player_death');
  assert.equal(result.damageTrail.length, 1);
  assert.equal(result.damageTrail[0].attackerId, foe.id);
  assert.equal(result.damageTrail[0].attackerLabel, 'Wasp Swarmer');
  assert.equal(result.damageTrail[0].weaponId, 'wpn_autocannon_m');
});

test('a wave-plan failure publishes an aborted result with its own stop reason', () => {
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanFailed', { wave: 4, error: 'invalid_input' });
  const result = survivalResults.lastResult();
  assert.ok(result, 'a plan failure publishes a result');
  assert.equal(result.outcome, 'aborted');
  assert.equal(result.stopReason, 'wave_plan_failed');
});

test('starting a new run clears the previous run plate', () => {
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('player:death', { attacker: 'Wasp Swarmer' });
  assert.ok(survivalResults.lastResult(), 'a defeat publishes a plate');
  // `begin` from a terminal phase is (correctly) rejected by runSession, so drive the
  // seam the owner actually subscribes: a fresh `run:started` after teardown.
  harness.bus.emit('run:started', { kind: 'survival', phase: 'loadout' });
  assert.equal(survivalResults.lastResult(), null, 'a fresh run shows no stale plate');
});

test('an arena failure gets its own title; a plain walk-out stays neutral', () => {
  assert.equal(resultTitle({ outcome: 'aborted', stopReason: 'wave_plan_failed' }), 'Arena Failed');
  assert.equal(resultTitle({ outcome: 'aborted', stopReason: 'player_exit' }), 'Run Ended');
  assert.equal(resultTitle({ outcome: 'aborted', stopReason: null }), 'Run Ended');
  assert.equal(resultTitle({ outcome: 'victory', stopReason: 'victory' }), 'Arena Cleared');
  assert.equal(resultTitle({ outcome: 'extracted', stopReason: 'extracted' }), 'Extracted');
  assert.equal(resultTitle({ outcome: 'defeat', stopReason: 'player_death' }), 'Run Over');
  assert.equal(resultTitle(null), 'Run Over');
});

test('the results grid names an extraction instead of scoring it a loss', () => {
  const rows = new Map(resultRows({ outcome: 'extracted', stopReason: 'extracted', deepestWave: 10, wave: 10 }));
  assert.equal(rows.get('Outcome'), 'Extracted');
});

test('the damage aggregate carries who held each weapon without replacing it', () => {
  const { rows } = damageBreakdown([
    { weaponId: 'wpn_autocannon_m', amount: 18, attackerLabel: 'Wasp Swarmer' },
    { weaponId: 'wpn_autocannon_m', amount: 17, attackerLabel: 'Wasp Swarmer' },
    { weaponId: 'wpn_autocannon_m', amount: 20, attackerLabel: 'Reaver Pirate' },
    { weaponId: 'wpn_pulse_laser_m', amount: 12 },
  ]);
  assert.equal(rows[0].weapon, weaponDisplayName('wpn_autocannon_m'));
  assert.deepEqual(rows[0].attackers.slice().sort(), ['Reaver Pirate', 'Wasp Swarmer']);
  assert.deepEqual(rows[1].attackers, []);
});

test('the damage aggregate degrades hostile entries instead of throwing', () => {
  const out = damageBreakdown([
    { weaponId: 'wpn_autocannon_m', amount: Symbol('s') },
    { weaponId: Object.create(null), amount: 5 },
    { weaponId: Symbol('w'), amount: 7 },
    { weaponId: 'wpn_pulse_laser_m', amount: '12' },
  ]);
  assert.equal(out.hits, 4);
  assert.equal(out.total, 24);
  assert.ok(out.rows.every((row) => Number.isFinite(row.amount)));
});
