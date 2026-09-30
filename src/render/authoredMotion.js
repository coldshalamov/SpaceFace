// Authored-motion driver (ANI-00): connects a bound motion bank to sim time and gameplay events.
//
// The contracts layer (motionBank.js) stays simulation-free; this module is the ship-side glue:
//   • attachAuthoredMotionDriver mounts per-frame + per-event surfaces on the ship root, beside
//     the damage/drive drivers the renderer already calls.
//   • installAuthoredMotionBus subscribes to gameplay events once per renderer and dispatches them
//     to the owning entity's controllers. Acceptance is strict: a scan pulse must carry the
//     scanner-owned source field and a monotonically increasing sequence, so a replayed or
//     foreign 'scan:pulse' cannot retrigger the dish.
//
// LOD rebind needs no code path of its own: bindAuthoredMotion holds every same-named pivot in
// the instance (one per mounted LOD file) and parks invisible subtrees at rest, so a level swap
// is just a visibility flip on an already-bound node.

import { bindAuthoredMotion } from '../contracts/motionBank.js';

const ACCEPTED_SCAN_SOURCE = 'player-scanner';

// entityId -> Set<controller>. entity.id is the durable join key the scanner payload carries.
const registry = new Map();

export function registerAuthoredMotionController(entityId, controller) {
  if (entityId == null || !controller) return;
  let set = registry.get(entityId);
  if (!set) {
    set = new Set();
    registry.set(entityId, set);
  }
  set.add(controller);
}

export function unregisterAuthoredMotionController(entityId, controller) {
  const set = registry.get(entityId);
  if (!set) return;
  set.delete(controller);
  if (!set.size) registry.delete(entityId);
}

export function authoredMotionControllersFor(entityId) {
  const set = registry.get(entityId);
  return set ? [...set] : [];
}

export function authoredMotionRegistrySize() {
  return registry.size;
}

/**
 * Bind one bank per bound pivot root and attach the composite driver to the ship root.
 *
 * Returns a detach callback for the render-package dispose path (a package generation swap or a
 * ship rebuild must not leak entity-keyed controller registrations).
 */
export function attachAuthoredMotionDriver(root, entity, controllers) {
  const entityId = entity && entity.id;
  const live = (controllers || []).filter(Boolean);
  if (!root || !live.length) return null;

  // Replace, don't accumulate: an entity rebuild rebinds fresh controllers on the same key, and
  // the stale set must release with its old root rather than keep updating detached pivots.
  registry.set(entityId, new Set(live));

  const detach = function detachAuthoredMotionDriver() {
    const set = registry.get(entityId);
    if (set) {
      for (const controller of live) set.delete(controller);
      if (!set.size) registry.delete(entityId);
    }
    if (root.userData.authoredMotionControllers === live) {
      delete root.userData.authoredMotionControllers;
      delete root.userData.updateAuthoredMotion;
      delete root.userData.authoredMotionEvent;
    }
    if (root.userData.detachAuthoredMotion === detach) {
      delete root.userData.detachAuthoredMotion;
    }
  };

  root.userData.authoredMotionControllers = live;
  root.userData.updateAuthoredMotion = function updateAuthoredMotion(liveEntity, simNow) {
    for (const controller of live) controller.update(simNow);
  };
  root.userData.authoredMotionEvent = function authoredMotionEvent(type, payload, simNow) {
    for (const controller of live) controller.handleEvent?.(type, payload, simNow);
  };
  // Named after the same userData-callback convention disposeObject already dispatches
  // (disposeWorldSitePresentation, releaseAuthoredAssetResidency, ...).
  root.userData.detachAuthoredMotion = detach;

  return detach;
}

/**
 * Wire gameplay events to bound controllers. Called once with the session bus, next to the other
 * motion-system bindEvents calls. `clock` supplies the current sim second for event payloads that
 * carry no simTime of their own (mining events don't). Returns an unbind function.
 */
