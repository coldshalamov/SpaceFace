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
const RIBBON_MIN_FACING = 0.25;

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

  void main() {
    if (vAlpha <= 0.002) discard;
    float across = abs(vUv.y * 2.0 - 1.0);
    float along = vUv.x;
    float id = vShape.x;
    // World arc length, not a clock: the internal structure is pinned to the path the round
    // actually flew and does not stretch when the wake grows. The material may convect inside
    // that history, but never moves its recorded centreline or advances during pause.
    float arc = vShape.y;
    float phase = vShape.z;
    float age = vShape.w;
    float flow = age * (0.88 + 0.24 * fract(phase * 4.19));

    // A wake is a sheet of real material. Edge-on, the eye looks through more of it and it
    // condenses into a hard filament; face-on it opens out. That view term is what separates a
    // sheet from a flat card (B7) and from a camera-facing billboard (B2).
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
    float depth = clamp(1.0 / max(facing, 0.16), 1.0, uGrazeGain);
    float edgeOn = smoothstep(0.62, 0.08, facing);

    float body = 0.0;
    float hot = 0.0;

    if (id < 0.5) {
      // CORD — machined impulse. Needle core, hard lateral cutoff, shock beads pinned to arc.
      float beads = 0.82 + uModulation * 0.18 * sin(arc * 2.6 - flow * 38.0 + phase);
      float core = pow(max(0.0, 1.0 - across), 13.0);
      float jacket = 1.0 - smoothstep(0.24, 0.52, across);
      body = (core * 1.20 + jacket * 0.32) * beads;
      hot = core;
    } else if (id < 1.5) {
      // BRAID — transported plasma. Two counter-wound convection lobes cross down the wake.
      float wind = sin(arc * 0.85 - flow * 6.0 + phase);
      float lobeA = exp(-pow((across - (0.30 + 0.34 * wind)) / 0.29, 2.0));
      float lobeB = exp(-pow((across - (0.30 - 0.34 * wind)) / 0.29, 2.0));
      float skin = 1.0 - smoothstep(0.72, 1.0, across);
      float convection = 0.90 + uModulation * 0.10 * sin(arc * 1.7 - flow * 9.0 + phase * 2.1);
      body = ((lobeA + lobeB) * 0.60 + 0.14) * skin * convection;
      hot = max(lobeA, lobeB) * 0.75;
    } else if (id < 2.5) {
      // FORK — induced current. Two conductors with real open air between them. Both branches
      // start at the round and die together at the tail; neither is left dangling.
      float split = 0.50 + 0.16 * sin(arc * 1.9 - flow * 10.0 + phase);
      float branch = exp(-pow((across - split) / 0.14, 2.0));
      float root = (1.0 - smoothstep(0.0, 0.22, along)) * pow(max(0.0, 1.0 - across), 5.0);
      float current = 0.90 + uModulation * 0.10 * sin(arc * 4.1 - flow * 24.0 + phase);
      body = (branch * 1.30 + root * 0.60) * current;
      hot = branch;
      // The gap is a silhouette feature, not a pale stripe painted over a solid body.
      if (body < 0.055) discard;
    } else if (id < 3.5) {
      // SHEET — staged motor. Twin vapour banks around a dark, unlit exhaust channel.
      float curl = sin(arc * 0.72 - flow * 3.6 + phase) * 0.07;
      float bank = smoothstep(0.12 + curl, 0.44 + curl, across) * (1.0 - smoothstep(0.70, 1.0, across));
      float channel = 1.0 - smoothstep(0.0, 0.20, across);
      float exhaust = 0.91 + uModulation * 0.09 * sin(arc * 1.4 - flow * 5.0 + phase);
      body = bank * exhaust + channel * 0.08;
      hot = bank * smoothstep(0.38, 0.0, along);
      if (body < 0.05) discard;
    } else {
      // FILAMENT — coherent afterimage. Narrow, clean, no combustion detail at all.
      float core = pow(max(0.0, 1.0 - across), 7.0);
      float halo = 1.0 - smoothstep(0.38, 0.90, across);
      body = core * 1.05 + halo * 0.20;
      hot = core;
    }

    float a = body * depth * vAlpha * uIntensity;
    if (a <= 0.003) discard;
    vec3 c = mix(vColor, vec3(1.0, 0.97, 0.92), clamp(hot, 0.0, 1.0) * (0.12 + 0.22 * edgeOn));
    gl_FragColor = vec4(c * a, a);
  }
