// scripts/lib/bench/crucibleBench.mjs — Crucible feel bench for the Fun Convergence Loop.
//
// THE REAL PATH. This file used to boot a stand-in combat kernel, synthesize knock encounters,
// and fabricate a verb Set. Every number it printed was a property of that generator. It now
// runs the authoritative production runtime — real rapier-dynamic physics, real tactical AI,
// real weapons, real survival swarm — driven by a deterministic scripted pilot. Fun metrics
// are derived from the real event bus, plus the real input packet the real `input` system
// produced from the pilot's key presses, into the vocabulary funMetrics.mjs already reads.
// Nothing here integrates physics, schedules a contact, or writes an entity's motion.
//
// Vision: "Crucible first: every combat number is tuned in the Crucible bench, and adventure inherits it."

import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createAuthoritativeRuntime } from '../../../src/runtime/createAuthoritativeRuntime.js';
import { createBus } from '../../../src/core/eventBus.js';
import { SIM_DT } from '../../../src/core/sim.js';
import { mulberry32, wrapAngle } from '../../../src/core/rng.js';
import { readPhysicsTelemetry } from '../../../src/core/physicsAuthority.js';
import { resolveGovernedCombatSpeed } from '../../../src/core/flight/propulsionCatalog.js';
import { makeShipEntitySpec } from '../../../src/systems/ships.js';
import { applyCombatLabSetup } from '../../../src/ui/sandbox/sandboxSetup.js';
import { COMBAT_LAB_STARTER_PACKAGES, COMBAT_LAB_ARENAS } from '../../../src/data/combatLabSetups.js';
import { validateCombatLabSetup } from '../../../src/contracts/combatLabSetupSchema.js';
import { SURVIVAL_COHORT_TAG } from '../../../src/systems/waveMaterialization.js';
import { TECH_NODES } from '../../../src/data/tech.js';
import {
  snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps,
} from '../../../src/data/featureFlags.js';

import { computeRunHash } from './runHash.mjs';
import { realPathProof } from './realPath.mjs';
import { formatSwarmBars, measureSwarmRun } from './swarmMetrics.mjs';

export const CRUCIBLE_ARENAS = [
  { id: 'helios_core', name: 'Helios Core (Baseline Foundry)' },
  { id: 'lagrange_crucible', name: 'Lagrange Crucible (Orbital Wells & Currents)' },
  { id: 'cinder_sluice', name: 'Cinder Sluice (Thermal Hazards & Conveyors)' },
];

export const CRUCIBLE_LOADOUTS = [
  { id: 'energy_baseline', name: 'Starter: Baseline Energy (Kestrel Pulse)' },
  { id: 'physics_toolkit', name: 'Physics Kit with Shove Weapon (Hornet Concussion)' },
  { id: 'massline_rig', name: 'Rope Kit (Drifter Elastic Whip)' },
];

export const CRUCIBLE_DEFAULT_SEEDS = [4242, 8008, 13502];

/** Fixed tick cap for a 3-wave attempt. Never shortened to flatter wall time. */
export const CRUCIBLE_TICK_CAP = 5400;
export const CRUCIBLE_WAVE_TARGET = 3;

/** The only bus events this harness itself emits — the real runSession protocol, not fiction. */
export const CRUCIBLE_HARNESS_BUS_EVENTS = Object.freeze(['run:beginRequested', 'run:loadoutReady']);

const HASH_JSON_PREFIX = 'CRUCIBLE_BENCH_HASH_JSON:';
const BIND = {
  forward: ['KeyW'], reverse: ['KeyS'], brake: ['Digit0'], boost: ['ShiftLeft'],
  yawLeft: ['KeyA'], yawRight: ['KeyD'], strafeLeft: ['KeyQ'], strafeRight: ['KeyE'],
  tether: ['Space'], chargeThrow: ['KeyY'], deployWell: ['Digit5'], deployRepulsor: ['Digit6'],
};
const RANGE = 150;
const VERB_PERIOD = 150;
const CRUISE_FRAC = 0.72;
const KNOCK_EVENTS_PER_MIN_LIMIT = 2.0;
const KNOCK_MAX_FRACTION_LIMIT = 0.10;
const KNOCK_FLOOR_FRACTION = 0.005;
// ONE knock definition, owned by CONTACT in scripts/lib/bench/scenarios/feel.knock_budget.mjs.
// Rapier answers a single graze with a RUN of consecutive receipt ticks, so receipts within this
// many ticks are ONE event and the event's magnitude is the SUM of their appliedPlayerDeltaV for
// ordinary/ambient B13, raw playerDeltaV for hostile ram legibility. B13 counts EVENTS, not solver
// ticks. Counting ticks reported 907 "knocks/min" on one Crucible cell.
const EVENT_BRIDGE_TICKS = 6;
// Master ruling 2026-09-04 01:45: B13's sentence is about ORDINARY flight. A hostile that rams the
// player is a deliberate big event BY THE HOSTILE and belongs to the legibility clause, not the
// <= 2/min budget. So the rate and magnitude clauses are judged on AMBIENT events only, and
// hostile-initiated events are reported beside them with their telegraph lead.
const TELEGRAPH_LEGIBLE_S = 0.5;
// Retired 2026-09-05 as the CLAUSE's instrument, kept only to publish what the old instrument was
// counting (`headingSource`). The raw per-tick rotation delta it was compared against is dominated
// by the PILOT's own steering — the bench pilot yaws whenever |aim error| > 0.12 rad, i.e. nearly
// every tick — so it reported 1.3-1.8 rad of "contact heading change" across a seven-second grind
// the pilot was steering through. The clause now uses the contact-sourced witness below.
const HEADING_CHANGE_EPS = 1e-9;
// The contact-sourced heading witness (PQ-137.11).
//
//   witness = wrapAngle(rot_after - rot_before) - angVel_after * dt
//
// This is INDEPENDENT of the give rule's own claim. It cancels the pilot exactly on the live path
// because the player's pose and spin are published from the same tick's kinematics:
// `_applyPlayerStructuralGive` sets rot_after = rot_before + e.wy*dt and angvel_after = e.wy, and
// `_syncEntityFromKinematics` writes both onto the entity. Anything the SOLVER left in the pose that
// the spin does not account for shows up here and nowhere else. The threshold is the run's own
// measured residual floor (p99.5 over receipt-free ticks), never a typed epsilon: rope cells
// quantize yaw through `_canonicalizeManualSpringBody` and carry a higher floor than the others.
const WITNESS_FLOOR_PERCENTILE = 0.995;
// The player is driving INTO the other body: the NORMALISED commanded thrust direction this tick,
// dotted with the player->other direction, i.e. the cosine of the angle between "where I am
// pushing" and "where the other hull is". B13 exempts "a slam the player chose".
//
// INTEGRATOR CORRECTION 2026-09-05. A bare "positive component" exempts the very knocks this bar
// exists for: a shoulder graze past a rock while holding forward has a cosine of 0.3-0.6 — the
// player is going PAST the rock, not INTO it — and would have been waved through as deliberate.
// A chosen slam is aimed (cosine >= 0.7, within ~45 deg of straight at it) AND held (half a second
// of contact, not a tick of scrape), or it is fast enough that nothing else explains it.
// Below this the stick is centred: there is no commanded direction to take a cosine of, and
// dividing by the length would turn arithmetic noise into an aim.
const PLAYER_THRUST_COMMAND_EPS = 1e-6;
const PLAYER_INITIATED_THRUST_DOT = 0.7;
const PLAYER_INITIATED_SUSTAINED_TICKS = 30; // 0.5 s at 60 Hz
// ...or the player was closing on it fast enough that the contact was a chosen ram. This is the
// RADIAL closing speed (`preSolveRadialClosingSpeed`, projected on the centre-to-centre direction
// and clamped to positive), so flying fast PAST a rock does not read as flying fast INTO it.
const PLAYER_INITIATED_CLOSING_FRACTION = 0.3;
// Below this the direction of travel is noise, not a course: a hull at 0.4 WU/s has no heading to
// change. The player enters the arena at rest, so this is not hypothetical.
const COURSE_MEASURABLE_SPEED = 1.0; // WU/s
// `SANE_MAX_YAW_RATE` in src/core/sg02DynamicBodyOwner.js — the absolute yaw ceiling every body
// EXCEPT the player passes through (the player branch of `_applyStructuralGive` returns first).
// Mirrored here only to report how often the player's own spin exceeds it; nothing is clamped.
const SANE_MAX_YAW_RATE_REFERENCE = 6.0; // rad/s

/**
 * Runs the Crucible Feel Bench across the specified arenas, loadouts, and seeds.
 * Every cell is the real production path. `--quick` (1×1×1) is the same path, once.
 *
 * @param {object} [options]
 * @param {boolean} [options.headed] Accepted and IGNORED — frame-strip capture belongs to the
 *   INSTRUMENT lane; this bench is headless telemetry only.
 * @param {boolean} [options.verifyDeterminism] After the sweep, spawn a fresh node child and
 *   compare hashes for the first arena/loadout/seed.
 * @returns {Promise<object>}
 */
export async function runCrucibleBench({
  arenas = CRUCIBLE_ARENAS.map((a) => a.id),
  loadouts = CRUCIBLE_LOADOUTS.map((l) => l.id),
  seeds = CRUCIBLE_DEFAULT_SEEDS,
  waveCount = CRUCIBLE_WAVE_TARGET,
  headed = false,
  verbose = false,
  verifyDeterminism = false,
  tickCap = CRUCIBLE_TICK_CAP,
} = {}) {
  void headed; // frame-strip capture is the INSTRUMENT lane; this bench is headless telemetry
  const startedAt = wallNow();
  const runs = [];
  const arenaIds = Array.isArray(arenas) ? arenas : CRUCIBLE_ARENAS.map((a) => a.id);
  const loadoutIds = loadoutIdList(loadouts);

  for (const arenaId of arenaIds) {
    for (const loadoutId of loadoutIds) {
      for (const seed of seeds) {
        if (verbose) {
          console.log(`[crucible-bench] arena:${arenaId} loadout:${loadoutId} seed:${seed}...`);
        }
        const runData = await simulateCrucibleSwarm({
          arenaId, loadoutId, seed, waveCount, tickCap,
        });
        if (verbose) {
          console.log(
            `[crucible-bench]   ${runData.stopReason} ticks=${runData.ticks} `
            + `sim=${runData.simSeconds}s wall=${runData.wallMs}ms `
            + `ms/tick=${runData.msPerTick}`,
          );
        }
        const record = toRunRecord(runData, { arenaId, loadoutId, seed, waveCount });
        console.log(formatSwarmBars(record.swarm));
        runs.push(record);
      }
    }
  }

  const wallMs = elapsedMs(startedAt);
  console.log(
    `[crucible-bench] ${runs.length} run${runs.length === 1 ? '' : 's'}, `
    + `${wallMs == null ? '?' : wallMs} wallMs total`
    + (runs.length ? `, avg ${avgMs(runs)} ms/run` : ''),
  );

  const result = {
    bench: 'crucible',
    ok: true,
    totalRuns: runs.length,
    wallMs: wallMs == null ? 0 : wallMs,
    runs,
  };

  if (verifyDeterminism && arenaIds.length && loadoutIds.length && seeds.length) {
    result.determinism = await verifyCrucibleDeterminism({
      arenaId: arenaIds[0],
      loadoutId: loadoutIds[0],
      seed: seeds[0],
      tickCap,
    });
    if (!result.determinism.identical) result.ok = false;
  }

  return result;
}

/**
 * One real Crucible swarm run: production manifest, rapier-dynamic, scripted pilot.
 * Always async (physics.prepareBackend). Dispose the runtime before returning.
 */
