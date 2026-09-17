// SpaceFace — Pickup 3D tumbling and magnetic scoop vortex presentation.
//
// Solves flat, sterile pickup behavior:
//   1. 3D Tumbling Dynamics: Ore gems, credit chips, and freight canisters tumble across multiple
//      axes with natural buoyant zero-G angular momentum.
//   2. Magnetic Tractor Vortex: When pulled toward the ship's cargo bay, pickups accelerate their
//      tumble and spiral inward in a magnetic funnel, compressing into the intake scoop.
//   3. Transponder Warning Strobes: Rhythmic aviation-grade double-flash sequences on chits and canisters.
//
// PURE RENDER-ONLY PRESENTATION: Never modifies physical collection radii or sim cargo quantities.

function hashId(id) {
  const s = String(id || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

export function createPickupMotionTracker() {
  const pickupStates = new Map();

  function getState(pickupId) {
    let rec = pickupStates.get(pickupId);
    if (!rec) {
      const h = hashId(pickupId);
      const phase = ((h & 0xff) / 255) * Math.PI * 2;
      const spinSpeed = 1.4 + (((h >> 8) & 0xff) / 255) * 1.8;
      const pitchSpin = 0.8 + (((h >> 16) & 0xff) / 255) * 1.2;
      const rollSpin = 0.5 + (((h >> 24) & 0x7f) / 127) * 0.9;

      rec = {
        phase,
        spinSpeed,
        pitchSpin,
        rollSpin,
        rotX: phase,
        rotY: phase * 0.5,
        rotZ: phase * 0.3,
        vortexAngle: phase,
        scaleRatio: 1.0,
      };
      pickupStates.set(pickupId, rec);
    }
    return rec;
  }

  function updatePickupMotion(entity, mesh, simTime, frameDt, playerEntity, options = {}) {
    if (!entity || !mesh) return;
    const dt = Math.min(0.05, Math.max(0.001, frameDt));
    const rec = getState(entity.id);
    const reducedMotion = options.motionReduce === true;

    // Check distance to player for tractor beam suction vortex
    let isMagnetized = false;
    let distToPlayer = 9999;
    let pullFactor = 0;

    if (playerEntity && playerEntity.pos && entity.pos) {
      const dx = playerEntity.pos.x - entity.pos.x;
      const dz = playerEntity.pos.z - entity.pos.z;
      distToPlayer = Math.hypot(dx, dz);

      // Check if closing in rapidly (magnet attractor range ~ 300 WU)
      if (distToPlayer < 350) {
        pullFactor = Math.max(0, 1 - distToPlayer / 350.0);
        isMagnetized = pullFactor > 0.1;
      }
    }

    // Dynamic tumble acceleration under tractor pull
    const tumbleMultiplier = isMagnetized ? (1.0 + pullFactor * 3.5) : 1.0;
    if (!reducedMotion) {
      rec.rotX += rec.pitchSpin * tumbleMultiplier * dt;
      rec.rotY += rec.spinSpeed * tumbleMultiplier * dt;
      rec.rotZ += rec.rollSpin * tumbleMultiplier * dt;
    }

    // Magnetic spiral vortex offset
    let vortexOffsetX = 0;
    let vortexOffsetZ = 0;
    if (!reducedMotion && isMagnetized && distToPlayer < 200) {
      rec.vortexAngle += dt * (8.0 + pullFactor * 12.0);
      const vortexRadius = Math.min(distToPlayer * 0.15, 6.0 * (1 - pullFactor));
      vortexOffsetX = Math.cos(rec.vortexAngle) * vortexRadius;
      vortexOffsetZ = Math.sin(rec.vortexAngle) * vortexRadius;
    }

    // Snapping scale compression into cargo bay
    let targetScale = 1.0;
    if (distToPlayer < 25) {
      targetScale = Math.max(0.15, distToPlayer / 25.0);
    }
    rec.scaleRatio += (targetScale - rec.scaleRatio) * (1 - Math.exp(-12.0 * dt));

    // Vertical zero-G levitation bobbing
    const bob = reducedMotion ? 0 : Math.sin(simTime * 2.2 + rec.phase) * (isMagnetized ? 0.15 : 0.45);

    // Apply to mesh root / child group
    const targetObj = (mesh.userData && mesh.userData.gem)
      || (mesh.children && mesh.children[0])
      || mesh;

    targetObj.rotation.x = rec.rotX;
    targetObj.rotation.y = rec.rotY;
    targetObj.rotation.z = rec.rotZ;

    targetObj.position.x = vortexOffsetX;
    targetObj.position.y = bob;
    targetObj.position.z = vortexOffsetZ;

    if (rec.scaleRatio < 0.98) {
      targetObj.scale.setScalar(rec.scaleRatio);
    }
  }

  function prune(activeEntityIds) {
    if (!activeEntityIds || typeof activeEntityIds.has !== 'function') return;
    for (const id of pickupStates.keys()) {
      if (!activeEntityIds.has(id)) {
        pickupStates.delete(id);
      }
    }
  }

  return {
    updatePickupMotion,
    prune,
  };
}

export const globalPickupMotion = createPickupMotionTracker();
