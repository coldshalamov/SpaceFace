import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  frontierRumorOffer,
  frontierRumorPurchaseOffer,
} from '../src/data/frontierRumors.js';
import {
  LISTENING_POST,
  listeningPostPuzzleState,
  validateListeningPostAttempt,
} from '../src/data/listeningPost.js';
import { scanner } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';
import { codexScreen } from '../src/ui/screens/codex.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

function boot(seed = 300030) {
  const sim = createSimulation({ seed, systems: [world, scanner], updateOrder: [world, scanner] });
  const owner = sim.registry.get('world');
  owner.newGame();
  const player = sim.spawn({
    type: 'ship', team: 0, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 7, mass: 28, hull: 300, hullMax: 300,
    physicsBody: { schemaVersion: 1, radius: 7, mass: 28, dynamic: true, ccd: true, material: 'ship' },
    data: {},
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.ui.docked = false;
  sim.state.input.actions = {};
  return { sim, state: sim.state, bus: sim.bus, owner, scanner: sim.registry.get('scanner'), player };
}

function livePoi(state, poiId) {
  return state.entityList.find((entity) => entity && entity.alive !== false && entity.data?.poiId === poiId);
}

function liveStation(state, stationId) {
  return state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'station' && entity.data?.stationId === stationId);
}

test('physical Dione relay scan unlocks the Codex cadence and only its decoded pair charts Sedna', () => {
  const route = boot();
  const events = [];
  const originalEmit = route.bus.emit.bind(route.bus);
  route.bus.emit = (event, payload) => {
    events.push({ event, payload });
    return originalEmit(event, payload);
  };
  try {
    const sourceSector = SECTORS.find((sector) => sector.id === LISTENING_POST.sourceSectorId);
    const sourcePoi = sourceSector?.pois.find((poi) => poi.id === LISTENING_POST.sourcePoiId);
    const targetSector = SECTORS.find((sector) => sector.id === LISTENING_POST.targetSectorId);
    const targetStation = targetSector?.stations.find((station) => station.id === LISTENING_POST.targetStationId);
    assert.ok(sourcePoi);
    assert.ok(targetStation);
    assert.equal(targetStation.hidden, true, 'the decoded station is authored as the sole hidden rim berth');
    assert.deepEqual(targetSector.position, LISTENING_POST.chartCoordinate,
      'the decoded pair is the real Atlas coordinate of the named rim station sector');
    assert.equal(sourcePoi.scannerSignalKind, 'archive');
    assert.equal(sourcePoi.manualInvestigation, true);
    assert.equal(sourcePoi.name, LISTENING_POST.sourceName);
    assert.equal(typeof codexScreen._renderListeningPostPuzzle, 'function');

    const rumor = frontierRumorOffer(route.state, LISTENING_POST.sourceStationId);
    assert.equal(rumor?.id, LISTENING_POST.rumorId,
      'the ordinary Dione bar surfaces the exact monument rumor before generic cards');
    assert.equal(rumor?.targetId, LISTENING_POST.sourcePoiId);
    assert.equal(rumor?.targetName, LISTENING_POST.sourceName);
    assert.match(rumor?.text || '', /five carriers.*fifteen.*chart pair/i);
    assert.deepEqual(frontierRumorPurchaseOffer(
      route.state,
      LISTENING_POST.sourceStationId,
      LISTENING_POST.rumorId,
    ), rumor, 'the existing World purchase owner validates the same visible rumor card');

    route.owner.enterSector(LISTENING_POST.sourceSectorId, { placePlayer: false });
    const relay = livePoi(route.state, LISTENING_POST.sourcePoiId);
    assert.ok(relay, 'ordinary Dione entry materializes the existing relay body');
    assert.equal(relay.data.landmarkGlb, 'place_claim_outpost_relay');
    assert.equal(relay.data.name, LISTENING_POST.sourceName);

    route.player.pos.x = relay.pos.x - 70;
    route.player.pos.z = relay.pos.z;
    route.state.simTime = 12;
    route.state.input.actions.scanPulse = true;
    route.scanner.update(1 / 60, route.state);
    const signal = route.state.signalInvestigation.records[LISTENING_POST.signalId];
    assert.equal(signal?.sourceId, LISTENING_POST.sourcePoiId);
    assert.equal(signal?.sourceKind, 'archive');
    assert.equal(signal?.manualInvestigation, true);

    route.bus.emit('signal:investigate', { signalId: LISTENING_POST.signalId });
    route.scanner._updateTrackedSignal(route.state);
    const recovered = listeningPostPuzzleState(route.state);
    assert.equal(recovered.phase, 'recovered');
    assert.equal(explorationDiscoveryPlates(route.state)
      .find((plate) => plate.poiId === LISTENING_POST.sourcePoiId)?.title, 'The Listening Post Log');
    assert.equal(route.state.world.discovery[LISTENING_POST.targetSectorId]?.discovered, false);
    assert.equal(buildSystemModel(route.state, LISTENING_POST.targetSectorId).points
      .some((point) => point.stationId === LISTENING_POST.targetStationId), false,
    'the hidden station is absent from the system map before the code is solved');

    assert.equal(validateListeningPostAttempt('5,14').ok, false);
    route.bus.emit('secret:listeningPostDecodeRequested', { attempt: '5,14', source: 'codex' });
    assert.equal(listeningPostPuzzleState(route.state).lastResult, 'mismatch');
    assert.equal(route.state.world.discovery[LISTENING_POST.targetSectorId]?.discovered, false,
      'a guessed coordinate cannot reveal the station');

    assert.equal(validateListeningPostAttempt('05 / 15').ok, true);
    route.bus.emit('secret:listeningPostDecodeRequested', { attempt: '05 / 15', source: 'codex' });
    const decoded = listeningPostPuzzleState(route.state);
    assert.equal(decoded.phase, 'decoded');
    assert.equal(decoded.targetStationId, LISTENING_POST.targetStationId);
    assert.equal(route.state.world.discovery[LISTENING_POST.targetSectorId].discovered, true);
    assert.equal(route.state.world.discovery[LISTENING_POST.targetSectorId].source, 'listening_post');
    assert.equal(route.state.world.discovery[LISTENING_POST.targetSectorId].listeningPostStationId,
      LISTENING_POST.targetStationId);
    assert.equal(route.state.world.discovery[LISTENING_POST.targetSectorId]
      .stations[LISTENING_POST.targetStationId].discovered, true);
    assert.equal(buildSystemModel(route.state, LISTENING_POST.targetSectorId).points
      .some((point) => point.stationId === LISTENING_POST.targetStationId), true,
    'the decoded hidden station enters the ordinary system-map model');
    assert.equal(events.filter((row) => row.event === 'map:sectorCharted'
      && row.payload?.sectorId === LISTENING_POST.targetSectorId).length, 1);

    route.bus.emit('secret:listeningPostDecodeRequested', { attempt: '5,15', source: 'codex' });
    assert.equal(events.filter((row) => row.event === 'map:sectorCharted'
      && row.payload?.sectorId === LISTENING_POST.targetSectorId).length, 1,
    'duplicate UI input cannot manufacture another chart receipt');

    route.owner.enterSector(LISTENING_POST.targetSectorId, { placePlayer: false });
    const lastLight = liveStation(route.state, LISTENING_POST.targetStationId);
    assert.ok(lastLight, 'ordinary Sedna entry materializes the decoded station as a physical body');
    assert.equal(lastLight.data.hidden, true);
    assert.equal(buildSystemModel(route.state, LISTENING_POST.targetSectorId).points
      .some((point) => point.stationId === LISTENING_POST.targetStationId
        && point.entityId === lastLight.id), true,
    'the decoded map target resolves to the same live station body');
  } finally {
    route.sim.dispose();
  }
});

test('the recovered log and decoded station survive the real World and Scanner save owners', () => {
  const before = boot(300031);
  let worldSave;
  let scannerSave;
  try {
    before.owner.enterSector(LISTENING_POST.sourceSectorId, { placePlayer: false });
    const relay = livePoi(before.state, LISTENING_POST.sourcePoiId);
    before.player.pos.x = relay.pos.x - 70;
    before.player.pos.z = relay.pos.z;
    before.state.simTime = 24;
    before.state.input.actions.scanPulse = true;
    before.scanner.update(1 / 60, before.state);
    before.bus.emit('signal:investigate', { signalId: LISTENING_POST.signalId });
    before.scanner._updateTrackedSignal(before.state);
    before.bus.emit('secret:listeningPostDecodeRequested', { attempt: '5 15', source: 'codex' });
    worldSave = structuredClone(before.owner.serialize());
    scannerSave = structuredClone(before.scanner.serialize());
  } finally {
    before.sim.dispose();
  }

  const after = boot(300031);
  try {
    after.owner.deserialize(worldSave);
    after.scanner.deserialize(scannerSave);
    const decoded = listeningPostPuzzleState(after.state);
    assert.equal(decoded.decoded, true);
    assert.equal(decoded.attemptCount, 1);
    assert.equal(after.state.signalInvestigation.completed[LISTENING_POST.signalId]?.outcome, 'investigated');
    assert.equal(after.state.world.discovery[LISTENING_POST.targetSectorId].discovered, true);
    assert.equal(after.state.world.discovery[LISTENING_POST.targetSectorId].listeningPostStationId,
      LISTENING_POST.targetStationId);
    assert.equal(after.state.world.discovery[LISTENING_POST.targetSectorId]
      .stations[LISTENING_POST.targetStationId].discovered, true);
    assert.equal(buildSystemModel(after.state, LISTENING_POST.targetSectorId).points
      .some((point) => point.stationId === LISTENING_POST.targetStationId), true);
  } finally {
    after.sim.dispose();
  }
});
