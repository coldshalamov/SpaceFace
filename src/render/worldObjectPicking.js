import * as THREE from 'three';
import { resolveWorldPresentationEntity } from '../world/presentationSources.js';
import { entityVisualCullRadius } from './visualCullRadius.js';

const FORGIVE_PX = 6;
const TINY_BODY_PX = 12;
const TIE_EPSILON_WU = 1e-3;

const NON_SELECTABLE_TYPES = new Set([
  'projectile', 'bullet', 'missile', 'torpedo', 'explosion', 'beam', 'vfx',
  'decal', 'particle', 'spark', 'smoke', 'lootTrail', 'loot_trail', 'tether',
  'masslineWeb', 'navLight', 'route',
]);

const NON_BODY_UD_KEYS = [
  'plume', 'plumeMaterial', 'plumeVolume', 'shieldBubble', 'portal', 'hubGlow',
  'lensMesh', 'endpoint', 'blink', 'vfxOwner', 'spriteBucket', 'thrusterMaterial',
  'spacefaceVfxSpriteBatch', 'spacefaceVfxGasBatch', 'spacefaceWeaponBoltPool',
  'spacefaceTetherWeb', 'spacefaceArcadeVfxMaterial', 'spacefaceArcadeStructuralFx',
  'isMissile', 'isTorpedo', 'lensFlare', 'navLight',
  'engineGlow', 'beamVfx', 'drillBeam', 'tetherBeam', 'noHighlight',
];

const NON_BODY_NAME_RE = /nav.?light|plume|shield.?bubble|glow.?disc|halo|flame|exhaust|vfx/i;

export function isSelectableWorldObject(entity) {
  if (!entity || entity.id == null || entity.alive === false) return false;
  if (entity.pending === true || (entity.data && entity.data.pending === true)) return false;
  if (entity.selectable === false || (entity.data && entity.data.selectable === false)) return false;
  const type = entity.type;
  if (typeof type !== 'string' || !type) return false;
  if (NON_SELECTABLE_TYPES.has(type)) return false;
  if (type === 'fx') {
    const d = entity.data || {};
    return !!(d.poi || d.placeId || d.landmarkGlb || d.archetypeGlb
      || d.claimSpecId || d.claimOwned || d.worldSiteTargetable === true);
  }
  return true;
}

function isPooledBodyLeaf(object) {
  const ud = object && object.userData;
  return !!(ud && (ud.spacefaceInstanceProxy || ud.spacefaceStaticBatchProxy || ud.spacefaceRenderPackagePooled));
}

function isStaticBatchDraw(object) {
  const ud = object && object.userData;
  return !!(ud && ud.spacefaceStaticBatch === true);
}

function isStaticBatchSuppressedProxy(object) {
  const ud = object && object.userData;
  return !!(ud && ud.spacefaceStaticBatchProxy === true);
}

function isAdoptedBodyLeaf(object) {
  const ud = object && object.userData;
  return !!(ud && ud.asteroidInstanceAdopted === true);
}

function isAuthoredStandInBody(object) {
  for (let node = object; node; node = node.parent) {
    if (node.name === 'AuthoredResolvingStandIn') return true;
  }
  return false;
}

function isNonBodyLeaf(object) {
  const ud = object.userData || {};
  for (const key of NON_BODY_UD_KEYS) {
    if (ud[key]) return true;
  }
  if (ud.authoredResolvingMarker === true && !isAuthoredStandInBody(object)) return true;
  if (typeof object.name === 'string' && object.name && NON_BODY_NAME_RE.test(object.name)) return true;
  return false;
}

function ancestorsVisible(object, root) {
  for (let node = object.parent; node && node !== root; node = node.parent) {
    if (node.visible === false) return false;
  }
  return true;
}

function leafPresented(object, root) {
  let attached = object === root;
  for (let node = object.parent; node && !attached; node = node.parent) {
    if (node === root) attached = true;
    else if (node.visible === false) return false;
  }
  if (!attached) return false;
  if (object.visible !== false) return true;
  if (isPooledBodyLeaf(object) || isAdoptedBodyLeaf(object)) {
    const ud = object.userData || {};
    return ud.poolLeafVisible !== false;
  }
  return false;
}

