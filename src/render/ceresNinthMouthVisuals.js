import { presentedAnchorXZ } from './presentedAnchor.js';
import { readFrameOrigin } from './frameCoordinates.js';

import { nocturneForScene, createLogicalLight, emptyLogicalLight } from './nocturne/bridge.js';
import { CERES_NINTH_MOUTH as CUT } from '../data/ceresNinthMouth.js';

// CPU-only requests into the renderer's existing fixed light budget. No extra
// PointLight, mesh, material clone, global exposure change, or shadow map.
// The dead mouth reads dark because its lamps are unlit; each worklight body
// carries its own light, so a towed lamp lights the way in and a seated lamp
// keeps its mark lit permanently.
const ROLES = ['lamp:0', 'lamp:1', 'lamp:2'];
const OWNERS = new WeakMap();
export function createCeresNinthMouthVisuals({ state, scene }) {
  OWNERS.get(scene)?.destroy();
  const origin = { x: 0, z: 0 }, pose = { x: 0, z: 0 };
  const selected = [null, null, null], ambiguous = [false, false, false];
  let registry = null;
  let lights = ROLES.map(() => emptyLogicalLight());
  for (const light of lights) light.userData = {};
  function bindLights() {
    const next = nocturneForScene(scene)?.registry || null;
    if (next !== registry) {
      for (const light of lights) { light.intensity = 0; light.dispose?.(); }
      registry = next;
      lights = ROLES.map(() => emptyLogicalLight());
      for (const light of lights) light.userData = {};
    }
    if (!registry) return;
    for (let i = 0; i < lights.length; i++) {
      const old = lights[i];
      if (old._nocturneSource?.registered && registry.get(old.name) === old._nocturneSource) continue;
      const name = `Ninth Mouth ${ROLES[i]}`;
      // Registry exhaustion fails quiet. Retry only missing CPU requests on later
      // frames; never evict existing sources or construct a fallback GPU light.
      if (!registry.get(name) && registry.sources.length >= registry.capacity) continue;
      old.intensity = 0; old.dispose?.();
      const light = createLogicalLight(registry, name, 'point', {
        color: 0xffd2a0, intensity: 0, range: 95, decay: 2, priority: 2,
      });
      light.userData = {}; light.castShadow = false; lights[i] = light;
    }
  }
  let destroyed = false;
  const api = {
    update(alpha = 1) {
      if (destroyed) return;
      bindLights();
      readFrameOrigin(state, origin);
      selected.fill(null); ambiguous.fill(false);
      const rows = state.entityList;
      if (rows) for (let n = 0; n < rows.length; n++) {
        const entity = rows[n];
        if (!entity?.alive || !(entity.hull > 0) || entity.data?.ninthMouthLight !== true
          || state.entities?.get(entity.id) !== entity || !Number.isSafeInteger(entity.occupantGeneration)
          || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)) continue;
        const slot = ROLES.indexOf(entity.data.ninthMouthRole);
        if (slot < 0 || entity.data.ninthMouthIdentity !== `${CUT.id}:${ROLES[slot]}`) continue;
        if (selected[slot]) ambiguous[slot] = true;
        else selected[slot] = entity;
      }
      const active = (!state.mode || state.mode === 'flight')
        && nocturneForScene(scene)?.enabled !== false && state.settings?.video?.nocturne !== false;
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        let entity = !active || ambiguous[i] ? null : selected[i];
        const meshes = state.render?.meshes;
        const mesh = entity && meshes?.get(entity.id);
        // The renderer binds these identities before admitting a mesh. A recycled
        // ID must not light its predecessor while the replacement pack is pending.
        if (entity && meshes && (!mesh || mesh.visible === false
          || mesh.userData?.presentationEntityId !== entity.id
          || mesh.userData?.presentationOccupantGeneration !== entity.occupantGeneration)) entity = null;
        light.intensity = entity ? 1800 : 0;
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
      for (const light of lights) { light.intensity = 0; light.dispose?.(); }
      selected.fill(null);
      if (OWNERS.get(scene) === api) OWNERS.delete(scene);
    },
  };
  OWNERS.set(scene, api);
  return api;
}
