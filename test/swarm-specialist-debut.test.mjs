// SF-064 — a specialist's first wave stages one readable arrival: a solo body on its own
// bearing, a beat after the opening burst, before the stream mixes the newcomer with the rest
// of the room. The debut is wave-number deterministic — no tutorial state — and the body is
// owed like a champion: a full room cannot silently drop it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  SWARM_DEBUT_TICKS,
  SWARM_DEBUT_DISTANCE,
  SWARM_ROSTER,
  SWARM_RULESET,
  bindSwarmPressureContext,
  pickSwarmArchetype,
  resetSwarmPressureState,
  swarmNewcomerFor,
  swarmOpeningCount,
} from '../src/data/swarmMode.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalWave } from '../src/systems/survivalWave.js';

const ARENA_ID = 'helios_core';

function swarmPlan(wave, seed = 9) {
  return planWave({ seed, arenaId: ARENA_ID, wave, mode: SWARM_RULESET });
}

// The first unlock wave per roster entry (2, 4, 5, 6, 8, 10, 12, 14, 16, 18, 22).
const DEBUT_WAVES = [...new Set(SWARM_ROSTER.map((e) => e.fromWave))].filter((w) => w > 1);

test('every unlock wave stages exactly one debut package for its newcomer', () => {
  for (const w of DEBUT_WAVES) {
    const newcomer = swarmNewcomerFor(w);
    assert.ok(newcomer, `wave ${w} has a newcomer`);
    const plan = swarmPlan(w);
    assert.ok(!plan.error, `wave ${w} plan valid`);
    const debuts = plan.packages.filter((pkg) => pkg.debut === true);
    assert.equal(debuts.length, 1, `wave ${w} has exactly one debut`);
    const debut = debuts[0];
    assert.equal(debut.enemyId, newcomer.enemyId);
    assert.equal(debut.count, 1, 'the rehearsal is one body — survivable, ignorable once');
    assert.equal(debut.atTick, SWARM_DEBUT_TICKS, 'the tell lands after the opening burst settles');
    assert.equal(debut.distance, SWARM_DEBUT_DISTANCE, 'it approaches from a readable distance');
  }
});

test('the opening burst never pre-empts the debut: no group fields the newcomer early', () => {
  for (const w of DEBUT_WAVES) {
    const newcomer = swarmNewcomerFor(w);
    const plan = swarmPlan(w);
    const early = plan.packages.filter(
      (pkg) => pkg.enemyId === newcomer.enemyId && pkg.debut !== true && pkg.atTick < SWARM_DEBUT_TICKS,
    );
    assert.equal(early.length, 0, `wave ${w}: ${newcomer.enemyId} arrives only as the staged debut`);
  }
});

test('the debut gate is its own bearing, distinct from the opening groups', () => {
  const w = 8; // lancer debut, three opening groups
  const plan = swarmPlan(w);
  const debut = plan.packages.find((pkg) => pkg.debut === true);
  const openingGates = new Set(
    plan.packages.filter((pkg) => pkg.debut !== true).map((pkg) => pkg.gateGroup),
  );
  assert.ok(!openingGates.has(debut.gateGroup), 'debut arrives on its own bearing');
});

test('the debut seat comes out of the opening burst — the pressure math does not grow', () => {
  for (const w of DEBUT_WAVES) {
    const debutPlan = swarmPlan(w, 9);
    // Compare against the same wave planned without the newcomer convention: total bodies in
    // the opening burst + debut must not exceed the authored opening pressure.
    const debut = debutPlan.packages.find((pkg) => pkg.debut === true);
    assert.ok(debut, `wave ${w}`);
    // The discriminating assertion: opening packages always sum to exactly the authored opening
    // pressure, so a donor paying the seat back keeps the total flat — while a donor miss (or a
    // removed donor rule) would push it to pressure+1 and fail here. A mass-gap wave's late wall
    // muscle is a separate deliberate +2 on top of that authored figure.
    const wallBonus = debutPlan.packages
      .filter((p) => p.wall === true)
      .reduce((sum, p) => sum + p.count, 0);
    assert.equal(
      swarmOpeningCount(debutPlan.packages),
      debutPlan.swarm.openingPressure + wallBonus,
      `wave ${w}: debut must not grow the opening budget`,
    );
  }
});

test('the debut flag rides the schedule so materialization can protect it', () => {
  const plan = swarmPlan(4); // choir_zealot debut
  const entries = plan.schedule.filter((e) => e.debut === true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].atTick, SWARM_DEBUT_TICKS);
  assert.equal(entries[0].enemyId, 'choir_zealot');
});

test('non-debut waves never carry a debut package', () => {
  // The lawful roster (FB-023) turned 9/13/15 into debut waves — warden_escort, customs_cutter
  // and patrol_lawman now unlock there — so the non-debut list keeps only waves no fromWave claims.
  for (const w of [3, 7, 11, 20, 30]) {
    const plan = swarmPlan(w);
    assert.ok(!plan.error);
    assert.equal(plan.packages.filter((pkg) => pkg.debut === true).length, 0, `wave ${w}`);
  }
});

test('the stream still fields the newcomer normally on debut wave and after', () => {
  // The roster keeps its seat — the debut is staged arrival ordering, not a suppression list.
  for (const w of DEBUT_WAVES) {
    const newcomer = swarmNewcomerFor(w);
    const plan = swarmPlan(w);
    assert.ok(
      plan.swarm.roster.some((e) => e.enemyId === newcomer.enemyId),
      `wave ${w}: ${newcomer.enemyId} stays in the reinforcement roster`,
    );
    // And pickSwarmArchetype can still draw it from the plan roster.
    const roster = plan.swarm.roster;
    const seen = new Set();
    const rng = mulberry32(1234);
    for (let i = 0; i < 400; i++) seen.add(pickSwarmArchetype(w, rng(), roster).enemyId);
    assert.ok(seen.has(newcomer.enemyId), `wave ${w}: stream can roll ${newcomer.enemyId}`);
  }
});

