import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  COLD_DERELICT_BLACK_BOX_SOURCE_KIND,
  coldDerelictBlackBoxRecords,
} from '../src/data/coldDerelictBlackBoxes.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { save } from '../src/save/saveSystem.js';
import {
  AFTERMATH_FRESH_WINDOW_S,
  COLD_DERELICT_CUT_THRESHOLD,
  aftermathForSector,
  aftermathWrecks,
} from '../src/systems/aftermathWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { scanner } from '../src/systems/scanner.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { codexScreen, requestCodexTab } from '../src/ui/screens/codex.js';

const SECTOR_ID = 'sector_helios_prime';

test('a scanned, tether-cut, physically collected cold recorder enters Codex once and survives Continue', () => {
  const route = boot(3);
  try {
    const { marker, wreck } = coolWreck(route);
    scanWreck(route, wreck);
    route.state.player.cargo.capVolume = 0;
    cutHatch(route, wreck);
    assert.equal(marker.coldDerelictBoarding.phase, 'extracted');
    assert.equal(marker.coldDerelictBoarding.outcome, 'black_box');
    assert.notEqual(marker.coldDerelictBoarding.stabilizedAt, null,
      'the aftermath owner records Massline stabilization before cutting');
    assert.equal(marker.coldDerelictBoarding.cutProgress, COLD_DERELICT_CUT_THRESHOLD);
    assert.equal(coldDerelictBlackBoxRecords(route.state.story).length, 0,
      'cutting a recorder free does not manufacture a Codex entry');

    const firstRecorder = recorderFor(route.state, marker.markerId);
    assert.ok(firstRecorder && firstRecorder.flags?.persistent === true);
    assert.equal(firstRecorder.data.lotSource.sourceKind, COLD_DERELICT_BLACK_BOX_SOURCE_KIND);
    const stableLotId = firstRecorder.data.lotSource.lotId;

    const saveOwner = route.sim.registry.get('save');
    const looseEnvelope = saveOwner.serialize('plan53-cold-recorder-loose');
    assert.equal(saveOwner.loadEnvelope(structuredClone(looseEnvelope), 'plan53-cold-recorder-loose'), true);
    const restoredMarker = markerFor(route.state);
    const restoredWreck = liveWreck(route.state, restoredMarker.markerId);
    const restoredRecorder = recorderFor(route.state, restoredMarker.markerId);
    assert.ok(restoredWreck?.data?.scanned === true,
      'Continue retains the real scanner receipt on the physical source wreck');
    assert.equal(restoredRecorder.data.lotSource.lotId, stableLotId,
      'Continue retains stable source identity while numeric entity ids may change');
    assert.equal(coldDerelictBlackBoxRecords(route.state.story).length, 0,
      'Continue with a loose, uncollected recorder still unlocks nothing');

    route.player = route.state.entities.get(route.state.playerId);
    route.state.player.cargo.capVolume = 100;
    route.state.player.tether = null;
    route.player.pos.copy(restoredRecorder.pos);
    route.player.prevPos.copy(restoredRecorder.pos);
    route.state.input.fireGroup = 0;
    route.sim.step(1);
    assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics, 1,
      'the physical recorder reaches the existing Cargo writer');
    const [record] = coldDerelictBlackBoxRecords(route.state.story);
    assert.equal(record.markerId, restoredMarker.markerId);
    assert.equal(record.lotId, stableLotId);
    assert.equal(record.provenanceId, stableLotId);
    assert.equal(record.sectorId, restoredMarker.sectorId);
    assert.equal(record.zoneId, restoredMarker.zoneId);
    assert.equal(record.victimLabel, restoredMarker.victimLabel);
    assert.equal(record.logs.length, 4);
    assert.match(record.logs.at(-1).text, /Massline held.+Cargo accepted/i);
    assert.equal(route.codexUpdates.length, 1);

    route.sim.step(1);
    assert.equal(coldDerelictBlackBoxRecords(route.state.story).length, 1,
      'subsequent collection ticks cannot duplicate the stable marker receipt');
    const recoveredEnvelope = saveOwner.serialize('plan53-cold-recorder-recovered');
    assert.equal(saveOwner.loadEnvelope(
      structuredClone(recoveredEnvelope),
      'plan53-cold-recorder-recovered',
    ), true);
    assert.equal(coldDerelictBlackBoxRecords(route.state.story)[0].lotId, stableLotId);

    const previous = {
      activeTab: codexScreen._activeTab,
      body: codexScreen._body,
      query: codexScreen._query,
    };
    try {
      codexScreen._body = null;
      codexScreen._activeTab = 'Story';
      codexScreen._query = '';
      requestCodexTab('Black Boxes');
      codexScreen.onShow({ state: route.state });
      assert.equal(codexScreen._activeTab, 'Black Boxes');
      assert.equal(BINDINGS.codex.code, 'KeyK');
    } finally {
      Object.assign(codexScreen, previous);
    }
  } finally {
    route.sim.dispose();
  }
});

