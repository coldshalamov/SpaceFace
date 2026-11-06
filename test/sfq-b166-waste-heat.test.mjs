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
  handleWarmHeatAction,
  invalidateWarmHeatOffer,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';
import { discoveryCommsPayload } from '../src/ui/comms.js';

const ship = ALIEN_SITES.warm_freighter;
const CLOSE = ship.arrivalBands.close;
const MISSIONS = ecologyMissionsForSite(ship.siteId).map((mission) => mission.id).sort();

function worldAt(x, z) {
  const state = {
    meta: { seed: 7 },
    simTime: 10,
    mode: 'flight',
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
  const host = { pos: { ...ship.center }, occupantGeneration: 1 };
  world.registry = { get: name => name === 'aftermathWrecks' ? {
    siteWreckBinding: id => id === ship.siteId
      && host.available !== false ? { host, occupantGeneration: host.occupantGeneration, pose: { ...host.pos } } : null,
  } : null };
  return { state, world, events, player, host };
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

function chooseHeat(pack, verb) {
  const offer = pack.events.findLast(e => e.type === 'siteEvidence:offer' && e.payload.interactionId === 'warm-freighter-standby')?.payload;
  assert.ok(offer);
  return handleWarmHeatAction(pack.world, { siteId: ship.siteId, interactionId: offer.interactionId,
    requestId: offer.requestId, expectedOnline: offer.expectedOnline, verb });
}

function offered(state) {
  return state.missions.boards.station_field_desk.slots.map((slot) => slot.id).sort();
}

test('cold freighter arrival follows the live displaced host and waits for its binding', () => {
  const pack = worldAt(ship.center.x, ship.center.z);
  const { world, state, host, events } = pack;
  host.pos.x += 5000;
  host.available = false;
  tickAlienEcology(world, 0.1);
  const rec = recOf(state);
  rec.heatOnline = false;
  assert.notEqual(rec.beats.long, true);
  assert.notEqual(rec.beats.mid, true);
  assert.notEqual(rec.beats.close, true);
  host.available = true;
  tickAlienEcology(world, 0.1);
  assert.notEqual(rec.beats.long, true, 'the abandoned map coordinate is not the host');
  const arrivals = () => events.filter(e => e.type === 'toast'
    && Object.values(ship.arrivalLinesOffline).includes(e.payload.text)).map(e => e.payload.text);
  for (const distance of [2100, 1200, 400]) {
    move(pack, host.pos.x + distance, host.pos.z);
    tickAlienEcology(world, 0.1);
  }
  assert.deepEqual(arrivals(), [ship.arrivalLinesOffline.long, ship.arrivalLinesOffline.mid, ship.arrivalLinesOffline.close]);
  assert.deepEqual([rec.beats.long, rec.beats.mid, rec.beats.close], [true, true, true]);
  tickAlienEcology(world, 0.1);
  assert.equal(arrivals().length, 3, 'arrival beats remain once-only');
  assert.ok(!events.some(e => e.type === 'toast' && Object.values(ship.arrivalLines).includes(e.payload.text)));
});

test('heat offer tokens are independent per state and remain fresh after invalidation', () => {
  const first = worldAt(ship.center.x, ship.center.z);
  const second = worldAt(ship.center.x, ship.center.z);
  const other = worldAt(ship.center.x, ship.center.z);
  const scan = pack => {
    handleAlienEcologyEvent(pack.world, 'scan:completed', { sectorId: ship.sectorId });
    return pack.events.findLast(e => e.type === 'siteEvidence:offer'
      && e.payload.interactionId === 'warm-freighter-standby').payload;
  };
  const firstOffer = scan(first);
  scan(other); scan(other); scan(other);
  const secondOffer = scan(second);
  assert.equal(firstOffer.requestId, 1);
  assert.equal(secondOffer.requestId, firstOffer.requestId);
  const request = offer => ({ siteId: ship.siteId, interactionId: offer.interactionId,
    requestId: offer.requestId, expectedOnline: offer.expectedOnline, verb: 'heat-off' });
  assert.equal(handleWarmHeatAction(first.world, request(firstOffer)).ok, true);
  assert.equal(handleWarmHeatAction(second.world, request(secondOffer)).ok, true);
  assert.equal(handleWarmHeatAction(first.world, request(firstOffer)).ok, false);
  const old = scan(first);
  invalidateWarmHeatOffer(first.state);
  const fresh = scan(first);
  assert.equal(fresh.requestId, old.requestId + 1);
  const restore = offer => ({ ...request(offer), verb: 'heat-on' });
  assert.equal(handleWarmHeatAction(first.world, restore(old)).ok, false);
  assert.equal(handleWarmHeatAction(first.world, restore(fresh)).ok, true);
});

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
  const onNotice = discoveryCommsPayload({ from: ship.name, kind: 'ecology', text: HEAT_ON }).text;
  const offNotice = discoveryCommsPayload({ from: ship.name, kind: 'ecology', text: HEAT_OFF }).text;
  assert.equal(onNotice.includes('...'), false);
  assert.equal(offNotice.includes('...'), false);
  assert.equal(onNotice.toLowerCase().includes('cysts live in the waste heat'), true);
  assert.equal(onNotice.toLowerCase().includes('eels are held'), true);
  assert.equal(offNotice.toLowerCase().includes('cysts lose the heat'), true);
  assert.equal(offNotice.toLowerCase().includes('eels are no longer held'), true);
});

test('a scan reads standby, a deliberate choice persists, and the survey stays posted', () => {
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
  assert.equal(onlineOf(first.state), true);
  assert.equal(chooseHeat(first, 'heat-off').ok, true);
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
  blob.sites[ship.siteId].offerArmed = false;
  deserializeAlienEcologyState(posted.state, blob);
  tickAlienEcology(posted.world, 0.5);
  assert.equal(onlineOf(posted.state), false);
  assert.equal(heatLogs(posted.events).length, 0);
  assert.ok(wantOffers.every((id) => offered(posted.state).includes(id)));

  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: ship.sectorId });
  assert.equal(onlineOf(first.state), false);
  assert.equal(chooseHeat(first, 'heat-on').ok, true);
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
  assert.equal(chooseHeat(first, 'heat-off').ok, true);
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
