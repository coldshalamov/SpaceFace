// Phase 5.3 — the first swarm minute hands one light hull before the pack.
// The pack is the same bodies, held until the lesson hull falls or 45 seconds pass, whichever
// comes first. A run that does not ask for the lesson still opens at pressure.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { OPENING_LESSON_RELEASE_TICKS, survivalWave } from '../src/systems/survivalWave.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import {
  SWARM_RULESET,
  bindSwarmPressureContext,
  resetSwarmPressureState,
  swarmOpeningCount,
} from '../src/data/swarmMode.js';
import { OPENING_LESSON_HOLD_TICKS, planWave } from '../src/systems/survivalWavePlanner.js';

const BASE = Object.freeze({
  seed: 4242,
  arenaId: 'helios_core',
  wave: 1,
  ruleset: SWARM_RULESET,
});

test('a swarm wave that was not asked to teach still opens inside the first half-second', () => {
  const plan = planWave(BASE);
  assert.equal(plan.error, undefined);
  assert.equal(plan.openingLesson, undefined);
  assert.ok(plan.schedule.some((entry) => entry.atTick < 24));
});

test('the opening lesson keeps the body count and holds the pack for 45 seconds', () => {
  const plain = planWave(BASE);
  const taught = planWave({ ...BASE, teachOpening: true });
  assert.equal(swarmOpeningCount(taught.packages), swarmOpeningCount(plain.packages),
    'the lesson must not add a body to the budget');
  assert.equal(taught.openingLesson.holdTicks, OPENING_LESSON_HOLD_TICKS);
  assert.equal(OPENING_LESSON_HOLD_TICKS, 45 * 60);
  const early = taught.schedule.filter((entry) => entry.atTick === 0);
  assert.equal(early.length, 1);
  assert.equal(early[0].enemyId, 'wasp_swarmer');
  assert.equal(early[0].count, 1);
  assert.equal(early[0].distance, 90);
  assert.ok(taught.schedule.filter((entry) => entry !== early[0]).every(
    (entry) => entry.atTick >= OPENING_LESSON_HOLD_TICKS,
  ));
  assert.equal(taught.openingLesson.rock.radius, 6);
  assert.equal(taught.openingLesson.well.radius, 96);
  assert.equal(
    taught.swarm.durationTicks,
    plain.swarm.durationTicks + OPENING_LESSON_HOLD_TICKS,
    'the pack still gets a full wave after the lesson',
  );

  const second = planWave({ ...BASE, wave: 2, teachOpening: true });
  assert.equal(second.openingLesson, undefined, 'only the first wave teaches');
});

// SF-061 — the promise is an offer, not a hostage. A player who shoots the hull and ignores the
// rock clears the wave on the same kill clock as everyone else: nothing in the completion
// contract, the objective, or the quota gates on the lesson move being performed.
test('refusing the lesson move still clears the wave on the ordinary kill clock', () => {
  const plain = planWave(BASE);
  const taught = planWave({ ...BASE, teachOpening: true });
  assert.deepEqual(taught.completionRules, plain.completionRules,
    'the wave resolves identically whether or not the lesson is used');
  assert.equal(taught.objective.kind, plain.objective.kind);
  assert.equal(taught.swarm.killTarget, plain.swarm.killTarget,
    'the quota must not grow a lesson dependency');
  assert.equal(taught.swarm.concurrent, plain.swarm.concurrent);
});

// The opening line names what the player can see: one hull, one throwable rock, the pack still
// coming — never the held pack's bearings or a body count that is not on the field yet.
test('the opening line names the lesson, not the held pack', () => {
  const taught = planWave({ ...BASE, teachOpening: true });
  const line = waveOpeningLine(1, taught);
  assert.match(line, /rock/i, 'the rock is the lesson — the line must name it');
  assert.match(line, /throw/i, 'the line must name the move');
  assert.ok(!line.includes('Break the pack'), 'the pack is held — it cannot be broken yet');
  assert.ok(!/Contact from/.test(line), 'held-pack bearings would describe bodies not on the field');
});

// ---------------------------------------------------------------------------
// runtime side: the hold is a ceiling, not a sentence
// ---------------------------------------------------------------------------

const DT = 1 / 60;

