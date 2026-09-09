import * as THREE from 'three';
import {
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';
import { FLIPBOOK_COLS, FLIPBOOK_FRAMES, FLIPBOOK_ROWS, getWeaponFlipbookAtlas } from './flipbookAtlases.js';

export const FLIPBOOK_CAPACITY = 128;

export const FLIPBOOK_ROLE = Object.freeze({
  MUZZLE: 0,
  BORE: 1,
  IMPACT: 2,
});

const VERTEX_SHADER = /* glsl */`
  attribute vec3 aFxPos;
  attribute vec3 aFxAxis;
  attribute vec4 aFxSize; // width, height, intensity, roll
  attribute vec3 aFxColor;
  attribute vec4 aFxTile; // u, v, w, h

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vIntensity;

  void main() {
    vColor = aFxColor;
    vIntensity = aFxSize.z;
    vUv = aFxTile.xy + uv * aFxTile.zw;

    vec3 axis = aFxAxis;
    float axisLen = length(axis);
    axis = axisLen > 1e-5 ? axis / axisLen : vec3(1.0, 0.0, 0.0);
    vec3 toCam = cameraPosition - aFxPos;
    vec3 side = cross(toCam, axis);
    float sideLen = length(side);
    if (sideLen < 1e-5) {
      vec3 up = abs(axis.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      side = normalize(cross(up, axis));
    } else {
      side /= sideLen;
    }
    vec3 along = axis;
    float c = cos(aFxSize.w);
    float s = sin(aFxSize.w);
    vec2 corner = vec2(uv.x - 0.5, uv.y - 0.5);
    corner = mat2(c, -s, s, c) * corner;
    vec3 world = aFxPos + along * corner.x * aFxSize.y + side * corner.y * aFxSize.x;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  precision highp float;
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vIntensity;

  void main() {
    vec4 sampleColor = texture2D(uAtlas, vUv);
    float alpha = sampleColor.a * vIntensity;
    if (alpha < 0.004) discard;
    vec3 col = sampleColor.rgb * vColor * vIntensity;
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

export class FlipbookPool {
  constructor(scene, options = {}) {
    this.capacity = Math.max(1, options.capacity || FLIPBOOK_CAPACITY);
    this.slots = Array.from({ length: this.capacity }, () => ({
      alive: 0,
      role: 0,
      ownerId: null,
      targetId: null,
      localX: 0,
      localY: 0,
      localZ: 0,
      ax: 1,
      ay: 0,
      az: 0,
      width: 1,
      height: 1,
      intensity: 1,
      life: 0.1,
      age: 0,
      row: 0,
      r: 1,
      g: 1,
      b: 1,
      followSocket: 0,
      followTarget: 0,
    }));
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.pos = dynamicAttribute(this.capacity * 3, 3);
    this.axis = dynamicAttribute(this.capacity * 3, 3);
    this.size = dynamicAttribute(this.capacity * 4, 4);
    this.color = dynamicAttribute(this.capacity * 3, 3);
    this.tile = dynamicAttribute(this.capacity * 4, 4);
    this.geometry.setAttribute('aFxPos', this.pos);
    this.geometry.setAttribute('aFxAxis', this.axis);
    this.geometry.setAttribute('aFxSize', this.size);
    this.geometry.setAttribute('aFxColor', this.color);
    this.geometry.setAttribute('aFxTile', this.tile);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: getWeaponFlipbookAtlas() } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = 'SF_WeaponFlipbooks';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 24;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, identity);
    this.mesh.instanceMatrix.needsUpdate = true;
    this._cursor = 0;
    this.live = 0;
    this.dynamicBufferOwner = scene ? registerDynamicBufferOwner(scene, {
      id: 'weapon-flipbooks',
      mesh: this.mesh,
      attributes: [
        { name: 'position', attribute: this.pos },
        { name: 'axis', attribute: this.axis },
        { name: 'size', attribute: this.size },
        { name: 'color', attribute: this.color },
        { name: 'tile', attribute: this.tile },
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
    if (slot < 0) {
      slot = this._cursor;
      this._cursor = (this._cursor + 1) % this.capacity;
    }
    const s = this.slots[slot];
    s.alive = 1;
    s.role = spec.role || FLIPBOOK_ROLE.MUZZLE;
    s.ownerId = spec.ownerId != null ? spec.ownerId : null;
    s.targetId = spec.targetId != null ? spec.targetId : null;
    s.localX = finiteOr(spec.x, 0);
    s.localY = finiteOr(spec.y, 0);
    s.localZ = finiteOr(spec.z, 0);
    s.ax = finiteOr(spec.ax, 1);
    s.ay = finiteOr(spec.ay, 0);
    s.az = finiteOr(spec.az, 0);
    s.width = spec.width || 1;
    s.height = spec.height || 1;
    s.intensity = finiteOr(spec.intensity, 1);
    s.life = Math.max(0.04, spec.life || 0.1);
    s.age = 0;
    s.row = spec.row || 0;
    s.r = finiteOr(spec.r, 1);
    s.g = finiteOr(spec.g, 1);
    s.b = finiteOr(spec.b, 1);
    s.followSocket = spec.followSocket ? 1 : 0;
    s.followTarget = spec.followTarget ? 1 : 0;
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
      let ax = s.ax;
      let ay = s.ay;
      let az = s.az;
      if (resolvePose) {
        const pose = resolvePose(s);
        if (pose) {
          x = pose.x; y = pose.y; z = pose.z;
          if (pose.ax != null) { ax = pose.ax; ay = pose.ay; az = pose.az; }
        }
      }
      const t = s.age / s.life;
      const frame = Math.min(FLIPBOOK_FRAMES - 1, Math.floor(t * FLIPBOOK_FRAMES));
      const fade = t < 0.15 ? t / 0.15 : (t > 0.7 ? (1 - t) / 0.3 : 1);
      const intensity = s.intensity * Math.max(0, fade);
      this.pos.setXYZ(live, x, y, z);
      this.axis.setXYZ(live, ax, ay, az);
      this.size.setXYZW(live, s.width, s.height, intensity, 0);
      this.color.setXYZ(live, s.r, s.g, s.b);
      const row = Math.max(0, Math.min(FLIPBOOK_ROWS - 1, s.row | 0));
      this.tile.setXYZW(
        live,
        frame / FLIPBOOK_COLS,
        row / FLIPBOOK_ROWS,
        1 / FLIPBOOK_COLS,
        1 / FLIPBOOK_ROWS,
      );
      if (this.dynamicBufferOwner) {
        markDynamicBufferItems(this.dynamicBufferOwner, 0, live);
        markDynamicBufferItems(this.dynamicBufferOwner, 1, live);
        markDynamicBufferItems(this.dynamicBufferOwner, 2, live);
        markDynamicBufferItems(this.dynamicBufferOwner, 3, live);
        markDynamicBufferItems(this.dynamicBufferOwner, 4, live);
      }
      live++;
    }
    this.live = live;
    if (this.dynamicBufferOwner) {
      commitDynamicBufferOwner(this.dynamicBufferOwner, live);
    } else {
      this.mesh.count = live;
      this.pos.needsUpdate = true;
      this.axis.needsUpdate = true;
      this.size.needsUpdate = true;
      this.color.needsUpdate = true;
      this.tile.needsUpdate = true;
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
