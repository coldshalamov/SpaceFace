// Resolves a runtime profile into a structured manifest result (directive §5).
// Returns a frozen object — never a bare system array — so callers can inspect
// profileId, hashes, orders, slots, capabilities, and evidence classification.

import {
  getAuthoritativeInitOrder,
  getAuthoritativeUpdateOrder,
  getManifestIdentityPayload,
  getSystemCapability,
  isNodeSafeSystemId,
  isPresentationPlatformId,
  PRESENTATION_PLATFORM_IDS,
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from './authoritativeSystemManifest.js';
import { fingerprintPayload } from './runtimeFingerprint.js';
import {
  DEFAULT_RUNTIME_PROFILE_ID,
  freezeFeatureConfig,
  getRuntimeProfile,
} from './runtimeProfiles.js';

/**
 * @typedef {object} ResolveRuntimeManifestOptions
 * @property {string} [profileId]
 * @property {Map<string, object>|Record<string, object>} [systemLookup] materialize system objects
 * @property {{ aiSlot?: object, flightSlot?: object }} [slots]
 * @property {boolean} [nodeSafeOnly]
 * @property {boolean} [tacticalAI] legacy47a optional AI path
 * @property {object[]} [explicitSystems] focused-lab path — honest evidence, not production claim
 * @property {string[]} [exclusions]
 */

/**
 * @param {ResolveRuntimeManifestOptions} [options]
 */
export function resolveRuntimeManifest(options = {}) {
  const explicitSystems = Array.isArray(options.explicitSystems) ? options.explicitSystems : null;
  const profileId = options.profileId || DEFAULT_RUNTIME_PROFILE_ID;
  const profile = getRuntimeProfile(profileId);
  const features = freezeFeatureConfig(profile.features);
  const nodeSafeOnly = options.nodeSafeOnly === true;
  const tacticalAI = options.tacticalAI === true;

  let authoritativeSystemIds;
  let authoritativeUpdateOrderIds;
  let evidenceClass;
  let exclusions = Array.isArray(options.exclusions) ? options.exclusions.slice() : [];

  if (explicitSystems) {
    // Focused lab / harness path: caller-supplied systems. May NOT claim production-manifest evidence.
    authoritativeSystemIds = Object.freeze(
      explicitSystems.map((s) => (s && typeof s.name === 'string' ? s.name : String(s))),
    );
    authoritativeUpdateOrderIds = authoritativeSystemIds;
    evidenceClass = 'focused-explicit';
    exclusions.push('production-manifest-claim');
    exclusions.push('profile-full-system-set');
  } else {
    authoritativeSystemIds = getAuthoritativeInitOrder(profile.systemSet, {
      nodeSafeOnly,
      tacticalAI,
      includeCore: true,
    });
    authoritativeUpdateOrderIds = getAuthoritativeUpdateOrder(profile.systemSet, {
      nodeSafeOnly,
      tacticalAI,
      includeCore: false,
    });
    evidenceClass = profile.systemSet === 'production' ? 'production-manifest' : 'profile-manifest';
    if (nodeSafeOnly) {
      exclusions.push(...PRESENTATION_PLATFORM_IDS.map((id) => `node-excluded:${id}`));
    }
  }

  // Slot identities affect material runtime behavior (AI/flight backends). Include them in
  // the manifest hash so evidence/replay/cache consumers can distinguish different backends.
  const selectedSlots = resolveSelectedSlots(options.slots);

  const profileHash = fingerprintPayload({
    schema: 'spaceface.runtimeProfile.v1',
    profileId: profile.id,
    systemSet: profile.systemSet,
    features,
  });

  const manifestHash = fingerprintPayload({
    schema: 'spaceface.resolvedManifest.v1',
    profileId: profile.id,
    systemSet: profile.systemSet,
    authoritativeSystemIds,
    authoritativeUpdateOrderIds,
    features,
    evidenceClass,
    nodeSafeOnly,
    tacticalAI,
    selectedSlots: {
      aiSlot: selectedSlots.aiSlot,
      flightSlot: selectedSlots.flightSlot,
      aiBackend: selectedSlots.aiBackend,
      flightBackend: selectedSlots.flightBackend,
    },
    manifest: getManifestIdentityPayload(),
  });

  const capabilities = Object.freeze(
    Object.fromEntries(
      [...new Set([...authoritativeSystemIds, ...authoritativeUpdateOrderIds])].map((id) => [
        id,
        getSystemCapability(id),
      ]),
    ),
  );

  let authoritativeSystems = null;
  let authoritativeUpdateOrder = null;

  if (explicitSystems) {
    authoritativeSystems = Object.freeze(explicitSystems.slice());
    authoritativeUpdateOrder = authoritativeSystems;
  } else if (options.systemLookup) {
    const lookup = normalizeLookup(options.systemLookup);
    const slots = options.slots || {};
    authoritativeSystems = Object.freeze(
      materializeOrder(authoritativeSystemIds, lookup, slots, 'init'),
    );
    authoritativeUpdateOrder = Object.freeze(
      materializeOrder(authoritativeUpdateOrderIds, lookup, slots, 'update'),
    );
  }

  return Object.freeze({
    schema: 'spaceface.resolvedRuntimeManifest.v1',
    profileId: profile.id,
    profileHash,
    manifestHash,
    systemSet: profile.systemSet,
    features,
    authoritativeSystemIds,
    authoritativeUpdateOrderIds,
    authoritativeSystems,
    authoritativeUpdateOrder,
    selectedSlots,
    capabilities,
    evidenceClass,
    exclusions: Object.freeze(exclusions),
    nodeSafeOnly,
    // Convenience mirrors for tests/docs
    productionInitOrderReference: PRODUCTION_INIT_ORDER,
    productionUpdateOrderReference: PRODUCTION_UPDATE_ORDER,
  });
}

/**
 * Resolve selected AI/flight slot identities for hashing and inspection.
 * Prefer explicit `aiBackend` / `flightBackend` labels (createRegistry passes these) because
 * flight and flightV3 share the system name `'flight'`.
 *
 * @param {{ aiSlot?: object, flightSlot?: object, aiBackend?: string, flightBackend?: string }|null|undefined} slots
 */
function resolveSelectedSlots(slots) {
  const s = slots || {};
  const aiName = s.aiSlot && typeof s.aiSlot.name === 'string' ? s.aiSlot.name : null;
  const flightName = s.flightSlot && typeof s.flightSlot.name === 'string' ? s.flightSlot.name : null;

  let aiBackend = typeof s.aiBackend === 'string' && s.aiBackend ? s.aiBackend : null;
  let flightBackend = typeof s.flightBackend === 'string' && s.flightBackend ? s.flightBackend : null;

  if (!aiBackend && aiName) {
    if (aiName === 'tacticalAI') aiBackend = 'sg06-tactical';
    else if (aiName === 'ai') aiBackend = 'legacy';
    else aiBackend = aiName;
  }
  if (!flightBackend && flightName) {
    // Without an explicit label both V3 and legacy report name 'flight'.
    flightBackend = flightName;
  }

  return Object.freeze({
    aiSlot: aiName || 'aiSlot',
    flightSlot: flightName || 'flightSlot',
    aiBackend: aiBackend || 'unbound',
    flightBackend: flightBackend || 'unbound',
  });
}

function normalizeLookup(systemLookup) {
  if (systemLookup instanceof Map) return systemLookup;
  if (systemLookup && typeof systemLookup.get === 'function') return systemLookup;
  const map = new Map();
  if (systemLookup && typeof systemLookup === 'object') {
    for (const [k, v] of Object.entries(systemLookup)) map.set(k, v);
  }
  return map;
}

function materializeOrder(ids, lookup, slots, kind) {
  const out = [];
  for (const id of ids) {
    let system = null;
    if (id === 'aiSlot') {
      system = slots.aiSlot || lookup.get('aiSlot') || lookup.get('ai');
    } else if (id === 'flightSlot') {
      system = slots.flightSlot || lookup.get('flightSlot') || lookup.get('flight');
    } else {
      system = lookup.get(id);
    }
    if (!system) {
      throw new Error(`resolveRuntimeManifest: missing system "${id}" for ${kind} order`);
    }
    out.push(system);
  }
  return out;
}

/**
 * Compare two resolve results for authoritative identity (IDs + order + features).
 * Used by parity tests (Node vs browser-path materialization).
 */
export function authoritativeIdentityEqual(a, b) {
  if (!a || !b) return false;
  if (a.profileId !== b.profileId) return false;
  if (!arrayEqual(a.authoritativeSystemIds, b.authoritativeSystemIds)) return false;
  if (!arrayEqual(a.authoritativeUpdateOrderIds, b.authoritativeUpdateOrderIds)) return false;
  return JSON.stringify(a.features) === JSON.stringify(b.features);
}

function arrayEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export { isNodeSafeSystemId, isPresentationPlatformId };
