// SF-062 — a mass-and-gap round.
// Every sixth wave (boss waves excepted) the room becomes a geometry problem: the opening is all
// light pursuers — ammunition, not threat — while a chord of monolith cover closes one side of
// the room with exactly two navigable gaps, and the wave's heaviest legal body arrives late on
// the wall's bearing. Quota, hull, and concurrency never inflate. The wall rocks are ordinary
// debris — they wear and fracture under impact (SF-067), so a spent hull opens a third path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import {
  swarmArena,
  SWARM_DEBRIS_TAG,
} from '../src/systems/swarmArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { gateBearing } from '../src/systems/waveMaterialization.js';
import {
  SWARM_FODDER_ROLES,
  SWARM_MASS_GAP_CLOSE_TICKS,
  SWARM_MASS_GAP_WALL_DISTANCE,
  SWARM_MASS_GAP_WALL_ROCKS,
  SWARM_RULESET,
  isSwarmBossWave,
  isSwarmMassGapWave,
  pickSwarmArchetype,
  swarmConcurrent,
  swarmQuota,
  swarmRosterFor,
} from '../src/data/swarmMode.js';

const SEED = 31337;
const ARENA = 'helios_core';

function swarmPlan(wave, opts = {}) {
  return planWave({ seed: SEED, arenaId: ARENA, wave, mode: SWARM_RULESET, ...opts });
}

test('mass-gap cadence: every sixth wave, never a boss wave', () => {
  for (let w = 1; w <= 60; w++) {
    const expect = w >= 6 && w % 6 === 0 && !isSwarmBossWave(w);
    assert.equal(isSwarmMassGapWave(w), expect, `wave ${w}`);
  }
});

test('a mass-gap wave opens with light pursuers only — the ammunition arrives first', () => {
  // Wave 24: a mass-gap wave where elite/anchor/control/reach/support are all legal, so a
  // fodder-only opening can only come from the mass-gap filter — not an early-wave roster.
  const plan = swarmPlan(24);
  assert.ok(!plan.error);
  assert.ok(plan.swarm.massGap, 'mass-gap block missing');
  const opening = plan.packages.filter((pkg) => !pkg.champion && !pkg.debut && !pkg.wall);
  assert.ok(opening.length > 0);
  for (const pkg of opening) {
    assert.ok(SWARM_FODDER_ROLES.includes(pkg.role),
      `opening package ${pkg.enemyId}/${pkg.role} is not a light pursuer`);
    assert.ok(pkg.atTick <= 36, 'fodder must open the wave, not trail it');
  }
});

test('the wall heavies arrive late, on the wall bearing, protected like a debut', () => {
  const plan = swarmPlan(12);
  const wall = plan.packages.filter((pkg) => pkg.wall === true);
  assert.equal(wall.length, 1, 'exactly one wall package');
  assert.equal(wall[0].atTick, SWARM_MASS_GAP_CLOSE_TICKS);
  assert.equal(wall[0].gateGroup, plan.swarm.massGap.gate,
    'the heavies pour through the wall gate');
  assert.equal(wall[0].count, 2, 'the wall muscle is a pair');
  // The corridor is its own bearing — never sharing an arrival lane with the opening burst.
  const openingGates = plan.packages
    .filter((pkg) => !pkg.wall)
    .map((pkg) => pkg.gateGroup);
  assert.ok(!openingGates.includes(wall[0].gateGroup),
    'the wall gate must differ from every opening gate');
  // And they materialize beyond the chord, pouring through the gaps toward the player.
  assert.ok(wall[0].distance > SWARM_MASS_GAP_WALL_DISTANCE,
    'wall heavies must spawn on the far side of the wall line');
  // The flag rides the schedule so the materialization clamp cannot drop the lesson.
  const entries = plan.schedule.filter((e) => e.wall === true);
  assert.ok(entries.length > 0, 'wall flag did not reach the schedule');
});

test('wave 6 is the one mass-gap round with no wall muscle — its only legal bruiser is debuting', () => {
  // Mine-Layer Jackal is the only wall-role body legal at wave 6, and it is the wave's staged
  // newcomer — it cannot double as wall muscle, so the first wall is geometry alone.
  const plan = swarmPlan(6);
  assert.ok(!plan.error);
  assert.ok(plan.swarm.massGap, 'wave 6 still gets the wall geometry');
  assert.equal(plan.swarm.massGap.heavyEnemyId, null,
    'no heavy may stand in for the debuting specialist');
  assert.ok(!plan.packages.some((pkg) => pkg.wall === true),
    'no wall package when no heavy is legally pickable');
  assert.ok(plan.packages.some((pkg) => pkg.debut === true), 'the debut still lands');
});

test('quota, concurrency and hull are untouched — the shape changes, not the numbers', () => {
  for (const w of [6, 12, 18, 24]) {
    const plan = swarmPlan(w);
    assert.ok(!plan.error);
    assert.equal(plan.swarm.level, 1);
    assert.equal(plan.swarm.concurrent, swarmConcurrent(w), `wave ${w} concurrency must stay authored`);
    assert.equal(plan.swarm.killTarget, swarmQuota(w), `wave ${w} quota must stay authored`);
  }
});

