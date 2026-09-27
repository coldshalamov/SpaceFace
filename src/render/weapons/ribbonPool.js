import * as THREE from 'three';
import { CHASE_CAMERA_FOV_DEG, CHASE_CAMERA_VIEWPORT_HEIGHT, worldSizeForPixels } from './pixelFloor.js';
import { RIBBON_PROFILE, ribbonProfileForWidth } from './recipes.js';
import { weaponEffectSeed } from './energyBoltPool.js';

export { RIBBON_PROFILE, ribbonProfileForWidth };

export const WEAPON_RIBBON_CAPACITY = 256;
export const WEAPON_RIBBON_SEGMENTS = 24;

/** Screen floor for a wake, measured on the PROJECTED sheet so foreshortening cannot erase it. */
export const RIBBON_MIN_PIXELS = 1.7;
/**
 * A wake is a short line behind the round, not the whole flight. History still stores the path
 * the round flew (the frame-truth pin reads that). Vertices past this arc length are not drawn.
 */
export const WAKE_VISIBLE_ARC_WU = 42;
// Closed cross-sections make energy occupy depth at every view. The ninth vertex closes UVs.
export const WEAPON_WAKE_SECTION_VERTICES = 9;
const SECTION = WEAPON_WAKE_SECTION_VERTICES;

const RIBBON_VERT = /* glsl */`
  attribute float aAlpha;
  attribute vec3 aColor;
  attribute vec3 aRibNormal;
  attribute vec4 aShape;
  varying float vAlpha;
  varying vec3 vColor;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec4 vShape;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vUv = uv;
    vShape = aShape;
    vNormalW = aRibNormal;
    vViewW = cameraPosition - position;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */`
  precision highp float;
  varying float vAlpha;
  varying vec3 vColor;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec4 vShape;
  uniform float uIntensity;
  uniform float uGrazeGain;
  uniform float uModulation;

  // Average subpixel periodic detail instead of aliasing it into stationary pixels.
  float ribbonWave(float phase) {
    return sin(phase) * (1.0-smoothstep(0.7,3.14159,fwidth(phase)));
  }
  float ribbonStrand(float distance, float width) {
    float resolved=max(width,fwidth(distance));
    return exp(-pow(distance/resolved,2.0))*width/resolved;
  }

  void main() {
    if (vAlpha <= 0.002) discard;
    float angle = vUv.y * 6.2831853;
    float along = vUv.x;
    float id = vShape.x;
    float arc = vShape.y;
    float phase = vShape.z;
    float flow = vShape.w * (0.88 + 0.24 * fract(phase * 4.19));
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
    float depth = mix(0.58, 1.0, smoothstep(0.02, 0.7, facing));
    float edgeOn = 1.0 - facing;
    float body;
    float hot;
    if (id < 0.5) {
      // CORD: a compact ballistic pressure tube with traveling compression collars.
      hot = pow(0.5 + 0.5 * ribbonWave(arc * 2.6 - flow * 38.0 + phase), 3.0);
      body = 0.32 + hot * 0.64;
    } else if (id < 1.5) {
      // BRAID: broad circulating plasma. Dark channels convect around a luminous body,
      // while two hot folds overtake one another instead of blinking beads on a line.
      float coil = angle * 2.0 + arc * 0.65 - flow * 9.0 + phase;
      float fold = 0.5 + 0.5 * ribbonWave(coil + ribbonWave(arc * 0.22 - flow * 3.0));
      hot = pow(fold, 3.0);
      body = 0.38 + 0.76 * fold;
    } else if (id < 2.5) {
      // FORK: two broad electrical lobes separated by a migrating dark seam.
      float split = cos(angle * 2.0 + ribbonWave(arc * 0.4 - flow * 7.0) * 0.6);
      float branch = smoothstep(-0.22, 0.48, split);
      hot = branch * (0.55 + 0.45 * ribbonWave(arc * 1.9 - flow * 15.0 + phase));
      body = 0.10 + branch * 0.92;
    } else if (id < 3.5) {
      // SHEET: rolled motor exhaust, a cooler underside and incandescent crest.
      float roll = 0.5 + 0.5 * ribbonWave(angle + arc * 0.48 - flow * 5.0 + phase);
      hot = roll * roll * (1.0 - along * 0.6);
      body = 0.28 + roll * 0.64;
    } else {
      // FILAMENT: restrained coherent afterimage for the accepted starter pulse.
      hot = pow(max(0.0, facing), 3.0);
      body = 0.22 + 0.48 * hot;
    }
    // Reduced flash removes modulation, not the moving material's footprint or body.
    body = mix(0.68, body, uModulation);
    float a = body * depth * vAlpha;
    if (a <= 0.003) discard;
    bool special = id > 0.5 && id < 3.5;
    // Premultiplied transmission retains darker channels when front/back surfaces overlap.
    // Compact ballistic/starter wakes remain purely additive (zero extinction alpha).
    vec3 c = special ? vColor * (0.32 + hot * 1.6) + vec3(0.7,0.85,1.0) * pow(hot,4.0) * 0.35
      : mix(vColor, vec3(1.0, 0.97, 0.92), clamp(hot, 0.0, 1.0) * (0.12 + 0.22 * edgeOn));
    a = min(a * (special ? 0.62 : 1.0), 0.88);
    gl_FragColor = vec4(c * a * uIntensity, special ? a : 0.0);
  }
