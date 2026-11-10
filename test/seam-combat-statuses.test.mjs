import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState, entityWeaponBlocked } from '../src/combat/runtime.js';
import { recomputeCombatantModifiers } from '../src/combat/subsystems.js';
import { createStatusService } from '../src/combat/statuses.js';

function bootTarget(catalog = createCombatCatalog()) {
  const state = { tick: 0, combat: {}, meta: { seed: 4242 } };
  ensureCombatState(state);
  const entity = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 },
    hull: 80, hullMax: 80,
  };
  const runtime = ensureCombatant(state, entity, catalog);
  const bus = createBus();
  const applied = [];
  bus.on('combat:statusApplied', (p) => applied.push(p));
  const statuses = createStatusService({ state, catalog, bus });
  return { state, entity, runtime, statuses, applied, bus, catalog };
}

test('scheduling ionized status applies on the next tick and emits the combat receipt', () => {
  const { state, entity, runtime, statuses, applied, bus } = bootTarget();
  try {
    const scheduled = statuses.schedule(entity, runtime, { id: 'status_ionized', stacks: 2 }, { attackerId: 1 });
    assert.equal(scheduled.ok, true);
    assert.equal(runtime.pendingStatuses.length, 1);

    state.tick = 1;
    statuses.advance(entity, runtime, () => {});
    const active = runtime.statuses.status_ionized;
    assert.ok(active, 'pending status must become live');
    assert.equal(active.stacks, 2);
    assert.ok(active.expiresTick > state.tick);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].statusId, 'status_ionized');
  } finally {
    bus.clear();
  }
});

test('an unknown status id is refused and an immune tag blocks application', () => {
  const { entity, runtime, statuses, bus, applied } = bootTarget();
  try {
    const unknown = statuses.schedule(entity, runtime, { id: 'status_does_not_exist' }, {});
    assert.equal(unknown.ok, false);
    assert.equal(unknown.reason, 'unknown_status');

    runtime.immunityTags = ['ion_immune'];
    const immune = statuses.schedule(entity, runtime, { id: 'status_ionized' }, { attackerId: 1 });
    assert.equal(immune.ok, false);
    assert.equal(immune.reason, 'immune');
    assert.equal(applied.length, 0, 'an immune refusal must not publish a status cue');
  } finally {
    bus.clear();
  }
});

test('seed 4242: a destroyed or newly immune body does not publish a rupture cue', () => {
  const { state, entity, runtime, statuses, bus, applied } = bootTarget();
  try {
    assert.equal(state.meta.seed, 4242);

    entity.alive = false;
    const dead = statuses.schedule(entity, runtime, { id: 'status_burning', stacks: 1, applyTick: 0 }, { attackerId: 4 });
    assert.equal(dead.ok, false);
    assert.equal(dead.reason, 'destroyed');
    entity.alive = true;
    entity.destroyed = true;
    const flagged = statuses.schedule(entity, runtime, { id: 'status_burning', stacks: 1, applyTick: 0 }, { attackerId: 4 });
    assert.equal(flagged.ok, false);
    assert.equal(flagged.reason, 'destroyed');
    assert.equal(runtime.pendingStatuses.length, 0);
    assert.equal(applied.length, 0);

    entity.alive = true;
    entity.destroyed = false;
    const queued = statuses.schedule(entity, runtime, { id: 'status_ionized', stacks: 1, applyTick: 0 }, { attackerId: 4 });
    assert.equal(queued.ok, true);
    runtime.immunityTags = ['ion_immune'];
    state.tick = 1;
    statuses.advance(entity, runtime, () => {
      throw new Error('a rejected status must not route a damage packet');
    });
    assert.equal(runtime.statuses.status_ionized, undefined);
    assert.equal(applied.length, 0, 'immunity gained before apply publishes no cue');

    runtime.immunityTags = [];
    entity.alive = false;
    const late = statuses.schedule(entity, runtime, { id: 'status_burning', stacks: 1, applyTick: state.tick }, { attackerId: 4 });
    assert.equal(late.ok, false);
    assert.equal(late.reason, 'destroyed');
    statuses.advance(entity, runtime, () => {
      throw new Error('a destroyed body must not route status damage');
    });
    assert.equal(applied.length, 0, 'a destroyed body publishes no rupture cue');

    entity.alive = true;
    const live = statuses.schedule(entity, runtime, { id: 'status_ionized', stacks: 1 }, { attackerId: 4 });
    assert.equal(live.ok, true);
    state.tick += 1;
    statuses.advance(entity, runtime, () => {});
    assert.equal(runtime.statuses.status_ionized.stacks, 1);
    assert.equal(applied.length, 1, 'a living vulnerable hull still gets the one acceptance cue');
    assert.equal(applied[0].statusId, 'status_ionized');
    assert.equal(applied[0].cueId, 'combat.status.ionized');
  } finally {
    bus.clear();
  }
});

