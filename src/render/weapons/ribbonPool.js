import * as THREE from 'three';

export const WEAPON_RIBBON_CAPACITY = 256;
export const WEAPON_RIBBON_SEGMENTS = 24;

const RIBBON_VERT = /* glsl */`
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  varying vec2 vUv;
  uniform float uIntensity;
  void main() {
    if (vAlpha <= 0.002) discard;
    float across = abs(vUv.y * 2.0 - 1.0);
    float core = pow(max(0.0, 1.0 - across), 6.0);
    float sheath = pow(max(0.0, 1.0 - across), 1.6);
    float a = (sheath * 0.72 + core * 0.55) * vAlpha * uIntensity;
    if (a <= 0.003) discard;
    vec3 c = mix(vColor, vec3(1.0, 0.97, 0.92), core * 0.12);
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
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 1 } },
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
    this.colHead = new Float32Array(this.capacity * 3);
    this.colTail = new Float32Array(this.capacity * 3);
    this.alive = new Uint8Array(this.capacity);
    this.entityIds = new Int32Array(this.capacity);
    this.entityIds.fill(-1);
    this.byEntity = new Map();
    this._cursor = 0;
    this.live = 0;
    this._cHead = new THREE.Color();
    this._cTail = new THREE.Color();
    if (scene) scene.add(this.mesh);
  }

  spawn({ entityId, x, y, z, width, colorHead, colorTail, linger }) {
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

  update(dt, cameraPos) {
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
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

  _writeVertices(cameraPos) {
    const seg = this.segments;
    const pos = this.position;
    const col = this.color;
    const al = this.alpha;
    const camX = cameraPos ? cameraPos.x : 0;
    const camY = cameraPos ? cameraPos.y : 12;
    const camZ = cameraPos ? cameraPos.z : 0;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const vb = i * seg * 2;
      if (!this.alive[i]) {
        for (let s = 0; s < seg * 2; s++) al[vb + s] = 0;
        continue;
      }
      live++;
      const lingerFade = this.lingerAge[i] > 0
        ? Math.max(0, 1 - this.lingerAge[i] / Math.max(0.001, this.linger[i]))
        : 1;
      const width = this.width[i];
      const hb = i * seg * 3;
      const i3 = i * 3;
      const hr = this.colHead[i3]; const hg = this.colHead[i3 + 1]; const hbCol = this.colHead[i3 + 2];
      const tr = this.colTail[i3]; const tg = this.colTail[i3 + 1]; const tb = this.colTail[i3 + 2];
      const usable = Math.max(2, this.histLen[i]);
      for (let s = 0; s < seg; s++) {
        const p = hb + s * 3;
        const px = this.hist[p]; const py = this.hist[p + 1]; const pz = this.hist[p + 2];
        const q = hb + (s < seg - 1 ? (s + 1) * 3 : (s - 1) * 3);
        let tx = this.hist[q] - px; let ty = this.hist[q + 1] - py; let tz = this.hist[q + 2] - pz;
        if (s === seg - 1) { tx = -tx; ty = -ty; tz = -tz; }
        const tm = Math.hypot(tx, ty, tz) || 1;
        tx /= tm; ty /= tm; tz /= tm;
        let ex = camX - px; let ey = camY - py; let ez = camZ - pz;
        const em = Math.hypot(ex, ey, ez) || 1;
        ex /= em; ey /= em; ez /= em;
        let sx = ty * ez - tz * ey; let sy = tz * ex - tx * ez; let sz = tx * ey - ty * ex;
        const sm = Math.hypot(sx, sy, sz) || 1;
        sx /= sm; sy /= sm; sz /= sm;
        const u = s / (seg - 1);
        const hidden = s >= usable;
        const taper = hidden ? 0 : (1 - u) * (1 - u * 0.35);
        const hw = width * taper * 0.5;
        const a = lingerFade * taper;
        const cr = hr + (tr - hr) * u;
        const cg = hg + (tg - hg) * u;
        const cb = hbCol + (tb - hbCol) * u;
        const v0 = (vb + s * 2) * 3;
        const v1 = v0 + 3;
        pos[v0] = px - sx * hw; pos[v0 + 1] = py - sy * hw; pos[v0 + 2] = pz - sz * hw;
        pos[v1] = px + sx * hw; pos[v1 + 1] = py + sy * hw; pos[v1 + 2] = pz + sz * hw;
        col[v0] = cr; col[v0 + 1] = cg; col[v0 + 2] = cb;
        col[v1] = cr; col[v1 + 1] = cg; col[v1 + 2] = cb;
        al[vb + s * 2] = a; al[vb + s * 2 + 1] = a;
      }
    }
    this.live = live;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.mesh.visible = live > 0;
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
