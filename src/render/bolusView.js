// Throat mesh for The Bolus. Visible only inside the sector.
// Does not write the camera, does not spawn a second line, does not touch the starfield.

import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../data/theBolus.js';
import { SECTOR_GLOBAL_ORIGINS } from '../data/sectorCoordinates.js';
import {
  BOLUS_LANTERN_SHAFTS,
  acidScroll,
  baleenPitch,
  buildBolusCanal,
  ciliaLean,
  irisBlades,
  ribRadial,
} from './bolusCanal.js';
import { bolusCoughOffset, bolusIrisShutter } from '../data/bolusPlay.js';
import { bolusSilhouette } from './bolusSilhouettes.js';
import { noteShadowCensusLightMutation } from './shadowDepthAdmission.js';

const scratch = { x: 0, y: 0, z: 0 };
const FREEZE = new Set(['louse', 'fingerling', 'mite']);

export function syncBolusView(renderer) {
  if (!renderer || !renderer.scene || !renderer.state) return;
  const sectorId = renderer.state.world && renderer.state.world.currentSectorId;
  const inside = sectorId === BOLUS_SECTOR_ID;
  if (!inside && !renderer._bolusView) return;
  const view = ensureView(renderer);
  view.group.visible = inside;
  // The shaft lights live on their own always-visible group and gate on intensity — a
  // .visible flip would drop them from the rendered-light census and churn every material's
  // program key (numPointLights) at the sector boundary, the recompile storm the pool
  // discipline exists to kill. Intensity 0 is output-identical to a hidden light.
  if (!inside) {
    for (let i = 0; i < view.lights.length; i++) view.lights[i].intensity = 0;
    return;
  }

  const origin = SECTOR_GLOBAL_ORIGINS[BOLUS_SECTOR_ID];
  if (renderer._frameMembrane && typeof renderer._frameMembrane.toLocal === 'function') {
    const local = renderer._frameMembrane.toLocal({ x: origin.x, y: 0, z: origin.z }, scratch);
    view.group.position.set(local.x || 0, 0, local.z || 0);
  } else {
    view.group.position.set(origin.x, 0, origin.z);
  }
  view.lightGroup.position.copy(view.group.position);

  const sim = Number(renderer.state.simTime) || 0;
  const ecology = renderer.state.world && renderer.state.world.alienEcology;
  const flags = ecology && ecology.sectorFlags ? ecology.sectorFlags : {};
  const stalled = Number(flags['bolus:peristalsisUntil']) > sim;
  const onCrest = Number(flags['bolus:crestHoldUntil']) > sim;
  const radial = ribRadial(onCrest, stalled);
  const quiet = Number(flags['bolus:acidQuietUntil']) > sim;
  const player = renderer.state.entities && renderer.state.entities.get
    ? renderer.state.entities.get(renderer.state.playerId)
    : null;
  const speed = player && player.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : 0;
  const boosting = !!(player && player.flags && player.flags.boosting);
  const coasting = !boosting && speed > 1 && speed <= 40;
  const lean = ciliaLean(sim, coasting);
  const pitch = baleenPitch(Number(flags['bolus:baleenKickUntil']) > sim);

  for (let i = 0; i < view.ribs.length; i++) {
    const mesh = view.ribs[i];
    const attr = mesh.geometry.attributes.position;
    if (!mesh.userData.base) mesh.userData.base = attr.array.slice();
    const base = mesh.userData.base;
    for (let v = 0; v < base.length; v += 3) {
      const x = base[v];
      const y = base[v + 1];
      const len = Math.hypot(x, y) || 1;
      attr.setXYZ(v / 3, x + (x / len) * radial, y + (y / len) * radial, base[v + 2]);
    }
    attr.needsUpdate = true;
  }
  for (let i = 0; i < view.cilia.length; i++) view.cilia[i].rotation.x = lean;
  for (let i = 0; i < view.baleen.length; i++) view.baleen[i].rotation.x = pitch;
  if (view.acid) {
    view.acid.userData.scroll = acidScroll(sim, quiet, view.acid.userData.scroll || 0);
    view.acid.position.z = view.acid.userData.scroll;
  }
  const open = bolusIrisShutter(sim);
  for (let i = 0; i < view.iris.length; i++) {
    const angle = (i / view.iris.length) * Math.PI * 2;
    const slide = (260 - 16) * open;
    view.iris[i].position.set(Math.cos(angle) * slide, Math.sin(angle) * slide, 0);
  }
  const cracked = flags['bolus:coughCracked'] === true;
  const coughMeshes = view.cough || [];
  for (let i = 0; i < coughMeshes.length; i++) {
    const mesh = coughMeshes[i];
    mesh.position.y = bolusCoughOffset(cracked, mesh.name);
  }
  const pulseBase = 4 + 3 * Math.sin(sim * 0.7);
  for (let i = 0; i < view.lights.length; i++) {
    view.lights[i].intensity = pulseBase + i * 0.15;
  }
  syncFreezeCards(view, renderer.state);
}

