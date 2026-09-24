import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import {
  SWARM_BOSS_ROTATION,
  SWARM_ROSTER,
} from '../src/data/swarmMode.js';
import { survivalArena } from '../src/systems/survivalArena.js';

// PQ-210.00: a wave arrival must never pay an authored-hull pipeline compile in flight. The
// render side can only warm what the sim side names, so the arena publishes one REAL
// makeEnemySpawnSpec exemplar per hull the ruleset can field — the full swarm roster plus boss
// packages, not just the wave that was planned — and the renderer admits them behind the shell.
//
// The publisher is NOT subscribed to the bus on the live route (measured regression; see
// src/systems/survivalArena.js init() and design/program/roadmap/receipts/PQ-210.00-REPORT.md).
// These tests therefore drive `_emitRosterPrewarm` directly: the contract under test is the
// payload the renderer consumes and the per-run warm ledger, which is exactly what has to stay
// correct while the wire is out.
function boot(t, { ruleset = 'swarm', wave = 1 } = {}) {
  const run = createRunState({ kind: 'survival', ruleset, seed: 4242 });
  Object.assign(run, { arenaId: 'helios', phase: 'active', wave });
  const state = { run, tick: 120, simTime: 2, playerId: 1, entities: new Map() };
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on,
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const system = Object.create(survivalArena);
  system.init({ state, bus });
  t.after(() => system.destroy());
  // What the missing `run:wavePlanned` emit would do.
  const planWave = (w, over = {}) => system._emitRosterPrewarm(
    run, { arenaPhase: 'idle', schedule: [], ...over }, { wave: w },
  );
  // What the missing `run:started` subscription would do.
  const startRun = () => {
    system._rosterPrewarmEmitted = new Set();
    system._emitRosterPrewarm(run, null, null);
  };
  return {
    system, state, bus, emitted, planWave, startRun,
    prewarms: () => emitted.filter(({ event }) => event === 'survivalArena:rosterPrewarm')
      .map(({ payload }) => payload),
  };
}

function expectedSwarmEnemyIds() {
  const ids = new Set(SWARM_ROSTER.map((entry) => entry.enemyId));
  for (const boss of SWARM_BOSS_ROTATION) {
    for (const pkg of boss.packages || []) ids.add(pkg.enemyId);
  }
  return [...ids].sort();
}

test('the first planned swarm wave prewarms every hull the ruleset can field', (t) => {
  const h = boot(t);
  h.planWave(1);

  const prewarms = h.prewarms();
  assert.equal(prewarms.length, 1, 'one roster prewarm per wave receipt');
  const payload = prewarms[0];
  assert.equal(payload.wave, 1);

  const expected = expectedSwarmEnemyIds();
  assert.deepEqual([...payload.enemyIds].sort(), expected,
    'the launch roster covers every roster archetype and every boss package, not just wave 1');
  assert.equal(payload.specs.length, expected.length);

  const byEnemyId = new Map(payload.specs.map((spec) => [spec.data && spec.data.enemyId, spec]));
  for (const enemyId of expected) {
    const spec = byEnemyId.get(enemyId);
    assert.ok(spec, `missing a real spawn spec for ${enemyId}`);
    assert.equal(spec.type, 'ship');
    assert.equal(spec.data.rosterPrewarm, true, 'exemplar is tagged, never a live combatant');
    assert.equal(spec.id, `survival-roster-prewarm:${enemyId}`);
    assert.notEqual(spec.alive, false);
    assert.ok(Number.isFinite(spec.pos.x) && Number.isFinite(spec.pos.z));
    assert.ok(spec.data.shipId || spec.data.shipClass || spec.data.fittings,
      'the exemplar carries the same authored-mount fields a spawned hostile does');
  }
  assert.equal(h.state.entities.size, 0, 'prewarm specs are never registered as sim entities');
});

test('later waves re-publish the roster so between-round additions keep warming', (t) => {
  const h = boot(t);
  h.planWave(1);
  h.planWave(2, { schedule: [{ enemyId: 'wasp_swarmer', count: 4, atTick: 0 }] });

  const prewarms = h.prewarms();
  assert.equal(prewarms.length, 2);
  for (const payload of prewarms) {
    assert.deepEqual([...payload.enemyIds].sort(), expectedSwarmEnemyIds());
  }
});

