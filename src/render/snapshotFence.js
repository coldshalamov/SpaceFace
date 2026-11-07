// Presentation snapshot fence. Render reads the latest complete packed frame,
// never live entity objects. Required before a simulation Worker.

import { createPresentationSnapshot, SNAPSHOT_COLUMNS } from './presentationSnapshot.js';

// E1 playout buffer: the presented moment plays at NEWEST − playoutDelay, so arrival
// jitter (worker replies at 2–10 Hz under load) lands inside history instead of on the
// drawn frame. 18 buffers ≈ 300 ms of packs at pack-per-tick — the delay plus the
// extrapolation window always have real history to interpolate against.
export const SNAPSHOT_FENCE_BUFFERS = 18;
/** Longest the presented moment may run past the latest completed pack (worker silence). */
export const PRESENTATION_EXTRAPOLATION_S = 0.15;
/**
 * Adaptive playout delay (33–100 ms, start 50 ms). The target moment is the newest pack's
 * sim time minus this delay; the delay grows when the buffer runs dry (the presented clock
 * reached the newest sample before the next pack arrived) and shrinks while history shows
 * comfortable headroom. This is the number the player feels as input latency, so it is
 * bounded and measured, never unbounded.
 */
export const PLAYOUT_DELAY_MIN_S = 0.033;
export const PLAYOUT_DELAY_MAX_S = 0.1;
export const PLAYOUT_DELAY_START_S = 0.05;
/**
 * Phase-correction horizon for the presented clock (the PLL's proportional band). A
 * 100 ms phase error asks for the full ±20 % rate correction; the correction is bounded,
 * so the clock eases toward its delayed target over ~0.3–0.5 s instead of closing 43 % of
 * the gap in one frame (the old τ = 30 ms was ~3× too fast and read as a jump).
 */
export const PLAYOUT_CORRECTION_TAU_S = 0.1;
/** Total presented-rate correction bounds: never faster than 1.2× or slower than 0.8×. */
const PLAYOUT_RATE_FAST = 1.2;
const PLAYOUT_RATE_SLOW = 0.8;
/** Applied-delay easing horizon (the target itself is bounded and moves in small steps). */
const PLAYOUT_DELAY_TAU_S = 0.08;
/**
 * A healthy applied lead above this eases the adaptive delay back down; a lead below the
 * 33 ms floor (or a dry commit) grows it. The comfort point sits below the max so a spike
 * in arrival jitter raises the delay without parking it at the 100 ms ceiling.
 */
const PLAYOUT_DELAY_COMFORT_S = 0.055;
/** Delay adjustments per commit: dry buffer +8 ms, comfortable history −2 ms. */
const PLAYOUT_DRY_STEP_S = 0.008;
const PLAYOUT_HEALTHY_STEP_S = 0.002;
/**
 * Rate modulation: the presented clock slows proportionally once less than this much
 * runway (history + extrapolation) remains ahead of it, flooring at PLAYOUT_RATE_MIN.
 */
const PLAYOUT_RUNWAY_TARGET_S = 0.2;
const PLAYOUT_RATE_MIN = 0.15;
/**
 * Sim-rate measurement window. A bursty worker (four ticks in one reply, then silence) must
 * not be mistaken for a fast clock: the EMA averages the sim-time the newest pack gained per
 * presented wall second over a full second before it can move the playback rate far.
 */
const PRESENTATION_RATE_WINDOW_S = 1.0;
const PRESENTATION_RATE_MAX = 1.5;
/**
 * Bounded velocity extrapolation past the newest pack, measured in the pair's OWN hop. A
 * 390 wu/s hull at 60 Hz hops 6.5 wu per tick; the old fixed 40 wu cap rejected that
 * legitimate extrapolation at the 150 ms window boundary and snapped the hull back.
 * Reject only a hop that is itself teleport-sized, and clamp the extrapolation parameter
 * to the hop count the 150 ms window can reach (9 hops at 60 Hz, 12 gives headroom).
 */
const EXTRAPOLATION_MAX_HOPS = 12;

// E1 diagnostic kill-switch: `?playout=0` restores the pre-playout clock (chase the newest
// pack, fixed 100 ms extrapolation cap, no delay, no rate modulation) so the SAME binary can
// show the before/after of the stall pattern side by side. Diagnostic only; absent = playout on.
function playoutDisabledByParam() {
  try {
    if (typeof globalThis.location === 'undefined') return false;
    return new URLSearchParams(globalThis.location.search).get('playout') === '0';
  } catch (_) {
    return false;
  }
}
const PLAYOUT_DISABLED = playoutDisabledByParam();
const LEGACY_EXTRAPOLATION_S = 0.1;
const LEGACY_CATCHUP_GAIN = 0.25;

/** Bytes written into the packed columns for one entity. All column kinds are 4-byte. */
export const PACKED_BYTES_PER_ENTITY = Object.values(SNAPSHOT_COLUMNS)
  .reduce((total, spec) => total + spec.stride, 0) * 4;
/** Bytes recorded for one journal event: kind + index + payload, all u32. */
export const PACKED_BYTES_PER_JOURNAL_EVENT = 12;
/** Commits of byte counts kept for p50/p95 reporting. Preallocated — no per-frame allocation. */
export const PACK_BYTES_RING = 64;

// E10/E1 diagnostic seam: the fence instance lives inside the renderer, so the most recent
// fence registers itself here for the frame-truth recorder (and any future probe). Read-only —
// registration must never affect presentation.
let latestCreatedFence = null;
export function getLatestSnapshotFence() {
  return latestCreatedFence;
}

function readonlyColumns(columns) {
  // Ownership is the immutability boundary: only the writer slot can call
  // write(), and commit rotates to another slot before the next pack. Do not
  // proxy typed-array element reads on the render hot path. The facade is built once per buffer;
  // getters resolve the current typed-array value because presentationSnapshot grows by replacing
  // columns[name] when a population spike exceeds capacity.
  const facade = {};
  for (const name of Object.keys(columns || {})) {
    Object.defineProperty(facade, name, {
      enumerable: true,
      configurable: false,
      get() { return columns[name]; },
    });
  }
  return Object.freeze(facade);
}

