import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsPrototype } from '../src/systems/missions.js';
import { uniqueWrecks as uniqueWrecksPrototype } from '../src/systems/uniqueWrecks.js';

const OFFER = Object.freeze({
  id: 'unique-wreck:the-lost-coils:v1',
  type: 'recon_scan',
  title: 'The Lost Coils',
  summary: 'Trace the Pale-Coil research bearing into Phoebe Echo.',
  stationId: 'station_helios',
  factionId: 'faction_scn',
  destSectorId: 'sector_phoebe_echo',
  destStationId: null,
  params: Object.freeze({ scanTargets: 1 }),
  reward_cr: 0,
  collateral_cr: 0,
  riskTier: 1,
  minRep: -1000,
  distance: 1600,
  source: 'uniqueWreck',
  wreckId: 'wreck_lanebreaker_pale_coil',
  sourceRef: 'mission.the_lost_coils',
  channelId: 'mission',
});

function boot(seed = 47024) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 20;
  state.tick = 1200;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.world.currentSectorId = 'sector_helios_prime';
  state.world.activeSector = { id: 'sector_helios_prime', stations: [], fields: [], pois: [], gates: [] };
  state.missions = { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null };
  state.story = { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 500 };

  const bus = createBus();
  const log = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    log.push({ event, payload });
    return rawEmit(event, payload);
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  let nextId = 100;
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextId++,
        alive: spec.alive !== false,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: { ...(spec.data || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const uniqueWrecks = Object.assign({}, uniqueWrecksPrototype);
  const missions = Object.assign({}, missionsPrototype);
  const registry = { get: () => null };
  uniqueWrecks.init({ state, bus, helpers, registry });
  missions.init({ state, bus, helpers, registry });
  return {
    state,
    bus,
    log,
    missions,
    destroy() {
      if (typeof missions.destroy === 'function') missions.destroy();
      uniqueWrecks.destroy();
    },
  };
}

test('the stable Lost Coils offer boards through the mission owner and acceptance grants D4 knowledge', () => {
  const t = boot();
  try {
    assert.equal(t.state.player.uniqueWrecks.bearings[OFFER.wreckId], undefined);
    t.bus.emit('mission:offered', structuredClone(OFFER));
    const boarded = t.state.missions.boards[OFFER.stationId]?.slots.find((entry) => entry.id === OFFER.id);
    assert.ok(boarded, 'uniqueWreck is an accepted external mission source');
    assert.deepEqual({
      source: boarded.source,
      sourceRef: boarded.sourceRef,
      wreckId: boarded.wreckId,
      channelId: boarded.channelId,
    }, {
      source: 'uniqueWreck',
      sourceRef: 'mission.the_lost_coils',
      wreckId: 'wreck_lanebreaker_pale_coil',
      channelId: 'mission',
    });
    assert.equal(t.log.some((entry) => entry.event === 'mission:offerBoarded'
      && entry.payload.offerId === OFFER.id
      && entry.payload.source === 'uniqueWreck'), true);

    assert.equal(t.missions.acceptMission(OFFER.id), true);
    const accepted = t.log.find((entry) => entry.event === 'mission:accepted' && entry.payload.source === 'uniqueWreck');
    assert.ok(accepted);
    assert.deepEqual({
      sourceRef: accepted.payload.sourceRef,
      wreckId: accepted.payload.wreckId,
      channelId: accepted.payload.channelId,
    }, {
      sourceRef: OFFER.sourceRef,
      wreckId: OFFER.wreckId,
      channelId: OFFER.channelId,
    });
    const bearing = t.state.player.uniqueWrecks.bearings[OFFER.wreckId];
    assert.ok(bearing, 'acceptance is the read event that reveals the D4 bearing');
    assert.equal(bearing.sourceRef, OFFER.sourceRef);
    assert.equal(bearing.channelId, 'mission');
    assert.equal(t.missions._onExternalBoardOffer(structuredClone(OFFER)), false, 'stable offer cannot board twice');
  } finally {
    t.destroy();
  }
});