export async function simulateCrucibleSwarm({
  arenaId = 'helios_core',
  loadoutId = 'energy_baseline',
  seed,
  waveCount = CRUCIBLE_WAVE_TARGET,
  tickCap = CRUCIBLE_TICK_CAP,
} = {}) {
  if (!Number.isFinite(seed)) {
    throw new Error('simulateCrucibleSwarm: `seed` must be a finite number (fixed seeds or it did not happen)');
  }

  const log = [];
  const harnessBusEmits = [];
  const inputTape = [];
  const knockHeadingByTick = new Map();
  // Per-tick player kinematics: the contact-sourced heading/course witness, the raw rotation delta
  // the OLD instrument was counting, and the commanded thrust vector used to tell a slam the player
  // chose from one that happened to them.
  const playerTickByTick = new Map();
  const waveCheckpoints = [];
  const eventTrace = [];

  const raw = createBus();
  let _state = null;
  const bus = Object.create(raw);
  bus.emit = (ev, payload) => {
    log.push({ tick: _state ? (_state.tick | 0) : -1, ev, payload });
    return raw.emit(ev, payload);
  };

  // Single presentation stand-in: the camera's plane raycast does not exist headless.
  // This is the pilot's chosen world aim point. It simulates no physics.
  const aim = { x: 0, z: 0 };

  // 1. Full production manifest. Do NOT pass an explicit `systems` array — that gets
  //    registration order as step order and is not the production update order.
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    bus,
    helpers: { raycastToPlane: () => ({ x: aim.x, z: aim.z }) },
  });
  const state = runtime.state;
  _state = state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';

  const ctx = {
    state,
    bus,
    helpers: runtime.getHelpers(),
    registry: { get: (n) => runtime.getSystem(n) },
  };
  const shipsSys = runtime.getSystem('ships');
  const economySys = runtime.getSystem('economy');
  const inputSys = runtime.getSystem('input');
  const physicsSys = runtime.getSystem('physics');

  try {
    // ── THE FEATURE WINDOW (do not narrow it) ───────────────────────────────────
    // createAuthoritativeRuntime applies the profile's feature config to the process-global
    // flag MAPS only for the duration of init and each step(), and restores them afterwards.
    // Every boot call below runs OUTSIDE that window — and `physics.prepareBackend` is where
    // SG-02 is constructed:
    //
    //   createSg02DynamicBodyOwner({ captureContactImpacts: combatFlag('weaponImpulseConsequences'), … })
    //
    // Read outside the window that flag is the PROCESS DEFAULT (false), so the owner is built
    // with contact capture permanently off for the whole run: real contact physics, but ZERO
    // `physics:impact` receipts and `collisionConsequences` never sees a contact. Measured on
    // this bench 2026-09-04 before this window existed: 900 ticks, rapierContacts 0,
    // `physics:impact` never on the bus, and B13 reported MET against a blank gauge. Same
    // defect a82158c8 fixed for the verb bench, and the reason realPath.mjs wraps its own
    // prepare call. In the browser these flags are global from boot, so applying the runtime's
    // own config across the boot is the faithful reproduction, not a workaround.
    const previousFlags = snapshotFeatureMaps();
    applyFeatureConfigToMaps(runtime.config.features);
    let fitReceipt;
    let starter;
    let arena;
    let spawned;
    try {
      // 5. The run's arsenal is POSSIBILITY, not campaign research (§12.2). Without this,
      //    moduleFitBlocker's research gate silently refuses every tier-2+ weapon: a fresh
      //    game fits NONE of the Physics Toolkit / massline_rig. Walking the real tech tree
      //    through ships.unlockTech leaves the credit balance where it started. It runs BEFORE the
      //    run begins so no campaign-economy traffic happens inside a live run. It is a
      //    SUBSIDY, not a free unlock: the grant is exactly what the remaining tree charges,
      //    and unlockTech routes every charge back through economy, so the entry balance is
      //    restored by the final unlock (same wording and behaviour as sandboxSetup.js).
      //    unlockAllTech is NOT exported from sandboxSetup.js — reimplemented here with the
      //    public writers only.
      unlockAllTech(state.player, shipsSys, economySys);

      starter = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.id === loadoutId);
      arena = COMBAT_LAB_ARENAS.find((a) => a.id === arenaId);
      if (!starter) throw new Error(`simulateCrucibleSwarm: unknown loadout "${loadoutId}"`);
      if (!arena) throw new Error(`simulateCrucibleSwarm: unknown arena "${arenaId}"`);

      // 6. Spawn the player first (startNewGame order); applyCombatLabSetup refits it.
      spawned = runtime.spawn(makeShipEntitySpec(starter.hullId, {
        isPlayer: true,
        player: state.player,
        fittings: [],
        pos: arena.spawnPos,
        rot: 0,
        team: 0,
      }));
      state.playerId = spawned.id;

      // 7. Must return true — otherwise this is not the real path.
      const ready = await physicsSys.prepareBackend(state, { reset: true });
      if (ready !== true) {
        throw new Error('simulateCrucibleSwarm: physics.prepareBackend did not return true — not the real path');
      }
      // The gauge must be plugged in. SG-02 built with contact capture off produces a clean
      // table of zeros — no `physics:impact`, no `collisionConsequence`, B13 "met" against
      // nothing. That is the worst failure mode this bench has, so it is fatal, not a note.
      if (realPathProof(runtime).contactCaptureEnabled !== true) {
        throw new Error(
          'simulateCrucibleSwarm: SG-02 was built with contact capture OFF — every knock and '
          + 'collision-consequence number would be a blank gauge, not a clean ship',
        );
      }

      // 8.
      const setup = validateCombatLabSetup({
        schema: 'spaceface.combatLabSetup.v1',
        hullId: starter.hullId,
        loadout: starter.loadout.map((e) => ({ slotIndex: e.slotIndex, defId: e.defId })),
        enemyPackageId: 'wasp_flight',
        arenaId,
        seed,
        wave: 1,
      });
      if (!setup.ok || !setup.value) {
        const detail = setup.issues && setup.issues[0] && setup.issues[0].message
          ? setup.issues[0].message
          : 'invalid setup';
        throw new Error(`simulateCrucibleSwarm: combat lab setup invalid: ${detail}`);
      }

      // 9. Begin the run NEXT, before anything that can trigger an autosave. save's autosave
      //    listens to sector:enter — a campaign autosave is only suppressed once state.run is
      //    a live survival run. runSession accepts a begin only from phase inactive.
      harnessEmit(bus, harnessBusEmits, 'run:beginRequested', {
        kind: 'survival', ruleset: 'swarm', seed, arenaId,
      });

      // 10. The registry shim is required — sandboxSetup's sys(ctx, name) reads ctx.registry.get,
      //     and without it applyCombatLabSetup returns an empty receipt and the player flies
      //     with NO WEAPONS.
      fitReceipt = applyCombatLabSetup(ctx, setup.value);
      if (!fitReceipt || fitReceipt.notFitted.length !== 0) {
        throw new Error(
          `simulateCrucibleSwarm: loadout ${loadoutId} did not fit `
          + `(notFitted=${JSON.stringify(fitReceipt && fitReceipt.notFitted)})`,
        );
      }

      // 11. The loadout IS ready. Without this receipt survivalRun sits in `loadout` forever
      //     and no wave ever plans.
      harnessEmit(bus, harnessBusEmits, 'run:loadoutReady', {});
    } finally {
      restoreFeatureMaps(previousFlags);
    }


    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const verbCadence = 30 + Math.floor(rng() * 30);
    const prevVerbs = new Set();
    let logCursor = 0;
    let wavesCleared = 0;
    const collisionVictims = new Set();
    const lastActionOn = new Map();
    const cohortSeen = new Set();
    const firstHostile = { captured: false };
    // Latest AI intent per actor at ingest time. Classification snapshots this onto each knock
    // receipt as it happens so a later map.set cannot rewrite an earlier collision.
    const aiIntent = { phase: new Map(), telegraph: new Map() };
    // The live Massline target at ingest time, from the real bus.
    const tether = { targetId: null, sinceTick: null };
    let lastAction = null;

    // MASTER TRAP (1), the ~750 WU admission ring: SG-02 gives a Rapier body only to entities
    // the activity classifier keeps near the player. An entity with no body reports dV = 0 and
    // never contacts anything, so a table of zeros can mean "nothing happened" OR "nothing was
    // ever admitted". Sampled, recorded, and reported as a gap — never thrown, because a hostile
    // legitimately spawns far and flies in.
    const bodyAdmission = { samples: 0, worst: null, final: null };

    const t0 = wallNow();
    let t = 0;
    let stopReason = 'tick_cap';
    const cap = Number.isFinite(tickCap) ? Math.max(0, tickCap | 0) : CRUCIBLE_TICK_CAP;
    const waveTarget = Number.isFinite(waveCount) ? waveCount | 0 : CRUCIBLE_WAVE_TARGET;
    const swarmTelemetry = {
      firstHostile: true,
      menus: true,
      deathTelegraph: true,
    };
    eventTrace.push({
      tick: 0,
      type: 'swarm:telemetry',
      data: { channels: ['hostile:spawned', 'run:draftOffered', 'run:refitOffered', 'player:death-telegraph'] },
    });

    for (; t < cap; t++) {
      const player = playerEntity(state) || spawned;
      rememberCohortIds(state, cohortSeen);
      const headingBefore = player && Number.isFinite(player.rot) ? player.rot : null;
      const kinBefore = samplePlayerKinematics(player);
      drivePilot({
        tick: t,
        state,
        player,
        inputSys,
        aim,
        loadoutId,
        verbCadence,
        inputTape,
      });
      runtime.step(SIM_DT);

      const tick = state.tick | 0;
      rememberCohortIds(state, cohortSeen);
      sampleFirstHostile(state, eventTrace, firstHostile);
      lastAction = sampleIssuedVerbs(state, prevVerbs, tick, eventTrace, lastAction);

      const playerAfter = playerEntity(state) || player;
      const headingAfter = playerAfter && Number.isFinite(playerAfter.rot) ? playerAfter.rot : null;
      // One row per SIM tick, before any receipt is read, so the witness and the floor are measured
      // on the same run and the floor can be taken from the receipt-free ticks of that run.
      if (!playerTickByTick.has(tick)) {
        playerTickByTick.set(tick, measurePlayerTick({
          before: kinBefore,
          after: samplePlayerKinematics(playerAfter),
          telemetry: readPhysicsTelemetry(playerAfter),
          input: state.input,
          dt: SIM_DT,
        }));
      }

      const newEvents = log.slice(logCursor);
      logCursor = log.length;
      let sawPlayerKnock = false;
      let sawWaveCleared = false;
      let clearedWave = 0;
      for (const ev of newEvents) {
        ingestLiveEvent(ev, {
          state,
          playerId: state.playerId,
          lastAction,
          lastActionOn,
          collisionVictims,
          cohortSeen,
          eventTrace,
          aiIntent,
          tether,
          playerTick: playerTickByTick.get(tick) || null,
        });
        if (ev.ev === 'physics:impact' && ev.payload && ev.payload.playerInvolved === true) {
          sawPlayerKnock = true;
        }
        if (ev.ev === 'run:waveCleared' || ev.ev === 'survival:waveCleared') {
          sawWaveCleared = true;
          wavesCleared += 1;
          clearedWave = (ev.payload && ev.payload.wave) || (state.run && state.run.wave) || wavesCleared;
        }
      }
      // Record heading ONCE per unique tick. Rapier emits a run of receipts for one contact;
      // stamping the whole tick rotation onto every receipt (then summing) invented heading.
      if (sawPlayerKnock) {
        if (!knockHeadingByTick.has(tick)) {
          knockHeadingByTick.set(
            tick,
            headingBefore !== null && headingAfter !== null
              ? wrapAngle(headingAfter - headingBefore)
              : null,
          );
        }
      }
      if (sawWaveCleared) {
        waveCheckpoints.push(
          computeRunHash({
            config: {
              bench: 'crucible', ruleset: 'swarm', arenaId, loadoutId, seed, waveCount: clearedWave,
            },
            eventTrace: eventTrace.slice(-10),
            metrics: { wave: clearedWave, tick, kills: countKills(eventTrace) },
          }).runHash,
        );
      }

      if (t % 60 === 0) recordBodyAdmission(bodyAdmission, state, physicsSys, tick);

      if (state.run && state.run.wave > waveTarget) { stopReason = 'waves_done'; break; }
      if (!playerAfter || playerAfter.alive === false) { stopReason = 'player_dead'; break; }
      if (state.run && (state.run.phase === 'ended' || state.run.phase === 'victory')) {
        stopReason = 'run_' + state.run.phase;
        break;
      }
    }

    recordBodyAdmission(bodyAdmission, state, physicsSys, state.tick | 0);
    const wallMs = elapsedMs(t0);
    const proof = realPathProof(runtime);
    bodyAdmission.sg02Bodies = proof.sg02Bodies;
    bodyAdmission.sg02DynamicBodies = proof.sg02DynamicBodies;
    // proof.rapierContacts is the LAST TICK's contact count, not a run total — a 0 here with a
    // non-zero physicsImpactEvents just means the final tick was quiet.
    bodyAdmission.rapierContactsLastTick = proof.rapierContacts;
    bodyAdmission.physicsImpactEvents = countBusEvents(log, 'physics:impact');
    bodyAdmission.collisionConsequenceEvents = countBusEvents(log, 'combat:collisionConsequence');
    bodyAdmission.gap = bodyAdmission.worst && bodyAdmission.worst.missing > 0
      ? `bodyAdmission: ${bodyAdmission.worst.missing} of ${bodyAdmission.worst.cohortAlive} live cohort `
        + `hostiles had no SG-02 body at tick ${bodyAdmission.worst.tick} — their contacts, knocks and `
        + 'collision consequences cannot appear in this run'
      : null;
    const systemsRegistered = freezeCopy(runtime.manifest && runtime.manifest.authoritativeSystemIds);
    const updateOrder = freezeCopy(runtime.manifest && runtime.manifest.authoritativeUpdateOrderIds);

    applyKnockHeadings(eventTrace, knockHeadingByTick);
    eventTrace.sort((a, b) => (a.tick - b.tick) || String(a.type).localeCompare(String(b.type)));

    const player = playerEntity(state) || spawned;
    const cruiseSpeed = cruiseSpeedOf(player);
    const legacyCruiseSpeed = legacyCruiseSpeedOf(player);
    const receiptTicks = new Set();
    for (const ev of eventTrace) {
      if (ev.type === 'collision:playerKnock') receiptTicks.add(ev.tick);
    }
    const witnessFloors = measureWitnessFloors(playerTickByTick, receiptTicks);
    applyKnockWitness(eventTrace, playerTickByTick);
    // The player's spin, on the record. The player branch of `_applyStructuralGive` returns before
    // the SANE_MAX_YAW_RATE net every other body passes through, so the player is the one hull with
    // no absolute yaw ceiling — worth a number rather than an assumption.
    const spin = summarizePlayerSpin(playerTickByTick, witnessFloors);
    const knockEvents = buildKnockEvents(eventTrace, {
      playerId: state.playerId, cruiseSpeed, witnessFloors,
    });
    const metrics = summarizeMetrics({
      eventTrace,
      knockEvents,
      ticks: t,
      wavesCleared,
      cruiseSpeed,
      legacyCruiseSpeed,
      witnessFloors,
      spin,
    });
    finalizeCombatCounts(metrics, log, state.playerId);

    const swarm = measureSwarmRun({
      eventTrace,
      fitReceipt,
      bodyAdmission,
      stopReason,
      ticks: t,
      simSeconds: metrics.simSeconds,
      loadoutId,
      seed,
      arenaId,
      swarmTelemetry,
    });

    const hashPayload = {
      config: {
        bench: 'crucible',
        ruleset: 'swarm',
        arenaId,
        loadoutId,
        seed,
        waveCount: waveTarget,
      },
      waveCheckpoints,
      eventTrace: eventTrace.concat(inputTape.map((row) => ({
        tick: row.tick,
        type: 'input:tape',
        data: { acts: row.acts },
      }))),
      metrics: hashableMetrics(metrics, { stopReason, ticks: t, simSeconds: metrics.simSeconds }),
    };
    const { runHash, runManifest } = computeRunHash(hashPayload);

    const rawBusEventTypes = uniqueEventNames(log);

    return {
      runHash,
      runManifest,
      waveCheckpoints,
      eventTrace,
      metrics,
      inputTape,
      realPath: proof,
      systemsRegistered,
      updateOrder,
      fitReceipt,
      stopReason,
      ticks: t,
      simSeconds: metrics.simSeconds,
      wallMs: wallMs == null ? 0 : wallMs,
      msPerTick: t > 0 && wallMs != null ? round2(wallMs / t) : 0,
      wavesReached: (state.run && state.run.wave) || 0,
      knockSource: 'physics:impact',
      knockEvents,
      bodyAdmission,
      harnessBusEmits: harnessBusEmits.slice(),
      rawBusEventTypes,
      phase: state.run && state.run.phase,
      wave: state.run && state.run.wave,
      swarm,
    };
  } finally {
    runtime.dispose();
  }
}

