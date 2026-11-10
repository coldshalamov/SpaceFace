import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import {
  stationServices,
  planYardClients,
  yardOccupancy,
  yardPadsFor,
  yardCrewsFor,
} from '../src/systems/stationServices.js';

const SEED = 4242;
const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';

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

function dock(h) {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = STATION;
  h.player.flags.docked = true;
  h.bus.emit('dock:docked', { stationId: STATION });
}

test('4242: a reserved Helios pad stays the player’s when the next client arrives', () => {
  const visits = planYardClients(SEED, SECTOR, 0, STATION, 'L');
  const pads = yardPadsFor('L');
  const crews = yardCrewsFor('L');
  const open = yardOccupancy(visits, pads, crews, 342);
  const held = yardOccupancy(visits, pads, crews, 342, 0);
  const omitted = yardOccupancy(visits, pads, crews, 342, -1);
  assert.equal(open.berthed[0].padIdx, 0);
  assert.equal(omitted.berthed[0].padIdx, 0);
  assert.equal(held.berthed[0].padIdx, 1);

  const h = harness(0);
  dock(h);
  h.state.simTime = 1;
  h.yard.update(1, h.state);
  const pad = h.state.stationServices.player.padIdx;
  assert.equal(pad, 0);
  h.state.simTime = 342;
  h.yard.update(1, h.state);
  const board = h.state.stationServices.stations[STATION].pads;
  assert.equal(board[pad].occupant, 'player');
  assert.ok(board.some((slot, index) => index !== pad && slot.occupant && slot.occupant.startsWith(`${STATION}#`)));
  h.yard.destroy();
});