`;

export class WeaponRibbonPool {
  constructor(scene, options = {}) {
    this.capacity = Math.max(1, options.capacity || WEAPON_RIBBON_CAPACITY);
    this.segments = Math.max(4, options.segments || WEAPON_RIBBON_SEGMENTS);
    const verts = this.capacity * this.segments * 2;
    const quads = this.capacity * (this.segments - 1);
    this.position = new Float32Array(verts * 3);
    this.color = new Float32Array(verts * 3);
    this.alpha = new Float32Array(verts);
    this.uv = new Float32Array(verts * 2);
    this.normal = new Float32Array(verts * 3);
    this.shape = new Float32Array(verts * 4);
    // The largest generated vertex index is 12,287 (256 ribbons × 24
    // segments × 2 vertices), so WebGL1-compatible uint16 indices are enough.
    const index = new Uint16Array(quads * 6);
    let w = 0;
    for (let r = 0; r < this.capacity; r++) {
      const base = r * this.segments * 2;
      for (let s = 0; s < this.segments - 1; s++) {
        const a = base + s * 2;
        index[w++] = a; index[w++] = a + 1; index[w++] = a + 2;
        index[w++] = a + 1; index[w++] = a + 3; index[w++] = a + 2;
      }
    }
    for (let r = 0; r < this.capacity; r++) {
      for (let s = 0; s < this.segments; s++) {
        const i = (r * this.segments + s) * 2;
        const u = s / (this.segments - 1);
        this.uv[i * 2] = u; this.uv[i * 2 + 1] = 0;
        this.uv[i * 2 + 2] = u; this.uv[i * 2 + 3] = 1;
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
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      // Geometry now absorbs the foreshortening, so the shader only keeps a modest residual
      // density lift for the edge-on read. Both together would over-brighten a grazing wake.
      uniforms: { uIntensity: { value: 1 }, uGrazeGain: { value: 1.35 }, uModulation: { value: 1 } },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
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
    this._cleared = new Uint8Array(this.capacity);
    this._cleared.fill(1);
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
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const vb = i * seg * 2;
      if (!this.alive[i]) {
        if (this._cleared[i]) continue;
        for (let s = 0; s < seg * 2; s++) al[vb + s] = 0;
        this._cleared[i] = 1;
        this._markSlot(i);
        continue;
      }
      live++;
      this._cleared[i] = 0;
      this._markSlot(i);
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

        // The sheet is anchored to the world, laid in the plane the round is flying through,
        // and carries its own normal. It is NOT rebuilt to face the camera every frame; it only
        // rolls toward the view when the world-anchored plane would otherwise collapse to a line.
        let wx = -tz; let wy = 0; let wz = tx;
        let wm = Math.hypot(wx, wy, wz);
        if (wm < 1e-4) { wx = 1; wy = 0; wz = 0; wm = 1; }
        wx /= wm; wy /= wm; wz /= wm;
        let pnx = wy * tz - wz * ty;
        let pny = wz * tx - wx * tz;
        let pnz = wx * ty - wy * tx;
        const pnm = Math.hypot(pnx, pny, pnz) || 1;
        pnx /= pnm; pny /= pnm; pnz /= pnm;
        const planarFacing = Math.abs(pnx * ex + pny * ey + pnz * ez);
        const roll = planarFacing >= 0.42 ? 0 : planarFacing <= 0.12 ? 1
          : (() => { const k = (0.42 - planarFacing) / 0.30; return k * k * (3 - 2 * k); })();
        let sx = wx; let sy = wy; let sz = wz;
        if (roll > 0) {
          let vx = ty * ez - tz * ey; let vy = tz * ex - tx * ez; let vz = tx * ey - ty * ex;
          const vm = Math.hypot(vx, vy, vz) || 1;
          vx /= vm; vy /= vm; vz /= vm;
          if (vx * wx + vy * wy + vz * wz < 0) { vx = -vx; vy = -vy; vz = -vz; }
          sx = wx + (vx - wx) * roll;
          sy = wy + (vy - wy) * roll;
          sz = wz + (vz - wz) * roll;
          const sm = Math.hypot(sx, sy, sz) || 1;
          sx /= sm; sy /= sm; sz /= sm;
        }
        let nx = sy * tz - sz * ty;
        let ny = sz * tx - sx * tz;
        let nz = sx * ty - sy * tx;
        const nm = Math.hypot(nx, ny, nz) || 1;
        nx /= nm; ny /= nm; nz /= nm;

        const u = s / (seg - 1);
        const hidden = s >= usable || arc > WAKE_VISIBLE_ARC_WU;
        const taper = hidden ? 0 : (1 - u) * (1 - u * 0.35);
        // Projected pixel floor: a world-anchored sheet foreshortens, so the floor is measured
        // on the sheet as the camera sees it. Without this a 0.12 WU rail wake is subpixel.
        const facing = Math.max(RIBBON_MIN_FACING, Math.abs(nx * ex + ny * ey + nz * ez));
        const floorW = worldSizeForPixels(dist, RIBBON_MIN_PIXELS, this._fovDeg, this._viewportHeight);
        // A world-anchored sheet foreshortens, so its world width is opened by exactly that
        // factor. Every family therefore keeps the APPARENT width it was authored with - no wake
        // got thinner in exchange for becoming a real sheet - and the thin ballistic threads gain
        // a floor so a 0.12 WU rail wake can no longer fall under one pixel.
        const hw = 0.5 * (Math.max(width, floorW) / facing) * taper;
        const unravel = releaseT > 0
          ? Math.max(0, Math.min(1, (u - unravelEdge) / 0.35))
          : 1;
        const a = unravel * taper;
        const cr = hr + (tr - hr) * u;
        const cg = hg + (tg - hg) * u;
        const cb = hbCol + (tb - hbCol) * u;
        const v0 = (vb + s * 2) * 3;
        const v1 = v0 + 3;
        pos[v0] = px - sx * hw; pos[v0 + 1] = py - sy * hw; pos[v0 + 2] = pz - sz * hw;
        pos[v1] = px + sx * hw; pos[v1 + 1] = py + sy * hw; pos[v1 + 2] = pz + sz * hw;
        col[v0] = cr; col[v0 + 1] = cg; col[v0 + 2] = cb;
        col[v1] = cr; col[v1 + 1] = cg; col[v1 + 2] = cb;
        nrm[v0] = nx; nrm[v0 + 1] = ny; nrm[v0 + 2] = nz;
        nrm[v1] = nx; nrm[v1 + 1] = ny; nrm[v1 + 2] = nz;
        const sh = (vb + s * 2) * 4;
        shp[sh] = profileId; shp[sh + 1] = arc;
        shp[sh + 2] = this.phase[i]; shp[sh + 3] = this.age[i];
        shp[sh + 4] = profileId; shp[sh + 5] = arc;
        shp[sh + 6] = this.phase[i]; shp[sh + 7] = this.age[i];
        al[vb + s * 2] = a; al[vb + s * 2 + 1] = a;
      }
    }
    this.live = live;
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
    const firstVertex = this._spanMin * seg * 2;
    const vertexCount = (this._spanMax - this._spanMin + 1) * seg * 2;
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
