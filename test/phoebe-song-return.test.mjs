import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  shardSphereSongProgress,
  LANDMARK_QUEST_SOURCE,
  SHARD_SPHERE_SONG,
  buildLandmarkQuestOffers,
  validateLandmarkQuestOffer,
} from '../src/data/landmarkMissions.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { v2FlavorRuntime as flavorProto } from '../src/systems/v2FlavorRuntime.js';
import { world as worldProto } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const SECTOR_ID = SHARD_SPHERE_SONG.sectorId;
const POI_ID = SHARD_SPHERE_SONG.poiId;
const STATION_ID = SHARD_SPHERE_SONG.stationId;
const SIGNAL_ID = `signal:poi:${POI_ID}`;

function sectorDefinition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID);
}

function boot(seed = 6909) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 600;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000;
  state.player.stats = state.player.stats || {};
  state.factions.faction_vael = { ...(state.factions.faction_vael || {}), rep: 0 };

  const bus = createBus();
  const events = [];
  const spoken = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    events.push({ event, payload });
    return rawEmit(event, payload);
  };

  let nextId = 1;
  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: nextId++,
      alive: spec.alive !== false,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      data: { ...(spec.data || {}) },
      flags: { ...(spec.flags || {}) },
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const helpers = {
    hash32,
    mulberry32,
    spawnEntity,
    voice: {
      say(payload) {
        spoken.push(payload);
        return true;
      },
    },
    player: () => state.entities.get(state.playerId),
  };
  const scanner = Object.assign({}, scannerProto);
  const world = Object.assign({}, worldProto);
  const missions = Object.assign({}, missionsProto);
  const flavor = Object.assign({}, flavorProto);
  scanner.init({ state, bus, helpers, registry: { get: () => null } });
  world.init({ state, bus, helpers, registry: { get: () => null } });
  missions.init({ state, bus, helpers, registry: { get: (name) => name === 'world' ? world : null } });
  flavor.init({ state, bus, helpers, registry: { get: () => null } });

  const sector = sectorDefinition();
  const poi = sector.pois.find((row) => row.id === POI_ID);
  const targetPos = sectorLocalToGlobalForSector(poi.pos, SECTOR_ID);
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { x: targetPos.x - 80, z: targetPos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const sphere = spawnEntity({
    type: 'anomaly', team: 2, pos: targetPos, vel: { x: 0, z: 0 }, radius: 24,
    mass: 0, collides: false,
    data: {
      poi: true,
      poiId: poi.id,
      poiType: poi.type,
      name: poi.name,
      scannerSignalKind: poi.scannerSignalKind,
      repeatableScannerSignal: poi.repeatableScannerSignal,
      flavorTargetRef: poi.flavorTargetRef,
      sectorId: SECTOR_ID,
    },
  });
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = {
    id: SECTOR_ID,
    stations: [], fields: [], gates: [],
    pois: [{ id: sphere.id, poiId: POI_ID, type: poi.type, pos: { ...sphere.pos } }],
  };
  state.world.discovery[SECTOR_ID] = {
    charted: false,
    pois: { [POI_ID]: { discovered: true, identified: true, identifiedAt: 10 } },
    fieldsDepleted: {},
  };
  return { state, bus, events, spoken, scanner, world, missions, flavor, player, sphere };
}

function pulse(h, number) {
  h.state.simTime = 10 + number;
  h.scanner._pulse(h.state, h.player, h.state.simTime);
}


function plate(h) {
  return explorationDiscoveryPlates(h.state).find(row => row.poiId === POI_ID);
}
function restore(h) {
  const next = boot();
  const physicalSector = next.state.world.activeSector;
  for (const owner of ['world', 'scanner', 'missions', 'flavor']) {
    next[owner].deserialize(JSON.parse(JSON.stringify(h[owner].serialize())));
  }
// Fixture rematerializes its physical carrier after world clears runtime residency.
  // This is an owner-serialization test, not the full Save/Continue game route.
  next.state.world.activeSector = physicalSector;
  next.state.world.currentSectorId = SECTOR_ID;
  next.state.factions.faction_vael.rep = h.state.factions.faction_vael.rep;
  return next;
}

