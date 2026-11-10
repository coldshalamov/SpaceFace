import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { HELIOS_BAY7 } from '../src/data/narrative.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import { HELIOS_BAY7_PROXIMITY_WU, story } from '../src/systems/story.js';
import { signalKindForPoi } from '../src/systems/scanner.js';

function heliosSector() {
  return SECTORS.find((sector) => sector.id === 'sector_helios_prime');
}

function bootStory(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.world.currentSectorId = HELIOS_BAY7.sectorId;
  state.story.beatIndex = 3;
  state.story.flags = { ...(state.story.flags || {}), beat_2_done: true };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {},
  };
  const pad = {
    id: 9, type: 'fx', alive: true,
    pos: { x: 1410, z: -310 },
    data: { poi: true, poiId: HELIOS_BAY7.poiId, name: 'Helios Bay 7' },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entities.set(pad.id, pad);
  state.entityList = [player, pad];
  const bus = createBus();
  const comms = [];
  bus.on('comms:popup', (payload) => comms.push(payload));
  const system = Object.create(story);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, system, player, pad, comms };
}

test('Helios Bay 7 is a placed cache POI the scanner can name', () => {
  const poi = heliosSector().pois.find((row) => row.id === HELIOS_BAY7.poiId);
  assert.ok(poi, 'sectors.js places Bay 7');
  assert.equal(poi.type, 'cache');
  assert.equal(poi.scannerSignalKind, 'cache');
  assert.equal(signalKindForPoi(poi), 'cache');
  const anchors = SECTOR_ANCHORS.sector_helios_prime.pois;
  const anchor = anchors.find((row) => row.id === HELIOS_BAY7.poiId);
  assert.ok(anchor && anchor.pos, 'sectorAnchors.js pins Bay 7 in the Helios pad field');
});

test('a pulse or approach after beat 3 files the maintenance ticket', () => {
  const h = bootStory();
  try {
    h.bus.emit('sector:enter', { sectorId: HELIOS_BAY7.sectorId });
    assert.equal(h.state.story.flags.helios_bay7_available, true);

    h.bus.emit('signal:scanResults', {
      sectorId: HELIOS_BAY7.sectorId,
      signals: [{ sourceId: HELIOS_BAY7.poiId, kind: 'cache', pos: { ...h.pad.pos } }],
    });
    assert.equal(h.state.story.flags.helios_bay7_scanned, true);
    assert.ok(h.comms.some((row) => row.id === 'helios_bay7_ticket'));
    assert.match(String(h.comms[0].text), /Y3-C2/);
  } finally {
    h.bus.clear();
  }
});

test('flying onto the pad without a pulse still files the ticket once', () => {
  const h = bootStory(48);
  try {
    h.bus.emit('sector:enter', { sectorId: HELIOS_BAY7.sectorId });
    h.player.pos = { x: h.pad.pos.x + 20, z: h.pad.pos.z };
    h.system.update(1 / 60, h.state);
    assert.equal(h.state.story.flags.helios_bay7_scanned, true);
    h.system.update(1 / 60, h.state);
    assert.equal(h.comms.filter((row) => row.id === 'helios_bay7_ticket').length, 1);
    assert.ok(HELIOS_BAY7_PROXIMITY_WU >= 300);
  } finally {
    h.bus.clear();
  }
});

test('Kessler points at Bay 7 once the pad is armed', () => {
  const contacts = generateContacts('station_helios', {
    story: { flags: { helios_bay7_available: true } },
  });
  const kessler = contacts.find((row) => row.canonicalKey === 'kessler');
  assert.ok(kessler);
  assert.match(kessler.line, /Bay 7/);
});
