// One residency manager for every drawable.
//
// The renderer had three ready-verdicts that disagreed: the bloom draw guard asked
// "is the program linked?" only while its scene scan was armed; the startup residency
// pass asked "is the buffer uploaded?" only for the subjects it was handed at boot; and
// the submit gate read flags the other two wrote at different times. A drawable created
// after the boot pass (VFX, tether, prop, a quality-tier swap) therefore drew first and
// uploaded or linked first, inside the presented frame — the 100-300 ms admission brick.
//
// This module owns the one question: may this drawable be submitted *now*, with its
// geometry resident on the GPU and its program linked? It answers with a per-drawable
// proof so a settled drawable costs a property read, and it turns "upload this" into a
// budgeted queue instead of an inline surprise.
//
// Lifecycle per drawable: requested -> loading -> uploading (budgeted) -> compiled ->
// visible. Nothing is submitted before its own data exists.
//
// Rules encoded here (no per-call allocation, no fades, no raised budgets):
//  - a geometry with the residency stamp draws immediately (proof hit);
//  - an unstamped geometry under the inline budget uploads in the draw that needs it and
//    is stamped afterwards, so a hit flash never waits a frame;
//  - anything larger is held: the root is hidden and queued, and the off-screen residency
//    pass (startupGpuResidency, the same path the warm roots use mid-flight) stamps it;
//  - a held root is never re-shown before its stamp lands;
//  - every non-progress path retries or releases. An upload error retries with backoff, a
//    full queue spills to `heldUnqueued` and is re-admitted when space frees, and a request
//    that outlives its TTL is retried once before failing open. A held drawable never stays
//    invisible with nothing queued.

/** Geometry bytes small enough to upload inside one drawn frame without a brick. */
export const RESIDENCY_INLINE_UPLOAD_BYTES = 32 * 1024;
/** Total inline upload bytes one presented frame may perform. */
export const RESIDENCY_FRAME_UPLOAD_BYTES = 96 * 1024;
/** A body closing on the glass inside this window is admission-urgent. */
export const RESIDENCY_LOOKAHEAD_S = 2;
/** userData flag: this root is held invisible until its geometry is resident. */
export const RESIDENCY_HELD = 'sfResidencyHeld';
/** userData flag: byte-census cache for one geometry. */
const GEOMETRY_BYTES = 'sfResidencyBytes';
const DELAY_SAMPLES = 256;
/** A request older than this gets one TTL retry before the hold deadline releases it. */
const RESIDENCY_REQUEST_TTL_MS = 1200;
/** Bound the queue: a pathological producer cannot grow it without limit. */
const RESIDENCY_MAX_PENDING = 64;
/** Upload attempts per root before the hold fails open instead of hiding it forever. */
const RESIDENCY_UPLOAD_ATTEMPTS = 3;
/** Failed-upload backoff: 250 ms, 500 ms, ... capped at 2 s. */
const RESIDENCY_RETRY_BASE_MS = 250;
const RESIDENCY_RETRY_MAX_MS = 2000;
/** One TTL expiry may refresh an attached request; the next expiry fails open. */
const RESIDENCY_REQUEST_RETRIES = 1;
/** A held drawable is released this long after its FIRST hold (never renewed). */
const RESIDENCY_HOLD_DEADLINE_MS = 2000;
/** One outstanding drain batch, selected for at most this long / this many roots. */
const RESIDENCY_DRAIN_BUDGET_MS = 6;
const RESIDENCY_DRAIN_MAX_ROOTS = 8;
/** A backlog larger than this drains at the burst cadence and a derived root count. */
const RESIDENCY_DRAIN_BURST_PENDING = 32;
const RESIDENCY_DRAIN_BASE_MS = 200;
const RESIDENCY_DRAIN_BURST_MS = 100;
const RESIDENCY_DRAIN_MAX_ROOTS_HARD = 32;
/** A driver promise this old is abandoned so one hang cannot pin the whole queue. */
const RESIDENCY_DRAIN_INFLIGHT_WATCHDOG_MS = 30000;
/** Bounded resident-hold census per presented frame / drain pass. */
const RESIDENCY_RESIDENT_SWEEP_PER_FRAME = 4;
const RESIDENCY_RESIDENT_SWEEP_PER_DRAIN = 16;

/**
 * Context generation of every geometry residency stamp. A WebGL context loss increments it:
 * stamps written against the dead context keep their flag for diagnostics but no longer satisfy
 * `admitGeometry`/`hasUnresidentGeometry`, including geometry parked off-scene that the restore
 * pass never re-uploads. The driver and a real draw stamp the live generation.
 */
let residencyContextGeneration = 0;

export function currentResidencyContextGeneration() {
  return residencyContextGeneration;
}

export function invalidateResidencyContextGeneration() {
  residencyContextGeneration += 1;
  return residencyContextGeneration;
}

/** Whether this geometry's buffers belong to the CURRENT GL context. */
export function geometryGpuResident(geometry) {
  const data = geometry && geometry.userData;
  if (!data || data.spacefaceGpuResident !== true) return false;
  const stamped = data.sfGpuResidentGeneration;
  // Legacy stamps (pre-generation) are only trusted before the first context loss.
  if (!Number.isFinite(stamped)) return residencyContextGeneration === 0;
  return stamped === residencyContextGeneration;
}

/** Record a real upload/draw proof on the current context generation. */
export function stampGeometryGpuResident(geometry) {
  if (!geometry) return false;
  const data = geometry.userData || (geometry.userData = {});
  data.spacefaceGpuResident = true;
  data.sfGpuResidentGeneration = residencyContextGeneration;
  return true;
}

function instanceCapacity(object) {
  const matrix = object && object.instanceMatrix;
  return Math.max(0, Number(matrix && matrix.count) || 0);
}

/**
 * Per-instance proof: the instance buffer bytes that reached this context, keyed by its capacity
 * and attribute version. Count growth WITHIN proven capacity needs no upload; a new/replaced
 * instance buffer does. `__sfInstanceResidentCount` stays as the legacy alias for the proven
 * capacity (not the live draw count — comparing live counts held every spawning pool).
 */
