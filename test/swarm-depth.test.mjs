// SWARM-06 — the depth layer: Threat wagers, the perk loadout, the crossover ledger, the
// challenge purses, and the adaptive audio lift. The harness drives the real owners the same
// way the door and the launch path do — runSession owns the stamp, survivalRecords owns the
// profile, the planner owns the room, ships owns the shipyard gate.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { SHIPS } from '../src/data/ships.js';
import {
  emptyHangar,
} from '../src/data/swarmHangar.js';
import {
  SWARM_AFFIX_BY_ID,
  SWARM_AFFIX_FROM_WAVE,
  SWARM_THREATS,
  normalizeThreatIds,
  swarmAffixFor,
  swarmAffixFromWave,
  swarmThreatBountyMult,
  swarmThreatEliteHullMult,
  swarmThreatMutatorIds,
  swarmThreatPressureMult,
  swarmThreatPurseMult,
  swarmThreatSpeedMult,
  validateSwarmThreats,
} from '../src/data/swarmThreats.js';
import {
  SWARM_PERK_SLOTS,
  SWARM_PERKS,
  earnedPerkIds,
  migratePerks,
  normalizePerkLoadout,
  runHasPerk,
} from '../src/data/swarmPerks.js';
import {
  SWARM_CROSSOVER_CATALOG,
  SWARM_SAUCER_EARN_WAVE,
  applyCrossoverResult,
  crossoverEarnedByRun,
  crossoverFactsFor,
  crossoverHullIds,
  emptyCrossover,
  migrateCrossover,
  registerCrossoverReader,
  swarmCrossoverEarned,
  swarmEarnedCrossoverIds,
  swarmEarnedHullDefIds,
} from '../src/data/swarmCrossover.js';
import { isSwarmLadderRun } from '../src/data/swarmLadder.js';
import {
  applySwarmStemLift,
  resolveThemeMatrix,
  swarmChainLift,
  THEME_STEM_WEIGHTS,
} from '../src/audio/themeMatrix.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { defLockReasonText, ships } from '../src/systems/ships.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  crucibleEarnedPerkIds,
  crucibleSwarmDepthView,
  resetCrucibleMetaForTests,
  saveCrucibleMeta,
  loadCrucibleMeta,
  setCruciblePerkLoadout,
  settleCrucibleRun,
  useCrucibleMetaClock,
  utcWeekKeyNow,
  weeklyMutatorForWeekKey,
} from '../src/systems/survivalRecords.js';
import { applyHangarToPlayer } from '../src/systems/swarmHangar.js';
import { swarmElites } from '../src/systems/swarmElites.js';
import {
  crucibleHullChoices,
  crucibleSetupFor,
} from '../src/ui/crucibleLaunch.js';

const SWARM = 'swarm';
const ARENA = 'helios_core';
const LADDER_SEED = 73311;
const SAUCER = SHIPS.find((def) => def && def.id === 'ship_saucer');

function ladderWithStars(n) {
  // Zone rows carry up to 3 stars each; spread n stars across the zones honestly.
  const zones = {};
  let left = Math.max(0, n);
  let idx = 0;
  while (left > 0) {
    const stars = Math.min(3, left);
    zones[String(idx)] = { stars, bestChain: 0 };
    left -= stars;
    idx += 1;
  }
  return { arenas: { [ARENA]: { zones, bestWave: 0, checkpoint: 0 } } };
}

/* ---- the Threat catalog ---------------------------------------------------- */

test('SWARM-06: the threat catalog validates, and ids normalize closed', () => {
  assert.equal(validateSwarmThreats().ok, true);
  assert.equal(SWARM_THREATS.length, 6);
  assert.deepEqual(normalizeThreatIds(['thick_pack', 'bogus', 'thick_pack', 'fast_lane']),
    ['thick_pack', 'fast_lane']);
  assert.deepEqual(normalizeThreatIds('thin_purse'), ['thin_purse']);
  assert.deepEqual(normalizeThreatIds(null), []);
});