function materialDraws(material) {
  if (!material) return true;
  if (Array.isArray(material)) {
    for (const m of material) if (materialDraws(m)) return true;
    return false;
  }
  if (material.visible === false) return false;
  if (material.colorWrite === false) return false;
  if (typeof material.opacity === 'number' && material.opacity <= 0) return false;
  return true;
}

function isBodyLeaf(object) {
  if (!object.geometry) return false;
  if (isNonBodyLeaf(object)) return false;
  if (object.isInstancedMesh) return false;
  if (isPooledBodyLeaf(object) || isAdoptedBodyLeaf(object)) return true;
  if (!object.isMesh) return false;
  return true;
}

function leafPickable(object, root, staticBatchPresented) {
  if (!isBodyLeaf(object)) return false;
  if (staticBatchPresented && isStaticBatchSuppressedProxy(object)) return false;
  if (!materialDraws(object.material)) return false;
  return leafPresented(object, root);
}

const collectScratch = { root: null, leaves: null, batch: false };

function collectBatchPass(object) {
  if (collectScratch.batch) return;
  if (!isStaticBatchDraw(object) || object.visible === false) return;
  if (ancestorsVisible(object, collectScratch.root)) collectScratch.batch = true;
}

function collectLeafPass(object) {
  if (leafPickable(object, collectScratch.root, collectScratch.batch)) {
    collectScratch.leaves.push(object);
  }
}

export function collectPresentedBodyLeaves(root, out) {
  const leaves = out || [];
  leaves.length = 0;
  if (!root || typeof root.traverse !== 'function') return leaves;
  collectScratch.root = root;
  collectScratch.leaves = leaves;
  collectScratch.batch = false;
  try {
    root.traverse(collectBatchPass);
    root.traverse(collectLeafPass);
  } finally {
    collectScratch.root = null;
    collectScratch.leaves = null;
    collectScratch.batch = false;
  }
  return leaves;
}

function stableEntityKey(entity) {
  if (!entity) return '';
  if (entity.stableKey != null) return String(entity.stableKey);
  if (entity.id != null) return String(entity.id);
  return '';
}

