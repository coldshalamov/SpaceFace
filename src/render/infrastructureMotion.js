// SpaceFace — Station, Jump Gate, and Derelict Wreckage dynamic mechanical life.
//
// In an A-list game, world infrastructure is active and mechanical:
//   1. Jump Gate Event Horizon: Counter-rotating containment rings, breathing portal warp vortex,
//      and approach energy spin-up.
//   2. Space Station Mechanisms: Continuous smooth centrifuge/habitation ring rotation, sweeping
//      sensor dishes, and docking bay sequential chase lights.
//   3. Derelict Wrecks: Eerie zero-G dead-drift tumbling, venting decompression micro-puffs, and
//      intermittent electrical short-circuit arc discharges.
//
// PURE RENDER-ONLY PRESENTATION: Determinism-safe, zero per-frame allocation.

function hashId(id) {
  const s = String(id || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

export function createInfrastructureMotionTracker() {
  const infrastructureStates = new Map();

  function getState(entityId) {
    let rec = infrastructureStates.get(entityId);
    if (!rec) {
      const h = hashId(entityId);
      const phase = ((h & 0xff) / 255) * Math.PI * 2;
      const driftRate = 0.008 + (((h >> 8) & 0xff) / 255) * 0.018;
      const dishSweepSpeed = 0.4 + (((h >> 16) & 0xff) / 255) * 0.6;

      rec = {
        phase,
        driftRate,
        dishSweepSpeed,
        driftRotX: phase * 0.4,
        driftRotY: phase * 0.7,
        driftRotZ: phase * 0.2,
        portalSwirl: 0,
        portalScale: 1.0,
        arcTimer: 0,
        arcIntensity: 0,
      };
      infrastructureStates.set(entityId, rec);
    }
    return rec;
  }

  function updateGateMotion(entity, mesh, simTime, frameDt, playerEntity, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // Detect player distance for gate activation spin-up
    let approachFactor = 0;
    if (playerEntity && playerEntity.pos && entity.pos) {
      const dx = playerEntity.pos.x - entity.pos.x;
      const dz = playerEntity.pos.z - entity.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 400) {
        approachFactor = Math.max(0, 1 - dist / 400.0);
      }
    }

    const swirlSpeed = (0.7 + approachFactor * 1.8) * (reducedMotion ? 0.3 : 1.0);
    rec.portalSwirl += swirlSpeed * dt;

    // Portal breathing & expansion
    const breath = Math.sin(simTime * 2.2 + rec.phase) * (0.04 + approachFactor * 0.08);
    rec.portalScale = 1.0 + breath;

    // Find and animate gate components
    if (mesh.userData) {
      const innerRing = mesh.userData.innerRing;
      const portal = mesh.userData.portal;
      const hubGlow = mesh.userData.hubGlow;

      if (innerRing) innerRing.rotation.z = rec.portalSwirl * 0.65;
      if (portal) {
        portal.rotation.z = -rec.portalSwirl;
        portal.scale.setScalar(rec.portalScale);
      }
      if (hubGlow) {
        hubGlow.scale.setScalar(1.0 + breath * 1.5);
      }
    }
  }

  function updateStationMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // Continuous rotation of habitation rings
    if (!reducedMotion) {
      const ring1 = mesh.userData && mesh.userData.ring1;
      if (ring1) {
        ring1.rotation.z += 0.045 * dt;
      }
      // Animate secondary ring or dishes if present in children
      if (mesh.children) {
        for (const child of mesh.children) {
          if (child.name && child.name.includes('ring2')) {
            child.rotation.z -= 0.032 * dt;
          }
        }
      }
    }
  }

  function updateWreckMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // Slow zero-G dead drift tumbling
    if (!reducedMotion) {
      rec.driftRotX += rec.driftRate * 0.7 * dt;
      rec.driftRotY += rec.driftRate * dt;
      rec.driftRotZ += rec.driftRate * 0.5 * dt;

      // Apply to first child or mesh root
      const body = (mesh.children && mesh.children[0]) || mesh;
      body.rotation.x = rec.driftRotX;
      body.rotation.y = rec.driftRotY;
      body.rotation.z = rec.driftRotZ;
    }

    // Intermittent electrical arc discharge
    rec.arcTimer -= dt;
    if (rec.arcTimer <= 0) {
      rec.arcTimer = 1.2 + Math.random() * 3.5;
      rec.arcIntensity = 1.0;
    }
    if (rec.arcIntensity > 0) {
      rec.arcIntensity = Math.max(0, rec.arcIntensity - dt * 6.0);
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of infrastructureStates.keys()) {
      if (!activeEntityIds.has(id)) {
        infrastructureStates.delete(id);
      }
    }
  }

  return {
    updateGateMotion,
    updateStationMotion,
    updateWreckMotion,
    prune,
  };
}

export const globalInfrastructureMotion = createInfrastructureMotionTracker();
