import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { scanner } from '../src/systems/scanner.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { v2FlavorRuntime } from '../src/systems/v2FlavorRuntime.js';
import { world } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

function boot(seed) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, world, bandRadio, scanner, v2FlavorRuntime],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.ui = state.ui || {};
  state.ui.docked = false;
  state.input = state.input || {};
  state.input.actions = state.input.actions || {};
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 100,
    hullMax: 100,
    radius: 6,
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

function entitiesWith(state, predicate) {
  return [...state.entities.values()].filter((entity) => entity && entity.alive !== false && predicate(entity));
}

function installVoice(sim) {
  const messages = [];
  const flavor = sim.registry.get('v2Flavor');
  flavor.helpers = {
    ...flavor.helpers,
    voice: {
      say(payload) {
        messages.push(payload);
        return true;
      },
    },
  };
  return messages;
}

function pulseScanner(sim, state, player, target) {
  player.pos.x = target.pos.x;
  player.pos.z = target.pos.z;
  state.simTime = Math.max(1, Number(state.simTime) || 0);
  state.input.actions.scanPulse = true;
  sim.registry.get('scanner').update(1 / 60, state);
}

test('Helios Candle Fleet turns a plinth scan into authored lore and a durable Pit discovery', () => {
  const { sim, state, player } = boot(93);
  const messages = installVoice(sim);
  sim.registry.get('world').enterSector('sector_helios_prime');

  const memorials = entitiesWith(state, (entity) => entity.data?.poiId === 'poi_memorial');
  assert.equal(memorials.length, 1);
  const memorial = memorials[0];
  assert.equal(memorial.data.flavorTargetRef, 'landmark_c3_candle_fleet');
  assert.equal(memorial.data.scannerSignalKind, 'archive');

  pulseScanner(sim, state, player, memorial);
  const candleFleet = FLAVOR_PACKS.landmark_lore.entries.find((entry) => entry.programSlot === 'C3');
  assert.ok(candleFleet.lines.some((line) => line.text === messages[0]?.text),
    'the ordinary scanner must surface one authored Candle Fleet line');
  const archiveSignal = state.signalInvestigation.records[`signal:entity:${memorial.id}`];
  assert.equal(archiveSignal.sourceKind, 'archive');
  assert.equal(archiveSignal.classification, 'ARCHIVE TELEMETRY');

  sim.registry.get('world')._tickPOIScan(state);
  const plate = explorationDiscoveryPlates(state)
    .find((entry) => entry.poiId === 'poi_memorial');
  assert.equal(plate?.title, 'What Was the Pit?');
  assert.match(plate?.body || '', /twenty-fifth plinth/i);
  assert.match(plate?.body || '', /telemetry smear/i);

  const restored = {
    ...state,
    world: { ...state.world, discovery: JSON.parse(JSON.stringify(state.world.discovery)) },
  };
  assert.deepEqual(
    explorationDiscoveryPlates(restored).find((entry) => entry.poiId === 'poi_memorial'),
    plate,
    'the Pit discovery must survive the save-shaped JSON boundary',
  );
});

