// Counterweight Circuit — bounded presentation adapter.
//
// Scene annotation only: receiver rings, the release gate, exclusion and
// bounds markings, and the muted personal-best ghost. These are non-solid
// course markings drawn over REAL bodies — they never stand in for physical
// targets, and the ghost mesh never supplies forces, collisions or success
// events. Unselected/inactive attempts allocate no meshes and no per-tick
// buffers.
//
// Mount: updateCounterweightCircuitPresentation(state, bus) is called each
// presented frame from renderUpdatePhase (the patch owns that seam) and
// lazily builds a WeakMap-owned renderer from state.render.scene.

import * as THREE from 'three';
import { ghostPoseAt } from './ghost.js';
import { eventDefinitionById, VENUE_SECTOR_ID } from './definition.js';
import { presentedAnchorXZ, presentedAnchorRot } from '../../render/presentedAnchor.js';
import { readFrameOrigin } from '../../render/frameCoordinates.js';
import { receiverMouthSegments } from './receiverGuidanceGeometry.js';

const OWNERS = new WeakMap();
const TAU = Math.PI * 2;
const RING_SEGMENTS = 48;
const Y = 1.5;
const UNMET = new Set([null, 'inside', 'mouth', 'support', 'speed', 'spin', 'attach']);
const RECEIVER_LEGS = new Set(['seat', 'contain', 'parkAll']);

const MARK_STYLE = {
  receiver: { color: 0x6fc08a, opacity: 0.55 },
  exclusion: { color: 0xd08040, opacity: 0.4 },
  bounds: { color: 0x8a7f5a, opacity: 0.22 },
  commit: { color: 0x8a7f5a, opacity: 0.16 },
  gate: { color: 0x6fa8c0, opacity: 0.6 },
};

function ringGeometry(radius) {
  const pts = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function makeRing(radius, style) {
  const mesh = new THREE.Line(
    ringGeometry(radius),
    new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false }),
  );
  mesh.position.y = Y;
  mesh.renderOrder = 4;
  return mesh;
}

function segments(points, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color, opacity, transparent: true, depthWrite: false,
  }));
  line.visible = false;
  line.renderOrder = 4;
  return line;
}

// DTOs cross the worker boundary. Reject inconsistent or incomplete data instead
// of putting a convincing instrument on a different life or a stale snapshot.
function usableHandling(state, view, h) {
  if (state.mode !== 'flight' || state.world?.currentSectorId !== VENUE_SECTOR_ID
      || view.phase !== 'running' || view.admission || !h || h.schema !== 1
      || h.eventId !== view.eventId || h.attemptId !== view.attemptId
      || !Number.isFinite(state.simTime) || !Number.isFinite(h.observedAt)
      || state.simTime - h.observedAt < 0 || state.simTime - h.observedAt > 0.5
      || !Number.isInteger(h.legIndex) || h.legIndex !== view.journal?.attempt?.legIndex) return false;
  const def = eventDefinitionById(h.eventId), leg = def?.legs?.[h.legIndex];
  if (!leg || h.legKind !== leg.kind || !h.load || typeof h.load.role !== 'string'
      || (leg.role && leg.role !== h.load.role)
      || !Number.isFinite(h.load.x) || !Number.isFinite(h.load.z)
      || !Number.isFinite(h.load.radius) || h.load.radius <= 0
      || !Number.isFinite(h.velocity?.x) || !Number.isFinite(h.velocity?.z)
      || !Number.isFinite(h.speed) || h.speed < 0
      || Math.abs(Math.hypot(h.velocity.x, h.velocity.z) - h.speed) > 0.001
      || !UNMET.has(h.firstUnmet)
      || (h.stable !== null && typeof h.stable !== 'boolean')
      || !(h.dwellFraction === null || (Number.isFinite(h.dwellFraction) && h.dwellFraction >= 0 && h.dwellFraction <= 1))
      || !(h.speedLimit === null || (Number.isFinite(h.speedLimit) && h.speedLimit > 0))
      || !(h.spinLimit === null || (Number.isFinite(h.spinLimit) && h.spinLimit > 0))
      || !(h.relativeSpin === null || Number.isFinite(h.relativeSpin))) return false;
  let loadDef = null, receiverDef = null;
  for (let i = 0; i < def.bodies.length; i++) {
    const body = def.bodies[i];
    if (body.role === h.load.role) loadDef = body;
    if (body.role === h.receiver?.role) receiverDef = body;
  }
  if (loadDef?.kind !== 'load' || !Number.isSafeInteger(h.load.id) || h.load.id < 0
      || !Number.isSafeInteger(h.load.generation) || h.load.generation <= 0) return false;
  const load = state.entities?.get?.(h.load.id);
  if (!load || load.alive === false || load.occupantGeneration !== h.load.generation
      || !Number.isFinite(load.pos?.x) || !Number.isFinite(load.pos?.z)) return false;
  const receiverLeg = RECEIVER_LEGS.has(leg.kind);
  if (!receiverLeg) return h.reference === 'course' && h.receiver === null
    && h.speedLimit === null && h.spinLimit === null && h.relativeSpin === null
    && h.firstUnmet === null && h.stable === null && h.dwellFraction === null;
  const r = h.receiver;
  if (h.reference !== 'receiver' || !r || !receiverDef?.zone?.receiver
      || receiverDef.zone.physicalProfile !== 'ceres_open'
      || (leg.zone && leg.zone !== r.role)
      || !Number.isFinite(r.x) || !Number.isFinite(r.z) || !Number.isFinite(r.rot)
      || !Number.isFinite(r.radius) || r.radius <= 0 || h.stable === null
      || h.dwellFraction === null || h.speedLimit !== leg.maxSpeed
      || h.spinLimit == null || h.relativeSpin == null || h.relativeSpin < 0
      || h.stable !== (h.firstUnmet === null) || (!h.stable && h.dwellFraction !== 0)
      || (h.stable && h.speed > h.speedLimit)) return false;
  if (leg.kind === 'parkAll') {
    let matched = false;
    for (let i = 0; i < (leg.pairs?.length || 0); i++) {
      const pair = leg.pairs[i];
      if (pair[0] === h.load.role && pair[1] === r.role) matched = true;
    }
    if (!matched) return false;
  }
  if (!Number.isSafeInteger(r.id) || r.id < 0 || !Number.isSafeInteger(r.generation)
      || r.generation <= 0 || r.id === h.load.id) return false;
  const receiver = state.entities?.get?.(r.id);
  return !!receiver && receiver.alive !== false && receiver.occupantGeneration === r.generation
    && Number.isFinite(receiver.pos?.x) && Number.isFinite(receiver.pos?.z) && Number.isFinite(receiver.rot);
}

