// VFX system (ARCHITECTURE §2.4, §4.4; design/specs/10). A purely-cosmetic presentation layer.
// It owns a pooled GPU particle cloud (one THREE.Points) plus a pool of additive Sprites, and is
// driven entirely by event-bus events — it NEVER writes sim state. update(frameDt) is called every
// animation frame inside renderFrame (after render.draw), so it integrates/ages pools and the new
// state is drawn on the following frame. Determinism is irrelevant here: VFX may use Math.random()
// (cosmetic, never serialized).
import * as THREE from 'three';

// Duplicate lightweight external texture loader (same as visualFactory) so VFX can use our generated fx_* and ore assets without extra modules.
// Falls back silently.
const _extTexVfx = new Map();
function getExternalTexture(path) {
  if (_extTexVfx.has(path)) return _extTexVfx.get(path);
  const tex = new THREE.TextureLoader().load(
    path,
    () => { tex.needsUpdate = true; },
    undefined,
    () => { /* silent fallback to procedural */ }
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _extTexVfx.set(path, tex);
  return tex;
}

// ---- pool caps by particle-quality setting (spec: low/med/high -> 1500/3000/4000) ----
const PARTICLE_CAP = { low: 1500, med: 3000, high: 4000 };
const SPRITE_CAP = 256;

// Sprite "kinds" — drive how a pooled sprite ages (scale/opacity curve).
const SPR_FLASH = 0;   // punch-out flash (muzzle, impact, explosion core): scale grows, opacity fades
const SPR_RING = 1;    // expanding shockwave / shield ripple ring: radius eases out, opacity fades
const SPR_PUFF = 2;    // soft drifting puff (dust, smoke): gentle grow + drift, opacity fades
const SPR_FRESNEL = 3; // shield-hit fresnel ripple: bright rim ring that snaps to size then fades

// Per-quality spawn multiplier so "punchier" effects scale with the particle budget instead of
// blindly multiplying spawns against a 1500-particle low cap (where recycle is O(cap) per spawn).
const QUALITY_BURST = { low: 0.55, med: 0.8, high: 1.0 };

// Additive blend point-shader: size attenuates with distance, color/size lerp by age, fade out.
const PARTICLE_VERT = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * (uScale / max(-mv.z, 1.0)), 1.0, 64.0);
  }
`;
const PARTICLE_FRAG = `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    float fall = 1.0 - smoothstep(0.0, 0.25, r); // soft round dot
    gl_FragColor = vec4(vColor * fall, vAlpha * fall);
  }
