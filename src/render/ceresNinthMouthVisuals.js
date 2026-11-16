import * as THREE from 'three';
import { presentedAnchorXZ } from './presentedAnchor.js';
import { readFrameOrigin } from './frameCoordinates.js';

import { nocturneForScene, createLogicalLight, emptyLogicalLight } from './nocturne/bridge.js';
import { claimShadeRegion } from './nocturne/shadeRegions.js';
import { CERES_NINTH_MOUTH as CUT } from '../data/ceresNinthMouth.js';

// CPU-only requests into the renderer's existing fixed light budget plus bounded
// shade-region claims for the Ninth Mouth cut shoulders and throat pocket.
// The dead mouth reads dark because its lamps are unlit; each worklight body
// carries its own light, so a towed lamp lights the way in and a seated lamp
// keeps its mark lit permanently.
const ROLES = ['lamp:0', 'lamp:1', 'lamp:2'];
const SHOULDER_ROLES = ['shoulder_north', 'shoulder_south'];
const TRACKED_ROCK_ROLES = ['shoulder_north', 'shoulder_south', 'fallen_rock'];
const OWNERS = new WeakMap();

function resolveCutRolePosition(entity, mesh, alpha, origin, poseScratch, out) {
  if (mesh) {
    out.set(mesh.position.x, mesh.position.y, mesh.position.z);
    return out;
  }
  presentedAnchorXZ(entity, alpha, poseScratch);
  out.set(poseScratch.x - origin.x, 0, poseScratch.z - origin.z);
  return out;
}