test('SWARM-06: the wager multipliers stack on their own legs only', () => {
  assert.equal(swarmThreatBountyMult([]), 1);
  assert.equal(swarmThreatBountyMult(['thick_pack']), 1.25);
  // Two 25% cards stack multiplicatively — the settle reads exactly this product.
  assert.equal(swarmThreatBountyMult(['thick_pack', 'armoured_elites']), 1.5625);
  assert.equal(swarmThreatPressureMult(['thick_pack']), 1.35);
  assert.equal(swarmThreatPressureMult(['thin_purse']), 1, 'purse is not pressure');
  assert.equal(swarmThreatPurseMult(['thin_purse']), 0.5);
  assert.equal(swarmThreatSpeedMult(['fast_lane']), 1.15);
  assert.equal(swarmThreatSpeedMult(['thick_pack']), 1);
  assert.equal(swarmThreatEliteHullMult(['armoured_elites']), 1.5);
  assert.deepEqual(swarmThreatMutatorIds(['no_rerolls', 'draftless']), ['no_reroll', 'draftless']);
  assert.deepEqual(swarmThreatMutatorIds(['thick_pack']), []);
});

test('SWARM-06: affixes begin at Zone 3, or wave 1 under any live threat', () => {
  assert.equal(SWARM_AFFIX_FROM_WAVE, 21);
  assert.equal(swarmAffixFromWave([]), 21);
  assert.equal(swarmAffixFromWave(['fast_lane']), 1);
  // The seeded pick is deterministic and always lands inside the catalog.
  const a = swarmAffixFor(0x51e7a2);
  assert.ok(a && SWARM_AFFIX_BY_ID[a]);
  assert.equal(swarmAffixFor(0x51e7a2), a);
  for (let h = 0; h < 50; h++) assert.ok(SWARM_AFFIX_BY_ID[swarmAffixFor(h)]);
});

/* ---- the perk loadout ------------------------------------------------------ */

test('SWARM-06: the stored pick migrates closed and caps at the slot count', () => {
  assert.deepEqual(migratePerks(null).loadout, []);
  assert.deepEqual(migratePerks({ loadout: ['bogus', 'scavenger', 'scavenger'] }).loadout,
    ['scavenger']);
  assert.equal(SWARM_PERK_SLOTS, 2);
  assert.equal(migratePerks({ loadout: ['scavenger', 'overclock', 'gambler'] }).loadout.length, 2);
});

test('SWARM-06: earns derive from ladder stars and finished challenges, never a stored flag', () => {
  assert.deepEqual(earnedPerkIds(null, { starTotal: 0, challengesDone: 0 }), []);
  const two = earnedPerkIds(null, { starTotal: 2, challengesDone: 0 });
  assert.ok(two.includes('scavenger'));
  assert.ok(!two.includes('overclock'));
  const eight = earnedPerkIds(null, { starTotal: 8, challengesDone: 0 });
  assert.ok(eight.includes('gambler'));
  const hunter = earnedPerkIds(null, { starTotal: 0, challengesDone: 1 });
  assert.ok(hunter.includes('bounty_hunter'));
  const all = earnedPerkIds(null, { starTotal: 16, challengesDone: 1 });
  assert.equal(all.length, SWARM_PERKS.length);
});

test('SWARM-06: normalizePerkLoadout drops unearned ids silently', () => {
  const earned = ['scavenger', 'overclock'];
  assert.deepEqual(normalizePerkLoadout(['scavenger', 'gambler', 'overclock'], earned),
    ['scavenger', 'overclock']);
  assert.deepEqual(normalizePerkLoadout(['gambler'], earned), []);
  assert.equal(runHasPerk({ telemetry: { perks: ['ram_plate'] } }, 'ram_plate'), true);
  assert.equal(runHasPerk({ telemetry: {} }, 'ram_plate'), false);
});

/* ---- the crossover ledger -------------------------------------------------- */

