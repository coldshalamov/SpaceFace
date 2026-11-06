import * as THREE from 'three';

const NODES = Object.freeze({
  warden: ['MOTION_WARDEN_SHIELD_PORT', 'MOTION_WARDEN_SHIELD_STARBOARD'],
  jackal: ['MOTION_JACKAL_GATE_PORT', 'MOTION_JACKAL_GATE_STARBOARD'],
  anchor: ['MOTION_ANCHOR_VANE_FORE', 'MOTION_ANCHOR_VANE_PORT', 'MOTION_ANCHOR_VANE_STARBOARD'],
});
const KINDS = Object.freeze({ warden_escort: 'warden', mine_layer_jackal: 'jackal', field_anchor_controller: 'anchor' });
const UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(), POINT = new THREE.Vector3(), DELTA = new THREE.Vector3();
const U = new THREE.Vector3(), V = new THREE.Vector3(), TURN = new THREE.Quaternion();
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function phaseWeight(view, tick) {
  if (view.phase === 'idle') return 0;
  const start = view.phaseStartedAt, end = view.phaseEndsAt;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  const p = smooth((tick - start) / (end - start));
  return view.phase === 'windup' ? p : view.phase === 'recovery' ? 1 - p : 1;
}
function localSimPoint(root, live, x, z, out, height = .3) {
  root.getWorldPosition(ORIGIN);
  out.set(ORIGIN.x + x - (Number(live?.pos?.x) || 0), ORIGIN.y + height,
    ORIGIN.z + z - (Number(live?.pos?.z) || 0));
  root.worldToLocal(out);
}
function buildLink(root) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 6 * 3), 3));
  const indices = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
    const a = i * 6 + j, b = i * 6 + (j + 1) % 6, c = a + 6, d = b + 6;
    indices.push(a, c, b, b, c, d);
  }
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x59cbbd, side: THREE.DoubleSide }));
  mesh.name = 'SF_SWARM_WARDEN_LINK'; mesh.visible = false; mesh.frustumCulled = false; root.add(mesh);
  return { mesh, source: new THREE.Vector3(), target: new THREE.Vector3() };
}
function writeLink(link, root, live, view, strength, emitter) {
  if (strength <= .01 || !Number.isFinite(view.targetX) || !Number.isFinite(view.targetZ)) {
    link.mesh.visible = false; return;
  }
  root.updateWorldMatrix(true, false);
  if (emitter) { emitter.getWorldPosition(link.source); root.worldToLocal(link.source); }
  else link.source.set(0, .7, 0);
  localSimPoint(root, live, view.targetX, view.targetZ, link.target, .7);
  DELTA.copy(link.target).sub(link.source);
  if (DELTA.lengthSq() < 1) { link.mesh.visible = false; return; }
  DELTA.normalize(); U.crossVectors(DELTA, UP);
  if (U.lengthSq() < .001) U.set(1, 0, 0);
  U.normalize(); V.crossVectors(DELTA, U).normalize();
  const positions = link.mesh.geometry.attributes.position;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, width = (.16 + .46 * strength) * (.58 + .42 * Math.sin(Math.PI * t));
    POINT.copy(link.source).lerp(link.target, t);
    POINT.y += Math.sin(Math.PI * t) * .2;
    for (let j = 0; j < 6; j++) {
      const a = j * Math.PI / 3, u = Math.cos(a) * width, v = Math.sin(a) * width;
      positions.setXYZ(i * 6 + j, POINT.x + U.x * u + V.x * v,
        POINT.y + U.y * u + V.y * v, POINT.z + U.z * u + V.z * v);
    }
  }
  positions.needsUpdate = true;
  link.mesh.visible = true;
}
function buildWake(root) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 4 * 3), 3));
  const indices = [];
  for (let i = 0; i < 3; i++) indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xbb7d2b,
    transparent: true, opacity: .38, depthWrite: false, side: THREE.DoubleSide }));
  mesh.name = 'SF_SWARM_JACKAL_MINE_WAKE'; mesh.visible = false; mesh.frustumCulled = false; root.add(mesh);
  return { mesh, source: new THREE.Vector3(), target: new THREE.Vector3() };
}
function writeWake(wake, root, live, view, strength, emitter) {
  if (strength <= .01 || !Array.isArray(view.salvoPoints) || view.salvoPoints.length < 3) {
    wake.mesh.visible = false; return;
  }
  root.updateWorldMatrix(true, false);
  if (emitter) { emitter.getWorldPosition(wake.source); root.worldToLocal(wake.source); }
  else wake.source.set(0, .3, 0);
  const positions = wake.mesh.geometry.attributes.position;
  let count = 0;
  for (let i = 0; i < 3; i++) {
    const point = view.salvoPoints[i];
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) continue;
    localSimPoint(root, live, point.x, point.z, wake.target);
    const dx = wake.target.x - wake.source.x, dz = wake.target.z - wake.source.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const nx = -dz / length * 2.5, nz = dx / length * 2.5;
    const n = count++ * 4;
    positions.setXYZ(n, wake.source.x + nx, wake.source.y, wake.source.z + nz);
    positions.setXYZ(n + 1, wake.source.x - nx, wake.source.y, wake.source.z - nz);
    positions.setXYZ(n + 2, wake.target.x + nx, wake.target.y, wake.target.z + nz);
    positions.setXYZ(n + 3, wake.target.x - nx, wake.target.y, wake.target.z - nz);
  }
  positions.needsUpdate = true;
  wake.mesh.geometry.setDrawRange(0, count * 6);
  wake.mesh.material.opacity = .15 + .3 * strength;
  wake.mesh.visible = count > 0;
}
function buildRing(root) {
  const geometry = new THREE.RingGeometry(.955, 1, 72); geometry.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x71bea8,
    side: THREE.DoubleSide, transparent: true, opacity: .25, depthWrite: false }));
  ring.name = 'SF_SWARM_ANCHOR_FIELD_EDGE'; ring.position.y = .28; ring.visible = false;
  ring.frustumCulled = false; root.add(ring); return ring;
}

