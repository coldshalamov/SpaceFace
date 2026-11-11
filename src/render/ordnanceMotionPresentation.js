// SpaceFace — Deployed-ordnance and small-body motion presentation.
//
// The micro-motion branch used to leave every small manufactured body dead-level: drift bombs,
// proximity mines, vector mines, sticky impulse charges, jettisoned cargo payloads, and beacons
// all flew/floated with zero body language. Each of these is a thing someone built for a job, and
// each job has a motion signature:
//
//   bomb      A thrown trap coasting on analytic drift. Slow end-over-end tumble (the sim owns the
//             yaw spin via data.spinRadS — this layer adds the off-axis wobble a real thrown body
//             picks up), accelerating fuze strobe through the warning phase, burndown shrink.
//   mine      An anchored ambush. Near-zero tumble (it is station-keeping, and the sensor vanes
//             already orbit in updateRuntimeState), slow armed heartbeat once live, proximity
//             tremor + quickened heartbeat as the player closes inside the trigger envelope.
//   vectormine A light impulse emitter. Gentle tumble, armed shimmer; the gravity-well variant
//             visibly inhales on a slow cycle — the pull made readable before it is felt.
//   charge    A thrown plate. Fast end-over-end tumble in flight (it was lobbed, not placed);
//             on stick it goes rigid instantly — bolted mass does not tumble — and hums.
//   payload   A jettisoned cargo pod. Eject pop with a deterministic tumble kick, slow heavy
//             tumble, burndown shrink instead of a pop-out.
//   beacon    A moored buoy. No tumble; it rocks on its mooring. Claim beacons (working buoys
//             with a lure job) rock livelier and lean toward a close player; lane beacons keep a
//             slow stately sway. An expireAt stamp drives a last-hours warning quicken.
//
// POSE CONTRACT: the snapshot fence owns mesh.position and mesh.rotation.y every posed frame and
// never touches rotation.x/z or scale. This tracker therefore writes ONLY root rotation.x/z
// (absolute assignment, never +=) and root scale (multiplicatively off a lazily captured base).
// Shared materials are never touched — strobes ride scale pings, not emissive. Render-only,
// determinism-safe, zero per-frame allocation.

import { isLanternWardHardwareEntity } from '../data/lanternWardHardware.js';
import { presentedAdvanceRatio } from './presentedClock.js';
import { resolveMaydayLamp, maydayViewportBurn } from './survivorPodVisual.js';

function hashId(id) {
  const s = String(id == null ? '' : id);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

// Per-kind body language. tumble is the base off-axis rate (rad/s) before size scaling;
// sizeRef is the radius at which the base rate reads correctly; unfoldS is the deploy-settle
// window; strobeHz is the armed heartbeat (0 = no heartbeat).
const ORDNANCE_KIND_CONFIG = Object.freeze({
  bomb: Object.freeze({ tumble: 0.28, sizeRef: 1.4, unfoldS: 0.40, strobeHz: 0 }),
  mine: Object.freeze({ tumble: 0.02, sizeRef: 6.0, unfoldS: 0.50, strobeHz: 0.9 }),
  vectormine: Object.freeze({ tumble: 0.12, sizeRef: 1.6, unfoldS: 0.45, strobeHz: 1.2 }),
  charge: Object.freeze({ tumble: 1.15, sizeRef: 1.2, unfoldS: 0.25, strobeHz: 0 }),
  payload: Object.freeze({ tumble: 0.45, sizeRef: 3.0, unfoldS: 0.35, strobeHz: 0 }),
  beacon: Object.freeze({ tumble: 0.0, sizeRef: 5.0, unfoldS: 0.60, strobeHz: 0 }),
});

export function resolveOrdnanceKindConfig(kind) {
  return ORDNANCE_KIND_CONFIG[String(kind || '')] || null;
}

/**
 * Size-scaled tumble factor. Same throw, heavier body: a pod three times the reference radius
 * turns at roughly a third the rate (angular momentum, clamped so extremes stay readable).
 * NaN- and sign-safe; unknown radius reads at reference rate.
 */
export function resolveSizeTumbleFactor(radius, sizeRef) {
  const r = Number(radius);
  const ref = Number(sizeRef);
  if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(ref) || ref <= 0) return 1;
  return clamp(ref / r, 0.3, 2.2);
}

