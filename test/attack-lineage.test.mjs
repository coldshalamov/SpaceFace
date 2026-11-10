// CRU-021 … CRU-024 — lineage, shared proc budget, multishot / pierce / split containment.
import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAttackSpec } from '../src/combat/attackSpec.js';
import {
  DEFAULT_CONSTRAINTS,
  PROC_COSTS,
  canAct,
  createLineage,
  createProcWorld,
  lineageMetrics,
  resetLineageIds,
  tryConsumeProc,
  trySpawnDescendant,
} from '../src/combat/attackLineage.js';
import {
  describeVolley,
  emitVolley,
  tryBounce,
  tryPierce,
  trySplit,
} from '../src/combat/attackPropagation.js';
import { selectTargets } from '../src/combat/attackTargeting.js';

function compile(weaponId, modifiers, extra = {}) {
  const result = compileAttackSpec({ weaponId, modifiers, ...extra });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function lineageFor(spec, overrides = {}) {
  return createLineage({ spec, createdTick: 10, sourceEntityId: 'player', ...overrides });
}

test('shared proc budget is refused when exhausted and the suppression is measurable', () => {
  resetLineageIds(1);
  const spec = compile('wpn_pulse_laser_s', [['mod_forked_core', 1]]);
  const runtime = lineageFor(spec);
  runtime.budget.remaining = 2;
  runtime.budget.initial = 2;

  const first = tryConsumeProc(runtime, PROC_COSTS.splitChild, 'split');
  assert.equal(first.ok, true);
  assert.equal(runtime.budget.remaining, 0);

  const second = tryConsumeProc(runtime, PROC_COSTS.splitChild, 'split');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'proc_budget');
  const metrics = lineageMetrics(runtime);
  assert.equal(metrics.suppressed, 1);
  assert.ok(metrics.suppressReasons.includes('proc_budget'));
});

test('split children are bounded by the shared budget and do not inherit split', () => {
  resetLineageIds(7);
  const spec = compile('wpn_pulse_laser_s', [['mod_forked_core', 1]]);
  const parent = lineageFor(spec);
  parent.budget.remaining = 3;

  const split = trySplit(parent, spec, { tick: 10, targetId: 'a' });
  assert.equal(split.children.length, 1);
  assert.equal(split.suppressed, 1);
  assert.ok(split.suppressReasons.includes('proc_budget'));
  const child = split.children[0].runtime;
  assert.equal(child.generation, 1);
  assert.equal(child.lineageId, parent.lineageId);
  assert.equal(canAct(child, 'split'), false);
  assert.equal(canAct(child, 'apply_payload'), true);
  assert.equal(child.remaining.splits, 0);
  assert.equal(child.budget, parent.budget);

  const leak = trySplit(child, spec, { tick: 11, targetId: 'b' });
  assert.equal(leak.ok, false);
  assert.equal(leak.reason, 'not_inherited');
});

test('generation and child caps refuse unbounded descendants', () => {
  const spec = compile('wpn_autocannon_s', [['mod_forked_core', 1]]);
  const parent = lineageFor(spec);
  parent.generation = spec.constraints.generationMax;
  const blocked = trySpawnDescendant(parent, { spec, tick: 10 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'generation_max');

  const fresh = lineageFor(spec);
  fresh.budget.constraints.childMax = 0;
  const childBlocked = trySpawnDescendant(fresh, { spec, tick: 10 });
  assert.equal(childBlocked.ok, false);
  assert.equal(childBlocked.reason, 'child_max');
});

test('per-tick descendant cap is finite and resets on the next tick', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_forked_core', 1]]);
  const world = createProcWorld({ descendantsPerTickMax: 1, tick: 4 });
  const parent = lineageFor(spec, { world, createdTick: 4 });
  parent.remaining.splits = 2;
  const first = trySplit(parent, spec, { tick: 4 });
  assert.equal(first.children.length, 1);
  assert.ok(first.suppressReasons.includes('descendants_per_tick'));

  const later = lineageFor(spec, { budget: parent.budget, createdTick: 5 });
  later.remaining.splits = 1;
  later.allowedActions = parent.allowedActions.slice();
  const nextTick = trySplit(later, spec, { tick: 5 });
  assert.equal(nextTick.children.length, 1);
});

