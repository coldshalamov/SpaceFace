// VFX NEXT — CPU ribbon substrate.
//
// The one substrate that is NOT GPU-aged, because ribbons are the exception the gpuAged trade-off
// names: a trail's shape depends on where its head has been, so it cannot be replayed from a closed
// form. Everything else in the library stays on the ballistic path precisely so this bucket can
// afford CPU time.
//
// A ribbon is a head that moves plus a fixed-length history ring. Each frame the live ribbons are
// rebuilt into ONE geometry (one draw call for all of them) as camera-facing quads between
// consecutive history samples. Width and alpha taper from head to tail, and the head can carry a
// hotter colour than the tail so the ribbon reads as an emitter dragging a cooling wake rather than
// a uniform neon rope — which is exactly the failure mode called out for Massline tension.
//
// Budget note for a future integrator: the live analogue is TRAIL_STREAK_CAP = 96 in
// src/render/vfx.js. Default capacity here is 64 ribbons x 24 segments; each ribbon is 48 verts.

import * as THREE from 'three';

const RIBBON_VERT = /* glsl */`
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3  vColor;
  varying vec2  vUv;
  void main() {
    vAlpha = aAlpha; vColor = aColor; vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3  vColor;
  varying vec2  vUv;
  uniform float uIntensity;
  void main() {
    if (vAlpha <= 0.002) discard;
    // Across-ribbon profile: a hot filament inside a softer sheath. Without this a ribbon is a flat
    // band, and a flat band plus bloom is the "translucent geometry + bloom" look we are replacing.
    float across = abs(vUv.y * 2.0 - 1.0);
    float core   = pow(max(0.0, 1.0 - across), 6.0);
    float sheath = pow(max(0.0, 1.0 - across), 1.6);
    // Sheath-dominant. An earlier balance (core * 1.35) blew every ribbon to white under additive
    // blending plus bloom, which threw away the colour that distinguishes the families.
    float a = (sheath * 0.72 + core * 0.60) * vAlpha * uIntensity;
    if (a <= 0.003) discard;
    // Only the very centre goes white. Pushing this higher makes every ribbon a white scratch and
    // throws away the head-to-tail colour ramp that distinguishes a burning fragment trail from a
    // Massline pulse from a speed streak.
    vec3 c = mix(vColor, vec3(1.0, 0.97, 0.92), core * 0.5);
    gl_FragColor = vec4(c * a, a);
  }
`;

export class RibbonSubstrate {
  constructor({ capacity = 64, segments = 24 } = {}) {
    this.capacity = capacity;
    this.segments = segments;
    const verts = capacity * segments * 2;
    const quads = capacity * (segments - 1);

    this.position = new Float32Array(verts * 3);
    this.color = new Float32Array(verts * 3);
    this.alpha = new Float32Array(verts);
    this.uv = new Float32Array(verts * 2);

    const index = new Uint32Array(quads * 6);
    let w = 0;
    for (let r = 0; r < capacity; r++) {
      const base = r * segments * 2;
      for (let s = 0; s < segments - 1; s++) {
        const a = base + s * 2;
        index[w++] = a; index[w++] = a + 1; index[w++] = a + 2;
        index[w++] = a + 1; index[w++] = a + 3; index[w++] = a + 2;
      }
    }
    for (let r = 0; r < capacity; r++) {
      for (let s = 0; s < segments; s++) {
        const i = (r * segments + s) * 2;
        const u = s / (segments - 1);
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
    });

    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.name = 'vfxnext:ribbons';

    // Per-ribbon state. Flat typed arrays rather than objects so the update loop never chases
    // pointers and never allocates.
    this.hist = new Float32Array(capacity * segments * 3);
    this.histLen = new Int32Array(capacity);
    this.head = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.cfg = new Float32Array(capacity * 6); // life, age, width, drag, priority, mode
    this.colHead = new Float32Array(capacity * 3);
    this.colTail = new Float32Array(capacity * 3);
    this.pulseTail = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this._cursor = 0;
    this._live = 0;
    this._cHead = new THREE.Color();
    this._cTail = new THREE.Color();
  }

  _claim(priority) {
    const cap = this.capacity;
    let worst = -1, worstP = priority;
    for (let n = 0; n < cap; n++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % cap;
      if (!this.alive[i]) return i;
      const p = this.cfg[i * 6 + 4];
      if (p < worstP) { worstP = p; worst = i; }
    }
    return worst;
  }

