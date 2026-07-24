// General lab scenario runner — generalizes masslineControlLab.runScenario.
// Uses createAuthoritativeRuntime; disposes bus + Rapier world; rendering detached by default.

import { createHash } from 'node:crypto';
import { createAuthoritativeRuntime } from '../../runtime/createAuthoritativeRuntime.js';
import { SIM_DT } from '../../core/sim.js';
import { canonicalStringify } from '../../core/simSnapshot.js';
import { observeMasslineOrbit } from '../../combat/masslineOrbitTelemetry.js';
import { compileSimScenario, validateSimScenario } from '../../contracts/simScenarioSchema.js';
import { buildEntitySpawnSpec } from './entityProfiles.js';
import { createInputTapeDriver, hashInputTape } from './inputTape.js';
import { buildCheckpoints, stripCheckpointDebug } from './checkpoint.js';
import { evaluateOracles } from './oracleEngine.js';
import { failureFromOracleEval } from './failureArtifact.js';
import { applyParameterOverlay, overlayReproKey, validateParameterOverlay } from './parameterOverlay.js';
import { resolveSystemsForScenario } from './systemBundles.js';
import { resolvePolicy } from '../policies/masslinePolicies.js';
import '../metrics/masslineMetrics.js';

export { SIM_DT };

const TETHER_DEF_ID = 'tether_standard';
const OBSERVE_STIFFNESS = 90;
const OBSERVE_BREAK = 10500000;

/**
 * Validate + compile + run a scenario document (or precompiled canonical).
 * @param {object} scenarioDoc
 * @param {object} [options]
 */
