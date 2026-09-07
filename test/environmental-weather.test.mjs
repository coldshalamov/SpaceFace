// PQ-027.02 — weather that shapes fights. A storm sheet bends shots and shoves traffic;
// a radiation belt pulls mass, amplifies a stacked well, and shrinks POI scan.
// Neither is a hull-drain aura. Capture skipped: motion numbers are the done-when.
import assert from 'node:assert/strict';
import test from 'node:test';

import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  VEIL_WEATHER_SECTOR_ID,
  WEATHER_SCAN_SCALE_INSIDE,
  WEATHER_VOLUMES,
  pointInsideWeatherVolume,
  weatherPhase,
  weatherScanScale,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import {
  normalizeField,
  projectFieldTrajectory,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';

const STORM = WEATHER_VOLUMES.find((row) => row.id === 'veil_storm_lane');
const BELT = WEATHER_VOLUMES.find((row) => row.id === 'veil_radiation_belt');
const SURGE_S = STORM.cycle.warningS + 0.4;

function perpOf(dir) {
  return { x: -dir.z, z: dir.x };
}

function alongPoint(volume, along, across) {
  const dir = volume.field.dir;
  const perp = perpOf(dir);
  return {
    x: volume.field.center.x + dir.x * along + perp.x * across,
    z: volume.field.center.z + dir.z * along + perp.z * across,
  };
}

test('Veil and Vesta each carry a storm lane and a radiation belt on a schedule', () => {
  const roles = WEATHER_VOLUMES.map((row) => `${row.sectorId}:${row.role}`).sort();
  assert.deepEqual(roles, [
    'sector_veil_nebula:radiation_belt',
    'sector_veil_nebula:storm',
    'sector_vesta_forge:radiation_belt',
    'sector_vesta_forge:storm',
  ]);
  assert.equal(weatherPhase(STORM, 0).phase, 'warning');
  assert.equal(weatherPhase(STORM, SURGE_S).phase, 'surge');
  assert.equal(weatherPhase(STORM, STORM.cycle.warningS + STORM.cycle.surgeS + 0.2).phase, 'calm');
  assert.equal(STORM.hazardType, 'debris_current');
  assert.equal(BELT.hazardType, 'nebula');
});

test('the storm sheet bends a projectile off a straight shot and shoves a hauler off the lane', () => {
  const field = normalizeField({ ...STORM.field, strength: STORM.field.strength });
  const pos = alongPoint(STORM, 90, 36);
  const dir = STORM.field.dir;
  const vel = { x: dir.x * 140, z: dir.z * 140 };
  const shotAccel = sampleFieldAcceleration(pos, vel, [field], SURGE_S, {
    mass: 0.4, type: 'projectile', marked: false,
  }, { ax: 0, az: 0 });
  const towardRail = -(shotAccel.ax * perpOf(dir).x + shotAccel.az * perpOf(dir).z);
  assert.ok(towardRail > 40, `storm must bend the shot toward the rail (got ${towardRail.toFixed(1)})`);

  const vacuum = projectFieldTrajectory(pos, vel, [], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: 45, simTime: SURGE_S,
  });
  const storm = projectFieldTrajectory(pos, vel, [field], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: 45, simTime: SURGE_S,
  });
  const bend = Math.hypot(storm.end.x - vacuum.end.x, storm.end.z - vacuum.end.z);
  assert.ok(bend > 8, `a blind reviewer can name the storm from the bent shot (bend ${bend.toFixed(1)} wu)`);

  const haulAccel = sampleFieldAcceleration(pos, { x: 0, z: 0 }, [field], SURGE_S, {
    mass: 28, type: 'ship', marked: false,
  }, { ax: 0, az: 0 });
  const haulToward = -(haulAccel.ax * perpOf(dir).x + haulAccel.az * perpOf(dir).z);
  assert.ok(haulToward > 20, `ordinary traffic is shoved off the storm lane (got ${haulToward.toFixed(1)})`);
});

