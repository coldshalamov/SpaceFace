import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { BOUNDARY_FIELD_ID } from '../src/data/boundaryField.js';
import { CURL_FIELD_ID } from '../src/data/curlField.js';
import { LANE_FIELD_ID } from '../src/data/laneField.js';
import { VELOCITY_PLANE_ID } from '../src/data/velocityPlane.js';
import { mulberry32 } from '../src/core/rng.js';
import { tickMachineLayer } from '../src/systems/precursorMachines.js';
import { deserializeAlienEcologyState, serializeAlienEcologyState } from '../src/systems/alienEcology.js';

const marker = MACHINE_SITES.charon_star_marker;
const shepherd = MACHINE_SITES.charon_broken_shepherd;
const line = MACHINE_SITES.ashfall_the_line;
const ring = MACHINE_SITES.veil_containment_ring;
const AWAY = 'sector_vesta_forge';

const SHIP = { mass: 1, type: 'ship', id: 1 };
const COATED = { mass: 1, type: 'ship', id: 1, coated: true };

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
    sampleFieldAt(pos, vel, profile) {
      return sampleFieldAcceleration(
        pos,
        vel,
        this.list.map((field) => normalizeField(field)),
        0,
        profile,
      );
    },
  };
  const ship = {
    id: 7, type: 'ship', alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 11, z: -4 },
    data: {},
  };
  const state = {
    simTime: 3, tick: 1, playerId: null,
    entities: new Map([[ship.id, ship]]),
    entityList: [ship],
    rng: mulberry32(4242),
    player: { cargo: { items: {} }, vel: { x: 11, z: -4 } },
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
  return { logs, fields, state, ship, tick() { tickMachineLayer(world, 1); } };
}

function hasId(fields, id) {
  return fields.kernelList().some((field) => field && field.id === id);
}

function assertSpeedHeld(w) {
  assert.equal(w.state.player.vel.x, 11);
  assert.equal(w.state.player.vel.z, -4);
  assert.equal(w.ship.vel.x, 11);
  assert.equal(w.ship.vel.z, -4);
}

test('taking a precursor field offline or leaving its sector drops the push and keeps speed', () => {
  const w = worldIn(marker.sectorId);
  const vel = w.state.player.vel;
  w.tick();
  assert.equal(hasId(w.fields, VELOCITY_PLANE_ID), true);
  assert.equal(hasId(w.fields, CURL_FIELD_ID), true);
  const planeLive = w.fields.sampleFieldAt(marker.center, { x: 0, z: 0 }, SHIP);
  const curlLive = w.fields.sampleFieldAt(
    { x: shepherd.center.x + 40, z: shepherd.center.z },
    { x: 0, z: 0 },
    SHIP,
  );
  assert.ok(planeLive.ax !== 0 || planeLive.az !== 0);
  assert.ok(curlLive.ax !== 0 || curlLive.az !== 0);
  assert.equal(w.state.player.vel, vel);
  assertSpeedHeld(w);

  w.state.world.alienEcology.machineSites[marker.siteId].planeOnline = false;
  w.tick();
  assert.equal(hasId(w.fields, VELOCITY_PLANE_ID), false);
  assert.equal(hasId(w.fields, CURL_FIELD_ID), true);
  const planeOff = w.fields.sampleFieldAt(marker.center, { x: 0, z: 0 }, SHIP);
  assert.deepEqual(planeOff, { ax: 0, az: 0 });
  assert.equal(w.state.player.vel, vel);
  assertSpeedHeld(w);
  w.tick();
  assert.equal(hasId(w.fields, VELOCITY_PLANE_ID), false);
  assertSpeedHeld(w);

  w.state.world.alienEcology.machineSites[shepherd.siteId].curlOnline = false;
  w.tick();
  assert.equal(hasId(w.fields, CURL_FIELD_ID), false);
  const curlOff = w.fields.sampleFieldAt(
    { x: shepherd.center.x + 40, z: shepherd.center.z },
    { x: 0, z: 0 },
    SHIP,
  );
  assert.deepEqual(curlOff, { ax: 0, az: 0 });
  assertSpeedHeld(w);

  w.state.world.currentSectorId = line.sectorId;
  w.tick();
  assert.equal(hasId(w.fields, LANE_FIELD_ID), true);
  assert.equal(hasId(w.fields, VELOCITY_PLANE_ID), false);
  assert.equal(hasId(w.fields, CURL_FIELD_ID), false);
  const laneLive = w.fields.sampleFieldAt(line.center, { x: 0, z: 0 }, SHIP);
  assert.ok(laneLive.ax !== 0 || laneLive.az !== 0);
  w.state.world.alienEcology.machineSites[line.siteId].laneOnline = false;
  w.tick();
  assert.equal(hasId(w.fields, LANE_FIELD_ID), false);
  const laneOff = w.fields.sampleFieldAt(line.center, { x: 0, z: 0 }, SHIP);
  assert.deepEqual(laneOff, { ax: 0, az: 0 });
  w.tick();
  assert.equal(hasId(w.fields, LANE_FIELD_ID), false);
  assertSpeedHeld(w);

  w.state.world.currentSectorId = ring.sectorId;
  w.tick();
  assert.equal(hasId(w.fields, BOUNDARY_FIELD_ID), true);
  assert.equal(hasId(w.fields, LANE_FIELD_ID), false);
  const boundaryLive = w.fields.sampleFieldAt(ring.center, { x: 4, z: 0 }, COATED);
  assert.ok(boundaryLive.ax !== 0 || boundaryLive.az !== 0);
  w.state.world.alienEcology.machineSites[ring.siteId].boundaryOnline = false;
  w.tick();
  assert.equal(hasId(w.fields, BOUNDARY_FIELD_ID), false);
  const boundaryOff = w.fields.sampleFieldAt(ring.center, { x: 4, z: 0 }, COATED);
  assert.deepEqual(boundaryOff, { ax: 0, az: 0 });
  assert.equal(w.state.player.vel, vel);
  assertSpeedHeld(w);

  w.state.world.alienEcology.machineSites[ring.siteId].boundaryOnline = true;
  w.tick();
  assert.equal(hasId(w.fields, BOUNDARY_FIELD_ID), true);
  w.state.world.currentSectorId = AWAY;
  w.tick();
  assert.equal(hasId(w.fields, BOUNDARY_FIELD_ID), false);
  assert.equal(hasId(w.fields, VELOCITY_PLANE_ID), false);
  assert.equal(hasId(w.fields, CURL_FIELD_ID), false);
  assert.equal(hasId(w.fields, LANE_FIELD_ID), false);
  const away = w.fields.sampleFieldAt(ring.center, { x: 4, z: 0 }, COATED);
  assert.deepEqual(away, { ax: 0, az: 0 });
  assert.equal(w.state.player.vel, vel);
  assertSpeedHeld(w);
  w.tick();
  assert.equal(w.fields.kernelList().length, 0);
  assertSpeedHeld(w);
});

