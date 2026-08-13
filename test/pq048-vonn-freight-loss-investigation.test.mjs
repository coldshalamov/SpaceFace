// PQ-048.17 — one real curtain-convoy loss becomes Lira Vonn's bounded, map-only case.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { cargo } from '../src/systems/cargo.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { aftermathForSector, aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactLoadBoundary } from '../src/systems/stationContactLoadBoundary.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { save } from '../src/save/saveSystem.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  VONN_FREIGHT_CONTACT_ID,
  VONN_FREIGHT_SECTOR_ID,
  VONN_FREIGHT_STATION_ID,
  VONN_FREIGHT_ZONE_ID,
  vonnFreightLossFor,
  vonnFreightLossMapOffer,
} from '../src/data/vonnFreightLoss.js';
import { buildReply, openVonnFreightLossMap } from '../src/ui/screens/bar.js';
import { peekMapOpenIntent } from '../src/ui/mapAuthority.js';

const ANCHOR = Object.freeze(sectorLocalToGlobalForSector({ x: 1420, z: 760 }, VONN_FREIGHT_SECTOR_ID));
const STATION_POS = Object.freeze(sectorLocalToGlobalForSector({ x: 620, z: -880 }, VONN_FREIGHT_SECTOR_ID));

function boot(seed = 48117) {
  // This is the relevant production event sequence: a kill first creates the durable aftermath
  // marker, mining binds its immediate wreck, custody owns the freight loss, then Vonn observes it.
  const systems = [
    combat,
    aftermathWrecks,
    mining,
    surrenderRecovery,
    cargo,
    spawnBudget,
    encounterDirector,
    stationContacts,
    stationContactLoadBoundary,
    save,
  ];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.story.beatIndex = 7;
  state.world.currentSectorId = VONN_FREIGHT_SECTOR_ID;
  state.world.activeSector = {
    stations: [{ id: VONN_FREIGHT_STATION_ID, name: 'Drift Market', pos: { ...STATION_POS } }],
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z }, vel: { x: 0, z: 0 },
    radius: 8, hull: 200, hullMax: 200, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts', pos: { ...STATION_POS }, radius: 42,
    data: {
      stationId: VONN_FREIGHT_STATION_ID,
      factionId: 'faction_mts',
      sectorId: VONN_FREIGHT_SECTOR_ID,
      dockRadius: 72,
    },
  });
  const events = { loss: [], receipt: [], map: [] };
  bus.on('freight:loss', (payload) => events.loss.push(structuredClone(payload)));
  bus.on('freight:custodyReceipt', (payload) => events.receipt.push(structuredClone(payload)));
  bus.on('ui:pushScreen', (payload) => events.map.push(structuredClone(payload)));
  return { sim, state, bus, player, events, director: sim.registry.get('encounterDirector') };
}

function fireCurtainConvoy(h, suffix = '') {
  const encounterId = `pq048:vonn-freight-loss${suffix}`;
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy',
    encounterId,
    sectorId: VONN_FREIGHT_SECTOR_ID,
    zoneId: VONN_FREIGHT_ZONE_ID,
    anchor: { ...ANCHOR },
    force: true,
  }), { ok: true, encounterId });
  const live = h.state.encounterDirector.live[encounterId];
  assert.ok(live, 'the real encounter owner admitted its authored curtain convoy');
  assert.equal(live.data.destId, VONN_FREIGHT_STATION_ID, 'the live manifest is actually bound for Drift Market');
  return live;
}

function pods(h, live) {
  return live.ids
    .filter((id) => live.roles[id] === 'freight_pod')
    .map((id) => h.state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false);
}

function collectByPlayer(h, pod) {
  const payload = {
    pickupId: pod.id,
    collectorId: h.state.playerId,
    kind: pod.data.kind,
    amount: pod.data.amount,
    commodityId: pod.data.commodityId,
    pos: { x: pod.pos.x, z: pod.pos.z },
  };
  h.bus.emit('pickup:collected', payload);
  if (payload.rejectedAmount <= 0) pod.alive = false;
  else if (payload.acceptedAmount > 0) pod.data.amount = payload.rejectedAmount;
}

