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
//
// PURE RENDER-ONLY PRESENTATION: Never mutates sim state, determinism-safe, zero per-frame garbage.
// Transform-only mesh edits (position/rotation/scale); shared materials are never touched.

import { resolveRcsFirings, resolveActuatorScale } from './rcsJets.js';

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
    const dmg = Number(payload.damage) || 10;
    const hitNormal = payload.hitNormal || null;

    const intensity = Math.min(1.2, Math.max(0.15, dmg / 35.0));

    if (hitNormal) {
      rec.flinchVelRoll += (hitNormal.z || (Math.random() - 0.5)) * intensity * 3.5;
      rec.flinchVelPitch += (hitNormal.x || (Math.random() - 0.5)) * intensity * 2.8;
      rec.flinchX += (hitNormal.x || 0) * intensity * 0.25;
      rec.flinchZ += (hitNormal.z || 0) * intensity * 0.25;
    } else {
      rec.flinchVelRoll += (Math.random() - 0.5) * intensity * 4.0;
      rec.flinchVelPitch += (Math.random() - 0.5) * intensity * 3.0;
    }
    rec.flinchShudder = Math.min(0.35, rec.flinchShudder + intensity * 0.25);
  }

  function onImpact(payload) {
    if (!payload) return;
    const aId = payload.aId || (payload.entityA && payload.entityA.id);
    const bId = payload.bId || (payload.entityB && payload.entityB.id);
    const dv = Number(payload.deltaV) || Number(payload.dv) || 15;
    const intensity = Math.min(1.5, dv / 40.0);

    if (aId) {
      const rec = getRecord(aId);
      rec.flinchVelPitch += (Math.random() - 0.5) * intensity * 4.0;
      rec.flinchVelRoll += (Math.random() - 0.5) * intensity * 5.0;
      rec.flinchShudder = Math.min(0.4, rec.flinchShudder + intensity * 0.3);
    }
    if (bId) {
      const rec = getRecord(bId);
      rec.flinchVelPitch += (Math.random() - 0.5) * intensity * 4.0;
      rec.flinchVelRoll += (Math.random() - 0.5) * intensity * 5.0;
      rec.flinchShudder = Math.min(0.4, rec.flinchShudder + intensity * 0.3);
    }
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

  function onDocked(payload) {
    const id = payload && (payload.playerId || payload.id);
    if (!id) return;
    const rec = getRecord(id);
    rec.recoilVelX -= 1.4; // heavy mechanical clamp rebound
    rec.flinchVelPitch += (Math.random() - 0.5) * 2.5;
    rec.flinchShudder = Math.max(rec.flinchShudder, 0.5);
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
  function scanMountPivots(rec, mesh, hull) {
    rec.mountMesh = mesh;
    rec.bellCount = 0;
    rec.rcsNozzleCount = 0;
    rec.flareApplied = 1;
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
  }

  function unbindEvents() {
    for (const unsub of busSubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    busSubscribers = [];
    busRef = null;
    craftMotion.clear();
    clearSpiralMemory();
  }

  function updateCraftMicroMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const hull = mesh.userData && mesh.userData.hull;
    if (!hull) return;

    const reducedMotion = options.motionReduce === true;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getRecord(entity.id);

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
    const gimbalScale = reducedMotion ? 0.5 : 1.0;
    const targetGimbalYaw = (yawN - latN) * GIMBAL_YAW_MAX * gimbalScale;
    const targetGimbalPitch = -mainN * GIMBAL_PITCH_MAX * gimbalScale;
    const gimbalK = 1 - Math.exp(-GIMBAL_SMOOTH * dt);
    rec.gimbalYaw += (targetGimbalYaw - rec.gimbalYaw) * gimbalK;
    rec.gimbalPitch += (targetGimbalPitch - rec.gimbalPitch) * gimbalK;
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

    // 9. High frequency shudder synthesis
    const shudderPhase = simTime * 140.0;
    const totalShudder = (rec.recoilShudder + rec.flinchShudder) * (reducedMotion ? 0.2 : 1.0);
    const shudderOffset = totalShudder > 0.002
      ? Math.sin(shudderPhase) * totalShudder * 0.35
      : 0;

    // Apply composite displacements to hull.position (local space: +X forward, +Y up, +Z lateral)
    const surgeSquatX = rec.accelSurge * 0.8;
    if (!reducedMotion) {
      hull.position.x = rec.recoilX + rec.flinchX + boostJitterX + surgeSquatX + jumpShudderX + rcsKickFwd;
      hull.position.y = idleBreathHeave + boostJitterY;
      hull.position.z = rec.flinchZ + shudderOffset + jumpShudderZ + rcsKickLat;
    } else {
      hull.position.x = rec.recoilX * 0.3 + rcsKickFwd * 0.3;
      hull.position.y = 0;
      hull.position.z = rcsKickLat * 0.3;
    }

    // Additive secondary angular micro-motion
    hull.rotation.x += (rec.flinchRoll + idleBreathRoll + rcsRoll) * (reducedMotion ? 0.3 : 1.0);
    hull.rotation.z += (rec.recoilPitch + rec.flinchPitch + rec.accelSurge + idleBreathPitch + rcsPitchKick) * (reducedMotion ? 0.3 : 1.0);

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
    onKilled,
    onSpawned,
    prune,
    getRecord,
  };
}

export const globalShipMicroMotion = createShipMicroMotionTracker();
