// scratch-actual-game-diag.mjs — instrumented reproduction of the hunter-8008 encounter-starvation.
// Boots the identical playthrough harness (same systems, same pilot, same seed) and samples the
// spawn pipeline every 30 sim-seconds: spawnBudget reservations/denials, director pending/live/
// active/fizzled, per-minute telegraph vs spawned. Diagnostic only; writes JSON and exits.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, SIM_DT } from './src/core/sim.js';
import { actions } from './src/systems/actions.js';
import { flightV3 } from './src/systems/flightV3.js';
import { weapons } from './src/systems/weapons.js';
import { physics } from './src/core/physics.js';
import { combat } from './src/systems/combat.js';
import { cargo } from './src/systems/cargo.js';
import { economy } from './src/systems/economy.js';
import { missions } from './src/systems/missions.js';
import { story } from './src/systems/story.js';
import { save } from './src/save/saveSystem.js';
import { world } from './src/systems/world.js';
import { mining } from './src/systems/mining.js';
import { fields } from './src/systems/fields.js';
import { traffic } from './src/systems/traffic.js';
import { salvage } from './src/systems/salvage.js';
import { lootShards } from './src/systems/lootShards.js';
import { tetherGameplay } from './src/systems/tetherGameplay.js';
import { masslineImpacts } from './src/systems/masslineImpacts.js';
import { masslineThrow } from './src/systems/masslineThrow.js';
import { masslineSnares } from './src/systems/masslineSnares.js';
import { masslineThreats } from './src/systems/masslineThreats.js';
import { encounterDirector } from './src/systems/encounterDirector.js';
import { aiEncounter } from './src/systems/aiEncounter.js';
import { createTacticalAISystem } from './src/systems/tacticalAI.js';
import { aiPorts } from './src/systems/aiPorts.js';
import { heat } from './src/systems/heat.js';
import { lawSecurity } from './src/systems/lawSecurity.js';
import { dockingCorridor } from './src/systems/dockingCorridor.js';
import { fieldDepletion } from './src/systems/fieldDepletion.js';
import { presentationOrchestrator } from './src/systems/presentationOrchestrator.js';
import { presentationAdapters } from './src/systems/presentationAdapters.js';
import { NEW_GAME } from './src/data/newGameDefaults.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './src/systems/ships.js';
import { createHunterPilot, createServices } from './scripts/lib/bench/playthroughPilots.mjs';

const HOURS = Number(process.env.DIAG_HOURS || 4.5);
const SEED = Number(process.env.DIAG_SEED || 8008);
const PARK_SECTOR = process.env.DIAG_SECTOR || '';
const startedWall = Date.now();
const log = (m) => console.log(`[diag s${SEED}] ${m}`);

const tacticalAI = createTacticalAISystem();
const sim = createSimulation({
  seed: SEED,
  systems: [
    actions, flightV3, weapons, physics, combat, cargo,
    economy, missions, story, save,
    world, mining, fields, traffic, salvage, lootShards,
    tetherGameplay, masslineImpacts, masslineThrow, masslineSnares, masslineThreats,
    encounterDirector, aiEncounter, tacticalAI, aiPorts,
    heat, lawSecurity, dockingCorridor, fieldDepletion,
    presentationOrchestrator, presentationAdapters,
  ],
});
const { state, bus, registry } = sim;

state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.settings.gameplay.flightBackend = 'v3';
state.settings.gameplay.aiBackend = 'sg06-tactical';
state.world.currentSectorId = 'sector_helios_prime';
state.player.credits = NEW_GAME.credits;

const playerEntity = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
  team: 0,
  factionId: 'faction_free',
  isPlayer: true,
  player: state.player,
  fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
  pos: { x: 0, z: 0 },
  rot: 0,
}));
state.playerId = playerEntity.id;

if (typeof registry.get('economy').newGame === 'function') registry.get('economy').newGame();
if (typeof registry.get('world').newGame === 'function') registry.get('world').newGame();
bus.emit('game:started', {});
const physicsReady = await registry.get('physics').prepareBackend(state, { reset: true });
if (!physicsReady) throw new Error('physics backend did not prepare headless');

// ── instrumentation ──────────────────────────────────────────────────────────────────────────
const counters = {
  telegraphs: [],           // {t, shapeId}
  spawned: [],              // {t, shapeId, count}
  resolved: [],             // {t, shapeId, outcome}
  spawnEntityCalls: 0,
  spawnEntityNulls: 0,
  budgetDenials: [],        // {t, requester, want, available}
  budgetRequests: 0,
  sectorEnters: [],         // {t, sectorId, continuous}
  sectorExits: [],
};
bus.on('encounter:telegraph', (p) => counters.telegraphs.push({ t: state.simTime, s: p && p.kind, z: p && p.zoneId }));
bus.on('encounter:spawned', (p) => counters.spawned.push({ t: state.simTime, s: p && p.kind, c: p && p.count }));
bus.on('encounter:resolved', (p) => counters.resolved.push({ t: state.simTime, s: p && p.kind, o: p && p.outcome }));
bus.on('sector:enter', (p) => counters.sectorEnters.push({ t: state.simTime, s: p && p.sectorId, c: !!(p && (p.continuous || p.noTeleport)) }));
bus.on('sector:exit', (p) => counters.sectorExits.push({ t: state.simTime, s: p && p.sectorId, c: !!(p && (p.continuous || p.noTeleport)) }));

