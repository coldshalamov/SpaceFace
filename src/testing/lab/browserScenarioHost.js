// Browser-side authoritative scenario host (Phase 4 §15).
// Runs createAuthoritativeRuntime + focused flight systems with rendering detached.
// No node:crypto — returns surfaces; Node hashes with hashDeterministicSurface.
// Loaded by chromiumHostPage.html via the zero-build ESM/importmap path.

import { createAuthoritativeRuntime } from '../../runtime/createAuthoritativeRuntime.js';
import { SIM_DT } from '../../core/sim.js';
import { actions } from '../../systems/actions.js';
import { flightV3 } from '../../systems/flightV3.js';
import { weapons } from '../../systems/weapons.js';
import { physics } from '../../core/physics.js';
import { buildEntitySpawnSpec } from './entityProfiles.js';
import { createInputTapeDriver, hashInputTape } from './inputTape.js';
import { buildDeterministicSurface } from './deterministicSurface.js';
import { evaluateOracles } from './oracleEngine.js';
import { assertAssertionsConsumed } from './assertionConsumption.js';
import { validateCanonicalScenario } from '../../contracts/simScenarioSchema.js';
// Side-effect: register flight + massline metrics used by evaluateOracles.
import '../metrics/masslineMetrics.js';

/** Focused flight systems only — no scripts/ node:crypto imports. */
export const BROWSER_FOCUSED_FLIGHT_SYSTEMS = Object.freeze([
  actions,
  flightV3,
  weapons,
  physics,
]);

/**
 * Exact ordered system names Chromium parity V1 runs.
 * Explicit `canonical.systems` must match this sequence after normalization
 * (drop `core`, map `flight` → `flightV3`). Reorders and duplicates are rejected.
 */
export const BROWSER_PARITY_SYSTEM_NAMES = Object.freeze([
  'actions',
  'flightV3',
  'weapons',
  'physics',
]);

/**
 * Chromium parity V1 supports the focused flight bundle only.
 * Scenarios that require massline/attachments/save (or non-flight fixtures) must be
 * rejected rather than silently compared under a different system set.
 * @param {object} canonical
 * @returns {{ ok: true } | { ok: false, status: string, reason: string }}
 */
export function assertChromiumParitySupported(canonical) {
  if (!canonical || typeof canonical !== 'object') {
    return { ok: false, status: 'unsupported', reason: 'canonical required' };
  }
  const fixture = canonical.world?.fixtureProfile;
  if (fixture && fixture !== 'flight' && fixture !== 'empty-flight') {
    return {
      ok: false,
      status: 'unsupported',
      reason: `unsupported scenario for Chromium parity: fixtureProfile=${fixture} (V1 supports flight only)`,
    };
  }
  const attachments = Array.isArray(canonical.attachments) ? canonical.attachments : [];
  if (attachments.length > 0) {
    return {
      ok: false,
      status: 'unsupported',
      reason: 'unsupported scenario for Chromium parity: attachments require massline bundle (not mirrored in Chromium V1)',
    };
  }
  const wantsSave = (canonical.assertions || []).some(
    (a) => a.kind === 'equivalence' && (
      a.equivalence === 'uninterrupted-eq-save-load'
      || a.equivalence === 'save-load'
      || a.expected === 'uninterrupted-eq-save-load'
    ),
  ) || (canonical.checkpoints || []).some((c) => c.kind === 'save-load');
  if (wantsSave) {
    return {
      ok: false,
      status: 'unsupported',
      reason: 'unsupported scenario for Chromium parity: save/load not mirrored in Chromium V1 host',
    };
  }

  // FIX 8/11: require the EXACT ordered browser bundle (no sort). Chromium always runs
  // BROWSER_FOCUSED_FLIGHT_SYSTEMS in registration order; a reordered Node list is a different runtime.
  // Drop `core`, map `flight` → `flightV3`, then require sequence identity (duplicates fail length/order).
  if (Array.isArray(canonical.systems) && canonical.systems.length) {
    const got = normalizeBrowserSystemNamesPreserveOrder(canonical.systems);
    const expected = BROWSER_PARITY_SYSTEM_NAMES;
    const exactMatch = got.length === expected.length
      && got.every((name, i) => name === expected[i]);
    if (!exactMatch) {
      return {
        ok: false,
        status: 'unsupported',
        reason: `unsupported scenario for Chromium parity: systems must be exact ordered browser flight bundle [${expected.join(', ')}] (got [${got.join(', ')}])`,
      };
    }
  }

  // FIX 9/12: Node applies parameterOverlay values; Chromium V1 does not.
  // Empty wrapper { schema, version, values: {} } is a no-op on both arms — allow it.
  // Only non-empty values are unsupported for Chromium parity.
  if (canonical.parameterOverlay && typeof canonical.parameterOverlay === 'object') {
    const values = canonical.parameterOverlay.values;
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      const valueKeys = Object.keys(values);
      if (valueKeys.length > 0) {
        return {
          ok: false,
          status: 'unsupported',
          reason: `unsupported scenario for Chromium parity: parameterOverlay not applied in Chromium host (${valueKeys.join(', ')})`,
        };
      }
    }
  }
  const tapeCommands = collectTapeCommands(canonical);
  if (tapeCommands.length > 0) {
    return {
      ok: false,
      status: 'unsupported',
      reason: 'unsupported scenario for Chromium parity: tape frame commands not applied in Chromium host',
    };
  }

  return { ok: true };
}

