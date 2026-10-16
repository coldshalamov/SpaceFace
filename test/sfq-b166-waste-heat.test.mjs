import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES, ecologyMissionsForSite } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import {
  HEAT_OFF,
  HEAT_ON,
  HEAT_SITE_ID,
  stepWasteHeat,
  wasteHeatSupport,
} from '../src/data/wasteHeat.js';
import {
  deserializeAlienEcologyState,
  handleAlienEcologyEvent,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';
import { commsToastSpec } from '../src/ui/floatingText.js';

const ship = ALIEN_SITES.warm_freighter;
const CLOSE = ship.arrivalBands.close;
const MISSIONS = ecologyMissionsForSite(ship.siteId).map((mission) => mission.id).sort();

function worldAt(x, z) {
  const state = {
    meta: { seed: 7 },
    simTime: 10,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {} } },
    factions: { faction_free: { rep: 0 } },
    missions: { boards: { station_field_desk: { slots: [] } }, active: [] },
    world: {
      currentSectorId: ship.sectorId,
      sectors: {
        [ship.sectorId]: {
          id: ship.sectorId,
          factionId: 'faction_free',
          stations: [{
            id: 'station_field_desk',
            services: ['missions'],
            factionId: 'faction_free',
          }],
        },
      },
      rng: () => 0.2,
    },
    rng: () => 0.2,
  };
  const events = [];
  const player = {
    id: 1, type: 'player', alive: true, pos: { x, z }, vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const world = {
    state,
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: {
      emit: (type, payload) => {
        events.push({ type, payload });
        if (type === 'mission:offered' && payload && payload.stationId) {
          const board = state.missions.boards[payload.stationId];
          if (board && !board.slots.some((slot) => slot && slot.id === payload.id)) {
            board.slots.push({ id: payload.id });
          }
        }
      },
    },
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
  };
  return { state, world, events, player };
}

function move(pack, x, z) {
  pack.player.pos.x = x;
  pack.player.pos.z = z;
}

function heatLogs(events) {
  return events.filter((e) => e.type === 'comms:log' && e.payload
    && (e.payload.text === HEAT_ON || e.payload.text === HEAT_OFF));
}

function recOf(state) {
  return ensureAlienEcologyState(state).sites[ship.siteId] || null;
}

function onlineOf(state) {
  const rec = recOf(state);
  return !(rec && rec.heatOnline === false);
}

function offered(state) {
  return state.missions.boards.station_field_desk.slots.map((slot) => slot.id).sort();
}

test('waste heat shelters the cysts and holds the eels, and cutting it swaps that', () => {
  assert.equal(ship.siteId, HEAT_SITE_ID);
  assert.equal(ship.faunaCast.lantern_cyst > 0, true);
  assert.equal(ship.faunaCast.wake_eel > 0, true);
  assert.equal(ship.faunaCast.hull_leech > 0, true);
  assert.ok(MISSIONS.includes('em_bio_survey_warm_freighter'));
  const on = wasteHeatSupport(true);
  const off = wasteHeatSupport(false);
  assert.equal(on.intent, null);
  assert.equal(off.intent, null);
  assert.equal(on.actors.lantern_cyst.helped, true);
  assert.equal(on.actors.lantern_cyst.hurt, false);
  assert.equal(on.actors.wake_eel.helped, false);
  assert.equal(on.actors.wake_eel.hurt, true);
  assert.equal(on.actors.hull_leech.helped, false);
  assert.equal(on.actors.hull_leech.hurt, false);
  assert.equal(off.actors.lantern_cyst.hurt, true);
  assert.equal(off.actors.wake_eel.helped, true);
  assert.equal(off.actors.hull_leech.helped, false);
  assert.equal(off.actors.hull_leech.hurt, false);
  assert.deepEqual(stepWasteHeat(true, 'arrive'), { online: true, text: HEAT_ON });
  assert.deepEqual(stepWasteHeat(false, 'arrive'), { online: false, text: HEAT_OFF });
  assert.deepEqual(stepWasteHeat(true, 'cut'), { online: false, text: HEAT_OFF });
  assert.deepEqual(stepWasteHeat(false, 'cut'), { online: true, text: HEAT_ON });
  assert.deepEqual(stepWasteHeat(true, 'wait'), { online: true, text: null });
  const onNotice = commsToastSpec({ from: ship.name, kind: 'ecology', text: HEAT_ON }).text;
  const offNotice = commsToastSpec({ from: ship.name, kind: 'ecology', text: HEAT_OFF }).text;
  assert.equal(onNotice.includes('...'), false);
  assert.equal(offNotice.includes('...'), false);
  assert.equal(onNotice.toLowerCase().includes('cysts live in the waste heat'), true);
  assert.equal(onNotice.toLowerCase().includes('eels are held'), true);
  assert.equal(offNotice.toLowerCase().includes('cysts lose the heat'), true);
  assert.equal(offNotice.toLowerCase().includes('eels are no longer held'), true);
});

