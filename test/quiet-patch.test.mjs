import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { TUNABLE_BAND_CHANNEL_IDS } from '../src/data/bandRadio.js';
import {
  EUNOMIA_QUIET_PATCH_RUMOR,
  FRONTIER_RUMOR_DAY_SECONDS,
  frontierRumorOffer,
  normalizeFrontierRumorState,
} from '../src/data/frontierRumors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';
import { frontierRumorMapReadouts } from '../src/ui/frontierRumorMapLayer.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const DISCOVERY = EUNOMIA_QUIET_PATCH_RUMOR;
const STATION_IDS = SECTORS.flatMap((sector) => (sector.stations || []).map((station) => station.id));

function quietPatchDefinition() {
  const sector = SECTORS.find((row) => row.id === DISCOVERY.sectorId);
  const poi = sector && (sector.pois || []).find((row) => row.id === DISCOVERY.poiId);
  assert.ok(sector && poi, 'the authored rumor must bind the existing Hush');
  return { sector, poi };
}

function boot(seed = 19019) {
  const beds = [];
  const plateUnlocks = [];
  const sim = createSimulation({ seed, systems: [spawnBudget, world, bandRadio] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.ui = { ...(state.ui || {}), docked: false };
  state.player.credits = 10_000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 6,
  });
  state.playerId = player.id;
  bus.on('economy:chargeCredits', ({ amount }) => { state.player.credits -= amount; });
  bus.on('band:bed', (payload) => beds.push(structuredClone(payload)));
  bus.on('discovery:plateUnlocked', (payload) => plateUnlocks.push(structuredClone(payload)));
  return { sim, state, bus, player, beds, plateUnlocks };
}

function advanceBand(h, x, z) {
  h.player.pos.x = x;
  h.player.pos.z = z;
  h.state.simTime += 0.25;
  h.sim.registry.get('bandRadio').update(0.25, h.state);
  return h.beds.at(-1);
}

test('Eunomia sells one stable approximate Quiet Patch rumor and never rotates a second Hush lead', () => {
  const { sector, poi } = quietPatchDefinition();
  const a = createGameState(19019);
  const b = createGameState(19019);
  a.simTime = b.simTime = 17 * FRONTIER_RUMOR_DAY_SECONDS;
  a.rng = () => { throw new Error('frontier rumor selection must not consume state.rng'); };
  b.rng = () => { throw new Error('frontier rumor selection must not consume state.rng'); };

  const first = frontierRumorOffer(a, DISCOVERY.stationId);
  const repeat = frontierRumorOffer(b, DISCOVERY.stationId);
  assert.deepEqual(repeat, first, 'same seed and sector-day must reproduce the authored lead');
  assert.equal(first.id, DISCOVERY.rumorId);
  assert.equal(first.sourceStationId, DISCOVERY.stationId);
  assert.equal(first.sectorId, DISCOVERY.sectorId);
  assert.equal(first.targetId, DISCOVERY.poiId);
  assert.equal(first.kind, 'anomaly');
  assert.match(first.text, /radio carrier/i);
  assert.match(first.text, /engine and hull noise remain/i);
  assert.match(first.text, /not treasure/i);
  assert.equal(Object.hasOwn(first, 'targetPos'), false);
  assert.equal(Object.hasOwn(first, 'courseTarget'), false);

  const targetGlobal = sectorLocalToGlobalForSector(poi.pos, sector.id);
  const clueError = Math.hypot(
    first.bearingCenter.x - targetGlobal.x,
    first.bearingCenter.z - targetGlobal.z,
  );
  assert.ok(clueError > 0 && clueError < first.radius,
    'the card must disclose a search circle rather than the physical Hush coordinate');

  const h = boot(19019);
  h.state.rng = () => { throw new Error('Quiet Patch route must not consume state.rng'); };
  h.state.simTime = 17 * FRONTIER_RUMOR_DAY_SECONDS;
  const worldSystem = h.sim.registry.get('world');
  const creditsBefore = h.state.player.credits;
  assert.equal(worldSystem._onPurchaseFrontierRumor({
    rumorId: first.id,
    stationId: DISCOVERY.stationId,
  }), true);
  assert.equal(h.state.player.credits, creditsBefore - first.price);
  assert.equal(worldSystem._onPurchaseFrontierRumor({
    rumorId: first.id,
    stationId: DISCOVERY.stationId,
  }), false, 'the same stable rumor cannot charge twice');
  assert.equal(h.state.player.credits, creditsBefore - first.price);

  const own = h.state.world.frontierRumors;
  assert.deepEqual(own.receipts.map((row) => row.type), ['purchased']);
  assert.equal(own.byId[first.id].phase, 'rumored');
  assert.equal(own.byId[first.id].coordSpace, 'global_v1');
  assert.equal(frontierRumorMapReadouts(h.state, DISCOVERY.sectorId).length, 1);
  assert.equal(frontierRumorMapReadouts(h.state, DISCOVERY.sectorId)[0].courseTarget, null);

  const saved = worldSystem.serialize();
  const normalized = normalizeFrontierRumorState(JSON.parse(JSON.stringify(saved.frontierRumors)));
  assert.deepEqual(normalized.byId[first.id].bearingCenter, first.bearingCenter);
  assert.equal(normalized.byId[first.id].phase, 'rumored');
  assert.equal(normalized.receipts.filter((row) => row.rumorId === first.id).length, 1);

  const hushOffersAfterPurchase = [];
  for (let day = 0; day < 80; day++) {
    h.state.simTime = day * FRONTIER_RUMOR_DAY_SECONDS;
    for (const stationId of STATION_IDS) {
      const offer = frontierRumorOffer(h.state, stationId);
      if (offer && offer.targetId === DISCOVERY.poiId) hushOffersAfterPurchase.push(offer);
    }
  }
  assert.deepEqual(hushOffersAfterPurchase, [],
    'generic anomaly rotation must never mint a second rumor for poi_hush');
});