export function createSnapshotFence(options = {}) {
  const buffers = Array.from({ length: SNAPSHOT_FENCE_BUFFERS }, () => {
    const snapshot = createPresentationSnapshot({
      capacity: options.capacity || 256,
      journalCapacity: options.journalCapacity,
    });
    const indexByEntityId = new Map();
    const publishedColumns = readonlyColumns(snapshot.columns);
    const state = {
      snapshot,
      indexByEntityId,
      sealed: true,
      simTime: 0,
      sequence: 0,
      // Interpolation epoch. Two packs may only be interpolated against each other when the pose
      // stream between them is continuous; a sector jump or a mirror rebuild reassigns slots and
      // teleports every body, so packs on either side of one are not comparable.
      poseEpoch: 0,
      // Slot→packed-row hint table for the pack that committed this buffer. The mesh
      // apply resolves a row by one typed-array read instead of an identity-map probe;
      // every read is verified against the entityId column and misses fall back to the
      // map, so the table is a pure accelerator — semantics stay fail-closed.
      slotRows: new Int32Array(0),
      // When true the identity map does not describe this buffer's latest pack (the
      // membership-stable fast path left it stale on purpose). The first identity
      // lookup rebuilds it from the entityId column — a pure derivation, so callers
      // that never probe pay nothing.
      indexStale: false,
      // Diagnostic: how many times the identity map was rebuilt. The presented-pose reader
      // scans the entityId column for a stale pack instead of minting the whole Map; this
      // counter proves the recorder does not rebuild ~150 entries per presented frame.
      indexRebuilds: 0,
    };
    function ensureSlotRows(slots) {
      const needed = Math.max(0, Math.floor(Number(slots) || 0));
      if (state.slotRows.length >= needed) return;
      let next = state.slotRows.length || 64;
      while (next < needed) next *= 2;
      state.slotRows = new Int32Array(next);
    }
    function rebuildIndex() {
      indexByEntityId.clear();
      const ids = snapshot.columns.entityId;
      const n = snapshot.count | 0;
      for (let i = 0; i < n; i++) indexByEntityId.set(ids[i] >>> 0, i);
      state.indexStale = false;
      state.indexRebuilds++;
    }
    const publishedIndexByEntityId = Object.freeze({
      get(entityId) { if (state.indexStale) rebuildIndex(); return indexByEntityId.get(entityId); },
      has(entityId) { if (state.indexStale) rebuildIndex(); return indexByEntityId.has(entityId); },
      get size() { if (state.indexStale) rebuildIndex(); return indexByEntityId.size; },
    });
    state.publishedIndexByEntityId = publishedIndexByEntityId;
    state.publishedColumns = publishedColumns;
    const writable = {
      get schema() { return snapshot.schema; },
      get columns() { return snapshot.columns; },
      get count() { return snapshot.count; },
      get capacity() { return snapshot.capacity; },
      get generation() { return snapshot.generation; },
      get journalDropped() { return snapshot.journalDropped; },
      get slotRows() { return state.slotRows; },
      beginFrame(expectedCount, slotCapacity = 0) {
        if (state.sealed) state.sealed = false;
        indexByEntityId.clear();
        state.indexStale = false;
        ensureSlotRows(slotCapacity);
        if (slotCapacity > 0) state.slotRows.fill(-1, 0, slotCapacity);
        return snapshot.beginFrame(expectedCount);
      },
      // Membership-stable fast pack: the identity map is left stale rather than
      // cleared+re-minted — the bulk column blit already produced identical rows,
      // and any later identity probe rebuilds the map on first access. slotRows is
      // left for the caller to adopt from the previous pack's table.
      beginFrameReuse(expectedCount, slotCapacity = 0) {
        if (state.sealed) state.sealed = false;
        state.indexStale = true;
        ensureSlotRows(slotCapacity);
        return snapshot.beginFrame(expectedCount);
      },
      blitColumnsFrom(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.blitColumnsFrom(...args);
      },
      rewriteAt(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.rewriteAt(...args);
      },
      write(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        const index = snapshot.write(...args);
        state.indexByEntityId.set(args[0] >>> 0, index);
        return index;
      },
      copyRow(previousSnapshot, sourceIndex) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        const index = snapshot.copyRow(previousSnapshot.columns, sourceIndex);
        state.indexByEntityId.set(previousSnapshot.columns.entityId[sourceIndex] >>> 0, index);
        return index;
      },
      setTint(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.setTint(...args);
      },
      setLean(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.setLean(...args);
      },
      setGeneration(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.setGeneration(...args);
      },
      record(...args) {
        if (state.sealed) throw new Error('Presentation snapshot fence buffer is sealed');
        return snapshot.record(...args);
      },
      drainJournal(...args) { return snapshot.drainJournal(...args); },
    };
    const published = Object.freeze({
      schema: snapshot.schema,
      columns: publishedColumns,
      get count() { return snapshot.count; },
      get capacity() { return snapshot.capacity; },
      get generation() { return snapshot.generation; },
      get journalDropped() { return snapshot.journalDropped; },
      get simTime() { return state.simTime; },
      get sequence() { return state.sequence; },
      get poseEpoch() { return state.poseEpoch; },
      get indexByEntityId() { return state.publishedIndexByEntityId; },
      get slotRows() { return state.slotRows; },
    });
    state.writable = Object.freeze(writable);
    state.published = published;
    return state;
  });
  let write = 0;
  let latest = -1;
  let previous = -1;
  let sequence = 0;
  let packCount = 0;
  const packBytesRing = new Float64Array(PACK_BYTES_RING);
  let packBytesIndex = 0;
  let packBytesCount = 0;
  let lastBytesPacked = 0;
  let lastPackMembership = null;
  let presentedTime = NaN;
  let presentedSequence = -1;
  let presentedEpoch = -1;
  let presentedSnapshotTime = NaN;
  let presentationRate = 1;
  let rateWallS = 0;
  let rateSimS = 0;
  // E1 playout state: the adaptive delay and the buffer pair the presented moment
  // interpolates between (buffer indices, re-resolved every sample).
  let playoutDelayS = PLAYOUT_DELAY_START_S;
  let playoutDelayTargetS = PLAYOUT_DELAY_START_S;
  let presentedPair = null;          // { a: olderBufferIndex, b: newerBufferIndex, alpha }
  let presentedValid = false;        // a presented sample has run at least once
  let playoutDryEvents = 0;          // commits that landed with the buffer already dry
  // The minimum applied lead (newest − presented) seen since the last commit. A commit
  // prices the delay the viewer just experienced: the trough of the lead, not the value
  // in the instant the new pack lands (which includes the pack's own advance).
  let delayMinSinceCommitS = Infinity;
  let rateSeeded = false;            // first real sim interval has set the playback rate
  let rateIdleS = 0;                 // presented time since the newest pack last advanced
  // Scratch for the newest→oldest sealed-buffer ordering (no per-frame allocation).
  const bracketOrder = new Int32Array(SNAPSHOT_FENCE_BUFFERS);

  // Sealed buffers ordered newest→oldest by commit sequence (n ≤ SNAPSHOT_FENCE_BUFFERS).
  function orderedSealedBuffers() {
    let count = 0;
    for (let i = 0; i < buffers.length; i++) {
      const buffer = buffers[i];
      if (buffer.sealed && buffer.sequence > 0) bracketOrder[count++] = i;
    }
    for (let i = 1; i < count; i++) {
      const value = bracketOrder[i];
      let j = i - 1;
      while (j >= 0 && buffers[bracketOrder[j]].sequence < buffers[value].sequence) {
        bracketOrder[j + 1] = bracketOrder[j];
        j--;
      }
      bracketOrder[j + 1] = value;
    }
    return count;
  }

  function sameEpochPair(olderIdx, newerIdx) {
    return olderIdx >= 0 && newerIdx >= 0
      && buffers[olderIdx].poseEpoch === buffers[newerIdx].poseEpoch;
  }

  // Row lookup that honors a stale identity map without rebuilding it. The fast pack
  // (beginFrameReuse) leaves the map stale on purpose because membership did not move; the
  // recorder/anchor path only needs one id, so a column scan is cheaper than minting the
  // whole Map every presented frame.
  function presentedRowIndex(buffer, entityId) {
    if (!buffer) return -1;
    if (buffer.indexStale) {
      const ids = buffer.published.columns.entityId;
      const want = entityId >>> 0;
      const n = buffer.published.count | 0;
      for (let i = 0; i < n; i++) if (ids[i] === want) return i;
      return -1;
    }
    return snapshotIndexOf(buffer.published, entityId);
  }

  function presentedPoseInto(entityId, out) {
    if (!presentedValid || !presentedPair || presentedPair.b < 0) return null;
    const b = buffers[presentedPair.b];
    if (!b || !b.sealed) return null;
    const a = presentedPair.a >= 0 ? buffers[presentedPair.a] : null;
    // The bracket resolver only ever pairs one pose stream; re-check here because the
    // register is also written by the legacy clock and by callers that restore a pair.
    if (a && (!a.sealed || a.poseEpoch !== b.poseEpoch)) return null;
    const rowB = presentedRowIndex(b, entityId);
    if (rowB < 0) return null;
    const alpha = Number.isFinite(presentedPair.alpha) ? presentedPair.alpha : 1;
    const rowA = a && alpha !== 1 ? presentedRowIndex(a, entityId) : -1;
    const pose = resolvePoseInto(
      b.published, rowA >= 0 ? a.published : null, entityId, alpha, -1, out, rowB, rowA,
    );
    if (!pose) return null;
    pose.rot = -2 * Math.atan2(pose.qy, pose.qw || 1);
    pose.valid = true;
    return pose;
  }

  const fence = {
    beginPack(expectedCount, simTime = 0, poseEpoch = 0, slotCapacity = 0) {
      const buffer = buffers[write];
      buffer.writable.beginFrame(expectedCount, slotCapacity);
      buffer.simTime = Number.isFinite(simTime) ? simTime : 0;
      buffer.sequence = sequence + 1;
      buffer.poseEpoch = Number.isFinite(poseEpoch) ? poseEpoch : 0;
      return buffer.writable;
    },
    // Same begin, for the membership-stable fast pack: the identity map is left
    // stale (first probe rebuilds it from the entityId column) and slotRows is
    // adopted from the previous pack's table instead of re-minted.
    beginPackReuse(expectedCount, simTime = 0, poseEpoch = 0, slotCapacity = 0) {
      const buffer = buffers[write];
      buffer.writable.beginFrameReuse(expectedCount, slotCapacity);
      buffer.simTime = Number.isFinite(simTime) ? simTime : 0;
      buffer.sequence = sequence + 1;
      buffer.poseEpoch = Number.isFinite(poseEpoch) ? poseEpoch : 0;
      return buffer.writable;
    },
    // Membership stamp the fast pack's eligibility compares against. The pack
    // records the world's allocations/retirements counters at every commit; a
    // stamp that still matches the world's counters proves the live set (and
    // therefore the packed row order) is unchanged.
    notePackMembership(diagnostics) {
      if (!diagnostics || !Number.isInteger(diagnostics.allocations)
        || !Number.isInteger(diagnostics.retirements)) {
        lastPackMembership = null;
        return;
      }
      lastPackMembership = {
        allocations: diagnostics.allocations | 0,
        retirements: diagnostics.retirements | 0,
      };
    },
    get packMembership() { return lastPackMembership; },
    commit() {
      const buffer = buffers[write];
      if (buffer.sealed) throw new Error('Presentation snapshot fence commit without beginPack');
      sequence++;
      previous = latest;
      latest = write;
      buffer.sealed = true;
      buffer.sequence = sequence;
      write = (write + 1) % SNAPSHOT_FENCE_BUFFERS;
      packCount++;
      lastBytesPacked = buffer.snapshot.count * PACKED_BYTES_PER_ENTITY
        + buffer.snapshot.journalCount * PACKED_BYTES_PER_JOURNAL_EVENT;
      packBytesRing[packBytesIndex] = lastBytesPacked;
      packBytesIndex = (packBytesIndex + 1) % PACK_BYTES_RING;
      if (packBytesCount < PACK_BYTES_RING) packBytesCount++;
      // E1 adaptive playout delay. The pack that just landed prices the delay the viewer
      // ACTUALLY experienced: the trough of the applied lead since the previous commit.
      // Reading the headroom at landing time overstates it by the pack's own advance (and
      // a coalesced burst prices the same gap once). A trough below the 33 ms floor means
      // history ran dry; a comfortable trough above the band eases the delay back down.
      // The adjustment is bounded in both directions, so the delay never leaves [33, 100].
      if (Number.isFinite(buffer.simTime) && presentedValid && Number.isFinite(presentedTime)) {
        if (buffer.poseEpoch !== presentedEpoch) {
          presentedPair = null;
        } else if (Number.isFinite(delayMinSinceCommitS)) {
          if (delayMinSinceCommitS < PLAYOUT_DELAY_MIN_S) {
            playoutDelayTargetS = Math.min(
              PLAYOUT_DELAY_MAX_S, playoutDelayTargetS + PLAYOUT_DRY_STEP_S,
            );
            if (delayMinSinceCommitS <= 0.004) playoutDryEvents++;
          } else if (delayMinSinceCommitS > PLAYOUT_DELAY_COMFORT_S) {
            playoutDelayTargetS = Math.max(
              PLAYOUT_DELAY_MIN_S, playoutDelayTargetS - PLAYOUT_HEALTHY_STEP_S,
            );
          }
        }
        delayMinSinceCommitS = Infinity;
      }
      return sequence;
    },
    /**
     * The newer pack of the pair the presented moment currently interpolates between
     * (E1 playout). Falls back to the newest committed pack before the first presented
     * sample. The PACK WRITERS must not consume this — they need `newestSnapshot()`.
     */
    latestSnapshot() {
      if (presentedValid && presentedPair && presentedPair.b >= 0
          && buffers[presentedPair.b].sealed) {
        return buffers[presentedPair.b].published;
      }
      if (latest < 0) return null;
      return buffers[latest].published;
    },
    /**
     * The older pack of the presented pair, or null when there is none. Guards the pose
     * epoch like the pack-stream predecessor it replaces.
     *
     * A sector jump teleports every body thousands of world units and reassigns mirror slots, so
     * the pack taken before the jump is not a pose the pack after it may be blended against.
     * Blending them anyway drew the player's own hull partway between the two sectors and, because
     * a standing-still root is neither dirty nor pose-delta, that wrong pose then froze for the
     * rest of the session. Packs only interpolate inside one continuous pose epoch.
     */
    previousSnapshot() {
      if (presentedValid && presentedPair && presentedPair.a >= 0 && presentedPair.b >= 0
          && buffers[presentedPair.a].sealed && buffers[presentedPair.b].sealed
          && sameEpochPair(presentedPair.a, presentedPair.b)) {
        return buffers[presentedPair.a].published;
      }
      if (packCount < 2 || previous < 0 || latest < 0) return null;
      if (buffers[previous].poseEpoch !== buffers[latest].poseEpoch) return null;
      return buffers[previous].published;
    },
    /** The true newest committed pack — the pack writers' copy base. */
    newestSnapshot() {
      if (latest < 0) return null;
      return buffers[latest].published;
    },
    /**
     * The PRESENTED pose (position + heading + validity) of one entity on the ONE
     * presentation-space clock: the presented bracket pair blended at the presented alpha
     * (extrapolation included — alpha > 1 extends along A→B). This is what the meshes drew
     * this frame; the mirrored facade row answers the newest authoritative pose instead, so
     * every presentation anchor (tether/beam/trail/VFX) and every diagnostic that means
     * "what the player saw" must read here (E1/E10).
     */
    presentedPose(entityId, out = {}) {
      return presentedPoseInto(entityId, out);
    },
    /** Position-only view of presentedPose, for the frame-truth recorder. */
    presentedRowPose(entityId, out = {}) {
      return presentedPoseInto(entityId, out);
    },
    // Sample once per drawn frame (elapsedS = wall frame time already scaled by the game time
    // scale). E1 playout buffer: the presented moment is a wall-clock-driven playback of
    // RECORDED history, NOT a chase of the newest state. Per frame:
    //   1. presentedTime advances by elapsed * rate (rate = measured sim-seconds per
    //      presented-second, EMA over ~0.2 s windows) — a worker running at 0.67x draws as
    //      smooth 0.67x motion;
    //   2. the target moment is `newestPackSimTime − playoutDelay` (adaptive 33–100 ms), so a
    //      late reply lands INSIDE history and the drawn world never notices;
    //   3. the gap to that target closes with a no-overshoot exponential of fixed horizon
    //      (PLAYOUT_CORRECTION_TAU_S ≈ 90 ms to settle) — after extrapolation the clock
    //      re-seats smoothly; it never rewinds and never snaps;
    //   4. it may run past the newest sample by at most PRESENTATION_EXTRAPOLATION_S (150 ms):
    //      the returned alpha then exceeds 1 and applySnapshotPoseToMesh extrapolates each pose
    //      along its previous->latest velocity, bounded per row by EXTRAPOLATION_MAX_WU.
    // The pair of history packs bracketing the presented moment is what latestSnapshot()/
    // previousSnapshot() serve until the next sample. Presentation only: the simulation stays
    // authoritative.
    samplePresentationAlpha(elapsedS, accumulatorS, fixedDt, fallbackAlpha = 1) {
      if (latest < 0) return fallbackAlpha;
      const current = buffers[latest].published;
      const elapsed = Number.isFinite(elapsedS) ? Math.max(0, Math.min(elapsedS, 0.25)) : 0;
      if (PLAYOUT_DISABLED) {
        // Legacy clock (the "before"): chase newest.simTime + accumulator − fixedDt with the
        // per-frame catch-up gain and a fixed 100 ms extrapolation cap. Present for the
        // diagnostic comparison only.
        const prior = this.previousSnapshot();
        const span = prior ? current.simTime - prior.simTime : 0;
        const raw = poseSpanAlpha(current, prior, accumulatorS, fixedDt, fallbackAlpha);
        const target = span > 0 ? prior.simTime + span * raw : current.simTime;
        const reset = presentedEpoch !== current.poseEpoch
          || current.simTime < presentedSnapshotTime || !Number.isFinite(presentedTime);
        if (reset) {
          presentedTime = target;
          presentationRate = 1;
          rateWallS = 0;
          rateSimS = 0;
        } else {
          rateWallS += elapsed;
          rateSimS += current.simTime - presentedSnapshotTime;
          if (rateWallS >= PRESENTATION_RATE_WINDOW_S) {
            const sample = rateSimS / rateWallS;
            presentationRate += (Math.max(0, Math.min(PRESENTATION_RATE_MAX, sample))
              - presentationRate) * 0.5;
            rateWallS = 0;
            rateSimS = 0;
          }
          const cap = current.simTime + LEGACY_EXTRAPOLATION_S;
          let next = presentedTime + elapsed * presentationRate;
          if (target > next) next += (target - next) * LEGACY_CATCHUP_GAIN;
          if (next > cap) next = cap;
          presentedTime = Math.max(presentedTime, next);
        }
        presentedSequence = current.sequence;
        presentedEpoch = current.poseEpoch;
        presentedSnapshotTime = current.simTime;
        presentedValid = true;
        if (!(span > 0)) {
          presentedPair = { a: -1, b: latest, alpha: 1 };
          return 1;
        }
        const alpha = (presentedTime - prior.simTime) / span;
        presentedPair = { a: previous, b: latest, alpha: alpha < 0 ? 0 : alpha };
        return alpha < 0 ? 0 : alpha;
      }
      const reset = presentedEpoch !== current.poseEpoch
        || current.simTime < presentedSnapshotTime || !Number.isFinite(presentedTime);
      if (reset) {
        // Teleport / rebuild / clock rewind: snap to the delayed target (the sim flagged the
        // discontinuity via the pose epoch — this is the sanctioned snap). The tuned playback
        // rate survives a sector jump (the worker cadence did not change); only the phase and
        // the delay-measurement window restart.
        presentedTime = current.simTime - playoutDelayS;
        presentedPair = null;
        rateWallS = 0;
        rateSimS = 0;
        rateSeeded = false;
        rateIdleS = 0;
        delayMinSinceCommitS = Infinity;
      } else {
        // Ease the applied delay toward its bounded adaptive target.
        playoutDelayS += (playoutDelayTargetS - playoutDelayS)
          * Math.min(1, elapsed / PLAYOUT_DELAY_TAU_S);
        // Sim-rate measurement over >= 1 s of presented frames: sim-seconds the newest pack
        // gained per presented wall second. Seed from the first real interval after a reset
        // so a worker already running at 0.5x does not play at 1x for a full window.
        const simDeltaS = current.simTime - presentedSnapshotTime;
        if (Number.isFinite(simDeltaS) && simDeltaS >= 0) {
          const afterIdle = rateIdleS > 0.3;
          if (simDeltaS > 0) {
            if (afterIdle) {
              // A pack that lands after a long gap carries the whole gap as one delta. It is
              // not evidence of a fast clock: keep the last known rate and start the window
              // fresh from the next interval instead of spiking to the 1.5x cap.
              rateWallS = 0;
              rateSimS = 0;
            } else {
              rateWallS += elapsed;
              rateSimS += simDeltaS;
            }
            rateIdleS = 0;
          } else {
            // Worker silence. Count the wall time so a pack arriving after a short gap is
            // priced over the real delivery interval, but never let a long silence drive the
            // measured rate (and therefore the playback rate) to zero.
            rateIdleS += elapsed;
            rateWallS += elapsed;
          }
          if (rateWallS >= PRESENTATION_RATE_WINDOW_S) {
            if (rateSimS > 0 && !afterIdle) {
              const sample = rateSimS / rateWallS;
              presentationRate += (Math.max(0, Math.min(PRESENTATION_RATE_MAX, sample))
                - presentationRate) * 0.5;
            }
            rateWallS = 0;
            rateSimS = 0;
          }
          if (!rateSeeded && simDeltaS > 0 && rateWallS > 0.001) {
            // Seed from the average since the reset, not the single frame: the first pack
            // after a sparse interval carries several ticks and would otherwise read as an
            // 8–10x rate for one frame.
            presentationRate = Math.max(0, Math.min(
              PRESENTATION_RATE_MAX, rateSimS / rateWallS,
            ));
            rateSeeded = true;
            rateWallS = 0;
            rateSimS = 0;
          }
        }
        const target = current.simTime - playoutDelayS;
        // The delay may reach back past the recorded history (boot, after a rewind/reset,
        // or a fixture with shallow history): the clock then plays from the oldest pack
        // instead of holding before it. Live play keeps > 250 ms of packs, so the clamp
        // only releases once real history exists to play.
        let oldestSameEpoch = current.simTime;
        for (let i = 0; i < buffers.length; i++) {
          const buffer = buffers[i];
          if (buffer.sealed && buffer.sequence > 0 && buffer.poseEpoch === current.poseEpoch
              && buffer.simTime <= current.simTime && buffer.simTime < oldestSameEpoch) {
            oldestSameEpoch = buffer.simTime;
          }
        }
        const boundedTarget = Math.max(target, oldestSameEpoch);
        // Playback rate modulation: as the runway ahead of the presented clock drains
        // (history + the extrapolation window), play the remaining motion SLOWER instead of
        // arriving at a hard hold. A deep stall then reads as brief slow motion — never as a
        // frozen ship — and a healthy buffer plays at full rate. This is what lets a 400 ms
        // gap ride out with zero held frames: the 183 ms of lead+window stretch over ~1 s.
        const runwayS = (current.simTime + PRESENTATION_EXTRAPOLATION_S) - presentedTime;
        const runwayFactor = Number.isFinite(runwayS)
          ? Math.max(PLAYOUT_RATE_MIN, Math.min(1, runwayS / PLAYOUT_RUNWAY_TARGET_S))
          : 1;
        // Symmetric bounded rate servo around the delayed target. Positive phase error
        // (behind) speeds the clock up; negative error (ahead) slows it down. It never
        // rewinds and never exceeds 1.2x / 0.8x of the measured sim rate, so the reserve
        // cannot collapse to a chase-the-newest clock, and a catch-up burst cannot jump.
        const phaseErrorS = boundedTarget - presentedTime;
        const correction = Number.isFinite(phaseErrorS)
          ? Math.max(-(1 - PLAYOUT_RATE_SLOW), Math.min(PLAYOUT_RATE_FAST - 1,
            phaseErrorS / PLAYOUT_CORRECTION_TAU_S))
          : 0;
        let next = presentedTime
          + elapsed * presentationRate * (1 + correction) * runwayFactor;
        // Past the newest sample by more than the extrapolation window the clock holds; the
        // sim catches up to it. It never rewinds.
        const cap = current.simTime + PRESENTATION_EXTRAPOLATION_S;
        if (next > cap) next = cap;
        presentedTime = Math.max(presentedTime, next);
        const appliedLeadS = current.simTime - presentedTime;
        if (Number.isFinite(appliedLeadS) && appliedLeadS < delayMinSinceCommitS) {
          delayMinSinceCommitS = appliedLeadS;
        }
      }
      presentedSequence = current.sequence;
      presentedEpoch = current.poseEpoch;
      presentedSnapshotTime = current.simTime;
      presentedValid = true;
      const alpha = this.resolvePresentedBracket(presentedTime, fallbackAlpha);
      // The fence's sequence reads as the PRESENTED bracket's commit sequence while a
      // presented sample is active: the pose-apply compares this against the served
      // snapshot's sequence to choose the presented alpha (renderer contract, unchanged).
      if (presentedPair && presentedPair.b >= 0) {
        presentedSequence = buffers[presentedPair.b].sequence;
      }
      return alpha;
    },

    /**
     * Resolve the history pair bracketing the presented moment and return the blend parameter.
     * Every member — including the behind-history fallback — must carry the NEWEST pack's pose
     * epoch. Ordered newest→oldest, so a member on the other side of a sector jump ends the
     * search; the old-sector pair may never be served just because the presented clock lags
     * inside the new stream. Past the newest sample the newest pair blends (freshest velocity)
     * with alpha > 1; behind the oldest same-epoch pack that pack serves at alpha 0.
     */
    resolvePresentedBracket(timeS, fallbackAlpha = 1) {
      const count = orderedSealedBuffers();
      if (count === 0) {
        presentedPair = null;
        return fallbackAlpha;
      }
      const newestIdx = bracketOrder[0];
      const newest = buffers[newestIdx];
      const epoch = newest.poseEpoch;
      // The newest pack's same-epoch predecessor, if any (freshest known velocity pair).
      // Packs stamped AHEAD of the newest are a rewound/restarted stream, not history.
      let priorOfNewest = -1;
      for (let i = 1; i < count; i++) {
        const idx = bracketOrder[i];
        if (buffers[idx].poseEpoch !== epoch) break;
        if (buffers[idx].simTime <= newest.simTime) { priorOfNewest = idx; break; }
      }
      if (priorOfNewest < 0) {
        // No blend source in this epoch (boot, or the first pack after a teleport):
        // draw the arriving pose exactly instead of guessing.
        presentedPair = { a: -1, b: newestIdx, alpha: 1 };
        return 1;
      }
      if (!(timeS < newest.simTime)) {
        // Extrapolation zone: the newest pair carries the freshest known velocity.
        const span = newest.simTime - buffers[priorOfNewest].simTime;
        const alpha = span > 0 ? 1 + (timeS - newest.simTime) / span : 1;
        presentedPair = { a: priorOfNewest, b: newestIdx, alpha };
        return alpha;
      }
      // Walk only within the newest epoch. The first older pack from another epoch ends the
      // window: serving across it is exactly the old-sector ghost this contract forbids. A
      // same-epoch pack stamped ahead of the newest belongs to a rewound stream — skip it.
      let oldestSameEpoch = -1;
      let previousIdx = newestIdx;
      for (let i = 1; i < count; i++) {
        const idx = bracketOrder[i];
        if (buffers[idx].poseEpoch !== epoch) break;
        if (!(buffers[idx].simTime <= newest.simTime)) continue;
        oldestSameEpoch = idx;
        const newerIdx = previousIdx;
        const newer = buffers[newerIdx];
        const older = buffers[idx];
        if (timeS >= older.simTime && timeS <= newer.simTime) {
          const span = newer.simTime - older.simTime;
          const alpha = span > 0 ? (timeS - older.simTime) / span : 1;
          presentedPair = { a: idx, b: newerIdx, alpha };
          // Guard the register: a must always be the older member (L4).
          if (buffers[presentedPair.a].sequence >= buffers[presentedPair.b].sequence) {
            presentedPair.a = -1;
          }
          return alpha;
        }
        previousIdx = idx;
      }
      // Behind all same-epoch history (clock lagged past the ring after a long hold): serve
      // the oldest pack of THIS epoch at alpha 0; the servo re-seats without a rewind.
      if (oldestSameEpoch >= 0) {
        presentedPair = { a: -1, b: oldestSameEpoch, alpha: 0 };
        return 0;
      }
      presentedPair = { a: -1, b: newestIdx, alpha: 1 };
      return 1;
    },
  // E10 playout telemetry: the presented clock's latency behind the newest pack, the
  // extrapolation past it, the depth of history under the presented moment, and the
  // adaptive playout delay state.
  getPlayoutDiagnostics() {
    const current = latest >= 0 ? buffers[latest].published : null;
    const configured = {
      minMs: PLAYOUT_DELAY_MIN_S * 1000,
      maxMs: PLAYOUT_DELAY_MAX_S * 1000,
      startMs: PLAYOUT_DELAY_START_S * 1000,
    };
    if (!current) {
      return {
        delayMs: null,
        leadMs: null,
        extrapolateMs: null,
        bufferDepthPacks: 0,
        bracketDepthPacks: 0,
        historyPacks: 0,
        historySpanMs: 0,
        playoutDelayMs: playoutDelayS * 1000,
        playoutDelayTargetMs: playoutDelayTargetS * 1000,
        playoutConfiguredMs: configured,
        playoutDryEvents,
        presentedTimeS: NaN,
        latestSimTimeS: NaN,
        playbackRate: presentationRate,
        poseEpoch: null,
        packCount,
      };
    }
    const presented = Number.isFinite(presentedTime) ? presentedTime : current.simTime;
    // Depth of the presented bracket below the newest commit (commit order), plus the full
    // same-epoch history under the presented moment. `historyPacks` is the reserve the clock
    // can still play; `bracketDepthPacks` is how many commits the bracket trails the newest.
    let depth = 0;
    if (presentedPair && presentedPair.b >= 0) {
      const bracketSequence = buffers[presentedPair.b].sequence;
      depth = Math.max(0, current.sequence - bracketSequence);
    }
    let historyPacks = 0;
    let oldestSimTime = current.simTime;
    const epoch = buffers[latest].poseEpoch;
    for (let i = 0; i < buffers.length; i++) {
      const buffer = buffers[i];
      if (!buffer.sealed || buffer.sequence <= 0 || buffer.poseEpoch !== epoch) continue;
      if (buffer.simTime > current.simTime) continue;
      historyPacks++;
      if (buffer.simTime < oldestSimTime) oldestSimTime = buffer.simTime;
    }
    return {
      delayMs: Math.max(0, (current.simTime - presented) * 1000),
      leadMs: (current.simTime - presented) * 1000,
      extrapolateMs: Math.max(0, (presented - current.simTime) * 1000),
      // Historical name retained for existing readers; this is the bracket depth, not the
      // reserve under the presented moment.
      bufferDepthPacks: depth,
      bracketDepthPacks: depth,
      historyPacks,
      historySpanMs: Math.max(0, (current.simTime - oldestSimTime) * 1000),
      playoutDelayMs: playoutDelayS * 1000,
      playoutDelayTargetMs: playoutDelayTargetS * 1000,
      playoutConfiguredMs: configured,
      playoutDryEvents,
      presentedTimeS: presented,
      latestSimTimeS: current.simTime,
      playbackRate: presentationRate,
      poseEpoch: epoch,
      packCount,
    };
  },
    // The presented bracket's commit sequence while a presented sample is active (see
    // samplePresentationAlpha); the raw commit counter otherwise.
    get sequence() {
      if (presentedValid && presentedPair && presentedPair.b >= 0
          && buffers[presentedPair.b].sealed) {
        return presentedSequence;
      }
      return sequence;
    },
    get packCount() { return packCount; },
    /** Identity-map rebuilds across every ring buffer (diagnostic; a stale fast pack scans). */
    get indexRebuildCount() {
      let total = 0;
      for (let i = 0; i < buffers.length; i++) total += buffers[i].indexRebuilds | 0;
      return total;
    },
    /** Bytes packed by the most recent commit. 0 before the first pack. */
    get lastBytesPacked() { return lastBytesPacked; },
    /**
     * p50/p95 of bytes packed per commit over the retained ring. Sorts a scratch copy — call
     * from a witness/report cadence, not per frame.
     */
    bytesPackedStats() {
      if (packBytesCount === 0) return { samples: 0, last: 0, p50: 0, p95: 0, max: 0, mean: 0 };
      const scratch = Array.prototype.slice.call(packBytesRing, 0, packBytesCount).sort((a, b) => a - b);
      const pick = (q) => scratch[Math.min(scratch.length - 1, Math.max(0, Math.ceil(q * scratch.length) - 1))];
      let total = 0;
      for (let i = 0; i < scratch.length; i++) total += scratch[i];
      return {
        samples: scratch.length,
        last: lastBytesPacked,
        p50: pick(0.5),
        p95: pick(0.95),
        max: scratch[scratch.length - 1],
        mean: total / scratch.length,
      };
    },
  };
  latestCreatedFence = fence;
  return fence;
}

