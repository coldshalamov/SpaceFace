// Seed 4242 — a full drone hold hails the catalog station, not a nameless "depot".
import test from 'node:test';
import assert from 'node:assert/strict';

import { tickProgram, resolveStationDisplayName } from '../src/systems/alphabet.js';

test('a full hold in Io Reach hails Reach Station by name', () => {
  const station = {
    id: 7, type: 'station', alive: true, pos: { x: 40, z: 0 }, radius: 70,
    data: { stationId: 'station_reach' },
  };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const entities = new Map([[1, player], [7, station]]);
  const toasts = [];
  const state = {
    simTime: 8,
    tick: 480,
    meta: { seed: 4242 },
    playerId: 1,
    entities,
    entityList: [player, station],
    player: { cargo: { usedVolume: 20, capVolume: 20, items: {} } },
    world: {
      currentSectorId: 'sector_io_reach',
      alienEcology: { machineProtocol: 'seen' },
    },
    rng: { next() { return 0.42; } },
  };
  const group = {
    id: 'g-reach',
    sectorId: 'sector_io_reach',
    originPos: { x: 0, z: 0 },
    entityIds: [],
    program: {
      templateId: 'scout_report',
      reaction: 'drop_beacon_and_hail_on_cargo_full',
    },
    programState: { pc: 0, waitT: 0, cargoWasFull: false, reactionLatched: false },
  };
  const ctx = {
    state,
    group,
    bus: { emit(name, payload) { if (name === 'toast') toasts.push(payload); } },
    steerTo() { return true; },
  };
  assert.equal(tickProgram(group, ctx, 1 / 60), true);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'Drone group cargo full — hailing Reach Station');
  assert.equal(toasts[0].text.includes('depot station'), false);

  const named = { ...station, name: 'The Pit' };
  assert.equal(
    resolveStationDisplayName(state, 'station_reach', { entity: named, stationId: 'station_reach' }),
    'The Pit',
  );
  assert.equal(resolveStationDisplayName(state, 'station_missing'), 'depot station');
});