test('the real Hush silences every Band channel until ordinary discovery clears its one ring', () => {
  const h = boot(19019);
  h.state.rng = () => { throw new Error('the physical Quiet Patch route must not consume state.rng'); };
  const worldSystem = h.sim.registry.get('world');
  const bandSystem = h.sim.registry.get('bandRadio');

  const offer = frontierRumorOffer(h.state, DISCOVERY.stationId);
  assert.equal(worldSystem._onPurchaseFrontierRumor({
    rumorId: offer.id,
    stationId: DISCOVERY.stationId,
  }), true);
  worldSystem.enterSector(DISCOVERY.sectorId);

  const hush = [...h.state.entities.values()].filter((entity) => entity && entity.alive !== false
    && entity.data?.poiId === DISCOVERY.poiId
    && entity.data?.flavorSourceId === 'planet_hush');
  assert.equal(hush.length, 1, 'world authority must materialize one real Hush carrier');
  const carrier = hush[0];
  const outsideX = carrier.pos.x + carrier.radius + carrier.data.bandProximityRadius + 10;

  for (const channelId of TUNABLE_BAND_CHANNEL_IDS) {
    h.bus.emit('band:tune', { channelId });
    const before = advanceBand(h, outsideX, carrier.pos.z);
    assert.equal(before.active, true, `${channelId} should remain audible outside the Hush`);
    assert.equal(before.silence, false);

    const inside = advanceBand(h, carrier.pos.x, carrier.pos.z);
    assert.equal(inside.active, false, `${channelId} carrier must vanish inside the Hush`);
    assert.equal(inside.silence, true);
    assert.equal(inside.sourceId, 'planet_hush');
    assert.equal(h.state.bandRadio.effectiveSourceId, 'planet_hush',
      'the existing Band surface identifies the physical silence as RF VOID');

    const after = advanceBand(h, outsideX, carrier.pos.z);
    assert.equal(after.active, true, `${channelId} should return after crossing the physical boundary`);
    assert.equal(after.silence, false);
    assert.equal(h.state.bandRadio.effectiveSourceId, null);
  }

  advanceBand(h, carrier.pos.x, carrier.pos.z);
  assert.equal(h.state.bandRadio.effectiveSourceId, 'planet_hush');
  const bandSave = bandSystem.serialize();
  assert.deepEqual(bandSave.proximitySources, {}, 'live Hush proximity must not enter the save');
  assert.equal(bandSave.effectiveSourceId, null);
  bandSystem.deserialize({
    ...bandSave,
    proximitySources: { planet_hush: 1 },
    effectiveSourceId: 'planet_hush',
    effectiveChannelId: 'landmark_bleed',
    effectiveKey: 'landmark:planet_hush',
  });
  assert.deepEqual(h.state.bandRadio.proximitySources, {}, 'load must reject stale physical proximity');
  assert.equal(h.state.bandRadio.effectiveSourceId, null);

  const unlocksBefore = h.plateUnlocks.length;
  h.player.pos.x = carrier.pos.x;
  h.player.pos.z = carrier.pos.z;
  worldSystem._tickPOIScan(h.state);
  worldSystem._tickPOIScan(h.state);

  assert.equal(h.state.world.discovery[DISCOVERY.sectorId].pois[DISCOVERY.poiId].identified, true);
  assert.equal(h.state.world.frontierRumors.byId[offer.id].phase, 'resolved');
  assert.equal(frontierRumorMapReadouts(h.state, DISCOVERY.sectorId).length, 0,
    'ordinary physical identification clears the approximate rumor ring');
  assert.equal(h.plateUnlocks.length - unlocksBefore, 1,
    'repeat proximity ticks unlock only one discovery plate');

  const plates = explorationDiscoveryPlates(h.state)
    .filter((plate) => plate.sectorId === DISCOVERY.sectorId && plate.poiId === DISCOVERY.poiId);
  assert.equal(plates.length, 1);
  assert.equal(plates[0].title, 'The Quiet Patch');
  assert.match(plates[0].body, /radio carriers vanish/i);
  assert.match(plates[0].body, /engine vibration and hull noise remain/i);
  assert.match(plates[0].body, /nothing waits/i);
});
