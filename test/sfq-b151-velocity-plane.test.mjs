import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_KINDS } from '../src/data/fields.js';
import { fieldCanApplyTo, fieldRawAcceleration, normalizeField } from '../src/core/fields/fieldKernel.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { VELOCITY_PLANE, VELOCITY_PLANE_ID, velocityPlaneRecord } from '../src/data/velocityPlane.js';
import { tickMachineLayer } from '../src/systems/precursorMachines.js';

const marker = MACHINE_SITES.charon_star_marker;

function planeAt(extra = {}) {
  return normalizeField({ ...velocityPlaneRecord(marker.center), ...extra });
}

function worldIn(sectorId) {
  const logs = [];
  const fields = {
    list: [],
    kernelList() { return this.list; },
    registerExternal(spec) { this.list.push({ ...spec }); return spec; },
  };
  const state = {
    simTime: 2, tick: 1, playerId: 1,
    entities: new Map(), entityList: [],
    rng: () => 0, paused: false,
    player: { credits: 5, cargo: { items: {} }, heat: 1 },
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
  return { state, world, logs, fields, tick() { tickMachineLayer(world, 1); } };
}

test('the disk damps only speed into its face and leaves sideways speed alone', () => {
  const plane = planeAt();
  assert.equal(plane.kind, FIELD_KINDS.PLANE);
  assert.equal(plane.damping, 1.25);
  assert.equal(plane.strength, 0);
  assert.equal(plane.frame.x, 4);
  assert.equal(plane.radius, 180);
  const vel = { x: 10, z: 7 };
  const inside = fieldRawAcceleration(plane, marker.center.x, marker.center.z, null, vel);
  assert.equal(inside.ax, -1.25 * (10 - 4));
  assert.ok(inside.az === 0);
  assert.deepEqual(vel, { x: 10, z: 7 });
  const sliding = planeAt({ frame: { x: 4, z: 99 } });
  const slide = fieldRawAcceleration(sliding, marker.center.x + 10, marker.center.z, null, { x: 10, z: 40 });
  assert.equal(slide.ax, -7.5);
  assert.ok(slide.az === 0);
  const matched = fieldRawAcceleration(plane, marker.center.x, marker.center.z, null, { x: 4, z: 20 });
  assert.ok(matched.ax === 0);
  assert.ok(matched.az === 0);
  const reverse = fieldRawAcceleration(plane, marker.center.x, marker.center.z, null, { x: -6, z: 3 });
  assert.equal(reverse.ax, -1.25 * (-6 - 4));
  assert.ok(reverse.az === 0);
  const outside = fieldRawAcceleration(plane, marker.center.x + 181, marker.center.z, null, { x: 10, z: 7 });
  assert.equal(outside.ax, 0);
  assert.equal(outside.az, 0);
  assert.equal(fieldRawAcceleration(plane, marker.center.x, marker.center.z, null, null).ax, 0);
  assert.equal(fieldCanApplyTo(plane, { type: 'ship', id: 1 }), true);
});

test('a well still pulls toward its center and does not take the face term', () => {
  const well = normalizeField({
    id: 'plain-well', kind: FIELD_KINDS.WELL, center: { x: 0, z: 0 },
    radius: 200, strength: 100, damping: 0, falloff: 1,
  });
  const accel = fieldRawAcceleration(well, 50, 0, null, { x: 30, z: 30 });
  assert.ok(accel.ax < 0);
  assert.ok(accel.az === 0);
});

test('the star marker installs one disk and a second tick does not stack another', () => {
  const w = worldIn(marker.sectorId);
  w.tick();
  const planes = w.fields.list.filter((field) => field.id === VELOCITY_PLANE_ID);
  assert.equal(planes.length, 1);
  assert.equal(planes[0].kind, 'plane');
  assert.equal(planes[0].center.x, marker.center.x);
  assert.equal(planes[0].center.z, marker.center.z);
  assert.equal(planes[0].radius, VELOCITY_PLANE.radius);
  const notes = w.logs.filter((e) => e.type === 'comms:log' && /SIDEWAYS SPEED IS LEFT ALONE/.test(e.payload.text));
  assert.equal(notes.length, 1);
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === VELOCITY_PLANE_ID).length, 1);
  assert.equal(w.logs.filter((e) => e.type === 'comms:log' && /SIDEWAYS SPEED IS LEFT ALONE/.test(e.payload.text)).length, 1);
});

test('another sector does not grow the disk', () => {
  const w = worldIn('sector_ashfall_reach');
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === VELOCITY_PLANE_ID).length, 0);
});
