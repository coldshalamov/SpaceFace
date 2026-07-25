// General lab scenario runner — generalizes masslineControlLab.runScenario.
// Uses createAuthoritativeRuntime; disposes bus + Rapier world; rendering detached by default.

import { createHash } from 'node:crypto';
import { createAuthoritativeRuntime, bindRuntimeToState } from '../../runtime/createAuthoritativeRuntime.js';
import { SIM_DT } from '../../core/sim.js';
import { canonicalStringify } from '../../core/simSnapshot.js';
import { observeMasslineOrbit } from '../../combat/masslineOrbitTelemetry.js';
import {
  compileSimScenario,
  validateSimScenario,
  validateCanonicalScenario,
} from '../../contracts/simScenarioSchema.js';
import { buildEntitySpawnSpec } from './entityProfiles.js';
import { createInputTapeDriver, hashInputTape } from './inputTape.js';
import { buildCheckpoints, stripCheckpointDebug } from './checkpoint.js';
import { evaluateOracles } from './oracleEngine.js';
import { failureFromOracleEval } from './failureArtifact.js';
import { applyParameterOverlay, overlayReproKey, validateParameterOverlay } from './parameterOverlay.js';
import { resolveSystemsForScenario } from './systemBundles.js';
import { deriveEvidenceClass } from './evidenceClass.js';
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
  } else {
    // FIX 17: options.canonical skips compileSimScenario/validateSimScenario.
    // Re-run shared semantic checks so precompiled/mutated canonicals with
    // orphan lab.anchorMass are rejected the same way as raw documents.
    const canonicalValidation = validateCanonicalScenario(canonical, { file: options.file });
    if (!canonicalValidation.ok) {
      return {
        schema: 'spaceface.labRunResult.v1',
        ok: false,
        exitClass: 4,
        status: 'invalid-config',
        runId,
        validation: canonicalValidation,
        failure: null,
      };
    }
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

  // options.scenarioDigest lets callers inject collection-only mid-checkpoints without
  // changing the shared compiled-artifact identity (Phase 4 Node/Chromium parity).
  const scenarioDigest = options.scenarioDigest || sha256(canonicalStringify(canonical));
  const inputDigest = options.inputDigest || hashInputTape(canonical.inputTape);
  const observerEnabled = !!(options.observerEnabled ?? (canonical.observer && canonical.observer.enabled));

  let runtime = null;
  try {
    const systems = options.systems || resolveSystemsForScenario(canonical);
    const profileId = canonical.runtimeProfile === 'focused-lab'
      ? 'production'
      : (canonical.runtimeProfile || 'production');
    runtime = createAuthoritativeRuntime({
      profileId,
      seed: canonical.seed,
      systems,
      // H1: default seed production MAPS for non-legacy profiles (explicit false opts out).
      seedProcessMaps: options.seedProcessMaps,
    });

    let state = runtime.state;
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

    // Consume lab.* parameter overlays against spawned entities (FIX 9 / FIX 13 / FIX 15).
    // Deferred lab.* paths only stay in overlayApplied when they actually mutate state.
    const labOverlayStatus = applyLabParamOverlays(
      state, aliasMap, playerEntity, overlayCtx.params, canonical.attachments,
    );
    const overlayApplied = { ...overlayResult.applied };
    const overlayUnapplied = {};
    for (const [path, reason] of Object.entries(labOverlayStatus.unapplied || {})) {
      delete overlayApplied[path];
      overlayUnapplied[path] = reason;
    }

    // Sample target must be the same entity anchorMass rewrote (FIX 14), not first non-player.
    const sampleTargetEntity = resolveAnchorMassTarget(state, aliasMap, canonical.attachments);
    const sampleTargetId = sampleTargetEntity ? sampleTargetEntity.id : null;

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
    // H10: these are re-bound after mid-run save/load runtime recreate — never leave as const.
    let actionsSys = runtime.getSystem('actions');
    let kernel = actionsSys && actionsSys.kernel;
    let attachmentIds = [];
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

    // L3: runner consumes canonical.inputTape exclusively (validated required above).
    // public-input must go through the real massline grammar (FIX 5) — no packet hardcoding.
    // F9: massline action-packet injection is forbidden unless an explicit test option opts in.
    if (!canonical.inputTape || typeof canonical.inputTape !== 'object') {
      return {
        schema: 'spaceface.labRunResult.v1',
        ok: false,
        exitClass: 4,
        status: 'invalid-config',
        runId,
        validation: {
          ok: false,
          issues: [{
            path: '$.inputTape',
            rule: 'required',
            message: 'inputTape is required — runner does not fall back to raw fields',
          }],
        },
        failure: null,
      };
    }
    const inputDriver = createInputTapeDriver(canonical.inputTape, {
      masslineGrammar: options.masslineGrammar,
      allowMasslinePacketOverride: options.allowMasslinePacketOverride === true
        ? true
        : false,
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

    // I1: range-check saveLoadAt — need 0 <= saveLoadAt < ticks - 1 (post-restore tick required).
    if (Number.isInteger(saveLoadAt)) {
      if (ticks < 2 || saveLoadAt < 0 || saveLoadAt >= ticks - 1) {
        runtime.dispose();
        return {
          schema: 'spaceface.labRunResult.v1',
          ok: false,
          exitClass: 4,
          status: 'invalid-config',
          runId,
          error: `saveLoadAt out of range: need 0 <= saveLoadAt < ticks - 1 (got saveLoadAt=${saveLoadAt}, ticks=${ticks})`,
          params: {
            saveLoadPerformed: false,
            saveLoadAt,
            saveLoadRestoreCount: 0,
          },
        };
      }
    }

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

      // F1: sample + mid-checkpoint BEFORE save/load so the save-tick observation matches the
      // uninterrupted arm by construction. Post-restore fidelity is proven on subsequent ticks.
      const sample = makeSample(tick, state, {
        aliasMap,
        kernel,
        attachmentId: attachmentIds[0],
        sampleTargetId,
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
        // Retain surfaces when requested (Node/Chromium parity localization) or high verbosity.
        // Unconditional strip defeated field-level divergence reports on hash mismatch.
        const keepSurface = options.retainCheckpointSurfaces === true || verbosity >= 3;
        midCheckpoints.push({
          tick,
          semantic: keepSurface ? cps.semantic : stripCheckpointDebug(cps.semantic),
          deterministicCovered: keepSurface
            ? cps.deterministicCovered
            : stripCheckpointDebug(cps.deterministicCovered),
        });
      }

      if (Number.isInteger(saveLoadAt) && tick === saveLoadAt && !saveLoadPerformed) {
        // Player-route save/load: in-place loadEnvelope by default (see performSaveLoad).
        const loadResult = await performSaveLoad(runtime, state, {
          ...options,
          systemsForRecreate: systems,
        });
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
        if (loadResult.runtime && loadResult.runtime !== runtime) {
          try { runtime.dispose(); } catch (_) { /* best-effort */ }
          runtime = loadResult.runtime;
          state = loadResult.state;
          // H10: rebind ALL system-local observers to the recreated runtime.
          actionsSys = runtime.getSystem('actions');
          kernel = actionsSys && actionsSys.kernel;
          const tetherAttId = state.player && state.player.tether
            ? state.player.tether.attachmentId
            : null;
          if (tetherAttId != null) {
            attachmentIds = [tetherAttId];
          } else if (state._lab && state._lab.attachmentId != null) {
            attachmentIds = [state._lab.attachmentId];
          } else {
            attachmentIds = [];
          }
          if (state._lab) {
            state._lab.kernel = kernel;
            state._lab.attachmentId = attachmentIds[0] != null ? attachmentIds[0] : null;
            state._lab.controller = controller;
          }
        }
        // F1: rebuild keys + massline grammar through this tick and rewrite sticky axes.
        // Do NOT call apply() again — that would double-step the massline grammar for this tick.
        const hostAfter = state.entities.get(state.playerId);
        const tetherAfter = !!(state.player && state.player.tether && state.player.tether.active);
        inputDriver.resetFromTape?.(0, tick, state, {
          playerEntity: hostAfter,
          tetherAttached: tetherAfter,
          dt,
        });
      }
    }

    // I1: if a mid-run save/load was requested, it must have performed exactly one restore.
    if (Number.isInteger(saveLoadAt)) {
      if (!saveLoadPerformed || saveLoadRestoreCount !== 1) {
        runtime.dispose();
        return {
          schema: 'spaceface.labRunResult.v1',
          ok: false,
          exitClass: 4,
          status: 'save-load-not-performed',
          runId,
          error: `save-load-not-performed: expected saveLoadPerformed=true and restoreCount=1 `
            + `(performed=${saveLoadPerformed}, restoreCount=${saveLoadRestoreCount}, saveLoadAt=${saveLoadAt})`,
          params: {
            saveLoadPerformed,
            saveLoadAt,
            saveLoadRestoreCount,
          },
        };
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
    // skipMultiRunEquivalence: compare/repeat arms — parent evaluates multi-run equivalence.
    const oracle = evaluateOracles({
      trace: oracleTrace,
      metrics: canonical.metrics,
      assertions: canonical.assertions,
      ctx,
      equivalence: options.equivalence || {},
      skipMultiRunEquivalence: options.skipMultiRunEquivalence === true,
    });

    const finalCheckpoints = buildCheckpoints(state, { scenarioDigest, inputDigest, dt, label: 'final' });
    if (verbosity < 3 && options.retainCheckpointSurfaces !== true) {
      finalCheckpoints.semantic = stripCheckpointDebug(finalCheckpoints.semantic);
      finalCheckpoints.deterministicCovered = stripCheckpointDebug(finalCheckpoints.deterministicCovered);
    }

    const traceHash = sha256(canonicalStringify(oracleTrace));

    // H2: evidence class from execution reality, never author intent alone.
    const systemNames = systems.map((s) => s.name);
    const evidence = deriveEvidenceClass({
      authored: canonical.evidenceClass,
      manifestEvidenceClass: runtime.manifest && runtime.manifest.evidenceClass,
      systemNames,
      focusedSystems: true, // lab path always passes an explicit systems list
      renderingDetached: true,
      host: options.host || 'node',
      exclusions: (runtime.manifest && runtime.manifest.exclusions) || [],
    });

    // H11/L5: every declared assertion must produce exactly one oracle result;
    // zero assertions+metrics is not a green certification.
    const assertionConsumption = assertAssertionsConsumed(
      canonical.assertions,
      oracle.results,
      { metrics: canonical.metrics },
    );
    // F5: deferred equivalence is incomplete/unsupported — not a green pass.
    // evaluateEquivalence already emits deferred with ok:false so they appear in oracle.failed.
    const deferredEq = (oracle.results || []).filter((r) => r.family === 'equivalence' && r.deferred);
    const hasDeferred = deferredEq.length > 0;
    const oracleOk = oracle.ok && assertionConsumption.ok && !hasDeferred;
    const oracleFailed = [
      ...(oracle.failed || []),
      ...(!assertionConsumption.ok ? [{
        family: 'assertion-consumption',
        id: 'assertions-consumed-exactly-once',
        ok: false,
        expected: assertionConsumption.expected,
        actual: assertionConsumption.actual,
        reason: assertionConsumption.reason,
        firstBadTick: 0,
      }] : []),
    ];
    const oracleForFailure = {
      ok: oracleOk,
      failed: oracleFailed,
      firstBadTick: oracle.firstBadTick,
      results: [...(oracle.results || []), ...(!assertionConsumption.ok ? oracleFailed.slice(-1) : [])],
    };
    const failure = oracleOk
      ? null
      : failureFromOracleEval(oracleForFailure, {
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

    // Deferred-only failures use exitClass 4 (incomplete/unsupported) so CI does not
    // treat them as deterministic gameplay fails (exit 1) or green (0).
    const onlyDeferred = hasDeferred
      && assertionConsumption.ok
      && (oracle.failed || []).length > 0
      && (oracle.failed || []).every((f) => f.deferred);
    const exitClass = oracleOk ? 0 : (onlyDeferred ? 4 : 1);
    const status = oracleOk ? 'pass' : (onlyDeferred ? 'incomplete' : 'fail');

    const result = {
      schema: 'spaceface.labRunResult.v1',
      ok: oracleOk,
      exitClass,
      status,
      runId,
      scenarioId: canonical.id,
      seed: canonical.seed,
      ticks,
      evidenceClass: evidence.evidenceClass,
      authoredEvidenceClass: evidence.authored,
      evidenceNote: evidence.note,
      evidenceDemoted: evidence.demoted,
      rendering: { detached: true },
      observerEnabled,
      scenarioDigest,
      inputDigest,
      overlay: overlayReproKey(canonical.parameterOverlay),
      overlayApplied,
      overlayUnapplied: Object.keys(overlayUnapplied).length ? overlayUnapplied : undefined,
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
        ok: oracleOk,
        firstBadTick: oracle.firstBadTick,
        failed: oracleFailed,
        results: verbosity >= 2 ? oracleForFailure.results : oracleFailed,
        assertionConsumption,
      },
      checkpoints: {
        final: finalCheckpoints,
        mid: midCheckpoints,
      },
      traceHash,
      failure,
      live: {
        systems: systemNames,
        aliasMap: { ...aliasMap },
        attachmentIds,
        attachmentActiveAtEnd,
      },
    };

    // F1: save/load compare retains the full every-tick oracle stream for tick-by-tick parity.
    if (options.retainOracleTrace === true || verbosity >= 3) {
      result.oracleTrace = oracleTrace;
      result.trace = sampleEvery === 1 ? oracleTrace : displayTrace;
    }
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
 * H11: every declared assertion must produce exactly one oracle family result.
 * Metric assertions map by metric name; temporal/equivalence by kind/id.
 */
export function assertAssertionsConsumed(assertions, oracleResults, options = {}) {
  const declared = Array.isArray(assertions) ? assertions : [];
  const metricCount = Array.isArray(options.metrics) ? options.metrics.length : 0;
  // L5: empty assertion list is only OK when metrics provide a causal oracle.
  // Automatic finite/resource invariants alone must not certify a feature.
  if (declared.length === 0) {
    if (metricCount === 0) {
      return {
        ok: false,
        expected: 1,
        actual: 0,
        reason: 'no causal oracle declared',
        unconsumed: [],
        consumedIds: [],
      };
    }
    return { ok: true, expected: 0, actual: 0, reason: null, unconsumed: [], consumedIds: [] };
  }
  const results = Array.isArray(oracleResults) ? oracleResults : [];
  const unconsumed = [];
  const consumedIds = [];

  for (let i = 0; i < declared.length; i++) {
    const a = declared[i];
    const matches = results.filter((r) => resultMatchesAssertion(r, a));
    if (matches.length !== 1) {
      unconsumed.push({
        index: i,
        kind: a && a.kind,
        metric: a && a.metric,
        matchCount: matches.length,
      });
    } else {
      consumedIds.push(matches[0].id || a.kind || i);
    }
  }

  if (unconsumed.length) {
    return {
      ok: false,
      expected: declared.length,
      actual: declared.length - unconsumed.length,
      reason: `${unconsumed.length} assertion(s) not consumed exactly once`,
      unconsumed,
      consumedIds,
    };
  }
  return {
    ok: true,
    expected: declared.length,
    actual: declared.length,
    reason: null,
    unconsumed: [],
    consumedIds,
  };
}

function resultMatchesAssertion(result, assertion) {
  if (!result || !assertion) return false;
  const kind = assertion.kind;
  if (kind === 'metric' || kind === 'quantitative') {
    if (!assertion.metric) return false;
    const metricKey = assertion.metric.includes('@') ? assertion.metric : `${assertion.metric}@1`;
    // H11: only match assertion-sourced results, not declared metric emissions (same id, 2×).
    if (result.source === 'metric') return false;
    return result.family === 'quantitative'
      && (result.source === 'assertion' || result.source == null)
      && (result.id === metricKey
        || result.id === assertion.metric
        || (typeof result.id === 'string' && result.id.startsWith(assertion.metric)));
  }
  if (kind === 'equivalence') {
    const name = assertion.equivalence || assertion.expected || assertion.signal || 'run-eq-repeat';
    return result.family === 'equivalence' && (result.id === name || result.id === assertion.equivalence);
  }
  if (kind === 'never' || kind === 'holds' || kind === 'settles' || kind === 'eventByTick' || kind === 'temporal') {
    // Oracle emits ids like `never:${signal}`, `holds:${signal}`, `eventByTick:${signal}`,
    // or bare `settles` (see oracleEngine evaluateTemporal).
    if (result.family !== 'temporal') return false;
    const signal = assertion.signal || assertion.never || assertion.event;
    if (result.id === kind) return true;
    if (signal && result.id === signal) return true;
    if (signal && result.id === `${kind}:${signal}`) return true;
    if (kind === 'never' && signal && result.id === `never:${signal}`) return true;
    if (kind === 'temporal' && assertion.signal === 'settles' && result.id === 'settles') return true;
    return false;
  }
  return result.id === kind;
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

/** J1: canary field on player — serialized via save player blob, not a gameplay writer. */
export const LAB_SAVE_LOAD_CANARY_KEY = '__labSaveLoadCanary';

/**
 * J1: inject a canary into live player state before serialize, poison it after serialize,
 * then verify loadEnvelope actually restored the pre-save canary value.
 * An adversarial loadEnvelope that only returns true leaves the poison and fails.
 *
 * @returns {{ ok: true, canaryValue: string } | { ok: false, reason: string, expected?: string, actual?: unknown }}
 */
export function injectSaveLoadCanary(state) {
  if (!state || !state.player || typeof state.player !== 'object') {
    return { ok: false, reason: 'save-load-canary-unavailable: missing state.player' };
  }
  const seed = state.meta && state.meta.seed != null ? state.meta.seed : 0;
  const simTime = Number.isFinite(state.simTime) ? state.simTime : 0;
  const canaryValue = `sf-canary:${seed}:${simTime}`;
  state.player[LAB_SAVE_LOAD_CANARY_KEY] = canaryValue;
  return { ok: true, canaryValue };
}

export function poisonSaveLoadCanary(state) {
  if (state && state.player && typeof state.player === 'object') {
    state.player[LAB_SAVE_LOAD_CANARY_KEY] = '__lab_canary_poison_no_restore__';
  }
}

export function verifySaveLoadCanary(state, canaryValue) {
  const actual = state && state.player ? state.player[LAB_SAVE_LOAD_CANARY_KEY] : undefined;
  if (actual !== canaryValue) {
    return {
      ok: false,
      reason: 'save-load-canary-mismatch: loadEnvelope did not restore serialized state',
      expected: canaryValue,
      actual,
    };
  }
  // Drop the lab-only field so it does not leak into subsequent sim ticks.
  if (state && state.player && Object.prototype.hasOwnProperty.call(state.player, LAB_SAVE_LOAD_CANARY_KEY)) {
    delete state.player[LAB_SAVE_LOAD_CANARY_KEY];
  }
  return { ok: true };
}

/**
 * Real serialize → loadEnvelope round-trip only. Never claim success without a restore (FIX 3).
 * J1: restoreCount is only awarded when a pre-save canary is observed restored after load —
 * loadEnvelope returning true is not sufficient.
 * H10: recreate the runtime from the envelope so system-local state cannot survive outside the
 * save surface. Caller must swap runtime/state/input driver from the returned handles.
 *
 * @returns {{ ok: boolean, restoreCount?: number, runtime?: object, state?: object, exitClass?: number, status?: string, reason?: string, coverageGaps?: string[] }}
 */
export async function performSaveLoad(runtime, state, options = {}) {
  const saveSys = runtime.getSystem('save');
  if (saveSys && typeof saveSys.serialize === 'function' && typeof saveSys.loadEnvelope === 'function') {
    try {
      const canary = injectSaveLoadCanary(state);
      if (!canary.ok) {
        return { ok: false, exitClass: 3, status: 'infra', reason: canary.reason };
      }
      const envelope = saveSys.serialize('lab-save-load');
      // Poison live state after capture so a no-op loadEnvelope cannot pass.
      poisonSaveLoadCanary(state);
      const profileId = (runtime.config && runtime.config.profileId) || 'production';
      const systems = options.systems || (runtime.liveSystems
        ? runtime.liveSystems
        : null);
      const recreateSystems = Array.isArray(options.systemsForRecreate)
        ? options.systemsForRecreate
        : (Array.isArray(systems) ? systems : null);

      // F1: production save/load is in-place loadEnvelope on the live runtime. Full runtime
      // recreate drops system-private continuity (flight frame, Rapier body identity) and was
      // the source of mid-run divergence that reconverged to a false-green final hash.
      // Default = in-place (player-route fidelity). Opt into recreate with recreateRuntimeOnSaveLoad.
      const wantRecreate = options.recreateRuntimeOnSaveLoad === true
        && recreateSystems
        && recreateSystems.length > 0;

      if (!wantRecreate) {
        const ok = saveSys.loadEnvelope(envelope, 'lab-save-load');
        if (!ok) {
          return { ok: false, exitClass: 3, status: 'infra', reason: 'save loadEnvelope returned false' };
        }
        const canaryCheck = verifySaveLoadCanary(state, canary.canaryValue);
        if (!canaryCheck.ok) {
          return {
            ok: false,
            exitClass: 3,
            status: 'infra',
            reason: canaryCheck.reason,
            restoreCount: 0,
          };
        }
        if (state.settings && state.settings.gameplay) {
          state.settings.gameplay.flightBackend = 'v3';
        }
        // Soft prepare: re-bind without destroying restored body state.
        const physicsSys = runtime.getSystem('physics');
        if (physicsSys && typeof physicsSys.prepareBackend === 'function') {
          await physicsSys.prepareBackend(state, { reset: false });
        }
        return {
          ok: true,
          restoreCount: 1,
          runtime,
          state,
          coverageGaps: options.recreateRuntimeOnSaveLoad === true
            ? ['runtime-not-recreated: missing systems list for recreate path']
            : ['in-place-restore: player-route loadEnvelope fidelity'],
        };
      }

      const next = createAuthoritativeRuntime({
        profileId,
        seed: state.meta && state.meta.seed,
        systems: recreateSystems,
        seedProcessMaps: options.seedProcessMaps,
      });
      const nextSave = next.getSystem('save');
      if (!nextSave || typeof nextSave.loadEnvelope !== 'function') {
        next.dispose();
        return {
          ok: false,
          exitClass: 4,
          status: 'unsupported',
          reason: 'recreated runtime missing save.loadEnvelope',
        };
      }
      const ok = nextSave.loadEnvelope(envelope, 'lab-save-load');
      if (!ok) {
        next.dispose();
        return { ok: false, exitClass: 3, status: 'infra', reason: 'save loadEnvelope returned false on recreated runtime' };
      }
      const canaryCheck = verifySaveLoadCanary(next.state, canary.canaryValue);
      if (!canaryCheck.ok) {
        next.dispose();
        return {
          ok: false,
          exitClass: 3,
          status: 'infra',
          reason: canaryCheck.reason,
          restoreCount: 0,
        };
      }
      // Preserve runtime profile binding after restore (H15 strips it from the envelope).
      if (next.state && next.state.settings && next.state.settings.gameplay) {
        next.state.settings.gameplay.flightBackend = 'v3';
        next.state.settings.gameplay.runtimeProfile = profileId;
      }
      if (next.config) {
        bindRuntimeToState(next.state, next.config, next.manifest);
      }
      const physicsSys = next.getSystem('physics');
      if (physicsSys && typeof physicsSys.prepareBackend === 'function') {
        await physicsSys.prepareBackend(next.state, { reset: false });
      }
      return {
        ok: true,
        restoreCount: 1,
        runtime: next,
        state: next.state,
        coverageGaps: [
          'input-tape-keys-reset-on-recreate',
          'system-private-nonserialized-state-dropped',
        ],
      };
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
 * FIX 13: anchorMass resolves from the canonical attachment's targetAlias (tether target),
 * not entity insertion order.
 * FIX 15: when anchorMass cannot resolve a target, report unapplied (never silent-skip as applied).
 * @returns {{ unapplied: Record<string, string> }}
 */
function applyLabParamOverlays(state, aliasMap, playerEntity, params = {}, attachments = []) {
  const unapplied = {};
  if (!params || typeof params !== 'object') return { unapplied };

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
    const target = resolveAnchorMassTarget(state, aliasMap, attachments);
    if (target) {
      target.mass = params.anchorMass;
      if (target.physicsBody) {
        target.physicsBody.mass = params.anchorMass;
        target.physicsBody.inertiaY = params.anchorMass * 8;
        target.physicsBody.revision = (target.physicsBody.revision | 0) + 1;
      }
    } else {
      // Deferred apply failed — caller must not list this path under overlayApplied.
      unapplied['lab.anchorMass'] = 'no-resolvable-target';
    }
  }

  return { unapplied };
}

/**
 * Resolve the entity that lab.anchorMass should rewrite (FIX 13) and that makeSample
 * should observe (FIX 14). Prefer the first attachment's targetAlias (the real tether
 * target); fall back to alias "anchor". Never use insertion-order heuristics.
 */
function resolveAnchorMassTarget(state, aliasMap, attachments = []) {
  const attList = Array.isArray(attachments) ? attachments : [];
  for (const att of attList) {
    const targetAlias = att && att.targetAlias;
    if (typeof targetAlias === 'string' && targetAlias && aliasMap[targetAlias] != null) {
      const e = state.entities.get(aliasMap[targetAlias]);
      if (e) return e;
    }
  }
  if (aliasMap.anchor != null) {
    const e = state.entities.get(aliasMap.anchor);
    if (e) return e;
  }
  return null;
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

  if (ctx.attachmentId && ctx.kernel) {
    const att = ctx.kernel.attachments.get(ctx.attachmentId);
    const host = player;
    // FIX 14: observe the resolved tether/anchorMass target, not first non-player alias.
    // Prefer live attachment.targetId (authoritative); fall back to pre-resolved sampleTargetId.
    let anchor = null;
    if (att && att.targetId != null) {
      anchor = state.entities.get(att.targetId) || null;
    }
    if (!anchor && ctx.sampleTargetId != null) {
      anchor = state.entities.get(ctx.sampleTargetId) || null;
    }
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
