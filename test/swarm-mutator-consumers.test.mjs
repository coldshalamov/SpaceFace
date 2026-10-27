// Swarm mutator consumer audit — every mutator that can land on run.arenaMutators (the weekly
// slot, a stacked Pact, or a Threat wager) must produce its authored effect through the real
// consumer path, not only a compileChallenge flag:
//   gravity_slalom      → swarmArena installs three wells into the fields system
//   heavies_only        → planSwarmWave's packages, schedule and roster carry only heavies
//   reef                → _topUp lays the tight crucible_reef ring, not the ladder field
//   wreck_ballast       → _topUp fields dead hulls, not virgin rock
//   no_reroll           → the paid re-roll is refused at the draft gate the swarm run reaches
//   draftless           → the armory never deals — the queued contract folds into the run
//   shutter_alternating → the swarm plan carries the mutator's room law, not the wave cycle's
//   physics_only        → the dealt shelf holds physics verbs only, dealt and re-dealt alike
//   one_hull            → the cradle shelves no other hull mid-run
// Deterministic: seeded state, manual phase transitions, no wall clock.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SURVIVAL_PHYSICS_VERBS } from '../src/data/survivalMutators.js';
import { migrateHangar } from '../src/data/swarmHangar.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { survivalDraft, SWARM_HULL_OFFER_KIND } from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { resetCrucibleMetaForTests } from '../src/systems/survivalRecords.js';
import {
  clearQueuedChallenge,
  queueSurvivalChallenge,
} from '../src/systems/survivalMutators.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  swarmArena,
  planGravitySlalomWells,
  REEF_DEBRIS_INNER,
  REEF_DEBRIS_OUTER,
  REEF_DEBRIS_TARGET,
  SWARM_DEBRIS_TAG,
} from '../src/systems/swarmArena.js';

const SEED = 90210;
const ARENA = 'helios_core';
const SWARM = 'swarm';
const PHYSICS_VERBS = new Set(SURVIVAL_PHYSICS_VERBS);
const HEAVY_IDS = new Set(['bruiser_brawler', 'corsair_raider', 'field_anchor_controller']);

function busWithLog() {
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
  return { bus, emitted };
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', { expectedPhase, nextPhase, reason: 't', tick: 0 });
}

// ── Armory harness: the draft gate the swarm run actually reaches ──────────────

function draftBoot() {
  resetCrucibleMetaForTests();
  const state = createGameState(SEED);
  const { bus, emitted } = busWithLog();
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] || null };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  economy.newGame();
  ships.newGame();
  state.player.researchedNodes = TECH_NODES.map((node) => node.id);
  ships.buyShip({ defId: 'ship_hornet', grant: true, setActive: true });
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalDraft.init(ctx);
  return { state, bus, emitted };
}

/** The pact/weekly path itself: queue the contract, then launch — the run folds it in. */
function beginQueued(h, mutators) {
  clearQueuedChallenge();
  queueSurvivalChallenge({ seed: SEED, ruleset: SWARM, mutators });
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM, seed: SEED, arenaId: ARENA });
  return h.state.run;
}

/** A between-rounds armory on `wave` — the swarm's real upgrade stop. */
function waveArmory(h, mutators, wave) {
  beginQueued(h, mutators);
  transition(h, 'loadout', 'arena_intro');
  transition(h, 'arena_intro', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  h.state.run.wave = wave;
  h.bus.emit('run:awardRequested', { credits: 4000, reason: 'round_loot' });
  transition(h, 'cleanup', 'draft');
  assert.equal(h.state.run.phase, 'draft');
}

// ── Room harness: spawn stub + fields mock, the same shape rc-481 uses ────────

function arenaBoot() {
  const state = createGameState(SEED);
  const { bus, emitted } = busWithLog();
  const budget = makeBudgetApi(state);
  const spawned = [];
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
      spawned.push(entity);
      return entity;
    },
  };
  const fields = {
    registered: [],
    registerEnvironmental(spec) {
      this.registered.push(spec);
      return spec.id;
    },
    unregisterExternal(id) {
      const i = this.registered.findIndex((spec) => spec.id === id);
      if (i >= 0) this.registered.splice(i, 1);
    },
    updateExternal() {},
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const ctx = { state, bus, helpers, registry: { get: (name) => (name === 'fields' ? fields : null) } };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  return { state, bus, emitted, spawned, fields, player };
}

function swarmRun(mutators, wave = 2) {
  return { kind: 'survival', ruleset: SWARM, seed: SEED, arenaId: ARENA, wave, arenaMutators: mutators };
}

function debris(h) {
  return h.spawned.filter((e) => e.data && e.data[SWARM_DEBRIS_TAG] === true);
}

// ── The room mutators ────────────────────────────────────────────────────────

