import test from 'node:test';
import assert from 'node:assert/strict';

import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { uniqueWreckMapReadouts } from '../src/ui/uniqueWreckMapLayer.js';
import {
  buildGalaxyModel,
  buildLocalModel,
  buildSystemModel,
  mapTargetPriority,
} from '../src/ui/galaxyMap.js';

const SECTOR_ID = 'sector_helios_prime';
const WRECK_ID = 'wreck_choir_tender';

function stateWith(record = null) {
  return {
    player: {
      uniqueWrecks: {
        bearings: record ? { [record.wreckId]: record } : {},
      },
    },
  };
}

function bearing(overrides = {}) {
  return {
    wreckId: WRECK_ID,
    name: 'Choir-Tender',
    sectorId: SECTOR_ID,
    phase: 'rumored',
    bearingCenter: { x: 4128, z: -304 },
    radius: 360,
    exactPos: { x: 4240, z: -448 },
    fixedPos: null,
    ...overrides,
  };
}

test('unique wreck map readouts expose no knowledge before a rumor is read', () => {
  assert.deepEqual(uniqueWreckMapReadouts({}, SECTOR_ID), []);
  assert.deepEqual(uniqueWreckMapReadouts(stateWith(), SECTOR_ID), []);
});

test('rumored wreck readout exposes only a fuzzy ring and cannot set a course', () => {
  const [readout] = uniqueWreckMapReadouts(stateWith(bearing()), SECTOR_ID);

  assert.deepEqual(readout.center, { x: 4128, z: -304 });
  assert.equal(readout.radius, 360);
  assert.equal(readout.phase, 'rumored');
  assert.equal(readout.fixedPos, null);
  assert.equal(readout.courseTarget, null);
  assert.equal('exactPos' in readout, false, 'rumor projection must not disclose the exact wreck position');
  assert.equal(JSON.stringify(readout).includes('???'), false);
});

test('fixed wreck readout exposes a global_v1 point and canonical bearing target', () => {
  const [readout] = uniqueWreckMapReadouts(stateWith(bearing({
    phase: 'fixed',
    fixedPos: { x: 4240, z: -448 },
  })), SECTOR_ID);

  assert.deepEqual(readout.fixedPos, { x: 4240, z: -448 });
  assert.deepEqual(readout.courseTarget, {
    kind: 'bearing',
    id: WRECK_ID,
    name: 'Choir-Tender',
    x: 4240,
    z: -448,
  });
});

test('unique wreck map readouts filter by sector and never mutate saved knowledge', () => {
  const state = stateWith(bearing());
  const before = structuredClone(state);

  assert.deepEqual(uniqueWreckMapReadouts(state, 'sector_veil_nebula'), []);
  uniqueWreckMapReadouts(state, SECTOR_ID);
  assert.deepEqual(state, before);
});

test('unified map models carry only post-read bearing knowledge at every scale', () => {
  const localCenter = { x: 120, z: -70 };
  const localFixed = { x: 180, z: -110 };
  const globalCenter = sectorLocalToGlobalForSector(localCenter, 'sector_veil_nebula');
  const globalFixed = sectorLocalToGlobalForSector(localFixed, 'sector_veil_nebula');
  const state = stateWith(bearing({
    wreckId: 'wreck_isc_vigilant',
    name: 'Veil-Cutter',
    sectorId: 'sector_veil_nebula',
    phase: 'fixed',
    bearingCenter: globalCenter,
    exactPos: globalFixed,
    fixedPos: globalFixed,
  }));
  state.world = { currentSectorId: 'sector_veil_nebula' };

  const galaxy = buildGalaxyModel(state);
  assert.equal(galaxy.nodes.find((node) => node.id === 'sector_veil_nebula').bearingCount, 1);

  const system = buildSystemModel(state, 'sector_veil_nebula');
  assert.deepEqual(system.bearings[0].drawCenter, localCenter);
  assert.deepEqual(system.bearings[0].drawFixedPos, localFixed);
  assert.deepEqual(
    { x: system.bearings[0].courseTarget.x, z: system.bearings[0].courseTarget.z },
    globalFixed,
    'system drawing converts to sector-local without corrupting global course coordinates',
  );

  const local = buildLocalModel(state);
  assert.deepEqual(local.bearings[0].fixedPos, globalFixed);
});

test('fixed bearing targets win hit-testing over broad ambient regions', () => {
  assert.equal(mapTargetPriority({ kind: 'bearing' }) > mapTargetPriority({ kind: 'zone' }), true);
});