test('an unscanned cold recorder can enter Cargo but cannot manufacture Codex lore', () => {
  const route = boot(3);
  try {
    const { marker, wreck } = coolWreck(route);
    route.state.player.cargo.capVolume = 0;
    cutHatch(route, wreck);
    const recorder = recorderFor(route.state, marker.markerId);
    assert.ok(recorder);
    route.state.player.cargo.capVolume = 100;
    route.player.pos.copy(recorder.pos);
    route.player.prevPos.copy(recorder.pos);
    route.state.player.tether = null;
    route.state.input.fireGroup = 0;
    route.sim.step(1);
    assert.equal(route.state.player.cargo.items.cmdty_salvage_electronics, 1);
    assert.equal(coldDerelictBlackBoxRecords(route.state.story).length, 0,
      'Cargo custody alone is not a scanner receipt');
    assert.equal(route.codexUpdates.length, 0);
  } finally {
    route.sim.dispose();
  }
});

function boot(seed) {
  const systems = [aftermathWrecks, scanner, scanReveal, mining, cargo, save];
  const sim = createSimulation({
    seed,
    systems,
    updateOrder: systems,
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.input = { actions: { scanPulse: false }, fireGroup: 0 };
  const zone = zonesForSector(SECTOR_ID)[0];
  const pos = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 8,
    hull: 100, hullMax: 100, flags: {}, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.miningBeam = {
    tierId: 'beam_mk1', range: 220, dps: 18, directToCargo: false,
    heat: 0, heatMax: 10_000, heatRate: 0.1, coolRate: 100,
  };
  const victim = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_reach', pos: { x: pos.x + 100, z: pos.z },
    vel: { x: 0, z: 0 }, radius: 7, hull: 0, hullMax: 80, flags: {},
    data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Cold Freight D-3' },
  });
  victim.alive = false;
  bus.emit('entity:killed', {
    id: victim.id,
    killerId: player.id,
    type: 'ship',
    victimClass: 'corsair_raider',
    factionId: victim.factionId,
    pos: { ...victim.pos },
    vel: { ...victim.vel },
    sectorId: SECTOR_ID,
    data: victim.data,
  });
  const codexUpdates = [];
  bus.on('codex:blackBoxRecovered', (payload) => codexUpdates.push(structuredClone(payload)));
  return { sim, state, bus, player, codexUpdates };
}

function markerFor(state) {
  const marker = aftermathForSector(state, SECTOR_ID)[0];
  assert.ok(marker);
  return marker;
}

function liveWreck(state, markerId) {
  return state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data?.markerId === markerId) || null;
}

function recorderFor(state, markerId) {
  return state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'pickup' && entity.data?.coldDerelictBlackBox === true
    && entity.data?.coldDerelictMarkerId === markerId) || null;
}

function coolWreck(route) {
  const marker = markerFor(route.state);
  route.state.simTime = marker.t + AFTERMATH_FRESH_WINDOW_S;
  route.state.tick = 30;
  route.sim.registry.get('aftermathWrecks').update(0.5, route.state);
  const wreck = liveWreck(route.state, marker.markerId);
  assert.ok(wreck && wreck.data.coldDerelictBoarding?.outcome === 'black_box');
  return { marker, wreck };
}

function scanWreck(route, wreck) {
  route.state.input.actions.scanPulse = true;
  route.sim.registry.get('scanner').update(0, route.state);
  assert.equal(wreck.data.scanned, true);
  assert.ok(wreck.data.manifest, 'the real scanner writes the wreck manifest receipt');
}

function cutHatch(route, wreck) {
  route.state.player.targetId = wreck.id;
  route.state.player.tether = {
    active: true,
    targetId: wreck.id,
    attachmentId: 'massline:plan53-cold-recorder',
  };
  route.state.input.fireGroup = 2;
  for (let i = 0; i < 4 && wreck.data.coldDerelictBoarding.phase !== 'extracted'; i++) {
    route.sim.step(1);
  }
  route.state.input.fireGroup = 0;
  assert.equal(wreck.data.coldDerelictBoarding.phase, 'extracted');
}