export function snapshotIndexOf(snapshot, entityId) {
  if (!snapshot || entityId == null) return -1;
  if (snapshot.indexByEntityId && typeof snapshot.indexByEntityId.get === 'function') {
    const indexed = snapshot.indexByEntityId.get(entityId >>> 0);
    return indexed == null ? -1 : indexed;
  }
  const ids = snapshot.columns && snapshot.columns.entityId;
  if (!ids) return -1;
  const want = entityId >>> 0;
  const n = snapshot.count | 0;
  for (let i = 0; i < n; i++) if (ids[i] === want) return i;
  return -1;
}

/**
 * Resolve an entity's packed row via its world slot. The slot table is a hint
 * only: a hit is verified against the entityId column, and a miss (or a
 * snapshot without the table — test doubles, raw writes) falls back to the
 * identity map, so callers keep fail-closed semantics for stale/recycled slots.
 */
export function snapshotRowForSlot(snapshot, slot, entityId) {
  if (!snapshot || !Number.isInteger(slot)) return -1;
  const slotRows = snapshot.slotRows;
  if (slotRows && slot >= 0 && slot < slotRows.length) {
    const row = slotRows[slot];
    const ids = snapshot.columns && snapshot.columns.entityId;
    if (row >= 0 && ids && ids[row] === (entityId >>> 0)) return row;
  }
  return snapshotIndexOf(snapshot, entityId);
}

