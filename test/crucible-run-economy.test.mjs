// CRU-014 — the run wallet and run XP. Campaign credits are never involved.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  assertCampaignBoundaryUnchanged,
  runLevelForXp,
  runXpForLevel,
  snapshotCampaignBoundary,
} from '../src/core/runState.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { SWARM_FLOOR_PLANS, SWARM_FLOOR_WALL_GUN_PRICE } from '../src/data/swarmFloor.js';
import { runSession } from '../src/systems/runSession.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { bankableRunCredits } from '../src/systems/survivalExtraction.js';
import { createCircuitState } from '../src/systems/survivalCircuit.js';
import {
  killScoreFor,
  killXpFor,
  survivalRewards,
  WAVE_CLEAR_SCORE,
} from '../src/systems/survivalRewards.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const ARENA = 'helios_core';
const SEED = 7;

function boot(seed = SEED) {
  const state = createGameState(seed);
  state.player.credits = 1000;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
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
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;

  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalRewards.init(ctx);
  return { state, bus, emitted, ctx, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function beginSurvival(harness, phase = 'active', setup = {}) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA, ...setup });
  const walk = ['arena_intro', 'wave_intro', 'active'];
  let from = 'loadout';
  for (const next of walk) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 'test', tick: 0 });
    from = next;
    if (next === phase) break;
  }
  return harness.state.run;
}

function spawnCohortEnemy(harness, { level = 1, wave = 1, cohort = 'survival' } = {}) {
  const id = harness.state.nextEntityId++;
  const entity = {
    id, alive: true, type: 'ship', team: 1, pos: { x: 50, z: 0 },
    data: { level, runWave: wave, ...(cohort ? { runCohort: cohort } : {}) },
  };
  harness.state.entities.set(id, entity);
  harness.state.entityList.push(entity);
  return entity;
}

function killIt(harness, entity, killerId = 1) {
  entity.alive = false;
  harness.bus.emit('entity:killed', {
    id: entity.id, killerId, type: entity.type, pos: { x: entity.pos.x, z: entity.pos.z },
  });
}

test('the run XP curve is monotone and starts at level 1', () => {
  assert.equal(runXpForLevel(1), 0);
  assert.equal(runLevelForXp(0), 1);
  assert.equal(runLevelForXp(-50), 1);
  let previous = -1;
  for (let level = 1; level <= 20; level++) {
    const cost = runXpForLevel(level);
    assert.ok(cost > previous, `level ${level} costs more than ${level - 1}`);
    assert.equal(runLevelForXp(cost), level, `exactly ${cost} xp is level ${level}`);
    assert.equal(runLevelForXp(cost - 1), Math.max(1, level - 1));
    previous = cost;
  }
});

test('very large XP resolves without walking one level at a time', { timeout: 250 }, () => {
  const total = 1e18;
  const level = runLevelForXp(total);
  assert.ok(level > 100_000_000);
  assert.ok(runXpForLevel(level) <= total);
  assert.ok(runXpForLevel(level + 1) > total);
});

test('extreme finite XP does not enter a non-progressing correction loop', () => {
  const moduleUrl = new URL('../src/core/runState.js', import.meta.url).href;
  const child = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `import { runLevelForXp } from ${JSON.stringify(moduleUrl)}; console.log(runLevelForXp(Number.MAX_VALUE));`,
  ], { encoding: 'utf8', timeout: 5000 });

  assert.equal(child.error, undefined, child.error && child.error.message);
  assert.equal(child.status, 0, child.stderr);
  // A colored console wraps the digits; the level itself is the number.
  const printed = String(child.stdout).replace(/\u001b\[[0-9;]*m/g, '').trim();
  const level = Number(printed);
  assert.ok(Number.isFinite(level) && level > 1, printed);
});

test('an award lands in the run wallet, recomputes the level, and emits a receipt', () => {
  const harness = boot();
  beginSurvival(harness);
  // Score waits until this wave's pilot acts. Credits and XP do not.
  harness.bus.emit('run:awardRequested', { score: 300, reason: 'test' });
  assert.equal(harness.state.run.score, 0);
  assert.equal(named(harness.emitted, 'run:awarded').length, 0);
  noteSwarmPilotAction(harness.state);
  const levelTwoXp = runXpForLevel(2);
  harness.bus.emit('run:awardRequested', { credits: 40, xp: levelTwoXp, score: 300, reason: 'test' });
  const run = harness.state.run;
  assert.equal(run.credits, 40);
  assert.equal(run.xp, levelTwoXp);
  assert.equal(run.score, 300);
  assert.equal(run.level, 2);

  const awarded = named(harness.emitted, 'run:awarded');
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].payload.totalCredits, 40);
  assert.equal(awarded[0].payload.level, 2);
  assert.equal(awarded[0].payload.previousLevel, 1);
  assert.equal(named(harness.emitted, 'run:levelUp').length, 1);
});

