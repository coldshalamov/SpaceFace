// Hierarchical LOD / impostor prototype for far non-player world scenery (stations first).
// Render-only: collision, physics, and gameplay entity radius stay unchanged.
import * as THREE from 'three';
import { FACTION_PALETTES } from '../data/palettes.js';
import { attachLodState } from './lod.js';

const _proxyGeo = new Map();
const _proxyMat = new Map();
const _markerMat = new Map();

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

function markerMaterial(color) {
  const key = String(color || '#ffffff').toLowerCase();
  let mat = _markerMat.get(key);
  if (!mat) {
    const tex = makeMarkerTexture(color);
    mat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(color),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    mat.name = `SF_HLOD_Marker_${key.replace('#', '')}`;
    mat.userData.spacefaceSharedProxy = true;
    mat.dispose = () => {};
    _markerMat.set(key, mat);
  }
  return mat;
}

function makeMarkerTexture(color) {
  const size = 64;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return null;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
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
  const hullMat = proxyMaterial(`hlod:hull:${hullKey}`, () => {
    const color = new THREE.Color(palette.hull || '#6b7280');
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.38,
      emissive: color.clone().multiplyScalar(0.12),
      emissiveIntensity: 0.35,
    });
  });

  const core = new THREE.Mesh(
    proxyGeometry('hlod:station:core', () => new THREE.CylinderGeometry(0.42, 0.48, 0.58, 8)),
    hullMat,
  );
  core.name = 'HLOD_StationProxy_Core';
  core.scale.set(radius * 0.72, radius * 0.52, radius * 0.72);
  core.castShadow = false;
  core.receiveShadow = false;
  group.add(core);

  const ring = new THREE.Mesh(
    proxyGeometry('hlod:station:ring', () => new THREE.TorusGeometry(0.78, 0.05, 6, 20)),
    hullMat,
  );
  ring.name = 'HLOD_StationProxy_Ring';
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(radius * 0.88);
  ring.castShadow = false;
  ring.receiveShadow = false;
  group.add(ring);

  const markerLayout = [
    { color: palette.accent || '#39d0ff', pos: [radius * 0.72, radius * 0.12, radius * 0.08] },
    { color: '#5fffa0', pos: [-radius * 0.64, -radius * 0.08, radius * 0.38] },
    { color: palette.emissive || palette.accent || '#39d0ff', pos: [0, radius * 0.18, -radius * 0.68] },
  ];
  for (let i = 0; i < markerLayout.length; i++) {
    const entry = markerLayout[i];
    const marker = new THREE.Sprite(markerMaterial(entry.color));
    marker.name = `HLOD_StationProxy_Marker_${i}`;
    marker.position.set(entry.pos[0], entry.pos[1], entry.pos[2]);
    marker.scale.setScalar(radius * 0.24);
    group.add(marker);
  }

  return group;
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
  wrapper.userData.kind = 'station';
  wrapper.userData.hlodAttached = true;
  wrapper.userData.hlod = {
    target: 'station',
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
    diagnostics: { ...(wrapped.userData.hlod || {}) },
  };
}