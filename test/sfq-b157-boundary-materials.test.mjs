import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_KINDS } from '../src/data/fields.js';
import { fieldRawAcceleration, normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { fieldBodyProfile } from '../src/systems/fields.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { BOUNDARY_FIELD, BOUNDARY_FIELD_ID, boundaryFieldRecord } from '../src/data/boundaryField.js';
import { LANE_FIELD } from '../src/data/laneField.js';
import { VELOCITY_PLANE } from '../src/data/velocityPlane.js';
import { CURL_FIELD } from '../src/data/curlField.js';
import { tickMachineLayer } from '../src/systems/precursorMachines.js';

const ring = MACHINE_SITES.veil_containment_ring;

function boundaryAt() {
  return normalizeField(boundaryFieldRecord(ring.center));
}

function worldIn(sectorId) {
  const logs = [];
  const fields = {
    list: [],
    kernelList() { return this.list; },
    registerExternal(spec) { this.list.push({ ...spec }); return spec; },
  };
  const state = {
    simTime: 3, tick: 1, playerId: 1,
    entities: new Map(), entityList: [],
    rng: () => 0,
    player: { cargo: { items: {} } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
  const world = {
    state,
    registry: { get: (name) => (name === 'fields' ? fields : null) },
    active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ x: p.x, z: p.z }),
    _toLocal: (p) => ({ x: p.x, z: p.z }),
    bus: { emit: (type, payload) => logs.push({ type, payload }) },
  };
  return { logs, fields, tick() { tickMachineLayer(world, 1); } };
}

test('a crate passes, a coated hull sticks, and a creature turns aside', () => {
  const boundary = boundaryAt();
  assert.equal(boundary.kind, FIELD_KINDS.BOUNDARY);
  assert.equal(boundary.radius, 180);
  const vel = { x: 10, z: 4 };
  const at = { x: ring.center.x + 40, z: ring.center.z };
  const crate = sampleFieldAcceleration(at, vel, [boundary], 0, { mass: 2, type: 'pickup', id: 2 });
  const plain = sampleFieldAcceleration(at, vel, [boundary], 0, { mass: 20, type: 'ship', id: 3 });
  const coated = sampleFieldAcceleration(at, vel, [boundary], 0, { mass: 20, type: 'ship', id: 4, coated: true });
  const creature = sampleFieldAcceleration(at, vel, [boundary], 0, { mass: 6, type: 'fauna', id: 5 });
  assert.ok(crate.ax === 0 && crate.az === 0);
  assert.ok(plain.ax === 0 && plain.az === 0);
  assert.equal(coated.ax, -15);
  assert.equal(coated.az, -6);
  assert.ok(creature.ax === 0);
  assert.equal(creature.az, 14);
  assert.equal(creature.ax * 40 + creature.az * 0, 0);
  assert.deepEqual(vel, { x: 10, z: 4 });
  const outside = sampleFieldAcceleration(
    { x: ring.center.x + 181, z: ring.center.z }, vel, [boundary], 0,
    { mass: 20, type: 'ship', id: 4, coated: true },
  );
  assert.ok(outside.ax === 0 && outside.az === 0);
  const raw = fieldRawAcceleration(boundary, at.x, at.z, null, vel);
  assert.ok(raw.ax === 0 && raw.az === 0);
  const well = normalizeField({
    id: 'plain-well', kind: FIELD_KINDS.WELL, center: { x: 0, z: 0 },
    radius: 200, strength: 100, damping: 0, falloff: 1,
  });
  const pull = fieldRawAcceleration(well, 50, 0, null, vel);
  assert.ok(pull.ax < 0);
  assert.ok(pull.az === 0);
});

test('a live goo mark sticks and a primer or prism coat still passes', () => {
  const hull = { id: 9, type: 'ship', pos: { x: 0, z: 0 }, physicsBody: { mass: 12, dynamic: true } };
  const boundary = boundaryAt();
  const vel = { x: 10, z: 4 };
  const at = { x: ring.center.x + 40, z: ring.center.z };
  const fresh = fieldBodyProfile(hull, {
    tick: 10,
    simTime: 10,
    combat: { entities: { 9: { statuses: { status_goo: { stacks: 2, expiresTick: 100 } } } } },
    emergent: { coatings: [{ hostId: 9, until: 40 }, { hostId: 9, until: 40, kind: 'reflect' }] },
  });
  assert.equal(fresh.coated, true);
  const stuck = sampleFieldAcceleration(at, vel, [boundary], 0, fresh);
  assert.equal(stuck.ax, -15);
  assert.equal(stuck.az, -6);
  assert.deepEqual(vel, { x: 10, z: 4 });
  const spent = fieldBodyProfile(hull, {
    tick: 100,
    simTime: 30,
    combat: { entities: { 9: { statuses: { status_goo: { stacks: 2, expiresTick: 100 } } } } },
  });
  assert.equal(spent.coated, false);
  const primer = fieldBodyProfile(hull, {
    tick: 10,
    simTime: 10,
    emergent: { coatings: [{ hostId: 9, until: 40 }, { hostId: 9, until: 40, kind: 'reflect' }] },
  });
  assert.equal(primer.coated, false);
  const passed = sampleFieldAcceleration(at, vel, [boundary], 0, primer);
  assert.ok(passed.ax === 0 && passed.az === 0);
});

test('the ring installs one boundary and a second tick does not stack it', () => {
  const w = worldIn(ring.sectorId);
  w.tick();
  const rows = w.fields.list.filter((field) => field.id === BOUNDARY_FIELD_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].radius, BOUNDARY_FIELD.radius);
  assert.equal(rows[0].center.x, ring.center.x);
  const notes = w.logs.filter((e) => e.type === 'comms:log' && /A CRATE PASSES/.test(e.payload.text));
  assert.equal(notes.length, 1);
  assert.match(notes[0].payload.text, /A COATED HULL STICKS/);
  assert.match(notes[0].payload.text, /A CREATURE TURNS ASIDE/);
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === BOUNDARY_FIELD_ID).length, 1);
  assert.equal(w.logs.filter((e) => e.type === 'comms:log' && /A CRATE PASSES/.test(e.payload.text)).length, 1);
});

test('another sector does not grow the boundary', () => {
  const w = worldIn('sector_charon_expanse');
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === BOUNDARY_FIELD_ID).length, 0);
  assert.equal(LANE_FIELD.length, 640);
  assert.equal(LANE_FIELD.strength, 18);
  assert.equal(VELOCITY_PLANE.radius, 180);
  assert.equal(CURL_FIELD.radius, 160);
});
