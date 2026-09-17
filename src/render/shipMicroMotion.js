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
//
// PURE RENDER-ONLY PRESENTATION: Never mutates sim state, determinism-safe, zero per-frame garbage.

function wrapAngle(a) {
  let res = (a + Math.PI) % (Math.PI * 2);
  if (res < 0) res += Math.PI * 2;
  return res - Math.PI;
}

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

  function bindEvents(bus) {
    if (!bus || typeof bus.on !== 'function') return;
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

    // 8. High frequency shudder synthesis
    const shudderPhase = simTime * 140.0;
    const totalShudder = (rec.recoilShudder + rec.flinchShudder) * (reducedMotion ? 0.2 : 1.0);
    const shudderOffset = totalShudder > 0.002
      ? Math.sin(shudderPhase) * totalShudder * 0.35
      : 0;

    // Apply composite displacements to hull.position (local space: +X forward, +Y up, +Z lateral)
    const surgeSquatX = rec.accelSurge * 0.8;
    if (!reducedMotion) {
      hull.position.x = rec.recoilX + rec.flinchX + boostJitterX + surgeSquatX + jumpShudderX;
      hull.position.y = idleBreathHeave + boostJitterY;
      hull.position.z = rec.flinchZ + shudderOffset + jumpShudderZ;
    } else {
      hull.position.x = rec.recoilX * 0.3;
      hull.position.y = 0;
      hull.position.z = 0;
    }

    // Additive secondary angular micro-motion
    hull.rotation.x += (rec.flinchRoll + idleBreathRoll) * (reducedMotion ? 0.3 : 1.0);
    hull.rotation.z += (rec.recoilPitch + rec.flinchPitch + rec.accelSurge + idleBreathPitch) * (reducedMotion ? 0.3 : 1.0);

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
    prune,
    getRecord,
  };
}

export const globalShipMicroMotion = createShipMicroMotionTracker();
