// Deterministic massline physics-control laboratory (PQ-002 / SF-02, roadmap T01+T05 prep).
//
// WHAT THIS IS
// A reusable, headless, fixed-step harness that spawns a real player craft + a real anchor + a real
// SG-02 tether, replays a scripted input timeline, drives the REAL registered systems
// (flightV3 + physics authority + tetherGameplay + masslineTelemetry), and emits a semantic trace
// (radius error, tangential fraction, tension, radial rate) plus derived acceptance metrics
// (settle time, oscillation count, divergence/break). It supports a grid-search sweep over
// controller gains × environment, and an acceptance-matrix runner whose digest a tuning change moves.
//
// It exists so orbit/pursuit/release control constants (PQ-003..PQ-007) are tuned by measured
// acceptance matrices instead of one-shot guessing.
//
// THE CONTROLLER SEAM (the reason this file is pluggable)
// The lab inserts ONE lab-owned system (`masslineLabController`) into its own systems list, placed
// immediately AFTER the flight slot and BEFORE physics — the exact command membrane flightV3 writes
// to (src/core/physicsAuthority.js). Each tick it observes the swing via the T01 telemetry kernel
// (observeMasslineOrbit), hands that observation to a pluggable `controller(observation, ctx)`, then
// applies the returned bounded command through `queuePhysicsImpulse` / `queuePhysicsTorqueImpulse`.
//
// Those queue functions ACCUMULATE (they push onto an array) rather than REPLACE — unlike
// writePhysicsControl, which flightV3 uses to set force/torque and which a later writer would clobber.
// So a lab controller adds a corrective impulse ON TOP of flightV3's control without ever
// overwriting the production flight command. The baseline controller is a no-op (null command), so
// the baseline matrix measures the CURRENT tether behavior verbatim. PQ-005's production acceptance
// mode keeps that lab controller disabled and instead publishes the real Massline input packet; its
// correction can therefore originate only in Flight V3's shipped orbit-assist path. See findings in
// the packet receipt: this impulse-accumulate-vs-control-replace choice is the load-bearing seam.
//
// DETERMINISM
// Seed flows only through createGameState(seed) → state.rng. No wall-clock, no Math.random, no
// unseeded entropy anywhere in lab logic. The SG-02 rapier authority is deterministic given the same
// seed + inputs + fixed dt (proven by check:sim:v3 / check:sim:v3:compare). Traces are rounded to
// 1e-6 (the repo snapshot convention) and hashed; a double run is byte-identical.
//
// FAIL-CLOSED
// A controller command with any non-finite component is dropped whole (never injected); a finite
// command is clamped to LAB_DEFAULTS.maxImpulse / maxTorqueImpulse before injection. A detuned
// controller can still destabilise within those bounds — that is the point of the failure-case test —
// but it can never inject NaN/Infinity into the physics authority.

import { createHash } from 'node:crypto';

import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import { canonicalStringify } from '../../src/core/simSnapshot.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../../src/core/physicsAuthority.js';
import { observeMasslineOrbit } from '../../src/combat/masslineOrbitTelemetry.js';
import {
  PURSUIT_SLOT_TUNING_V1,
  stepPursuitSlotAssist,
} from '../../src/core/flight/pursuitSlotAssist.js';
import { actions } from '../../src/systems/actions.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { weapons } from '../../src/systems/weapons.js';
import { physics } from '../../src/core/physics.js';
import { combat } from '../../src/systems/combat.js';
import { tetherGameplay } from '../../src/systems/tetherGameplay.js';
import { masslineTelemetry } from '../../src/systems/masslineTelemetry.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../src/systems/ships.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';

export { SIM_DT };

export const DEFAULT_SEED = 47;
export const TETHER_DEF_ID = 'tether_standard';

// Named lab tuning. None of these were chosen to "feel fun": they are the measurement instrument's
// own bounds and thresholds, characterised by the property tests, not gameplay constants.
export const LAB_DEFAULTS = Object.freeze({
  ticks: 240,                    // 4 s at 60 Hz — long enough for the swing to develop and settle
  // Injection bounds mirror the standard Massline's 10× physical envelope. The lab still reports
  // divergence independently; ordinary control load is not classified as a snapped line.
  maxImpulse: 190000,
  maxTorqueImpulse: 8000,
  // Radial-settle definition: |radialSpeed| at/under settleBandRadialSpeed for the rest of the run.
  settleBandRadialSpeed: 3,
  // Oscillation budget for a PASS (radialSpeed sign changes over the run). Baseline wobble passes;
  // a controller that whips the swing without diverging fails here rather than only on divergence.
  oscBudget: 40,
  // Divergence detector: a stable swing keeps distance within divergenceFactor × the initial line.
  divergenceFactor: 6,
  // tether_standard physical-envelope denominator for strain telemetry.
  breakTension: 10500000,
  // observeMasslineOrbit spring model: mirrors tether_standard break.stiffness / break.maxTension so
  // the trace's `tension` is the same one-sided-spring read the live tether uses for strain.
  observeStiffness: 90,
  observeBreakTension: 10500000,
});

// -------------------------------------------------------------------------------------------------
// Controller factories. A controller is `(observation, ctx) => command | null`, where
//   observation = observeMasslineOrbit(host, anchor, {...})  (the T01 telemetry kernel result)
//   ctx         = { dt, host, target, tick, simTime, restLength, restLength0 }
//   command     = { x, z, torque? }  — a world-space linear impulse (momentum units) + optional
//                 y-axis angular impulse, OR null for "inject nothing this tick".
// The seam clamps/validates; a factory never has to.
// -------------------------------------------------------------------------------------------------

