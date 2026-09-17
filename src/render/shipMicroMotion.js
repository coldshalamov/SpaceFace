// SpaceFace — Ship micro-motion and physical reaction presentation system.
//
// Solves the #1 "space game feels stiff and lifeless" problem:
//   1. Weapon Fire Mechanical Recoil: Hull kicks backward along local -X on firing, scaled by
//      weapon weight class, with snappy critically damped spring recovery.
//   2. Weapon Barrel Recoil Stroke: Individual weapon barrels visibly stroke backward on the ship
//      mesh when their hardpoint discharges and spring return forward.
//   3. Mining Drill Rotation: Auger bit spins rapidly when mining laser / extractor is active.
//   4. Combat Damage Impact Flinch: When struck by projectiles or collision, the hull receives an
//      angular and positional jolt away from the impact vector, plus a decaying strike shudder.
//   5. Propulsion Throttle Dynamics: Throttle acceleration produces slight nose-up squat; retro
//      braking produces a nose-down dive into the retro burn.
//   6. Turn Bank Overshoot & Harmonic Settle: Rolling out of a hard turn exhibits slight inertia
//      rebound before locking solid.
//   7. Powerplant Shudder: At maximum boost or throttle, high-frequency micro-tremor conveys engine strain.
//   8. Zero-G Spatial Breathing: When stopped or cruising, subtle multi-axis attitude drift gives
//      the craft living presence.
//
// PURE RENDER-ONLY PRESENTATION: Never mutates sim state, determinism-safe, zero per-frame garbage.

const RECOIL_DEFS = Object.freeze({
  light:     { kickX: 0.12, pitchRise: 0.015, duration: 0.09, freq: 28 },
  medium:    { kickX: 0.24, pitchRise: 0.030, duration: 0.13, freq: 22 },
  heavy:     { kickX: 0.48, pitchRise: 0.055, duration: 0.18, freq: 16 },
  explosive: { kickX: 0.40, pitchRise: 0.045, duration: 0.20, freq: 14 },
  beam:      { kickX: 0.06, pitchRise: 0.008, duration: 0.06, freq: 35 },
});

