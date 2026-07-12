// Hierarchical LOD / impostor prototype for far non-player world scenery (stations first).
// Render-only: collision, physics, and gameplay entity radius stay unchanged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACTION_PALETTES } from '../data/palettes.js';
import { attachLodState } from './lod.js';

const _proxyGeo = new Map();
const _proxyMat = new Map();
const STATION_AUTHORED_LIFECYCLE_KEYS = Object.freeze([
  'authoredAssetState',
  'authoredAssetMode',
  'authoredAssetContractVersion',
  'authoredParts',
  'authoredSlots',
  'authoredCompositionId',
  'authoredRenderContract',
  'authoredReadableFallbackRetained',
  'authoredVisualRoot',
  'hull',
]);

function proxyGeometry(key, factory) {
  let geo = _proxyGeo.get(key);
  if (!geo) {
    geo = factory();
    geo.userData = { ...(geo.userData || {}), spacefaceSharedProxy: true };
    geo.dispose = () => {};
    _proxyGeo.set(key, geo);
  }
  return geo;
}

function proxyMaterial(key, factory) {
  let mat = _proxyMat.get(key);
  if (!mat) {
    mat = factory();
    mat.userData = { ...(mat.userData || {}), spacefaceSharedProxy: true };
    mat.dispose = () => {};
    _proxyMat.set(key, mat);
  }
  return mat;
}

function stationPalette(entity) {
  const factionId = entity && entity.factionId;
  return (factionId && FACTION_PALETTES[factionId]) || {
    hull: '#6b7280',
    accent: '#39d0ff',
    emissive: '#39d0ff',
    thruster: '#aebfd6',
  };
}

function stationVisualRadius(entity) {
  const data = entity && entity.data || {};
  for (const value of [data.visualRadius, data.dockRadius, data.stationRadius, entity && entity.radius]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.max(40, n);
  }
  return 72;
}

function createStationHlodProxy(radius, palette) {
  const group = new THREE.Group();
  group.name = 'HLOD_StationProxy';
  group.userData.spacefaceHlodProxy = true;

  const hullKey = String(palette.hull || '#6b7280').toLowerCase();
  const accentKey = String(palette.accent || '#39d0ff').toLowerCase();
  const hullMat = proxyMaterial(`hlod:hull:${hullKey}`, () => {
    const color = new THREE.Color(palette.hull || '#6b7280');
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.38,
      emissive: color.clone().multiplyScalar(0.12),
      emissiveIntensity: 0.35,
    });
  });

  // One merged silhouette mesh: the former core + ring + three sprites cost five submissions and
  // could be more expensive than an authored static batch. Vertex colors retain hull/accent identity
  // while the cached merged geometry keeps every far station/gate to one draw object.
  const proxy = new THREE.Mesh(
    proxyGeometry(`hlod:station:merged:${hullKey}:${accentKey}`, () => {
      const core = new THREE.CylinderGeometry(0.42, 0.48, 0.58, 8);
      core.scale(0.72, 0.52, 0.72);
      tintGeometry(core, palette.hull || '#6b7280');
      const ring = new THREE.TorusGeometry(0.78, 0.05, 6, 20);
      ring.rotateX(Math.PI / 2);
      ring.scale(0.88, 0.88, 0.88);
      tintGeometry(ring, palette.accent || '#39d0ff');
      const merged = mergeGeometries([core, ring], false);
      core.dispose();
      ring.dispose();
      if (!merged) throw new Error('station HLOD proxy geometry merge failed');
      merged.computeBoundingSphere();
      return merged;
    }),
    hullMat,
  );
  proxy.name = 'HLOD_StationProxy_Silhouette';
  proxy.scale.setScalar(radius);
  proxy.castShadow = false;
  proxy.receiveShadow = false;
  group.add(proxy);

  return group;
}