/** The baseline: inject nothing. The matrix built on this measures CURRENT tether behavior. */
export const BASELINE_CONTROLLER = null;

/**
 * Reference orbit-radius PD controller — the seam demonstration and the "good tuning" test subject.
 * This is NOT the T05 controller (that packet owns the real design); it proves the seam accepts a
 * radial-damping controller and that the matrix rewards good gains. Command pulls the host toward a
 * target radius Ts and damps radial velocity:
 *   impulse = (-Kr·(distance - Ts) - Kd·radialSpeed) · hostMass · lineUnit
 * lineUnit points host→target, so a positive scalar pulls the host toward the anchor.
 */
export function makePdRadialController({ Kr = 0, Kd = 0.6, Ts = null } = {}) {
  return function pdRadial(obs, ctx) {
    if (!obs || obs.ok !== true) return null;
    const target = Number.isFinite(Ts) ? Ts : ctx.restLength;
    const scalar = (-Kr * (obs.distance - target) - Kd * obs.radialSpeed) * (ctx.host.mass || 1);
    return { x: scalar * obs.lineUnit.x, z: scalar * obs.lineUnit.z };
  };
}

/**
 * Deliberately detuned controller: positive radial feedback (anti-damping). It pumps energy into the
 * radial mode instead of removing it, so the swing grows until the line breaks / the craft diverges.
 * Used by the acceptance-matrix failure case to prove the matrix discriminates good from bad tuning.
 */
export function makeDetunedController({ Kd = 3 } = {}) {
  return function detuned(obs, ctx) {
    if (!obs || obs.ok !== true) return null;
    const scalar = +Kd * obs.radialSpeed * (ctx.host.mass || 1);
    return { x: scalar * obs.lineUnit.x, z: scalar * obs.lineUnit.z };
  };
}

// -------------------------------------------------------------------------------------------------
// The seam system.
// -------------------------------------------------------------------------------------------------

/**
 * Build the lab controller system. It reads its wiring + the active controller from `state._lab`
 * (set by runScenario after the attachment exists), so the same frozen system definition serves any
 * controller. Runs after flightV3, before physics — same membrane, additive impulse.
 */
export function createLabControllerSystem() {
  return {
    name: 'masslineLabController',
    init(ctx) { this.state = ctx.state; },
    update(dt, state) {
      const lab = state._lab;
      if (!lab) return;
      lab.lastCommand = null;
      if (typeof lab.controller !== 'function') return;
      const host = state.entities.get(lab.hostId);
      const target = state.entities.get(lab.anchorId);
      if (!host || !target || !host.pos || !target.pos) return;
      const att = lab.kernel.attachments.get(lab.attachmentId);
      const restLength = att && att.state === 'active'
        ? finite(att.restLength, lab.restLength0)
        : lab.restLength0;
      const obs = observeMasslineOrbit(host, target, {
        restLength,
        hostMass: host.mass,
        targetMass: target.mass,
        lineStiffness: LAB_DEFAULTS.observeStiffness,
        breakTension: LAB_DEFAULTS.observeBreakTension,
      });
      const raw = lab.controller(obs, {
        dt,
        host,
        target,
        tick: state.tick | 0,
        simTime: finite(state.simTime, 0),
        restLength,
        restLength0: lab.restLength0,
      });
      const command = sanitizeCommand(raw);
      lab.lastCommand = command;
      if (!command || command.rejected) return;
      if (command.x !== 0 || command.z !== 0) {
        queuePhysicsImpulse(host, { x: command.x, y: 0, z: command.z });
      }
      if (command.torque !== 0) {
        queuePhysicsTorqueImpulse(host, { x: 0, y: command.torque, z: 0 });
      }
    },
  };
}

/**
 * Fail-closed + clamp a controller command. Non-finite anywhere → the whole command is dropped
 * (rejected:true, no injection); a finite command is clamped to the linear/angular bounds.
 */
export function sanitizeCommand(raw) {
  if (raw == null) return null;
  // A missing axis is a legitimate 0 (inject nothing on that axis); a present-but-non-finite axis
  // fails the WHOLE command closed. Distinguishing the two keeps { x: 5 } valid and { x: NaN } rejected.
  let x = raw.x === undefined ? 0 : Number(raw.x);
  let z = raw.z === undefined ? 0 : Number(raw.z);
  let torque = raw.torque === undefined ? 0 : Number(raw.torque);
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(torque)) {
    return { x: 0, z: 0, torque: 0, clamped: false, rejected: true };
  }
  let clamped = false;
  const mag = Math.hypot(x, z);
  if (mag > LAB_DEFAULTS.maxImpulse) {
    const scale = LAB_DEFAULTS.maxImpulse / mag;
    x *= scale; z *= scale; clamped = true;
  }
  if (Math.abs(torque) > LAB_DEFAULTS.maxTorqueImpulse) {
    torque = Math.sign(torque) * LAB_DEFAULTS.maxTorqueImpulse; clamped = true;
  }
  return { x, z, torque, clamped, rejected: false };
}

// -------------------------------------------------------------------------------------------------
// Scenario runner.
// -------------------------------------------------------------------------------------------------

/**
 * Resolve the scripted input for a tick. The default timeline is a sustained forward throttle (the
 * craft flies against the anchored tether, curving into a swing) plus a mid-run reel-in pulse (the
 * classic massline pump). Callers may pass an explicit `frames` array instead.
 */