test('awards are refused for a negative amount, an adventure run, and an inactive run', () => {
  const harness = boot();
  // inactive
  harness.bus.emit('run:awardRequested', { credits: 10, xp: 10 });
  assert.equal(harness.state.run.credits, 0);

  beginSurvival(harness);
  harness.bus.emit('run:awardRequested', { credits: -500, xp: -500, score: -1 });
  assert.equal(harness.state.run.credits, 0);
  assert.equal(harness.state.run.xp, 0);
  assert.equal(named(harness.emitted, 'run:awarded').length, 0);

  const adventure = boot(9);
  adventure.bus.emit('run:awardRequested', { credits: 999 });
  assert.equal(adventure.state.run.kind, 'adventure');
  assert.equal(adventure.state.run.credits, 0);
});

test('spending refuses to go negative and says so', () => {
  const harness = boot();
  beginSurvival(harness);
  harness.bus.emit('run:awardRequested', { credits: 50 });
  harness.bus.emit('run:spendRequested', { credits: 80, reason: 'refit' });
  assert.equal(harness.state.run.credits, 50);
  assert.equal(named(harness.emitted, 'run:spendRejected').length, 1);
  assert.equal(named(harness.emitted, 'run:spendRejected')[0].payload.available, 50);

  harness.bus.emit('run:spendRequested', { credits: 30, reason: 'refit' });
  assert.equal(harness.state.run.credits, 20);
  assert.equal(named(harness.emitted, 'run:spent').length, 1);
});

test('a cohort kill pays run XP and score; a bystander kill inside the arena pays nothing', () => {
  const harness = boot();
  beginSurvival(harness);
  noteSwarmPilotAction(harness.state);

  const wasp = spawnCohortEnemy(harness, { level: 2, wave: 4 });
  killIt(harness, wasp);
  assert.equal(harness.state.run.xp, killXpFor(2));
  assert.equal(harness.state.run.score, killScoreFor(2));

  const bystander = spawnCohortEnemy(harness, { level: 3, cohort: null });
  killIt(harness, bystander);
  assert.equal(harness.state.run.xp, killXpFor(2), 'ambient traffic does not pay the run');
  assert.equal(harness.state.run.score, killScoreFor(2));

  // THE ROOM'S KILLS PAY (PQ-135). A cohort body that dies to an arena mine, to another hostile,
  // or to the wall the player threw it into is still the run's body and still pays the run. The
  // gate is the COHORT MARK, not who pulled the trigger — the bystander case above is what the
  // marker exists to exclude, and it still pays nothing.
  const xpBefore = harness.state.run.xp;
  const roomKill = spawnCohortEnemy(harness, { level: 2 });
  killIt(harness, roomKill, 999);
  assert.equal(
    harness.state.run.xp,
    xpBefore + killXpFor(2),
    'a kill the ROOM made still pays the run — the environment is a weapon, not a tax',
  );
});

test('clearing a wave pays the authored XP purse for exactly that wave', () => {
  const harness = boot();
  beginSurvival(harness);
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 1, act: 0, difficulty: 1, mutators: [], buildSummary: null });
  harness.bus.emit('run:wavePlanned', { wave: 1, plan });
  harness.bus.emit('run:waveCleared', { wave: 1, requested: 6, admitted: 6, starved: false });

  assert.equal(harness.state.run.xp, plan.rewards.xp);
  assert.equal(harness.state.run.score, WAVE_CLEAR_SCORE * 1);

  // A cleared receipt for a wave we have no plan for still scores, but invents no XP.
  harness.bus.emit('run:waveCleared', { wave: 2, requested: 8, admitted: 8, starved: false });
  assert.equal(harness.state.run.xp, plan.rewards.xp);
  assert.equal(harness.state.run.score, WAVE_CLEAR_SCORE * 1 + WAVE_CLEAR_SCORE * 2);
});