test('unfound sphere reveals no progress, and unrelated scans never advance the Song', () => {
  const h = boot();
  delete h.state.world.discovery[SECTOR_ID].pois[POI_ID];
  h.state.signalInvestigation.records[SIGNAL_ID] = { scanCount: 4 };
  assert.equal(shardSphereSongProgress(h.state), null);
  assert.equal(plate(h), undefined);
  const other = boot();
  other.state.signalInvestigation.records['signal:poi:poi_phoebe_vault'] = { scanCount: 99 };
  assert.equal(shardSphereSongProgress(other.state).recovered, 0);
  other.player.pos = { x: other.sphere.pos.x + 100000, z: other.sphere.pos.z };
  pulse(other, 1);
  assert.equal(shardSphereSongProgress(other.state).recovered, 0);
});

test('partial notes survive a leave/return and owner serialization without replay or knowledge grants', () => {
  const h = boot();
  pulse(h, 1); pulse(h, 2);
  assert.match(plate(h).body, /fragments 2\/4/);
  assert.doesNotMatch(plate(h).body, /removed a voice|Silent Vault|Reconstruction filed/);
  h.state.world.currentSectorId = 'sector_helios_prime';
  assert.match(plate(h).body, /fragments 2\/4/);
  const next = restore(h);
  const before = JSON.stringify({ discovery: next.state.world.discovery, missions: next.state.missions,
    signals: next.state.signalInvestigation, player: next.state.player });
  for (let i = 0; i < 20; i++) assert.match(plate(next).body, /fragments 2\/4/);
  assert.equal(JSON.stringify({ discovery: next.state.world.discovery, missions: next.state.missions,
    signals: next.state.signalInvestigation, player: next.state.player }), before);
  next.state.world.currentSectorId = SECTOR_ID;
  pulse(next, 3);
  assert.equal(shardSphereSongProgress(next.state).recovered, 3);
  assert.deepEqual(next.spoken.filter(row => /^SCHISM FRAGMENT/.test(row.text)).map(row =>
    row.text.match(/FRAGMENT (\d\/4)/)[1]), ['3/4']);
  pulse(next, 4);
  const fourth = next.spoken.filter(row => /^SCHISM FRAGMENT 4\/4/.test(row.text));
  assert.equal(fourth.length, 1);
  assert.match(fourth[0].text, /pilgrims hum the missing note/);
  assert.match(fourth[0].text, /Vael standing \+150 or higher/);
  assert.doesNotMatch(fourth[0].text, /Hostility turns/);
  const returned = restore(next);
  pulse(returned, 5);
  assert.equal(shardSphereSongProgress(returned.state).recovered, 4);
  assert.equal(returned.spoken.filter(row => /^SCHISM FRAGMENT/.test(row.text)).length, 0,
    'Continue preserves the final note receipt rather than minting a fifth fragment');
  assert.equal(returned.events.filter(row => row.event === 'economy:grantCredits').length, 0);
});

test('fourth real pulse connects notes to the precise Vael gate and ordinary board', () => {
  const h = boot();
  for (let i = 1; i <= 4; i++) pulse(h, i);
  const fourth = h.spoken.find(row => /^SCHISM FRAGMENT 4\/4/.test(row.text));
  assert.match(fourth.text, /Vael standing \+150 or higher/);
  assert.equal(shardSphereSongProgress(h.state).phase, 'trust');
  h.state.factions.faction_vael.rep = 149;
  assert.equal(h.missions.acceptMission(SHARD_SPHERE_SONG.id), false);
  assert.match(plate(h).body, /Earn that trust/);
  h.state.factions.faction_vael.rep = 150;
  assert.equal(shardSphereSongProgress(h.state).phase, 'ready');
  assert.match(plate(h).body, /mission board/);
  assert.equal(h.missions.acceptMission(SHARD_SPHERE_SONG.id), true);
  assert.equal(shardSphereSongProgress(h.state).phase, 'return');
  const next = restore(h);
  assert.equal(shardSphereSongProgress(next.state).phase, 'return');
  pulse(next, 5);
  assert.equal(shardSphereSongProgress(next.state).phase, 'filed');
  assert.match(plate(next).body, /Reconstructed Schism Song/);
  assert.match(plate(next).body, /no second reconstruction payment/);
  const grants = () => next.events.filter(row => row.event === 'economy:grantCredits'
    && String(row.payload.reason).startsWith('mission:')).length;
  assert.equal(grants(), 1);
  pulse(next, 6);
  assert.equal(grants(), 1);
  assert.equal(next.spoken.filter(row => /^SCHISM FRAGMENT/.test(row.text)).length, 0);
  const filed = restore(next);
  assert.equal(shardSphereSongProgress(filed.state).phase, 'filed');
  assert.deepEqual(buildLandmarkQuestOffers(filed.state, { sectorId: SECTOR_ID }), []);
  pulse(filed, 7);
  assert.equal(filed.events.filter(row => row.event === 'economy:grantCredits').length, 0);
});

