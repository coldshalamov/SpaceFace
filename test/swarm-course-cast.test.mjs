// C01-04 — every round fields the cast its name promises.
//
// The packet's check, run against the REAL materialization path: a live swarm room per
// course round (same harness as swarm-round-shape) collecting `run:waveMaterialized`
// payloads. Two honesty layers:
//   * plan layer — the schedule's non-champion ids and the stream roster are exactly the
//     cast row, and nothing else. The stream roster is the round's whole mix, so this is
//     the strong guarantee that no foreign archetype ever fields.
//   * live layer — every enemyId the wave owner actually materializes (scheduled groups
//     AND `reinforcement: true` stream batches, drawn by scripted kills) belongs to the
//     cast; the champion's own ids ride alongside only on boss rounds.
//
// Plus the rows' own invariants: the table validates, opening pressure equals the wave's
// ordinary burst (the difficulty curve did not move), boss cadence is intact, the named
// formations resolve through the gate seam, and the open ladder past round 30 is the
// same generated wave it always was.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  SWARM_COURSE_CAST,
  swarmCastFor,
  swarmCastIdsFor,
  swarmCourseCastIssues,
} from '../src/data/swarmCourseCast.js';
import { swarmCharacterFor } from '../src/data/swarmCharacter.js';
import {
  bossPackagesFor,
  isSwarmBossWave,
  resetSwarmPressureState,
  swarmBossFor,
  swarmPressureAt,
  swarmRosterFor,
} from '../src/data/swarmMode.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 7;

// One wave's live room: a real swarm run state, the real wave owner, real spawn
// plumbing — the same fixture swarm-round-shape drives, so both suites read alike.
function room(seed = SEED, wave = 1) {
  resetSwarmPressureState();
  const state = createGameState(seed);
  state.run = Object.assign(
    createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    { wave, phase: 'active' },
  );
  state.mode = 'flight';
  const bus = createBus();
  const events = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); emit(event, payload); };
  const player = {
    id: state.nextEntityId++, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 400, data: {},
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const budget = makeBudgetApi(state);
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p.id, p.entity));
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const e = {
        ...spec, id: state.nextEntityId++, alive: true,
        pos: { ...spec.pos }, vel: { ...(spec.vel || { x: 0, z: 0 }) },
      };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList = state.entityList.filter((e) => e !== entity);
      bus.emit('entity:destroyed', { id, entity });
    },
  };
  const sys = Object.create(survivalWave);
  sys.init({ state, bus, helpers });
  return { state, bus, helpers, events, budget, player, sys };
}

function beginWave(h, wave = h.state.run.wave, seed = SEED) {
  const plan = planWave({ seed, arenaId: ARENA, wave, ruleset: 'swarm' });
  assert.ok(plan && plan.ok !== false, `wave ${wave} plans clean: ${JSON.stringify(plan && plan.issues)}`);
  h.bus.emit('run:wavePlanned', { wave, plan });
  h.bus.emit('run:waveStarted', { wave });
  return plan;
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    h.sys.update();
  }
}

function liveHostiles(h) {
  return h.state.entityList.filter((e) => e
    && e.alive !== false && e.data && e.data.runCohort === 'survival'
    && e.data.swarmGateFlare !== true && e.type !== 'beacon');
}

// The kill path the real emitters use, minus combat: the receipt releases the
// spawn-budget slot and feeds the stream's read of the room.
function kill(h, entity) {
  entity.alive = false;
  h.bus.emit('entity:killed', { id: entity.id, tick: h.state.tick });
  h.helpers.removeEntity(entity.id);
}

function materialized(h) {
  return h.events.filter((e) => e.event === 'run:waveMaterialized'
    && e.payload && e.payload.admitted > 0 && typeof e.payload.enemyId === 'string');
}

/** Every enemy id the champion's own packages may field on this wave, or []. */
function bossIdsFor(wave) {
  const boss = swarmBossFor(wave);
  if (!boss) return [];
  return [...new Set(bossPackagesFor(boss).map((pkg) => pkg.enemyId))];
}

