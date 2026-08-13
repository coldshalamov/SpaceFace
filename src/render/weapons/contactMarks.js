import * as THREE from 'three';
import {
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

export const HULL_SCORCH_CAPACITY = 64;

const VERTEX_SHADER = /* glsl */`
  attribute vec3 aPos;
  attribute vec3 aNormal;
  attribute vec4 aSize; // width, height, opacity, unused
  attribute vec3 aColor;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vUv = uv;
    vColor = aColor;
    vOpacity = aSize.z;
    vec3 n = normalize(aNormal);
    vec3 tangent = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 bitangent = normalize(cross(n, tangent));
    tangent = normalize(cross(bitangent, n));
    vec3 world = aPos + n * 0.16
      + tangent * (uv.x - 0.5) * aSize.x
      + bitangent * (uv.y - 0.5) * aSize.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    vec2 d = vUv * 2.0 - 1.0;
    float r = length(d);
    float scorch = smoothstep(1.0, 0.15, r);
    float rim = smoothstep(0.85, 0.45, r) * (1.0 - smoothstep(0.55, 0.05, r));
    float alpha = (scorch * 0.72 + rim * 0.35) * vOpacity;
    if (alpha < 0.01) discard;
    vec3 col = mix(vec3(0.05, 0.04, 0.045), vColor, rim * 0.65);
    gl_FragColor = vec4(col, alpha);
  }
`;

function dynamicAttribute(length, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export class HullScorchPool {
  constructor(scene, options = {}) {
    this.capacity = Math.max(1, options.capacity || HULL_SCORCH_CAPACITY);
    this.slots = Array.from({ length: this.capacity }, () => ({
      alive: 0,
      targetId: null,
      localX: 0,
      localY: 0,
      localZ: 0,
      nx: 1,
      ny: 0,
      nz: 0,
      width: 1.6,
      height: 1.1,
      life: 4,
      age: 0,
      opacity: 1,
      r: 0.2,
      g: 0.55,
      b: 0.85,
    }));
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.pos = dynamicAttribute(this.capacity * 3, 3);
    this.normal = dynamicAttribute(this.capacity * 3, 3);
    this.size = dynamicAttribute(this.capacity * 4, 4);
    this.color = dynamicAttribute(this.capacity * 3, 3);
    this.geometry.setAttribute('aPos', this.pos);
    this.geometry.setAttribute('aNormal', this.normal);
    this.geometry.setAttribute('aSize', this.size);
    this.geometry.setAttribute('aColor', this.color);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = 'SF_WeaponHullScorch';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, identity);
    this._cursor = 0;
    this.live = 0;
    this.dynamicBufferOwner = scene ? registerDynamicBufferOwner(scene, {
      id: 'weapon-hull-scorch',
      mesh: this.mesh,
      attributes: [
        { name: 'position', attribute: this.pos },
        { name: 'normal', attribute: this.normal },
        { name: 'size', attribute: this.size },
        { name: 'color', attribute: this.color },
      ],
    }) : null;
    if (scene) scene.add(this.mesh);
  }

  spawn(spec) {
    let slot = -1;
    for (let n = 0; n < this.capacity; n++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % this.capacity;
      if (!this.slots[i].alive) { slot = i; break; }
    }
    if (slot < 0) slot = this._cursor;
    const s = this.slots[slot];
    s.alive = 1;
    s.targetId = spec.targetId != null ? spec.targetId : null;
    s.localX = finiteOr(spec.localX, 0);
    s.localY = finiteOr(spec.localY, 0);
    s.localZ = finiteOr(spec.localZ, 0);
    s.nx = finiteOr(spec.nx, 1);
    s.ny = finiteOr(spec.ny, 0);
    s.nz = finiteOr(spec.nz, 0);
    s.width = spec.width || 1.6;
    s.height = spec.height || 1.1;
    s.life = Math.max(0.6, spec.life || 4);
    s.age = 0;
    s.opacity = Math.max(0, finiteOr(spec.opacity, 1));
    s.r = spec.r || 0.2;
    s.g = spec.g || 0.55;
    s.b = spec.b || 0.85;
    return slot;
  }

  update(dt, resolvePose) {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.alive = 0;
        continue;
      }
      let x = s.localX;
      let y = s.localY;
      let z = s.localZ;
      let nx = s.nx;
      let ny = s.ny;
      let nz = s.nz;
      if (resolvePose) {
        const pose = resolvePose(s);
        if (pose) {
          x = pose.x; y = pose.y; z = pose.z;
          if (pose.nx != null) { nx = pose.nx; ny = pose.ny; nz = pose.nz; }
        }
      }
      const fade = (s.age < 0.08 ? s.age / 0.08 : Math.max(0, 1 - (s.age - 0.08) / (s.life - 0.08))) * s.opacity;
      this.pos.setXYZ(live, x, y, z);
      this.normal.setXYZ(live, nx, ny, nz);
      this.size.setXYZW(live, s.width, s.height, fade, 0);
      this.color.setXYZ(live, s.r, s.g, s.b);
      if (this.dynamicBufferOwner) {
        markDynamicBufferItems(this.dynamicBufferOwner, 0, live);
        markDynamicBufferItems(this.dynamicBufferOwner, 1, live);
        markDynamicBufferItems(this.dynamicBufferOwner, 2, live);
        markDynamicBufferItems(this.dynamicBufferOwner, 3, live);
      }
      live++;
    }
    this.live = live;
    if (this.dynamicBufferOwner) {
      commitDynamicBufferOwner(this.dynamicBufferOwner, live);
    } else {
      this.mesh.count = live;
      this.pos.needsUpdate = true;
      this.normal.needsUpdate = true;
      this.size.needsUpdate = true;
      this.color.needsUpdate = true;
    }
    this.mesh.visible = live > 0;
    return live;
  }

  dispose() {
    unregisterDynamicBufferOwner(this.dynamicBufferOwner);
    this.dynamicBufferOwner = null;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
