// SFQ-I041 — a chart mark uses the position the pilot has actually earned.
//
// Seed 4242. The rumor case is a unique-wreck bearing (center/radius until a scan
// writes fixedPos once). The moved-object case is an aftermath wreck whose body
// has drifted away from the kill point the durable marker still stores.
//
// Run: node --test test/infer-p11-marker-discovered-position.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  aftermathChartMarkers,
  buildSystemModel,
} from '../src/ui/galaxyMap.js';

const SEED = 4242;
const SECTOR_ID = 'sector_helios_prime';
const TRUE_POS = { x: 900, z: -400 };
const RUMOR_CENTER = { x: 200, z: 80 };
const KILL_POS = { x: 100, z: 40 };
const DRIFTED_POS = { x: 460, z: -220 };

function chartState() {
  const state = createGameState(SEED);
  state.world.currentSectorId = SECTOR_ID;
  state.player.uniqueWrecks = {
    bearings: {
      wreck_chart_rumor: {
        wreckId: 'wreck_chart_rumor',
        name: 'Unfixed Hulk',
        sectorId: SECTOR_ID,
        phase: 'rumored',
        bearingCenter: { ...RUMOR_CENTER },
        radius: 480,
        exactPos: { ...TRUE_POS },
        fixedPos: null,
      },
    },
  };
  state.aftermathWrecks = {
    schemaVersion: 1,
    bySector: {
      [SECTOR_ID]: [{
        markerId: 'aft-drift-1',
        sectorId: SECTOR_ID,
        pos: { ...KILL_POS },
        victimLabel: 'Drifted Hauler',
      }],
    },
  };
  return state;
}

function drawnBearing(state) {
  const bearing = buildSystemModel(state, SECTOR_ID).bearings
    .find((row) => row.wreckId === 'wreck_chart_rumor');
  assert.ok(bearing, 'the chart lists the wreck bearing');
  return bearing.drawFixedPos || bearing.drawCenter;
}

function wreckMark(state) {
  const mark = aftermathChartMarkers(state, SECTOR_ID)
    .find((row) => row.markerId === 'aft-drift-1');
  assert.ok(mark, 'the chart lists the aftermath wreck');
  return { x: mark.x, z: mark.z };
}

test('an undiscovered wreck mark is the rumor, then the fix, exactly once', () => {
  const state = chartState();
  const before = drawnBearing(state);
  assert.deepEqual(before, RUMOR_CENTER);
  assert.notDeepEqual(before, TRUE_POS, 'a rumor must not sit on the true wreck');

  const record = state.player.uniqueWrecks.bearings.wreck_chart_rumor;
  record.phase = 'fixed';
  record.fixedPos = { ...TRUE_POS };
  const discovered = drawnBearing(state);
  assert.deepEqual(discovered, TRUE_POS);

  record.exactPos = { x: 50, z: 50 };
  const again = drawnBearing(state);
  assert.deepEqual(again, TRUE_POS, 'a second read does not move a fix already earned');
});

test('a drifted wreck is drawn where the body is, not where it was killed', () => {
  const state = chartState();
  assert.deepEqual(wreckMark(state), KILL_POS, 'with no live body the chart keeps the recorded point');

  const body = {
    id: 7,
    alive: true,
    type: 'wreck',
    pos: { ...DRIFTED_POS },
    data: {
      markerId: 'aft-drift-1',
      provenance: { markerId: 'aft-drift-1' },
    },
  };
  state.entities.set(body.id, body);
  state.entityList.push(body);
  assert.deepEqual(wreckMark(state), DRIFTED_POS);
  const plotted = buildSystemModel(state, SECTOR_ID).points
    .find((point) => point.markerId === 'aft-drift-1');
  assert.deepEqual({ x: plotted.x, z: plotted.z }, DRIFTED_POS);
  assert.deepEqual(
    state.aftermathWrecks.bySector[SECTOR_ID][0].pos,
    KILL_POS,
    'the chart read must not rewrite the durable kill record',
  );

  state.entities.delete(body.id);
  state.entityList.pop();
  assert.deepEqual(wreckMark(state), KILL_POS, 'once the body is gone the recorded point returns');
});
