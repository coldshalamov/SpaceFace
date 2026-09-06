import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import { createStatusService } from '../src/combat/statuses.js';

function bootTarget() {
  const catalog = createCombatCatalog();
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
