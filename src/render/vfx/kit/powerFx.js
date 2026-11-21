// PowerFx — the five powers drawn with the VFX kit (SparkField particles, ShockShell fronts and
// boundary lines, HeroLight flashes from the shared event-light pool, the existing distortion
// target). It listens to the same bus receipts the simulation already publishes and reads
// `state.fields.active` / entities; it never writes simulation state and never uses sim RNG.
//
// Each power is a SHOT: what the player sees at 0 ms, 80 ms, 250 ms, 1 s, what light lands, and
// what matter moves, chosen so the effect itself teaches what the power does.
//
// Per-frame budget (enforced here): <= SPARK_BUDGET_PER_CAST particles per cast, <= 1 HeroLight
// per cast, <= 1 distortion lens per cast; two draws total for the whole kit.
import * as THREE from 'three';
import { SparkField, sparkSpec, SPARK_SHAPE, SPARK_ADD, SPARK_MATTER } from './sparkField.js';
import { ShockShell, shellSpec, SHELL_MODE } from './shockShell.js';
import { enemyJobFor } from '../../../data/enemyJobs.js';

// Tell colours: the job palette (minimap CONTACT_JOB_PALETTE), lifted to HDR.
const TELL_COLORS = Object.freeze({
  burst: [3.2, 1.6, 0.45], reach: [2.4, 0.9, 3.2], seize: [3.2, 2.8, 0.8], deny: [1.4, 1.3, 3.2],
  rush: [3.0, 0.8, 0.6], wall: [3.0, 2.1, 1.9], skirmish: [3.0, 1.1, 2.0], source: [3.0, 0.5, 1.2], default: [3.0, 0.9, 0.6],
});

const TAU = Math.PI * 2;
const PLOW_KEYS = Object.freeze(['plow:a', 'plow:b', 'plow:c']);
// Pilot tree branch tints (progression lead).
const BRANCH_HEX = Object.freeze({ gunner: 0xf2b950, bruiser: 0xff6f4a, rigger: 0x4fd3e8, conjurer: 0xb68cff, juggernaut: 0x86d96f, ghost: 0x9fb6dc, trader: 0xe7c873, prospector: 0xdba466, builder: 0x8fc7a8 });
// Arena machinery registers its fields with `planted: true`; a power's deploy receipt does not.
// Reach cards (Wide Bore) grow a power well past any fixed size, so size never decides this.
export const POWER_FIELD_MAX_RADIUS = 220; // legacy export: the boundary-line weight for unknown fields
export const SPARK_BUDGET_PER_CAST = 420;

// Shove's front: duration and ease (must match the shell's EXPAND curve, 1-(1-t)^2.6).
export const SHOVE_FRONT_S = 0.34;
const SHOVE_EASE = 2.6;
/** Seconds after the cast at which the Shove front reaches distance d of a field of radius R. */
export function shoveFrontDelay(d, R) {
  const e = Math.max(0, Math.min(1, d / Math.max(1, R)));
  return SHOVE_FRONT_S * (1 - Math.pow(1 - e, 1 / SHOVE_EASE));
}

