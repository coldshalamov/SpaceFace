// SpaceFace — Asteroid 3D tumble, mining laser reaction, and impact wobble presentation.
//
// In an A-list space title, asteroids are living celestial bodies, not frozen plastic props:
//   1. Multi-axis Zero-G Tumble: Every asteroid in the sector rotates with realistic 3-axis
//      angular momentum determined deterministically from its unique entity ID.
//   2. Mining Laser Thermal Reaction: When struck by an industrial mining laser or cutting beam,
//      the rock experiences high-frequency thermal micro-jitter and vein luminance agitation.
//   3. Impact Wobble: Projectile strikes and kinetic collisions impart rotational recoil wobble
//      that smoothly damps down over ~1.2s.
//
// PURE RENDER-ONLY PRESENTATION: Never alters physics positions/radii, zero per-frame garbage.

function hashId(id) {
  const s = String(id || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

export function createAsteroidMotionTracker() {
  const asteroidStates = new Map();
  let busSubscribers = [];
  let currentMinedTargetId = null;

  function getState(asteroidId) {
    let rec = asteroidStates.get(asteroidId);
    if (!rec) {
      const h = hashId(asteroidId);
      const rnd1 = ((h & 0xff) / 255) - 0.5;
      const rnd2 = (((h >> 8) & 0xff) / 255) - 0.5;
      const rnd3 = (((h >> 16) & 0xff) / 255) - 0.5;

      // Realistic slow space tumble rates (0.015 - 0.055 rad/s)
      const speedScale = 0.015 + ((h >> 24) & 0x7f) / 127 * 0.035;
      const spinX = (rnd1 < 0 ? -1 : 1) * (0.3 + Math.abs(rnd1)) * speedScale;
      const spinY = (rnd2 < 0 ? -1 : 1) * (0.3 + Math.abs(rnd2)) * speedScale;
      const spinZ = (rnd3 < 0 ? -1 : 1) * (0.3 + Math.abs(rnd3)) * speedScale;

      rec = {
        rotX: rnd1 * Math.PI,
        rotY: rnd2 * Math.PI,
        rotZ: rnd3 * Math.PI,
        spinX,
        spinY,
        spinZ,
        wobbleMag: 0,
        wobblePhase: 0,
        miningAgitation: 0,
        lastTime: 0,
      };
      asteroidStates.set(asteroidId, rec);
    }
    return rec;
  }

  function onDamage(payload) {
    if (!payload || !payload.targetId) return;
    const rec = asteroidStates.get(payload.targetId);
    if (!rec) return;
    const dmg = Number(payload.damage) || 15;
    rec.wobbleMag = Math.min(0.22, rec.wobbleMag + dmg * 0.008);
  }

  function onImpact(payload) {
    if (!payload) return;
    const aId = payload.aId || (payload.entityA && payload.entityA.id);
    const bId = payload.bId || (payload.entityB && payload.entityB.id);
    const dv = Number(payload.deltaV) || Number(payload.dv) || 20;

    for (const id of [aId, bId]) {
      if (!id) continue;
      const rec = asteroidStates.get(id);
      if (rec) {
        rec.wobbleMag = Math.min(0.28, rec.wobbleMag + dv * 0.005);
      }
    }
  }

  function onMiningContact(payload) {
    if (!payload) return;
    if (payload.targetId) currentMinedTargetId = payload.targetId;
  }

  function onMiningStop() {
    currentMinedTargetId = null;
  }

  function bindEvents(bus) {
    if (!bus || typeof bus.on !== 'function') return;
    busSubscribers.push(bus.on('combat:damage', onDamage));
    busSubscribers.push(bus.on('physics:impact', onImpact));
    busSubscribers.push(bus.on('mining:beamContact', onMiningContact));
    busSubscribers.push(bus.on('combat:beamStop', onMiningStop));
  }

  function unbindEvents() {
    for (const unsub of busSubscribers) {
      if (typeof unsub === 'function') unsub();
    }
    busSubscribers = [];
    asteroidStates.clear();
    currentMinedTargetId = null;
  }

  function updateAsteroidMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // 1. Advance 3-axis tumble
    if (!reducedMotion) {
      rec.rotX += rec.spinX * dt;
      rec.rotY += rec.spinY * dt;
      rec.rotZ += rec.spinZ * dt;
    }

    // 2. Impact wobble spring decay
    let wobbleOffsetX = 0;
    let wobbleOffsetZ = 0;
    if (rec.wobbleMag > 0.001) {
      rec.wobblePhase += dt * 14.0;
      rec.wobbleMag *= Math.exp(-3.2 * dt);
      if (!reducedMotion) {
        wobbleOffsetX = Math.sin(rec.wobblePhase) * rec.wobbleMag;
        wobbleOffsetZ = Math.cos(rec.wobblePhase * 1.3) * rec.wobbleMag;
      }
    }

    // 3. Mining laser thermal agitation jitter
    let jitterX = 0;
    let jitterZ = 0;
    const isBeingMined = currentMinedTargetId === entity.id
      || !!(entity.data && entity.data.isBeingMined);

    if (isBeingMined) {
      rec.miningAgitation = Math.min(1.0, rec.miningAgitation + dt * 8.0);
    } else {
      rec.miningAgitation = Math.max(0, rec.miningAgitation - dt * 6.0);
    }

    if (!reducedMotion && rec.miningAgitation > 0.01) {
      const jitPhase = simTime * 95.0;
      const mag = rec.miningAgitation * 0.05;
      jitterX = Math.sin(jitPhase) * mag;
      jitterZ = Math.cos(jitPhase * 1.25) * mag;
    }

    // Apply rotation and jitter to the main asteroid body mesh
    // Asteroid mesh is child 0 or userData.asteroidInstanceBody
    const body = (mesh.userData && mesh.userData.asteroidInstanceBody)
      || (mesh.children && mesh.children[0])
      || mesh;

    body.rotation.x = rec.rotX + wobbleOffsetX;
    body.rotation.y = rec.rotY;
    body.rotation.z = rec.rotZ + wobbleOffsetZ;

    body.position.x = jitterX;
    body.position.z = jitterZ;
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of asteroidStates.keys()) {
      if (!activeEntityIds.has(id)) {
        asteroidStates.delete(id);
      }
    }
  }

  return {
    bindEvents,
    unbindEvents,
    updateAsteroidMotion,
    onDamage,
    onImpact,
    prune,
  };
}

export const globalAsteroidMotion = createAsteroidMotionTracker();