test('switching one field off leaves the others, and a reload keeps it off', () => {
  const w = worldIn(marker.sectorId);
  w.tick();
  assert.equal(hasId(w.fields, VELOCITY_PLANE_ID), true);
  assert.equal(hasId(w.fields, CURL_FIELD_ID), true);
  const ae = w.state.world.alienEcology;
  ae.machineSites[marker.siteId].planeOnline = false;
  ae.machineSites[line.siteId] = {
    seen: false, beats: {}, directiveIssued: false, laneOnline: false,
  };
  ae.machineSites[ring.siteId] = {
    seen: false, beats: {}, directiveIssued: false, boundaryOnline: false,
  };
  w.tick();
  assert.equal(hasId(w.fields, VELOCITY_PLANE_ID), false);
  assert.equal(hasId(w.fields, CURL_FIELD_ID), true);
  const curlStill = w.fields.sampleFieldAt(
    { x: shepherd.center.x + 40, z: shepherd.center.z },
    { x: 1, z: 2 },
    SHIP,
  );
  assert.ok(curlStill.ax !== 0 || curlStill.az !== 0);
  const planeQuiet = w.fields.sampleFieldAt(marker.center, { x: 0, z: 0 }, SHIP);
  assert.deepEqual(planeQuiet, { ax: 0, az: 0 });
  assertSpeedHeld(w);

  const saved = JSON.parse(JSON.stringify(serializeAlienEcologyState(w.state)));
  const loaded = worldIn(marker.sectorId);
  deserializeAlienEcologyState(loaded.state, saved);
  const sites = loaded.state.world.alienEcology.machineSites;
  assert.equal(sites[marker.siteId].planeOnline, false);
  assert.equal(sites[shepherd.siteId].curlOnline, undefined);
  assert.equal(sites[line.siteId].laneOnline, false);
  assert.equal(sites[ring.siteId].boundaryOnline, false);
  loaded.tick();
  assert.equal(hasId(loaded.fields, VELOCITY_PLANE_ID), false);
  assert.equal(hasId(loaded.fields, CURL_FIELD_ID), true);
  loaded.state.world.currentSectorId = line.sectorId;
  loaded.tick();
  assert.equal(hasId(loaded.fields, LANE_FIELD_ID), false);
  assert.equal(hasId(loaded.fields, CURL_FIELD_ID), false);
  loaded.state.world.currentSectorId = ring.sectorId;
  loaded.tick();
  assert.equal(hasId(loaded.fields, BOUNDARY_FIELD_ID), false);
  assert.equal(hasId(loaded.fields, LANE_FIELD_ID), false);
  const stillOff = loaded.fields.sampleFieldAt(ring.center, { x: 4, z: 0 }, COATED);
  assert.deepEqual(stillOff, { ax: 0, az: 0 });
  assertSpeedHeld(loaded);
  loaded.tick();
  assert.equal(hasId(loaded.fields, BOUNDARY_FIELD_ID), false);
  assertSpeedHeld(loaded);
});