// Deterministic cosmetic stream (no Math.random, no sim RNG).
function hashString(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function unit(seed, i) {
  let n = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function reducedFlags(state) {
  const v = state && state.settings && state.settings.video;
  const a = state && state.settings && state.settings.accessibility;
  return {
    motion: !!(v && v.motionReduce) || !!(a && (a.reducedMotion || a.motionReduce)),
    flash: !!(v && v.flashReduce) || !!(a && (a.flashReduce || a.reducedFlash)),
  };
}

const BODY_TYPES = new Set(['ship', 'asteroid', 'debris', 'pickup', 'payload', 'cargo', 'drone', 'wreck', 'mine']);

export class PowerFx {
  /**
   * @param {THREE.Object3D} scene
   * @param {{toLocal:Function, flashLight?:Function, distortion?:Function}} host
   */
  constructor(scene, host = {}) {
    this.scene = scene;
    this.host = host;
    this.sparks = new SparkField(scene);
    this.shells = new ShockShell(scene);
    this.p = sparkSpec();
    this.s = shellSpec();
    this.local = { x: 0, z: 0 };
    this.time = 0;
    this.lastSim = null;
    this.echoes = new Map(); // fieldId -> { x, z, R, next, seed } (local coords)
    this.wells = new Map(); // fieldId -> live Pull state (local coords)
    this.pin = null;
    this.plow = null;
    this.castFields = new Set();
    this.sched = [];        // future distortion lenses (a ripple riding a front)
    this.trails = new Map(); // entity id -> { from, until, r, g, b } launched-body trails
    this.pendingHits = [];
    this.stats = { casts: 0, particles: 0, shells: 0, lights: 0, boundaries: 0 };
    this.reduced = { motion: false, flash: false };
    this._seen = new Set();
  }

  _toLocal(x, z) {
    if (this.host.toLocal) return this.host.toLocal(x, z, this.local);
    this.local.x = x; this.local.z = z; return this.local;
  }

  /**
   * Draw both kit programs once, invisibly, as soon as the fight starts, so the first power cast
   * does not compile two shaders mid-fight (measured: a ~1 s stall on the owner's GPU).
   */
  warm() {
    const t = this.time;
    this._spark(0, -5000, 0, 0, 0, 0, t, 0.3, 0.01, 0.01, 0, 0, 0, 0, 0, 0, 0, 0, SPARK_SHAPE.GLOW, SPARK_ADD);
    this.stats.particles--;
    Object.assign(this.s, { x: 0, y: -5000, z: 0, birth: t, from: 1, to: 1, life: 0.3, halfWidth: 0.01, r: 0, g: 0, b: 0, alpha: 0.0001, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: 0 });
    this.shells.emit(this.s);
  }

  /** Bus receipt: a field was deployed. */
  onFieldDeployed(payload, state) {
    if (!payload || !payload.center) return;
    this.reduced = reducedFlags(state);
    const R = Number(payload.radius) || 0;
    if (payload.planted === true) return;
    if (this.castFields.size > 64) this.castFields.clear();
    if (payload.fieldId != null) this.castFields.add(String(payload.fieldId));
    if (payload.kind === 'repulsor' && R > 0) {
      this.shove(payload.center.x, payload.center.z, R, payload.fieldId, state);
    } else if (payload.kind === 'well' && R > 0) {
      this.pull(payload.center.x, payload.center.z, R, payload.fieldId, state);
    }
  }

  /**
   * SHOVE — a pressure front sweeps out from the hull and slams what it meets.
   *   0 ms   white-hot core flash on the hull, warm HeroLight spike, refraction punch, thin
   *          shell born at the hull.
   *   80 ms  the front is ~60 % out, braking; a cooler second shock trails it; sparks race
   *          ahead of it; deck dust is kicked outward exactly when the front reaches it.
   *   250 ms the front reaches the field's TRUE edge; every body it touched sparks on the side
   *          facing the ship and sheds a puff, at the moment the front arrives there.
   *   1 s    sparks cooled to embers, dust settling; faint echo fronts every 0.7 s while the
   *          sim's repulsor field persists; its true edge stays drawn as a hairline.
   */
  shove(gx, gz, R, fieldId, state) {
    const { x, z } = this._toLocal(gx, gz);
    const cx = x;
    const cz = z;
    const t0 = this.time;
    const seed = hashString(`${fieldId}:${Math.round(t0 * 1000)}`);
    const scale = this.reduced.motion ? 0.5 : 1;
    const p = this.p;
    const s = this.s;
    this.stats.casts++;

    // Core flash: tight and hot, gone in a tenth of a second.
    this._spark(cx, 2, cz, 0, 0, 0, t0, 0.14, 22, 46, 0, 0, 9, 7.5, 5.2, 2.6, 1.2, 0.35, SPARK_SHAPE.GLOW, SPARK_ADD);
    this._spark(cx, 2.2, cz, 0, 0, 0, t0, 0.22, 12, 20, 0, 0, 9.0, 8.5, 7.5, 3.0, 1.6, 0.6, SPARK_SHAPE.GLOW, SPARK_ADD);

    // The wall: a thick, blinding band riding the same curve as the front for its first ~120 ms,
    // then gone (fade exponent 8); a dimmer, wider pressure skirt just behind it.
    Object.assign(s, { x: cx, y: 1.5, z: cz, birth: t0, from: 6, to: R, life: SHOVE_FRONT_S, halfWidth: Math.max(16, R * 0.12), r: 10, g: 8, b: 5.2, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: unit(seed, 4) * TAU, arcSpan: 0, seed: 6 + unit(seed, 5) });
    this.shells.emit(s);
    Object.assign(s, { birth: t0, from: 4, to: R * 0.94, life: SHOVE_FRONT_S + 0.04, halfWidth: Math.max(22, R * 0.18), r: 2.4, g: 1.6, b: 0.8, alpha: 0.8, seed: 3 + unit(seed, 6) });
    this.shells.emit(s);
    // A ripple in the picture riding the front: lenses born along the ring as the front passes.
    if (!this.reduced.motion) {
      for (const frac of [0.25, 0.5, 0.78]) {
        const at = t0 + shoveFrontDelay(R * frac, R);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU + unit(seed, 700 + k) * 0.3;
          this.sched.push({ at, x: cx + Math.cos(a) * R * frac, y: 1, z: cz + Math.sin(a) * R * frac, radius: R * 0.14, strength: 0.9 * (1.1 - frac), life: 0.09 });
        }
      }
    }
    // The front: a hot lip and a cooler trailing shock.
    Object.assign(s, { x: cx, y: 1.4, z: cz, birth: t0, from: 5, to: R, life: SHOVE_FRONT_S + 0.06, halfWidth: Math.max(8, R * 0.06), r: 7, g: 5.2, b: 3.2, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: unit(seed, 1) * TAU, arcSpan: 0, seed: unit(seed, 2) });
    this.shells.emit(s);
    Object.assign(s, { birth: t0 + 0.05, from: 4, to: R * 0.92, life: SHOVE_FRONT_S + 0.14, halfWidth: Math.max(2.4, R * 0.02), r: 1.8, g: 2.1, b: 2.8, alpha: 0.9, seed: unit(seed, 3) });
    this.shells.emit(s);
    this.stats.shells += 2;

    // Sparks that outrun the front and brake to its edge (terminal distance v/k).
    const nSparks = Math.round(56 * scale);
    for (let i = 0; i < nSparks; i++) {
      const a = (i / nSparks) * TAU + (unit(seed, 10 + i) - 0.5) * 0.25;
      const k = 3.4;
      const reach = R * (0.72 + 0.34 * unit(seed, 200 + i));
      const v = k * reach;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const life = 0.42 + 0.3 * unit(seed, 400 + i);
      this._spark(cx + ca * 7, 1.6, cz + sa * 7, ca * v, 0, sa * v, t0, life, 2.4, 0.8, k, 0.05,
        6.5, 5.2, 3.6, 2.4, 0.75, 0.16, SPARK_SHAPE.STREAK, SPARK_ADD);
    }

    // Deck dust kicked outward the instant the front passes it (born in the future).
    const nDust = Math.round(150 * scale);
    for (let i = 0; i < nDust; i++) {
      const a = unit(seed, 600 + i) * TAU;
      const rho = 12 + (R * 0.95 - 12) * Math.sqrt(unit(seed, 800 + i));
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Dragged along the floor at close to the front's own speed there, then braking.
      const v = 120 + 260 * unit(seed, 1000 + i) * (1 - rho / R * 0.6);
      const birth = t0 + shoveFrontDelay(rho, R);
      const ember = i % 4 === 0;
      if (ember) {
        this._spark(cx + ca * rho, 1.2, cz + sa * rho, ca * v, 0, sa * v, birth, 0.55 + 0.4 * unit(seed, 1200 + i),
          1.6, 0.6, 2.6, 0.03, 3.4, 2.1, 0.9, 0.9, 0.3, 0.08, SPARK_SHAPE.STREAK, SPARK_ADD);
      } else {
        const g = 0.42 + 0.18 * unit(seed, 1400 + i);
        this._spark(cx + ca * rho, 1.0, cz + sa * rho, ca * v * 0.8, 0, sa * v * 0.8, birth, 0.8 + 0.5 * unit(seed, 1600 + i),
          2.2 + 1.6 * unit(seed, 1800 + i), 3.4, 2.4, 0.012, g * 1.1, g, g * 0.9, g * 0.75, g * 0.7, g * 0.65, SPARK_SHAPE.GRAIN, SPARK_MATTER * 0.85);
      }
    }

    // Bodies the front meets: a contact burst on the side facing the ship, timed to the front.
    this._bodyHits(state, gx, gz, cx, cz, R, t0, seed, scale);

    // Light that lands on the hull, deck and nearby rocks; one spike, fast decay.
    if (this.host.flashLight && this.host.flashLight({ x: gx, z: gz }, '#ffd2a0', 11, 6.0, R * 1.35, 0.93)) this.stats.lights++;
    // Refraction punch at the hull.
    if (this.host.distortion && !this.reduced.motion) this.host.distortion({ x: cx, y: 1, z: cz, radius: R * 0.42, strength: 0.9, life: 0.2 });

    if (fieldId != null) this.echoes.set(String(fieldId), { x: cx, z: cz, R, next: t0 + 0.75, seed, n: 0, born: t0, alive: false });
  }

  /**
   * PULL — space drains toward a point; everything near it falls in along visible lines.
   *   0 ms   a violet-white pinpoint core pops at the aim point; a violet HeroLight lands on the
   *          deck and nearby hulls; a bright ring snaps in at the TRUE reach and starts to fall
   *          inward; a refraction pinch at the core.
   *   80 ms  the first ring is falling (ease-in: it accelerates like something dropped); motes
   *          spawned on the rim spiral inward as stretched streaks, faster as they get closer.
   *   250 ms continuous inflow; every body inside streams short streaks toward the core.
   *   1 s    a new ring falls every 0.33 s; the core flickers hot; the edge stays a hairline.
   *   end    an implosion flash at the core and a small outward kick as the space lets go.
   */
  pull(gx, gz, R, fieldId, state) {
    const { x, z } = this._toLocal(gx, gz);
    const t0 = this.time;
    const seed = hashString(String(fieldId) + ':' + Math.round(t0 * 1000));
    this.stats.casts++;
    this._spark(x, 2.2, z, 0, 0, 0, t0, 0.2, 26, 10, 0, 0, 6.5, 5.5, 9.5, 2.5, 1.6, 5.0, SPARK_SHAPE.GLOW, SPARK_ADD);
    this._spark(x, 2.4, z, 0, 0, 0, t0, 0.32, 9, 6, 0, 0, 9, 9, 11, 4, 3.5, 7, SPARK_SHAPE.GLOW, SPARK_ADD);
    Object.assign(this.s, { x, y: 1.4, z, birth: t0, from: R, to: 6, life: 0.62, halfWidth: Math.max(4, R * 0.03), r: 2.4, g: 2.0, b: 4.8, alpha: 1, mode: SHELL_MODE.CONTRACT, arcStart: unit(seed, 1) * TAU, arcSpan: 0, seed: unit(seed, 2) });
    this.shells.emit(this.s);
    this.stats.shells++;
    // Two thinner rings chase the first inward, so the edge has depth.
    for (let k = 1; k <= 2; k++) {
      Object.assign(this.s, { x, y: 1.35, z, birth: t0 + 0.1 * k, from: R * (1 - 0.06 * k), to: 6, life: 0.62, halfWidth: Math.max(2, R * 0.012), r: 1.6, g: 1.4, b: 3.4, alpha: 0.85 - 0.2 * k, mode: SHELL_MODE.CONTRACT, arcStart: unit(seed, 10 + k) * TAU, arcSpan: 0, seed: unit(seed, 20 + k) });
      this.shells.emit(this.s);
    }
    this._pullMotes(x, z, R, seed, 0, this.reduced.motion ? 40 : 110, t0);
    if (this.host.flashLight && this.host.flashLight({ x: gx, z: gz }, '#b9a2ff', 9, 4.5, R * 1.2, 0.9)) this.stats.lights++;
    if (this.host.distortion && !this.reduced.motion) this.host.distortion({ x, y: 1, z, radius: R * 0.3, strength: 1.0, life: 0.3 });
    if (fieldId != null) this.wells.set(String(fieldId), { x, z, R, seed, n: 0, nextRing: t0 + 0.33, nextCore: t0 + 0.12, nextBody: t0 + 0.15, born: t0, alive: false });
  }

  _pullMotes(x, z, R, seed, base, n, t0) {
    // Motes start on the rim and fall the whole radius in ~0.9 s (r(t) = R - a t^2 / 2), spiralling.
    const p = this.p;
    for (let i = 0; i < n; i++) {
      const a = unit(seed, base + i) * TAU;
      const rho = R * (0.82 + 0.18 * unit(seed, base + 5000 + i));
      const fallS = 0.75 + 0.35 * unit(seed, base + 9000 + i);
      p.x = x + Math.cos(a) * rho; p.y = 1.3; p.z = z + Math.sin(a) * rho;
      p.vx = 0; p.vy = 0; p.vz = 0; p.birth = t0 + 0.04 * unit(seed, base + 7000 + i); p.life = fallS * 0.97;
      p.size0 = 2.0; p.size1 = 1.2; p.drag = 0; p.stretch = 0.08;
      p.r0 = 0.9; p.g0 = 1.0; p.b0 = 2.4; p.r1 = 4.5; p.g1 = 3.8; p.b1 = 7.5; p.shape = SPARK_SHAPE.STREAK; p.blend = SPARK_ADD;
      p.cx = x; p.cz = z; p.accel = (2 * rho) / (fallS * fallS); p.swirl = 0.9 + 0.5 * unit(seed, base + 8000 + i);
      this.sparks.emit(p);
      this.stats.particles++;
    }
  }

  _sustainWells(state) {
    const list = state && state.fields && state.fields.active;
    const t = this.time;
    for (const w of this.wells.values()) w.alive = false;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (!f || f.kind !== 'well' || !f.center || !(f.radius > 0)) continue;
        const w = this.wells.get(String(f.id));
        if (!w) continue;
        const l = this._toLocal(f.center.x, f.center.z);
        w.x = l.x; w.z = l.z; w.R = f.radius; w.alive = true;
      }
    }
    for (const [id, w] of this.wells) {
      if (!w.alive) {
        if (t - w.born < 0.5) continue;
        // Release: the space lets go with an implosion flash and a small outward kick.
        this._spark(w.x, 2.4, w.z, 0, 0, 0, t, 0.14, 34, 10, 0, 0, 8, 7, 11, 3, 2, 5, SPARK_SHAPE.GLOW, SPARK_ADD);
        Object.assign(this.s, { x: w.x, y: 1.4, z: w.z, birth: t, from: 6, to: Math.min(60, w.R * 0.3), life: 0.3, halfWidth: 2, r: 2, g: 1.8, b: 3.6, alpha: 0.9, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: unit(w.seed, 77) });
        this.shells.emit(this.s);
        this.wells.delete(id);
        continue;
      }
      if (this.reduced.motion) continue;
      if (t >= w.nextRing) {
        w.nextRing = t + 0.33; w.n++;
        Object.assign(this.s, { x: w.x, y: 1.3, z: w.z, birth: t, from: w.R, to: 6, life: 0.6, halfWidth: Math.max(2.6, w.R * 0.018), r: 1.6, g: 1.4, b: 3.4, alpha: 0.75, mode: SHELL_MODE.CONTRACT, arcStart: unit(w.seed, 100 + w.n) * TAU, arcSpan: 0, seed: unit(w.seed, 200 + w.n) });
        this.shells.emit(this.s);
        for (let k = 1; k <= 2; k++) {
          Object.assign(this.s, { x: w.x, y: 1.3, z: w.z, birth: t + 0.09 * k, from: w.R * (1 - 0.05 * k), to: 6, life: 0.6, halfWidth: Math.max(1.4, w.R * 0.009), r: 1.2, g: 1.0, b: 2.6, alpha: 0.55 - 0.15 * k, mode: SHELL_MODE.CONTRACT, arcStart: unit(w.seed, 400 + w.n * 3 + k) * TAU, arcSpan: 0, seed: unit(w.seed, 500 + w.n * 3 + k) });
          this.shells.emit(this.s);
        }
        this._pullMotes(w.x, w.z, w.R, w.seed, 20000 + w.n * 64, 30, t);
      }
      if (t >= w.nextCore) {
        w.nextCore = t + 0.1;
        // A dark core: the throat swallows light around the hot pinpoint, so it reads as a hole.
        this._spark(w.x, 1.9, w.z, 0, 0, 0, t, 0.22, w.R * 0.32, w.R * 0.26, 0, 0, 0, 0, 0, 0, 0, 0, SPARK_SHAPE.GLOW, 0.9);
        this._spark(w.x, 2.2, w.z, 0, 0, 0, t, 0.2, 10 + 4 * unit(w.seed, 300 + w.n), 6, 0, 0, 5, 4.5, 8.5, 2.5, 2, 5, SPARK_SHAPE.GLOW, SPARK_ADD);
      }
      if (t >= w.nextBody) {
        w.nextBody = t + 0.15;
        this._pullBodies(state, w, t);
      }
    }
  }

  _pullBodies(state, w, t) {
    const list = state && state.entityList;
    if (!list) return;
    let n = 0;
    for (let i = 0; i < list.length && n < 12; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || e.id === state.playerId || !BODY_TYPES.has(e.type)) continue;
      const l = this._toLocal(e.pos.x, e.pos.z);
      const lx = l.x;
      const lz = l.z;
      const dx = w.x - lx;
      const dz = w.z - lz;
      const d = Math.hypot(dx, dz);
      if (d > w.R || d < 4) continue;
      n++;
      const ux = dx / d;
      const uz = dz / d;
      const rad = Number.isFinite(e.radius) ? e.radius : 6;
      for (let k = 0; k < 2; k++) {
        const side = (k ? 1 : -1) * rad * 0.6;
        const v = 70 + 40 * k;
        this._spark(lx - uz * side, 1.6, lz + ux * side, ux * v, 0, uz * v, t, 0.24, 1.2, 0.5, 1.5, 0.08,
          1.4, 1.5, 3.2, 3.0, 2.6, 5.0, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
    }
  }

  /**
   * BOMB — a charge you stuck, then a blast that clears the space around it.
   *   0 ms   a one-frame white flash; a room-lighting HeroLight; a refraction punch.
   *   80 ms  a fireball 3-4x the canister (hot additive lobes rolling outward), a thin shock
   *          front racing to the blast edge, sparks and hot chips flung out radially.
   *   250 ms the fire has cooled into rolling soot (alpha matter, darkens what is behind it);
   *          embers drift; chips tumble on.
   *   1 s    the soot thins and drifts on the momentum it was given; last embers wink out.
   */
  bomb(gx, gz, radius, id, opts = null) {
    const { x, z } = this._toLocal(gx, gz);
    const t0 = this.time;
    const seed = hashString('bomb:' + String(id) + ':' + Math.round(t0 * 1000));
    // Kills reuse this grammar at a lighter cost (many die at once in a Swarm wave): half the
    // matter and a smaller fire, so a wipe never spends the fill-rate budget of eight Bombs.
    const kill = !!(opts && opts.cast === false);
    const R = kill ? Math.max(40, Math.min(110, (Number(radius) || 12) * 2.2)) : Math.max(70, Math.min(180, (Number(radius) || 30) * 2.5));
    const scale = (this.reduced.motion ? 0.5 : 1) * (kill ? 0.45 : 1);
    if (!opts || opts.cast !== false) this.stats.casts++;
    // 0-60 ms: a white-hot core that collapses to orange.
    this._spark(x, 3.2, z, 0, 0, 0, t0, 0.1, R * 0.42, R * 0.3, 0, 0, 16, 15, 14, 9, 6, 3, SPARK_SHAPE.GLOW, SPARK_ADD);
    this._spark(x, 2.8, z, 0, 0, 0, t0, 0.28, R * 0.28, R * 0.14, 0, 0, 9, 6, 2.5, 3, 1, 0.2, SPARK_SHAPE.GLOW, SPARK_ADD);
    // Scorch on the deck: a dark mark that lingers for seconds after the smoke has gone.
    if (!opts || opts.cast !== false) this._spark(x, 0.6, z, 0, 0, 0, t0 + 0.05, 4.5, R * 0.55, R * 0.62, 0, 0, 0.02, 0.015, 0.012, 0.0, 0.0, 0.0, SPARK_SHAPE.PUFF, 1.0);
    this._spark(x, 3, z, 0, 0, 0, t0, 0.1, R * 0.35, R * 0.5, 0, 0, 12, 11, 9.5, 6, 4, 2, SPARK_SHAPE.GLOW, SPARK_ADD);
    Object.assign(this.s, { x, y: 1.5, z, birth: t0, from: 6, to: R, life: 0.3, halfWidth: Math.max(3, R * 0.05), r: 3.6, g: 2.6, b: 1.6, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: unit(seed, 1) * TAU, arcSpan: 0, seed: unit(seed, 2) });
    this.shells.emit(this.s);
    this.stats.shells++;
    // Fireball: hot lobes that roll outward and cool fast.
    const nFire = Math.round(16 * scale);
    for (let i = 0; i < nFire; i++) {
      const a = unit(seed, 10 + i) * TAU;
      const v = R * (0.5 + 0.9 * unit(seed, 40 + i));
      const size = R * (0.22 + 0.14 * unit(seed, 70 + i));
      this._spark(x, 2.6, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 0.45 + 0.3 * unit(seed, 100 + i), size, size * 2.4, 3.6, 0,
        11, 7.5, 3.2, 1.0, 0.28, 0.06, SPARK_SHAPE.PUFF, 0.3);
    }
    // Soot: rolls out behind the fire and darkens the scene behind it.
    const nSmoke = Math.round(12 * scale);
    for (let i = 0; i < nSmoke; i++) {
      const a = unit(seed, 200 + i) * TAU;
      const v = R * (0.3 + 0.5 * unit(seed, 230 + i));
      const size = R * (0.2 + 0.12 * unit(seed, 260 + i));
      this._spark(x, 2.2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0 + 0.1, 1.3 + 0.7 * unit(seed, 290 + i), size, size * 2.4, 1.6, 0,
        0.16, 0.13, 0.11, 0.09, 0.085, 0.08, SPARK_SHAPE.PUFF, 0.85);
    }
    // Sparks and hot chips flung radially.
    const nSparks = Math.round(64 * scale);
    for (let i = 0; i < nSparks; i++) {
      const a = unit(seed, 400 + i) * TAU;
      const v = R * (3.0 + 4.0 * unit(seed, 500 + i));
      this._spark(x, 2.4, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 0.35 + 0.45 * unit(seed, 600 + i), 2.2, 0.7, 3.0, 0.04,
        7, 5.5, 3.2, 2.2, 0.6, 0.1, SPARK_SHAPE.STREAK, SPARK_ADD);
    }
    // Hard chunks thrown PAST the shock front (terminal distance v/k > R).
    const nChips = Math.round(20 * scale);
    for (let i = 0; i < nChips; i++) {
      const a = unit(seed, 700 + i) * TAU;
      const v = R * (2.4 + 2.4 * unit(seed, 720 + i));
      this._spark(x, 2.4, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 1.0 + 0.7 * unit(seed, 740 + i), 3.6, 2.8, 1.2, 0.006,
        5, 2.6, 0.9, 0.4, 0.34, 0.3, SPARK_SHAPE.CHIP, 0.6);
    }
    const nEmbers = Math.round(30 * scale);
    for (let i = 0; i < nEmbers; i++) {
      const a = unit(seed, 800 + i) * TAU;
      const v = R * (0.4 + 0.8 * unit(seed, 830 + i));
      this._spark(x, 2.5, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0 + 0.08, 0.9 + 0.8 * unit(seed, 860 + i), 0.9, 0.5, 1.2, 0.01,
        3.5, 1.6, 0.5, 1.2, 0.3, 0.05, SPARK_SHAPE.GRAIN, SPARK_ADD);
    }
    // Causal axes: every body the blast shoved gets a jet of sparks and chips along its own push.
    const shoves = opts && Array.isArray(opts.shoves) ? opts.shoves : null;
    if (shoves) {
      for (let k = 0; k < Math.min(8, shoves.length); k++) {
        const sh = shoves[k];
        const len = Math.hypot(sh && sh.dx, sh && sh.dz);
        if (!(len > 1e-6)) continue;
        const base = Math.atan2(sh.dz / len, sh.dx / len);
        for (let i = 0; i < 9; i++) {
          const a = base + (unit(seed, 900 + k * 16 + i) - 0.5) * 0.4;
          const v = R * (4 + 3 * unit(seed, 1000 + k * 16 + i));
          this._spark(x, 2.4, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 0.3 + 0.25 * unit(seed, 1100 + k * 16 + i), 1.8, 0.5, 3.2, 0.035,
            8, 6, 3.5, 2.4, 0.7, 0.12, SPARK_SHAPE.STREAK, SPARK_ADD);
        }
      }
    }
    if ((!opts || opts.light !== false) && this.host.flashLight && this.host.flashLight({ x: gx, z: gz }, '#ffc890', 22, 4.5, R * 3.2, 0.97)) this.stats.lights++;
    if (this.host.distortion && !this.reduced.motion) this.host.distortion({ x, y: 1, z, radius: R * 0.8, strength: 1.2, life: 0.25 });
  }

  /**
   * PIN — a nail driven into the world.
   *   fire   a cyan muzzle flash and light at the ship; sparks kick toward the target; the seed
   *          leaves a bright trail as it flies.
   *   land   a landing flash and light, sparks spraying off the spot, a stamp ring, three claws
   *          snapping shut on the anchor.
   *   held   a small anchor beacon pulses once a second; the post is unmistakable on the floor.
   *   end    the anchor lets go with a cold puff.
   */
  pinFired(p) {
    if (!p || !p.spawnPos) return;
    const { x, z } = this._toLocal(p.spawnPos.x, p.spawnPos.z);
    const t0 = this.time;
    const seed = hashString('pin:' + String(p.seedId) + ':' + Math.round(t0 * 1000));
    let dx = 1; let dz = 0;
    if (p.lockPos) { const l = this._toLocal(p.lockPos.x, p.lockPos.z); dx = l.x - x; dz = l.z - z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d; }
    this._spark(x, 2.2, z, 0, 0, 0, t0, 0.1, 14, 22, 0, 0, 4, 8, 10, 1.5, 3, 4, SPARK_SHAPE.GLOW, SPARK_ADD);
    for (let i = 0; i < 12; i++) {
      const a = Math.atan2(dz, dx) + (unit(seed, i) - 0.5) * 0.7;
      const v = 160 + 260 * unit(seed, 20 + i);
      this._spark(x, 2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 0.2 + 0.15 * unit(seed, 40 + i), 1.2, 0.4, 5, 0.03, 3, 7, 9, 0.8, 2, 3, SPARK_SHAPE.STREAK, SPARK_ADD);
    }
    if (this.host.flashLight && this.host.flashLight(p.spawnPos, '#7fe8ff', 5, 9, 120, 0.7)) this.stats.lights++;
    this.pin = { seedId: p.seedId, phase: 'travel', x, z, seed, n: 0, next: t0 + 1, born: t0 };
    this.stats.casts++;
  }

  pinLanding(p, locked) {
    if (!p || !p.pos) return;
    const { x, z } = this._toLocal(p.pos.x, p.pos.z);
    const t0 = this.time;
    const seed = hashString('pinland:' + String(p.seedId) + ':' + Math.round(t0 * 1000));
    if (!locked) {
      // The clank: a hard white flash, then claws biting in (below, on lock).
      this._spark(x, 2.6, z, 0, 0, 0, t0, 0.1, 30, 20, 0, 0, 14, 15, 16, 4, 7, 9, SPARK_SHAPE.GLOW, SPARK_ADD);
      this._spark(x, 2.4, z, 0, 0, 0, t0, 0.14, 16, 26, 0, 0, 7, 10, 12, 2, 4, 6, SPARK_SHAPE.GLOW, SPARK_ADD);
      for (let i = 0; i < 26; i++) {
        const a = unit(seed, i) * TAU;
        const v = 120 + 300 * unit(seed, 30 + i);
        this._spark(x, 2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 0.25 + 0.3 * unit(seed, 60 + i), 1.3, 0.4, 4.5, 0.03, 6, 9, 10, 1, 2.5, 3.5, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      Object.assign(this.s, { x, y: 1.4, z, birth: t0, from: 3, to: 40, life: 0.3, halfWidth: 3.2, r: 1.8, g: 4.2, b: 5.0, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: unit(seed, 90) });
      this.shells.emit(this.s);
      if (this.host.flashLight && this.host.flashLight(p.pos, '#7fe8ff', 8, 6, 150, 0.85)) this.stats.lights++;
    } else {
      // The claws snap shut: three bright strokes fall onto the anchor and a ring clamps down.
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3 + unit(seed, 100) * TAU;
        const r0 = 18;
        const q = this.p;
        Object.assign(q, { x: x + Math.cos(a) * r0, y: 2, z: z + Math.sin(a) * r0, vx: 0, vy: 0, vz: 0, birth: t0, life: 0.16, size0: 2.2, size1: 1.6, drag: 0, stretch: 0.06,
          r0: 6, g0: 9, b0: 10, r1: 2, g1: 4, b1: 5, shape: SPARK_SHAPE.STREAK, blend: SPARK_ADD, cx: x, cz: z, accel: (2 * (r0 - 3)) / (0.16 * 0.16), swirl: 0 });
        this.sparks.emit(q);
        this.stats.particles++;
      }
      Object.assign(this.s, { x, y: 1.4, z, birth: t0, from: 26, to: 7, life: 0.2, halfWidth: 2, r: 2, g: 4, b: 4.6, alpha: 1, mode: SHELL_MODE.CONTRACT, arcStart: 0, arcSpan: 0, seed: unit(seed, 91) });
      this.shells.emit(this.s);
    }
    if (this.pin) { this.pin.phase = locked ? 'held' : 'locking'; this.pin.x = x; this.pin.z = z; }
  }

  pinEnded() {
    const pin = this.pin;
    this.pin = null;
    if (!pin) return;
    const t = this.time;
    for (let i = 0; i < 6; i++) {
      const a = unit(pin.seed, 400 + i) * TAU;
      this._spark(pin.x, 1.8, pin.z, Math.cos(a) * 25, 0, Math.sin(a) * 25, t, 0.8, 5, 14, 1.5, 0, 0.35, 0.5, 0.6, 0.2, 0.25, 0.3, SPARK_SHAPE.PUFF, 0.6);
    }
  }

  _sustainPin(state) {
    const pin = this.pin;
    if (!pin) return;
    const ms = state && state.massSeed;
    const t = this.time;
    const ent = ms && ms.seedId != null && state.entities && state.entities.get ? state.entities.get(ms.seedId) : null;
    if (ent && ent.pos) { const l = this._toLocal(ent.pos.x, ent.pos.z); pin.x = l.x; pin.z = l.z; }
    if (pin.phase === 'travel' && ent && ent.pos && !this.reduced.motion) {
      // The flying seed leaves a trail of short-lived hot streaks (a ribbon of light behind it).
      this._spark(pin.x, 1.9, pin.z, 0, 0, 0, t, 0.22, 6, 1.2, 0, 0, 8, 12, 14, 1, 3, 4, SPARK_SHAPE.GLOW, SPARK_ADD);
    }
    // A standing post: a steady marker light every frame, a pulse each second, and its hold
    // radius on the floor (the seed field's true radius, drawn by the boundary line pass).
    if (pin.phase === 'held') this._spark(pin.x, 2.2, pin.z, 0, 0, 0, t, 0.05, 6, 6, 0, 0, 3, 7, 8, 3, 7, 8, SPARK_SHAPE.GLOW, SPARK_ADD);
    if (pin.phase === 'held' && t >= pin.next) {
      pin.next = t + 1;
      pin.n++;
      this._spark(pin.x, 2, pin.z, 0, 0, 0, t, 0.3, 7, 4, 0, 0, 3, 6.5, 7.5, 1, 2, 2.5, SPARK_SHAPE.GLOW, SPARK_ADD);
      if (!this.reduced.motion) {
        Object.assign(this.s, { x: pin.x, y: 1.3, z: pin.z, birth: t, from: 5, to: 24, life: 0.6, halfWidth: 1.2, r: 1, g: 2.2, b: 2.6, alpha: 0.7, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: unit(pin.seed, 500 + pin.n) });
        this.shells.emit(this.s);
      }
    }
    if (t - pin.born > 60) this.pin = null;
  }

  /**
   * PLOW — a blade of force pushed ahead of the bow that scrapes rocks out of the way.
   *   on     the bow sparks; the wedge's true reach is drawn (arc contours at 1/3, 2/3 and the
   *          tip), so the player can see exactly what it will catch.
   *   held   fronts travel out along the wedge every 0.25 s (direction of transport); every
   *          rock inside grinds out sparks and dust on its trailing side; grit streams forward.
   *   off    the contours retire with a short fade.
   */
  _contour(key, x, z, r, alpha, heading, half) {
    Object.assign(this.s, { x, y: 1.1, z, from: r, to: r, halfWidth: Math.max(1.4, r * 0.008), r: 1.2, g: 2.6, b: 3.0, alpha, arcStart: heading - half, arcSpan: half * 2, seed: 0.5 });
    this.shells.hold(key, this.s);
  }

  _sustainPlow(state) {
    const list = state && state.fields && state.fields.active;
    const t = this.time;
    let cone = null;
    if (Array.isArray(list)) for (let i = 0; i < list.length; i++) { const f = list[i]; if (f && f.kind === 'cone' && f.center && f.radius > 0) { cone = f; break; } }
    const keys = PLOW_KEYS;
    if (!cone) {
      if (this.plow) { for (const k of keys) this.shells.release(k); this.plow = null; }
      if (this._plowRims && this._plowRims.size) this._plowHeld(state, 0, 0, 0, this.time);
      return;
    }
    const { x, z } = this._toLocal(cone.center.x, cone.center.z);
    const dx = Number.isFinite(cone.dir && cone.dir.x) ? cone.dir.x : 1;
    const dz = Number.isFinite(cone.dir && cone.dir.z) ? cone.dir.z : 0;
    const heading = Math.atan2(dz, dx);
    const half = Math.max(0.05, Math.min(1.5, Number.isFinite(cone.halfAngleRad) ? cone.halfAngleRad : 0.56));
    const R = cone.radius;
    if (!this.plow) {
      const seed = hashString('plow:' + String(cone.id) + ':' + Math.round(t * 1000));
      this.plow = { seed, n: 0, nextFront: t, nextGrind: t };
      this.stats.casts++;
      for (let s = -1; s <= 1; s += 2) {
        const a = heading + s * half * 0.7;
        const bx = x + Math.cos(heading) * 10 + Math.cos(heading + s * 1.57) * 5;
        const bz = z + Math.sin(heading) * 10 + Math.sin(heading + s * 1.57) * 5;
        this._spark(bx, 2, bz, 0, 0, 0, t, 0.12, 9, 14, 0, 0, 3, 7, 8, 1, 2, 2.5, SPARK_SHAPE.GLOW, SPARK_ADD);
        for (let i = 0; i < 8; i++) {
          const aa = a + (unit(seed, i + (s + 1) * 10) - 0.5) * 0.6;
          const v = 180 + 200 * unit(seed, 40 + i + (s + 1) * 10);
          this._spark(bx, 2, bz, Math.cos(aa) * v, 0, Math.sin(aa) * v, t, 0.25, 1.2, 0.4, 4, 0.03, 3, 7, 9, 0.8, 2, 3, SPARK_SHAPE.STREAK, SPARK_ADD);
        }
      }
    }
    const plow = this.plow;
    this._contour(keys[0], x, z, R * 0.34, 0.3, heading, half);
    this._contour(keys[1], x, z, R * 0.67, 0.4, heading, half);
    this._contour(keys[2], x, z, R, 0.75, heading, half);
    if (this.reduced.motion) return;
    if (t >= plow.nextFront) {
      plow.nextFront = t + 0.25;
      plow.n++;
      Object.assign(this.s, { x, y: 1.3, z, birth: t, from: 14, to: R, life: 0.45, halfWidth: 3.2, r: 1.5, g: 3.2, b: 3.8, alpha: 0.7, mode: SHELL_MODE.EXPAND, arcStart: heading - half * 0.9, arcSpan: half * 1.8, seed: unit(plow.seed, 100 + plow.n) });
      this.shells.emit(this.s);
    }
    // Captured rocks (state.fields.plow.held): an arc from the bow to each one and a hot rim on it.
    this._plowHeld(state, x, z, heading, t);
    if (t >= plow.nextGrind) {
      plow.nextGrind = t + 0.08;
      // Grit streaming forward through the wedge.
      for (let k = 0; k < 4; k++) {
        const a = heading + (unit(plow.seed, 5000 + plow.n * 13 + k) - 0.5) * half * 1.8;
        const r0 = R * 0.15 + R * 0.6 * unit(plow.seed, 6000 + plow.n * 13 + k);
        this._spark(x + Math.cos(a) * r0, 1.2, z + Math.sin(a) * r0, Math.cos(a) * 140, 0, Math.sin(a) * 140, t, 0.5, 1.0, 0.6, 1.2, 0.02, 0.9, 1.6, 1.8, 0.3, 0.5, 0.6, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
    }
  }

  _plowHeld(state, x, z, heading, t) {
    const held = state && state.fields && state.fields.plow && state.fields.plow.held;
    const rims = this._plowRims || (this._plowRims = new Map());
    for (const v of rims.values()) v.seen = false;
    if (Array.isArray(held) && state.entities && state.entities.get) {
      const bx = x + Math.cos(heading) * 12;
      const bz = z + Math.sin(heading) * 12;
      this._frame = (this._frame || 0) + 1;
      for (let i = 0; i < held.length && i < 25; i++) {
        const h = held[i];
        const e = h && state.entities.get(h.id);
        if (!e || !e.pos || e.alive === false) continue;
        const l = this._toLocal(e.pos.x, e.pos.z);
        const ex = l.x; const ez = l.z;
        const rad = Number.isFinite(e.radius) ? e.radius : 6;
        const key = 'plow:rim:' + h.id;
        let rim = rims.get(h.id);
        if (!rim) { rim = { key, seen: true }; rims.set(h.id, rim); }
        rim.seen = true;
        Object.assign(this.s, { x: ex, y: 1.6, z: ez, from: rad * 1.15, to: rad * 1.15, halfWidth: Math.max(1.2, rad * 0.08), r: 2.6, g: 3.6, b: 4.4, alpha: 0.9, arcStart: 0, arcSpan: 0, seed: (h.id % 97) / 97 });
        this.shells.hold(key, this.s);
        if (this.reduced.motion && (this._frame & 3)) continue;
        // A crackling arc: a jagged chain of short hot streaks, re-rolled every frame.
        const dx = ex - bx; const dz = ez - bz;
        const len = Math.hypot(dx, dz);
        if (!(len > 2)) continue;
        const ux = dx / len; const uz = dz / len;
        const n = Math.max(4, Math.min(12, Math.round(len / 10)));
        let px = bx; let pz = bz;
        for (let k = 1; k <= n; k++) {
          const f = k / n;
          const jag = k === n ? 0 : (unit(this._frame * 131 + h.id, k) - 0.5) * Math.min(14, len * 0.18);
          const qx = bx + dx * f - uz * jag;
          const qz = bz + dz * f + ux * jag;
          const sx = qx - px; const sz = qz - pz; const sl = Math.hypot(sx, sz) || 1;
          this._spark((px + qx) / 2, 2.2, (pz + qz) / 2, sx / sl * 4, 0, sz / sl * 4, t, 0.05, 1.1, 1.1, 0, sl / 4,
            3, 5, 7, 3, 5, 7, SPARK_SHAPE.STREAK, SPARK_ADD);
          px = qx; pz = qz;
        }
      }
    }
    for (const [id, v] of rims) if (!v.seen) { this.shells.release(v.key); rims.delete(id); }
  }

  /** Plow launch: the captured load leaves with a bang and burning trails. */
  plowLaunched(p, state) {
    const me = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
    if (!me || !me.pos) return;
    const { x, z } = this._toLocal(me.pos.x, me.pos.z);
    const dir = p && p.dir ? Math.atan2(p.dir.z, p.dir.x) : (Number.isFinite(me.rot) ? me.rot : 0);
    const t = this.time;
    const seed = hashString('plowlaunch:' + Math.round(t * 1000));
    const bx = x + Math.cos(dir) * 14; const bz = z + Math.sin(dir) * 14;
    this._spark(bx, 2.6, bz, 0, 0, 0, t, 0.1, 18, 30, 0, 0, 7, 9, 10, 2, 3, 4, SPARK_SHAPE.GLOW, SPARK_ADD);
    Object.assign(this.s, { x: bx, y: 1.6, z: bz, birth: t, from: 6, to: 90, life: 0.3, halfWidth: 4, r: 2.4, g: 3.6, b: 4.4, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: dir - 0.7, arcSpan: 1.4, seed: unit(seed, 1) });
    this.shells.emit(this.s);
    for (let i = 0; i < 30; i++) {
      const a = dir + (unit(seed, 10 + i) - 0.5) * 1.1;
      const v = 260 + 360 * unit(seed, 50 + i);
      this._spark(bx, 2.2, bz, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.3, 2, 0.6, 3.5, 0.04, 6, 8, 10, 1, 2.4, 3.4, SPARK_SHAPE.STREAK, SPARK_ADD);
    }
    if (this.host.flashLight && this.host.flashLight(me.pos, '#9fe8ff', 8, 7, 160, 0.85)) this.stats.lights++;
  }

  /** Energised (launched) bodies burn a trail for as long as the sim says they are live. */
  _energisedTrails(state) {
    const list = state && state.entityList;
    if (!Array.isArray(list) || this.reduced.motion) return;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    let n = 0;
    for (let i = 0; i < list.length && n < 30; i++) {
      const e = list[i];
      const until = e && e.data && e.data.energisedUntil;
      if (!(until > now) || !e.pos || e.alive === false) continue;
      n++;
      const l = this._toLocal(e.pos.x, e.pos.z);
      const rad = Number.isFinite(e.radius) ? e.radius : 6;
      const k = Math.min(1, (until - now) / 3);
      this._spark(l.x, 1.8, l.z, 0, 0, 0, this.time, 0.3, rad * 0.9, rad * 0.3, 0, 0, 2 + 4 * k, 3 + 3 * k, 4, 0.6, 0.8, 1.2, SPARK_SHAPE.GLOW, SPARK_ADD);
    }
  }

  /**
   * GUNS — each family looks the way it plays.
   *   hose   a constant fizz: tiny hot muzzle pips and pin-prick impact sparks, no rings, no
   *          lights of its own — the stream (tracers) is the gun, not any one round.
   *   pew    a crisp bolt: a small muzzle bloom, a handful of sparks and a chip on impact.
   *   thump  the wallop: a muzzle blast ring and recoil smoke at the ship; on impact a hot
   *          shock ring, a spark fan, tumbling chips, a puff, a light spike and a refraction punch.
   *   needle a long white spray along the shot line at the hit.
   *   burn   metal goes orange then white: a hot glow and dripping embers where it cuts.
   *   boom   ordnance: a small blast (the Bomb's grammar at half size).
   * Budget: hose <= 6 particles per round, thump <= 60 per hit, one light per thump hit only.
   */
  gunMuzzle(family, x0, z0, angle, isPlayer) {
    const { x, z } = this._toLocal(x0, z0);
    const t = this.time;
    const ca = Math.cos(angle); const sa = Math.sin(angle);
    const seed = (this.stats.particles * 2654435761) >>> 0;
    if (family === 'thump') {
      this._spark(x, 2.4, z, ca * 40, 0, sa * 40, t, 0.08, 14, 22, 4, 0, 9, 7.5, 5, 3, 1.6, 0.6, SPARK_SHAPE.GLOW, SPARK_ADD);
      Object.assign(this.s, { x: x + ca * 4, y: 1.5, z: z + sa * 4, birth: t, from: 2, to: 16, life: 0.14, halfWidth: 2.2, r: 3, g: 2.4, b: 1.6, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: angle - 1.1, arcSpan: 2.2, seed: unit(seed, 1) });
      this.shells.emit(this.s);
      for (let i = 0; i < 12; i++) {
        const a = angle + (unit(seed, 10 + i) - 0.5) * 0.9;
        const v = 220 + 260 * unit(seed, 30 + i);
        this._spark(x, 2.2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.14 + 0.1 * unit(seed, 50 + i), 1.4, 0.4, 6, 0.03, 7, 5.5, 3.5, 2.2, 0.7, 0.15, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      for (let i = 0; i < 3; i++) {
        const a = angle + Math.PI + (unit(seed, 70 + i) - 0.5) * 1.4;
        this._spark(x, 1.8, z, Math.cos(a) * 30, 0, Math.sin(a) * 30, t, 0.6, 4, 11, 2, 0, 0.42, 0.4, 0.38, 0.3, 0.29, 0.28, SPARK_SHAPE.PUFF, 0.65);
      }
      return;
    }
    if (family === 'hose') {
      if (!isPlayer && unit(seed, 3) > 0.5) return; // NPC hoses fizz at half rate
      this._spark(x, 2.2, z, ca * 60, 0, sa * 60, t, 0.05, 3.2, 4.5, 6, 0, 6, 5, 3, 3, 1.5, 0.5, SPARK_SHAPE.GLOW, SPARK_ADD);
      const a = angle + (unit(seed, 5) - 0.5) * 0.5;
      this._spark(x, 2, z, Math.cos(a) * 260, 0, Math.sin(a) * 260, t, 0.08, 0.9, 0.3, 6, 0.025, 6, 5, 3, 2, 0.8, 0.2, SPARK_SHAPE.STREAK, SPARK_ADD);
      return;
    }
    if (family === 'pew' || family === 'needle') {
      this._spark(x, 2.2, z, ca * 40, 0, sa * 40, t, 0.06, 5, 8, 5, 0, 4, 6, 8, 1.5, 2.5, 4, SPARK_SHAPE.GLOW, SPARK_ADD);
    }
  }

  gunImpact(family, x0, z0, nx, nz, hitShield, heavy, targetId = null, weaponId = null) {
    if (weaponId && this._signatureImpact(weaponId, x0, z0, nx, nz, hitShield, targetId)) return;
    const { x, z } = this._toLocal(x0, z0);
    const t = this.time;
    const seed = (this.stats.particles * 2246822519 + 7) >>> 0;
    const base = Math.atan2(nz, nx);
    const shield = !!hitShield;
    // A hit reads at a fixed minimum ON-SCREEN size: a 30-pixel wasp's hit is as legible as a
    // bruiser's (world size per pixel from the camera, so it holds at every zoom).
    const wpp = this.host.wuPerPx ? this.host.wuPerPx(x, z) : 0;
    const fMin = 14 * wpp; const sMin = 2.4 * wpp;
    const hot = shield ? [2.2, 4.5, 6] : [7, 5.5, 3.4];
    const cool = shield ? [0.6, 1.4, 2.4] : [2.2, 0.6, 0.12];
    if (family === 'hose') {
      this._spark(x, 2.4, z, 0, 0, 0, t, 0.06, Math.max(4, fMin * 0.6), Math.max(6, fMin * 0.8), 0, 0, hot[0], hot[1], hot[2], cool[0], cool[1], cool[2], SPARK_SHAPE.GLOW, SPARK_ADD);
      for (let i = 0; i < 3; i++) {
        const a = base + (unit(seed, i) - 0.5) * 2.2;
        const v = 120 + 180 * unit(seed, 10 + i);
        this._spark(x, 2.2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.12 + 0.08 * unit(seed, 20 + i), Math.max(0.9, sMin), 0.3, 6, 0.025, hot[0], hot[1], hot[2], cool[0], cool[1], cool[2], SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      return;
    }
    if (family === 'thump' || heavy) {
      // The cannon's wallop is the biggest single impact in the game: a white-hot punch, a thick
      // blinding front that thins as it flies, a wide ring, a big spark fan and hard chunks, and
      // the struck body burns a trail as it is flung.
      this._spark(x, 2.8, z, 0, 0, 0, t, 0.09, 24, 16, 0, 0, 16, 15, 14, 5, 3, 1.5, SPARK_SHAPE.GLOW, SPARK_ADD);
      this._spark(x, 2.6, z, 0, 0, 0, t, 0.12, 16, 30, 0, 0, 10, 8.5, 6.5, 3, 1.6, 0.6, SPARK_SHAPE.GLOW, SPARK_ADD);
      Object.assign(this.s, { x, y: 1.7, z, birth: t, from: 4, to: 90, life: 0.3, halfWidth: 10, r: shield ? 2.4 : 6, g: shield ? 4.5 : 4.6, b: shield ? 6 : 3, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: unit(seed, 4) * TAU, arcSpan: 0, seed: 6 + unit(seed, 5) });
      this.shells.emit(this.s);
      if (targetId != null) this.trails.set(targetId, { from: t, until: t + 0.9, r: 5, g: 3.4, b: 1.6 });
      if (this.host.distortion && !this.reduced.motion) this.host.distortion({ x, y: 1, z, radius: 46, strength: 1.2, life: 0.16 });
      Object.assign(this.s, { x, y: 1.6, z, birth: t, from: 4, to: 70, life: 0.32, halfWidth: 4.5, r: shield ? 1.4 : 3.6, g: shield ? 3 : 2.6, b: shield ? 4 : 1.6, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: unit(seed, 2) * TAU, arcSpan: 0, seed: unit(seed, 3) });
      this.shells.emit(this.s);
      for (let i = 0; i < 40; i++) {
        const a = base + (unit(seed, 40 + i) - 0.5) * 2.6;
        const v = 260 + 520 * unit(seed, 70 + i);
        this._spark(x, 2.4, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.25 + 0.25 * unit(seed, 100 + i), 2.0, 0.6, 4.5, 0.04, hot[0], hot[1], hot[2], cool[0], cool[1], cool[2], SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      if (!shield) {
        for (let i = 0; i < 10; i++) {
          const a = base + (unit(seed, 140 + i) - 0.5) * 2.0;
          const v = 140 + 220 * unit(seed, 150 + i);
          this._spark(x, 2.4, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.7 + 0.4 * unit(seed, 160 + i), 2.2, 1.6, 1.6, 0.004, 3, 1.5, 0.6, 0.35, 0.3, 0.28, SPARK_SHAPE.CHIP, 0.55);
        }
        for (let i = 0; i < 3; i++) {
          const a = base + (unit(seed, 170 + i) - 0.5) * 1.6;
          this._spark(x, 2, z, Math.cos(a) * 35, 0, Math.sin(a) * 35, t + 0.04, 0.8, 6, 16, 1.8, 0, 0.3, 0.27, 0.25, 0.2, 0.19, 0.18, SPARK_SHAPE.PUFF, 0.7);
        }
      }
      if (this.host.distortion && !this.reduced.motion) this.host.distortion({ x, y: 1, z, radius: 26, strength: 0.9, life: 0.14 });
      return;
    }
    if (family === 'needle') {
      for (let i = 0; i < 10; i++) {
        const a = base + Math.PI + (unit(seed, i) - 0.5) * 0.35;
        const v = 300 + 400 * unit(seed, 20 + i);
        this._spark(x, 2.4, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.2, 1.2, 0.4, 5, 0.04, 9, 9, 10, 2, 2.6, 4, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      this._spark(x, 2.6, z, 0, 0, 0, t, 0.08, 10, 14, 0, 0, 9, 9, 10, 3, 3, 4, SPARK_SHAPE.GLOW, SPARK_ADD);
      return;
    }
    if (family === 'burn') {
      this._spark(x, 2.4, z, 0, 0, 0, t, 0.12, 8, 9, 0, 0, 9, 6, 2.5, 4, 1.4, 0.3, SPARK_SHAPE.GLOW, SPARK_ADD);
      for (let i = 0; i < 3; i++) {
        const a = unit(seed, i) * TAU;
        this._spark(x, 2.2, z, Math.cos(a) * 25, 0, Math.sin(a) * 25, t, 0.5 + 0.3 * unit(seed, 10 + i), 1.1, 0.6, 1.5, 0.01, 6, 3, 0.8, 1.5, 0.3, 0.05, SPARK_SHAPE.GRAIN, SPARK_ADD);
      }
      return;
    }
    if (family === 'boom') { this.bomb(x0, z0, 18, 'boom:' + seed, { cast: false }); return; }
    // pew and anything unlisted: a crisp small hit.
    this._spark(x, 2.4, z, 0, 0, 0, t, 0.08, Math.max(8, fMin), Math.max(12, fMin * 1.3), 0, 0, hot[0], hot[1], hot[2], cool[0], cool[1], cool[2], SPARK_SHAPE.GLOW, SPARK_ADD);
    for (let i = 0; i < 7; i++) {
      const a = base + (unit(seed, i) - 0.5) * 2.2;
      const v = 150 + 250 * unit(seed, 10 + i);
      this._spark(x, 2.2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.16 + 0.12 * unit(seed, 20 + i), Math.max(1.1, sMin), 0.35, 5, 0.03, hot[0], hot[1], hot[2], cool[0], cool[1], cool[2], SPARK_SHAPE.STREAK, SPARK_ADD);
    }
    if (!shield) this._spark(x, 2.3, z, Math.cos(base) * 90, 0, Math.sin(base) * 90, t, 0.6, 1.8, 1.4, 1.8, 0.004, 3, 1.5, 0.6, 0.35, 0.3, 0.28, SPARK_SHAPE.CHIP, 0.55);
  }

  /**
   * PIN on a body — a stake bolt flies from the hull to the body, nails it to a point in space,
   * and a taut glowing cable holds it there while it strains; release snaps the cable.
   *   cast   muzzle flash at the ship; a hot bolt travels the real path at its real speed.
   *   staked landing flash at the body and at the stake point; the cable appears taut.
   *   held   the cable is redrawn every frame from the body to the stake point; it brightens and
   *          shivers as the body strains away from the point.
   *   free   the cable snaps with a spray of sparks at both ends.
   */
  stakeCast(p, state) {
    if (!p || !p.from || !p.to) return;
    const a = this._toLocal(p.from.x, p.from.z); const ax = a.x; const az = a.z;
    const b = this._toLocal(p.to.x, p.to.z); const bx = b.x; const bz = b.z;
    const t0 = this.time;
    const now = state && Number.isFinite(state.simTime) ? state.simTime : 0;
    const dur = Math.max(0.05, Math.min(0.6, (Number(p.endAt) || now + 0.3) - (Number(p.startAt) || now)));
    this._spark(ax, 2.2, az, 0, 0, 0, t0, 0.1, 14, 22, 0, 0, 4, 8, 10, 1.5, 3, 4, SPARK_SHAPE.GLOW, SPARK_ADD);
    const steps = 14;
    const dx = (bx - ax) / steps; const dz = (bz - az) / steps;
    const vx = (bx - ax) / dur; const vz = (bz - az) / dur;
    for (let i = 0; i <= steps; i++) {
      // The bolt: a hot head born at each point of the path at the moment the bolt passes it.
      this._spark(ax + dx * i, 2, az + dz * i, vx * 0.02, 0, vz * 0.02, t0 + dur * i / steps, 0.16, 3.2, 1.0, 0, 0.6,
        6, 10, 12, 1, 2.5, 3.2, SPARK_SHAPE.STREAK, SPARK_ADD);
    }
    this.stats.casts++;
  }

  staked(p, state) {
    if (!p || !p.pos) return;
    const s = this._toLocal(p.pos.x, p.pos.z); const sx = s.x; const sz = s.z;
    const t0 = this.time;
    const seed = hashString('stake:' + String(p.targetId) + ':' + Math.round(t0 * 1000));
    this._spark(sx, 2.4, sz, 0, 0, 0, t0, 0.12, 20, 30, 0, 0, 7, 10, 12, 2, 4, 6, SPARK_SHAPE.GLOW, SPARK_ADD);
    Object.assign(this.s, { x: sx, y: 1.4, z: sz, birth: t0, from: 3, to: 36, life: 0.3, halfWidth: 3, r: 1.8, g: 4.2, b: 5.0, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: unit(seed, 1) });
    this.shells.emit(this.s);
    const ent = state && state.entities && state.entities.get ? state.entities.get(p.targetId) : null;
    if (ent && ent.pos) {
      const e = this._toLocal(ent.pos.x, ent.pos.z);
      for (let i = 0; i < 16; i++) {
        const a = unit(seed, 10 + i) * TAU;
        const v = 120 + 220 * unit(seed, 40 + i);
        this._spark(e.x, 2, e.z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 0.25, 1.8, 0.5, 4.5, 0.04, 6, 9, 10, 1, 2.5, 3.5, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
    }
    if (this.host.flashLight && this.host.flashLight(p.pos, '#7fe8ff', 7, 7, 140, 0.8)) this.stats.lights++;
  }

  stakeReleased(p, state) {
    if (!p) return;
    const t0 = this.time;
    const seed = hashString('unstake:' + String(p.targetId) + ':' + Math.round(t0 * 1000));
    const ends = [];
    if (p.pos) ends.push(this._toLocal(p.pos.x, p.pos.z));
    const ent = state && state.entities && state.entities.get ? state.entities.get(p.targetId) : null;
    if (ent && ent.pos) { const e = this._toLocal(ent.pos.x, ent.pos.z); ends.push({ x: e.x, z: e.z }); }
    if (ends.length === 2) {
      const a = ends[0]; const b = ends[1];
      const ax = a.x; const az = a.z; const bx = b.x; const bz = b.z;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const ux = (bx - ax) / len; const uz = (bz - az) / len;
      for (let i = 0; i < 12; i++) {
        const f = i / 12;
        this._spark(ax + (bx - ax) * f, 2, az + (bz - az) * f, ux * 220, 0, uz * 220, t0 + f * 0.05, 0.14, 1.6, 0.4, 6, 0.06, 9, 10, 11, 2, 3, 4, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
    }
    for (let k = 0; k < ends.length; k++) {
      const { x, z } = ends[k];
      for (let i = 0; i < 12; i++) {
        const a = unit(seed, k * 50 + i) * TAU;
        const v = 100 + 200 * unit(seed, k * 50 + 20 + i);
        this._spark(x, 2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t0, 0.22, 1.6, 0.4, 4, 0.04, 4, 8, 10, 0.8, 2, 3, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
    }
  }

  _sustainStakes(state) {
    const list = state && state.massSeedStakes && state.massSeedStakes.list;
    if (!Array.isArray(list) || !list.length) return;
    const t = this.time;
    for (let i = 0; i < list.length && i < 6; i++) {
      const st = list[i];
      if (!st || !st.pos || st.started === false) continue;
      const ent = state.entities && state.entities.get ? state.entities.get(st.targetId) : null;
      if (!ent || !ent.pos || ent.alive === false) continue;
      const a = this._toLocal(ent.pos.x, ent.pos.z); const ax = a.x; const az = a.z;
      const b = this._toLocal(st.pos.x, st.pos.z); const bx = b.x; const bz = b.z;
      const len = Math.hypot(bx - ax, bz - az);
      if (!(len > 1)) continue;
      // Strain: the further the body has been dragged from its stake, the hotter and shakier the line.
      const strain = Math.min(1, len / 60);
      const ux = (bx - ax) / len; const uz = (bz - az) / len;
      const n = Math.max(6, Math.min(24, Math.round(len / 6)));
      const shiver = this.reduced.motion ? 0 : strain * 1.2;
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        const off = shiver * Math.sin(f * Math.PI) * Math.sin(t * 60 + k * 1.7);
        const px = ax + (bx - ax) * f - uz * off;
        const pz = az + (bz - az) * f + ux * off;
        this._spark(px, 2, pz, ux * 4, 0, uz * 4, t, 0.05, 1.3 + strain * 0.8, 1.3 + strain * 0.8, 0, len / n / 4,
          1.2 + 8 * strain * strain, 3.2 + 6 * strain * strain, 4 + 5 * strain * strain, 1.2 + 8 * strain * strain, 3.2 + 6 * strain * strain, 4 + 5 * strain * strain, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      this._spark(bx, 2.2, bz, 0, 0, 0, t, 0.05, 5, 5, 0, 0, 3, 7, 8, 3, 7, 8, SPARK_SHAPE.GLOW, SPARK_ADD);
    }
  }

  /**
   * MINING contact: the beam's energy shows where it lands — a hot point on the rock, chips and
   * sparks kicked back toward the ship. Called every frame while the beam is on (fixed cadence).
   */
  miningContact(gx, gz, nx, nz, verb, dt) {
    this._mineAcc = (this._mineAcc || 0) + Math.max(0, dt || 0);
    const { x, z } = this._toLocal(gx, gz);
    const t = this.time;
    const hot = verb === 'repair' ? [1.6, 4.5, 3.2] : [6, 4.6, 2.6];
    this._spark(x, 2.2, z, 0, 0, 0, t, 0.06, 5, 6, 0, 0, hot[0], hot[1], hot[2], hot[0] * 0.5, hot[1] * 0.5, hot[2] * 0.5, SPARK_SHAPE.GLOW, SPARK_ADD);
    if (this._mineAcc < 0.06) return;
    this._mineAcc %= 0.06;
    this._mineN = (this._mineN || 0) + 1;
    const base = Math.atan2(nz, nx);
    for (let i = 0; i < 4; i++) {
      const a = base + (unit(this._mineN, i) - 0.5) * 1.6;
      const v = 120 + 200 * unit(this._mineN, 10 + i);
      this._spark(x, 2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.2, 1.4, 0.4, 5, 0.04, hot[0], hot[1], hot[2], hot[0] * 0.3, hot[1] * 0.2, hot[2] * 0.1, SPARK_SHAPE.STREAK, SPARK_ADD);
    }
    if (verb !== 'repair') {
      const a = base + (unit(this._mineN, 20) - 0.5) * 1.2;
      this._spark(x, 2, z, Math.cos(a) * 60, 0, Math.sin(a) * 60, t, 0.7, 1.8, 1.4, 1.6, 0.004, 0.55, 0.45, 0.38, 0.3, 0.27, 0.25, SPARK_SHAPE.CHIP, 0.8);
    }
  }

  _runSchedule() {
    const q = this.sched;
    if (!q.length) return;
    let w = 0;
    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      if (it.at <= this.time) { if (this.host.distortion) this.host.distortion(it); }
      else q[w++] = it;
    }
    q.length = w;
  }

  /** Bodies a power launched leave a short hot trail, so the eye follows the bodies. */
  _bodyTrails(state) {
    if (!this.trails.size) return;
    const ents = state && state.entities;
    const t = this.time;
    for (const [id, tr] of this.trails) {
      if (t > tr.until) { this.trails.delete(id); continue; }
      if (t < tr.from || this.reduced.motion) continue;
      const e = ents && ents.get ? ents.get(id) : null;
      if (!e || !e.pos || e.alive === false) { this.trails.delete(id); continue; }
      const l = this._toLocal(e.pos.x, e.pos.z);
      const k = 1 - (t - tr.from) / Math.max(0.01, tr.until - tr.from);
      const rad = Number.isFinite(e.radius) ? e.radius : 6;
      this._spark(l.x, 1.8, l.z, 0, 0, 0, t, 0.28, rad * 0.7, rad * 0.25, 0, 0, tr.r * (0.5 + k), tr.g * (0.5 + k), tr.b * (0.5 + k), tr.r * 0.3, tr.g * 0.2, tr.b * 0.1, SPARK_SHAPE.GLOW, SPARK_ADD);
    }
  }

  /**
   * ENEMY TELLS (ruling R19): each job's wind-up is a picture the player learns.
   *   burst     a dive line: a bright dashed lane from the dart along its nose, growing to the
   *             strike over the wind-up; a fuse glow on the dart.
   *   reach     a charge-up line on the floor from the sniper to its target, thin and dim at first,
   *             brightening and tightening until it fires.
   *   seize     a cable reaching from the grappler toward the hull, extending over the wind-up.
   *   deny      a ring at the source swelling to the reach of the field it is about to lay.
   *   others    an engine flare and a short warning ring at the ship.
   */
  telegraph(p, state) {
    if (!p || p.entityId == null) return;
    const now = state && Number.isFinite(state.simTime) ? state.simTime : 0;
    const e = state && state.entities && state.entities.get ? state.entities.get(p.entityId) : null;
    if (!e || !e.pos) return;
    const d = e.data || {};
    const row = enemyJobFor(d.enemyTypeId || d.lootTableId || d.archetypeId);
    const job = (typeof d.combatJob === 'string' && d.combatJob) || (row && row.job) || null;
    const dur = Math.max(0.25, Math.min(4, (Number(p.durationTicks) || 60) / 60));
    const tells = this.tells || (this.tells = new Map());
    if (tells.size > 16) { const first = tells.keys().next().value; tells.delete(first); }
    tells.set(e.id, { id: e.id, targetId: p.targetId, job, born: this.time, until: this.time + dur, dur, line: p.attackLine || null, seed: hashString('tell:' + e.id + ':' + Math.round(now * 60)) });
    // The start of every tell: a short warning ring at the ship in its job colour.
    const l = this._toLocal(e.pos.x, e.pos.z);
    const c = TELL_COLORS[job] || TELL_COLORS.default;
    const rad = Number.isFinite(e.radius) ? e.radius : 8;
    Object.assign(this.s, { x: l.x, y: 1.6, z: l.z, birth: this.time, from: rad * 0.8, to: rad * 2.6, life: 0.35, halfWidth: 1.6, r: c[0], g: c[1], b: c[2], alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: 0.37 });
    this.shells.emit(this.s);
  }

  _sustainTells(state) {
    const tells = this.tells;
    if (!tells || !tells.size) return;
    const t = this.time;
    const ents = state && state.entities;
    for (const [id, tl] of tells) {
      if (t > tl.until) { tells.delete(id); continue; }
      const e = ents && ents.get ? ents.get(id) : null;
      if (!e || !e.pos || e.alive === false) { tells.delete(id); continue; }
      const a = this._toLocal(e.pos.x, e.pos.z); const ax = a.x; const az = a.z;
      const k = (t - tl.born) / tl.dur; // 0 -> 1 over the wind-up
      const c = TELL_COLORS[tl.job] || TELL_COLORS.default;
      const tgt = tl.targetId != null && ents.get ? ents.get(tl.targetId) : null;
      let bx = ax; let bz = az;
      if (tl.line && tl.line.to) { const b = this._toLocal(tl.line.to.x, tl.line.to.z); bx = b.x; bz = b.z; }
      else if (tgt && tgt.pos) { const b = this._toLocal(tgt.pos.x, tgt.pos.z); bx = b.x; bz = b.z; }
      const len0 = Math.hypot(bx - ax, bz - az);
      if (tl.job === 'burst') {
        // Dive lane along the nose, reaching further as the fuse burns.
        const h = Number.isFinite(e.rot) ? e.rot : Math.atan2(bz - az, bx - ax);
        const L = 60 + 220 * k;
        this._lane(ax, az, ax + Math.cos(h) * L, az + Math.sin(h) * L, c, 0.5 + 0.8 * k, true, t);
        this._spark(ax, 2.2, az, 0, 0, 0, t, 0.05, 6 + 4 * k, 6 + 4 * k, 0, 0, c[0] * 1.5, c[1] * 1.5, c[2] * 1.5, c[0], c[1], c[2], SPARK_SHAPE.GLOW, SPARK_ADD);
      } else if (tl.job === 'reach' && len0 > 4) {
        // Charge-up line on the floor: dim and wide early, bright and thin just before the shot.
        this._lane(ax, az, bx, bz, c, 0.25 + 1.2 * k * k, false, t, 1.6 - 0.9 * k);
      } else if (tl.job === 'seize' && len0 > 4) {
        const f = Math.min(1, 0.2 + k);
        this._lane(ax, az, ax + (bx - ax) * f, az + (bz - az) * f, c, 0.6 + 0.6 * k, true, t);
      } else if (tl.job === 'deny') {
        if (((t * 60) | 0) % 6 === 0) {
          Object.assign(this.s, { x: ax, y: 1.4, z: az, birth: t, from: 10, to: 40 + 120 * k, life: 0.3, halfWidth: 1.6, r: c[0], g: c[1], b: c[2], alpha: 0.6, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: 0.5 });
          this.shells.emit(this.s);
        }
      } else {
        const h = Number.isFinite(e.rot) ? e.rot : 0;
        this._spark(ax - Math.cos(h) * 8, 2, az - Math.sin(h) * 8, 0, 0, 0, t, 0.05, 5 + 3 * k, 5, 0, 0, c[0], c[1], c[2], c[0], c[1], c[2], SPARK_SHAPE.GLOW, SPARK_ADD);
      }
    }
  }

  /** A lane of light between two points, redrawn per frame (dashed = moving dashes toward b). */
  _lane(ax, az, bx, bz, c, gain, dashed, t, width = 1.1) {
    const len = Math.hypot(bx - ax, bz - az);
    if (!(len > 1)) return;
    const ux = (bx - ax) / len; const uz = (bz - az) / len;
    const n = Math.max(4, Math.min(20, Math.round(len / 14)));
    const scroll = dashed ? (t * 3) % 1 : 0;
    for (let i = 0; i < n; i++) {
      const f = (i + scroll) / n;
      const segLen = dashed ? len / n * 0.55 : len / n;
      this._spark(ax + (bx - ax) * f, 1.8, az + (bz - az) * f, ux * 4, 0, uz * 4, t, 0.05, width, width, 0, segLen / 4,
        c[0] * gain, c[1] * gain, c[2] * gain, c[0] * gain, c[1] * gain, c[2] * gain, SPARK_SHAPE.STREAK, SPARK_ADD);
    }
  }

  /**
   * Signature hits for guns that must not share the autocannon's look (combat lead's list):
   * bank stream = gold thread that ricochets; disc / glaive = a spinning edge biting in;
   * singularity mortar = a pull, then a pop; debris orbit = hard chunks; tumbler = a spin read.
   * Returns true when the weapon has its own grammar.
   */
  _signatureImpact(weaponId, x0, z0, nx, nz, hitShield, targetId) {
    const id = String(weaponId);
    const kind = id.includes('bank_stream') ? 'stream' : (id.includes('disc_launcher') || id.includes('glaive')) ? 'blade'
      : id.includes('singularity_mortar') ? 'mortar' : id.includes('debris_orbit') ? 'debris' : id.includes('tumbler') ? 'tumbler' : null;
    if (!kind) return false;
    const { x, z } = this._toLocal(x0, z0);
    const t = this.time;
    const seed = (this.stats.particles * 2654435761 + 13) >>> 0;
    const base = Math.atan2(nz, nx);
    if (kind === 'stream') {
      // Gold thread: a bright gold pip, and the ricochet - a streak leaving along the reflection.
      this._spark(x, 2.4, z, 0, 0, 0, t, 0.07, 6, 8, 0, 0, 7, 5, 1.6, 3, 1.6, 0.3, SPARK_SHAPE.GLOW, SPARK_ADD);
      const out = base + (unit(seed, 1) - 0.5) * 0.9;
      this._spark(x, 2.2, z, Math.cos(out) * 420, 0, Math.sin(out) * 420, t, 0.16, 1.6, 0.6, 2, 0.05, 8, 6, 2, 3, 1.6, 0.3, SPARK_SHAPE.STREAK, SPARK_ADD);
      for (let i = 0; i < 2; i++) { const a = base + (unit(seed, 2 + i) - 0.5) * 2; this._spark(x, 2.2, z, Math.cos(a) * 200, 0, Math.sin(a) * 200, t, 0.12, 1, 0.3, 6, 0.03, 7, 5, 1.5, 2, 1, 0.2, SPARK_SHAPE.STREAK, SPARK_ADD); }
      return true;
    }
    if (kind === 'blade') {
      // A spinning edge biting in: a short bright arc of the blade's rim and a tangential spark fan.
      Object.assign(this.s, { x, y: 1.6, z, birth: t, from: 9, to: 16, life: 0.18, halfWidth: 1.6, r: 3.6, g: 5.5, b: 6.5, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: base - 1.1, arcSpan: 2.2, seed: unit(seed, 3) });
      this.shells.emit(this.s);
      for (let i = 0; i < 14; i++) {
        const side = i % 2 ? 1 : -1;
        const a = base + side * (1.2 + 0.5 * unit(seed, 10 + i));
        const v = 220 + 260 * unit(seed, 30 + i);
        this._spark(x, 2.2, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.22, 1.4, 0.4, 5, 0.04, 6, 8, 9, 1.5, 2.5, 3, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      return true;
    }
    if (kind === 'mortar') {
      // The singularity shell: space drains toward the point, then it pops.
      for (let k = 0; k < 2; k++) {
        Object.assign(this.s, { x, y: 1.4, z, birth: t + 0.08 * k, from: 70 - 15 * k, to: 4, life: 0.32, halfWidth: 3, r: 2, g: 1.6, b: 4.4, alpha: 1, mode: SHELL_MODE.CONTRACT, arcStart: unit(seed, 5 + k) * TAU, arcSpan: 0, seed: unit(seed, 7 + k) });
        this.shells.emit(this.s);
      }
      this._pullMotes(x, z, 70, seed, 0, 30, t);
      this.sched.push({ at: t + 0.3, x, y: 1, z, radius: 40, strength: 1, life: 0.12 });
      this._mortarPops = this._mortarPops || [];
      this._mortarPops.push({ at: t + 0.32, gx: x0, gz: z0 });
      return true;
    }
    if (kind === 'debris') {
      this._spark(x, 2.4, z, 0, 0, 0, t, 0.08, 10, 14, 0, 0, 7, 5.5, 3.5, 2, 1, 0.3, SPARK_SHAPE.GLOW, SPARK_ADD);
      for (let i = 0; i < 6; i++) { const a = base + (unit(seed, i) - 0.5) * 2.2; const v = 120 + 180 * unit(seed, 10 + i); this._spark(x, 2.3, z, Math.cos(a) * v, 0, Math.sin(a) * v, t, 0.8, 2.6, 2, 1.6, 0.005, 3.5, 1.8, 0.7, 0.4, 0.34, 0.3, SPARK_SHAPE.CHIP, 0.6); }
      return true;
    }
    // tumbler: zero damage, the body spins end over end - a violet swirl around the hit and a
    // spinning trail on the target.
    for (let i = 0; i < 18; i++) {
      const a = unit(seed, i) * TAU; const r0 = 14 + 10 * unit(seed, 30 + i);
      const p = this.p;
      Object.assign(p, { x: x + Math.cos(a) * r0, y: 2, z: z + Math.sin(a) * r0, vx: 0, vy: 0, vz: 0, birth: t, life: 0.5, size0: 1.6, size1: 0.6, drag: 0, stretch: 0.06,
        r0: 3, g0: 1.6, b0: 6, r1: 1, g1: 0.6, b1: 2.5, shape: SPARK_SHAPE.STREAK, blend: SPARK_ADD, cx: x, cz: z, accel: 0, swirl: 9 });
      this.sparks.emit(p); this.stats.particles++;
    }
    if (targetId != null) this.trails.set(targetId, { from: t, until: t + 1.2, r: 3, g: 1.6, b: 6 });
    return true;
  }

  /** Pilot level up: a short bright flash and an expanding ring on the ship (~0.6 s, no shake). */
  levelUp(p, state) {
    const e = p && state && state.entities && state.entities.get ? state.entities.get(p.entityId != null ? p.entityId : state.playerId) : null;
    if (!e || !e.pos) return;
    const { x, z } = this._toLocal(e.pos.x, e.pos.z);
    const t = this.time;
    const rad = Number.isFinite(e.radius) ? e.radius : 10;
    this._spark(x, 2.6, z, 0, 0, 0, t, 0.14, rad * 2.2, rad * 3.2, 0, 0, 9, 8.5, 6, 3, 2.4, 1.2, SPARK_SHAPE.GLOW, SPARK_ADD);
    for (let k = 0; k < 2; k++) {
      Object.assign(this.s, { x, y: 1.6, z, birth: t + 0.08 * k, from: rad, to: rad * (6 - k), life: 0.6, halfWidth: 2.4 - k, r: 4.5, g: 3.8, b: 2, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: 0.21 + 0.3 * k });
      this.shells.emit(this.s);
    }
  }

  /** Skill picked: a smaller pulse in the branch colour; a capstone or evolution is bigger. */
  nodeTaken(p, state) {
    const e = p && state && state.entities && state.entities.get ? state.entities.get(p.entityId != null ? p.entityId : state.playerId) : null;
    if (!e || !e.pos) return;
    const hex = BRANCH_HEX[p.branch] || 0xf2b950;
    const big = p.kind === 'capstone' || p.kind === 'evolution';
    const k = big ? 2.4 : 1.6;
    const r = ((hex >> 16) & 255) / 255 * k * 2; const g = ((hex >> 8) & 255) / 255 * k * 2; const b = (hex & 255) / 255 * k * 2;
    const { x, z } = this._toLocal(e.pos.x, e.pos.z);
    const t = this.time;
    const rad = Number.isFinite(e.radius) ? e.radius : 10;
    this._spark(x, 2.5, z, 0, 0, 0, t, big ? 0.16 : 0.1, rad * (big ? 2 : 1.3), rad * (big ? 2.8 : 1.8), 0, 0, r * 2, g * 2, b * 2, r, g, b, SPARK_SHAPE.GLOW, SPARK_ADD);
    Object.assign(this.s, { x, y: 1.6, z, birth: t, from: rad, to: rad * (big ? 5 : 3), life: big ? 0.55 : 0.4, halfWidth: big ? 2.6 : 1.6, r, g, b, alpha: 1, mode: SHELL_MODE.EXPAND, arcStart: 0, arcSpan: 0, seed: 0.43 });
    this.shells.emit(this.s);
  }

  _bodyHits(state, gx, gz, cx, cz, R, t0, seed, scale) {
    const list = state && state.entityList;
    if (!list || !list.length) return;
    const playerId = state.playerId;
    const hits = this.pendingHits;
    hits.length = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.alive === false || !e.pos || e.id === playerId || !BODY_TYPES.has(e.type)) continue;
      const dx = e.pos.x - gx;
      const dz = e.pos.z - gz;
      const d = Math.hypot(dx, dz);
      const rad = Number.isFinite(e.radius) ? e.radius : 6;
      if (d - rad > R || d < 1) continue;
      hits.push({ d, dx: dx / d, dz: dz / d, rad, ex: e.pos.x, ez: e.pos.z, id: e.id });
    }
    hits.sort((a, b) => a.d - b.d);
    const n = Math.min(hits.length, Math.round(22 * scale));
    for (let h = 0; h < n; h++) {
      const hit = hits[h];
      const contact = Math.max(0, hit.d - hit.rad);
      const birth = t0 + shoveFrontDelay(contact, R);
      const at = this._toLocal(hit.ex - hit.dx * hit.rad * 0.9, hit.ez - hit.dz * hit.rad * 0.9);
      const ax = at.x;
      const az = at.z;
      const base = Math.atan2(hit.dz, hit.dx);
      const hs = (seed + h * 7919) >>> 0;
      if (hit.id != null) this.trails.set(hit.id, { from: birth, until: birth + 0.75, r: 4.5, g: 3.2, b: 1.6 });
      this._spark(ax, 2, az, 0, 0, 0, birth, 0.12, 8 + hit.rad * 0.5, 16 + hit.rad, 0, 0, 6, 5, 3.6, 2, 0.9, 0.3, SPARK_SHAPE.GLOW, SPARK_ADD);
      const nS = 9;
      for (let i = 0; i < nS; i++) {
        const a = base + (unit(hs, i) - 0.5) * 1.6;
        const v = 140 + 220 * unit(hs, 50 + i);
        this._spark(ax, 2, az, Math.cos(a) * v, 0, Math.sin(a) * v, birth, 0.28 + 0.2 * unit(hs, 100 + i), 1.3, 0.4, 4.5, 0.03,
          6.5, 5.5, 4.0, 2.4, 0.8, 0.2, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
      for (let i = 0; i < 3; i++) {
        const a = base + (unit(hs, 200 + i) - 0.5) * 1.2;
        const v = 30 + 40 * unit(hs, 210 + i);
        this._spark(ax, 1.5, az, Math.cos(a) * v, 0, Math.sin(a) * v, birth, 0.9 + 0.4 * unit(hs, 220 + i), 5 + hit.rad * 0.3, 12 + hit.rad * 0.6, 1.6, 0,
          0.5, 0.46, 0.42, 0.32, 0.3, 0.28, SPARK_SHAPE.PUFF, SPARK_MATTER * 0.7);
      }
    }
  }

  _spark(x, y, z, vx, vy, vz, birth, life, size0, size1, drag, stretch, r0, g0, b0, r1, g1, b1, shape, blend) {
    const p = this.p;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.birth = birth; p.life = life;
    p.size0 = size0; p.size1 = size1; p.drag = drag; p.stretch = stretch;
    p.r0 = r0; p.g0 = g0; p.b0 = b0; p.r1 = r1; p.g1 = g1; p.b1 = b1; p.shape = shape; p.blend = blend;
    p.cx = 0; p.cz = 0; p.accel = 0; p.swirl = 0;
    this.sparks.emit(p);
    this.stats.particles++;
  }

  /** Echo fronts and truthful boundary lines for the fields that are live right now. */
  _sustain(state) {
    const list = state && state.fields && state.fields.active;
    const seen = this._seen;
    seen.clear();
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (!f || (f.kind !== 'repulsor' && f.kind !== 'well' && f.kind !== 'seed') || !f.center || !(f.radius > 0)) continue;
        const key = `b:${f.id}`;
        const well = f.kind === 'well';
        seen.add(key);
        const { x, z } = this._toLocal(f.center.x, f.center.z);
        const power = this.castFields.has(String(f.id)) || f.kind === 'seed';
        Object.assign(this.s, { x, y: 1.1, z, from: f.radius, to: f.radius, halfWidth: Math.max(1.4, f.radius * 0.008), r: f.kind === 'seed' ? 0.9 : well ? 1.1 : 2.0, g: f.kind === 'seed' ? 2.6 : well ? 1.0 : 1.35, b: f.kind === 'seed' ? 3.0 : well ? 2.4 : 0.75, alpha: power ? 0.75 : 0.28, arcStart: 0, arcSpan: 0, seed: 0.3 });
        this.shells.hold(key, this.s);
        const echo = this.echoes.get(String(f.id));
        if (echo) { echo.x = x; echo.z = z; echo.alive = true; }
      }
    }
    const gone = this._gone || (this._gone = []);
    gone.length = 0;
    for (const key of this.shells.heldKeys()) if (!seen.has(key) && !key.startsWith('plow:')) gone.push(key);
    for (let i = 0; i < gone.length; i++) this.shells.release(gone[i]);
    this.stats.boundaries = this.shells.held.size;
    for (const [id, echo] of this.echoes) {
      if (!echo.alive) { if (this.time - echo.born > 0.5) this.echoes.delete(id); continue; }
      echo.alive = false;
      if (this.reduced.motion || this.time < echo.next) continue;
      echo.next = this.time + 0.7;
      echo.n++;
      Object.assign(this.s, { x: echo.x, y: 1.3, z: echo.z, birth: this.time, from: 10, to: echo.R, life: 0.55, halfWidth: Math.max(1.6, echo.R * 0.016), r: 1.6, g: 1.1, b: 0.6, alpha: 0.55, mode: SHELL_MODE.EXPAND, arcStart: unit(echo.seed, 3000 + echo.n) * TAU, arcSpan: 0, seed: unit(echo.seed, 3100 + echo.n) });
      this.shells.emit(this.s);
      for (let i = 0; i < 14; i++) {
        const a = unit(echo.seed, 3200 + echo.n * 31 + i) * TAU;
        const rho = 10 + echo.R * 0.8 * unit(echo.seed, 3300 + echo.n * 31 + i);
        const v = 50 + 60 * unit(echo.seed, 3400 + echo.n * 31 + i);
        this._spark(echo.x + Math.cos(a) * rho, 1, echo.z + Math.sin(a) * rho, Math.cos(a) * v, 0, Math.sin(a) * v,
          this.time + 0.55 * (1 - Math.pow(1 - rho / echo.R, 1 / SHOVE_EASE)), 0.6, 1.2, 0.5, 2, 0.02,
          1.8, 1.2, 0.6, 0.5, 0.25, 0.08, SPARK_SHAPE.STREAK, SPARK_ADD);
      }
    }
  }

  update(dt, state) {
    const sim = state && Number.isFinite(state.simTime) ? state.simTime : null;
    if (sim != null && this.lastSim != null) {
      const step = sim - this.lastSim;
      // Follows pause and slow motion; a restore or rewind does not run time backwards.
      this.time += step > 0 && step < 0.25 ? step : 0;
    } else if (sim == null) this.time += Math.max(0, Math.min(0.1, dt || 0));
    this.lastSim = sim;
    this.reduced = reducedFlags(state);
    this.sparks.time = this.time;
    this.shells.time = this.time;
    this._sustain(state);
    this._sustainWells(state);
    this._sustainPin(state);
    this._runSchedule();
    if (this._mortarPops && this._mortarPops.length) {
      let w = 0;
      for (let i = 0; i < this._mortarPops.length; i++) { const m = this._mortarPops[i]; if (m.at <= this.time) this.bomb(m.gx, m.gz, 10, 'mortar', { cast: false, light: false }); else this._mortarPops[w++] = m; }
      this._mortarPops.length = w;
    }
    this._sustainTells(state);
    this._bodyTrails(state);
    this._sustainStakes(state);
    this._sustainPlow(state);
    this._energisedTrails(state);
    const a = this.sparks.update(this.time, { reducedFlash: this.reduced.flash });
    const b = this.shells.update(this.time, { reducedFlash: this.reduced.flash });
    return a || b;
  }

  reproject(dx, dz) {
    this.sparks.reproject(dx, dz);
    this.shells.reproject(dx, dz);
    for (const echo of this.echoes.values()) { echo.x += dx; echo.z += dz; }
    for (const w of this.wells.values()) { w.x += dx; w.z += dz; }
    if (this.pin) { this.pin.x += dx; this.pin.z += dz; }
  }

  inspect() {
    return { time: this.time, ...this.stats, sparkSlots: this.sparks.highWater, shellSlots: this.shells.highWater, echoes: this.echoes.size };
  }

  dispose() {
    this.sparks.dispose();
    this.shells.dispose();
    this.echoes.clear();
    this.wells.clear();
  }
}

/** Precompile specimen: the kit's two programs, so the first Shove does not compile mid-fight. */
export function createPowerFxPrecompileGroup() {
  const group = new THREE.Group();
  group.name = 'SF_Precompile_VfxKit';
  const fx = new PowerFx(group, {});
  fx.time = 0.05;
  fx.shove(0, 0, 60, 'precompile', null);
  fx.sparks.update(0.05);
  fx.shells.update(0.05);
  fx.sparks.mesh.visible = true;
  fx.shells.mesh.visible = true;
  return group;
}
