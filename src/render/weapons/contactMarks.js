import * as THREE from 'three';
import {
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

import { resolveWeaponPresentationFamily } from '../vfxProfiles.js';
import { weaponEffectSeed } from './energyBoltPool.js';

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
  'vector-mine': 0.85,
  autocannon: 0.8,
  flak: 0.75,
  disruptor: 0.7,
  'pulse-bolt': 0.65,
});

export function heatForWeaponVariant(variant) {
  if (typeof variant === 'string' && SCORCH_HEAT_BY_VARIANT[variant] !== undefined) {
    return SCORCH_HEAT_BY_VARIANT[variant];
  }
  const resolved = resolveWeaponPresentationFamily(variant);
  if (resolved && resolved.variant && SCORCH_HEAT_BY_VARIANT[resolved.variant] !== undefined) {
    return SCORCH_HEAT_BY_VARIANT[resolved.variant];
  }
  return 0.8;
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
  mineralSplash: 4,
  thermalSeat: 5,
  inductionBranch: 6,
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
  attribute vec3 aMark; // kind+phase for transient reactions, fracture, stable seed
  attribute vec4 aSurface; // world-space receiver centre XYZ and approximate collision radius
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
    vSeed = aMark.z;
    vec3 n = normalize(aNormal);
    vec3 tangent = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 bitangent = normalize(cross(n, tangent));
    tangent = normalize(cross(bitangent, n));
    vec3 world = aPos + n * 0.16
      + tangent * (uv.x - 0.5) * aSize.x
      + bitangent * (uv.y - 0.5) * aSize.y;
    if (aSurface.w > 0.0) {
      // Approximate receiver sphere, no per-particle physics or new draw. The authored rock
      // depth test occludes the patch; irregular concavities remain a known R1 limitation.
      vec3 fromCentre = world - aSurface.xyz;
      float lengthToCentre = length(fromCentre);
      if (lengthToCentre > 0.001) {
        world = aSurface.xyz + fromCentre / lengthToCentre * (aSurface.w + 0.19);
      }
    }
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
    float width = 0.16 + 0.10 * fracture;
    float filtered = max(width, fwidth(ridge));
    float line = (1.0 - smoothstep(0.0, filtered, ridge)) * width / filtered;
    return line * (1.0 - smoothstep(0.2, 1.05, r)) * smoothstep(0.03, 0.30, r);
  }

  void main() {
    vec2 d = vUv * 2.0 - 1.0;
    // Irregular gouge edge: a carved wound, not a printed disc.
    float wob = sin(vUv.x * 17.0 + vSeed * 12.9) * sin(vUv.y * 13.0 - vSeed * 7.7);
    float r = length(d) + wob * 0.07;
    float scorch = 1.0 - smoothstep(0.15, 1.0, r);
    // The core stays molten longest; the rim cools first.
    float core = 1.0 - smoothstep(0.05, 0.62, r);
    float heat = clamp(vHeat * (0.45 + 0.55 * core), 0.0, 1.0);
    vec3 molten = scorchBlackbody(heat);
    // Weapon tint survives only as a faint rim stain over the charcoal.
    float rim = (1.0 - smoothstep(0.45, 0.9, r)) * smoothstep(0.05, 0.5, r);
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

    if (vKind >= 4.0) {
      // The receiver answers the real contact. Mineral, heat and charge each have their own
      // distinct aftermath, not one uniformly illuminated expanding/moving object.
      float progress = fract(vKind);
      float nature = floor(vKind);
      float angle = atan(d.y, d.x);
      float sector = sin(angle * 7.0 + vSeed * 6.2831) * 0.09
        + sin(angle * 13.0 - vSeed * 12.83) * 0.045;
      float skew = dot(d, vec2(cos(vSeed * 6.2831), sin(vSeed * 6.2831)));
      float rBroken = r + sector * smoothstep(0.10, 0.8, r);
      float footprint = 1.0 - smoothstep(0.68, 0.93, rBroken);
      float reach = smoothstep(rBroken * 0.45, rBroken * 0.45 + 0.13, progress * 1.9 + 0.08);
      float cooling = 1.0 - smoothstep(0.42, 0.98, progress);
      float ignition = exp(-progress * 16.0) * exp(-rBroken * rBroken * 14.0);
      float cracks = radialCracks(d + skew * vec2(0.035, -0.026), rBroken, 0.82, vSeed);
      if (nature < 4.5) {
        float fresh = footprint * reach * (0.55 + 0.45 * max(0.0, sin(angle * 6.0 + vSeed * 10.0)));
        col = mix(vec3(0.09, 0.105, 0.12), vec3(0.67, 0.77, 0.79), fresh);
        col += vec3(1.75, 1.45, 0.94) * (ignition * 3.0 + cracks * cooling * 0.48);
        alpha = (fresh * 0.75 + cracks * 0.55 + ignition) * cooling * vOpacity;
      } else if (nature < 5.5) {
        float tongues = smoothstep(0.47, 0.82,
          0.5 + 0.3 * sin(angle * 5.0 + vSeed * 8.0 + rBroken * 10.0)
          + 0.18 * sin(angle * 11.0 - rBroken * 17.0));
        float hot = footprint * reach * tongues * exp(-progress * 5.0);
        col = vec3(0.12, 0.037, 0.018) + vec3(3.2, 1.15, 0.27) * hot
          + vec3(3.1, 2.8, 2.1) * ignition;
        alpha = (footprint * 0.40 + hot * 0.75 + ignition) * cooling * vOpacity;
      } else {
        float forks = max(cracks, radialCracks(d * 1.33, rBroken, 0.75, vSeed + 0.41));
        float charge = forks * footprint * reach * exp(-progress * 4.0);
        col = vec3(0.04, 0.07, 0.11) + vec3(0.38, 1.55, 3.05) * charge
          + vec3(2.0, 2.5, 3.1) * ignition;
        alpha = (charge + ignition + footprint * 0.10) * cooling * vOpacity;
      }
    }
    // GRAPHICS BAR: the wobbled radius let the char and crack terms reach the quad's edge
    // midpoints at a few percent alpha, which drew a faint hard-edged card at grazing angles.
    // Every mark kind now reaches exactly zero inside the quad.
    alpha *= 1.0 - smoothstep(0.80, 0.97, max(abs(d.x), abs(d.y)));
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
      seed: 0,
      surfaceSplash: false,
      r: 0.2,
      g: 0.55,
      b: 0.85,
      attached: false,
      persistent: false,
      boundKey: null,
      scarId: null,
    }));
    // 5x5 receiver curvature: 36 vertices per slot, 1152 at existing 32-slot saturation.
    this.geometry = new THREE.PlaneGeometry(1, 1, 5, 5);
    this.pos = dynamicAttribute(this.capacity * 3, 3);
    this.normal = dynamicAttribute(this.capacity * 3, 3);
    this.size = dynamicAttribute(this.capacity * 4, 4);
    this.color = dynamicAttribute(this.capacity * 3, 3);
    this.mark = dynamicAttribute(this.capacity * 3, 3);
    this.surface = dynamicAttribute(this.capacity * 4, 4);
    this.geometry.setAttribute('aPos', this.pos);
    this.geometry.setAttribute('aNormal', this.normal);
    this.geometry.setAttribute('aSize', this.size);
    this.geometry.setAttribute('aColor', this.color);
    this.geometry.setAttribute('aMark', this.mark);
    this.geometry.setAttribute('aSurface', this.surface);
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
    this._spawnSerial = 0;
    this.live = 0;
    this.retainedScars = [];
    this._disposed = false;
    this.dynamicBufferOwner = scene ? registerDynamicBufferOwner(scene, {
      id: 'weapon-hull-scorch',
      mesh: this.mesh,
      attributes: [
        { name: 'position', attribute: this.pos },
        { name: 'normal', attribute: this.normal },
        { name: 'size', attribute: this.size },
        { name: 'color', attribute: this.color },
        { name: 'mark', attribute: this.mark },
        { name: 'surface', attribute: this.surface },
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
      for (let n = 0; n < this.capacity; n++) {
        const i = this._cursor;
        this._cursor = (this._cursor + 1) % this.capacity;
        if (!this.slots[i].persistent) { slot = i; break; }
      }
    }
    if (slot < 0) {
      slot = this._cursor;
      this._cursor = (this._cursor + 1) % this.capacity;
    }
    const s = this.slots[slot];
    // Quiet settled flight: update walked CAP + commit(0) every frame. Trust live
    // (spawn ++ when taking a dead slot / retire -- / dispose clear); picture unchanged at 0.
    const wasAlive = !!s.alive;
    s.alive = 1;
    if (!wasAlive) this.live += 1;
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
    s.markKind = Math.max(0, Math.min(6, Math.round(finiteOr(spec.markKind, 0))));
    s.surfaceSplash = spec.surfaceSplash === true;
    s.fracture = Math.min(1, Math.max(0, finiteOr(spec.fracture, 0)));
    s.seed = Number.isFinite(spec.seed) ? spec.seed : weaponEffectSeed(`${s.targetId}:${++this._spawnSerial}`);
    s.r = finiteOr(spec.r, 0.2);
    s.g = finiteOr(spec.g, 0.55);
    s.b = finiteOr(spec.b, 0.85);
    s.attached = spec.attached === true;
    s.persistent = spec.persistent === true;
    s.boundKey = spec.boundKey != null ? spec.boundKey : null;
    s.scarId = spec.scarId != null ? spec.scarId : null;
    return slot;
  }

  // Drop transient flashes for one entity. Persistent scars and the shared material stay.
  releaseTransient(entityId = null) {
    let alive = 0;
    for (const s of this.slots) {
      if (!s.alive) continue;
      if (!s.persistent && (entityId == null || s.targetId === entityId)) {
        s.alive = 0;
        continue;
      }
      alive++;
    }
    this.live = alive;
    return alive;
  }

  update(dt, resolvePose) {
    // Quiet path: capacity walk + 5-attr commit(0) when live===0 was pure CPU;
    // mesh already count=0/visible=false after the frame that retired the last slot.
    // Keep one idle publish when mesh.count>0 so a trailing clear still hides.
    if (!(this.live > 0) && !(this.mesh.count > 0)) return 0;
    let drawn = 0;
    let alive = 0;
    const step = Math.max(0, finiteOr(dt, 0));
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.alive) continue;
      if (s.persistent) {
        if (s.age < s.life) s.age = Math.min(s.life, s.age + step);
      } else {
        s.age += step;
        if (s.age >= s.life) {
          s.alive = 0;
          continue;
        }
      }
      let x = s.localX;
      let y = s.localY;
      let z = s.localZ;
      let nx = s.nx;
      let ny = s.ny;
      let nz = s.nz;
      let pose = null;
      if (resolvePose) {
        pose = resolvePose(s);
        // false retires a transient flash. null holds the slot and draws nothing,
        // so a LOD/refit gap cannot publish the local offset as a world card.
        if (pose === false) {
          if (!s.persistent) {
            s.alive = 0;
            continue;
          }
          alive++;
          continue;
        }
        if (!pose) {
          alive++;
          continue;
        }
        x = pose.x; y = pose.y; z = pose.z;
        if (pose.nx != null) { nx = pose.nx; ny = pose.ny; nz = pose.nz; }
      }
      alive++;
      const fadeRaw = (s.age < 0.08 ? s.age / 0.08 : Math.max(0, 1 - (s.age - 0.08) / (s.life - 0.08))) * s.opacity;
      const fade = s.persistent ? Math.max(fadeRaw, 0.7 * s.opacity) : fadeRaw;
      const heat = scorchHeatForAge(s.age, s.life, s.heat0);
      this.pos.setXYZ(drawn, x, y, z);
      this.normal.setXYZ(drawn, nx, ny, nz);
      this.size.setXYZW(drawn, s.width, s.height, fade, heat);
      this.color.setXYZ(drawn, s.r, s.g, s.b);
      this.mark.setXYZ(drawn,
        s.surfaceSplash ? s.markKind + Math.min(0.98, s.age / s.life * 0.98) : s.markKind,
        s.fracture, s.seed);
      this.surface.setXYZW(drawn,
        s.surfaceSplash && Number.isFinite(pose?.surfaceRadius) && pose.surfaceRadius > 0 ? pose.surfaceX : 0,
        s.surfaceSplash && Number.isFinite(pose?.surfaceRadius) && pose.surfaceRadius > 0 ? pose.surfaceY : 0,
        s.surfaceSplash && Number.isFinite(pose?.surfaceRadius) && pose.surfaceRadius > 0 ? pose.surfaceZ : 0,
        s.surfaceSplash && Number.isFinite(pose?.surfaceRadius) && pose.surfaceRadius > 0 ? pose.surfaceRadius : 0);
      if (this.dynamicBufferOwner) {
        markDynamicBufferItems(this.dynamicBufferOwner, 0, drawn);
        markDynamicBufferItems(this.dynamicBufferOwner, 1, drawn);
        markDynamicBufferItems(this.dynamicBufferOwner, 2, drawn);
        markDynamicBufferItems(this.dynamicBufferOwner, 3, drawn);
        markDynamicBufferItems(this.dynamicBufferOwner, 4, drawn);
        markDynamicBufferItems(this.dynamicBufferOwner, 5, drawn);
      }
      drawn++;
    }
    this.live = alive;
    if (this.dynamicBufferOwner) {
      commitDynamicBufferOwner(this.dynamicBufferOwner, drawn);
    } else {
      this.mesh.count = drawn;
      this.pos.needsUpdate = true;
      this.normal.needsUpdate = true;
      this.size.needsUpdate = true;
      this.color.needsUpdate = true;
      this.mark.needsUpdate = true;
      this.surface.needsUpdate = true;
    }
    this.mesh.visible = drawn > 0;
    return drawn;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const retained = [];
    for (const s of this.slots) {
      if (!s.alive || !s.persistent) continue;
      retained.push({
        scarId: s.scarId,
        targetId: s.targetId,
        boundKey: s.boundKey,
        localX: s.localX,
        localY: s.localY,
        localZ: s.localZ,
        nx: s.nx,
        ny: s.ny,
        nz: s.nz,
      });
    }
    this.retainedScars = retained;
    unregisterDynamicBufferOwner(this.dynamicBufferOwner);
    this.dynamicBufferOwner = null;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
    this.live = 0;
    for (const s of this.slots) s.alive = 0;
  }
}