test('the radiation belt pulls mass, amplifies a stacked well, and shrinks sensors', () => {
  const belt = normalizeField({ ...BELT.field, strength: BELT.field.strength });
  const pos = {
    x: BELT.field.center.x + 120,
    z: BELT.field.center.z,
  };
  assert.equal(pointInsideWeatherVolume(BELT, pos), true);
  const beltAccel = sampleFieldAcceleration(pos, { x: 0, z: 0 }, [belt], SURGE_S, {
    mass: 16, type: 'ship', marked: false,
  }, { ax: 0, az: 0 });
  const inward = -(beltAccel.ax * 1 + beltAccel.az * 0);
  assert.ok(inward > 20, `belt must pull mass inward (got ${inward.toFixed(1)})`);

  const playerWell = normalizeField({
    id: 'player_well',
    kind: 'well',
    center: { x: BELT.field.center.x, z: BELT.field.center.z },
    radius: 200,
    strength: 240,
    falloff: 1.6,
  });
  const wellOnly = sampleFieldAcceleration(pos, { x: 0, z: 0 }, [playerWell], SURGE_S, {
    mass: 8, type: 'pickup', marked: false,
  }, { ax: 0, az: 0 });
  const stacked = sampleFieldAcceleration(pos, { x: 0, z: 0 }, [playerWell, belt], SURGE_S, {
    mass: 8, type: 'pickup', marked: false,
  }, { ax: 0, az: 0 });
  const wellMag = Math.hypot(wellOnly.ax, wellOnly.az);
  const stackedMag = Math.hypot(stacked.ax, stacked.az);
  assert.ok(stackedMag > wellMag + 8, `the belt amplifies a stacked well (${wellMag.toFixed(1)} → ${stackedMag.toFixed(1)})`);

  assert.equal(weatherScanScale(VEIL_WEATHER_SECTOR_ID, pos, SURGE_S), WEATHER_SCAN_SCALE_INSIDE);
  assert.equal(weatherScanScale(VEIL_WEATHER_SECTOR_ID, pos, 9), 1, 'calm restores scan');
  assert.equal(weatherScanScale(VEIL_WEATHER_SECTOR_ID, BELT.field.center, SURGE_S), 1,
    'the hole inside the belt is not the sensor wash');
});

test('runtime registers Veil weather during surge without a Cinder site', () => {
  const events = [];
  const fields = {
    byId: Object.create(null),
    registerEnvironmental(spec) { this.byId[spec.id] = { ...spec }; return this.byId[spec.id]; },
    updateExternal(id, patch) { Object.assign(this.byId[id], patch); return this.byId[id]; },
    unregisterExternal(id) { const had = !!this.byId[id]; delete this.byId[id]; return had; },
    hasExternal(id) { return !!this.byId[id]; },
  };
  const pos = alongPoint(STORM, 90, 20);
  const state = {
    mode: 'flight', tick: 0, simTime: SURGE_S, playerId: 1,
    world: { currentSectorId: VEIL_WEATHER_SECTOR_ID },
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos }]]),
    sites: { worldOrder: [], worldById: {} },
  };
  const bus = { on() { return () => {}; }, emit(name, payload) { events.push({ name, payload }); } };
  const system = Object.create(environmentalMachinery);
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    system.init({ state, bus, registry: { get(name) { return name === 'fields' ? fields : null; } } });
    system.update(1 / 60, state);
    const storm = fields.byId[STORM.field.id];
    const belt = fields.byId[BELT.field.id];
    assert.ok(storm && storm.strength > 0, 'storm writes force during surge');
    assert.equal(storm.kind, 'sheet');
    assert.ok(belt && belt.kind === 'well');
    assert.ok(events.some((entry) => entry.name === 'hazard:enter' && entry.payload.zoneId === STORM.id));
  } finally {
    system.destroy();
    FIELD_FLAGS.enabled = previous;
  }
});