test('ready fourth-note guidance does not compete with a second voice event', () => {
  const h = boot(); h.state.factions.faction_vael.rep = 150;
  for (let i = 1; i <= 4; i++) pulse(h, i);
  const fragments = h.spoken.filter(row => /^SCHISM FRAGMENT/.test(row.text));
  assert.equal(fragments.length, 4);
  assert.match(fragments[3].text, /mission board/);
  assert.doesNotMatch(fragments[3].text, /removed a voice/);
});

test('legacy and malformed progress stays finite and completed artifact takes priority', () => {
  const h = boot();
  for (const raw of [undefined, -4, NaN, Infinity, {}, []]) {
    h.state.signalInvestigation.records[SIGNAL_ID] = { scanCount: raw };
    assert.equal(shardSphereSongProgress(h.state).recovered, 0);
  }
  h.state.signalInvestigation.records[SIGNAL_ID] = { scanCount: '4' };
  assert.equal(shardSphereSongProgress(h.state).recovered, 4);
  assert.equal(buildLandmarkQuestOffers(h.state, { sectorId: SECTOR_ID }).length, 1);
  h.state.signalInvestigation.records[SIGNAL_ID] = { scanCount: 2.9 };
  assert.equal(shardSphereSongProgress(h.state).recovered, 2);
  h.state.signalInvestigation.records[SIGNAL_ID] = { scanCount: 9999 };
  assert.equal(shardSphereSongProgress(h.state).recovered, 4);
  delete h.state.signalInvestigation;
  h.state.world.discovery[SECTOR_ID].pois[POI_ID].landmarkArtifact = { ...SHARD_SPHERE_SONG.artifact };
  assert.equal(shardSphereSongProgress(h.state).phase, 'filed');
});


test('earned posted reconstruction survives scanner contact-history eviction', () => {
  const h = boot();
  for (let i = 1; i <= 4; i++) pulse(h, i);
  const saved = h.scanner.serialize();
  for (let i = 0; i < 65; i++) saved.records[`new-contact:${i}`] = {
    id: `new-contact:${i}`, scanCount: 1, lastScanAt: 100 + i, pos: { x: 0, z: 0 },
  };
  // An older save may already have lost the scanner row; its earned board is still authoritative.
  delete saved.records[SIGNAL_ID];
  h.scanner.deserialize(saved);
  assert.equal(h.state.signalInvestigation.records[SIGNAL_ID], undefined);
  assert.equal(shardSphereSongProgress(h.state).recovered, 4);
  assert.equal(shardSphereSongProgress(h.state).phase, 'trust');
  h.state.factions.faction_vael.rep = 150;
  const next = restore(h);
  assert.equal(shardSphereSongProgress(next.state).phase, 'ready');
  assert.equal(next.missions.acceptMission(SHARD_SPHERE_SONG.id), true);
  pulse(next, 5);
  assert.equal(shardSphereSongProgress(next.state).phase, 'filed');
});


