import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_KINDS } from '../src/data/fields.js';
import { fieldRawAcceleration, normalizeField } from '../src/core/fields/fieldKernel.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { CURL_FIELD, CURL_FIELD_ID, curlFieldRecord } from '../src/data/curlField.js';
import { VELOCITY_PLANE } from '../src/data/velocityPlane.js';
import { tickMachineLayer } from '../src/systems/precursorMachines.js';

const shepherd = MACHINE_SITES.charon_broken_shepherd;

function curlAt() {
  return normalizeField(curlFieldRecord(shepherd.center));
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

test('the disk winds sideways and does not pull inward', () => {
  const curl = curlAt();
  assert.equal(curl.kind, FIELD_KINDS.CURL);
  assert.equal(curl.radius, 160);
  assert.equal(curl.strength, 20);
  const vel = { x: 5, z: -2 };
  const east = fieldRawAcceleration(curl, shepherd.center.x + 40, shepherd.center.z, null, vel);
  assert.ok(east.ax === 0);
  assert.equal(east.az, 15);
  assert.equal(east.ax * 40 + east.az * 0, 0);
  assert.deepEqual(vel, { x: 5, z: -2 });
  const north = fieldRawAcceleration(curl, shepherd.center.x, shepherd.center.z + 40, null, vel);
  assert.equal(north.ax, -15);
  assert.ok(north.az === 0);
  assert.equal(north.ax * 0 + north.az * 40, 0);
  const outside = fieldRawAcceleration(curl, shepherd.center.x + 161, shepherd.center.z, null, vel);
  assert.ok(outside.ax === 0);
  assert.ok(outside.az === 0);
  const heart = fieldRawAcceleration(curl, shepherd.center.x, shepherd.center.z, null, vel);
  assert.ok(heart.ax === 0);
  assert.ok(heart.az === 0);
});

test('a well still pulls inward', () => {
  const well = normalizeField({
    id: 'plain-well', kind: FIELD_KINDS.WELL, center: { x: 0, z: 0 },
    radius: 200, strength: 100, damping: 0, falloff: 1,
  });
  const accel = fieldRawAcceleration(well, 50, 0, null, { x: 1, z: 4 });
  assert.ok(accel.ax < 0);
  assert.ok(accel.az === 0);
});

test('the shepherd installs one curl and a second tick does not stack it', () => {
  const w = worldIn(shepherd.sectorId);
  w.tick();
  const curls = w.fields.list.filter((field) => field.id === CURL_FIELD_ID);
  assert.equal(curls.length, 1);
  assert.equal(curls[0].kind, 'curl');
  assert.equal(curls[0].radius, CURL_FIELD.radius);
  assert.equal(curls[0].center.x, shepherd.center.x);
  const notes = w.logs.filter((e) => e.type === 'comms:log' && /IT IS NOT PULLED IN/.test(e.payload.text));
  assert.equal(notes.length, 1);
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === CURL_FIELD_ID).length, 1);
  assert.equal(w.logs.filter((e) => e.type === 'comms:log' && /IT IS NOT PULLED IN/.test(e.payload.text)).length, 1);
  assert.equal(VELOCITY_PLANE.radius, 180);
});

test('another sector does not grow the curl', () => {
  const w = worldIn('sector_ashfall_reach');
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === CURL_FIELD_ID).length, 0);
});