/** Render-only phase view, attached to the stable authored-asset boundary, never its fallback. */
export function attachSwarmSpecialistVisual(root, entity) {
  const kind = entity?.data?.swarmSpecialist?.kind || KINDS[entity?.data?.lootTableId];
  if (!root || !NODES[kind] || root.userData.swarmSpecialistVisual) return false;
  let content = null, emitter = null, link = null, wake = null, ring = null;
  const pivots = [], rests = [];
  const emitterName = kind === 'warden' ? 'SOCKET_LINK_EMITTER' : 'SOCKET_MINE_EJECTOR';
  const clear = () => {
    if (link) link.mesh.visible = false;
    if (wake) wake.mesh.visible = false;
    if (ring) ring.visible = false;
    for (let i = 0; i < pivots.length; i++) { pivots[i].node.quaternion.copy(rests[i]); pivots[i].node.updateMatrix(); }
    // A demotion or retired tell must not retain an old authored subtree through the controller.
    content = null; emitter = null; pivots.length = 0; rests.length = 0;
  };
  const update = (live, now) => {
    const view = live?.data?.swarmSpecialist;
    if (!view || view.kind !== kind) { clear(); return; }
    const next = root.userData.swarmVisualContentRoot || root;
    if (next !== content) {
      content = next; pivots.length = rests.length = 0; emitter = null;
      next.traverse(node => {
        const index = NODES[kind].indexOf(node.name);
        if (index >= 0) { pivots.push({ node, index }); rests.push(node.quaternion.clone()); }
        if (!emitter && node.name.toUpperCase().endsWith(emitterName)) emitter = node;
      });
    }
    const tick = Number.isFinite(now) ? now * 60 : 0, weight = phaseWeight(view, tick);
    for (let i = 0; i < pivots.length; i++) {
      const { node, index } = pivots[i];
      const degrees = kind === 'warden' ? (index === 0 ? 35 : -35)
        : kind === 'jackal' ? (index === 0 ? 48 : -48) : (index === 1 ? 42 : -42);
      node.quaternion.copy(rests[i]).multiply(TURN.setFromAxisAngle(UP, degrees * Math.PI / 180 * weight));
      node.updateMatrix();
    }
    if (kind === 'warden') {
      link ||= buildLink(root);
      const hp = Number.isFinite(view.linkHp) && view.linkMaxHp > 0 ? Math.max(0, Math.min(1, view.linkHp / view.linkMaxHp)) : 1;
      writeLink(link, root, live, view, view.phase === 'active' ? hp : view.phase === 'windup' ? weight * .35 : 0, emitter);
    } else if (kind === 'jackal') {
      wake ||= buildWake(root);
      writeWake(wake, root, live, view, view.phase === 'active' ? 1 : view.phase === 'windup' ? weight : 0, emitter);
    } else {
      ring ||= buildRing(root);
      const radius = Number.isFinite(view.anchorRadius) ? view.anchorRadius : 0;
      const active = view.phase === 'active' && view.anchorActive === true;
      ring.visible = radius > 0 && (active || view.phase === 'windup');
      if (ring.visible) {
        root.getWorldScale(DELTA);
        ring.scale.set(radius / Math.max(Math.abs(DELTA.x), .0001), 1, radius / Math.max(Math.abs(DELTA.z), .0001));
        ring.material.opacity = active ? .45 : .12 + .12 * weight;
      }
    }
  };
  root.userData.swarmSpecialistVisual = { kind, update, clear };
  return true;
}