export function createWorldObjectPicker(env) {
  const state = env.state;
  const getCamera = env.getCamera || (() => state && state.render && state.render.camera);
  const getMeshes = env.getMeshes || (() => state && state.render && state.render.meshes);
  const getScene = env.getScene || (() => state && state.render && state.render.scene);
  const rawGetViewport = env.getViewport || (() => {
    const c = state && state.render && state.render.canvas;
    if (c && c.width && c.height) {
      const rect = typeof c.getBoundingClientRect === 'function' ? c.getBoundingClientRect() : null;
      if (rect && rect.width && rect.height) return { width: rect.width, height: rect.height };
    }
    return { width: 1, height: 1 };
  });
  // The canvas is a fixed fullscreen surface — its rect only moves on resize, so a short
  // TTL drops the forced getBoundingClientRect layout read out of the per-frame pick path.
  let vpCache = null;
  const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const getViewport = () => {
    const now = perfNow();
    if (!vpCache || now - vpCache.at >= 500) {
      vpCache = { at: now, vp: rawGetViewport() };
    }
    return vpCache && vpCache.vp;
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const toCenter = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const candidates = [];
  let candCount = 0;
  const scratchMeshes = [];
  const hits = [];
  const leafCache = new WeakMap();
  const result = { entity: null, leaf: null, distance: 0, point: null, approx: false };
  const bestRec = { entity: null, leaf: null, distance: 0, point: null };

  function scratchFor(index) {
    let m = scratchMeshes[index];
    if (!m) {
      m = new THREE.Mesh();
      m.matrixAutoUpdate = false;
      scratchMeshes[index] = m;
    }
    return m;
  }

  function rootPresented(root) {
    const scene = getScene();
    for (let node = root; node; node = node.parent) {
      if (node.visible === false) return false;
      if (scene && node === scene) return true;
      if (!node.parent) break;
    }
    return !scene;
  }

  function rebuildRoot(entry, root) {
    entry.nodes.length = 0;
    entry.recs.length = 0;
    root.traverse((object) => {
      let rec = entry.recs[entry.nodes.length];
      if (!rec) {
        rec = { parent: null, geometry: null, kids: [] };
        entry.recs.push(rec);
      }
      rec.parent = object.parent || null;
      rec.geometry = object.geometry || null;
      rec.kids.length = 0;
      const kids = object.children;
      for (let k = 0; k < kids.length; k++) rec.kids.push(kids[k]);
      entry.nodes.push(object);
    });
    entry.recs.length = entry.nodes.length;
  }

  function signatureDirty(entry) {
    const nodes = entry.nodes;
    const recs = entry.recs;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const rec = recs[i];
      if (!rec) return true;
      if ((node.parent || null) !== rec.parent) return true;
      if ((node.geometry || null) !== rec.geometry) return true;
      const kids = node.children;
      if (kids.length !== rec.kids.length) return true;
      for (let k = 0; k < kids.length; k++) {
        if (kids[k] !== rec.kids[k]) return true;
      }
    }
    return false;
  }

  function nodesFor(root) {
    let entry = leafCache.get(root);
    if (!entry) {
      entry = { nodes: [], recs: [] };
      leafCache.set(root, entry);
      rebuildRoot(entry, root);
    } else if (signatureDirty(entry)) {
      rebuildRoot(entry, root);
    }
    return entry.nodes;
  }

  function presentedStaticBatch(nodes, root) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (isStaticBatchDraw(node) && node.visible !== false
        && ancestorsVisible(node, root)) return true;
    }
    return false;
  }

  function projectRadiusPx(worldRadius, depthT, camera, vp) {
    if (!(worldRadius > 0)) return 0;
    if (camera && camera.isOrthographicCamera) {
      const span = (camera.top - camera.bottom) / (camera.zoom || 1);
      return span > 0 ? worldRadius * vp.height / span : 0;
    }
    const fov = camera && Number.isFinite(camera.fov) ? camera.fov : 60;
    const tanHalf = Math.tan((fov * Math.PI / 180) / 2);
    if (!(depthT > 0) || !(tanHalf > 0)) return 0;
    return worldRadius / (depthT * tanHalf) * (vp.height / 2);
  }

  function pick(clientX, clientY) {
    const camera = getCamera();
    const meshes = getMeshes();
    if (!camera || !meshes || typeof meshes.forEach !== 'function') return null;
    const vp = getViewport();
    if (!vp || !(vp.width > 0) || !(vp.height > 0)) return null;

    ndc.set((clientX / vp.width) * 2 - 1, -(clientY / vp.height) * 2 + 1);
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return null;
    if (Math.abs(ndc.x) > 1.25 || Math.abs(ndc.y) > 1.25) return null;
    try {
      raycaster.setFromCamera(ndc, camera);
    } catch (_) {
      return null;
    }
    const ro = raycaster.ray.origin;
    const rd = raycaster.ray.direction;

    candCount = 0;
    meshes.forEach((root, id) => {
      if (!root || !rootPresented(root)) return;
      const entity = resolveWorldPresentationEntity(state, id);
      if (!isSelectableWorldObject(entity)) return;
      // Envelope reject: the drawn cull sphere already covers every leaf sphere (it is the
      // same bound frustum culling trusts — a leaf outside it would clip), so a ray that
      // misses it misses every leaf. The approx path forgives FORGIVE_PX for tiny bodies;
      // each leaf's overhangPx is bounded below by the envelope's own miss projected at
      // the farthest leaf depth, so exceeding FORGIVE_PX proves no leaf can qualify.
      const cullR = entityVisualCullRadius(entity, root);
      if (cullR > 0) {
        tmpV.setFromMatrixPosition(root.matrixWorld);
        toCenter.subVectors(tmpV, ro);
        const tE = toCenter.dot(rd);
        if (tE + cullR < 0) return;
        const envMissSq = toCenter.lengthSq() - tE * tE;
        const envOverhang = envMissSq > 0 ? Math.sqrt(envMissSq) - cullR : -cullR;
        if (envOverhang > 0) {
          const pxScaleMin = projectRadiusPx(1, Math.max(0.001, tE + cullR), camera, vp);
          if (!(envOverhang * pxScaleMin <= FORGIVE_PX)) return;
        }
      }
      const nodes = nodesFor(root);
      const batchPresented = presentedStaticBatch(nodes, root);
      for (let i = 0; i < nodes.length; i++) {
        const leaf = nodes[i];
        if (!leafPickable(leaf, root, batchPresented)) continue;
        const geo = leaf.geometry;
        if (geo && !geo.boundingSphere) {
          try { geo.computeBoundingSphere(); } catch (_) {}
        }
        const bs = geo && geo.boundingSphere;
        if (!bs) continue;
        const scale = leaf.matrixWorld.getMaxScaleOnAxis() || 1;
        const r = bs.radius * scale;
        if (!(r > 0)) continue;
        tmpV.copy(bs.center).applyMatrix4(leaf.matrixWorld);
        toCenter.subVectors(tmpV, ro);
        const t = toCenter.dot(rd);
        if (t < -r) continue;
        const distSq = toCenter.lengthSq();
        const rSq = distSq - t * t;
        const overhang = rSq > 0 ? Math.sqrt(rSq) - r : -r;
        const radiusPx = projectRadiusPx(r, Math.max(0.001, t), camera, vp);
        const tiny = (radiusPx * 2) <= TINY_BODY_PX;
        if (overhang <= 0 || tiny) {
          let c = candidates[candCount];
          if (!c) { c = { leaf: null, entity: null, overhang: 0, t: 0, radiusPx: 0, tiny: false }; candidates[candCount] = c; }
          c.leaf = leaf; c.entity = entity; c.overhang = overhang; c.t = t; c.radiusPx = radiusPx; c.tiny = tiny;
          candCount += 1;
        }
      }
    });

    let haveBest = false;
    for (let i = 0; i < candCount; i++) {
      const c = candidates[i];
      if (c.overhang > 0) continue;
      const scratch = scratchFor(i);
      scratch.geometry = c.leaf.geometry;
      scratch.material = c.leaf.material || scratch.material;
      scratch.matrix.copy(c.leaf.matrixWorld);
      scratch.matrixWorld.copy(c.leaf.matrixWorld);
      hits.length = 0;
      try {
        scratch.raycast(raycaster, hits);
      } catch (_) {
        continue;
      }
      for (const h of hits) {
        if (!h || !Number.isFinite(h.distance)) continue;
        if (!haveBest || h.distance < bestRec.distance - TIE_EPSILON_WU
          || (Math.abs(h.distance - bestRec.distance) <= TIE_EPSILON_WU
            && stableEntityKey(c.entity) < stableEntityKey(bestRec.entity))) {
          haveBest = true;
          bestRec.entity = c.entity;
          bestRec.leaf = c.leaf;
          bestRec.distance = h.distance;
          bestRec.point = h.point || null;
        }
      }
    }
    if (haveBest) {
      result.entity = bestRec.entity;
      result.leaf = bestRec.leaf;
      result.distance = bestRec.distance;
      result.point = bestRec.point;
      result.approx = false;
      return result;
    }

    let bestApprox = null;
    for (let i = 0; i < candCount; i++) {
      const c = candidates[i];
      if (!c.tiny || c.t <= 0) continue;
      const rWorld = c.leaf.geometry.boundingSphere.radius
        * (c.leaf.matrixWorld.getMaxScaleOnAxis() || 1);
      const overhangPx = rWorld > 0 ? Math.max(0, c.overhang) * (c.radiusPx / rWorld) : Infinity;
      if (!(overhangPx <= FORGIVE_PX)) continue;
      if (!bestApprox || c.overhang < bestApprox.overhang - TIE_EPSILON_WU
        || (Math.abs(c.overhang - bestApprox.overhang) <= TIE_EPSILON_WU
          && stableEntityKey(c.entity) < stableEntityKey(bestApprox.entity))) {
        bestApprox = c;
      }
    }
    if (!bestApprox) return null;
    result.entity = bestApprox.entity;
    result.leaf = bestApprox.leaf;
    result.distance = Math.max(0, bestApprox.t);
    result.point = null;
    result.approx = true;
    return result;
  }

  return {
    pick,
    diagnostics() {
      return {
        meshes: getMeshes() ? getMeshes().size : 0,
        scratchMeshes: scratchMeshes.length,
      };
    },
  };
}
