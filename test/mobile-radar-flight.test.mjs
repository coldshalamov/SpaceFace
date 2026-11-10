import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRadarPoint } from '../src/ui/map/tacticalMapGrammar.js';
import { MOBILE_RADAR_METRICS, radarDialCourse, radarPingCourses } from '../src/ui/radar.js';

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



test('mobile radar coordinates select the same contact at the actual compact face size', () => {
  const state = seedState();
  const course = radarPingCourses(state)[0];
  const player = { x: 0, z: 0 };
  const point = projectRadarPoint(player, course.pos, 4000, MOBILE_RADAR_METRICS);
  assert.equal(radarDialCourse(state, player, 4000, MOBILE_RADAR_METRICS, point.x, point.y)?.targetEntityId, course.targetEntityId);
  const corner = MOBILE_RADAR_METRICS.size - 6;
  assert.equal(radarDialCourse(state, player, 4000, MOBILE_RADAR_METRICS, corner, corner), null,
    'a tap outside the native compact face selects no contact');
});
