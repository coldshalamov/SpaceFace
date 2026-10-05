/** RUCKUS is the Blender-authored mesh, not a procedural substitute.
 * Its generated GLB buffers are decoded synchronously on first use and shared thereafter.
 * This deliberately supports only the validated rigid, texture-free GLB subset emitted by
 * tools/ruckus/pack-model.mjs. Unsupported assets fail loudly at build/test time.
 */
import * as THREE from 'three';
import { RUCKUS_MESH_DATA } from './ruckusMeshData.js';
import { RUCKUS as C } from '../../data/ruckus.js';
const templates = new Map();
const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ATTR = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color', TANGENT: 'tangent' };
const sat = v => Math.max(0, Math.min(1, v));
function template(key) {
  if (templates.has(key)) return templates.get(key);
  const entry = RUCKUS_MESH_DATA[key]; if (!entry) throw Error(`Unknown RU-7 asset ${key}`);
  const { json: doc, binary } = entry;
  const raw = atob(binary), buffer = new ArrayBuffer(raw.length), u8 = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
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
  const meshGroups = doc.meshes.map(mesh => {
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
    }
    return group;
  });
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
/** For isolated workshops/tests after every instance has been destroyed, never during flight. */
export function clearRuckusModelCache() {
  const geometries = new Set(), materials = new Set();
  for (const root of templates.values()) root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); templates.clear();
}