const helpers = registry.helpers || (sim.helpers || null);
const budgetApi = helpers && helpers.spawnBudget;
if (budgetApi) {
  const origRequest = budgetApi.request.bind(budgetApi);
  budgetApi.request = (n, requesterId) => {
    counters.budgetRequests++;
    const grant = origRequest(n, requesterId);
    if (grant < n) counters.budgetDenials.push({ t: state.simTime, r: String(requesterId), want: n, got: grant, avail: budgetApi.available() });
    if (counters.budgetDenials.length > 400) counters.budgetDenials.splice(0, 200);
    return grant;
  };
}
const origSpawnEntity = helpers && helpers.spawnEntity;
if (origSpawnEntity) {
  helpers.spawnEntity = (...args) => {
    counters.spawnEntityCalls++;
    const ent = origSpawnEntity(...args);
    if (!ent) counters.spawnEntityNulls++;
    return ent;
  };
}

// hunter pilot wiring identical to the harness; the ledger stub no-ops every recorder method.
const noopLedger = new Proxy({}, { get: () => () => {} });
const servicesRef = { current: null };
const services = createServices({
  state, bus, ledger: noopLedger, econ: registry.get('economy'),
  clock: {
    tick: () => state.tick,
    undockCooldownUntil: () => (servicesRef.current ? servicesRef.current.undockCooldownUntilTick : 0),
  },
});
servicesRef.current = services;
services.undockCooldownUntilTick = 0;
const pilot = createHunterPilot({ state, bus, ledger: noopLedger, services });

const enter = registry.get('world').enterSector('sector_helios_prime', {});
if (PARK_SECTOR) {
  registry.get('world').enterSector(PARK_SECTOR, { fromJump: true, via: 'diag' });
  log(`parked in ${PARK_SECTOR}`);
}
log(`boot ok: ${enter ? 'sector enter ok' : 'enter null'}`);

const samples = [];
let lastSample = -30;
function sample() {
  const b = state.spawnBudget || {};
  const dir = state.encounterDirector || {};
  const res = {};
  if (b.reservations && typeof b.reservations.forEach === 'function') {
    for (const [k, v] of b.reservations) res[k] = { count: v.count, bound: v.ids ? v.ids.size : 0 };
  }
  const active = {};
  for (const [k, v] of Object.entries(dir.active || {})) active[k] = v.ids ? v.ids.length : -1;
  const ships = (state.entityList || []).filter((e) => e.alive && e.type === 'ship').length;
  samples.push({
    t: Math.round(state.simTime),
    sector: state.world.currentSectorId,
    shipsAlive: ships,
    budget: { used: b.used, max: b.max, reservations: res },
    dir: {
      pending: (dir.pending || []).length,
      pendingShapes: (dir.pending || []).slice(0, 8).map((i) => i.shapeId + (i.defers ? `!${i.defers}` : '')),
      live: Object.keys(dir.live || {}).length,
      active, fizzled: dir.stats && dir.stats.fizzled, fired: dir.stats && dir.stats.fired,
      rhythm: dir.sessionRhythm && dir.sessionRhythm.phase,
      pressure: dir.pressure && { c: Math.round(dir.pressure.combat), v: Math.round(dir.pressure.civilian) },
    },
  });
}

const targetSimSeconds = HOURS * 3600;
while (state.simTime < targetSimSeconds) {
  for (let i = 0; i < 600; i++) {
    pilot.step(SIM_DT, state.tick);
    const acts = state.input.actions;
    if (acts && acts.massline) acts.tetherFire = !!acts.massline.latch;
    sim.step(SIM_DT);
  }
  if (state.simTime - lastSample >= 30) {
    lastSample = state.simTime;
    sample();
  }
  const hour = Math.floor(state.simTime / 3600);
  log(`h${hour} t=${Math.round(state.simTime)} sector=${state.world.currentSectorId} wall=${Math.round((Date.now() - startedWall) / 1000)}s`);
}

const summary = (() => {
  // per-10min telegraph vs spawned buckets
  const buckets = new Map();
  const key = (t) => Math.floor(t / 600) * 600;
  for (const e of counters.telegraphs) {
    const k = key(e.t);
    const row = buckets.get(k) || { t: k, telegraph: 0, spawned: 0, resolved: 0, zeroSpawnShapes: {} };
    row.telegraph++;
    buckets.set(k, row);
  }
  for (const e of counters.spawned) {
    const k = key(e.t);
    const row = buckets.get(k) || { t: k, telegraph: 0, spawned: 0, resolved: 0, zeroSpawnShapes: {} };
    row.spawned++;
    buckets.set(k, row);
  }
  for (const e of counters.resolved) {
    const k = key(e.t);
    const row = buckets.get(k) || { t: k, telegraph: 0, spawned: 0, resolved: 0, zeroSpawnShapes: {} };
    row.resolved++;
    buckets.set(k, row);
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
})();

const out = {
  seed: SEED, hours: HOURS, wallSeconds: Math.round((Date.now() - startedWall) / 1000),
  parkSector: PARK_SECTOR || null,
  sectorEnters: counters.sectorEnters, sectorExits: counters.sectorExits,
  spawnEntityCalls: counters.spawnEntityCalls, spawnEntityNulls: counters.spawnEntityNulls,
  budgetRequests: counters.budgetRequests,
  budgetDenials: counters.budgetDenials.slice(-120),
  per10min: summary,
  resolvedAll: counters.resolved,
  telegraphShapes: counters.telegraphs,
  samples,
};
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.devshots/actual-game-diag');
await mkdir(outDir, { recursive: true });
const tag = PARK_SECTOR ? `-park-${PARK_SECTOR.replace(/^sector_/, '')}` : '';
const file = path.join(outDir, `diag-hunter-s${SEED}-${HOURS}h${tag}.json`);
await writeFile(file, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
log(`done: ${file}`);
sim.dispose();
process.exit(0);
