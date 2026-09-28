import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import {
  UNIQUE_WRECKS,
  placementForUniqueWreck,
  programSeedFor,
  uniqueWreckById,
} from '../src/data/uniqueWrecks.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { SECTOR_RUMOR_SURFACES, uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { missions } from '../src/systems/missions.js';
import { buildSetPieceMissionOffers } from '../src/systems/setPieceMissionOffers.js';
import { SET_PIECE_WRECK_SECTORS } from '../src/data/missions.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { uniqueWreckBarRumor } from '../src/ui/uniqueWreckRumorSurface.js';

const META_SEED = 4242;

function authoredText(sourceRef) {
  const source = FLAVOR_SOURCE_BY_REF[sourceRef];
  return (source && Array.isArray(source.lines) ? source.lines : [])
    .map((line) => line && typeof line.text === 'string' ? line.text.trim() : '')
    .filter(Boolean)
    .join(' ');
}

function boot({ sectorId = 'sector_helios_prime' } = {}) {
  const sim = createSimulation({
    seed: META_SEED,
    systems: [salvageActions, uniqueWrecks],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  const events = [];
  for (const name of [
    'news:publish', 'news:headline', 'comms:popup', 'barkDirector:voice', 'mission:offered',
    'uniqueWreck:rumorRecorded', 'toast',
  ]) bus.on(name, (payload) => events.push({ name, payload }));

  const news = createMarketNews({ state, bus, helpers: { voice: { say: () => true } } });
  return {
    sim, state, bus, events, news,
    system: sim.registry.get('uniqueWrecks'),
    deliveries: (name) => events.filter((entry) => entry.name === name).map((entry) => entry.payload),
    dispose() { news.destroy(); sim.dispose(); },
  };
}

const SEALED_SURFACES = [
  ['sector_veil_nebula', 'wreck_isc_vigilant', 'loss_investigation', 'news:publish'],
  ['sector_ashfall_reach', 'wreck_isc_lighthouse', 'campaign', 'comms:popup'],
  ['sector_triton_wake', 'wreck_choir_bell_aegis', 'bark', 'barkDirector:voice'],
  ['sector_haumea_rift', 'wreck_choir_cassandra', 'campaign', 'comms:popup'],
];

for (const [sectorId, wreckId, channelId, carrierEvent] of SEALED_SURFACES) {
  test(`seed ${META_SEED}: entering ${sectorId} delivers the ${wreckId} rumor (${channelId})`, () => {
    const t = boot({ sectorId });
    try {
      const def = uniqueWreckById(wreckId);
      assert.equal(def.sectorId, sectorId);

      t.bus.emit('sector:enter', { sectorId });

      const record = t.state.player.uniqueWrecks.bearings[wreckId];
      assert.ok(record, 'the previously sealed rumor is delivered on sector entry');
      assert.equal(record.phase, 'rumored');
      assert.equal(record.channelId, channelId);
      assert.equal(record.sourceRef, def.bearingSourceRef);
      const placement = placementForUniqueWreck(programSeedFor(META_SEED), wreckId, sectorId);
      assert.deepEqual(record.bearingCenter, placement.bearingCenterGlobal);
      assert.deepEqual(record.exactPos, placement.exactGlobal);
      assert.equal(record.radius, placement.radius);

      // The carrier delivers the full authored copy, not a bare bearing.
      const carried = t.deliveries(carrierEvent).find((payload) => payload && payload.wreckId === wreckId);
      assert.ok(carried, `the ${carrierEvent} carrier fires for ${wreckId}`);
      assert.equal(carried.sourceRef, def.bearingSourceRef);
      assert.equal(carried.text, authoredText(def.bearingSourceRef));

      // Re-entry cannot re-mint, re-deliver, or stack a second bearing.
      const recordedBefore = t.deliveries('uniqueWreck:rumorRecorded').length;
      t.bus.emit('sector:enter', { sectorId });
      assert.equal(t.deliveries('uniqueWreck:rumorRecorded').length, recordedBefore);
      assert.equal(t.deliveries(carrierEvent).filter((payload) => payload && payload.wreckId === wreckId).length, 1);
    } finally {
      t.dispose();
    }
  });
}

test(`seed ${META_SEED}: the Triton-Wake bark materializes the Choir-Bell Aegis in-sector`, () => {
  const t = boot({ sectorId: 'sector_triton_wake' });
  try {
    t.bus.emit('sector:enter', { sectorId: 'sector_triton_wake' });
    const record = t.state.player.uniqueWrecks.bearings.wreck_choir_bell_aegis;
    assert.ok(record);
    const wreck = t.state.entityList.find((entity) => entity.alive !== false
      && entity.data && entity.data.uniqueWreckId === 'wreck_choir_bell_aegis');
    assert.ok(wreck, 'the heard rumor materializes its physical wreck in the current sector');
    assert.equal(wreck.data.scanLabel, 'CHOIR-BELL AEGIS · RESONANT FORTRESS SHRINE');
    assert.equal(wreck.data.scanned, false);
    assert.equal(wreck.data.interactionPrompt, 'PULSE SCANNER TO IDENTIFY');
  } finally {
    t.dispose();
  }
});

test(`seed ${META_SEED}: the Vigilant case file rides the news ticker but mints under loss_investigation`, () => {
  const t = boot({ sectorId: 'sector_veil_nebula' });
  try {
    t.bus.emit('sector:enter', { sectorId: 'sector_veil_nebula' });
    const record = t.state.player.uniqueWrecks.bearings.wreck_isc_vigilant;
    assert.ok(record);
    assert.equal(record.channelId, 'loss_investigation');
    // The relayed news:headline copy cannot mint a news-channel bearing (channel guard), so the
    // durable record keeps the authored channel while the player still reads the case file.
    assert.match(t.state.ui.marketNews.log[0].text, /VIGILANT CONTINUED ONE PASS/);
  } finally {
    t.dispose();
  }
});

test('census: every one of the sixteen authored wrecks has a live delivery path', () => {
  const covered = new Map();

  // Sector-entry surfaces: exact authored source + channel, home sector, authored copy present.
  for (const [sectorId, surface] of Object.entries(SECTOR_RUMOR_SURFACES)) {
    const def = uniqueWreckById(surface.wreckId);
    assert.ok(def, `surface names a live authored wreck: ${surface.wreckId}`);
    assert.equal(def.sectorId, sectorId, `${def.id}: surface must be its home sector`);
    const source = def.rumorSources.find((entry) => entry.sourceRef === def.bearingSourceRef);
    assert.ok(source, `${def.id}: bearing source is authored`);
    assert.equal(source.channelId, surface.channelId, `${def.id}: surface carries the authored channel`);
    assert.ok(authoredText(def.bearingSourceRef), `${def.id}: authored sourceText exists`);
    covered.set(def.id, `sector-enter:${sectorId}`);
  }

  // Bar wiring: every bar-channel bearing source is askable at a live station bar.
  for (const stationId of ['station_sker', 'station_haumea_rift', 'station_reach', 'station_helios']) {
    const rumor = uniqueWreckBarRumor({}, stationId, 'rumors');
    assert.ok(rumor, `${stationId} bar carries a wreck rumor`);
    const def = uniqueWreckById(rumor.wreckId);
    assert.ok(def, `bar rumor names an authored wreck: ${rumor.wreckId}`);
    assert.equal(def.bearingSourceRef, rumor.sourceRef);
    assert.equal(rumor.channelId, 'bar');
    covered.set(def.id, `bar:${stationId}`);
  }

  // Game-start surfaces: the Lost Coils mission offer and the Choir-Tender first read.
  const t = boot({ sectorId: 'sector_helios_prime' });
  try {
    t.bus.emit('game:started', {});
    for (const payload of t.deliveries('mission:offered')) {
      if (!payload || !payload.wreckId) continue;
      const def = uniqueWreckById(payload.wreckId);
      assert.ok(def, `mission offer names an authored wreck: ${payload.wreckId}`);
      assert.equal(payload.sourceRef, def.bearingSourceRef);
      covered.set(def.id, `mission-offer:${payload.id}`);
    }
    if (t.state.player.uniqueWrecks.bearings.wreck_choir_tender) {
      covered.set('wreck_choir_tender', 'game-start-news');
    }
  } finally {
    t.dispose();
  }

  // SP1 chain assignments: D13-D16's `mission`-channel rumor is carried by its own story chain.
  // Accepting the chain's opening offer is the native mission:accepted carrier (the Lost Coils
  // precedent): the exact authored source + channel reach the unique-wreck owner's guard and mint
  // the bearing, which materializes the placed hull on home-sector entry.
  for (const def of UNIQUE_WRECKS.filter((wreck) => wreck.wreckChainId)) {
    const archetypeId = def.wreckChainId;
    assert.equal(SET_PIECE_WRECK_SECTORS[def.id], def.sectorId,
      `${def.id}: chain-sector table agrees with the wreck registry`);
    const chain = createSimulation({
      seed: META_SEED,
      systems: [salvageActions, uniqueWrecks, missions],
    });
    try {
      const { state } = chain;
      state.mode = 'flight';
      const player = chain.spawn({
        type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
        radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
      });
      state.playerId = player.id;
      // The opening stages stake collateral; fund the fresh pilot so the accept is affordable.
      state.player.credits = 50000;
      const offer = buildSetPieceMissionOffers(state, {
        archetypeId,
        startEpoch: 1,
        stageIndex: 0,
        branchId: null,
        attempt: 0,
      })[0];
      assert.ok(offer, `${archetypeId} compiles an opening offer for ${def.id}`);
      assert.equal(offer.wreckId, def.id);
      assert.equal(offer.sourceRef, def.bearingSourceRef);
      assert.equal(offer.channelId, 'mission');
      state.missions.boards[offer.stationId] = { slots: [offer] };
      const missionsSystem = chain.registry.get('missions');
      assert.equal(missionsSystem.acceptMission(offer.id), true, `${archetypeId} accepts`);
      const record = state.player.uniqueWrecks.bearings[def.id];
      assert.ok(record, `${archetypeId} acceptance delivers the ${def.id} rumor`);
      assert.equal(record.channelId, 'mission');
      assert.equal(record.sourceRef, def.bearingSourceRef);
      assert.equal(record.phase, 'rumored');
      covered.set(def.id, `sp1-chain-accept:${archetypeId}`);
    } finally {
      chain.dispose();
    }
  }

  for (const def of UNIQUE_WRECKS) {
    assert.ok(covered.has(def.id), `${def.id} (${def.programSlot}, ${def.sectorId}) has no live delivery path`);
  }
  assert.equal(covered.size, UNIQUE_WRECKS.length, 'delivery paths are one-per-wreck with no orphans');
});