test('the cast table is honest: 30 frozen rows, every id in the character sheet', () => {
  assert.equal(SWARM_COURSE_CAST.length, 30, 'one cast row per course round');
  assert.deepEqual(swarmCourseCastIssues(), [], 'the table passes its own authoring check');
  for (const cast of SWARM_COURSE_CAST) {
    assert.ok(Object.isFrozen(cast) && Object.isFrozen(cast.stream) && Object.isFrozen(cast.packages));
    for (const entry of cast.stream) {
      assert.ok(swarmCharacterFor(entry.enemyId), `round ${cast.round} streams sheet enemy '${entry.enemyId}'`);
    }
    for (const pkg of cast.packages) {
      assert.ok(swarmCharacterFor(pkg.enemyId), `round ${cast.round} fields sheet enemy '${pkg.enemyId}'`);
    }
  }
});

test('opening pressure equals the ordinary burst — the difficulty curve did not move', () => {
  for (let w = 1; w <= 30; w++) {
    const cast = swarmCastFor(w);
    const authored = cast.packages.reduce((sum, pkg) => sum + pkg.count, 0);
    const opening = swarmPressureAt(w, 0);
    if (isSwarmBossWave(w)) {
      const bossBodies = bossPackagesFor(swarmBossFor(w)).reduce((sum, pkg) => sum + pkg.count, 0);
      assert.equal(authored, Math.max(2, opening - bossBodies),
        `round ${w} chaff ${authored} — the burst a generated boss wave would field is ${Math.max(2, opening - bossBodies)}`);
    } else {
      assert.equal(authored, opening,
        `round ${w} opening ${authored} !== the wave's own pressure ${opening}`);
    }
  }
});

test('every round 1-30 plans exactly its cast — nothing else fields', () => {
  for (let w = 1; w <= 30; w++) {
    const cast = swarmCastFor(w);
    assert.ok(cast, `round ${w} has a cast row`);
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: w, ruleset: 'swarm' });
    assert.ok(plan && plan.ok !== false, `wave ${w} plans clean`);
    const allowed = new Set([...swarmCastIdsFor(w), ...bossIdsFor(w)]);
    // The schedule's every body is a cast member or the champion's own.
    for (const entry of plan.schedule) {
      assert.ok(allowed.has(entry.enemyId),
        `round ${w} schedules foreign body '${entry.enemyId}' — the cast promised ${[...allowed].join(', ')}`);
      if (entry.champion !== true) {
        assert.ok(swarmCharacterFor(entry.enemyId),
          `round ${w} schedules '${entry.enemyId}' outside the character sheet`);
      }
    }
    // The stream draws only the row's mix — same ids, weights intact.
    const streamIds = cast.stream.map((entry) => entry.enemyId);
    const rosterIds = (plan.swarm.roster || []).map((entry) => entry.enemyId);
    assert.deepEqual([...rosterIds].sort(), [...streamIds].sort(),
      `round ${w} stream is the cast's mix, not the roster clock's`);
    // Every cast member actually fields somewhere: the opening schedule or the stream.
    const fielded = new Set([...rosterIds, ...plan.schedule.map((entry) => entry.enemyId)]);
    for (const id of swarmCastIdsFor(w)) {
      assert.ok(fielded.has(id), `round ${w} cast member '${id}' never fields`);
    }
    // The newcomer's name is honest: only something the round actually introduces.
    const newcomer = plan.swarm.newcomer;
    if (newcomer) {
      assert.ok(allowed.has(newcomer.enemyId),
        `round ${w} announces '${newcomer.enemyId}' as new — it is not in the cast`);
    }
  }
});

