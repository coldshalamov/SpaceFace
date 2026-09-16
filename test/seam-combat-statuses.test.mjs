import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState, entityWeaponBlocked } from '../src/combat/runtime.js';
import { recomputeCombatantModifiers } from '../src/combat/subsystems.js';
import { createStatusService } from '../src/combat/statuses.js';

function bootTarget(catalog = createCombatCatalog()) {
  const state = { tick: 0, combat: {} };
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
  const { entity, runtime, statuses, bus } = bootTarget();
  try {
    const unknown = statuses.schedule(entity, runtime, { id: 'status_does_not_exist' }, {});
    assert.equal(unknown.ok, false);
    assert.equal(unknown.reason, 'unknown_status');

    runtime.immunityTags = ['ion_immune'];
    const immune = statuses.schedule(entity, runtime, { id: 'status_ionized' }, { attackerId: 1 });
    assert.equal(immune.ok, false);
    assert.equal(immune.reason, 'immune');
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
