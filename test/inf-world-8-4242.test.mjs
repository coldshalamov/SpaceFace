import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import {
  stationServices,
  planYardClients,
  yardVisitsCovering,
} from '../src/systems/stationServices.js';

const SEED = 4242;
const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const NOW = 1801;

function harness(simTime) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, flags: { docked: false },
  };
  const state = {
    playerId: 'player',
    player: { credits: 1000, flags: {} },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    fuel: { current: 40, max: 100 },
    meta: { seed: SEED },
    factions: { faction_scn: { rep: 0 } },
    ui: { docked: false, dockedStationId: null },
    world: { currentSectorId: SECTOR },
    content: {},
    simTime,
    tick: 0,
  };
  const bus = createBus();
  const yard = Object.create(stationServices);
  yard.init({ state, bus, registry: { get: () => null }, helpers: {} });
  return { state, bus, yard, player };
}

test('4242: an overnight Helios hauler is still on the board after the day rolls', () => {
  const covering = yardVisitsCovering(SEED, SECTOR, STATION, 'L', NOW);
  const today = planYardClients(SEED, SECTOR, 3, STATION, 'L');
  assert.ok(covering.some((visit) => visit.id.startsWith(`${STATION}#2#`)));
  assert.equal(today.some((visit) => String(visit.id).includes('#2#')), false);
  assert.ok(covering.some((visit) => visit.id === `${STATION}#2#1` && visit.departAt > NOW));

  const h = harness(NOW);
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = STATION;
  h.player.flags.docked = true;
  h.bus.emit('dock:docked', { stationId: STATION });
  const board = h.state.stationServices.stations[STATION].pads;
  assert.ok(board.some((slot) => slot.occupant && slot.occupant.startsWith(`${STATION}#2#`)));
  h.yard.destroy();
});
