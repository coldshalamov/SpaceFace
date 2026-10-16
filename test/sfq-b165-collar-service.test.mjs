import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES, ecologyMissionsForSite } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import {
  COLLAR_CLEAR,
  COLLAR_HELD,
  COLLAR_RESTORED,
  COLLAR_SITE_ID,
  collarCause,
  stepCollarService,
  useCollarService,
} from '../src/data/collarService.js';
import {
  deserializeAlienEcologyState,
  handleAlienEcologyEvent,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

const dock = ALIEN_SITES.breathing_dock;
const CLOSE = dock.arrivalBands.close;
const MISSIONS = ecologyMissionsForSite(dock.siteId).map((mission) => mission.id).sort();

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
      currentSectorId: dock.sectorId,
      sectors: {
        [dock.sectorId]: {
          id: dock.sectorId,
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

function collarLogs(events) {
  return events.filter((e) => e.type === 'comms:log' && e.payload
    && (e.payload.text === COLLAR_CLEAR || e.payload.text === COLLAR_HELD
      || e.payload.text === COLLAR_RESTORED));
}

function collarEvents(events) {
  return events.filter((e) => e.type === 'ecology:collar');
}

function recOf(state) {
  return ensureAlienEcologyState(state).sites[dock.siteId] || null;
}

function stageOf(state) {
  const rec = recOf(state);
  return rec && rec.collarStage === 'held' ? 'held' : 'open';
}

function offered(state) {
  return state.missions.boards.station_field_desk.slots.map((slot) => slot.id).sort();
}

function emitted(state) {
  const rec = recOf(state);
  return rec && rec.offersEmitted ? Object.keys(rec.offersEmitted).sort() : [];
}

test('the collar berth closes for the carrier and the other work stays open', () => {
  assert.equal(dock.siteId, COLLAR_SITE_ID);
  assert.equal(dock.faunaCast.spindle_mother > 0, true);
  assert.equal(collarCause(dock), 'spindle_mother');
  assert.equal(collarCause({ faunaCast: {} }), null);
  assert.deepEqual(MISSIONS, ['em_carrier_diversion_breathing', 'em_quiet_sample_run']);
  assert.deepEqual(stepCollarService('open', 'arrive'), { stage: 'open', text: COLLAR_CLEAR });
  assert.deepEqual(stepCollarService('held', 'arrive'), { stage: 'held', text: null });
  assert.deepEqual(stepCollarService('open', 'inhale'), { stage: 'held', text: COLLAR_HELD });
  assert.deepEqual(stepCollarService('held', 'inhale'), { stage: 'held', text: null });
  assert.deepEqual(stepCollarService('held', 'divert'), { stage: 'open', text: COLLAR_RESTORED });
  assert.deepEqual(stepCollarService('open', 'divert'), { stage: 'open', text: null });
  assert.deepEqual(stepCollarService('nope', 'wait'), { stage: 'open', text: null });
  assert.equal(useCollarService('open', 'berth').ok, true);
  assert.equal(useCollarService('held', 'berth').ok, false);
  assert.equal(useCollarService('held', 'berth').alternative, 'sample');
  assert.equal(useCollarService('held', 'sample').ok, true);
  assert.equal(useCollarService('open', 'sample').ok, true);
  assert.equal(useCollarService('held', 'missions').ok, true);
  assert.equal(useCollarService('open', 'missions').ok, true);
  assert.equal(COLLAR_HELD.includes('breathing in'), true);
  assert.equal(COLLAR_HELD.includes('quiet tender'), true);
  assert.equal(COLLAR_CLEAR.includes('take a ship'), true);
  assert.equal(COLLAR_RESTORED.includes('clear again'), true);
});

test('a return finds the collar taken, a scan opens it, and the contracts remain', () => {
  const outside = { x: dock.center.x + CLOSE * 2, z: dock.center.z };
  const inside = { x: dock.center.x, z: dock.center.z };
  const onRadius = { x: dock.center.x + CLOSE, z: dock.center.z };
  const wantOffers = MISSIONS.map((id) => `ecology_${id}`).sort();

  const first = worldAt(outside.x, outside.z);
  tickAlienEcology(first.world, 30);
  assert.equal(stageOf(first.state), 'open');
  assert.equal(collarLogs(first.events).length, 0);
  assert.equal(collarEvents(first.events).length, 0);

  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  assert.equal(stageOf(first.state), 'open');
  assert.equal(recOf(first.state).collarGreeted, true);
  assert.deepEqual(collarLogs(first.events).map((e) => e.payload.text), [COLLAR_CLEAR]);
  assert.equal(collarEvents(first.events)[0].payload.open, true);
  assert.equal(collarEvents(first.events)[0].payload.sampleOpen, true);
  assert.equal(collarEvents(first.events)[0].payload.missionsOpen, true);
  assert.equal(collarEvents(first.events)[0].payload.cause, null);
  assert.equal(useCollarService(stageOf(first.state), 'berth').ok, true);
  assert.deepEqual(offered(first.state), wantOffers);
  assert.deepEqual(emitted(first.state), MISSIONS);

  tickAlienEcology(first.world, 40);
  assert.equal(collarLogs(first.events).length, 1);
  assert.equal(stageOf(first.state), 'open');

  const heldOpen = worldAt(inside.x, inside.z);
  deserializeAlienEcologyState(heldOpen.state, serializeAlienEcologyState(first.state));
  tickAlienEcology(heldOpen.world, 0.5);
  assert.equal(stageOf(heldOpen.state), 'open');
  assert.equal(collarLogs(heldOpen.events).length, 0);

  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: dock.sectorId });
  assert.equal(stageOf(first.state), 'open');
  assert.equal(collarLogs(first.events).some((e) => e.payload.text === COLLAR_RESTORED), false);

  move(first, onRadius.x, onRadius.z);
  tickAlienEcology(first.world, 30);
  assert.equal(stageOf(first.state), 'open');
  assert.equal(recOf(first.state).collarGreeted, true);
  assert.equal(recOf(first.state).collarEdge, false);
  assert.equal(collarLogs(first.events).some((e) => e.payload.text === COLLAR_HELD), false);

  const armed = worldAt(inside.x, inside.z);
  deserializeAlienEcologyState(armed.state, serializeAlienEcologyState(first.state));
  tickAlienEcology(armed.world, 0.5);
  assert.equal(stageOf(armed.state), 'held');
  assert.deepEqual(collarLogs(armed.events).map((e) => e.payload.text), [COLLAR_HELD]);
  assert.equal(collarEvents(armed.events)[0].payload.open, false);
  assert.equal(collarEvents(armed.events)[0].payload.alternative, 'sample');
  assert.equal(collarEvents(armed.events)[0].payload.sampleOpen, true);
  assert.equal(collarEvents(armed.events)[0].payload.missionsOpen, true);
  assert.equal(collarEvents(armed.events)[0].payload.cause, 'spindle_mother');
  assert.equal(useCollarService(stageOf(armed.state), 'berth').ok, false);
  assert.equal(useCollarService(stageOf(armed.state), 'sample').ok, true);
  assert.equal(useCollarService(stageOf(armed.state), 'missions').ok, true);

  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  assert.equal(stageOf(first.state), 'held');
  assert.equal(collarLogs(first.events).filter((e) => e.payload.text === COLLAR_HELD).length, 1);
  tickAlienEcology(first.world, 40);
  assert.equal(collarLogs(first.events).filter((e) => e.payload.text === COLLAR_HELD).length, 1);
  assert.deepEqual(offered(first.state), wantOffers);

  const heldInside = worldAt(inside.x, inside.z);
  deserializeAlienEcologyState(heldInside.state, serializeAlienEcologyState(first.state));
  tickAlienEcology(heldInside.world, 0.5);
  assert.equal(stageOf(heldInside.state), 'held');
  assert.equal(collarLogs(heldInside.events).length, 0);
  assert.deepEqual(emitted(heldInside.state), MISSIONS);

  const posted = worldAt(inside.x, inside.z);
  const blob = serializeAlienEcologyState(first.state);
  blob.sites[dock.siteId].offersEmitted = {};
  deserializeAlienEcologyState(posted.state, blob);
  tickAlienEcology(posted.world, 0.5);
  assert.equal(stageOf(posted.state), 'held');
  assert.equal(collarLogs(posted.events).length, 0);
  assert.deepEqual(offered(posted.state), wantOffers);

  move(first, outside.x, outside.z);
  tickAlienEcology(first.world, 0.5);
  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: dock.sectorId });
  assert.equal(stageOf(first.state), 'held');

  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: dock.sectorId });
  assert.equal(stageOf(first.state), 'open');
  assert.equal(collarLogs(first.events).filter((e) => e.payload.text === COLLAR_RESTORED).length, 1);
  assert.equal(collarEvents(first.events).at(-1).payload.open, true);
  tickAlienEcology(first.world, 0.5);
  assert.equal(stageOf(first.state), 'open');

  move(first, onRadius.x, onRadius.z);
  tickAlienEcology(first.world, 0.5);
  move(first, inside.x, inside.z);
  tickAlienEcology(first.world, 0.5);
  assert.equal(stageOf(first.state), 'held');
  assert.equal(collarLogs(first.events).filter((e) => e.payload.text === COLLAR_HELD).length, 2);
  assert.deepEqual(ecologyMissionsForSite(dock.siteId).map((mission) => mission.id).sort(), MISSIONS);
});
