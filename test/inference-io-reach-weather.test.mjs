// Io Reach weather — the contested floor's war is visible as standing weather: a debris
// current off the hulls that died crossing the southern approach, and a radiation belt off
// the west holdings. Both move mass through the field kernel (shots bend, hulls drift);
// the belt shrinks world POI scan, same as the Veil and Vesta belts.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IO_REACH_WEATHER_SECTOR_ID,
  WEATHER_SCAN_SCALE_INSIDE,
  WEATHER_SECTOR_IDS,
  WEATHER_VOLUMES,
  pointInsideWeatherVolume,
  weatherPhase,
  weatherScanScale,
  weatherVolumesForSector,
} from '../src/data/environmentalMachinery.js';
import { FRONTIER_ANCHORS } from '../src/data/frontierRegions/index.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';

const STORM = WEATHER_VOLUMES.find((v) => v.id === 'io_reach_storm_lane');
const BELT = WEATHER_VOLUMES.find((v) => v.id === 'io_reach_radiation_belt');

test('Io Reach weather: both volumes exist, belong to the sector, and use proven roles', () => {
  assert.ok(STORM, 'io_reach_storm_lane volume must exist');
  assert.ok(BELT, 'io_reach_radiation_belt volume must exist');
  assert.equal(STORM.sectorId, IO_REACH_WEATHER_SECTOR_ID);
  assert.equal(BELT.sectorId, IO_REACH_WEATHER_SECTOR_ID);
  assert.equal(STORM.role, 'storm');
  assert.equal(BELT.role, 'radiation_belt');
  assert.equal(STORM.hazardType, 'debris_current');
  assert.equal(BELT.hazardType, 'nebula');
});

test('Io Reach weather: volumes sit clear of stations, gates, fields, and named POIs', () => {
  const anchors = SECTOR_ANCHORS[IO_REACH_WEATHER_SECTOR_ID]
    || (FRONTIER_ANCHORS && FRONTIER_ANCHORS[IO_REACH_WEATHER_SECTOR_ID]);
  assert.ok(anchors, 'Io Reach anchors must exist');
  const occupied = [
    ...anchors.stations.map((s) => s.pos),
    ...anchors.gates.map((g) => g.pos),
    ...anchors.fields.map((f) => f.center),
    ...anchors.pois.map((p) => p.pos),
  ];
  for (const volume of [STORM, BELT]) {
    for (const pos of occupied) {
      const distance = Math.hypot(pos.x - volume.localPos.x, pos.z - volume.localPos.z);
      assert.ok(
        distance >= volume.field.radius,
        `${volume.id} at (${volume.localPos.x}, ${volume.localPos.z}) must clear anchors by its own radius; nearest is ${distance.toFixed(0)} WU`,
      );
    }
  }
});

test('Io Reach weather: phases cycle and the sector slice resolves both volumes', () => {
  const slice = weatherVolumesForSector(IO_REACH_WEATHER_SECTOR_ID);
  assert.equal(slice.length, 2);
  for (const simTime of [0, 37, 113, 600, 4242]) {
    for (const volume of slice) {
      const phase = weatherPhase(volume, simTime);
      assert.ok(['warning', 'surge', 'calm'].includes(phase.phase), `phase names a real stage at t=${simTime}`);
      assert.ok(Number.isFinite(phase.remainingS) && phase.remainingS >= 0);
    }
  }
});

test('Io Reach weather: scan scale dips inside the belt and holds 1 outside', () => {
  // The belt is an annulus: innerRadius is the quiet eye, the ring between innerRadius and
  // radius is the weather. Sample inside the ring, not at the center.
  const ringDist = (BELT.field.innerRadius + BELT.field.radius) / 2;
  const insidePoint = {
    x: BELT.globalPos.x + ringDist,
    z: BELT.globalPos.z,
  };
  assert.ok(pointInsideWeatherVolume(BELT, insidePoint), 'the ring reads inside the belt');
  assert.equal(pointInsideWeatherVolume(BELT, BELT.globalPos), false, 'the eye stays clear');
  const scale = weatherScanScale(IO_REACH_WEATHER_SECTOR_ID, insidePoint, 3); // t=3 is surge
  assert.equal(scale, WEATHER_SCAN_SCALE_INSIDE, 'inside the ring, POI scan shrinks');
  const far = {
    x: BELT.globalPos.x + (BELT.field.radius + 400),
    z: BELT.globalPos.z,
  };
  const outside = weatherScanScale(IO_REACH_WEATHER_SECTOR_ID, far, 3);
  assert.equal(outside, 1, 'outside every volume, scan scale is 1');
});

test('Io Reach weather: Io joins Veil and Vesta as the third weather sector', () => {
  assert.ok(WEATHER_SECTOR_IDS.has(IO_REACH_WEATHER_SECTOR_ID), 'Io Reach is a weather sector');
  assert.ok(WEATHER_SECTOR_IDS.has('sector_veil_nebula'), 'Veil remains a weather sector');
  assert.ok(WEATHER_SECTOR_IDS.has('sector_vesta_forge'), 'Vesta remains a weather sector');
  assert.equal(WEATHER_SECTOR_IDS.size, 3, 'the weather roster grows deliberately, not by sprawl');
});