test('debut composes with build pressure without either eating the other', () => {
  // Wave 16 debuts tether_control_raider; 'collision' pressure boosts anchor+control share.
  const pressured = planWave({
    seed: 9, arenaId: ARENA_ID, wave: 16, mode: SWARM_RULESET,
    buildSummary: { dominant: 'collision' },
  });
  assert.ok(!pressured.error);
  const debut = pressured.packages.find((pkg) => pkg.debut === true);
  assert.ok(debut, 'debut survives pressure bias');
  assert.equal(debut.enemyId, 'tether_control_raider');
  // The biased plan roster still includes the debuting specialist for reinforcements.
  assert.ok(pressured.swarm.roster.some((e) => e.enemyId === 'tether_control_raider'));
});

test('debut is deterministic: same seed, same plan', () => {
  for (const w of DEBUT_WAVES.slice(0, 4)) {
    assert.deepEqual(swarmPlan(w, 31), swarmPlan(w, 31));
  }
});

// ---------------------------------------------------------------------------
// Runtime proof — the planner's promise is only half of SF-064. survivalWave's
// reinforcement stream shares the roster, and the fresh-silhouette boost would
// field the newcomer mid-room long before the staged arrival without the guard.
// ---------------------------------------------------------------------------

const DT = 1 / 60;

function bootWave(seed = 9) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec, id, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  return { state, bus, emitted, spawned, player };
}

function beginActiveSwarm(h, seed) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed, arenaId: ARENA_ID,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    h.bus.emit('run:transitionRequested', {
      expectedPhase: from, nextPhase: next, reason: 't', tick: 0,
    });
    from = next;
  }
}

/** Kill live cohort bodies the way combat reports it: dead body out of the map, then receipt. */
function killBodies(h, n) {
  const live = h.spawned.filter((e) => e.alive && e.id !== h.player.id);
  for (const e of live.slice(0, n)) {
    e.alive = false;
    h.state.entities.delete(e.id);
    h.bus.emit('entity:killed', { id: e.id, killerId: h.player.id });
  }
}

test('the stream cannot field the newcomer while its debut is owed, and a hold cannot drop it', () => {
  const h = bootWave(9);
  beginActiveSwarm(h, 9);
  const wave = 4; // choir_zealot's unlock wave
  const newcomer = swarmNewcomerFor(wave);
  assert.equal(newcomer.enemyId, 'choir_zealot');
  const plan = planWave({ seed: 9, arenaId: ARENA_ID, wave, mode: SWARM_RULESET });
  assert.ok(plan.swarm && !plan.error);

  // The arena's real census binding: the pressure reservoir only knows a hold is a hold
  // because something alive is still out there.
  bindSwarmPressureContext({ getAlive: () => h.spawned.filter((e) => e.alive).length - 1 });
  try {
    h.state.run.wave = wave;
    h.bus.emit('run:wavePlanned', { wave, plan });
    h.bus.emit('run:waveStarted', { wave });

    // Phase 1 — the stream runs during the debut window. One kill at a time (never a
    // substantial clear, never an empty board) keeps the ordinary top-ups rolling, and
    // every roll is a chance the unfiltered stream would spend on the newcomer. Then a
    // ≥SWARM_CLEAR_KILLS cull opens the reservoir's hold BEFORE the debut's tick — the
    // staged arrival lands inside the hold and must be re-queued, not dropped.
    for (let t = 0; t < SWARM_DEBUT_TICKS; t++) {
      survivalWave.update(DT);
      if (t === 19 || t === 39 || t === 59) killBodies(h, 1);
      if (t === 79) killBodies(h, 4);
    }
    const earlyRefills = h.emitted.filter(
      (e) => e.event === 'run:waveMaterialized' && e.payload.reinforcement === true,
    );
    assert.ok(earlyRefills.length >= 3, 'the stream actually rolled during the debut window');
    assert.ok(
      earlyRefills.every((e) => e.payload.enemyId !== newcomer.enemyId),
      `stream leaked ${newcomer.enemyId} before its staged arrival`,
    );
    assert.ok(
      !h.emitted.some((e) => e.event === 'run:waveMaterialized' && e.payload.enemyId === newcomer.enemyId),
      `the debut fired during the hold — or was never owed (${newcomer.enemyId})`,
    );

    // Phase 2 — the hold is still open with the debut owed. Emptying the board is the
    // emergency exception that calls the debt: the staged body must land now, on the
    // far side of its tick, not have vanished at it.
    killBodies(h, h.spawned.filter((e) => e.alive && e.id !== h.player.id).length);
    let debutMat = null;
    for (let t = 0; t < 120 && !debutMat; t++) {
      survivalWave.update(DT);
      // Only the schedule path counts: an emergency refill may now legally roll the
      // newcomer (the debt is settled), and it must not mask a dropped debut.
      debutMat = h.emitted.find(
        (e) => e.event === 'run:waveMaterialized' && e.payload.enemyId === newcomer.enemyId
          && e.payload.reinforcement !== true,
      ) || null;
    }
    assert.ok(debutMat, 'the pressure hold swallowed the staged debut — it never landed');
    assert.ok(
      debutMat.payload.tick >= SWARM_DEBUT_TICKS,
      'the debut arrived before its staged tick',
    );
    assert.ok(debutMat.payload.admitted >= 1, 'the debut body materialized');
  } finally {
    bindSwarmPressureContext(null);
    resetSwarmPressureState();
  }
});
