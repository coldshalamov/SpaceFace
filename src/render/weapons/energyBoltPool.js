import * as THREE from 'three';
import {
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';
import { BOLT_VARIANT } from './recipes.js';
import { DEFAULT_BOLT_MIN_LENGTH_PIXELS, DEFAULT_BOLT_MIN_PIXELS, tanHalfFov } from './pixelFloor.js';
import { createSpindleGeometry } from './projectileGeometries.js';

export const ENERGY_BOLT_CAPACITY = 256;

const BOLT_POS = 0;
const BOLT_PREV = 1;
const BOLT_AXIS = 2;
const BOLT_SIZE = 3;
const BOLT_COLOR = 4;
const BOLT_SHEATH = 5;
const BOLT_MIN_PIXELS = 6;

const VERTEX_SHADER = /* glsl */`
  attribute vec3 aBoltPos;
  attribute vec3 aBoltPrev;
  attribute vec3 aBoltAxis;
  attribute vec4 aBoltSize;
  attribute vec3 aBoltColor;
  attribute vec3 aBoltSheath;
  attribute float aBoltMinPixels;

  uniform float uTanHalfFov;
  uniform float uViewportHeight;
  uniform float uMinPixels;
  uniform float uMinLengthPixels;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vSheath;
  varying float vIntensity;
  varying float vVariant;
  varying float vAlong;

  void main() {
    vUv = uv;
    vColor = aBoltColor;
    vSheath = aBoltSheath;
    vIntensity = aBoltSize.z;
    vVariant = aBoltSize.w;
    vAlong = uv.x;

    vec3 curr = aBoltPos;
    vec3 prev = aBoltPrev;
    vec3 axis = curr - prev;
    float smear = length(axis);
    if (smear < 0.08) {
      axis = aBoltAxis;
      smear = 0.0;
    }
    float axisLen = length(axis);
    axis = axisLen > 1e-5 ? axis / axisLen : vec3(1.0, 0.0, 0.0);

    vec3 mid = mix(prev, curr, 0.5);
    float dist = length(cameraPosition - mid);
    float worldPerPx = dist * uTanHalfFov * 2.0 / max(uViewportHeight, 1.0);
    // Default contract remains worldPerPx * uMinPixels; authored recipes may
    // override it per instance through aBoltMinPixels.
    float minPixels = aBoltMinPixels > 0.0 ? aBoltMinPixels : uMinPixels;
    float width = max(aBoltSize.y, worldPerPx * minPixels);
    float dash = max(aBoltSize.x + smear, worldPerPx * uMinLengthPixels);

    // Stable 3D orthonormal frame around velocity axis (no camera-facing billboarding)
    vec3 up = abs(axis.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 r1 = normalize(cross(axis, up));
    vec3 r2 = cross(axis, r1);

    // True volumetric 3D orientation: position.x along flight axis, position.y & position.z are radial
    vec3 world = mid
      + axis * position.x * dash
      + (r1 * position.y + r2 * position.z) * width;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vSheath;
  varying float vIntensity;
  varying float vVariant;
  varying float vAlong;

  uniform sampler2D uSceneDepth;
  uniform float uDepthEnabled;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uSoftDistance;
  // B16: the cross-section patterns must travel with the round instead of riding a still image.
  uniform float uBoltTime;

  float linearDepth(float depth01) {
    float z = depth01 * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar)
      / max(uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear), 1e-5);
  }

  void main() {
    float across = abs(vUv.y * 2.0 - 1.0);
    float core = pow(max(0.0, 1.0 - across), 6.0);
    float sheath = pow(max(0.0, 1.0 - across), 1.7);
    float tip = smoothstep(0.0, 0.16, vAlong) * smoothstep(1.0, 0.68, vAlong);
    float body = (sheath * 0.55 + core * 0.85) * tip;
    if (body < 0.004) discard;

    vec3 col = mix(vSheath, vColor, clamp(core * 1.15, 0.0, 1.0));

    // Variant 0: Pulse - laser dielectric dart with brilliant electric-cyan punch
    float pulse = 1.0 - step(0.5, vVariant);
    float pulseTip = smoothstep(0.0, 0.1, vAlong) * smoothstep(1.0, 0.88, vAlong);
    float pulseHead = smoothstep(0.40, 0.76, vAlong);
    float pulseFlute = 0.5 + 0.5 * cos(vUv.y * 12.56637 + vAlong * 4.0);
    body = mix(body, (sheath * (0.28 + pulseFlute * 0.34) + core * (0.50 + pulseHead * 0.85)) * pulseTip, pulse);
    col = mix(col, vec3(0.92, 0.98, 1.0), core * pulse * pulseHead * 0.58);

    // Variant 1: Plasma - superheated incandescent convection with boiling edges
    float plasma = step(0.5, vVariant) * (1.0 - step(1.5, vVariant));
    float plasmaBulb = sin(clamp(vAlong, 0.0, 1.0) * 3.14159);
    float plasmaBoil = 0.5 + 0.5 * sin(vAlong * 11.0 - uBoltTime * 14.0);
    float plasmaCore = pow(max(0.0, 1.0 - across), 3.2);
    body = mix(body, (plasmaCore * 1.1 + sheath * 0.7)
      * (0.52 + plasmaBulb * 0.42 + plasmaBoil * 0.16), plasma);
    col = mix(col, vec3(1.0, 0.95, 0.75), plasmaCore * plasma * 0.85);

    // Variant 2: Kinetic Mach tracer - hypersonic sabot needle with shock-diamond
    // flicker. A needle-thin white-hot head up front, an amber propellant tail behind:
    // crisp ballistic punch that reads at combat distance, not a soft glowing ball.
    float kinetic = step(1.5, vVariant) * (1.0 - step(2.5, vVariant));
    float machHead = smoothstep(0.55, 1.0, vAlong);
    float machTail = smoothstep(0.5, 0.0, vAlong);
    float machCore = pow(max(0.0, 1.0 - across), 12.0);
    float machDiamonds = 0.82 + 0.18 * sin(vAlong * 46.0 - uBoltTime * 55.0);
    body = mix(body, (machCore * 1.5 + sheath * 0.28) * machDiamonds * (0.75 + machHead * 0.9), kinetic);
    col = mix(col, vec3(1.0, 0.97, 0.9), machCore * machHead * kinetic * 0.95);
    col = mix(col, vec3(1.0, 0.62, 0.22), machTail * kinetic * 0.85);

    // Variant 3: Rail / Siege - relativistic needle with a white-hot core, a tight ionized
    // halo, and shock rings running the shaft. Thinner and hotter than the kinetic Mach
    // tracer: the most authoritative line on the field.
    float rail = step(2.5, vVariant) * (1.0 - step(3.5, vVariant));
    float railNeedle = pow(max(0.0, 1.0 - across), 10.0);
    float railHalo = pow(max(0.0, 1.0 - across), 2.6);
    float railRings = 0.86 + 0.14 * sin(vAlong * 44.0 - uBoltTime * 62.0);
    float railHead = smoothstep(0.35, 1.0, vAlong);
    body = mix(body, (railNeedle * 1.7 + railHalo * 0.4) * railRings * (0.7 + railHead * 0.8), rail);
    col = mix(col, vec3(1.0, 0.99, 0.96), railNeedle * rail * 0.95);

    // Variant 4: EMP - bifurcated electric arcs crackling across fins
    float emp = step(3.5, vVariant) * (1.0 - step(4.5, vVariant));
    float fork = abs(vUv.y - 0.5) * 2.0;
    float empArc = step(0.32, fork) * (1.0 - smoothstep(0.55, 0.95, fork));
    float empCrackle = 0.78 + 0.22 * sin(vAlong * 24.0 - uBoltTime * 33.0);
    body *= mix(1.0, (0.55 + 0.55 * empArc) * empCrackle, emp);
    col = mix(col, vec3(0.75, 0.88, 1.0), empArc * emp * 0.8);

    // Variant 5: Concussion - dense shockwave compression slug
    float concussion = step(4.5, vVariant) * (1.0 - step(5.5, vVariant));
    float concShock = smoothstep(0.65, 0.98, vAlong);
    body = mix(body, (core * 0.85 + sheath * 0.7) * (0.8 + concShock * 0.6), concussion);
    col = mix(col, vec3(1.0, 0.8, 0.45), concShock * concussion * 0.65);

    // Variant 6: Flak - fragmentation fleck with incendiary spark jacket
    float flak = step(5.5, vVariant);
    body = mix(body, (core * 1.1 + sheath * 0.6) * (0.7 + 0.3 * sin(vAlong * 25.0)), flak);
    col = mix(col, vec3(1.0, 0.9, 0.6), core * flak * 0.8);

    float radiance = body * vIntensity;
    float alpha = body;

    if (uDepthEnabled > 0.5) {
      vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
      float sceneZ = linearDepth(texture2D(uSceneDepth, screenUv).x);
      float fragZ = linearDepth(gl_FragCoord.z);
      float soft = clamp((sceneZ - fragZ) / max(uSoftDistance, 1e-4), 0.0, 1.0);
      alpha *= soft;
      radiance *= mix(0.4, 1.0, soft);
    }

    gl_FragColor = vec4(col * radiance, alpha);
  }
`;

function dynamicAttribute(length, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

export class EnergyBoltPool {
  constructor(scene, options = {}) {
    this.capacity = Math.max(1, options.capacity || ENERGY_BOLT_CAPACITY);
    this.scene = scene;
    this.geometry = createSpindleGeometry(3);
    this.pos = dynamicAttribute(this.capacity * 3, 3);
    this.prev = dynamicAttribute(this.capacity * 3, 3);
    this.axis = dynamicAttribute(this.capacity * 3, 3);
    this.size = dynamicAttribute(this.capacity * 4, 4);
    this.color = dynamicAttribute(this.capacity * 3, 3);
    this.sheath = dynamicAttribute(this.capacity * 3, 3);
    this.minPixels = dynamicAttribute(this.capacity, 1);
    this.geometry.setAttribute('aBoltPos', this.pos);
    this.geometry.setAttribute('aBoltPrev', this.prev);
    this.geometry.setAttribute('aBoltAxis', this.axis);
    this.geometry.setAttribute('aBoltSize', this.size);
    this.geometry.setAttribute('aBoltColor', this.color);
    this.geometry.setAttribute('aBoltSheath', this.sheath);
    this.geometry.setAttribute('aBoltMinPixels', this.minPixels);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTanHalfFov: { value: tanHalfFov() },
        uViewportHeight: { value: 1000 },
        uMinPixels: { value: DEFAULT_BOLT_MIN_PIXELS },
        uMinLengthPixels: { value: DEFAULT_BOLT_MIN_LENGTH_PIXELS },
        uSceneDepth: { value: null },
        uDepthEnabled: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCameraNear: { value: 0.5 },
        uCameraFar: { value: 4000 },
        uSoftDistance: { value: 1.4 },
        uBoltTime: { value: 0 },
      },
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
    this.mesh.name = 'SF_WeaponEnergyBolts';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.userData.spacefaceWeaponBoltPool = true;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, identity);
    this.mesh.instanceMatrix.needsUpdate = true;

    this.entityIds = new Int32Array(this.capacity);
    this.entityIds.fill(-1);
    this.byEntity = new Map();
    this.writeCount = 0;
    this._color = new THREE.Color();
    this.dynamicBufferOwner = scene ? registerDynamicBufferOwner(scene, {
      id: 'weapon-energy-bolts',
      mesh: this.mesh,
      attributes: [
        { name: 'position', attribute: this.pos },
        { name: 'prev', attribute: this.prev },
        { name: 'axis', attribute: this.axis },
        { name: 'size', attribute: this.size },
        { name: 'color', attribute: this.color },
        { name: 'sheath', attribute: this.sheath },
        { name: 'minPixels', attribute: this.minPixels },
      ],
    }) : null;
    if (scene) scene.add(this.mesh);
  }

  setCamera(camera, viewportHeight) {
    const u = this.material.uniforms;
    u.uTanHalfFov.value = tanHalfFov(camera && camera.fov);
    u.uViewportHeight.value = Math.max(1, viewportHeight || 1000);
    if (camera) {
      u.uCameraNear.value = camera.near;
      u.uCameraFar.value = camera.far;
    }
  }

  setDepthTexture(texture, width, height) {
    const u = this.material.uniforms;
    u.uSceneDepth.value = texture || null;
    u.uDepthEnabled.value = texture ? 1 : 0;
    u.uResolution.value.set(Math.max(1, width || 1), Math.max(1, height || 1));
  }

  beginFrame(dt = 0) {
    this._time = (Number.isFinite(this._time) ? this._time : 0)
      + (Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0);
    this.material.uniforms.uBoltTime.value = this._time;
    this.writeCount = 0;
    this.byEntity.clear();
  }

  writeBolt({
    entityId,
    x, y, z,
    prevX, prevY, prevZ,
    ax, ay, az,
    length, width, intensity, variant,
    coreR, coreG, coreB,
    sheathR, sheathG, sheathB,
    minPixels,
  }) {
    const index = this.writeCount;
    if (index >= this.capacity) return -1;
    this.writeCount = index + 1;
    this.entityIds[index] = entityId == null ? -1 : entityId;
    if (entityId != null) this.byEntity.set(entityId, index);
    this.pos.setXYZ(index, x, y, z);
    this.prev.setXYZ(index, prevX, prevY, prevZ);
    this.axis.setXYZ(index, ax, ay, az);
    this.size.setXYZW(
      index,
      length,
      width,
      intensity,
      Number.isFinite(variant) ? variant : BOLT_VARIANT.PULSE,
    );
    this.color.setXYZ(index, coreR, coreG, coreB);
    this.sheath.setXYZ(index, sheathR, sheathG, sheathB);
    this.minPixels.setX(
      index,
      Number.isFinite(minPixels) && minPixels > 0 ? minPixels : DEFAULT_BOLT_MIN_PIXELS,
    );
    if (this.dynamicBufferOwner) {
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_POS, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_PREV, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_AXIS, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_SIZE, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_COLOR, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_SHEATH, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_MIN_PIXELS, index);
    }
    return index;
  }

  commit() {
    if (this.dynamicBufferOwner) {
      commitDynamicBufferOwner(this.dynamicBufferOwner, this.writeCount);
    } else {
      this.mesh.count = this.writeCount;
      this.pos.needsUpdate = true;
      this.prev.needsUpdate = true;
      this.axis.needsUpdate = true;
      this.size.needsUpdate = true;
      this.color.needsUpdate = true;
      this.sheath.needsUpdate = true;
      this.minPixels.needsUpdate = true;
    }
    this.mesh.visible = this.writeCount > 0;
  }

  get live() {
    return this.writeCount;
  }

  dispose() {
    unregisterDynamicBufferOwner(this.dynamicBufferOwner);
    this.dynamicBufferOwner = null;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function createEnergyBoltPrecompileMesh() {
  const pool = new EnergyBoltPool(null, { capacity: 2 });
  pool.beginFrame();
  pool.writeBolt({
    entityId: 1,
    x: 0, y: 0.4, z: 0,
    prevX: -4, prevY: 0.4, prevZ: 0,
    ax: 1, ay: 0, az: 0,
    length: 10, width: 1.7, intensity: 2.1, variant: BOLT_VARIANT.PULSE,
    coreR: 0.2, coreG: 0.81, coreB: 1,
    sheathR: 0.37, sheathG: 0.5, sheathB: 1,
  });
  pool.commit();
  return pool.mesh;
}