export function installAuthoredMotionBus(bus, { clock } = {}) {
  if (!bus || typeof bus.on !== 'function') return null;
  const simNow = () => (typeof clock === 'function' ? Number(clock()) || 0 : 0);
  const dispatch = (type, entityId, payload, accept) => {
    if (entityId == null) return;
    for (const controller of authoredMotionControllersFor(entityId)) {
      if (!accept(controller)) continue;
      try {
        controller.handleEvent?.(type, payload, payload?.simTime ?? simNow());
      } catch (error) {
        console.warn(`[authoredMotion] ${type} rejected by controller`, error);
      }
    }
  };
  const onScanPulse = (payload) => {
    if (!payload || payload.source !== ACCEPTED_SCAN_SOURCE) return;
    dispatch('scan:pulse', payload.scannerId, payload, () => true);
  };
  // ANI-02: the mining head only deploys for cutter verbs — repair/transfer locks use other
  // tools, and salvage-pickup yields must never jab a parked head.
  const CUTTER_VERBS = new Set(['extract', 'cut']);
  const isCutterVerb = (payload) => CUTTER_VERBS.has(payload && payload.verb);
  const deployed = (controller) => controller.clipActive?.('deploy') || controller.clipActive?.('bite');
  const onMiningStart = (payload) => {
    if (!isCutterVerb(payload)) return;
    dispatch('mining:start', payload.minerId, payload, (c) => !deployed(c));
  };
  const onMiningYield = (payload) => {
    dispatch('mining:yield', payload.minerId, payload, deployed);
  };
  const onMiningStop = (payload) => {
    dispatch('mining:stop', payload.minerId, payload, deployed);
  };
  const onBeamDenied = (payload) => {
    if (!isCutterVerb(payload)) return;
    dispatch('beam:denied', payload.minerId, payload, deployed);
  };
  const unsubs = [
    bus.on('scan:pulse', onScanPulse),
    bus.on('mining:start', onMiningStart),
    bus.on('mining:yield', onMiningYield),
    bus.on('mining:stop', onMiningStop),
    bus.on('beam:denied', onBeamDenied),
  ];
  return function uninstallAuthoredMotionBus() {
    for (const unsub of unsubs) {
      if (typeof unsub === 'function') unsub();
    }
  };
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.digest !== 'function') return null;
  const digest = await subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetch and pin a motion bank referenced by a render-package runtime table
 * (runtime.motionBank = {uri, sha256, bytes, rigId}). The reference is the package's attestation
 * of which bank bytes it was compiled against; byte length and — where the host exposes WebCrypto
 * — SHA-256 are both enforced, so a swapped file fails closed instead of binding foreign channels.
 */
export async function loadMotionBank(ref, fetchImpl) {
  const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!ref || !fetcher) return null;
  if (typeof ref.uri !== 'string' || !ref.uri) {
    throw new Error('motion bank reference requires a uri.');
  }
  const response = await fetcher(ref.uri, { cache: 'no-cache' });
  if (!response || !response.ok) {
    throw new Error(`motion bank fetch failed: HTTP ${response && response.status} ${ref.uri}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (Number.isFinite(ref.bytes) && bytes.byteLength !== ref.bytes) {
    throw new Error(`motion bank byte length mismatch for ${ref.uri}: ${bytes.byteLength} != ${ref.bytes}.`);
  }
  if (typeof ref.sha256 === 'string' && /^[0-9a-f]{64}$/.test(ref.sha256)) {
    const digest = await sha256Hex(bytes);
    if (digest && digest !== ref.sha256) {
      throw new Error(`motion bank SHA-256 mismatch for ${ref.uri}: ${digest} != ${ref.sha256}.`);
    }
  }
  const doc = JSON.parse(new TextDecoder().decode(bytes));
  if (doc.rigId && ref.rigId && doc.rigId !== ref.rigId) {
    throw new Error(`motion bank rigId mismatch for ${ref.uri}: ${doc.rigId} != ${ref.rigId}.`);
  }
  return { ref, bank: doc };
}

/**
 * Bind a bank document onto an instantiated root. Thin wrapper that keeps the caller holding
 * {ref, bank} documents rather than raw banks.
 */
export function bindInstanceMotion(root, motionBank, options = {}) {
  if (!motionBank || !motionBank.bank) return null;
  return bindAuthoredMotion(root, motionBank.bank, options);
}