test('a new Easy Swarm can afford the named wall gun after three clean rounds on earned Scrap', () => {
  const harness = boot(4242);
  const { state, bus } = harness;
  const setup = { ruleset: 'swarm', seed: 4242, swarmStake: 'exhibition', zeroScrapOpening: true };
  beginSurvival(harness, 'active', setup);
  assert.equal(state.run.credits, 0);
  assert.equal(state.run.telemetry.zeroScrapOpening, true);
  const [wallGun] = SWARM_FLOOR_PLANS[ARENA].wallGuns;
  assert.equal(wallGun.defId, 'wpn_pulse_laser_s');
  assert.equal(wallGun.wave, 2);
  for (const [wave, cash, clearScrap] of [[1, 118, 38], [2, 289, 75], [3, 514, 113]]) {
    state.run.wave = wave;
    const plan = planWave({ ...setup, arenaId: ARENA, wave });
    bus.emit('run:wavePlanned', { wave, plan });
    const count = plan.swarm.killTarget;
    for (let i = 0; i < count; i++) killIt(harness, spawnCohortEnemy(harness, { wave }));
    assert.ok(state.run.credits < SWARM_FLOOR_WALL_GUN_PRICE);
    const clear = { wave, runWave: wave, completionKind: 'cohort', requested: count, admitted: count, killed: count, starved: false };
    bus.emit('run:waveCleared', clear);
    assert.equal(state.run.credits, cash, `Round ${wave} pays the sweep plus its completion reward`);
    assert.equal(bankableRunCredits(state.run), cash);
    const award = named(harness.emitted, 'run:awarded').at(-1).payload;
    assert.deepEqual([award.reason, award.credits, award.xp], ['wave_cleared', clearScrap, plan.rewards.xp]);
    bus.emit('run:waveCleared', clear);
    survivalRewards.deserialize(survivalRewards.serialize());
    bus.emit('run:waveCleared', clear);
    assert.equal(state.run.credits, cash, 'duplicate and deserialized clear receipts do not pay again');
    bus.emit('run:waveCleared', { ...clear, wave: wave + 1, runWave: wave + 1 });
    assert.equal(state.run.credits, cash, 'an unplanned next-round receipt cannot pay or consume its award');
  }
  assert.ok(state.run.credits >= SWARM_FLOOR_WALL_GUN_PRICE);
  bus.emit('run:spendRequested', { credits: SWARM_FLOOR_WALL_GUN_PRICE, reason: 'swarm_floor_pad' });
  assert.equal(state.run.credits, 14, 'the wallet can commit the full wall-gun quote');
  bus.emit('game:exitToMenu', { source: 'retry' });
  beginSurvival(harness, 'active', setup);
  assert.equal(state.run.credits, 0, 'a fresh attempt does not inherit earned Scrap');
  assert.equal(state.run.seed, 4242);
});

test('the new round payout requires an ordinary active Swarm cohort that genuinely cleared', () => {
  for (const [name, overrides] of [
    ['legacy start', { zeroScrapOpening: false }],
    ['checkpoint', { startWave: 6 }],
    ['practice', { practice: true }],
    ['circuit', {}],
    ['starved', {}],
    ['ended', {}],
  ]) {
    const harness = boot(4242);
    const { state, bus } = harness;
    const setup = { ruleset: 'swarm', seed: 4242, swarmStake: 'exhibition', zeroScrapOpening: true, ...overrides };
    beginSurvival(harness, 'active', setup);
    const wave = overrides.startWave || 1;
    state.run.wave = wave;
    if (name === 'circuit') state.run.telemetry.circuit = createCircuitState();
    const plan = planWave({ ...setup, arenaId: ARENA, wave });
    bus.emit('run:wavePlanned', { wave, plan });
    if (name === 'ended') bus.emit('run:endRequested', { outcome: 'defeat', reason: 'player_death' });
    const before = state.run.credits;
    const count = plan.swarm.killTarget;
    const starved = name === 'starved';
    bus.emit('run:waveCleared', { wave, runWave: wave, completionKind: 'cohort', requested: count,
      admitted: starved ? 0 : count, killed: starved ? 0 : count, starved });
    assert.equal(state.run.credits, before, name);
  }
});

test('a whole run of awards never touches campaign credits or the campaign boundary', () => {
  const harness = boot();
  const before = snapshotCampaignBoundary(harness.state);
  beginSurvival(harness);
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 1, act: 0, difficulty: 1, mutators: [], buildSummary: null });
  harness.bus.emit('run:wavePlanned', { wave: 1, plan });
  for (let i = 0; i < 6; i++) killIt(harness, spawnCohortEnemy(harness, { level: 1, wave: 1 }));
  harness.bus.emit('run:waveCleared', { wave: 1, requested: 6, admitted: 6, starved: false });
  harness.bus.emit('run:awardRequested', { credits: 120, reason: 'chips' });

  assert.ok(harness.state.run.credits > 0);
  assert.ok(harness.state.run.xp > 0);
  assert.equal(harness.state.player.credits, 1000);
  assertCampaignBoundaryUnchanged(before, snapshotCampaignBoundary(harness.state));
  assert.ok(!harness.emitted.some((e) => e.event === 'economy:grantCredits'));
  assert.ok(!harness.emitted.some((e) => e.event === 'economy:chargeCredits'));
});

test('a recorded draft pick is an immutable copy, not a live reference into run state', () => {
  const harness = boot();
  beginSurvival(harness);
  const record = { kind: 'weapon_swap', defId: 'wpn_gravity_marker_s', slotIndex: 1 };
  harness.bus.emit('run:modifierRecordRequested', {
    record, draft: { wave: 1, offered: ['a', 'b', 'c'], picked: 0 }, wave: 1,
  });
  assert.equal(harness.state.run.modifiers.length, 1);
  assert.equal(harness.state.run.draftHistory.length, 1);
  assert.notEqual(harness.state.run.modifiers[0], record, 'stored by value, not by reference');
  record.defId = 'mutated';
  assert.equal(harness.state.run.modifiers[0].defId, 'wpn_gravity_marker_s');
});

test('survivalRewards is event-driven and never joins the per-frame update order', () => {
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('survivalRewards'), false);
  assert.equal(typeof survivalRewards.update, 'undefined');
});
