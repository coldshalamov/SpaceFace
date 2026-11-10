// Read-only in-world counterpart to the Orchard's existing component card. The three
// markers sit at the authored sockets; the exit arrow follows an actual released pod.
import * as THREE from 'three';
import { ANVIL_ORCHARD } from '../data/anvilOrchard.js';
import { ORCHARD_GEOMETRY as G } from '../data/anvilOrchardBody.js';
import { isOrchardPod } from '../data/anvilOrchardIdentity.js';
import { stableEntityKey } from '../data/interactionDescriptorCatalog.js';
import { listSelectableComponents } from '../systems/interactionDescriptors.js';

const COMPONENT_IDS = Object.freeze(['orchard_socket_0', 'orchard_socket_1', 'orchard_socket_2']);

function attached(node, scene) {
  for (let n = node; n; n = n.parent) {
    if (n.visible === false) return false;
    if (n === scene) return true;
  }
  return false;
}

function segment(array, ax, ay, az, bx, by, bz) { array.push(ax, ay, az, bx, by, bz); }
function socketGeometry(socket) {
  const p = [];
  // A segmented collar and one, two, or three radial ticks match the component's number.
  const radius = 8;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI * 2 / 24, b = (i + 0.72) * Math.PI * 2 / 24;
    segment(p, Math.cos(a) * radius, 0, Math.sin(a) * radius,
      Math.cos(b) * radius, 0, Math.sin(b) * radius);
  }
  for (let i = 0; i <= socket; i++) {
    const x = (i - socket / 2) * 2.4;
    segment(p, x, 0, -10, x, 0, -13);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return geometry;
}