export function stampInstanceResidency(object) {
  if (!object || object.isInstancedMesh !== true) return false;
  const capacity = instanceCapacity(object);
  const version = Number(object.instanceMatrix && object.instanceMatrix.version) || 0;
  object.__sfInstanceResidentCount = capacity;
  object.__sfInstanceResidentCapacity = capacity;
  object.__sfInstanceResidentVersion = version;
  return true;
}

/**
 * Why an instanced drawable's instance buffer would upload inside this draw, or null when the
 * proven capacity covers the draw. Version growth on an already-presented pool is a content
 * update (the owner rewrote matrices), not an admission miss; holding those was the 188-blink
 * failure. Capacity growth is always unready.
 */
export function instanceResidencyReason(object) {
  if (!object || object.isInstancedMesh !== true || !object.instanceMatrix) return null;
  const capacity = instanceCapacity(object);
  const version = Number(object.instanceMatrix.version) || 0;
  const provenCapacity = Number(object.__sfInstanceResidentCapacity);
  const provenVersion = Number(object.__sfInstanceResidentVersion);
  if (!Number.isFinite(provenCapacity)) return capacity > 0 ? 'instanced-capacity' : null;
  if (capacity > provenCapacity) return 'instanced-capacity';
  if (Number.isFinite(provenVersion) && version > provenVersion
      && object.__sfPresentedOnce !== true) return 'instanced-version';
  return null;
}

/**
 * Root protection is a subtree latch: the player, forceRender and neverCull roots are exempt from
 * residency hiding. They admit inline/fail-open instead, because a protected body may never be
 * blanked by a measurement lane. Pooled reuse clears the latch at bind/cancel.
 */
export function isResidencyProtected(object) {
  for (let node = object; node; node = node.parent) {
    if (node.__sfResidencyProtected === true) return true;
    if (node.userData && node.userData.sfResidencyProtected === true) return true;
  }
  return false;
}

const REFUSAL_REASON_KEY = {
  'geometry-not-resident': 'geometry',
  'instanced-growth': 'instanced',
  'instanced-capacity': 'instanced',
  'program-not-linked': 'compile',
  'presented-detach': 'detach',
  'submit-pending': 'submit',
};

function attributeByteLength(attribute) {
  const array = attribute && (attribute.array || (attribute.data && attribute.data.array));
  return Number(array && array.byteLength) || 0;
}

/**
 * Conservative upload size of one geometry: every attribute buffer plus the index.
 * Cached on the geometry (the census is O(attributes), not O(vertices)).
 */
export function residencyGeometryBytes(geometry) {
  if (!geometry) return 0;
  const data = geometry.userData || (geometry.userData = {});
  const cached = data[GEOMETRY_BYTES];
  if (Number.isFinite(cached) && cached >= 0) return cached;
  let bytes = 0;
  try {
    const attributes = geometry.attributes || {};
    for (const key in attributes) bytes += attributeByteLength(attributes[key]);
    bytes += attributeByteLength(geometry.index);
  } catch (_) {
    bytes = 0;
  }
  data[GEOMETRY_BYTES] = bytes;
  return bytes;
}

function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

/**
 * @param {object} options
 * @param {(roots: object[]) => any} [options.requestRoots] off-screen upload driver
 *        (renderer wires prepareStartupGeometryResidency). Called with a small batch.
 * @param {(message: string, error?: any) => void} [options.onError]
 * @param {(root: object) => void} [options.onRequest]
 * @param {(root: object) => boolean} [options.hasUnresidentGeometry]
 * @param {() => number} [options.now] test clock (defaults to performance.now)
 */
