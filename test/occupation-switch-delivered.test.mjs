// SF-162 occupation switch — the picker crew's haul resolves out loud.
//
// The switch already toasts when the crew takes the hauling job ("switched to hauling
// their hold in"). The arc's second half — the delivery actually landing — fired only a
// bare `occupation:delivered` record nobody heard. The depot receipt now says so, once,
// with the hauled quantity.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createScavengerOccupationSwitch, scavengerWorldRecordId } from '../src/systems/scavengerOccupationSwitch.js';

function boot() {
  const bus = createBus();
  const state = {
    simTime: 12,
    meta: { seed: 7 },
    run: null,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_test', records: { byId: {} } },
  };
  const station = { id: 50, type: 'station', alive: true, pos: { x: 900, z: 0 }, radius: 60, data: { stationId: 'depot_test' } };
  state.entities.set(50, station);
  state.entityList.push(station);

  const assigned = [];
  let nextId = 77;
  const owner = {
    state, bus,
    helpers: {
      spawnEntity: (spec) => {
        const e = { id: nextId++, alive: true, type: 'ship', pos: { ...spec.pos }, vel: { x: 0, z: 0 }, data: spec.data };
        state.entities.set(e.id, e);
        return e;
      },
      npcJobs: { assign: (entity, job) => { entity.data.jobId = `job:${scavengerWorldRecordId(7, 'field_a')}`; assigned.push(job); return entity.data.jobId; } },
    },
    _ensureState: () => (state.uniqueWrecks || (state.uniqueWrecks = {})),
  };
  const toasts = [];
  bus.on('toast', (p) => toasts.push(p));
  const sw = createScavengerOccupationSwitch(owner);
  return { state, bus, sw, toasts, assigned };
}

test('occupation switch: the delivered haul closes the arc out loud, once', () => {
  const t = boot();
  t.sw.departed({ fieldId: 'field_a', sectorId: 'sector_test', entityId: null, holdQty: 5, hold: { cmdty_alloy: 5 } });
  assert.equal(t.assigned.length, 1, 'the switch assigns a real hauler job');
  assert.equal(t.toasts.length, 1, 'the switch toast stands');
  assert.ok(t.toasts[0].text.includes('switched to hauling'), t.toasts[0].text);

  t.sw.jobComplete({ jobId: `job:${scavengerWorldRecordId(7, 'field_a')}` });
  assert.equal(t.toasts.length, 2, 'the depot receipt speaks');
  assert.equal(t.toasts[1].kind, 'good');
  assert.ok(t.toasts[1].text.includes('5u'), `the line names the hauled quantity: ${t.toasts[1].text}`);

  t.sw.jobComplete({ jobId: `job:${scavengerWorldRecordId(7, 'field_a')}` });
  assert.equal(t.toasts.length, 2, 'a duplicate completion stays quiet');
});

test('occupation switch: an unrelated job completion does not borrow the receipt', () => {
  const t = boot();
  t.sw.departed({ fieldId: 'field_a', sectorId: 'sector_test', entityId: null, holdQty: 3, hold: { cmdty_alloy: 3 } });
  t.sw.jobComplete({ jobId: 'job:someone-else' });
  assert.equal(t.toasts.length, 1, 'no delivery receipt for a stranger job');
});

test('occupation switch: empty departures still close quietly', () => {
  const t = boot();
  t.sw.departed({ fieldId: 'field_a', sectorId: 'sector_test', entityId: null, holdQty: 0, hold: {} });
  assert.equal(t.toasts.length, 0, 'nothing hauled, nothing said');
});

test('occupation switch: a killed hauler is mourned once, and a stranger death is not', () => {
  const t = boot();
  t.sw.departed({ fieldId: 'field_a', sectorId: 'sector_test', entityId: null, holdQty: 4, hold: { cmdty_alloy: 4 } });
  const hauler = t.state.entities.get(77);
  assert.ok(hauler, 'the switch spawned its hauler');
  assert.equal(t.toasts.length, 1);

  t.sw.killed({ id: 77 });
  assert.equal(t.toasts.length, 2, 'the loss speaks once');
  assert.equal(t.toasts[1].kind, 'warn');
  assert.ok(t.toasts[1].text.includes('4u'), `the line names what burned: ${t.toasts[1].text}`);

  t.sw.killed({ id: 77 });
  assert.equal(t.toasts.length, 2, 'a second report on the same hull stays quiet');

  t.sw.departed({ fieldId: 'field_b', sectorId: 'sector_test', entityId: null, holdQty: 2, hold: { cmdty_alloy: 2 } });
  assert.equal(t.toasts.length, 3);
  t.sw.killed({ id: 999 });
  assert.equal(t.toasts.length, 3, 'a stranger hull never borrows the loss line');
});
