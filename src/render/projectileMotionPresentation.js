// SpaceFace — Projectile and ordnance motion presentation system.
//
// Solves visual stiffness in guided missiles and heavy torpedoes:
//   1. Guided Missile Attitude Hunting: High-frequency attitude correction oscillation
//      simulates rapid RCS gimbaling as missiles track targets in 3D.
//   2. Torpedo Heavy Warhead Arming Pulse: As torpedoes accelerate away from the tube,
//      their warhead containment field pulses with an accelerating blackbody strobe.
//   3. Helical Corkscrew Vapor Trails: Deterministic spiral offsets for smoke wakes.
//   4. Launch Stretch: ordnance kicks out of the tube — a squash-stretch along the bolt axis
//      that settles over ~0.3s, so a launch reads as a shot, not a spawn.
//   5. Propellant Fizzle: as ttl runs out the round burns down and shrinks away instead of
//      blinking out of existence mid-flight.
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

    // Birth time: prefer a real spawn stamp, else the first frame this mesh was presented.
    // `entity.spawnTime` was never written by the sim — without the mesh-side stamp the
    // torpedo's "accelerating" strobe stayed pinned at its launch cadence forever.
    let bornAt = entity.spawnTime;
    if (!Number.isFinite(bornAt)) bornAt = data.spawnedAt;
    if (!Number.isFinite(bornAt)) {
      if (mesh.userData && !Number.isFinite(mesh.userData.projBornAt)) {
        mesh.userData.projBornAt = simTime;
      }
      bornAt = mesh.userData && Number.isFinite(mesh.userData.projBornAt)
        ? mesh.userData.projBornAt : simTime;
    }
    const age = Math.max(0, simTime - bornAt);

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
        const flightTime = age;
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

    // 4/5. Launch stretch + propellant fizzle on the mesh ROOT scale. Root scale is
    // set-once-at-build (geometry children carry the real proportions), so the tracker owns it
    // multiplicatively off a lazily captured base — absolute application, no drift.
    let scaleMulX = 1;
    let scaleMulT = 1; // transverse (y/z)
    if (age < 0.28) {
      const kick = Math.exp(-age * 9.0);
      scaleMulX *= 1 + 0.45 * kick;
      scaleMulT *= 1 - 0.16 * kick;
    }
    const ttl = Number.isFinite(entity.ttl) ? entity.ttl : Infinity;
    if (ttl < 0.35) {
      const f = Math.max(0.05, ttl / 0.35);
      scaleMulX *= f;
      scaleMulT *= f;
    }
    if (mesh.scale && mesh.userData
        && (scaleMulX !== 1 || scaleMulT !== 1 || mesh.userData.projScaleDirty)) {
      if (!Number.isFinite(mesh.userData.projBaseScaleX)) {
        mesh.userData.projBaseScaleX = Number.isFinite(mesh.scale.x) ? mesh.scale.x : 1;
        mesh.userData.projBaseScaleY = Number.isFinite(mesh.scale.y) ? mesh.scale.y : 1;
        mesh.userData.projBaseScaleZ = Number.isFinite(mesh.scale.z) ? mesh.scale.z : 1;
      }
      const tx = mesh.userData.projBaseScaleX * scaleMulX;
      const ty = mesh.userData.projBaseScaleY * scaleMulT;
      const tz = mesh.userData.projBaseScaleZ * scaleMulT;
      if (typeof mesh.scale.set === 'function') mesh.scale.set(tx, ty, tz);
      else { mesh.scale.x = tx; mesh.scale.y = ty; mesh.scale.z = tz; }
      mesh.userData.projScaleDirty = (scaleMulX !== 1 || scaleMulT !== 1);
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
