// Law/heat telegraph presentation (WF-12 / GDX-A25, scan-suspicion side).
//
// Pure stamp controller: accepts authoritative bus facts, never writes sim state, never invents
// heat/law values. Consumers (live path: src/render/vfx.js) apply the stamp to the shared
// EVENT_LIGHT_POOL — no new pool. Reduced-motion uses static intensity steps; reduced-flash never
// requests a full-screen flash (peak scale only).

import { THRESHOLD as WANTED_THRESHOLD } from '../systems/heat.js';

export const LAW_HEAT_TELEGRAPH_SCHEMA = 'spaceface.lawHeatTelegraph.v1';

/** Sustained event-light keys. Share the global EVENT_LIGHT_POOL_SIZE=6 budget. */
export const LAW_HEAT_LIGHT_KEY = Object.freeze({
  SCAN_SWEEP: 'law-scan-sweep',
  SUSPICION: 'law-suspicion',
});

/**
 * Admission priorities (0..1). Below the player plume sustained key (0.72) so hero thrust keeps
 * its slot; WANTED flip is high because it is a discrete landed status change.
 */
export const LAW_HEAT_ADMISSION = Object.freeze({
  SCAN_SWEEP: 0.56,
  SUSPICION: 0.44,
  WANTED_FLIP: 0.9,
});

/** Presentation lifetime of the scan-sweep accent after an authoritative scan event. */
export const LAW_HEAT_SCAN_SWEEP_LIFE_S = 1.15;

/** Bounded lifetime of the WANTED flip one-shot (presentation decay, not sim state). */
export const LAW_HEAT_WANTED_FLIP_LIFE_S = 0.55;

/** Worst-case slots this telegraph family may hold in the shared event-light pool. */
export const LAW_HEAT_WORST_CASE_LIGHT_SLOTS = 3; // scan sustained + suspicion sustained + wanted transient

export const LAW_HEAT_COLORS = Object.freeze({
  scanSweep: '#70e4ff',
  suspicion: '#ffb35c',
  wantedFlip: '#ff5c5c',
});

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

/** 0..1 approach toward WANTED. 1 means at/above threshold. Never invents heat. */
export function suspicionFromHeat(value, threshold = WANTED_THRESHOLD) {
  const heat = finite(value, 0);
  const gate = Number.isFinite(threshold) && threshold > 0 ? threshold : WANTED_THRESHOLD;
  if (heat <= 0) return 0;
  if (heat >= gate) return 1;
  return clamp01(heat / gate);
}

/**
 * Resolve a scan-sweep pose from an authoritative patrol/customs scan payload.
 * Returns null when the payload does not name a real scan of a hull.
 */
export function resolveScanSweepStamp(payload = {}, nowS = 0) {
  if (!payload || typeof payload !== 'object') return null;
  // Explicit cancel/end.
  if (payload.active === false || payload.scanStarted === false) return null;
  const targetId = payload.targetId != null
    ? payload.targetId
    : (payload.scannedId != null ? payload.scannedId : null);
  const patrolId = payload.patrolId != null ? payload.patrolId : null;
  const pos = payload.pos && Number.isFinite(payload.pos.x) && Number.isFinite(payload.pos.z)
    ? { x: payload.pos.x, z: payload.pos.z }
    : null;
  // A scan event without a target or position is still a fact, but presentation cannot place it.
  // Caller may attach pos from the live entity before accept.
  if (targetId == null && !pos) return null;
  return {
    kind: 'scan_sweep',
    active: true,
    targetId,
    patrolId,
    hasContraband: !!payload.hasContraband,
    x: pos ? pos.x : 0,
    z: pos ? pos.z : 0,
    hasPos: !!pos,
    age: 0,
    life: LAW_HEAT_SCAN_SWEEP_LIFE_S,
    startedAt: finite(nowS, 0),
  };
}

/**
 * Resolve suspicion + WANTED-flip stamps from an authoritative heat:changed payload.
 * GDX-A25: only the emitted value/previousValue drive intensity and the flip edge.
 */
