// SpaceFace — Ship micro-motion, mechanical articulation, and physical reaction presentation system.
//
// Solves visual stiffness across combat, flight, and environmental interactions:
//   1. Weapon Fire Mechanical Recoil: Hull kicks backward along local -X on firing, scaled by
//      weapon weight class, with snappy critically damped spring recovery.
//   2. Weapon Barrel Recoil Stroke: Individual weapon barrels visibly stroke backward on the ship
//      mesh when their hardpoint discharges and spring return forward.
//   3. Dynamic Turret Target Tracking: Articulated weapon heads smoothly traverse toward active
//      targets with realistic mechanical angular velocity, falling back to alert idle sweeps.
//   4. Weapon Cooling Fins Blackbody Glow: Radiator fins transition from black to cherry-red,
//      fiery orange, and incandescent white heat as weapons fire, cooling with convective dissipation.
//   5. Forced Heat Venting: Overheating ships enter rapid thermal dump with lateral steam jets.
//   6. Mining Drill Rotation: Auger bit spins rapidly when mining laser / extractor is active.
//   7. Combat Damage & Collision Flinch: When struck by projectiles or collision, the hull receives an
//      angular and positional jolt away from the impact vector, plus decaying strike shudder.
//      The shot direction is the damage receipt's approach/normal — a hit from port dents port.
//   8. Environmental Hazard Buffet: Violent atmospheric/ion turbulence injects roll/pitch jitter.
//   9. Jump Drive Spool-Up Vibration: High-frequency reactor tremor ramps with jump charge progress,
//      releasing with a dramatic warp-out forward snap and deceleration dive.
//  10. Docking Clamp Contact Clonk: Magnetic berth connection delivers a crisp mechanical contact shudder.
//  11. Flight Throttle Dynamics: Throttle acceleration produces nose-up squat; retro braking dives.
//  12. Turn Bank Overshoot & Harmonic Settle: Rolling out of a hard turn exhibits slight inertia rebound.
//  13. Powerplant Boost Shudder: High-frequency micro-tremor conveys engine strain at peak boost.
//  14. Zero-G Spatial Breathing: Subtle multi-axis attitude drift gives idle craft living presence.
//  15. RCS Attitude Justification: Signed actuator demand resolves to Newton-correct corner-nozzle
//      firings (translation pairs, yaw diagonal couples, retro twins); the hull kicks with the push
//      and VFX renders razor-sharp white cold-gas puffs at the live nozzles.
//  16. Engine Bell Gimbal: Exhaust bells/swirl sockets steer a few degrees toward the commanded
//      thrust vector with critically damped lag, so the drive visibly aims the ship.
//  17. Boost Ignition Pop: The boost rising edge punches the hull, snaps the gimbal, and flares the
//      plume for a beat — a punchy afterburner light-off for player and NPC alike.
//  18. Death Spiral: A witnessed ship kill leaves a tumbling hulk — runaway RCS, secondary armor-seam
//      pops, then a core detonation flash — before the wreck settles to dead drift.
//  19. Materialize-on-Spawn: Ships and drones arrive — a fast scale settle with a breath of
//      overshoot — instead of popping into existence mid-frame. Player respawn rides the same ramp.
//  20. Dock Two-Beat Clamp & Undock Push: Berth contact lands a clonk, then a second, lighter
//      clamp-lock beat; undocking pushes the hull off the cradle. (The docked/undocked events carry
//      no entity id — they are player-intent events, resolved to the player hull on the next frame.)
//  21. Cloak Phase Ripple: cloak:engaged/dropped ripples the hull scale — a shimmer that reads as
//      the field washing over the ship, which previously got only an audio cue.
//  22. Massline Swing-Dash Bank: ship:swingDash rolls the hull into the arc and stretches it along
//      the swing — the slingshot finally has a body.
//  23. Subsystem Reboot Self-Test: combat:subsystemEnabled runs a short control-check — a gimbal
//      sweep and a roll rock — the way a pilot wiggles the stick after a bus comes back.
//  24. Shield-State Breath: the hull inhales when the field re-inflates (0 → up) and exhales on
//      collapse — a slow single-beat scale swell keyed off the live shield edge.
//  25. Critical-Hull List: a ship under ~28% hull carries a seeded off-axis list, periodic strain
//      coughs, and a sputtering gimbal — a dying craft reads dying before the kill lands.
//  26. Contact Kicks (Newton's third law): jettison, beacon drops, countermeasure puffs, and scan
//      discharges nudge the throwing hull forward with mass-scaled shudder; a seating clamp plate
//      (charge:stuck) jolts the host away from the attach point with a lever-arm yaw twist.
//  27. Contact Yield: a real shove shortens the hull along the push and bulges it across that
//      axis, then one elastic rebound settles it. Lights crumple; a hauler under the same
//      momentum barely flexes. Scrapes under the floor do not twitch the silhouette.
//  28. Line Haul: while a tether is taut, both ends lean toward the line and a light hull
//      stretches along it. Letting go collapses that pose and thumps the body back.
//
// PURE RENDER-ONLY PRESENTATION: Never mutates sim state, determinism-safe, zero per-frame garbage.
// Transform edits stay on position/rotation/scale. Engine-bell cooldown clones a material onto
// that bell once and writes only the clone, so a shared hull material is never tinted.
//  29. Nozzle thermal decay: sustained burn charges the bells white-hot; releasing them cools
//      through cherry to gunmetal over two seconds.
//  30. Drift slipstream demand: cutting forward thrust while sliding or yawing publishes a
//      cold-gas ribbon request the overhead presentation draws along the slide.

import { resolveRcsFirings, resolveActuatorScale } from './rcsJets.js';
import {
  integrateBellHeat,
  resolveSlipstreamInto,
  sampleBellThermal,
} from '../presentation/flightOverheadMath.js';

