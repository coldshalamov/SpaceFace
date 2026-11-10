// WORLD-38 — the dock arrival card reads the yard record the berth and hold emits already write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { stationServices } from '../src/systems/stationServices.js';
import { buildDockArrival, writeBerthArrival } from '../src/ui/dockArrival.js';

const SEED = 4242;
const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
function holdLine(state) {
  const station = state.stationServices && state.stationServices.stations
    && state.stationServices.stations[STATION];
  const waiting = station && Number(station.waitingClients);
  if (Number.isFinite(waiting) && waiting > 0) return `Holding for a pad. ${waiting} ahead.`;
  return 'Holding for a pad.';
}

function harness(simTime) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    hull: 100, hullMax: 100, flags: { docked: false },
  };
  const entities = new Map([[player.id, player]]);
  const state = {
    playerId: 'player',
    player: { heat: 0, cargo: { usedVolume: 0, items: {} }, credits: 0 },
    entities,
    entityList: [player],
    meta: { seed: SEED },
    factions: {},
    ui: {
      docked: false,
      dockedStationId: null,
      marketNews: { log: [], lastCard: null },
    },
    world: { currentSectorId: SECTOR },
    content: {},
    missions: { active: [] },
    stationLife: { traffic: [] },
    simTime,
    tick: 0,
    timeScale: 1,
  };
  const bus = createBus();
  const yard = Object.create(stationServices);
  yard.init({ state, bus, registry: { get: () => null }, helpers: {} });
  const events = [];
  bus.on('station:berthAssigned', (p) => events.push({ ev: 'station:berthAssigned', p }));
  bus.on('station:holding', (p) => events.push({ ev: 'station:holding', p }));
  return { state, bus, yard, player, events };
}

function dock(h) {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = STATION;
  h.player.flags.docked = true;
  h.bus.emit('dock:docked', { stationId: STATION });
}

function step(h, seconds, dt = 0.25) {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    h.state.simTime += dt;
    h.yard.update(dt, h.state);
  }
}

function card(state, stationId = STATION) {
  return buildDockArrival(state, { id: stationId, name: 'Helios Station', services: [] });
}

function paintHost() {
  return {
    newsEl: { textContent: '', hidden: false },
    cardEl: null,
    routeEl: { textContent: '', hidden: true },
  };
}

function countLine(view, line) {
  return view.lines.filter((entry) => entry === line).length;
}

test('seed 4242 station:berthAssigned is one arrival line and not a hold', () => {
  const h = harness(0);
  try {
    dock(h);
    step(h, 2);
    const assigned = h.events.filter((e) => e.ev === 'station:berthAssigned');
    assert.equal(assigned.length, 1, 'the yard assigns the free pad once');
    assert.equal(h.events.some((e) => e.ev === 'station:holding'), false);
    const pad = assigned[0].p.padIdx;
    assert.equal(h.state.stationServices.player.padIdx, pad);
    const line = `Berth assigned to pad ${pad + 1}.`;
    const before = h.state.stationServices.player.padIdx;
    const view = card(h.state);
    assert.equal(h.state.stationServices.player.padIdx, before, 'the card only reads the yard');
    assert.equal(view.berthLine, line);
    assert.equal(countLine(view, line), 1);
    assert.equal(view.lines.some((entry) => entry.startsWith('Holding for a pad')), false);
    const host = paintHost();
    const painted = writeBerthArrival(host, view);
    assert.equal(host.routeEl.hidden, false);
    assert.equal(host.routeEl.textContent, line);
    assert.equal(painted.berthLine, line);
    const elsewhere = card(h.state, 'station_ceres');
    assert.equal(elsewhere.berthLine, null);
    assert.equal(countLine(elsewhere, line), 0);
  } finally {
    h.yard.destroy();
  }
});

test('seed 4242 station:holding is one arrival line and not an assignment', () => {
  // Helios pads are full from 435.75s to 451.75s on this seed. Dock inside that window.
  const h = harness(436);
  try {
    dock(h);
    const beforeTick = card(h.state);
    assert.equal(beforeTick.berthLine, null, 'a full yard has not held until the yard says so');
    assert.equal(countLine(beforeTick, 'Holding for a pad.'), 0);
    assert.equal(beforeTick.lines.some((line) => line.startsWith('Holding for a pad')), false);
    step(h, 0.5, 0.5);
    const holds = h.events.filter((e) => e.ev === 'station:holding');
    assert.equal(holds.length, 1);
    assert.equal(holds[0].p.stationId, STATION);
    assert.equal(h.events.some((e) => e.ev === 'station:berthAssigned'), false);
    assert.equal(h.state.stationServices.player.padIdx, -1);
    const line = holdLine(h.state);
    assert.equal(line, 'Holding for a pad.');
    h.state.stationServices.stations[STATION].waitingClients = 3;
    const queued = card(h.state);
    assert.equal(queued.berthLine, 'Holding for a pad. 3 ahead.');
    assert.equal(countLine(queued, queued.berthLine), 1);
    h.state.stationServices.stations[STATION].waitingClients = 0;
    const view = card(h.state);
    assert.equal(view.berthLine, line);
    assert.equal(countLine(view, line), 1);
    assert.equal(view.lines.some((entry) => entry.startsWith('Berth assigned')), false);
    const host = paintHost();
    writeBerthArrival(host, { ...view, route: 'Two haulers inbound.' });
    assert.equal(host.routeEl.hidden, false);
    assert.equal(host.routeEl.textContent, `${line} Two haulers inbound.`);
    h.bus.emit('dock:undocked', {});
    const gone = card(h.state);
    assert.equal(gone.berthLine, null);
    assert.equal(gone.lines.some((entry) => entry.startsWith('Holding for a pad')), false);
  } finally {
    h.yard.destroy();
  }
});

test('a quiet berth does not invent an assignment or a hold', () => {
  const bare = card({
    player: { heat: 0, cargo: { usedVolume: 0, items: {} } },
    missions: { active: [] },
    ui: { marketNews: { log: [], lastCard: null } },
    stationLife: { traffic: [] },
  });
  assert.equal(bare.berthLine, null);
  assert.deepEqual(bare.lines, ['Take a local contract']);
  const host = paintHost();
  const painted = writeBerthArrival(host, bare);
  assert.equal(painted.berthLine, null);
  assert.equal(host.routeEl.hidden, true);
  assert.equal(host.routeEl.textContent, '');

  const h = harness(0);
  try {
    dock(h);
    const early = card(h.state);
    assert.equal(h.events.length, 0);
    assert.equal(early.berthLine, null);
    assert.equal(early.lines.some((line) => line.startsWith('Berth assigned') || line.startsWith('Holding for a pad')), false);
  } finally {
    h.yard.destroy();
  }
});