  /** Spawn a trailing ribbon. `mode` 0 = free head (debris trail, wake), 1 = pinned pulse that
   *  travels a fixed segment (Massline latch pulse) — see `setPulseSegment`, 2 = externally driven
   *  each tick by the owning family (thruster spine, Massline under load) — see `setSegment`. */
  spawn({
    x, y, z, vx = 0, vy = 0, vz = 0, life = 1, width = 0.6, drag = 0,
    colorHead = 0xffffff, colorTail = 0x3a6cff, priority = 0, mode = 0,
  }) {
    const i = this._claim(priority);
    if (i < 0) return -1;
    const i3 = i * 3;
    this.head[i3] = x; this.head[i3 + 1] = y; this.head[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    const c = i * 6;
    this.cfg[c] = life; this.cfg[c + 1] = 0; this.cfg[c + 2] = width;
    this.cfg[c + 3] = drag; this.cfg[c + 4] = priority; this.cfg[c + 5] = mode;
    const ch = this._cHead.set(colorHead), ct = this._cTail.set(colorTail);
    this.colHead[i3] = ch.r; this.colHead[i3 + 1] = ch.g; this.colHead[i3 + 2] = ch.b;
    this.colTail[i3] = ct.r; this.colTail[i3 + 1] = ct.g; this.colTail[i3 + 2] = ct.b;
    // Seed the whole history at the spawn point so a new ribbon does not flash a full-length streak
    // on its first frame — a classic trail artefact that reads as a rendering glitch.
    const hb = i * this.segments * 3;
    for (let s = 0; s < this.segments; s++) {
      this.hist[hb + s * 3] = x; this.hist[hb + s * 3 + 1] = y; this.hist[hb + s * 3 + 2] = z;
    }
    this.histLen[i] = 1;
    this.alive[i] = 1;
    return i;
  }

  /** Lay a ribbon along the segment A->B between `tailFrac` and `frac`, optionally with a lateral
   *  shiver. This is how a ribbon becomes part of a LINE rather than a free-flying particle that
   *  happens to follow one: the tether latch pulse, the loaded-line shiver and the release recoil
   *  are all this call with different parameters.
   *
   *  `shiver` is peak lateral displacement in world units; keep it small. A Massline under load
   *  should read as a tight line disturbed by force, and a large amplitude here is precisely how
   *  it turns into the giant neon rope the brief rules out. */
  setSegment(i, ax, ay, az, bx, by, bz, frac, tailFrac, shiver = 0, freq = 6, phase = 0) {
    if (i < 0 || !this.alive[i]) return;
    const seg = this.segments;
    const hb = i * seg * 3;
    let lx = bx - ax, ly = by - ay, lz = bz - az;
    const lm = Math.hypot(lx, ly, lz) || 1;
    lx /= lm; ly /= lm; lz /= lm;
    // Any perpendicular will do for the shiver plane; stability matters more than which one.
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(ly) > 0.9) { ux = 1; uy = 0; uz = 0; }
    let sx = ly * uz - lz * uy, sy = lz * ux - lx * uz, sz = lx * uy - ly * ux;
    const sm = Math.hypot(sx, sy, sz) || 1;
    sx /= sm; sy /= sm; sz /= sm;

    for (let s = 0; s < seg; s++) {
      const u = frac - (frac - tailFrac) * (s / (seg - 1));
      const k = Math.max(0, Math.min(1, u));
      // Displacement is zero at both anchors and peaks mid-span — a real loaded line, not a wave
      // that detaches from its endpoints.
      const envelope = shiver === 0 ? 0 : Math.sin(k * Math.PI) * shiver;
      const d = envelope * Math.sin(k * freq * Math.PI * 2 + phase);
      this.hist[hb + s * 3] = ax + (bx - ax) * k + sx * d;
      this.hist[hb + s * 3 + 1] = ay + (by - ay) * k + sy * d;
      this.hist[hb + s * 3 + 2] = az + (bz - az) * k + sz * d;
    }
    this.histLen[i] = seg;
  }

  /** Mode 1 ribbon: a pulse that walks A->B on its own over its lifetime. Reusing `head` as A and
   *  `vel` as B keeps the per-ribbon state flat — no extra arrays, no per-spawn object. */
  setPulseSegment(i, ax, ay, az, bx, by, bz, tailLength = 0.22) {
    if (i < 0 || !this.alive[i]) return;
    const i3 = i * 3;
    this.head[i3] = ax; this.head[i3 + 1] = ay; this.head[i3 + 2] = az;
    this.vel[i3] = bx; this.vel[i3 + 1] = by; this.vel[i3 + 2] = bz;
    this.cfg[i * 6 + 5] = 1;
    this.pulseTail[i] = tailLength;
  }

