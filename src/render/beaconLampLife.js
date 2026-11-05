// Beacon lamp life (inf-beacon-lamp).
//
// World beacons are a real sim family — a claim beacon is a 250-credit deployable that holds a
// safe zone on a 45 s lease, lures hostile ships, and fights over its spot — and they carry
// authored motion life (mooring sway, claim lean, warn sway). What they never had is a light
// read: `strobeHz: 0` in the motion table, and no lamp anywhere, so the buoy a player paid for
// read as a dark stick. Far-plane traffic already answers like traffic (double-flash strobes);
// the buoy at arm's length says nothing at all.
//
// Decision layer (pure, headless-testable):
//   resolveBeaconLampPlan — one beacon's lamp plan: a running light for permanent buoys, a
//     working blink for a claim beacon holding its zone, and a fast anti-collision double-flash
//     once its lease is nearly up. Reduced motion slows every blink; it never silences one.
//
// Presentation: one small additive light body (a squashed octahedron — an authored 3D bead, not
// a camera-facing card) riding each tracked buoy's root. Slots are bounded, created once per
// beacon, re-parented if the view root is re-grafted, and released with the buoy. No THREE
// lights are toggled and no materials are created per frame.

import * as THREE from 'three';

// The warn window: expireAt inside this reads as "lease nearly up" — the same boundary the
// mooring sway uses for its harder, faster warn rock.
export const BEACON_LAMP_WARN_S = 8;

// Working blink: a claim beacon says "holding" with a slow confident pulse. The lamp never
// goes fully dark (the far-strobe floor law): a dark beacon reads as a dead one.
export const BEACON_WORKING_PERIOD_S = 2.4;
export const BEACON_WORKING_FLOOR = 0.16;

// Warn: the anti-collision double-flash — two short flashes per period, not a metronome.
export const BEACON_WARN_PERIOD_S = 0.9;
const WARN_PULSES = [[0.04, 0.16], [0.36, 0.48]];

// Running light: permanent buoys breathe slow and shallow, always lit.
export const BEACON_RUNNING_PERIOD_S = 4.8;
export const BEACON_RUNNING_FLOOR = 0.42;

// Reduced motion stretches every period; a dark lamp is a dead lamp, never an accessibility win.
export const BEACON_REDUCED_PERIOD_MUL = 3;

// Colors: a permanent buoy runs a cool nav light; a working claim beacon wears claim green;
// the warn window goes amber-red. Linear-ish sRGB hexes, read by MeshBasicMaterial directly.
export const BEACON_LAMP_COLORS = Object.freeze({
  running: 0x9adfff,
  working: 0x66ffc8,
  warn: 0xff8a4a,
});

// Bounded slots: claim beacons cap at 2 active by design; scenery buoys in one sector are few.
export const BEACON_LAMP_CAP = 12;

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Deterministic per-entity phase in [0,1): the same low-discrepancy hash habit the motion tracker uses. */
export function beaconLampPhase(entityId) {
  let hash = 2166136261;
  const text = String(entityId);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) / 4294967296 + 0.38196601125) % 1;
}

/** Brightness envelope of one pulse window pair (u01 in [0,1)), deterministic. */
function pulseEnvelope(u01, pulses) {
  let peak = 0;
  for (let p = 0; p < pulses.length; p++) {
    const a0 = pulses[p][0];
    const a1 = pulses[p][1];
    if (u01 >= a0 && u01 <= a1) {
      const t = (u01 - a0) / (a1 - a0);
      peak = Math.max(peak, Math.sin(t * Math.PI));
    }
  }
  return peak;
}

/**
 * One beacon's lamp plan. Fields (all written on reuse):
 *   live     false when this entity is not a lamp-bearing beacon (caller releases the slot)
 *   mode     'running' | 'working' | 'warn'
 *   glow01   lamp brightness this instant, 0..1, never 0 for a live beacon
 *   colorHex the lamp color for the current mode
 *
 * Deterministic off (entity id, state.simTime) — no RNG, no wall time.
 */