export function resolveInput(scenario, tick) {
  if (Array.isArray(scenario.frames) && scenario.frames.length) {
    let current = scenario.frames[0].input || {};
    for (const frame of scenario.frames) {
      if (frame.tick <= tick) current = frame.input || {};
      else break;
    }
    return current;
  }
  const throttle = Number.isFinite(scenario.throttle) ? scenario.throttle : 1;
  const window = Array.isArray(scenario.reelWindow) ? scenario.reelWindow : [];
  const reeling = window.length === 2 && tick >= window[0] && tick < window[1];
  return { moveX: 0, moveZ: throttle, turnIntent: 0, boost: !!scenario.boost, reelDelta: reeling ? -1 : 0 };
}

/**
 * Run one scenario to completion. Drives the real registered systems under rapier-dynamic + V3.
 *
 * @returns {Promise<{params, trace, metrics, traceHash, live}>}
 */
export async function runScenario(options = {}) {
  const params = normalizeScenario(options);
  const controller = options.controller || null;

  const sim = createSimulation({
    seed: params.seed,
    systems: [actions, flightV3, createLabControllerSystem(), weapons, physics, combat, tetherGameplay, masslineTelemetry],
  });
  const { state, registry, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'legacy';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = 5000;

  let tetherAttachedCount = 0;
  bus.on('tether:attached', () => { tetherAttachedCount++; });
  let tetherBrokenCount = 0;
  bus.on('tether:broken', () => { tetherBrokenCount++; });
  bus.on('tether:broke', () => { tetherBrokenCount++; });

  // Rotation θ is applied as a rigid rotation of the whole scenario (anchor placement, craft facing,
  // entry velocity). observeMasslineOrbit's scalar reads are rotation-invariant, so the semantic
  // trace is (up to rapier's non-bit-invariance) the same swing. Used by the sweep for coverage and
  // available to callers; the property-test rotational-symmetry proof runs at the observation layer.
  const c = Math.cos(params.rotation);
  const s = Math.sin(params.rotation);
  const rot = (x, z) => ({ x: x * c - z * s, z: x * s + z * c });

  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 },
    rot: params.rotation + Math.PI / 2,   // face the tangent of the initial (rotated) line
  }));
  state.playerId = player.id;

  const anchorPos = rot(params.lineLength, 0);
  const anchor = sim.spawn({
    type: 'payload',
    team: 2,
    pos: { x: anchorPos.x, z: anchorPos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    mass: params.anchorMass,
    collides: true,
    // Authored dynamic body so the anchor is a real finite mass in the SG-02 two-body exchange.
    // Payload type keeps flightV3 out of it (it only steps ship/drone), so no assisted governor
    // brakes the anchor — it is a pure passive mass, exactly what the anchor-mass sweep axis needs.
    physicsBody: {
      schemaVersion: 1, radius: 6, mass: params.anchorMass, inertiaY: params.anchorMass * 8,
      dynamic: true, ccd: false, material: 'payload', revision: 0,
    },
    data: { scenarioRole: 'lab_anchor' },
  });

  // Seed entry velocity BEFORE Rapier body creation. Assigning entity.vel after prepareBackend only
  // changed the mirror, not the authority-owned body, and made the historical speed axis vacuous.
  const entryVel = rot(0, params.entrySpeed);
  player.vel.x = entryVel.x;
  player.vel.z = entryVel.z;

  const physicsSys = registry.get('physics');
  const ready = await physicsSys.prepareBackend(state, {});
  const sg02Ready = !!(state.physicsRuntime && state.physicsRuntime.diagnostics && state.physicsRuntime.diagnostics.sg02Ready);
  if (ready !== true || !sg02Ready) {
    disposeSim(sim, physicsSys);
    throw new Error('massline-control-lab: SG-02 dynamic authority failed to become ready before ticking');
  }

  const kernel = registry.get('actions').kernel;
  if (!kernel || !kernel.attachments) {
    disposeSim(sim, physicsSys);
    throw new Error('massline-control-lab: combat kernel / attachment authority unavailable');
  }
  const created = kernel.attachments.create({
    defId: TETHER_DEF_ID,
    ownerId: player.id,
    targetId: anchor.id,
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld: { x: anchor.pos.x, y: 0, z: anchor.pos.z },
  });
  if (!created || !created.ok || !created.attachment) {
    disposeSim(sim, physicsSys);
    throw new Error(`massline-control-lab: attachment create failed (${created && created.reason})`);
  }
  const restLength0 = finite(created.attachment.restLength, params.lineLength);

  state._lab = {
    hostId: player.id,
    anchorId: anchor.id,
    kernel,
    attachmentId: created.attachment.id,
    restLength0,
    controller,
    lastCommand: null,
  };
  if (params.productionOrbitAssist) {
    state.settings.gameplay.orbitAssistStrength = 'standard';
    state.player.tether = {
      ...(state.player.tether || {}),
      active: true,
      targetId: anchor.id,
      strain: 0.65,
      load: 0.65,
      attachmentId: created.attachment.id,
      restLength: restLength0,
      phase: 'loaded',
    };
  }

  state.input.actions = state.input.actions || {};

  const trace = [];
  for (let tick = 0; tick < params.ticks; tick++) {
    const input = resolveInput(params, tick);
    state.input.moveX = finite(input.moveX, 0);
    state.input.moveZ = params.productionOrbitAssist ? 0 : finite(input.moveZ, 0);
    state.input.turnIntent = finite(input.turnIntent, 0);
    state.input.boost = !!input.boost;
    state.input.aimAngle = player.rot;
    state.input.actions.reelDelta = params.productionOrbitAssist ? 0 : finite(input.reelDelta, 0);
    if (params.productionOrbitAssist) {
      // Match the public input grammar's brief forward-hold acquisition without spending the
      // acceptance run reeling a 90 m line down to an unrelated overload case.
      const acquiring = tick < 12;
      state.input.actions.massline = {
        phase: 'line-control',
        latch: false,
        cut: false,
        lineControl: true,
        lineLength: acquiring ? -1 : 0,
        reelIn: acquiring ? 1 : 0,
        payOut: 0,
        orbitDirection: 1,
        pump: false,
        buffered: false,
        source: 'lab-public-intent',
      };
      state.input.actions.throwArm = false;
    }

    sim.step(SIM_DT);

    const host = state.entities.get(player.id);
    const tgt = state.entities.get(anchor.id);
    const att = kernel.attachments.get(created.attachment.id);
    const restLength = att && att.state === 'active' ? finite(att.restLength, restLength0) : restLength0;
    const obs = observeMasslineOrbit(host, tgt, {
      restLength,
      hostMass: host && host.mass,
      targetMass: tgt && tgt.mass,
      lineStiffness: LAB_DEFAULTS.observeStiffness,
      breakTension: LAB_DEFAULTS.observeBreakTension,
    });
    const mt = state.player.masslineTelemetry || {};
    trace.push(makeTraceSample(tick, obs, restLength, {
      command: state._lab.lastCommand,
      tetherActive: !!(state.player.tether && state.player.tether.active),
      mt,
      orbitAssist: host && host._flightFrame && host._flightFrame.orbitAssist,
      attachmentActive: !!(att && att.state === 'active'),
    }));
  }

  const attFinal = kernel.attachments.get(created.attachment.id);
  const metrics = computeMetrics(trace, { restLength0, attachmentActiveAtEnd: !!(attFinal && attFinal.state === 'active') });
  const live = {
    sg02Ready,
    tetherAttachedCount,
    tetherBrokenCount,
    systems: registry.systems.map((sys) => sys.name),
    attachmentActiveAtEnd: !!(attFinal && attFinal.state === 'active'),
    contactDistance: positive(player.radius, 0) + positive(anchor.radius, 0),
  };
  const traceHash = hashTrace(trace);

  disposeSim(sim, physicsSys);
  return { params, trace, metrics, traceHash, live };
}

