import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldAffectsBody, normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { velocityPlaneRecord } from '../src/data/velocityPlane.js';
import { tickMachineLayer } from '../src/systems/precursorMachines.js';

const marker = MACHINE_SITES.charon_star_marker;
const plane = normalizeField(velocityPlaneRecord(marker.center));
const vel = { x: 10, z: 7 };

test('hulls are slowed inside the disk and cargo is not shoved', () => {
  const ship = sampleFieldAcceleration(marker.center, vel, [plane], 0, { mass: 1, type: 'ship', id: 1 });
  assert.equal(ship.ax, -1.25 * (10 - 4));
  assert.ok(ship.az === 0);
  assert.deepEqual(vel, { x: 10, z: 7 });
  const drone = sampleFieldAcceleration(marker.center, vel, [plane], 0, { mass: 1, type: 'drone', id: 3 });
  assert.equal(drone.ax, ship.ax);
  assert.ok(drone.az === 0);
  for (const type of ['cargo', 'wreck']) {
    const passed = sampleFieldAcceleration(marker.center, { x: 80, z: -20 }, [plane], 0, { mass: 1, type, id: 9 });
    assert.ok(passed.ax === 0);
    assert.ok(passed.az === 0);
    assert.equal(fieldAffectsBody(plane, { type, id: 9 }), false);
  }
  assert.equal(fieldAffectsBody(plane, { type: 'ship', id: 1 }), true);
});

test('the notice names who is slowed and who passes', () => {
  const logs = [];
  const fields = {
    list: [],
    kernelList() { return this.list; },
    registerExternal(spec) { this.list.push({ ...spec }); return spec; },
  };
  const state = {
    simTime: 2, tick: 1, playerId: 1,
    entities: new Map(), entityList: [],
    rng: () => 0,
    player: { cargo: { items: {} } },
    world: { currentSectorId: marker.sectorId, sectors: {} },
  };
  const world = {
    state,
    registry: { get: (name) => (name === 'fields' ? fields : null) },
    active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ x: p.x, z: p.z }),
    _toLocal: (p) => ({ x: p.x, z: p.z }),
    bus: { emit: (type, payload) => logs.push({ type, payload }) },
  };
  tickMachineLayer(world, 1);
  const note = logs.find((e) => e.type === 'comms:log' && /HULLS ARE SLOWED/.test(e.payload.text));
  assert.ok(note);
  assert.match(note.payload.text, /CARGO PASSES/);
  assert.deepEqual(fields.list[0].filters.types, ['ship', 'drone']);
});
