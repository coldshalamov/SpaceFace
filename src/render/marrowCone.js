// Nose cone for The Bolus. Dims the legal rig after the palette lerp and aims a short spot
// along the ship's forward. Does not author a darker lighting profile.

import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../data/theBolus.js';
import { noteShadowCensusLightMutation } from './shadowDepthAdmission.js';
import { nocturneForScene } from './nocturne/bridge.js';

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
  // The spot stays mounted and visible; gating on intensity keeps the rendered-light census
  // constant across the sector boundary — a .visible flip relinks every material program.
  spot.intensity = inside ? (spot._nocturneSource ? 14 * Math.pow(48, 0.8) : 14) : 0;
  if (!inside) return;
  const player = renderer.state.playerId != null && renderer.state.entities
    ? renderer.state.entities.get(renderer.state.playerId)
    : null;
  if (!player || player.alive === false || !player.pos || !renderer._frameMembrane) {
    spot.intensity = 0;
    return;
  }
  const local = renderer._frameMembrane.toLocal(player.pos, scratch);
  const rot = player.rot || 0;
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  spot.position.set(local.x, 6, local.z);
  spot.target.position.set(local.x + fx * 48, 0, local.z + fz * 48);
  spot.target.updateMatrixWorld();
}

function ensureSpot(renderer) {
  if (renderer._marrowSpot?._nocturneSource?.registered
    || renderer._marrowSpot?.parent === renderer.scene) return renderer._marrowSpot;
  disposeMarrowCone(renderer);
  const nocturne = nocturneForScene(renderer.scene);
  const spot = nocturne
    ? nocturne.createLight('bolus:marrow-searchlight', 'spot', { color: 0xffc2a8,
      range: 340, angle: (18 * Math.PI) / 180, penumbra: 0.45, decay: 2,
      priority: 4, critical: true, shadow: true })
    : new THREE.SpotLight(0xffc2a8, 0, 340, (18 * Math.PI) / 180, 0.45, 1.2);
  if (!nocturne) {
    spot.castShadow = false;
    renderer.scene.add(spot);
    renderer.scene.add(spot.target);
    noteShadowCensusLightMutation();
  }
  renderer._marrowSpot = spot;
  return spot;
}

export function disposeMarrowCone(renderer, { disposeGpu = true } = {}) {
  const spot = renderer?._marrowSpot;
  if (!spot) return;
  if (spot._nocturneSource) {
    spot.dispose();
    renderer._marrowSpot = null;
    return;
  }
  const wasMounted = spot.parent != null;
  spot.removeFromParent();
  spot.target.removeFromParent();
  if (wasMounted) noteShadowCensusLightMutation();
  if (disposeGpu) spot.dispose();
  renderer._marrowSpot = null;
}
