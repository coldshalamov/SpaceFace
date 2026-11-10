// Row 292. Seed 4242. A click on the radar's unresolved ping sets the named course.
// An empty click does not. An off-sector ping and a rumored wreck position are absent.

import test from 'node:test';
import assert from 'node:assert/strict';

import { projectRadarPoint, tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';
import { createRadar, radarDialCourse, radarPingCourses } from '../src/ui/radar.js';

const SEED = 4242;

function seedState() {
  return {
    meta: { seed: SEED },
    world: {
      currentSectorId: 'helios',
      scanPings: {
        helios: [{ id: 'signal:4242-a', pos: { x: 400, z: -200 }, kind: 'unknown' }],
        ceres: [{ id: 'signal:4242-off', pos: { x: 9, z: 9 }, kind: 'unknown' }],
      },
    },
    player: {
      uniqueWrecks: {
        bearings: {
          wreck_rumor: {
            sectorId: 'helios',
            name: 'Rumored hull',
            phase: 'rumored',
            bearingCenter: { x: 100, z: 100 },
            radius: 80,
            exactPos: { x: 50, z: 50 },
          },
        },
      },
    },
  };
}

test('seed 4242 radar click on the ping sets the unresolved course', () => {
  const state = seedState();
  assert.equal(state.meta.seed, SEED);
  const courses = radarPingCourses(state);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].label, 'Unresolved contact');
  assert.equal(courses[0].arrivalRadius, 44);
  assert.equal(courses[0].targetEntityId, 'signal:4242-a');
  assert.deepEqual(courses[0].pos, { x: 400, z: -200 });
  assert.ok(!courses.some((row) => row.pos.x === 50 && row.pos.z === 50));

  const metrics = tacticalRadarMetrics(false);
  const projected = projectRadarPoint({ x: 0, z: 0 }, courses[0].pos, 4000, metrics);
  assert.ok(projected && !projected.offRange);
  const hit = radarDialCourse(state, { x: 0, z: 0 }, 4000, metrics, projected.x, projected.y);
  assert.equal(hit && hit.label, 'Unresolved contact');
  assert.deepEqual(hit.pos, { x: 400, z: -200 });

  const miss = radarDialCourse(state, { x: 0, z: 0 }, 4000, metrics, projected.x + 40, projected.y);
  assert.equal(miss, null);
  assert.match(createRadar.toString(), /radarDialCourse/);
});
