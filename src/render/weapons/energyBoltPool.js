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
    // Narrow ballistic bodies in world space, before enforcing their readability
    // floor. Scaling geometry after max() made distant rail shots subpixel.
    float ballisticWidth = aBoltSize.w >= 1.5 && aBoltSize.w < 3.5
      ? (aBoltSize.w < 2.5 ? 0.32 : 0.22) : 1.0;
    float width = max(aBoltSize.y * ballisticWidth, worldPerPx * minPixels);
    // Drawn extent is a readability envelope around a moving object, never a hazard boundary:
    // the dash is a one-sided smear along the velocity axis whose length is dominated by the
    // distance travelled this frame, and the authoritative collision radius stays with the
    // simulation. Nothing here is a ring, a shell or a symmetric footprint at a damage radius.
    float dash = max(aBoltSize.x + smear, worldPerPx * uMinLengthPixels);

    // Stable 3D orthonormal frame around velocity axis (no camera-facing billboarding)
    vec3 up = abs(axis.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 r1 = normalize(cross(axis, up));
    vec3 r2 = cross(axis, r1);

    // Each family has an actual cross-section, not just a different tint on the same dart.
    // The hollow pulse lip cups forward; plasma has rolling lobes; induction tears into
    // opposed forks. All deformation lives in the velocity frame, never the camera frame.
    float t = uv.x;
    float side = uv.y * 2.0 - 1.0;
    float bow = sin(t * 3.14159265);
    vec3 shaped = position;
    if (aBoltSize.w < 0.5) {
      shaped.x += (1.0 - side * side) * bow * 0.19;
      shaped.yz *= 0.70 + smoothstep(0.35, 0.80, t) * 0.62;
    } else if (aBoltSize.w < 1.5) {
      shaped.yz *= 1.10 + 0.24 * sin(t * 12.56637 + side * 2.2);
      shaped.x += bow * side * 0.12;
    } else if (aBoltSize.w >= 1.5 && aBoltSize.w < 2.5) {
      // Kinetic sabot: a machined dart, not a recoloured pulse. Needle nose, a hard flared
      // base where the driving band bit, and a rifling twist carried in the velocity frame.
      shaped.yz *= 0.45 + 0.70 * pow(1.0 - t, 1.9);
      float spin = (t - 0.5) * 0.62;
      float cs = cos(spin);
      float sn = sin(spin);
      shaped.yz = vec2(shaped.y * cs - shaped.z * sn, shaped.y * sn + shaped.z * cs);
      shaped.x += (1.0 - side * side) * (1.0 - t) * 0.09;
    } else if (aBoltSize.w >= 2.5 && aBoltSize.w < 3.5) {
      // Rail / siege: a relativistic needle with one detached ionisation collar behind the
      // nose. Thinner than the sabot along its whole length, so the two never read alike.
      float collar = exp(-pow((t - 0.72) / 0.085, 2.0));
      shaped.yz *= 0.60 + 0.32 * pow(1.0 - t, 2.2) + collar * 1.18;
      shaped.x += collar * side * 0.07;
    } else if (aBoltSize.w >= 3.5 && aBoltSize.w < 4.5) {
      shaped.yz *= 0.8 + 0.6 * sin(t * 3.14159265);
      shaped.x += abs(side) * bow * 0.20;
    } else if (aBoltSize.w >= 4.5 && aBoltSize.w < 5.5) {
      shaped.x = (t - 0.5) * 0.6 + side * side * bow * 0.28;
      shaped.yz *= 1.65;
    } else if (aBoltSize.w >= 5.5) {
      // Flak: a stubby tumbling fragment. Stepped facets instead of a taper, and a body that
      // sits off the flight axis, so fragmentation never reads as a short glowing dart.
      shaped.yz *= (0.82 + 0.36 * step(0.5, fract(t * 3.0))) * 1.22;
      shaped.x *= 0.58;
      shaped.y += 0.17 * sin(t * 6.28318 + side);
      shaped.z += 0.14 * cos(t * 6.28318);
    }
    vec3 world = mid
      + axis * shaped.x * dash
      + (r1 * shaped.y + r2 * shaped.z) * width;
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
  uniform float uBoltFlicker;

  float linearDepth(float depth01) {
    float z = depth01 * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar)
      / max(uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear), 1e-5);
  }

  void main() {
    float across = abs(vUv.y * 2.0 - 1.0);
    float core = pow(max(0.0, 1.0 - across), 6.0);
    float sheath = 1.0 - smoothstep(0.72, 1.0, across);
    float tip = smoothstep(0.0, 0.16, vAlong) * smoothstep(1.0, 0.68, vAlong);
    float body = (sheath * 0.55 + core * 0.85) * tip;
    if (body < 0.004) discard;

    vec3 col = mix(vSheath, vColor, clamp(core * 1.15, 0.0, 1.0));

    // Variant 0: Pulse - a cupped dielectric lip with an electric-cyan punch. The lip is a wave
    // the round sheds down its own flanks, and the head surges as the charge sloshes forward:
    // this is the starter gun, so it is the shot the player sees most and it may never be a
    // still image sliding across the screen.
    float pulse = 1.0 - step(0.5, vVariant);
    float pulseTip = smoothstep(0.0, 0.1, vAlong) * smoothstep(1.0, 0.88, vAlong);
    float pulseHead = smoothstep(0.40, 0.76, vAlong);
    float pulseShed = sin(vAlong * 5.0 + uBoltTime * 17.0);
    float pulseLip = exp(-pow((across - (0.57 + 0.13 * pulseShed)) / 0.13, 2.0));
    float pulseSurge = 0.9 + uBoltFlicker * 0.1 * sin(uBoltTime * 29.0 - vAlong * 4.0);
    body = mix(body, (sheath * 0.20 + pulseLip * (0.72 + pulseHead * 0.95)
      + core * (0.25 + pulseHead * 0.58) * pulseSurge) * pulseTip, pulse);
    col = mix(col, vec3(0.92, 0.98, 1.0), pulseLip * pulse * pulseHead * 0.67);

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
    float machDiamonds = 0.82 + uBoltFlicker * 0.18 * sin(vAlong * 46.0 - uBoltTime * 55.0);
    body = mix(body, (machCore * 1.5 + sheath * 0.28) * machDiamonds * (0.75 + machHead * 0.9), kinetic);
    col = mix(col, vec3(1.0, 0.97, 0.9), machCore * machHead * kinetic * 0.95);
    col = mix(col, vec3(1.0, 0.62, 0.22), machTail * kinetic * 0.85);

    // Variant 3: Rail / Siege - relativistic needle with a white-hot core, a tight ionized
    // halo, and shock rings running the shaft. Thinner and hotter than the kinetic Mach
    // tracer: the most authoritative line on the field.
    float rail = step(2.5, vVariant) * (1.0 - step(3.5, vVariant));
    float railNeedle = pow(max(0.0, 1.0 - across), 10.0);
    float railHalo = pow(max(0.0, 1.0 - across), 2.6);
    float railRings = 0.86 + uBoltFlicker * 0.14 * sin(vAlong * 44.0 - uBoltTime * 62.0);
    float railHead = smoothstep(0.35, 1.0, vAlong);
    body = mix(body, (railNeedle * 1.7 + railHalo * 0.4) * railRings * (0.7 + railHead * 0.8), rail);
    col = mix(col, vec3(1.0, 0.99, 0.96), railNeedle * rail * 0.95);

    // Variant 4: EMP - bifurcated electric arcs crackling across fins
    float emp = step(3.5, vVariant) * (1.0 - step(4.5, vVariant));
    float forkCenter = 0.43 + 0.15 * sin(vAlong * 6.28318 - uBoltTime * 5.0);
    float empArc = exp(-pow((across - forkCenter) / 0.17, 2.0));
    float empCrackle = 0.78 + uBoltFlicker * 0.22 * sin(vAlong * 24.0 - uBoltTime * 33.0);
    // Open air between the two branches is a silhouette feature, not a pale stripe
    // painted over the pulse body. A short root joins them at the trailing heel.
    float empRoot = (1.0 - smoothstep(0.12, 0.30, vAlong)) * core;
    body = mix(body, (empArc * 1.28 + empRoot * 0.55) * tip * empCrackle, emp);
    if (emp > 0.5 && empArc + empRoot < 0.12) discard;
    col = mix(col, vec3(0.75, 0.88, 1.0), empArc * emp * 0.8);

    // Variant 5: Concussion - dense shockwave compression slug. Pressure rings peel off the bow
    // shock and race down the slug's flanks while the bow itself throbs: the round that shoves
    // hulls around has to look like it is carrying a wall of pressure, not like a painted capsule.
    float concussion = step(4.5, vVariant) * (1.0 - step(5.5, vVariant));
    float concShock = smoothstep(0.65, 0.98, vAlong);
    float concRings = 0.5 + 0.5 * sin(vAlong * 21.0 + uBoltTime * 44.0);
    float concThrob = 0.86 + uBoltFlicker * 0.14 * sin(uBoltTime * 26.0);
    body = mix(body, (core * 0.85 + sheath * (0.5 + 0.34 * concRings * (1.0 - concShock)))
      * (0.8 + concShock * 0.6 * concThrob), concussion);
    col = mix(col, vec3(1.0, 0.8, 0.45), concShock * concussion * 0.65);

    // Variant 6: Flak - fragmentation fleck with incendiary spark jacket
    float flak = step(5.5, vVariant);
    // The spark jacket crawls tailward and spits: fragmentation is burning, not striped.
    float flakCrawl = sin(vAlong * 25.0 + uBoltTime * 39.0);
    float flakSpit = 1.0 + uBoltFlicker * 0.16 * sin(uBoltTime * 67.0 + vAlong * 9.0);
    body = mix(body, (core * 1.1 + sheath * 0.6) * (0.7 + 0.3 * flakCrawl) * flakSpit, flak);
    col = mix(col, vec3(1.0, 0.9, 0.6), core * flak * 0.8);

    float radiance = body * vIntensity;
    // A dark saturated outer enamel is part of the energy object. Normal blending lets
    // that lip separate it from a bright sky; only the hot fold feeds the bloom shoulder.
    float inkLip = smoothstep(0.69, 0.88, across) * (1.0 - smoothstep(0.95, 1.0, across));
    col = mix(col, vSheath * 0.065, inkLip * 0.88);
    float alpha = clamp(max(body, inkLip * tip * 0.82), 0.0, 1.0);

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
        uBoltFlicker: { value: 1 },
      },
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
    this._camera = null;
    this._time = 0;
    this._instanceAttributes = [
      this.pos, this.prev, this.axis, this.size, this.color, this.sheath, this.minPixels,
    ];
    this._sortDepth = new Float64Array(this.capacity);
    this._sortOrder = new Uint32Array(this.capacity);
    this._sortOrderScratch = new Uint32Array(this.capacity);
    this._sortDestinations = new Uint32Array(this.capacity);
    this._sortAttributeScratch = new Float32Array(this.capacity * 4);
    this._sortEntityScratch = new Int32Array(this.capacity);
    this._remapEntity = (index, id) => this.byEntity.set(id, this._sortDestinations[index]);
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
    this._camera = camera || null;
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

  beginFrame(dt = 0, accessibilityProfile = null) {
    const profileId = accessibilityProfile && accessibilityProfile.id;
    const reducedMotion = profileId === 'reduced-motion' || profileId === 'reduced-motion-and-flash';
    const reducedFlash = profileId === 'reduced-flash' || profileId === 'reduced-motion-and-flash';
    if (!reducedMotion && Number.isFinite(dt) && dt > 0) this._time += Math.min(dt, 0.1);
    this.material.uniforms.uBoltTime.value = this._time;
    this.material.uniforms.uBoltFlicker.value = reducedFlash ? 0 : 1;
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

  _sortBackToFront() {
    const count = this.writeCount;
    const camera = this._camera;
    if (count < 2 || !camera || !camera.matrixWorldInverse) return false;
    // Presentation can run before renderer.render refreshes a moved camera's inverse.
    if (typeof camera.updateWorldMatrix === 'function') camera.updateWorldMatrix(true, false);
    const view = camera.matrixWorldInverse.elements;
    const pos = this.pos.array;
    const prev = this.prev.array;
    const depth = this._sortDepth;
    let order = this._sortOrder;
    let scratch = this._sortOrderScratch;
    let sorted = true;
    for (let i = 0; i < count; i++) {
      const offset = i * 3;
      // Camera-space Z increases towards the camera: most negative draws first.
      // Use the shader's swept midpoint, not distance or only the current endpoint.
      depth[i] = 0.5 * ((pos[offset] + prev[offset]) * view[2]
        + (pos[offset + 1] + prev[offset + 1]) * view[6]
        + (pos[offset + 2] + prev[offset + 2]) * view[10]) + view[14];
      order[i] = i;
      if (i > 0 && depth[i - 1] > depth[i]) sorted = false;
    }
    if (sorted) return false;

    // Stable merge sort bounds dense volleys at O(n log n), with no per-frame arrays.
    for (let width = 1; width < count; width *= 2) {
      for (let start = 0; start < count; start += width * 2) {
        const middle = Math.min(start + width, count);
        const end = Math.min(start + width * 2, count);
        let left = start;
        let right = middle;
        for (let out = start; out < end; out++) {
          scratch[out] = right >= end || (left < middle && depth[order[left]] <= depth[order[right]])
            ? order[left++] : order[right++];
        }
      }
      const swap = order;
      order = scratch;
      scratch = swap;
    }
    for (let i = 0; i < count; i++) {
      this._sortDestinations[order[i]] = i;
      this._sortEntityScratch[i] = this.entityIds[order[i]];
    }
    for (let i = 0; i < count; i++) this.entityIds[i] = this._sortEntityScratch[i];
    // Preserve the original map keys, including callers that use string entity IDs.
    this.byEntity.forEach(this._remapEntity);
    const values = this._sortAttributeScratch;
    for (let attrIndex = 0; attrIndex < this._instanceAttributes.length; attrIndex++) {
      const attribute = this._instanceAttributes[attrIndex];
      const { array, itemSize } = attribute;
      for (let i = 0; i < count; i++) {
        const source = order[i] * itemSize;
        const target = i * itemSize;
        for (let c = 0; c < itemSize; c++) values[target + c] = array[source + c];
      }
      for (let i = 0; i < count * itemSize; i++) array[i] = values[i];
      if (this.dynamicBufferOwner) markDynamicBufferItems(this.dynamicBufferOwner, attrIndex, 0, count);
    }
    // instanceMatrix is deliberately identical for every slot; the shader uses the attributes above.
    return true;
  }

  commit() {
    this._sortBackToFront();
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
