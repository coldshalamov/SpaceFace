// Row 289 PB-WIRE-PING. Seed 4242. The system chart turns a scanner ping into the
// same named course the local map already uses, via discoveryKnowledge. A rumored
// wreck's exact position is not that course, and an off-sector ping is absent.

import test from 'node:test';
import assert from 'node:assert/strict';

import { canNavigateToKnowledge, discoveryKnowledge } from '../src/ui/sim/discoveryKnowledge.js';
import { chartPingCourseTargets, resolveCourseTarget } from '../src/ui/galaxyMap.js';

const SEED = 4242;

function seedState() {
  return {
    meta: { seed: SEED },
    world: {
      currentSectorId: 'helios',
      scanPings: {
        helios: [{ id: 'signal:4242-a', pos: { x: 1800, z: -700 }, kind: 'unknown' }],
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
            bearingCenter: { x: 400, z: 400 },
            radius: 800,
            exactPos: { x: 50, z: 50 },
          },
        },
      },
    },
  };
}

test('seed 4242 chart ping course is the unresolved contact, not the wreck', () => {
  const state = seedState();
  assert.equal(state.meta.seed, SEED);
  const knowledge = discoveryKnowledge(state);
  const ping = knowledge.entries.find((entry) => entry.source === 'ping' && entry.sectorId === 'helios');
  assert.ok(ping);
  assert.equal(ping.tier, 'ping');
  assert.equal(canNavigateToKnowledge(ping), false);
  assert.equal(ping.pos.x, 1800);
  assert.equal(ping.pos.z, -700);

  const targets = chartPingCourseTargets(state, 'helios');
  assert.equal(targets.length, 1);
  assert.equal(targets[0].x, 1800);
  assert.equal(targets[0].z, -700);
  assert.equal(targets[0].targetEntityId, 'signal:4242-a');
  assert.ok(!targets.some((row) => row.x === 50 && row.z === 50));

  const course = resolveCourseTarget(targets[0]);
  assert.equal(course.type, 'ping');
  assert.equal(course.label, 'Unresolved contact');
  assert.equal(course.arrivalRadius, 44);
  assert.deepEqual(course.pos, { x: 1800, z: -700 });

  assert.deepEqual(chartPingCourseTargets(state, 'ceres').map((row) => row.targetEntityId), ['signal:4242-off']);
  assert.equal(resolveCourseTarget({ kind: 'rumor', x: 50, z: 50, courseDisabled: true }), null);
});