export function resolveHeatTelegraphStamps(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return { suspicion: null, wantedFlip: null };
  }
  const value = finite(payload.value, 0);
  const previousValue = payload.previousValue != null
    ? finite(payload.previousValue, value)
    : value;
  const threshold = Number.isFinite(payload.threshold) ? payload.threshold : WANTED_THRESHOLD;
  const wanted = payload.wanted != null ? !!payload.wanted : value >= threshold;
  const wasWanted = previousValue >= threshold;
  const wantedCrossed = payload.wantedCrossed != null
    ? !!payload.wantedCrossed
    : wanted !== wasWanted;
  const suspicionValue = payload.suspicion != null
    ? clamp01(finite(payload.suspicion, 0))
    : suspicionFromHeat(value, threshold);

  // Below WANTED: persistent low cue. At/above WANTED the status is the flip, not a second hum.
  const suspicion = (!wanted && suspicionValue > 0)
    ? {
      kind: 'suspicion',
      active: true,
      intensity: suspicionValue,
      heat: value,
      threshold,
    }
    : (suspicionValue <= 0 || wanted
      ? { kind: 'suspicion', active: false, intensity: 0, heat: value, threshold }
      : null);

  const wantedFlip = (wantedCrossed && wanted)
    ? {
      kind: 'wanted_flip',
      active: true,
      age: 0,
      life: LAW_HEAT_WANTED_FLIP_LIFE_S,
      heat: value,
      reason: payload.reason || null,
    }
    : (wantedCrossed && !wanted
      ? { kind: 'wanted_flip', active: false, age: 0, life: 0, heat: value, reason: payload.reason || null }
      : null);

  return { suspicion, wantedFlip };
}

/** Intensity for a live sweep. Reduced-motion: 3 static steps. Full: smooth half-sine pass. */
export function scanSweepIntensity(age, life, reducedMotion) {
  const a = Math.max(0, finite(age, 0));
  const l = Math.max(1e-3, finite(life, LAW_HEAT_SCAN_SWEEP_LIFE_S));
  const t = clamp01(a / l);
  if (reducedMotion) {
    if (t < 0.34) return 0.35;
    if (t < 0.67) return 0.7;
    return 0.45;
  }
  // Single directional pass: rises, peaks mid-sweep, settles — no strobe.
  return Math.sin(t * Math.PI) * 0.85 + 0.1;
}

/** Angular offset (radians) of the sweep lamp around the scanned hull. */
export function scanSweepAngle(age, life, reducedMotion) {
  const a = Math.max(0, finite(age, 0));
  const l = Math.max(1e-3, finite(life, LAW_HEAT_SCAN_SWEEP_LIFE_S));
  const t = clamp01(a / l);
  if (reducedMotion) {
    if (t < 0.34) return -0.9;
    if (t < 0.67) return 0;
    return 0.9;
  }
  return -Math.PI * 0.55 + t * Math.PI * 1.1;
}

/** Suspicion intensity steps under reduced-motion; continuous under full. */
export function suspicionDisplayIntensity(raw, reducedMotion) {
  const v = clamp01(finite(raw, 0));
  if (!reducedMotion) return 0.12 + v * 0.48;
  if (v <= 0) return 0;
  if (v < 0.34) return 0.18;
  if (v < 0.67) return 0.32;
  return 0.48;
}

/**
 * Fixed-capacity presentation controller. Holds stamp truth only; the live VFX layer owns lights.
 *
 * Pool occupancy (worst case, this family alone):
 *   1 sustained scan-sweep + 1 sustained suspicion + 1 transient WANTED flip = 3 of 6.
 */