function boot(seed = 4242) {
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
  const budget = makeBudgetApi(state);
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  return { state, bus, emitted, helpers, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

/** Cohort-marked bodies only — the lesson rock is arena furniture, not a hostile. */
function liveHostiles(h) {
  const out = [];
  for (const entity of h.state.entities.values()) {
    if (entity.id === h.player.id) continue;
    if (entity.alive === false) continue;
    if (entity.type && entity.type !== 'ship' && entity.type !== 'drone') continue;
    if (!(entity.data && entity.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    out.push(entity);
  }
  return out;
}

function killOne(h) {
  const live = liveHostiles(h);
  if (live.length === 0) return false;
  const victim = live[0];
  victim.alive = false;
  h.state.entities.delete(victim.id);
  h.bus.emit('entity:destroyed', { id: victim.id });
  return true;
}

function beginLessonRun(h) {
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: 4242, arenaId: BASE.arenaId,
    openingLesson: true,
  });
  h.bus.emit('run:loadoutReady', {});
  tick(h, 1);
  tick(h, SURVIVAL_ARENA_INTRO_TICKS);
  tick(h, SURVIVAL_WAVE_INTRO_TICKS);
}

test('killing the lesson hull releases the pack one beat later, not forty-five seconds later', () => {
  const h = boot();
  beginLessonRun(h);
  tick(h, 10);
  assert.equal(h.state.run.phase, 'active', 'the wave must be live');
  assert.equal(liveHostiles(h).length, 1, 'the lesson opens on one hull');
  const materializedBefore = h.emitted.filter((e) => e.event === 'run:waveMaterialized').length;

  assert.ok(killOne(h), 'the lesson hull must be on the field to kill');
  tick(h, OPENING_LESSON_RELEASE_TICKS + 60);

  assert.ok(
    h.emitted.some((e) => e.event === 'run:openingLessonReleased'),
    'the release receipt must fire so the arrival can be named',
  );
  assert.ok(liveHostiles(h).length > 1, 'the pack landed a beat after the kill');
  assert.ok(
    h.emitted.some((e) => e.event === 'run:waveMaterialized'
      && Number.isInteger(e.payload && e.payload.tick) && e.payload.tick < OPENING_LESSON_HOLD_TICKS),
    'pack bodies must land well before the authored hold',
  );
  // The released pack cannot exceed the wave's own budget.
  const planned = planWave({ ...BASE, teachOpening: true }).swarm.killTarget;
  const admitted = h.emitted
    .filter((e) => e.event === 'run:waveMaterialized')
    .reduce((sum, e) => sum + (e.payload.admitted || 0), 0);
  assert.ok(admitted <= planned, `admitted ${admitted} exceeds the planned ${planned}`);
  assert.ok(materializedBefore >= 1, 'the lesson hull itself materialized');
});

test('the hold stands while the lesson hull still flies', () => {
  const h = boot();
  beginLessonRun(h);
  tick(h, 600);
  assert.equal(liveHostiles(h).length, 1, 'ten seconds in, the pack still waits');
  assert.ok(!h.emitted.some((e) => e.event === 'run:openingLessonReleased'));
});

test('the released wave still clears on the full quota, on a shorter clock', () => {
  const h = boot();
  beginLessonRun(h);
  tick(h, 10);
  killOne(h); // the lesson hull
  // Work the room down as bodies land. The pack keeps its authored spacing after the shift and
  // the stream tops the quota up behind it, so the clear needs room for all fifteen admissions.
  for (let i = 0; i < 1200; i++) {
    if (i % 6 === 0) killOne(h);
    tick(h);
    if (h.emitted.some((e) => e.event === 'run:waveCleared')) break;
  }
  const cleared = h.emitted.filter((e) => e.event === 'run:waveCleared');
  assert.equal(cleared.length, 1, 'the wave must clear');
  const taught = planWave({ ...BASE, teachOpening: true });
  assert.equal(cleared[0].payload.killed, taught.swarm.killTarget,
    'the released wave still owes every planned body');
  assert.ok(
    cleared[0].payload.durationTicks < taught.swarm.durationTicks,
    'the clock shrank by the released hold',
  );
  assert.ok(
    cleared[0].payload.durationTicks > taught.swarm.durationTicks - OPENING_LESSON_HOLD_TICKS,
    'the pack keeps more than its bare minute — arrival beat included',
  );
});