/**
 * Normalize named systems preserving order (no unique/dedupe).
 * Drop `core`, map `flight` → `flightV3`. Used for exact-order parity gates.
 */
export function normalizeBrowserSystemNamesPreserveOrder(names) {
  const out = [];
  for (const raw of names || []) {
    if (raw === 'core') continue;
    const name = raw === 'flight' ? 'flightV3' : raw;
    out.push(name);
  }
  return out;
}

/** Normalize named systems: drop `core`, map `flight` → `flightV3`, unique (first occurrence order). */
export function normalizeBrowserSystemNames(names) {
  const out = [];
  const seen = new Set();
  for (const raw of names || []) {
    if (raw === 'core') continue;
    const name = raw === 'flight' ? 'flightV3' : raw;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function collectTapeCommands(canonical) {
  // L3: consume inputTape exclusively — no raw frames fallback when tape is absent.
  const tape = canonical.inputTape;
  if (!tape || typeof tape !== 'object') return [];
  const frames = Array.isArray(tape.frames) ? tape.frames : [];
  const out = [];
  for (const frame of frames) {
    if (Array.isArray(frame?.commands) && frame.commands.length) {
      out.push(...frame.commands);
    }
  }
  return out;
}

/**
 * PUBLIC certifying browser path — accepts ONLY a compiled canonical.
 * Callers cannot inject systems, equivalence, or skipMultiRunEquivalence.
 * Internally resolves focused flight systems and evaluates oracles with zero DI.
 *
 * @param {object} canonical
 * @returns {Promise<object>}
 */
export async function runBrowserLabScenario(canonical) {
  // P2: reject any second-argument DI — same contract as Node runLabScenario.
  if (arguments.length > 1 && arguments[1] != null) {
    return {
      ok: false,
      status: 'invalid-config',
      certifying: false,
      nonPromoting: false,
      focusedSystems: true,
      error: 'runBrowserLabScenario accepts only (canonical) — options injection is forbidden; '
        + 'use runBrowserLabScenarioInternal for non-certifying tests',
    };
  }
  const internal = await runBrowserLabScenarioInternal(canonical, {});
  return promoteBrowserCertifyingResult(internal);
}

/**
 * Promote a zero-DI internal browser result to a certifying public result.
 */
function promoteBrowserCertifyingResult(internal) {
  if (!internal || typeof internal !== 'object') {
    return {
      ok: false,
      status: 'infra',
      certifying: false,
      nonPromoting: false,
      focusedSystems: true,
      error: 'internal browser runner returned no result',
    };
  }
  const { nonPromoting: _np, ...rest } = internal;
  return {
    ...rest,
    nonPromoting: false,
    certifying: true,
    focusedSystems: true,
  };
}

/**
 * Stamp every internal-path browser result so it cannot be mistaken for certification.
 */
function markBrowserNonPromoting(result) {
  if (!result || typeof result !== 'object') {
    return {
      ok: false,
      status: 'infra',
      nonPromoting: true,
      certifying: false,
      focusedSystems: true,
      error: 'internal browser runner returned no result',
    };
  }
  return {
    ...result,
    nonPromoting: true,
    certifying: false,
    focusedSystems: true,
  };
}

/**
 * INTERNAL non-certifying browser runner — injectable seams for unit tests and parent child-arms.
 * Always marked nonPromoting. Test seams (mock systems, equivalence, skip flags) go here.
 *
 * @param {object} canonical
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runBrowserLabScenarioInternal(canonical, options = {}) {
  return markBrowserNonPromoting(await runBrowserLabScenarioInternalBody(canonical, options));
}

/**
 * @param {object} canonical
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function runBrowserLabScenarioInternalBody(canonical, options = {}) {
  if (!canonical || typeof canonical !== 'object') {
    return { ok: false, status: 'invalid-config', error: 'canonical required' };
  }

  // M4: same schema validation surface as Node — no certification without validateCanonicalScenario.
  const canonicalValidation = validateCanonicalScenario(canonical, { file: options.file });
  if (!canonicalValidation.ok) {
    return {
      ok: false,
      status: 'invalid-config',
      error: 'canonical scenario failed schema validation',
      validation: canonicalValidation,
    };
  }

  const support = assertChromiumParitySupported(canonical);
  if (!support.ok) {
    return {
      ok: false,
      status: support.status,
      error: support.reason,
      chromiumSupport: support,
    };
  }

  const dt = canonical.dt || SIM_DT;
  const ticks = canonical.ticks | 0;
  const checkpointEvery = Math.max(1, (options.checkpointEvery | 0) || Math.max(1, Math.floor(ticks / 3) || 1));
  const checkpointTicks = new Set(
    Array.isArray(options.checkpointTicks)
      ? options.checkpointTicks.map((t) => t | 0)
      : defaultCheckpointTicks(ticks, checkpointEvery),
  );
  // Always include final tick.
  if (ticks > 0) checkpointTicks.add(ticks - 1);

  const scenarioDigest = options.scenarioDigest || null;
  const inputDigest = options.inputDigest || hashInputTape(canonical.inputTape);
  // P2 public path always uses fixed focused systems; internal may inject for tests.
  const systems = options.systems || [...BROWSER_FOCUSED_FLIGHT_SYSTEMS];

  let runtime = null;
  try {
    runtime = createAuthoritativeRuntime({
      profileId: canonical.runtimeProfile === 'focused-lab' ? 'production' : (canonical.runtimeProfile || 'production'),
      seed: canonical.seed,
      systems,
      // H1: production-profile steps seed process MAPS by default.
      seedProcessMaps: options.seedProcessMaps,
    });

    const state = runtime.state;
    state.mode = canonical.world?.mode || 'flight';
    state.settings = state.settings || {};
    state.settings.gameplay = state.settings.gameplay || {};
    state.settings.gameplay.physicsBackend = canonical.world?.physicsBackend || 'rapier-dynamic';
    state.settings.gameplay.flightBackend = canonical.world?.flightBackend || 'v3';
    state.settings.gameplay.aiBackend = canonical.world?.aiBackend || 'legacy';
    if (state.world) state.world.currentSectorId = canonical.world?.sectorId;
    if (state.player && Number.isFinite(canonical.world?.credits)) {
      state.player.credits = canonical.world.credits;
    }

    const aliasMap = Object.create(null);
    for (const ent of canonical.entities || []) {
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
      }
    }

    const physicsSys = runtime.getSystem('physics');
    if (physicsSys && typeof physicsSys.prepareBackend === 'function') {
      const ready = await physicsSys.prepareBackend(state, {});
      const sg02Ready = !!(state.physicsRuntime?.diagnostics?.sg02Ready);
      if (ready !== true || !sg02Ready) {
        runtime.dispose();
        return {
          ok: false,
          status: 'infra',
          error: 'SG-02 dynamic authority failed to become ready in Chromium',
        };
      }
    }

    // L3: consume canonical.inputTape exclusively.
    if (!canonical.inputTape || typeof canonical.inputTape !== 'object') {
      runtime.dispose();
      return {
        ok: false,
        status: 'invalid-config',
        error: 'canonical.inputTape is required — runner does not fall back to raw fields',
      };
    }
    const inputDriver = createInputTapeDriver(canonical.inputTape, {
      allowMasslinePacketOverride: canonical.evidenceClass !== 'public-input',
    });

    const series = [];
    const oracleTrace = [];
    const meta = { scenarioDigest, inputDigest, dt };

    for (let tick = 0; tick < ticks; tick++) {
      const host = state.entities.get(state.playerId);
      const tetherAttached = !!(state.player?.tether?.active);
      inputDriver.apply(state, tick, dt, {
        playerEntity: host,
        tetherAttached,
      });
      runtime.step(dt);

      // FIX 7: every-tick oracle stream (same engine as Node arm).
      oracleTrace.push(makeFlightOracleSample(tick, state));

      if (checkpointTicks.has(tick)) {
        const surface = buildDeterministicSurface(state, meta);
        series.push({
          tick,
          surface,
          // Hash filled on Node for parity with buildDeterministicCoveredCheckpoint.
        });
      }
    }

    // FIX 7: evaluate scenario assertions/metrics — host success alone is not oracle pass.
    // G4/differential: multi-run equivalences are owned by parent compare/repeat/diff —
    // skip deferred incomplete when parent will evaluate (or has already).
    // P2: only internal path may accept caller equivalence / skip flags.
    const oracleEval = evaluateOracles({
      trace: oracleTrace,
      metrics: canonical.metrics || [],
      assertions: canonical.assertions || [],
      ctx: {},
      equivalence: options.equivalence || {},
      skipMultiRunEquivalence: options.skipMultiRunEquivalence === true,
      scenarioDigest,
    });
    // M4: same assertion-consumption guard as Node runLabScenario.
    // N3: parent-owned multi-run equivalences are not required on child arms.
    const assertionConsumption = assertAssertionsConsumed(
      canonical.assertions,
      oracleEval.results,
      {
        metrics: canonical.metrics,
        skipMultiRunEquivalence: options.skipMultiRunEquivalence === true,
      },
    );
    const deferredEq = (oracleEval.results || []).filter(
      (r) => r.family === 'equivalence' && r.deferred,
    );
    const hasDeferred = deferredEq.length > 0;
    const oracleOk = oracleEval.ok && assertionConsumption.ok && !hasDeferred;
    const oracleFailed = [
      ...(oracleEval.failed || []),
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
    const oracle = {
      ok: oracleOk,
      firstBadTick: oracleEval.firstBadTick,
      failed: oracleFailed,
      results: [
        ...(oracleEval.results || []),
        ...(!assertionConsumption.ok ? oracleFailed.slice(-1) : []),
      ],
    };

    const finalSurface = buildDeterministicSurface(state, meta);
    const fingerprint = runtime.fingerprint
      ? {
        profileHash: runtime.fingerprint.profileHash,
        manifestHash: runtime.fingerprint.manifestHash,
      }
      : null;

    runtime.dispose();
    runtime = null;

    return {
      // ok tracks oracle (mirrors Node runLabScenario) — not merely "host did not throw".
      ok: oracle.ok,
      status: oracle.ok ? 'pass' : 'fail',
      schema: 'spaceface.labChromiumRun.v1',
      scenarioId: canonical.id,
      seed: canonical.seed,
      ticks,
      scenarioDigest,
      inputDigest,
      fingerprint,
      rendering: { detached: true },
      series,
      finalSurface,
      oracle,
      exactWithin: { crossRuntime: false },
      focusedSystems: true,
    };
  } catch (err) {
    if (runtime) {
      try { runtime.dispose(); } catch (_) { /* best-effort */ }
    }
    return {
      ok: false,
      status: 'infra',
      error: err && err.message ? err.message : String(err),
      stack: err && err.stack ? String(err.stack).slice(0, 2000) : undefined,
      focusedSystems: true,
    };
  }
}