test('SWARM-06: the earn is the Zone 3 boss — span-cleared, swarm-only, never practice', () => {
  const facts = crossoverFactsFor({ ruleset: SWARM, startWave: 21, wavesCleared: 10 });
  assert.equal(facts.startWave, 21);
  assert.equal(facts.lastClearedWave, 30);
  const earned = crossoverEarnedByRun(facts);
  assert.equal(earned.length, 1);
  assert.equal(earned[0].id, 'hull:ship_saucer');
  // A Round-31 checkpoint start never met that boss.
  assert.equal(crossoverEarnedByRun({ ruleset: SWARM, startWave: 31, lastClearedWave: 40 }).length, 0);
  // A run that died at Round 29 did not finish it.
  assert.equal(crossoverEarnedByRun({ ruleset: SWARM, startWave: 1, lastClearedWave: 29 }).length, 0);
  assert.equal(crossoverEarnedByRun({ ruleset: 'scored', startWave: 1, lastClearedWave: 30 }).length, 0);
  assert.equal(crossoverEarnedByRun({ ruleset: SWARM, practice: true, startWave: 1, lastClearedWave: 30 }).length, 0);
});

test('SWARM-06: the ledger migrates closed and earns once', () => {
  const dirty = { earned: { 'hull:ship_saucer': { wave: 30, at: 't' }, 'hull:bogus': { wave: 1 } } };
  const bag = migrateCrossover(dirty);
  assert.deepEqual(Object.keys(bag.earned), ['hull:ship_saucer']);
  const first = applyCrossoverResult(emptyCrossover(), {
    ruleset: SWARM, startWave: 1, lastClearedWave: SWARM_SAUCER_EARN_WAVE,
  });
  assert.equal(first.earned.length, 1);
  const again = applyCrossoverResult(first.crossover, {
    ruleset: SWARM, startWave: 1, lastClearedWave: 30,
  });
  assert.equal(again.earned.length, 0, 'an already-proven row never re-fires');
  assert.deepEqual(crossoverHullIds(again.crossover), ['ship_saucer']);
});

test('SWARM-06: the read port answers off the registered profile', () => {
  registerCrossoverReader(() => null);
  assert.equal(swarmCrossoverEarned('hull:ship_saucer'), false);
  registerCrossoverReader(() => ({ crossover: dirtyLedger() }));
  assert.equal(swarmCrossoverEarned('hull:ship_saucer'), true);
  assert.deepEqual(swarmEarnedCrossoverIds(), ['hull:ship_saucer']);
  assert.deepEqual(swarmEarnedHullDefIds(), ['ship_saucer']);
  // Re-arm the live reader for the rest of the suite — importing survivalRecords registered it.
  registerCrossoverReader(() => { try { return loadCrucibleMeta(); } catch { return null; } });
});

function dirtyLedger() {
  return { earned: { 'hull:ship_saucer': { wave: 30, at: 't' } } };
}

/* ---- settlement ------------------------------------------------------------ */

function swarmResult(overrides = {}) {
  return {
    ruleset: SWARM,
    arenaId: ARENA,
    seed: LADDER_SEED,
    outcome: 'defeat',
    wave: 30,
    startWave: 21,
    wavesCleared: 10,
    deepestWave: 30,
    credits: 200,
    kills: 40,
    score: 1000,
    runId: `r:${Math.random().toString(36).slice(2)}`,
    endedAt: `t:${Math.random()}`,
    ...overrides,
  };
}

function swarmRun(overrides = {}) {
  return {
    ruleset: SWARM,
    arenaId: ARENA,
    seed: LADDER_SEED,
    arenaMutators: [],
    telemetry: {},
    ...overrides,
  };
}

test('SWARM-06: a profile migrates the depth slices forward', () => {
  resetCrucibleMetaForTests();
  const profile = loadCrucibleMeta();
  assert.ok(profile.crossover && typeof profile.crossover === 'object');
  assert.ok(profile.perks && Array.isArray(profile.perks.loadout));
  assert.ok(profile.challenges && typeof profile.challenges === 'object');
});

