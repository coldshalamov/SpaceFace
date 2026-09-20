import * as THREE from 'three';
import {
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

export const HULL_SCORCH_CAPACITY = 32;

// Cooling curve shared by the pool and the tests: heat starts at the weapon's initial
// temperature and falls with a 1.5-power blackbody tail, so scars linger visibly through
// orange and cherry before settling to charcoal.
export function scorchHeatForAge(age, life, heat0 = 0.8) {
  const l = Math.max(0.001, Number(life) || 0.001);
  const t = Math.min(1, Math.max(0, (Number(age) || 0) / l));
  const h0 = Math.min(1, Math.max(0, Number(heat0) || 0));
  return h0 * Math.pow(1 - t, 1.5);
}

// Initial scar temperature by weapon dialect. Plasma and heavy slugs strike white-hot;
// kinetic needles run cooler; pulse leaves a warm sting, not a forge mark.
const SCORCH_HEAT_BY_VARIANT = Object.freeze({
  'thermal-bolt': 1.0,
  'continuous-beam': 0.95,
  'siege-lance': 0.95,
  'concussion-slug': 0.9,
  torpedo: 0.9,
  missile: 0.85,
  railgun: 0.85,
  autocannon: 0.8,
  'pulse-bolt': 0.65,
});

export function heatForWeaponVariant(variant) {
  return SCORCH_HEAT_BY_VARIANT[variant] ?? 0.8;
}

/**
 * What kind of mark a contact leaves. Before this, every scar in the game — a slug through a hull,
 * a mining head working an ore face, a chip off an ice body — was the same molten blackbody gouge.
 * The mark is part of the material's identity, so it gets the same treatment the impact grammar
 * gives the burst: rock chips out to a fresh pale face, ice frosts and sublimates, ceramic crazes.
 *
 * `scorch` is the default and is bit-for-bit the behaviour every existing caller already gets.
 */
export const CONTACT_MARK_KINDS = Object.freeze({
  scorch: 0,
  gouge: 1,
  frost: 2,
  craze: 3,
});

/** Map a material id from the impact grammar onto the mark this surface actually takes. */
export function markKindForMaterial(materialId) {
  switch (materialId) {
    case 'rock': return CONTACT_MARK_KINDS.gouge;
    case 'ice': return CONTACT_MARK_KINDS.frost;
    case 'ceramic': return CONTACT_MARK_KINDS.craze;
    default: return CONTACT_MARK_KINDS.scorch;
  }
}

const VERTEX_SHADER = /* glsl */`
  attribute vec3 aPos;
  attribute vec3 aNormal;
  attribute vec4 aSize; // width, height, opacity, heat (0 cold .. 1 white-hot)
  attribute vec3 aColor;
  attribute vec2 aMark; // x: mark kind (0 scorch, 1 gouge, 2 frost, 3 craze), y: fracture 0..1
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vHeat;
  varying float vSeed;
  varying float vKind;
  varying float vFracture;
  void main() {
    vUv = uv;
    vColor = aColor;
    vOpacity = aSize.z;
    vHeat = aSize.w;
    vKind = aMark.x;
    vFracture = aMark.y;
    vSeed = fract(sin(dot(aPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
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
  varying float vHeat;
  varying float vSeed;
  varying float vKind;
  varying float vFracture;
  // Blackbody cooling ramp: white-hot core, fiery orange, deep cherry red, ember,
  // and finally cold charcoal. Temperature, not opacity, carries the fade.
  vec3 scorchBlackbody(float h) {
    vec3 charcoal = vec3(0.05, 0.04, 0.045);
    vec3 ember = vec3(0.30, 0.04, 0.015);
    vec3 cherry = vec3(0.78, 0.10, 0.02);
    vec3 orange = vec3(1.0, 0.42, 0.06) * 1.6;
    vec3 white = vec3(1.0, 0.97, 0.90) * 2.4;
    vec3 col = mix(charcoal, ember, smoothstep(0.0, 0.22, h));
    col = mix(col, cherry, smoothstep(0.18, 0.45, h));
    col = mix(col, orange, smoothstep(0.42, 0.68, h));
    col = mix(col, white, smoothstep(0.66, 0.92, h));
    return col;
  }
  // Radial crack field: straight fractures running out of the contact, their count rising with
  // how far the surface has been worked. This is what makes a mining face read as PROGRESSING
  // rather than as one mark getting bigger.
  float radialCracks(vec2 d, float r, float fracture, float seed) {
    float spokes = 3.0 + floor(fracture * 5.0);
    float a = atan(d.y, d.x) + seed * 6.2831;
    float ridge = abs(fract(a * spokes / 6.2831 + 0.5) - 0.5) * 2.0;
    float line = 1.0 - smoothstep(0.0, 0.16 + 0.10 * fracture, ridge);
    return line * smoothstep(1.05, 0.2, r) * smoothstep(0.03, 0.30, r);
  }

  void main() {
    vec2 d = vUv * 2.0 - 1.0;
    // Irregular gouge edge: a carved wound, not a printed disc.
    float wob = sin(vUv.x * 17.0 + vSeed * 12.9) * sin(vUv.y * 13.0 - vSeed * 7.7);
    float r = length(d) + wob * 0.07;
    float scorch = smoothstep(1.0, 0.15, r);
    // The core stays molten longest; the rim cools first.
    float core = smoothstep(0.62, 0.05, r);
    float heat = clamp(vHeat * (0.45 + 0.55 * core), 0.0, 1.0);
    vec3 molten = scorchBlackbody(heat);
    // Weapon tint survives only as a faint rim stain over the charcoal.
    float rim = smoothstep(0.9, 0.45, r) * (1.0 - smoothstep(0.5, 0.05, r));
    vec3 col = mix(molten, vColor * 0.35, rim * 0.4 * (1.0 - heat));
    float alpha = (scorch * 0.85 + rim * 0.3) * vOpacity;

    if (vKind > 0.5) {
      float cracks = radialCracks(d, r, vFracture, vSeed);
      if (vKind < 1.5) {
        // GOUGE. Rock does not melt, it chips: a dark shadowed rim around a FRESH pale face that
        // the surrounding weathered surface has not had time to darken, plus radial cracks.
        vec3 fresh = vColor * (1.15 + 0.35 * core);
        vec3 shadow = vColor * 0.18;
        col = mix(shadow, fresh, core);
        col = mix(col, fresh * 1.35, cracks * 0.55);
        // A little residual heat only where a beam actually cut. No blackbody glow.
        col += vec3(1.0, 0.44, 0.10) * heat * 0.55 * core;
        alpha = (scorch * 0.92 + cracks * 0.35) * vOpacity;
      } else if (vKind < 2.5) {
        // FROST. Ice takes a bright rime rim and a sublimated, near-transparent centre, so the
        // mark reads as material LEAVING rather than as material charring.
        float rime = smoothstep(0.35, 0.95, r) * (1.0 - smoothstep(0.92, 1.05, r));
        vec3 pale = vColor * 1.25 + vec3(0.18, 0.24, 0.30);
        col = mix(pale * 0.55, pale * 1.5, rime);
        col = mix(col, pale * 1.8, cracks * 0.4);
        alpha = (rime * 0.85 + cracks * 0.3 + scorch * 0.16) * vOpacity;
      } else {
        // CRAZE. Ceramic keeps its face and fails as a dense web of fine bright cracks.
        float web = radialCracks(d, r, min(1.0, vFracture + 0.55), vSeed + 0.37);
        float fine = radialCracks(d * 1.7, r, 1.0, vSeed + 0.71);
        float net = max(web, fine * 0.7);
        col = mix(vColor * 0.55, vColor * 1.6 + vec3(0.2), net);
        alpha = (net * 0.9 + scorch * 0.22) * vOpacity;
      }
    }

    if (alpha < 0.01) discard;
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
      heat0: 0.8,
      markKind: 0,
      fracture: 0,
      r: 0.2,
      g: 0.55,
      b: 0.85,
    }));
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.pos = dynamicAttribute(this.capacity * 3, 3);
    this.normal = dynamicAttribute(this.capacity * 3, 3);
    this.size = dynamicAttribute(this.capacity * 4, 4);
    this.color = dynamicAttribute(this.capacity * 3, 3);
    this.mark = dynamicAttribute(this.capacity * 2, 2);
    this.geometry.setAttribute('aPos', this.pos);
    this.geometry.setAttribute('aNormal', this.normal);
    this.geometry.setAttribute('aSize', this.size);
    this.geometry.setAttribute('aColor', this.color);
    this.geometry.setAttribute('aMark', this.mark);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
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
        { name: 'mark', attribute: this.mark },
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
    s.heat0 = Math.min(1, Math.max(0, finiteOr(spec.heat, 0.8)));
    // Default 0 (scorch) and 0 (fresh) keep every existing caller's mark exactly as it was.
    s.markKind = Math.max(0, Math.min(3, Math.round(finiteOr(spec.markKind, 0))));
    s.fracture = Math.min(1, Math.max(0, finiteOr(spec.fracture, 0)));
    s.r = finiteOr(spec.r, 0.2);
    s.g = finiteOr(spec.g, 0.55);
    s.b = finiteOr(spec.b, 0.85);
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
      const heat = scorchHeatForAge(s.age, s.life, s.heat0);
      this.pos.setXYZ(live, x, y, z);
      this.normal.setXYZ(live, nx, ny, nz);
      this.size.setXYZW(live, s.width, s.height, fade, heat);
      this.color.setXYZ(live, s.r, s.g, s.b);
      this.mark.setXY(live, s.markKind, s.fracture);
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
      this.normal.needsUpdate = true;
      this.size.needsUpdate = true;
      this.color.needsUpdate = true;
      this.mark.needsUpdate = true;
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