function progressGeometry() {
  const p = [];
  for (let i = 0; i < ANVIL_ORCHARD.openingSteps; i++) {
    const a = i * Math.PI * 2 / ANVIL_ORCHARD.openingSteps;
    const b = (i + 1) * Math.PI * 2 / ANVIL_ORCHARD.openingSteps;
    segment(p, Math.cos(a) * 11, 0, Math.sin(a) * 11,
      Math.cos(b) * 11, 0, Math.sin(b) * 11);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setDrawRange(0, 0);
  return geometry;
}

function exitGeometry() {
  const p = [];
  // A small open bracket around the real pod and a radial arrow, not a route to the receiver.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, b = a + 0.7;
    segment(p, Math.cos(a) * 7, 0, Math.sin(a) * 7, Math.cos(b) * 7, 0, Math.sin(b) * 7);
  }
  segment(p, 8, 0, 0, 19, 0, 0);
  segment(p, 19, 0, 0, 15, 0, -3);
  segment(p, 19, 0, 0, 15, 0, 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return geometry;
}

/** One retained guide set per authored frame, entirely owned and disposed by its visual lease. */
export function createOrchardWorkGuides(root) {
  const group = new THREE.Group();
  group.name = 'OrchardWorkGuides';
  group.visible = false;
  group.renderOrder = 20;
  const inactive = new THREE.LineBasicMaterial({ color: 0x82949c, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
  const ready = new THREE.LineBasicMaterial({ color: 0x80d6df, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
  const selected = new THREE.LineBasicMaterial({ color: 0xffcc72, depthTest: false, depthWrite: false });
  const waiting = new THREE.LineBasicMaterial({ color: 0xff8165, depthTest: false, depthWrite: false });
  const progressMaterial = new THREE.LineBasicMaterial({ color: 0xffe2a2, depthTest: false, depthWrite: false });
  const materials = [inactive, ready, selected, waiting, progressMaterial];
  const sockets = G.sockets.map((socket, index) => {
    const marker = new THREE.Group();
    marker.name = `OrchardSocketGuide${index + 1}`;
    marker.position.set(socket.position[0], 18, socket.position[2]);
    const line = new THREE.LineSegments(socketGeometry(index), inactive);
    const progress = new THREE.LineSegments(progressGeometry(), progressMaterial);
    marker.add(line, progress); group.add(marker);
    return { marker, line, progress };
  });
  const exit = new THREE.LineSegments(exitGeometry(), selected);
  exit.name = 'OrchardPodOutwardGuide';
  exit.visible = false;
  group.add(exit);
  root.add(group);
  const world = new THREE.Vector3(), local = new THREE.Vector3(), direction = new THREE.Vector3();
  let components = null, lastTick = -Infinity, lastSelection = null, lastRow = null, lastPhase = null;
  let keyedFrame = null, frameKey = null;
  let verifiedPod = null, verifiedData = null, verifiedBody = null, verifiedTick = -Infinity, validPod = false;

  function hide() { group.visible = false; exit.visible = false; }
  function update(frame, state, pose) {
    const scene = state?.render?.scene, row = state?.sites?.anvilOrchard;
    const targetId = state?.player?.targetId, target = state?.entities?.get?.(targetId);
    const selectedFrame = target === frame;
    const selectedPod = target?.type === 'payload' && target.data?.orchardId === ANVIL_ORCHARD.id
      && target.data.orchardKind === 'pod' && target.physicsBody?.dynamic === true;
    if (!scene || state?.mode !== 'flight' || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
      || !row || row.frameStatus !== 'intact' || (!selectedFrame && !selectedPod) || !pose) {
      hide(); return;
    }
    const selection = state.ui?.componentSelection;
    if (keyedFrame !== frame) { keyedFrame = frame; frameKey = stableEntityKey(frame); }
    const selectionId = selectedFrame && selection?.targetId === frame.id
      && (selection.stableKey == null || selection.stableKey === frameKey)
      ? selection.componentId : null;
    // Descriptor projection validates the finite ledger. Refresh on interaction or weather changes,
    // then at most every six sim ticks while the scene is actually being inspected.
    const tick = Number.isSafeInteger(state.tick) ? state.tick : -1;
    const cycle = ANVIL_ORCHARD.calmTicks + ANVIL_ORCHARD.forecastTicks + ANVIL_ORCHARD.gustTicks;
    const elapsed = Math.max(0, tick - row.phaseAnchorTick) % cycle;
    const phase = elapsed < ANVIL_ORCHARD.calmTicks ? 'calm'
      : elapsed < ANVIL_ORCHARD.calmTicks + ANVIL_ORCHARD.forecastTicks ? 'forecast' : 'gust';
    let changedSlot = !Array.isArray(row.sockets) || row.sockets.length !== 3;
    if (components?.length === 3 && !changedSlot) {
      for (let i = 0; i < 3; i++) {
        const slot = row.sockets[i], component = components[i];
        if (!slot || component.lotId !== slot.lotId || component.status !== slot.status
          || component.operation !== slot.operation || component.handoff !== slot.handoff) { changedSlot = true; break; }
      }
    }
    if (!components || row !== lastRow || selectionId !== lastSelection
      || changedSlot || phase !== lastPhase || tick < lastTick || tick - lastTick >= 6) {
      components = listSelectableComponents(state, frame);
      lastTick = tick; lastRow = row; lastSelection = selectionId; lastPhase = phase;
    }
    if (components.length !== 3 || row.frameStatus !== 'intact') { hide(); return; }
    group.visible = true;
    for (let i = 0; i < sockets.length; i++) {
      const entry = sockets[i], component = components[i], slot = row.sockets?.[i];
      // A stale projection must never keep a removed or changed lot lit between refreshes.
      const current = component && slot && component.componentId === COMPONENT_IDS[i]
        && component.lotId === slot.lotId && component.status === slot.status
        && component.operation === slot.operation && component.handoff === slot.handoff;
      entry.marker.visible = !!(selectedFrame && current);
      if (!entry.marker.visible) continue;
      const chosen = selectionId === component.componentId;
      entry.line.material = chosen && component.inactiveReason === 'phase-ineligible'
        && (component.status === 'stowed' || component.status === 'releasing') ? waiting
        : chosen && component.active ? selected : component.active ? ready : inactive;
      entry.progress.visible = chosen && component.operation === 'opening';
      entry.progress.geometry.setDrawRange(0, Math.max(0, Math.min(30, slot.progress | 0)) * 2);
      entry.marker.userData.guideStatus = component.status;
      entry.marker.userData.guideSelected = chosen;
    }
    exit.visible = false;
    const index = state.entityIndex, center = state.planet?.center;
    if (!index?.ready || !center || !Number.isFinite(center.x) || !Number.isFinite(center.z)
      || !Array.isArray(row.sockets) || !Array.isArray(row.lots)) return;
    for (let i = 0; i < row.sockets.length; i++) {
      const slot = row.sockets[i];
      if (slot?.status !== 'drifting' || slot.handoff !== 'ready' || !slot.lotId
        || index.byWorldRecordIdCount?.get(slot.lotId) !== 1) continue;
      let retained = false;
      for (let j = 0; j < row.lots.length; j++) {
        const lot = row.lots[j];
        if (lot?.id === slot.lotId && lot.outcome === 'retained') { retained = true; break; }
      }
      if (!retained) continue;
      const pod = index.byWorldRecordId?.get(slot.lotId);
      if (!pod || (selectedPod && pod !== target) || pod.alive === false || pod.data?.worldRecordId !== slot.lotId
        || pod.data?.identityKey !== slot.lotId || pod.physicsBody?.dynamic !== true
        || state.entities.get(pod.id) !== pod || !pod.mesh || !attached(pod.mesh, scene)
        || !Number.isFinite(pod.pos?.x) || !Number.isFinite(pod.pos?.z)) continue;
      if (verifiedPod !== pod || verifiedData !== pod.data || verifiedBody !== pod.physicsBody
        || tick < verifiedTick || tick - verifiedTick >= 6) {
        verifiedPod = pod; verifiedData = pod.data; verifiedBody = pod.physicsBody;
        verifiedTick = tick; validPod = isOrchardPod(pod);
      }
      if (!validPod) continue;
      const dx = pod.pos.x - center.x, dz = pod.pos.z - center.z, length = Math.hypot(dx, dz);
      if (!(length > 0) || Math.hypot(pod.pos.x - frame.pos.x, pod.pos.z - frame.pos.z) > 360) continue;
      pod.mesh.getWorldPosition(world);
      local.copy(world); root.worldToLocal(local);
      direction.set(world.x + dx / length, world.y, world.z + dz / length); root.worldToLocal(direction);
      exit.position.set(local.x, local.y + 10, local.z);
      exit.rotation.y = -Math.atan2(direction.z - local.z, direction.x - local.x);
      exit.visible = true;
      break;
    }
  }
  function dispose() {
    root.remove(group);
    for (const entry of sockets) { entry.line.geometry.dispose(); entry.progress.geometry.dispose(); }
    exit.geometry.dispose();
    for (const material of materials) material.dispose();
  }
  return { update, hide, dispose };
}