test('SWARM-06: settling the Zone 3 boss writes the ledger and the reader opens the hull', () => {
  resetCrucibleMetaForTests();
  const settled = settleCrucibleRun({
    result: swarmResult(),
    run: swarmRun(),
  });
  assert.ok(settled && settled.result);
  assert.deepEqual(settled.result.crossoverEarned, ['hull:ship_saucer']);
  const profile = loadCrucibleMeta();
  assert.ok(profile.crossover.earned['hull:ship_saucer'], 'the profile carries the proof');
  // The registered reader answers off the same bag — this is the shipyard's read.
  assert.equal(swarmCrossoverEarned('hull:ship_saucer'), true);
  assert.deepEqual(swarmEarnedHullDefIds(), ['ship_saucer']);
});

test('SWARM-06: a practice run and a short run write nothing to the ledger', () => {
  resetCrucibleMetaForTests();
  settleCrucibleRun({
    result: swarmResult({ practice: true, recordRules: { mode: 'practice' } }),
    run: swarmRun(),
  });
  settleCrucibleRun({
    result: swarmResult({ startWave: 1, wavesCleared: 9, wave: 9, deepestWave: 9 }),
    run: swarmRun(),
  });
  const profile = loadCrucibleMeta();
  assert.deepEqual(Object.keys(profile.crossover.earned), []);
});

test('SWARM-06: the Threat wager pays its bounty multiplier at settle', () => {
  resetCrucibleMetaForTests();
  const settled = settleCrucibleRun({
    result: swarmResult({ credits: 200 }),
    run: swarmRun({ telemetry: { threats: ['thick_pack'] } }),
  });
  // defeat banks half the wallet: 100 banked, Thick Pack adds 25% of the banked figure.
  assert.equal(settled.result.bankedBounty, 100);
  assert.equal(settled.result.threatBountyBonus, 25);
  assert.deepEqual(settled.result.threats, ['thick_pack']);
  assert.equal(loadCrucibleMeta().hangar.bounty, 125);
});

test('SWARM-06: a wager mutator never kicks the run off the ladder', () => {
  resetCrucibleMetaForTests();
  const settled = settleCrucibleRun({
    result: swarmResult({ mutators: [] }),
    run: swarmRun({
      arenaMutators: ['no_reroll'],
      telemetry: { threats: ['no_rerolls'] },
    }),
  });
  assert.deepEqual(settled.result.mutators, [], 'the wager stays off the mutator record');
  assert.deepEqual(settled.result.threats, ['no_rerolls'], 'and on the threat record');
  // Same facts through the ladder gate directly: a wagered ladder-seed run still counts.
  assert.equal(isSwarmLadderRun({
    ruleset: SWARM, arenaId: ARENA, seed: LADDER_SEED, mutators: settled.result.mutators,
  }), true);
});

test('SWARM-06: the daily challenge pays once per date', () => {
  resetCrucibleMetaForTests();
  const dateKey = '2099-02-03';
  const first = settleCrucibleRun({
    result: swarmResult({ dailyDateKey: dateKey, wavesCleared: 7, wave: 7 }),
    run: swarmRun({ dailyDateKey: dateKey }),
  });
  assert.equal(first.result.challengeRewards.length, 1);
  assert.equal(first.result.challengeRewards[0].bounty, 150);
  const second = settleCrucibleRun({
    result: swarmResult({ dailyDateKey: dateKey, wavesCleared: 7, wave: 7 }),
    run: swarmRun({ dailyDateKey: dateKey }),
  });
  assert.deepEqual(second.result.challengeRewards || [], [], 'the same date never pays twice');
});

test('SWARM-06: the weekly mutator challenge pays once per week', () => {
  resetCrucibleMetaForTests();
  useCrucibleMetaClock(() => '2026-10-01T12:00:00.000Z');
  try {
    const weekKey = utcWeekKeyNow();
    const weeklyId = weeklyMutatorForWeekKey(weekKey);
    assert.ok(weeklyId, 'the rotation names a mutator this week');
    const first = settleCrucibleRun({
      result: swarmResult({ mutators: [weeklyId], wavesCleared: 12, wave: 12, startWave: 1 }),
      run: swarmRun({ arenaMutators: [weeklyId] }),
    });
    const rows = first.result.challengeRewards || [];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'weekly');
    assert.equal(rows[0].bounty, 300);
    const second = settleCrucibleRun({
      result: swarmResult({ mutators: [weeklyId], wavesCleared: 12, wave: 12, startWave: 1 }),
      run: swarmRun({ arenaMutators: [weeklyId] }),
    });
    assert.deepEqual(second.result.challengeRewards || [], [], 'the same week never pays twice');
  } finally {
    useCrucibleMetaClock(null);
  }
});