test('a scan cuts the standby, a reload keeps it, and the survey stays posted', () => {
  const outside = { x: ship.center.x + CLOSE * 2, z: ship.center.z };
  const inside = { x: ship.center.x, z: ship.center.z };
  const onRadius = { x: ship.center.x + CLOSE, z: ship.center.z };
  const wantOffers = MISSIONS.map((id) => `ecology_${id}`);

  const first = worldAt(outside.x, outside.z);
  tickAlienEcology(first.world, 30);
  assert.equal(onlineOf(first.state), true);
  assert.equal(heatLogs(first.events).length, 0);

  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  assert.equal(onlineOf(first.state), true);
  assert.deepEqual(heatLogs(first.events).map((e) => e.payload.text), [HEAT_ON]);
  assert.equal(wasteHeatSupport(onlineOf(first.state)).actors.lantern_cyst.helped, true);
  assert.equal(wasteHeatSupport(onlineOf(first.state)).actors.wake_eel.hurt, true);
  assert.ok(wantOffers.every((id) => offered(first.state).includes(id)));

  tickAlienEcology(first.world, 40);
  assert.equal(heatLogs(first.events).length, 1);
  assert.equal(onlineOf(first.state), true);

  const heldOn = worldAt(inside.x, inside.z);
  deserializeAlienEcologyState(heldOn.state, serializeAlienEcologyState(first.state));
  tickAlienEcology(heldOn.world, 0.5);
  assert.equal(onlineOf(heldOn.state), true);
  assert.equal(heatLogs(heldOn.events).length, 0);

  move(first, onRadius.x, onRadius.z);
  tickAlienEcology(first.world, 30);
  assert.equal(onlineOf(first.state), true);
  assert.equal(recOf(first.state).heatEdge, false);
  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: ship.sectorId });
  assert.equal(onlineOf(first.state), true);

  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: ship.sectorId });
  assert.equal(onlineOf(first.state), false);
  assert.equal(heatLogs(first.events).filter((e) => e.payload.text === HEAT_OFF).length, 1);
  assert.equal(wasteHeatSupport(false).actors.lantern_cyst.hurt, true);
  assert.equal(wasteHeatSupport(false).actors.wake_eel.helped, true);
  assert.equal(wasteHeatSupport(false).actors.hull_leech.hurt, false);
  tickAlienEcology(first.world, 40);
  assert.equal(onlineOf(first.state), false);
  assert.equal(heatLogs(first.events).filter((e) => e.payload.text === HEAT_OFF).length, 1);

  const heldOff = worldAt(inside.x, inside.z);
  deserializeAlienEcologyState(heldOff.state, serializeAlienEcologyState(first.state));
  tickAlienEcology(heldOff.world, 0.5);
  assert.equal(onlineOf(heldOff.state), false);
  assert.equal(heatLogs(heldOff.events).length, 0);

  const posted = worldAt(inside.x, inside.z);
  const blob = serializeAlienEcologyState(first.state);
  blob.sites[ship.siteId].offersEmitted = {};
  deserializeAlienEcologyState(posted.state, blob);
  tickAlienEcology(posted.world, 0.5);
  assert.equal(onlineOf(posted.state), false);
  assert.equal(heatLogs(posted.events).length, 0);
  assert.ok(wantOffers.every((id) => offered(posted.state).includes(id)));

  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: ship.sectorId });
  assert.equal(onlineOf(first.state), true);
  assert.equal(heatLogs(first.events).filter((e) => e.payload.text === HEAT_ON).length, 3);
  tickAlienEcology(first.world, 0.5);
  assert.equal(onlineOf(first.state), true);

  move(first, onRadius.x, onRadius.z);
  tickAlienEcology(first.world, 0.5);
  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  assert.equal(onlineOf(first.state), true);
  assert.equal(heatLogs(first.events).filter((e) => e.payload.text === HEAT_ON).length, 4);

  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: ship.sectorId });
  move(first, outside.x, outside.z);
  tickAlienEcology(first.world, 30);
  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: ship.sectorId });
  assert.equal(onlineOf(first.state), false);
  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  assert.equal(onlineOf(first.state), false);
  assert.equal(heatLogs(first.events).filter((e) => e.payload.text === HEAT_OFF).length, 3);
  assert.deepEqual(ecologyMissionsForSite(ship.siteId).map((mission) => mission.id).sort(), MISSIONS);
});
