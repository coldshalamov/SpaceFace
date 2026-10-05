// Row 289 PB-WIRE-PING. Seed 4242. The system chart (the view that opens) turns a
// scanner ping into the same named course the local map already uses. The diamond
// is drawn in sector-local coordinates; the click keeps the global position. A
// rumored wreck's exact position is not that course, and an off-sector ping is absent.

import test from 'node:test';
import assert from 'node:assert/strict';

import { globalToSectorLocalForSector, sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { canNavigateToKnowledge, discoveryKnowledge } from '../src/ui/sim/discoveryKnowledge.js';
import {
  chartPingCourseTargets,
  galaxyMapScreen,
  resolveCourseTarget,
} from '../src/ui/galaxyMap.js';

const SEED = 4242;
const SECTOR = 'sector_tethys_junction';
const GLOBAL = { x: 14088, z: 7492 };

function seedState() {
  return {
    meta: { seed: SEED },
    world: {
      currentSectorId: SECTOR,
      scanPings: {
        [SECTOR]: [{ id: 'signal:4242-a', pos: { ...GLOBAL }, kind: 'unknown' }],
        sector_ceres_belt: [{ id: 'signal:4242-off', pos: { x: 9, z: 9 }, kind: 'unknown' }],
      },
    },
    player: {
      uniqueWrecks: {
        bearings: {
          wreck_rumor: {
            sectorId: SECTOR,
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

function chartPen() {
  const bag = {};
  return new Proxy(bag, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return () => ({ width: 40 });
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => chartPen();
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

test('seed 4242 system chart click is the unresolved contact, not the wreck', () => {
  globalThis.Path2D = class Path2D {
    constructor() {}
  };
  const state = seedState();
  assert.equal(state.meta.seed, SEED);
  const origin = sectorGlobalOrigin(SECTOR);
  const local = globalToSectorLocalForSector(GLOBAL, SECTOR);
  assert.notDeepEqual(local, GLOBAL);
  assert.equal(local.x, GLOBAL.x - origin.x);
  assert.equal(local.z, GLOBAL.z - origin.z);

  const knowledge = discoveryKnowledge(state);
  const ping = knowledge.entries.find((entry) => entry.source === 'ping' && entry.sectorId === SECTOR);
  assert.ok(ping);
  assert.equal(ping.tier, 'ping');
  assert.equal(canNavigateToKnowledge(ping), false);

  const targets = chartPingCourseTargets(state, SECTOR);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].targetEntityId, 'signal:4242-a');
  assert.ok(!targets.some((row) => row.x === 50 && row.z === 50));
  assert.deepEqual(chartPingCourseTargets(state, 'sector_ceres_belt').map((row) => row.targetEntityId), ['signal:4242-off']);
  assert.equal(resolveCourseTarget({ kind: 'rumor', x: 50, z: 50, courseDisabled: true }), null);

  const host = Object.create(galaxyMapScreen);
  host._clickTargets = [];
  host._layers = { ...galaxyMapScreen._layers, discovery: true, holdings: false, route: false, market: false };
  host._ctx = { state, registry: { get() { return null; } } };
  host._canvas = null;
  host._root = null;
  host._camera = null;
  host._zoom = 2;
  host._selectedTarget = null;
  host._hoverTarget = null;
  host._reduceMotion = true;
  host._animT = 0;
  host._pointer = null;
  host._line = null;
  host._cams = {
    galaxy: { cx: 0, cy: 0, zoom: 1 },
    system: { cx: 0, cy: 0, zoom: 1.5 },
    local: { cx: 0, cy: 0, zoom: 1.5 },
  };
  let drawError = null;
  try {
    host._drawSystem(chartPen(), state, 800, 600);
  } catch (err) {
    drawError = err;
  }

  const click = host._clickTargets.find((row) => row && row.kind === 'ping');
  assert.equal(drawError, null, drawError && drawError.stack);
  assert.ok(click, 'system draw pushed no ping click');
  assert.equal(click.targetEntityId, 'signal:4242-a');
  assert.deepEqual({ x: click.x, z: click.z }, GLOBAL);
  assert.notDeepEqual({ x: click.x, z: click.z }, local);
  assert.equal(Number.isFinite(click.sx) && Number.isFinite(click.sy), true);
  const course = resolveCourseTarget(click);
  assert.equal(course.label, 'Unresolved contact');
  assert.equal(course.arrivalRadius, 44);
  assert.deepEqual(course.pos, GLOBAL);
  assert.ok(!host._clickTargets.some((row) => row && row.x === 50 && row.z === 50));
});
