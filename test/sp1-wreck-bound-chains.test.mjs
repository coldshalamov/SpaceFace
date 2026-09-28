import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { UNIQUE_WRECKS, uniqueWreckById, placementForUniqueWreck, programSeedFor } from '../src/data/uniqueWrecks.js';
import {
  SET_PIECE_MISSIONS,
  SET_PIECE_WRECK_SECTORS,
  WRECK_BOUND_SET_PIECE_OBJECTIVES,
} from '../src/data/missions.js';
import { buildSetPieceMissionOffers } from '../src/systems/setPieceMissionOffers.js';
import { missions } from '../src/systems/missions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const META_SEED = 4242;
const PROGRAM_SEED = programSeedFor(META_SEED);
const CHAIN_WRECKS = UNIQUE_WRECKS.filter((wreck) => wreck.wreckChainId);

function flightSim() {
  const sim = createSimulation({
    seed: META_SEED,
    systems: [uniqueWrecks, missions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  state.player.credits = 50000;
  return { sim, state, bus };
}

function openingOffer(state, archetypeId) {
  return buildSetPieceMissionOffers(state, {
    archetypeId,
    startEpoch: 7,
    stageIndex: 0,
    branchId: null,
    attempt: 0,
  })[0];
}

function activeSetPieceMission(state, archetypeId) {
  return (state.missions.active || []).find((mission) => (
    mission && mission.cause && mission.cause.archetypeId === archetypeId
  )) || null;
}

test(`seed ${META_SEED}: every wreck-bound chain compiles its opening against its own placed hull`, () => {
  for (const def of CHAIN_WRECKS) {
    const definition = SET_PIECE_MISSIONS.find((entry) => entry.id === def.wreckChainId);
    assert.ok(definition, `${def.wreckChainId} exists in the SP1 catalog`);
    assert.equal(definition.wreckId, def.id, `${def.wreckChainId} binds ${def.id}`);
    assert.equal(SET_PIECE_WRECK_SECTORS[def.id], def.sectorId,
      `${def.id}: chain-sector table agrees with the wreck registry`);
    const opening = definition.commonStages[0];
    assert.equal(opening.destSectorId, def.sectorId,
      `${def.wreckChainId}: opening stage runs in the wreck's home sector`);
    assert.equal(opening.params.setPieceObjective
      && WRECK_BOUND_SET_PIECE_OBJECTIVES.has(opening.params.setPieceObjective), true,
      `${def.wreckChainId}: opening stage is wreck-bound`);
    const { state } = { state: { meta: { seed: META_SEED }, seed: META_SEED, missions: { boards: {}, active: [] } } };
    const offer = openingOffer(state, def.wreckChainId);
    assert.ok(offer, `${def.wreckChainId} compiles an opening offer`);
    assert.equal(offer.wreckId, def.id);
    assert.equal(offer.params.wreckId, def.id);
    assert.equal(offer.sourceRef, def.bearingSourceRef);
    assert.equal(offer.channelId, 'mission');
    assert.equal(offer.destSectorId, def.sectorId);
  }
});

test(`seed ${META_SEED}: long_read never targets a chain-dedicated wreck across many epochs`, () => {
  const state = { meta: { seed: META_SEED }, seed: META_SEED, missions: { boards: {}, active: [] } };
  const dedicated = new Set(CHAIN_WRECKS.map((wreck) => wreck.id));
  for (let epoch = 0; epoch < 64; epoch += 1) {
    const offer = buildSetPieceMissionOffers(state, {
      archetypeId: 'long_read',
      startEpoch: epoch,
      stageIndex: 0,
      branchId: null,
      attempt: 0,
    })[0];
    assert.ok(offer, `long_read compiles at epoch ${epoch}`);
    assert.equal(dedicated.has(offer.wreckId), false,
      `epoch ${epoch}: long_read must not bind chain-dedicated ${offer.wreckId}`);
  }
});

test(`seed ${META_SEED}: three empty pulses cannot finish any wreck-bound chain opening`, () => {
  for (const def of CHAIN_WRECKS) {
    const { sim, state, bus } = flightSim();
    try {
      const offer = openingOffer(state, def.wreckChainId);
      state.missions.boards[offer.stationId] = { slots: [offer] };
      assert.equal(sim.registry.get('missions').acceptMission(offer.id), true);
      const mission = activeSetPieceMission(state, def.wreckChainId);
      assert.ok(mission, `${def.wreckChainId} opening accepted`);
      assert.equal(mission.params.wreckId, def.id);

      state.world.currentSectorId = def.sectorId;
      const bearingCenter = placementForUniqueWreck(PROGRAM_SEED, def.id, def.sectorId).bearingCenterGlobal;
      // Three generic sector pulses far from the placed hull — the old free-progress exploit.
      for (let i = 0; i < 3; i += 1) {
        bus.emit('scan:pulse', { pos: { x: bearingCenter.x + 9000 + i, z: bearingCenter.z + 9000 } });
        bus.emit('scan:completed', { targetId: null, found: { asteroids: 0, wrecks: 0, anomalies: 0 } });
      }
      assert.equal(mission.status, 'active',
        `${def.wreckChainId}: empty pulses at empty space cannot complete the opening`);
      assert.equal(
        (mission.objectiveProgress || 0) < (mission.objectiveTarget || 1), true,
        `${def.wreckChainId}: generic pulses grant no progress on a wreck-bound scan`,
      );
    } finally {
      sim.dispose();
    }
  }
});

test(`seed ${META_SEED}: the Investigation Chain places one authored hull, needs its scan, and its box`, () => {
  const def = uniqueWreckById('wreck_mts_quadrille');
  const placement = placementForUniqueWreck(PROGRAM_SEED, def.id, def.sectorId);
  const { sim, state, bus } = flightSim();
  try {
    const offer = openingOffer(state, 'investigation_chain');
    state.missions.boards[offer.stationId] = { slots: [offer] };
    assert.equal(sim.registry.get('missions').acceptMission(offer.id), true);
    // The chain acceptance IS the rumor carrier: the bearing already exists, still unfixed.
    const bearing = state.player.uniqueWrecks.bearings[def.id];
    assert.ok(bearing, 'accepting the chain mints the authored bearing (mission channel)');
    assert.equal(bearing.channelId, 'mission');
    assert.equal(bearing.phase, 'rumored');

    state.world.currentSectorId = def.sectorId;
    bus.emit('sector:enter', { sectorId: def.sectorId });

    // Exactly one durable placed entity, carrying the authored scan label at the hash coordinate.
    const placed = state.entityList.filter((entity) => entity.alive !== false
      && entity.data && entity.data.uniqueWreckId === def.id);
    assert.equal(placed.length, 1, 'exactly one durable placed hull exists in the home sector');
    assert.equal(placed[0].data.scanLabel, def.scanLabel);
    assert.equal(placed[0].type, 'wreck');
    assert.equal(Math.abs(placed[0].pos.x - placement.exactGlobal.x) < 0.01, true,
      'the placed hull sits at the hash-derived global coordinate');
    assert.equal(Math.abs(placed[0].pos.z - placement.exactGlobal.z) < 0.01, true,
      'the placed hull sits at the hash-derived global coordinate');

    const mission = activeSetPieceMission(state, 'investigation_chain');
    // Empty pulses (far AND near-but-generic) do not settle the silent-wreck scan.
    for (let i = 0; i < 3; i += 1) {
      bus.emit('scan:completed', { targetId: null, found: { asteroids: 0, wrecks: 0, anomalies: 0 } });
    }
    bus.emit('scan:completed', { targetId: placed[0].id, found: { asteroids: 0, wrecks: 1, anomalies: 0 } });
    assert.equal(mission.status, 'active', 'three empty pulses plus a generic wreck read cannot finish stage 1');

    // Scanning the placed hull fixes the bearing — that is what completes the stage.
    bus.emit('scan:pulse', { pos: { ...placement.exactGlobal } });
    assert.equal(state.player.uniqueWrecks.bearings[def.id].phase, 'fixed');
    assert.equal(mission.status !== 'active', true, 'fixing the authored bearing completes the scan stage');

    const stage2Offer = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
      .find((row) => row && row.cause && row.cause.chainId === offer.cause.chainId
        && row.cause.stageIndex === 1);
    assert.ok(stage2Offer, 'the black-box recovery stage is posted');
    assert.equal(stage2Offer.params.wreckId, def.id);
    assert.equal(sim.registry.get('missions').acceptMission(stage2Offer.id), true);
    const stage2 = activeSetPieceMission(state, 'investigation_chain');
    assert.ok(stage2, 'the black-box recovery stage is accepted');
    assert.equal(stage2.params.setPieceObjective, 'investigation_recover_box');
    assert.equal(stage2.params.wreckId, def.id);

    state.world.currentSectorId = def.sectorId;
    // A random scrap hull in the right sector is not the story.
    const randomWreck = {
      id: 'random_scrap_hull', type: 'wreck', alive: true, pos: { x: placement.exactGlobal.x + 300, z: placement.exactGlobal.z },
      data: { salvagePool: { cmdty_scrap_metal: 2 } },
    };
    state.entities.set(randomWreck.id, randomWreck);
    state.entityList.push(randomWreck);
    bus.emit('salvage:completed', { wreckId: randomWreck.id, loot: { cmdty_scrap_metal: 2 } });
    assert.equal(stage2.status, 'active', 'a random wreck cannot settle the black-box stage');

    // The authored hull's own salvage settles it and opens the two disposition branches.
    bus.emit('salvage:completed', {
      wreckId: placed[0].id,
      loot: { cmdty_scrap_metal: 1, cmdty_salvage_electronics: 2 },
    });
    assert.equal(stage2.status !== 'active', true, 'the authored hull settles the recovery');
    const branchRows = Object.values(state.missions.boards).flatMap((board) => board.slots || [])
      .filter((row) => row && row.cause && row.cause.chainId === offer.cause.chainId
        && row.cause.stageIndex === 2);
    assert.equal(branchRows.length, 2, 'recovery opens both authored disposition choices');
    assert.equal(state.player.uniqueWrecks.bearings[def.id].phase, 'decision');
  } finally {
    sim.dispose();
  }
});
