import * as THREE from 'three';

export const DISTORTION_CAPACITY = 64;

const VERTEX_SHADER = /* glsl */`
  attribute vec3 aPos;
  attribute float aRadius;
  attribute float aStrength;
  varying vec2 vUv;
  varying float vStrength;
  void main() {
    vUv = uv;
    vStrength = aStrength;
    vec4 viewPosition = modelViewMatrix * vec4(aPos, 1.0);
    viewPosition.xy += (uv - 0.5) * aRadius * 2.0;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  varying vec2 vUv;
  varying float vStrength;
  void main() {
    vec2 d = vUv * 2.0 - 1.0;
    float r = length(d);
    if (r > 1.0) discard;
    float envelope = (1.0 - r) * (1.0 - r) * vStrength;
    vec2 offset = normalize(d + vec2(1e-4, 0.0)) * envelope * 0.035;
    // The distortion target is an LDR render target. Encode signed offsets around
    // the neutral midpoint so both directions survive unsigned RG quantization.
    gl_FragColor = vec4(offset * 0.5 + 0.5, envelope, 1.0);
  }
`;

function dynamicAttribute(length, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

export class DistortionField {
  constructor(options = {}) {
    this.capacity = Math.max(1, options.capacity || DISTORTION_CAPACITY);
    this.slots = Array.from({ length: this.capacity }, () => ({
      alive: 0, x: 0, y: 0, z: 0, radius: 2, strength: 1, life: 0.12, age: 0,
    }));
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.pos = dynamicAttribute(this.capacity * 3, 3);
    this.radius = dynamicAttribute(this.capacity, 1);
    this.strength = dynamicAttribute(this.capacity, 1);
    this.geometry.setAttribute('aPos', this.pos);
    this.geometry.setAttribute('aRadius', this.radius);
    this.geometry.setAttribute('aStrength', this.strength);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      // Encoded RG is an absolute field (0.5 is neutral), so additive blending
      // would corrupt overlapping samples. Normal blending preserves the encode.
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = 'SF_WeaponDistortion';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, identity);
    this.scene = new THREE.Scene();
    this.scene.name = 'SF_WeaponDistortionScene';
    this.scene.add(this.mesh);
    this._cursor = 0;
    this.live = 0;
  }

  spawn({ x, y, z, radius, strength, life }) {
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
    s.x = x || 0; s.y = y || 0; s.z = z || 0;
    s.radius = radius || 3;
    s.strength = Number.isFinite(strength) ? strength : 1;
    s.life = Math.max(0.04, life || 0.12);
    s.age = 0;
    return slot;
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.alive = 0;
        continue;
      }
      const fade = 1 - s.age / s.life;
      this.pos.setXYZ(live, s.x, s.y, s.z);
      this.radius.setX(live, s.radius);
      this.strength.setX(live, s.strength * fade);
      live++;
    }
    this.live = live;
    this.mesh.count = live;
    this.pos.needsUpdate = true;
    this.radius.needsUpdate = true;
    this.strength.needsUpdate = true;
    this.mesh.visible = live > 0;
    return live;
  }

  get hasLive() {
    return this.live > 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