/** Dispose the bus AND the SG-02 rapier world (sim.dispose only clears the bus — the WASM world leaks
 *  otherwise, and a sweep would exhaust it). */
function disposeSim(sim, physicsSys) {
  try { sim.dispose(); } catch (_) { /* bus clear is best-effort */ }
  if (physicsSys && typeof physicsSys._disableSg02DynamicAuthority === 'function') {
    try { physicsSys._disableSg02DynamicAuthority(); } catch (_) { /* owner dispose best-effort */ }
  }
}

// -------------------------------------------------------------------------------------------------
// Metrics + acceptance.
// -------------------------------------------------------------------------------------------------

/**
 * Derive acceptance metrics from a trace. Pure over the trace (reused by the observation-layer
 * rotational-symmetry test, which feeds it a synthetic trace with no rapier involved).
 *
 * pass = stable (attachment active and not diverged) AND within the oscillation budget. Both criteria are
 * independent discriminators: a detuned controller fails on divergence; a merely-jittery controller
 * fails on oscillations. Baseline current behavior passes.
 */
export function computeMetrics(trace, { restLength0 = 0, attachmentActiveAtEnd = true } = {}) {
  const n = trace.length;
  let maxDistance = 0;
  let maxTension = 0;
  let maxRadiusError = 0;
  let tangentSum = 0;
  let oscillations = 0;
  let anyRejected = false;
  let anyClamped = false;
  let prevRadialSign = 0;
  let lastUnsettledIndex = -1;
  const band = LAB_DEFAULTS.settleBandRadialSpeed;

  for (let i = 0; i < n; i++) {
    const sample = trace[i];
    maxDistance = Math.max(maxDistance, Math.abs(sample.distance));
    maxTension = Math.max(maxTension, Math.abs(sample.tension));
    maxRadiusError = Math.max(maxRadiusError, Math.abs(sample.radiusError));
    tangentSum += sample.tangentFraction;
    if (sample.cmdRejected) anyRejected = true;
    if (sample.cmdClamped) anyClamped = true;
    const rs = sample.radialSpeed;
    const sign = rs > 0 ? 1 : rs < 0 ? -1 : 0;
    if (sign !== 0) {
      if (prevRadialSign !== 0 && sign !== prevRadialSign) oscillations++;
      prevRadialSign = sign;
    }
    if (Math.abs(rs) > band) lastUnsettledIndex = i;
  }

  // settleTick: first tick from which |radialSpeed| stays within the band to the end. null if the
  // final sample is still outside the band (never settled).
  let settleTick = null;
  if (n > 0 && lastUnsettledIndex < n - 1) {
    settleTick = trace[lastUnsettledIndex + 1].tick;
  }

  const divergenceBound = Math.max(1, restLength0) * LAB_DEFAULTS.divergenceFactor;
  const diverged = maxDistance > divergenceBound;
  // `broke` is a lifecycle fact, never inferred from a force sample. The normal standard Massline
  // has no automatic load-break path; a high value remains useful telemetry but is not a severing
  // receipt. Divergence stays an independent controller-instability failure.
  const broke = !attachmentActiveAtEnd;
  const meanTangentFraction = n > 0 ? tangentSum / n : 0;
  const finalRadiusError = n > 0 ? trace[n - 1].radiusError : 0;
  const pass = !broke && !diverged && oscillations <= LAB_DEFAULTS.oscBudget;

  return {
    ticks: n,
    settleTick,
    oscillations,
    maxRadiusError: round6(maxRadiusError),
    finalRadiusError: round6(finalRadiusError),
    maxTension: round6(maxTension),
    maxDistance: round6(maxDistance),
    meanTangentFraction: round6(meanTangentFraction),
    diverged,
    broke,
    commandRejected: anyRejected,
    commandClamped: anyClamped,
    pass,
  };
}