test('gravity_slalom: the three wells install into the fields system, and release without it', () => {
  const wells = planGravitySlalomWells({ anchor: { x: 400, z: 0 } });
  assert.equal(wells.length, 3, 'the authored count is three wells');
  assert.ok(wells.every((w) => w.kind === 'well' && w.strength !== 0 && w.radius > 0));
  assert.equal(new Set(wells.map((w) => w.id)).size, 3, 'three distinct well bodies');

  const h = arenaBoot();
  swarmArena._installSlalomWells(swarmRun(['gravity_slalom']));
  assert.equal(h.fields.registered.length, 3, 'three wells registered with the fields system');
  const slalom = named(h, 'swarmArena:slalom');
  assert.equal(slalom.length, 1);
  assert.equal(slalom[0].payload.wellCount, 3);

  // The same wave-plan hook on a run without the mutator tears the wells down, not adds more.
  h.emitted.length = 0;
  swarmArena._installSlalomWells(swarmRun([]));
  assert.equal(h.fields.registered.length, 0, 'no mutator — no wells');
  assert.equal(named(h, 'swarmArena:slalom').length, 0);
});

test('heavies_only: every wave the planner fields is heavy — opener, debut wave, act wave', () => {
  for (const wave of [1, 3, 6, 25]) {
    const plan = planWave({ seed: SEED, wave, arenaId: ARENA, ruleset: SWARM, mutators: ['heavies_only'] });
    assert.notEqual(plan.ok, false, `wave ${wave} planned`);
    assert.ok(
      plan.swarm.roster.every((entry) => HEAVY_IDS.has(entry.enemyId)),
      `wave ${wave} roster is the heavy bench`,
    );
    assert.ok(
      plan.swarm.roster.every((entry) => entry.role === 'anchor' || entry.role === 'elite'),
      `wave ${wave} roster holds no fodder role`,
    );
    for (const pkg of plan.packages) {
      assert.ok(HEAVY_IDS.has(pkg.enemyId), `wave ${wave} package ${pkg.enemyId} is a heavy`);
    }
    for (const entry of plan.schedule) {
      assert.ok(HEAVY_IDS.has(entry.enemyId), `wave ${wave} schedule ${entry.enemyId} is a heavy`);
    }
  }
  // The control wave still fields the light bodies the mutator struck.
  const plain = planWave({ seed: SEED, wave: 3, arenaId: ARENA, ruleset: SWARM });
  assert.ok(
    [...plain.packages.map((p) => p.enemyId), ...plain.swarm.roster.map((r) => r.enemyId)]
      .some((id) => !HEAVY_IDS.has(id)),
    'without the mutator the wave fields light bodies',
  );
});

test('reef: the field tops up as the tight crucible_reef ring, not the wave-2 pebble field', () => {
  const h = arenaBoot();
  const reef = swarmRun(['reef'], 2);
  h.state.run = reef;
  swarmArena._topUp(reef, 2);
  const rocks = debris(h);
  const emit = named(h, 'swarmArena:debris');
  assert.equal(emit.length, 1);
  assert.equal(emit[0].payload.layoutId, 'crucible_reef');
  assert.equal(emit[0].payload.added, rocks.length);
  assert.ok(rocks.length > 0, 'the reef room fields debris');
  for (const rock of rocks) {
    assert.equal(rock.data.reefLayoutId, 'crucible_reef', 'every rock wears the reef stamp');
    const dist = Math.hypot(rock.pos.x - h.player.pos.x, rock.pos.z - h.player.pos.z);
    assert.ok(
      dist >= REEF_DEBRIS_INNER - 1e-6 && dist <= REEF_DEBRIS_OUTER + 1e-6,
      `reef rock sits inside the ${REEF_DEBRIS_INNER}-${REEF_DEBRIS_OUTER} ring, got ${dist}`,
    );
  }
  // The ring's authored ask is REEF_DEBRIS_TARGET bodies packed against the fight — placement
  // honestly yields fewer when the narrow annulus saturates; the law pins the band, not a
  // fabricated count.
  assert.ok(rocks.length <= REEF_DEBRIS_TARGET, `the ring never exceeds its target, got ${rocks.length}`);

  const h2 = arenaBoot();
  const plain = swarmRun([], 2);
  h2.state.run = plain;
  swarmArena._topUp(plain, 2);
  const plainEmit = named(h2, 'swarmArena:debris');
  assert.equal(plainEmit.length, 1);
  assert.equal(plainEmit[0].payload.layoutId, 'pebble_field', 'the ladder owns a plain wave 2');
  const plainRocks = debris(h2);
  assert.ok(plainRocks.length > 0, 'the control field still tops up');
  assert.ok(
    plainRocks.every((e) => e.data.reefLayoutId === undefined),
    'a plain field carries no reef stamp',
  );
  assert.ok(
    Math.max(...plainRocks.map((e) => Math.hypot(e.pos.x - h2.player.pos.x, e.pos.z - h2.player.pos.z)))
      > REEF_DEBRIS_OUTER,
    'the ladder field reaches past the reef ring — tightness, not just count, is the mutator',
  );
});

test('wreck_ballast: the debris field materializes dead hulls, not rock', () => {
  const h = arenaBoot();
  const ballast = swarmRun(['wreck_ballast'], 2);
  h.state.run = ballast;
  swarmArena._topUp(ballast, 2);
  const rocks = debris(h);
  assert.ok(rocks.length > 0, 'the ballast room still fields debris');
  assert.ok(rocks.every((e) => e.type === 'wreck'), 'every spawned body is a dead hull');
});