export function resolveBeaconLampPlan(entity, now, reduced = false, out = {}) {
  out.live = false;
  out.mode = 'running';
  out.glow01 = 0;
  out.colorHex = BEACON_LAMP_COLORS.running;
  if (!entity || entity.type !== 'beacon' || entity.alive === false || !entity.pos
    || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return out;
  const t = finite(now);
  const phase = beaconLampPhase(entity.id);
  const mul = reduced ? BEACON_REDUCED_PERIOD_MUL : 1;
  const data = entity.data || {};
  const expireAt = Number(data.expireAt);
  const claim = data.storyPropKind === 'claim_beacon';
  out.live = true;
  if (claim && Number.isFinite(expireAt) && expireAt - t < BEACON_LAMP_WARN_S) {
    // Lease nearly up: the anti-collision double-flash, slowed not silenced under reduced motion.
    const period = BEACON_WARN_PERIOD_S * mul;
    const u01 = ((t / period + phase) % 1 + 1) % 1;
    out.mode = 'warn';
    out.colorHex = BEACON_LAMP_COLORS.warn;
    out.glow01 = Math.max(BEACON_WORKING_FLOOR, pulseEnvelope(u01, WARN_PULSES));
    return out;
  }
  if (claim) {
    // Working claim beacon: a slow confident pulse with a lit floor.
    const period = BEACON_WORKING_PERIOD_S * mul;
    const c = (((t / period + phase) % 1) + 1) % 1;
    out.mode = 'working';
    out.colorHex = BEACON_LAMP_COLORS.working;
    out.glow01 = BEACON_WORKING_FLOOR + (1 - BEACON_WORKING_FLOOR)
      * Math.max(0, Math.sin(c * Math.PI * 2)) * Math.max(0, Math.sin(c * Math.PI * 2));
    return out;
  }
  // Permanent buoy: a running light that breathes slow and shallow, always lit.
  const period = BEACON_RUNNING_PERIOD_S * mul;
  const c = (((t / period + phase) % 1) + 1) % 1;
  out.mode = 'running';
  out.colorHex = BEACON_LAMP_COLORS.running;
  out.glow01 = BEACON_RUNNING_FLOOR + (1 - BEACON_RUNNING_FLOOR)
    * (0.5 + 0.5 * Math.sin(c * Math.PI * 2));
  return out;
}

/** Bead world height above the play plane: on the mast, above the buoy's own body. */
export function beaconLampHeight(entity) {
  return Math.max(2, finite(entity && entity.radius, 5)) * 1.15;
}

/** Bead world size: a few pixels at the chase camera, scaled by brightness at draw time. */
export function beaconLampSize(entity) {
  return Math.max(0.5, finite(entity && entity.radius, 5) * 0.22);
}

/** Is this entity a beacon the lamp layer should track? Caller scans with this predicate. */
export function isLampBeacon(entity) {
  return !!(entity && entity.type === 'beacon' && entity.alive !== false && entity.id != null && entity.pos);
}

export class BeaconLampLayer {
  constructor() {
    this.slots = new Map();
    // One shared geometry for every bead: the light body, not a per-beacon cost.
    this.geometry = new THREE.OctahedronGeometry(1, 0);
    this.geometry.scale(1, 1.4, 1);
    this._color = new THREE.Color();
    this._lastColor = new WeakMap();
  }

  /**
   * One bounded pass over the scanned beacon entities. `scan` yields beacon entities
   * (radarContacts/entityList — the caller keeps the isLampBeacon predicate).
   * `now` is the presented sim time.
   */
  update(scan, now, reduced = false) {
    const epoch = (this.epoch = (this.epoch || 0) + 1);
    let admitted = 0;
    for (const entity of scan) {
      if (admitted >= BEACON_LAMP_CAP) break;
      if (!isLampBeacon(entity)) continue;
      admitted++;
      const plan = resolveBeaconLampPlan(entity, now, reduced, this._plan || (this._plan = {}));
      if (!plan.live) continue;
      let slot = this.slots.get(entity.id);
      const root = entity.view && entity.view.root;
      if (!root || typeof root.add !== 'function') continue;
      if (!slot) {
        const material = new THREE.MeshBasicMaterial({
          transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
        });
        const bead = new THREE.Mesh(this.geometry, material);
        bead.name = `sf-beacon-lamp-${entity.id}`;
        bead.renderOrder = 6;
        bead.position.y = beaconLampHeight(entity);
        bead.scale.setScalar(0.001);
        root.add(bead);
        slot = { entityId: entity.id, root, bead, material };
        this.slots.set(entity.id, slot);
      } else if (slot.root !== root) {
        // Authored views can re-graft under a retained root; keep the bead on the live root.
        // Object3D.remove tolerates an absent child, so the stale root lets go unconditionally.
        slot.root.remove(slot.bead);
        slot.root = root;
        root.add(slot.bead);
      }
      slot.seen = epoch;
      slot.material.color.setHex(plan.colorHex);
      slot.material.opacity = clamp01(plan.glow01) * 0.95;
      const size = beaconLampSize(entity) * (0.55 + 0.45 * clamp01(plan.glow01));
      slot.bead.scale.setScalar(Math.max(0.001, size));
    }
    for (const [id, slot] of this.slots) {
      if (slot.seen === epoch) continue;
      slot.root.remove(slot.bead);
      slot.material.dispose();
      this.slots.delete(id);
    }
    return admitted;
  }

  clear() {
    for (const slot of this.slots.values()) {
      slot.root.remove(slot.bead);
      slot.material.dispose();
    }
    this.slots.clear();
  }

  dispose() {
    this.clear();
    this.geometry.dispose();
  }
}