/**
 * Build one canonical trace sample from a T01 observation. Shared by runScenario and the
 * observation-layer rotational-symmetry property test so both exercise the identical metric surface.
 * radiusError = distance - restLength is the signed line-length error (the "radius error" trace field);
 * tangentFraction is observeMasslineOrbit's tangentQuality (the "tangential fraction").
 */
export function makeTraceSample(tick, obs, restLength, opts = {}) {
  const cmd = opts.command || null;
  const mt = opts.mt || {};
  return {
    tick: tick | 0,
    distance: round6(obs.distance),
    restLength: round6(restLength),
    radiusError: round6(obs.distance - restLength),
    radialSpeed: round6(obs.radialSpeed),
    tangentialSpeed: round6(obs.tangentialSpeed),
    tangentFraction: round6(obs.tangentQuality),
    tension: round6(obs.tension),
    loadBand: obs.loadBand,
    angularSpeed: round6(obs.angularSpeed),
    // Evidence the live registered systems ran this tick (not a kinematic fake):
    tetherActive: !!opts.tetherActive,
    mtActive: !!mt.active,
    mtPhase: mt.phase || null,
    mtStrain: round6(finite(mt.strain, 0)),
    // Injected command (rounded); rejected/clamped flags characterise the fail-closed path.
    cmdX: round6(cmd ? cmd.x : 0),
    cmdZ: round6(cmd ? cmd.z : 0),
    cmdRejected: !!(cmd && cmd.rejected),
    cmdClamped: !!(cmd && cmd.clamped),
    orbitAssistActive: !!(opts.orbitAssist && opts.orbitAssist.active),
    orbitAssistReason: opts.orbitAssist && opts.orbitAssist.reason || null,
    orbitRadialAcceleration: round6(finite(opts.orbitAssist && opts.orbitAssist.radialAcceleration, 0)),
    orbitSaturated: !!(opts.orbitAssist && opts.orbitAssist.saturated),
    attachmentActive: opts.attachmentActive !== false,
  };
}

export function hashTrace(trace) {
  return sha256(canonicalStringify(trace));
}

/** Hash only the tuning-relevant surface (params + metrics + pass). NO timing/wall-clock enters the
 *  digest, so `--matrix` twice is byte-identical while a tuning change moves it. */
export function hashMatrix(rows) {
  return sha256(canonicalStringify(rows.map((row) => ({ params: row.params, metrics: row.metrics, pass: row.pass }))));
}

// -------------------------------------------------------------------------------------------------
// Sweep + acceptance matrix.
// -------------------------------------------------------------------------------------------------

/** The canonical acceptance scenario set (stable order). Kept small so `--matrix` disposes few
 *  rapier worlds; each is a distinct (line length, anchor mass, entry speed) point. */
export function defaultScenarios() {
  return [
    { id: 'orbit_mid', lineLength: 120, anchorMass: 400, entrySpeed: 30, throttle: 1, reelWindow: [60, 160] },
    { id: 'orbit_short_light', lineLength: 90, anchorMass: 200, entrySpeed: 40, throttle: 1, reelWindow: [50, 150] },
    { id: 'orbit_long_heavy', lineLength: 160, anchorMass: 800, entrySpeed: 24, throttle: 1, reelWindow: [50, 150] },
  ];
}

/** Default sweep grid: controller gains (Kr, Kd, Ts) × environment (line length, anchor mass, speed).
 *  Varies four axes (Kr, Kd, line length, anchor mass) = 2×2×2×2 = 16 cells; Ts and speed are held
 *  so the default stays bounded (each cell allocates + disposes one SG-02 rapier world in-process).
 *  anchorMass spans a LIGHT anchor (near the ~40 kestrel mass → the anchor actually gets yanked, so
 *  reduced mass and settle time move) and a HEAVY near-fixed anchor, so the axis visibly bites.
 *  sweep() honours all six axes — widen any of them for a deeper search. */
export function defaultSweepGrid() {
  return {
    Kr: [0, 4],
    Kd: [0.3, 0.8],
    Ts: [null],
    lineLength: [100, 150],
    anchorMass: [60, 700],
    entrySpeed: [30],
  };
}

/**
 * Acceptance-matrix runner. Runs each scenario with the given controller (default: BASELINE — the
 * current tether behavior), classifies pass/fail, returns a stable-ordered matrix + a wall-clock-free
 * digest. A tuning change (different controller / gains) moves the digest — that delta is the receipt.
 *
 * @param {{seed?, ticks?, controllerFactory?, controllerLabel?, scenarios?}} options
 */
