import test from 'node:test';
import assert from 'node:assert/strict';

import { claims as claimsBase } from '../src/systems/claims.js';
import { world as worldBase } from '../src/systems/world.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

// The base screen's teleport button used to emit `claim:teleportRequest` — an event with zero
// listeners — and toast "Quantum jump engaged" while nothing moved. teleportFrom now performs
// the relocation through the world system's public same-sector seam (relocatePlayerInSector,
// the same primitive authored incidents use) and refuses honestly when the linked station is
// not a live in-sector entity.

const SECTOR_ID = 'sector_io_reach';
const STATION_ID = 'station_io_harbor';
const SECTOR_ORIGIN = sectorGlobalOrigin(SECTOR_ID);

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    of(name) { return events.filter((event) => event.name === name); },
  };
}

function makeStation() {
  return {
    id: 90,
    type: 'station',
    alive: true,
    collides: true,
    pos: { x: SECTOR_ORIGIN.x + 2200, z: SECTOR_ORIGIN.z },
    radius: 50,
    data: { stationId: STATION_ID, name: 'Io Harbor', sectorId: SECTOR_ID },
  };
}

function makeState() {
  const station = makeStation();
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: SECTOR_ORIGIN.x - 3000, z: SECTOR_ORIGIN.z - 3000 },
    vel: { x: 42, z: -7 },
    rot: 0.75,
    prevRot: 0.75,
    radius: 6,
    flags: {},
    data: {},
  };
  const state = {
    simTime: 100,
    tick: 1,
    mode: 'flight',
    meta: { seed: 47 },
    playerId: player.id,
    player: {
      credits: 200000,
      heat: 0,
      researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
      cargo: {
        items: {},
        usedVolume: 0,
        usedMass: 0,
        capVolume: 500,
        capMass: 500,
      },
      ownedShips: [],
    },
    world: { currentSectorId: SECTOR_ID },
    claims: null,
    entities: new Map([[player.id, player], [station.id, station]]),
    entityList: [player, station],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      dockStations: [station],
      stations: [station],
      byStationId: new Map([[STATION_ID, station]]),
    },
  };
  return state;
}

function bootHarness() {
  const state = makeState();
  const bus = makeBus();
  bus.on('economy:chargeCredits', ({ amount }) => {
    state.player.credits -= Math.max(0, Number(amount) || 0);
  });
  // The real world host, uninitialized: relocatePlayerInSector touches only state + bus.
  const world = Object.create(worldBase);
  world.state = state;
  world.bus = bus;
  const registry = { get: (name) => (name === 'world' ? world : null) };
  const sys = Object.create(claimsBase);
  sys.init({ state, bus, helpers: {}, registry });
  return { state, bus, sys, world, player: state.entities.get(1), station: state.entityIndex.dockStations[0] };
}

function claimWithTeleporter(h) {
  const poi = {
    id: 'poi_claim_teleport',
    name: 'Rhea Anchorage',
    size: 'M',
    pos: { x: SECTOR_ORIGIN.x, z: SECTOR_ORIGIN.z },
  };
  assert.equal(h.sys.claim(poi), true);
  const body = h.state.claims.bodies[0];
  assert.equal(h.sys.buildModule(body.id, 'mod_teleporter'), true);
  assert.equal(body.linkedStationId, STATION_ID, 'the teleporter auto-linked to the nearest station');
  return body;
}

test('a built teleporter jumps the player to a clear berth beside the linked station', () => {
  const h = bootHarness();
  const body = claimWithTeleporter(h);

  assert.equal(h.sys.teleportFrom(body.id), true, 'the jump happened');

  const player = h.player;
  const dist = Math.hypot(player.pos.x - h.station.pos.x, player.pos.z - h.station.pos.z);
  assert.ok(dist < 400, `player arrived beside the station (distance ${Math.round(dist)} WU)`);
  assert.equal(player.vel.x, 0, 'arrival velocity is zeroed');
  assert.equal(player.vel.z, 0, 'arrival velocity is zeroed');
  assert.equal(player.rot, 0.75, 'heading is kept');
  assert.equal(player.flags.noInterp, true, 'relocation snaps the render pose (no interpolation)');
  assert.ok(h.bus.of('world:playerRelocated').length > 0, 'the world relocation seam published its event');
  const jumpToast = h.bus.of('toast').find((t) => /Quantum jump engaged/.test(t.payload.text));
  assert.ok(jumpToast, 'the engagement toast fired');
});

test('a teleporter with no resolvable link refuses and the player does not move', () => {
  const h = bootHarness();
  const body = claimWithTeleporter(h);
  body.linkedStationId = 'station_gone_elsewhere';
  const before = { x: h.player.pos.x, z: h.player.pos.z };

  assert.equal(h.sys.teleportFrom(body.id), false, 'the jump is refused');
  assert.equal(h.player.pos.x, before.x, 'the player did not move');
  assert.equal(h.player.pos.z, before.z, 'the player did not move');
  const toast = h.bus.of('toast').at(-1);
  assert.equal(toast.payload.kind, 'error', 'the refusal is an honest error toast');
  assert.match(toast.payload.text, /not in this sector/);
});

test('a body without a teleporter module still refuses at the existing guard', () => {
  const h = bootHarness();
  const poi = {
    id: 'poi_claim_bare',
    name: ' bare Moon',
    size: 'M',
    pos: { x: SECTOR_ORIGIN.x, z: SECTOR_ORIGIN.z },
  };
  assert.equal(h.sys.claim(poi), true);
  const body = h.state.claims.bodies[0];
  const before = { x: h.player.pos.x, z: h.player.pos.z };

  assert.equal(h.sys.teleportFrom(body.id), false);
  assert.equal(h.player.pos.x, before.x, 'the player did not move');
  assert.equal(h.player.pos.z, before.z, 'the player did not move');
  assert.match(h.bus.of('toast').at(-1).payload.text, /No active teleporter/);
});