function tintGeometry(geometry, colorValue) {
  const position = geometry.getAttribute('position');
  const color = new THREE.Color(colorValue);
  const values = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    values[i * 3] = color.r;
    values[i * 3 + 1] = color.g;
    values[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
}

/**
 * Wrap a station visual root with a far-distance proxy impostor. Close/medium projected sizes keep
 * the authored/procedural detail; lod2 swaps to the low-cost proxy with hysteresis from lod.js.
 */
export function attachStationHlod(root, entity) {
  if (!root || !root.isObject3D || !entity || entity.type !== 'station') return root;
  if (root.userData && root.userData.hlodAttached) return root;

  const radius = stationVisualRadius(entity);
  const palette = stationPalette(entity);
  const wrapper = new THREE.Group();
  wrapper.name = `${root.name || 'Station'}_HLOD`;

  const preserved = { ...(root.userData || {}) };
  const detailed = new THREE.Group();
  detailed.name = 'HLOD_Detailed';
  detailed.add(root);

  const proxy = createStationHlodProxy(radius, palette);
  proxy.visible = false;

  wrapper.add(detailed);
  wrapper.add(proxy);

  Object.assign(wrapper.userData, preserved);
  forwardStationAuthoredLifecycle(wrapper, root);
  wrapper.userData.kind = 'station';
  wrapper.userData.hlodAttached = true;
  wrapper.userData.hlod = {
    target: 'station',
    // Renderer LOD selection must use the visible station/gate envelope, not the much smaller
    // gameplay collision radius. This preserves authored detail until the full silhouette is truly
    // distant while retaining the same shared proxy and hysteresis thresholds.
    visualRadius: radius,
    detailedVisible: 1,
    proxyVisible: 0,
    swapped: false,
  };
  if (typeof preserved.requestAuthoredUpgrade === 'function') {
    wrapper.userData.requestAuthoredUpgrade = preserved.requestAuthoredUpgrade;
  }
  if (!wrapper.userData.hull) wrapper.userData.hull = preserved.hull || root;

  let lastMode = 'detailed';
  wrapper.userData.updateLod = function updateStationHlod(level) {
    const useProxy = level === 'lod2';
    const mode = useProxy ? 'proxy' : 'detailed';
    if (mode !== lastMode) {
      lastMode = mode;
      detailed.visible = !useProxy;
      proxy.visible = useProxy;
      const h = wrapper.userData.hlod;
      h.detailedVisible = useProxy ? 0 : 1;
      h.proxyVisible = useProxy ? 1 : 0;
      h.swapped = useProxy;
    }
    if (!useProxy) {
      const inner = root.userData && root.userData.updateLod;
      if (typeof inner === 'function') inner(level);
    }
  };

  attachLodState(wrapper);
  return wrapper;
}

function forwardStationAuthoredLifecycle(wrapper, root) {
  for (const key of STATION_AUTHORED_LIFECYCLE_KEYS) {
    delete wrapper.userData[key];
    Object.defineProperty(wrapper.userData, key, {
      configurable: true,
      enumerable: true,
      get() { return root.userData && root.userData[key]; },
      set(value) {
        root.userData = root.userData || {};
        root.userData[key] = value;
      },
    });
  }
}

/** Headless contract probe: proxy swap toggles visibility without mutating the detailed subtree. */
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
  const detailedGroup = wrapped.children.find((child) => child.name === 'HLOD_Detailed');
  const proxy = wrapped.children.find((child) => child.name === 'HLOD_StationProxy');
  wrapped.userData.updateLod('lod2');
  return {
    hasLodState: !!(wrapped.userData.lod && typeof wrapped.userData.lod.resolve === 'function'),
    proxyShownAtLod2: proxy && proxy.visible === true,
    detailedHiddenAtLod2: detailedGroup && detailedGroup.visible === false,
    detailedMeshCount: detailed.children.length,
    proxyMeshCount: proxy ? proxy.children.length : 0,
    proxyUsesBoxGeometry: !!(proxy && proxy.children.some((child) => child.geometry && child.geometry.type === 'BoxGeometry')),
    diagnostics: { ...(wrapped.userData.hlod || {}) },
  };
}