/**
 * Same seed, two processes: this process plus a fresh `node` child. Module-scoped leftovers
 * in sandboxSetup / combat kernel / feature maps cannot leak across the child boundary.
 */
export async function verifyCrucibleDeterminism({
  arenaId = 'helios_core',
  loadoutId = 'energy_baseline',
  seed = 4242,
  tickCap = CRUCIBLE_TICK_CAP,
} = {}) {
  const runA = await simulateCrucibleSwarm({ arenaId, loadoutId, seed, tickCap });
  const child = spawnHashChild({ arenaId, loadoutId, seed, tickCap });
  if (child.status !== 0) {
    throw new Error(
      `verifyCrucibleDeterminism: child process exited ${child.status}\n`
      + `stderr:\n${child.stderr || ''}\nstdout:\n${child.stdout || ''}`,
    );
  }
  const parsed = parseHashJson(child.stdout);
  if (!parsed || typeof parsed.runHash !== 'string') {
    throw new Error(
      `verifyCrucibleDeterminism: child did not print a run hash\nstdout:\n${child.stdout || ''}`,
    );
  }
  return {
    ok: runA.runHash === parsed.runHash,
    identical: runA.runHash === parsed.runHash,
    hash: runA.runHash,
    hashA: runA.runHash,
    hashB: parsed.runHash,
    ticksA: runA.ticks,
    ticksB: parsed.ticks,
    stopReasonA: runA.stopReason,
    stopReasonB: parsed.stopReason,
    wallMsA: runA.wallMs,
  };
}

// ── boot helpers ────────────────────────────────────────────────────────────────

function unlockAllTech(player, shipsSys, economySys) {
  const researched = new Set(player.researchedNodes || []);
  const remaining = TECH_NODES.filter((n) => !researched.has(n.id));
  const credits = remaining.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (credits > 0 && economySys && typeof economySys.grantCredits === 'function') {
    economySys.grantCredits(credits, 'bench:tech-budget');
  }
  const rp = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0);
  if (typeof player.researchPoints === 'number') player.researchPoints += rp + 1000;
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (player.researchedNodes.includes(node.id)) continue;
      if (typeof shipsSys.researchable === 'function' && !shipsSys.researchable(node.id)) continue;
      if (shipsSys.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
}

function harnessEmit(bus, harnessBusEmits, ev, payload) {
  harnessBusEmits.push(ev);
  bus.emit(ev, payload);
}

// ── scripted pilot (drives the REAL input device state, never state.input) ──────

function drivePilot({ tick, state, player, inputSys, aim, loadoutId, verbCadence, inputTape }) {
  inputSys._keys = inputSys._keys || Object.create(null);
  for (const k of Object.keys(inputSys._keys)) inputSys._keys[k] = false;
  inputSys._m0 = false;
  const acts = [];
  if (!player || player.alive === false) {
    inputTape.push({ tick, acts });
    return;
  }
  const hostiles = liveCohortHostiles(state);
  let best = null;
  let bestD = Infinity;
  for (const h of hostiles) {
    const d = Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; best = h; }
  }
  if (!best) {
    inputTape.push({ tick, acts });
    return;
  }
  aim.x = best.pos.x;
  aim.z = best.pos.z;
  const toT = Math.atan2(best.pos.z - player.pos.z, best.pos.x - player.pos.x);
  const err = wrapAngle(toT - player.rot);
  if (Math.abs(err) > 0.12) {
    press(inputSys, err > 0 ? BIND.yawRight : BIND.yawLeft);
    acts.push(err > 0 ? 'yawRight' : 'yawLeft');
  }
  if (bestD > RANGE) {
    press(inputSys, BIND.forward);
    acts.push('thrust');
  } else if (bestD < RANGE * 0.45) {
    press(inputSys, BIND.brake);
    acts.push('brake');
  }
  if (bestD > RANGE * 3 && tick % 240 < 60) {
    press(inputSys, BIND.boost);
    acts.push('boost');
  }
  if (Math.abs(err) < 0.35 && bestD < 420) {
    inputSys._m0 = true;
    acts.push('fire');
  }
  const phase = tick % VERB_PERIOD;
  if (loadoutId === 'physics_toolkit') {
    if (phase === verbCadence) { press(inputSys, BIND.deployWell); acts.push('well'); }
    if (phase === verbCadence + 20) { press(inputSys, BIND.deployRepulsor); acts.push('shove'); }
  } else if (loadoutId === 'massline_rig') {
    if (phase === verbCadence) { press(inputSys, BIND.tether); acts.push('latch'); }
    if (phase > verbCadence && phase < verbCadence + 40) { press(inputSys, BIND.tether); acts.push('reel'); }
    // Release is a key-UP in the real massline grammar (`masslineCommand.cut` -> acts.tetherCut):
    // the pilot stops holding the tether key, so there is deliberately no press() here. The tape
    // records the decision; `sampleIssuedVerbs` only credits the verb if the REAL input system
    // actually produced it.
    if (phase === verbCadence + 40) { acts.push('release'); }
    if (phase === verbCadence + 70) { press(inputSys, BIND.chargeThrow); acts.push('throw'); }
  }
  inputTape.push({ tick, acts });
}

function press(inputSys, codes) {
  for (const c of codes) inputSys._keys[c] = true;
}