test('the wall always leaves exactly two navigable gap slots', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const plan = planWave({ seed, arenaId: ARENA, wave: 12, mode: SWARM_RULESET });
    const gaps = plan.swarm.massGap.gapSlots;
    assert.equal(gaps.length, 2);
    const [a, b] = gaps;
    assert.ok(a >= 1 && a <= 3 && b >= 5 && b <= 7, `gaps ${a},${b} sit inside the chord`);
    assert.ok(Math.abs(b - a) >= 2, 'the two paths are separated, not adjacent cracks');
  }
});

test('a non-mass-gap wave carries no wall, and a boss wave never does', () => {
  for (const w of [5, 7, 11, 13, 20, 30]) {
    const plan = swarmPlan(w);
    assert.ok(!plan.error);
    assert.equal(plan.swarm.massGap, undefined, `wave ${w} should not mass-gap`);
    assert.ok(!plan.packages.some((pkg) => pkg.wall === true));
  }
});

test('heavies_only owns the room outright — no wall, no fodder bias', () => {
  const plan = swarmPlan(12, { mutators: ['heavies_only'], buildSummary: { dominant: 'collision' } });
  assert.ok(!plan.error);
  assert.equal(plan.swarm.massGap, undefined);
  assert.ok(!plan.packages.some((pkg) => pkg.wall === true));
});

test('the mass-gap stream stays ammunition-rich without dropping a role', () => {
  const plan = swarmPlan(12);
  const stream = plan.swarm.roster;
  const legal = swarmRosterFor(12);
  assert.equal(stream.length, legal.length, 'every unlocked role keeps its seat');
  for (const entry of stream) {
    const base = legal.find((e) => e.enemyId === entry.enemyId);
    if (SWARM_FODDER_ROLES.includes(entry.role)) {
      assert.ok(entry.weight > base.weight, `${entry.enemyId} fodder share should bend up`);
    } else {
      assert.equal(entry.weight, base.weight, `${entry.enemyId} share should be untouched`);
    }
  }
  // And the biased stream actually picks fodder more often than the unbent roster would.
  let fodder = 0;
  for (let i = 0; i < 400; i++) {
    const pick = pickSwarmArchetype(12, i / 400, stream);
    if (SWARM_FODDER_ROLES.includes(pick.role)) fodder++;
  }
  let plainFodder = 0;
  for (let i = 0; i < 400; i++) {
    const pick = pickSwarmArchetype(12, i / 400, legal);
    if (SWARM_FODDER_ROLES.includes(pick.role)) plainFodder++;
  }
  assert.ok(fodder > plainFodder, `fodder share ${fodder} <= ${plainFodder}`);
});

test('the wall plan is deterministic and survives a same-seed replan', () => {
  const a = swarmPlan(18);
  const b = swarmPlan(18);
  assert.deepEqual(a.swarm.massGap, b.swarm.massGap);
  assert.deepEqual(a.packages, b.packages);
});

// --- runtime side: the arena installs the wall as real collision geometry ---

function boot(wave = 12) {
  const state = createGameState(SEED);
  const bus = createBus();
  const events = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => { events.push({ name, payload }); return origEmit(name, payload); };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  return { state, bus, helpers, player, events };
}

test('the arena installs the wall as a gapped chord of breakable monoliths', () => {
  const h = boot();
  const plan = swarmPlan(12);
  h.state.run.wave = 12;
  h.bus.emit('run:wavePlanned', { wave: 12, plan });

  const wallEvent = h.events.find((e) => e.name === 'swarmArena:massGapWall');
  assert.ok(wallEvent, 'wall install event missing');
  const rocks = h.state.entityList.filter(
    (e) => e.alive !== false && e.data && e.data[SWARM_DEBRIS_TAG]
      && wallEvent.payload.ids.includes(e.id),
  );
  assert.equal(rocks.length, SWARM_MASS_GAP_WALL_ROCKS - 2, 'the two gap slots stay empty');

  // The chord stands on the wall bearing from the player anchor.
  const bearing = gateBearing(plan.swarm.massGap.gate);
  const cx = h.player.pos.x + bearing.x * plan.swarm.massGap.distance;
  const cz = h.player.pos.z + bearing.z * plan.swarm.massGap.distance;
  for (const rock of rocks) {
    const d = Math.hypot(rock.pos.x - cx, rock.pos.z - cz);
    assert.ok(d < SWARM_MASS_GAP_WALL_ROCKS * 30, `wall rock ${d.toFixed(0)} off the chord line`);
    // Every wall rock is cover the SF-067 wear path already owns.
    assert.ok(rock.hull > 0 && rock.mass > 1000 && rock.collides === true);
  }

  // Re-planning the same wave must not double the wall.
  h.bus.emit('run:wavePlanned', { wave: 12, plan });
  const second = h.events.filter((e) => e.name === 'swarmArena:massGapWall');
  assert.equal(second.length, 1, 'wall re-installs must be idempotent per wave');

  // Wall rocks wear and fracture like any debris — a spent hull opens another path.
  // Wear only counts while the fight is live — park the wave in its active phase.
  h.state.run.phase = 'active';
  const rock = rocks[0];
  rock.hull = 10;
  h.bus.emit('physics:impact', {
    aId: h.player.id, bId: rock.id, dp: 99999, preSolveClosingSpeed: 80, tick: 60,
  });
  assert.equal(rock.alive, false, 'a wall rock must break under wear like any cover');
});