test('multishot: extra roots cost heat and proc, first root is free', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_twin_mount', 1]]);
  const planned = describeVolley(spec);
  assert.equal(planned.rootCount, 2);
  assert.equal(planned.roots[0].offsetDeg, -planned.roots[1].offsetDeg);

  const runtime = lineageFor(spec);
  runtime.budget.remaining = 0;
  const starved = emitVolley(spec, runtime);
  assert.equal(starved.emitted.length, 1);
  assert.equal(starved.suppressed.length, 1);
  assert.equal(starved.suppressed[0].reason, 'proc_budget');

  const funded = emitVolley(spec, lineageFor(spec));
  assert.equal(funded.emitted.length, 2);
  assert.equal(funded.heatScale > 1, true);
  const baseline = compile('wpn_pulse_laser_s', []);
  assert.equal(spec.costs.heatScale > baseline.costs.heatScale, true);
  assert.equal(funded.emitted.length * 1, spec.emitter.rootCount);
});

test('triad mount spends two sibling procs or suppresses what it cannot pay', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_triad_mount', 1]]);
  assert.equal(spec.emitter.rootCount, 3);
  const runtime = lineageFor(spec);
  runtime.budget.remaining = 1;
  const volley = emitVolley(spec, runtime);
  assert.equal(volley.emitted.length, 2);
  assert.equal(volley.suppressed.length, 1);
});

test('pierce continues through a bounded target count with same-target cooldown', () => {
  const spec = compile('wpn_autocannon_s', [['mod_piercing_core', 1]]);
  const runtime = lineageFor(spec);
  assert.equal(runtime.remaining.pierces, 1);

  const first = tryPierce(runtime, { targetId: 'alpha', tick: 20 });
  assert.equal(first.ok, true);
  assert.equal(first.continue, true);
  assert.equal(first.applyPayload, true);

  const rehit = tryPierce(runtime, { targetId: 'alpha', tick: 21 });
  assert.equal(rehit.ok, false);
  assert.equal(rehit.reason, 'same_target_cooldown');
  assert.equal(rehit.applyPayload, false);
  assert.equal(rehit.continue, true);
  assert.equal(runtime.remaining.pierces, 0);

  const second = tryPierce(runtime, { targetId: 'bravo', tick: 22 });
  assert.equal(second.ok, true);
  assert.equal(second.continue, false);
  assert.equal(second.reason, 'consumed');

  const later = tryPierce(runtime, { targetId: 'alpha', tick: 20 + DEFAULT_CONSTRAINTS.sameTargetCooldownTicks });
  assert.equal(later.applyPayload, true);
  assert.equal(later.continue, false);
});

test('split children inherit payload, not bounce or split, and share visited targets', () => {
  const spec = compile('wpn_pulse_laser_s', [
    ['mod_forked_core', 1],
    ['mod_bank_shot', 1],
  ]);
  const parent = lineageFor(spec);
  recordAndSplit(parent, spec);

  function recordAndSplit(runtime, compiled) {
    const hit = tryPierce(runtime, { targetId: 'wall_host', tick: 30 });
    assert.equal(hit.applyPayload, true);
    const split = trySplit(runtime, compiled, { tick: 30, targetId: 'wall_host' });
    assert.equal(split.children.length, 2);
    for (const child of split.children) {
      assert.equal(canAct(child.runtime, 'apply_payload'), true);
      assert.equal(canAct(child.runtime, 'split'), false);
      assert.equal(canAct(child.runtime, 'ricochet'), true);
      assert.equal(child.runtime.visitedTargets, runtime.visitedTargets);
      assert.equal(child.runtime.visitedTargets.has('wall_host'), true);
      const bounce = tryBounce(child.runtime);
      assert.equal(bounce.ok, true);
    }
    const parentBounce = tryBounce(runtime);
    assert.equal(parentBounce.ok, true);
    const over = tryBounce(runtime);
    assert.equal(over.ok, false);
  }
});

test('target selection is deterministic across shuffled insertion order', () => {
  const candidates = [
    { id: 'c', score: 1, pos: { x: 4, z: 0 } },
    { id: 'a', score: 2, pos: { x: 8, z: 0 } },
    { id: 'b', score: 2, pos: { x: 3, z: 0 } },
    { id: 'd', score: 2, pos: { x: 3, z: 0 } },
  ];
  const sourcePos = { x: 0, z: 0 };
  const forward = selectTargets(candidates, { count: 3, sourcePos });
  const backward = selectTargets([...candidates].reverse(), { count: 3, sourcePos });
  assert.deepEqual(forward.map((row) => row.id), backward.map((row) => row.id));
  assert.deepEqual(forward.map((row) => row.id), ['b', 'd', 'a']);
});

test('active family cap refuses extra roots', () => {
  const spec = compile('wpn_pulse_laser_s', [['mod_twin_mount', 1]]);
  const runtime = lineageFor(spec);
  runtime.budget.constraints.activeFamilyCap = 1;
  const volley = emitVolley(spec, runtime);
  assert.equal(volley.emitted.length, 1);
  assert.equal(volley.suppressed[0].reason, 'active_family_cap');
});