function wrapAngle(a) {
  let res = (a + Math.PI) % (Math.PI * 2);
  if (res < 0) res += Math.PI * 2;
  return res - Math.PI;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Aerospace locomotion tuning (presentation judgment, not sim values) ---
const RCS_PULSE_MIN_INTENSITY = 0.22;   // below this a firing is trim, not worth a puff
const RCS_PULSE_COOLDOWN_S = 0.12;      // per-craft puff cadence while maneuvering
const RCS_PULSE_COOLDOWN_REDUCED_S = 0.22;
const RCS_OBSERVED_YAW_GAIN = 4.0;      // fallback: observed yaw accel -> pseudo-demand
const RCS_OBSERVED_LAT_GAIN = 0.55;     // fallback: observed lateral accel -> pseudo-demand
const RCS_OBSERVED_FWD_GAIN = 0.35;     // fallback: observed forward accel -> pseudo-demand
const GIMBAL_YAW_MAX = 0.13;            // ~7.5 deg bell steer, lateral/yaw demand
const GIMBAL_PITCH_MAX = 0.09;          // ~5 deg bell nod, main-drive demand
const GIMBAL_SMOOTH = 9.0;              // critically damped-ish follow rate
const BOOST_FLASH_S = 0.38;             // ignition flare window
const BOOST_IGNITION_KICK = 2.4;        // hull punch on the boost rising edge
const DEATH_SPIRAL_S = 1.5;             // full spiral before dead drift owns the wreck
const DEATH_FLASH_AT_S = 0.85;          // core detonation moment inside the spiral
const DEATH_KILL_MATCH_WU = 30;         // wreck must sit near a fresh kill to spiral
const DEATH_KILL_MATCH_S = 3.0;         // kills older than this read as cold salvage
const DEATH_SPIN_START = 7.0;           // rad/s at spiral ignition
const DEATH_SPIN_END = 1.2;             // rad/s handed to dead drift
const RECENT_KILL_SLOTS = 8;
const MAX_BELL_PIVOTS = 6;
const MAX_RCS_PIVOTS = 4;
const MOUNT_SCAN_NODE_CAP = 64;

// Materialize ramp (spawn/respawn): settle from ~55% scale with one overshoot breath.
const MATERIALIZE_S = 0.55;
const MATERIALIZE_OVERSHOOT = 0.05;
// Cloak ripple: three-field-wobble decaying envelope.
const CLOAK_WAVE_S = 0.6;
const CLOAK_WAVE_AMP = 0.045;
// Swing-dash: bank into the arc + slight stretch along the swing axis.
const SWING_DASH_S = 0.85;
const SWING_BANK_MAX = 0.10;
const SWING_STRETCH_MAX = 0.055;
// Subsystem reboot self-test window.
const REBOOT_S = 0.7;
// Shield-state breath (collapse exhale / restore inhale).
const SHIELD_BREATH_S = 0.5;
const SHIELD_BREATH_AMP = 0.045;
// Critical-hull list: slow seeded bias + periodic strain coughs under this fraction.
const CRIT_HULL_FRAC = 0.28;
const CRIT_LIST_MAX = 0.035;
const DOCK_CLAMP_SECOND_S = 0.22;   // clamp-lock beat after berth contact

const RECOIL_DEFS = Object.freeze({
  light:     { kickX: 0.12, pitchRise: 0.015, heatCost: 0.08 },
  medium:    { kickX: 0.24, pitchRise: 0.030, heatCost: 0.15 },
  heavy:     { kickX: 0.48, pitchRise: 0.055, heatCost: 0.28 },
  explosive: { kickX: 0.40, pitchRise: 0.045, heatCost: 0.22 },
  beam:      { kickX: 0.06, pitchRise: 0.008, heatCost: 0.18 },
});

function resolveRecoilClass(weaponId) {
  const id = String(weaponId || '').toLowerCase();
  if (id.includes('torpedo') || id.includes('missile') || id.includes('bomb') || id.includes('rocket')) {
    return RECOIL_DEFS.explosive;
  }
  if (id.includes('rail') || id.includes('heavy') || id.includes('cannon') || id.includes('mass') || id.includes('slug')) {
    return RECOIL_DEFS.heavy;
  }
  if (id.includes('beam') || id.includes('laser') || id.includes('mining') || id.includes('cutter')) {
    return RECOIL_DEFS.beam;
  }
  if (id.includes('autocannon') || id.includes('plasma') || id.includes('blaster')) {
    return RECOIL_DEFS.medium;
  }
  return RECOIL_DEFS.light;
}

// --- Contact kicks: Newton's third law for ship-initiated world interactions -----------------
// Every throw has a thrower. Ejecting a pod aft, dropping a buoy, puffing chaff, discharging the
// sensor array, or catching a magnetic clamp plate all push the hull — small, directional, and
// mass-scaled (a hauler barely notices what a fighter feels). `push` is an axial recoil-velocity
// impulse (+ = forward surge, the ejecta went aft); `yaw`/`pitch` are angular tickles; `shudder`
// is the decaying strike rattle. Applied through the same recoil/flinch springs as gunfire, so
// contact kicks compose with combat instead of fighting it.
const CONTACT_KICK_DEFS = Object.freeze({
  jettison: Object.freeze({ push: 0.55, shudder: 0.14, yaw: 0, pitch: 0 }),
  beaconDrop: Object.freeze({ push: 0.32, shudder: 0.12, yaw: 0, pitch: 0 }),
  scanPulse: Object.freeze({ push: 0, shudder: 0.05, yaw: 0, pitch: 0.25 }),
  countermeasure: Object.freeze({ push: 0.18, shudder: 0.08, yaw: 0.3, pitch: 0 }),
  chargeStuck: Object.freeze({ push: 0, shudder: 0.3, yaw: 1.1, pitch: 0 }),
});

const CONTACT_KICK_REF_MASS_T = 400; // a fighter reads the full kick; heavier hulls less

/**
 * Mass-scaled contact kick for a ship-initiated interaction. Pure and frozen.
 * `amountScale` (jettison load) further scales the push, capped so a full-hold dump reads as one
 * firm shove, not a launch. Unknown kinds and masses degrade to a soft neutral tickle.
 */
export function resolveContactKick(kind, massT, amountScale = 1) {
  const def = CONTACT_KICK_DEFS[String(kind || '')] || CONTACT_KICK_DEFS.beaconDrop;
  const mass = Number(massT);
  const intensity = clamp(CONTACT_KICK_REF_MASS_T / (Number.isFinite(mass) && mass > 0 ? mass : CONTACT_KICK_REF_MASS_T), 0.2, 1.3);
  const load = clamp(Number(amountScale), 0.35, 1.6);
  return Object.freeze({
    kind: String(kind || 'unknown'),
    intensity,
    push: def.push * intensity * (kind === 'jettison' ? load : 1),
    shudder: Math.min(0.35, def.shudder * intensity * load),
    yaw: def.yaw * intensity,
    pitch: def.pitch * intensity,
  });
}

// --- Contact yield: the hull is a body, so a shove changes its shape -------------------
// A scrape (under the floor) must not twitch the silhouette — ordinary flying stays clean.
// Above it, compression is Δv past the floor, scaled by mass: the same momentum that folds a
// fighter leaves a hauler almost square. The spring is slightly underdamped so the shape
// compresses, rebounds once, and settles. Render-only; the solver's velocity is untouched.
export const CONTACT_YIELD_DV_FLOOR = 10;     // wu/s — below this the hit is a touch
export const CONTACT_YIELD_DV_FULL = 34;      // wu/s — a fighter reads a full crumple here
export const CONTACT_YIELD_MAX = 0.12;        // shorten fraction along the push
export const CONTACT_YIELD_REBOUND = 0.032;   // brief elastic stretch on the way back
export const CONTACT_YIELD_REF_MASS = 280;    // tonnes — a light hull takes the authored pose
export const CONTACT_YIELD_POISSON = 0.42;    // cross-axis bulge per unit of compression
const YIELD_SPRING_K = 82;
const YIELD_SPRING_C = 10.5;
const YIELD_VEL_KICK = 1.8;
const YIELD_VEL_LIMIT = 3.2;

export function massYieldScale(massT) {
  const mass = Number(massT);
  const m = Number.isFinite(mass) && mass > 0 ? mass : CONTACT_YIELD_REF_MASS;
  return clamp(Math.sqrt(CONTACT_YIELD_REF_MASS / m), 0.14, 1.4);
}

/** 0..1.35 crumple impulse. Zero under the scrape floor. Heavier hulls return less. */
export function contactYieldImpulse(dv, massT) {
  const v = Number(dv);
  if (!Number.isFinite(v) || v < CONTACT_YIELD_DV_FLOOR) return 0;
  const span = CONTACT_YIELD_DV_FULL - CONTACT_YIELD_DV_FLOOR;
  const u = clamp((v - CONTACT_YIELD_DV_FLOOR) / span, 0, 1.35);
  return u * massYieldScale(massT);
}

/**
 * Hull-local scale and center shift for a yield along (axisFwd, axisLat).
 * Positive amount shortens along the push and bulges across it. `out` is reused
 * by the per-ship record so the frame path does not allocate.
 */
export function hullYieldPose(amount, axisFwd, axisLat, out) {
  const c = clamp(Number(amount) || 0, -CONTACT_YIELD_REBOUND, CONTACT_YIELD_MAX);
  let fx = Number(axisFwd) || 0;
  let fz = Number(axisLat) || 0;
  const len = Math.hypot(fx, fz);
  if (len < 1e-5) { fx = 1; fz = 0; }
  else { fx /= len; fz /= len; }
  const ux2 = fx * fx;
  const uz2 = fz * fz;
  const x = 1 - c * ux2 + c * CONTACT_YIELD_POISSON * uz2;
  const y = 1 + c * CONTACT_YIELD_POISSON * 0.7;
  const z = 1 - c * uz2 + c * CONTACT_YIELD_POISSON * ux2;
  const shiftX = fx * c * 0.9;
  const shiftZ = fz * c * 0.9;
  if (out) {
    out.x = x; out.y = y; out.z = z; out.shiftX = shiftX; out.shiftZ = shiftZ;
    return out;
  }
  return { x, y, z, shiftX, shiftZ };
}

function noteContactYield(rec, pushFwd, pushLat, dv, mass) {
  if (!rec) return;
  const impulse = contactYieldImpulse(dv, mass);
  if (!(impulse > 0)) return;
  const len = Math.hypot(pushFwd, pushLat);
  if (len > 1e-4) {
    const fx = pushFwd / len;
    const fz = pushLat / len;
    const have = Math.hypot(rec.yieldFwd || 0, rec.yieldLat || 0);
    if (have < 0.2) {
      rec.yieldFwd = fx;
      rec.yieldLat = fz;
    } else {
      const blend = clamp(0.4 + impulse * 0.6, 0, 1);
      rec.yieldFwd += (fx - rec.yieldFwd) * blend;
      rec.yieldLat += (fz - rec.yieldLat) * blend;
    }
  }
  rec.yieldVel = clamp((rec.yieldVel || 0) + impulse * YIELD_VEL_KICK, -1.8, YIELD_VEL_LIMIT);
}

function stepYieldSpring(rec, dt) {
  rec.yieldVel += (-YIELD_SPRING_K * rec.yieldAmt - YIELD_SPRING_C * rec.yieldVel) * dt;
  const next = rec.yieldAmt + rec.yieldVel * dt;
  if (next > CONTACT_YIELD_MAX) {
    rec.yieldAmt = CONTACT_YIELD_MAX;
    if (rec.yieldVel > 0) rec.yieldVel *= 0.35;
  } else if (next < -CONTACT_YIELD_REBOUND) {
    rec.yieldAmt = -CONTACT_YIELD_REBOUND;
    if (rec.yieldVel < 0) rec.yieldVel *= 0.35;
  } else {
    rec.yieldAmt = next;
  }
}

// --- Line haul: a taut tether is a force you can see in both hulls ---------------------
export const LINE_HAUL_STRETCH = 0.14;  // light-hull elongate at full strain
export const LINE_HAUL_BANK = 0.11;     // rad, lean into a line off the bow
export const LINE_HAUL_YAW = 0.055;     // rad, nose yaws toward the line
const LINE_HAUL_FOLLOW = 6.5;
const LINE_RELEASE_FOLLOW = 14;
const TAUT_LINE_PHASES = new Set(['capture', 'loaded', 'overload']);

/**
 * Scale / shift / bank / yaw for a hull being hauled along a ship-local pull.
 * `stretch` is the mass-scaled 0..1 elongate. `lean` is the shared 0..1 pose so a
 * heavy hull still noses toward the line when it barely stretches.
 */
export function lineHaulPose(stretch, lean, pullFwd, pullLat, out) {
  const s = clamp(Number(stretch) || 0, 0, 1) * LINE_HAUL_STRETCH;
  const leanN = clamp(Number(lean) || 0, 0, 1);
  let fx = Number(pullFwd) || 0;
  let fz = Number(pullLat) || 0;
  const len = Math.hypot(fx, fz);
  if (len < 1e-5) { fx = 1; fz = 0; }
  else { fx /= len; fz /= len; }
  const fx2 = fx * fx;
  const fz2 = fz * fz;
  const x = 1 + s * fx2 - s * 0.4 * fz2;
  const y = 1 - s * 0.25;
  const z = 1 + s * fz2 - s * 0.4 * fx2;
  const shiftX = fx * (s * 4 + leanN * 0.12);
  const shiftZ = fz * (s * 4 + leanN * 0.12);
  const bank = fz * leanN * LINE_HAUL_BANK;
  const yaw = fz * leanN * LINE_HAUL_YAW;
  if (out) {
    out.x = x; out.y = y; out.z = z;
    out.shiftX = shiftX; out.shiftZ = shiftZ;
    out.bank = bank; out.yaw = yaw;
    return out;
  }
  return { x, y, z, shiftX, shiftZ, bank, yaw };
}

export function createShipMicroMotionTracker() {
  // Pool of active micro-motion records keyed by entity ID
  const craftMotion = new Map();
  let busSubscribers = [];
  let busRef = null;
  let lastSimTime = 0;

  // Family-agnostic actuator scale for presentation intensities. Nozzle SELECTION is exact
  // (signs only); per-family authority ceilings would only rescale puff brightness.
  const defaultActuatorScale = resolveActuatorScale(null);

  // Recent witnessed kills, preallocated ring (death-spiral freshness matching).
  const recentKills = [];
  for (let i = 0; i < RECENT_KILL_SLOTS; i++) {
    recentKills.push({ x: 0, z: 0, t: -1e9, used: false });
  }
  let killCursor = 0;
  // Wreck ids that already spiraled (consume-once; cleared for recycled ids on spawn).
  const spiralDone = new Map();

  // Reused emission payloads. bus.emit is synchronous and every listener copies numbers
  // immediately, so sharing one object per event kind is safe and allocation-free.
  const rcsPulsePayload = { x: 0, z: 0, dirX: 1, dirZ: 0, intensity: 0, radius: 6, shipId: 0, runaway: false };
  const deathPopPayload = { x: 0, z: 0, radius: 6, shipId: 0, seam: 0 };
  const deathFlashPayload = { x: 0, z: 0, radius: 6, shipId: 0 };
  const spiralShakePayload = { amount: 0, position: { x: 0, z: 0 } };
  const spiralAudioPayload = { id: '' };

  function getRecord(entityId) {
    let rec = craftMotion.get(entityId);
    if (!rec) {
      rec = {
        // Recoil state (spring damped)
        recoilX: 0,
        recoilVelX: 0,
        recoilPitch: 0,
        recoilVelPitch: 0,
        recoilShudder: 0,
        lastFiredHardpoint: -1,
        lastFiredTime: 0,
        lastFiredKick: 0,

        // Impact flinch state
        flinchX: 0,
        flinchZ: 0,
        flinchRoll: 0,
        flinchPitch: 0,
        flinchShudder: 0,
        flinchVelRoll: 0,
        flinchVelPitch: 0,
        // Directional bounce: cosmetic yaw swing off the contact lever arm (render-only; the
        // solver deliberately strips player sim yaw — we replay its measured kick).
        impactYaw: 0,
        impactVelYaw: 0,
        // Contact yield spring. Amount > 0 shortens the hull along (yieldFwd, yieldLat).
        yieldAmt: 0,
        yieldVel: 0,
        yieldFwd: 1,
        yieldLat: 0,
        yieldPose: null,
        // Taut-line haul. lineStrain is the mass-scaled stretch; lineLean is the shared nose-in.
        lineStrain: 0,
        lineLean: 0,
        linePullFwd: 1,
        linePullLat: 0,
        lineLatched: false,
        lineRelease: 0,
        lineSnapStamp: -1,
        haulPose: null,
        // Last-seen kinematics so physics:impact (a sim-tick event) can place the contact lever.
        mass: 400,
        px: 0,
        pz: 0,
        rot: 0,
        radius: 12,

        // Weapon thermal & venting
        weaponHeat: 0,
        isVenting: false,
        ventDuration: 0,

        // Environmental hazard buffet
        inHazard: false,
        hazardIntensity: 0,

        // Hyperspace jump dynamics
        jumpCharging: false,
        jumpProgress: 0,

        // Flight surge & settle
        prevSpeed: null,
        accelSurge: 0,
        accelVel: 0,
        bankOvershoot: 0,
        prevBank: 0,

        // Idle breathing phase
        idlePhase: (Number(entityId) * 1.6180339887) % (Math.PI * 2),

        // Aerospace locomotion: observed-motion history for actuator fallback synthesis
        prevRot: null,
        prevBank: 0,
        prevFwdV: 0,
        prevLatV: 0,
        prevYawRate: 0,
        actFallback: null, // lazy { lateral, yaw, reverse, main } pseudo-actuators
        rcsPose: null,     // lazy { x, z, rot, radius } scratch for the RCS resolver
        rcsFirings: null,  // lazy reused out-array for resolveRcsFirings (read: station/side/role/intensity)
        rcsPulseCd: 0,
        rcsMax: 0,
        rcsLat: 0,
        rcsYaw: 0,
        rcsMain: 0,
        bellHeat: 0,
        bellCool: true,
        slipstream: null,

        // Engine bell gimbal + boost ignition
        prevBoosting: false,
        boostFlashT: 0,
        gimbalYaw: 0,
        gimbalPitch: 0,
        mountMesh: null,   // mesh identity the pivot caches below were scanned from
        bells: null,       // lazy [{ node, baseY, baseZ, baseSX, baseSY, baseSZ, isPlume }]
        bellCount: 0,
        flareApplied: 1,   // last frame's plume flare factor (unapplied before re-flaring)
        rcsNozzles: null,  // lazy [{ node, baseSX, baseSY, baseSZ }]
        rcsNozzleCount: 0,

        // Death spiral (fresh wrecks near a witnessed kill)
        spiralState: 0, // 0 off, 1 active, 2 holding frozen yaw offset
        spiralT0: 0,
        spiralY: 0,
        spiralDir: 1,
        spiralFlashDone: false,
        spiralPopCd: 0,
        spiralRcsCd: 0,
        spiralRcsSide: 1,

        // Materialize ramp + hull-scale capture (base scale restored multiplicatively)
        materializeT0: -1,
        hullScaleX: 1,
        hullScaleY: 1,
        hullScaleZ: 1,

        // Player-intent queue (dock/cloak/respawn events carry no entity id)
        pendingPlayer: null, // lazy array of kind strings

        // Timed one-shot windows (simTime stamps; -1 = idle)
        cloakWaveT0: -1,
        swingDashT0: -1,
        rebootT0: -1,
        shieldBreathT0: -1,
        shieldBreathDir: 0,   // +1 restore inhale, -1 collapse exhale
        prevShield: null,
        dockClampAt: -1,      // pending second clamp beat

        lastUpdate: 0,
      };
      craftMotion.set(entityId, rec);
    }
    return rec;
  }

  function onFire(payload) {
    if (!payload || !payload.ownerId) return;
    const rec = getRecord(payload.ownerId);
    const rClass = resolveRecoilClass(payload.weaponId);

    // Apply backward kick along local -X and slight muzzle pitch
    rec.recoilVelX -= rClass.kickX * 18.0;
    rec.recoilVelPitch += rClass.pitchRise * 12.0;
    rec.recoilShudder = Math.max(rec.recoilShudder, rClass.kickX * 0.4);

    // Accumulate weapon thermal load
    rec.weaponHeat = Math.min(1.0, (rec.weaponHeat || 0) + (rClass.heatCost || 0.12));

    // Track hardpoint-specific barrel recoil
    rec.lastFiredHardpoint = payload.hardpointIdx != null ? payload.hardpointIdx : -1;
    rec.lastFiredTime = Date.now();
    rec.lastFiredKick = rClass.kickX;
  }

  function onVent(payload) {
    if (!payload || !payload.ownerId) return;
    const rec = getRecord(payload.ownerId);
    if (payload.phase === 'start') {
      rec.weaponHeat = 1.0;
      rec.isVenting = true;
      rec.ventDuration = 2.0;
      rec.recoilShudder = Math.max(rec.recoilShudder, 0.35);
    } else if (payload.phase === 'end') {
      rec.isVenting = false;
      rec.weaponHeat = 0;
    }
  }

  function onDamage(payload) {
    if (!payload || !payload.targetId) return;
    const rec = getRecord(payload.targetId);
    const dmg = Number(payload.hullDamage) || Number(payload.applied)
      || Number(payload.amount) || Number(payload.damage) || 10;
    // approach is the shot's travel; normal is the surface. Either beats a random twitch.
    const hitNormal = payload.hitNormal || payload.approach || payload.normal || null;

    const intensity = Math.min(1.2, Math.max(0.15, dmg / 35.0));

    if (hitNormal) {
      const nx = Number(hitNormal.x) || 0;
      const nz = Number(hitNormal.z) || 0;
      rec.flinchVelRoll += nz * intensity * 3.5;
      rec.flinchVelPitch += nx * intensity * 2.8;
      rec.flinchX += nx * intensity * 0.25;
      rec.flinchZ += nz * intensity * 0.25;
    } else {
      // No contact axis on the receipt: a stable shiver from the hull's own phase,
      // not a fresh random draw, so the same hit reads the same way twice.
      const wobble = Math.sin(rec.idlePhase * 4.1);
      rec.flinchVelRoll += wobble * intensity * 2.2;
      rec.flinchVelPitch += Math.cos(rec.idlePhase * 2.7) * intensity * 1.6;
    }
    rec.flinchShudder = Math.min(0.35, rec.flinchShudder + intensity * 0.25);

    // Collisions already crumple through physics:impact. A second yield here doubles the dent.
    const originKind = payload.origin && payload.origin.kind;
    const fromContact = typeof originKind === 'string' && originKind.indexOf('collision') === 0;
    if (!fromContact && !payload.emp) {
      const rot = Number.isFinite(rec.rot) ? rec.rot : 0;
      const cf = Math.cos(rot);
      const sf = Math.sin(rot);
      const nx = hitNormal ? (Number(hitNormal.x) || 0) : 0;
      const nz = hitNormal ? (Number(hitNormal.z) || 0) : 0;
      const pushFwd = nx * cf + nz * sf;
      const pushLat = nx * -sf + nz * cf;
      let dv = Math.min(80, dmg * 0.55);
      // The field takes a shield hit; the hull only shivers.
      if (payload.shieldHit && !payload.hullHit) dv *= 0.3;
      noteContactYield(rec, pushFwd, pushLat, dv, rec.mass);
    }
  }

  function onImpact(payload) {
    if (!payload) return;
    const aId = payload.aId || (payload.entityA && payload.entityA.id);
    const bId = payload.bId || (payload.entityB && payload.entityB.id);
    // Real exchanged momentum — deltaV/dv were never on this payload, so the old flinch read a
    // constant fallback. dp is impulse·impactScale (mass·wu/s); per-hull Δv = dp/mass.
    const dp = Number(payload.dp) || Math.abs(Number(payload.impulse)) || 0;
    const nx = Number.isFinite(payload.normal && payload.normal.x) ? payload.normal.x : 0;
    const nz = Number.isFinite(payload.normal && payload.normal.z) ? payload.normal.z : 0;
    const hasContact = Number.isFinite(payload.pos && payload.pos.x) && Number.isFinite(payload.pos.z);
    const cx = hasContact ? payload.pos.x : null;
    const cz = hasContact ? payload.pos.z : null;

    // The contact normal points a→b: a is pushed along −n, b along +n.
    applyImpactFlinch(aId, -nx, -nz, dp, cx, cz);
    applyImpactFlinch(bId, nx, nz, dp, cx, cz);

    // Player cosmetic yaw: the authority measured this kick and then deliberately suppressed it
    // (the player is not ammunition). Replay it as a damped swing through the player queue —
    // impacts carry no playerId, so it resolves on the player hull's next update like dock/cloak.
    if (payload.playerInvolved && Number.isFinite(payload.solverPlayerYawRateKick)
        && Math.abs(payload.solverPlayerYawRateKick) > 0.02) {
      queuePlayerYawKick(clamp(payload.solverPlayerYawRateKick, -3.2, 3.2));
    }
  }

  // Directional bounce for one involved hull. push = the impulse direction on this entity in
  // world XZ; the contact point gives the lever arm that drives pitch/roll weighting and yaw.
  function applyImpactFlinch(id, pushX, pushZ, dp, cx, cz) {
    if (id == null) return;
    const rec = getRecord(id);
    const mass = Number.isFinite(rec.mass) && rec.mass > 0 ? rec.mass : 400;
    const dv = dp / mass;
    const intensity = clamp(dv / 28, 0.10, 1.6);   // ~28 wu/s of shove reads as a full hit

    // Ship frame: +X forward, +Z starboard (same convention as the RCS/flight math below).
    const rot = Number.isFinite(rec.rot) ? rec.rot : 0;
    const cf = Math.cos(rot);
    const sf = Math.sin(rot);
    const pushFwd = pushX * cf + pushZ * sf;
    const pushLat = pushX * -sf + pushZ * cf;

    // Lever arm from the measured contact point, normalized by hull radius.
    let leverFwd = 0;
    let leverLat = 0;
    let leverYaw = 0;
    if (cx != null) {
      const rx = cx - rec.px;
      const rz = cz - rec.pz;
      const invR = 1 / (Number.isFinite(rec.radius) && rec.radius > 0 ? rec.radius : 12);
      leverFwd = clamp((rx * cf + rz * sf) * invR, -1.4, 1.4);
      leverLat = clamp((rx * -sf + rz * cf) * invR, -1.4, 1.4);
      leverYaw = clamp((rx * pushZ - rz * pushX) * invR, -1.4, 1.4); // r × push
    }

    rec.flinchVelPitch += -pushFwd * (0.55 + Math.abs(leverFwd) * 0.9) * intensity * 3.2;
    rec.flinchVelRoll += -pushLat * (0.55 + Math.abs(leverLat) * 0.9) * intensity * 3.6;
    // NPCs get their yaw from the solver already; this swing still helps them read the impact
    // direction — it is small beside the real angular response and shares the damped spring.
    rec.impactVelYaw += leverYaw * intensity * 2.4;
    rec.flinchX += pushFwd * intensity * 0.30;
    rec.flinchZ += pushLat * intensity * 0.30;
    rec.flinchShudder = Math.min(0.4, rec.flinchShudder + intensity * 0.3);
    noteContactYield(rec, pushFwd, pushLat, dv, mass);
  }

  function onHazardEnter(payload) {
    const id = payload && (payload.targetId || payload.id || payload.entityId);
    if (!id) return;
    const rec = getRecord(id);
    rec.inHazard = true;
    rec.hazardIntensity = Number(payload.intensity) || 0.75;
  }

  function onHazardExit(payload) {
    const id = payload && (payload.targetId || payload.id || payload.entityId);
    if (!id) return;
    const rec = getRecord(id);
    rec.inHazard = false;
  }

  function onJumpChargeStart(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (!id) return;
    const rec = getRecord(id);
    rec.jumpCharging = true;
    rec.jumpProgress = 0;
  }

  function onJumpChargeTick(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (!id) return;
    const rec = getRecord(id);
    rec.jumpCharging = true;
    rec.jumpProgress = Number(payload.progress) || 0;
  }

  function onJumpStart(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (!id) return;
    const rec = getRecord(id);
    rec.jumpCharging = false;
    rec.recoilVelX -= 8.5; // explosive hyperspace release kick
    rec.flinchShudder = 0.55;
  }

  function onJumpArrive(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (!id) return;
    const rec = getRecord(id);
    rec.jumpCharging = false;
    rec.recoilVelX += 6.0; // deceleration surge
    rec.flinchShudder = 0.45;
  }

  function onJumpChargeAbort(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (!id) return;
    const rec = getRecord(id);
    rec.jumpCharging = false;
    rec.jumpProgress = 0;
  }

  // dock:docked / dock:undocked carry only { stationId } — player-intent events (balance
  // harnesses emit them for script hops too, where no hull exists). Queue and resolve to the
  // player record on its next update.
  const pendingPlayerActions = [];
  // Player-only yaw swing queue (impacts carry no playerId; resolved on the player's next update).
  const pendingPlayerYawKicks = [];
  // Last tether ends, so a let-go that carries only a target id can still thump both hulls.
  let rememberedPlayerId = null;
  let rememberedTargetId = null;

  function queuePlayerAction(kind) {
    if (pendingPlayerActions.length < 8) pendingPlayerActions.push(kind);
    else { pendingPlayerActions.shift(); pendingPlayerActions.push(kind); }
  }

  function queuePlayerYawKick(kick) {
    if (pendingPlayerYawKicks.length < 4) pendingPlayerYawKicks.push(kick);
    else { pendingPlayerYawKicks.shift(); pendingPlayerYawKicks.push(kick); }
  }

  // Jettison load scale for the next queued 'jettison' action (cargo:jettisoned carries the
  // dumped amount but no ship id, so the scale rides alongside the player queue and is consumed
  // when the action applies). Max-wins: a burst of dumps reads as one firm shove.
  let pendingJettisonLoad = 1;

  function applyPlayerAction(rec, kind, simTime) {
    if (kind === 'docked') {
      rec.recoilVelX -= 1.4; // heavy mechanical clamp rebound
      rec.flinchVelPitch += Math.sin(rec.idlePhase * 7.13) * 1.25;
      rec.flinchShudder = Math.max(rec.flinchShudder, 0.5);
      rec.dockClampAt = simTime + DOCK_CLAMP_SECOND_S;
    } else if (kind === 'undocked') {
      rec.recoilVelX -= 0.9; // cradle push-off
      rec.flinchVelRoll += Math.cos(rec.idlePhase * 5.71) * 0.9;
      rec.flinchShudder = Math.max(rec.flinchShudder, 0.3);
    } else if (kind === 'respawn') {
      rec.materializeT0 = simTime;
    } else if (kind === 'cloakOn' || kind === 'cloakOff') {
      rec.cloakWaveT0 = simTime;
    } else if (kind === 'jettison') {
      const kick = resolveContactKick('jettison', rec.mass, pendingJettisonLoad);
      pendingJettisonLoad = 1;
      rec.recoilVelX += kick.push; // pod went aft — the hull breathes forward
      rec.flinchShudder = Math.max(rec.flinchShudder, kick.shudder);
    } else if (kind === 'beaconDrop') {
      const kick = resolveContactKick('beaconDrop', rec.mass);
      rec.recoilVelX += kick.push; // buoy dropped aft — a soft mass-settle forward
      rec.flinchShudder = Math.max(rec.flinchShudder, kick.shudder);
    } else if (kind === 'scanPulse') {
      const kick = resolveContactKick('scanPulse', rec.mass);
      rec.flinchVelPitch += kick.pitch; // the array discharges — a sensor-mast rock
      rec.flinchShudder = Math.max(rec.flinchShudder, kick.shudder);
    }
  }

  function onDocked(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (id != null) {
      applyPlayerAction(getRecord(id), 'docked', lastSimTime);
      return;
    }
    queuePlayerAction('docked');
  }

  function onUndocked(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (id != null) {
      applyPlayerAction(getRecord(id), 'undocked', lastSimTime);
      return;
    }
    queuePlayerAction('undocked');
  }

  function onPlayerRespawn() { queuePlayerAction('respawn'); }
  function onCloakEngaged() { queuePlayerAction('cloakOn'); }
  function onCloakDropped() { queuePlayerAction('cloakOff'); }

  function onSwingDash(payload) {
    const shipId = payload && payload.shipId;
    if (shipId == null) return;
    getRecord(shipId).swingDashT0 = lastSimTime;
  }

  function onSubsystemEnabled(payload) {
    const targetId = payload && payload.targetId;
    if (targetId == null) return;
    getRecord(targetId).rebootT0 = lastSimTime;
  }

  // A magnetic clamp plate seats on a hull: a sharp local jolt away from the attach point plus a
  // yaw swing off the lever arm — the same directional grammar as collision flinch, at clamp
  // magnitude (fixed intensity: a seating clamp reads the same on any hull, mass only softens it).
  function onChargeStuck(payload) {
    const hostId = payload && payload.hostId;
    if (hostId == null) return;
    const rec = getRecord(hostId);
    const kick = resolveContactKick('chargeStuck', rec.mass);
    const hasPoint = payload.pos && Number.isFinite(payload.pos.x) && Number.isFinite(payload.pos.z);
    const rot = Number.isFinite(rec.rot) ? rec.rot : 0;
    const cf = Math.cos(rot);
    const sf = Math.sin(rot);
    let pushFwd = 0;
    let pushLat = 0;
    if (hasPoint) {
      const invR = 1 / (Number.isFinite(rec.radius) && rec.radius > 0 ? rec.radius : 12);
      const rx = clamp((payload.pos.x - rec.px) * invR, -1.4, 1.4);
      const rz = clamp((payload.pos.z - rec.pz) * invR, -1.4, 1.4);
      // The plate struck the attach side — the hull rocks away from it.
      pushFwd = -(rx * cf + rz * sf);
      pushLat = -(rx * -sf + rz * cf);
    }
    // Lever yaw off the attach offset: an off-center clamp visibly twists the hull.
    const yawKick = hasPoint
      ? clamp(((payload.pos.x - rec.px) * -sf + (payload.pos.z - rec.pz) * cf)
        / (Number.isFinite(rec.radius) && rec.radius > 0 ? rec.radius : 12), -1.4, 1.4)
      : 0;
    rec.flinchVelPitch += -pushFwd * 2.2 * kick.intensity;
    rec.flinchVelRoll += -pushLat * 2.4 * kick.intensity;
    rec.impactVelYaw += yawKick * kick.yaw;
    rec.flinchX += pushFwd * 0.22 * kick.intensity;
    rec.flinchZ += pushLat * 0.22 * kick.intensity;
    rec.flinchShudder = Math.max(rec.flinchShudder, kick.shudder);
  }

  // Cargo pods leave aft at 60 wu/s — player inventory only, so this resolves via the queue.
  function onJettison(payload) {
    const amount = Number(payload && payload.amount);
    if (Number.isFinite(amount) && amount > 0) {
      pendingJettisonLoad = Math.max(pendingJettisonLoad, clamp(0.35 + amount / 60, 0.35, 1.6));
    }
    queuePlayerAction('jettison');
  }

  // Countermeasure puff: chaff/decoy blooms aft, the hull breathes forward with a whisper of yaw.
  function onCountermeasure(payload) {
    const shipId = payload && payload.shipId;
    if (shipId == null) return;
    const rec = getRecord(shipId);
    const kick = resolveContactKick('countermeasure', rec.mass);
    rec.recoilVelX += kick.push;
    // Deterministic whisper direction from the hull's idle phase — no per-event RNG.
    rec.impactVelYaw += Math.sin(rec.idlePhase * 3.7) * kick.yaw;
    rec.flinchShudder = Math.max(rec.flinchShudder, kick.shudder);
  }

  function onBeaconDeployed() { queuePlayerAction('beaconDrop'); }

  function onScanPulse() { queuePlayerAction('scanPulse'); }

  // The line let go. Collapse the haul on both ends and thump the body along the old pull.
  // released and broke are mutually exclusive per cut, but a stamp guards a double emit.
  function onTetherLetGo(payload) {
    const targetId = payload && payload.targetId != null ? payload.targetId : rememberedTargetId;
    const stamp = lastSimTime;
    punchLineRelease(rememberedPlayerId, stamp);
    punchLineRelease(targetId, stamp);
  }

  function punchLineRelease(id, stamp) {
    if (id == null) return;
    const rec = craftMotion.get(id);
    if (!rec) return;
    if (rec.lineSnapStamp === stamp) return;
    if (!(rec.lineLean > 0.18 || rec.lineStrain > 0.08)) return;
    rec.lineSnapStamp = stamp;
    rec.lineRelease = 0.28;
    rec.lineLatched = false;
    const kick = 0.55 + rec.lineStrain * 1.5 + rec.lineLean * 0.35;
    rec.yieldVel = clamp(rec.yieldVel + kick, -1.8, YIELD_VEL_LIMIT);
    if (Math.hypot(rec.linePullFwd, rec.linePullLat) > 0.2) {
      rec.yieldFwd = -rec.linePullFwd;
      rec.yieldLat = -rec.linePullLat;
    }
    rec.impactVelYaw += (rec.linePullLat || 0) * (0.35 + rec.lineStrain);
    rec.flinchShudder = Math.min(0.45, Math.max(rec.flinchShudder, 0.14 + rec.lineStrain * 0.3));
  }

  function onKilled(payload) {
    if (!payload) return;
    // Ships and drones die into wrecks; anything else typed is not our spiral.
    if (payload.type && payload.type !== 'ship' && payload.type !== 'drone') return;
    const pos = payload.pos || null;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
      const slot = recentKills[killCursor];
      slot.x = pos.x;
      slot.z = pos.z;
      slot.t = lastSimTime;
      slot.used = true;
      killCursor = (killCursor + 1) % RECENT_KILL_SLOTS;
      // The ship mesh vanishes on the sweep the same tick, so the kill-frame itself must
      // leave a mark: one armor-seam breach pop at the moment of death.
      if (busRef && typeof busRef.emit === 'function') {
        deathPopPayload.x = pos.x;
        deathPopPayload.z = pos.z;
        deathPopPayload.radius = Number.isFinite(payload.radius) ? payload.radius : 6;
        deathPopPayload.shipId = payload.id != null ? payload.id : 0;
        deathPopPayload.seam = Math.random() * Math.PI * 2;
        busRef.emit('ship:deathPop', deathPopPayload);
      }
    }
  }

  function onSpawned(payload) {
    // Entity ids recycle: a fresh wreck reusing an old id must be allowed to spiral again.
    const entity = payload && payload.entity;
    const id = payload && payload.id != null ? payload.id : (entity && entity.id);
    if (id == null) return;
    const type = (payload && payload.type) || (entity && entity.type);
    if (type === 'wreck') spiralDone.delete(id);
    // Ships and drones materialize on arrival instead of popping in mid-frame.
    if (type === 'ship' || type === 'drone') {
      getRecord(id).materializeT0 = lastSimTime;
    }
  }

  function clearSpiralMemory() {
    for (let i = 0; i < recentKills.length; i++) {
      recentKills[i].used = false;
      recentKills[i].t = -1e9;
    }
    spiralDone.clear();
  }

  function matchFreshKill(x, z, simTime) {
    const r2 = DEATH_KILL_MATCH_WU * DEATH_KILL_MATCH_WU;
    for (let i = 0; i < recentKills.length; i++) {
      const k = recentKills[i];
      if (!k.used) continue;
      if (simTime - k.t > DEATH_KILL_MATCH_S) continue;
      const dx = x - k.x;
      const dz = z - k.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  function emitRcsPulse(entity, firing, runaway) {
    if (!busRef || typeof busRef.emit !== 'function' || !firing) return;
    rcsPulsePayload.x = firing.x;
    rcsPulsePayload.z = firing.z;
    rcsPulsePayload.dirX = firing.dirX;
    rcsPulsePayload.dirZ = firing.dirZ;
    rcsPulsePayload.intensity = firing.intensity;
    rcsPulsePayload.radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 6;
    rcsPulsePayload.shipId = entity.id != null ? entity.id : 0;
    rcsPulsePayload.runaway = runaway === true;
    busRef.emit('ship:rcsPulse', rcsPulsePayload);
  }

  // Iterative mount scan, duck-typed for THREE groups and plain mock graphs. Runs once per
  // mesh identity (rebuilds rescan); never on the steady-state path. Transform targets only.
  function captureBellHeatSkin(entry) {
    if (!entry || !entry.heatSkin || entry.heatMats) return;
    const node = entry.node;
    if (!node) return;
    const src = node.material;
    const list = Array.isArray(src) ? src : (src ? [src] : []);
    const clones = new Array(list.length);
    const base = new Array(list.length);
    let any = false;
    for (let i = 0; i < list.length; i++) {
      const mat = list[i];
      if (!mat || !mat.emissive || typeof mat.clone !== 'function' || typeof mat.emissive.setRGB !== 'function') {
        clones[i] = null;
        base[i] = null;
        continue;
      }
      const cloned = mat.clone();
      clones[i] = cloned;
      base[i] = {
        r: cloned.emissive.r,
        g: cloned.emissive.g,
        b: cloned.emissive.b,
        intensity: Number.isFinite(cloned.emissiveIntensity) ? cloned.emissiveIntensity : 0,
      };
      any = true;
    }
    if (!any) return;
    node.material = Array.isArray(src) ? clones.map((cloned, i) => cloned || list[i]) : clones[0];
    entry.heatMats = clones;
    entry.heatBase = base;
  }

  function applyBellThermal(rec, heat, flashReduce) {
    const sample = sampleBellThermal(heat);
    const flash = flashReduce ? 0.28 : 1;
    for (let i = 0; i < rec.bellCount; i++) {
      const bell = rec.bells[i];
      if (!bell || !bell.heatSkin) continue;
      if (!bell.heatMats) captureBellHeatSkin(bell);
      const mats = bell.heatMats;
      if (!mats) continue;
      for (let m = 0; m < mats.length; m++) {
        const mat = mats[m];
        const base = bell.heatBase[m];
        if (!mat || !base) continue;
        if (sample.intensity <= 0.001) {
          mat.emissive.setRGB(base.r, base.g, base.b);
          mat.emissiveIntensity = base.intensity;
        } else {
          mat.emissive.setRGB(sample.r, sample.g, sample.b);
          mat.emissiveIntensity = sample.intensity * flash;
        }
      }
    }
  }

  function scanMountPivots(rec, mesh, hull) {
    rec.mountMesh = mesh;
    rec.bellCount = 0;
    rec.rcsNozzleCount = 0;
    rec.flareApplied = 1;
    // Capture the hull's authored base scale — the materialize/breath/ripple channels write
    // multiplicatively on top of it every frame.
    if (hull && hull.scale) {
      rec.hullScaleX = Number.isFinite(hull.scale.x) ? hull.scale.x : 1;
      rec.hullScaleY = Number.isFinite(hull.scale.y) ? hull.scale.y : 1;
      rec.hullScaleZ = Number.isFinite(hull.scale.z) ? hull.scale.z : 1;
      rec.hullScaleDirty = false;
    }
    // Authored hull yaw (packaged hulls can carry one) — the impact swing writes relative to it.
    rec.hullYawBase = hull && hull.rotation && Number.isFinite(hull.rotation.y) ? hull.rotation.y : 0;
    if (!rec.bells) rec.bells = [];
    if (!rec.rcsNozzles) rec.rcsNozzles = [];
    const roots = [];
    if (hull) roots.push(hull);
    if (mesh && mesh !== hull) roots.push(mesh);
    let scanned = 0;
    for (let r = 0; r < roots.length; r++) {
      const stack = [roots[r]];
      while (stack.length > 0 && scanned < MOUNT_SCAN_NODE_CAP) {
        const node = stack.pop();
        if (!node) continue;
        scanned++;
        const name = typeof node.name === 'string' ? node.name : '';
        const lower = name.toLowerCase();
        const isSocket = name.indexOf('SOCKET_') === 0;
        if (!isSocket && lower.indexOf('rcs') >= 0 && node.scale && rec.rcsNozzleCount < MAX_RCS_PIVOTS) {
          let entry = rec.rcsNozzles[rec.rcsNozzleCount];
          if (!entry) entry = rec.rcsNozzles[rec.rcsNozzleCount] = {};
          entry.node = node;
          entry.baseSX = Number.isFinite(node.scale.x) ? node.scale.x : 1;
          entry.baseSY = Number.isFinite(node.scale.y) ? node.scale.y : 1;
          entry.baseSZ = Number.isFinite(node.scale.z) ? node.scale.z : 1;
          rec.rcsNozzleCount++;
        } else if (node.rotation && rec.bellCount < MAX_BELL_PIVOTS) {
          const isBell = lower.indexOf('nozzle') >= 0 || lower.indexOf('bell') >= 0
            || lower.indexOf('drive') >= 0 || lower.indexOf('engine') >= 0
            || lower.indexOf('plume') >= 0 || lower.indexOf('thruster') >= 0
            || lower.indexOf('exhaust') >= 0;
          const isGimbalSocket = isSocket && (lower.indexOf('engine') >= 0 || lower.indexOf('trail') >= 0);
          if ((isBell && !isSocket) || isGimbalSocket) {
            let entry = rec.bells[rec.bellCount];
            if (!entry) entry = rec.bells[rec.bellCount] = {};
            entry.node = node;
            entry.baseY = Number.isFinite(node.rotation.y) ? node.rotation.y : 0;
            entry.baseZ = Number.isFinite(node.rotation.z) ? node.rotation.z : 0;
            entry.isPlume = lower.indexOf('plume') >= 0 && !isSocket;
            entry.isSocket = isSocket;
            if (node.scale) {
              entry.baseSX = Number.isFinite(node.scale.x) ? node.scale.x : 1;
              entry.baseSY = Number.isFinite(node.scale.y) ? node.scale.y : 1;
              entry.baseSZ = Number.isFinite(node.scale.z) ? node.scale.z : 1;
            } else {
              entry.baseSX = 1; entry.baseSY = 1; entry.baseSZ = 1;
            }
            entry.heatSkin = !entry.isPlume && !isSocket && (
              lower.indexOf('nozzle') >= 0 || lower.indexOf('bell') >= 0
              || lower.indexOf('exhaust') >= 0 || lower.indexOf('engine') >= 0
            );
            entry.heatMats = null;
            entry.heatBase = null;
            rec.bellCount++;
          }
        }
        const children = node.children;
        if (children && children.length > 0) {
          for (let i = 0; i < children.length; i++) stack.push(children[i]);
        }
      }
    }
  }

  function bindEvents(bus) {
    if (!bus || typeof bus.on !== 'function') return;
    busRef = bus;
    busSubscribers.push(bus.on('entity:killed', onKilled));
    busSubscribers.push(bus.on('entity:spawned', onSpawned));
    busSubscribers.push(bus.on('sector:enter', clearSpiralMemory));
    busSubscribers.push(bus.on('save:loaded', clearSpiralMemory));
    busSubscribers.push(bus.on('game:newGame', clearSpiralMemory));
    busSubscribers.push(bus.on('combat:fire', onFire));
    busSubscribers.push(bus.on('weapons:vent', onVent));
    busSubscribers.push(bus.on('combat:damage', onDamage));
    busSubscribers.push(bus.on('physics:impact', onImpact));
    busSubscribers.push(bus.on('hazard:enter', onHazardEnter));
    busSubscribers.push(bus.on('hazard:exit', onHazardExit));
    busSubscribers.push(bus.on('jump:chargeStart', onJumpChargeStart));
    busSubscribers.push(bus.on('jump:chargeTick', onJumpChargeTick));
    busSubscribers.push(bus.on('jump:start', onJumpStart));
    busSubscribers.push(bus.on('jump:arrive', onJumpArrive));
    busSubscribers.push(bus.on('jump:chargeAbort', onJumpChargeAbort));
    busSubscribers.push(bus.on('dock:docked', onDocked));
    busSubscribers.push(bus.on('dock:undocked', onUndocked));
    busSubscribers.push(bus.on('player:respawn', onPlayerRespawn));
    busSubscribers.push(bus.on('cloak:engaged', onCloakEngaged));
    busSubscribers.push(bus.on('cloak:dropped', onCloakDropped));
    busSubscribers.push(bus.on('ship:swingDash', onSwingDash));
    busSubscribers.push(bus.on('combat:subsystemEnabled', onSubsystemEnabled));
    busSubscribers.push(bus.on('charge:stuck', onChargeStuck));
    busSubscribers.push(bus.on('cargo:jettisoned', onJettison));
    busSubscribers.push(bus.on('countermeasure:deployed', onCountermeasure));
    busSubscribers.push(bus.on('beacon:deployed', onBeaconDeployed));
    busSubscribers.push(bus.on('scan:pulse', onScanPulse));
    busSubscribers.push(bus.on('tether:released', onTetherLetGo));
    busSubscribers.push(bus.on('tether:broke', onTetherLetGo));
  }

  function unbindEvents() {
    for (const unsub of busSubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    busSubscribers = [];
    busRef = null;
    craftMotion.clear();
    clearSpiralMemory();
    rememberedPlayerId = null;
    rememberedTargetId = null;
  }

  function updateCraftMicroMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const hull = mesh.userData && mesh.userData.hull;
    if (!hull) return;

    const reducedMotion = options.motionReduce === true;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getRecord(entity.id);

    // Player-intent queue: dock/cloak/respawn events carry no entity id — resolve to the
    // player record the first frame it updates after the event.
    if (pendingPlayerActions.length > 0 && entity.id === options.playerId) {
      for (let i = 0; i < pendingPlayerActions.length; i++) {
        applyPlayerAction(rec, pendingPlayerActions[i], simTime);
      }
      pendingPlayerActions.length = 0;
    }
    if (pendingPlayerYawKicks.length > 0 && entity.id === options.playerId) {
      for (let i = 0; i < pendingPlayerYawKicks.length; i++) {
        rec.impactVelYaw += pendingPlayerYawKicks[i];
      }
      pendingPlayerYawKicks.length = 0;
    }
    // Last-seen kinematics for directional impact decomposition (physics:impact fires mid-tick).
    rec.mass = Number.isFinite(entity.mass) && entity.mass > 0 ? entity.mass : 400;
    rec.px = entity.pos && Number.isFinite(entity.pos.x) ? entity.pos.x : 0;
    rec.pz = entity.pos && Number.isFinite(entity.pos.z) ? entity.pos.z : 0;
    rec.rot = Number.isFinite(entity.rot) ? entity.rot : 0;
    rec.radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 12;
    // Second clamp-lock beat after berth contact — the berth grabs, then seats.
    if (rec.dockClampAt > 0 && simTime >= rec.dockClampAt) {
      rec.dockClampAt = -1;
      rec.recoilVelX -= 0.7;
      rec.flinchShudder = Math.max(rec.flinchShudder, 0.28);
    }
    // Shield-state edge: field re-inflates → the hull inhales; collapses → it exhales.
    const shieldNow = Number.isFinite(entity.shield) ? entity.shield : null;
    if (shieldNow != null && rec.prevShield != null) {
      if (rec.prevShield <= 0 && shieldNow > 0) {
        rec.shieldBreathT0 = simTime;
        rec.shieldBreathDir = 1;
      } else if (rec.prevShield > 0 && shieldNow <= 0) {
        rec.shieldBreathT0 = simTime;
        rec.shieldBreathDir = -1;
      }
    }
    if (shieldNow != null) rec.prevShield = shieldNow;

    // 1. Recoil spring integration (Hooke's law + damping)
    const kRecoil = 240.0;
    const cRecoil = 22.0;
    const accelRecoilX = -kRecoil * rec.recoilX - cRecoil * rec.recoilVelX;
    rec.recoilVelX += accelRecoilX * dt;
    rec.recoilX += rec.recoilVelX * dt;

    const accelRecoilPitch = -kRecoil * rec.recoilPitch - cRecoil * rec.recoilVelPitch;
    rec.recoilVelPitch += accelRecoilPitch * dt;
    rec.recoilPitch += rec.recoilVelPitch * dt;

    rec.recoilShudder *= Math.max(0, 1 - dt * 14.0);

    // 2. Impact flinch spring integration
    const kFlinch = 180.0;
    const cFlinch = 19.0;
    const accelFlinchRoll = -kFlinch * rec.flinchRoll - cFlinch * rec.flinchVelRoll;
    rec.flinchVelRoll += accelFlinchRoll * dt;
    rec.flinchRoll += rec.flinchVelRoll * dt;

    const accelFlinchPitch = -kFlinch * rec.flinchPitch - cFlinch * rec.flinchVelPitch;
    rec.flinchVelPitch += accelFlinchPitch * dt;
    rec.flinchPitch += rec.flinchVelPitch * dt;

    rec.flinchX *= Math.max(0, 1 - dt * 16.0);
    rec.flinchZ *= Math.max(0, 1 - dt * 16.0);
    rec.flinchShudder *= Math.max(0, 1 - dt * 12.0);

    // Directional bounce yaw spring — slightly slower than the flinch pair so the swing reads as
    // a swing, not a twitch. Clamped: a bounce rocks the ship, it never spins it around.
    const kYaw = 150.0;
    const cYaw = 15.0;
    rec.impactVelYaw += (-kYaw * rec.impactYaw - cYaw * rec.impactVelYaw) * dt;
    rec.impactYaw = clamp(rec.impactYaw + rec.impactVelYaw * dt, -0.38, 0.38);
    stepYieldSpring(rec, dt);

    // 3. Environmental hazard atmospheric buffet
    if (rec.inHazard && !reducedMotion) {
      const hScale = (rec.hazardIntensity || 0.6) * 1.5;
      rec.flinchVelRoll += (Math.sin(simTime * 37.0) + (Math.sin(simTime * 17.0))) * hScale * 4.0 * dt;
      rec.flinchVelPitch += (Math.cos(simTime * 41.0) + (Math.cos(simTime * 19.0))) * hScale * 3.2 * dt;
      rec.flinchShudder = Math.max(rec.flinchShudder, hScale * 0.12);
    }

    // 4. Flight throttle surge & reverse dive
    const speed = entity.vel ? Math.hypot(entity.vel.x, entity.vel.z) : 0;
    if (rec.prevSpeed == null) rec.prevSpeed = speed;
    const dSpeed = dt > 0 ? (speed - rec.prevSpeed) / dt : 0;
    rec.prevSpeed = speed;

    const isBoosting = !!(entity.flags && entity.flags.boosting);
    let targetSurge = 0;
    if (isBoosting) {
      targetSurge = -0.055; // nose up squat under boost
    } else if (dSpeed > 15) {
      targetSurge = -Math.min(0.045, (dSpeed / 200.0) * 0.045);
    } else if (dSpeed < -20) {
      targetSurge = Math.min(0.065, (-dSpeed / 220.0) * 0.065); // retro dive
    }
    rec.accelSurge += (targetSurge - rec.accelSurge) * (1 - Math.exp(-8.0 * dt));

    // 5. Hyperspace drive spool-up reactor vibration
    let jumpShudderX = 0;
    let jumpShudderZ = 0;
    if (rec.jumpCharging && !reducedMotion) {
      const p = Math.max(0, Math.min(1, rec.jumpProgress || 0));
      const jAmp = Math.pow(p, 2.5) * 0.045;
      rec.recoilShudder = Math.max(rec.recoilShudder, p * 0.4);
      jumpShudderX = Math.sin(simTime * 230.0) * jAmp;
      jumpShudderZ = Math.cos(simTime * 210.0) * jAmp;
    }

    // 6. Boost powerplant micro-vibration
    let boostJitterX = 0;
    let boostJitterY = 0;
    if (!reducedMotion && isBoosting && speed > 20) {
      const vFreq = simTime * 190.0;
      boostJitterX = Math.sin(vFreq) * 0.022;
      boostJitterY = Math.cos(vFreq * 1.3) * 0.018;
    }

    // 7. Zero-G spatial breathing (at low velocities)
    let idleBreathRoll = 0;
    let idleBreathPitch = 0;
    let idleBreathHeave = 0;
    if (!reducedMotion && speed < 12 && !rec.jumpCharging) {
      const bScale = Math.max(0, 1 - speed / 12.0);
      const t = simTime * 1.4 + rec.idlePhase;
      idleBreathRoll = Math.sin(t * 0.85) * 0.007 * bScale;
      idleBreathPitch = Math.cos(t * 1.15) * 0.005 * bScale;
      idleBreathHeave = Math.sin(t * 1.6) * 0.035 * bScale;
    }

    // 8. Aerospace locomotion: RCS demand, bell gimbal, boost ignition (presentation only)
    lastSimTime = simTime;
    const rot = Number.isFinite(entity.rot) ? entity.rot : 0;
    const cf = Math.cos(rot);
    const sf = Math.sin(rot);
    const vx = entity.vel && Number.isFinite(entity.vel.x) ? entity.vel.x : 0;
    const vz = entity.vel && Number.isFinite(entity.vel.z) ? entity.vel.z : 0;
    const fwdV = vx * cf + vz * sf;
    const latV = vx * -sf + vz * cf;
    const yawRate = Number.isFinite(entity.angVel) ? entity.angVel
      : (rec.prevRot == null ? 0 : wrapAngle(rot - rec.prevRot) / dt);

    // Signed flight-computer demand when published; otherwise synthesize pseudo-demand from
    // observed motion deltas so drones and assist trims still justify their attitude puffs.
    const frame = entity._flightFrame || null;
    let actuators = frame && frame.actuators ? frame.actuators : null;
    if (!actuators) {
      if (!rec.actFallback) rec.actFallback = { lateral: 0, yaw: 0, reverse: 0, main: 0 };
      const firstObs = rec.prevRot == null;
      const yawAccel = firstObs ? 0 : (yawRate - rec.prevYawRate) / dt;
      const latAccel = firstObs ? 0 : (latV - rec.prevLatV) / dt;
      const fwdAccel = firstObs ? 0 : (fwdV - rec.prevFwdV) / dt;
      rec.actFallback.lateral = latAccel * RCS_OBSERVED_LAT_GAIN;
      rec.actFallback.yaw = yawAccel * RCS_OBSERVED_YAW_GAIN;
      rec.actFallback.reverse = Math.max(0, -fwdAccel) * RCS_OBSERVED_FWD_GAIN;
      rec.actFallback.main = Math.max(0, fwdAccel) * RCS_OBSERVED_FWD_GAIN;
      actuators = rec.actFallback;
    }
    const sc = defaultActuatorScale;
    const latRaw = Number.isFinite(actuators.lateral) ? actuators.lateral : 0;
    const yawRaw = Number.isFinite(actuators.yaw) ? actuators.yaw : 0;
    const mainRaw = Number.isFinite(actuators.main) ? actuators.main : 0;
    const latN = clamp(latRaw / sc.strafe, -1, 1);
    const yawN = clamp(yawRaw / sc.yaw, -1, 1);
    const mainN = clamp(mainRaw / sc.main, 0, 1);
    rec.rcsLat = latN;
    rec.rcsYaw = yawN;
    rec.rcsMain = mainN;

    if (!rec.rcsPose) rec.rcsPose = { x: 0, z: 0, rot: 0, radius: 6 };
    if (!rec.rcsFirings) rec.rcsFirings = [];
    const epos = entity.pos || null;
    rec.rcsPose.x = epos && Number.isFinite(epos.x) ? epos.x : 0;
    rec.rcsPose.z = epos && Number.isFinite(epos.z) ? epos.z : 0;
    rec.rcsPose.rot = rot;
    rec.rcsPose.radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 6;
    const firings = resolveRcsFirings(actuators, rec.rcsPose, sc, rec.rcsFirings);

    let rcsMax = 0;
    let pushX = 0;
    let pushZ = 0;
    for (let i = 0; i < firings.length; i++) {
      const f = firings[i];
      if (f.intensity > rcsMax) rcsMax = f.intensity;
      pushX += f.pushX * f.intensity;
      pushZ += f.pushZ * f.intensity;
    }
    rec.rcsMax = rcsMax;
    // The hull rides WITH the push (reaction physics, centimeters): exhaust kicks one way,
    // multi-ton hull answers the other. Ship-local: +X forward, +Z starboard.
    const rcsKickFwd = (pushX * cf + pushZ * sf) * 0.035;
    const rcsKickLat = (pushX * -sf + pushZ * cf) * 0.035;
    const rcsRoll = yawN * 0.012;
    const bankNow = Number.isFinite(entity.bank) ? entity.bank : 0;
    const pitchRate = rec.prevRot == null ? 0 : (bankNow - rec.prevBank) / dt;
    const rcsPitchKick = clamp(pitchRate * 0.03, -0.02, 0.02);
    rec.prevBank = bankNow;
    rec.prevRot = rot;
    rec.prevFwdV = fwdV;
    rec.prevLatV = latV;
    rec.prevYawRate = yawRate;

    // Massline swing-dash: bank into the arc (toward lateral velocity) + stretch along the
    // swing axis. The slingshot finally has a body.
    let swingBank = 0;
    let swingStretch = 0;
    if (rec.swingDashT0 >= 0) {
      const sk = (simTime - rec.swingDashT0) / SWING_DASH_S;
      if (sk >= 1) {
        rec.swingDashT0 = -1;
      } else {
        const env = Math.sin(sk * Math.PI) * (reducedMotion ? 0.5 : 1);
        swingBank = env * SWING_BANK_MAX * (latV >= 0 ? 1 : -1);
        swingStretch = env * SWING_STRETCH_MAX;
      }
    }

    // Critical-hull list: a dying craft carries a seeded off-axis list with periodic strain
    // coughs and a sputtering gimbal — it reads dying before the kill lands.
    let critList = 0;
    let critCough = 0;
    const hullMax = Number.isFinite(entity.hullMax) && entity.hullMax > 0 ? entity.hullMax : 0;
    if (hullMax > 0 && Number.isFinite(entity.hull)) {
      const frac = entity.hull / hullMax;
      if (frac < CRIT_HULL_FRAC) {
        const sev = 1 - Math.max(0, frac) / CRIT_HULL_FRAC;
        critList = Math.sin(simTime * 0.35 + rec.idlePhase) * CRIT_LIST_MAX * sev;
        if (!reducedMotion) {
          const c = Math.sin(simTime * 1.7 + rec.idlePhase * 2.3);
          critCough = Math.pow(Math.max(0, c), 14) * 0.02 * sev;
          rec.flinchShudder = Math.max(rec.flinchShudder, critCough * 6);
          rec.gimbalYaw += Math.sin(simTime * 9.7 + rec.idlePhase) * 0.028 * sev;
        }
      }
    }

    // Boost rising edge: afterburner light-off punch, gimbal snap, plume flare window.
    if (isBoosting && !rec.prevBoosting) {
      rec.boostFlashT = BOOST_FLASH_S;
      rec.recoilVelX -= BOOST_IGNITION_KICK;
      rec.gimbalYaw += 0.045;
      rec.gimbalPitch -= 0.03;
      rec.recoilShudder = Math.max(rec.recoilShudder, 0.3);
    }
    rec.prevBoosting = isBoosting;
    if (rec.boostFlashT > 0) rec.boostFlashT = Math.max(0, rec.boostFlashT - dt);

    // Engine bells steer with stern-local demand (translation minus yaw couple): the drive
    // visibly aims the push. Pitch nods with main-drive power.
    if (rec.mountMesh !== mesh) scanMountPivots(rec, mesh, hull);
    const driveHeat = isBoosting ? 1 : mainN;
    rec.bellHeat = integrateBellHeat(rec.bellHeat || 0, driveHeat, dt);
    if (!((rec.bellHeat || 0) < 0.004 && rec.bellCool)) {
      applyBellThermal(rec, rec.bellHeat, !!(options && options.flashReduce));
      rec.bellCool = rec.bellHeat < 0.004;
    }
    if (!rec.slipstream) rec.slipstream = { active: false, intensity: 0, side: 0, yawCouple: 0 };
    resolveSlipstreamInto({
      throttle: mainN,
      boosting: isBoosting,
      lateralSpeed: latV,
      yawRate,
      lateralDemand: latN,
      yawDemand: yawN,
    }, rec.slipstream);
    const gimbalScale = reducedMotion ? 0.5 : 1.0;
    const targetGimbalYaw = (yawN - latN) * GIMBAL_YAW_MAX * gimbalScale;
    const targetGimbalPitch = -mainN * GIMBAL_PITCH_MAX * gimbalScale;
    const gimbalK = 1 - Math.exp(-GIMBAL_SMOOTH * dt);
    rec.gimbalYaw += (targetGimbalYaw - rec.gimbalYaw) * gimbalK;
    rec.gimbalPitch += (targetGimbalPitch - rec.gimbalPitch) * gimbalK;

    // Subsystem reboot self-test: a short control-check sweep on the gimbal plus a roll rock,
    // the way a pilot wiggles the stick after a bus comes back.
    let rebootRock = 0;
    if (rec.rebootT0 >= 0) {
      const rk = (simTime - rec.rebootT0) / REBOOT_S;
      if (rk >= 1) {
        rec.rebootT0 = -1;
      } else {
        const renv = 1 - rk;
        rec.gimbalYaw += Math.sin(rk * Math.PI * 4) * 0.10 * renv;
        rebootRock = Math.sin(rk * Math.PI * 2) * 0.022 * renv;
      }
    }
    // Plume flare is multiplicative over the drive-state base (which resets scale every
    // frame): unapply last frame's factor first so mock graphs without a drive driver
    // cannot compound, then apply this frame's.
    const boostFlash01 = rec.boostFlashT > 0 ? rec.boostFlashT / BOOST_FLASH_S : 0;
    const flare = 1 + boostFlash01 * 1.1 + (isBoosting ? 0.15 : 0);
    for (let i = 0; i < rec.bellCount; i++) {
      const b = rec.bells[i];
      const node = b.node;
      if (!node || !node.rotation) continue;
      node.rotation.y = b.baseY + rec.gimbalYaw;
      node.rotation.z = b.baseZ + rec.gimbalPitch;
      if (b.isPlume && !b.isSocket && node.scale) {
        if (rec.flareApplied !== 1 && rec.flareApplied > 0) {
          node.scale.x /= rec.flareApplied;
          node.scale.y /= rec.flareApplied;
          node.scale.z /= rec.flareApplied;
        }
        if (flare !== 1) {
          node.scale.x *= flare;
          node.scale.y *= flare;
          node.scale.z *= flare;
        }
      }
    }
    rec.flareApplied = flare;
    // RCS nozzle hardware breathes with total attitude effort (absolute set; we own it).
    const nozzlePulse = 1 + rcsMax * 0.4;
    for (let i = 0; i < rec.rcsNozzleCount; i++) {
      const nz = rec.rcsNozzles[i];
      const node = nz.node;
      if (!node || !node.scale) continue;
      node.scale.x = nz.baseSX * nozzlePulse;
      node.scale.y = nz.baseSY * nozzlePulse;
      node.scale.z = nz.baseSZ * nozzlePulse;
    }

    // Throttled cold-gas puff emission for VFX (top two nozzles: a couple reads as a
    // pair). Culled meshes stay silent. VFX skips owners already served by the production
    // RCS path, so player and NPCs share this seam without double-puffing.
    rec.rcsPulseCd -= dt;
    if (busRef && rcsMax >= RCS_PULSE_MIN_INTENSITY && rec.rcsPulseCd <= 0
        && mesh.visible !== false && firings.length > 0) {
      let i0 = 0;
      for (let i = 1; i < firings.length; i++) {
        if (firings[i].intensity > firings[i0].intensity) i0 = i;
      }
      emitRcsPulse(entity, firings[i0], false);
      let i1 = -1;
      for (let i = 0; i < firings.length; i++) {
        if (i === i0) continue;
        if (i1 < 0 || firings[i].intensity > firings[i1].intensity) i1 = i;
      }
      if (i1 >= 0 && firings[i1].intensity >= RCS_PULSE_MIN_INTENSITY) {
        emitRcsPulse(entity, firings[i1], false);
      }
      rec.rcsPulseCd = reducedMotion ? RCS_PULSE_COOLDOWN_REDUCED_S : RCS_PULSE_COOLDOWN_S;
    }

    // 8b. Line haul — a taut tether leans both hulls toward the line and stretches a light one.
    if (options && options.playerId != null) rememberedPlayerId = options.playerId;
    if (options && options.tetherActive && options.tetherTargetId != null) {
      rememberedTargetId = options.tetherTargetId;
    }
    let haulTargetLean = 0;
    let haulTargetStretch = 0;
    const haulInvolved = !!(options && options.tetherActive
      && (entity.id === options.playerId || entity.id === options.tetherTargetId));
    if (haulInvolved && options.tetherLoad > 0.05 && options.entities
        && typeof options.entities.get === 'function') {
      const otherId = entity.id === options.playerId ? options.tetherTargetId : options.playerId;
      const other = options.entities.get(otherId);
      if (other && other.pos && entity.pos) {
        const hdx = other.pos.x - entity.pos.x;
        const hdz = other.pos.z - entity.pos.z;
        const hlen = Math.hypot(hdx, hdz);
        if (hlen > 1) {
          rec.linePullFwd = (hdx * cf + hdz * sf) / hlen;
          rec.linePullLat = (hdx * -sf + hdz * cf) / hlen;
          const taut = TAUT_LINE_PHASES.has(options.tetherPhase);
          const loadPose = (taut ? 1 : 0.35) * clamp(options.tetherLoad, 0, 1);
          haulTargetLean = loadPose;
          haulTargetStretch = clamp(loadPose * massYieldScale(rec.mass), 0, 1);
        }
      }
    }
    if (!rec.lineLatched && haulTargetLean > 0.3) {
      rec.lineLatched = true;
      rec.flinchShudder = Math.max(rec.flinchShudder, 0.18);
      rec.impactVelYaw += rec.linePullLat * 0.35;
    }
    if (haulTargetLean < 0.05) rec.lineLatched = false;
    const haulFollow = rec.lineRelease > 0 ? LINE_RELEASE_FOLLOW : LINE_HAUL_FOLLOW;
    if (rec.lineRelease > 0) rec.lineRelease = Math.max(0, rec.lineRelease - dt);
    const haulBlend = 1 - Math.exp(-haulFollow * dt);
    rec.lineLean += (haulTargetLean - rec.lineLean) * haulBlend;
    rec.lineStrain += (haulTargetStretch - rec.lineStrain) * haulBlend;

    const yieldVis = rec.yieldAmt * (reducedMotion ? 0.4 : 1);
    if (!rec.yieldPose) rec.yieldPose = { x: 1, y: 1, z: 1, shiftX: 0, shiftZ: 0 };
    hullYieldPose(yieldVis, rec.yieldFwd, rec.yieldLat, rec.yieldPose);
    const haulVis = reducedMotion ? 0.45 : 1;
    if (!rec.haulPose) {
      rec.haulPose = { x: 1, y: 1, z: 1, shiftX: 0, shiftZ: 0, bank: 0, yaw: 0 };
    }
    lineHaulPose(rec.lineStrain * haulVis, rec.lineLean * haulVis, rec.linePullFwd, rec.linePullLat, rec.haulPose);
    const yieldShiftX = rec.yieldPose.shiftX;
    const yieldShiftZ = rec.yieldPose.shiftZ;
    const haulShiftX = rec.haulPose.shiftX;
    const haulShiftZ = rec.haulPose.shiftZ;

    // 9. High frequency shudder synthesis
    const shudderPhase = simTime * 140.0;
    const totalShudder = (rec.recoilShudder + rec.flinchShudder) * (reducedMotion ? 0.2 : 1.0);
    const shudderOffset = totalShudder > 0.002
      ? Math.sin(shudderPhase) * totalShudder * 0.35
      : 0;

    // Apply composite displacements to hull.position (local space: +X forward, +Y up, +Z lateral)
    const surgeSquatX = rec.accelSurge * 0.8;
    if (!reducedMotion) {
      hull.position.x = rec.recoilX + rec.flinchX + boostJitterX + surgeSquatX + jumpShudderX + rcsKickFwd
        + yieldShiftX + haulShiftX;
      hull.position.y = idleBreathHeave + boostJitterY;
      hull.position.z = rec.flinchZ + shudderOffset + jumpShudderZ + rcsKickLat
        + yieldShiftZ + haulShiftZ;
    } else {
      hull.position.x = rec.recoilX * 0.3 + rcsKickFwd * 0.3 + yieldShiftX + haulShiftX;
      hull.position.y = 0;
      hull.position.z = rcsKickLat * 0.3 + yieldShiftZ + haulShiftZ;
    }

    // Additive secondary angular micro-motion
    hull.rotation.x += (rec.flinchRoll + idleBreathRoll + rcsRoll + swingBank + rebootRock
      + critList + critCough + rec.haulPose.bank) * (reducedMotion ? 0.3 : 1.0);
    hull.rotation.z += (rec.recoilPitch + rec.flinchPitch + rec.accelSurge + idleBreathPitch + rcsPitchKick) * (reducedMotion ? 0.3 : 1.0);
    // Impact yaw swing on the hull channel — unowned here (entity sync only resets the root yaw,
    // which is −entity.rot, so sim-frame yaw writes mirrored). Absolute set around the authored
    // base, spring-decays back to it.
    hull.rotation.y = (rec.hullYawBase || 0)
      - (rec.impactYaw + rec.haulPose.yaw) * (reducedMotion ? 0.3 : 1.0);

    // Hull-scale channels: materialize ramp, cloak ripple, swing stretch, shield breath.
    // hull.scale is set-once-at-build everywhere, so this tracker owns it multiplicatively
    // off the base captured by scanMountPivots.
    let scaleX = 1, scaleY = 1, scaleZ = 1;
    if (rec.materializeT0 >= 0) {
      const k = (simTime - rec.materializeT0) / MATERIALIZE_S;
      if (k >= 1) {
        rec.materializeT0 = -1;
      } else {
        const e = 1 - Math.pow(1 - k, 3);
        const f = (0.55 + 0.45 * e) * (1 + Math.sin(k * Math.PI) * MATERIALIZE_OVERSHOOT);
        scaleX *= f; scaleY *= f; scaleZ *= f;
      }
    }
    if (rec.cloakWaveT0 >= 0) {
      const k = (simTime - rec.cloakWaveT0) / CLOAK_WAVE_S;
      if (k >= 1) {
        rec.cloakWaveT0 = -1;
      } else {
        const w = Math.sin(k * Math.PI * 3) * CLOAK_WAVE_AMP * (1 - k);
        scaleX += w; scaleZ += w; scaleY -= w * 0.6;
      }
    }
    if (swingStretch > 0) scaleX += swingStretch;
    scaleX *= rec.yieldPose.x * rec.haulPose.x;
    scaleY *= rec.yieldPose.y * rec.haulPose.y;
    scaleZ *= rec.yieldPose.z * rec.haulPose.z;
    if (rec.shieldBreathT0 >= 0) {
      const k = (simTime - rec.shieldBreathT0) / SHIELD_BREATH_S;
      if (k >= 1) {
        rec.shieldBreathT0 = -1;
      } else {
        const w = Math.sin(k * Math.PI) * SHIELD_BREATH_AMP * rec.shieldBreathDir;
        scaleX += w; scaleY += w * 0.7; scaleZ += w;
      }
    }
    const scaleActive = scaleX !== 1 || scaleY !== 1 || scaleZ !== 1;
    if (hull.scale && (scaleActive || rec.hullScaleDirty)) {
      const tx = rec.hullScaleX * scaleX;
      const ty = rec.hullScaleY * scaleY;
      const tz = rec.hullScaleZ * scaleZ;
      if (typeof hull.scale.set === 'function') hull.scale.set(tx, ty, tz);
      else { hull.scale.x = tx; hull.scale.y = ty; hull.scale.z = tz; }
      rec.hullScaleDirty = scaleActive;
    }

    // 9. Weapon thermal dissipation & cooling fin blackbody glow
    if (rec.isVenting) {
      rec.ventDuration -= dt;
      rec.weaponHeat = Math.max(0, rec.weaponHeat - dt * 0.65);
      if (rec.ventDuration <= 0) rec.isVenting = false;
    } else if (rec.weaponHeat > 0) {
      rec.weaponHeat = Math.max(0, rec.weaponHeat - dt * 0.22);
    }

    // 10. Mechanical weapon barrel recoil stroke & dynamic turret target tracking
    const weapons = (mesh.userData && mesh.userData.weapons)
      || (hull.userData && hull.userData.weapons);
    if (weapons && Array.isArray(weapons)) {
      // Determine target entity for dynamic turret traverse
      let targetEntity = null;
      if (options.entities && typeof options.entities.get === 'function') {
        const targetId = (options.playerId === entity.id)
          ? options.playerTargetId
          : (entity.data && (entity.data.targetId || (entity.data.ai && entity.data.ai.targetId)));
        if (targetId) targetEntity = options.entities.get(targetId);
      }

      for (let i = 0; i < weapons.length; i++) {
        const wProp = weapons[i];
        if (!wProp || !wProp.userData) continue;

        // --- Recoil barrel stroke ---
        const barrel = wProp.userData.barrel;
        if (barrel) {
          if (wProp.userData.barrelBaseX == null) {
            wProp.userData.barrelBaseX = barrel.position.x;
            wProp.userData.barrelRecoilX = 0;
          }
          if (rec.lastFiredHardpoint === i || rec.lastFiredHardpoint === -1) {
            wProp.userData.barrelRecoilX = -Math.max(0.14, (rec.lastFiredKick || 0.2) * 0.7);
          }
          if (Math.abs(wProp.userData.barrelRecoilX) > 0.001) {
            wProp.userData.barrelRecoilX *= Math.exp(-22.0 * dt);
            barrel.position.x = wProp.userData.barrelBaseX + wProp.userData.barrelRecoilX;
          } else if (wProp.userData.barrelRecoilX !== 0) {
            wProp.userData.barrelRecoilX = 0;
            barrel.position.x = wProp.userData.barrelBaseX;
          }
        }

        // --- Dynamic turret tracking ---
        if (wProp.userData.isTurret && wProp.userData.turretHead) {
          const turretHead = wProp.userData.turretHead;
          let desiredYaw = 0;
          let inArc = false;

          if (targetEntity && targetEntity.pos && entity.pos) {
            const dx = targetEntity.pos.x - entity.pos.x;
            const dz = targetEntity.pos.z - entity.pos.z;
            const worldAngle = Math.atan2(dz, dx);
            const shipRot = Number.isFinite(entity.rot) ? entity.rot : mesh.rotation.y;
            const relYaw = wrapAngle(worldAngle - shipRot);
            const mountYaw = wProp.rotation.y || 0;
            desiredYaw = wrapAngle(relYaw - mountYaw);
            // 150-degree turret tracking cone
            if (Math.abs(desiredYaw) <= 1.31) {
              inArc = true;
            }
          }

          if (!inArc) {
            // Idle scanning search sweep
            desiredYaw = Math.sin(simTime * 0.85 + i * 1.6) * 0.45;
          }

          const currentYaw = turretHead.rotation.y;
          const diff = wrapAngle(desiredYaw - currentYaw);
          const slewRate = inArc ? 3.4 : 1.6;
          const maxStep = slewRate * dt;
          turretHead.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
        }

        // --- Cooling fins thermal blackbody glow ---
        const fins = wProp.userData.coolingFins;
        if (fins && fins.length > 0) {
          const heat = rec.weaponHeat || 0;
          if (heat < 0.2) {
            for (let f = 0; f < fins.length; f++) {
              const mat = fins[f].material;
              if (mat && mat.emissiveIntensity > 0) mat.emissiveIntensity = 0;
            }
          } else {
            let r = 0, g = 0, b = 0, intensity = 0;
            if (heat < 0.55) {
              const k = (heat - 0.2) / 0.35;
              r = 0.5 + 0.5 * k; g = 0.05 * k; b = 0.01 * k; intensity = 0.5 + 1.2 * k;
            } else if (heat < 0.85) {
              const k = (heat - 0.55) / 0.3;
              r = 1.0; g = 0.1 + 0.45 * k; b = 0.05 * k; intensity = 1.7 + 1.5 * k;
            } else {
              const k = (heat - 0.85) / 0.15;
              r = 1.0; g = 0.55 + 0.4 * k; b = 0.1 + 0.7 * k; intensity = 3.2 + 2.0 * k;
            }
            for (let f = 0; f < fins.length; f++) {
              const mat = fins[f].material;
              if (mat && mat.emissive) {
                mat.emissive.setRGB(r, g, b);
                mat.emissiveIntensity = intensity;
              }
            }
          }
        }
      }
      rec.lastFiredHardpoint = -999;
    }

    // 11. Mining drill auger rotation
    const drill = (mesh.userData && mesh.userData.drill)
      || (hull.userData && hull.userData.drill);
    if (drill && drill.userData && drill.userData.drillBit) {
      const isMining = (entity.data && entity.data.miningBeamActive)
        || (options.playerMiningActive && entity.id === options.playerId);
      if (isMining) {
        drill.userData.drillBit.rotation.x += dt * 32.0;
      }
    }
  }

  // Death spiral for fresh wrecks near a witnessed kill: uncontrolled spin with runaway
  // attitude thrusters, secondary armor-seam pops, then a core detonation flash. Owns the
  // wreck ROOT transform (updateWreckMotion owns children[0]), so both run every frame with
  // no handoff snap: the spin composes with dead drift, then freezes as a static knock angle.
  function updateDeathSpiral(entity, mesh, simTime, frameDt, a11y = {}) {
    if (!entity || !mesh || entity.type !== 'wreck') return false;
    lastSimTime = simTime;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getRecord(entity.id);
    if (rec.spiralState === 2) {
      if (rec.spiralY !== 0 && mesh.rotation) mesh.rotation.y += rec.spiralY;
      return true;
    }
    if (rec.spiralState === 0) {
      if (spiralDone.get(entity.id)) return false;
      const data = entity.data || null;
      if (!data || data.parentType !== 'ship') return false;
      if (!entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) return false;
      if (!matchFreshKill(entity.pos.x, entity.pos.z, simTime)) return false;
      spiralDone.set(entity.id, 1);
      rec.spiralState = 1;
      rec.spiralT0 = simTime;
      const idNum = Number(entity.id);
      rec.spiralDir = (Number.isFinite(idNum) && Math.abs(Math.trunc(idNum)) % 2 === 1) ? -1 : 1;
      rec.spiralY = 0;
      rec.spiralFlashDone = false;
      rec.spiralPopCd = 0.12;
      rec.spiralRcsCd = 0;
      rec.spiralRcsSide = 1;
    }
    const reduced = !!(a11y && a11y.reducedMotion === true);
    const age = simTime - rec.spiralT0;
    if (age >= DEATH_SPIRAL_S) {
      rec.spiralState = 2;
      return true;
    }
    const k = clamp01(age / DEATH_SPIRAL_S);
    const ease = 1 - k * k;
    const rate = (DEATH_SPIN_END + (DEATH_SPIN_START - DEATH_SPIN_END) * ease)
      * rec.spiralDir * (reduced ? 0.3 : 1.0);
    const dy = rate * dt;
    rec.spiralY += dy;
    if (mesh.rotation) {
      // Root yaw is pose-owned (absolute every synced frame): add the running TOTAL so the
      // spin survives the reset. Root pitch/roll persist, so they accumulate directly.
      mesh.rotation.y += rec.spiralY;
      mesh.rotation.x += dy * 0.45;
      mesh.rotation.z += dy * 0.3;
    }
    const radius = Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : 6;
    const meshVisible = mesh.visible !== false;
    // Runaway attitude thrusters: alternating corner firings walking bow/stern.
    rec.spiralRcsCd -= dt;
    if (busRef && rec.spiralRcsCd <= 0 && meshVisible) {
      rec.spiralRcsSide = -rec.spiralRcsSide;
      const side = rec.spiralRcsSide;
      const bow = (Math.floor(age / 0.18) % 2 === 0) ? 1 : -1;
      const rot = Number.isFinite(entity.rot) ? entity.rot : 0;
      const a = rot + rec.spiralY;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const lx = bow * radius * 0.45;
      const lz = side * radius * 0.3;
      rcsPulsePayload.x = entity.pos.x + lx * ca - lz * sa;
      rcsPulsePayload.z = entity.pos.z + lx * sa + lz * ca;
      rcsPulsePayload.dirX = -sa * side;
      rcsPulsePayload.dirZ = ca * side;
      rcsPulsePayload.intensity = reduced ? 0.55 : 0.9;
      rcsPulsePayload.radius = radius;
      rcsPulsePayload.shipId = entity.id != null ? entity.id : 0;
      rcsPulsePayload.runaway = true;
      busRef.emit('ship:rcsPulse', rcsPulsePayload);
      rec.spiralRcsCd = reduced ? 0.16 : 0.09;
    }
    // Secondary explosions popping through armor seams (before the core lets go).
    rec.spiralPopCd -= dt;
    if (busRef && rec.spiralPopCd <= 0 && age < DEATH_FLASH_AT_S && meshVisible) {
      const seam = Math.random() * Math.PI * 2;
      const rr = radius * (0.2 + Math.random() * 0.35);
      deathPopPayload.x = entity.pos.x + Math.cos(seam) * rr;
      deathPopPayload.z = entity.pos.z + Math.sin(seam) * rr;
      deathPopPayload.radius = radius;
      deathPopPayload.shipId = entity.id != null ? entity.id : 0;
      deathPopPayload.seam = seam;
      busRef.emit('ship:deathPop', deathPopPayload);
      rec.spiralPopCd = reduced ? 0.34 : 0.22;
    }
    // Core detonation flash: light, shake (distance-attenuated by the renderer), boom.
    if (busRef && !rec.spiralFlashDone && age >= DEATH_FLASH_AT_S) {
      rec.spiralFlashDone = true;
      deathFlashPayload.x = entity.pos.x;
      deathFlashPayload.z = entity.pos.z;
      deathFlashPayload.radius = radius;
      deathFlashPayload.shipId = entity.id != null ? entity.id : 0;
      busRef.emit('ship:deathFlash', deathFlashPayload);
      spiralShakePayload.amount = reduced ? 0.12 : 0.3;
      spiralShakePayload.position.x = entity.pos.x;
      spiralShakePayload.position.z = entity.pos.z;
      busRef.emit('camera:shake', spiralShakePayload);
      spiralAudioPayload.id = 'sfx_explosion_small';
      busRef.emit('audio:cue', spiralAudioPayload);
    }
    return true;
  }

  function peekRecord(entityId) {
    return craftMotion.get(entityId) || null;
  }

  function clearRecordMeshRefs(rec) {
    if (!rec) return;
    rec.mountMesh = null;
    rec.bellCount = 0;
    rec.rcsNozzleCount = 0;
    if (rec.bells) rec.bells.length = 0;
    if (rec.rcsNozzles) rec.rcsNozzles.length = 0;
  }

  // Mesh teardown path: the entity may stay alive while its visual boundary is evicted,
  // rebound, or disposed under a recycled id. The record keeps its motion state but must
  // drop every Object3D reference or the old boundary tree stays anchored forever.
  function releaseEntityMesh(entityId) {
    clearRecordMeshRefs(craftMotion.get(entityId));
  }

  // Save-restore reissues ids, so a dead boundary can be pinned by a record whose key was
  // recycled onto a different entity type (that entity's updates never rewrite mountMesh).
  // Releasing by mesh identity covers every record regardless of key churn.
  function releaseMesh(mesh) {
    if (!mesh) return;
    for (const rec of craftMotion.values()) {
      if (rec.mountMesh === mesh) clearRecordMeshRefs(rec);
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of craftMotion.keys()) {
      if (!activeEntityIds.has(id)) {
        craftMotion.delete(id);
      }
    }
    for (const id of spiralDone.keys()) {
      if (!activeEntityIds.has(id)) spiralDone.delete(id);
    }
  }

  return {
    bindEvents,
    unbindEvents,
    updateCraftMicroMotion,
    updateDeathSpiral,
    onFire,
    onVent,
    onDamage,
    onImpact,
    onHazardEnter,
    onHazardExit,
    onJumpChargeStart,
    onJumpChargeTick,
    onJumpStart,
    onJumpArrive,
    onJumpChargeAbort,
    onDocked,
    onUndocked,
    onPlayerRespawn,
    onCloakEngaged,
    onCloakDropped,
    onSwingDash,
    onSubsystemEnabled,
    onChargeStuck,
    onJettison,
    onCountermeasure,
    onBeaconDeployed,
    onScanPulse,
    onTetherLetGo,
    onKilled,
    onSpawned,
    prune,
    releaseEntityMesh,
    releaseMesh,
    getRecord,
    peekRecord,
  };
}

export const globalShipMicroMotion = createShipMicroMotionTracker();
