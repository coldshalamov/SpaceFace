// inf-station-pa (CH-63) — the station's desk calls its own routine.
// The side-event director runs the berth's day and the renderer draws it; the station now says it:
// one desk line per side event the pilot can see, in the house register, one per station per
// cooldown, silent when docked, far, gone, or when that desk has no line for the kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { STATION_PA_BARKS, stationPaBarkFor } from '../src/data/barks.js';
import { SIDE_EVENT_IDS } from '../src/data/stationSideEvents.js';
import { barkDirector, STATION_PA_COOLDOWN_S, STATION_PA_EARSHOT_WU } from '../src/systems/barkDirector.js';

function harness() {
  const bus = createBus();
  const entities = new Map();
  const state = {
    mode: 'flight', tick: 0, simTime: 100, playerId: 1, entities, entityList: [],
    meta: { seed: 4242 }, world: {}, story: { titles: { byId: {} } },
    settings: { audio: {}, accessibility: {} },
    heat: { wanted: false, level: 0, fines: 0 }, law: { fines: 0, citations: [] },
  };
  const add = (e) => { entities.set(e.id, e); state.entityList.push(e); return e; };
  add({ id: 1, type: 'ship', team: 0, alive: true, factionId: 'faction_free', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
  add({ id: 50, type: 'station', alive: true, factionId: 'faction_scn', pos: { x: 1200, z: 0 }, data: {} });
  add({ id: 60, type: 'station', alive: true, factionId: 'faction_reach', pos: { x: -900, z: 400 }, data: {} });
  const says = [];
  const receipts = [];
  bus.on('barkDirector:voice', (p) => receipts.push(p));
  barkDirector.init({ state, bus, helpers: { voice: { say: (req) => { says.push(req); return true; } } } });
  const side = (stationId, kind, eventId) => bus.emit('station:sideEvent', {
    eventId, kind, stationId: String(stationId), path: 'x', durationS: 40, budget: 0, bearing: 0,
    from: { x: 0, z: 0 }, to: { x: 1, z: 1 }, entityIds: [],
  });
  return { state, says, receipts, side };
}

test('every routine has a desk line; the lawful desk never announces a dark runner', () => {
  for (const kind of SIDE_EVENT_IDS) {
    assert.ok(STATION_PA_BARKS.yardmaster[kind]?.length >= 2, `yardmaster ${kind}`);
    if (kind === 'quiet_dock') assert.equal(stationPaBarkFor('dock_control', kind, 0), null);
    else assert.ok(STATION_PA_BARKS.dock_control[kind]?.length >= 2, `dock control ${kind}`);
  }
  assert.equal(stationPaBarkFor('yardmaster', 'not_a_kind', 0), null, 'an unknown kind is silence');
  for (const desk of Object.values(STATION_PA_BARKS)) {
    for (const lines of Object.values(desk)) for (const line of lines) assert.doesNotMatch(line, /undefined|NaN|\{|_/);
  }
});

test('a lawful berth calls its patrol launch in the Dock control register', () => {
  const h = harness();
  h.side(50, 'patrol_launch', 'ev-1');
  assert.equal(h.says.length, 1);
  assert.ok(STATION_PA_BARKS.dock_control.patrol_launch.includes(h.says[0].text));
  assert.equal(h.says[0].channel, 'bark');
  assert.equal(h.says[0].factionId, 'faction_scn');
  const receipt = h.receipts.find((r) => r.situation === 'station-pa');
  assert.equal(receipt.entityId, 50);
  assert.equal(receipt.register, 'dock_control');
  assert.equal(receipt.kind, 'patrol_launch');
});

test('a pirate den speaks in the Yardmaster register, including its dark runner', () => {
  const h = harness();
  h.side(60, 'quiet_dock', 'ev-q');
  assert.equal(h.says.length, 1);
  assert.ok(STATION_PA_BARKS.yardmaster.quiet_dock.includes(h.says[0].text));
  const lawful = harness();
  lawful.side(50, 'quiet_dock', 'ev-q2');
  assert.equal(lawful.says.length, 0, 'the lawful desk keeps quiet about lights-out arrivals');
});

test('one call per side event, one per station per cooldown; the cooldown re-arms', () => {
  const h = harness();
  h.side(50, 'hauler_dock', 'ev-1');
  h.side(50, 'hauler_dock', 'ev-1');
  assert.equal(h.says.length, 1, 'the same event never speaks twice');
  h.state.simTime += 30;
  h.side(50, 'repair_drone', 'ev-2');
  assert.equal(h.says.length, 1, 'a busy berth does not chatter');
  h.side(60, 'cargo_tractor', 'ev-3');
  assert.equal(h.says.length, 2, 'the cooldown is per station');
  h.state.simTime += STATION_PA_COOLDOWN_S;
  h.side(50, 'repair_drone', 'ev-4');
  assert.equal(h.says.length, 3);
  assert.ok(STATION_PA_BARKS.dock_control.repair_drone.includes(h.says[2].text));
});

test('silent when docked, out of earshot, gone, or unknown', () => {
  const docked = harness();
  docked.state.mode = 'docked';
  docked.side(50, 'patrol_launch', 'a');
  assert.equal(docked.says.length, 0);
  const far = harness();
  far.state.entities.get(1).pos = { x: 1200 + STATION_PA_EARSHOT_WU + 10, z: 0 };
  far.side(50, 'patrol_launch', 'b');
  assert.equal(far.says.length, 0);
  const gone = harness();
  gone.state.entities.get(50).alive = false;
  gone.side(50, 'patrol_launch', 'c');
  gone.side(999, 'patrol_launch', 'd');
  gone.side(60, 'not_a_kind', 'e');
  assert.equal(gone.says.length, 0);
});

test('the PA reads the live side-event seam by the key the director stamps', () => {
  const src = readFileSync(new URL('../src/systems/stationSideEventDirector.js', import.meta.url), 'utf8');
  assert.match(src, /this\.bus\.emit\('station:sideEvent', \{[\s\S]{0,200}stationId: stationKey\(station\)/);
  const director = readFileSync(new URL('../src/systems/barkDirector.js', import.meta.url), 'utf8');
  assert.match(director, /this\.bus\.on\('station:sideEvent', this\._onStationSideEvent\)/);
  assert.match(director, /this\.bus\.off\('station:sideEvent', this\._onStationSideEvent\)/);
});
