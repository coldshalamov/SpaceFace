// Stable station LOD ownership. Render-only: collision, physics, and gameplay radius stay unchanged.
import * as THREE from 'three';
import { attachLodState } from './lod.js';

function stationVisualRadius(entity) {
  const data = entity && entity.data || {};
  for (const value of [data.visualRadius, data.dockRadius, data.stationRadius, entity && entity.radius]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.max(40, n);
  }
  return 72;
}

export function isFarDetailSurface(object) {
  if (!object || object.isMesh !== true) return false;
  const tags = (object.userData && object.userData.spacefaceTags) || {};
  if (tags.greeble || tags.decal || tags.navLight || tags.fan || tags.antenna) return true;
  const name = String(object.name || '');
  return /greeble|decal|navlight|nav_light|antenna|antennae|pennant|bunting/i.test(name);
}

/** Hide authored flourishes at LOD2 without swapping the station/place identity. */
export function applyProjectedDetailLod(root, level) {
  if (!root || typeof root.traverse !== 'function') return 0;
  const hide = level === 'lod2';
  let changed = 0;
  root.traverse((object) => {
    if (!isFarDetailSurface(object)) return;
    if (object.userData._hlodBaseVisible === undefined) {
      object.userData._hlodBaseVisible = object.visible !== false;
    }
    const next = hide ? false : object.userData._hlodBaseVisible !== false;
    if (object.visible !== next) {
      object.visible = next;
      changed += 1;
    }
  });
  return changed;
}

/**
 * Keep one authored station/place root through every LOD request. Far LOD hides greebles, decals,
 * and nav lights so triangle/submit cost scales with projected size. A generic silhouette proxy
 * must not swap bodies.
 */
export function attachStationHlod(root, entity) {
  if (!root || !root.isObject3D || !entity) return root;
  if (entity.type !== 'station' && entity.type !== 'fx' && entity.type !== 'planet') return root;
  if (root.userData && root.userData.hlodAttached) return root;

  const radius = stationVisualRadius(entity);
  const innerUpdateLod = root.userData && root.userData.updateLod;
  root.userData = root.userData || {};
  root.userData.kind = entity.type === 'station' ? 'station' : 'place';
  root.userData.hlodAttached = true;
  root.userData.hlod = {
    target: entity.type === 'station' ? 'station' : 'place',
    visualRadius: radius,
    detailedVisible: 1,
    proxyVisible: 0,
    swapped: false,
    farDetailHidden: 0,
    proxyDisabledReason: 'stable-authored-identity',
  };
  root.userData.updateLod = function updateStationStableLod(level) {
    if (typeof innerUpdateLod === 'function') innerUpdateLod(level);
    const hidden = applyProjectedDetailLod(root, level);
    root.userData.hlod.farDetailHidden = hidden;
    root.userData.hlod.detailedVisible = level === 'lod2' ? 0 : 1;
  };
  attachLodState(root);
  return root;
}

export function attachPlaceHlod(root, entity) {
  return attachStationHlod(root, entity);
}

/** Headless contract probe: station LOD requests preserve one stable detailed identity. */
export function runStationHlodContractProbe(THREE_NS = THREE) {
  const detailed = new THREE_NS.Group();
  detailed.name = 'ProbeStation';
  detailed.add(new THREE_NS.Mesh(
    new THREE_NS.BoxGeometry(1, 1, 1),
    new THREE_NS.MeshStandardMaterial({ color: 0x8899aa }),
  ));
  const entity = {
    type: 'station',
    factionId: 'faction_scn',
    radius: 72,
    data: { stationId: 'station_probe', dockRadius: 72 },
  };
  const wrapped = attachStationHlod(detailed, entity);
  const rootUuid = wrapped.uuid;
  const beforeMeshCount = countMeshes(wrapped);
  wrapped.userData.updateLod('lod2');
  const afterVisible = countVisibleMeshes(wrapped);
  return {
    hasLodState: !!(wrapped.userData.lod && typeof wrapped.userData.lod.resolve === 'function'),
    rootStableAtLod2: wrapped.uuid === rootUuid,
    detailedVisibleAtLod2: wrapped.visible !== false,
    detailedMeshCount: countMeshes(wrapped),
    visibleMeshCountAtLod2: afterVisible,
    beforeMeshCount,
    proxyMeshCount: countNamed(wrapped, 'HLOD_StationProxy'),
    farDetailHidden: Number(wrapped.userData.hlod && wrapped.userData.hlod.farDetailHidden) || 0,
    diagnostics: { ...(wrapped.userData.hlod || {}) },
  };
}

function countVisibleMeshes(root) {
  let count = 0;
  root.traverse((object) => { if (object.isMesh && object.visible !== false) count++; });
  return count;
}

function countMeshes(root) {
  let count = 0;
  root.traverse((object) => { if (object.isMesh) count++; });
  return count;
}

function countNamed(root, token) {
  let count = 0;
  root.traverse((object) => { if (String(object.name || '').includes(token)) count++; });
  return count;
}
