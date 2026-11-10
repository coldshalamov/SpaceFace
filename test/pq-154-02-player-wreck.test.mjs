// PQ-154.02 — death leaves your hull and pod; Continue keeps them; one encounter cites them.
import assert from 'node:assert/strict';
import test from 'node:test';

import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  aftermathForSector,
  aftermathWrecks,
  isPlayerWreckMarker,
  playerWreckMarker,
  PLAYER_WRECK_ENCOUNTER_ID,
  WRECK_ECOLOGY_DAY_S,
} from '../src/systems/aftermathWrecks.js';
import { salvage } from '../src/systems/salvage.js';
import { isPlayerWreckPod, survivorPod } from '../src/systems/survivorPod.js';
import { playerWreckCitation, uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const SEED = 15420;
const SECTOR_ID = 'sector_helios_prime';

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
  }

  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }

  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function namedZonePos(sectorId = SECTOR_ID) {
  const zone = zonesForSector(sectorId)[0];
  assert.ok(zone && zone.center, `${sectorId} named-zone fixture exists`);
  return { zone, pos: sectorLocalToGlobalForSector(zone.center, sectorId) };
}

function boot(seed = SEED, sectorId = SECTOR_ID) {
  const { zone, pos } = namedZonePos(sectorId);
  const state = {
    meta: { seed },
    tick: 10,
    simTime: 12,
    mode: 'flight',
    playerId: 1,
    player: { uniqueWrecks: null, flags: {}, cargo: { items: {} } },
    world: { currentSectorId: sectorId },
    entities: new Map(),
    entityList: [],
    salvage: { points: [], plannedSectorId: null, sources: {} },
  };
  const bus = new Bus();
  let nextId = 1000;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextId++,
        alive: spec.alive !== false,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        data: spec.data ? { ...spec.data } : {},
        flags: spec.flags ? { ...spec.flags } : {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const systems = { aftermathWrecks, uniqueWrecks, salvage, survivorPod };
  const registry = { get: (name) => systems[name] || null };
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { ...pos },
    vel: { x: 8, z: -3 },
    mass: 28,
    rot: 0.4,
    pitch: 0.05,
    bank: -0.02,
    factionId: 'faction_free',
    data: { defId: 'ship_starter', shipClass: 'courier', name: 'Tessera' },
  });
  state.playerId = player.id;
  aftermathWrecks.init({ state, bus, helpers, registry });
  uniqueWrecks.init({ state, bus, helpers, registry });
  salvage.init({ state, bus, helpers, registry });
  survivorPod.init({ state, bus, helpers, registry });
  return { state, bus, helpers, registry, zone, pos, player };
}

function die(ctx) {
  ctx.player.alive = false;
  ctx.bus.emit('player:death', {
    pos: { ...ctx.player.pos },
    killerId: 77,
    recoverable: true,
    simTime: ctx.state.simTime,
  });
}

function liveWreck(state) {
  const marker = playerWreckMarker(state);
  if (!marker) return null;
  return (state.entityList || []).find((entity) => (
    entity && entity.alive !== false && entity.type === 'wreck'
    && entity.data && entity.data.markerId === marker.markerId
  )) || null;
}

function livePod(state) {
  return (state.entityList || []).find((entity) => isPlayerWreckPod(entity)) || null;
}

function citeEvents(bus) {
  return bus.log.filter((entry) => (
    entry.name === 'uniqueWreck:encounterRequested'
    && entry.payload
    && entry.payload.playerWreck === true
    && entry.payload.encounterId === PLAYER_WRECK_ENCOUNTER_ID
  ));
}

function dispose() {
  if (typeof aftermathWrecks.destroy === 'function') aftermathWrecks.destroy();
  if (typeof uniqueWrecks.destroy === 'function') uniqueWrecks.destroy();
  if (typeof salvage.destroy === 'function') salvage.destroy();
  if (typeof survivorPod.destroy === 'function') survivorPod.destroy();
}

