import * as THREE from 'three';
import { presentedAnchorXZ } from './presentedAnchor.js';
import { readFrameOrigin } from './frameCoordinates.js';

import { nocturneForScene, createLogicalLight, emptyLogicalLight } from './nocturne/bridge.js';
import { claimShadeRegion } from './nocturne/shadeRegions.js';
import { CERES_NINTH_MOUTH as CUT } from '../data/ceresNinthMouth.js';

// CPU-only requests into the renderer's existing fixed light budget. No extra
// PointLight, mesh, material clone, global exposure change, or shadow map.
const ROLES = ['lamp:0', 'lamp:1', 'lamp:2'];
const SHOULDERS = ['shoulder_north', 'shoulder_south'];
const OWNERS = new WeakMap();
const SHOULDER_ANCHORS = SHOULDERS.map(role => {
  const definition = CUT.definitions.find(d => d.role === role);
  return {...CUT.worldPoint(definition.local), rot: definition.rot};
});
export function createCeresNinthMouthVisuals({ state, scene }) {
  OWNERS.get(scene)?.destroy();
  const origin = { x: 0, z: 0 }, pose = { x: 0, z: 0 };
  const selected = [null, null, null], ambiguous = [false, false, false];
  const shoulders = [null, null], shoulderDuplicates = [false, false];
  const shade = claimShadeRegion(CUT.shade), shadeCenter = new THREE.Vector3();
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
      shoulders.fill(null); shoulderDuplicates.fill(false);
      selected.fill(null); ambiguous.fill(false);
      const rows = state.entityList;
      if (rows) for (let n = 0; n < rows.length; n++) {
        const entity = rows[n];
        const shoulderSlot = SHOULDERS.indexOf(entity?.data?.ninthMouthRole);
        if (shoulderSlot >= 0 && entity?.alive && entity.hull > 0
          && state.entities?.get(entity.id) === entity && Number.isSafeInteger(entity.occupantGeneration)
          && entity.data.ninthMouthIdentity === `${CUT.id}:${SHOULDERS[shoulderSlot]}`) {
          if (shoulders[shoulderSlot]) shoulderDuplicates[shoulderSlot] = true;
          else shoulders[shoulderSlot] = entity;
        }
        if (!entity?.alive || !(entity.hull > 0) || entity.data?.ninthMouthLight !== true
          || state.entities?.get(entity.id) !== entity || !Number.isSafeInteger(entity.occupantGeneration)
          || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)) continue;
        const slot = ROLES.indexOf(entity.data.ninthMouthRole);
        if (slot < 0 || entity.data.ninthMouthIdentity !== `lw_ceres_ninth_mouth:${ROLES[slot]}`) continue;
        if (selected[slot]) ambiguous[slot] = true;
        else selected[slot] = entity;
      }
      const active = (!state.mode || state.mode === 'flight')
        && nocturneForScene(scene)?.enabled !== false && state.settings?.video?.nocturne !== false;
      let shadeReady = !!registry && active;
      for (let i = 0; i < shoulders.length && shadeReady; i++) {
        const entity = shoulders[i], expected = SHOULDER_ANCHORS[i];
        const mesh = entity && state.render?.meshes?.get(entity.id);
        const anchored = entity && Math.hypot(entity.pos?.x - expected.x, entity.pos?.z - expected.z) <= 1
          && Number.isFinite(entity.rot) && Math.abs(Math.atan2(Math.sin(entity.rot - expected.rot), Math.cos(entity.rot - expected.rot))) < 0.01;
        shadeReady = !!(anchored && !shoulderDuplicates[i] && mesh && mesh.visible !== false
          && mesh.userData?.presentationEntityId === entity.id
          && mesh.userData?.presentationOccupantGeneration === entity.occupantGeneration);
      }
      shadeCenter.set(CUT.center.x + CUT.shade.local.x - origin.x, 0, CUT.center.z + CUT.shade.local.z - origin.z);
      shade.update(shadeCenter, shadeReady);
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
      selected.fill(null); shade.release();
      if (OWNERS.get(scene) === api) OWNERS.delete(scene);
    },
  };
  OWNERS.set(scene, api);
  return api;
}