function makeGateMark(ax, az, bx, bz) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(ax, Y, az), new THREE.Vector3(bx, Y, bz),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: MARK_STYLE.gate.color, transparent: true, opacity: MARK_STYLE.gate.opacity, depthWrite: false,
  }));
  line.renderOrder = 4;
  return line;
}

/** Muted, non-colliding ship silhouette — the ghost's entire physical presence. */
function makeGhostShip() {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    0, 0, -4.5, -2.4, 0, 3.2, 0, 0, 1.4,
    0, 0, -4.5, 0, 0, 1.4, 2.4, 0, 3.2,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0x7fa8c8, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.position.y = Y + 0.6;
  mesh.renderOrder = 3;
  mesh.visible = false;
  return mesh;
}

export function createCounterweightCircuitPresentation({ state, bus = null, scene = state?.render?.scene } = {}) {
  let disposed = false;
  let lastAdmission = '';
  const requested = new WeakSet();
  const group = new THREE.Group();
  group.name = 'CounterweightCircuit_Marks';
  group.matrixAutoUpdate = false;
  group.visible = false;
  scene?.add?.(group);

  // One bounded pool, built once: rings are reused across events because each
  // attempt stages at most a handful of volumes (def ≤ 8 marks + 1 ghost).
  const gates = Array.from({ length: 3 }, () => { const l = makeGateMark(0, 0, 0, 0); l.visible = false; group.add(l); return l; });
  const pool = {
    rings: Array.from({ length: 8 }, () => { const m = makeRing(1, MARK_STYLE.receiver); m.visible = false; group.add(m); return m; }),
    gate: gates[0], gates,
    ghost: (() => { const g = makeGhostShip(); group.add(g); return g; })(),
  };
  const pose = { x: 0, z: 0, rot: 0 };
  const origin = { x: 0, z: 0 }, loadPose = { x: 0, z: 0 }, receiverPose = { x: 0, z: 0 };
  // All instrument geometry is created once and shares the existing owner's
  // group and disposal. There is one active load and at most one receiver.
  const bracket = segments([
    -1,0,-.7, -.65,0,-.7,  -1,0,-.7, -1,0,.7,
    1,0,-.7, .65,0,-.7,  1,0,-.7, 1,0,.7,
    -.35,0,-1, .35,0,-1,
  ], 0xd7be83, .85);
  const needleRoot = new THREE.Group();
  needleRoot.visible = false;
  const needle = segments([0,0,0, 1,0,0], 0xd7be83, .9);
  const tip = segments([0,0,0, -3,0,-2, 0,0,0, -3,0,2], 0xd7be83, .9);
  const limit = segments([0,0,-3, 0,0,3], 0xe9e4ce, .8);
  needleRoot.add(needle, tip, limit);
  const throat = segments(receiverMouthSegments(1), 0xdbc795, .65);
  group.add(bracket, needleRoot, throat);
  Object.assign(pool, { bracket, needleRoot, needle, tip, limit, throat });

  function ringDrawFraction(mesh, fraction) {
    if (mesh.userData.arcFraction === fraction) return;
    mesh.userData.arcFraction = fraction;
    const geometry = mesh.geometry, positions = geometry.getAttribute('position');
    const old = mesh.userData.arcEndpoint;
    if (old != null) {
      const a = old / RING_SEGMENTS * TAU;
      positions.setXYZ(old, Math.cos(a), 0, Math.sin(a));
      mesh.userData.arcEndpoint = null;
    }
    if (fraction >= 1) geometry.setDrawRange(0, RING_SEGMENTS + 1);
    else if (fraction <= 0) geometry.setDrawRange(0, 0);
    else {
      const count = fraction * RING_SEGMENTS, end = Math.floor(count) + 1;
      const a = fraction * TAU;
      positions.setXYZ(end, Math.cos(a), 0, Math.sin(a));
      mesh.userData.arcEndpoint = end;
      geometry.setDrawRange(0, end + 1);
    }
    positions.needsUpdate = true;
  }

  function hideHandling() {
    bracket.visible = false;
    needleRoot.visible = false;
    throat.visible = false;
  }

  function drawHandling(state2, view, marks) {
    hideHandling();
    const h = view.handling;
    if (!usableHandling(state2, view, h)) return;
    const load = state2.entities.get(h.load.id), receiver = h.receiver && state2.entities.get(h.receiver.id);
    const alpha = state2.render?.interpolationAlpha;
    readFrameOrigin(state2, origin);
    presentedAnchorXZ(load, alpha, loadPose);
    bracket.position.set(loadPose.x - origin.x, Y, loadPose.z - origin.z);
    bracket.scale.setScalar(h.load.radius * 1.35);
    // The extra short crown stroke means an unmet condition as well as amber.
    bracket.geometry.setDrawRange(0, h.firstUnmet ? 10 : 8);
    bracket.material.color.setHex(h.firstUnmet ? 0xd7a467 : 0x9fc5ad);
    bracket.visible = true;
    if (h.speed > 0.0001) {
      const length = Math.min(80, h.speed * 6);
      needleRoot.position.copy(bracket.position);
      needleRoot.rotation.y = -Math.atan2(h.velocity.z, h.velocity.x);
      needle.scale.x = length;
      needle.material.color.copy(bracket.material.color);
      tip.material.color.copy(bracket.material.color);
      tip.position.x = length;
      needle.visible = tip.visible = true;
      limit.visible = h.speedLimit != null && h.speedLimit * 6 <= 80;
      if (limit.visible) limit.position.x = h.speedLimit * 6;
      needleRoot.visible = true;
    }
    if (!receiver) return;
    presentedAnchorXZ(receiver, alpha, receiverPose);
    throat.position.set(receiverPose.x - origin.x, Y, receiverPose.z - origin.z);
    throat.rotation.y = -presentedAnchorRot(receiver, alpha);
    throat.scale.setScalar(h.receiver.radius);
    throat.visible = true;
    for (let i = 0; i < marks.length && i < pool.rings.length; i++) {
      if (marks[i]?.kind !== 'receiver' || marks[i]?.followId !== h.receiver.id) continue;
      const ring = pool.rings[i];
      ring.position.set(throat.position.x, Y, throat.position.z);
      ring.material.opacity = 0.5;
      ringDrawFraction(ring, h.stable ? h.dwellFraction : 0);
      ring.visible = h.stable && h.dwellFraction > 0;
      ring.updateMatrix();
      break;
    }
  }

  function setRingAt(index, mark, state2) {
    const mesh = pool.rings[index];
    if (!mesh || !mark) return;
    const style = MARK_STYLE[mark.kind] || MARK_STYLE.receiver;
    if (mark.kind !== 'receiver') ringDrawFraction(mesh, 1);
    mesh.material.color.setHex(style.color);
    mesh.material.opacity = style.opacity;
    // A mobile receiver ring follows its real body every presented frame —
    // the zone rides the barge, it is not re-authored per tick.
    const follow = mark.followId != null ? state2.entities?.get?.(mark.followId) : null;
    const x = follow ? follow.pos.x : mark.x;
    const z = follow ? follow.pos.z : mark.z;
    mesh.position.set(x, Y, z);
    mesh.scale.setScalar(Math.max(0.001, mark.r || 1));
    mesh.visible = true;
    mesh.updateMatrix();
  }

  function frame(currentState = state) {
    if (disposed || currentState !== state) return;
    const view = currentState.counterweightCircuitView;
    if (!view || view.phase == null) {
      hideHandling();
      if (group.visible) { group.visible = false; pool.ghost.visible = false; }
      return;
    }
    group.visible = true;
    const admission = view.admission;
    if (admission && Array.isArray(admission.bodies) && admission.bodies.length) {
      const key = `${view.attemptId}:${admission.generation}`;
      if (key !== lastAdmission) {
        const ready = admission.bodies.every(row => {
          const entity = currentState.entities?.get?.(row.id), mesh = entity?.mesh;
          if (!entity || entity.alive === false || entity.occupantGeneration !== row.generation || !mesh || !mesh.parent) return false;
          let parent = mesh;
          while (parent && parent !== scene) parent = parent.parent;
          if (parent !== scene) return false;
          const data = mesh.userData || {};
          if (!['authored', 'authored-with-cleanup-error'].includes(data.authoredAssetState)
              || data.pipelinesPending === true || data.geometryPending === true) {
            if (!requested.has(mesh) && typeof data.requestAuthoredUpgrade === 'function' && currentState.render?.renderer) {
              requested.add(mesh);
              try { Promise.resolve(data.requestAuthoredUpgrade(currentState.render.renderer, scene, { admissionVisible: true })).catch(() => {}); }
              catch (_) { /* admission remains pending until a valid authored boundary exists */ }
            }
            return false;
          }
          let sourceFound = false;
          mesh.traverse?.(object => {
            const more = object.userData?.spacefacePartUrls;
            const urls = [object.userData?.authoredPackageUrl, object.userData?.spacefacePartUrl,
              ...(Array.isArray(more) ? more : [])];
            if (urls.some(url => {
              if (typeof url !== 'string') return false;
              const normalized = url.replace(/\\/g, '/').split('?')[0];
              return normalized === row.file || normalized.endsWith(`/${row.file}`);
            })) sourceFound = true;
          });
          return sourceFound;
        });
        if (ready) {
          lastAdmission = key;
          bus?.emit?.('counterweightCircuit:presentationReady', { attemptId: view.attemptId, generation: admission.generation,
            bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) });
        }
      }
    }
    const marks = view.marks || [];
    for (let i = 0; i < pool.rings.length; i++) {
      const mark = marks[i];
      if (mark && mark.shape === 'ring') {
        setRingAt(i, mark, currentState);
        // Receiver rings communicate only witnessed dwell, not a full halo
        // that might be mistaken for completed seating.
        if (mark.kind === 'receiver') pool.rings[i].visible = false;
      }
      else pool.rings[i].visible = false;
    }
    drawHandling(currentState, view, marks);
    const gateMarks = marks.filter(m => m && m.shape === 'gate');
    for (let i = 0; i < pool.gates.length; i++) {
      const gate = gateMarks[i], line = pool.gates[i];
      if (!gate) { line.visible = false; continue; }
      line.geometry.setFromPoints([
        new THREE.Vector3(gate.ax, Y, gate.az), new THREE.Vector3(gate.bx, Y, gate.bz),
      ]);
      line.material.opacity = gate.active ? 0.95 : 0.36;
      line.visible = true;
    }
    group.updateMatrix();

    // Ghost playback: presentation-only pose interpolation of the stored PB.
    const selected = currentState.counterweightCircuitGhost;
    const ghost = selected && selected.eventId === view.eventId && selected.attemptId === view.attemptId
      && !(currentState.settings?.video?.motionReduce === true && !selected.allowReducedMotion)
      ? selected.tape : null;
    if (ghost && Number.isFinite(view.armedAt) && ghost.samples) {
      const t = Math.max(0, (currentState.simTime || 0) - view.armedAt);
      if (ghostPoseAt(ghost, t, pose)) {
        pool.ghost.position.set(pose.x, Y + 0.6, pose.z);
        pool.ghost.rotation.y = -pose.rot;
        pool.ghost.visible = true;
      } else {
        pool.ghost.visible = false;
      }
    } else {
      pool.ghost.visible = false;
    }
  }

  function release() {
    hideHandling();
    for (const m of pool.rings) m.visible = false;
    for (const gate of pool.gates) gate.visible = false;
    pool.ghost.visible = false;
    group.visible = false;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    release();
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) o.material.dispose?.();
    });
    scene?.remove?.(group);
  }

  return { frame, release, dispose, get disposed() { return disposed; }, _pool: pool };
}

export function updateCounterweightCircuitPresentation(state, bus = null) {
  if (!state || state.mode !== 'flight') {
    releaseCounterweightCircuitPresentation(state);
    return null;
  }
  let owner = OWNERS.get(state);
  if (owner?.disposed) { OWNERS.delete(state); owner = null; }
  if (!owner) {
    if (!state.render?.scene?.add) return null;
    owner = createCounterweightCircuitPresentation({ state, bus });
    OWNERS.set(state, owner);
  }
  owner.frame(state);
  return owner;
}

export function releaseCounterweightCircuitPresentation(state) {
  const owner = state && OWNERS.get(state);
  if (owner) owner.release();
}
