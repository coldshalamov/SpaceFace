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
//  - a held root is never re-shown before its stamp lands.

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
/** A request older than this is abandoned (the drawable despawned or was detached). */
const RESIDENCY_REQUEST_TTL_MS = 5000;
/** Bound the queue: a pathological producer cannot grow it without limit. */
const RESIDENCY_MAX_PENDING = 64;

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
 */
export function createResidencyManager(options = {}) {
  const requestRoots = typeof options.requestRoots === 'function' ? options.requestRoots : null;
  const onError = typeof options.onError === 'function' ? options.onError : null;
  const onRequest = typeof options.onRequest === 'function' ? options.onRequest : null;
  const hasUnresident = typeof options.hasUnresidentGeometry === 'function'
    ? options.hasUnresidentGeometry
    : null;

  /** Roots waiting for an off-screen upload. */
  const pendingRoots = [];
  /** Dedupe: roots already waiting or in flight. */
  const pendingSet = new Set();
  /** Roots currently handed to the upload driver. */
  const inFlight = new Set();
  /** Ring of first-held -> resident delays, ms. */
  const delaySamples = new Float32Array(DELAY_SAMPLES);

  const counters = {
    frames: 0,
    draws: 0,
    admittedResident: 0,
    admittedInline: 0,
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
  function beginFrame(atMs = nowMs()) {
    counters.frames += 1;
    frameStartedAt = atMs;
    frameUploadBytes = 0;
  }

  /**
   * May this drawable be submitted? Called once per draw from the presented draw guard.
   * Returns true when the geometry is resident (proof), or when its first upload is small
   * enough to pay inside this frame's wallet. Returns false when it must wait.
   */
  function admitGeometry(object, geometry) {
    if (!geometry || !object) return true;
    counters.draws += 1;
    const data = geometry.userData;
    if (data && data.spacefaceGpuResident === true) {
      counters.admittedResident += 1;
      raiseHeldRoot(object);
      return true;
    }
    // BatchedMesh owns its own draw list and residency; never second-guess it here.
    if (object.isBatchedMesh === true) return true;
    const bytes = residencyGeometryBytes(geometry);
    if (bytes <= RESIDENCY_INLINE_UPLOAD_BYTES
        && frameUploadBytes + bytes <= RESIDENCY_FRAME_UPLOAD_BYTES) {
      frameUploadBytes += bytes;
      counters.admittedInline += 1;
      // The draw that follows uploads the buffers; noteDrawn stamps the proof.
      object.__sfResidencyPendingGeometry = geometry;
      return true;
    }
    counters.heldDraws += 1;
    holdRoot(rootOf(object), 'over-budget', geometry);
    return false;
  }

  /** After a successful draw: the buffers are on the GPU, so record the proof. */
  function noteDrawn(object, geometry, material = null) {
    if (!object || !geometry) return false;
    // A depth/distance draw uploads only the attributes that material binds; proving
    // residency there would let the colour pass upload the rest inside the frame.
    const type = material && material.type;
    if (type && /Depth|Distance/.test(String(type))) return false;
    const pending = object.__sfResidencyPendingGeometry;
    if (pending === geometry) object.__sfResidencyPendingGeometry = null;
    if (object.__sfPresentedOnce !== true) object.__sfPresentedOnce = true;
    const data = geometry.userData || (geometry.userData = {});
    if (data.spacefaceGpuResident === true) return false;
    // Only a geometry this manager allowed inline may be stamped by its own draw; a
    // draw that reached the guard through an exempt route still uploaded, so the stamp
    // remains honest either way.
    data.spacefaceGpuResident = true;
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

  /** Hold one drawable invisible until its geometry is resident, and queue the upload. */
  function holdRoot(root, reason = 'geometry', geometry = null) {
    if (!root || !root.userData) return false;
    const data = root.userData;
    if (data[RESIDENCY_HELD] === true) return false;
    data[RESIDENCY_HELD] = true;
    data.sfResidencyHeldAt = nowMs();
    data.sfResidencyHeldReason = reason;
    data.sfResidencyGeometry = geometry || root.geometry || null;
    const wasPresented = wasEverPresented(root);
    // Fail closed: a drawable without resident geometry is not submitted at all. The
    // prior visibility is remembered so the release restores the authored state instead
    // of forcing a hidden child on screen.
    data.sfResidencyPriorVisible = root.visible !== false;
    if (wasPresented) {
      // It had already been on screen and is now unready again: the blink/pop class.
      counters.visibleUnready += 1;
    } else {
      // Held before its first presentation — the residency lane got there first.
      counters.preAdmittedHolds += 1;
    }
    root.visible = false;
    counters.heldRoots += 1;
    // On-glass drawables are urgent; a bind-time hold of a body that has not been shown yet
    // is not (it can wait its turn in the off-screen lane).
    requestUpload(root, reason, wasPresented || reason === 'over-budget');
    return true;
  }

  /** The stamp landed: release the hold and record how long the body waited. */
  function releaseRoot(root) {
    if (!root || !root.userData) return false;
    const data = root.userData;
    if (data[RESIDENCY_HELD] !== true) return false;
    data[RESIDENCY_HELD] = false;
    const heldAt = Number(data.sfResidencyHeldAt);
    if (Number.isFinite(heldAt)) recordDelay(nowMs() - heldAt);
    data.sfResidencyHeldAt = 0;
    data.sfResidencyHeldReason = null;
    root.visible = data.sfResidencyPriorVisible !== false;
    data.sfResidencyPriorVisible = null;
    counters.releasedRoots += 1;
    return true;
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
    if (!root) return false;
    if (pendingSet.has(root) || inFlight.has(root)) return false;
    if (pendingRoots.length >= RESIDENCY_MAX_PENDING) return false;
    const data = root.userData || (root.userData = {});
    data.sfResidencyRequestedAt = nowMs();
    data.sfResidencyReason = reason;
    pendingSet.add(root);
    // A drawable the camera is already trying to draw jumps the queue: its absence is on
    // screen, unlike the runway/backlog roots that were requested while still off-glass.
    if (urgent) pendingRoots.unshift(root);
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
    return pendingRoots.length + inFlight.size;
  }

  /** Whether the root still has unuploaded geometry (nil driver treats every hold as pending). */
  function stillPending(root) {
    if (!root) return false;
    if (hasUnresident) {
      try { return hasUnresident(root) === true; } catch (_) { return true; }
    }
    const geometry = (root.userData && root.userData.sfResidencyGeometry) || root.geometry;
    if (geometry) return geometry.userData?.spacefaceGpuResident !== true;
    return isHeld(root);
  }

  function settleRoot(root, startedAt, error) {
    inFlight.delete(root);
    counters.uploadRuns += 1;
    const spent = nowMs() - startedAt;
    counters.uploadMsTotal += spent;
    if (spent > counters.uploadMsMax) counters.uploadMsMax = spent;
    if (error) {
      counters.uploadFailures += 1;
      if (onError) {
        try { onError('residency upload failed', error); } catch (_) { /* reported once */ }
      }
      // A failed decode is not a reason to spin: drop the request but keep the root held
      // so a drawable never appears unready. The next admission request retries.
      pendingSet.delete(root);
      return;
    }
    if (stillPending(root)) {
      // The driver prepared a batch, but this root still holds unuploaded geometry
      // (a late child mount). Put it back on the queue; it is not visible yet.
      if (pendingSet.has(root)) pendingRoots.push(root);
      return;
    }
    pendingSet.delete(root);
    releaseRoot(root);
  }

  /**
   * Drain the upload queue through the off-screen residency driver. Called from a bounded
   * background task, never inside a presented frame. One batch per call: the driver is
   * already sliced and yields to the browser between proxy uploads.
   */
  function drainUploads(maxRoots = 2) {
    if (!requestRoots) return 0;
    const now = nowMs();
    // 4 Hz ceiling: the queue is a safety net, not a per-frame cost.
    if (now - lastDrainAt < 200) return 0;
    // Drop roots that became resident through another lane (live geometry admission), and
    // any request old enough that its drawable is gone.
    while (pendingRoots.length > 0) {
      const head = pendingRoots[0];
      const requestedAt = Number(head && head.userData && head.userData.sfResidencyRequestedAt);
      const expired = Number.isFinite(requestedAt) && (now - requestedAt) > RESIDENCY_REQUEST_TTL_MS;
      if (!stillPending(head) || expired) {
        pendingRoots.shift();
        pendingSet.delete(head);
        if (!expired) releaseRoot(head);
        continue;
      }
      break;
    }
    if (pendingRoots.length === 0) return 0;
    lastDrainAt = now;
    const batch = [];
    const limit = Math.max(1, Math.min(maxRoots | 0 || 1, pendingRoots.length));
    for (let i = 0; i < limit; i++) {
      const root = pendingRoots.shift();
      if (!root || !stillPending(root)) {
        if (root) { pendingSet.delete(root); releaseRoot(root); }
        continue;
      }
      inFlight.add(root);
      batch.push(root);
    }
    if (batch.length === 0) return 0;
    const startedAt = nowMs();
    let result;
    try {
      result = requestRoots(batch);
    } catch (error) {
      for (const root of batch) settleRoot(root, startedAt, error);
      return 0;
    }
    if (result && typeof result.then === 'function') {
      result.then(
        () => { for (const root of batch) settleRoot(root, startedAt, null); },
        (error) => { for (const root of batch) settleRoot(root, startedAt, error); },
      );
    } else {
      for (const root of batch) settleRoot(root, startedAt, null);
    }
    return batch.length;
  }

  function snapshot() {
    refreshDelayPercentiles();
    return {
      frames: counters.frames,
      draws: counters.draws,
      admittedResident: counters.admittedResident,
      admittedInline: counters.admittedInline,
      heldDraws: counters.heldDraws,
      visibleUnready: counters.visibleUnready,
      preAdmittedHolds: counters.preAdmittedHolds,
      uploadRequests: counters.uploadRequests,
      uploadRuns: counters.uploadRuns,
      uploadFailures: counters.uploadFailures,
      uploadMsTotal: Math.round(counters.uploadMsTotal * 10) / 10,
      uploadMsMax: Math.round(counters.uploadMsMax * 10) / 10,
      heldRoots: counters.heldRoots,
      releasedRoots: counters.releasedRoots,
      pending: pendingCount(),
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
    holdRoot,
    releaseRoot,
    requestUpload,
    isHeld,
    pendingCount,
    drainUploads,
    snapshot,
    counters,
  };
}
