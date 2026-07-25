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

/** Focused flight systems only — no scripts/ node:crypto imports. */
export const BROWSER_FOCUSED_FLIGHT_SYSTEMS = Object.freeze([
  actions,
  flightV3,
  weapons,
  physics,
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
  // Named systems beyond the flight set are not mirrored.
  if (Array.isArray(canonical.systems) && canonical.systems.length) {
    const allowed = new Set(['core', 'actions', 'flightV3', 'flight', 'weapons', 'physics']);
    const extra = canonical.systems.filter((n) => !allowed.has(n));
    if (extra.length) {
      return {
        ok: false,
        status: 'unsupported',
        reason: `unsupported scenario for Chromium parity: systems [${extra.join(', ')}] not in browser flight bundle`,
      };
    }
  }
  return { ok: true };
}

/**
 * Run a compiled canonical scenario in the browser and return checkpoint surfaces.
 * @param {object} canonical
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function runBrowserLabScenario(canonical, options = {}) {
  if (!canonical || typeof canonical !== 'object') {
    return { ok: false, status: 'invalid-config', error: 'canonical required' };
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
  const systems = options.systems || [...BROWSER_FOCUSED_FLIGHT_SYSTEMS];

  let runtime = null;
  try {
    runtime = createAuthoritativeRuntime({
      profileId: canonical.runtimeProfile === 'focused-lab' ? 'production' : (canonical.runtimeProfile || 'production'),
      seed: canonical.seed,
      systems,
      seedProcessMaps: options.seedProcessMaps === true,
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

    const inputDriver = createInputTapeDriver(canonical.inputTape, {
      allowMasslinePacketOverride: canonical.evidenceClass !== 'public-input',
    });

    const series = [];
    const meta = { scenarioDigest, inputDigest, dt };

    for (let tick = 0; tick < ticks; tick++) {
      const host = state.entities.get(state.playerId);
      const tetherAttached = !!(state.player?.tether?.active);
      inputDriver.apply(state, tick, dt, {
        playerEntity: host,
        tetherAttached,
      });
      runtime.step(dt);

      if (checkpointTicks.has(tick)) {
        const surface = buildDeterministicSurface(state, meta);
        series.push({
          tick,
          surface,
          // Hash filled on Node for parity with buildDeterministicCoveredCheckpoint.
        });
      }
    }

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
      ok: true,
      status: 'pass',
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
      exactWithin: { crossRuntime: false },
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

// Expose for the host page.
if (typeof window !== 'undefined') {
  window.__SF_BROWSER_LAB__ = {
    runBrowserLabScenario,
    assertChromiumParitySupported,
    BROWSER_FOCUSED_FLIGHT_SYSTEMS,
  };
}