function closeSystems() {
  for (const system of [save, stationContactLoadBoundary, stationContacts, encounterDirector, spawnBudget,
    cargo, surrenderRecovery, mining, aftermathWrecks, combat]) {
    if (system && typeof system.destroy === 'function') system.destroy();
  }
}

test('one real Pallas curtain-convoy loss survives JSON Continue, gives Vonn a map-only wreck lead, and closes on the native salvage receipt', () => {
  const before = boot();
  const live = fireCurtainConvoy(before);
  const carrier = before.state.entities.get(live.data.predationTargetId);
  assert.ok(carrier, 'the real convoy carrier exists');
  before.sim.registry.get('combat').kill(carrier, before.state.playerId);

  const custody = live.data.freightCargoCustody;
  assert.ok(custody && custody.pods.length > 0, 'the cargo owner made physical custody pods');
  for (const pod of pods(before, live)) collectByPlayer(before, pod);
  before.sim.runTicks(61);

  assert.equal(before.events.loss.length, 1, 'the freight owner emits exactly one stable loss');
  assert.equal(before.events.receipt.length, 1, 'the cargo owner emits one terminal custody receipt');
  const marker = aftermathForSector(before.state, VONN_FREIGHT_SECTOR_ID)
    .find((entry) => entry.encounterId === live.id);
  assert.ok(marker && marker.freightIdentity, 'the aftermath owner retained one physical evidence marker');
  assert.equal(marker.zoneId, VONN_FREIGHT_ZONE_ID);
  assert.equal(marker.freightIdentity.manifestId, custody.manifestId);
  assert.equal(marker.freightIdentity.freighterKey, custody.freighterKey);

  const admitted = vonnFreightLossFor(before.state);
  assert.ok(admitted, 'Vonn observes only the already-owned loss after marker identity is present');
  assert.equal(admitted.lossIntentId, before.events.loss[0].intentId);
  assert.equal(admitted.markerId, marker.markerId);
  assert.ok(admitted.custody, `terminal custody receipt did not normalize: ${JSON.stringify(before.events.receipt[0])}`);
  assert.equal(admitted.custody.receiptId, before.events.receipt[0].receiptId);
  assert.equal(admitted.custody.accountedQty, admitted.custody.initialQty, 'receipt conservation survives the projection');
  for (const forbidden of ['carrierId', 'raiderId', 'victimId', 'wreckId', 'entityId']) {
    assert.equal(Object.hasOwn(admitted, forbidden), false, `case never saves numeric ${forbidden}`);
    assert.equal(Object.hasOwn(admitted.custody, forbidden), false, `receipt never saves numeric ${forbidden}`);
  }
  assert.equal(vonnFreightLossMapOffer(before.state), null, 'Vonn does not present a map lead before the existing wrecks question');
  before.bus.emit('freight:custodyReceipt', {
    ...before.events.receipt[0],
    initialQty: 10,
    accountedQty: 10,
    playerCollectedQty: 10,
    raiderSecuredQty: 10,
    stationRecoveredQty: 0,
    deliveredQty: 0,
    lostQty: 0,
  });
  assert.deepEqual(vonnFreightLossFor(before.state), admitted,
    'an impossible 10u receipt claiming 10u in two terminal dispositions fails closed');
  before.bus.emit('freight:custodyReceipt', {
    ...before.events.receipt[0],
    custodyId: `${before.events.receipt[0].custodyId}:foreign`,
  });
  before.bus.emit('aftermathWreck:completed', { markerId: 'aft_foreign', sectorId: VONN_FREIGHT_SECTOR_ID });
  assert.deepEqual(vonnFreightLossFor(before.state), admitted, 'mismatched custody and marker events cannot alter the admitted case');

  before.bus.emit('ui:talkContact', {
    contactId: VONN_FREIGHT_CONTACT_ID,
    stationId: VONN_FREIGHT_STATION_ID,
    choiceId: 'wrecks',
    name: 'Lira Vonn, “The Margin”',
  });
  const openReply = buildReply('barkeep', 'wrecks', { state: before.state, bus: before.bus }, VONN_FREIGHT_STATION_ID, {
    id: VONN_FREIGHT_CONTACT_ID,
    role: 'barkeep',
  });
  assert.ok(openReply.vonnFreightLossMapOffer, 'the existing wrecks choice receives the follow-up, not a synthetic mission');
  assert.equal(openReply.missionOffer, undefined);
  assert.equal(openReply.frontierRumorOffer, undefined);
  const navBeforeMap = structuredClone(before.state.nav);
  assert.equal(openVonnFreightLossMap({ state: before.state, bus: before.bus }), true);
  assert.deepEqual(before.events.map, [{ id: 'galaxyMap' }]);
  assert.deepEqual(peekMapOpenIntent(before.state), {
    focus: 'system',
    sectorId: VONN_FREIGHT_SECTOR_ID,
    missionId: null,
    stationId: null,
    pos: openReply.vonnFreightLossMapOffer.pos,
    label: 'Sker-Run freight wreck',
    source: 'station-bar:vonn-freight-loss',
  });
  assert.deepEqual(before.state.nav, navBeforeMap, 'opening the evidence map does not create a course or waypoint');

  const savedCase = vonnFreightLossFor(before.state);
  assert.equal(savedCase.followupHeard, true, 'the named wrecks question persists before Continue');
  const envelope = JSON.parse(JSON.stringify(before.sim.registry.get('save').serialize('pq048-vonn-open')));
  closeSystems();

  const after = boot(48118);
  assert.equal(after.sim.registry.get('save').loadEnvelope(envelope, 'pq048-vonn-open'), true);
  assert.equal(after.events.loss.length, 0, 'Continue does not replay the freight loss');
  assert.equal(after.events.receipt.length, 0, 'Continue does not replay custody settlement');
  const resumed = vonnFreightLossFor(after.state);
  assert.deepEqual(resumed, savedCase, 'the normalized bounded Vonn case survives JSON Continue exactly');
  assert.ok(vonnFreightLossMapOffer(after.state), 'the resumed physical marker remains reachable on the map');
  const wreck = after.state.entityList.find((entity) => entity && entity.alive !== false
    && entity.data && entity.data.markerId === resumed.markerId);
  assert.ok(wreck, 'the aftermath owner rematerialized the same marker-backed wreck after Continue');

  const resumedPlayer = after.state.entities.get(after.state.playerId);
  after.sim.registry.get('mining')._drainWreck(resumedPlayer, wreck, 1000, 8);
  assert.equal(aftermathForSector(after.state, VONN_FREIGHT_SECTOR_ID)
    .some((entry) => entry.markerId === resumed.markerId), false, 'native salvage consumes the exact physical marker');
  const completed = vonnFreightLossFor(after.state);
  assert.equal(completed.wreckStatus, 'completed', 'only the matching aftermath completion event closes Vonn’s case');
  assert.equal(vonnFreightLossMapOffer(after.state), null, 'the map CTA disappears with the real marker');
  const closedReply = buildReply('barkeep', 'wrecks', { state: after.state, bus: after.bus }, VONN_FREIGHT_STATION_ID, {
    id: VONN_FREIGHT_CONTACT_ID,
    role: 'barkeep',
  });
  assert.equal(closedReply.vonnFreightLossMapOffer, undefined);
  assert.match(closedReply.text, /closed|custody/i, 'later dialogue reports the resolved owner state');

  after.state.player.stationContacts[VONN_FREIGHT_CONTACT_ID].vonnFreightLoss.markerId = 'foreign-marker';
  after.bus.emit('save:loaded', {});
  assert.equal(vonnFreightLossFor(after.state), null, 'a corrupt saved case fails closed instead of inventing a map lead');

  closeSystems();
});