export function createCeresNinthMouthVisuals({ state, scene }) {
  OWNERS.get(scene)?.destroy();
  const origin = { x: 0, z: 0 }, pose = { x: 0, z: 0 };
  const selected = [null, null, null], ambiguous = [false, false, false];
  const selectedRocks = new Map();
  const ambiguousRocks = new Set();
  const authoredRegions = Array.isArray(CUT.shade?.regions) && CUT.shade.regions.length > 0
    ? CUT.shade.regions
    : (CUT.shade ? [{ id: 'ninth-mouth:pocket', ...CUT.shade }] : []);
  const shadeClaims = authoredRegions.map((spec) => ({
    spec,
    handle: claimShadeRegion({
      id: spec.id,
      center: spec.local,
      halfExtents: spec.halfExtents,
      feather: spec.feather,
      broadFloor: spec.broadFloor,
      facetBias: spec.facetBias,
      facetContrast: spec.facetContrast,
      normal: spec.normal,
    }),
    center: new THREE.Vector3(),
  }));
  const northPos = new THREE.Vector3();
  const southPos = new THREE.Vector3();
  const northDef = CUT.definitions?.find((d) => d.role === 'shoulder_north');
  const southDef = CUT.definitions?.find((d) => d.role === 'shoulder_south');
  const midDefX = ((northDef?.local?.x || 0) + (southDef?.local?.x || 0)) * 0.5;
  const midDefZ = ((northDef?.local?.z || 0) + (southDef?.local?.z || 0)) * 0.5;
  const pocketOffsetX = (CUT.shade?.local?.x || 0) - midDefX;
  const pocketOffsetZ = (CUT.shade?.local?.z || 0) - midDefZ;

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
      const clampedAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
      selected.fill(null); ambiguous.fill(false);
      selectedRocks.clear(); ambiguousRocks.clear();
      const rows = state.entityList;
      if (rows) for (let n = 0; n < rows.length; n++) {
        const entity = rows[n];
        if (!entity?.alive || !(entity.hull > 0)
          || state.entities?.get(entity.id) !== entity
          || !Number.isFinite(entity.pos?.x) || !Number.isFinite(entity.pos?.z)) continue;
        const role = entity.data?.ninthMouthRole;
        const identity = entity.data?.ninthMouthIdentity;
        if (entity.data?.ninthMouthLight === true) {
          if (!Number.isSafeInteger(entity.occupantGeneration)) continue;
          const slot = ROLES.indexOf(role);
          if (slot < 0 || identity !== `${CUT.id}:${ROLES[slot]}`) continue;
          if (selected[slot]) ambiguous[slot] = true;
          else selected[slot] = entity;
        } else if (TRACKED_ROCK_ROLES.includes(role) && identity === `${CUT.id}:${role}`) {
          if (selectedRocks.has(role)) ambiguousRocks.add(role);
          else selectedRocks.set(role, entity);
        }
      }
      const active = (!state.mode || state.mode === 'flight')
        && nocturneForScene(scene)?.enabled !== false && state.settings?.video?.nocturne !== false;
      const meshes = state.render?.meshes;
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        let entity = !active || ambiguous[i] ? null : selected[i];
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
          presentedAnchorXZ(entity, clampedAlpha, pose);
          light.position.set(pose.x - origin.x, 3, pose.z - origin.z);
        }
      }

      const northEntity = !ambiguousRocks.has('shoulder_north') ? selectedRocks.get('shoulder_north') : null;
      const southEntity = !ambiguousRocks.has('shoulder_south') ? selectedRocks.get('shoulder_south') : null;
      const northMesh = northEntity && meshes?.get(northEntity.id);
      const southMesh = southEntity && meshes?.get(southEntity.id);
      const northReady = Boolean(
        northEntity
        && (!meshes || (northMesh && northMesh.visible !== false
          && northMesh.userData?.presentationEntityId === northEntity.id)),
      );
      const southReady = Boolean(
        southEntity
        && (!meshes || (southMesh && southMesh.visible !== false
          && southMesh.userData?.presentationEntityId === southEntity.id)),
      );
      const shouldersIntact = active && northReady && southReady;
      if (shouldersIntact) {
        resolveCutRolePosition(northEntity, northMesh, clampedAlpha, origin, pose, northPos);
        resolveCutRolePosition(southEntity, southMesh, clampedAlpha, origin, pose, southPos);
      }

      for (let i = 0; i < shadeClaims.length; i++) {
        const item = shadeClaims[i];
        const { spec, handle, center } = item;
        if (!shouldersIntact) {
          handle.update(center, false);
          continue;
        }
        if (spec.role && SHOULDER_ROLES.includes(spec.role)) {
          const src = spec.role === 'shoulder_north' ? northPos : southPos;
          center.set(src.x, (spec.local?.y || 0) + src.y, src.z);
          handle.update(center, true);
        } else if (spec.role) {
          const rockEntity = !ambiguousRocks.has(spec.role) ? selectedRocks.get(spec.role) : null;
          const rockMesh = rockEntity && meshes?.get(rockEntity.id);
          const rockReady = Boolean(
            rockEntity
            && (!meshes || (rockMesh && rockMesh.visible !== false
              && rockMesh.userData?.presentationEntityId === rockEntity.id)),
          );
          if (!rockReady) {
            handle.update(center, false);
            continue;
          }
          resolveCutRolePosition(rockEntity, rockMesh, clampedAlpha, origin, pose, center);
          handle.update(center, true);
        } else {
          const offsetX = spec.local ? (spec.local.x - midDefX) : pocketOffsetX;
          const offsetZ = spec.local ? (spec.local.z - midDefZ) : pocketOffsetZ;
          center.set(
            (northPos.x + southPos.x) * 0.5 + offsetX,
            spec.local?.y || 0,
            (northPos.z + southPos.z) * 0.5 + offsetZ,
          );
          handle.update(center, true);
        }
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const light of lights) { light.intensity = 0; light.dispose?.(); }
      for (const { handle } of shadeClaims) handle.release();
      selected.fill(null);
      selectedRocks.clear();
      ambiguousRocks.clear();
      if (OWNERS.get(scene) === api) OWNERS.delete(scene);
    },
  };
  OWNERS.set(scene, api);
  return api;
}
