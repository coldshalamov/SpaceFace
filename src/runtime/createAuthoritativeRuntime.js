// Builds an isolated authoritative runtime instance bound to a profile.
// Feature config is instance-local and immutable after init. Process-global flag
// MAPS may be seeded for call-site compatibility; each instance keeps its own
// frozen config so two profiles in one process do not share feature state.

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
 * @param {{ aiSlot?: object, flightSlot?: object }} [options.slots]
 * @param {boolean} [options.nodeSafeOnly]
 * @param {boolean} [options.tacticalAI]
 * @param {boolean} [options.seedProcessMaps] when true, seed module flag MAPS from profile
 * @param {boolean} [options.restoreProcessMapsOnDispose]
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

  // Bind immutable instance config. Optionally seed process MAPS for systems that still
  // read combatFlag/massline2Flag/travelFlag without a runtime argument.
  let mapSnapshot = null;
  if (options.seedProcessMaps !== false && !explicit) {
    mapSnapshot = snapshotFeatureMaps();
    applyFeatureConfigToMaps(config.features);
  } else if (explicit && options.seedProcessMaps === true) {
    mapSnapshot = snapshotFeatureMaps();
    applyFeatureConfigToMaps(config.features);
  }

  const profile = getRuntimeProfile(resolved.profileId);
  let sim = null;

  if (options.createSimulation !== false) {
    let systemsForSim = explicit;
    if (!systemsForSim && resolved.authoritativeSystems) {
      // createSimulation always prepends core — strip it from the resolved init list.
      systemsForSim = resolved.authoritativeSystems.filter((s) => s && s.name !== 'core');
    }
    if (systemsForSim) {
      sim = createSimulation({
        seed: options.seed,
        state: options.state,
        bus: options.bus,
        helpers: options.helpers,
        systems: systemsForSim,
        runtimeManifest: resolved,
        runtimeConfig: config,
      });
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
    sim,
    state: sim ? sim.state : options.state || null,
    bus: sim ? sim.bus : options.bus || null,
    step(dt) {
      if (!sim) throw new Error('Authoritative runtime has no simulation host');
      return sim.step(dt);
    },
    runTicks(count, dt) {
      if (!sim) throw new Error('Authoritative runtime has no simulation host');
      return sim.runTicks(count, dt);
    },
    dispose() {
      if (sim && typeof sim.dispose === 'function') sim.dispose();
      if (mapSnapshot && options.restoreProcessMapsOnDispose !== false) {
        restoreFeatureMaps(mapSnapshot);
        mapSnapshot = null;
      }
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