function liveCohortHostiles(state) {
  const out = [];
  for (const e of state.entityList) {
    if (!e || e.alive === false || e.id === state.playerId) continue;
    if (!(e.data && e.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    out.push(e);
  }
  return out;
}

/**
 * Distinct verbs the REAL input system produced this tick (axes + actions.*), not the
 * pilot's intent list. Emits verb:used on false→true transitions only so "nothing happened"
 * can still see a held-W stretch as no input CHANGE.
 */
function sampleIssuedVerbs(state, prevVerbs, tick, eventTrace, lastAction) {
  const inp = state.input || {};
  const acts = inp.actions || {};
  const held = new Set();
  if (Math.abs(inp.moveZ) > 0.05) held.add('thrust');
  if (inp.brake || acts.brake) held.add('brake');
  if (inp.boost) held.add('boost');
  if (acts.tetherFire || (acts.massline && acts.massline.latch)) held.add('latch');
  if (Math.abs(acts.reelDelta || 0) > 0.01
    || (acts.massline && acts.massline.lineControl && Math.abs(acts.massline.lineLength) > 0.01)) {
    held.add('reel');
  }
  if (acts.tetherCut || (acts.massline && acts.massline.cut)) held.add('release');
  if (acts.chargeThrow || acts.throwArm) held.add('throw');
  if (acts.deployRepulsor) held.add('shove');
  if (acts.deployWell) held.add('well');

  let nextAction = lastAction;
  for (const verb of held) {
    if (!prevVerbs.has(verb)) {
      eventTrace.push({ tick, type: 'verb:used', data: { verb } });
      nextAction = verb;
    }
  }
  if (inp.fire) nextAction = 'fire';
  prevVerbs.clear();
  for (const verb of held) prevVerbs.add(verb);
  return nextAction;
}

// ── live event → funMetrics vocabulary ──────────────────────────────────────────

function rememberCohortIds(state, cohortSeen) {
  for (const e of state.entityList) {
    if (e && e.data && e.data.runCohort === SURVIVAL_COHORT_TAG) cohortSeen.add(e.id);
  }
}

/** Bounded once-per-run observation at the same cohort walk the bench already does. */
function sampleFirstHostile(state, eventTrace, firstHostile) {
  if (!firstHostile || firstHostile.captured) return;
  const playerId = state && state.playerId;
  const list = state && state.entityList;
  if (!Array.isArray(list)) return;
  for (const e of list) {
    if (!e || e.alive === false || e.id === playerId) continue;
    if (!(e.data && e.data.runCohort === SURVIVAL_COHORT_TAG)) continue;
    firstHostile.captured = true;
    eventTrace.push({
      tick: state.tick | 0,
      type: 'hostile:spawned',
      data: {
        entityId: e.id,
        archetype: e.data.enemyId || e.type || null,
        wave: e.data.runWave || (state.run && state.run.wave) || null,
      },
    });
    return;
  }
}

function ingestLiveEvent(ev, ctx) {
  const {
    state, playerId, lastAction, lastActionOn, collisionVictims, cohortSeen, eventTrace, aiIntent,
    tether, playerTick,
  } = ctx;
  const tick = ev.tick | 0;
  const p = ev.payload || {};

  // The live Massline target, tracked from the real bus so a contact with what the pilot latched
  // and reeled into can be told from an ordinary bump. B13 says "no rope"; a reel-in contact is the
  // rope, and counting it as ordinary flight was the third instrument defect.
  if (tether) {
    if (ev.ev === 'tether:latched' && p.targetId != null) {
      tether.targetId = p.targetId;
      tether.sinceTick = tick;
    } else if (ev.ev === 'tether:released' || ev.ev === 'tether:broke' || ev.ev === 'tether:cut') {
      tether.targetId = null;
      tether.sinceTick = null;
    }
  }

  // The actor's activity kind at the tick — the other half of the master's classification rule.
  // Snapshot every field the production bus actually emits so classification can require an
  // event-time target + an in-force telegraph, not a later map rewrite.
  if (ev.ev === 'ai:doctrinePhase' && p.entityId != null) {
    aiIntent.phase.set(p.entityId, {
      tick,
      phase: p.phase || null,
      maneuverKind: p.maneuverKind || null,
      targetId: p.targetId != null ? p.targetId : null,
      doctrineId: p.doctrineId || null,
      flightProfile: p.flightProfile || null,
      fireWindow: p.fireWindow || null,
    });
    return;
  }
  if (ev.ev === 'ai:telegraph' && p.entityId != null) {
    aiIntent.telegraph.set(p.entityId, {
      tick,
      kind: p.kind || null,
      durationTicks: p.durationTicks | 0,
      targetId: p.targetId != null ? p.targetId : null,
      phase: p.phase || null,
      doctrineId: p.doctrineId || null,
    });
    return;
  }

  if (ev.ev === 'combat:fire' && p.ownerId === playerId) {
    eventTrace.push({ tick, type: 'player:shot', data: { ownerId: p.ownerId, weaponId: p.weaponId || null } });
    return;
  }

  if (ev.ev === 'projectile:hit' && p.ownerId === playerId && p.targetId != null) {
    lastActionOn.set(p.targetId, lastAction || 'fire');
    return;
  }

  if (ev.ev === 'combat:damage' && p.attackerId === playerId && p.targetId != null) {
    lastActionOn.set(p.targetId, lastAction || 'fire');
    return;
  }

  if (ev.ev === 'physics:impact') {
    const aId = p.aId;
    const bId = p.bId;
    if (p.playerInvolved === true) {
      const causalActorId = p.causalActorId != null ? p.causalActorId : null;
      const intent = snapshotIntent(aiIntent, causalActorId);
      const liveHostile = isLiveCohortHostile(state, causalActorId, playerId);
      const otherId = aId === playerId ? bId : (bId === playerId ? aId : null);
      // The direction from the player toward the other body, from state positions at ingest.
      // The receipt's own `normal` is Rapier's max-force direction and its orientation is not
      // guaranteed to run a->b, so it is recorded but never used to decide who pushed whom.
      const toOther = directionFromPlayerToOther(state, playerId, otherId);
      const thrustX = playerTick && Number.isFinite(playerTick.thrustX) ? playerTick.thrustX : null;
      const thrustZ = playerTick && Number.isFinite(playerTick.thrustZ) ? playerTick.thrustZ : null;
      // NORMALISED, so the number is a cosine and 0.7 means "within ~45 degrees of straight at it".
      // The raw vector is (moveZ, moveX) rotated into world space: full forward + full strafe has
      // length sqrt(2), and an un-normalised dot would have read 1.0 for a 45-degree shove.
      const thrustMag = (thrustX !== null && thrustZ !== null) ? Math.hypot(thrustX, thrustZ) : 0;
      const thrustIntoOther = (toOther && thrustMag > PLAYER_THRUST_COMMAND_EPS)
        ? (thrustX * toOther.x + thrustZ * toOther.z) / thrustMag
        : null;
      eventTrace.push({
        tick,
        type: 'collision:playerKnock',
        data: {
          // Missing playerDeltaV stays missing — finiteOrZero here would turn a hole into a gentle 0.
          deltaV: finiteOrNull(p.playerDeltaV),
          rawDeltaV: finiteOrNull(p.playerDeltaV),
          appliedDeltaV: finiteOrNull(p.appliedPlayerDeltaV),
          deltaVFractionOfCruise: null,
          headingChangeRad: null,
          causalActorId,
          // Live-at-ingest, from state — not "was ever in the cohort" (dead/wreck/stale).
          actorLiveCohortHostile: liveHostile,
          actorInCohort: liveHostile,
          aiPhase: intent.aiPhase,
          aiTelegraph: intent.aiTelegraph,
          // PQ-137.11 A: what the SOLVER tried to do to the player, beside what the rule let through.
          solverHeadingRad: finiteOrNull(p.solverPlayerHeadingRad),
          appliedHeadingRad: finiteOrNull(p.appliedPlayerHeadingRad),
          solverCourseRad: finiteOrNull(p.solverPlayerCourseRad),
          appliedCourseRad: finiteOrNull(p.appliedPlayerCourseRad),
          // PQ-137.11 C: was this contact the player's own doing?
          aId: aId != null ? aId : null,
          bId: bId != null ? bId : null,
          otherId,
          normal: p.normal && Number.isFinite(p.normal.x) && Number.isFinite(p.normal.z)
            ? { x: p.normal.x, z: p.normal.z }
            : null,
          toOther,
          preSolveClosingSpeed: finiteOrNull(p.preSolveClosingSpeed),
          thrustX,
          thrustZ,
          thrustIntoOther,
          tetherTargetId: tether && tether.targetId != null ? tether.targetId : null,
        },
      });
    } else if (p.causalActorId === playerId && aId !== playerId && bId !== playerId) {
      eventTrace.push({ tick, type: 'combat:collateral', data: { bodiesInvolved: 2 } });
    }
    if (aId != null) collisionVictims.add(aId);
    if (bId != null) collisionVictims.add(bId);
    return;
  }

  if (ev.ev === 'combat:collisionConsequence' || ev.ev === 'combat:collisionDebris') {
    eventTrace.push({ tick, type: 'combat:collateral', data: { bodiesInvolved: 2 } });
    if (p.targetId != null) collisionVictims.add(p.targetId);
    if (p.otherId != null) collisionVictims.add(p.otherId);
    return;
  }

  if (ev.ev === 'entity:killed') {
    const targetId = p.id != null ? p.id : p.targetId;
    if (!isCohortId(state, targetId, cohortSeen)) return;
    const cause = killCause(targetId, p.killerId, playerId, lastActionOn, lastAction, collisionVictims);
    eventTrace.push({
      tick,
      type: 'entity:killed',
      data: {
        cause,
        targetId,
        archetype: p.victimClass || p.type || 'unknown',
        killerId: p.killerId,
      },
    });
    return;
  }

  if (ev.ev === 'player:death') {
    const killerId = p.killerId != null ? p.killerId : p.attackerId;
    const intent = snapshotIntent(aiIntent, killerId);
    const tg = intent.aiTelegraph;
    const inForce = telegraphInForce(tg, tick)
      && (tg.targetId == null || tg.targetId === playerId);
    const killer = killerId != null && state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(killerId)
      : null;
    const attackerArchetype = killer
      ? (killer.data && (killer.data.enemyId || killer.data.archetype)) || killer.type || null
      : (p.killerClass || p.attackerArchetype || null);
    eventTrace.push({
      tick,
      type: 'entity:killed',
      data: {
        // Fingerprint for "the player died". Not a named cause — never lastAction.
        cause: 'player',
        targetId: playerId,
        archetype: 'player',
        killerId,
        attackerId: killerId,
        attackerArchetype,
        deathCause: attackerArchetype || null,
        telegraphed: killerId != null && tg ? inForce : null,
        telegraphInForce: killerId != null && tg ? inForce : null,
        telegraphKind: inForce ? (tg.kind || true) : null,
      },
    });
    return;
  }

  if (ev.ev === 'run:wavePlanned') {
    const swarm = p.plan && p.plan.swarm;
    eventTrace.push({
      tick,
      type: 'run:wavePlanned',
      data: {
        wave: p.wave,
        quota: swarm && Number.isInteger(swarm.quota) ? swarm.quota : null,
        concurrent: swarm && Number.isInteger(swarm.concurrent) ? swarm.concurrent : null,
        draftAfter: swarm ? swarm.draftAfter === true : null,
        refitAfter: swarm ? swarm.refitAfter === true : null,
      },
    });
    return;
  }
  if (ev.ev === 'run:waveCleared' || ev.ev === 'survival:waveCleared') {
    eventTrace.push({
      tick,
      type: 'run:waveCleared',
      data: {
        wave: p.wave,
        quota: Number.isInteger(p.quota) ? p.quota : null,
        killed: Number.isInteger(p.killed) ? p.killed : null,
        survivors: Number.isInteger(p.survivors) ? p.survivors : null,
      },
    });
    return;
  }
  if (ev.ev === 'run:draftOffered' || ev.ev === 'run:refitOffered') {
    eventTrace.push({
      tick,
      type: ev.ev,
      data: {
        wave: p.wave ?? null,
        kind: ev.ev === 'run:refitOffered' ? 'refit' : 'draft',
      },
    });
  }
}

function killCause(targetId, killerId, playerId, lastActionOn, lastAction, collisionVictims) {
  if (killerId === playerId) {
    const act = lastActionOn.get(targetId) || lastAction;
    return act === 'fire' || act == null ? 'weapon' : act;
  }
  if (collisionVictims.has(targetId)) return 'collision';
  return 'ai';
}

function isCohortId(state, id, cohortSeen) {
  if (id == null) return false;
  if (cohortSeen && cohortSeen.has(id)) return true;
  if (!state.entities || typeof state.entities.get !== 'function') return false;
  const e = state.entities.get(id);
  return !!(e && e.data && e.data.runCohort === SURVIVAL_COHORT_TAG);
}

/**
 * One admission sample: how many LIVE cohort hostiles hold an SG-02 record (a Rapier body) at
 * this tick. `physicsSys._sg02.records` is the owner's per-entity map; entities outside the
 * activity ring are simply absent from it.
 */
function recordBodyAdmission(acc, state, physicsSys, tick) {
  const records = physicsSys && physicsSys._sg02 && physicsSys._sg02.records;
  const hostiles = liveCohortHostiles(state);
  const cohortAlive = hostiles.length;
  let cohortWithBody = 0;
  if (records && typeof records.has === 'function') {
    for (const h of hostiles) if (records.has(h.id)) cohortWithBody += 1;
  }
  const sample = {
    tick,
    cohortAlive,
    cohortWithBody,
    missing: cohortAlive - cohortWithBody,
    playerHasBody: !!(records && typeof records.has === 'function' && records.has(state.playerId)),
  };
  acc.samples += 1;
  acc.final = sample;
  if (!acc.worst || sample.missing > acc.worst.missing) acc.worst = sample;
  return sample;
}

function snapshotIntent(aiIntent, actorId) {
  if (actorId == null || !aiIntent) return { aiPhase: null, aiTelegraph: null };
  const phase = aiIntent.phase && aiIntent.phase.get(actorId);
  const telegraph = aiIntent.telegraph && aiIntent.telegraph.get(actorId);
  return {
    aiPhase: phase ? { ...phase } : null,
    aiTelegraph: telegraph ? { ...telegraph } : null,
  };
}

function telegraphInForce(tg, atTick) {
  if (!tg || !Number.isFinite(tg.tick) || tg.tick > atTick) return false;
  const duration = Number(tg.durationTicks) | 0;
  if (duration > 0 && atTick > tg.tick + duration) return false;
  return true;
}

function copyPhase(phase) {
  return phase ? { ...phase } : null;
}

function copyTelegraph(tg) {
  return tg ? { ...tg } : null;
}

function receiptAttribution(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    causalActorId: d.causalActorId != null ? d.causalActorId : null,
    actorLiveCohortHostile: d.actorLiveCohortHostile === true,
    aiPhase: copyPhase(d.aiPhase),
    aiTelegraph: copyTelegraph(d.aiTelegraph),
  };
}

function recordUniqueTickHeading(event, tick, heading) {
  if (!event.headingByTick) event.headingByTick = new Map();
  if (event.headingByTick.has(tick)) return;
  event.headingByTick.set(tick, heading);
}

function firstReceiptFacts(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    otherId: d.otherId != null ? d.otherId : null,
    toOther: d.toOther || null,
    normal: d.normal || null,
    thrustIntoOther: Number.isFinite(d.thrustIntoOther) ? d.thrustIntoOther : null,
    preSolveClosingSpeed: Number.isFinite(d.preSolveClosingSpeed) ? d.preSolveClosingSpeed : null,
    tetherTargetId: d.tetherTargetId != null ? d.tetherTargetId : null,
  };
}

function recordUniqueTickWitness(event, tick, data) {
  if (!event.witnessByTick) event.witnessByTick = new Map();
  if (event.witnessByTick.has(tick)) return;
  const d = data && typeof data === 'object' ? data : {};
  event.witnessByTick.set(tick, {
    heading: Number.isFinite(d.headingWitnessRad) ? d.headingWitnessRad : null,
    course: Number.isFinite(d.courseWitnessRad) ? d.courseWitnessRad : null,
    rawHeading: Number.isFinite(d.rawHeadingDeltaRad) ? d.rawHeadingDeltaRad : null,
    appliedHeading: Number.isFinite(d.appliedHeadingRad) ? d.appliedHeadingRad : null,
    solverHeading: Number.isFinite(d.solverHeadingRad) ? d.solverHeadingRad : null,
    appliedCourse: Number.isFinite(d.appliedCourseRad) ? d.appliedCourseRad : null,
    solverCourse: Number.isFinite(d.solverCourseRad) ? d.solverCourseRad : null,
  });
}