// A completed pack can outlive the body that owned an id while the next stepped
// pack is still in flight. Only that body's current generation can authorize a
// pose; pre-column snapshots and callers without a generation retain id lookup.
export function snapshotHasEntityGeneration(snapshot, entityId, expectedGeneration, slotHint = -1) {
  const index = slotHint >= 0
    ? snapshotRowForSlot(snapshot, slotHint, entityId)
    : snapshotIndexOf(snapshot, entityId);
  if (index < 0) return false;
  const generations = snapshot.columns && snapshot.columns.generation;
  return !generations || !Number.isInteger(expectedGeneration)
    || generations[index] === (expectedGeneration >>> 0);
}

// A recycled entityId inside one pose epoch names a different body — the
// previous pack's row may only feed a blend (or the fence pack's copy path)
// when its generation matches the current row's. Snapshots lacking the
// generation column (test doubles, pre-column packs) keep index-only lookup.
function snapshotSameGenerationRow(previous, snapshot, entityId, index, slotHint = -1) {
  const prev = slotHint >= 0
    ? snapshotRowForSlot(previous, slotHint, entityId)
    : snapshotIndexOf(previous, entityId);
  if (prev < 0) return -1;
  const prevGens = previous.columns && previous.columns.generation;
  const curGens = snapshot.columns && snapshot.columns.generation;
  if (prevGens && curGens && prevGens[prev] !== curGens[index]) return -1;
  return prev;
}