// ── The armory mutators — through the queued challenge the door actually queues ──

test('no_reroll: the queued pact folds into arenaMutators and the re-roll bench is refused', () => {
  const h = draftBoot();
  waveArmory(h, ['no_reroll'], 1);
  assert.deepEqual(h.state.run.arenaMutators, ['no_reroll'], 'the queued pact reached the run');
  assert.ok(named(h, 'run:draftOffered')[0].payload.offers.length > 0, 'the shelf still deals');

  h.state.run.telemetry.hangar = migrateHangar({ ranks: { rerolls: 1 } });
  const info = survivalDraft.rerollState();
  assert.equal(info.available, false);
  assert.equal(info.reason, 'no_reroll');
  assert.equal(survivalDraft.requestReroll(), false);
  assert.equal(named(h, 'run:draftRerollRejected')[0].payload.reason, 'no_reroll');
  assert.equal(
    named(h, 'run:spendRequested').length, 0,
    'the refusal lands before the wallet is ever asked',
  );
});

test('draftless: the queued pact folds in and the armory resolves empty', () => {
  const h = draftBoot();
  beginQueued(h, ['draftless']);
  assert.deepEqual(h.state.run.arenaMutators, ['draftless']);
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
  assert.equal(named(h, 'run:draftResolved')[0].payload.reason, 'draftless');
  assert.equal(named(h, 'run:draftOffered').length, 0, 'nothing was ever dealt');
  assert.deepEqual(survivalDraft.currentOffers(), []);
});

// ── The three mutators this pass wired ────────────────────────────────────────

test('shutter_alternating: the pact room law reaches the swarm plan — ordinary and act waves', () => {
  for (const wave of [1, 2, 25]) {
    const plan = planWave({
      seed: SEED, wave, arenaId: ARENA, ruleset: SWARM, mutators: ['shutter_alternating'],
    });
    assert.notEqual(plan.ok, false, `wave ${wave} planned`);
    assert.equal(plan.arenaPhase, 'shutter_alternating', `wave ${wave} runs the mutator's law`);
  }
  const plain1 = planWave({ seed: SEED, wave: 1, arenaId: ARENA, ruleset: SWARM });
  assert.equal(plain1.arenaPhase, 'loose_plate', 'the cycle owns a plain wave 1');
  const plain25 = planWave({ seed: SEED, wave: 25, arenaId: ARENA, ruleset: SWARM });
  assert.notEqual(
    plain25.arenaPhase, 'shutter_alternating',
    'the authored act owns a plain wave 25 — the mutator, not the cycle, is what changed it',
  );
});

test('physics_only: the dealt shelf holds physics verbs only — dealt and re-dealt alike', () => {
  const h = draftBoot();
  waveArmory(h, ['physics_only'], 1);
  assert.deepEqual(h.state.run.arenaMutators, ['physics_only']);
  const dealt = named(h, 'run:draftOffered');
  assert.equal(dealt.length, 1);
  assert.ok(dealt[0].payload.offers.length > 0, 'the hull still fits physics cards');
  assert.ok(
    dealt[0].payload.offers.every((offer) => PHYSICS_VERBS.has(offer.verb)),
    'every dealt row is a physics verb',
  );
  const shelf = survivalDraft.currentOffers();
  assert.ok(shelf.length > 0, 'the armory still shows stock');
  assert.ok(
    shelf.every((row) => PHYSICS_VERBS.has(row.verb)),
    'the live shelf — hull, service and gun rows included — holds only physics verbs',
  );
  // A re-deal rides the same law: whatever bench pays, the shelf never re-stocks a gun.
  h.state.run.telemetry.hangar = migrateHangar({ ranks: { rerolls: 1 } });
  survivalDraft.requestReroll();
  assert.ok(
    survivalDraft.currentOffers().every((row) => PHYSICS_VERBS.has(row.verb)),
    'the re-dealt shelf is still physics only',
  );
  assert.ok(
    named(h, 'run:draftOffered').every(
      (entry) => entry.payload.offers.every((offer) => PHYSICS_VERBS.has(offer.verb)),
    ),
    'every shelf the run ever emitted honoured the contract',
  );
});

test('one_hull: the cradle shelves no other hull mid-run — the launch hull is the hull', () => {
  const h = draftBoot();
  waveArmory(h, ['one_hull'], 1);
  assert.deepEqual(h.state.run.arenaMutators, ['one_hull']);
  const shelf = survivalDraft.currentOffers();
  assert.ok(shelf.length > 0, 'the armory still deals fittings');
  assert.ok(
    shelf.every((row) => row.kind !== SWARM_HULL_OFFER_KIND),
    'no hull row is on the shelf to swap into',
  );

  // The control armory still sells the cradle — the mutator, not the shelf, is what closed it.
  const h2 = draftBoot();
  waveArmory(h2, [], 1);
  assert.ok(
    survivalDraft.currentOffers().some((row) => row.kind === SWARM_HULL_OFFER_KIND),
    'a plain armory lists the ship cradle',
  );
});
