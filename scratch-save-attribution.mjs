#!/usr/bin/env node
// scratch-save-attribution.mjs — PQ-033.02 session diagnostic (do not ship).
// Boots the real headless sim (production systems, same manifest as
// run-actual-game-playthrough.mjs), drives N dock → market-roundtrip → undock cycles
// through the live service paths (dock:docked / economy.execute / dock:undocked),
// and prints per-save-section JSON byte sizes each cycle so the second save-growth
// source names itself. Fixed seed; no wall clock.
//
// Usage: node scratch-save-attribution.mjs [--cycles=14] [--seed=4711] [--sim-seconds=20]

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
import { tensionDirector } from './src/systems/tensionDirector.js';
import { encounterDirector } from './src/systems/encounterDirector.js';
import { aiEncounter } from './src/systems/aiEncounter.js';
import { createTacticalAISystem } from './src/systems/tacticalAI.js';
import { aiPorts } from './src/systems/aiPorts.js';
import { heat } from './src/systems/heat.js';
import { lawSecurity } from './src/systems/lawSecurity.js';
import { dockingCorridor } from './src/systems/dockingCorridor.js';
import { fieldDepletion } from './src/systems/fieldDepletion.js';
import { voiceArbiter } from './src/ui/voiceArbiter.js';
import { flybyFocus } from './src/systems/flybyFocus.js';
import { scanner } from './src/systems/scanner.js';
import { aceMemory } from './src/systems/aceMemory.js';
import { barkDirector } from './src/systems/barkDirector.js';
import { combatOutcome } from './src/systems/combatOutcome.js';
import { aftermathWrecks } from './src/systems/aftermathWrecks.js';
import { wingMorale } from './src/systems/wingMorale.js';
import { custodyConsequences } from './src/systems/custodyConsequences.js';
import { survivorPod } from './src/systems/survivorPod.js';
import { factions } from './src/systems/factions.js';
import { factionPresence } from './src/systems/factionPresence.js';
import { spawnBudget } from './src/systems/spawnBudget.js';
import { npcJobsRuntime } from './src/systems/npcJobsRuntime.js';
import { bountyHunt } from './src/systems/bountyHunt.js';
import { provenanceLedger } from './src/systems/provenanceLedger.js';
import { createChronicler } from './src/systems/chronicler.js';
import { isRunSealed } from './src/core/runSeal.js';
import { lossLedger } from './src/systems/lossLedger.js';
import { pirateDisengage } from './src/systems/pirateDisengage.js';
import { presentationOrchestrator } from './src/systems/presentationOrchestrator.js';
import { presentationAdapters } from './src/systems/presentationAdapters.js';
import { onboarding } from './src/systems/onboarding.js';
import { NEW_GAME } from './src/data/newGameDefaults.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS, TRAVEL_FLAGS } from './src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from './src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './src/systems/ships.js';
import { createServices } from './scripts/lib/bench/_strangerPilotLocal.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([a-zA-Z-]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const CYCLES = Number(args.cycles || 14);
const SEED = Number(args.seed || 4711);
const SIM_SECONDS_PER_CYCLE = Number(args['sim-seconds'] || 20);

const tacticalAI = createTacticalAISystem();
const chronicler = createChronicler({ shouldObserve: (state) => !isRunSealed(state) });
const sim = createSimulation({
  seed: SEED,
  systems: [
    actions, flightV3, weapons, physics, combat, cargo,
    economy, missions, story, save,
    world, mining, fields, traffic, salvage, lootShards,
    tetherGameplay, masslineImpacts, masslineThrow, masslineSnares, masslineThreats,
    tensionDirector, encounterDirector, aiEncounter, tacticalAI, aiPorts,
    voiceArbiter, scanner, flybyFocus, aceMemory, barkDirector,
    combatOutcome, aftermathWrecks, wingMorale, custodyConsequences, survivorPod,
    factions, factionPresence, spawnBudget, npcJobsRuntime, bountyHunt,
    provenanceLedger, chronicler, lossLedger, pirateDisengage,
    heat, lawSecurity, dockingCorridor, fieldDepletion,
    presentationOrchestrator, presentationAdapters,
    onboarding,
  ],
});
const { state, bus, registry } = sim;
state.mode = 'flight';
state.settings.gameplay.tutorialHints = false;
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
const physicsReady = await registry.get('physics').prepareBackend(state, { reset: true });
if (!physicsReady) throw new Error('physics backend did not prepare headless');

const services = createServices({
  state, bus, ledger: { recordTrade() {}, recordNote() {}, recordDecision() {} },
  econ: registry.get('economy'),
  clock: { tick: () => state.tick, undockCooldownUntil: () => 0 },
});

registry.get('world').enterSector('sector_helios_prime', {});

function stepSim(seconds) {
  const n = Math.ceil(seconds * 60);
  for (let i = 0; i < n; i++) sim.step(SIM_DT);
}

function neutralInput() {
  const input = state.input;
  input.moveZ = 0; input.moveX = 0; input.turnIntent = 0; input.brake = false; input.boost = false;
  input.fire = false;
}

function pickCommodity(stationId) {
  const market = state.economy.markets[stationId] || {};
  const entries = Object.entries(market)
    .filter(([, e]) => e && (e.stock ?? 0) >= 6)
    .sort((a, b) => (b[1].stock ?? 0) - (a[1].stock ?? 0));
  return entries[0] ? entries[0][0] : null;
}

