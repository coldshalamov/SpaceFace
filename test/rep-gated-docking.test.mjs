import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import { world as worldProto } from '../src/systems/world.js';
import { resolveDockDeny } from '../src/ui/dockDenyBanner.js';
import { createUiInput } from '../src/ui/input.js';

const SECTOR_ID = 'sector_proteus_well';
const STATION_ID = 'station_proteus';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.body = { tagName: 'BODY', isContentEditable: false };
    this.activeElement = this.body;
    this.documentElement = { classList: { add() {}, remove() {} } };
  }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((candidate) => candidate !== fn));
  }

  getElementById() { return null; }
}

function liveProteusStation() {
  const sector = SECTORS.find((candidate) => candidate.id === SECTOR_ID);
  assert.ok(sector);
  const spawned = [];
  const system = Object.assign({}, worldProto, {
    helpers: {
      spawnEntity(spec) {
        const entity = { id: spawned.length + 1, alive: true, ...spec };
        spawned.push(entity);
        return entity;
      },
    },
    _toGlobal: (point) => ({ ...point }),
    _sectorOrigin: () => ({ x: 0, z: 0 }),
    _stampHomeSector: () => {},
  });
  system._spawnStations(sector, { stations: [] }, () => 0.5);
  return spawned.find((entity) => entity.data?.stationId === STATION_ID);
}

function installInputHarness(station, rep) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeEventTarget();
  globalThis.window = new FakeEventTarget();

  const bus = createBus();
  const state = {
    mode: 'flight',
    ui: { docked: false },
    settings: { controls: { gamepad: { enabled: false } } },
    factions: { faction_quiet: { rep } },
    entityList: [station],
    entityIndex: { stations: [station] },
  };
  const screenManager = {
    isOpen: () => false,
    getActiveScreenDef: () => null,
    pushScreen() {},
    popScreen() {},
  };
  const input = createUiInput({ state, bus }, screenManager);
  const events = [];
  for (const name of ['dock:attempt', 'dock:docked', 'audio:cue']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  bus.emit('dock:range', { stationId: STATION_ID, inRange: true });

  return {
    bus,
    state,
    events,
    close() {
      input.dispose();
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
  };
}

test('Proteus Den carries the authored positive-standing dock threshold onto its live station', () => {
  const station = liveProteusStation();
  assert.ok(station);
  assert.equal(station.data.repGated, true);
  assert.equal(station.data.minRep, 1);
  assert.equal(resolveDockDeny({ factions: { faction_quiet: { rep: 0 } }, entityList: [station] }, STATION_ID)?.reason, 'hostile_rep');
  assert.equal(resolveDockDeny({ factions: { faction_quiet: { rep: 1 } }, entityList: [station] }, STATION_ID), null);
});

test('the shipped dock command refuses zero standing and admits positive standing without changing flight controls', () => {
  const station = liveProteusStation();
  const harness = installInputHarness(station, 0);
  try {
    harness.bus.emit('touch:uiAction', { action: 'dock' });
    assert.equal(harness.events.filter((event) => event.name === 'dock:attempt').length, 1);
    assert.equal(harness.events.filter((event) => event.name === 'dock:docked').length, 0);
    assert.equal(harness.events.filter((event) => event.name === 'audio:cue').length, 0);

    harness.state.factions.faction_quiet.rep = 1;
    harness.bus.emit('touch:uiAction', { action: 'dock' });
    assert.equal(harness.events.filter((event) => event.name === 'dock:attempt').length, 2);
    assert.deepEqual(harness.events.filter((event) => event.name === 'dock:docked').map((event) => event.payload), [
      { stationId: STATION_ID },
    ]);
    assert.deepEqual(harness.events.filter((event) => event.name === 'audio:cue').map((event) => event.payload), [
      { id: 'ui_dock' },
    ]);
  } finally {
    harness.close();
  }
});

test('ordinary stations keep their existing docking contract regardless of faction standing', () => {
  const station = {
    id: 99,
    alive: true,
    type: 'station',
    factionId: 'faction_quiet',
    data: { stationId: 'station_open', factionId: 'faction_quiet', name: 'Open Berth' },
  };
  assert.equal(resolveDockDeny({ factions: { faction_quiet: { rep: -500 } }, entityList: [station] }, 'station_open'), null);
});
