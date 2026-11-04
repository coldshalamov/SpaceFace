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

const OWNERS = new WeakMap();
const TAU = Math.PI * 2;
const RING_SEGMENTS = 48;
const Y = 1.5;

const MARK_STYLE = {
  receiver: { color: 0x6fc08a, opacity: 0.55 },
  exclusion: { color: 0xd08040, opacity: 0.4 },
  bounds: { color: 0x8a7f5a, opacity: 0.22 },
  commit: { color: 0x8a7f5a, opacity: 0.16 },
  gate: { color: 0x6fa8c0, opacity: 0.6 },
};

function ringGeometry(radius) {
  const pts = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * TAU;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function makeRing(radius, style) {
  const mesh = new THREE.LineLoop(
    ringGeometry(radius),
    new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false }),
  );
  mesh.position.y = Y;
  mesh.renderOrder = 4;
  return mesh;
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

  function setRingAt(index, mark, state2) {
    const mesh = pool.rings[index];
    if (!mesh || !mark) return;
    const style = MARK_STYLE[mark.kind] || MARK_STYLE.receiver;
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
      if (mark && mark.shape === 'ring') setRingAt(i, mark, currentState);
      else pool.rings[i].visible = false;
    }
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