`;

export class WeaponRibbonPool {
  constructor(scene, options = {}) {
    this.capacity = Math.max(1, options.capacity || WEAPON_RIBBON_CAPACITY);
    this.segments = Math.max(4, options.segments || WEAPON_RIBBON_SEGMENTS);
    this.sectionVertices = SECTION;
    const verts = this.capacity * this.segments * SECTION;
    const quads = this.capacity * (this.segments - 1) * (SECTION - 1);
    this.position = new Float32Array(verts * 3);
    this.color = new Float32Array(verts * 3);
    this.alpha = new Float32Array(verts);
    this.uv = new Float32Array(verts * 2);
    this.normal = new Float32Array(verts * 3);
    this.shape = new Float32Array(verts * 4);
    // Default pool fits Uint16; explicitly larger pools select their index width safely.
    const index = verts <= 65536 ? new Uint16Array(quads * 6) : new Uint32Array(quads * 6);
    let w = 0;
    for (let r = 0; r < this.capacity; r++) {
      const base = r * this.segments * SECTION;
      for (let s = 0; s < this.segments; s++) {
        for (let k = 0; k < SECTION; k++) {
          const v = base + s * SECTION + k;
          this.uv[v * 2] = s / (this.segments - 1);
          this.uv[v * 2 + 1] = k / (SECTION - 1);
          if (s < this.segments - 1 && k < SECTION - 1) {
            index[w++] = v; index[w++] = v + 1; index[w++] = v + SECTION;
            index[w++] = v + 1; index[w++] = v + SECTION + 1; index[w++] = v + SECTION;
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', geo.attributes.color);
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aRibNormal', new THREE.BufferAttribute(this.normal, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      // Geometry now absorbs the foreshortening, so the shader only keeps a modest residual
      // density lift for the edge-on read. Both together would over-brighten a grazing wake.
      uniforms: { uIntensity: { value: 1 }, uGrazeGain: { value: 1.35 }, uModulation: { value: 1 } },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      blending: THREE.NormalBlending,
      // Fragment output owns coverage once. Special volumes absorb between hot folds;
      // starter/ballistic profiles use zero extinction and retain additive light.
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.name = 'SF_WeaponRibbons';
    this.hist = new Float32Array(this.capacity * this.segments * 3);
    this.histLen = new Int32Array(this.capacity);
    this.width = new Float32Array(this.capacity);
    this.linger = new Float32Array(this.capacity);
    this.lingerAge = new Float32Array(this.capacity);
    this.profile = new Float32Array(this.capacity);
    this.phase = new Float32Array(this.capacity);
    this.age = new Float32Array(this.capacity);
    this.colHead = new Float32Array(this.capacity * 3);
    this.colTail = new Float32Array(this.capacity * 3);
    this.alive = new Uint8Array(this.capacity);
    this.entityIds = new Int32Array(this.capacity);
    this.entityIds.fill(-1);
    this.byEntity = new Map();
    this._cursor = 0;
    this._spawnSerial = 0;
    this.live = 0;
    this._cHead = new THREE.Color();
    this._cTail = new THREE.Color();
    // Dead slots are zeroed exactly once. Before this, every idle slot in the 256-wide pool
    // rewrote and re-uploaded its vertices on every active frame.
    this.drawSlots = new Int32Array(this.capacity);
    this.drawSlots.fill(-1);
    this._spanMin = Infinity;
    this._spanMax = -Infinity;
    this._dynamicAttributes = [
      geo.attributes.position,
      geo.attributes.color,
      geo.attributes.aAlpha,
      geo.attributes.aRibNormal,
      geo.attributes.aShape,
    ];
    this.uploadedBytesLastFrame = 0;
    this._fovDeg = CHASE_CAMERA_FOV_DEG;
    this._viewportHeight = CHASE_CAMERA_VIEWPORT_HEIGHT;
    if (scene) scene.add(this.mesh);
  }

  /** Optional exactness for the projected width floor; the chase defaults stand in otherwise. */
  setCamera(camera, viewportHeight) {
    if (camera && Number.isFinite(camera.fov)) this._fovDeg = camera.fov;
    if (Number.isFinite(viewportHeight) && viewportHeight > 0) this._viewportHeight = viewportHeight;
  }

  spawn({ entityId, x, y, z, width, colorHead, colorTail, linger, profile }) {
    let slot = -1;
    if (entityId != null && this.byEntity.has(entityId)) slot = this.byEntity.get(entityId);
    if (slot < 0) {
      for (let n = 0; n < this.capacity; n++) {
        const i = this._cursor;
        this._cursor = (this._cursor + 1) % this.capacity;
        if (!this.alive[i]) { slot = i; break; }
      }
    }
    if (slot < 0) {
      slot = this._cursor;
      this._cursor = (this._cursor + 1) % this.capacity;
    }
    const prev = this.entityIds[slot];
    if (prev >= 0 && prev !== entityId) this.byEntity.delete(prev);
    this.alive[slot] = 1;
    this.entityIds[slot] = entityId == null ? -1 : entityId;
    if (entityId != null) this.byEntity.set(entityId, slot);
    this.width[slot] = width || 0.5;
    this.linger[slot] = linger || 0.1;
    this.lingerAge[slot] = 0;
    this.phase[slot] = weaponEffectSeed(entityId == null ? ++this._spawnSerial : entityId) * Math.PI * 2;
    this.age[slot] = 0;
    this.profile[slot] = Number.isFinite(profile) ? profile : ribbonProfileForWidth(this.width[slot]);
    const ch = this._cHead.set(colorHead || '#34cfff');
    const ct = this._cTail.set(colorTail || '#5f80ff');
    const i3 = slot * 3;
    this.colHead[i3] = ch.r; this.colHead[i3 + 1] = ch.g; this.colHead[i3 + 2] = ch.b;
    this.colTail[i3] = ct.r; this.colTail[i3 + 1] = ct.g; this.colTail[i3 + 2] = ct.b;
    const hb = slot * this.segments * 3;
    for (let s = 0; s < this.segments; s++) {
      this.hist[hb + s * 3] = x;
      this.hist[hb + s * 3 + 1] = y;
      this.hist[hb + s * 3 + 2] = z;
    }
    this.histLen[slot] = 1;
    return slot;
  }

  pushHead(entityId, x, y, z) {
    const slot = this.byEntity.get(entityId);
    if (slot == null || !this.alive[slot]) return;
    this.lingerAge[slot] = 0;
    const seg = this.segments;
    const hb = slot * seg * 3;
    for (let s = seg - 1; s > 0; s--) {
      this.hist[hb + s * 3] = this.hist[hb + (s - 1) * 3];
      this.hist[hb + s * 3 + 1] = this.hist[hb + (s - 1) * 3 + 1];
      this.hist[hb + s * 3 + 2] = this.hist[hb + (s - 1) * 3 + 2];
    }
    this.hist[hb] = x;
    this.hist[hb + 1] = y;
    this.hist[hb + 2] = z;
    if (this.histLen[slot] < seg) this.histLen[slot]++;
  }

  release(entityId) {
    const slot = this.byEntity.get(entityId);
    if (slot == null) return;
    this.lingerAge[slot] = Math.max(this.lingerAge[slot], 0.0001);
  }

  update(dt, cameraPos, accessibilityProfile = null) {
    const id = accessibilityProfile && accessibilityProfile.id;
    const reducedMotion = id === 'reduced-motion' || id === 'reduced-motion-and-flash';
    const reducedFlash = id === 'reduced-flash' || id === 'reduced-motion-and-flash';
    const elapsed = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.material.uniforms.uModulation.value = reducedFlash ? 0 : 1;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      if (!reducedMotion) this.age[i] += elapsed;
      if (this.lingerAge[i] > 0) {
        this.lingerAge[i] += dt;
        if (this.lingerAge[i] >= this.linger[i]) {
          const id = this.entityIds[i];
          if (id >= 0) this.byEntity.delete(id);
          this.alive[i] = 0;
          this.entityIds[i] = -1;
        }
      }
    }
    this._writeVertices(cameraPos);
  }

  _markSlot(slot) {
    if (slot < this._spanMin) this._spanMin = slot;
    if (slot > this._spanMax) this._spanMax = slot;
  }

  _writeVertices(cameraPos) {
    const seg = this.segments;
    const pos = this.position;
    const col = this.color;
    const al = this.alpha;
    const nrm = this.normal;
    const shp = this.shape;
    const camX = cameraPos ? cameraPos.x : 0;
    const camY = cameraPos ? cameraPos.y : 12;
    const camZ = cameraPos ? cameraPos.z : 0;
    // The renderer clears updateRanges when it uploads. An untouched range list means the last
    // publication was consumed, so a fresh span starts; otherwise the span keeps accumulating
    // and a frame that was written but never drawn cannot strand a ghost wake on the GPU.
    if (this._dynamicAttributes[0].updateRanges.length === 0) {
      this._spanMin = Infinity;
      this._spanMax = -Infinity;
    }
    const previousLive = this.live;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) { this.drawSlots[i] = -1; continue; }
      // History slots stay stable for entity lookup; only GPU vertices pack into a live prefix.
      // A lone late-ring wake must not submit the geometry of 255 empty neighbours.
      const drawSlot = live++;
      this.drawSlots[i] = drawSlot;
      const vb = drawSlot * seg * SECTION;
      this._markSlot(drawSlot);
      // Termination: a released wake unravels from the head backwards, because the round that
      // was feeding it is gone. It never fades as one uniform sheet.
      const releaseT = this.lingerAge[i] > 0
        ? Math.min(1, this.lingerAge[i] / Math.max(0.001, this.linger[i]))
        : 0;
      const unravelEdge = releaseT * 1.25 - 0.25;
      const width = this.width[i];
      const profileId = this.profile[i];
      const hb = i * seg * 3;
      const i3 = i * 3;
      const hr = this.colHead[i3]; const hg = this.colHead[i3 + 1]; const hbCol = this.colHead[i3 + 2];
      const tr = this.colTail[i3]; const tg = this.colTail[i3 + 1]; const tb = this.colTail[i3 + 2];
      const usable = Math.max(2, this.histLen[i]);
      let arc = 0;
      let lastX = this.hist[hb];
      let lastY = this.hist[hb + 1];
      let lastZ = this.hist[hb + 2];
      for (let s = 0; s < seg; s++) {
        const p = hb + s * 3;
        const px = this.hist[p]; const py = this.hist[p + 1]; const pz = this.hist[p + 2];
        arc += Math.hypot(px - lastX, py - lastY, pz - lastZ);
        lastX = px; lastY = py; lastZ = pz;
        const q = hb + (s < seg - 1 ? (s + 1) * 3 : (s - 1) * 3);
        let tx = this.hist[q] - px; let ty = this.hist[q + 1] - py; let tz = this.hist[q + 2] - pz;
        if (s === seg - 1) { tx = -tx; ty = -ty; tz = -tz; }
        const tm = Math.hypot(tx, ty, tz) || 1;
        tx /= tm; ty /= tm; tz /= tm;
        let ex = camX - px; let ey = camY - py; let ez = camZ - pz;
        const dist = Math.hypot(ex, ey, ez) || 1;
        ex /= dist; ey /= dist; ez /= dist;

        // World-anchored frame; a closed section needs no camera-facing roll guard.
        let sx = -tz, sy = 0, sz = tx;
        const sm = Math.hypot(sx, sz);
        if (sm < 1e-4) { sx = 1; sz = 0; }
        else { sx /= sm; sz /= sm; }
        let nx = sy * tz - sz * ty;
        let ny = sz * tx - sx * tz;
        let nz = sx * ty - sy * tx;
        const nm = Math.hypot(nx, ny, nz) || 1;
        nx /= nm; ny /= nm; nz /= nm;

        const u = s / (seg - 1);
        const hidden = s >= usable || arc > WAKE_VISIBLE_ARC_WU;
        const taper = hidden ? 0 : (1 - u) * (1 - u * 0.35);
        const floorW = worldSizeForPixels(dist, RIBBON_MIN_PIXELS, this._fovDeg, this._viewportHeight);
        // Special energy has a body; ballistic and starter wakes keep their terse silhouettes.
        const volumeGain = profileId === RIBBON_PROFILE.BRAID ? 4.0
          : profileId === RIBBON_PROFILE.FORK ? 3.2 : profileId === RIBBON_PROFILE.SHEET ? 2.4 : 1;
        const depthRatio = profileId === RIBBON_PROFILE.SHEET ? 0.32 : 0.7;
        const hw = 0.5 * Math.max(width * volumeGain, floorW / depthRatio) * taper;
        const unravel = releaseT > 0
          ? Math.max(0, Math.min(1, (u - unravelEdge) / 0.35))
          : 1;
        const a = unravel * taper;
        const cr = hr + (tr - hr) * u;
        const cg = hg + (tg - hg) * u;
        const cb = hbCol + (tb - hbCol) * u;
        const transport = arc * 0.24 - this.age[i] * 5.0 + this.phase[i];
        const twist = profileId === RIBBON_PROFILE.BRAID ? transport
          : profileId === RIBBON_PROFILE.FORK ? Math.sin(transport) * 0.34 : 0;
        for (let k = 0; k < SECTION; k++) {
          const angle = k / (SECTION - 1) * Math.PI * 2 + twist;
          const sn = Math.sin(angle), cs = Math.cos(angle);
          const lobe = profileId === RIBBON_PROFILE.BRAID ? 1 + 0.18 * Math.cos(angle * 3 + transport)
            : profileId === RIBBON_PROFILE.FORK ? 0.7 + 0.3 * Math.abs(sn) : 1;
          const lateral = sn * hw * lobe;
          const vertical = cs * hw * depthRatio * lobe;
          const v = vb + s * SECTION + k;
          const vp = v * 3;
          pos[vp] = px + sx * lateral + nx * vertical;
          pos[vp + 1] = py + sy * lateral + ny * vertical;
          pos[vp + 2] = pz + sz * lateral + nz * vertical;
          col[vp] = cr; col[vp + 1] = cg; col[vp + 2] = cb;
          nrm[vp] = sx * sn + nx * cs / depthRatio;
          nrm[vp + 1] = sy * sn + ny * cs / depthRatio;
          nrm[vp + 2] = sz * sn + nz * cs / depthRatio;
          const sh = v * 4;
          shp[sh] = profileId; shp[sh + 1] = arc;
          shp[sh + 2] = this.phase[i]; shp[sh + 3] = this.age[i];
          al[v] = a;
        }
      }
    }
    if (live < previousLive) {
      al.fill(0, live * seg * SECTION, previousLive * seg * SECTION);
      this._markSlot(live);
      this._markSlot(previousLive - 1);
    }
    this.live = live;
    this.geometry.setDrawRange(0, live * (seg - 1) * (SECTION - 1) * 6);
    this._publish();
    this.mesh.visible = live > 0;
  }

  /** Publish only the slot span that actually changed; idle slots never reach the bus. */
  _publish() {
    if (this._spanMax < this._spanMin) {
      this.uploadedBytesLastFrame = 0;
      return;
    }
    const seg = this.segments;
    const firstVertex = this._spanMin * seg * SECTION;
    const vertexCount = (this._spanMax - this._spanMin + 1) * seg * SECTION;
    let bytes = 0;
    for (let i = 0; i < this._dynamicAttributes.length; i++) {
      const attribute = this._dynamicAttributes[i];
      const itemSize = attribute.itemSize;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(firstVertex * itemSize, vertexCount * itemSize);
      attribute.needsUpdate = true;
      bytes += vertexCount * itemSize * Float32Array.BYTES_PER_ELEMENT;
    }
    this.uploadedBytesLastFrame = bytes;
  }

  /** Bytes a full unranged publication of every dynamic attribute would have cost. */
  get fullUploadBytes() {
    let bytes = 0;
    for (let i = 0; i < this._dynamicAttributes.length; i++) {
      bytes += this._dynamicAttributes[i].array.byteLength;
    }
    return bytes;
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