test('Pallas Drift materializes one buoy and seventeen sector-owned Quiessence scan carriers', () => {
  const { sim, state, bus, player } = boot(91);
  const messages = installVoice(sim);
  sim.registry.get('world').enterSector('sector_pallas_drift');

  const memorials = entitiesWith(state, (entity) => entity.data?.poiId === 'poi_quiessence'
    && entity.data.flavorTargetRef === 'landmark_c14_quiessence');
  assert.equal(memorials.length, 1);
  assert.equal(memorials[0].data.landmarkGlb, 'place_nav_buoy');
  assert.equal(memorials[0].data.bandProximityRadius, 1600);

  const hulls = entitiesWith(state, (entity) => entity.data?.memorialHull === true
    && entity.data.flavorTargetRef === 'landmark_c14_quiessence');
  assert.equal(hulls.length, 17);
  assert.deepEqual(
    hulls.map((entity) => entity.data.quiessenceShipIndex).sort((a, b) => a - b),
    Array.from({ length: 17 }, (_, index) => index + 1),
  );
  assert.ok(hulls.every((entity) => entity.type === 'fx'
    && entity.collides === false && entity.physicsBody === false));
  assert.equal(
    state.world.activeSector.pois.filter((row) => row.poiId.startsWith('poi_quiessence_hull_')
      && row.type === 'anomaly' && row.hidden === true).length,
    17,
    'the ordinary scanner must see non-colliding carriers through active POI authority',
  );

  const expected = sectorLocalToGlobalForSector({ x: -1900, z: -1700 }, 'sector_pallas_drift');
  assert.ok(Math.hypot(memorials[0].pos.x - expected.x, memorials[0].pos.z - expected.z) < 1e-6);
  assert.ok(entitiesWith(state, (entity) => entity.data?.worldDressing === true)
    .every((entity) => Math.hypot(entity.pos.x - memorials[0].pos.x, entity.pos.z - memorials[0].pos.z) >= 700));

  bus.emit('band:tune', { channelId: 'concord_bulletin' });
  state.simTime = 1;
  player.pos.x = memorials[0].pos.x;
  player.pos.z = memorials[0].pos.z;
  sim.registry.get('bandRadio').update(1, state);
  assert.ok(state.bandRadio.proximitySources.landmark_quiessence >= 0.55);
  assert.equal(state.bandRadio.effectiveSourceId, 'landmark_quiessence');

  const hullOne = hulls.find((entity) => entity.data.quiessenceShipIndex === 1);
  pulseScanner(sim, state, player, hullOne);
  assert.ok(messages.some((row) => row.text === FLAVOR_PACKS.quiessence.entries[0].text));
  assert.equal(messages.length, 1, 'one scan pulse admits one authored voice line');
  assert.equal(
    state.v2Flavor.presentedReceipts.filter((receipt) => receipt.startsWith('quiessence:')).length,
    1,
    'only the line admitted to the voice queue may be receipted',
  );

  state.simTime += 9;
  pulseScanner(sim, state, player, hullOne);
  assert.equal(messages.length, 2, 'a later pulse advances to the next unseen memorial fact');
  assert.equal(
    state.v2Flavor.presentedReceipts.filter((receipt) => receipt.startsWith('quiessence:')).length,
    2,
  );
});

test('Eunomia Gulf materializes one Hush carrier for Band silence and authored scan absence', () => {
  const { sim, state, bus, player } = boot(92);
  const messages = installVoice(sim);
  sim.registry.get('world').enterSector('sector_eunomia_gulf');

  const hush = entitiesWith(state, (entity) => entity.data?.poiId === 'poi_hush'
    && entity.data.flavorSourceId === 'planet_hush');
  assert.equal(hush.length, 1);
  assert.equal(hush[0].data.landmarkGlb, 'place_asteroid_rock_a');
  assert.equal(hush[0].data.bandProximityRadius, 2400);
  assert.ok(hush[0].radius >= 400);
  assert.ok(entitiesWith(state, (entity) => entity.data?.worldDressing === true)
    .every((entity) => Math.hypot(entity.pos.x - hush[0].pos.x, entity.pos.z - hush[0].pos.z) >= 900));

  bus.emit('band:tune', { channelId: 'concord_bulletin' });
  player.pos.x = hush[0].pos.x;
  player.pos.z = hush[0].pos.z;
  state.simTime = 1;
  sim.registry.get('bandRadio').update(1, state);
  assert.ok(state.bandRadio.proximitySources.planet_hush >= 0.6);
  assert.equal(state.bandRadio.effectiveSourceId, 'planet_hush');

  pulseScanner(sim, state, player, hush[0]);
  const complete = new Set(FLAVOR_PACKS.hush.entries
    .filter((entry) => entry.phase === 'complete')
    .map((entry) => entry.text));
  assert.ok(messages.some((row) => complete.has(row.text)),
    'zero-range scan reaches the existing stage-3 complete absence copy');
  assert.ok(state.v2Flavor.presentedReceipts.some((receipt) => receipt.startsWith('hush:')));

  player.pos.x = hush[0].pos.x + 8000;
  player.pos.z = hush[0].pos.z;
  state.simTime = 2;
  sim.registry.get('bandRadio').update(1, state);
  assert.equal(state.bandRadio.proximitySources.planet_hush, undefined);
});
