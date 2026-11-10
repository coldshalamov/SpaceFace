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
import { writeFileSync } from 'node:fs';
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
import { rookBooth } from '../src/systems/rookBooth.js';
import { kesslerScale } from '../src/systems/kesslerScale.js';
import { furnaceIntake } from '../src/systems/furnaceIntake.js';
import { understoryGardens } from '../src/systems/faction_understory.js';
import { bombs } from '../src/systems/bombs.js';
import { onboarding } from '../src/systems/onboarding.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS, TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
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
// Name the system whose update traps (wasm panics carry no call site). Runs 93-103:
// RuntimeError: unreachable inside world.step at tick ~98058 — ~3000 anonymous
// alienEcology wreck rows (the playerHullEcho mint/shelve twin pile) mass-promoted into
// one coincident heap and detonated the solver. The trap escapes sim.step unattributed.
const namePanic = (sys) => {
  if (!sys || typeof sys.update !== 'function' || !process.env.STRANGER_PILOT_TRACE) return sys;
  const orig = sys.update;
  const wrapped = Object.create(sys);
  wrapped.update = function (dt, state) {
    try { return orig.call(this, dt, state); }
    catch (e) {
      console.log(`    [PANIC] system=${sys.name} tick=${state && state.tick} t=${Math.round(state && state.simTime || 0)}: ${e && e.message}`);
      throw e;
    }
  };
  return wrapped;
};