test('PQ-154.02 seed 15420: death leaves a persistable hull and pod', () => {
  const ctx = boot(SEED);
  try {
    die(ctx);
    const marker = playerWreckMarker(ctx.state);
    const wreck = liveWreck(ctx.state);
    const pod = livePod(ctx.state);
    const citation = playerWreckCitation(ctx.state);
    const cites = citeEvents(ctx.bus);

    console.log(
      `PQ-154.02 wreck=${marker ? marker.markerId : 'none'} `
      + `pod=${pod ? pod.id : 'none'} encounter=${citation && citation.encounterId} seed=${SEED}`,
    );

    assert.ok(marker && isPlayerWreckMarker(marker), 'player death must record a player wreck marker');
    assert.equal(marker.kind, 'player_wreck');
    assert.equal(marker.encounterId, PLAYER_WRECK_ENCOUNTER_ID);
    assert.ok(wreck, 'the hull must rematerialize as a wreck');
    assert.equal(wreck.data.playerWreck, true);
    assert.equal(wreck.data.scanLabel, 'Your Hull');
    assert.ok(pod, 'death must leave your pod');
    assert.equal(pod.flags.persistent, true);
    assert.equal(pod.data.scanLabel, 'Your Pod');
    assert.ok(citation, 'unique wrecks must keep player-wreck identity');
    assert.equal(citation.encounterId, PLAYER_WRECK_ENCOUNTER_ID);
    assert.equal(citation.markerId, marker.markerId);
    assert.ok(cites.length >= 1, 'scavengers_fresh_wreck must cite the player wreck');
    assert.equal(cites[0].payload.markerId, marker.markerId);
    assert.ok(
      (ctx.state.salvage.points || []).some((point) => point && point.playerWreck === true
        && point.markerId === marker.markerId),
      'salvage must know the player wreck',
    );
    assert.equal(WRECK_ECOLOGY_DAY_S, 600);
  } finally {
    dispose();
  }
});

test('PQ-154.02 Continue rematerializes the same hull and pod from the real save owners', () => {
  const first = boot(SEED);
  let markerId = null;
  let encounterId = null;
  let savedAftermath = null;
  let savedUnique = null;
  try {
    die(first);
    const marker = playerWreckMarker(first.state);
    const wreck = liveWreck(first.state);
    const pod = livePod(first.state);
    assert.ok(marker && wreck && pod);
    markerId = marker.markerId;
    encounterId = playerWreckCitation(first.state).encounterId;
    savedAftermath = JSON.parse(JSON.stringify(aftermathWrecks.serialize()));
    savedUnique = JSON.parse(JSON.stringify(uniqueWrecks.serialize()));
    assert.ok(savedAftermath.bySector[SECTOR_ID].some(isPlayerWreckMarker));
    assert.equal(savedUnique.playerWreck.markerId, markerId);
  } finally {
    dispose();
  }

  const resumed = boot(SEED);
  try {
    // Production restore order from saveSystem: restoring, clear, enter, owner deserialize, loaded.
    resumed.bus.emit('save:restoring', {});
    for (const entity of resumed.state.entityList) entity.alive = false;
    resumed.state.entities.clear();
    resumed.state.entityList = [];
    resumed.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    assert.equal(aftermathForSector(resumed.state, SECTOR_ID).filter(isPlayerWreckMarker).length, 0);

    aftermathWrecks.deserialize(savedAftermath);
    uniqueWrecks.deserialize(savedUnique);
    resumed.bus.emit('save:loaded', {});

    const marker = playerWreckMarker(resumed.state);
    const wreck = liveWreck(resumed.state);
    const pod = livePod(resumed.state);
    const citation = playerWreckCitation(resumed.state);
    assert.ok(marker, 'player wreck marker survives Continue');
    assert.equal(marker.markerId, markerId);
    assert.ok(wreck, 'your hull rematerializes after Continue');
    assert.equal(wreck.data.markerId, markerId);
    assert.ok(pod, 'your pod rematerializes after Continue');
    assert.equal(pod.data.playerWreck, true);
    assert.ok(citation, 'unique wrecks keep the citation through Continue');
    assert.equal(citation.encounterId, encounterId);
    assert.equal(citation.markerId, markerId);
    assert.ok(
      citeEvents(resumed.bus).some((entry) => entry.payload.markerId === markerId),
      'Continue still cites scavengers_fresh_wreck against the same hull',
    );
  } finally {
    dispose();
  }
});

test('PQ-154.02 same seed reprints the same wreck identity', () => {
  const first = boot(SEED);
  let firstId = null;
  try {
    die(first);
    firstId = playerWreckMarker(first.state).markerId;
  } finally {
    dispose();
  }

  const replay = boot(SEED);
  try {
    die(replay);
    assert.equal(playerWreckMarker(replay.state).markerId, firstId);
    assert.equal(playerWreckCitation(replay.state).encounterId, PLAYER_WRECK_ENCOUNTER_ID);
  } finally {
    dispose();
  }
});

test('PQ-154.02 ecology budget is untouched', () => {
  assert.equal(WRECK_ECOLOGY_DAY_S, 600);
});