export function createLawHeatTelegraphController() {
  const stamp = {
    scanSweep: null,
    suspicion: null,
    wantedFlip: null,
  };
  let scanStarts = 0;
  let suspicionUpdates = 0;
  let wantedFlips = 0;
  let lastWantedFlipAt = null;
  /** Monotonic id for each new WANTED-flip stamp so the light layer pulses exactly once. */
  let wantedFlipSerial = 0;
  let pendingWantedPulseSerial = 0;

  const controller = {
    acceptScan(payload, nowS = 0) {
      const next = resolveScanSweepStamp(payload, nowS);
      if (!next) {
        // Explicit end/cancel clears the sweep stamp.
        if (payload && (payload.active === false || payload.scanStarted === false)) {
          stamp.scanSweep = null;
        }
        return false;
      }
      stamp.scanSweep = next;
      scanStarts += 1;
      return true;
    },

    acceptHeat(payload) {
      const { suspicion, wantedFlip } = resolveHeatTelegraphStamps(payload);
      let flipStarted = false;
      if (suspicion) {
        stamp.suspicion = suspicion.active ? suspicion : null;
        suspicionUpdates += 1;
      }
      if (wantedFlip) {
        if (wantedFlip.active) {
          stamp.wantedFlip = wantedFlip;
          wantedFlips += 1;
          wantedFlipSerial += 1;
          pendingWantedPulseSerial = wantedFlipSerial;
          flipStarted = true;
          lastWantedFlipAt = finite(payload && payload.value, 0);
        } else {
          stamp.wantedFlip = null;
          pendingWantedPulseSerial = 0;
        }
      }
      return {
        suspicionActive: !!(stamp.suspicion && stamp.suspicion.active),
        wantedFlipActive: !!(stamp.wantedFlip && stamp.wantedFlip.active),
        wantedFlipStarted: flipStarted,
        wantedFlipSerial,
      };
    },

    /** Consume the one-shot WANTED pulse token. Returns serial if a pulse is pending, else 0. */
    consumeWantedPulse() {
      const serial = pendingWantedPulseSerial;
      pendingWantedPulseSerial = 0;
      return serial;
    },

    /**
     * Advance presentation clocks. `heatValue` is optional authoritative state re-read so
     * suspicion intensity tracks heat between throttled heat:changed emits without inventing.
     */
    update(dt, opts = {}) {
      const step = Math.max(0, finite(dt, 0));
      const reducedMotion = opts.reducedMotion === true;
      const heatValue = opts.heatValue;
      let live = 0;

      if (stamp.scanSweep && stamp.scanSweep.active) {
        stamp.scanSweep.age = (stamp.scanSweep.age || 0) + step;
        if (stamp.scanSweep.age >= stamp.scanSweep.life) {
          stamp.scanSweep = null;
        } else {
          live += 1;
        }
      }

      if (stamp.suspicion && stamp.suspicion.active) {
        if (heatValue != null && Number.isFinite(heatValue)) {
          const threshold = stamp.suspicion.threshold || WANTED_THRESHOLD;
          const next = suspicionFromHeat(heatValue, threshold);
          if (next <= 0 || heatValue >= threshold) {
            stamp.suspicion = null;
          } else {
            stamp.suspicion.intensity = next;
            stamp.suspicion.heat = heatValue;
            live += 1;
          }
        } else {
          live += 1;
        }
      }

      if (stamp.wantedFlip && stamp.wantedFlip.active) {
        stamp.wantedFlip.age = (stamp.wantedFlip.age || 0) + step;
        if (stamp.wantedFlip.age >= stamp.wantedFlip.life) {
          stamp.wantedFlip = null;
        } else {
          live += 1;
        }
      }

      // reducedMotion is recorded on the inspect surface for consumers that step intensities.
      stamp._reducedMotion = reducedMotion;
      return live;
    },

    /** Read-only stamp snapshot for tests / inspect. */
    stamp() {
      return {
        scanSweep: stamp.scanSweep ? { ...stamp.scanSweep } : null,
        suspicion: stamp.suspicion ? { ...stamp.suspicion } : null,
        wantedFlip: stamp.wantedFlip ? { ...stamp.wantedFlip } : null,
      };
    },

    inspect() {
      const s = controller.stamp();
      const active = (s.scanSweep ? 1 : 0) + (s.suspicion ? 1 : 0) + (s.wantedFlip ? 1 : 0);
      return {
        schema: LAW_HEAT_TELEGRAPH_SCHEMA,
        active,
        scanStarts,
        suspicionUpdates,
        wantedFlips,
        lastWantedFlipAt,
        worstCaseLightSlots: LAW_HEAT_WORST_CASE_LIGHT_SLOTS,
        scanSweep: s.scanSweep
          ? {
            active: true,
            targetId: s.scanSweep.targetId,
            patrolId: s.scanSweep.patrolId,
            age: s.scanSweep.age,
            life: s.scanSweep.life,
            hasContraband: s.scanSweep.hasContraband,
          }
          : null,
        suspicion: s.suspicion
          ? {
            active: true,
            intensity: s.suspicion.intensity,
            heat: s.suspicion.heat,
          }
          : null,
        wantedFlip: s.wantedFlip
          ? {
            active: true,
            age: s.wantedFlip.age,
            life: s.wantedFlip.life,
            heat: s.wantedFlip.heat,
            reason: s.wantedFlip.reason,
          }
          : null,
      };
    },

    clear() {
      stamp.scanSweep = null;
      stamp.suspicion = null;
      stamp.wantedFlip = null;
    },
  };

  return controller;
}

export default createLawHeatTelegraphController;
