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
  // G7: explicit system lists bind slots from the actual system objects (not leave unbound).
  const selectedSlots = resolveSelectedSlots(options.slots, explicitSystems);

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
 * G7: when an explicit system list includes flightV3 / tacticalAI / legacy flight / ai,
 * bind the corresponding slot from the system object so V3 vs legacy hash differently.
 *
 * @param {{ aiSlot?: object, flightSlot?: object, aiBackend?: string, flightBackend?: string }|null|undefined} slots
 * @param {object[]|null|undefined} explicitSystems
 */
function resolveSelectedSlots(slots, explicitSystems = null) {
  const s = slots || {};
  let aiSlot = s.aiSlot || null;
  let flightSlot = s.flightSlot || null;
  let aiBackend = typeof s.aiBackend === 'string' && s.aiBackend ? s.aiBackend : null;
  let flightBackend = typeof s.flightBackend === 'string' && s.flightBackend ? s.flightBackend : null;

  if (Array.isArray(explicitSystems)) {
    for (const sys of explicitSystems) {
      if (!sys || typeof sys !== 'object') continue;
      const name = typeof sys.name === 'string' ? sys.name : '';
      if (name === 'tacticalAI') {
        aiSlot = sys;
        if (!aiBackend) aiBackend = 'sg06-tactical';
      } else if (name === 'ai') {
        aiSlot = sys;
        if (!aiBackend) aiBackend = 'legacy';
      } else if (name === 'flight' || name === 'flightV3') {
        flightSlot = sys;
        if (!flightBackend) flightBackend = detectFlightBackend(sys, name);
      }
    }
  }

  const aiName = aiSlot && typeof aiSlot.name === 'string' ? aiSlot.name : null;
  const flightName = flightSlot && typeof flightSlot.name === 'string' ? flightSlot.name : null;

  if (!aiBackend && aiName) {
    if (aiName === 'tacticalAI') aiBackend = 'sg06-tactical';
    else if (aiName === 'ai') aiBackend = 'legacy';
    else aiBackend = aiName;
  }
  if (!flightBackend && flightName) {
    flightBackend = flightName === 'flightV3' ? 'v3' : flightName;
  }

  return Object.freeze({
    aiSlot: aiName || 'aiSlot',
    flightSlot: flightName || 'flightSlot',
    aiBackend: aiBackend || 'unbound',
    flightBackend: flightBackend || 'unbound',
  });
}

/**
 * Distinguish flightV3 from legacy flight when both use system.name === 'flight'.
 * Uses implementation-specific methods (no circular imports of the system modules).
 */
function detectFlightBackend(sys, name) {
  if (name === 'flightV3') return 'v3';
  // flightV3 owns _stepCraft; legacy flight owns applyPlayerIntent.
  if (typeof sys._stepCraft === 'function') return 'v3';
  if (typeof sys.applyPlayerIntent === 'function') return 'legacy';
  // Cloned hosts may only expose update — prefer diag version when present.
  if (sys._diag && sys._diag.version === 3) return 'v3';
  return 'unbound-flight';
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
 * Compare two resolve results for authoritative identity (IDs + order + features + slots).
 * Used by parity tests (Node vs browser-path materialization).
 * F11: selectedSlots (and manifestHash when present) are required — otherwise tactical/legacy
 * or flight-backend drift can be certified as identical.
 */
export function authoritativeIdentityEqual(a, b) {
  if (!a || !b) return false;
  if (a.profileId !== b.profileId) return false;
  if (!arrayEqual(a.authoritativeSystemIds, b.authoritativeSystemIds)) return false;
  if (!arrayEqual(a.authoritativeUpdateOrderIds, b.authoritativeUpdateOrderIds)) return false;
  if (JSON.stringify(a.features) !== JSON.stringify(b.features)) return false;
  // F11: compare selectedSlots explicitly (manifest hash includes them when present).
  if (JSON.stringify(normalizeSlots(a.selectedSlots)) !== JSON.stringify(normalizeSlots(b.selectedSlots))) {
    return false;
  }
  if (a.manifestHash && b.manifestHash && a.manifestHash !== b.manifestHash) return false;
  return true;
}

function normalizeSlots(slots) {
  if (!slots || typeof slots !== 'object') return {};
  return {
    aiSlot: slots.aiSlot ?? null,
    flightSlot: slots.flightSlot ?? null,
    aiBackend: slots.aiBackend ?? null,
    flightBackend: slots.flightBackend ?? null,
  };
}

function arrayEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export { isNodeSafeSystemId, isPresentationPlatformId };
