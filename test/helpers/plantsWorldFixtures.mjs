// Shared harness for the plants-world-reacts test family. Extracted verbatim from the
// original test/plants-world-reacts.test.mjs harness so the core/life splits keep the
// exact same fixtures: make* builders are pure entity factories, makeState is the minimal
// flight-mode state the plants read, and makeHost mixes ops/plant objects onto a host with
// recording bus helpers (spawn/remove/voice/cue/popup).
//
// No src imports on purpose: everything here is plain data plumbing.

export function makeShip(id, {
  x = 0, z = 0, vx = 0, vz = 0, radius = 8, rot = 0, data = {}, team = 2, type = 'ship', hull, hullMax,
} = {}) {
  const ship = {
    id,
    type,
    alive: true,
    team,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot,
    radius,
    data: {
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0, brake: false },
      ...data,
    },
  };
  if (hull !== undefined) ship.hull = hull;
  if (hullMax !== undefined) ship.hullMax = hullMax;
  return ship;
}

export function makePlayer(opts = {}) {
  return makeShip('p1', { team: 0, radius: 6, ...opts });
}

export function makeStation(id, { x = 0, z = 0 } = {}) {
  return { id, type: 'station', alive: true, pos: { x, z }, radius: 60, data: { stationId: id } };
}

export function makeBeacon(id, { x = 0, z = 0, data = {} } = {}) {
  return { id, type: 'beacon', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius: 5, data };
}

export function makeCargo(id, { x = 0, z = 0, vx = 0, vz = 0, data = {} } = {}) {
  return { id, type: 'cargo', alive: true, pos: { x, z }, vel: { x: vx, z: vz }, radius: 4, data };
}

// Entities map is shared with spawn helpers so spawned props are lookable.
export function makeState({ entities = new Map(), stations = [], simTime = 0, tick = 0, law } = {}) {
  const state = {
    mode: 'flight',
    simTime,
    tick,
    playerId: 'p1',
    entities,
    world: { currentSectorId: 's1' },
    traffic: { freighters: [] },
    stations,
  };
  if (law) state.law = law;
  return state;
}

// Mixin host: bus + state + fake helpers + the ops; init fn invoked.
export function makeHost(bus, state, ops, initFn) {
  let n = 0;
  const spawns = [];
  const removed = [];
  const voices = [];
  const cues = [];
  const popups = [];
  const helpers = {
    voice: { say: (m) => voices.push(structuredClone(m)) },
    spawnEntity: (spec) => {
      const ent = { alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...structuredClone(spec) };
      ent.id = `e${++n}`;
      spawns.push(ent);
      state.entities.set(ent.id, ent);
      return ent;
    },
    removeEntity: (id) => {
      removed.push(id);
      state.entities.delete(id);
    },
  };
  const host = { bus, state, helpers, ...ops };
  if (initFn) initFn(host);
  // Capture audio cues and comms popups for assertions.
  bus.on('audio:cue', (p) => cues.push(structuredClone(p)));
  bus.on('comms:popup', (p) => popups.push(structuredClone(p)));
  return { host, spawns, removed, voices, cues, popups, helpers };
}
