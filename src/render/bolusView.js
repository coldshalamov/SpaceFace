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
import { nocturneForScene } from './nocturne/bridge.js';

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

  // The crest has only two radial poses. Skip unchanged buffers, but reapply
  // the pose if a geometry replacement installs a different position attribute.
  const ribPositions = view.ribPositions || (view.ribPositions = []);
  for (let i = 0; i < view.ribs.length; i++) {
    const mesh = view.ribs[i];
    const attr = mesh.geometry.attributes.position;
    if (view.ribRadial === radial && ribPositions[i] === attr) continue;
    if (!mesh.userData.base || mesh.userData.base.length !== attr.array.length) {
      mesh.userData.base = attr.array.slice();
    }
    const base = mesh.userData.base;
    for (let v = 0; v < base.length; v += 3) {
      const x = base[v];
      const y = base[v + 1];
      const len = Math.hypot(x, y) || 1;
      attr.setXYZ(v / 3, x + (x / len) * radial, y + (y / len) * radial, base[v + 2]);
    }
    attr.needsUpdate = true;
    ribPositions[i] = attr;
  }
  view.ribRadial = radial;
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
    const light = view.lights[i];
    if (light._nocturneSource) {
      const socket = BOLUS_LANTERN_SHAFTS[i];
      light.position.set(socket.x + view.group.position.x, socket.y,
        socket.z + view.group.position.z);
      // Preserve the authored strength at a 48-world-unit reference distance while making
      // the new local source obey inverse-square attenuation.
      light.intensity = (pulseBase + i * 0.15) * Math.pow(48, 0.6);
    } else light.intensity = pulseBase + i * 0.15;
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
  const nocturne = nocturneForScene(renderer.scene);
  for (let i = 0; i < BOLUS_LANTERN_SHAFTS.length; i++) {
    const shaft = BOLUS_LANTERN_SHAFTS[i];
    const light = nocturne
      ? nocturne.createLight(`bolus:lantern:${i}`, 'point', { color: 0xffb090,
        range: 180, decay: 2, priority: 2, stationary: true })
      : new THREE.PointLight(0xffb090, 4, 180, 1.4);
    light.position.set(shaft.x, shaft.y, shaft.z);
    light.castShadow = false;
    light.name = `bolus_shaft_${i}`;
    if (!nocturne) lightGroup.add(light);
    lights.push(light);
  }
  const cards = new THREE.Group();
  cards.name = 'SF_BolusFreeze';
  group.add(cards);
  renderer.scene.add(group);
  renderer.scene.add(lightGroup);
  if (!nocturne) noteShadowCensusLightMutation();
  renderer._bolusView = { group, lightGroup, ribs, cilia, baleen, iris, acid, lights, cards, cough, seed };
  return renderer._bolusView;
}

export function disposeBolusView(renderer, { disposeGpu = true } = {}) {
  const view = renderer?._bolusView;
  if (!view) return;
  const hadMountedLights = view.lightGroup?.children.length > 0 && view.lightGroup?.parent != null;
  for (const light of view.lights) if (light._nocturneSource) light.dispose();
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
    emissive: row.emissive || 0x000000,
    emissiveIntensity: row.emissiveIntensity != null ? row.emissiveIntensity : 1,
  });
  return new THREE.Mesh(geometry, material);
}

function freezeEntryMatches(entry, ent) {
  return entry.id === ent.id && entry.role === ent.data.bolus.role;
}

function disposeFreezeEntry(cards, entry) {
  for (const child of entry.meshes) {
    child.geometry?.dispose();
    child.material?.dispose();
    cards.remove(child);
  }
}

function syncFreezeCards(view, state) {
  const cards = view.cards;
  const origin = SECTOR_GLOBAL_ORIGINS[BOLUS_SECTOR_ID];
  const want = view.freezeWanted || (view.freezeWanted = []);
  const previous = view.freezeEntries || (view.freezeEntries = []);
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
    if (Math.hypot(ent.vel?.x || 0, ent.vel?.z || 0) > 0.5) continue;
    want.push(ent);
  }
  let unchanged = previous.length === want.length;
  for (let i = 0; unchanged && i < want.length; i++) {
    unchanged = freezeEntryMatches(previous[i], want[i]);
  }

  let entries = previous;
  if (!unchanged) {
    // Entity IDs are unique within the sector index. Splay cards contain no
    // occupant state, so an ID recycled with the same role can reuse its pair.
    const available = new Map(previous.map(entry => [entry.id, entry]));
    entries = [];
    for (const ent of want) {
      let entry = available.get(ent.id);
      if (entry && freezeEntryMatches(entry, ent)) {
        available.delete(ent.id);
      } else {
        const role = ent.data.bolus.role;
        const recipe = bolusSilhouette(`bolus_${role}`, { stopped: true });
        const meshes = [];
        for (const part of recipe.parts) {
          if (!part.id.startsWith('splay_')) continue;
          const mesh = meshFromPart(part);
          mesh.scale.setScalar(14);
          cards.add(mesh);
          meshes.push(mesh);
        }
        entry = { id: ent.id, role, meshes };
      }
      entries.push(entry);
    }
    for (const entry of available.values()) disposeFreezeEntry(cards, entry);
    // Preserve the old entity-list order without detaching unchanged meshes.
    let cursor = 0;
    for (const entry of entries) {
      for (const mesh of entry.meshes) {
        if (cards.children[cursor] !== mesh) {
          const from = cards.children.indexOf(mesh, cursor + 1);
          if (from >= 0) cards.children.splice(cursor, 0, cards.children.splice(from, 1)[0]);
        }
        cursor++;
      }
    }
    view.freezeEntries = entries;
  }
  for (let i = 0; i < want.length; i++) {
    const ent = want[i];
    const x = ent.pos.x - origin.x;
    const z = ent.pos.z - origin.z;
    for (const mesh of entries[i].meshes) mesh.position.set(x, 8, z);
  }
  want.length = 0;
}