test('SWARM-06: the perk loadout persists through the profile seam, earned-checked', () => {
  resetCrucibleMetaForTests();
  saveCrucibleMeta({ ladder: ladderWithStars(8), hangar: emptyHangar() });
  assert.ok(crucibleEarnedPerkIds().includes('gambler'));
  const ok = setCruciblePerkLoadout(['gambler', 'bounty_hunter']);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.loadout, ['gambler'], 'an unearned pick drops silently');
  const view = crucibleSwarmDepthView();
  assert.deepEqual(view.perks.loadout, ['gambler']);
  assert.equal(view.perks.slots, SWARM_PERK_SLOTS);
  assert.equal(typeof view.challenges.daily.claimed, 'boolean');
});

/* ---- runSession telemetry stamp -------------------------------------------- */

function boot({ seed = 4242 } = {}) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const registry = { get(name) { return name === 'economy' ? economy : null; } };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  if (economy.newGame) economy.newGame();
  runSession.init(ctx);
  return { state, bus, emitted, ctx };
}

test('SWARM-06: begin stamps threats and the earned-checked perk pick onto telemetry', () => {
  resetCrucibleMetaForTests();
  saveCrucibleMeta({ ladder: ladderWithStars(8), hangar: emptyHangar() });
  const h = boot();
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM, seed: LADDER_SEED, arenaId: ARENA,
    threats: ['thick_pack', 'bogus', 'no_rerolls'],
    perks: ['gambler', 'bounty_hunter'],
  });
  const run = h.state.run;
  assert.deepEqual(run.telemetry.threats, ['thick_pack', 'no_rerolls']);
  // gambler is earned at 8 stars; bounty_hunter needs a finished challenge — dropped.
  assert.deepEqual(run.telemetry.perks, ['gambler']);
});

test('SWARM-06: a gauntlet begin stamps no swarm depth rows', () => {
  resetCrucibleMetaForTests();
  const h = boot();
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: 1, arenaId: 'cinder_run',
    threats: ['thick_pack'], perks: ['gambler'],
  });
  assert.equal(h.state.run.telemetry.threats, undefined);
  assert.equal(h.state.run.telemetry.perks, undefined);
});

/* ---- the planner's room ----------------------------------------------------- */

test('SWARM-06: Thick Pack multiplies the room on the stake\'s own legs', () => {
  const base = planWave({ seed: LADDER_SEED, arenaId: ARENA, wave: 5, ruleset: SWARM, mutators: [] });
  const wagered = planWave({
    seed: LADDER_SEED, arenaId: ARENA, wave: 5, ruleset: SWARM, mutators: [],
    swarmThreats: ['thick_pack'],
  });
  assert.ok(base && base.swarm && wagered && wagered.swarm);
  assert.ok(wagered.swarm.killTarget > base.swarm.killTarget,
    'the same wave owes more bodies under the wager');
  assert.ok(wagered.swarm.pressureScale > base.swarm.pressureScale);
  assert.deepEqual(wagered.swarm.threats, ['thick_pack']);
  assert.equal(base.swarm.threats, undefined, 'a clean run stamps none');
});

/* ---- the adaptive lift ------------------------------------------------------- */

test('SWARM-06: the chain lift is bounded and only ever drives the mix hotter', () => {
  assert.equal(swarmChainLift(0), 0);
  assert.equal(swarmChainLift(40), 1);
  assert.equal(swarmChainLift(400), 1);
  const travel = THEME_STEM_WEIGHTS.travel;
  const lifted = applySwarmStemLift(travel, { A: 1, B: 1, C: 1, D: 1 }, 1);
  // Full lift drags the travel mix to the combat row's shape — never below where it was.
  assert.ok(lifted.B >= travel.B && lifted.C > travel.C);
  assert.equal(applySwarmStemLift(travel, null, 0), travel);
  const theme = resolveThemeMatrix({ state: 'travel', sectorId: 'helios_core', swarmLift: 1 });
  const plain = resolveThemeMatrix({ state: 'travel', sectorId: 'helios_core' });
  assert.ok(theme.audibleStemWeights.C > plain.audibleStemWeights.C,
    'the same state row reads hotter under a running chain');
  assert.equal(theme.state, 'travel', 'the lift never re-decides the state');
});

