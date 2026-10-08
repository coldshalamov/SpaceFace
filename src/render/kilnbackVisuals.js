import * as THREE from 'three';
import { KILNBACK as C, KILNBACK_CASK_IDS } from '../data/kilnback.js';
import { kilnbackPresentation } from '../systems/kilnback.js';
import { readFrameOrigin } from './frameCoordinates.js';

export const KILNBACK_ASSET_ID = 'SF_SHIP_KILNBACK';
export const KILNBACK_FILE = 'wholeships/kilnback.glb';
export const KILNBACK_CASK_ASSET_ID = 'SF_PROP_KILNBACK_CASK';
export const KILNBACK_CASK_FILE = 'wholeships/kilnback_cask.glb';
export const KILNBACK_MOTION_NODES = Object.freeze([
  ...Array.from({ length: 6 }, (_, i) => `MOTION_KILNBACK_SLAT_${i + 1}`),
  'MOTION_KILNBACK_CASK_PORT', 'MOTION_KILNBACK_CASK_STARBOARD',
]);
export function isKilnbackEntity(entity) {
  return entity?.data?.persistenceOwner === C.persistenceOwner && typeof entity.data.kilnbackKey === 'string'
    && !entity.data.kilnbackCaskId && entity.data.lootTableId === C.enemyId;
}
export function isKilnbackCask(entity) {
  return entity?.data?.persistenceOwner === C.persistenceOwner && KILNBACK_CASK_IDS.includes(entity.data.kilnbackCaskId);
}
function sourceMatches(root) {
  const source = root?.userData?.kilnbackAuthoredSource;
  return source?.assetId === KILNBACK_ASSET_ID && typeof source.file === 'string'
    && source.file.replace(/^.*assets\/ships\/(?:release\/)?parts\//, '') === KILNBACK_FILE;
}
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const radians = degrees => degrees * Math.PI / 180;

// Three broad curved folds occupy a volume. They are actual triangulated surfaces,
// never camera-facing cards, particles or collision/damage queries.
function folds(length, width, rise, color) {
  const position = [], index = [];
  for (let fold = 0; fold < 3; fold++) {
    const start = position.length / 3, side = fold - 1;
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, envelope = Math.sin(Math.PI * t) ** .6;
      for (const edge of [-1, 1]) {
        position.push(length * t, rise * Math.sin(Math.PI * t + fold * .7) * envelope,
          side * width * .5 * t + edge * width * .24 * envelope + width * .10 * Math.sin(t * Math.PI * 2 + fold));
      }
      if (i < 18) { const a = start + 2 * i; index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide,
    transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false; mesh.frustumCulled = false;
  return mesh;
}

// Continuous source phases describe the current machinery pose, including Continue.
// Heat tongues require actual surviving field receipts; a consumed pulse is insufficient.
export function createKilnbackVisualDriver(root, entity) {
  if (!isKilnbackEntity(entity) || !sourceMatches(root)) return null;
  const nodes = new Map();
  root.traverse(node => { if (KILNBACK_MOTION_NODES.includes(node.name)) nodes.set(node.name, node); });
  if (nodes.size !== 8) throw new Error('Kilnback source lacks six radiator and two cask pivots');
  const slats = KILNBACK_MOTION_NODES.slice(0, 6).map(name => nodes.get(name));
  const casks = KILNBACK_MOTION_NODES.slice(6).map(name => nodes.get(name));
  const rests = slats.map(node => node.quaternion.clone());
  const hotMaterials = [], replacements = [], clones = new Map();
  root.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const original = node.material, materials = Array.isArray(original) ? original : [original];
    let changed = false;
    const owned = materials.map(material => {
      if (!material.name?.startsWith('Material_Emissive_Amber')) return material;
      changed = true;
      if (!clones.has(material)) { const clone = material.clone(); clones.set(material, clone);
        hotMaterials.push({ material: clone, intensity: material.emissiveIntensity }); }
      return clones.get(material);
    });
    if (changed) { replacements.push({ node, original }); node.material = Array.isArray(original) ? owned : owned[0]; }
  });
  const frostMaterials = casks.map(cask => {
    const owned = [], localClones = new Map();
    cask.traverse(node => {
      if (!node.isMesh || !node.material) return;
      const original = node.material, materials = Array.isArray(original) ? original : [original];
      let changed = false;
      const selected = materials.map(material => {
        if (!material.name?.startsWith('Material_Ceramic')) return material;
        changed = true;
        if (!localClones.has(material)) { const clone = material.clone(); localClones.set(material, clone);
          owned.push({ material: clone, color: material.color.clone(), roughness: material.roughness }); }
        return localClones.get(material);
      });
      if (changed) { replacements.push({ node, original }); node.material = Array.isArray(original) ? selected : selected[0]; }
    });
    return owned;
  });
  const frostColor = new THREE.Color(0x98b4b8);
  const effectRoot = new THREE.Group(); effectRoot.name = 'KILNBACK_CAUSAL_THERMAL'; root.add(effectRoot);
  const heat = [folds(42, 15, 2.1, 0xc87935), folds(42, 15, 2.1, 0xe2a151)];
  for (const mesh of heat) { mesh.name = 'KILNBACK_ACCEPTED_HEAT'; effectRoot.add(mesh); }
  const vapor = KILNBACK_CASK_IDS.map((_, i) => {
    const mesh = folds(5, 1.5, .5, 0x8da8a9); mesh.name = 'KILNBACK_FINITE_CONDENSATION';
    mesh.position.set(-3.2, 1.75, i === 0 ? -10 : 10); effectRoot.add(mesh); return mesh;
  });
  const id = entity.id, life = entity.occupantGeneration, axis = new THREE.Vector3(1, 0, 0);
  const allEffects = [...heat, ...vapor], origin = { x: 0, z: 0 };
  const turn = new THREE.Quaternion(), worldRotation = new THREE.Quaternion();
  const point = new THREE.Vector3(), direction = new THREE.Vector3(), worldPoint = new THREE.Vector3();
  let retired = false;
  const quiet = () => {
    for (let i = 0; i < slats.length; i++) { slats[i].quaternion.copy(rests[i]); slats[i].updateMatrix(); }
    for (const entry of hotMaterials) entry.material.emissiveIntensity = 0;
    for (const materials of frostMaterials) for (const entry of materials) {
      entry.material.color.copy(entry.color); entry.material.roughness = entry.roughness;
    }
    for (const mesh of allEffects) mesh.visible = false;
  };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life
        && live.alive !== false && isKilnbackEntity(live) && state?.entities?.get(id) === live
        && sourceMatches(root) && inside(root, live.mesh) && !!state.render?.scene && inside(root, state.render.scene);
      const frame = valid ? kilnbackPresentation(state, live) : null;
      if (!frame || frame.nativeBodyReady !== true || !Number.isSafeInteger(frame.phaseStartTick)
        || frame.phaseStartTick > state.tick || frame.tick !== state.tick) { quiet(); return; }
      const age = state.tick - frame.phaseStartTick;
      const reduced = a11y?.reducedMotion === true, lowFlash = a11y?.reducedFlash === true;
      let opening = frame.phase === 'preheat' ? smooth(age / C.preheatTicks)
        : frame.phase === 'burn' || frame.phase === 'vent' ? 1 : 0;
      // Reduced motion retains the meaningful open/closed warning, with no continuous cycling.
      if (reduced && frame.phase === 'preheat') opening = 1;
      for (let i = 0; i < slats.length; i++) {
        const angle = radians(55) * opening;
        slats[i].quaternion.copy(rests[i]).multiply(turn.setFromAxisAngle(axis, angle)); slats[i].updateMatrix();
      }
      for (let i = 0; i < casks.length; i++) casks[i].visible = frame.attachedCaskIds?.includes(KILNBACK_CASK_IDS[i]) === true;
      for (let i = 0; i < frostMaterials.length; i++) {
        const cask = frame.casks?.[KILNBACK_CASK_IDS[i]];
        const frost = cask?.status === 'attached' && cask.coolant > 0
          ? (frame.phase === 'preheat' ? .45 * opening : frame.phase === 'burn' ? .45 : frame.phase === 'vent' ? .25 : 0) : 0;
        for (const entry of frostMaterials[i]) {
          entry.material.color.copy(entry.color).lerp(frostColor, frost); entry.material.roughness = entry.roughness + .15 * frost;
        }
      }
      const lanes = frame.activeHeatLanes || [];
      const heatGain = frame.phase === 'preheat' ? .08 + .45 * opening
        : frame.phase === 'burn' ? (lanes.length ? 1 : .25)
        : frame.phase === 'vent' ? .40 * (1 - Math.min(1, age / C.ventTicks)) : 0;
      for (const entry of hotMaterials) entry.material.emissiveIntensity = entry.intensity * heatGain * (lowFlash ? .45 : 1);
      root.updateWorldMatrix(true, false);
      root.getWorldQuaternion(worldRotation).invert(); root.getWorldPosition(worldPoint);
      readFrameOrigin(state, origin);
      for (let i = 0; i < heat.length; i++) {
        const mesh = heat[i], lane = lanes[i];
        const accepted = lane && lane.ownerLife === life && typeof lane.id === 'string'
          && Number.isFinite(lane.center?.x) && Number.isFinite(lane.center?.z)
          && Number.isFinite(lane.dir?.x) && Number.isFinite(lane.dir?.z)
          && Math.hypot(lane.dir.x, lane.dir.z) > .1 && Number.isFinite(lane.radius) && lane.radius > 0
          && Number.isFinite(lane.expireAt) && lane.expireAt > state.simTime && lane.createdAt <= state.simTime;
        mesh.visible = !!accepted;
        if (!accepted) continue;
        point.set(lane.center.x - origin.x, worldPoint.y + .15, lane.center.z - origin.z);
        root.worldToLocal(point); mesh.position.copy(point);
        direction.set(lane.dir.x, 0, lane.dir.z).applyQuaternion(worldRotation).normalize();
        mesh.quaternion.setFromUnitVectors(axis, direction);
        const remain = Math.min(1, (lane.expireAt - state.simTime) / C.pulseSeconds);
        mesh.material.opacity = (.22 + .35 * remain) * (lowFlash ? .6 : 1);
        mesh.scale.set(Math.min(1, lane.radius / 42), 1, 1);
      }
      for (let i = 0; i < vapor.length; i++) {
        const mesh = vapor[i], cask = frame.casks?.[KILNBACK_CASK_IDS[i]];
        mesh.visible = frame.phase === 'vent' && age < C.ventTicks && cask?.status === 'attached' && cask.coolant > 0;
        mesh.material.opacity = .20 * (1 - Math.min(1, age / C.ventTicks));
        mesh.scale.y = reduced ? 1 : .75 + .25 * Math.sin(age / 35 + i);
      }
    },
    dispose() {
      if (retired) return; retired = true; quiet();
      for (let i = replacements.length - 1; i >= 0; i--) replacements[i].node.material = replacements[i].original;
      for (const clone of clones.values()) clone.dispose();
      for (const materials of frostMaterials) for (const entry of materials) entry.material.dispose();
      for (const mesh of allEffects) { mesh.geometry.dispose(); mesh.material.dispose(); }
      effectRoot.removeFromParent();
    },
  };
}