/**
 * The CLAUSE's heading measure. Per unique tick, the contact-sourced witness; summed in absolute
 * value across the event and compared against the run's own measured floor times the number of
 * ticks, so a long grind cannot fail on accumulated float dust and a single real kick cannot hide
 * inside one.
 *
 * `headingSource` records what the RETIRED instrument (raw rotation delta vs a 1e-9 epsilon) would
 * have said about this same event, so the receipt can show the difference rather than assert it.
 */
function finalizeEventWitness(ev, floors) {
  const byTick = ev.witnessByTick instanceof Map ? ev.witnessByTick : new Map();
  delete ev.witnessByTick;
  let headingAbs = 0;
  let headingNet = 0;
  let courseAbs = 0;
  let courseNet = 0;
  let appliedHeadingAbs = 0;
  let solverHeadingAbs = 0;
  let appliedCourseAbs = 0;
  let solverCourseAbs = 0;
  let rawAbs = 0;
  let ticks = 0;
  let missing = byTick.size === 0;
  let oldWouldFire = false;
  let receiptHeadingKnown = byTick.size > 0;
  for (const w of byTick.values()) {
    ticks += 1;
    if (!Number.isFinite(w.heading)) { missing = true; continue; }
    headingAbs += Math.abs(w.heading);
    headingNet = wrapAngle(headingNet + w.heading);
    if (Number.isFinite(w.course)) {
      courseAbs += Math.abs(w.course);
      courseNet = wrapAngle(courseNet + w.course);
    }
    if (Number.isFinite(w.rawHeading)) {
      rawAbs += Math.abs(w.rawHeading);
      if (Math.abs(w.rawHeading) > HEADING_CHANGE_EPS) oldWouldFire = true;
    }
    if (Number.isFinite(w.appliedHeading)) appliedHeadingAbs += Math.abs(w.appliedHeading);
    else receiptHeadingKnown = false;
    if (Number.isFinite(w.solverHeading)) solverHeadingAbs += Math.abs(w.solverHeading);
    if (Number.isFinite(w.appliedCourse)) appliedCourseAbs += Math.abs(w.appliedCourse);
    if (Number.isFinite(w.solverCourse)) solverCourseAbs += Math.abs(w.solverCourse);
  }
  const headingBudget = Math.max(1, ticks) * (floors.headingFloorRad || 0);
  const courseBudget = Math.max(1, ticks) * (floors.courseFloorRad || 0);
  ev.witnessTicks = ticks;
  ev.missingWitness = missing;
  ev.headingWitnessAbsRad = missing ? null : headingAbs;
  ev.headingWitnessNetRad = missing ? null : headingNet;
  ev.headingWitnessFloorRad = headingBudget;
  ev.headingChangedByWitness = missing ? null : headingAbs > headingBudget;
  ev.courseWitnessAbsRad = missing ? null : courseAbs;
  ev.courseWitnessNetRad = missing ? null : courseNet;
  ev.courseWitnessFloorRad = courseBudget;
  ev.courseChangedByWitness = missing ? null : courseAbs > courseBudget;
  // Beside the witness, never instead of it: what the rule's own receipts claim it let through,
  // and what the solver tried to do before the rule answered.
  ev.receiptAppliedHeadingAbsRad = receiptHeadingKnown ? appliedHeadingAbs : null;
  ev.receiptSolverHeadingAbsRad = solverHeadingAbs;
  ev.receiptAppliedCourseAbsRad = appliedCourseAbs;
  ev.receiptSolverCourseAbsRad = solverCourseAbs;
  ev.headingWitnessVsReceiptRad = (missing || !receiptHeadingKnown)
    ? null
    : Math.abs(headingAbs - appliedHeadingAbs);
  ev.rawHeadingAbsRad = rawAbs;
  ev.headingSource = oldWouldFire
    ? 'retired raw-rotation instrument would have counted this event as a heading change'
    : null;
}

function classifyRopeInitiated(ev) {
  const first = ev.first;
  if (!first) return false;
  if (first.tetherTargetId == null || first.otherId == null) return false;
  return first.tetherTargetId === first.otherId;
}

/**
 * A slam the player chose. B13's own sentence exempts it ("a deliberate big event (a slam the
 * player chose, a well the player flew into)"), and until now the bench counted every one of them
 * as ordinary flight — on Lagrange/starter EVERY ambient knock named the player as its causal
 * actor, because the bench pilot holds forward into the hostile it is chasing and grinds against it
 * for seconds.
 *
 * The rule (integrator's correction, 2026-09-05). ALL of:
 *   - every constituent receipt names the player as its causal actor, AND
 *   - EITHER the first receipt's aim is INTO the other hull (normalised commanded thrust dotted
 *     with player->other >= 0.7) AND the contact is HELD for >= 0.5 s (30 ticks),
 *     OR the first receipt's radial closing speed is >= 30 % of cruise.
 *
 * The aim-and-hold pair is the load-bearing part: a shoulder graze past a rock with forward held
 * scores 0.3-0.6 and lasts a handful of ticks, so it stays AMBIENT and still has to fit the budget.
 *
 * Fail-closed: an event with no attribution, no direction and no closing speed is AMBIENT. Returns
 * the audit row as well as the verdict so the receipt can print the dots and the durations rather
 * than assert the classification.
 */
function classifyPlayerInitiated(ev, playerId, cruiseSpeed) {
  const parts = Array.isArray(ev.constituents) ? ev.constituents : [];
  const first = ev.first || null;
  const ticks = Math.max(1, (ev.lastTick - ev.startTick) + 1);
  const dot = first && Number.isFinite(first.thrustIntoOther) ? first.thrustIntoOther : null;
  const closing = first && Number.isFinite(first.preSolveClosingSpeed)
    ? first.preSolveClosingSpeed
    : null;
  const closingFraction = (closing !== null && Number.isFinite(cruiseSpeed) && cruiseSpeed > 0)
    ? closing / cruiseSpeed
    : null;
  const audit = {
    startTick: ev.startTick,
    ticks,
    durationS: round3(ticks / 60),
    thrustIntoOtherDot: dot === null ? null : round3(dot),
    closingFractionOfCruise: closingFraction === null ? null : round3(closingFraction),
    allPlayerCaused: false,
    aimedAndHeld: false,
    ramSpeed: false,
    verdict: 'ambient',
  };
  if (!parts.length || playerId == null || !first) return { deliberate: false, audit };
  let allPlayer = true;
  for (const part of parts) {
    if (part.causalActorId == null || part.causalActorId !== playerId) { allPlayer = false; break; }
  }
  audit.allPlayerCaused = allPlayer;
  if (!allPlayer) return { deliberate: false, audit };
  audit.aimedAndHeld = dot !== null
    && dot >= PLAYER_INITIATED_THRUST_DOT
    && ticks >= PLAYER_INITIATED_SUSTAINED_TICKS;
  audit.ramSpeed = closingFraction !== null && closingFraction >= PLAYER_INITIATED_CLOSING_FRACTION;
  const deliberate = audit.aimedAndHeld || audit.ramSpeed;
  if (deliberate) audit.verdict = audit.aimedAndHeld ? 'playerInitiated:aimed+held' : 'playerInitiated:ram';
  return { deliberate, audit };
}

function finalizeEventHeading(ev) {
  const byTick = ev.headingByTick instanceof Map ? ev.headingByTick : new Map();
  delete ev.headingByTick;
  let missing = ev.missingHeading === true;
  let net = 0;
  let changed = false;
  let anyFinite = false;
  for (const heading of byTick.values()) {
    if (!Number.isFinite(heading)) {
      missing = true;
      continue;
    }
    anyFinite = true;
    net = wrapAngle(net + heading);
    if (Math.abs(heading) > HEADING_CHANGE_EPS) changed = true;
  }
  if (byTick.size === 0) missing = true;
  ev.missingHeading = missing;
  // Net wrapped rotation is informational. The no-heading-change clause uses per-tick abs.
  ev.headingChangeRad = missing ? null : (anyFinite ? net : null);
  ev.headingChanged = missing ? null : changed;
}

/**
 * Hostile only when EVERY constituent receipt names the same known live cohort hostile
 * AND that actor had player-targeted intent plus an in-force telegraph at its own event
 * time. Unknown, stale, dead/wreck, mixed-actor, or partially unattributed → ambient.
 * A later receipt never rewrites an earlier snapshot.
 */
function classifyHostileInitiated(ev, playerId) {
  const parts = Array.isArray(ev.constituents) ? ev.constituents : [];
  if (!parts.length) return false;
  const actorId = parts[0].causalActorId;
  if (actorId == null || actorId === playerId) return false;
  for (const part of parts) {
    if (part.causalActorId == null || part.causalActorId !== actorId) return false;
    if (part.actorLiveCohortHostile !== true) return false;
    const intent = part.aiPhase;
    if (!intent || intent.targetId !== playerId) return false;
    const tg = part.aiTelegraph;
    if (!telegraphInForce(tg, part.tick)) return false;
    if (tg.targetId != null && tg.targetId !== playerId) return false;
  }
  return true;
}

/**
 * Receipts -> EVENTS -> {ambient, hostileInitiated}. Coalescing follows CONTACT's
 * EVENT_BRIDGE_TICKS rule. Attribution uses the actor/intent snapshot stamped on each receipt
 * at ingest time — a later map.set or cohort join must not rewrite an earlier collision.
 */
export function buildKnockEvents(eventTrace, { playerId, cruiseSpeed, witnessFloors } = {}) {
  const floors = witnessFloors || { headingFloorRad: 0, courseFloorRad: 0 };
  const receipts = (Array.isArray(eventTrace) ? eventTrace : [])
    .filter((e) => e && e.type === 'collision:playerKnock')
    .sort((a, b) => a.tick - b.tick);
  const events = [];
  let open = null;
  for (const r of receipts) {
    const rawDv = r.data && Number.isFinite(r.data.rawDeltaV)
      ? r.data.rawDeltaV
      : (r.data && Number.isFinite(r.data.deltaV) ? r.data.deltaV : null);
    const appliedDv = r.data && Number.isFinite(r.data.appliedDeltaV)
      ? r.data.appliedDeltaV
      : null;
    const heading = r.data && Number.isFinite(r.data.headingChangeRad) ? r.data.headingChangeRad : null;
    const headingMissing = !(r.data && Number.isFinite(r.data.headingChangeRad));
    const attr = receiptAttribution(r.data);
    if (open && r.tick - open.lastTick <= EVENT_BRIDGE_TICKS) {
      open.lastTick = r.tick;
      open.receipts += 1;
      if (rawDv === null) open.missingRawDeltaV = true;
      else open.rawDeltaV += rawDv;
      if (appliedDv === null) open.missingAppliedDeltaV = true;
      else open.appliedDeltaV += appliedDv;
      if (headingMissing) open.missingHeading = true;
      recordUniqueTickHeading(open, r.tick, headingMissing ? null : heading);
      recordUniqueTickWitness(open, r.tick, r.data);
      open.constituents.push({ tick: r.tick, ...attr });
      continue;
    }
    open = {
      startTick: r.tick,
      lastTick: r.tick,
      rawDeltaV: rawDv === null ? 0 : rawDv,
      appliedDeltaV: appliedDv === null ? 0 : appliedDv,
      missingRawDeltaV: rawDv === null,
      missingAppliedDeltaV: appliedDv === null,
      missingHeading: headingMissing,
      receipts: 1,
      constituents: [{ tick: r.tick, ...attr }],
      headingByTick: new Map(),
      // First receipt only — the contact the player was steering into when it started.
      first: firstReceiptFacts(r.data),
      // First-receipt identity only — later receipts must not fill a hole.
      causalActorId: attr.causalActorId,
      actorLiveCohortHostile: attr.actorLiveCohortHostile,
      actorInCohort: attr.actorLiveCohortHostile,
      aiPhase: copyPhase(attr.aiPhase),
      aiTelegraph: copyTelegraph(attr.aiTelegraph),
    };
    recordUniqueTickHeading(open, r.tick, headingMissing ? null : heading);
    recordUniqueTickWitness(open, r.tick, r.data);
    events.push(open);
  }

  for (const ev of events) {
    finalizeEventHeading(ev);
    finalizeEventWitness(ev, floors);
    ev.hostileInitiated = classifyHostileInitiated(ev, playerId);
    ev.ropeInitiated = classifyRopeInitiated(ev);
    const chosen = classifyPlayerInitiated(ev, playerId, cruiseSpeed);
    ev.playerInitiated = !ev.ropeInitiated && chosen.deliberate;
    // The classifier's own working, on the record, for every event it judged. Without this the
    // exemption is an assertion; with it the receipt can print "dot 0.42 for 9 ticks -> ambient"
    // for the grinds the previous instrument was waving through.
    ev.deliberateAudit = {
      ...chosen.audit,
      ropeInitiated: ev.ropeInitiated,
      verdict: ev.ropeInitiated ? 'ropeInitiated' : chosen.audit.verdict,
    };
    ev.deliberate = ev.ropeInitiated || ev.playerInitiated;
    ev.durationS = (ev.lastTick - ev.startTick + 1) / 60;
    // Legacy `deltaV` stays the raw/compatible sum so fixtures without appliedDeltaV still
    // add up. Ambient B13 magnitude uses applied and fails closed when it is missing; hostile
    // ram legibility uses raw.
    ev.deltaV = ev.rawDeltaV;
    ev.missingDeltaV = ev.missingRawDeltaV;
    // Ambient magnitude is what the rule LET THROUGH (applied). A deliberate event — a hostile ram,
    // a slam the player chose, a body the player reeled into — is judged on the raw solver dV,
    // because legibility is about what the player felt, not about what the budget allowed.
    const rawGoverned = ev.hostileInitiated || ev.deliberate;
    const governedDv = rawGoverned ? ev.rawDeltaV : ev.appliedDeltaV;
    const governedMissing = rawGoverned ? ev.missingRawDeltaV : ev.missingAppliedDeltaV;
    if (governedMissing) ev.deltaVFractionOfCruise = null;
    else if (cruiseSpeed !== null && cruiseSpeed > 0) ev.deltaVFractionOfCruise = governedDv / cruiseSpeed;
    else ev.deltaVFractionOfCruise = null;

    const intent = ev.aiPhase;
    ev.phase = intent ? intent.phase : null;
    ev.maneuverKind = intent ? intent.maneuverKind : null;
    const tg = ev.aiTelegraph;
    ev.telegraphLeadS = telegraphInForce(tg, ev.startTick) ? (ev.startTick - tg.tick) / 60 : null;
    ev.telegraphKind = tg ? tg.kind : null;
    ev.legible = ev.hostileInitiated
      ? (ev.telegraphLeadS !== null && ev.telegraphLeadS >= TELEGRAPH_LEGIBLE_S)
      : null;
  }
  return events;
}

