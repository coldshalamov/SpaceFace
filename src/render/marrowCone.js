// Nose cone for The Bolus. Dims the legal rig after the palette lerp and aims a short spot
// along the ship's forward. Does not author a darker lighting profile.

import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../data/theBolus.js';

const DIM = Object.freeze({ ambient: 0.35, key: 0.28, rim: 0.45, fill: 0.4 });
const scratch = { x: 0, z: 0 };

export function syncMarrowCone(renderer) {
  if (!renderer || !renderer.scene || !renderer.state) return;
  const sectorId = renderer.state.world && renderer.state.world.currentSectorId;
  const inside = sectorId === BOLUS_SECTOR_ID;
  const rig = renderer._sectorPaletteRig;
  if (rig && rig.lights && rig.target && rig.target.intensities) {
    const base = rig.target.intensities;
    if (inside) {
      rig.lights.ambient.intensity = base.ambient * DIM.ambient;
      rig.lights.key.intensity = base.key * DIM.key;
      rig.lights.rim.intensity = base.rim * DIM.rim;
      rig.lights.fill.intensity = base.fill * DIM.fill;
    }
  }
  if (renderer.spaceBg && renderer.spaceBg.group) {
    renderer.spaceBg.group.visible = !inside;
  }
  if (!inside && !renderer._marrowSpot) return;
  const spot = ensureSpot(renderer);
  spot.visible = inside;
  if (!inside) return;
  const player = renderer.state.playerId != null && renderer.state.entities
    ? renderer.state.entities.get(renderer.state.playerId)
    : null;
  if (!player || !player.pos || !renderer._frameMembrane) return;
  const local = renderer._frameMembrane.toLocal(player.pos, scratch);
  const rot = player.rot || 0;
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  spot.position.set(local.x, 6, local.z);
  spot.target.position.set(local.x + fx * 48, 0, local.z + fz * 48);
  spot.target.updateMatrixWorld();
}

function ensureSpot(renderer) {
  if (renderer._marrowSpot?.parent === renderer.scene) return renderer._marrowSpot;
  disposeMarrowCone(renderer);
  const spot = new THREE.SpotLight(0xffc2a8, 0, 340, (18 * Math.PI) / 180, 0.45, 1.2);
  spot.intensity = 14;
  spot.castShadow = false;
  renderer.scene.add(spot);
  renderer.scene.add(spot.target);
  renderer._marrowSpot = spot;
  return spot;
}

export function disposeMarrowCone(renderer, { disposeGpu = true } = {}) {
  const spot = renderer?._marrowSpot;
  if (!spot) return;
  spot.removeFromParent();
  spot.target.removeFromParent();
  if (disposeGpu) spot.dispose();
  renderer._marrowSpot = null;
}
