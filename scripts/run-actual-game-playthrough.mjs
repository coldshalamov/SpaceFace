#!/usr/bin/env node
// run-actual-game-playthrough.mjs — program-compass instrument: play the actual open-world game
// headlessly for N sim-hours with a scripted archetype pilot, and emit an hour-by-hour ledger.
//
// Usage:
//   node scripts/run-actual-game-playthrough.mjs --archetype=prospector --seed=4242 --hours=10 \
//        --out=.devshots/actual-game
//
// Archetypes: prospector (miner-trader) | hunter (combat) | improviser (tether/physics).
// The sim is the real fixed-timestep host (src/core/sim.js) with the production open-world systems
// (world materialization, mining, traffic, encounters, tether family, economy, missions, heat).
// Pilots drive the player input contract; station verbs use the same live paths the browser UI and
// src/balance harnesses use (economy.execute, dock:docked/dock:undocked). Proof is fixed-seed
// numbers, not captures. This harness measures; it does not tune the game.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { story } from '../src/systems/story.js';
import { save } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';
import { mining } from '../src/systems/mining.js';
import { fields } from '../src/systems/fields.js';
import { traffic } from '../src/systems/traffic.js';
import { salvage } from '../src/systems/salvage.js';
import { lootShards } from '../src/systems/lootShards.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { masslineSnares } from '../src/systems/masslineSnares.js';
import { masslineThreats } from '../src/systems/masslineThreats.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { fieldDepletion } from '../src/systems/fieldDepletion.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { createPlaythroughLedger } from './lib/bench/playthroughLedger.mjs';
import {
  createMinerTraderPilot,
  createHunterPilot,
  createImproviserPilot,
  createServices,
} from './lib/bench/playthroughPilots.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const args = process.argv.slice(2);
function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = args.find((a) => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
function argInt(name, fallback) {
  const v = Number(argValue(name, NaN));
  return Number.isFinite(v) ? v : fallback;
}

const ARCHETYPES = {
  prospector: createMinerTraderPilot,
  hunter: createHunterPilot,
  improviser: createImproviserPilot,
};
const archetype = argValue('archetype', 'prospector');
if (!ARCHETYPES[archetype]) {
  console.error(`[playthrough] unknown archetype ${archetype}; use ${Object.keys(ARCHETYPES).join('|')}`);
  process.exit(2);
}
const seed = argInt('seed', 4242) >>> 0;
const hours = argInt('hours', 10);
const outDir = path.resolve(ROOT, argValue('out', '.devshots/actual-game'));
const totalTicks = Math.ceil(hours * 3600 * 60 / SIM_DT / 60); // hours → ticks (60 Hz)

const startedWall = Date.now();
const log = (m) => console.log(`[playthrough ${archetype} s${seed}] ${m}`);

// ── boot ─────────────────────────────────────────────────────────────────────────────────────
const tacticalAI = createTacticalAISystem();
const sim = createSimulation({
  seed,
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
// The browser main loop prepares the Rapier backend after boot; headless must do it explicitly
// or flightV3's authority commands have no bodies to act on (see scripts/check-autopilot-v3.mjs).
const physicsReady = await registry.get('physics').prepareBackend(state, { reset: true });
if (!physicsReady) throw new Error('physics backend did not prepare headless');

const ledger = createPlaythroughLedger({ state, bus, archetype, seed });
// clock: dockAt consults the live tick and the prospector's undock cooldown through this ref.
const servicesRef = { current: null };
const services = createServices({
  state, bus, ledger, econ: registry.get('economy'),
  clock: {
    tick: () => state.tick,
    undockCooldownUntil: () => (servicesRef.current ? servicesRef.current.undockCooldownUntilTick : 0),
  },
});
servicesRef.current = services;
services.undockCooldownUntilTick = 0;
const pilot = ARCHETYPES[archetype]({ state, bus, ledger, services });

const enter = registry.get('world').enterSector('sector_helios_prime', {});
log(`boot ok: sector enter ${enter ? 'ok' : 'null'}; systems ${registry.systems.length}; ticks ${totalTicks}`);

// Player death handling: the M3 contract restores on player:respawn. If the sim does not restore
// the hull, the harness resurrects beside the remembered station and records a note — the session
// continues so long-run shape stays measurable.
let resurrects = 0;
const respawnBinder = () => {
  bus.on('entity:killed', (data) => {
    if (!data || data.id !== state.playerId) return;
    setTimeoutSim(3, () => {
      const p = state.entities.get(state.playerId);
      if (!p) return;
      if (!p.alive || (p.hull || 0) <= 0) {
        p.alive = true;
        p.hull = p.hullMax || p.hull;
        p.shield = p.shieldMax || p.shield || 0;
        const stations = (state.entityIndex && state.entityIndex.dockStations) || [];
        const home = stations[0];
        if (home && home.pos) { p.pos.x = home.pos.x + 90; p.pos.z = home.pos.z + 60; }
        p.vel = p.vel || {}; p.vel.x = 0; p.vel.z = 0;
        resurrects++;
        ledger.recordNote(`harness resurrect #${resurrects} beside ${home ? home.id : 'sector center'}`);
      }
    });
  });
};
// Minimal deterministic timeout wheel (no wall clock).
const timers = [];
function setTimeoutSim(delayS, fn) { timers.push({ at: state.simTime + delayS, fn }); }

respawnBinder();

// ── run ──────────────────────────────────────────────────────────────────────────────────────
// Verb set sampled from the same contract fields the pilot wrote this tick.
function activeVerbs(state) {
  const input = state.input || {};
  const verbs = [];
  if (input.moveZ > 0) verbs.push('thrust');
  if (input.moveZ < 0) verbs.push('reverse');
  if (input.moveX !== 0) verbs.push('strafe');
  if (input.turnIntent !== 0) verbs.push('turn');
  if (input.brake) verbs.push('brake');
  if (input.boost) verbs.push('boost');
  if (input.fire && input.fireGroup === 2) verbs.push('mine');
  if (input.fire && input.fireGroup !== 2) verbs.push('fire');
  const acts = input.actions || {};
  if (acts.tetherFire) verbs.push('latch');
  const ml = acts.massline;
  if (ml) {
    if (ml.cut) verbs.push('cut');
    if (ml.lineControl) verbs.push('lineControl');
    if (ml.reelIn) verbs.push('reel');
    if (ml.payOut) verbs.push('payOut');
  }
  if (state.ui && state.ui.docked) verbs.push('dock');
  return verbs;
}

let lastHourLogged = -1;
const targetSimSeconds = hours * 3600;
const maxIterations = totalTicks * 3; // docking freezes sim ticks; cap runaway
let iterations = 0;
let freezeCheckLastSim = 0;
let freezeCheckLastIter = 0;
let frozeOut = false;
while (state.simTime < targetSimSeconds && iterations < maxIterations) {
  const CHUNK = 600; // 10 sim-seconds per outer chunk
  const n = Math.min(CHUNK, Math.ceil((targetSimSeconds - state.simTime) * 60));
  for (let i = 0; i < n; i++) {
    for (let t = timers.length - 1; t >= 0; t--) {
      if (state.simTime >= timers[t].at) { const fn = timers[t].fn; timers.splice(t, 1); fn(); }
    }
    pilot.step(SIM_DT, state.tick);
    // input.js contract (src/systems/input.js:1258): acts.tetherFire mirrors masslineCommand.latch
    // AFTER the command packet is built for the tick. Mirror it here so edge semantics hold.
    const acts = state.input.actions;
    if (acts && acts.massline) acts.tetherFire = !!acts.massline.latch;
    ledger.sampleVerbs(activeVerbs(state));
    sim.step(SIM_DT);
    iterations++;
  }
  // Freeze detector: if sim time barely advanced over a big iteration burn, the session is
  // wedged (e.g. a dock/undock bounce on frozen ticks) — stop rather than emit a fake ledger.
  if (iterations - freezeCheckLastIter >= 200000) {
    const advanced = state.simTime - freezeCheckLastSim;
    if (advanced < 60) { frozeOut = true; break; }
    freezeCheckLastSim = state.simTime;
    freezeCheckLastIter = iterations;
  }
  const hour = Math.floor(state.simTime / 3600);
  if (process.env.PLAYTHROUGH_DEBUG) {
    const p = state.entities.get(state.playerId);
    const cg = state.player.cargo;
    const rocks = (state.entityList || []).filter((e) => e.alive && e.type === 'asteroid').length;
    const ships = (state.entityList || []).filter((e) => e.alive && e.type === 'ship').length;
    let stDist = -1;
    for (const st of ((state.entityIndex && state.entityIndex.dockStations) || [])) {
      if (!st || !st.alive) continue;
      const dd = Math.hypot(st.pos.x - p.pos.x, st.pos.z - p.pos.z) - (st.radius || 0);
      if (stDist < 0 || dd < stDist) stDist = Math.round(dd);
    }
    const acq = state.masslineAcquisition && state.masslineAcquisition.selected;
    console.log(`  [dbg t${state.tick}] pos=(${Math.round(p.pos.x)},${Math.round(p.pos.z)}) v=${Math.round(Math.hypot(p.vel.x, p.vel.z))} cargo=${JSON.stringify(cg && { u: cg.usedVolume, cap: cg.capVolume })} rocks=${rocks} ships=${ships} stationDist=${stDist} docked=${!!(state.ui && state.ui.docked)} acq=${acq ? `${acq.targetType}:${acq.targetId}:${acq.status}${acq.reason ? ':' + acq.reason : ''}` : 'none'}`);
  }
  if (hour > lastHourLogged) {
    lastHourLogged = hour;
    const p = state.entities.get(state.playerId);
    const credits = state.player.credits;
    const rate = Math.round((Date.now() - startedWall) / 1000);
    log(`h${hour}: credits=${credits} hull=${p ? Math.round(p.hull || 0) : '?'} pos=(${Math.round(p ? p.pos.x : 0)},${Math.round(p ? p.pos.z : 0)}) wall=${rate}s`);
  }
}

if (frozeOut) ledger.recordNote('SESSION FROZE: sim time stopped advancing; ledger truncated (harness wedge, not a game claim)');
const result = ledger.finish();
result.runMetadata = Object.assign(result.runMetadata || {}, { frozeOut });
result.runMetadata = Object.assign({}, result.runMetadata, {
  archetype, seed, hoursRequested: hours,
  ticks: state.tick,
  wallSeconds: Math.round((Date.now() - startedWall) / 1000),
  resurrects,
  sectorId: state.world.currentSectorId,
  systems: registry.systems.map((s) => s.name),
  evidence: 'focused-explicit headless open-world session (production open-world systems; no renderer)',
});

await mkdir(outDir, { recursive: true });
const file = path.join(outDir, `${archetype}-seed${seed}-${hours}h.json`);
await writeFile(file, `${JSON.stringify(result, null, 1)}\n`, 'utf8');

log(`done: ${result.hours} hours, ${state.tick} ticks, wall ${result.runMetadata.wallSeconds}s`);
log(`totals: ${JSON.stringify(result.totals)}`);
log(`firsts(sim-hour): ${JSON.stringify(result.firstsBySimHour)}`);
log(`economy curve: ${result.economyCurve.map((e) => `h${e.hour}:${e.creditsEnd}`).join(' ')}`);
console.log(`[playthrough] ledger: ${path.relative(ROOT, file)}`);
sim.dispose();