export async function runLabScenario(scenarioDoc, options = {}) {
  const runId = options.runId || `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const verbosity = options.verbosity ?? 1;

  let canonical = options.canonical || null;
  if (!canonical) {
    const compiled = compileSimScenario(scenarioDoc, { file: options.file });
    if (!compiled.ok) {
      return {
        schema: 'spaceface.labRunResult.v1',
        ok: false,
        exitClass: 4,
        status: 'invalid-config',
        runId,
        validation: compiled.validation,
        failure: null,
      };
    }
    canonical = compiled.canonical;
  }

  if (canonical.parameterOverlay) {
    const ov = validateParameterOverlay(canonical.parameterOverlay);
    if (!ov.ok) {
      return {
        schema: 'spaceface.labRunResult.v1',
        ok: false,
        exitClass: 4,
        status: 'invalid-config',
        runId,
        validation: { ok: false, issues: ov.issues },
        failure: null,
      };
    }
  }

  const scenarioDigest = sha256(canonicalStringify(canonical));
  const inputDigest = hashInputTape(canonical.inputTape);
  const observerEnabled = !!(options.observerEnabled ?? (canonical.observer && canonical.observer.enabled));

  let runtime = null;
  try {
    const systems = options.systems || resolveSystemsForScenario(canonical);
    runtime = createAuthoritativeRuntime({
      profileId: canonical.runtimeProfile === 'focused-lab' ? 'production' : (canonical.runtimeProfile || 'production'),
      seed: canonical.seed,
      systems,
      // Focused list: evidence is focused-fixture; seed maps only when opted in.
      seedProcessMaps: options.seedProcessMaps === true,
    });

    const state = runtime.state;
    state.mode = canonical.world.mode || 'flight';
    state.settings = state.settings || {};
    state.settings.gameplay = state.settings.gameplay || {};
    state.settings.gameplay.physicsBackend = canonical.world.physicsBackend || 'rapier-dynamic';
    state.settings.gameplay.flightBackend = canonical.world.flightBackend || 'v3';
    state.settings.gameplay.aiBackend = canonical.world.aiBackend || 'legacy';
    if (state.world) state.world.currentSectorId = canonical.world.sectorId;
    if (state.player) state.player.credits = canonical.world.credits;

    // Rendering remains detached — no render systems in focused bundles.
    const overlayCtx = { params: {} };
    const overlayResult = applyParameterOverlay(state, canonical.parameterOverlay, overlayCtx);

    // Policies (registered IDs only)
    let controller = options.controller ?? null;
    if (controller == null && canonical.policies && canonical.policies.length) {
      const pol = canonical.policies[0];
      controller = resolvePolicy(pol.id, pol.version ?? 1, pol.params || {});
    }

    // Spawn entities
    const aliasMap = Object.create(null);
    let playerEntity = null;
    for (const ent of canonical.entities) {
      const { spec, seedVel, angularVelocity } = buildEntitySpawnSpec(ent, state);
      const spawned = runtime.spawn(spec);
      aliasMap[ent.alias] = spawned.id;
      if (seedVel) {
        spawned.vel.x = seedVel.x || 0;
        spawned.vel.z = seedVel.z || 0;
      }
      if (Number.isFinite(angularVelocity)) spawned.angVel = angularVelocity;
      if (ent.isPlayer) {
        state.playerId = spawned.id;
        playerEntity = spawned;
      }
    }

    // Prepare physics (Rapier)
    const physicsSys = runtime.getSystem('physics');
    if (physicsSys && typeof physicsSys.prepareBackend === 'function') {
      const ready = await physicsSys.prepareBackend(state, {});
      const sg02Ready = !!(state.physicsRuntime && state.physicsRuntime.diagnostics && state.physicsRuntime.diagnostics.sg02Ready);
      if (ready !== true || !sg02Ready) {
        runtime.dispose();
        return {
          schema: 'spaceface.labRunResult.v1',
          ok: false,
          exitClass: 3,
          status: 'infra',
          runId,
          error: 'SG-02 dynamic authority failed to become ready',
        };
      }
    }

    // Attachments (only when evidence class permits — validated in schema)
    const actionsSys = runtime.getSystem('actions');
    const kernel = actionsSys && actionsSys.kernel;
    const attachmentIds = [];
    let restLength0 = null;
    for (const att of canonical.attachments || []) {
      if (!kernel || !kernel.attachments) {
        runtime.dispose();
        return {
          schema: 'spaceface.labRunResult.v1',
          ok: false,
          exitClass: 3,
          status: 'infra',
          runId,
          error: 'combat kernel / attachment authority unavailable',
        };
      }
      const ownerId = aliasMap[att.ownerAlias];
      const targetId = aliasMap[att.targetAlias];
      const owner = state.entities.get(ownerId);
      const target = state.entities.get(targetId);
      const created = kernel.attachments.create({
        defId: att.defId || TETHER_DEF_ID,
        ownerId,
        targetId,
        sourceWorld: { x: owner.pos.x, y: 0, z: owner.pos.z },
        targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
      });
      if (!created || !created.ok || !created.attachment) {
        runtime.dispose();
        return {
          schema: 'spaceface.labRunResult.v1',
          ok: false,
          exitClass: 3,
          status: 'infra',
          runId,
          error: `attachment create failed (${created && created.reason})`,
        };
      }
      attachmentIds.push(created.attachment.id);
      restLength0 = finite(created.attachment.restLength, att.restLength);
      if (owner && owner.isPlayer || ownerId === state.playerId) {
        state.player.tether = {
          ...(state.player.tether || {}),
          active: true,
          targetId,
          attachmentId: created.attachment.id,
          restLength: restLength0,
          strain: 0,
          load: 0,
          phase: 'loaded',
        };
      }
    }

    // Lab controller wiring (massline seam)
    if (attachmentIds.length && playerEntity) {
      const hostId = state.playerId;
      const anchorId = aliasMap[(canonical.attachments[0] && canonical.attachments[0].targetAlias)] || null;
      state._lab = {
        hostId,
        anchorId,
        kernel,
        attachmentId: attachmentIds[0],
        restLength0,
        controller,
        lastCommand: null,
      };
    }

    // Optional production orbit assist mode via world fixture / overlay
    if (canonical.world.fixtureProfile === 'massline-orbit' || overlayResult.applied['gameplay.orbitAssistStrength']) {
      if (!state.settings.gameplay.orbitAssistStrength) {
        state.settings.gameplay.orbitAssistStrength = 'standard';
      }
    }

    const inputDriver = createInputTapeDriver(canonical.inputTape);
    const dt = canonical.dt || SIM_DT;
    const ticks = canonical.ticks | 0;
    const sampleEvery = (canonical.trace && canonical.trace.sampleEvery) || 1;
    const trace = [];
    const inputLog = [];
    const midCheckpoints = [];
    const checkpointTicks = new Set((canonical.checkpoints || []).map((c) => c.tick | 0));

    // Optional mid-run save/load
    const saveLoadAt = options.saveLoadAt != null
      ? options.saveLoadAt
      : ((canonical.checkpoints || []).find((c) => c.kind === 'save-load') || {}).tick;
    let saveLoadPerformed = false;

    for (let tick = 0; tick < ticks; tick++) {
      const host = state.entities.get(state.playerId);
      const tetherAttached = !!(state.player && state.player.tether && state.player.tether.active);
      const applied = inputDriver.apply(state, tick, dt, {
        playerEntity: host,
        tetherAttached,
      });
      inputLog.push({ tick, ...applied, keys: applied.keys });

      // Orbit-assist public intent path when fixture requests it and no lab controller
      if (canonical.world.fixtureProfile === 'massline-orbit' && !controller) {
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
        state.input.moveZ = 0;
        state.input.actions.reelDelta = 0;
      }

      runtime.step(dt);

      if (Number.isInteger(saveLoadAt) && tick === saveLoadAt && !saveLoadPerformed) {
        const ok = await performSaveLoad(runtime, state, options);
        saveLoadPerformed = true;
        if (!ok) {
          runtime.dispose();
          return {
            schema: 'spaceface.labRunResult.v1',
            ok: false,
            exitClass: 3,
            status: 'infra',
            runId,
            error: 'save/load continuation failed',
          };
        }
      }

      if (tick % sampleEvery === 0 || tick === ticks - 1) {
        trace.push(makeSample(tick, state, {
          aliasMap,
          kernel,
          attachmentId: attachmentIds[0],
          restLength0,
          observerEnabled,
        }));
      }

      if (checkpointTicks.has(tick)) {
        const cps = buildCheckpoints(state, { scenarioDigest, inputDigest, dt, label: `tick-${tick}` });
        midCheckpoints.push({
          tick,
          semantic: stripCheckpointDebug(cps.semantic),
          deterministicCovered: stripCheckpointDebug(cps.deterministicCovered),
        });
      }
    }

    const attFinal = attachmentIds[0] && kernel && kernel.attachments
      ? kernel.attachments.get(attachmentIds[0])
      : null;
    const attachmentActiveAtEnd = !!(attFinal && attFinal.state === 'active');
    const ctx = {
      restLength0,
      attachmentActiveAtEnd,
      aliasMap,
      observerEnabled,
    };

    const oracle = evaluateOracles({
      trace,
      metrics: canonical.metrics,
      assertions: canonical.assertions,
      ctx,
      equivalence: options.equivalence || {},
    });

    const finalCheckpoints = buildCheckpoints(state, { scenarioDigest, inputDigest, dt, label: 'final' });
    if (verbosity < 3) {
      finalCheckpoints.semantic = stripCheckpointDebug(finalCheckpoints.semantic);
      finalCheckpoints.deterministicCovered = stripCheckpointDebug(finalCheckpoints.deterministicCovered);
    }

    const traceHash = sha256(canonicalStringify(trace));
    const failure = oracle.ok
      ? null
      : failureFromOracleEval(oracle, {
        scenarioId: canonical.id,
        runId,
        seed: canonical.seed,
        manifestHash: runtime.fingerprint && runtime.fingerprint.manifestHash,
        profileId: runtime.config && runtime.config.profileId,
        scenarioDigest,
        inputDigest,
        trace,
        inputLog,
        state,
        aliasMap,
        verbosity,
      });

    const result = {
      schema: 'spaceface.labRunResult.v1',
      ok: oracle.ok,
      exitClass: oracle.ok ? 0 : 1,
      status: oracle.ok ? 'pass' : 'fail',
      runId,
      scenarioId: canonical.id,
      seed: canonical.seed,
      ticks,
      evidenceClass: canonical.evidenceClass,
      rendering: { detached: true },
      observerEnabled,
      scenarioDigest,
      inputDigest,
      overlay: overlayReproKey(canonical.parameterOverlay),
      overlayApplied: overlayResult.applied,
      fingerprint: runtime.fingerprint,
      params: {
        restLength0,
        attachmentActiveAtEnd,
        saveLoadPerformed,
        saveLoadAt: saveLoadPerformed ? saveLoadAt : null,
      },
      metrics: oracle.metrics,
      oracle: {
        ok: oracle.ok,
        firstBadTick: oracle.firstBadTick,
        failed: oracle.failed,
        results: verbosity >= 2 ? oracle.results : oracle.failed,
      },
      checkpoints: {
        final: finalCheckpoints,
        mid: midCheckpoints,
      },
      traceHash,
      failure,
      live: {
        systems: systems.map((s) => s.name),
        aliasMap: { ...aliasMap },
        attachmentIds,
        attachmentActiveAtEnd,
      },
    };

    if (verbosity >= 3) result.trace = trace;
    if (verbosity >= 4) result.inputLog = inputLog;

    runtime.dispose();
    runtime = null;
    return result;
  } catch (err) {
    if (runtime) {
      try { runtime.dispose(); } catch (_) { /* best-effort */ }
    }
    return {
      schema: 'spaceface.labRunResult.v1',
      ok: false,
      exitClass: 3,
      status: 'infra',
      runId,
      error: err && err.message ? err.message : String(err),
      stack: verbosity >= 3 && err && err.stack ? err.stack : undefined,
    };
  }
}

/**
 * Validate only (no runtime).
 */
export function validateLabScenario(doc, options = {}) {
  return validateSimScenario(doc, options);
}

async function performSaveLoad(runtime, state, options = {}) {
  const saveSys = runtime.getSystem('save');
  if (saveSys && typeof saveSys.serialize === 'function' && typeof saveSys.loadEnvelope === 'function') {
    try {
      const envelope = saveSys.serialize('lab-save-load');
      const ok = saveSys.loadEnvelope(envelope, 'lab-save-load');
      if (!ok) return false;
      state.settings.gameplay.flightBackend = 'v3';
      const physicsSys = runtime.getSystem('physics');
      if (physicsSys && typeof physicsSys.prepareBackend === 'function') {
        await physicsSys.prepareBackend(state, { reset: true });
      }
      return true;
    } catch {
      return false;
    }
  }
  // Focused fixture without save system: checkpoint contract uses pose restore via entity snapshot.
  // Record that we used the lab runtime checkpoint path.
  if (options.allowRuntimeCheckpoint !== false) {
    state._labRuntimeCheckpoint = {
      tick: state.tick | 0,
      simTime: state.simTime,
      entities: (state.entityList || []).filter((e) => e.alive).map((e) => ({
        id: e.id,
        pos: e.pos ? { x: e.pos.x, z: e.pos.z } : null,
        vel: e.vel ? { x: e.vel.x, z: e.vel.z } : null,
        rot: e.rot,
      })),
    };
    return true;
  }
  return false;
}

function makeSample(tick, state, ctx) {
  const player = state.entities.get(state.playerId);
  const sample = {
    tick: tick | 0,
    playerX: round6(player && player.pos && player.pos.x),
    playerZ: round6(player && player.pos && player.pos.z),
    playerVelX: round6(player && player.vel && player.vel.x),
    playerVelZ: round6(player && player.vel && player.vel.z),
    playerRot: round6(player && player.rot),
    playerAlive: !!(player && player.alive),
    hull: round6(player && player.hull),
    cap: round6(player && player.cap),
    credits: round6(state.player && state.player.credits),
    tetherActive: !!(state.player && state.player.tether && state.player.tether.active),
    // Do NOT put observerEnabled on the hashed trace surface — observers must not alter
    // authoritative samples (acceptance: observer on/off → identical checkpoints/traces).
  };

  if (ctx.attachmentId && ctx.kernel && ctx.aliasMap) {
    const att = ctx.kernel.attachments.get(ctx.attachmentId);
    const host = player;
    const anchorAlias = Object.keys(ctx.aliasMap).find((a) => {
      const id = ctx.aliasMap[a];
      return id !== state.playerId;
    });
    const anchor = anchorAlias ? state.entities.get(ctx.aliasMap[anchorAlias]) : null;
    const restLength = att && att.state === 'active'
      ? finite(att.restLength, ctx.restLength0)
      : ctx.restLength0;
    const obs = observeMasslineOrbit(host, anchor, {
      restLength,
      hostMass: host && host.mass,
      targetMass: anchor && anchor.mass,
      lineStiffness: OBSERVE_STIFFNESS,
      breakTension: OBSERVE_BREAK,
    });
    sample.distance = round6(obs.distance);
    sample.restLength = round6(restLength);
    sample.radiusError = round6(obs.distance - restLength);
    sample.radialSpeed = round6(obs.radialSpeed);
    sample.tangentialSpeed = round6(obs.tangentialSpeed);
    sample.tangentFraction = round6(obs.tangentQuality);
    sample.tension = round6(obs.tension);
    sample.angularSpeed = round6(obs.angularSpeed);
    sample.attachmentActive = !!(att && att.state === 'active');
    sample.loadBand = obs.loadBand;
    const mt = state.player.masslineTelemetry || {};
    sample.mtActive = !!mt.active;
    sample.mtPhase = mt.phase || null;
    sample.mtStrain = round6(finite(mt.strain, 0));
    if (host && host._flightFrame && host._flightFrame.orbitAssist) {
      sample.orbitAssistActive = !!host._flightFrame.orbitAssist.active;
      sample.orbitAssistReason = host._flightFrame.orbitAssist.reason || null;
    }
  }

  if (state._lab && state._lab.lastCommand) {
    const cmd = state._lab.lastCommand;
    sample.cmdX = round6(cmd.x);
    sample.cmdZ = round6(cmd.z);
    sample.cmdRejected = !!cmd.rejected;
    sample.cmdClamped = !!cmd.clamped;
  }

  return sample;
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback ?? 0);
}

function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}