for (const initial of [1, 2, 3]) test(`partial ${initial}/4 survives contact pressure and a fresh return carrier`, () => {
  const h = boot();
  for (let i = 1; i <= initial; i++) pulse(h, i);
  const saved = h.scanner.serialize();
  for (let i = 0; i < 80; i++) saved.records[`pressure:${i}`] = {
    id: `pressure:${i}`, sourceId: `pressure:${i}`, sectorId: 'sector_helios_prime',
    sourceKind: 'archive', scanCount: 1, lastScanAt: 100 + i, pos: { x: 0, z: 0 },
  };
  // Apply live contact pressure, then let an actual out-of-range pulse run normal pruning.
  h.state.signalInvestigation.records = saved.records;
  const returnPos = { ...h.player.pos };
  h.player.pos = { x: h.sphere.pos.x + 100000, z: h.sphere.pos.z };
  pulse(h, initial + 1);
  h.player.pos = returnPos;
  assert.equal(Object.keys(h.state.signalInvestigation.records).length, 64);
  // Load normalization must retain the same exact reading too.
  h.scanner.deserialize(h.scanner.serialize());
  assert.equal(h.state.signalInvestigation.records[SIGNAL_ID].scanCount, initial);
  assert.equal(h.state.signalInvestigation.completed[SIGNAL_ID], undefined);
  assert.equal(h.state.signalInvestigation.trackedId, null);
  const next = restore(h);
  // A revisit has a different transient entity ID. The durable identity stays the authored POI.
  const oldId = next.sphere.id;
  next.state.entities.delete(oldId);
  next.sphere.id = 900 + initial;
  next.state.entities.set(next.sphere.id, next.sphere);
  next.state.world.activeSector.pois[0].id = next.sphere.id;
  assert.match(plate(next).body, new RegExp(`fragments ${initial}/4`));
  next.state.factions.faction_vael.rep = 150;
  for (let i = initial + 1; i <= 4; i++) pulse(next, i);
  assert.deepEqual(next.spoken.filter(row => /^SCHISM FRAGMENT/.test(row.text))
    .map(row => Number(row.text.match(/FRAGMENT (\d)/)[1])),
    Array.from({ length: 4 - initial }, (_, i) => initial + i + 1));
  assert.equal(next.missions.acceptMission(SHARD_SPHERE_SONG.id), true);
  pulse(next, 5); pulse(next, 6);
  assert.equal(shardSphereSongProgress(next.state).phase, 'filed');
  assert.equal(next.events.filter(row => row.event === 'economy:grantCredits'
    && String(row.payload.reason).startsWith('mission:')).length, 1);
});

test('Song retention rejects foreign identity and malformed readings under pressure', () => {
  const h = boot(); pulse(h, 1);
  const valid = h.scanner.serialize();
  const wrong = [
    { sectorId: 'sector_helios_prime' }, { sourceId: 'poi_phoebe_vault' },
    { sourceKind: 'wreck' }, { scanCount: 0 }, { scanCount: -1 },
    { scanCount: Infinity }, { scanCount: NaN }, { scanCount: 'not a count' },
  ];
  for (const change of wrong) {
    const data = structuredClone(valid);
    Object.assign(data.records[SIGNAL_ID], change);
    for (let i = 0; i < 64; i++) data.records[`later:${i}`] = {
      id: `later:${i}`, scanCount: 1, lastScanAt: 100 + i, pos: { x: 0, z: 0 },
    };
    h.scanner.deserialize(data);
    assert.equal(h.state.signalInvestigation.records[SIGNAL_ID], undefined);
    assert.equal(Object.keys(h.state.signalInvestigation.records).length, 64);
  }
  const foreign = structuredClone(valid);
  foreign.records['signal:poi:not_phoebe'] = { ...foreign.records[SIGNAL_ID], id: 'signal:poi:not_phoebe' };
  delete foreign.records[SIGNAL_ID];
  for (let i = 0; i < 64; i++) foreign.records[`later:${i}`] = {
    id: `later:${i}`, scanCount: 1, lastScanAt: 100 + i, pos: { x: 0, z: 0 },
  };
  h.scanner.deserialize(foreign);
  assert.equal(h.state.signalInvestigation.records['signal:poi:not_phoebe'], undefined);
});