/**
 * Pose blend parameter for the previous→latest pack span, normalized by that span's real length.
 *
 * The raw render alpha is accumulator/fixedDt — a fraction of ONE sim tick — and it is only the
 * correct blend while every present advances exactly one step, keeping the previous pack exactly
 * one tick behind the latest. On any frame that completes k > 1 steps (a missed vsync, a long
 * frame, present-first recovery after a late present) the previous pack sits k ticks back, and a
 * one-tick alpha across a k-tick span lands near the STALE previous pose: the hull holds last
 * frame's position for a whole present, then snaps the entire span forward on the next one. That
 * freeze-then-jump cadence is the visible judder under load. The rendered moment is always
 * latest.simTime + accumulator − fixedDt, so normalizing by the actual span
 *
 *   t = 1 + (accumulator − fixedDt) / (latest.simTime − previous.simTime)
 *
 * reduces to accumulator/fixedDt for a one-tick span and otherwise spreads catch-up motion across
 * the span at correct world speed. Degenerate spans (no predecessor, equal stamps, clock resets)
 * return the fallback alpha unchanged.
 */
export function poseSpanAlpha(latest, previous, accumulatorS, fixedDt, fallbackAlpha = 1) {
  if (!latest || !previous) return fallbackAlpha;
  const dt = Number.isFinite(fixedDt) && fixedDt > 0 ? fixedDt : 0;
  if (!(dt > 0)) return fallbackAlpha;
  const span = latest.simTime - previous.simTime;
  if (!Number.isFinite(span) || span <= 0) return fallbackAlpha;
  const acc = Number.isFinite(accumulatorS) ? accumulatorS : 0;
  const t = 1 + (acc - dt) / span;
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/**
 * Resolve the drawn alpha for a previous→latest pose pair.
 *
 * Extrapolation is bounded RELATIVE to the pair's own hop, never by an absolute distance the
 * pair did not earn: a 390 wu/s hull hops 6.5 wu per 60 Hz tick, and the 150 ms window may
 * legitimately extend that pair by 9 hops. Rejecting that as "40 wu of travel" snapped the
 * hull backwards and then held it. The only true discontinuity is a hop that is itself
 * teleport-sized for the pair's span (a same-tick respawn/relocation is >40 wu in one tick;
 * a 400 ms coalesced pack is allowed 40 wu per tick of its own span). Overshoot is CLAMPED
 * to the window's hop count, never reset to 1, so a boosted hull keeps moving.
 */
const EXTRAPOLATION_MAX_HOP_WU = 40;
const EXTRAPOLATION_TELEPORT_WU_PER_S = EXTRAPOLATION_MAX_HOP_WU * 60;

export function resolveExtrapolationAlpha(alpha, prevX, prevZ, x, z, spanS = 0) {
  let t = Number.isFinite(alpha) ? alpha : 1;
  if (t < 0) t = 0;
  const dx = Number(x) - Number(prevX);
  const dz = Number(z) - Number(prevZ);
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return 1;
  const hop = Math.hypot(dx, dz);
  const span = Number.isFinite(spanS) && spanS > 0 ? spanS : 0;
  const teleportLimit = Math.max(
    EXTRAPOLATION_MAX_HOP_WU,
    EXTRAPOLATION_MAX_HOP_WU + EXTRAPOLATION_TELEPORT_WU_PER_S * span,
  );
  // A teleport/respawn is not a blend source in EITHER direction: draw the arriving pose.
  if (hop > teleportLimit) return 1;
  const maxT = 1 + EXTRAPOLATION_MAX_HOPS;
  return t > maxT ? maxT : t;
}

// Reused pose scratch for the mesh writer (one drawn row at a time; never retained).
const _poseWriteScratch = {
  x: 0, y: 0, z: 0, qy: 0, qw: 1, rot: 0, t: 1, index: -1, prev: -1, valid: false,
};

/**
 * ONE pose resolver for the mesh writer, the diagnostics recorder, and the presentation-anchor
 * service. Returns the blended/extrapolated pose for `entityId` at `alpha`, or null when the
 * row is absent. Generation-recycled rows fail closed to the latest pose exactly (never blend
 * a dead body's pose into the replacement).
 */
function resolvePoseInto(snapshot, previous, entityId, alpha, slotHint, out, rowHint = -1, prevRowHint = -1) {
  const index = rowHint >= 0
    ? rowHint
    : (slotHint >= 0
      ? snapshotRowForSlot(snapshot, slotHint, entityId)
      : snapshotIndexOf(snapshot, entityId));
  if (index < 0 || index >= (snapshot.count | 0)) return null;
  const p = index * 3;
  const q = index * 4;
  let x = snapshot.columns.position[p];
  let z = snapshot.columns.position[p + 2];
  let qy = snapshot.columns.quaternion[q + 1];
  let qw = snapshot.columns.quaternion[q + 3];
  let t = Number.isFinite(alpha) ? alpha : 1;
  let prev = -1;
  if (previous && t !== 1) {
    if (prevRowHint >= 0) {
      const prevGens = previous.columns && previous.columns.generation;
      const curGens = snapshot.columns && snapshot.columns.generation;
      if (!prevGens || !curGens || prevGens[prevRowHint] === curGens[index]) prev = prevRowHint;
    } else {
      prev = snapshotSameGenerationRow(previous, snapshot, entityId, index, slotHint);
    }
  }
  if (prev >= 0) {
    const pp = prev * 3;
    const pq = prev * 4;
    const px = previous.columns.position[pp];
    const pz = previous.columns.position[pp + 2];
    const spanS = Number(snapshot.simTime) - Number(previous.simTime);
    t = resolveExtrapolationAlpha(t, px, pz, x, z, spanS);
    x = px + (x - px) * t;
    z = pz + (z - pz) * t;
    qy = previous.columns.quaternion[pq + 1] + (qy - previous.columns.quaternion[pq + 1]) * t;
    qw = previous.columns.quaternion[pq + 3] + (qw - previous.columns.quaternion[pq + 3]) * t;
  }
  out.x = x;
  out.y = snapshot.columns.position[p + 1] || 0;
  out.z = z;
  out.qy = qy;
  out.qw = qw;
  out.t = t;
  out.index = index;
  out.prev = prev;
  return out;
}

export function applySnapshotPoseToMesh(mesh, snapshot, entityId, origin, previous = null, alpha = 1, slotHint = -1) {
  if (!mesh || !mesh.position || !snapshot) return false;
  const pose = resolvePoseInto(
    snapshot, previous, entityId, alpha, slotHint, _poseWriteScratch,
  );
  if (!pose) return false;
  const ox = origin && Number.isFinite(origin.x) ? origin.x : 0;
  const oy = origin && Number.isFinite(origin.y) ? origin.y : 0;
  const oz = origin && Number.isFinite(origin.z) ? origin.z : 0;
  mesh.position.x = pose.x - ox;
  mesh.position.y = pose.y - oy;
  mesh.position.z = pose.z - oz;
  mesh.rotation.y = -2 * Math.atan2(pose.qy, pose.qw || 1);
  // Static-presentation roots keep matrixAutoUpdate=false (PERF-59): compose the pose here or
  // the walk never sees it.
  if (mesh.matrixAutoUpdate === false) mesh.updateMatrix();
  const hull = mesh.userData && mesh.userData.hull;
  if (hull && snapshot.columns.bank && snapshot.columns.pitch) {
    const index = pose.index;
    const prev = pose.prev;
    const t = pose.t;
    let bank = snapshot.columns.bank[index] || 0;
    let pitch = snapshot.columns.pitch[index] || 0;
    if (prev >= 0 && previous.columns.bank && previous.columns.pitch) {
      bank = previous.columns.bank[prev] + (bank - previous.columns.bank[prev]) * t;
      pitch = previous.columns.pitch[prev] + (pitch - previous.columns.pitch[prev]) * t;
    }
    hull.rotation.x = bank;
    hull.rotation.z = pitch;
  }
  return true;
}

/**
 * Membership-stable fast-pack eligibility. The previous committed pack may serve
 * as a byte-exact base only when EVERY packed row still names the same entity at
 * the same position: the world's allocations/retirements counters — which cover
 * every allocateRecord/retireSlot path — must not have moved since that commit,
 * and the pose epoch must match (a remap or sector jump makes rows incomparable).
 * Worlds lacking the counters, slotGenerations, entityIds, or the packDirty mask
 * (test doubles) get null and run the classic walk.
 */
function fastPackPrevious(world, fence, poseEpoch) {
  // The pack base is always the TRUE newest commit — never the presented bracket the
  // pose-apply accessors serve (E1): copying clean rows from a playout-delayed pack
  // would move them backwards in time.
  const previous = typeof fence.newestSnapshot === 'function'
    ? (fence.newestSnapshot() || (typeof fence.latestSnapshot === 'function'
      ? fence.latestSnapshot() : null))
    : (typeof fence.latestSnapshot === 'function' ? fence.latestSnapshot() : null);
  if (!previous || previous.poseEpoch !== poseEpoch || !previous.slotRows) return null;
  const stamp = fence.packMembership;
  if (!stamp || typeof world.getDiagnostics !== 'function') return null;
  const diagnostics = world.getDiagnostics();
  if (!diagnostics
    || (diagnostics.allocations | 0) !== stamp.allocations
    || (diagnostics.retirements | 0) !== stamp.retirements) return null;
  if (!world.packDirty || !world.entityIds || !world.slotGenerations || !world.alive) return null;
  return previous;
}

// Shared row rewrite for the fast pack: same bytes the classic walk's write +
// setLean + setGeneration sequence produces, at the row the slot already owns.
function rewritePackedRow(snapshot, world, slot, row, entityId) {
  let qy;
  let qw;
  if (world.yawSin && world.yawCos) {
    qy = world.yawSin[slot];
    qw = world.yawCos[slot];
  } else {
    const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
    const half = rot * 0.5;
    qy = Math.sin(half);
    qw = Math.cos(half);
  }
  snapshot.rewriteAt(
    row,
    entityId,
    world.typeCodes ? world.typeCodes[slot] : 0,
    world.x[slot],
    world.y[slot],
    world.z[slot],
    0, qy, 0, qw,
    1, 1, 1,
    world.flags[slot] >>> 0,
  );
  if (typeof snapshot.setLean === 'function') {
    snapshot.setLean(
      row,
      world.bank ? Number(world.bank[slot]) || 0 : 0,
      world.pitch ? Number(world.pitch[slot]) || 0 : 0,
    );
  }
  if (typeof snapshot.setGeneration === 'function') {
    snapshot.setGeneration(
      row,
      world.slotGenerations ? world.slotGenerations[slot] : 0,
    );
  }
}

export function packPresentationWorldToFence(world, fence, simTime = 0, poseEpoch = 0) {
  if (!world || !fence) return 0;
  const diagnostics = typeof world.getDiagnostics === 'function' ? world.getDiagnostics() : null;
  const active = diagnostics && Number.isInteger(diagnostics.active) ? diagnostics.active : 0;
  const slotCap = Number.isInteger(world.capacity)
    ? world.capacity
    : (world.packDirty ? world.packDirty.length : active);
  // Membership-stable fast pack: the previous commit is already a byte-exact
  // base, so one contiguous column blit plus rewrites of only the pack-dirty
  // rows replaces the O(active) row walk and the identity-map rebuild. The
  // atomic twin cannot observe mid-pack world churn, so no re-check is needed.
  const fastPrevious = fastPackPrevious(world, fence, poseEpoch);
  if (fastPrevious) {
    const snapshot = fence.beginPackReuse(Math.max(1, active), simTime, poseEpoch, slotCap);
    const slotRows = snapshot.slotRows;
    const previousRows = fastPrevious.slotRows;
    slotRows.set(previousRows.subarray(0, Math.min(previousRows.length, slotRows.length)));
    snapshot.blitColumnsFrom(fastPrevious.columns, fastPrevious.count);
    const dirty = world.packDirty;
    const scan = Math.min(dirty.length, slotRows.length);
    let bail = false;
    for (let slot = 0; slot < scan; slot++) {
      if (dirty[slot] === 0) continue;
      if (world.alive[slot] !== 1) continue;
      const row = slotRows[slot];
      const entityId = world.entityIds[slot] >>> 0;
      // A miss means the premise was wrong — never write a guess into the
      // snapshot; fall back to the classic walk for this frame instead.
      // The dirty bit clears only on commit: a bail must leave every bit set
      // so the classic walk re-packs what this discarded buffer consumed (G1a).
      if (row < 0 || row >= snapshot.count
        || fastPrevious.columns.entityId[row] !== entityId) { bail = true; break; }
      rewritePackedRow(snapshot, world, slot, row, entityId);
    }
    if (!bail) {
      dirty.fill(0, 0, scan);
      fence.commit();
      fence.notePackMembership(diagnostics);
      return snapshot.count;
    }
  }
  const snapshot = fence.beginPack(Math.max(1, active), simTime, poseEpoch, slotCap);
  // Dirty-column pack: the mask still holds every pose/visual write since the
  // last frame's consume when this runs (the pack precedes the sync pass), so a
  // clean slot's packed bytes are identical to the LATEST committed pack's row —
  // copy them verbatim instead of re-reading a dozen columns + re-deriving the
  // yaw pair + re-stamping lean. The latest pack must share this pack's pose
  // epoch: a slot remap (sector jump, mirror rebuild) teleports every row and
  // always falls back to the full write. (newestSnapshot is the pack minted
  // last frame — the presented bracket the pose accessors serve is playout-delayed
  // and would reintroduce poses dirtied since.)
  const previous = typeof fence.newestSnapshot === 'function'
    ? (fence.newestSnapshot() || (typeof fence.latestSnapshot === 'function'
      ? fence.latestSnapshot() : null))
    : (typeof fence.latestSnapshot === 'function' ? fence.latestSnapshot() : null);
  const previousIndex = previous && previous.poseEpoch === poseEpoch
    ? (previous.indexByEntityId || null) : null;
  let packed = 0;
  for (let index = 0; index < active; index++) {
    const slot = world.activeSlots[index];
    if (world.alive[slot] !== 1) continue;
    const entityId = world.entityIds[slot] >>> 0;
    // The pack owns its dirty bit: only writers that can change packed bytes
    // set it, so never-visited slots (allocated ALL for life) and byte-identical
    // BINDING/VISIBILITY/VISUAL marks copy verbatim instead of paying the scalar
    // write per presented frame. The generation term keeps a recycled id from
    // copying the prior body's row inside a shared epoch.
    if (previousIndex && world.packDirty && world.packDirty[slot] === 0) {
      const previousRow = previousIndex.get(entityId);
      const previousGenerations = previous.columns && previous.columns.generation;
      if (previousRow !== undefined && previousRow >= 0
          && (!previousGenerations || !world.slotGenerations
            || previousGenerations[previousRow] === (world.slotGenerations[slot] >>> 0))) {
        snapshot.slotRows[slot] = snapshot.copyRow(previous, previousRow);
        world.packDirty[slot] = 0;
        packed++;
        continue;
      }
    }
    // Prefer presentation-world half-yaw cache (filled on rot write). Fall back to sin/cos
    // for worlds that predate the cache columns or omit them in tests.
    let qy;
    let qw;
    if (world.yawSin && world.yawCos) {
      qy = world.yawSin[slot];
      qw = world.yawCos[slot];
    } else {
      const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
      const half = rot * 0.5;
      qy = Math.sin(half);
      qw = Math.cos(half);
    }
    const packedIndex = snapshot.write(
      entityId,
      world.typeCodes ? world.typeCodes[slot] : 0,
      world.x[slot],
      world.y[slot],
      world.z[slot],
      0, qy, 0, qw,
      1, 1, 1,
      world.flags[slot] >>> 0,
    );
    if (typeof snapshot.setLean === 'function') {
      snapshot.setLean(
        packedIndex,
        world.bank ? Number(world.bank[slot]) || 0 : 0,
        world.pitch ? Number(world.pitch[slot]) || 0 : 0,
      );
    }
    if (typeof snapshot.setGeneration === 'function') {
      snapshot.setGeneration(
        packedIndex,
        world.slotGenerations ? world.slotGenerations[slot] : 0,
      );
    }
    snapshot.slotRows[slot] = packedIndex;
    if (world.packDirty) world.packDirty[slot] = 0;
    packed++;
  }
  fence.commit();
  fence.notePackMembership(diagnostics);
  return packed;
}

/**
 * Loading-only stepped twin. With a stable source it matches the atomic pack.
 * A parked iterator reads mutable rows on later presents, so it cannot supply
 * a coherent completed-tick pose while gameplay advances. Live presentation
 * must use packPresentationWorldToFence, independent of admission pacing.
 */
export function* packPresentationWorldToFenceSteps(world, fence, simTime = 0, poseEpoch = 0, sliceEvery = 256) {
  if (!world || !fence) return 0;
  const diagnostics = typeof world.getDiagnostics === 'function' ? world.getDiagnostics() : null;
  const active = diagnostics && Number.isInteger(diagnostics.active) ? diagnostics.active : 0;
  // Structural counters captured at mint: while neither moves, no row can have
  // been appended, swap-moved, or recycled, and the post-mint sweeps are pure
  // re-verification — a quiet pack skips the O(active) membership walk.
  const allocationsAtMint = diagnostics ? (diagnostics.allocations | 0) : 0;
  const retirementsAtMint = diagnostics ? (diagnostics.retirements | 0) : 0;
  const every = Math.max(1, Math.floor(Number(sliceEvery) || 1));
  const slotCap = Number.isInteger(world.capacity)
    ? world.capacity
    : (world.packDirty ? world.packDirty.length : active);
  // Membership-stable fast pack: identical bytes and commit to the atomic
  // output — one column blit plus rewrites of only the pack-dirty rows. A
  // mid-park membership churn (allocations/retirements moved, or a slot-table
  // miss proving the premise wrong) discards the in-flight buffer and falls
  // through to the classic walk, still paced across the same yields.
  const fastPrevious = fastPackPrevious(world, fence, poseEpoch);
  if (fastPrevious) {
    const fastSnapshot = fence.beginPackReuse(Math.max(1, active), simTime, poseEpoch, slotCap);
    const slotRows = fastSnapshot.slotRows;
    const previousRows = fastPrevious.slotRows;
    slotRows.set(previousRows.subarray(0, Math.min(previousRows.length, slotRows.length)));
    fastSnapshot.blitColumnsFrom(fastPrevious.columns, fastPrevious.count);
    const dirty = world.packDirty;
    const scan = Math.min(dirty.length, slotRows.length);
    let bail = false;
    // Each mark is consumed as it is processed (W143-BG-1): the driver parks
    // mid-walk, so a mark landing on an already-scanned slot must survive to
    // the next pack — the classic walk's mark-after-process ⇒ next-pack-rewrite
    // self-heal, bounding staleness to one pack. A trailing fill would clear it
    // without ever having packed it (final-write-in-window ⇒ stale pose forever).
    const consumedDirty = [];
    let fastCommitted = false;
    try {
      for (let slot = 0; slot < scan; slot++) {
        if ((slot % every) === 0 && slot > 0) yield;
        if (dirty[slot] === 0) continue;
        dirty[slot] = 0;
        consumedDirty.push(slot);
        if (world.alive[slot] !== 1) continue;
        const row = slotRows[slot];
        const entityId = world.entityIds[slot] >>> 0;
        if (row < 0 || row >= fastSnapshot.count
          || fastPrevious.columns.entityId[row] !== entityId) { bail = true; break; }
        rewritePackedRow(fastSnapshot, world, slot, row, entityId);
      }
      if (!bail) {
        const postDiagnostics = typeof world.getDiagnostics === 'function'
          ? world.getDiagnostics() : null;
        if (postDiagnostics
          && (postDiagnostics.allocations | 0) === allocationsAtMint
          && (postDiagnostics.retirements | 0) === retirementsAtMint) {
          fence.commit();
          fence.notePackMembership(postDiagnostics);
          fastCommitted = true;
          return fastSnapshot.count;
        }
      }
    } finally {
      // ANY non-commit exit — bail, counters mismatch, throw, or a superseding
      // .return() — discards the consumed marks' rewrites, so restore their
      // bits (W144-BG-1: the finally is what covers fault/abandon paths the
      // old commit-gated fill never needed). Write through `world.packDirty`,
      // not the captured `dirty` alias: a mid-park capacity grow reallocates
      // the mask and growTyped copies the post-consume zeros, so a restore
      // into the old array would be a dead write (W144-BG-1b). The classic
      // walk reads packDirty===0 as "copy last committed row" and would
      // otherwise ship the stale row.
      if (!fastCommitted) {
        for (const slot of consumedDirty) world.packDirty[slot] = 1;
      }
    }
    // beginFrame re-clears the index, refills slotRows, and every live
    // row re-packs — byte-identical to the atomic output, just paced.
  }
  const snapshot = fence.beginPack(Math.max(1, active), simTime, poseEpoch, slotCap);
  // Same rule as the fast pack: copy base is the TRUE newest commit, never the
  // playout-delayed presented bracket.
  const previous = typeof fence.newestSnapshot === 'function'
    ? (fence.newestSnapshot() || (typeof fence.latestSnapshot === 'function'
      ? fence.latestSnapshot() : null))
    : (typeof fence.latestSnapshot === 'function' ? fence.latestSnapshot() : null);
  const previousIndex = previous && previous.poseEpoch === poseEpoch
    ? (previous.indexByEntityId || null) : null;
  let packed = 0;
  // Identity coverage of the sweeps: a mid-park allocation swap-moved into
  // the frozen prefix escapes the minted list, and only this set can prove the
  // row was actually packed (positions lie once swap-remove runs mid-park). The
  // key is slot+generation, not slot alone — a retire+realloc mid-park reuses
  // the slot number for a new entity, and that row must still pack.
  const packedSlotGens = new Map();
  const packRow = (slot) => {
    if (world.alive[slot] !== 1) return;
    const slotIdentity = world.slotGenerations
      ? world.slotGenerations[slot] >>> 0
      : world.entityIds[slot] >>> 0;
    if (packedSlotGens.get(slot) === slotIdentity) return;
    const entityId = world.entityIds[slot] >>> 0;
    if (previousIndex && world.packDirty && world.packDirty[slot] === 0) {
      const previousRow = previousIndex.get(entityId);
      const previousGenerations = previous.columns && previous.columns.generation;
      if (previousRow !== undefined && previousRow >= 0
          && (!previousGenerations || !world.slotGenerations
            || previousGenerations[previousRow] === (world.slotGenerations[slot] >>> 0))) {
        snapshot.slotRows[slot] = snapshot.copyRow(previous, previousRow);
        world.packDirty[slot] = 0;
        packedSlotGens.set(slot, slotIdentity);
        packed++;
        return;
      }
    }
    let qy;
    let qw;
    if (world.yawSin && world.yawCos) {
      qy = world.yawSin[slot];
      qw = world.yawCos[slot];
    } else {
      const rot = world.rot ? Number(world.rot[slot]) || 0 : 0;
      const half = rot * 0.5;
      qy = Math.sin(half);
      qw = Math.cos(half);
    }
    const packedIndex = snapshot.write(
      entityId,
      world.typeCodes ? world.typeCodes[slot] : 0,
      world.x[slot],
      world.y[slot],
      world.z[slot],
      0, qy, 0, qw,
      1, 1, 1,
      world.flags[slot] >>> 0,
    );
    if (typeof snapshot.setLean === 'function') {
      snapshot.setLean(
        packedIndex,
        world.bank ? Number(world.bank[slot]) || 0 : 0,
        world.pitch ? Number(world.pitch[slot]) || 0 : 0,
      );
    }
    if (typeof snapshot.setGeneration === 'function') {
      snapshot.setGeneration(
        packedIndex,
        world.slotGenerations ? world.slotGenerations[slot] : 0,
      );
    }
    snapshot.slotRows[slot] = packedIndex;
    if (world.packDirty) world.packDirty[slot] = 0;
    packedSlotGens.set(slot, slotIdentity);
    packed++;
  };
  // Freeze the slot list at mint: activeSlots is live while this pack parks —
  // a retireSlot swap-moves an unvisited tail row into the visited prefix, and
  // the row is then absent from the committed snapshot entirely (a 1+ frame
  // pop-out). Frozen slots are packed by identity, not position.
  const mintedSlots = active > 0 ? world.activeSlots.slice(0, active) : [];
  for (let index = 0; index < mintedSlots.length; index++) {
    if ((index % every) === 0 && index > 0) yield;
    packRow(mintedSlots[index]);
  }
  // Rows allocated or retired while the pack was parked escape any positional
  // bound: appends land past the frozen mint slice, and a retire swap-moves a
  // live row into territory already swept (while the rescanned stale tail can
  // carry a duplicate that a later alloc then clobbers). Membership, not
  // position, is exact — the live id→slot index is position-free, and Map
  // iteration visits mid-walk inserts while skipping deleted keys, so a churn
  // burst inside one parked pack can neither miss a spawn nor pack a corpse.
  // Only worth paying when the world mutated mid-park: a quiet pack's frozen
  // slice already covered every live row (packRow is a no-op for a retired
  // row, and dedupes anything the minted sweep already packed).
  const postDiagnostics = typeof world.getDiagnostics === 'function'
    ? world.getDiagnostics() : null;
  const worldChurned = postDiagnostics === null
    ? true
    : ((postDiagnostics.allocations | 0) !== allocationsAtMint
      || (postDiagnostics.retirements | 0) !== retirementsAtMint);
  if (worldChurned && typeof world.liveSlotValues === 'function') {
    let scanned = 0;
    for (const slot of world.liveSlotValues()) {
      if ((scanned % every) === 0 && scanned > 0) yield;
      scanned += 1;
      packRow(slot);
    }
  }
  fence.commit();
  fence.notePackMembership(postDiagnostics);
  return packed;
}

export function packEntityIntoSnapshot(snapshot, entity, options = {}) {
  if (!snapshot || !entity || entity.alive === false) return -1;
  const pos = entity.pos || {};
  const flags = options.flags || 0;
  return snapshot.write(
    entity.id >>> 0,
    options.archetype || 0,
    Number(pos.x) || 0,
    Number(pos.y) || 0,
    Number(pos.z) || 0,
    0, 0, 0, 1,
    1, 1, 1,
    flags >>> 0,
  );
}
