/** RUCKUS is the Blender-authored mesh, not a procedural substitute.
 * Its generated GLB buffers are decoded synchronously on first use and shared thereafter.
 * This deliberately supports only the validated rigid, texture-free GLB subset emitted by
 * tools/ruckus/pack-model.mjs. Unsupported assets fail loudly at build/test time.
 */
import * as THREE from 'three';
import { RUCKUS_MESH_KEYS } from './ruckusMeshData.js';
import { RUCKUS as C } from '../../data/ruckus.js';
const templates = new Map();
// Boot-eval deferral (wave-140 B5): each entry's `json` is stored as text so the module-eval task
// only interns the string; the document is parsed here on first use or by the post-eval warm
// below, before the first RU-7 spawn can reach a real frame.
const parsedDocs = new Map();
// Wave-143 (boot F1): the packed {json, binary} entries moved off the static import graph into
// ruckusMeshData/<key>.js modules. The post-eval warm at the bottom of this file dynamic-imports
// each payload and feeds the same sliced decode; consumers only ever read this map — populated
// by warm, or synchronously by coldEntry() where a Node/Electron require() exists.
const meshData = new Map();
// Cold payload path: require(esm) returns the identical bytes synchronously without a static
// import — the route Node tests and the Electron renderer take. A browser caller can never
// reach this: every real template() consumer is post-title, and both title→flight transitions
// await ruckusWarmReady before any entity can materialize (main.js prepareRun before
// bootstrapScene; helpers.deferLoadedGameRestore before the chunked save restore). The
// renderer's mesh-build lane also retries a failed build three times before latching _noMesh,
// so even a hypothetical cold read degrades instead of faulting the frame.
function coldEntry(key) {
  const nodeModule = globalThis.process?.getBuiltinModule?.('module');
  const req = nodeModule?.createRequire?.(import.meta.url);
  if (req) {
    const entry = req(`./ruckusMeshData/${key}.js`).default;
    meshData.set(key, entry);
    return entry;
  }
  throw new Error(
    `RU-7 asset "${key}" template was read before its data module decoded. This is unreachable `
    + 'in production (ruckusWarmReady is awaited ahead of every spawn path) — in a workshop, '
    + 'await ruckusWarmReady first; in Node the require() path resolves the payload synchronously.',
  );
}
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ATTR = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color', TANGENT: 'tangent' };
const sat = v => Math.max(0, Math.min(1, v));
// Sliced template build (wave-142): templateSteps yields between decode sub-steps — JSON
// parse, atob, chunked byte copy, materials, per-primitive geometry — so the post-eval warm
// completes the same memo in ~sub-frame tasks instead of one 15-40ms block. template() keeps
// the synchronous contract: it pumps the same generator to completion, so a real consumer
// arriving mid-warm finishes the in-flight build instead of duplicating it.
const pendingTemplates = new Map();
const DECODE_CHUNK = 1 << 18;
function* templateSteps(key) {
  if (!RUCKUS_MESH_KEYS.includes(key)) throw Error(`Unknown RU-7 asset ${key}`);
  const entry = meshData.get(key) || coldEntry(key);
  let doc = parsedDocs.get(key);
  if (!doc) { doc = JSON.parse(entry.json); parsedDocs.set(key, doc); }
  yield;
  const { binary } = entry;
  const raw = atob(binary), buffer = new ArrayBuffer(raw.length), u8 = new Uint8Array(buffer);
  yield;
  for (let i = 0; i < raw.length; i += DECODE_CHUNK) {
    const end = Math.min(i + DECODE_CHUNK, raw.length);
    for (let j = i; j < end; j++) u8[j] = raw.charCodeAt(j);
    yield;
  }
  const accessor = index => {
    const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], Type = TYPES[a.componentType], width = WIDTH[a.type];
    if (!Type || !width || a.sparse) throw Error(`Unsupported RU-7 accessor ${index}`);
    const stride = v.byteStride || Type.BYTES_PER_ELEMENT * width;
    const offset = (v.byteOffset || 0) + (a.byteOffset || 0), data = new Type(a.count * width);
    for (let i = 0; i < a.count; i++) data.set(new Type(buffer, offset + i * stride, width), i * width);
    return new THREE.BufferAttribute(data, width, a.normalized || false);
  };
  const materials = doc.materials.map(spec => {
    const p = spec.pbrMetallicRoughness || {}, color = p.baseColorFactor || [1, 1, 1, 1];
    const coat = spec.extensions?.KHR_materials_clearcoat || {}, strength = spec.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
    const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(...color.slice(0, 3)),
      metalness: p.metallicFactor ?? 1, roughness: p.roughnessFactor ?? 1,
      clearcoat: coat.clearcoatFactor || 0, clearcoatRoughness: coat.clearcoatRoughnessFactor || 0,
      emissive: new THREE.Color().setRGB(...(spec.emissiveFactor || [0, 0, 0])), emissiveIntensity: strength,
      side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
    m.name = spec.name; m.userData = { ...spec.extras, spacefaceSharedAsset: true, ruckusEmission: strength }; return m;
  });
  yield;
  const meshGroups = [];
  for (const mesh of doc.meshes) {
    const group = new THREE.Group();
    for (const p of mesh.primitives) {
      const geometry = new THREE.BufferGeometry();
      for (const [semantic, index] of Object.entries(p.attributes)) {
        if (!ATTR[semantic]) throw Error(`Unsupported RU-7 attribute ${semantic}`);
        geometry.setAttribute(ATTR[semantic], accessor(index));
      }
      if (p.indices != null) geometry.setIndex(accessor(p.indices));
      geometry.userData.spacefaceSharedAsset = true; geometry.computeBoundingSphere();
      const object = new THREE.Mesh(geometry, materials[p.material]); object.castShadow = object.receiveShadow = true; group.add(object);
      yield;
    }
    meshGroups.push(group);
  }
  const nodes = doc.nodes.map(spec => {
    const node = spec.mesh == null ? new THREE.Group() : meshGroups[spec.mesh].clone();
    node.name = spec.name || ''; node.userData = { ...spec.extras };
    if (spec.matrix) { node.matrix.fromArray(spec.matrix); node.matrix.decompose(node.position, node.quaternion, node.scale); }
    else { if (spec.translation) node.position.fromArray(spec.translation); if (spec.rotation) node.quaternion.fromArray(spec.rotation); if (spec.scale) node.scale.fromArray(spec.scale); }
    return node;
  });
  doc.nodes.forEach((s, i) => { for (const child of s.children || []) nodes[i].add(nodes[child]); });
  const root = new THREE.Group(); for (const i of doc.scenes[doc.scene || 0].nodes) root.add(nodes[i]);
  templates.set(key, root); return root;
}
function template(key) {
  if (templates.has(key)) return templates.get(key);
  let it = pendingTemplates.get(key);
  if (!it) { it = templateSteps(key); pendingTemplates.set(key, it); }
  try {
    let step;
    while (!(step = it.next()).done) {}
    return step.value;
  } finally {
    pendingTemplates.delete(key);
  }
}
function instance(key) {
  const root = template(key).clone(true), materials = new Map(), joints = {};
  root.traverse(o => {
    if (o.userData.ru7Joint) { joints[o.userData.ru7Joint] = o; o.userData.animated = true; o.userData.baseQuaternion = o.quaternion.clone(); }
    if (o.isMesh) {
      const base = o.material;
      if (!materials.has(base)) { const m = base.clone(); m.userData = { ...base.userData, spacefaceSharedAsset: false }; materials.set(base, m); }
      o.material = materials.get(base);
    }
  });
  return { root, joints, jointEntries: Object.entries(joints), materials: [...materials.values()] };
}
function energy(color, opacity = 1) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }); }
function hoop(radius, thickness, mat, arc = Math.PI * 2) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 5, 64, arc).rotateX(Math.PI / 2), mat);
  mesh.userData.animated = true; return mesh;
}
export function buildRuckusVisual(entity) {
  const part = entity.data?.ruckusPart;
  if (!['body', 'core', 'pulse', 'memorial'].includes(part)) throw Error(`Unknown RU-7 part ${part}`);
  const root = new THREE.Group(); root.name = `RU7_${part}`;
  Object.assign(root.userData, { kind: entity.type, animated: true, authoredAssetState: 'authored', authoredVisualRoot: 'authored-root',
    visualLanguage: 'ruckus-forge-demolition-retriever', ruckus: true });
  const rigs = [], levels = new THREE.LOD(), stance = new THREE.Group(); stance.userData.animated = true;
  root.add(stance);
  let warning = null, dial = null, sparks = null;
  if (part === 'body' || part === 'memorial') {
    for (const [i, d] of (part === 'memorial' ? [[2, 0]] : [[0, 0], [1, 240], [2, 650]])) {
      const rig = instance(`body${i}`); levels.addLevel(rig.root, d, .12); rigs.push(rig);
    }
    stance.add(levels);
  } else if (part === 'core') {
    const rig = instance('core'); rigs.push(rig); stance.add(rig.root);
    warning = hoop(C.pulseRadius, .32, energy(0xffb348, .24)); warning.position.y = -2; root.add(warning);
    dial = new THREE.Group(); root.add(dial);
    // Three separated mechanical ticks communicate the fuse without colour alone.
    for (let i = 0; i < 3; i++) { const tick = hoop(9, .6, energy(0xffb348, .8), 1.6); tick.rotation.y = i * Math.PI * 2 / 3; dial.add(tick); }
  } else {
    sparks = [0, 1, 2].map(i => { const h = hoop(1, .012 + i * .004, energy(i === 1 ? 0x86f9e3 : 0xffbc67, .5)); root.add(h); return h; });
  }
  root.userData.updateAuthoredMotion = (e, _renderTime, a11y = {}) => {
    const p = e.data?.ruckusPose || {}, t = Number.isFinite(p.simTime) ? p.simTime : 0;
    const reduced = !!a11y.reducedMotion, flash = !!a11y.reducedFlash;
    const dead = part === 'memorial', sleep = p.phase === 'sleep' || dead, excited = ['chase','carry','present'].includes(p.phase);
    const pace = sat((p.speed || 0) / C.maxSpeed), carry = p.phase === 'carry';
    stance.position.y = dead ? -1 : reduced ? 0 : Math.sin(t * (excited ? 4 : 1.6)) * (excited ? .28 : .12);
    stance.rotation.z = reduced ? 0 : -pace * .065;
    for (const rig of rigs) {
      for (const [name, joint] of rig.jointEntries) {
        joint.quaternion.copy(joint.userData.baseQuaternion);
        if (name === 'JawL' || name === 'JawR') joint.rotateY((name === 'JawL' ? 1 : -1) * (dead ? .28 : carry ? -.10 : sleep ? .08 : .22));
        if (name === 'Tail') joint.rotateY(dead ? -.5 : reduced ? 0 : Math.sin(t * (excited ? 9 : 2.1)) * (excited ? .3 : .06 + (p.bond || 0) * .035));
        if (name === 'Drum' && !reduced && !sleep) joint.rotateY(t * (.35 + pace));
        if (name.startsWith('Paw') && !reduced) joint.rotateZ(Math.sin(t * 4 + (name.includes('-1') ? Math.PI : 0)) * pace * .08);
      }
      for (const m of rig.materials) {
        if (m.emissive.getHex() === 0) continue;
        const base = m.userData.ruckusEmission || 1;
        m.emissiveIntensity = dead ? 0 : base * (sleep ? .2 : (p.charge && !flash ? .78 + Math.sin(t * 5) * .16 : .85));
      }
    }
    if (warning) {
      warning.visible = !!p.charge && !p.waiting; dial.visible = !!p.charge;
      warning.material.opacity = flash || reduced || p.held ? .22 : .19 + .10 * Math.sin(t * 4);
      for (let i = 0; i < 3; i++) dial.children[i].visible = i < Math.ceil(sat(p.countdown || 0) * 3);
      // The safety envelope is horizontal even when the loose core tumbles in yaw.
      dial.rotation.y = reduced ? 0 : -t * .15;
    }
    if (sparks) for (let i = 0; i < sparks.length; i++) {
      const age = (p.pulseAge || 0) - i * .09, n = sat(age / .85), h = sparks[i];
      h.visible = age >= 0 && age < .85;
      h.scale.setScalar(reduced ? C.pulseRadius : 3 + n * (C.pulseRadius - 3));
      h.position.y = i * .5;
      h.material.opacity = (1 - n) * (flash ? .18 : .55);
    }
  };
  root.userData.updateAuthoredMotion(entity, 0);
  root.userData.disposeRuckus = () => disposeRuckusVisual(root);
  return root;
}
export function disposeRuckusVisual(root) {
  if (!root || root.userData.ruckusDisposed) return;
  root.userData.ruckusDisposed = true;
  const materials = new Set(), geometries = new Set();
  root.traverse(o => { if (o.geometry && !o.geometry.userData.spacefaceSharedAsset) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); root.removeFromParent();
}
// Post-eval warm (wave-143): fetch + intern each payload module via dynamic import — off the
// static graph — then advance one template sub-step per task, the same pacing contract the
// W142 driver had. ruckusWarmReady resolves once every key has a finished template(); the
// title→flight transitions await it before any entity can materialize, and RU-7 entities only
// ever spawn inside a run, so no real template() consumer can precede warm completion. A
// mid-warm template() still pumps the shared pending iterator to completion synchronously.
export const ruckusWarmReady = typeof window === 'undefined'
  ? Promise.resolve()
  : (async () => {
      const arrivals = new Map(RUCKUS_MESH_KEYS.map((key) => [
        key,
        import(`./ruckusMeshData/${key}.js`).then((mod) => meshData.set(key, mod.default)),
      ]));
      for (const key of RUCKUS_MESH_KEYS) {
        await arrivals.get(key);
        if (templates.has(key)) continue;
        let it = pendingTemplates.get(key);
        if (!it) { it = templateSteps(key); pendingTemplates.set(key, it); }
        try {
          let step;
          while (!(step = it.next()).done) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        } finally {
          pendingTemplates.delete(key);
        }
      }
    })();
/** For isolated workshops/tests after every instance has been destroyed, never during flight. */
export function clearRuckusModelCache() {
  const geometries = new Set(), materials = new Set();
  for (const root of templates.values()) root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); templates.clear();
}
