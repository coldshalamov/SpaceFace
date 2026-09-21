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
        portalBase: -1,    // captured lazily — portal/hubGlow bases are R-scaled at build
        hubGlowBase: -1,
        arcTimer: 0,
        arcIntensity: 0,
        arcCount: 0,
        hash: h,
        dishNodes: null,   // lazy [{ node, baseY }] — swept sensor hardware, scanned once
        dishScanned: false,
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

    // Find and animate gate components. This tracker is the sole transform owner — bases are
    // captured on first contact because build code pre-scales nodes by the structure radius.
    if (mesh.userData) {
      const innerRing = mesh.userData.innerRing;
      const portal = mesh.userData.portal;
      const hubGlow = mesh.userData.hubGlow;

      if (innerRing) innerRing.rotation.z = rec.portalSwirl * 0.65;
      if (portal) {
        if (rec.portalBase < 0) {
          rec.portalBase = (portal.scale && Number.isFinite(portal.scale.x)) ? portal.scale.x : 1;
        }
        portal.rotation.z = -rec.portalSwirl;
        if (portal.scale && typeof portal.scale.setScalar === 'function') {
          portal.scale.setScalar(rec.portalBase * rec.portalScale);
        }
      }
      if (hubGlow) {
        if (rec.hubGlowBase < 0) {
          rec.hubGlowBase = (hubGlow.scale && Number.isFinite(hubGlow.scale.x)) ? hubGlow.scale.x : 1;
        }
        if (hubGlow.scale && typeof hubGlow.scale.setScalar === 'function') {
          hubGlow.scale.setScalar(rec.hubGlowBase * (1.0 + breath * 1.5));
        }
      }
    }
  }

  function updateStationMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // Continuous rotation of habitation rings — per-station rate variety from the id hash.
    const ringRate = 0.03 + rec.dishSweepSpeed * 0.04;
    if (!reducedMotion) {
      const ring1 = mesh.userData && mesh.userData.ring1;
      // gapLocked rings carry a real corridor arc aligned to the collision proxy's navigable
      // gap — spinning them would swing the drawn opening away from the collider's opening.
      if (ring1 && !(ring1.userData && ring1.userData.gapLocked)) {
        ring1.rotation.z += ringRate * dt;
      }
      const ring2 = mesh.userData && mesh.userData.ring2;
      if (ring2) {
        ring2.rotation.z -= ringRate * 0.7 * dt;
      } else if (mesh.children) {
        // Fallback: name-matched secondary ring (procedural builds register userData.ring2).
        for (const child of mesh.children) {
          if (child.name && child.name.indexOf('ring2') >= 0) {
            child.rotation.z -= ringRate * 0.7 * dt;
          }
        }
      }
    }

    // Sensor-dish sweep: slow yaw hunting on dish/radar/antenna hardware. Procedural stations
    // have none today; authored station kits that name nodes this way light up for free.
    if (!rec.dishScanned) {
      rec.dishScanned = true;
      if (mesh.children) {
        for (const child of mesh.children) {
          const n = child.name ? child.name.toLowerCase() : '';
          if ((n.indexOf('dish') >= 0 || n.indexOf('radar') >= 0 || n.indexOf('antenna') >= 0)
              && child.rotation) {
            if (!rec.dishNodes) rec.dishNodes = [];
            rec.dishNodes.push({
              node: child,
              baseY: Number.isFinite(child.rotation.y) ? child.rotation.y : 0,
            });
          }
        }
      }
    }
    if (rec.dishNodes) {
      const sweep = reducedMotion ? 0 : Math.sin(simTime * rec.dishSweepSpeed + rec.phase) * 1.2;
      for (let i = 0; i < rec.dishNodes.length; i++) {
        const d = rec.dishNodes[i];
        d.node.rotation.y = d.baseY + sweep;
      }
    }
  }

  function updateWreckMotion(entity, mesh, simTime, frameDt, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // Slow zero-G dead drift: a bounded wobble riding the entity's real yaw. Wrecks now carry an
    // elongated capsule collider aligned with the spine, so the visual may only oscillate around
    // the sim-authored heading — an accumulating tumble would swing the drawn hulk through space
    // the collider doesn't occupy.
    if (!reducedMotion) {
      rec.driftRotX += rec.driftRate * 0.7 * dt;
      rec.driftRotY += rec.driftRate * dt;
      rec.driftRotZ += rec.driftRate * 0.5 * dt;

      // Apply to first child or mesh root
      const body = (mesh.children && mesh.children[0]) || mesh;
      body.rotation.x = Math.sin(rec.driftRotX) * 0.16;
      body.rotation.y = Math.sin(rec.driftRotY) * 0.10;
      body.rotation.z = Math.cos(rec.driftRotZ) * 0.12;
    }

    // Intermittent electrical arc discharge — deterministic schedule from the id hash (each
    // strike advances the mix), and the discharge physically JOLTS the dead hull: a brief
    // asymmetric twitch riding on the drift pose.
    rec.arcTimer -= dt;
    if (rec.arcTimer <= 0) {
      const next = hashId(String(entity.id) + ':' + rec.arcCount);
      rec.arcCount++;
      rec.arcTimer = 1.2 + ((next & 0xff) / 255) * 3.5;
      rec.arcIntensity = 1.0;
    }
    if (rec.arcIntensity > 0) {
      rec.arcIntensity = Math.max(0, rec.arcIntensity - dt * 6.0);
      if (!reducedMotion) {
        const body = (mesh.children && mesh.children[0]) || mesh;
        const jolt = rec.arcIntensity * rec.arcIntensity * 0.028;
        body.rotation.y += Math.sin(simTime * 71.0 + rec.phase) * jolt;
        body.rotation.z += Math.cos(simTime * 83.0 + rec.phase * 1.7) * jolt;
      }
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