`;

export const vfx = {
  name: 'vfx',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._t = 0;
    this._scene = null;
    this._subs = [];

    // colour scratch objects (reused; no per-event allocation)
    this._c0 = new THREE.Color();
    this._c1 = new THREE.Color();
    this._ctmp = new THREE.Color();

    this._initPools();
    this._subscribe();
  },

  // -------------------------------------------------------------------------
  // Pool construction
  // -------------------------------------------------------------------------
  _initPools() {
    const state = this.state;
    const scene = state.render && state.render.scene;
    if (!scene) { this._scene = null; return; } // render not up yet (e.g. unit test) — degrade to no-op
    this._scene = scene;

    const q = (state.settings.video && state.settings.video.particleQuality) || 'high';
    const cap = PARTICLE_CAP[q] || PARTICLE_CAP.high;
    this._cap = cap;
    this._burst = QUALITY_BURST[q] || 1.0; // scales discrete-effect spawn counts

    // ---- GPU point cloud ----
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(cap * 3);
    const colors = new Float32Array(cap * 3);
    const sizes = new Float32Array(cap);
    const alphas = new Float32Array(cap);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 520 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      transparent: true,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // particles are world-scattered; never cull the whole cloud
    points.renderOrder = 10;
    scene.add(points);

    this._points = points;
    this._pGeo = geo;
    this._pPos = positions;
    this._pCol = colors;
    this._pSize = sizes;
    this._pAlpha = alphas;

    // per-particle CPU state (Structure-of-Arrays; index == particle slot)
    this._px = new Float32Array(cap);
    this._py = new Float32Array(cap);
    this._pz = new Float32Array(cap);
    this._vx = new Float32Array(cap);
    this._vy = new Float32Array(cap);
    this._vz = new Float32Array(cap);
    this._age = new Float32Array(cap);
    this._life = new Float32Array(cap);
    this._drag = new Float32Array(cap);
    this._size0 = new Float32Array(cap);
    this._size1 = new Float32Array(cap);
    this._cr0 = new Float32Array(cap); this._cg0 = new Float32Array(cap); this._cb0 = new Float32Array(cap);
    this._cr1 = new Float32Array(cap); this._cg1 = new Float32Array(cap); this._cb1 = new Float32Array(cap);
    this._alive = new Uint8Array(cap);
    this._head = 0;        // round-robin allocation cursor
    this._liveCount = 0;

    // ---- discrete sprite pool (flash / ring / puff / fresnel) ----
    // Two shared textures: a filled radial glow (flash/puff) and a hollow ring (shockwave/fresnel).
    const tex = makeGlowTexture();
    const ringTex = makeRingTexture();
    this._glowTex = tex;
    this._ringTex = ringTex;

    // NOTE: the generated assets/fx/*.jpg are LABELLED contact-sheet references, not usable sprite
    // strips, so VFX is driven entirely by the clean procedural glow/ring textures above.
    this._spritePool = [];
    this._spr = []; // parallel CPU state
    for (let i = 0; i < SPRITE_CAP; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.frustumCulled = false;
      s.renderOrder = 11;
      scene.add(s);
      this._spritePool.push(s);
      this._spr.push({ alive: false, kind: SPR_FLASH, age: 0, life: 1, size0: 1, size1: 1, op0: 1, op1: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, roll: 0 });
    }
    this._sHead = 0;
  },

  _subscribe() {
    const bus = this.bus;
    const add = (name, fn) => this._subs.push(bus.on(name, fn));

    add('combat:fire', (p) => this._onFire(p));
    add('projectile:hit', (p) => this._onProjectileHit(p));
    add('combat:damage', (p) => this._onDamage(p));
    add('collision', (p) => this._onCollision(p));
    add('entity:killed', (p) => this._onKilled(p));
    add('entity:destroyed', (p) => this._onDestroyed(p));
    add('player:death', (p) => this._explode({ pos: p && p.pos, radius: 12 }, true));
    add('mining:tick', (p) => this._onMiningTick(p));
    add('mining:yield', (p) => this._onMiningYield(p));
    add('ship:thrust', (p) => this._onThrust(p));
    add('ship:boostStart', (p) => this._onBoost(p, true));
    add('ship:boostStop', (p) => this._onBoost(p, false));
    add('ship:dash', (p) => this._onDash(p));                      // Phase 3 dash impulse — violet shock cone
    add('jump:start', (p) => this._onJumpStart(p));
    add('jump:arrive', (p) => this._onJumpArrive(p));
    add('pickup:collected', (p) => this._onPickup(p));
  },

  // -------------------------------------------------------------------------
  // Particle / sprite allocation
  // -------------------------------------------------------------------------
  _spawnParticle(x, z, vx, vz, life, size0, size1, c0, c1, drag, y, vy) {
    if (!this._scene) return;
    const cap = this._cap;
    // find a free slot via round-robin; if pool is full, recycle the slot at the cursor (oldest-ish)
    let i = this._head;
    let scanned = 0;
    while (this._alive[i] && scanned < cap) { i = (i + 1) % cap; scanned++; }
    this._head = (i + 1) % cap;
    if (!this._alive[i]) this._liveCount++;

    this._px[i] = x; this._py[i] = y || 0; this._pz[i] = z;
    this._vx[i] = vx; this._vy[i] = vy || 0; this._vz[i] = vz;
    this._age[i] = 0; this._life[i] = life; this._drag[i] = drag;
    this._size0[i] = size0; this._size1[i] = size1;
    this._cr0[i] = c0.r; this._cg0[i] = c0.g; this._cb0[i] = c0.b;
    this._cr1[i] = c1.r; this._cg1[i] = c1.g; this._cb1[i] = c1.b;
    this._alive[i] = 1;
  },

  _spawnSprite(kind, x, y, z, life, size0, size1, op0, op1, color, vx, vz) {
    if (!this._scene) return null;
    const n = SPRITE_CAP;
    let i = this._sHead;
    let scanned = 0;
    while (this._spr[i].alive && scanned < n) { i = (i + 1) % n; scanned++; }
    this._sHead = (i + 1) % n;

    const st = this._spr[i];
    st.alive = true; st.kind = kind; st.age = 0; st.life = life;
    st.size0 = size0; st.size1 = size1; st.op0 = op0; st.op1 = op1;
    st.x = x; st.y = y || 0; st.z = z; st.vx = vx || 0; st.vz = vz || 0;
    st.roll = Math.random() * Math.PI * 2;

    const spr = this._spritePool[i];
    // ring/fresnel kinds use the hollow ring texture; flash/puff use the filled glow. Just swap the
    // map — both textures already exist as the material's map, so no shader recompile is needed (and
    // forcing material.needsUpdate would re-run the program lookup on every swap during heavy combat).
    const wantRing = (kind === SPR_RING || kind === SPR_FRESNEL);
    // Always use the clean procedural textures. (The generated fx_explosion_small_elements.jpg is a
    // LABELLED contact-sheet reference, not a usable sprite — using it rendered "CORE FLASH / HIGH /
    // SMOKE AND SPARKS" text in every explosion. The procedural radial glow reads far better anyway.)
    const wantTex = wantRing ? this._ringTex : this._glowTex;
    if (spr.material.map !== wantTex) {
      spr.material.map = wantTex;
      spr.material.needsUpdate = true;
    }
    spr.visible = true;
    spr.material.color.set(color);
    spr.material.opacity = op0;
    spr.material.rotation = st.roll;
    spr.position.set(x, y || 0, z);
    spr.scale.setScalar(size0);
    return st;
  },

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  _factionPalette(factionId) {
    const pals = (this.state.content && this.state.content.factionPalettes) || null;
    if (pals && factionId && pals[factionId]) return pals[factionId];
    return null;
  },
  _engineColor(e) {
    const fid = (e && (e.factionId || (e.data && e.data.factionId))) || null;
    const pal = this._factionPalette(fid);
    return (pal && pal.thruster) || '#88AAFF';
  },
  _shieldColor(factionId) {
    const pal = this._factionPalette(factionId);
    return (pal && (pal.accent || pal.emissive)) || '#66ccff';
  },
  _ent(id) {
    if (id == null) return null;
    return this.state.entities.get(id) || null;
  },
  // resolve a {x,z} position from a payload, falling back to an entity transform
  _posFrom(p, entId) {
    if (p && p.pos && typeof p.pos.x === 'number') return p.pos;
    if (p && p.hitPoint && typeof p.hitPoint.x === 'number') return p.hitPoint;
    if (p && p.position && typeof p.position.x === 'number') return p.position;
    if (p && p.contactPos && typeof p.contactPos.x === 'number') return p.contactPos;
    if (p && p.fromPos && typeof p.fromPos.x === 'number') return p.fromPos;
    if (p && p.toPos && typeof p.toPos.x === 'number') return p.toPos;
    const e = this._ent(entId);
    return e ? e.pos : null;
  },

  // -------------------------------------------------------------------------
  // Event handlers (each pushes pooled visuals; no per-event allocation of GPU objects)
  // -------------------------------------------------------------------------
  _onFire(p) {
    if (!this._scene) return;
    const origin = (p.origin && typeof p.origin.x === 'number') ? p.origin : this._posFrom(p, p.ownerId);
    if (!origin) return;
    // combat:fire emits `dir` as a NUMBER (yaw radians) — both weapons.js emitters do. Older callers
    // may pass {x,z}. Resolve robustly (0 is a valid heading, so never treat dir===0 as falsy).
    const base = this._dirAngle(p.dir, p.ownerId);
    const owner = this._ent(p.ownerId);
    const col = this._engineColor(owner); // weapon colour not in payload; faction accent reads well
    const burst = this._burst || 1;
    this._c0.set('#ffffff'); this._c1.set(col);
    // muzzle flash: a hot white core punch + a coloured outer flare just ahead of the muzzle
    this._spawnSprite(SPR_FLASH, origin.x, 0, origin.z, 0.07, 2.4, 3.8, 1.0, 0.0, '#ffffff', 0, 0);
    const mx = origin.x + Math.cos(base) * 1.2, mz = origin.z + Math.sin(base) * 1.2;
    this._spawnSprite(SPR_FLASH, mx, 0, mz, 0.11, 3.6, 6.0, 0.9, 0.0, col, 0, 0);
    // spark particles ejected forward along the aim cone +/-12deg
    const n = Math.max(2, Math.round(5 * burst));
    for (let k = 0; k < n; k++) {
      const a = base + (Math.random() - 0.5) * 0.42;
      const sp = 30 + Math.random() * 30;
      this._spawnParticle(origin.x, origin.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.15, 1.6, 0.0, this._c0, this._c1, 4.0, 0, 0);
    }
  },

  // resolve a heading angle from a payload `dir` that may be a number (radians), a {x,z} vector, or
  // absent (fall back to the owner entity's rotation, else +X).
  _dirAngle(dir, ownerId) {
    if (typeof dir === 'number') return dir;
    if (dir && typeof dir.x === 'number' && typeof dir.z === 'number') return Math.atan2(dir.z, dir.x);
    const e = this._ent(ownerId);
    return e ? e.rot : 0;
  },

  _onProjectileHit(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos) return;
    const tgt = this._ent(p.targetId);
    const col = tgt ? this._engineColor(tgt) : '#ffcc66';
    this._impactSparks(pos.x, pos.z, p.pos && p.dir ? p.dir : null, col, 10);
  },

  _onDamage(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos) return;
    const tgt = this._ent(p.targetId);
    const fid = (tgt && tgt.factionId) || p.factionId || null;
    // NOTE: on combat:damage, `p.type` is the DAMAGE type (kinetic/energy/…), not a shield flag — so
    // the shield branch keys off `brokeShield` (authoritative) plus a defensive legacy `kind` alias.
    if (p.brokeShield || p.kind === 'shield') {
      // Shield-hit fresnel ripple. The spec's true fresnel bubble is a per-entity shieldBubble mesh
      // owned by visualFactory — NOT this file — so we approximate it with pooled additive sprites
      // anchored to the entity centre: a bright rim ring snapping out to the shield radius (fresnel
      // rim feel) plus an impact flash at the hit point, tinted by the faction shield colour.
      const col = this._shieldColor(fid);
      const r = (tgt && tgt.radius) || 8;
      const cx = tgt ? tgt.pos.x : pos.x, cz = tgt ? tgt.pos.z : pos.z;
      // rim ripple centred on the ship, sized to the shield bubble (radius*1.15 per spec)
      this._spawnSprite(SPR_FRESNEL, cx, 0, cz, 0.45, r * 2.0, r * 2.55, 0.9, 0.0, col, 0, 0);
      // localized flash at the actual hit point so the player reads WHERE it was struck
      this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.16, r * 0.7, r * 1.5, 0.8, 0.0, col, 0, 0);
      // a few cool sparks skittering across the shield surface
      this._c0.set('#ffffff'); this._c1.set(col);
      const sn = Math.max(2, Math.round(5 * (this._burst || 1)));
      for (let k = 0; k < sn; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 18 + Math.random() * 16;
        this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.2, 1.3, 0.0, this._c0, this._c1, 4.0, 0, 0);
      }
    } else {
      // hull impact sparks (hot-white -> faction accent)
      const col = this._engineColor(tgt);
      this._impactSparks(pos.x, pos.z, p.normal || null, col, 12);
    }
    // player hits get a small camera kick (render owns the camera; we only emit)
    if (p.isPlayer && (p.amount || 0) > 0) this.bus.emit('camera:shake', { amount: Math.min(0.35, 0.06 + (p.amount || 0) * 0.01) });
  },

  _impactSparks(x, z, dir, color, n) {
    this._c0.set('#ffffff'); this._c1.set(color);
    const base = dir ? Math.atan2(dir.z, dir.x) + Math.PI : Math.random() * Math.PI * 2; // reflect-ish
    const count = Math.max(3, Math.round(n * (this._burst || 1)));
    for (let k = 0; k < count; k++) {
      const a = base + (Math.random() - 0.5) * 1.6;
      const sp = 15 + Math.random() * 24;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.22 + Math.random() * 0.12, 1.6, 0.0, this._c0, this._c1, 3.0, 0, 0);
    }
    // hot impact flash + a quick coloured halo
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.06, 1.6, 2.6, 0.95, 0.0, '#ffffff', 0, 0);
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.12, 2.4, 4.2, 0.55, 0.0, color, 0, 0);
  },

  _onCollision(p) {
    if (!this._scene || !p.pos) return;
    // small impact spark puff on physical ram
    this._impactSparks(p.pos.x, p.pos.z, null, '#ffd0a0', 6);
  },

  _onKilled(p) { this._explode(p, true); },
  _onDestroyed(p) {
    // entity:destroyed fires for ALL entities (incl. projectiles/pickups). Only blow up things with
    // meaningful size; projectiles/pickups despawn cleanly. entity:killed already handled ships, so
    // here we cover asteroids/wrecks/drones that never emit entity:killed.
    if (!this._scene) return;
    const t = p.type;
    if (t === 'projectile' || t === 'pickup' || t === 'fx') return;
    if (t === 'ship') return; // ships handled by entity:killed (avoid double explosion)
    this._explode(p, false);
  },

  _explode(p, big) {
    if (!this._scene) return;
    const pos = this._posFrom(p, p.id);
    if (!pos) return;
    const r = Math.max(2, p.radius || 6);
    const x = pos.x, z = pos.z;
    const burst = this._burst || 1;

    // (a) MULTI-LAYER FLASH — a tiny instant white core punch, a warm mid flash, and a broad soft
    //     outer bloom-feeder. Layering different lifetimes/colours reads far punchier than one sprite.
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.08, r * 1.4, r * 3.0, 1.0, 0.0, '#ffffff', 0, 0);
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.18, r * 2.4, r * 6.0, 1.0, 0.0, '#fff2c0', 0, 0);
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.30, r * 3.0, r * 8.5, 0.7, 0.0, '#ffb060', 0, 0);
    // (c) DOUBLE SHOCKWAVE — a fast thin leading ring + a slower wider one for depth.
    this._spawnSprite(SPR_RING, x, 0, z, 0.30, r * 0.5, r * 6.0, 0.9, 0.0, '#ffffff', 0, 0);
    this._spawnSprite(SPR_RING, x, 0, z, 0.46, r * 0.8, r * 9.0, 0.7, 0.0, '#dfe8ff', 0, 0);
    // (b) embers: hot-yellow -> ember-red
    const embers = Math.max(8, Math.round((big ? 44 : 26) * burst));
    this._c0.set('#ffe08a'); this._c1.set('#802010');
    for (let k = 0; k < embers; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 50;
      const life = 0.6 + Math.random() * 0.5;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, life, 2.5, 0.0, this._c0, this._c1, 1.5, 0, 0);
    }
    // (b2) fast bright SPARKS — short-lived white-hot streaks for the initial flash-front snap
    this._c0.set('#ffffff'); this._c1.set('#ffd070');
    const sparks = Math.max(4, Math.round((big ? 18 : 10) * burst));
    for (let k = 0; k < sparks; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 90;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.18 + Math.random() * 0.12, 1.8, 0.0, this._c0, this._c1, 3.5, 0, 0);
    }
    // (d) debris chunks (slower, longer-lived bright specks tumbling out)
    this._c0.set('#c9b08a'); this._c1.set('#201810');
    const debris = Math.max(3, Math.round((big ? 10 : 6) * burst));
    for (let k = 0; k < debris; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 12 + Math.random() * 30;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 1.5, 2.0, 0.6, this._c0, this._c1, 0.6, 0, 0);
    }
    // (e) SMOKE puffs that drift and grow, lingering after the fire dies
    this._c0.set('#3a3a40'); this._c1.set('#101012');
    const puffs = Math.max(2, Math.round((big ? 5 : 3) * burst));
    for (let k = 0; k < puffs; k++) {
      this._spawnSprite(SPR_PUFF, x + (Math.random() - 0.5) * r, 0, z + (Math.random() - 0.5) * r, 0.9 + Math.random() * 0.5, r * 0.8, r * 2.4, 0.5, 0.0, '#2a2a30',
        (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }
    // Camera shake (spec: mag ~ 0.6*radius clamped, mapped to 0..1 trauma). camera:shake STACKS and
    // combat.js already emits 0.5 on a ship kill, so keep this contribution modest and tightly clamped.
    this.bus.emit('camera:shake', { amount: Math.min(big ? 0.6 : 0.45, 0.1 * r) });
  },

  _onMiningTick(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, null);
    if (!pos) return;
    const col = oreColor(p.oreType);
    // Bias ore sparks back toward the miner (player, if known) so they spray off the rock face like
    // chips coming off a grinder; fall back to an omni-spray when no miner reference is available.
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    let backA = null;
    if (player) {
      const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
      if (dx * dx + dz * dz > 1) backA = Math.atan2(dz, dx);
    }
    this._c0.set('#fff0d0'); this._c1.set(col);
    const n = Math.max(4, Math.round(8 * (this._burst || 1)));
    for (let k = 0; k < n; k++) {
      const a = backA != null ? backA + (Math.random() - 0.5) * 1.5 : Math.random() * Math.PI * 2;
      const sp = 12 + Math.random() * 20;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.28 + Math.random() * 0.1, 1.3, 0.0, this._c0, this._c1, 3.5, 0, 0);
    }
    // contact glow + drifting dust puff
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.12, 1.4, 2.6, 0.6, 0.0, col, 0, 0);
    this._spawnSprite(SPR_PUFF, pos.x, 0, pos.z, 0.4, 1.5, 3.2, 0.45, 0.0, col, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  },

  _onMiningYield(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, null);
    if (!pos) return;
    // little upward sparkle confirming ore released (the actual gem pickup is its own entity)
    const col = oreColor(p.commodityId);
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.25, 1.5, 3.0, 0.7, 0.0, col, 0, 0);
  },

  _onThrust(p) {
    // Authoritative trail is the per-frame velocity-driven emitter in update(); this handler simply
    // gives an extra burst when an explicit ship:thrust event arrives (most ships drive it per-frame).
    const e = this._ent(p && p.id);
    if (e) this._emitEngineTrail(e, (p && p.throttle != null) ? p.throttle : 1, 1 / 60);
  },

  _onBoost(p, on) {
    const e = this._ent(p && p.shipId);
    if (!e || !this._scene) return;
    if (on) {
      // Boost ignition: a bright flare behind the nozzles plus a backward afterburner streak of
      // fast white-hot particles so the kick reads instantly.
      const col = this._engineColor(e);
      const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
      const bx = e.pos.x - cf * (e.radius + 2);
      const bz = e.pos.z - sf * (e.radius + 2);
      this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.20, 4, 9, 1.0, 0.0, '#ffffff', 0, 0);
      this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.30, 6, 13, 0.7, 0.0, col, 0, 0);
      this._c0.set('#ffffff'); this._c1.set(col);
      const baseA = Math.atan2(-sf, -cf);
      const n = Math.max(6, Math.round(16 * (this._burst || 1)));
      for (let k = 0; k < n; k++) {
        const a = baseA + (Math.random() - 0.5) * 0.5;
        const sp = 60 + Math.random() * 60;
        this._spawnParticle(bx, bz, Math.cos(a) * sp, Math.sin(a) * sp, 0.3, 2.4, 0.0, this._c0, this._c1, 2.0, 0, 0);
      }
    }
  },

  // Phase 3 dash: a distinct, punchy motion kick. A forward-facing violet shock ring expands from
  // the nose (the "launch" moment) and a violet afterburner streak trails behind — color-matched to
  // the boost bar so it reads as the same energy system, but visually distinct from sustained boost.
  _onDash(p) {
    const e = this._ent(p && p.shipId);
    if (!e || !this._scene) return;
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const nx = e.pos.x + cf * (e.radius + 1);   // nose
    const nz = e.pos.z + sf * (e.radius + 1);
    const bx = e.pos.x - cf * (e.radius + 2);   // rear
    const bz = e.pos.z - sf * (e.radius + 2);
    const VIOLET = '#c98cff', VIOLET2 = '#7a3df0';
    // expanding shock ring at the nose
    this._spawnSprite(SPR_RING, nx, 0, nz, 0.32, 3.0, 11.0, 0.85, 0.0, VIOLET, cf * 6, sf * 6);
    this._spawnSprite(SPR_FLASH, nx, 0, nz, 0.16, 5, 9, 0.9, 0.0, VIOLET, 0, 0);
    // violet afterburner streak behind (longer + faster than the white boost streak)
    this._c0.set('#ffffff'); this._c1.set(VIOLET2);
    const baseA = Math.atan2(-sf, -cf);
    const n = Math.max(8, Math.round(22 * (this._burst || 1)));
    for (let k = 0; k < n; k++) {
      const a = baseA + (Math.random() - 0.5) * 0.45;
      const sp = 90 + Math.random() * 90;
      this._spawnParticle(bx, bz, Math.cos(a) * sp, Math.sin(a) * sp, 0.45, 3.0, 0.0, this._c0, this._c1, 1.6, 0, 0);
    }
    if (e.id === this.state.playerId) this.helpers.camera && this.helpers.camera.addTrauma(0.28);  // punch
  },

  _onJumpStart(p) {
    if (!this._scene) return;
    const player = this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    const pos = this._posFrom(p, this.state.playerId) || (player ? player.pos : null);
    if (!pos) return;
    this._warpStreak(pos.x, pos.z, true);
  },
  _onJumpArrive(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, this.state.playerId);
    if (!pos) return;
    this._warpStreak(pos.x, pos.z, false);
  },
  _warpStreak(x, z, outward) {
    // Radial streak burst of fast blue-white particles (elongation is faked via very fast velocity +
    // near-zero drag so each dot rakes across many pixels per frame). Two coupled rings of streaks at
    // different speeds give a tunnel-rush feel; a bright core flash punches the moment of the jump.
    this._c0.set('#dff0ff'); this._c1.set('#3050ff');
    const n = Math.max(48, Math.round(90 * (this._burst || 1)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.05;
      const sp = outward ? (170 + Math.random() * 110) : -(130 + Math.random() * 100);
      // when inward, spawn far and fly toward centre
      const r0 = outward ? (Math.random() * 6) : (180 + Math.random() * 60);
      const px = x + Math.cos(a) * r0, pz = z + Math.sin(a) * r0;
      this._spawnParticle(px, pz, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.2, 2.4, 0.0, this._c0, this._c1, 0.35, 0, 0);
    }
    // a sparser inner ring of brighter, slower streaks for layered depth
    this._c0.set('#ffffff'); this._c1.set('#5080ff');
    const m = Math.max(20, Math.round(36 * (this._burst || 1)));
    for (let k = 0; k < m; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = outward ? (90 + Math.random() * 60) : -(70 + Math.random() * 50);
      const r0 = outward ? 0 : (120 + Math.random() * 40);
      const px = x + Math.cos(a) * r0, pz = z + Math.sin(a) * r0;
      this._spawnParticle(px, pz, Math.cos(a) * sp, Math.sin(a) * sp, 0.45, 3.0, 0.0, this._c0, this._c1, 0.5, 0, 0);
    }
    // core flash + expanding portal ring
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.22, 6, 22, 0.9, 0.0, '#e8f2ff', 0, 0);
    this._spawnSprite(SPR_RING, x, 0, z, 0.5, 4, 60, 0.7, 0.0, '#bfe0ff', 0, 0);
  },

  _onPickup(p) {
    if (!this._scene || !p.pos) return;
    const col = p.kind === 'credits' ? '#ffcc44' : oreColor(p.commodityId);
    // small sparkle burst + upward fade
    this._spawnSprite(SPR_FLASH, p.pos.x, 0, p.pos.z, 0.3, 1.5, 3.2, 0.7, 0.0, col, 0, 6);
    this._c0.set('#ffffff'); this._c1.set(col);
    for (let k = 0; k < 5; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 8 + Math.random() * 12;
      this._spawnParticle(p.pos.x, p.pos.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.35, 1.2, 0.0, this._c0, this._c1, 2.5, 8, 12);
    }
  },

  // engine trail emitter — called per ship per frame from update(), throttled by accumulator
  _emitEngineTrail(e, throttle, dt) {
    if (!this._scene) return;
    const col0 = this._engineColor(e);
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const back = (e.radius || 4) * 0.85;
    const bx = e.pos.x - cf * back;
    const bz = e.pos.z - sf * back;
    const baseA = Math.atan2(-sf, -cf);
    // outer plume: faction-hot -> dark blue, wider with throttle, jittered backward
    this._c0.set(col0); this._c1.set('#10204a');
    const sp = (20 + throttle * 22);
    const a = baseA + (Math.random() - 0.5) * 0.35;
    this._spawnParticle(bx + (Math.random() - 0.5) * 1.5, bz + (Math.random() - 0.5) * 1.5,
      Math.cos(a) * sp, Math.sin(a) * sp, 0.35, 2.0 * (0.6 + throttle * 0.6), 0.0, this._c0, this._c1, 2.0, 0, 0);
    // thin white-hot inner core right at the nozzle — small, short-lived, gives the trail a bright
    // spine that bloom catches. Tighter cone, faster, less jitter.
    this._c0.set('#ffffff'); this._c1.set(col0);
    const a2 = baseA + (Math.random() - 0.5) * 0.18;
    const sp2 = 26 + throttle * 26;
    this._spawnParticle(bx, bz, Math.cos(a2) * sp2, Math.sin(a2) * sp2, 0.18, 1.3 * (0.7 + throttle * 0.5), 0.0, this._c0, this._c1, 2.5, 0, 0);
  },

  // -------------------------------------------------------------------------
  // Per-frame integration (called inside renderFrame; frameDt = wall-clock seconds)
  // -------------------------------------------------------------------------
  update(frameDt) {
    if (!this._scene) {
      // render may have come up after vfx.init (defensive) — try once to attach pools
      if (this.state.render && this.state.render.scene) { this._initPools(); this._subscribeOnce(); }
      if (!this._scene) return;
    }
    let dt = frameDt;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1; // clamp pauses/tab-switches so particles don't teleport
    this._t += dt;

    this._emitTrails(dt);
    this._integrateParticles(dt);
    this._integrateSprites(dt);
  },

  // (defensive) only used if pools attached lazily; avoids double-subscription
  _subscribeOnce() { if (!this._subs.length) this._subscribe(); },

  // per-frame engine-trail emission for every thrusting ship/drone (steady-state, pooled)
  _emitTrails(dt) {
    const state = this.state;
    this._trailAcc = (this._trailAcc || 0) + dt;
    // emit at ~60 Hz cadence (one trail particle per ship per ~16ms)
    if (this._trailAcc < 0.016) return;
    const step = this._trailAcc; this._trailAcc = 0;
    const list = state.entityList;
    const playerId = state.playerId;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || (e.type !== 'ship' && e.type !== 'drone')) continue;
      if (e.flags && e.flags.docked) continue;
      const speed = Math.hypot(e.vel.x, e.vel.z);
      const maxSp = e.maxSpeed || 120;
      // throttle proxy: how hard the ship is moving (or boosting)
      let throttle = Math.min(1, speed / Math.max(20, maxSp * 0.6));
      if (e.flags && e.flags.boosting) throttle = Math.min(1, throttle + 0.5);
      if (throttle < 0.08) continue; // idle ships emit nothing
      this._emitEngineTrail(e, throttle, step);
      void playerId;
      // Damage smoke: a wounded ship trails smoke so its state is readable at a glance (V2 §9:
      // particles are information). Two tiers — wounded (<40% hull) gets wispy grey smoke,
      // critical (<18%) adds orange embers + denser smoke. Even a stationary/idle damaged ship
      // smokes, so you can spot a limping enemy without HUD readouts.
      if (e.hullMax && e.hull < e.hullMax) {
        const frac = e.hull / e.hullMax;
        if (frac < 0.40) this._emitDamageSmoke(e, frac, step);
      }
    }
  },

  // Persistent damage smoke/ember trail for wounded ships. Severe wounds smoke harder and add hot
  // embers; the smoke lingers (low drag, long life) so it leaves a visible trail even when slow.
  // c0/c1 are the color scratch pair; we reuse this._c0/_c1 like the other emitters.
  _SMOKE_GREY: '#3a3a40',
  _SMOKE_DARK: '#18181c',
  _EMBER_HOT: '#ff7a2c',
  _EMBER_DIM: '#7a2a10',
  _emitDamageSmoke(e, frac, dt) {
    if (!this._scene) return;
    // severity 0..1: 0 at the wound threshold (40%), 1 at death's door (0%)
    const severe = Math.max(0, Math.min(1, (0.40 - frac) / 0.40));
    // emit rate scales with severity; cap so a swarm of wounded ships can't drown the pool.
    // throttle the smoke to ~every other trail tick to stay cheap, harder when critical.
    this._smokeAcc = (this._smokeAcc || 0) + dt * (0.6 + severe * 1.4);
    if (this._smokeAcc < 0.032) return;
    const n = this._smokeAcc >= 0.064 ? 2 : 1;
    this._smokeAcc = 0;

    const r = e.radius || 4;
    // emit from a few offsets around the hull center (a burning ship doesn't smoke from one point)
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    // carry slightly with the ship's motion so the trail streams behind
    const vx = -(e.vel.x || 0) * 0.15;
    const vz = -(e.vel.z || 0) * 0.15;

    for (let k = 0; k < n; k++) {
      // pick a spot on the hull: alternate rear-ish and mid-side so the smoke looks like it's
      // venting from multiple breaches, not a single exhaust.
      const off = (k === 0 ? -0.3 : 0.25) * r + (Math.random() - 0.5) * r * 0.4;
      const lat = (Math.random() - 0.5) * r * 0.7;
      const sx = e.pos.x + cf * off - sf * lat;
      const sz = e.pos.z + sf * off + cf * lat;

      // grey smoke puff: grows, drifts back, fades. Long life + low drag = a lingering trail.
      this._c0.set(this._SMOKE_GREY); this._c1.set(this._SMOKE_DARK);
      const drift = 4 + Math.random() * 6;
      const da = Math.atan2(-(e.vel.z || drift), -(e.vel.x || 0)) + (Math.random() - 0.5) * 1.2;
      this._spawnParticle(
        sx, sz,
        vx + Math.cos(da) * drift * 0.4, vz + Math.sin(da) * drift * 0.4,
        0.9 + severe * 0.6,        // life: longer when worse
        2.2 + severe * 1.5,        // size0: small
        6.0 + severe * 5.0,        // size1: billows out
        this._c0, this._c1,
        0.6,                        // drag: low, so it lingers
        1.5 + Math.random() * 2.0,  // y: rises above the deck
        3.0 + Math.random() * 2.0,  // vy: buoyant rise
      );

      // critical-only hot embers: bright orange sparks that flicker out fast — reads as "this ship
      // is about to die" without needing a health bar. Sparse so it doesn't spam the pool.
      if (severe > 0.55 && Math.random() < 0.5) {
        this._c0.set(this._EMBER_HOT); this._c1.set(this._EMBER_DIM);
        const ea = Math.random() * Math.PI * 2;
        const es = 10 + Math.random() * 16;
        this._spawnParticle(
          sx, sz,
          Math.cos(ea) * es, Math.sin(ea) * es,
          0.35, 1.0, 0.2,
          this._c0, this._c1,
          2.5, 1.0 + Math.random() * 1.5, 6.0 + Math.random() * 4.0,
        );
      }
    }
  },


  _integrateParticles(dt) {
    const cap = this._cap;
    const pos = this._pPos, col = this._pCol, size = this._pSize, alpha = this._pAlpha;
    let writeMax = 0;
    let live = 0;
    for (let i = 0; i < cap; i++) {
      if (!this._alive[i]) {
        // keep dead slots collapsed to alpha 0 (won't draw)
        alpha[i] = 0;
        continue;
      }
      let age = this._age[i] + dt;
      const life = this._life[i];
      if (age >= life) { this._alive[i] = 0; alpha[i] = 0; continue; }
      this._age[i] = age;
      const t = age / life;

      // integrate with drag
      const dr = this._drag[i];
      const damp = 1 - Math.min(1, dr * dt);
      this._vx[i] *= damp; this._vy[i] *= damp; this._vz[i] *= damp;
      this._px[i] += this._vx[i] * dt;
      this._py[i] += this._vy[i] * dt;
      this._pz[i] += this._vz[i] * dt;

      const i3 = i * 3;
      pos[i3] = this._px[i]; pos[i3 + 1] = this._py[i]; pos[i3 + 2] = this._pz[i];
      col[i3] = this._cr0[i] + (this._cr1[i] - this._cr0[i]) * t;
      col[i3 + 1] = this._cg0[i] + (this._cg1[i] - this._cg0[i]) * t;
      col[i3 + 2] = this._cb0[i] + (this._cb1[i] - this._cb0[i]) * t;
      size[i] = this._size0[i] + (this._size1[i] - this._size0[i]) * t;
      alpha[i] = 1 - t;
      if (i + 1 > writeMax) writeMax = i + 1;
      live++;
    }
    this._liveCount = live;
    this._pGeo.setDrawRange(0, writeMax);
    if (writeMax > 0) {
      this._pGeo.attributes.position.needsUpdate = true;
      this._pGeo.attributes.aColor.needsUpdate = true;
      this._pGeo.attributes.aSize.needsUpdate = true;
      this._pGeo.attributes.aAlpha.needsUpdate = true;
    }
  },

  _integrateSprites(dt) {
    const pool = this._spritePool, st = this._spr;
    for (let i = 0; i < pool.length; i++) {
      const s = st[i];
      if (!s.alive) continue;
      s.age += dt;
      const t = s.age / s.life;
      const spr = pool[i];
      if (t >= 1) { s.alive = false; spr.visible = false; spr.material.opacity = 0; continue; }
      let scale, op;
      if (s.kind === SPR_RING) {
        const e = easeOutCubic(t);
        scale = s.size0 + (s.size1 - s.size0) * e;
        op = s.op0 * (1 - t);
      } else if (s.kind === SPR_FRESNEL) {
        // shield ripple: snap out to full radius fast (rim feel), then a short bright pulse fade
        const e = easeOutCubic(Math.min(1, t * 2.2));
        scale = s.size0 + (s.size1 - s.size0) * e;
        // pulse: bright spike near impact then quadratic fade-out
        op = s.op0 * (1 - t) * (0.6 + 0.4 * Math.cos(t * Math.PI * 3));
        if (op < 0) op = 0;
      } else if (s.kind === SPR_PUFF) {
        scale = s.size0 + (s.size1 - s.size0) * t;
        op = s.op0 + (s.op1 - s.op0) * t;
        s.x += s.vx * dt; s.z += s.vz * dt;
      } else { // SPR_FLASH — quick punch
        const e = easeOutCubic(Math.min(1, t * 1.2));
        scale = s.size0 + (s.size1 - s.size0) * e;
        op = s.op0 * (1 - t * t);
      }
      s.y += 0; // sprites live on play plane
      spr.position.set(s.x, s.y, s.z);
      spr.scale.setScalar(Math.max(0.01, scale));
      spr.material.opacity = Math.max(0, op);
    }
  },
};

// ---------------------------------------------------------------------------
// pure helpers (module scope)
// ---------------------------------------------------------------------------
function dirOf(rot) { return { x: Math.cos(rot), z: Math.sin(rot) }; }
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

// ore/commodity -> tint (cosmetic; falls back to a warm amber)
function oreColor(id) {
  if (!id) return '#d8a050';
  if (id.indexOf('ice') >= 0 || id.indexOf('water') >= 0) return '#9fd8e8';
  if (id.indexOf('volatile') >= 0 || id.indexOf('gas') >= 0) return '#40d090';
  if (id.indexOf('crystal') >= 0 || id.indexOf('lumin') >= 0) return '#b060ff';
  if (id.indexOf('silica') >= 0 || id.indexOf('silicate') >= 0) return '#c8c0a8';
  if (id.indexOf('titanium') >= 0 || id.indexOf('platin') >= 0 || id.indexOf('alloy') >= 0) return '#c0c8d0';
  if (id.indexOf('copper') >= 0) return '#d08050';
  if (id.indexOf('exotic') >= 0 || id.indexOf('xenium') >= 0) return '#ff60c0';
  if (id.indexOf('iron') >= 0 || id.indexOf('ore') >= 0 || id.indexOf('metal') >= 0) return '#c08040';
  return '#d8a050';
}

// shared radial-gradient glow sprite texture (one canvas for the whole pool)
function makeGlowTexture() {
  const size = 64;
  const cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!cv) { const t = new THREE.Texture(); return t; }
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// shared hollow-ring sprite texture (shockwave / shield-fresnel rim). Bright at a mid radius, fading
// both inward and outward so an additive sprite reads as a thin glowing annulus rather than a disc.
function makeRingTexture() {
  const size = 64;
  const cv = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!cv) { const t = new THREE.Texture(); return t; }
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0.0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.04)');
  grd.addColorStop(0.78, 'rgba(255,255,255,0.95)'); // bright rim
  grd.addColorStop(0.9, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