/* ---- the elites runtime ------------------------------------------------------- */

function elitesHarness({ threats = [], perks = [], wave = 5 } = {}) {
  const state = createGameState(73311);
  state.run = {
    // validateRunState holds the closed-key contract — spread the real shape, never hand-roll it.
    ...createRunState({ kind: 'survival', ruleset: SWARM, seed: LADDER_SEED }),
    phase: 'active',
    wave,
    arenaId: ARENA,
    telemetry: { threats: threats.slice(), perks: perks.slice() },
  };
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const spawned = [];
  const ctx = {
    state, bus,
    helpers: {
      spawnBudget: { request: () => 0, bindEntity: () => true, releaseSome: () => {} },
      spawnEntity: (spec) => { spawned.push(spec); return { id: `s${spawned.length}` }; },
    },
    registry: { get: () => null },
  };
  swarmElites.init(ctx);
  return { state, bus, emitted, spawned };
}

function cohortBody(id, wave, { champion = false, role = 'fodder' } = {}) {
  return {
    id, alive: true, pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, maxSpeed: 60, combatSpeed: 50, thrust: 40,
    data: { runCohort: 'survival', runWave: wave, runRole: role, swarmChampion: champion },
  };
}

test('SWARM-06: a wave-22 champion carries a seeded affix; a wave-5 room in a clean run does not', () => {
  const clean = elitesHarness({ threats: [], wave: 5 });
  const body = cohortBody(1, 5, { champion: true });
  clean.state.entities.set(1, body);
  swarmElites.update(1 / 60, clean.state);
  assert.equal(body.data.swarmAffix, undefined);
  const late = elitesHarness({ threats: [], wave: 22 });
  const boss = cohortBody(2, 22, { champion: true });
  late.state.entities.set(2, boss);
  swarmElites.update(1 / 60, late.state);
  assert.ok(boss.data.swarmAffix && SWARM_AFFIX_BY_ID[boss.data.swarmAffix]);
});

test('SWARM-06: a live threat brings affixes early, and stamps the threat legs once', () => {
  const h = elitesHarness({ threats: ['fast_lane', 'armoured_elites'], wave: 5 });
  const champ = cohortBody(1, 5, { champion: true });
  const chaff = cohortBody(2, 5, { role: 'fodder' });
  h.state.entities.set(1, champ);
  h.state.entities.set(2, chaff);
  swarmElites.update(1 / 60, h.state);
  assert.equal(champ.data.swarmThreatStamped, true);
  assert.ok(Math.abs(champ.maxSpeed - 60 * 1.15) < 0.001, 'Fast Lane scaled the hull');
  assert.equal(champ.hullMax, 150, 'Armoured Elites plated the champion');
  assert.equal(chaff.hullMax, 100, 'the plating is champions-only');
  // Affixes ride from wave 1 under a threat — the fodder does not qualify, the champion does.
  assert.ok(champ.data.swarmAffix && SWARM_AFFIX_BY_ID[champ.data.swarmAffix]);
  assert.equal(chaff.data.swarmAffix, undefined);
  // A second tick does not re-stamp.
  const hullAfter = champ.hullMax;
  swarmElites.update(1 / 60, h.state);
  assert.equal(champ.hullMax, hullAfter);
});

test('SWARM-06: Scavenger emits a bonus-chip intent every tenth player kill', () => {
  const h = elitesHarness({ perks: ['scavenger'] });
  for (let i = 0; i < 10; i++) {
    const body = cohortBody(100 + i, 5);
    h.state.entities.set(100 + i, body);
    h.bus.emit('entity:killed', { id: 100 + i, killerId: h.state.playerId });
  }
  const chips = h.emitted.filter((e) => e.event === 'swarm:bonusChip');
  assert.equal(chips.length, 1, 'the tenth kill — and only the tenth — mints the chip');
  assert.ok(chips[0].payload.credits > 0);
});