function measure(label) {
  const saveSys = registry.get('save');
  const data = saveSys.serializeData();
  if (args.drill) {
    const sec = data[args.drill];
    if (sec && typeof sec === 'object') {
      const parts = Object.keys(sec).map((k) => `${k}=${JSON.stringify(sec[k]).length}`);
      console.log(`  [drill ${args.drill} @${label}] ${parts.join(' ')}`);
      if (args.drill === 'economy' && sec.markets) {
        let mkt = 0;
        for (const m of Object.values(sec.markets)) mkt += JSON.stringify(m).length;
        console.log(`  [drill economy-markets-sum @${label}] ${mkt} stations=${Object.keys(sec.markets).length}`);
      }
      if (args.drill === 'tensionDirector') {
        const rec = (obj, path, depth) => {
          if (depth > 2 || !obj || typeof obj !== 'object') return;
          for (const [k, v] of Object.entries(obj)) {
            const b = JSON.stringify(v).length;
            if (b > 200) {
              console.log(`    [td ${path}.${k}] = ${b}${Array.isArray(v) ? ` len=${v.length}` : ''}`);
              rec(v, `${path}.${k}`, depth + 1);
            }
          }
        };
        rec(sec, 'td', 0);
      }
      if (args.drill === 'chronicler') {
        for (const [k, v] of Object.entries(sec)) {
          console.log(`    [chr ${k}] = ${JSON.stringify(v).length}${Array.isArray(v) ? ` len=${v.length}` : ''}`);
        }
      }
      if (args.drill === 'world') {
        for (const [k, v] of Object.entries(sec)) {
          console.log(`    [wld ${k}] = ${JSON.stringify(v).length}${Array.isArray(v) ? ` len=${v.length}` : ''}`);
        }
      }
    }
  }
  if (args.cyclestats) {
    const cycles = (state.economy && state.economy.cycles) || {};
    let pairs = 0, withBlend = 0, expiredUnpruned = 0, futureBlend = 0, stations = 0;
    for (const sid of Object.keys(cycles)) {
      stations++;
      for (const cid of Object.keys(cycles[sid])) {
        pairs++;
        const c = cycles[sid][cid];
        if (c && c.blendFrom) {
          withBlend++;
          if (state.simTime >= Number(c.blendEndT)) expiredUnpruned++;
          else futureBlend++;
        }
      }
    }
    const marketPairs = Object.values(state.economy.markets || {})
      .reduce((n, m) => n + Object.keys(m).length, 0);
    console.log(`    [cycstats @${label}] stations=${stations} pairs=${pairs} marketPairs=${marketPairs} withBlend=${withBlend} expiredUnpruned=${expiredUnpruned} futureBlend=${futureBlend} simT=${state.simTime.toFixed(0)}`);
  }
  const sizes = {};
  let total = 0;
  for (const k of Object.keys(data)) {
    const b = JSON.stringify(data[k]).length;
    sizes[k] = b;
    total += b;
  }
  if (args.track) {
    const keys = String(args.track).split(',');
    const parts = keys.map((k) => `${k}=${sizes[k] ?? 0}`);
    const econ = state.economy || {};
    const receipts = econ.appliedSalvageIntakeReceipts;
    const blocked = econ.blockedSalvageIntakeIds;
    parts.push(`salvReceipts=${receipts ? receipts.length : 0}:${JSON.stringify(receipts || []).length}`);
    parts.push(`salvBlocked=${blocked ? blocked.length : 0}:${JSON.stringify(blocked || []).length}`);
    parts.push(`committedIntents=${econ.committedIntents ? JSON.stringify(econ.committedIntents).length : 0}`);
    console.log(`  [track @${label}] total=${total} ${parts.join(' ')}`);
  }
  console.log(`[cycle ${label}] total=${total} (${(total / 1024).toFixed(1)} KB)`);
  return { sizes, total };
}

const stations = (state.entityIndex && state.entityIndex.dockStations) || [];
if (!stations.length) throw new Error('no dock stations in sector index');
const station = stations[0];
console.log(`station=${station.id} cycles=${CYCLES} seed=${SEED} simSecondsPerCycle=${SIM_SECONDS_PER_CYCLE}`);

stepSim(10); // let the sector settle like the soak warmup
const first = measure(0);
const baseline = first.sizes;

for (let c = 1; c <= CYCLES; c++) {
  neutralInput();
  if (!args['no-trade']) {
    const p = state.entities.get(state.playerId);
    p.pos.x = station.pos.x + 30; p.pos.z = station.pos.z;
    if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
    const docked = services.dockAt(station);
    if (!docked) throw new Error(`cycle ${c}: dock refused`);
    const commodityId = pickCommodity(station.id);
    if (!commodityId) throw new Error(`cycle ${c}: no stocked commodity at ${station.id}`);
    const buy = services.trade(station.id, commodityId, 'buy', 5);
    if (buy && buy.ok) services.trade(station.id, commodityId, 'sell', 5);
    services.undock();
  }
  stepSim(SIM_SECONDS_PER_CYCLE);
  const { sizes, total } = measure(c);
  if (c === 1 || c === CYCLES) {
    const deltas = Object.keys(sizes)
      .map((k) => ({ k, d: sizes[k] - baseline[k], now: sizes[k], base: baseline[k] }))
      .filter((r) => r.d !== 0)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 12);
    console.log('  biggest movers vs cycle 0:');
    for (const r of deltas) {
      console.log(`    ${r.k}: ${r.base} -> ${r.now} (${r.d >= 0 ? '+' : ''}${r.d}, ${(r.d / c).toFixed(0)}/cycle)`);
    }
  }
}
console.log('done');