function resolveRecoilClass(weaponId, def = null) {
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

        // Flight surge & settle
        prevSpeed: null,
        accelSurge: 0,
        accelVel: 0,
        bankOvershoot: 0,
        prevBank: 0,

        // Idle breathing phase
        idlePhase: (Number(entityId) * 1.6180339887) % (Math.PI * 2),

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

    // Track hardpoint-specific barrel recoil
    rec.lastFiredHardpoint = payload.hardpointIdx != null ? payload.hardpointIdx : -1;
    rec.lastFiredTime = Date.now();
    rec.lastFiredKick = rClass.kickX;
  }

  function onDamage(payload) {
    if (!payload || !payload.targetId) return;
    const rec = getRecord(payload.targetId);
    const dmg = Number(payload.damage) || 10;
    const hitNormal = payload.hitNormal || null;

    // Relative impact magnitude capped to safe non-nauseating bounds
    const intensity = Math.min(1.2, Math.max(0.15, dmg / 35.0));

    if (hitNormal) {
      // Local impact deflection
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

  function bindEvents(bus) {
    if (!bus || typeof bus.on !== 'function') return;
    busSubscribers.push(bus.on('combat:fire', onFire));
    busSubscribers.push(bus.on('combat:damage', onDamage));
    busSubscribers.push(bus.on('physics:impact', onImpact));
  }

  function unbindEvents() {
    for (const unsub of busSubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    busSubscribers = [];
    craftMotion.clear();
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

    // 3. Flight throttle surge & reverse dive
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

    // 4. Boost powerplant micro-vibration
    let boostJitterX = 0;
    let boostJitterY = 0;
    if (!reducedMotion && isBoosting && speed > 20) {
      const vFreq = simTime * 190.0;
      boostJitterX = Math.sin(vFreq) * 0.022;
      boostJitterY = Math.cos(vFreq * 1.3) * 0.018;
    }

    // 5. Zero-G spatial breathing (at low velocities)
    let idleBreathRoll = 0;
    let idleBreathPitch = 0;
    let idleBreathHeave = 0;
    if (!reducedMotion && speed < 12) {
      const bScale = Math.max(0, 1 - speed / 12.0);
      const t = simTime * 1.4 + rec.idlePhase;
      idleBreathRoll = Math.sin(t * 0.85) * 0.007 * bScale;
      idleBreathPitch = Math.cos(t * 1.15) * 0.005 * bScale;
      idleBreathHeave = Math.sin(t * 1.6) * 0.035 * bScale;
    }

    // High frequency shudder synthesis
    const shudderPhase = simTime * 140.0;
    const totalShudder = (rec.recoilShudder + rec.flinchShudder) * (reducedMotion ? 0.2 : 1.0);
    const shudderOffset = totalShudder > 0.002
      ? Math.sin(shudderPhase) * totalShudder * 0.35
      : 0;

    // Apply composite displacements to hull.position (local space: +X forward, +Y up, +Z lateral)
    const surgeSquatX = rec.accelSurge * 0.8;
    if (!reducedMotion) {
      hull.position.x = rec.recoilX + rec.flinchX + boostJitterX + surgeSquatX;
      hull.position.y = idleBreathHeave + boostJitterY;
      hull.position.z = rec.flinchZ + shudderOffset;
    } else {
      hull.position.x = rec.recoilX * 0.3;
      hull.position.y = 0;
      hull.position.z = 0;
    }

    // Additive secondary angular micro-motion
    hull.rotation.x += (rec.flinchRoll + idleBreathRoll) * (reducedMotion ? 0.3 : 1.0);
    hull.rotation.z += (rec.recoilPitch + rec.flinchPitch + rec.accelSurge + idleBreathPitch) * (reducedMotion ? 0.3 : 1.0);

    // 6. Mechanical weapon barrel recoil stroke on hardpoints
    const weapons = (mesh.userData && mesh.userData.weapons)
      || (hull.userData && hull.userData.weapons);
    if (weapons && Array.isArray(weapons)) {
      const nowMs = Date.now();
      for (let i = 0; i < weapons.length; i++) {
        const wProp = weapons[i];
        if (!wProp || !wProp.userData || !wProp.userData.barrel) continue;
        const barrel = wProp.userData.barrel;
        if (wProp.userData.barrelBaseX == null) {
          wProp.userData.barrelBaseX = barrel.position.x;
          wProp.userData.barrelRecoilX = 0;
        }

        // Trigger kick if this hardpoint just fired
        if (rec.lastFiredHardpoint === i || rec.lastFiredHardpoint === -1) {
          wProp.userData.barrelRecoilX = -Math.max(0.14, (rec.lastFiredKick || 0.2) * 0.7);
        }

        // Critically damped return
        if (Math.abs(wProp.userData.barrelRecoilX) > 0.001) {
          wProp.userData.barrelRecoilX *= Math.exp(-22.0 * dt);
          barrel.position.x = wProp.userData.barrelBaseX + wProp.userData.barrelRecoilX;
        } else if (wProp.userData.barrelRecoilX !== 0) {
          wProp.userData.barrelRecoilX = 0;
          barrel.position.x = wProp.userData.barrelBaseX;
        }
      }
      rec.lastFiredHardpoint = -999;
    }

    // 7. Mining drill auger rotation
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

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of craftMotion.keys()) {
      if (!activeEntityIds.has(id)) {
        craftMotion.delete(id);
      }
    }
  }

  return {
    bindEvents,
    unbindEvents,
    updateCraftMicroMotion,
    onFire,
    onDamage,
    onImpact,
    prune,
  };
}

export const globalShipMicroMotion = createShipMicroMotionTracker();