test('seed 4242: a rejected burn and time spent destroyed do not pile up hits', () => {
  const { state, entity, runtime, statuses, bus } = bootTarget();
  try {
    runtime.statuses.status_burning = {
      id: 'status_burning',
      stacks: 1,
      expiresTick: 1000,
      nextPeriodicTick: 31,
      attackerId: 4,
    };
    state.tick = 31;
    let calls = 0;
    statuses.advance(entity, runtime, () => {
      calls += 1;
      return { ok: false };
    });
    const periodic = ((state.combat.trace && state.combat.trace.events) || [])
      .filter((event) => event.kind === 'status.periodic');
    assert.equal(calls, 1, 'the due tick is attempted once');
    assert.equal(periodic.length, 0, 'a rejected packet publishes no periodic hit');
    assert.equal(runtime.statuses.status_burning.nextPeriodicTick, 61);

    entity.alive = false;
    state.tick = 121;
    statuses.advance(entity, runtime, () => {
      calls += 1;
      return { ok: true };
    });
    assert.equal(calls, 1, 'a destroyed body does not route the missed intervals');
    assert.ok(runtime.statuses.status_burning.nextPeriodicTick >= 121);

    entity.alive = true;
    state.tick = 122;
    statuses.advance(entity, runtime, () => {
      calls += 1;
      entity.alive = false;
      return { ok: true };
    });
    assert.equal(calls, 2, 'coming back publishes the one accepted hit, not the backlog');
    const hits = ((state.combat.trace && state.combat.trace.events) || [])
      .filter((event) => event.kind === 'status.periodic');
    assert.equal(hits.length, 1);
  } finally {
    bus.clear();
  }
});

test('weapon-blocking catalog statuses block bursts only after runtime recompute', () => {
  for (const statusId of ['status_tumbling', 'status_overheated', 'status_scrambled']) {
    const { state, entity, runtime, bus, catalog } = bootTarget();
    try {
      assert.equal(entityWeaponBlocked(state, entity), false, `${statusId} starts unblocked`);
      runtime.statuses[statusId] = { id: statusId, expiresTick: state.tick + 2, stacks: 1 };
      recomputeCombatantModifiers({ state, catalog, bus }, entity, runtime, null, false);
      assert.equal(entityWeaponBlocked(state, entity), true, `${statusId} active blocks burst`);
      state.tick = 2;
      recomputeCombatantModifiers({ state, catalog, bus }, entity, runtime, null, false);
      assert.equal(entityWeaponBlocked(state, entity), false, `${statusId} expired key is ignored before sweep`);
      state.tick = 0;
      runtime.statuses = {
        [statusId]: { id: statusId, expiresTick: state.tick + 2, stacks: 1, pending: true },
      };
      recomputeCombatantModifiers({ state, catalog, bus }, entity, runtime, null, false);
      assert.equal(entityWeaponBlocked(state, entity), false, `${statusId} pending key is ignored`);
    } finally {
      bus.clear();
    }
  }
});

test('custom runtime blockedActionTags participate in burst blocking', () => {
  const base = createCombatCatalog();
  const catalog = createCombatCatalog({
    statuses: [
      ...base.statusDefs,
      {
        id: 'status_test_burst_block', version: 1, tags: ['test'], durationTicks: 10,
        stacking: { mode: 'refresh', maxStacks: 1 }, immunityTags: [],
        effects: { blockedActionTags: ['burst'] },
        interactions: [], periodic: null, cueId: null,
      },
    ],
  });
  const { state, entity, runtime, bus } = bootTarget(catalog);
  try {
    runtime.statuses.status_test_burst_block = {
      id: 'status_test_burst_block',
      expiresTick: state.tick + 2,
      stacks: 1,
    };
    recomputeCombatantModifiers({ state, catalog, bus }, entity, runtime, null, false);
    assert.equal(entityWeaponBlocked(state, entity), true,
      'custom status blocks action_burst by derived runtime tag');
  } finally {
    bus.clear();
  }
});