/**
 * Deploy-unfold scale envelope: 0.55 -> 1 with one overshoot breath over unfoldS seconds.
 * Returns 1 outside the window (age < 0 or age >= unfoldS) so idle bodies cost one compare.
 */
export function resolveDeployUnfold(ageS, unfoldS) {
  const age = Number(ageS);
  const span = Number(unfoldS);
  if (!Number.isFinite(age) || !Number.isFinite(span) || span <= 0 || age < 0 || age >= span) return 1;
  const k = age / span;
  const e = 1 - Math.pow(1 - k, 3);
  return (0.55 + 0.45 * e) * (1 + Math.sin(k * Math.PI) * 0.05);
}

/**
 * Warning strobe cadence (Hz) counting down to detonation. 2 Hz outside three seconds, ramping
 * to 9 Hz at zero — the same accelerating-blackbody grammar as the torpedo arming pulse, so all
 * live ordnance speaks one urgency language. reducedFlash callers use the steady ramp instead.
 */
export function resolveWarningStrobeHz(timeLeftS) {
  const t = Number(timeLeftS);
  if (!Number.isFinite(t)) return 2;
  return 2 + 7 * clamp01(1 - t / 3);
}

/**
 * Strobe pulse shape for a cycle phase in [0, 1). 'warning' is a sharp crack (pow 5); 'heart' is
 * a soft double-thump — mines stay informative for hours without strobing the room.
 */
export function resolveStrobePulse(phase01, shape) {
  const p = Number(phase01);
  if (!Number.isFinite(p)) return 0;
  const c = p - Math.floor(p);
  if (shape === 'heart') {
    const beat = Math.sin(c * Math.PI * 2);
    return beat > 0 ? beat * beat * (0.7 + 0.3 * Math.sin(c * Math.PI * 4)) : 0;
  }
  const s = Math.sin(c * Math.PI * 2);
  return s > 0 ? Math.pow(s, 5) : 0;
}

/**
 * Burndown shrink: a round with < 0.35 s of life shrinks away instead of blinking out.
 * Mirrors the projectile fizzle so all expiring ordnance retires the same way.
 */
export function resolveBurndownShrink(ttlS) {
  const ttl = Number(ttlS);
  if (!Number.isFinite(ttl)) return 1;
  if (ttl >= 0.35) return 1;
  return Math.max(0.05, ttl / 0.35);
}

/**
 * Proximity tremor amplitude (radians of root rock) for a 0..1 closeness factor. Quadratic: calm
 * at the envelope edge, unmistakable at the trigger line.
 */
export function resolveProximityTremor(proximity01, maxAmpRad) {
  const p = clamp01(proximity01);
  const m = Number(maxAmpRad);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return p * p * m;
}

/**
 * Beacon mooring sway (radians). Lane buoys breathe slow and shallow; working claim buoys rock
 * livelier; a buoy inside its warning window rocks twice as hard and half again as fast — the
 * mooring telling you the lease is nearly up. Pure function of (simTime, phase).
 */
export function resolveBeaconSway(simTime, phase, claim, warn, out = null) {
  const rec = out || { x: 0, z: 0 };
  const t = Number.isFinite(simTime) ? simTime : 0;
  const ph = Number.isFinite(phase) ? phase : 0;
  const amp = (claim ? 0.05 : 0.03) * (warn ? 2 : 1);
  const hz = (claim ? 0.7 : 0.5) * (warn ? 1.5 : 1);
  rec.x = Math.sin(t * hz * Math.PI * 2 * 0.5 + ph) * amp;
  rec.z = Math.cos(t * hz * Math.PI * 2 * 0.37 + ph * 1.7) * amp * 0.8;
  return rec;
}

const BURNOUT_S = 0.35;
const STUCK_SETTLE_S = 0.18;   // a bolted plate stops tumbling within ~5 frames, not instantly
const CLAIM_LEAN_RANGE_WU = 220;
const CLAIM_LEAN_MAX_RAD = 0.06;
const BEACON_WARN_S = 8;       // expireAt inside this window reads as "lease nearly up"