/**
 * Stamp each player-knock receipt with the contact-sourced witness for its tick. The witness is
 * measured from the player's own published kinematics and owes the give rule nothing, so a rule
 * that lied about what it let through would show up as a disagreement rather than as agreement.
 */
function applyKnockWitness(eventTrace, playerTickByTick) {
  for (const ev of eventTrace) {
    if (ev.type !== 'collision:playerKnock') continue;
    const row = playerTickByTick.get(ev.tick);
    if (!row) {
      ev.data.headingWitnessRad = null;
      ev.data.courseWitnessRad = null;
      ev.data.rawHeadingDeltaRad = null;
      continue;
    }
    ev.data.headingWitnessRad = Number.isFinite(row.headingWitness) ? row.headingWitness : null;
    ev.data.courseWitnessRad = Number.isFinite(row.courseWitness) ? row.courseWitness : null;
    ev.data.rawHeadingDeltaRad = Number.isFinite(row.rawHeadingDelta) ? row.rawHeadingDelta : null;
  }
}

/**
 * The player's own spin over the run. Reported, never a clause: it exists because the player hull
 * is the one body that skips SANE_MAX_YAW_RATE, and because a strip frame gap of 0.13 s cannot tell
 * a fast spin from an aliased one without this number to compare against.
 */
function summarizePlayerSpin(playerTickByTick, witnessFloors) {
  let maxYawRate = 0;
  let maxYawRateTick = null;
  let maxAngVel = 0;
  let maxWitness = 0;
  let maxWitnessTick = null;
  let ticksAboveSaneYaw = 0;
  let maxInjected = 0;
  let maxInjectedTick = null;
  let maxCommanded = 0;
  const spinTicks = [];
  for (const [tick, row] of playerTickByTick) {
    if (Number.isFinite(row.spinInjected) && Math.abs(row.spinInjected) > maxInjected) {
      maxInjected = Math.abs(row.spinInjected);
      maxInjectedTick = tick;
    }
    if (Number.isFinite(row.spinCommanded) && Math.abs(row.spinCommanded) > maxCommanded) {
      maxCommanded = Math.abs(row.spinCommanded);
    }
    if (Number.isFinite(row.angVel) && Math.abs(row.angVel) > SANE_MAX_YAW_RATE_REFERENCE) {
      spinTicks.push({
        tick,
        angVel: row.angVel,
        injected: row.spinInjected,
        commanded: row.spinCommanded,
      });
    }
  }
  spinTicks.sort((a, b) => Math.abs(b.angVel) - Math.abs(a.angVel));
  for (const [tick, row] of playerTickByTick) {
    if (Number.isFinite(row.yawRate) && Math.abs(row.yawRate) > maxYawRate) {
      maxYawRate = Math.abs(row.yawRate);
      maxYawRateTick = tick;
    }
    if (Number.isFinite(row.angVel) && Math.abs(row.angVel) > maxAngVel) maxAngVel = Math.abs(row.angVel);
    if (Number.isFinite(row.headingWitness) && Math.abs(row.headingWitness) > maxWitness) {
      maxWitness = Math.abs(row.headingWitness);
      maxWitnessTick = tick;
    }
    if (Number.isFinite(row.yawRate) && Math.abs(row.yawRate) > SANE_MAX_YAW_RATE_REFERENCE) {
      ticksAboveSaneYaw += 1;
    }
  }
  return {
    maxYawRateRadS: maxYawRate,
    maxYawRateTick,
    maxAngVelRadS: maxAngVel,
    maxHeadingWitnessRad: maxWitness,
    maxHeadingWitnessTick: maxWitnessTick,
    ticksAboveSaneYawRate: ticksAboveSaneYaw,
    saneYawRateReferenceRadS: SANE_MAX_YAW_RATE_REFERENCE,
    // Where the spin came from. `injected` is angular velocity the control torque does not
    // account for: an angular impulse applied to the hull between steps.
    maxSpinInjectedRadS: maxInjected,
    maxSpinInjectedTick: maxInjectedTick,
    maxSpinCommandedRadS: maxCommanded,
    worstSpinTicks: spinTicks.slice(0, 8),
    headingFloorRad: witnessFloors.headingFloorRad,
    courseFloorRad: witnessFloors.courseFloorRad,
    headingFloorSamples: witnessFloors.headingFloorSamples,
    courseFloorSamples: witnessFloors.courseFloorSamples,
    ticksSampled: playerTickByTick.size,
  };
}

function applyKnockHeadings(eventTrace, knockHeadingByTick) {
  for (const ev of eventTrace) {
    if (ev.type !== 'collision:playerKnock') continue;
    if (!knockHeadingByTick.has(ev.tick)) continue;
    const heading = knockHeadingByTick.get(ev.tick);
    ev.data.headingChangeRad = Number.isFinite(heading) ? heading : null;
  }
}