export async function acceptanceMatrix(options = {}) {
  const seed = Number.isFinite(options.seed) ? options.seed : DEFAULT_SEED;
  const ticks = Number.isFinite(options.ticks) ? options.ticks : LAB_DEFAULTS.ticks;
  const scenarios = options.scenarios || defaultScenarios();
  const controllerFactory = options.controllerFactory || null;
  const controllerLabel = options.controllerLabel || (controllerFactory ? 'controller' : 'baseline');

  const rows = [];
  for (const scenario of scenarios) {
    const controller = controllerFactory ? controllerFactory(scenario) : BASELINE_CONTROLLER;
    const result = await runScenario({ ...scenario, seed, ticks, controller });
    rows.push({
      id: scenario.id,
      params: sortedParams({
        seed, ticks, controller: controllerLabel,
        lineLength: scenario.lineLength, anchorMass: scenario.anchorMass,
        entrySpeed: scenario.entrySpeed, throttle: scenario.throttle ?? 1,
      }),
      metrics: result.metrics,
      pass: result.metrics.pass,
      live: result.live,
    });
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const passCount = rows.filter((r) => r.pass).length;
  return {
    schema: 'spaceface.masslineControlLab.acceptanceMatrix.v1',
    deterministic: true,
    seed,
    ticks,
    controller: controllerLabel,
    rows,
    summary: { total: rows.length, pass: passCount, fail: rows.length - passCount },
    digest: hashMatrix(rows),
  };
}

/** PQ-005 production acceptance: 3 line lengths x 3 entry speeds x 3 qualifying anchor masses.
 * Every cell runs ten fixed-step seconds with the lab controller disabled, so correction can only
 * originate in the live Flight V3 orbit-assist path. */
export async function orbitAssistAcceptanceMatrix(options = {}) {
  const seed = Number.isFinite(options.seed) ? options.seed : DEFAULT_SEED;
  const ticks = 600;
  const lineLengths = options.lineLengths || [90, 120, 160];
  const entrySpeeds = options.entrySpeeds || [0, 30, 60];
  const anchorMasses = options.anchorMasses || [2500, 5000, 10000];
  const rows = [];

  for (const lineLength of lineLengths) {
    for (const entrySpeed of entrySpeeds) {
      for (const anchorMass of anchorMasses) {
        const result = await runScenario({
          seed,
          ticks,
          lineLength,
          entrySpeed,
          anchorMass,
          productionOrbitAssist: true,
          controller: BASELINE_CONTROLLER,
          reelWindow: [],
        });
        const metrics = productionOrbitMetrics(result.trace, result.live.contactDistance);
        rows.push({
          id: `L${lineLength}-V${entrySpeed}-M${anchorMass}`,
          params: sortedParams({ seed, ticks, lineLength, entrySpeed, anchorMass }),
          metrics,
          pass: metrics.pass,
          live: result.live,
        });
      }
    }
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const passCount = rows.filter((row) => row.pass).length;
  return {
    schema: 'spaceface.masslineControlLab.orbitAssistMatrix.v1',
    deterministic: true,
    seed,
    rows,
    summary: { total: rows.length, pass: passCount, fail: rows.length - passCount },
    digest: hashMatrix(rows),
  };
}

/** PQ-007 production tuning matrix. The weaving target is analytical and the host integrates the
 * exact additive impulse returned by the shipped pure controller at the fixed 60 Hz simulation
 * cadence. This keeps the gain sweep deterministic and isolates controller quality from Rapier's
 * low-bit rotation drift while exercising the same momentum command the live physics membrane sees. */
export function pursuitSlotAcceptanceMatrix(options = {}) {
  const settleTimes = options.settleTimes || [0.8, 1, 1.2];
  const authorityFractions = options.authorityFractions || [0.42, 0.5];
  const rows = [];
  for (const settleTimeS of settleTimes) {
    for (const maxAccelerationFraction of authorityFractions) {
      const tuning = {
        ...PURSUIT_SLOT_TUNING_V1,
        settleTimeS,
        maxAccelerationFraction,
      };
      const metrics = runPursuitSlotKillCriterion(tuning);
      const selected = settleTimeS === PURSUIT_SLOT_TUNING_V1.settleTimeS
        && maxAccelerationFraction === PURSUIT_SLOT_TUNING_V1.maxAccelerationFraction;
      rows.push({
        id: `Ts${settleTimeS.toFixed(1)}-A${maxAccelerationFraction.toFixed(2)}`,
        params: sortedParams({ settleTimeS, maxAccelerationFraction }),
        selected,
        metrics,
        pass: metrics.pass,
      });
    }
  }
  rows.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const passCount = rows.filter((row) => row.pass).length;
  return {
    schema: 'spaceface.masslineControlLab.pursuitSlotMatrix.v1',
    deterministic: true,
    target: 'weaving-target',
    rows,
    summary: { total: rows.length, pass: passCount, fail: rows.length - passCount },
    digest: hashMatrix(rows),
  };
}

function runPursuitSlotKillCriterion(tuning) {
  const dt = SIM_DT;
  const mass = 150;
  const profile = { mainAccel: 84, strafeAccel: 46 };
  const transitionTick = 120;
  const ticks = 1020;
  const initialSlot = { active: true, targetId: 2, bearing: Math.PI, range: 220, source: 'lab' };
  // One decisive but bounded trackpad nudge: about 11.5 degrees around the target and +15 wu range.
  // Larger repositioning remains expressible through successive nudges; the assist is not allowed
  // to buy autopilot-class authority merely to teleport across half an orbit in 2.5 seconds.
  const transitionSlot = { ...initialSlot, bearing: Math.PI - 0.2, range: 235 };
  const target0 = pursuitLabTarget(0);
  const desired0 = pursuitDesiredPoint(target0, initialSlot);
  const host = { pos: { ...desired0 }, vel: pursuitDesiredVelocity(target0, initialSlot), mass };
  let longestToleranceTicks = 0;
  let toleranceTicks = 0;
  let firstSettledTick = null;
  let spinCount = 0;
  let overshootCount = 0;
  let previousVelocityHeading = Math.atan2(host.vel.z, host.vel.x);
  let previousProjectionSign = 0;
  let transitionAxis = null;

  for (let tick = 0; tick < ticks; tick++) {
    const target = pursuitLabTarget(tick * dt);
    const slot = tick < transitionTick ? initialSlot : transitionSlot;
    if (tick === transitionTick) {
      const desired = pursuitDesiredPoint(target, slot);
      const dx = desired.x - host.pos.x;
      const dz = desired.z - host.pos.z;
      const length = Math.hypot(dx, dz) || 1;
      // Store the transition axis in the target frame. Projecting against a frozen world axis would
      // misclassify the target's ordinary heading weave as controller overshoot.
      const c = Math.cos(target.rot);
      const s = Math.sin(target.rot);
      transitionAxis = {
        x: (dx * c + dz * s) / length,
        z: (-dx * s + dz * c) / length,
      };
    }
    const step = stepPursuitSlotAssist({ dt, host, target, slot, profile, tuning });
    if (!step.active || !step.impulse) {
      return {
        settleTimeS: null,
        holdWithinToleranceS: 0,
        spinCount,
        overshootCount,
        manualOverrideTicks: null,
        maxSlotError: 0,
        pass: false,
        reason: step.telemetry && step.telemetry.reason || 'inactive',
      };
    }
    host.vel.x += step.impulse.x / mass;
    host.vel.z += step.impulse.z / mass;
    host.pos.x += host.vel.x * dt;
    host.pos.z += host.vel.z * dt;

    if (tick >= transitionTick) {
      const within = step.telemetry.slotError <= tuning.slotTolerance
        && step.telemetry.relativeSpeed <= tuning.velocityTolerance;
      if (within) {
        toleranceTicks++;
        longestToleranceTicks = Math.max(longestToleranceTicks, toleranceTicks);
        if (firstSettledTick == null && toleranceTicks >= 30) {
          firstSettledTick = tick - 29;
        }
      } else {
        toleranceTicks = 0;
      }
      if (transitionAxis) {
        const desired = pursuitDesiredPoint(target, slot);
        const c = Math.cos(target.rot);
        const s = Math.sin(target.rot);
        const axisX = transitionAxis.x * c - transitionAxis.z * s;
        const axisZ = transitionAxis.x * s + transitionAxis.z * c;
        const projection = (desired.x - host.pos.x) * axisX
          + (desired.z - host.pos.z) * axisZ;
        // Motion inside the production position deadband is intentional quiet hold, not an
        // oscillation. Only a full deadband crossing counts as controller overshoot/flail.
        const threshold = positive(tuning.positionDeadband, 12);
        const sign = projection > threshold ? 1 : projection < -threshold ? -1 : 0;
        if (sign !== 0) {
          if (previousProjectionSign !== 0 && sign !== previousProjectionSign) overshootCount++;
          previousProjectionSign = sign;
        }
      }
      const speed = Math.hypot(host.vel.x, host.vel.z);
      if (speed > 5) {
        const heading = Math.atan2(host.vel.z, host.vel.x);
        if (Math.abs(wrapLabAngle(heading - previousVelocityHeading)) > Math.PI * 0.55) spinCount++;
        previousVelocityHeading = heading;
      }
    }
  }

  const target = pursuitLabTarget(ticks * dt);
  const override = stepPursuitSlotAssist({
    dt,
    host,
    target,
    slot: transitionSlot,
    profile,
    tuning,
    manualOverride: true,
  });
  const settleTimeS = firstSettledTick == null
    ? null
    : round6((firstSettledTick - transitionTick) * dt);
  const holdWithinToleranceS = round6(longestToleranceTicks * dt);
  const manualOverrideTicks = !override.active && override.impulse == null ? 1 : null;
  const pass = settleTimeS != null
    && settleTimeS <= 2.5
    && holdWithinToleranceS >= 10
    && spinCount === 0
    && overshootCount === 0
    && manualOverrideTicks === 1;
  return {
    settleTimeS,
    holdWithinToleranceS,
    spinCount,
    overshootCount,
    manualOverrideTicks,
    pass,
  };
}

function pursuitLabTarget(timeS) {
  const x = 28 * timeS;
  const z = 34 * Math.sin(timeS * 0.42);
  const vx = 28;
  const vz = 34 * 0.42 * Math.cos(timeS * 0.42);
  const az = -34 * 0.42 * 0.42 * Math.sin(timeS * 0.42);
  const rot = Math.atan2(vz, vx);
  const angVel = (vx * az) / (vx * vx + vz * vz);
  return {
    id: 2,
    alive: true,
    pos: { x, z },
    vel: { x: vx, z: vz },
    // Nose follows the analytical velocity tangent, so the named weaving-target criterion tests
    // the full target frame rather than only translating a fixed orientation.
    rot,
    angVel,
  };
}

function pursuitDesiredPoint(target, slot) {
  const bearing = target.rot + slot.bearing;
  return {
    x: target.pos.x + Math.cos(bearing) * slot.range,
    z: target.pos.z + Math.sin(bearing) * slot.range,
  };
}

function pursuitDesiredVelocity(target, slot) {
  const bearing = target.rot + slot.bearing;
  const offsetX = Math.cos(bearing) * slot.range;
  const offsetZ = Math.sin(bearing) * slot.range;
  return {
    x: target.vel.x - target.angVel * offsetZ,
    z: target.vel.z + target.angVel * offsetX,
  };
}

function wrapLabAngle(value) {
  let angle = finite(value) % (Math.PI * 2);
  if (angle <= -Math.PI) angle += Math.PI * 2;
  if (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function productionOrbitMetrics(trace, contactDistance) {
  const tangentDominance = 0.6;
  const settleWindowTicks = 12;
  let tangentDominantTick = null;
  let minDistance = Infinity;
  let orbitAssistActiveTicks = 0;
  let oscillations = 0;
  let previousRadialSign = 0;

  for (let i = 0; i < trace.length; i++) {
    const sample = trace[i];
    minDistance = Math.min(minDistance, sample.distance);
    if (sample.orbitAssistActive) orbitAssistActiveTicks++;
    const sign = sample.radialSpeed > 0.5 ? 1 : sample.radialSpeed < -0.5 ? -1 : 0;
    if (sign !== 0) {
      if (previousRadialSign !== 0 && sign !== previousRadialSign) oscillations++;
      previousRadialSign = sign;
    }
    if (tangentDominantTick == null && i + settleWindowTicks <= trace.length) {
      let stable = true;
      for (let j = i; j < i + settleWindowTicks; j++) {
        if (trace[j].tangentFraction < tangentDominance) { stable = false; break; }
      }
      if (stable) tangentDominantTick = sample.tick;
    }
  }

  const anchorContact = minDistance <= contactDistance;
  const sustained = trace.length === 600
    && trace[trace.length - 1].attachmentActive
    && orbitAssistActiveTicks >= 540;
  const pass = tangentDominantTick != null
    && tangentDominantTick <= 120
    && !anchorContact
    && sustained
    && oscillations <= 12;
  return {
    tangentDominantTick,
    minDistance: round6(minDistance),
    contactDistance: round6(contactDistance),
    anchorContact,
    orbitAssistActiveTicks,
    oscillations,
    sustained,
    pass,
  };
}

/**
 * Grid-search sweep over controller gains × environment. Default controllerFactory is the reference
 * PD controller, so the gain axes actually bite (a real, non-flat matrix). Returns stable-ordered
 * cells + a wall-clock-free digest.
 *
 * @param {{seed?, ticks?, grid?, controllerFactory?, throttle?, reelWindow?}} options
 */
export async function sweep(options = {}) {
  const seed = Number.isFinite(options.seed) ? options.seed : DEFAULT_SEED;
  const ticks = Number.isFinite(options.ticks) ? options.ticks : LAB_DEFAULTS.ticks;
  const grid = options.grid || defaultSweepGrid();
  const controllerFactory = options.controllerFactory || ((gains) => makePdRadialController(gains));
  const throttle = Number.isFinite(options.throttle) ? options.throttle : 1;
  const reelWindow = options.reelWindow || [60, 160];

  const axes = {
    Kr: grid.Kr || [0],
    Kd: grid.Kd || [0.6],
    Ts: grid.Ts || [null],
    lineLength: grid.lineLength || [120],
    anchorMass: grid.anchorMass || [400],
    entrySpeed: grid.entrySpeed || [30],
  };

  const cells = [];
  for (const Kr of axes.Kr) {
    for (const Kd of axes.Kd) {
      for (const Ts of axes.Ts) {
        for (const lineLength of axes.lineLength) {
          for (const anchorMass of axes.anchorMass) {
            for (const entrySpeed of axes.entrySpeed) {
              const controller = controllerFactory({ Kr, Kd, Ts });
              const result = await runScenario({
                seed, ticks, lineLength, anchorMass, entrySpeed, throttle, reelWindow, controller,
              });
              cells.push({
                params: sortedParams({ seed, ticks, Kr, Kd, Ts, lineLength, anchorMass, entrySpeed }),
                metrics: result.metrics,
                pass: result.metrics.pass,
              });
            }
          }
        }
      }
    }
  }
  cells.sort((a, b) => (canonicalStringify(a.params) < canonicalStringify(b.params) ? -1 : 1));

  const passCount = cells.filter((c) => c.pass).length;
  return {
    schema: 'spaceface.masslineControlLab.sweep.v1',
    deterministic: true,
    seed,
    ticks,
    axes,
    cells,
    summary: { total: cells.length, pass: passCount, fail: cells.length - passCount },
    digest: hashMatrix(cells),
  };
}

// -------------------------------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------------------------------

function normalizeScenario(options) {
  const seed = (Number(options.seed) >>> 0) || DEFAULT_SEED;
  const ticks = clampInt(options.ticks, LAB_DEFAULTS.ticks, 1, 200000);
  const lineLength = positive(options.lineLength, 120);
  const anchorMass = positive(options.anchorMass, 400);
  const entrySpeed = Number.isFinite(options.entrySpeed) ? options.entrySpeed : 30;
  const throttle = Number.isFinite(options.throttle) ? clamp(options.throttle, -1, 1) : 1;
  const rotation = Number.isFinite(options.rotation) ? options.rotation : 0;
  const reelWindow = Array.isArray(options.reelWindow) ? options.reelWindow.slice(0, 2) : [60, 160];
  const frames = Array.isArray(options.frames) ? options.frames : null;
  const boost = !!options.boost;
  const productionOrbitAssist = !!options.productionOrbitAssist;
  return { seed, ticks, lineLength, anchorMass, entrySpeed, throttle, rotation, reelWindow, frames, boost, productionOrbitAssist };
}

function sortedParams(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function round6(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function clampInt(value, fallback, lo, hi) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