test('boss rounds keep their champions — cadence, flag and bodies intact', () => {
  for (const w of [5, 10, 15, 20, 25, 30]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: w, ruleset: 'swarm' });
    assert.ok(plan && plan.ok !== false, `wave ${w} plans clean`);
    const boss = swarmBossFor(w);
    assert.ok(boss, `wave ${w} still deals a champion`);
    assert.equal(plan.swarm.boss, true);
    assert.equal(plan.swarm.bossId, boss.id);
    const champions = plan.schedule.filter((entry) => entry.champion === true);
    const authored = bossPackagesFor(boss).reduce((sum, pkg) => sum + pkg.count, 0);
    const fielded = champions.reduce((sum, entry) => sum + entry.count, 0);
    assert.equal(fielded, authored, `wave ${w} fields its champion's own ${authored} bodies`);
    assert.deepEqual(
      [...new Set(champions.map((entry) => entry.enemyId))].sort(),
      [...bossIdsFor(w)].sort(),
      `wave ${w} champion composition is the boss row's own`,
    );
  }
});

test('the materialization path fields exactly the cast — scheduled and stream alike', () => {
  for (let w = 1; w <= 30; w++) {
    const h = room(SEED + w, w);
    const plan = beginWave(h, w, SEED + w);
    const allowed = new Set([...swarmCastIdsFor(w), ...bossIdsFor(w)]);
    const streamIds = new Set((plan.swarm.roster || []).map((entry) => entry.enemyId));
    // Scripted competence: keep the room under strength so the stream keeps spending —
    // ~70 s covers the whole authored schedule plus dozens of stream draws.
    for (let t = 0; t < 60 * 70; t++) {
      tick(h);
      if (t % 45 === 20) {
        const live = liveHostiles(h);
        if (live.length > 4) kill(h, live[live.length - 1]);
      }
    }
    const events = materialized(h);
    assert.ok(events.length >= 3, `round ${w} materialized a real wave (${events.length} receipts)`);
    const seenScheduled = new Set();
    const seenStream = new Set();
    for (const m of events) {
      const { enemyId, gateGroup, reinforcement } = m.payload;
      assert.ok(allowed.has(enemyId),
        `round ${w} materialized foreign body '${enemyId}' — the cast promised ${[...allowed].join(', ')}`);
      assert.ok(typeof gateGroup === 'string', `round ${w} receipt for '${enemyId}' carries a gate`);
      if (reinforcement === true) {
        assert.ok(streamIds.has(enemyId),
          `round ${w} stream body '${enemyId}' came from outside its own roster`);
        seenStream.add(enemyId);
      } else {
        seenScheduled.add(enemyId);
      }
    }
    // Every scheduled cast id actually lands through the real path.
    const scheduledIds = new Set(plan.schedule.map((entry) => entry.enemyId));
    for (const id of scheduledIds) {
      assert.ok(seenScheduled.has(id),
        `round ${w} scheduled '${id}' but it never materialized`);
    }
    // The stream proves it is alive on every round: at least one reinforcement batch.
    assert.ok(seenStream.size >= 1, `round ${w} stream never fired`);
    // The stream's draws stay inside the cast mix for the whole round.
    for (const id of seenStream) {
      assert.ok(allowed.has(id), `round ${w} stream fielded '${id}' outside the cast`);
    }
  }
});