function summarizeMetrics({
  eventTrace, knockEvents, ticks, wavesCleared, cruiseSpeed,
  legacyCruiseSpeed = null, witnessFloors = null, spin = null,
}) {
  const simSeconds = ticks / 60;
  const simMinutes = Math.max(1 / 60, simSeconds / 60);
  let totalKills = 0;
  let totalShots = 0;
  let totalHits = 0;
  let totalDamageDealt = 0;
  let totalDamageTaken = 0;
  let playerKnockEvents = 0;
  let maxPlayerKnockFraction = 0;
  let knocksMissingDeltaV = 0;
  let knocksMissingAppliedDeltaV = 0;
  let knocksMissingActor = 0;
  // Of those, the ones too small for the player to feel. `directContactCausalActorId` returns null
  // when the two bodies' normal contributions are symmetric or non-closing — which is exactly what
  // solver settle looks like. Naming an actor there would be guessing, and the scenario's own law is
  // that nothing unattributed may be guessed. Split so a settle receipt is not read as a bar gap.
  let knocksMissingActorSubFloor = 0;
  let collateralMoments = 0;
  const verbs = new Set();

  for (const ev of eventTrace) {
    if (ev.type === 'player:shot') totalShots += 1;
    else if (ev.type === 'verb:used' && ev.data && ev.data.verb) verbs.add(ev.data.verb);
    else if (ev.type === 'entity:killed' && ev.data && ev.data.cause !== 'player') totalKills += 1;
    else if (ev.type === 'combat:collateral') collateralMoments += 1;
    else if (ev.type === 'collision:playerKnock') {
      // A knock the physics authority reported without deltaV is a HOLE, not a zero.
      const raw = ev.data && ev.data.rawDeltaV != null ? Number(ev.data.rawDeltaV) : (ev.data && ev.data.deltaV != null ? Number(ev.data.deltaV) : NaN);
      const applied = ev.data && ev.data.appliedDeltaV != null ? Number(ev.data.appliedDeltaV) : NaN;
      if (!Number.isFinite(raw)) knocksMissingDeltaV += 1;
      if (!Number.isFinite(applied)) knocksMissingAppliedDeltaV += 1;
      if (!ev.data || ev.data.causalActorId == null) {
        knocksMissingActor += 1;
        const receiptFloor = cruiseSpeed !== null && cruiseSpeed > 0 ? KNOCK_FLOOR_FRACTION * cruiseSpeed : 0;
        if (Number.isFinite(applied) && applied < receiptFloor) knocksMissingActorSubFloor += 1;
      }
      if (ev.data) {
        ev.data.deltaVFractionOfCruise = cruiseSpeed !== null && cruiseSpeed > 0 && Number.isFinite(applied)
          ? applied / cruiseSpeed
          : null;
        ev.data.rawDeltaVFractionOfCruise = cruiseSpeed !== null && cruiseSpeed > 0 && Number.isFinite(raw)
          ? raw / cruiseSpeed
          : null;
      }
    }
  }

  // EVENTS, not receipts, and AMBIENT events for the budget clauses (master ruling 01:45).
  // Ordinary rate/magnitude uses applied player delta-V; a receipt with no retained response is
  // not a knock the player could feel. Missing applied stays in the set so acceptance fails closed.
  const events = Array.isArray(knockEvents) ? knockEvents : [];
  const knockFloor = cruiseSpeed !== null && cruiseSpeed > 0 ? KNOCK_FLOOR_FRACTION * cruiseSpeed : 0;
  // Ambient = neither hostile-, player-, nor rope-initiated. The three deliberate classes are
  // reported beside the budget, exactly as hostile rams already were, and never folded into the
  // <= 2/min rate or the 10 % magnitude — B13's own sentence exempts them.
  const ambient = events.filter((e) => {
    if (e.hostileInitiated || e.deliberate) return false;
    if (e.missingAppliedDeltaV) return true;
    return Number.isFinite(e.appliedDeltaV) && e.appliedDeltaV >= knockFloor;
  });
  const hostile = events.filter((e) => e.hostileInitiated);
  const playerChosen = events.filter((e) => !e.hostileInitiated && e.playerInitiated);
  const ropeChosen = events.filter((e) => !e.hostileInitiated && e.ropeInitiated);
  playerKnockEvents = ambient.length;
  let headingChangeEvents = 0;
  let headingKnown = true;
  let courseChangeEvents = 0;
  let courseKnown = true;
  let ambientFractionKnown = true;
  let headingWitnessVsReceiptMaxRad = 0;
  let maxHeadingWitnessAbsRad = 0;
  let retiredInstrumentWouldHaveFired = 0;
  for (const e of ambient) {
    if (e.deltaVFractionOfCruise !== null && e.deltaVFractionOfCruise > maxPlayerKnockFraction) {
      maxPlayerKnockFraction = e.deltaVFractionOfCruise;
    }
    if (e.deltaVFractionOfCruise === null) ambientFractionKnown = false;
    // The CLAUSE: the contact-sourced witness, which owes the give rule nothing and cancels the
    // pilot's own steering exactly. The retired raw-rotation measure is counted beside it.
    if (e.missingWitness === true || e.headingChangedByWitness == null) headingKnown = false;
    else if (e.headingChangedByWitness === true) headingChangeEvents += 1;
    if (e.missingWitness === true || e.courseChangedByWitness == null) courseKnown = false;
    else if (e.courseChangedByWitness === true) courseChangeEvents += 1;
    if (Number.isFinite(e.headingWitnessVsReceiptRad)
      && e.headingWitnessVsReceiptRad > headingWitnessVsReceiptMaxRad) {
      headingWitnessVsReceiptMaxRad = e.headingWitnessVsReceiptRad;
    }
    if (Number.isFinite(e.headingWitnessAbsRad) && e.headingWitnessAbsRad > maxHeadingWitnessAbsRad) {
      maxHeadingWitnessAbsRad = e.headingWitnessAbsRad;
    }
    if (e.headingSource) retiredInstrumentWouldHaveFired += 1;
  }
  let maxHostileFraction = 0;
  let hostileLegible = 0;
  let hostileFractionKnown = true;
  for (const e of hostile) {
    if (e.deltaVFractionOfCruise !== null && e.deltaVFractionOfCruise > maxHostileFraction) {
      maxHostileFraction = e.deltaVFractionOfCruise;
    }
    if (e.deltaVFractionOfCruise === null) hostileFractionKnown = false;
    if (e.legible === true) hostileLegible += 1;
  }
  const knockRate = playerKnockEvents / simMinutes;
  // Component clauses (rate / magnitude / heading) may be true or false. The full B13
  // contract also requires no visible jitter. This harness is headless, so jitter is
  // unmeasured and the full-contract verdict must never read true.
  const cruiseKnown = cruiseSpeed !== null && cruiseSpeed > 0;
  const fractionKnown = cruiseKnown && ambientFractionKnown && knocksMissingDeltaV === 0 && knocksMissingAppliedDeltaV === 0;
  const jitterMeasured = false;
  const overBudget = (headingKnown && headingChangeEvents > 0)
    || (fractionKnown && maxPlayerKnockFraction > KNOCK_MAX_FRACTION_LIMIT)
    || knockRate > KNOCK_EVENTS_PER_MIN_LIMIT;
  const b13ComponentsMet = fractionKnown
    && headingKnown
    && headingChangeEvents === 0
    && maxPlayerKnockFraction <= KNOCK_MAX_FRACTION_LIMIT
    && knockRate <= KNOCK_EVENTS_PER_MIN_LIMIT;
  let b13Met;
  if (overBudget) b13Met = false;
  else if (!jitterMeasured) b13Met = false;
  else if (!b13ComponentsMet) b13Met = false;
  else b13Met = true;
  const gapParts = [];
  if (!cruiseKnown) {
    gapParts.push('maxPlayerKnockFraction: the player hull reported no maxSpeed, so a fraction of cruise is unmeasurable');
  }
  if (knocksMissingDeltaV > 0) {
    gapParts.push(`${knocksMissingDeltaV} physics:impact event(s) named the player but carried no playerDeltaV`);
  }
  if (knocksMissingAppliedDeltaV > 0) {
    gapParts.push(`${knocksMissingAppliedDeltaV} physics:impact event(s) named the player but carried no appliedPlayerDeltaV`);
  }
  const knocksMissingActorAtOrAboveFloor = knocksMissingActor - knocksMissingActorSubFloor;
  if (knocksMissingActorAtOrAboveFloor > 0) {
    // Only an unattributed receipt the player could actually feel is a gap: it could be a ram the
    // bar should exclude or ambient contact the bar should count, and nothing here can tell which.
    gapParts.push(`${knocksMissingActorAtOrAboveFloor} player knock receipt(s) at or above the knock floor named no causalActorId, so ambient-vs-ram is unproven for them`);
  }
  if (!headingKnown) {
    gapParts.push('headingChange: at least one ambient contact has no measured heading witness');
  }
  gapParts.push('visible jitter is unmeasured on this headless path; full B13 cannot pass');
  const deliberate = summarizeDeliberate({ playerChosen, ropeChosen, cruiseKnown, simMinutes });
  return {
    totalKills,
    totalShots,
    totalHits,
    hitAccuracy: null, // filled by finalizeCombatCounts from the raw bus log
    totalDamageDealt,
    totalDamageTaken,
    verbsUsedCount: verbs.size,
    verbsPerMinute: verbs.size / simMinutes,
    momentsPerMinute: collateralMoments / simMinutes,
    nothingHappenedSeconds: measureQuietSeconds(eventTrace),
    playerKnockEventsPerMin: knockRate,
    maxPlayerKnockFraction: cruiseKnown && ambientFractionKnown ? maxPlayerKnockFraction : null,
    headingChangeEvents: headingKnown ? headingChangeEvents : null,
    courseChangeEvents: courseKnown ? courseChangeEvents : null,
    jitterMeasured,
    // PQ-137.11 B: the clause's instrument, its floor, and its disagreement with the rule's own
    // receipts. A rule that misreported what it let through would show up here as a number.
    headingWitnessSource: 'wrapAngle(rot_after - rot_before) - angVel_after * dt, per knock tick,'
      + ' thresholded at the run\'s own receipt-free residual floor (p99.5)',
    headingWitnessFloorRad: witnessFloors ? witnessFloors.headingFloorRad : null,
    courseWitnessFloorRad: witnessFloors ? witnessFloors.courseFloorRad : null,
    maxHeadingWitnessAbsRad: headingKnown ? maxHeadingWitnessAbsRad : null,
    headingWitnessVsReceiptMaxRad: headingKnown ? headingWitnessVsReceiptMaxRad : null,
    // What the RETIRED raw-rotation instrument would have counted on this same run.
    retiredRawHeadingChangeEvents: retiredInstrumentWouldHaveFired,
    // PQ-137.11 D: the denominator changed. Both are printed so the change is visible.
    cruiseSpeedWU: cruiseSpeed,
    cruiseSpeedSource: 'resolveGovernedCombatSpeed(player, null, fallback) — the contact rule\'s own cruise',
    legacyCruiseSpeedWU: legacyCruiseSpeed,
    // PQ-137.11 C: contacts the player chose, reported beside the budget.
    ...deliberate,
    // Every non-hostile event with the classifier's own numbers, so the exemption is auditable.
    deliberateAudit: collectDeliberateAudit(events),
    playerSpin: spin,
    // Reported beside B13, never folded into it (master ruling 2026-09-04 01:45).
    knockReceipts: events.reduce((n, e) => n + (e.receipts || 0), 0),
    knockEventsTotal: events.length,
    ambientKnockEvents: ambient.length,
    hostileKnockEvents: hostile.length,
    hostileKnockEventsPerMin: hostile.length / simMinutes,
    maxHostileKnockFraction: cruiseKnown && hostileFractionKnown ? maxHostileFraction : null,
    hostileKnocksLegible: hostileLegible,
    hostileKnocksIllegible: hostile.length - hostileLegible,
    b13ComponentsMet,
    b13Met,
    knockGap: gapParts.length ? gapParts.join('; ') : null,
    knocksMissingDeltaV,
    knocksMissingAppliedDeltaV,
    knocksMissingActor,
    // Sub-floor settle contacts the authority declined to attribute. Reported, never a bar gap.
    knocksMissingActorSubFloor,
    knocksMissingActorAtOrAboveFloor,
    wavesCleared,
    simSeconds: round2(simSeconds),
    knockSource: 'physics:impact(playerInvolved).appliedPlayerDeltaV, receipts coalesced into events',
  };
}

/**
 * Contacts the player chose — a slam they held the throttle into, or a body they reeled into on a
 * live line. Same shape as the hostile-ram report: count, largest fraction of cruise, seconds in
 * contact. Never folded into the ambient rate or magnitude.
 */
function summarizeDeliberate({ playerChosen, ropeChosen, cruiseKnown, simMinutes }) {
  const reduce = (list) => {
    let maxFraction = 0;
    let known = true;
    let seconds = 0;
    for (const e of list) {
      if (e.deltaVFractionOfCruise === null) known = false;
      else if (e.deltaVFractionOfCruise > maxFraction) maxFraction = e.deltaVFractionOfCruise;
      seconds += Number.isFinite(e.durationS) ? e.durationS : 0;
    }
    return {
      count: list.length,
      perMin: list.length / simMinutes,
      maxFraction: cruiseKnown && known ? maxFraction : null,
      secondsInContact: round2(seconds),
    };
  };
  const p = reduce(playerChosen);
  const r = reduce(ropeChosen);
  return {
    playerInitiatedKnockEvents: p.count,
    playerInitiatedKnockEventsPerMin: p.perMin,
    maxPlayerInitiatedKnockFraction: p.maxFraction,
    playerInitiatedSecondsInContact: p.secondsInContact,
    ropeInitiatedKnockEvents: r.count,
    ropeInitiatedKnockEventsPerMin: r.perMin,
    maxRopeInitiatedKnockFraction: r.maxFraction,
    ropeInitiatedSecondsInContact: r.secondsInContact,
    deliberateKnockRule: 'playerInitiated = every constituent names the player as causal actor AND'
      + ` ((normalised commanded thrust . player->other >= ${PLAYER_INITIATED_THRUST_DOT} AND the`
      + ` contact is held >= ${PLAYER_INITIATED_SUSTAINED_TICKS} ticks / 0.5 s)`
      + ` OR radial pre-solve closing speed >= ${PLAYER_INITIATED_CLOSING_FRACTION} x cruise);`
      + ' ropeInitiated = the other body is the live Massline target. A shoulder graze past a rock'
      + ' with forward held scores 0.3-0.6 and lasts a few ticks, so it stays AMBIENT.',
  };
}

/**
 * The classifier's working for every non-hostile event: what the dot was, how long the contact was
 * held, and which way the rule went. This is what makes the exemption auditable — a reader can see
 * that the Lagrange grinds scored below the aim threshold and were counted, not waved through.
 */
function collectDeliberateAudit(events) {
  const rows = [];
  for (const e of events) {
    if (e.hostileInitiated) continue;
    if (!e.deliberateAudit) continue;
    rows.push({
      ...e.deliberateAudit,
      deltaVFractionOfCruise: round3(e.deltaVFractionOfCruise),
      receipts: e.receipts || 0,
    });
  }
  rows.sort((a, b) => a.startTick - b.startTick);
  return rows;
}

function measureQuietSeconds(trace) {
  const dense = [];
  for (const ev of trace) {
    if (!ev || ev.type === 'run:wavePlanned' || ev.type === 'run:waveCleared') continue;
    if (Number.isFinite(ev.tick)) dense.push(ev.tick | 0);
  }
  dense.sort((a, b) => a - b);
  // Same rule funMetrics.mjs uses: a trace with almost no events cannot distinguish
  // "nothing happened" from "nothing was recorded". 0 would read as constant action.
  if (dense.length < 3) return null;
  let quietTicks = 0;
  for (let i = 1; i < dense.length; i++) {
    const gap = dense[i] - dense[i - 1];
    if (gap > 240) quietTicks += gap;
  }
  return quietTicks / 60;
}

function finalizeCombatCounts(metrics, log, playerId) {
  let hits = 0;
  let dealt = 0;
  let taken = 0;
  for (const ev of log) {
    const p = ev.payload || {};
    if (ev.ev === 'projectile:hit' && p.ownerId === playerId) hits += 1;
    if (ev.ev === 'combat:damage') {
      const amt = finiteOrZero(p.applied != null ? p.applied : p.amount);
      if (p.attackerId === playerId) dealt += amt;
      if (p.targetId === playerId || p.isPlayer === true) taken += amt;
    }
  }
  metrics.totalHits = hits;
  metrics.totalDamageDealt = dealt;
  metrics.totalDamageTaken = taken;
  // No shots fired is not 100 % accuracy — it is an unmeasurable ratio. The honesty
  // contract says a metric the run cannot support is null, never a flattering default.
  metrics.hitAccuracy = metrics.totalShots > 0 ? hits / metrics.totalShots : null;
  return metrics;
}

function hashableMetrics(metrics, extra) {
  return {
    totalKills: metrics.totalKills,
    totalShots: metrics.totalShots,
    totalHits: metrics.totalHits,
    hitAccuracy: metrics.hitAccuracy,
    totalDamageDealt: metrics.totalDamageDealt,
    totalDamageTaken: metrics.totalDamageTaken,
    verbsUsedCount: metrics.verbsUsedCount,
    verbsPerMinute: metrics.verbsPerMinute,
    momentsPerMinute: metrics.momentsPerMinute,
    nothingHappenedSeconds: metrics.nothingHappenedSeconds,
    playerKnockEventsPerMin: metrics.playerKnockEventsPerMin,
    maxPlayerKnockFraction: metrics.maxPlayerKnockFraction,
    headingChangeEvents: metrics.headingChangeEvents,
    knocksMissingDeltaV: metrics.knocksMissingDeltaV,
    knocksMissingAppliedDeltaV: metrics.knocksMissingAppliedDeltaV,
    knocksMissingActor: metrics.knocksMissingActor,
    knockReceipts: metrics.knockReceipts,
    knockEventsTotal: metrics.knockEventsTotal,
    ambientKnockEvents: metrics.ambientKnockEvents,
    hostileKnockEvents: metrics.hostileKnockEvents,
    hostileKnocksLegible: metrics.hostileKnocksLegible,
    b13ComponentsMet: metrics.b13ComponentsMet,
    b13Met: metrics.b13Met,
    jitterMeasured: metrics.jitterMeasured === true,
    wavesCleared: metrics.wavesCleared,
    stopReason: extra.stopReason,
    ticks: extra.ticks,
    simSeconds: extra.simSeconds,
    knockSource: 'physics:impact',
  };
}

