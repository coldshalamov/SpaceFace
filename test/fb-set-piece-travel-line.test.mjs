// FB-137 — a set-piece transition draws its travel line instead of emitting into nothing.
//
// Seed 4242, beat-1 set piece: the witness_run 'extract_the_witness' leg (the first stage that
// speaks a travel line) is accepted, the player enters the destination sector, and the spoken
// line becomes ONE secondary destination ribbon — under the active route, never part of it.
// The ribbon clears by construction: it draws only while the run is active, its flag is spoken,
// and the player stands in the sector the next beat lives in. A settle (or a sector that moves
// the run) removes it with the mission; no teardown listener is involved.
//
// Pin shape mirrors test/witness-run-station-contact-seam.test.mjs — real offers through
// buildSetPieceMissionOffers, real acceptMission, real sector:enter and dock:docked events.
import test from 'node:test';
import assert from 'node:assert';

import { createSimulation } from '../src/core/sim.js';
import { buildSetPieceMissionOffers } from '../src/systems/setPieceMissionOffers.js';
import { missions } from '../src/systems/missions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import {
  routeRibbon,
  ROUTE_RIBBON_BRIGHTNESS,
  setPieceRibbons,
  SET_PIECE_RIBBON_BRIGHTNESS,
} from '../src/presentation/routeRibbon.js';

const META_SEED = 4242;
// witness_run commonStages[1] 'extract_the_witness' — the beat-1 leg that carries a travel line.
const DEST_SECTOR = 'sector_pallas_drift';
const DEST_STATION = 'station_drift';

function flightSim() {
  const sim = createSimulation({ seed: META_SEED, systems: [uniqueWrecks, missions] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.credits = 50000;
  state.story.beatIndex = 6;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free', 'faction_reach', 'faction_quiet', 'faction_choir']) {
    state.factions[id] = { rep: 500 };
  }
  // The berth the spoken line points at — a real entity so the ribbon resolves a live position.
  const berth = sim.spawn({
    type: 'station', team: 2,
    pos: { x: 1200, z: -800 }, vel: { x: 0, z: 0 },
    radius: 42, hull: 500, hullMax: 500,
    data: { stationId: DEST_STATION },
  });
  return { sim, state, bus, player, berth };
}

function acceptBeat1(h) {
  const [offer] = buildSetPieceMissionOffers(h.state, {
    archetypeId: 'witness_run', startEpoch: 0, stageIndex: 1, branchId: null, attempt: 0,
  });
  assert.ok(offer, 'the beat-1 witness_run offer builds');
  assert.equal(offer.destStationId, DEST_STATION);
  assert.ok(offer.cause.travelText, 'the beat-1 leg speaks a travel line');
  const board = h.state.missions.boards[offer.stationId]
    || (h.state.missions.boards[offer.stationId] = { slots: [] });
  board.slots.unshift(offer);
  assert.equal(h.sim.registry.get('missions').acceptMission(offer.id), true, `accept ${offer.title}`);
  return h.state.missions.active.find((m) => m.cause && m.cause.chainId === offer.cause.chainId);
}

test('FB-137 seed 4242: the spoken travel line draws one secondary ribbon that clears with the run', () => {
  const h = flightSim();
  const { state, bus } = h;
  const spoken = [];
  bus.on('mission:setPieceTravelLine', (p) => spoken.push(p));
  try {
    const mission = acceptBeat1(h);
    assert.ok(mission, 'the beat-1 leg is active');

    // Never for an unspoken line — the flag is the gate, not the archetype.
    h.player.pos.x = 100; h.player.pos.z = 50;
    state.world.currentSectorId = DEST_SECTOR;
    assert.deepEqual(setPieceRibbons(state), [],
      'no ribbon before the transition speaks');

    // Enter the destination sector: the witness speaks once and the ribbon appears.
    bus.emit('sector:enter', { sectorId: DEST_SECTOR });
    assert.equal(spoken.length, 1, 'one travel-line event for one spoken transition');
    assert.equal(spoken[0].missionId, mission.id);
    assert.equal(mission.cause.travelLineSpoken, true);
    assert.equal(mission.cause.travelLineTo, DEST_STATION,
      'the durable berth fact rides the same save path as the spoken flag');

    const lines = setPieceRibbons(state);
    assert.equal(lines.length, 1, 'one ribbon per travel line');
    const line = lines[0];
    assert.equal(line.kind, 'set-piece');
    assert.equal(line.secondary, true, 'a second-destination ribbon — never the active route');
    assert.equal(line.missionId, mission.id);
    assert.ok(line.brightness < ROUTE_RIBBON_BRIGHTNESS, 'dimmer than the primary route: a hint');
    assert.equal(line.brightness, SET_PIECE_RIBBON_BRIGHTNESS);
    assert.deepEqual(line.points[0], { x: h.player.pos.x, z: h.player.pos.z },
      'the line starts at the hull');
    assert.deepEqual(line.points[1], { x: h.berth.pos.x, z: h.berth.pos.z },
      'the line ends at the spoken berth');

    // Speaking is once: a second sector:enter neither re-voices nor doubles the ribbon.
    bus.emit('sector:enter', { sectorId: DEST_SECTOR });
    assert.equal(spoken.length, 1, 'the travel line speaks exactly once');
    assert.equal(setPieceRibbons(state).length, 1);

    // The active route is untouched: a nav waypoint keeps drawing the primary ribbon, and the
    // set-piece model returns a separate list that never contains it.
    state.player.nav = { waypoint: { x: -400, z: 900 }, autopilot: null };
    const primary = routeRibbon(state);
    assert.ok(primary && primary.active === true, 'the engaged route still draws');
    assert.deepEqual(primary.points[1], { x: -400, z: 900 });
    assert.equal(primary.brightness, ROUTE_RIBBON_BRIGHTNESS);
    assert.equal(setPieceRibbons(state).every((l) => l.secondary === true), true,
      'the secondary list never absorbs the active route');

    // Clears by construction (a): the run's next beat lives elsewhere — leave the sector.
    state.world.currentSectorId = 'sector_helios_prime';
    assert.deepEqual(setPieceRibbons(state), [], 'out of the destination sector, no line');
    state.world.currentSectorId = DEST_SECTOR;
    assert.equal(setPieceRibbons(state).length, 1, 'back in sector, the line returns');

    // Clears by construction (b): the transition completes — the dock settles the stage.
    bus.emit('dock:docked', { stationId: DEST_STATION });
    assert.equal(state.missions.active.includes(mission), false,
      'the extract leg settled at its berth');
    assert.deepEqual(setPieceRibbons(state), [],
      'a settled transition removes the ribbon with the mission');
  } finally {
    h.sim.dispose();
  }
});

test('FB-137: a posted-but-unaccepted offer never draws', () => {
  const h = flightSim();
  const { state, bus } = h;
  try {
    // The offer exists on the board — an unaccepted run owns no ribbon.
    const [offer] = buildSetPieceMissionOffers(state, {
      archetypeId: 'witness_run', startEpoch: 0, stageIndex: 1, branchId: null, attempt: 0,
    });
    (state.missions.boards[offer.stationId]
      || (state.missions.boards[offer.stationId] = { slots: [] })).slots.unshift(offer);
    h.player.pos.x = 0; h.player.pos.z = 0;
    state.world.currentSectorId = DEST_SECTOR;
    bus.emit('sector:enter', { sectorId: DEST_SECTOR });
    assert.deepEqual(setPieceRibbons(state), []);
  } finally {
    h.sim.dispose();
  }
});
