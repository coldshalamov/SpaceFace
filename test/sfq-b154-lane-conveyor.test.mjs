import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_KINDS } from '../src/data/fields.js';
import { fieldRawAcceleration, normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { LANE_FIELD, LANE_FIELD_ID, laneEnds, laneFieldRecord } from '../src/data/laneField.js';
import { VELOCITY_PLANE } from '../src/data/velocityPlane.js';
import { CURL_FIELD } from '../src/data/curlField.js';
import { tickMachineLayer } from '../src/systems/precursorMachines.js';

const line = MACHINE_SITES.ashfall_the_line;

function laneAt() {
  return normalizeField(laneFieldRecord(line.center));
}

function worldIn(sectorId) {
  const logs = [];
  const fields = {
    list: [],
    kernelList() { return this.list; },
    registerExternal(spec) { this.list.push({ ...spec }); return spec; },
    unregisterExternal(id) {
      const index = this.list.findIndex((field) => field && field.id === id);
      if (index < 0) return false;
      this.list.splice(index, 1);
      return true;
    },
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
  return { logs, fields, state, tick() { tickMachineLayer(world, 1); } };
}

test('the lane pushes along itself from a named entry to a named exit', () => {
  const lane = laneAt();
  const ends = laneEnds(line.center);
  assert.equal(lane.kind, FIELD_KINDS.LANE);
  assert.equal(lane.radius, 640);
  assert.equal(lane.halfWidth, 36);
  assert.equal(lane.strength, 18);
  assert.equal(lane.center.x, ends.entry.x);
  assert.equal(lane.center.z, ends.entry.z);
  assert.equal(ends.exit.x, ends.entry.x + 640);
  assert.equal(ends.exit.z, ends.entry.z);
  const vel = { x: 9, z: 3 };
  const mid = { x: line.center.x, z: line.center.z };
  const ship = sampleFieldAcceleration(mid, vel, [lane], 0, { mass: 40, type: 'ship', id: 1 });
  const cargo = sampleFieldAcceleration(mid, vel, [lane], 0, { mass: 2, type: 'pickup', id: 2 });
  assert.equal(ship.ax, 18);
  assert.equal(cargo.ax, 18);
  assert.ok(ship.az === 0);
  assert.ok(cargo.az === 0);
  assert.deepEqual(ship, cargo);
  assert.deepEqual(vel, { x: 9, z: 3 });
  const offset = fieldRawAcceleration(lane, mid.x, mid.z + 10, null, vel);
  assert.equal(offset.ax, 18);
  assert.ok(offset.az === 0);
  const before = fieldRawAcceleration(lane, ends.entry.x - 1, ends.entry.z, null, vel);
  assert.ok(before.ax === 0 && before.az === 0);
  const past = fieldRawAcceleration(lane, ends.exit.x, ends.exit.z, null, vel);
  assert.ok(past.ax === 0 && past.az === 0);
  const beside = fieldRawAcceleration(lane, mid.x, mid.z + 37, null, vel);
  assert.ok(beside.ax === 0 && beside.az === 0);
  const well = normalizeField({
    id: 'plain-well', kind: FIELD_KINDS.WELL, center: { x: 0, z: 0 },
    radius: 200, strength: 100, damping: 0, falloff: 1,
  });
  const pull = fieldRawAcceleration(well, 50, 0, null, vel);
  assert.ok(pull.ax < 0);
  assert.ok(pull.az === 0);
});

test('the line installs one lane and going offline stops the push', () => {
  const w = worldIn(line.sectorId);
  w.tick();
  const lanes = w.fields.list.filter((field) => field.id === LANE_FIELD_ID);
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].kind, 'lane');
  assert.equal(lanes[0].strength, LANE_FIELD.strength);
  const ends = laneEnds(line.center);
  const notes = w.logs.filter((e) => e.type === 'comms:log' && /ENTRY/.test(e.payload.text) && /EXIT/.test(e.payload.text));
  assert.equal(notes.length, 1);
  assert.match(notes[0].payload.text, new RegExp(`ENTRY ${Math.round(ends.entry.x)}, ${Math.round(ends.entry.z)}`));
  assert.match(notes[0].payload.text, new RegExp(`EXIT ${Math.round(ends.exit.x)}, ${Math.round(ends.exit.z)}`));
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === LANE_FIELD_ID).length, 1);
  assert.equal(w.logs.filter((e) => e.type === 'comms:log' && /ENTRY/.test(e.payload.text) && /EXIT/.test(e.payload.text)).length, 1);
  const vel = { x: 9, z: 3 };
  const mid = { x: line.center.x, z: line.center.z };
  const live = sampleFieldAcceleration(mid, vel, w.fields.list.map((field) => normalizeField(field)), 0, { mass: 40, type: 'ship', id: 1 });
  assert.equal(live.ax, 18);
  assert.deepEqual(vel, { x: 9, z: 3 });
  w.state.world.alienEcology.machineSites[line.siteId].laneOnline = false;
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === LANE_FIELD_ID).length, 0);
  const offline = w.logs.filter((e) => e.type === 'comms:log' && /LANE OFFLINE/.test(e.payload.text));
  assert.equal(offline.length, 1);
  const stopped = sampleFieldAcceleration(mid, vel, w.fields.list.map((field) => normalizeField(field)), 0, { mass: 2, type: 'pickup', id: 2 });
  assert.ok(stopped.ax === 0 && stopped.az === 0);
  assert.deepEqual(vel, { x: 9, z: 3 });
  w.tick();
  assert.equal(w.logs.filter((e) => e.type === 'comms:log' && /LANE OFFLINE/.test(e.payload.text)).length, 1);
});

test('another sector does not grow the lane', () => {
  const w = worldIn('sector_charon_expanse');
  w.tick();
  assert.equal(w.fields.list.filter((field) => field.id === LANE_FIELD_ID).length, 0);
  assert.equal(VELOCITY_PLANE.radius, 180);
  assert.equal(CURL_FIELD.radius, 160);
});