function toRunRecord(runData, ids) {
  return {
    bench: 'crucible',
    ruleset: 'swarm',
    arenaId: ids.arenaId,
    loadoutId: ids.loadoutId,
    seed: ids.seed,
    waveCount: ids.waveCount,
    durationMs: runData.wallMs,
    runHash: runData.runHash,
    runManifest: runData.runManifest,
    waveCheckpoints: runData.waveCheckpoints,
    eventTrace: runData.eventTrace,
    metrics: runData.metrics,
    inputTape: runData.inputTape,
    realPath: runData.realPath,
    systemsRegistered: runData.systemsRegistered,
    updateOrder: runData.updateOrder,
    fitReceipt: runData.fitReceipt,
    stopReason: runData.stopReason,
    ticks: runData.ticks,
    simSeconds: runData.simSeconds,
    wallMs: runData.wallMs,
    msPerTick: runData.msPerTick,
    wavesReached: runData.wavesReached,
    knockSource: 'physics:impact',
    knockEvents: runData.knockEvents,
    bodyAdmission: runData.bodyAdmission,
    swarm: runData.swarm || measureSwarmRun({
      eventTrace: runData.eventTrace,
      fitReceipt: runData.fitReceipt,
      bodyAdmission: runData.bodyAdmission,
      stopReason: runData.stopReason,
      ticks: runData.ticks,
      simSeconds: runData.simSeconds,
      loadoutId: ids.loadoutId,
      seed: ids.seed,
      arenaId: ids.arenaId,
    }),
  };
}

// ── child-process determinism ───────────────────────────────────────────────────

function spawnHashChild({ arenaId, loadoutId, seed, tickCap }) {
  const self = fileURLToPath(import.meta.url);
  const args = [
    self,
    '--print-run-hash',
    `--arena=${arenaId}`,
    `--loadout=${loadoutId}`,
    `--seed=${seed}`,
    `--tick-cap=${tickCap}`,
  ];
  const cap = Number.isFinite(tickCap) ? tickCap : CRUCIBLE_TICK_CAP;
  const timeout = Math.max(120_000, cap * 80 + 60_000);
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
}

function parseHashJson(stdout) {
  const text = String(stdout || '');
  const idx = text.lastIndexOf(HASH_JSON_PREFIX);
  if (idx < 0) return null;
  const line = text.slice(idx + HASH_JSON_PREFIX.length).split(/\r?\n/, 1)[0];
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

async function printRunHashCli(argv) {
  let arenaId = 'helios_core';
  let loadoutId = 'energy_baseline';
  let seed = 4242;
  let tickCap = CRUCIBLE_TICK_CAP;
  for (const a of argv) {
    if (a.startsWith('--arena=')) arenaId = a.slice('--arena='.length);
    else if (a.startsWith('--loadout=')) loadoutId = a.slice('--loadout='.length);
    else if (a.startsWith('--seed=')) seed = Number(a.slice('--seed='.length));
    else if (a.startsWith('--tick-cap=')) tickCap = Number(a.slice('--tick-cap='.length));
  }
  const run = await simulateCrucibleSwarm({ arenaId, loadoutId, seed, tickCap });
  process.stdout.write(`${HASH_JSON_PREFIX}${JSON.stringify({
    runHash: run.runHash,
    ticks: run.ticks,
    stopReason: run.stopReason,
  })}\n`);
}

// ── misc ────────────────────────────────────────────────────────────────────────

function loadoutIdList(requested) {
  if (Array.isArray(requested)) return requested;
  return CRUCIBLE_LOADOUTS.map((l) => l.id);
}

function playerEntity(state) {
  if (!state || state.playerId == null || !state.entities) return null;
  return typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
}

// The knock budget is a FRACTION OF CRUISE, so a missing hull speed makes the fraction
// unmeasurable. Returning a hard-coded 195 would compute every knock against an imaginary
// ship and quietly decide B13 — exactly the class of flattering default this leaf exists to
// remove. Null here propagates to `maxPlayerKnockFraction: null` and a recorded gap.
/**
 * The cruise the CONTACT RULE uses (PQ-137.11 D). `_applyPlayerStructuralGive` budgets a contact
 * at 10 % of `resolveGovernedCombatSpeed(entity, null, fallback)`; a bench that divided by a
 * different number was grading the rule against a denominator the rule had never heard of. Called
 * with the same arguments as the rule, deliberately — `state` is not passed there either.
 */
function cruiseSpeedOf(player) {
  if (!player) return null;
  const fallback = (Number.isFinite(player.combatSpeed) && player.combatSpeed > 0)
    ? player.combatSpeed
    : (Number.isFinite(player.maxSpeed) ? player.maxSpeed : 0);
  const governed = resolveGovernedCombatSpeed(player, null, fallback);
  return Number.isFinite(governed) && governed > 0 ? governed : null;
}

/** The denominator this bench used before PQ-137.11 D, reported once so the change is visible. */
function legacyCruiseSpeedOf(player) {
  const maxSpeed = player && Number.isFinite(player.maxSpeed) ? player.maxSpeed : 0;
  return maxSpeed > 0 ? maxSpeed * CRUISE_FRAC : null;
}

function samplePlayerKinematics(player) {
  if (!player || player.alive === false) return null;
  return {
    rot: finiteOrNull(player.rot),
    wy: finiteOrNull(player.angVel),
    vx: finiteOrNull(player.vel && player.vel.x),
    vz: finiteOrNull(player.vel && player.vel.z),
    x: finiteOrNull(player.pos && player.pos.x),
    z: finiteOrNull(player.pos && player.pos.z),
  };
}

/**
 * One tick of player kinematics, reduced to what B13 needs.
 *
 * `headingWitness` is the contact-sourced pose residual (see WITNESS_FLOOR_PERCENTILE).
 * `courseWitness` is the same idea for the velocity heading: the course after the step compared
 * against the course of `v_before + commanded thrust`, so the pilot's own acceleration is removed
 * and only what CONTACT did to the direction of travel is left.
 * `rawHeadingDelta` is what the retired instrument counted, kept so the receipt can show it.
 * `thrust` is the commanded thrust direction in WORLD space (hull forward is (cos rot, sin rot),
 * measured 2026-09-04; lateral is (-sin rot, cos rot), propulsionKernel.js:917).
 */
function measurePlayerTick({ before, after, telemetry, input, dt }) {
  const row = {
    rawHeadingDelta: null,
    headingWitness: null,
    courseWitness: null,
    rawCourseDelta: null,
    speedBefore: null,
    speedAfter: null,
    thrustX: null,
    thrustZ: null,
    yawRate: null,
    angVel: null,
    spinInjected: null,
    spinCommanded: null,
  };
  if (!before || !after) return row;
  if (Number.isFinite(before.rot) && Number.isFinite(after.rot)) {
    row.rawHeadingDelta = wrapAngle(after.rot - before.rot);
    row.yawRate = row.rawHeadingDelta / dt;
    if (Number.isFinite(after.wy)) {
      row.headingWitness = wrapAngle(row.rawHeadingDelta - after.wy * dt);
      row.angVel = after.wy;
    }
  }
  const mass = finiteOrZero(telemetry && telemetry.mass);
  const force = telemetry && telemetry.force;
  // Where the player's spin came from this tick. `e.wy` in the give rule is
  // (previous angvel + controlTorque/I*dt), so the part of the change the control torque does NOT
  // account for was INJECTED into the body between steps — an angular impulse (a weapon hit at a
  // point, a rope, a charge), not the pilot steering.
  const inertiaY = finiteOrZero(telemetry && telemetry.inertiaY);
  const torqueY = telemetry
    ? finiteOrZero(telemetry.torque && telemetry.torque.y !== undefined
      ? telemetry.torque.y
      : telemetry.torque)
    : 0;
  if (Number.isFinite(before.wy) && Number.isFinite(after.wy)) {
    row.spinCommanded = inertiaY > 0 ? torqueY / inertiaY * dt : 0;
    row.spinInjected = (after.wy - before.wy) - row.spinCommanded;
  }
  const cmdX = mass > 0 && force ? finiteOrZero(force.x) / mass * dt : 0;
  const cmdZ = mass > 0 && force ? finiteOrZero(force.z) / mass * dt : 0;
  if (Number.isFinite(before.vx) && Number.isFinite(before.vz)
    && Number.isFinite(after.vx) && Number.isFinite(after.vz)) {
    const ex = before.vx + cmdX;
    const ez = before.vz + cmdZ;
    row.speedBefore = Math.hypot(before.vx, before.vz);
    row.speedAfter = Math.hypot(after.vx, after.vz);
    const expectedSpeed = Math.hypot(ex, ez);
    if (expectedSpeed > COURSE_MEASURABLE_SPEED && row.speedAfter > COURSE_MEASURABLE_SPEED) {
      row.courseWitness = wrapAngle(Math.atan2(after.vz, after.vx) - Math.atan2(ez, ex));
    }
    if (row.speedBefore > COURSE_MEASURABLE_SPEED && row.speedAfter > COURSE_MEASURABLE_SPEED) {
      row.rawCourseDelta = wrapAngle(
        Math.atan2(after.vz, after.vx) - Math.atan2(before.vz, before.vx),
      );
    }
  }
  const rot = Number.isFinite(before.rot) ? before.rot : null;
  if (rot !== null && input) {
    const forward = finiteOrZero(input.moveZ);
    const strafe = finiteOrZero(input.moveX);
    row.thrustX = forward * Math.cos(rot) + strafe * -Math.sin(rot);
    row.thrustZ = forward * Math.sin(rot) + strafe * Math.cos(rot);
  }
  return row;
}

function percentileOf(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

/**
 * The floor the witness must clear, measured on the SAME run from ticks with no player contact
 * receipt. A typed epsilon would be a claim about float arithmetic; this is a measurement of it,
 * and it is the only thing that keeps a rope cell (whose yaw is quantized by
 * `_canonicalizeManualSpringBody`) from reading its own quantization as a contact.
 */
function measureWitnessFloors(playerTickByTick, receiptTicks) {
  const heading = [];
  const course = [];
  for (const [tick, row] of playerTickByTick) {
    if (receiptTicks.has(tick)) continue;
    if (Number.isFinite(row.headingWitness)) heading.push(Math.abs(row.headingWitness));
    if (Number.isFinite(row.courseWitness)) course.push(Math.abs(row.courseWitness));
  }
  return {
    headingFloorRad: percentileOf(heading, WITNESS_FLOOR_PERCENTILE),
    courseFloorRad: percentileOf(course, WITNESS_FLOOR_PERCENTILE),
    headingFloorSamples: heading.length,
    courseFloorSamples: course.length,
  };
}

function directionFromPlayerToOther(state, playerId, otherId) {
  if (otherId == null || playerId == null) return null;
  if (!state || !state.entities || typeof state.entities.get !== 'function') return null;
  const player = state.entities.get(playerId);
  const other = state.entities.get(otherId);
  if (!player || !other || !player.pos || !other.pos) return null;
  const dx = finiteOrZero(other.pos.x) - finiteOrZero(player.pos.x);
  const dz = finiteOrZero(other.pos.z) - finiteOrZero(player.pos.z);
  const len = Math.hypot(dx, dz);
  if (!(len > 1e-6)) return null;
  return { x: dx / len, z: dz / len };
}

function isLiveCohortHostile(state, actorId, playerId) {
  if (actorId == null || actorId === playerId) return false;
  if (!state || !state.entities || typeof state.entities.get !== 'function') return false;
  const entity = state.entities.get(actorId);
  if (!entity || entity.alive === false) return false;
  return !!(entity.data && entity.data.runCohort === SURVIVAL_COHORT_TAG);
}

function countKills(eventTrace) {
  let n = 0;
  for (const ev of eventTrace) {
    if (ev.type === 'entity:killed' && ev.data && ev.data.cause !== 'player') n += 1;
  }
  return n;
}

function countBusEvents(log, name) {
  let n = 0;
  for (const ev of log) if (ev.ev === name) n += 1;
  return n;
}

function uniqueEventNames(log) {
  const names = [];
  const seen = new Set();
  for (const ev of log) {
    const name = String(ev.ev || '');
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  names.sort();
  return names;
}

function freezeCopy(value) {
  if (!Array.isArray(value)) return [];
  return value.slice();
}

function finiteOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/** Null stays null: an unmeasured dot must not round to a confident 0. */
function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function wallNow() {
  try { return Date.now(); } catch { return null; }
}

function elapsedMs(startedAt) {
  if (startedAt == null) return null;
  try { return Date.now() - startedAt; } catch { return null; }
}

function avgMs(runs) {
  let sum = 0;
  let n = 0;
  for (const r of runs) {
    if (Number.isFinite(r.wallMs)) { sum += r.wallMs; n += 1; }
  }
  return n ? Math.round(sum / n) : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly && process.argv.includes('--print-run-hash')) {
  printRunHashCli(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
