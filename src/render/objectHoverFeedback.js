import * as THREE from 'three';
import { collectPresentedBodyLeaves } from './worldObjectPicking.js';

const LIFT = 0.05;

function ancestorChainVisible(object, stopAt) {
  for (let node = object.parent; node && node !== stopAt; node = node.parent) {
    if (node.visible === false) return false;
  }
  return true;
}

export function createObjectHoverFeedback(env) {
  const scene = env && env.scene;
  const material = new THREE.ShaderMaterial({
    uniforms: { uLift: { value: LIFT } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uLift; void main(){ gl_FragColor = vec4(vec3(uLift), 1.0); }',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const placeholderGeometry = new THREE.BufferGeometry();
  const group = new THREE.Group();
  group.name = 'worldObjectHover';
  group.visible = false;
  group.matrixAutoUpdate = false;
  if (scene && typeof scene.add === 'function') scene.add(group);

  const pool = [];
  const scratchLeaves = [];
  const leafMeshes = new Map();
  let subject = null;
  let warmGeometry = null;
  let warmMesh = null;
  let disposed = false;

  function takeMesh() {
    let m = pool.pop();
    if (!m) {
      m = new THREE.Mesh(placeholderGeometry, material);
      m.matrixAutoUpdate = false;
      m.frustumCulled = true;
      m.renderOrder = 2;
    }
    group.add(m);
    return m;
  }

  function releaseMesh(m) {
    group.remove(m);
    m.visible = false;
    m.geometry = placeholderGeometry;
    pool.push(m);
  }

  function subjectPresented(root) {
    for (let node = root; node; node = node.parent) {
      if (node.visible === false) return false;
      if (scene && node === scene) return true;
      if (!node.parent) break;
    }
    return !scene;
  }

  function leafDrawn(leaf) {
    if (!ancestorChainVisible(leaf, subject)) return false;
    if (leaf.visible !== false) return true;
    const ud = leaf.userData || {};
    if (!(ud.asteroidInstanceAdopted === true || ud.spacefaceInstanceProxy === true
      || ud.spacefaceStaticBatchProxy === true || ud.spacefaceRenderPackagePooled === true)) {
      return false;
    }
    return ud.poolLeafVisible !== false;
  }

  function syncLeaves() {
    collectPresentedBodyLeaves(subject, scratchLeaves);
    if (!scratchLeaves.length) {
      for (const m of leafMeshes.values()) releaseMesh(m);
      leafMeshes.clear();
      return;
    }
    for (const leaf of scratchLeaves) {
      if (!leafMeshes.has(leaf)) leafMeshes.set(leaf, takeMesh());
    }
    for (const [leaf, m] of leafMeshes) {
      let present = false;
      for (const l of scratchLeaves) { if (l === leaf) { present = true; break; } }
      if (!present) { releaseMesh(m); leafMeshes.delete(leaf); }
    }
    for (const leaf of scratchLeaves) {
      const m = leafMeshes.get(leaf);
      if (!m) continue;
      if (m.geometry !== leaf.geometry) m.geometry = leaf.geometry;
      if (typeof leaf.updateWorldMatrix === 'function') leaf.updateWorldMatrix(true, false);
      m.matrix.copy(leaf.matrixWorld);
      m.matrixWorld.copy(leaf.matrixWorld);
      m.matrixWorldNeedsUpdate = false;
      m.visible = leafDrawn(leaf);
    }
  }

  function setSubject(root) {
    if (disposed) return;
    if (root === subject) return;
    subject = root || null;
    if (!subject) {
      for (const m of leafMeshes.values()) releaseMesh(m);
      leafMeshes.clear();
      group.visible = false;
      return;
    }
    syncLeaves();
    group.visible = leafMeshes.size > 0;
  }

  function update() {
    if (disposed || !subject) return;
    if (!subjectPresented(subject)) {
      setSubject(null);
      return;
    }
    syncLeaves();
    group.visible = leafMeshes.size > 0;
  }

  function warmup() {
    if (disposed) return null;
    if (!warmGeometry) {
      warmGeometry = new THREE.PlaneGeometry(0.001, 0.001);
      warmMesh = new THREE.Mesh(warmGeometry, material);
      group.add(warmMesh);
    }
    return group;
  }

  function dispose(options = {}) {
    if (disposed) return;
    subject = null;
    for (const m of leafMeshes.values()) releaseMesh(m);
    leafMeshes.clear();
    group.visible = false;
    disposed = true;
    for (const m of pool) m.geometry = placeholderGeometry;
    pool.length = 0;
    if (warmMesh && warmMesh.parent) warmMesh.parent.remove(warmMesh);
    if (group.parent) group.parent.remove(group);
    if (options.disposeGpu !== false) {
      try { material.dispose(); } catch (_) {}
      try { warmGeometry && warmGeometry.dispose(); } catch (_) {}
      try { placeholderGeometry.dispose(); } catch (_) {}
    }
    warmMesh = null;
    warmGeometry = null;
    subject = null;
  }

  return {
    setSubject,
    clear: () => setSubject(null),
    update,
    warmup,
    dispose,
    get subject() { return subject; },
    get overlayCount() { return leafMeshes.size; },
  };
}

export function createWorldObjectHoverPresentation(state) {
  let disposed = false;
  let overlay = null;
  let boundScene = null;
  let requestedSubject = null;
  let api = null;

  function currentScene() {
    return (state && state.render && state.render.scene) || null;
  }

  function prewarm() {
    const render = state && state.render;
    if (!overlay || !render || typeof render.compileObjectPipelines !== 'function') return;
    try {
      const p = render.compileObjectPipelines(
        overlay.warmup(),
        { explicit: true, forceIncludeInvisible: true },
      );
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  function bindScene() {
    const scene = currentScene();
    if (scene === boundScene) return;
    if (overlay) {
      try { overlay.dispose(); } catch (_) {}
      overlay = null;
    }
    boundScene = scene;
    if (!scene) return;
    overlay = createObjectHoverFeedback({ scene });
    prewarm();
    if (requestedSubject) {
      try { overlay.setSubject(requestedSubject); } catch (_) {}
    }
  }

  function setSubject(root) {
    if (disposed) return;
    requestedSubject = root || null;
    bindScene();
    if (overlay) {
      try { overlay.setSubject(requestedSubject); } catch (_) {}
    }
  }

  api = {
    setSubject: (root) => setSubject(root),
    clear: () => setSubject(null),
    get subject() { return overlay ? overlay.subject : null; },
  };

  function publishApi() {
    const render = state && state.render;
    if (render && render.worldObjectHover == null) render.worldObjectHover = api;
  }

  function update() {
    if (disposed) return;
    publishApi();
    bindScene();
    if (overlay) overlay.update();
  }

  publishApi();
  bindScene();

  return {
    setSubject,
    clear: () => setSubject(null),
    update,
    get subject() { return overlay ? overlay.subject : null; },
    get overlay() { return overlay; },
    dispose() {
      if (disposed) return;
      disposed = true;
      requestedSubject = null;
      if (overlay) {
        try { overlay.dispose(); } catch (_) {}
        overlay = null;
      }
      boundScene = null;
      const render = state && state.render;
      if (render && render.worldObjectHover === api) render.worldObjectHover = null;
    },
  };
}