const sim = createSimulation({
  seed,
  systems: [
    actions, flightV3, weapons, bombs, physics, combat, cargo,
    economy, missions, story, save,
    world, mining, fields, traffic, salvage, lootShards,
    // understoryGardens follows lootShards in the production manifest: it owns the
    // authored Compost receiver, the quiet ledger, and the garden feed/digest loop —
    // without it the b2 compost waypoint resolves but no garden ever spawns.
    understoryGardens,
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
    // Book-1 worksites: the Scale 4 weigh + the CR-FEED furnace mouth the post-B1
    // story waypoints point at live in these systems — without them the markers
    // resolve but no ring, read pass, or intake capture exists.
    // rookBooth precedes the worksites in registry order: its market pass owns the wreck-sale
    // receipts cinderRoute's marked-hull delivery waits on — without it a resting hull never sells.
    rookBooth, kesslerScale, furnaceIntake,
    // Onboarding runs LAST (registry parity): it only reads state and drives the tutorial UI,
    // but its beat FSM must be live for the stranger archetype — the pilot follows the rail.
    onboarding,
  ].map(namePanic),
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
Object.assign(FIELD_FLAGS, PRODUCTION_FEATURES.fields);
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
// Phase probe for the post-sale Rapier trap: names whether "unreachable" fires inside
// the native world.step or in the surrounding reconcile/command application.
if (process.env.STRANGER_PILOT_TRACE) {
  const phys = registry.get('physics');
  const owner = phys && phys._sg02;
  if (owner && typeof owner.step === 'function') {
    const ostep = owner.step.bind(owner);
    owner.step = (dt, tick) => {
      const tag = (tick | 0) >= 97000;
      if (tag) console.log(`    [phys] step-enter tick=${tick}`);
      const r = ostep(dt, tick);
      if (tag) console.log(`    [phys] step-exit tick=${tick}`);
      return r;
    };
    // Lifecycle tap: name which entity's removal or spawn borders the solver trap.
    for (const [ev, tag] of [['entity:destroyed', 'destroyed'], ['entity:spawned', 'spawned'], ['entity:killed', 'killed']]) {
      bus.on(ev, (p = {}) => {
        if ((state.tick | 0) >= 96000) {
          const e = p.entity || {};
          console.log(`    [phys] ${tag} id=${p.id ?? e.id} type=${p.type ?? e.type} reason=${p.reason ?? '-'} tick=${state.tick}`);
          // Ship-churn attribution (run104: ~1 mint→virtualize/tick for ~25k ticks): print the
          // identity fields a lean far row keeps/drops so the owning system is nameable.
          if (tag === 'spawned' && (e.type === 'ship') && !e.isPlayer) {
            const d = e.data || {};
            console.log(`    [phys] ship-data id=${e.id} pos=${e.pos ? `${Math.round(e.pos.x)},${Math.round(e.pos.z)}` : '-'} `
              + `wr=${d.worldRecordId || '-'} job=${d.jobId || '-'} role=${d.trafficRole || d.role || '-'} `
              + `ctx=${(d.ai && d.ai.spawnContext) || '-'} arch=${(d.ai && d.ai.archetype) || '-'} `
              + `home=${e.homeSectorId || d.homeSectorId || '-'} itin=${(d.itinerary && d.itinerary.kind) || '-'} `
              + `tug=${d.yardTug === true ? 1 : '-'} salv=${d.generalSalvor === true ? 1 : '-'} nursery=${d.nurseryClaimCrew || '-'} `
              + `slot=${d.activityActorSlotId || '-'} site=${d.worldSiteId || '-'} keys=${Object.keys(d).sort().join('|')}`);
            const stack = (new Error()).stack || '';
            const frames = stack.split('\n')
              .map((l) => l.trim())
              .filter((l) => /src[\\/]|missionSpawningOps|traffic|alienEcology|farActor|world\./.test(l))
              .slice(0, 5)
              .join(' <= ');
            if (frames) console.log(`    [phys] ship-src id=${e.id} ${frames}`);
          }
        }
      });
    }
    bus.on('world:farActorShelved', (p = {}) => {
      if ((state.tick | 0) >= 96000 && p.type === 'ship') {
        console.log(`    [phys] shelved id=${p.id} job=${p.jobId || '-'} role=${p.trafficRole || '-'} home=${p.homeSectorId || '-'}`);
      }
    });
    // Call-site probe: name which Rapier call traps (solver step vs cleanup lookups).
    const rw = owner.world;
    if (rw) {
      for (const m of ['step', 'removeRigidBody', 'removeCollider', 'removeImpulseJoint',
        'getRigidBody', 'getCollider', 'getImpulseJoint', 'propagateRigidBodyPositions']) {
        if (typeof rw[m] === 'function') {
          const om = rw[m].bind(rw);
          rw[m] = (...a) => {
            try { return om(...a); }
            catch (e) { console.log(`    [phys] TRAP world.${m} tick=${state.tick} t=${Math.round(state.simTime || 0)}`); throw e; }
          };
        }
      }
      // Graph sweep: a joint or collider whose endpoint/parent body was freed survives removal
      // only to trap the next solver island rebuild — validate the sets each windowed tick.
      const ostep2 = owner.step;
      let seenRecIds = new Set();
      let dumpDone = false;
      owner.step = (dt, tick) => {
        if ((tick | 0) >= 98000) {
          let joints = 0, badJoints = 0, colliders = 0, badParents = 0, recs = 0, badRecs = 0;
          if (rw.impulseJoints && typeof rw.impulseJoints.getAll === 'function') {
            for (const j of rw.impulseJoints.getAll()) {
              joints++;
              try { j.body1(); j.body2(); } catch { badJoints++; }
            }
          }
          if (rw.colliders && typeof rw.colliders.forEach === 'function') {
            rw.colliders.forEach((c) => {
              colliders++;
              try { c.parent(); } catch { badParents++; }
            });
          }
          const newRecs = [];
          for (const rec of owner.records.values()) {
            recs++;
            try { rec.body.linvel(); } catch { badRecs++; }
            if (!seenRecIds.has(rec.entity)) { seenRecIds.add(rec.entity); newRecs.push(rec); }
          }
          // Burst capture: the trap needs the real population — write every record's
          // spawn spec + pose so the fatal step's population replays offline.
          if (!dumpDone && newRecs.length > 200) {
            dumpDone = true;
            try {
              const dump = [];
              for (const rec of owner.records.values()) {
                const e = rec.entity || {};
                const d = e.data || {};
                dump.push({
                  id: e.id, type: e.type, pos: e.pos, vel: e.vel, rot: e.rot, angVel: e.angVel,
                  radius: e.radius, mass: e.mass, collides: e.collides, hull: e.hull, hullMax: e.hullMax,
                  team: e.team, isPlayer: e.isPlayer === true || undefined,
                  physicsBody: e.physicsBody,
                  data: {
                    proportions: d.proportions, wreckClass: d.wreckClass, hulkOfDefId: d.hulkOfDefId,
                    worldRecordId: d.worldRecordId, markerId: d.markerId, salvagePointId: d.salvagePointId,
                    trafficRole: d.trafficRole, sectorId: d.sectorId, homeSectorId: d.homeSectorId,
                    parentType: d.parentType, persistenceOwner: d.persistenceOwner, defId: d.defId,
                    silhouette: d.silhouette, dockRadius: d.dockRadius, collisionProxy: d.collisionProxy,
                    hullDefId: d.hullDefId, shipDefId: d.shipDefId, typeId: d.typeId,
                  },
                  colliderCount: Array.isArray(rec.colliders) ? rec.colliders.length : 1,
                });
              }
              writeFileSync(new URL('../.devshots/burst-dump.json', import.meta.url), JSON.stringify(dump));
              console.log(`    [phys] burst-dump records=${dump.length} tick=${tick}`);
            } catch (e) { console.log(`    [phys] burst-dump-fail ${e.message}`); }
          }
          const wb = (typeof rw.bodies?.len === 'function') ? rw.bodies.len() : -1;
          const wc = (typeof rw.colliders?.len === 'function') ? rw.colliders.len() : -1;
          console.log(`    [phys] joints=${joints} badJoints=${badJoints} colliders=${colliders} badParents=${badParents} recs=${recs} badRecs=${badRecs} worldBodies=${wb} worldColliders=${wc} tick=${tick}`);
        }
        return ostep2(dt, tick);
      };
    }
  }
}

const ledger = createPlaythroughLedger({ state, bus, archetype, seed });
// clock: dockAt consults the live tick and the prospector's undock cooldown through this ref.
const servicesRef = { current: null };
const services = createServices({
  state, bus, ledger, econ: registry.get('economy'), missions: registry.get('missions'),
  clock: {
    tick: () => state.tick,
    undockCooldownUntil: () => (servicesRef.current ? servicesRef.current.undockCooldownUntilTick : 0),
  },
});
servicesRef.current = services;
services.undockCooldownUntilTick = 0;
const pilot = ARCHETYPES[archetype]({ state, bus, ledger, services });

if (process.env.STRANGER_PILOT_TRACE) {
  bus.on('flybyFocus:start', (p) => {
    const e = state.entities.get(p && p.targetId);
    const trId = registry.get('onboarding')._trainerId;
    const tag = e
      ? `${e.type}/${e.name || (e.data && e.data.name) || '-'}/t${e.team}${e.data && e.data.trainingFocusEligible ? '/elig' : ''}`
      : '?gone';
    console.log(`    [flyby] t=${Math.round(state.simTime)} target=${p.targetId}:${tag} trainer=${trId} match=${p.targetId === trId}`);
  });
}

const enter = registry.get('world').enterSector('sector_helios_prime', {});
log(`boot ok: sector enter ${enter ? 'ok' : 'null'}; systems ${registry.systems.length}; ticks ${totalTicks}`);

// Player death handling: combat.kill routes the player through beginPlayerDefeat → player:death +
// game:over (recoverable); entity:killed is never emitted for the player hull. The headed game's
// after-action "Continue" calls combat.recoverPendingPlayer() → player:respawn — the headless
// harness plays the same public contract after a short beat. Death paths that bypass
// beginPlayerDefeat still get the old hand-restore fallback so the session continues.
let resurrects = 0;
const respawnBinder = () => {
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeoutSim(3, () => {
      pending = false;
      const p = state.entities.get(state.playerId);
      if (!p || p.alive) return;
      const combat = registry.get('combat');
      const res = combat && typeof combat.recoverPendingPlayer === 'function'
        ? combat.recoverPendingPlayer({ source: 'harness_respawn' })
        : null;
      if (res && res.ok) {
        resurrects++;
        ledger.recordNote(`harness resurrect #${resurrects} via recoverPendingPlayer at ${res.stationName || res.stationId || 'dock'}`);
        return;
      }
      if ((p.hull || 0) <= 0 || p.alive === false) {
        p.alive = true;
        p.flags = p.flags || {}; p.flags.defeated = false;
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
  };
  bus.on('player:death', (d) => { if (!d || d.recoverable !== false) schedule(); });
  bus.on('entity:killed', (data) => { if (data && data.id === state.playerId) schedule(); });
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