function ensureView(renderer) {
  const seed = renderer.state && renderer.state.meta ? renderer.state.meta.seed : 1;
  if (renderer._bolusView?.group.parent === renderer.scene && renderer._bolusView.seed === seed) return renderer._bolusView;
  disposeBolusView(renderer);
  const canal = buildBolusCanal(seed);
  const group = new THREE.Group();
  group.name = 'SF_BolusCanal';
  const ribs = [];
  const cilia = [];
  const baleen = [];
  const iris = [];
  const cough = [];
  let acid = null;
  for (let i = 0; i < canal.parts.length; i++) {
    const row = canal.parts[i];
    if (row.kind === 'iris') continue;
    const mesh = meshFromPart(row);
    mesh.name = row.id;
    if (row.kind === 'rib') {
      mesh.userData.baseScale = 1;
      ribs.push(mesh);
    } else if (row.kind === 'cilia') cilia.push(mesh);
    else if (row.kind === 'baleen') baleen.push(mesh);
    else if (row.kind === 'acid') acid = mesh;
    else if (row.kind === 'cough') cough.push(mesh);
    group.add(mesh);
  }
  const shut = irisBlades(0);
  for (let i = 0; i < shut.length; i++) {
    const mesh = meshFromPart(shut[i]);
    mesh.name = shut[i].id;
    iris.push(mesh);
    group.add(mesh);
  }
  const lightGroup = new THREE.Group();
  lightGroup.name = 'SF_BolusLanternShafts';
  const lights = [];
  for (let i = 0; i < BOLUS_LANTERN_SHAFTS.length; i++) {
    const shaft = BOLUS_LANTERN_SHAFTS[i];
    const light = new THREE.PointLight(0xffb090, 4, 180, 1.4);
    light.position.set(shaft.x, shaft.y, shaft.z);
    light.castShadow = false;
    light.name = `bolus_shaft_${i}`;
    lightGroup.add(light);
    lights.push(light);
  }
  const cards = new THREE.Group();
  cards.name = 'SF_BolusFreeze';
  group.add(cards);
  renderer.scene.add(group);
  renderer.scene.add(lightGroup);
  noteShadowCensusLightMutation();
  renderer._bolusView = { group, lightGroup, ribs, cilia, baleen, iris, acid, lights, cards, cough, seed };
  return renderer._bolusView;
}

export function disposeBolusView(renderer, { disposeGpu = true } = {}) {
  const view = renderer?._bolusView;
  if (!view) return;
  const hadMountedLights = view.lightGroup?.parent != null;
  view.group.removeFromParent();
  view.lightGroup?.removeFromParent();
  if (hadMountedLights) noteShadowCensusLightMutation();
  if (disposeGpu) {
    view.group.traverse((node) => {
      node.geometry?.dispose();
      if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
      else node.material?.dispose();
    });
  }
  renderer._bolusView = null;
}

function meshFromPart(row) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(row.positions, 3));
  if (row.indices) geometry.setIndex(row.indices);
  if (row.normals) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(row.normals, 3));
  else geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: row.color,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function syncFreezeCards(view, state) {
  const cards = view.cards;
  const origin = SECTOR_GLOBAL_ORIGINS[BOLUS_SECTOR_ID];
  const want = [];
  // Bolus organs all claim the bolus sector (homeSectorId heads the canonical
  // claim chain) — same bucket conversion as tickBolus: entityList only while
  // the lane is unready.
  const bolusIndex = state.entityIndex;
  const list = bolusIndex && bolusIndex.__spacefaceEntityIndexV1 === true
      && bolusIndex.ready === true && bolusIndex.bySectorId instanceof Map
    ? (bolusIndex.bySectorId.get(BOLUS_SECTOR_ID) || [])
    : (state.entityList || []);
  for (let i = 0; i < list.length; i++) {
    const ent = list[i];
    if (!ent || !ent.data || !ent.data.bolus || !ent.pos || ent.alive === false) continue;
    if (!FREEZE.has(ent.data.bolus.role)) continue;
    const vel = ent.vel || { x: 0, z: 0 };
    if (Math.hypot(vel.x || 0, vel.z || 0) > 0.5) continue;
    want.push(ent);
  }
  const key = want.map((ent) => ent.id).join(',');
  if (key === view.freezeKey) {
    for (let i = 0; i < want.length; i++) {
      const ent = want[i];
      const x = ent.pos.x - origin.x;
      const z = ent.pos.z - origin.z;
      const left = cards.children[i * 2];
      const right = cards.children[i * 2 + 1];
      if (left) left.position.set(x, 8, z);
      if (right) right.position.set(x, 8, z);
    }
    return;
  }
  view.freezeKey = key;
  for (let i = cards.children.length - 1; i >= 0; i--) {
    const child = cards.children[i];
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
    cards.remove(child);
  }
  for (let i = 0; i < want.length; i++) {
    const ent = want[i];
    const recipe = bolusSilhouette(`bolus_${ent.data.bolus.role}`, { stopped: true });
    const splayed = recipe.parts.filter((part) => part.id.startsWith('splay_'));
    for (let p = 0; p < splayed.length; p++) {
      const mesh = meshFromPart(splayed[p]);
      mesh.position.set(ent.pos.x - origin.x, 8, ent.pos.z - origin.z);
      mesh.scale.setScalar(14);
      cards.add(mesh);
    }
  }
}
