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

/**
 * Keep one authored station root through every LOD request. A future station-specific lower LOD may
 * replace meshes inside that authored identity, but a generic silhouette proxy must not swap bodies.
 */
export function attachStationHlod(root, entity) {
  if (!root || !root.isObject3D || !entity || entity.type !== 'station') return root;
  if (root.userData && root.userData.hlodAttached) return root;

  const radius = stationVisualRadius(entity);
  const innerUpdateLod = root.userData && root.userData.updateLod;
  root.userData = root.userData || {};
  root.userData.kind = 'station';
  root.userData.hlodAttached = true;
  root.userData.hlod = {
    target: 'station',
    visualRadius: radius,
    detailedVisible: 1,
    proxyVisible: 0,
    swapped: false,
    proxyDisabledReason: 'stable-authored-identity',
  };
  root.userData.updateLod = function updateStationStableLod(level) {
    if (typeof innerUpdateLod === 'function') innerUpdateLod(level);
  };
  attachLodState(root);
  return root;
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
  return {
    hasLodState: !!(wrapped.userData.lod && typeof wrapped.userData.lod.resolve === 'function'),
    rootStableAtLod2: wrapped.uuid === rootUuid,
    detailedVisibleAtLod2: wrapped.visible !== false,
    detailedMeshCount: countMeshes(wrapped),
    beforeMeshCount,
    proxyMeshCount: countNamed(wrapped, 'HLOD_StationProxy'),
    diagnostics: { ...(wrapped.userData.hlod || {}) },
  };
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
