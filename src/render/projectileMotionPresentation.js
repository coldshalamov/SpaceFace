// SpaceFace — Projectile and ordnance motion presentation system.
//
// Solves visual stiffness in guided missiles and heavy torpedoes:
//   1. Guided Missile Attitude Hunting: High-frequency attitude correction oscillation
//      simulates rapid RCS gimbaling as missiles track targets in 3D.
//   2. Torpedo Heavy Warhead Arming Pulse: As torpedoes accelerate away from the tube,
//      their warhead containment field pulses with an accelerating blackbody strobe.
//   3. Helical Corkscrew Vapor Trails: Deterministic spiral offsets for smoke wakes.
//
// PURE PRESENTATION LAYER: No simulation mutation, determinism-safe, zero allocations.

export function createProjectileMotionTracker() {
  function updateProjectileMotion(entity, mesh, simTime, frameDt, a11y = {}) {
    if (!entity || !mesh) return;
    const reducedMotion = a11y && a11y.reducedMotion === true;
    const reducedFlash = a11y && a11y.reducedFlash === true;
    const data = entity.data || {};
    const weaponId = String(data.weaponId || '').toLowerCase();
    const isMissile = data.kind === 'missile' || weaponId.includes('missile');
    const isTorpedo = weaponId.includes('torpedo');

    if (!isMissile && !isTorpedo) return;

    const entIdNum = Number(entity.id) || 1;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));

    // 1. Guided missile attitude hunting (RCS pulse oscillation)
    if (!reducedMotion) {
      const wobbleFreq = 26.0;
      const phase = (entIdNum * 13.37) + simTime * wobbleFreq;
      // High-frequency attitude micro-oscillation in roll/pitch
      const wobbleRoll = Math.sin(phase) * 0.14;
      const wobblePitch = Math.cos(phase * 0.85) * 0.08;
      mesh.rotation.z += wobbleRoll;
      mesh.rotation.x += wobblePitch;
    }

    // 2. Torpedo warhead arming heartbeat strobe
    if (isTorpedo) {
      const warhead = (mesh.userData && mesh.userData.warhead)
        || mesh.getObjectByName('ProjectileMissileWarhead');
      if (warhead && warhead.material && warhead.material.emissive) {
        // Frequency accelerates as the torpedo flies
        const flightTime = Math.max(0, simTime - (entity.spawnTime || simTime));
        const pulseHz = 2.0 + Math.min(7.0, flightTime * 3.0);
        // Reduced flash must not be handed a 2-9 Hz strobe. The arming state stays LEGIBLE - the
        // warhead still runs hot and still brightens as it arms - it simply stops blinking, which
        // is the whole point of the profile. Reduced motion keeps the beat: it is a state tell,
        // not decorative movement.
        const pulse = reducedFlash
          ? 0.35 + 0.25 * Math.min(1, flightTime * 0.5)
          : Math.pow(Math.max(0, Math.sin(simTime * pulseHz * Math.PI * 2)), 5.0);

        if (!reducedFlash && pulse > 0.6) {
          warhead.material.emissive.set('#fff2a0');
          warhead.material.emissiveIntensity = 2.5 + pulse * 2.5;
        } else {
          warhead.material.emissive.set('#ff3300');
          warhead.material.emissiveIntensity = 0.4 + pulse * 1.6;
        }
      }
    }
  }

  function calculateCorkscrewOffset(entityId, simTime, backX, backZ, radius = 0.45, out = { x: 0, z: 0 }) {
    const phase = (Number(entityId || 0) * 19.1) + simTime * 24.0;
    // Perpendicular vector to velocity/back vector in XZ plane
    const perpX = -backZ;
    const perpZ = backX;
    const s = Math.sin(phase) * radius;
    out.x = perpX * s;
    out.z = perpZ * s;
    return out;
  }

  return {
    updateProjectileMotion,
    calculateCorkscrewOffset,
  };
}

export const globalProjectileMotion = createProjectileMotionTracker();
