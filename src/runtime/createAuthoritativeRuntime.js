// Builds an isolated authoritative runtime instance bound to a profile.
//
// Feature config is instance-local and immutable after init (`runtime.config.features` /
// `state.runtime.features`). Process-global flag MAPS (`COMBAT_FLAGS` / `MASSLINE2_FLAGS` /
// `TRAVEL_FLAGS`) are still what most call sites read via combatFlag/massline2Flag/travelFlag
// without a runtime argument. To keep multi-profile lab hosts honest, this runtime uses
// **restore-on-step** isolation:
//
//   - Before init and each step/runTicks, the instance's feature config is applied to the MAPS.
//   - After that call returns, the previous MAP snapshot is restored.
//
// This makes sequential multi-profile replay safe in one process. It does **not** support two
// runtimes stepping concurrently (overlapping awaits / worker-shared maps); serialize steps.
// Long-term, call sites should take an explicit features/runtime argument (directive preferred).

import { createSimulation } from '../core/sim.js';
import {
  applyFeatureConfigToMaps,
  snapshotFeatureMaps,
  restoreFeatureMaps,
} from '../data/featureFlags.js';
import { resolveRuntimeManifest } from './resolveRuntimeManifest.js';
import { freezeFeatureConfig, getRuntimeProfile } from './runtimeProfiles.js';

/**
 * @param {object} options
 * @param {string} [options.profileId]
 * @param {number} [options.seed]
 * @param {object} [options.state]
 * @param {object} [options.bus]
 * @param {object} [options.helpers]
 * @param {object[]} [options.systems] focused explicit systems (honest evidence)
 * @param {Map|object} [options.systemLookup] materialize full profile systems
 * @param {{ aiSlot?: object, flightSlot?: object, aiBackend?: string, flightBackend?: string }} [options.slots]
 * @param {boolean} [options.nodeSafeOnly]
 * @param {boolean} [options.tacticalAI]
 * @param {boolean} [options.seedProcessMaps] when true, bind MAPS for the duration of init/step only
 * @param {boolean} [options.restoreProcessMapsOnDispose] retained for API compat; restore-on-step is the owner
 */
export function createAuthoritativeRuntime(options = {}) {
  const profileId = options.profileId || (options.systems ? null : 'production');
  const explicit = Array.isArray(options.systems) ? options.systems : null;

  const resolved = resolveRuntimeManifest({
    profileId: profileId || 'production',
    systemLookup: options.systemLookup,
    slots: options.slots,
    nodeSafeOnly: options.nodeSafeOnly,
    tacticalAI: options.tacticalAI,
    explicitSystems: explicit || undefined,
    exclusions: options.exclusions,
  });

  const config = Object.freeze({
    profileId: resolved.profileId,
    features: freezeFeatureConfig(resolved.features),
    evidenceClass: resolved.evidenceClass,
    exclusions: resolved.exclusions,
  });

  // Bind process MAPS only for the duration of init/step when seeding is enabled.
  // Default: seed for full profile runs; leave MAPS alone for focused empty/explicit lists
  // unless the caller opts in.
  const seedMaps = explicit
    ? options.seedProcessMaps === true
    : options.seedProcessMaps !== false;

  function withFeatureMaps(fn) {
    if (!seedMaps) return fn();
    const previous = snapshotFeatureMaps();
    applyFeatureConfigToMaps(config.features);
    try {
      return fn();
    } finally {
      restoreFeatureMaps(previous);
    }
  }

  const profile = getRuntimeProfile(resolved.profileId);
  let sim = null;

  if (options.createSimulation !== false) {
    let systemsForInit = explicit;
    let systemsForUpdate = null;

    if (!systemsForInit && resolved.authoritativeSystems) {
      // createSimulation always prepends core — strip it from the resolved init list.
      systemsForInit = resolved.authoritativeSystems.filter((s) => s && s.name !== 'core');
    }
    // Production path: step UPDATE_ORDER, not the init/registration list.
    // Focused explicit systems keep registration order (no separate update order).
    if (!explicit && resolved.authoritativeUpdateOrder) {
      systemsForUpdate = resolved.authoritativeUpdateOrder.slice();
    }

    if (systemsForInit || systemsForUpdate) {
      sim = withFeatureMaps(() => createSimulation({
        seed: options.seed,
        state: options.state,
        bus: options.bus,
        helpers: options.helpers,
        // Init list: registration order (or explicit focused list).
        systems: systemsForInit || systemsForUpdate,
        // Step list: authoritative update order when materialised (production parity).
        updateOrder: systemsForUpdate || undefined,
        runtimeManifest: resolved,
        runtimeConfig: config,
      }));
      if (sim.state) {
        bindRuntimeToState(sim.state, config, resolved);
      }
    }
  }

  const runtime = Object.freeze({
    schema: 'spaceface.authoritativeRuntime.v1',
    config,
    profile,
    manifest: resolved,
    fingerprint: Object.freeze({
      profileHash: resolved.profileHash,
      manifestHash: resolved.manifestHash,
    }),
    /**
     * Process-global MAP isolation mode for this host.
     * `restore-on-step` = sequential stepping only; not safe for concurrent multi-runtime steps.
     */
    featureMapIsolation: seedMaps ? 'restore-on-step' : 'instance-config-only',
    // Do NOT expose raw `sim` — callers must use step/runTicks so restore-on-step isolation runs.
    // state/bus are safe to surface; unwrapped sim.step would bypass withFeatureMaps entirely.
    state: sim ? sim.state : options.state || null,
    bus: sim ? sim.bus : options.bus || null,
    step(dt) {
      if (!sim) throw new Error('Authoritative runtime has no simulation host');
      return withFeatureMaps(() => sim.step(dt));
    },
    runTicks(count, dt) {
      if (!sim) throw new Error('Authoritative runtime has no simulation host');
      return withFeatureMaps(() => sim.runTicks(count, dt));
    },
    dispose() {
      if (sim && typeof sim.dispose === 'function') sim.dispose();
      // MAPS are restored after every step/init; nothing permanent to undo here.
    },
  });

  return runtime;
}

/** Attach read-only runtime binding onto game state for instance-local feature reads. */
export function bindRuntimeToState(state, config, resolved) {
  if (!state || typeof state !== 'object') return state;
  const binding = Object.freeze({
    profileId: config.profileId,
    features: config.features,
    evidenceClass: config.evidenceClass,
    exclusions: config.exclusions,
    profileHash: resolved && resolved.profileHash,
    manifestHash: resolved && resolved.manifestHash,
  });
  // Non-enumerable-ish plain field; systems may read state.runtime.features.
  state.runtime = binding;
  if (state.settings && state.settings.gameplay) {
    state.settings.gameplay.runtimeProfile = config.profileId;
  }
  return state;
}
