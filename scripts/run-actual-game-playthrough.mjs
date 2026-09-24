#!/usr/bin/env node
// run-actual-game-playthrough.mjs — program-compass instrument: play the actual open-world game
// headlessly for N sim-hours with a scripted archetype pilot, and emit an hour-by-hour ledger.
//
// Usage:
//   node scripts/run-actual-game-playthrough.mjs --archetype=prospector --seed=4242 --hours=10 \
//        --out=.devshots/actual-game
//
// Archetypes: prospector (miner-trader) | hunter (combat) | improviser (tether/physics)
//   | raider (piracy → WANTED → pursuit → resolution).
// The sim is the real fixed-timestep host (src/core/sim.js) with the production open-world systems
// (world materialization, mining, traffic, encounters, tether family, economy, missions, heat).
// Pilots drive the player input contract; station verbs use the same live paths the browser UI and
// src/balance harnesses use (economy.execute, dock:docked/dock:undocked). Proof is fixed-seed
// numbers, not captures. This harness measures; it does not tune the game.

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This harness pins a core for hours, and it runs on the machine the owner plays on: an
// integrated-GPU laptop where CPU and GPU share one power budget, so background compute is paid
// for in frame rate. On 2026-09-20, with two 10-hour runs live beside other lanes, the same
// build measured 59 fps with no freezes and 40 fps with a 100-350 ms freeze every second,
// minutes apart. Run at the lowest scheduling priority so the game always wins; the ledger is
// identical (fixed seed, sim time), it just arrives later when someone is playing.
try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* best effort */ }

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
import { tensionDirector, tensionSuspensionReason } from '../src/systems/tensionDirector.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { fieldDepletion } from '../src/systems/fieldDepletion.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';
import { flybyFocus } from '../src/systems/flybyFocus.js';
import { scanner } from '../src/systems/scanner.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { wingMorale } from '../src/systems/wingMorale.js';
import { custodyConsequences } from '../src/systems/custodyConsequences.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { factions } from '../src/systems/factions.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { provenanceLedger } from '../src/systems/provenanceLedger.js';
import { createChronicler } from '../src/systems/chronicler.js';
import { isRunSealed } from '../src/core/runSeal.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { onboarding } from '../src/systems/onboarding.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS, TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { createPlaythroughLedger } from './lib/bench/playthroughLedger.mjs';
import {
  createMinerTraderPilot,
  createHunterPilot,
  createRaiderPilot,
  createImproviserPilot,
  createStrangerPilot,
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
  raider: createRaiderPilot,
  improviser: createImproviserPilot,
  stranger: createStrangerPilot,
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
// Genie 01: campaign-gated world memory, mirroring registry.js/nodeSystemFactoryTable.
const chronicler = createChronicler({
  shouldObserve: (state) => !isRunSealed(state),
});
const sim = createSimulation({
  seed,
  systems: [
    actions, flightV3, weapons, physics, combat, cargo,
    economy, missions, story, save,
    world, mining, fields, traffic, salvage, lootShards,
    tetherGameplay, masslineImpacts, masslineThrow, masslineSnares, masslineThreats,
    tensionDirector, encounterDirector, aiEncounter, tacticalAI, aiPorts,
    // Chain-parity block: the combat→aftermath→salvage→economy→law route needs the real
    // aftermath/voice/witness/responder surface, not a stripped manifest. Registration order
    // mirrors registry.js: voice + scanner + memory before bark/law consumers, budget/jobs
    // before the law response that spends them.
    voiceArbiter, scanner, flybyFocus, aceMemory, barkDirector,
    combatOutcome, aftermathWrecks, wingMorale, custodyConsequences, survivorPod,
    factions, factionPresence, spawnBudget, npcJobsRuntime, bountyHunt,
    provenanceLedger, chronicler, lossLedger, pirateDisengage,
    heat, lawSecurity, dockingCorridor, fieldDepletion,
    presentationOrchestrator, presentationAdapters,
    // Band radio sits where registry.js puts it (late, before onboarding): without it the harness
    // could never observe the tuner seam the bark census measures (PQ-207.02).
    bandRadio,
    // Onboarding runs LAST (registry parity): it only reads state and drives the tutorial UI,
    // but its beat FSM must be live for the stranger archetype — the pilot follows the rail.
    onboarding,
  ],
});
const { state, bus, registry } = sim;

state.mode = 'flight';
// Non-stranger archetypes opt out of the tutorial rail through the game's own setting: an
// unfinished rail holds the tension director's tutorial suspension for the whole session, and
// the pilots (except stranger, which follows the rail) never complete its beats. This must be
// the setting — replacing state.onboarding with a minimal object would strip the beat fields
// the onboarding system owns.
if (archetype !== 'stranger') state.settings.gameplay.tutorialHints = false;
// Production feature profile (registry parity): the momentum-kill beat needs the massline
// impact-damage + tumble flags the browser boot seeds from the production profile.
state.settings.gameplay.runtimeProfile = 'production';
Object.assign(COMBAT_FLAGS, PRODUCTION_FEATURES.combat);
Object.assign(MASSLINE2_FLAGS, PRODUCTION_FEATURES.massline2);
Object.assign(TRAVEL_FLAGS, PRODUCTION_FEATURES.travel);
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
    // Drama-system visibility: the compass should always know WHY tension/chronicler are quiet.
    const tdSuspend = tensionSuspensionReason(state);
    log(`h${hour}: credits=${credits} hull=${p ? Math.round(p.hull || 0) : '?'} pos=(${Math.round(p ? p.pos.x : 0)},${Math.round(p ? p.pos.z : 0)}) wall=${rate}s${tdSuspend ? ` tdSuspend=${tdSuspend}` : ' td=live'}`);
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