  update(dt, cameraPos) {
    const seg = this.segments;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const c = i * 6;
      this.cfg[c + 1] += dt;
      if (this.cfg[c + 1] >= this.cfg[c]) { this.alive[i] = 0; continue; }
      live++;

      const mode = this.cfg[c + 5];
      if (mode < 0.5) {
        const i3 = i * 3;
        const k = this.cfg[c + 3];
        const decay = k > 1e-4 ? Math.exp(-k * dt) : 1;
        this.head[i3] += this.vel[i3] * dt;
        this.head[i3 + 1] += this.vel[i3 + 1] * dt;
        this.head[i3 + 2] += this.vel[i3 + 2] * dt;
        this.vel[i3] *= decay; this.vel[i3 + 1] *= decay; this.vel[i3 + 2] *= decay;

        // Shift the history ring by one and push the new head. A straight copy is fine at these
        // sizes and keeps the buffer contiguous for the vertex write below.
        const hb = i * seg * 3;
        for (let s = seg - 1; s > 0; s--) {
          this.hist[hb + s * 3] = this.hist[hb + (s - 1) * 3];
          this.hist[hb + s * 3 + 1] = this.hist[hb + (s - 1) * 3 + 1];
          this.hist[hb + s * 3 + 2] = this.hist[hb + (s - 1) * 3 + 2];
        }
        this.hist[hb] = this.head[i3];
        this.hist[hb + 1] = this.head[i3 + 1];
        this.hist[hb + 2] = this.head[i3 + 2];
        if (this.histLen[i] < seg) this.histLen[i]++;
      } else if (mode < 1.5) {
        // Mode 1: walk the pulse along its stored A->B segment. Ease-out so the pulse arrives
        // decisively rather than crawling to a stop — a latch should land, not fade in.
        const i3 = i * 3;
        const u = this.cfg[c + 1] / this.cfg[c];
        const frac = 1 - (1 - u) * (1 - u);
        const tail = this.pulseTail[i];
        this.setSegment(
          i,
          this.head[i3], this.head[i3 + 1], this.head[i3 + 2],
          this.vel[i3], this.vel[i3 + 1], this.vel[i3 + 2],
          frac, frac - tail,
        );
      }
      // Mode 2 is externally driven: the owning family calls setSegment every tick (thruster spine,
      // Massline under load). Integrating it here would fight the owner and produce a ribbon that
      // drifts away from the thing it is supposed to be attached to.
    }
    this._live = live;
    this._writeVertices(cameraPos);
  }

  _writeVertices(cameraPos) {
    const seg = this.segments;
    const pos = this.position, col = this.color, al = this.alpha;
    const camX = cameraPos && Number.isFinite(cameraPos.x) ? cameraPos.x : 0;
    const camY = cameraPos && Number.isFinite(cameraPos.y) ? cameraPos.y : 12;
    const camZ = cameraPos && Number.isFinite(cameraPos.z) ? cameraPos.z : 0;

    for (let i = 0; i < this.capacity; i++) {
      const vb = i * seg * 2;
      if (!this.alive[i]) {
        // Collapse dead ribbons rather than skipping: leftover vertices would draw stale geometry.
        for (let s = 0; s < seg * 2; s++) al[vb + s] = 0;
        continue;
      }
      const c = i * 6;
      const lifeFrac = 1 - this.cfg[c + 1] / this.cfg[c];
      const width = this.cfg[c + 2];
      const hb = i * seg * 3;
      const i3 = i * 3;
      const hr = this.colHead[i3], hg = this.colHead[i3 + 1], hbl = this.colHead[i3 + 2];
      const tr = this.colTail[i3], tg = this.colTail[i3 + 1], tb = this.colTail[i3 + 2];

      for (let s = 0; s < seg; s++) {
        const p = hb + s * 3;
        const px = this.hist[p], py = this.hist[p + 1], pz = this.hist[p + 2];
        // Tangent from the neighbouring sample; clamp at the ends.
        const q = hb + (s < seg - 1 ? (s + 1) * 3 : (s - 1) * 3);
        let tx = this.hist[q] - px, ty = this.hist[q + 1] - py, tz = this.hist[q + 2] - pz;
        if (s === seg - 1) { tx = -tx; ty = -ty; tz = -tz; }
        const tm = Math.hypot(tx, ty, tz) || 1;
        tx /= tm; ty /= tm; tz /= tm;
        // View vector -> camera-facing side vector.
        let ex = camX - px, ey = camY - py, ez = camZ - pz;
        const em = Math.hypot(ex, ey, ez) || 1;
        ex /= em; ey /= em; ez /= em;
        let sx = ty * ez - tz * ey, sy = tz * ex - tx * ez, sz = tx * ey - ty * ex;
        const sm = Math.hypot(sx, sy, sz) || 1;
        sx /= sm; sy /= sm; sz /= sm;

        const u = s / (seg - 1);
        const taper = (1 - u) * (1 - u * 0.35);
        const hw = width * taper * 0.5;
        const a = lifeFrac * taper;
        const mixT = u;
        const cr = hr + (tr - hr) * mixT, cg = hg + (tg - hg) * mixT, cb = hbl + (tb - hbl) * mixT;

        const v0 = (vb + s * 2) * 3, v1 = v0 + 3;
        pos[v0] = px - sx * hw; pos[v0 + 1] = py - sy * hw; pos[v0 + 2] = pz - sz * hw;
        pos[v1] = px + sx * hw; pos[v1 + 1] = py + sy * hw; pos[v1 + 2] = pz + sz * hw;
        col[v0] = cr; col[v0 + 1] = cg; col[v0 + 2] = cb;
        col[v1] = cr; col[v1 + 1] = cg; col[v1 + 2] = cb;
        al[vb + s * 2] = a; al[vb + s * 2 + 1] = a;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }

  get live() { return this._live; }

  clear() { this.alive.fill(0); this.alpha.fill(0); this._live = 0; }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
