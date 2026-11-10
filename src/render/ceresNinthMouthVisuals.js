import * as THREE from 'three';
import { presentedAnchorXZ } from './presentedAnchor.js';
import { readFrameOrigin } from './frameCoordinates.js';

// Light on existing physical worklamp bodies, not an invented tunnel or darkness mask.
// A fixed zero-intensity pool avoids changing the shader light count during lamp moves.
const ROLES = ['lamp:0', 'lamp:1', 'lamp:2'];
export function createCeresNinthMouthVisuals({ state, scene }) {
  const origin = { x: 0, z: 0 }, pose = { x: 0, z: 0 };
  const selected = [null, null, null], ambiguous = [false, false, false];
  const lights = ROLES.map((role) => {
    const light = new THREE.PointLight(0xffd2a0, 0, 95, 2);
    light.name = `Ninth Mouth ${role}`;
    light.castShadow = false;
    light.userData.entityId = null;
    light.userData.occupantGeneration = null;
    scene.add(light);
    return light;
  });
  let destroyed = false;
  return {
    update(alpha = 1) {
      if (destroyed) return;
      readFrameOrigin(state, origin);
      selected.fill(null); ambiguous.fill(false);
      const rows = state.entityList;
      if (rows) for (let n = 0; n < rows.length; n++) {
        const entity = rows[n];
        if (!entity?.alive || !(entity.hull > 0) || entity.data?.ninthMouthLight !== true
          || state.entities?.get(entity.id) !== entity || !Number.isSafeInteger(entity.occupantGeneration)
          || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)) continue;
        const slot = ROLES.indexOf(entity.data.ninthMouthRole);
        if (slot < 0 || entity.data.ninthMouthIdentity !== `lw_ceres_ninth_mouth:${ROLES[slot]}`) continue;
        if (selected[slot]) ambiguous[slot] = true;
        else selected[slot] = entity;
      }
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        let entity = ambiguous[i] ? null : selected[i];
        const meshes = state.render?.meshes;
        const mesh = entity && meshes?.get(entity.id);
        // The renderer binds these identities before admitting a mesh. A recycled
        // ID must not light its predecessor while the replacement pack is pending.
        if (entity && meshes && (!mesh || mesh.visible === false
          || mesh.userData?.presentationEntityId !== entity.id
          || mesh.userData?.presentationOccupantGeneration !== entity.occupantGeneration)) entity = null;
        light.intensity = entity ? 2.4 : 0;
        light.userData.entityId = entity?.id ?? null;
        light.userData.occupantGeneration = entity?.occupantGeneration ?? null;
        if (!entity) continue;
        if (mesh) {
          // Renderer entity roots already use frame-local coordinates. Do not rebase twice.
          light.position.set(mesh.position.x, mesh.position.y + 3, mesh.position.z);
        } else {
          presentedAnchorXZ(entity, Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1)), pose);
          light.position.set(pose.x - origin.x, 3, pose.z - origin.z);
        }
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const light of lights) { light.intensity = 0; scene.remove(light); light.dispose?.(); }
      selected.fill(null);
    },
  };
}