test('SWARM-06: a non-swarm run stamps nothing at all', () => {
  const h = elitesHarness({ threats: ['fast_lane'] });
  h.state.run.ruleset = 'scored';
  const body = cohortBody(1, 30, { champion: true });
  h.state.entities.set(1, body);
  swarmElites.update(1 / 60, h.state);
  assert.equal(body.data.swarmAffix, undefined);
  assert.equal(body.data.swarmThreatStamped, undefined);
});

/* ---- the shipyard gate -------------------------------------------------------- */

test('SWARM-06: the Saucer answers the ledger, never the research tree', () => {
  assert.ok(SAUCER, 'the saucer def exists');
  assert.equal(SAUCER.requiresTech, undefined, 'the research route is retired');
  assert.equal(SAUCER.swarmEarned, 'hull:ship_saucer');
  const state = createGameState(1);
  const raw = createBus();
  const bus = { on: raw.on.bind(raw), emit: raw.emit.bind(raw) };
  const ctx = { state, bus, helpers: {}, registry: { get: () => null } };
  ships.init(ctx);
  if (ships.newGame) ships.newGame();
  resetCrucibleMetaForTests();
  assert.equal(ships.isUnlocked(SAUCER), false, 'unproven, the disc is not for sale');
  assert.match(defLockReasonText(SAUCER), /Earned in Swarm/);
  saveCrucibleMeta({ crossover: dirtyLedger(), hangar: emptyHangar() });
  assert.equal(ships.isUnlocked(SAUCER), true, 'the ledger opens the yard');
});

test('SWARM-06: the Hangar flies what the ledger proved — without ever selling it', () => {
  resetCrucibleMetaForTests();
  saveCrucibleMeta({ crossover: dirtyLedger(), hangar: emptyHangar() });
  const state = createGameState(1);
  applyHangarToPlayer(state, emptyHangar());
  assert.ok(state.player.ownedShips.some((row) => row && row.defId === 'ship_saucer'),
    'the disc joins the run manifest off the ledger alone');
});

/* ---- the launch path ------------------------------------------------------------ */

test('SWARM-06: the door\'s hull list gates the saucer until the ledger carries it', () => {
  resetCrucibleMetaForTests();
  let choice = crucibleHullChoices().find((row) => row.hullId === 'ship_saucer');
  assert.equal(choice.swarmEarned, 'hull:ship_saucer');
  assert.equal(choice.earned, false);
  assert.match(choice.earnText, /Zone 3 boss/);
  saveCrucibleMeta({ crossover: dirtyLedger(), hangar: emptyHangar() });
  choice = crucibleHullChoices().find((row) => row.hullId === 'ship_saucer');
  assert.equal(choice.earned, true);
});

test('SWARM-06: the setup carries the wager for swarm and never for the gauntlet', () => {
  const swarm = crucibleSetupFor({
    starterId: 'ricochet_runner', seed: LADDER_SEED, arenaId: ARENA,
    ruleset: SWARM, swarmThreats: ['thick_pack', 'bogus'],
  });
  assert.equal(swarm.ok, true);
  assert.deepEqual(swarm.value.swarmThreats, ['thick_pack']);
  const gauntlet = crucibleSetupFor({
    starterId: 'ricochet_runner', seed: 5, arenaId: 'ceres_belt',
    ruleset: 'scored', swarmThreats: ['thick_pack'],
  });
  assert.equal(gauntlet.ok, true);
  assert.equal(gauntlet.value.swarmThreats, undefined);
});

test('SWARM-06: the crossover catalog keeps its one-hull contract', () => {
  assert.equal(SWARM_CROSSOVER_CATALOG.length, 1);
  assert.equal(SWARM_CROSSOVER_CATALOG[0].defId, 'ship_saucer');
  assert.equal(SWARM_CROSSOVER_CATALOG[0].earnWave, 30);
});