// inf-jettison-claim — the pod YOU jettisoned reads as yours-just-lost, then goes public.
//
// The sim's story is already honest: a deliberate dump spawns the pod aft at eject speed,
// stamps it yours (`data.playerJettisonOrigin` — set only when the owner IS this player) and
// embargoes the re-pickup for a brief window (`data.pickupEmbargoUntil`), so you cannot
// re-scoop what you just dropped. The picture contradicted both: the pod joined anonymous
// drift the same frame — a dark canister whose only light is a static shared transponder
// material, indistinguishable from any other drifting payload. A moment later you cannot
// even tell your own dropped lot from the field.
//
// The claim read rides the pod's own transponder voice (visualFactory hands a per-pod
// CLONE via userData.jettisonClaimLamp — the shared-material contract is untouched, the
// mayday-lamp grammar): a hot parting beat as it leaves your hold, easing to a steady claim
// burn (the pod resting, still yours) for the embargo window, then relaxing to the
// anonymous read exactly when the sim makes it public. Nothing strobes; reducedFlash drops
// the spike and keeps the steady claim. Anonymous payloads never get a clone — zero cost.

/** The steady claim burn above the transponder's authored base, while the window is live. */
export const JETTISON_CLAIM_STEADY_GAIN = 0.55;
/** The parting beat's peak above the steady burn, decaying as the pod clears your hold. */
export const JETTISON_CLAIM_SPIKE_GAIN = 1.6;
/** The parting beat's decay rate (per second) — roughly a one-second tail. */
export const JETTISON_CLAIM_SPIKE_DECAY = 2.2;

/**
 * The claim lamp's emissiveIntensity for a player-jettisoned pod, or null once the embargo
 * has lapsed (the caller writes the base back and retires the lamp). Pure function of
 * (simTime, spawnAgeS, until, reducedFlash, base) — test-seam, no allocation. A pod whose
 * spawn moment the tracker never saw (restored save, cold pose) reads the steady claim
 * without the spike rather than inventing a birth.
 */
export function resolveJettisonClaimBurn(simTime, spawnAgeS, until, reducedFlash, base) {
  const b = Number.isFinite(base) ? base : 0.8;
  const u = Number.isFinite(until) ? until : NaN;
  if (!Number.isFinite(u) || (Number.isFinite(simTime) && simTime >= u)) return null;
  const age = Number.isFinite(spawnAgeS) && spawnAgeS >= 0 ? spawnAgeS : Infinity;
  const spike = (reducedFlash || !Number.isFinite(age))
    ? 0
    : Math.exp(-age * JETTISON_CLAIM_SPIKE_DECAY) * JETTISON_CLAIM_SPIKE_GAIN;
  return b + JETTISON_CLAIM_STEADY_GAIN + spike;
}