export function createResidencyManager(options = {}) {
  const requestRoots = typeof options.requestRoots === 'function' ? options.requestRoots : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  const onRequest = typeof options.onRequest === 'function' ? options.onRequest : null;
  const hasUnresident = typeof options.hasUnresidentGeometry === 'function'
    ? options.hasUnresidentGeometry
    : null;
  const clock = typeof options.now === 'function' ? options.now : nowMs;

  /** Roots waiting for an off-screen upload. */
  const pendingRoots = [];
  /** Dedupe: roots already waiting or in flight. */
  const pendingSet = new Set();
  /** Roots currently handed to the upload driver. */
  const inFlight = new Set();
  /** Held roots that could not enter the queue because it was full. */
  const heldUnqueued = new Set();
  /** Every currently held root, and its sweep order (swap-remove on release). */
  const heldRoots = new Set();
  const heldOrder = [];
  let heldSweepCursor = 0;
  /** Ring of first-held -> resident delays, ms. */
  const delaySamples = new Float32Array(DELAY_SAMPLES);
  let disposed = false;
  let drainInFlight = false;
  let drainStartedAt = 0;
  let urgentDrainInFlight = false;
  let urgentDrainStartedAt = 0;

  const counters = {
    frames: 0,
    draws: 0,
    admittedResident: 0,
    admittedInline: 0,
    /** Protected roots admitted inline/fail-open instead of being hidden. */
    admittedProtectedInline: 0,
    /** Attempts to hold a protected root that were refused. */
    protectedHoldRefusals: 0,
    heldDraws: 0,
    /** Drawables held again after they had already been presented: the blink class. Must be 0. */
    visibleUnready: 0,
    /** Drawables held before their first presentation: pre-admission working as intended. */
    preAdmittedHolds: 0,
    uploadRequests: 0,
    uploadRuns: 0,
    uploadFailures: 0,
    uploadMsTotal: 0,
    uploadMsMax: 0,
    heldRoots: 0,
    releasedRoots: 0,
    /** Draw-point admission refusals (honest: sees every bypass, unlike heldDraws). */
    refusedDraws: 0,
    /** Raw refusals of a drawable (or descendant) that had already been presented. */
    presentedRefusedDraws: 0,
    /**
     * Deduped presentation refusals: one per drawable until it is presented again. This is the
     * blink-class verdict; raw per-frame refusals are `refusedDraws`/`presentedRefusedDraws`.
     */
    visibleUnreadyDraws: 0,
    /** Holds released by the bounded retry policy so a body cannot stay invisible. */
    failOpenReleases: 0,
    /** Draws admitted through the one-shot fail-open bypass. */
    admittedFailOpen: 0,
    /** Refusals named by their actual path so 900 counter reads cannot hide a compile detach. */
    refusedByReason: {
      geometry: 0,
      instanced: 0,
      compile: 0,
      detach: 0,
      submit: 0,
      other: 0,
    },
    /** Holds caused by a grown/replaced instance buffer. */
    instancedGrowthHolds: 0,
    /** Presented instance draws that rewrote already-proven matrices (content, not admission). */
    instanceVersionUploads: 0,
    /** Ambient queued roots promoted to the urgent chain before their drain turn. */
    urgentUpgrades: 0,
    /** Requests that reached the TTL; every one retries or releases, never strands. */
    expiredRequests: 0,
    expiredRetries: 0,
    uploadRetries: 0,
    delaySamples: 0,
    delayP50Ms: 0,
    delayP95Ms: 0,
    delayMaxMs: 0,
  };
  let delayWrite = 0;
  let frameStartedAt = 0;
  let frameUploadBytes = 0;
  let lastDrainAt = -Infinity;

  function recordDelay(ms) {
    if (!(ms >= 0 && ms < 60000)) return;
    delaySamples[delayWrite] = ms;
    delayWrite = (delayWrite + 1) % DELAY_SAMPLES;
    if (counters.delaySamples < DELAY_SAMPLES) counters.delaySamples += 1;
    if (ms > counters.delayMaxMs) counters.delayMaxMs = ms;
  }

  function refreshDelayPercentiles() {
    const n = counters.delaySamples;
    if (n === 0) {
      counters.delayP50Ms = 0;
      counters.delayP95Ms = 0;
      return;
    }
    const sorted = Array.prototype.slice.call(delaySamples, 0, n).sort((a, b) => a - b);
    counters.delayP50Ms = Math.round(sorted[Math.min(n - 1, Math.ceil(n * 0.5) - 1)] * 10) / 10;
    counters.delayP95Ms = Math.round(sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] * 10) / 10;
    counters.delayMaxMs = Math.round(sorted[n - 1] * 10) / 10;
  }

  /** Start a presented frame: reset the per-frame inline upload wallet. */
  function beginFrame(atMs = clock()) {
    if (disposed) return;
    counters.frames += 1;
    frameStartedAt = atMs;
    frameUploadBytes = 0;
    // Cheap liveness passes: a hold past its deadline, or one whose census turned
    // resident, is released before this frame submits anything.
    expireHoldDeadlines(atMs);
    sweepResidentHolds(RESIDENCY_RESIDENT_SWEEP_PER_FRAME);
  }

  /**
   * May this drawable be submitted? Called once per draw from the presented draw guard.
   * Returns true when the geometry is resident (proof), or when its first upload is small
   * enough to pay inside this frame's wallet. Returns false when it must wait.
   */
  function admitGeometry(object, geometry) {
    if (!geometry || !object) return true;
    if (disposed) return true;
    counters.draws += 1;
    // No off-screen driver configured (test/bare owners): fail open to the pre-E6 inline
    // path rather than refuse a draw the manager cannot ever resolve.
    if (!requestRoots) {
      object.__sfResidencyPendingGeometry = geometry;
      counters.admittedFailOpen += 1;
      return true;
    }
    // Bounded fail-open: the retry policy released this hold because its needs could not be
    // met; let its next draw upload inline rather than hold it invisible again.
    if (object.__sfResidencyFailOpen === true) {
      object.__sfResidencyFailOpen = false;
      if (object.userData) object.userData.sfResidencyFailOpen = false;
      object.__sfResidencyPendingGeometry = geometry;
      counters.admittedFailOpen += 1;
      return true;
    }
    // BatchedMesh owns its own draw list and residency; never second-guess it here.
    if (object.isBatchedMesh === true) return true;
    // The player, forceRender and neverCull roots are never hidden by this lane. They upload
    // inline/fail-open instead, and a stale hold (from before the latch was known) is cleared.
    const protectedDrawable = isResidencyProtected(object);
    if (geometryGpuResident(geometry)) {
      // Three uploads instanceMatrix at bind. A capacity that grew beyond the proven upload
      // is unready even when the shared vertex geometry is stamped. Protected roots skip the
      // hold: a protected body is never blanked by the measurement lane.
      if (!protectedDrawable) {
        const instanceReason = instanceResidencyReason(object);
        if (instanceReason) {
          object.__sfResidencyRefusalReason = instanceReason;
          counters.instancedGrowthHolds += 1;
          counters.heldDraws += 1;
          holdRoot(rootOf(object), instanceReason, geometry, true);
          return false;
        }
      } else if (isHeld(object)) {
        releaseRoot(object);
      }
      counters.admittedResident += 1;
      raiseHeldRoot(object);
      return true;
    }
    if (protectedDrawable) {
      // Admit inline rather than hide: protected roots must never be blanked by residency.
      if (isHeld(object)) releaseRoot(object);
      object.__sfResidencyPendingGeometry = geometry;
      counters.admittedProtectedInline += 1;
      return true;
    }
    const bytes = residencyGeometryBytes(geometry);
    // Admitted, not yet spent: the wallet is charged by noteDrawn after the draw actually
    // uploads. A draw refused later in the guard therefore cannot starve ready effects.
    if (bytes <= RESIDENCY_INLINE_UPLOAD_BYTES
        && frameUploadBytes + bytes <= RESIDENCY_FRAME_UPLOAD_BYTES) {
      counters.admittedInline += 1;
      // The draw that follows uploads the buffers; noteDrawn stamps the proof.
      object.__sfResidencyPendingGeometry = geometry;
      return true;
    }
    counters.heldDraws += 1;
    object.__sfResidencyRefusalReason = 'geometry-not-resident';
    holdRoot(rootOf(object), 'over-budget', geometry);
    return false;
  }

  /** Mark this drawable and every ancestor as presented (bounded walk; stops at a marked node). */
  function markPresented(object) {
    for (let node = object; node; node = node.parent) {
      if (node.__sfPresentedOnce === true) break;
      node.__sfPresentedOnce = true;
    }
  }

  /** After a successful draw: the buffers are on the GPU, so record the proof. */
  function noteDrawn(object, geometry, material = null) {
    if (disposed || !object || !geometry) return false;
    // A depth/distance draw uploads only the attributes that material binds; proving
    // residency there would let the colour pass upload the rest inside the frame.
    const type = material && material.type;
    if (type && /Depth|Distance/.test(String(type))) return false;
    if (object.__sfResidencyFailOpen === true) object.__sfResidencyFailOpen = false;
    if (object.userData) object.userData.sfResidencyFailOpen = false;
    const pending = object.__sfResidencyPendingGeometry;
    if (pending === geometry) {
      object.__sfResidencyPendingGeometry = null;
      // Charge the inline wallet only for the draw that actually happened.
      frameUploadBytes += residencyGeometryBytes(geometry);
    }
    // A new presentation ends the current refusal episode: a later refusal is a new blink.
    markPresented(object);
    if (object.__sfPresentedRefusalCounted === true) object.__sfPresentedRefusalCounted = false;
    if (object.isInstancedMesh === true) {
      const version = Number(object.instanceMatrix && object.instanceMatrix.version) || 0;
      const proven = Number(object.__sfInstanceResidentVersion);
      if (Number.isFinite(proven) && version > proven) counters.instanceVersionUploads += 1;
      stampInstanceResidency(object);
    }
    if (geometryGpuResident(geometry)) return false;
    // Only a geometry this manager allowed inline may be stamped by its own draw; a
    // draw that reached the guard through an exempt route still uploaded, so the stamp
    // remains honest either way.
    stampGeometryGpuResident(geometry);
    return true;
  }

  /**
   * Honest draw-point counter for a refused presentation. `presented` is derived from the drawable
   * itself (`__sfPresentedOnce`, including an ancestor) — never a caller constant. Raw refusals are
   * counted per draw and per path; `visibleUnreadyDraws`/`presentedRefusedEntities` are deduped per
   * drawable until it is presented again.
   */
  function noteRefusedDraw(object, reason = 'geometry-not-resident') {
    if (disposed || !object) return false;
    counters.refusedDraws += 1;
    const key = REFUSAL_REASON_KEY[reason] || 'other';
    counters.refusedByReason[key] = (counters.refusedByReason[key] || 0) + 1;
    if (wasEverPresented(object)) {
      counters.presentedRefusedDraws += 1;
      if (object.__sfPresentedRefusalCounted !== true) {
        object.__sfPresentedRefusalCounted = true;
        counters.visibleUnreadyDraws += 1;
      }
    }
    // The draw was refused after its inline grant but before it uploaded: refund the
    // admission so the frame wallet is not spent on a draw that never happened.
    if (object.__sfResidencyPendingGeometry) {
      object.__sfResidencyPendingGeometry = null;
      if (counters.admittedInline > 0) counters.admittedInline -= 1;
    }
    return true;
  }

  function rootOf(object) {
    // Drawable granularity, deliberately: a single unresident leaf (a late-mounted part, a
    // tether, a prop) must not blank the whole hull that carries it. The drawable itself is
    // what is held, and it is what the upload driver is handed.
    return object || null;
  }

  /** Whether this drawable (or an ancestor) has already been presented at least once. */
  function wasEverPresented(object) {
    for (let node = object; node; node = node.parent) {
      if (node.__sfPresentedOnce === true) return true;
    }
    return false;
  }

  function trackHold(root) {
    if (heldRoots.has(root)) return;
    heldRoots.add(root);
    heldOrder.push(root);
  }

  function untrackHold(root) {
    if (!heldRoots.delete(root)) return;
    const index = heldOrder.indexOf(root);
    if (index >= 0) {
      heldOrder[index] = heldOrder[heldOrder.length - 1];
      heldOrder.pop();
      if (heldSweepCursor >= heldOrder.length) heldSweepCursor = 0;
    }
  }

  /** Bounded liveness backstop: release a hold older than its last-refusal deadline. */
  function expireHoldDeadlines(now) {
    if (heldRoots.size === 0) return 0;
    let expired = 0;
    for (const root of heldRoots) {
      if (!isHeld(root)) continue;
      const deadline = Number(root.userData && root.userData.sfResidencyHoldDeadline);
      if (Number.isFinite(deadline) && now >= deadline && failOpenRoot(root)) expired += 1;
    }
    return expired;
  }

  /**
   * Release a hold the moment its subtree reports resident instead of waiting for the
   * queue turn that would prove it. Bounded per pass: the census walks subtrees.
   */
  function sweepResidentHolds(limit) {
    if (!hasUnresident || heldOrder.length === 0) return 0;
    let checked = 0;
    let released = 0;
    while (checked < limit && heldOrder.length > 0) {
      if (heldSweepCursor >= heldOrder.length) heldSweepCursor = 0;
      const root = heldOrder[heldSweepCursor];
      checked += 1;
      if (!isHeld(root)) {
        untrackHold(root);
        continue;
      }
      let pending = true;
      try { pending = hasUnresident(root) === true; } catch (_) { pending = true; }
      if (!pending) {
        releaseRoot(root);
        released += 1;
        continue;
      }
      heldSweepCursor = (heldSweepCursor + 1) % heldOrder.length;
    }
    return released;
  }

  /** Hold one drawable invisible until its geometry is resident, and queue the upload. */
  function holdRoot(root, reason = 'geometry', geometry = null, urgent = false) {
    if (disposed || !root || !root.userData) return false;
    // A protected root (player/forceRender/neverCull) is never hidden by this lane. A stale
    // hold from before the latch was known is cleared; the next draw admits it inline.
    if (isResidencyProtected(root)) {
      counters.protectedHoldRefusals += 1;
      if (isHeld(root)) releaseRoot(root);
      return false;
    }
    const data = root.userData;
    const wasPresented = wasEverPresented(root);
    if (data[RESIDENCY_HELD] === true) {
      // Already held: the hold is the state, but a dropped request (upload error, full
      // queue, TTL expiry) must not strand it invisible. The next refused draw re-queues.
      // The deadline is stamped ONCE at the first hold and never renewed: renewal let a
      // redrawn protected/on-glass root ride the watchdog until the driver finished.
      requestUpload(root, reason, urgent || wasPresented || reason === 'over-budget');
      return false;
    }
    data[RESIDENCY_HELD] = true;
    data.sfResidencyHeldAt = clock();
    data.sfResidencyHoldDeadline = data.sfResidencyHeldAt + RESIDENCY_HOLD_DEADLINE_MS;
    data.sfResidencyHeldReason = reason;
    data.sfResidencyGeometry = geometry || root.geometry || null;
    data.sfResidencyUploadAttempts = 0;
    data.sfResidencyExpiredRetries = 0;
    data.sfResidencyRetryAt = 0;
    data.sfResidencyFailOpen = false;
    root.__sfResidencyFailOpen = false;
    trackHold(root);
    // Fail closed: a drawable without resident geometry is not submitted at all. The
    // prior visibility is remembered so the release restores the authored state instead
    // of forcing a hidden child on screen.
    data.sfResidencyPriorVisible = root.visible !== false;
    if (wasPresented) {
      // It had already been on screen and is now unready again: the blink/pop class. Counted
      // once per hold episode, not once per refused frame.
      if (data.sfResidencyVisibleUnreadyCounted !== true) {
        data.sfResidencyVisibleUnreadyCounted = true;
        counters.visibleUnready += 1;
      }
    } else {
      // Held before its first presentation — the residency lane got there first.
      counters.preAdmittedHolds += 1;
    }
    root.visible = false;
    counters.heldRoots += 1;
    // On-glass drawables and deadline-urgent binds are urgent; a bind-time hold of a body
    // that has not been shown and is not approaching is not.
    requestUpload(root, reason, urgent || wasPresented || reason === 'over-budget');
    return true;
  }

  /** The stamp landed: release the hold and record how long the body waited. */
  function releaseRoot(root) {
    if (!root || !root.userData) return false;
    heldUnqueued.delete(root);
    pendingSet.delete(root);
    const pendingIndex = pendingRoots.indexOf(root);
    if (pendingIndex >= 0) pendingRoots.splice(pendingIndex, 1);
    untrackHold(root);
    const data = root.userData;
    if (data[RESIDENCY_HELD] !== true) return false;
    data[RESIDENCY_HELD] = false;
    data.sfResidencyHoldDeadline = 0;
    const heldAt = Number(data.sfResidencyHeldAt);
    if (Number.isFinite(heldAt)) recordDelay(clock() - heldAt);
    data.sfResidencyHeldAt = 0;
    data.sfResidencyHeldReason = null;
    root.visible = data.sfResidencyPriorVisible !== false;
    data.sfResidencyPriorVisible = null;
    counters.releasedRoots += 1;
    return true;
  }

  /**
   * The mesh is leaving its binding (evict, rebind, pool recycle). Drop every queue trace
   * and release the hold so the next owner of a pooled mesh never inherits a stale HELD
   * flag (which would keep it invisible until some old upload settled).
   */
  function cancelRoot(root) {
    if (!root || disposed) return false;
    const index = pendingRoots.indexOf(root);
    if (index >= 0) pendingRoots.splice(index, 1);
    pendingSet.delete(root);
    heldUnqueued.delete(root);
    // A late in-flight settlement must not re-queue or release this root under its new
    // owner; removing the membership makes settleRoot a no-op.
    inFlight.delete(root);
    const held = isHeld(root);
    releaseRoot(root);
    if (root.userData) {
      root.userData.sfResidencyRequestedAt = 0;
      root.userData.sfResidencyRetryAt = 0;
      root.userData.sfResidencyUnqueuedAt = 0;
    }
    // Pooled-mesh residue: the next owner must not inherit this binding's presentation
    // proof, last material, fail-open bypass or instance-count stamp.
    root.__sfPresentedOnce = false;
    root.__sfPresentedMaterial = null;
    root.__sfInstanceResidentCount = 0;
    root.__sfInstanceResidentCapacity = 0;
    root.__sfInstanceResidentVersion = 0;
    root.__sfResidencyFailOpen = false;
    root.__sfResidencyPendingGeometry = null;
    root.__sfResidencyRefusalReason = null;
    root.__sfPresentedRefusalCounted = false;
    root.__sfResidencyProtected = false;
    if (root.userData) {
      root.userData.sfResidencyVisibleUnreadyCounted = false;
      root.userData.sfResidencyProtected = false;
    }
    return held;
  }

  /** A resident drawable that was held on its own is released on its first admitted draw. */
  function raiseHeldRoot(object) {
    // Only a hold placed on this exact drawable is cleared here. An ancestor (bind-time root)
    // hold must wait for the whole subtree: releasing it on one leaf's proof would show the
    // hull with its other leaves still missing.
    if (object && object.userData && object.userData[RESIDENCY_HELD] === true) {
      releaseRoot(object);
    }
  }

  function requestUpload(root, reason = 'geometry', urgent = false) {
    if (disposed || !root) return false;
    const data = root.userData || (root.userData = {});
    // Urgency is a property of the root, not of the request that happened to create it.
    // An ambient hold that comes onto the glass must upgrade before the dedupe return.
    const upgrade = urgent === true && data.sfResidencyUrgent !== true;
    if (urgent === true) data.sfResidencyUrgent = true;
    else if (data.sfResidencyUrgent === undefined) data.sfResidencyUrgent = false;
    if (pendingSet.has(root) || inFlight.has(root)) {
      if (upgrade && pendingSet.has(root) && !inFlight.has(root)) {
        const index = pendingRoots.indexOf(root);
        if (index > 0) {
          pendingRoots.splice(index, 1);
          pendingRoots.unshift(root);
        }
        counters.urgentUpgrades += 1;
      }
      return false;
    }
    if (pendingRoots.length >= RESIDENCY_MAX_PENDING) {
      // The queue is the safety net, not the state: keep the hold and remember it so the
      // next drain with free space re-admits it. Never drop the only path to visibility.
      if (!heldUnqueued.has(root)) {
        heldUnqueued.add(root);
        data.sfResidencyUnqueuedAt = clock();
      }
      if (onRequest) {
        try { onRequest(root); } catch (_) { /* scheduling is best-effort */ }
      }
      return false;
    }
    data.sfResidencyRequestedAt = clock();
    data.sfResidencyReason = reason;
    data.sfResidencyRetryAt = 0;
    pendingSet.add(root);
    // A drawable the camera is already trying to draw jumps the queue: its absence is on
    // screen, unlike the runway/backlog roots that were requested while still off-glass.
    if (data.sfResidencyUrgent === true) pendingRoots.unshift(root);
    else pendingRoots.push(root);
    counters.uploadRequests += 1;
    if (onRequest) {
      try { onRequest(root); } catch (_) { /* scheduling is best-effort */ }
    }
    return true;
  }

  function isHeld(root) {
    return !!(root && root.userData && root.userData[RESIDENCY_HELD] === true);
  }

  function pendingCount() {
    // In-flight roots released by the bounded deadline (or unbound) are upload work, not a
    // held drawable: they must not report as pending visibility.
    let count = pendingRoots.length + heldUnqueued.size;
    for (const root of inFlight) {
      if (isHeld(root)) count += 1;
    }
    return count;
  }

  /** In-flight uploads that no longer hold a drawable (a released/given-up request). */
  function ghostedInFlightCount() {
    let count = 0;
    for (const root of inFlight) if (!isHeld(root)) count += 1;
    return count;
  }

  /**
   * Whether the manager still owes upload work even if no drawable is held (a ghosted in-flight
   * promise waiting for the watchdog). The renderer drain timer must keep running until this is
   * false, or the watchdog is unreachable and a ghost pins the queue after the last hold.
   */
  function hasOutstandingWork() {
    return pendingRoots.length > 0 || heldUnqueued.size > 0 || inFlight.size > 0;
  }

  /** Whether the root still has unuploaded geometry (nil driver treats every hold as pending). */
  function stillPending(root) {
    if (!root) return false;
    // The manager only queues roots it holds. An external release (unbind, dispose,
    // fail-open) ends the request even if the geometry is still unstamped.
    if (!isHeld(root)) return false;
    if (hasUnresident) {
      try { return hasUnresident(root) === true; } catch (_) { return true; }
    }
    if (instanceResidencyReason(root)) return true;
    const geometry = (root.userData && root.userData.sfResidencyGeometry) || root.geometry;
    if (geometry) return !geometryGpuResident(geometry);
    return isHeld(root);
  }

  /**
   * Release a hold because the bounded retry policy ran out. The one-shot bypass lets the
   * next presented draw upload inline, so releasing does not immediately re-hold the body.
   */
  function failOpenRoot(root) {
    if (!root || !root.userData) return false;
    root.userData.sfResidencyFailOpen = true;
    root.__sfResidencyFailOpen = true;
    counters.failOpenReleases += 1;
    releaseRoot(root);
    return true;
  }

  function retryDelayMs(attempts) {
    return Math.min(RESIDENCY_RETRY_MAX_MS, RESIDENCY_RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
  }

  function settleRoot(root, startedAt, error) {
    if (!inFlight.delete(root)) return;
    counters.uploadRuns += 1;
    const spent = clock() - startedAt;
    counters.uploadMsTotal += spent;
    if (spent > counters.uploadMsMax) counters.uploadMsMax = spent;
    if (error) {
      counters.uploadFailures += 1;
      if (onError) {
        try { onError('residency upload failed', error); } catch (_) { /* reported once */ }
      }
      pendingSet.delete(root);
      if (!root || !root.userData) return;
      // The stamp may have landed through another lane before the driver rejected; release
      // instead of retrying a drawable that no longer needs the hold.
      if (!stillPending(root)) {
        releaseRoot(root);
        return;
      }
      const data = root.userData;
      const attempts = (Number(data.sfResidencyUploadAttempts) || 0) + 1;
      data.sfResidencyUploadAttempts = attempts;
      if (!isHeld(root) || attempts >= RESIDENCY_UPLOAD_ATTEMPTS || disposed) {
        // A failed upload must not hide the body forever: fail open after the bounded window.
        failOpenRoot(root);
        return;
      }
      const at = clock();
      data.sfResidencyRetryAt = at + retryDelayMs(attempts);
      data.sfResidencyRequestedAt = at;
      counters.uploadRetries += 1;
      pendingSet.add(root);
      if (data.sfResidencyUrgent === true) pendingRoots.unshift(root);
      else pendingRoots.push(root);
      return;
    }
    if (root && root.isInstancedMesh === true) {
      // The batch uploaded this object's instance attributes: pin the proof before the
      // growth latch is consulted again. Capacity (not live count) is what the buffer covers.
      stampInstanceResidency(root);
    }
    if (stillPending(root)) {
      // The driver prepared a batch, but this root still holds unuploaded geometry
      // (a late child mount). Put it back on the queue; it is not visible yet.
      if (pendingSet.has(root) && !pendingRoots.includes(root)) {
        const data = root.userData || (root.userData = {});
        data.sfResidencyRequestedAt = clock();
        data.sfResidencyRetryAt = 0;
        data.sfResidencyUploadAttempts = 0;
        if (data.sfResidencyUrgent === true) pendingRoots.unshift(root);
        else pendingRoots.push(root);
      }
      return;
    }
    pendingSet.delete(root);
    releaseRoot(root);
  }

  /** Drop resident/released requests and apply the TTL retry-or-release policy. */
  function prunePending(now) {
    // Head cleanup stays a single census read per drain: a root that became resident
    // through another lane (live geometry admission) is dropped before batching.
    while (pendingRoots.length > 0 && !stillPending(pendingRoots[0])) {
      const head = pendingRoots.shift();
      pendingSet.delete(head);
      releaseRoot(head);
    }
    // TTL is a timestamp read per row; only an expired row pays the subtree census.
    for (let i = 0; i < pendingRoots.length;) {
      const root = pendingRoots[i];
      const requestedAt = Number(root && root.userData && root.userData.sfResidencyRequestedAt);
      if (!(Number.isFinite(requestedAt) && (now - requestedAt) > RESIDENCY_REQUEST_TTL_MS)) {
        i += 1;
        continue;
      }
      counters.expiredRequests += 1;
      if (!stillPending(root)) {
        pendingRoots.splice(i, 1);
        releaseRoot(root);
        continue;
      }
      const data = root.userData || (root.userData = {});
      // Detached or no longer held: nothing to wait for, so release (a no-op for a root
      // that another lane already admitted).
      if (!isHeld(root) || !root.parent) {
        pendingRoots.splice(i, 1);
        releaseRoot(root);
        continue;
      }
      const retries = Number(data.sfResidencyExpiredRetries) || 0;
      if (retries >= RESIDENCY_REQUEST_RETRIES) {
        // The request outlived its retry window while still attached and held: fail open.
        pendingRoots.splice(i, 1);
        failOpenRoot(root);
        continue;
      }
      data.sfResidencyExpiredRetries = retries + 1;
      data.sfResidencyRequestedAt = now;
      data.sfResidencyRetryAt = 0;
      counters.expiredRetries += 1;
      i += 1;
    }
  }

  /** Re-admit held roots that spilled off the capped queue once space is free. */
  function admitHeldUnqueued() {
    if (heldUnqueued.size === 0) return 0;
    const now = clock();
    let admitted = 0;
    for (const root of Array.from(heldUnqueued)) {
      if (pendingRoots.length >= RESIDENCY_MAX_PENDING) break;
      heldUnqueued.delete(root);
      if (!root || !root.userData) continue;
      if (pendingSet.has(root) || inFlight.has(root)) continue;
      if (!isHeld(root)) { releaseRoot(root); continue; }
      const data = root.userData;
      const unqueuedAt = Number(data.sfResidencyUnqueuedAt);
      if (!root.parent) {
        // Detached while it waited: no draw can need it. A later remount re-holds it.
        releaseRoot(root);
        continue;
      }
      if (Number.isFinite(unqueuedAt) && (now - unqueuedAt) > RESIDENCY_REQUEST_TTL_MS) {
        counters.expiredRequests += 1;
        failOpenRoot(root);
        continue;
      }
      data.sfResidencyRequestedAt = now;
      data.sfResidencyRetryAt = 0;
      pendingSet.add(root);
      if (data.sfResidencyUrgent === true) pendingRoots.unshift(root);
      else pendingRoots.push(root);
      counters.uploadRequests += 1;
      admitted += 1;
    }
    return admitted;
  }

  /** Take the first pending root that is due (not waiting out an upload backoff). */
  function takeDuePendingRoot(now) {
    for (let i = 0; i < pendingRoots.length; i++) {
      const root = pendingRoots[i];
      const retryAt = Number(root && root.userData && root.userData.sfResidencyRetryAt);
      if (Number.isFinite(retryAt) && retryAt > now) continue;
      pendingRoots.splice(i, 1);
      return root;
    }
    return null;
  }

  /** Whether any due-or-backing-off pending root is on the urgent chain. */
  function hasUrgentPending() {
    for (let i = 0; i < pendingRoots.length; i++) {
      const root = pendingRoots[i];
      if (root && root.userData && root.userData.sfResidencyUrgent === true) return true;
    }
    return false;
  }

  /**
   * Roots one drain must take to prove every hold inside its 2 s deadline. The old fixed
   * 8 roots / 200 ms = 40 roots/s could not serve a 150-body burst; the count now derives from
   * the queue depth and the cadence the deadline forces.
   */
  function drainSelectionLimit(maxRoots, pending) {
    if (maxRoots > 0) return maxRoots | 0;
    if (pending <= RESIDENCY_DRAIN_MAX_ROOTS) return RESIDENCY_DRAIN_MAX_ROOTS;
    const cadence = pending > RESIDENCY_DRAIN_BURST_PENDING
      ? RESIDENCY_DRAIN_BURST_MS : RESIDENCY_DRAIN_BASE_MS;
    const drainsLeft = Math.max(1, Math.floor(RESIDENCY_HOLD_DEADLINE_MS / cadence) - 1);
    return Math.min(RESIDENCY_DRAIN_MAX_ROOTS_HARD,
      Math.max(RESIDENCY_DRAIN_MAX_ROOTS, Math.ceil(pending / drainsLeft)));
  }

  /**
   * The queue is a safety net at 5 Hz, but a backlog or a hold nearing its non-renewable
   * deadline must drain at 10 Hz. Slowing to 5 Hz at the tail of a burst would push the last
   * bodies past the same 2 s deadline that shaped the burst cadence.
   */
  function drainCadence(now, pending) {
    if (pending > RESIDENCY_DRAIN_BURST_PENDING) return RESIDENCY_DRAIN_BURST_MS;
    let soonest = Infinity;
    for (const root of heldRoots) {
      if (!isHeld(root)) continue;
      const deadline = Number(root.userData && root.userData.sfResidencyHoldDeadline);
      if (Number.isFinite(deadline) && deadline < soonest) soonest = deadline;
    }
    if (Number.isFinite(soonest)
        && (soonest - now) <= (RESIDENCY_HOLD_DEADLINE_MS / 2)) return RESIDENCY_DRAIN_BURST_MS;
    return RESIDENCY_DRAIN_BASE_MS;
  }

  /**
   * Delay before the renderer should call the next drain. A backlog or a hold near its fixed
   * deadline asks for 100 ms; the ordinary queue keeps the 200 ms safety-net cadence. Without
   * this the drain's 10 Hz burst cadence could never be reached: the renderer timer is the only
   * caller.
   */
  function nextDrainDelayMs() {
    return drainCadence(clock(), pendingCount());
  }

  function abandonHungDrain() {
    // One hung driver promise must not pin the queue or hold bodies forever. The hold
    // deadline already frees the roots; drop the ghost in-flight membership too.
    for (const root of Array.from(inFlight)) {
      inFlight.delete(root);
      if (isHeld(root)) failOpenRoot(root);
      else releaseRoot(root);
    }
  }

  /**
   * Drain the upload queue through the off-screen residency driver. Called from a bounded
   * background task, never inside a presented frame. One ambient batch and one urgent batch may
   * be in flight together (the driver serializes the actual GL submission); selection is
   * time-budgeted and sized from the queue depth so a burst meets the hold deadline.
   */
  function drainUploads(maxRoots = 0) {
    if (disposed || !requestRoots) return 0;
    const now = clock();
    const pending = pendingCount();
    // A backlog drains at the burst cadence; a hold nearing its fixed deadline also does.
    const cadence = drainCadence(now, pending);
    if (now - lastDrainAt < cadence) return 0;
    if (drainInFlight && (now - drainStartedAt) >= RESIDENCY_DRAIN_INFLIGHT_WATCHDOG_MS) {
      abandonHungDrain();
      drainInFlight = false;
    }
    if (urgentDrainInFlight
        && (now - urgentDrainStartedAt) >= RESIDENCY_DRAIN_INFLIGHT_WATCHDOG_MS) {
      abandonHungDrain();
      urgentDrainInFlight = false;
    }
    expireHoldDeadlines(now);
    sweepResidentHolds(RESIDENCY_RESIDENT_SWEEP_PER_DRAIN);
    prunePending(now);
    admitHeldUnqueued();
    lastDrainAt = now;
    if (pendingRoots.length === 0) return 0;
    // Urgent work owns a separate in-flight slot: an ambient batch that is already uploading
    // must not make an on-glass body wait for its settle.
    const desiredUrgent = hasUrgentPending();
    const singleFlight = maxRoots > 0;
    if (desiredUrgent ? urgentDrainInFlight : drainInFlight) return 0;
    if (singleFlight && (drainInFlight || urgentDrainInFlight)) return 0;
    const batch = [];
    const limit = drainSelectionLimit(maxRoots, pending);
    const selectStartedAt = clock();
    let batchUrgent = null;
    for (let i = 0; i < limit; i++) {
      if (i > 0 && (clock() - selectStartedAt) >= RESIDENCY_DRAIN_BUDGET_MS) break;
      const root = takeDuePendingRoot(now);
      if (!root) break;
      const urgent = !!(root.userData && root.userData.sfResidencyUrgent === true);
      if (batchUrgent === null) batchUrgent = urgent;
      if (urgent !== batchUrgent || urgent !== desiredUrgent) {
        // Never mix the chains: put it back and let the matching slot take it.
        pendingRoots.unshift(root);
        break;
      }
      if (!stillPending(root)) {
        pendingSet.delete(root);
        releaseRoot(root);
        continue;
      }
      inFlight.add(root);
      batch.push(root);
    }
    if (batch.length === 0) return 0;
    const startedAt = clock();
    const urgentBatch = batchUrgent === true;
    if (urgentBatch) {
      urgentDrainInFlight = true;
      urgentDrainStartedAt = startedAt;
    } else {
      drainInFlight = true;
      drainStartedAt = startedAt;
    }
    const settleBatch = (error) => {
      for (const root of batch) settleRoot(root, startedAt, error);
      if (urgentBatch) urgentDrainInFlight = false;
      else drainInFlight = false;
      admitHeldUnqueued();
    };
    let result;
    try {
      result = requestRoots(batch, urgentBatch);
    } catch (error) {
      settleBatch(error);
      return batch.length;
    }
    if (result && typeof result.then === 'function') {
      result.then(() => settleBatch(null), (error) => settleBatch(error));
    } else {
      settleBatch(null);
    }
    return batch.length;
  }

  /**
   * Release every hold and forget every queue entry. The manager is inert afterwards:
   * presented draws fail open and no counter moves, so a timer callback left in a dead
   * renderer generation cannot keep it alive or change its published verdicts.
   */
  function dispose() {
    if (disposed) return false;
    disposed = true;
    for (const root of Array.from(pendingRoots)) releaseRoot(root);
    pendingRoots.length = 0;
    pendingSet.clear();
    for (const root of Array.from(inFlight)) releaseRoot(root);
    inFlight.clear();
    for (const root of Array.from(heldUnqueued)) releaseRoot(root);
    heldUnqueued.clear();
    for (const root of Array.from(heldRoots)) releaseRoot(root);
    heldRoots.clear();
    heldOrder.length = 0;
    heldSweepCursor = 0;
    drainInFlight = false;
    urgentDrainInFlight = false;
    refreshDelayPercentiles();
    return true;
  }

  function snapshot() {
    if (!disposed) refreshDelayPercentiles();
    return {
      frames: counters.frames,
      draws: counters.draws,
      admittedResident: counters.admittedResident,
      admittedInline: counters.admittedInline,
      admittedProtectedInline: counters.admittedProtectedInline,
      protectedHoldRefusals: counters.protectedHoldRefusals,
      heldDraws: counters.heldDraws,
      visibleUnready: counters.visibleUnready,
      preAdmittedHolds: counters.preAdmittedHolds,
      refusedDraws: counters.refusedDraws,
      presentedRefusedDraws: counters.presentedRefusedDraws,
      visibleUnreadyDraws: counters.visibleUnreadyDraws,
      /** Deduped presentation refusals; explicit name for the unit the gate measures. */
      presentedRefusedEntities: counters.visibleUnreadyDraws,
      refusedByReason: { ...counters.refusedByReason },
      instancedGrowthHolds: counters.instancedGrowthHolds,
      instanceVersionUploads: counters.instanceVersionUploads,
      urgentUpgrades: counters.urgentUpgrades,
      failOpenReleases: counters.failOpenReleases,
      /** Explicit alias for the liveness verdict named in the E6 review. */
      residencyFailOpen: counters.failOpenReleases,
      admittedFailOpen: counters.admittedFailOpen,
      expiredRequests: counters.expiredRequests,
      expiredRetries: counters.expiredRetries,
      uploadRetries: counters.uploadRetries,
      uploadRequests: counters.uploadRequests,
      uploadRuns: counters.uploadRuns,
      uploadFailures: counters.uploadFailures,
      uploadMsTotal: Math.round(counters.uploadMsTotal * 10) / 10,
      uploadMsMax: Math.round(counters.uploadMsMax * 10) / 10,
      heldRoots: counters.heldRoots,
      releasedRoots: counters.releasedRoots,
      pending: pendingCount(),
      queued: pendingRoots.length,
      inFlight: inFlight.size,
      ghostedInFlight: ghostedInFlightCount(),
      heldUnqueued: heldUnqueued.size,
      disposed,
      firstResidentDelaySamples: counters.delaySamples,
      firstResidentDelayP50Ms: counters.delayP50Ms,
      firstResidentDelayP95Ms: counters.delayP95Ms,
      firstResidentDelayMaxMs: counters.delayMaxMs,
      frameStartedAt,
    };
  }

  return {
    beginFrame,
    admitGeometry,
    noteDrawn,
    noteRefusedDraw,
    holdRoot,
    releaseRoot,
    cancelRoot,
    requestUpload,
    isHeld,
    pendingCount,
    hasOutstandingWork,
    nextDrainDelayMs,
    drainUploads,
    dispose,
    snapshot,
    counters,
  };
}