test('a re-emit costs nothing: only hulls this run has not published carry a spec', (t) => {
  const h = boot(t, { ruleset: 'standard' });
  h.planWave(1, { schedule: [{ enemyId: 'corsair_raider', count: 2, atTick: 0 }] });
  h.planWave(2, { schedule: [{ enemyId: 'corsair_raider', count: 3, atTick: 0 }] });
  h.planWave(3, {
    schedule: [
      { enemyId: 'corsair_raider', count: 3, atTick: 0 },
      { enemyId: 'wasp_swarmer', count: 6, atTick: 30 },
    ],
  });

  const [first, repeat, widened] = h.prewarms();
  // `enemyIds` is the receipt of what the ruleset can field and never shrinks.
  assert.deepEqual(first.enemyIds, ['corsair_raider']);
  assert.deepEqual(repeat.enemyIds, ['corsair_raider']);
  assert.deepEqual(widened.enemyIds, ['corsair_raider', 'wasp_swarmer']);
  // `specs` is the work order. The renderer discards an exemplar it already holds, so building
  // it again is 1.28 ms of waste on the wave-plan frame this leaf exists to keep cheap.
  assert.equal(first.specs.length, 1, 'wave 1 publishes the hull it introduced');
  assert.equal(repeat.specs.length, 0, 'a wave that introduces no hull publishes no spec');
  assert.equal(widened.specs.length, 1, 'only the newly reachable hull is built');
  assert.equal(widened.specs[0].data.enemyId, 'wasp_swarmer');
});

test('a second run republishes every spec: the renderer released the first run roots', (t) => {
  const h = boot(t);
  h.planWave(1);
  assert.equal(h.prewarms()[0].specs.length, expectedSwarmEnemyIds().length);

  const before = h.prewarms().length;
  h.startRun();
  h.planWave(1);

  const secondRun = h.prewarms().slice(before);
  assert.ok(secondRun.length > 0, 'the second run publishes at least one prewarm');
  assert.equal(secondRun[0].specs.length, expectedSwarmEnemyIds().length,
    'the second run warms the whole roster again, not an empty list');
  // Its own later waves are still free — the ledger restarts, it does not disappear.
  assert.equal(secondRun.at(-1).specs.length, 0);
});

test('clearing a wave does not expire the warm ledger', (t) => {
  const h = boot(t);
  h.planWave(1);
  // _teardown('wave_cleared') runs _reset(); the exemplar roots survive it, so the ledger must
  // too, or every wave clear would re-pay the whole roster build on the next plan frame.
  h.bus.emit('run:waveCleared', { wave: 1 });
  h.planWave(2);

  assert.equal(h.prewarms().at(-1).specs.length, 0,
    'the roster is still warm after a wave clear');
});

test('a non-swarm survival plan still prewarms the hulls its schedule names', (t) => {
  const h = boot(t, { ruleset: 'standard' });
  h.planWave(3, {
    schedule: [
      { enemyId: 'corsair_raider', count: 2, atTick: 0 },
      { enemyId: 'corsair_raider', count: 1, atTick: 30 },
      { enemyId: 'wasp_swarmer', count: 6, atTick: 60 },
    ],
  });

  const [payload] = h.prewarms();
  assert.ok(payload, 'a planned wave always publishes a roster prewarm');
  assert.deepEqual([...payload.enemyIds].sort(), ['corsair_raider', 'wasp_swarmer'],
    'classic runs warm exactly the hulls their plan can spawn — no swarm-only roster leak');
  assert.equal(payload.specs.length, 2);
});

test('the publisher is documented as unwired, not silently missing', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/systems/survivalArena.js', import.meta.url), 'utf8');
  // A future agent must not "fix" the dead renderer listener by re-adding the wire without
  // reading why it is out. If this assertion fails because the wire was restored, the receipt's
  // load-time numbers are the thing to re-measure first.
  assert.match(src, /DELIBERATELY NOT SUBSCRIBED/,
    'init() must keep the measured explanation beside the missing subscription');
  // The explanation block quotes the three missing lines verbatim, so match a LIVE
  // subscription only: an uncommented line that actually registers the handler.
  assert.doesNotMatch(src, /^\s*this\._unsubs\.push\(this\.bus\.on\('run:loadoutReady'/m,
    'the roster prewarm wire is out on purpose — see the receipt before restoring it');
});