function defaultCheckpointTicks(ticks, every) {
  const out = [];
  for (let t = every - 1; t < ticks; t += every) out.push(t);
  if (ticks > 0 && (out.length === 0 || out[out.length - 1] !== ticks - 1)) {
    out.push(ticks - 1);
  }
  return out;
}

/**
 * Flight-focused oracle sample (mirrors runScenario makeSample player fields).
 * No massline/attachment fields — those scenarios are rejected for Chromium V1.
 * Preserve non-finite numbers so invariant.finiteState can detect NaN/Infinity.
 */
function makeFlightOracleSample(tick, state) {
  const player = state.entities.get(state.playerId);
  return {
    tick: tick | 0,
    playerX: round6Preserve(player && player.pos && player.pos.x),
    playerZ: round6Preserve(player && player.pos && player.pos.z),
    playerVelX: round6Preserve(player && player.vel && player.vel.x),
    playerVelZ: round6Preserve(player && player.vel && player.vel.z),
    playerRot: round6Preserve(player && player.rot),
    playerAlive: !!(player && player.alive),
    hull: round6Preserve(player && player.hull),
    cap: round6Preserve(player && player.cap),
    credits: round6Preserve(state.player && state.player.credits),
    tetherActive: !!(state.player && state.player.tether && state.player.tether.active),
  };
}

function round6Preserve(n) {
  if (n == null) return n;
  const num = Number(n);
  if (!Number.isFinite(num)) return num;
  return Math.round(num * 1e6) / 1e6;
}

// Expose for the host page. Public zero-DI entry + internal for parent/host drivers.
if (typeof window !== 'undefined') {
  window.__SF_BROWSER_LAB__ = {
    runBrowserLabScenario,
    runBrowserLabScenarioInternal,
    assertChromiumParitySupported,
    BROWSER_FOCUSED_FLIGHT_SYSTEMS,
    BROWSER_PARITY_SYSTEM_NAMES,
  };
}