test('the named formations resolve through the gate seam', () => {
  const gatesFor = (wave, enemyId) => {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: 'swarm' });
    return plan.packages.filter((pkg) => pkg.enemyId === enemyId).map((pkg) => pkg.gateGroup);
  };
  // Round 1 — ten Wasps, one gate.
  {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: 'swarm' });
    const wasps = plan.packages.filter((pkg) => pkg.enemyId === 'wasp_swarmer');
    assert.equal(wasps.reduce((sum, pkg) => sum + pkg.count, 0), 10, 'round 1 fields ten wasps');
    assert.equal(new Set(wasps.map((pkg) => pkg.gateGroup)).size, 1, 'round 1 wasps come through one gate');
  }
  // Round 2 — Wasps from two gates.
  assert.deepEqual(gatesFor(2, 'wasp_swarmer').sort(), ['front', 'rear'], 'round 2 fields wasps on two gates');
  // Round 7 — Lancers at the edges (the literal side bearings), Wasps in the middle.
  assert.deepEqual(gatesFor(7, 'lancer_sniper').sort(), ['diagonal_a', 'diagonal_b'],
    'round 7 lancers hold the edge bearings');
  assert.deepEqual(gatesFor(7, 'wasp_swarmer').sort(), ['front', 'rear'],
    'round 7 wasps hold the middle bearings');
  // Round 11 — a Warden shielding gunners: it rides a Lancer group's own gate.
  {
    const lancerGates = new Set(gatesFor(11, 'lancer_sniper'));
    const warden = gatesFor(11, 'warden_escort');
    assert.equal(warden.length, 1, 'round 11 fields one warden');
    assert.ok(lancerGates.has(warden[0]), 'round 11 warden arrives inside the gunner line it wards');
  }
  // Round 21 — heavies shoulder to shoulder: the wall crosses the north bearings as one front.
  {
    const heavies = ['bruiser_brawler', 'patrol_lawman', 'field_anchor_controller']
      .flatMap((id) => gatesFor(21, id));
    assert.deepEqual([...heavies].sort(), ['front', 'ne', 'nw'], 'round 21 heavies stand shoulder to shoulder');
  }
  // Round 23 — Zealots in rings: one arrival on every bearing at once.
  {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 23, ruleset: 'swarm' });
    const zealots = plan.packages.filter((pkg) => pkg.enemyId === 'choir_zealot');
    assert.equal(new Set(zealots.map((pkg) => pkg.gateGroup)).size, 8, 'round 23 rings every gate');
    assert.ok(zealots.every((pkg) => pkg.atTick === 0), 'round 23 rings in on one tick');
  }
  // Round 26 — two Wardens covering each other: the pair rides one gate as one event.
  {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 26, ruleset: 'swarm' });
    const wardens = plan.packages.filter((pkg) => pkg.enemyId === 'warden_escort');
    assert.equal(wardens.length, 1, 'round 26 fields its two wardens as one arrival');
    assert.equal(wardens[0].count, 2, 'two wardens, one gate — each dome is the other\'s ward');
    const lancerGates = new Set(gatesFor(26, 'lancer_sniper'));
    assert.ok(lancerGates.has(wardens[0].gateGroup), 'round 26 wardens cover the gunner line');
  }
  // Round 29 — the gates all open together: every door on one tick.
  {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 29, ruleset: 'swarm' });
    assert.equal(new Set(plan.packages.map((pkg) => pkg.gateGroup)).size, 8, 'round 29 opens every gate');
    assert.ok(plan.packages.every((pkg) => pkg.atTick === 0), 'round 29 opens them together');
  }
});

test('the open ladder past the course is the generated wave it always was', () => {
  for (const w of [31, 33, 35, 40]) {
    assert.equal(swarmCastFor(w), null, `wave ${w} carries no cast row`);
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: w, ruleset: 'swarm' });
    assert.ok(plan && plan.ok !== false, `wave ${w} plans clean`);
    const generated = new Set(swarmRosterFor(w).map((entry) => entry.enemyId));
    const roster = new Set((plan.swarm.roster || []).map((entry) => entry.enemyId));
    assert.deepEqual([...roster].sort(), [...generated].sort(),
      `wave ${w} streams the generated roster — the endless mix is untouched`);
  }
});

test('the breaker-yard act still runs past the course — only its course slots yielded', () => {
  for (const w of [32, 33, 34]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: w, ruleset: 'swarm' });
    assert.ok(plan && plan.ok !== false, `wave ${w} plans clean`);
    assert.ok(plan.swarm.act && typeof plan.swarm.act.question === 'string',
      `wave ${w} keeps its authored act — the cast ends at 30`);
  }
});