export function createOrdnanceMotionTracker() {
  const states = new Map();
  // Track our writes on the actual render object: a pooled mesh can change IDs,
  // and a new mesh with an old ID must not inherit the former body's scale.
  const meshMotion = new WeakMap();
  let busSubscribers = [];
  let lastSimTime = 0;
  const swayScratch = { x: 0, z: 0 };

  function getState(id, kind) {
    let rec = states.get(id);
    if (!rec) {
      const h = hashId(id);
      const phase = ((h & 0xff) / 255) * Math.PI * 2;
      const cfg = resolveOrdnanceKindConfig(kind) || ORDNANCE_KIND_CONFIG.payload;
      const dirX = (h & 0x100) ? 1 : -1;
      const dirZ = (h & 0x200) ? 1 : -1;
      // Deterministic per-body rate variety: 0.7x..1.3x around the kind base.
      const variety = 0.7 + (((h >> 16) & 0xff) / 255) * 0.6;
      rec = {
        kind: String(kind || 'payload'),
        phase,
        tumbleRateX: dirX * cfg.tumble * variety,
        tumbleRateZ: dirZ * cfg.tumble * (0.6 + variety * 0.4),
        tumbleX: phase * 0.3,
        tumbleZ: phase * 0.2,
        materializeT0: -1,
        stuckT0: -1,
        armPopT0: -1,
        tumbleKickX: 0,
        tumbleKickZ: 0,
        baseScaleX: 0,   // 0 = uncaptured
        baseScaleY: 0,
        baseScaleZ: 0,
        scaleDirty: false,
      };
      states.set(id, rec);
    }
    return rec;
  }

  // Fresh spawn: unfold ramp + a deterministic tumble kick so thrown bodies arrive spinning.
  function onSpawned(payload) {
    const entity = payload && payload.entity;
    const id = payload && payload.id != null ? payload.id : (entity && entity.id);
    if (id == null) return;
    const type = (payload && payload.type) || (entity && entity.type);
    if (!resolveOrdnanceKindConfig(type)) return;
    const rec = getState(id, type);
    rec.materializeT0 = lastSimTime;
    const h = hashId(String(type) + ':' + String(id));
    const kick = type === 'charge' ? 1.6 : type === 'bomb' ? 0.8 : 0.45;
    rec.tumbleKickX += Math.cos(((h & 0xffff) / 0xffff) * Math.PI * 2) * kick;
    rec.tumbleKickZ += Math.sin((((h >> 8) & 0xffff) / 0xffff) * Math.PI * 2) * kick;
  }

  function onMineArmed(payload) {
    const id = payload && payload.mineId;
    if (id == null) return;
    const rec = states.get(id);
    if (rec) rec.armPopT0 = lastSimTime;
  }

  function onBombDropped(payload) {
    const id = payload && payload.bombId;
    if (id == null) return;
    const rec = getState(id, 'bomb');
    rec.materializeT0 = lastSimTime;
    // The drop imparts real velocity; the wobble kick scales with it so a fast toss visibly
    // wobbles harder than a gentle lay. Direction stays deterministic per bomb id.
    const vel = payload.vel || {};
    const speed = Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0);
    const h = hashId('bombdrop:' + String(id));
    const kick = 0.4 + Math.min(1.2, speed / 90);
    rec.tumbleKickX += Math.cos(((h & 0xffff) / 0xffff) * Math.PI * 2) * kick;
    rec.tumbleKickZ += Math.sin((((h >> 8) & 0xffff) / 0xffff) * Math.PI * 2) * kick;
  }

  function onChargeThrown(payload) {
    const id = payload && payload.chargeId;
    if (id == null) return;
    const rec = getState(id, 'charge');
    rec.materializeT0 = lastSimTime;
    // A lobbed plate leaves the hand spinning end-over-end — the fastest tumble in the family.
    rec.tumbleKickX += 2.2;
    rec.tumbleKickZ += 1.1;
  }

  function onChargeStuck(payload) {
    const id = payload && payload.chargeId;
    if (id == null) return;
    const rec = getState(id, 'charge');
    rec.stuckT0 = lastSimTime;
    rec.armPopT0 = lastSimTime; // adhesion clamp seats with the same pop grammar as arming
  }

  function bindEvents(bus) {
    if (!bus || typeof bus.on !== 'function') return;
    busSubscribers.push(bus.on('entity:spawned', onSpawned, { presentation: true }));
    busSubscribers.push(bus.on('mines:armed', onMineArmed));
    busSubscribers.push(bus.on('bombs:dropped', onBombDropped));
    busSubscribers.push(bus.on('charge:thrown', onChargeThrown));
    busSubscribers.push(bus.on('charge:stuck', onChargeStuck));
  }

  function unbindEvents() {
    for (const unsub of busSubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    busSubscribers = [];
    states.clear();
  }

  function updateOrdnanceMotion(entity, mesh, simTime, frameDt, playerEntity = null, a11y = {}) {
    if (!entity || !mesh) return;
    const kind = String(entity.type || '');
    const cfg = resolveOrdnanceKindConfig(kind);
    if (!cfg) return;
    lastSimTime = simTime;
    if (isLanternWardHardwareEntity(entity)) {
      // These finite workpieces use the native planar pose, including while
      // towed. Cosmetic tumble/unfold would move their visible sockets away
      // from the real clamp and turn fixed seats edge-on after their own update.
      const previous = meshMotion.get(mesh);
      let changed = false;
      if (mesh.rotation && (mesh.rotation.x !== 0 || mesh.rotation.z !== 0)) {
        mesh.rotation.x = 0; mesh.rotation.z = 0; changed = true;
      }
      if (previous?.scaleDirty && mesh.scale) {
        mesh.scale.x = previous.scaleX;
        mesh.scale.y = previous.scaleY;
        mesh.scale.z = previous.scaleZ;
        changed = true;
      }
      if (previous && states.get(previous.id) === previous.record) states.delete(previous.id);
      states.delete(entity.id);
      meshMotion.delete(mesh);
      if (changed && mesh.matrixAutoUpdate === false && typeof mesh.updateMatrix === 'function') mesh.updateMatrix();
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const ratio = presentedAdvanceRatio(typeof performance !== 'undefined' ? performance.now() : NaN);
    const animDt = dt * ratio;
    const rec = getState(entity.id, kind);
    rec.animTime = rec.animTime == null ? (Number.isFinite(simTime) ? simTime : 0) : (rec.animTime + animDt);
    let presented = meshMotion.get(mesh);
    if (!presented) {
      presented = { id: entity.id, record: rec, scaleDirty: false, scaleX: 0, scaleY: 0, scaleZ: 0 };
      meshMotion.set(mesh, presented);
    } else {
      presented.id = entity.id; presented.record = rec;
    }
    const reducedMotion = a11y && (a11y.reducedMotion === true || a11y.motionReduce === true);
    const reducedFlash = a11y && (a11y.reducedFlash === true || a11y.flashReduce === true);
    const data = entity.data || {};
    const radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : cfg.sizeRef;

    // --- Tumble: size-scaled, kind-based. Stuck charges freeze (bolted mass doesn't tumble).
    const stuck = kind === 'charge' && data.hostId != null;
    let stuckBlend = 1;
    if (stuck && rec.stuckT0 >= 0) {
      stuckBlend = 1 - clamp01((simTime - rec.stuckT0) / STUCK_SETTLE_S);
      if (stuckBlend <= 0) {
        rec.tumbleKickX = 0;
        rec.tumbleKickZ = 0;
      }
    } else if (stuck) {
      stuckBlend = 0;
      rec.tumbleKickX = 0;
      rec.tumbleKickZ = 0;
    }
    const sizeFactor = resolveSizeTumbleFactor(radius, cfg.sizeRef);
    if (!reducedMotion && kind !== 'beacon') {
      const rate = stuckBlend * sizeFactor;
      rec.tumbleX += (rec.tumbleRateX * rate + rec.tumbleKickX * rate) * animDt;
      rec.tumbleZ += (rec.tumbleRateZ * rate + rec.tumbleKickZ * rate) * animDt;
      // Thrown kicks decay into the base tumble over ~2 s — the arrival spin settles to cruise.
      const decay = Math.exp(-1.6 * animDt);
      rec.tumbleKickX *= decay;
      rec.tumbleKickZ *= decay;
    }

    // --- Sway / tremor overlays (absolute, added to the tumble pose).
    let swayX = 0;
    let swayZ = 0;
    const claimBeacon = kind === 'beacon' && data.storyPropKind === 'claim_beacon';
    const expireAt = Number(data.expireAt);
    const warn = kind === 'beacon' && Number.isFinite(expireAt) && expireAt - simTime < BEACON_WARN_S;
    if (!reducedMotion && kind === 'beacon') {
      resolveBeaconSway(rec.animTime, rec.phase, claimBeacon, warn, swayScratch);
      swayX = swayScratch.x;
      swayZ = swayScratch.z;
      // A working buoy leans toward a close player — the mooring straining at the visitor.
      if (claimBeacon && playerEntity && playerEntity.pos && entity.pos) {
        const dx = playerEntity.pos.x - entity.pos.x;
        const dz = playerEntity.pos.z - entity.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1 && dist < CLAIM_LEAN_RANGE_WU) {
          const lean = (1 - dist / CLAIM_LEAN_RANGE_WU) * CLAIM_LEAN_MAX_RAD;
          swayX += (dz / dist) * lean;
          swayZ += (-dx / dist) * lean;
        }
      }
    }

    // --- Proximity tremor: an armed mine feels the player enter its envelope.
    let tremorX = 0;
    let tremorZ = 0;
    if (!reducedMotion && kind === 'mine' && data.armed === true
        && playerEntity && playerEntity.pos && entity.pos) {
      const trigger = Number.isFinite(data.triggerRadius) && data.triggerRadius > 0
        ? data.triggerRadius : 60;
      const dx = playerEntity.pos.x - entity.pos.x;
      const dz = playerEntity.pos.z - entity.pos.z;
      const dist = Math.hypot(dx, dz);
      const consider = trigger * 2;
      if (dist < consider) {
        const amp = resolveProximityTremor(1 - dist / consider, 0.022);
        tremorX = Math.sin(simTime * 47 + rec.phase) * amp;
        tremorZ = Math.cos(simTime * 53 + rec.phase * 1.3) * amp;
      }
    }
    // Bomb warning shudder: the fuze train vibrating as the countdown runs out.
    const bombPhase = kind === 'bomb' ? String(data.phase || 'drift') : '';
    const detonateAt = Number(data.detonateAt);
    const bombTimeLeft = Number.isFinite(detonateAt) ? detonateAt - simTime : Infinity;
    if (!reducedMotion && kind === 'bomb' && bombPhase === 'warning') {
      const urgency = clamp01(1 - bombTimeLeft / 3);
      const amp = 0.004 + urgency * 0.02;
      tremorX += Math.sin(simTime * 61 + rec.phase) * amp;
      tremorZ += Math.cos(simTime * 55 + rec.phase) * amp;
    }
    // Stuck-charge hum: bolted mass shivers at the arming frequency (motion, not flash).
    if (!reducedMotion && stuck && data.armed === true) {
      tremorX += Math.sin(simTime * 57 + rec.phase) * 0.004;
      tremorZ += Math.cos(simTime * 63 + rec.phase) * 0.004;
    }

    if (mesh.rotation) {
      mesh.rotation.x = rec.tumbleX + swayX + tremorX;
      mesh.rotation.z = rec.tumbleZ + swayZ + tremorZ;
    }

    // --- Scale: unfold x arm-pop x heartbeat/strobe x gravity-well breathe x burndown.
    let scaleMul = 1;
    if (rec.materializeT0 >= 0) {
      const unfold = resolveDeployUnfold(simTime - rec.materializeT0, cfg.unfoldS);
      if (unfold === 1 && simTime - rec.materializeT0 >= cfg.unfoldS) rec.materializeT0 = -1;
      else scaleMul *= unfold;
    }
    if (rec.armPopT0 >= 0) {
      const age = simTime - rec.armPopT0;
      if (age >= 0.5) rec.armPopT0 = -1;
      else if (!reducedMotion) scaleMul *= 1 + 0.10 * Math.exp(-age * 8);
    }
    // Armed heartbeats: mines tick over slow and soft; vector mines shimmer faster; a mine with
    // the player inside its envelope beats faster — the same quickening as the tremor.
    const armed = data.armed === true;
    if (armed && cfg.strobeHz > 0) {
      let hz = cfg.strobeHz;
      if (kind === 'mine' && playerEntity && playerEntity.pos && entity.pos) {
        const trigger = Number.isFinite(data.triggerRadius) && data.triggerRadius > 0
          ? data.triggerRadius : 60;
        const dist = Math.hypot(playerEntity.pos.x - entity.pos.x, playerEntity.pos.z - entity.pos.z);
        if (dist < trigger * 2) hz *= 1 + (1 - dist / (trigger * 2)) * 1.5;
      }
      if (reducedFlash) {
        scaleMul *= 1.012; // steady warm read — state stays legible without the blink
      } else {
        scaleMul *= 1 + resolveStrobePulse(simTime * hz + rec.phase / (Math.PI * 2), 'heart') * 0.022;
      }
    }
    // Bomb warning crack: sharp scale ticks accelerating into the detonation.
    if (kind === 'bomb' && bombPhase === 'warning') {
      if (reducedFlash) {
        scaleMul *= 1 + 0.012 + 0.012 * clamp01(1 - bombTimeLeft / 3);
      } else {
        const hz = resolveWarningStrobeHz(bombTimeLeft);
        scaleMul *= 1 + resolveStrobePulse(simTime * hz, 'warning') * 0.035;
      }
    }
    // Gravity-well inhale: the emitter visibly gathers before each pull cycle.
    if (kind === 'vectormine' && String(data.kind || '') === 'gravity_well' && !reducedMotion) {
      const dieAt = Number(data.dieAt);
      const rush = Number.isFinite(dieAt) ? clamp01(1 - (dieAt - simTime) / 4) : 0;
      scaleMul *= 1 - (0.5 + 0.5 * Math.sin(simTime * (5 + rush * 5) + rec.phase)) * (0.03 + rush * 0.02);
    }
    // Burndown: vectormine dieAt / entity ttl retire by shrinking, never by blinking out.
    const dieAt = Number(data.dieAt);
    let ttl = Number.isFinite(entity.ttl) ? entity.ttl : Infinity;
    if (Number.isFinite(dieAt)) ttl = Math.min(ttl, dieAt - simTime);
    if (ttl < BURNOUT_S) scaleMul *= resolveBurndownShrink(ttl);

    if (mesh.scale && mesh.userData
        && (scaleMul !== 1 || rec.scaleDirty)) {
      if (!presented.scaleDirty) {
        presented.scaleX = mesh.scale.x;
        presented.scaleY = mesh.scale.y;
        presented.scaleZ = mesh.scale.z;
      }
      if (!(rec.baseScaleX > 0)) {
        rec.baseScaleX = Number.isFinite(mesh.scale.x) ? mesh.scale.x : 1;
        rec.baseScaleY = Number.isFinite(mesh.scale.y) ? mesh.scale.y : 1;
        rec.baseScaleZ = Number.isFinite(mesh.scale.z) ? mesh.scale.z : 1;
      }
      const tx = rec.baseScaleX * scaleMul;
      const ty = rec.baseScaleY * scaleMul;
      const tz = rec.baseScaleZ * scaleMul;
      if (typeof mesh.scale.set === 'function') mesh.scale.set(tx, ty, tz);
      else if (typeof mesh.scale.setScalar === 'function') mesh.scale.setScalar(tx);
      else { mesh.scale.x = tx; mesh.scale.y = ty; mesh.scale.z = tz; }
      rec.scaleDirty = scaleMul !== 1;
      presented.scaleDirty = rec.scaleDirty;
    }

    // Mayday lamp (inf-mayday-pod): a survivor pod's distress beacon shouts its two-short-
    // one-long group here, painted onto the CLONED lamp material the factory handed over in
    // userData.survivorMaydayLamp. The shared-material contract is untouched — this material
    // is per-pod by construction, so no sibling payload ever inherits the strobe. Sim-time
    // keyed, zero allocation, and one userData compare for every ordinary payload.
    if (kind === 'payload' && mesh.userData && mesh.userData.survivorMaydayLamp) {
      const lamp = mesh.userData.survivorMaydayLamp;
      // flashReduce: steady viewport burn only — a distress beacon stays legible without
      // strobing. reducedMotion alone halves the gain; the rhythm never silences.
      const gain = reducedFlash ? 0 : (reducedMotion ? 0.5 : 1);
      const sample = resolveMaydayLamp(rec.animTime, lamp.ejectedAt, lamp.expireAt, lamp.phase, gain);
      const burn = maydayViewportBurn(sample.flash);
      if (lamp.material && lamp.material.emissiveIntensity !== burn) {
        lamp.material.emissiveIntensity = burn;
      }
    }

    // inf-jettison-claim: a pod you jettisoned holds its claim window on the transponder —
    // the parting beat easing into a steady claim burn, then the anonymous read exactly
    // when the sim makes the pod public. The lamp record retires at the lapse so settled
    // pods stop paying the compare. Survivor pods never carry this stamp.
    if (kind === 'payload' && mesh.userData && mesh.userData.jettisonClaimLamp) {
      const lamp = mesh.userData.jettisonClaimLamp;
      const spawnAge = rec.materializeT0 >= 0 ? simTime - rec.materializeT0 : -1;
      const burn = resolveJettisonClaimBurn(simTime, spawnAge, lamp.until, reducedFlash, lamp.base);
      const target = burn == null ? lamp.base : burn;
      if (lamp.material && lamp.material.emissiveIntensity !== target) {
        lamp.material.emissiveIntensity = target;
      }
      if (burn == null) delete mesh.userData.jettisonClaimLamp;
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of states.keys()) {
      if (!activeEntityIds.has(id)) states.delete(id);
    }
  }

  return {
    bindEvents,
    unbindEvents,
    updateOrdnanceMotion,
    prune,
  };
}

export const globalOrdnanceMotion = createOrdnanceMotionTracker();
