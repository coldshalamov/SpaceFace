// Instanced presentation for emergent primitive reactions.
// Reads the sim snapshot. Never writes it.

import * as THREE from 'three';

const ARC_CAP = 64;
const RING_CAP = 24;
const GEL_CAP = 16;
const PRISM_CAP = 16;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

function mesh(geometry, color, capacity) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
  });
  const inst = new THREE.InstancedMesh(geometry, material, capacity);
  inst.count = 0;
  inst.frustumCulled = false;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return inst;
}

function hide(inst) {
  inst.count = 0;
  inst.visible = false;
}

export function createEmergentPrimitivePools() {
  const group = new THREE.Group();
  group.name = 'emergent-primitive-pools';
  const arcs = mesh(new THREE.BoxGeometry(1, 0.12, 0.12), 0x8fd0ff, ARC_CAP);
  const rings = mesh(new THREE.TorusGeometry(1, 0.07, 6, 20), 0xffb15a, RING_CAP);
  const gels = mesh(new THREE.SphereGeometry(1, 12, 8), 0x3f9a86, GEL_CAP);
  const prisms = mesh(new THREE.OctahedronGeometry(1, 0), 0xe7fbff, PRISM_CAP);
  gels.material.opacity = 0.28;
  prisms.material.opacity = 0.84;
  group.add(arcs, rings, gels, prisms);

  function place(inst, index, x, y, z, sx, sy, sz, yaw = 0) {
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _q.setFromAxisAngle(_up, yaw);
    _m.compose(_p, _q, _s);
    inst.setMatrixAt(index, _m);
  }

  return {
    group,
    arcs,
    rings,
    gels,
    prisms,
    update(state, toLocal) {
      const world = state && state.emergent;
      const items = world && world.presentation;
      const count = world && world.presentationCount | 0;
      const local = { x: 0, z: 0 };
      const map = (x, z) => {
        if (typeof toLocal === 'function') {
          toLocal(x, z, local);
          return local;
        }
        local.x = x;
        local.z = z;
        return local;
      };
      let ai = 0;
      let ri = 0;
      let gi = 0;
      let pi = 0;
      for (let i = 0; i < count; i++) {
        const item = items[i];
        if (!item) continue;
        const a = map(item.x || 0, item.z || 0);
        const ax = a.x;
        const az = a.z;
        if (item.kind === 'arc' && ai < ARC_CAP) {
          const b = map(item.x2 || item.x || 0, item.z2 || item.z || 0);
          const dx = b.x - ax;
          const dz = b.z - az;
          const len = Math.hypot(dx, dz);
          if (len > 0.05) {
            place(arcs, ai, (ax + b.x) * 0.5, 0.4, (az + b.z) * 0.5, len, 1, 1, Math.atan2(dz, dx));
            ai += 1;
          }
        } else if (item.kind === 'ring' && ri < RING_CAP) {
          const scale = item.scale > 0 ? item.scale : 8;
          _dir.set(0, 1, 0);
          _q.identity();
          _p.set(a.x, 0.2, a.z);
          _s.set(scale, scale, scale);
          _m.compose(_p, _q, _s);
          rings.setMatrixAt(ri, _m);
          ri += 1;
        } else if (item.kind === 'gel' && gi < GEL_CAP) {
          const scale = item.scale > 0 ? item.scale : 12;
          place(gels, gi, a.x, 0, a.z, scale, scale * 0.45, scale);
          gi += 1;
        } else if (item.kind === 'prism' && pi < PRISM_CAP) {
          const scale = item.scale > 0 ? item.scale : 2.4;
          place(prisms, pi, a.x, 0.6, a.z, scale, scale * 1.4, scale, item.yaw || 0);
          pi += 1;
        }
      }
      arcs.count = ai;
      rings.count = ri;
      gels.count = gi;
      prisms.count = pi;
      arcs.visible = ai > 0;
      rings.visible = ri > 0;
      gels.visible = gi > 0;
      prisms.visible = pi > 0;
      if (ai) arcs.instanceMatrix.needsUpdate = true;
      if (ri) rings.instanceMatrix.needsUpdate = true;
      if (gi) gels.instanceMatrix.needsUpdate = true;
      if (pi) prisms.instanceMatrix.needsUpdate = true;
      return { arcs: ai, rings: ri, gels: gi, prisms: pi };
    },
    dispose() {
      hide(arcs);
      hide(rings);
      hide(gels);
      hide(prisms);
      for (const inst of [arcs, rings, gels, prisms]) {
        inst.geometry.dispose();
        inst.material.dispose();
      }
      group.remove(arcs, rings, gels, prisms);
      if (group.parent) group.parent.remove(group);
    },
  };
}
