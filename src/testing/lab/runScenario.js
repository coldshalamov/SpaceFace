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

    // Consume lab.* parameter overlays against spawned entities (FIX 9).
    applyLabParamOverlays(state, aliasMap, playerEntity, overlayCtx.params);

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

      // FIX 10: honor authored restLength (and lab.lineLength overlay) via reel after create.
      const derivedRest = created.attachment.restLength;
      const overlayLine = overlayCtx.params && overlayCtx.params.lineLength;
      const requestedRest = Number.isFinite(att.restLength)
        ? att.restLength
        : (Number.isFinite(overlayLine) ? overlayLine : null);
      restLength0 = derivedRest;
      if (Number.isFinite(requestedRest) && requestedRest >= 0) {
        const delta = requestedRest - derivedRest;
        if (Math.abs(delta) > 1e-9) {
          const reeled = kernel.attachments.reel(created.attachment.id, delta);
          if (!reeled || !reeled.ok) {
            runtime.dispose();
            return {
              schema: 'spaceface.labRunResult.v1',
              ok: false,
              exitClass: 3,
              status: 'infra',
              runId,
              error: `attachment restLength reel failed (${reeled && reeled.reason})`,
            };
          }
        }
        restLength0 = created.attachment.restLength;
      }

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
        ...(state._lab || {}),
        hostId,
        anchorId,
        kernel,
        attachmentId: attachmentIds[0],
        restLength0,
        controller,
        lastCommand: null,
      };
      if (Number.isFinite(overlayCtx.params.maxImpulse)) {
        state._lab.maxImpulse = overlayCtx.params.maxImpulse;
      }
    } else if (Number.isFinite(overlayCtx.params.maxImpulse)) {
      state._lab = { ...(state._lab || {}), maxImpulse: overlayCtx.params.maxImpulse };
    }

    // Optional production orbit assist mode via world fixture / overlay
    if (canonical.world.fixtureProfile === 'massline-orbit' || overlayResult.applied['gameplay.orbitAssistStrength']) {
      if (!state.settings.gameplay.orbitAssistStrength) {
        state.settings.gameplay.orbitAssistStrength = 'standard';
      }
    }

    // public-input must go through the real massline grammar (FIX 5) — no packet hardcoding.
    const inputDriver = createInputTapeDriver(canonical.inputTape, {
      masslineGrammar: options.masslineGrammar,
      allowMasslinePacketOverride: canonical.evidenceClass !== 'public-input',
    });
    const dt = canonical.dt || SIM_DT;
    const ticks = canonical.ticks | 0;
    const sampleEvery = (canonical.trace && canonical.trace.sampleEvery) || 1;
    // Display/export trace may sample; oracle always sees every tick (FIX 8).
    const displayTrace = [];
    const oracleTrace = [];
    const inputLog = [];
    const midCheckpoints = [];
    const checkpointTicks = new Set((canonical.checkpoints || []).map((c) => c.tick | 0));

    // Optional mid-run save/load
    // suppressSaveLoad / saveLoadAt:null → genuine uninterrupted control arm (FIX 1).
    const saveLoadAt = resolveSaveLoadAt(options, canonical);
    let saveLoadPerformed = false;
    let saveLoadRestoreCount = 0;

    for (let tick = 0; tick < ticks; tick++) {
      const host = state.entities.get(state.playerId);
      const tetherAttached = !!(state.player && state.player.tether && state.player.tether.active);
      const applied = inputDriver.apply(state, tick, dt, {
        playerEntity: host,
        tetherAttached,
      });
      inputLog.push({ tick, ...applied, keys: applied.keys });

      // FIX 7: dispatch frame commands once at their authored tick (not sticky last-wins).
      if (applied.frameCommands && applied.frameCommands.length) {
        const cmdResult = applyLabFrameCommands(runtime, state, applied.frameCommands, aliasMap);
        if (!cmdResult.ok) {
          runtime.dispose();
          return {
            schema: 'spaceface.labRunResult.v1',
            ok: false,
            exitClass: 4,
            status: 'invalid-config',
            runId,
            error: cmdResult.reason || 'frame command rejected',
          };
        }
      }

      runtime.step(dt);

      if (Number.isInteger(saveLoadAt) && tick === saveLoadAt && !saveLoadPerformed) {
        const loadResult = await performSaveLoad(runtime, state, options);
        saveLoadPerformed = true;
        if (!loadResult.ok) {
          runtime.dispose();
          return {
            schema: 'spaceface.labRunResult.v1',
            ok: false,
            exitClass: loadResult.exitClass != null ? loadResult.exitClass : 4,
            status: loadResult.status || 'unsupported',
            runId,
            error: loadResult.reason || 'save/load continuation failed',
          };
        }
        saveLoadRestoreCount += loadResult.restoreCount | 0;
      }

      const sample = makeSample(tick, state, {
        aliasMap,
        kernel,
        attachmentId: attachmentIds[0],
        restLength0,
        observerEnabled,
      });
      // FIX 8: every-tick oracle stream independent of sampleEvery.
      oracleTrace.push(sample);
      if (tick % sampleEvery === 0 || tick === ticks - 1) {
        displayTrace.push(sample);
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

    // Oracles consume the full every-tick stream (invariants cannot miss inter-sample NaNs).
    const oracle = evaluateOracles({
      trace: oracleTrace,
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

    const traceHash = sha256(canonicalStringify(oracleTrace));
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
        trace: oracleTrace,
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
      overlayParams: { ...overlayCtx.params },
      fingerprint: runtime.fingerprint,
      params: {
        restLength0,
        attachmentActiveAtEnd,
        saveLoadPerformed,
        saveLoadAt: saveLoadPerformed ? saveLoadAt : null,
        saveLoadRestoreCount,
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

    if (verbosity >= 3) result.trace = sampleEvery === 1 ? oracleTrace : displayTrace;
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

/**
 * Resolve mid-run save/load tick.
 * - suppressSaveLoad / saveLoadAt === null → no restore (control arm)
 * - integer saveLoadAt → that tick
 * - else fall back to scenario save-load checkpoint tick
 */
export function resolveSaveLoadAt(options = {}, canonical = {}) {
  if (options.suppressSaveLoad === true) return null;
  if (options.saveLoadAt === null) return null;
  if (Number.isInteger(options.saveLoadAt)) return options.saveLoadAt;
  if (options.saveLoadAt != null && Number.isFinite(Number(options.saveLoadAt))) {
    return Math.floor(Number(options.saveLoadAt));
  }
  const cp = (canonical.checkpoints || []).find((c) => c.kind === 'save-load');
  return cp && Number.isInteger(cp.tick | 0) ? (cp.tick | 0) : null;
}

/**
 * Real serialize → loadEnvelope round-trip only. Never claim success without a restore (FIX 3).
 * @returns {{ ok: boolean, restoreCount?: number, exitClass?: number, status?: string, reason?: string }}
 */
async function performSaveLoad(runtime, state, options = {}) {
  const saveSys = runtime.getSystem('save');
  if (saveSys && typeof saveSys.serialize === 'function' && typeof saveSys.loadEnvelope === 'function') {
    try {
      const envelope = saveSys.serialize('lab-save-load');
      const ok = saveSys.loadEnvelope(envelope, 'lab-save-load');
      if (!ok) {
        return { ok: false, exitClass: 3, status: 'infra', reason: 'save loadEnvelope returned false' };
      }
      state.settings.gameplay.flightBackend = 'v3';
      const physicsSys = runtime.getSystem('physics');
      if (physicsSys && typeof physicsSys.prepareBackend === 'function') {
        await physicsSys.prepareBackend(state, { reset: true });
      }
      return { ok: true, restoreCount: 1 };
    } catch (err) {
      return {
        ok: false,
        exitClass: 3,
        status: 'infra',
        reason: err && err.message ? err.message : 'save/load threw',
      };
    }
  }
  // No silent no-op / snapshot-only path. Bundles without save cannot claim save/load proof.
  if (options.allowRuntimeCheckpoint === true) {
    return {
      ok: false,
      exitClass: 4,
      status: 'unsupported',
      reason: 'runtime checkpoint is not a save/load proof; include the save system or omit save-load comparison',
    };
  }
  return {
    ok: false,
    exitClass: 4,
    status: 'unsupported',
    reason: 'save/load requires the save system (serialize/loadEnvelope); no-op fallback removed',
  };
}

/**
 * Execute tape frame commands once (sf-sim applyTapeCommands pattern) (FIX 7).
 */
function applyLabFrameCommands(runtime, state, commands, aliasMap) {
  if (!Array.isArray(commands) || commands.length === 0) return { ok: true };
  const helpers = (runtime.getHelpers && runtime.getHelpers()) || {};

  for (const command of commands) {
    if (!command) continue;
    if (command.kind === 'scenarioBranch') {
      if (typeof helpers.applyScenarioBranch !== 'function') {
        return {
          ok: false,
          reason: 'scenarioBranch command unsupported in this bundle (applyScenarioBranch helper unavailable)',
        };
      }
      const result = helpers.applyScenarioBranch(command.branchId, {
        source: command.source || 'lab-tape',
      });
      if (!result || !result.ok) {
        return {
          ok: false,
          reason: `scenarioBranch rejected: ${command.branchId} (${result && result.reason || 'unknown'})`,
        };
      }
      continue;
    }
    if (command.kind === 'combatAction') {
      if (typeof helpers.requestCombatAction !== 'function') {
        return {
          ok: false,
          reason: 'combatAction command unsupported in this bundle (requestCombatAction helper unavailable)',
        };
      }
      const actor = resolveLabEntity(state, command.actor, aliasMap);
      if (!actor) {
        return { ok: false, reason: `combatAction actor did not resolve: ${command.actor}` };
      }
      const request = {
        actorId: actor.id,
        actionId: command.actionId,
        source: { kind: command.source || 'player', controllerId: 'lab-tape' },
      };
      if (command.target != null) {
        const target = resolveLabEntity(state, command.target, aliasMap);
        if (!target) {
          return { ok: false, reason: `combatAction target did not resolve: ${command.target}` };
        }
        request.targetId = target.id;
      }
      if (command.attachment != null) {
        request.attachmentId = resolveLabAttachmentRef(state, command.attachment, actor.id);
        if (request.attachmentId == null) {
          return { ok: false, reason: `combatAction attachment did not resolve: ${command.attachment}` };
        }
      }
      const result = helpers.requestCombatAction(request);
      if (!result || !result.ok) {
        return {
          ok: false,
          reason: `combatAction rejected: ${command.actionId} (${result && result.reason || 'unknown'})`,
        };
      }
      continue;
    }
    return { ok: false, reason: `unsupported frame command kind: ${command.kind}` };
  }
  return { ok: true };
}

function resolveLabEntity(state, ref, aliasMap) {
  if (ref == null) return state.entities.get(state.playerId) || null;
  if (Number.isSafeInteger(ref)) return state.entities.get(ref) || null;
  const id = String(ref);
  if (id === 'player' || id === 'player_kestrel') return state.entities.get(state.playerId) || null;
  if (aliasMap && aliasMap[id] != null) return state.entities.get(aliasMap[id]) || null;
  return (state.entityList || []).find((entity) => {
    const data = entity && entity.data || {};
    return data.scenarioActorId === id || data.scenarioRole === id || data.scenarioAlias === id
      || data.assetRef === id || data.defId === id;
  }) || null;
}

function resolveLabAttachmentRef(state, ref, ownerId) {
  const id = String(ref);
  if (id !== 'latestOwned') return id;
  const attachments = state.combat && state.combat.attachments && state.combat.attachments.byId || {};
  const latest = Object.values(attachments)
    .filter((attachment) => attachment && attachment.state === 'active' && attachment.ownerId === ownerId)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  return latest ? latest.id : null;
}

/**
 * Apply lab.* overlay params that only make sense after entities exist (FIX 9).
 */
function applyLabParamOverlays(state, aliasMap, playerEntity, params = {}) {
  if (!params || typeof params !== 'object') return;

  if (Number.isFinite(params.entrySpeed) && playerEntity && playerEntity.vel) {
    const sp = params.entrySpeed;
    const vx = playerEntity.vel.x || 0;
    const vz = playerEntity.vel.z || 0;
    const mag = Math.hypot(vx, vz);
    if (mag > 1e-9) {
      playerEntity.vel.x = (vx / mag) * sp;
      playerEntity.vel.z = (vz / mag) * sp;
    } else {
      const h = playerEntity.rot || 0;
      playerEntity.vel.x = Math.cos(h) * sp;
      playerEntity.vel.z = Math.sin(h) * sp;
    }
  }

  if (Number.isFinite(params.anchorMass)) {
    // Prefer attachment target alias "anchor", else first non-player entity.
    let anchor = null;
    if (aliasMap.anchor != null) anchor = state.entities.get(aliasMap.anchor);
    if (!anchor) {
      for (const [alias, id] of Object.entries(aliasMap)) {
        if (alias === 'player') continue;
        const e = state.entities.get(id);
        if (e && e.id !== state.playerId) {
          anchor = e;
          break;
        }
      }
    }
    if (anchor) {
      anchor.mass = params.anchorMass;
      if (anchor.physicsBody) {
        anchor.physicsBody.mass = params.anchorMass;
        anchor.physicsBody.inertiaY = params.anchorMass * 8;
        anchor.physicsBody.revision = (anchor.physicsBody.revision | 0) + 1;
      }
    }
  }
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

/**
 * Round finite numbers to 6 decimals. Preserve non-finite values so
 * invariant.finiteState can detect NaN/Infinity (FIX 4). Never map NaN→0.
 */
function round6(n) {
  if (n == null) return n;
  const x = Number(n);
  if (!Number.isFinite(x)) return x; // NaN / ±Infinity preserved
  return Math.round(x * 1e6) / 1e6;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}
