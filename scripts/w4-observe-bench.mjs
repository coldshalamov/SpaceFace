// A/B bench: world.update per-tick cost with observational scans at 30 Hz vs 60 Hz.
// Drives a flight-mode state with a populated sector (POIs, zones, stations, fields,
// hazards) deep inside ceres_belt's corridor cell, then reports mean update() time/tick.
import { world } from '../src/systems/world.js';

const TICKS = Number(process.argv[2] || 6000);
const OX = -12288, OZ = 8192; // sector_ceres_belt global origin — deep inside its cell

function makeState() {
  const entities = new Map();
  const player = {
    id: 1, alive: true, type: 'ship', team: 0,
    pos: { x: OX, z: OZ }, vel: { x: 5, z: 0 }, rot: 0, radius: 8, flags: {},
    data: {},
  };
  entities.set(1, player);
  const pois = [];
  for (let i = 0; i < 24; i++) {
    const id = 100 + i;
    entities.set(id, {
      id, alive: true, type: 'poi', pos: { x: OX + 400 + i * 120, z: OZ + 200 + (i % 5) * 80 },
      radius: 30, data: { scanRange: 150, name: `POI-${i}` },
    });
    pois.push({ poiId: `poi_${i}`, id, type: 'anomaly', hidden: false });
  }
  for (let i = 0; i < 3; i++) {
    entities.set(200 + i, { id: 200 + i, alive: true, type: 'ship', pos: { x: OX + 30 + i * 40, z: OZ + 60 }, vel: { x: 0, z: 0 }, radius: 20 });
  }
  return {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    timeScale: 1,
    playerId: 1,
    player: { credits: 0, flags: {}, jobs: [] },
    entities,
    entityList: [...entities.values()],
    jump: { state: 'IDLE', cooldownT: 0 },
    run: null,
    meta: { seed: 47 },
    world: {
      currentSectorId: 'sector_ceres_belt',
      discovery: {},
      asteroidField: { version: 1 },
      frameOrigin: { x: 0, z: 0 },
      frameOriginSeq: 0,
      residentSectors: {},
      sectors: {},
      activeSector: {
        id: 'sector_ceres_belt',
        pois,
        stations: [{ id: 'st1', pos: { x: 600, z: 600 } }],
        gates: [{ id: 'g1', pos: { x: -1500, z: 0 } }],
        fields: [
          { id: 'f1', center: { x: 3000, z: 0 }, type: 'ast_common_rock' },
          { id: 'f2', center: { x: -3000, z: 500 }, type: 'ast_common_rock' },
        ],
        hazards: [
          { center: { x: OX + 5000, z: OZ + 5000 }, radius: 300, type: 'radiation', intensity: 0.3 },
        ],
        worldOneOffSpins: [],
      },
    },
    fieldDepletion: { fields: {} },
    ui: {},
    settings: {},
    runtime: {},
  };
}

const w = Object.create(world);
w.state = null;
w.helpers = {
  spawnEntity: () => null,
  removeEntity: () => {},
  mulberry32: () => () => 0.5,
  hash32: () => 0,
};
w.bus = { emit: () => {}, on: () => () => {} };

const state = makeState();
w.state = state;

const dt = 1 / 60;
let emitted = 0;
const byType = {};
w.bus.emit = (t) => { emitted++; byType[t] = (byType[t] || 0) + 1; };
// warmup
for (let i = 0; i < 120; i++) { state.tick = i; w.update(dt, state); }
const t0 = performance.now();
for (let i = 120; i < 120 + TICKS; i++) {
  state.tick = i;
  state.simTime = i * dt;
  const p = state.entities.get(1);
  p.pos.x += p.vel.x * dt;
  w.update(dt, state);
}
const total = performance.now() - t0;
console.log(JSON.stringify({
  ticks: TICKS,
  totalMs: Number(total.toFixed(2)),
  perTickUs: Number(((total * 1000) / TICKS).toFixed(2)),
  events: emitted, byType,
  zoneId: state.world.currentZoneId || null,
  discovered: Object.keys((state.world.discovery.sector_ceres_belt || {}).pois || {}).length,
}));
