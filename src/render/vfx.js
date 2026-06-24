// VFX system (ARCHITECTURE §2.4, §4.4; design/specs/10). A purely-cosmetic presentation layer.
// It owns a pooled GPU particle cloud (one THREE.Points) plus a pool of additive Sprites, and is
// driven entirely by event-bus events — it NEVER writes sim state. update(frameDt) is called every
// animation frame inside renderFrame (after render.draw), so it integrates/ages pools and the new
// state is drawn on the following frame. Determinism is irrelevant here: VFX may use Math.random()
// (cosmetic, never serialized).
import * as THREE from 'three';
import { createEnergyVolume, createMasslineRibbonMaterial, updateEnergyMaterial } from './energy/energyMaterials.js';

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
const PARTICLE_CAP = { low: 1500, med: 3000, medium: 3000, high: 4000 };
const SPRITE_CAP = 256;

// Sprite "kinds" — drive how a pooled sprite ages (scale/opacity curve).
const SPR_FLASH = 0;   // punch-out flash (muzzle, impact, explosion core): scale grows, opacity fades
const SPR_RING = 1;    // expanding shockwave / shield ripple ring: radius eases out, opacity fades
const SPR_PUFF = 2;    // soft drifting puff (dust, smoke): gentle grow + drift, opacity fades
const SPR_FRESNEL = 3; // shield-hit fresnel ripple: bright rim ring that snaps to size then fades

// Per-quality spawn multiplier so "punchier" effects scale with the particle budget instead of
// blindly multiplying spawns against a 1500-particle low cap (where recycle is O(cap) per spawn).
const QUALITY_BURST = { low: 0.55, med: 0.8, medium: 0.8, high: 1.0 };

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
    this._trailCandidates = [];
    this._ribbonCandidates = [];
    this._trailCacheDirty = true;
    this._trailListRef = null;
    this._trailListLength = -1;
    this._socketScratch = { x: 0, z: 0 };
    this._liveSpriteCount = 0;
    this._activeLightCount = 0;
    this._presentationCueCount = 0;
    this._presentationParticleCount = 0;
    this._presentationLightCount = 0;
    this._lastPresentationCue = null;

    // colour scratch objects (reused; no per-event allocation)
    this._c0 = new THREE.Color();
    this._c1 = new THREE.Color();
    this._ctmp = new THREE.Color();

    this._initPools();
    this._subscribe();
  },

  inspect() {
    const last = this._lastPresentationCue ? { ...this._lastPresentationCue } : null;
    return {
      schema: 'spaceface.vfxInspect.v1',
      sceneAttached: !!this._scene,
      particleCap: this._cap || 0,
      liveParticles: this._liveCount || 0,
      liveSprites: this._liveSpriteCount || 0,
      activeLights: this._activeLightCount || 0,
      presentation: {
        applied: this._presentationCueCount || 0,
        particlesSpawned: this._presentationParticleCount || 0,
        lightsActivated: this._presentationLightCount || 0,
        last,
      },
    };
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

    this._initEventLights();
    this._initRibbonTrails();
    this._initMiningBeam();
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
    this._pDrawMax = 0;
    this._activeParticles = new Int32Array(cap);
    this._activeParticlePos = new Int32Array(cap);
    this._activeParticlePos.fill(-1);
    this._freeParticles = new Int32Array(cap);
    for (let i = 0; i < cap; i++) this._freeParticles[i] = cap - 1 - i;
    this._freeParticleCount = cap;

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
      const glowMaterial = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, opacity: 0 });
      const ringMaterial = new THREE.SpriteMaterial({ map: ringTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, transparent: true, opacity: 0 });
      const s = new THREE.Sprite(glowMaterial);
      s.userData.glowMaterial = glowMaterial;
      s.userData.ringMaterial = ringMaterial;
      s.visible = false;
      s.frustumCulled = false;
      s.renderOrder = 11;
      scene.add(s);
      this._spritePool.push(s);
      this._spr.push({ alive: false, kind: SPR_FLASH, age: 0, life: 1, size0: 1, size1: 1, op0: 1, op1: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0, roll: 0 });
    }
    this._sHead = 0;
    this._activeSprites = new Int32Array(SPRITE_CAP);
    this._activeSpritePos = new Int32Array(SPRITE_CAP);
    this._activeSpritePos.fill(-1);
    this._freeSprites = new Int32Array(SPRITE_CAP);
    for (let i = 0; i < SPRITE_CAP; i++) this._freeSprites[i] = SPRITE_CAP - 1 - i;
    this._freeSpriteCount = SPRITE_CAP;
    this._liveSpriteCount = 0;
  },

  _subscribe() {
    const bus = this.bus;
    const add = (name, fn) => this._subs.push(bus.on(name, fn));

    add('combat:fire', (p) => this._onFire(p));
    add('projectile:hit', (p) => this._onProjectileHit(p));
    add('combat:damage', (p) => this._onDamage(p));
    add('collision', (p) => this._onCollision(p));
    add('entity:killed', (p) => { this._markEntityCacheDirty(); this._onKilled(p); });
    add('entity:destroyed', (p) => { this._markEntityCacheDirtyIfTrailType(p); this._onDestroyed(p); });
    add('entity:spawned', (p) => this._markEntityCacheDirtyIfTrailType(p));
    add('ship:appearanceChanged', (p) => { this._invalidateTrailSocket(p && p.id); this._markEntityCacheDirty(); });
    add('sector:enter', () => this._markEntityCacheDirty());
    add('save:loaded', () => this._markEntityCacheDirty());
    add('player:death', (p) => this._explode({ pos: p && p.pos, radius: 12 }, true));
    add('mining:start', (p) => this._onMiningStart(p));
    add('mining:stop', () => this._onMiningStop());
    add('mining:tick', (p) => this._onMiningTick(p));
    add('mining:yield', (p) => this._onMiningYield(p));
    add('ship:thrust', (p) => this._onThrust(p));
    add('ship:boostStart', (p) => this._onBoost(p, true));
    add('ship:boostStop', (p) => this._onBoost(p, false));
    add('ship:dash', (p) => this._onDash(p));                      // Phase 3 dash impulse — violet shock cone
    add('presentation:vfxCue', (p) => this._onPresentationCue(p));
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
    // Prefer an O(1) free stack. Only when every slot is live do we recycle at the cursor.
    let i;
    if (this._freeParticleCount > 0) i = this._freeParticles[--this._freeParticleCount];
    else i = this._head;
    this._head = (i + 1) % cap;
    if (!this._alive[i]) this._activateParticle(i);

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
    let i;
    if (this._freeSpriteCount > 0) i = this._freeSprites[--this._freeSpriteCount];
    else i = this._sHead;
    this._sHead = (i + 1) % n;

    const st = this._spr[i];
    const wasAlive = st.alive;
    st.alive = true; st.kind = kind; st.age = 0; st.life = life;
    st.size0 = size0; st.size1 = size1; st.op0 = op0; st.op1 = op1;
    st.x = x; st.y = y || 0; st.z = z; st.vx = vx || 0; st.vz = vz || 0;
    st.roll = Math.random() * Math.PI * 2;

    const spr = this._spritePool[i];
    // Ring/fresnel kinds use the hollow ring texture; flash/puff use the filled glow. Each slot owns
    // both stable material variants, so kind changes do not mutate maps or force material updates.
    const wantRing = (kind === SPR_RING || kind === SPR_FRESNEL);
    // Always use the clean procedural textures. (The generated fx_explosion_small_elements.jpg is a
    // LABELLED contact-sheet reference, not a usable sprite — using it rendered "CORE FLASH / HIGH /
    // SMOKE AND SPARKS" text in every explosion. The procedural radial glow reads far better anyway.)
    const wantMaterial = wantRing ? spr.userData.ringMaterial : spr.userData.glowMaterial;
    if (spr.material !== wantMaterial) spr.material = wantMaterial;
    if (!wasAlive) this._activateSprite(i);
    spr.visible = true;
    spr.material.color.set(color);
    spr.material.opacity = op0;
    spr.material.rotation = st.roll;
    spr.position.set(x, y || 0, z);
    spr.scale.setScalar(size0);
    return st;
  },

  _activateParticle(i) {
    this._alive[i] = 1;
    this._activeParticlePos[i] = this._liveCount;
    this._activeParticles[this._liveCount++] = i;
  },

  _retireParticle(i) {
    if (!this._alive[i]) return;
    this._alive[i] = 0;
    this._pAlpha[i] = 0;
    const pos = this._activeParticlePos[i];
    if (pos >= 0) {
      const lastPos = --this._liveCount;
      const moved = this._activeParticles[lastPos];
      if (pos !== lastPos) {
        this._activeParticles[pos] = moved;
        this._activeParticlePos[moved] = pos;
      }
      this._activeParticlePos[i] = -1;
    }
    this._freeParticles[this._freeParticleCount++] = i;
  },

  _activateSprite(i) {
    this._activeSpritePos[i] = this._liveSpriteCount;
    this._activeSprites[this._liveSpriteCount++] = i;
  },

  _retireSprite(i) {
    const st = this._spr[i];
    if (!st || !st.alive) return;
    st.alive = false;
    const spr = this._spritePool[i];
    if (spr) {
      spr.visible = false;
      spr.material.opacity = 0;
    }
    const pos = this._activeSpritePos[i];
    if (pos >= 0) {
      const lastPos = --this._liveSpriteCount;
      const moved = this._activeSprites[lastPos];
      if (pos !== lastPos) {
        this._activeSprites[pos] = moved;
        this._activeSpritePos[moved] = pos;
      }
      this._activeSpritePos[i] = -1;
    }
    this._freeSprites[this._freeSpriteCount++] = i;
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

  _markEntityCacheDirty() {
    this._trailCacheDirty = true;
  },

  _markEntityCacheDirtyIfTrailType(p) {
    const t = p && p.type;
    if (!t || t === 'ship' || t === 'drone') this._markEntityCacheDirty();
  },

  _refreshTrailCandidates() {
    const list = this.state.entityList || [];
    if (!this._trailCacheDirty && this._trailListRef === list && this._trailListLength === list.length) return;
    this._trailCandidates.length = 0;
    this._ribbonCandidates.length = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || (e.type !== 'ship' && e.type !== 'drone')) continue;
      this._trailCandidates.push(e);
      if ((e.radius || 0) >= 22) this._ribbonCandidates.push(e);
    }
    this._trailListRef = list;
    this._trailListLength = list.length;
    this._trailCacheDirty = false;
  },

  _invalidateTrailSocket(id) {
    if (id == null) {
      for (const e of this._trailCandidates) if (e && e.view) delete e.view.__vfxTrailSocket;
      return;
    }
    const e = this._ent(id);
    if (e && e.view) delete e.view.__vfxTrailSocket;
  },

  _trailSocketWorldPos(e) {
    const view = e && e.view;
    const root = view && view.root;
    if (root && typeof root.traverse === 'function') {
      let cache = view.__vfxTrailSocket;
      if (!cache || cache.root !== root) {
        let socket = null;
        root.traverse((o) => {
          if (!socket && o.userData && o.userData.spacefaceSocket && o.name === 'SOCKET_Trail_Main') socket = o;
        });
        cache = view.__vfxTrailSocket = { root, socket };
      }
      if (cache.socket) {
        cache.socket.updateWorldMatrix(true, false);
        const el = cache.socket.matrixWorld.elements;
        this._socketScratch.x = el[12];
        this._socketScratch.z = el[14];
        return this._socketScratch;
      }
    }
    return this.helpers.socketWorldPos ? this.helpers.socketWorldPos(e.id, 'SOCKET_Trail_Main') : null;
  },

  // -------------------------------------------------------------------------
  // Event handlers (each pushes pooled visuals; no per-event allocation of GPU objects)
  // -------------------------------------------------------------------------
  _onFire(p) {
    if (!this._scene) return;
    // Hero assets carry named sockets (spec §9.9): a weapon muzzle should leave the visible barrel, not
    // the entity center. Resolve from the live mesh socket when available, else use the payload origin.
    let origin = (p.origin && typeof p.origin.x === 'number') ? p.origin : this._posFrom(p, p.ownerId);
    if (this.helpers.socketWorldPos && p.ownerId === this.state.playerId) {
      const sock = this.helpers.socketWorldPos(p.ownerId, 'SOCKET_Weapon_Front');
      if (sock) origin = sock;
    }
    if (!origin) return;
    // combat:fire emits `dir` as a NUMBER (yaw radians) — both weapons.js emitters do. Older callers
    // may pass {x,z}. Resolve robustly (0 is a valid heading, so never treat dir===0 as falsy).
    const base = this._dirAngle(p.dir, p.ownerId);
    const owner = this._ent(p.ownerId);
    const col = this._engineColor(owner); // weapon colour not in payload; faction accent reads well
    const burst = this._burst || 1;
    this._c0.set('#ffffff'); this._c1.set(col);
    // muzzle flash: BIGGER — hot white core punch, coloured mid flare, and a wide neon outer bloom
    this._spawnSprite(SPR_FLASH, origin.x, 0, origin.z, 0.09, 3.5, 6.0, 1.0, 0.0, '#ffffff', 0, 0);
    const mx = origin.x + Math.cos(base) * 1.5, mz = origin.z + Math.sin(base) * 1.5;
    this._spawnSprite(SPR_FLASH, mx, 0, mz, 0.14, 5.0, 9.0, 0.9, 0.0, col, 0, 0);
    // wide neon bloom feeder behind the core — feeds into the bloom pass for a satisfying pop
    this._spawnSprite(SPR_FLASH, origin.x, 0, origin.z, 0.18, 4.0, 10.0, 0.45, 0.0, col, 0, 0);
    // dynamic muzzle light — brighter, wider radius to light surrounding geometry
    this._flashLight({ x: origin.x, z: origin.z }, 0xffffff, 5.0, 12, 180);
    // secondary weapon-colored light slightly ahead — paints the barrel area
    this._flashLight({ x: mx, z: mz }, col, 3.0, 14, 100);
    // spark particles ejected forward along the aim cone +/-15deg — more sparks, faster
    const n = Math.max(4, Math.round(10 * burst));
    for (let k = 0; k < n; k++) {
      const a = base + (Math.random() - 0.5) * 0.52;
      const sp = 40 + Math.random() * 50;
      this._spawnParticle(origin.x, origin.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.18, 2.2, 0.0, this._c0, this._c1, 3.5, 0, 0);
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
    const fid = (tgt && tgt.factionId) || null;
    const hitShield = tgt && tgt.shield > 0;

    if (hitShield) {
      // Shield impact: distinct blue/cyan sparks + visible ripple so it reads differently from hull
      const col = this._shieldColor(fid);
      const r = (tgt && tgt.radius) || 6;
      // expanding shield ripple ring at the hit point (smaller than _onDamage full bubble)
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.25, r * 0.6, r * 3.5, 0.7, 0.0, col, 0, 0);
      // localized flash at the hit point
      this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.10, 2.5, 5.0, 0.9, 0.0, '#ffffff', 0, 0);
      this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.16, 3.5, 7.0, 0.6, 0.0, col, 0, 0);
      // shield sparks skitter across the surface — more and faster
      this._c0.set('#ffffff'); this._c1.set(col);
      const sn = Math.max(6, Math.round(14 * (this._burst || 1)));
      for (let k = 0; k < sn; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 22 + Math.random() * 28;
        this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.22, 1.6, 0.0, this._c0, this._c1, 3.5, 0, 0);
      }
      this._flashLight({ x: pos.x, z: pos.z }, col, 3.0, 12, 120);
    } else {
      // Hull impact: hot orange/yellow sparks — directional spray, more particles
      const col = tgt ? this._engineColor(tgt) : '#ffcc66';
      this._impactSparks(pos.x, pos.z, p.pos && p.dir ? p.dir : null, col, 18);
      // extra hull debris — a few slower, longer-lived chunks
      this._c0.set('#ffa040'); this._c1.set('#301008');
      const dn = Math.max(2, Math.round(5 * (this._burst || 1)));
      for (let k = 0; k < dn; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 8 + Math.random() * 14;
        this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 0.3, 1.4, 0.3, this._c0, this._c1, 1.2, 0, 0);
      }
    }
  },

  _onDamage(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos) return;
    const tgt = this._ent(p.targetId);
    const fid = (tgt && tgt.factionId) || p.factionId || null;
    // NOTE: on combat:damage, `p.type` is the DAMAGE type (kinetic/energy/…), not a shield flag — so
    // the shield branch keys off `shieldAbsorbed` (authoritative: true when any shield HP absorbed
    // damage this hit) plus `brokeShield` (shield HP just hit zero). Both trigger shield VFX.
    if (p.shieldAbsorbed || p.brokeShield) {
      // VISIBLE SHIELD BUBBLE — multi-layer approach: a bright fresnel rim ring at the entity center
      // sized to the shield radius (the "bubble" outline), a second expanding RING shockwave from the
      // hit point that reads as a ripple propagating across the bubble surface, plus a localized flash.
      const col = this._shieldColor(fid);
      const r = (tgt && tgt.radius) || 8;
      const cx = tgt ? tgt.pos.x : pos.x, cz = tgt ? tgt.pos.z : pos.z;

      // (1) Primary fresnel rim bubble — snaps out to shield radius. BIGGER and BRIGHTER than before.
      this._spawnSprite(SPR_FRESNEL, cx, 0, cz, 0.50, r * 2.3, r * 3.0, 1.0, 0.0, col, 0, 0);
      // (2) Second fresnel layer slightly larger — fainter echo for depth/thickness feel
      this._spawnSprite(SPR_FRESNEL, cx, 0, cz, 0.65, r * 2.5, r * 3.5, 0.45, 0.0, col, 0, 0);
      // (3) Shield ripple ring expanding FROM the hit point — the "impact ripple" propagating outward
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.35, r * 0.5, r * 4.5, 0.85, 0.0, col, 0, 0);
      // (4) Second ripple ring slightly delayed + wider for chromatic feel
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.45, r * 0.8, r * 5.5, 0.5, 0.0, '#ffffff', 0, 0);
      // (5) Hot white impact flash at the hit point — BIGGER so it reads clearly
      this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.14, r * 1.0, r * 2.5, 1.0, 0.0, '#ffffff', 0, 0);
      // (6) Coloured flare behind the white punch
      this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.22, r * 1.2, r * 3.0, 0.7, 0.0, col, 0, 0);
      // dynamic shield-hit light — BRIGHTER, wider range so shield flashes illuminate the scene
      this._flashLight({ x: pos.x, z: pos.z }, col, 6.0, 10, 200);
      // secondary white-hot light at the center for the bubble glow
      this._flashLight({ x: cx, z: cz }, '#ffffff', 3.0, 14, 120);
      // shield sparks skittering across the bubble surface — MORE sparks, faster, brighter
      this._c0.set('#ffffff'); this._c1.set(col);
      const sn = Math.max(6, Math.round(14 * (this._burst || 1)));
      for (let k = 0; k < sn; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 24 + Math.random() * 26;
        this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp, 0.28, 1.8, 0.0, this._c0, this._c1, 3.5, 0, 0);
      }
      // shield-break bonus: if the shield just popped, add a dramatic full-bubble burst
      if (p.brokeShield) {
        this._spawnSprite(SPR_RING, cx, 0, cz, 0.55, r * 1.0, r * 7.0, 1.0, 0.0, col, 0, 0);
        this._spawnSprite(SPR_FRESNEL, cx, 0, cz, 0.40, r * 3.0, r * 4.5, 0.9, 0.0, '#ffffff', 0, 0);
        this._flashLight({ x: cx, z: cz }, '#ffffff', 8.0, 8, 250);
        // scatter of bright sparks on shield break — the bubble shattering
        this._c0.set(col); this._c1.set('#102040');
        const bn = Math.max(8, Math.round(20 * (this._burst || 1)));
        for (let k = 0; k < bn; k++) {
          const a = Math.random() * Math.PI * 2;
          const dist = r * (0.8 + Math.random() * 0.5);
          const sp = 30 + Math.random() * 40;
          this._spawnParticle(cx + Math.cos(a) * dist, cz + Math.sin(a) * dist,
            Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.2, 2.0, 0.0, this._c0, this._c1, 2.0, 0, 0);
        }
        this.bus.emit('camera:shake', { amount: 0.4 });
      }
    } else {
      // hull impact sparks (hot-white -> faction accent) — MORE sparks than before
      const col = this._engineColor(tgt);
      this._impactSparks(pos.x, pos.z, p.normal || null, col, 20);
      // hull hits also get a small orange flash at the hit point
      this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.10, 2.0, 4.5, 0.7, 0.0, '#ff8040', 0, 0);
      this._flashLight({ x: pos.x, z: pos.z }, '#ff8040', 2.5, 14, 90);
    }
    // player hits get a camera kick — STRONGER, proportional to damage
    if (p.isPlayer && (p.amount || 0) > 0) this.bus.emit('camera:shake', { amount: Math.min(0.5, 0.08 + (p.amount || 0) * 0.015) });
  },

  _impactSparks(x, z, dir, color, n) {
    this._c0.set('#ffffff'); this._c1.set(color);
    const base = dir ? Math.atan2(dir.z, dir.x) + Math.PI : Math.random() * Math.PI * 2; // reflect-ish
    const count = Math.max(5, Math.round(n * (this._burst || 1)));
    // primary spark spray — tighter cone along the reflection direction, fast and bright
    for (let k = 0; k < count; k++) {
      const a = base + (Math.random() - 0.5) * 1.4;
      const sp = 22 + Math.random() * 40;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.15, 2.0, 0.0, this._c0, this._c1, 2.8, 0, 0);
    }
    // secondary slower sparks — wider spread, dimmer, for lingering debris feel
    this._c0.set('#ffc060'); this._c1.set('#401008');
    const slow = Math.max(2, Math.round(count * 0.35));
    for (let k = 0; k < slow; k++) {
      const a = base + (Math.random() - 0.5) * 2.4;
      const sp = 8 + Math.random() * 15;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.25, 1.5, 0.3, this._c0, this._c1, 1.5, 0, 0);
    }
    // hot impact flash — BIGGER white core punch
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.08, 2.8, 5.0, 1.0, 0.0, '#ffffff', 0, 0);
    // coloured outer halo — larger and longer
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.15, 4.0, 7.0, 0.65, 0.0, color, 0, 0);
    // impact light flash
    this._flashLight({ x, z }, color, 2.5, 14, 100);
  },

  _onPresentationCue(p) {
    if (!this._scene || !p) return;
    const particlesRequested = budgetInt(p.particles);
    const lightsRequested = budgetInt(p.lights);
    if (particlesRequested <= 0 && lightsRequested <= 0) return;
    const pos = this._presentationPos(p);
    if (!pos) return;

    const style = this._presentationStyle(p);
    const radius = this._presentationRadius(p);
    const angle = this._dirAngle(p.direction, p.sourceId);
    const particlesSpawned = particlesRequested > 0
      ? this._spawnPresentationParticles(p, pos, style, particlesRequested, angle, radius)
      : 0;
    if (particlesRequested > 0) this._spawnPresentationSprite(p, pos, style, radius);

    const maxLights = Math.min(lightsRequested, this._LIGHT_NPOOL || 0);
    let lightsActivated = 0;
    for (let i = 0; i < maxLights; i++) {
      const off = i - (maxLights - 1) * 0.5;
      const dx = Math.cos(angle + Math.PI / 2) * off * radius * 0.35;
      const dz = Math.sin(angle + Math.PI / 2) * off * radius * 0.35;
      if (this._flashLight({ x: pos.x + dx, z: pos.z + dz }, style.lightColor || style.color0, style.lightPeak, style.lightDecay, style.lightDistance)) {
        lightsActivated++;
      }
    }

    this._presentationCueCount++;
    this._presentationParticleCount += particlesSpawned;
    this._presentationLightCount += lightsActivated;
    this._lastPresentationCue = {
      id: p.id || null,
      lane: p.lane || null,
      material: p.material || 'unknown',
      particlesRequested,
      particlesSpawned,
      lightsRequested,
      lightsActivated,
      flashReduced: !!p.flashReduced,
    };
  },

  _presentationPos(p) {
    const pos = this._posFrom(p, p.targetId ?? p.sourceId);
    if (pos) return pos;
    const player = this._ent(this.state && this.state.playerId);
    return player ? player.pos : null;
  },

  _presentationRadius(p) {
    const e = this._ent(p && p.targetId);
    const base = (e && e.radius) || 8;
    const mag = Math.max(1, Math.min(6, Number(p && p.magnitude) || 1));
    return Math.max(4, base * (0.7 + Math.log2(mag + 1) * 0.18));
  },

  _spawnPresentationSprite(p, pos, style, radius) {
    const reduced = !!(p && p.flashReduced);
    const kind = reduced ? SPR_RING : style.spriteKind;
    const opacity = reduced ? Math.min(style.spriteOpacity, 0.42) : style.spriteOpacity;
    this._spawnSprite(kind, pos.x, 0, pos.z, style.spriteLife, radius * style.spriteSize0, radius * style.spriteSize1, opacity, 0.0, style.color0, 0, 0);
    if (!reduced && style.echoRing) {
      this._spawnSprite(SPR_RING, pos.x, 0, pos.z, style.spriteLife * 1.25, radius * style.spriteSize0 * 0.7, radius * style.spriteSize1 * 1.35, opacity * 0.55, 0.0, style.color1, 0, 0);
    }
  },

  _spawnPresentationParticles(p, pos, style, requested, angle, radius) {
    const burst = this._burst || 1;
    const count = Math.max(1, Math.min(requested, Math.round(requested * burst)));
    this._c0.set(style.color0);
    this._c1.set(style.color1);
    const radial = style.radial || (p && p.id && (p.id.includes('shield') || p.id.includes('signal') || p.id.includes('branch')));
    for (let k = 0; k < count; k++) {
      const a = radial ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * style.spread;
      const sp = style.speed0 + Math.random() * style.speedJitter;
      const dist = radial ? Math.random() * radius * 0.45 : (Math.random() - 0.5) * radius * 0.35;
      const sx = pos.x + Math.cos(a) * dist;
      const sz = pos.z + Math.sin(a) * dist;
      this._spawnParticle(
        sx, sz,
        Math.cos(a) * sp, Math.sin(a) * sp,
        style.life0 + Math.random() * style.lifeJitter,
        style.size0, style.size1,
        this._c0, this._c1,
        style.drag,
        style.y, style.vy,
      );
    }
    return count;
  },

  _presentationStyle(p) {
    const id = (p && p.id) || '';
    const lane = (p && p.lane) || '';
    if (id === 'shield.collapse' || lane.includes('shield')) {
      return presentationStyle('#ffffff', '#66ccff', SPR_FRESNEL, { radial: true, echoRing: true, lightPeak: 6.0, lightDistance: 220, speed0: 24, speedJitter: 44, size0: 2.1 });
    }
    if (id === 'subsystem.disabled' || lane.includes('subsystem')) {
      return presentationStyle('#fff4c0', '#ff8a30', SPR_FLASH, { spread: 1.35, lightPeak: 3.2, lightDistance: 120, speed0: 34, speedJitter: 34, size0: 1.8 });
    }
    if (id === 'tether.break' || lane.includes('tether_break')) {
      return presentationStyle('#ffffff', '#5fe0ff', SPR_RING, { echoRing: true, lightPeak: 5.0, lightDistance: 190, speed0: 46, speedJitter: 58, size0: 2.4 });
    }
    if (id.startsWith('tether.') || lane.includes('tether')) {
      return presentationStyle('#dffcff', '#2bb7ff', SPR_RING, { lightPeak: 3.0, lightDistance: 140, speed0: 28, speedJitter: 30, size0: 1.8 });
    }
    if (lane.includes('pod_beacon') || id.includes('objective')) {
      return presentationStyle('#fff0a8', '#ffcc44', SPR_RING, { radial: true, echoRing: true, lightPeak: 3.4, lightDistance: 160, speed0: 18, speedJitter: 22, life0: 0.45 });
    }
    if (lane.includes('comms')) {
      return presentationStyle('#e6fbff', '#5fd7ff', SPR_PUFF, { radial: true, lightPeak: 0, lightDistance: 0, speed0: 10, speedJitter: 18, life0: 0.55, size0: 1.7, size1: 0.2, drag: 0.9 });
    }
    if (lane.includes('branch') || id.includes('branch')) {
      return presentationStyle('#fff8d8', '#f5d06f', SPR_RING, { radial: true, echoRing: true, lightPeak: 4.0, lightDistance: 180, speed0: 18, speedJitter: 32, life0: 0.5 });
    }
    return presentationStyle('#ffffff', '#b060ff', SPR_RING, { radial: true, lightPeak: 3.2, lightDistance: 150, speed0: 18, speedJitter: 32 });
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
    const r = Math.max(3, p.radius || 6);
    const x = pos.x, z = pos.z;
    const burst = this._burst || 1;
    // Scale factor: bigger entities produce bigger explosions (a frigate blowing up should dwarf a fighter)
    const sc = big ? Math.max(1, r / 6) : Math.max(0.7, r / 8);

    // (a) MULTI-LAYER FLASH — BIGGER, entity-radius-scaled. Instant white core, hot mid,
    //     broad neon outer bloom-feeder, plus a MASSIVE brief overbloom that feeds the bloom pass hard.
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.10, r * 2.0 * sc, r * 4.5 * sc, 1.0, 0.0, '#ffffff', 0, 0);
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.22, r * 3.5 * sc, r * 8.0 * sc, 1.0, 0.0, '#ffe8a0', 0, 0);
    this._spawnSprite(SPR_FLASH, x, 0, z, 0.38, r * 4.5 * sc, r * 12.0 * sc, 0.8, 0.0, '#ff5fa0', 0, 0);
    // massive overbloom flash — short-lived, feeds bloom hard for that blinding-white moment
    if (big) this._spawnSprite(SPR_FLASH, x, 0, z, 0.06, r * 5.0 * sc, r * 15.0 * sc, 1.0, 0.0, '#ffffff', 0, 0);
    // dynamic explosion light — BRIGHTER, WIDER, scaled to blast size. Two lights for depth:
    // a white-hot core flash + a neon-warm sustained glow
    this._flashLight({ x, z }, 0xffffff, Math.min(18, 6 + r * sc * 1.0), 10, 160 + r * sc * 15);
    this._flashLight({ x, z }, 0xff70a0, Math.min(16, 5 + r * sc * 0.9), 4, 250 + r * sc * 18);

    // (c) TRIPLE CHROMATIC SHOCKWAVE — BIGGER rings, scaled to entity radius
    this._spawnSprite(SPR_RING, x, 0, z, 0.35, r * 0.8 * sc, r * 9.0 * sc, 1.0, 0.0, '#ffffff', 0, 0);
    this._spawnSprite(SPR_RING, x, 0, z, 0.48, r * 1.0 * sc, r * 12.0 * sc, 0.85, 0.0, '#5fe0ff', 0, 0);
    this._spawnSprite(SPR_RING, x, 0, z, 0.60, r * 1.2 * sc, r * 15.0 * sc, 0.65, 0.0, '#ff5fe0', 0, 0);
    // big explosions get a FOURTH outer shockwave — the "pressure wave"
    if (big) this._spawnSprite(SPR_RING, x, 0, z, 0.70, r * 2.0 * sc, r * 20.0 * sc, 0.4, 0.0, '#ffffff', 0, 0);

    // (b) embers: MORE particles, BIGGER, FASTER — hot-yellow -> ember-red + neon magenta ionized debris
    const embers = Math.max(12, Math.round((big ? 70 : 40) * burst * sc));
    for (let k = 0; k < embers; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (25 + Math.random() * 65) * sc;
      const life = 0.7 + Math.random() * 0.6;
      // ~1 in 4 embers is neon magenta (ionized debris)
      if (k % 4 === 0) { this._c0.set('#ff5fe0'); this._c1.set('#60106a'); }
      else { this._c0.set('#ffe08a'); this._c1.set('#802010'); }
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, life, 3.0 * sc, 0.0, this._c0, this._c1, 1.3, 0, 0);
    }

    // (b2) fast bright SPARKS — MORE, FASTER, white-hot streaks for the initial flash-front snap
    this._c0.set('#ffffff'); this._c1.set('#ffd070');
    const sparks = Math.max(8, Math.round((big ? 30 : 16) * burst * sc));
    for (let k = 0; k < sparks; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (80 + Math.random() * 120) * sc;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.18 + Math.random() * 0.12, 2.2, 0.0, this._c0, this._c1, 3.0, 0, 0);
    }

    // (d) debris chunks — MORE, BIGGER, LONGER-LIVED: slower tumbling specks that linger after the fire
    this._c0.set('#c9b08a'); this._c1.set('#201810');
    const debris = Math.max(5, Math.round((big ? 18 : 10) * burst * sc));
    for (let k = 0; k < debris; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (14 + Math.random() * 35) * sc;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 2.0 + Math.random() * 1.0, 2.5 * sc, 0.8, this._c0, this._c1, 0.5, 0, 0);
    }
    // secondary hot debris — glowing orange chunks that cool to dark (reads as burning wreckage)
    this._c0.set('#ff9030'); this._c1.set('#301008');
    const hotDebris = Math.max(3, Math.round((big ? 12 : 6) * burst * sc));
    for (let k = 0; k < hotDebris; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (10 + Math.random() * 25) * sc;
      this._spawnParticle(x, z, Math.cos(a) * sp, Math.sin(a) * sp, 1.8 + Math.random() * 1.2, 2.0 * sc, 0.5, this._c0, this._c1, 0.4, 0, 0);
    }

    // (e) SMOKE puffs — MORE, BIGGER, drift and grow, lingering after the fire dies
    const puffs = Math.max(3, Math.round((big ? 8 : 5) * burst));
    for (let k = 0; k < puffs; k++) {
      this._spawnSprite(SPR_PUFF,
        x + (Math.random() - 0.5) * r * sc,
        0,
        z + (Math.random() - 0.5) * r * sc,
        1.2 + Math.random() * 0.8,
        r * 1.2 * sc, r * 3.5 * sc,
        0.6, 0.0, '#2a2a30',
        (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    }

    // Camera shake — PROPORTIONAL to explosion size: big ships produce big shakes
    const shakeAmt = big
      ? Math.min(0.85, 0.15 * r * sc)
      : Math.min(0.55, 0.12 * r * sc);
    this.bus.emit('camera:shake', { amount: shakeAmt });
  },

  // ---- mining beam visual (energy line from ship to contact point) ----------
  _miningBeam: null,
  _initMiningBeam() {
    if (!this._scene) return;
    // Flat ribbon quad stretched between two endpoints; additive-blended, ore-tinted.
    // 4 vertices forming a thin quad (2 triangles) — width controlled per-update.
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(4 * 3); // 4 verts, xyz
    const uv = new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]);
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.usage = THREE.DynamicDrawUsage;
    geo.setAttribute('position', posAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex([0, 1, 2, 1, 3, 2]);

    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#60d0ff'),
      transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.visible = false;
    this._scene.add(mesh);

    // Core glow — a second, wider, dimmer beam layered underneath for bloom feel.
    const geo2 = geo.clone();
    const mat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#60d0ff'),
      transparent: true, opacity: 0.25,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(geo2, mat2);
    glow.frustumCulled = false;
    glow.renderOrder = 9;
    glow.visible = false;
    this._scene.add(glow);

    this._miningBeam = { mesh, glow, active: false, t: 0, color: '#60d0ff' };
  },

  _onMiningStart(p) {
    if (!this._miningBeam) return;
    this._miningBeam.active = true;
    this._miningBeam.t = 0;
    this._miningBeam.targetId = (p && p.targetId) || null;
    // Tint to the target asteroid's ore type if we can resolve it
    const target = p && p.targetId ? this._ent(p.targetId) : null;
    if (target && target.data) {
      const def = target.data.typeId;
      const col = oreColor(def);
      this._miningBeam.color = col;
      this._miningBeam.mesh.material.color.set(col);
      this._miningBeam.glow.material.color.set(col);
    }
  },

  _onMiningStop() {
    if (!this._miningBeam) return;
    this._miningBeam.active = false;
    this._miningBeam.mesh.visible = false;
    this._miningBeam.glow.visible = false;
  },

  // Called each frame from update() to reposition the beam quad between ship and contact.
  _updateMiningBeam(dt) {
    const beam = this._miningBeam;
    if (!beam || !beam.active) return;
    beam.t += dt;

    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    if (!player || !player.alive) { this._onMiningStop(); return; }

    const target = beam.targetId ? this._ent(beam.targetId) : null;
    if (!target || !target.alive) { this._onMiningStop(); return; }

    // Ship origin: use SOCKET_Trail_Main offset rotated to the ship's front (mining drill is forward)
    const cf = Math.cos(player.rot), sf = Math.sin(player.rot);
    const fwd = (player.radius || 6) * 0.7;
    const sx = player.pos.x + cf * fwd, sz = player.pos.z + sf * fwd;

    // Target contact point on the asteroid surface facing the ship
    const dx = sx - target.pos.x, dz = sz - target.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const r = target.radius || 6;
    const tx = target.pos.x + (dx / dist) * r, tz = target.pos.z + (dz / dist) * r;

    // Beam ribbon: perpendicular to the beam direction, thin strip
    const nx = -(dz / dist), nz = (dx / dist); // perpendicular
    const pulse = 1.0 + 0.3 * Math.sin(beam.t * 12); // rapid pulse
    const w = 0.8 * pulse; // beam half-width
    const gw = 2.5 * pulse; // glow half-width

    // Update core beam quad vertices
    const corePos = beam.mesh.geometry.attributes.position.array;
    corePos[0] = sx + nx * w; corePos[1] = 1.5; corePos[2] = sz + nz * w;
    corePos[3] = sx - nx * w; corePos[4] = 1.5; corePos[5] = sz - nz * w;
    corePos[6] = tx + nx * w; corePos[7] = 1.5; corePos[8] = tz + nz * w;
    corePos[9] = tx - nx * w; corePos[10] = 1.5; corePos[11] = tz - nz * w;
    beam.mesh.geometry.attributes.position.needsUpdate = true;
    beam.mesh.visible = true;
    beam.mesh.material.opacity = 0.6 + 0.2 * Math.sin(beam.t * 8);

    // Update glow quad (wider, dimmer)
    const glowPos = beam.glow.geometry.attributes.position.array;
    glowPos[0] = sx + nx * gw; glowPos[1] = 1.5; glowPos[2] = sz + nz * gw;
    glowPos[3] = sx - nx * gw; glowPos[4] = 1.5; glowPos[5] = sz - nz * gw;
    glowPos[6] = tx + nx * gw; glowPos[7] = 1.5; glowPos[8] = tz + nz * gw;
    glowPos[9] = tx - nx * gw; glowPos[10] = 1.5; glowPos[11] = tz - nz * gw;
    beam.glow.geometry.attributes.position.needsUpdate = true;
    beam.glow.visible = true;
    beam.glow.material.opacity = 0.15 + 0.1 * Math.sin(beam.t * 6);

    // Emit beam trail particles along the beam length for extra energy feel
    if (Math.random() < 0.6) {
      const frac = Math.random();
      const px = sx + (tx - sx) * frac, pz = sz + (tz - sz) * frac;
      const drift = 3 + Math.random() * 5;
      this._c0.set('#ffffff'); this._c1.set(beam.color);
      this._spawnParticle(px, pz, (Math.random() - 0.5) * drift, (Math.random() - 0.5) * drift,
        0.15 + Math.random() * 0.15, 1.0, 0.0, this._c0, this._c1, 4.0, 0, 0);
    }
  },

  _onMiningTick(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, null);
    if (!pos) return;
    const col = oreColor(p.oreType);
    // Spray sparks outward from the contact point, biased away from the miner so they fan
    // off the rock face like molten chips. Bigger, brighter, more numerous than before.
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    let backA = null;
    if (player) {
      const dx = player.pos.x - pos.x, dz = player.pos.z - pos.z;
      if (dx * dx + dz * dz > 1) backA = Math.atan2(dz, dx);
    }
    // Hot white-to-ore sparks — wider spray, faster, longer life
    this._c0.set('#fffaf0'); this._c1.set(col);
    const n = Math.max(8, Math.round(16 * (this._burst || 1)));
    for (let k = 0; k < n; k++) {
      // Spray perpendicular to beam (away from rock face) for a fan effect
      const a = backA != null
        ? backA + Math.PI + (Math.random() - 0.5) * 2.2  // fan away from ship
        : Math.random() * Math.PI * 2;
      const sp = 18 + Math.random() * 35;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.35 + Math.random() * 0.2, 2.0, 0.2, this._c0, this._c1, 2.5, 0, 0);
    }
    // A few slow-drifting embers that linger (amber → dim)
    this._c0.set('#ffb040'); this._c1.set('#401800');
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      this._spawnParticle(pos.x + (Math.random() - 0.5) * 4, pos.z + (Math.random() - 0.5) * 4,
        Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 0.4, 1.8, 0.0, this._c0, this._c1, 1.5, 0, 0);
    }
    // Bright contact flash — bigger, punchier
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.15, 2.5, 5.0, 0.8, 0.0, col, 0, 0);
    // Drifting dust / debris cloud
    this._spawnSprite(SPR_PUFF, pos.x, 0, pos.z, 0.5, 2.0, 4.5, 0.5, 0.0, col,
      (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    // Strong ore-tinted dynamic light at contact — brighter, wider
    this._flashLight({ x: pos.x, z: pos.z }, col, 4.0, 3.5, 140);
  },

  _onMiningYield(p) {
    if (!this._scene) return;
    const pos = this._posFrom(p, null);
    if (!pos) return;
    const col = oreColor(p.commodityId);
    const qty = p.qty || 1;
    // Satisfying burst of sparkles when ore pops out — scales with quantity
    const burstN = Math.min(20, 6 + qty * 2);
    this._c0.set('#ffffff'); this._c1.set(col);
    for (let k = 0; k < burstN; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 15 + Math.random() * 25;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.3 + Math.random() * 0.2, 2.0, 0.3, this._c0, this._c1, 2.0, 0, 4 + Math.random() * 8);
    }
    // Bright flash + expanding ring to punctuate the yield
    this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.3, 3.0, 6.0, 0.9, 0.0, col, 0, 0);
    this._spawnSprite(SPR_RING, pos.x, 0, pos.z, 0.4, 2.0, 12.0, 0.5, 0.0, col, 0, 0);
    this._flashLight({ x: pos.x, z: pos.z }, col, 5.0, 4.0, 180);
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
      // Boost ignition: BIGGER, PUNCHIER — bright flare behind the nozzles, backward afterburner
      // streak, expanding ring, and a dynamic light. The moment of ignition should read clearly.
      const col = this._engineColor(e);
      const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
      const bx = e.pos.x - cf * (e.radius + 2);
      const bz = e.pos.z - sf * (e.radius + 2);
      // Core white flash — bigger
      this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.22, 6, 14, 1.0, 0.0, '#ffffff', 0, 0);
      // Coloured outer flare — wider, longer
      this._spawnSprite(SPR_FLASH, bx, 0, bz, 0.35, 8, 18, 0.8, 0.0, col, 0, 0);
      // Expanding ring behind the ship — reads as the shockwave of ignition
      this._spawnSprite(SPR_RING, bx, 0, bz, 0.30, 3, 16, 0.7, 0.0, col, -cf * 5, -sf * 5);
      // Dynamic light at the nozzle — lights up the rear of the ship
      this._flashLight({ x: bx, z: bz }, col, 5.0, 10, 160);
      // Afterburner particle streak — MORE particles, FASTER
      this._c0.set('#ffffff'); this._c1.set(col);
      const baseA = Math.atan2(-sf, -cf);
      const n = Math.max(10, Math.round(24 * (this._burst || 1)));
      for (let k = 0; k < n; k++) {
        const a = baseA + (Math.random() - 0.5) * 0.55;
        const sp = 70 + Math.random() * 80;
        this._spawnParticle(bx, bz, Math.cos(a) * sp, Math.sin(a) * sp, 0.35, 3.0, 0.0, this._c0, this._c1, 1.8, 0, 0);
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
    // Satisfying absorption burst — particles implode toward the player, then flash
    const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
    this._spawnSprite(SPR_FLASH, p.pos.x, 0, p.pos.z, 0.25, 2.5, 5.0, 0.8, 0.0, col, 0, 0);
    this._c0.set('#ffffff'); this._c1.set(col);
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 12 + Math.random() * 18;
      this._spawnParticle(p.pos.x, p.pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.3 + Math.random() * 0.15, 1.8, 0.0, this._c0, this._c1, 3.0, 2, 6 + Math.random() * 10);
    }
    // Flash at the player position too (cargo received confirmation)
    if (player) {
      this._spawnSprite(SPR_FLASH, player.pos.x, 0, player.pos.z, 0.15, 2.0, 4.0, 0.5, 0.0, col, 0, 0);
      this._flashLight({ x: player.pos.x, z: player.pos.z }, col, 2.0, 6.0, 80);
    }
  },

  // engine trail emitter — called per ship per frame from update(), throttled by accumulator
  _emitEngineTrail(e, throttle, dt) {
    if (!this._scene) return;
    const col0 = this._engineColor(e);
    const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
    const boosting = e.flags && e.flags.boosting;
    // Hero assets carry SOCKET_Trail_Main at the authored nozzle; originate the plume there so it
    // leaves the real engine, not a center-derived point (spec §9.9, §14.2). Falls back to the
    // radial-behind formula for procedural ships that have no socket.
    let bx, bz;
    const sock = this._trailSocketWorldPos(e);
    if (sock) { bx = sock.x; bz = sock.z; }
    else {
      const back = (e.radius || 4) * 0.85;
      bx = e.pos.x - cf * back;
      bz = e.pos.z - sf * back;
    }
    const baseA = Math.atan2(-sf, -cf);

    // How many particles per tick: 2 normally, 3-4 when boosting (afterburner effect)
    const pCount = boosting ? 3 + (Math.random() < 0.5 ? 1 : 0) : 2;
    // Spread widens with throttle and boost
    const spread = boosting ? 0.55 : 0.40;

    for (let pi = 0; pi < pCount; pi++) {
      // outer plume: faction-hot -> dark blue, wider with throttle, jittered backward
      this._c0.set(col0); this._c1.set('#10204a');
      const sp = (22 + throttle * 28) * (boosting ? 1.4 : 1.0);
      const a = baseA + (Math.random() - 0.5) * spread;
      const jitter = boosting ? 2.5 : 1.8;
      const life = boosting ? 0.45 : 0.38;
      const sz = (boosting ? 2.8 : 2.2) * (0.6 + throttle * 0.6);
      this._spawnParticle(
        bx + (Math.random() - 0.5) * jitter, bz + (Math.random() - 0.5) * jitter,
        Math.cos(a) * sp, Math.sin(a) * sp, life, sz, 0.0, this._c0, this._c1, 1.8, 0, 0);
    }

    // white-hot inner core right at the nozzle — bigger, brighter, gives the trail a visible spine
    this._c0.set('#ffffff'); this._c1.set(col0);
    const a2 = baseA + (Math.random() - 0.5) * 0.20;
    const sp2 = (28 + throttle * 30) * (boosting ? 1.3 : 1.0);
    const coreSize = (boosting ? 2.0 : 1.5) * (0.7 + throttle * 0.5);
    this._spawnParticle(bx, bz, Math.cos(a2) * sp2, Math.sin(a2) * sp2, boosting ? 0.25 : 0.20, coreSize, 0.0, this._c0, this._c1, 2.2, 0, 0);

    // AFTERBURNER: when boosting, add extra bright wide particles + a subtle sustained nozzle glow.
    // These give the boost a visibly different, more dramatic trail.
    if (boosting) {
      // Extra wide bright outer particles — faction colored, bigger, slightly random y offset
      this._c0.set(col0); this._c1.set('#ffffff');
      const ab = baseA + (Math.random() - 0.5) * 0.7;
      const absp = 35 + Math.random() * 30;
      this._spawnParticle(
        bx + (Math.random() - 0.5) * 3.0, bz + (Math.random() - 0.5) * 3.0,
        Math.cos(ab) * absp, Math.sin(ab) * absp, 0.35, 3.2, 0.0, this._c0, this._c1, 1.5, 0, 0);
    }
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
    this._updateRibbonTrails(dt);
    this._updateMiningBeam(dt);
    this._updateEnergy(dt);
    this._integrateParticles(dt);
    this._integrateSprites(dt);
    this._decayEventLights(dt);
  },

  // (defensive) only used if pools attached lazily; avoids double-subscription
  _subscribeOnce() { if (!this._subs.length) this._subscribe(); },

  // -------------------------------------------------------------------------
  // HDR energy materials (spec §14.5 / INTEGRATION_MAP §8.5). An opt-in layer of real
  // shader-driven energy volumes — a hot-core/turbulent-halo thruster plume and a tension-pulsing
  // Massline ribbon — that write HDR radiance into the half-float bloom target. These are
  // additive, depth-tested, toneMapped:false meshes layered alongside the particle trail, NOT a
  // replacement for it. Gated on settings.video.energyMaterials (and bloom, since HDR radiance
  // only reads correctly when the bloom composite tone-maps it). Purely cosmetic — never sim state.
  // -------------------------------------------------------------------------
  _updateEnergy(dt) {
    const video = this.state.settings && this.state.settings.video;
    const enabled = !!(video && video.energyMaterials && video.bloom !== false);
    if (!enabled) { this._disposeEnergy(); return; }
    if (!this._energy) this._initEnergy();
    if (!this._energy) return;
    this._updateEnergyPlume(dt);
    this._updateEnergyMassline(dt);
  },

  _initEnergy() {
    if (!this._scene) return;
    // Thruster plume: a small elongated cylinder energy volume positioned at the player's trail
    // socket each frame. Two meshes (core + halo) share the geometry.
    const plumeGeo = new THREE.CylinderGeometry(0.5, 1.6, 4.0, 12, 1, true);
    plumeGeo.rotateX(Math.PI / 2); // align length along +X (ship-forward)
    const plume = createEnergyVolume(plumeGeo, {
      name: 'sf-energy-plume',
      colorA: 0x36c8ff, colorB: 0x6a4cff,
      coreIntensity: 6.5, haloIntensity: 2.6, noiseScale: 1.6, flowSpeed: 2.4,
    });

    // Massline ribbon: a thin tube energy volume drawn between the player and a tethered target.
    // Reuses the energy shader (turbulent core + halo) rather than the dedicated ribbon shader so it
    // needs no per-vertex aAlong/aSide attributes (the tube geometry already provides them implicitly).
    const ribbonGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 8, 1, true);
    ribbonGeo.translate(0, 0.5, 0); // pivot at one end so we can scale along the tether axis
    ribbonGeo.rotateX(Math.PI / 2);
    const ribbonCore = createEnergyVolume(ribbonGeo, {
      name: 'sf-energy-massline',
      colorA: 0x42f5d4, colorB: 0x2ad4ff,
      coreIntensity: 5.0, haloIntensity: 2.2, noiseScale: 2.4, flowSpeed: 3.2, pulse: 1.4,
    });

    plume.visible = false;
    ribbonCore.visible = false;
    this._scene.add(plume, ribbonCore);
    this._energy = { plume, plumeGeo, ribbon: ribbonCore, ribbonGeo };
  },

  _updateEnergyPlume(dt) {
    const { plume } = this._energy;
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (!player || !player.alive) { plume.visible = false; return; }
    const boosting = !!(player.flags && player.flags.boosting);
    const throttle = this._throttleFor(player);
    if (throttle <= 0.02 && !boosting) { plume.visible = false; return; }
    const socket = this._trailSocketWorldPos(player);
    plume.position.set(socket ? socket.x : player.pos.x, 0, socket ? socket.z : player.pos.z);
    plume.rotation.y = player.rot || 0;
    // Plume length/opacity track commanded thrust; boost widens and brightens it.
    const drive = Math.min(1, throttle * 1.2 + (boosting ? 0.6 : 0));
    plume.scale.set(0.7 + drive * 0.6, 0.7 + drive * 0.6, 0.6 + drive * 1.8);
    plume.visible = true;
    const core = plume.userData.energyCore;
    const halo = plume.userData.energyHalo;
    if (core) updateEnergyMaterial(core.material, { time: this._t, intensity: 5.5 + drive * 4.0, opacity: 0.82 });
    if (halo) updateEnergyMaterial(halo.material, { time: this._t, intensity: 2.4 + drive * 1.6, opacity: 0.34 });
  },

  _updateEnergyMassline(dt) {
    const { ribbon } = this._energy;
    const player = this.state.entities && this.state.entities.get(this.state.playerId);
    if (!player || !player.alive) { ribbon.visible = false; return; }
    // Find an active attachment owned or targeted by the player to render the ribbon along.
    const attachments = this.state.combat && this.state.combat.attachments && this.state.combat.attachments.byId;
    let att = null;
    if (attachments) {
      for (const a of Object.values(attachments)) {
        if (a.state === 'active' && (a.ownerId === player.id || a.targetId === player.id)) { att = a; break; }
      }
    }
    if (!att) { ribbon.visible = false; return; }
    const other = this.state.entities.get(att.ownerId === player.id ? att.targetId : att.ownerId);
    if (!other || !other.alive) { ribbon.visible = false; return; }
    const dx = other.pos.x - player.pos.x, dz = other.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!(dist > 0.5)) { ribbon.visible = false; return; }
    ribbon.position.set(player.pos.x, 0, player.pos.z);
    ribbon.rotation.y = Math.atan2(dz, dx);
    ribbon.scale.set(1, 1, dist);
    ribbon.visible = true;
    // Tension from the massline controller telemetry (set by attachments.js); overload drives the
    // chatter + color shift baked into the energy shader via the pulse uniform.
    const ml = att.masslineTelemetry;
    const tension = ml ? Math.min(1, ml.tensionFraction || 0) : 0;
    const overload = !!(ml && ml.overloadRatio > 1);
    const core = ribbon.userData.energyCore;
    const halo = ribbon.userData.energyHalo;
    const intensity = 4.0 + tension * 4.0 + (overload ? 3.0 : 0);
    if (core) updateEnergyMaterial(core.material, { time: this._t, intensity, opacity: 0.8, pulse: 1.0 + tension * 1.5 });
    if (halo) updateEnergyMaterial(halo.material, { time: this._t, intensity: intensity * 0.5, opacity: 0.3, pulse: 1.0 + tension });
  },

  _disposeEnergy() {
    if (!this._energy) return;
    this._scene.remove(this._energy.plume, this._energy.ribbon);
    this._energy.plumeGeo.dispose();
    this._energy.ribbonGeo.dispose();
    this._energy = null;
  },

  // Approximate commanded throttle for the plume: forward input or current speed fraction.
  _throttleFor(player) {
    const inp = this.state.input;
    if (inp && Number.isFinite(inp.moveZ) && inp.moveZ > 0) return inp.moveZ;
    const sp = Math.hypot(player.vel.x, player.vel.z);
    const max = player.maxSpeed || 1;
    return Math.min(1, sp / max);
  },

  // -------------------------------------------------------------------------
  // Event lights (V2 §11 Tier-A rendering finish). A small pool of dynamic PointLights grabbed on
  // "hero" events — muzzle flashes, explosions near the player, mining impacts, shield breaks — so
  // they actually light their surroundings instead of just spraying additive sprites. This is the
  // single biggest "sheen" upgrade for a low, bounded cost: capped at NPOOL simultaneous lights,
  // player-proximate only (distant NPC fights don't light up), and decayed each frame.
  // -------------------------------------------------------------------------
  _LIGHT_NPOOL: 6,
  _initEventLights() {
    if (!this._scene) return;
    // Respect the motion-reduce / quality gates: on low quality or motion-reduce, skip the pool
    // entirely (lights are a vestibular/visual load). _flashLight becomes a no-op if pool is null.
    const v = this.state.settings && this.state.settings.video;
    this._activeLightCount = 0;
    if (v && (v.motionReduce || v.particleQuality === 'low')) { this._lights = null; return; }
    this._lights = [];
    for (let i = 0; i < this._LIGHT_NPOOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 400, 2.0); // color, intensity, distance, decay
      l.visible = false;
      this._scene.add(l);
      this._lights.push({ obj: l, intensity: 0, peak: 0, decay: 0, t: 0, active: false });
    }
    // cursor for LRU grab
    this._lightCur = 0;
  },

  // Grab a pool light, position it at {x,z} (y lifted slightly above the plane), set its color +
  // peak intensity, and arm a decay rate. Intensity eases up over ~50ms then decays exponentially
  // — reads as a sharp flash, not a fade-in. `decayRate` ~ 6-10 (higher = snappier).
  // `color` may be a hex number (0xffb060) OR a CSS string ('#ffb060') — normalized internally.
  _flashLight(pos, color, peak, decayRate, dist) {
    const pool = this._lights;
    if (!pool || !pos) return false;
    // Cull if the event is far from the player (lights far away contribute nothing visible but
    // still cost a per-fragment eval). Generous radius so nearby fights still light up.
    const pp = this._playerPos();
    const d = Math.hypot((pos.x || 0) - pp.x, (pos.z || 0) - pp.z);
    if (d > 700) return false;
    const slot = pool[this._lightCur];
    this._lightCur = (this._lightCur + 1) % pool.length;
    const obj = slot.obj;
    if (!slot.active) {
      slot.active = true;
      this._activeLightCount++;
    }
    obj.position.set(pos.x || 0, 12, pos.z || 0); // lift above the play plane
    if (typeof color === 'number') obj.color.setHex(color);
    else obj.color.set(color); // CSS string ('#ffb060', 'rgb(...)', named)
    if (dist) obj.distance = dist;
    obj.visible = true;
    slot.peak = peak;
    slot.intensity = peak * 0.3; // start ramped partway (fast attack)
    slot.decay = decayRate || 8;
    slot.t = 0;
    return true;
  },

  _decayEventLights(dt) {
    const pool = this._lights;
    if (!pool) return;
    const ATTACK = 0.05; // seconds to reach peak after the initial partial ramp
    for (const slot of pool) {
      if (slot.peak <= 0) continue;
      slot.t += dt;
      if (slot.t < ATTACK) {
        // fast attack toward peak
        slot.intensity += (slot.peak - slot.intensity) * Math.min(1, dt / ATTACK);
      } else {
        // exponential decay toward 0
        slot.intensity += -slot.intensity * slot.decay * dt;
        if (slot.intensity < 0.02) {
          slot.intensity = 0;
          slot.peak = 0;
          slot.obj.visible = false;
          if (slot.active) {
            slot.active = false;
            this._activeLightCount = Math.max(0, this._activeLightCount - 1);
          }
        }
      }
      slot.obj.intensity = slot.intensity;
    }
  },

  _playerPos() {
    const e = this.state.entities.get(this.state.playerId);
    return e ? e.pos : { x: 0, z: 0 };
  },

  // per-frame engine-trail emission for every thrusting ship/drone (steady-state, pooled)
  _emitTrails(dt) {
    this._trailAcc = (this._trailAcc || 0) + dt;
    // emit at ~60 Hz cadence (one trail particle per ship per ~16ms)
    if (this._trailAcc < 0.016) return;
    const step = this._trailAcc; this._trailAcc = 0;
    this._refreshTrailCandidates();
    const list = this._trailCandidates;
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
  // Ribbon trails for medium-large ships: maintained per entity, updated each trail tick
  _ribbonTrails: null,
  _initRibbonTrails() { this._ribbonTrails = new Map(); },

  _updateRibbonTrails(dt) {
    if (!this._ribbonTrails || !this._scene) return;
    const state = this.state;
    this._refreshTrailCandidates();
    for (const e of this._ribbonCandidates) {
      if (!e.alive || (e.type !== 'ship' && e.type !== 'drone')) continue;
      if (e.flags && e.flags.docked) { const rt = this._ribbonTrails.get(e.id); if (rt) rt.clear(); continue; }
      const speed = Math.hypot((e.vel && e.vel.x) || 0, (e.vel && e.vel.z) || 0);
      if (speed < 4) continue;
      let trail = this._ribbonTrails.get(e.id);
      if (!trail) {
        const w = Math.max(2.5, (e.radius || 14) * 0.16);
        trail = makeRibbonTrail(this._scene, this._engineColor(e), 30, w);
        this._ribbonTrails.set(e.id, trail);
      }
      // sample from engine nozzle (rear of ship)
      const cf = Math.cos(e.rot), sf = Math.sin(e.rot);
      const back = (e.radius || 14) * 0.88;
      trail.push(e.pos.x - cf * back, e.pos.z - sf * back, e.rot);
      trail.rebuild(0.25 + Math.min(1, speed / Math.max(20, e.maxSpeed || 80)) * 0.4);
    }
    // dispose dead entities
    for (const [id, trail] of this._ribbonTrails) {
      const e = state.entities.get(id);
      if (!e || !e.alive) { trail.dispose(); this._ribbonTrails.delete(id); }
    }
  },

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
    if (this._liveCount <= 0) {
      this._pGeo.setDrawRange(0, 0);
      this._pDrawMax = 0;
      return;
    }
    const pos = this._pPos, col = this._pCol, size = this._pSize, alpha = this._pAlpha;
    const active = this._activeParticles;
    let writeMax = 0;
    let cursor = 0;
    while (cursor < this._liveCount) {
      const i = active[cursor];
      let age = this._age[i] + dt;
      const life = this._life[i];
      if (age >= life) {
        this._retireParticle(i);
        continue;
      }
      this._age[i] = age;
      const t = age / life;

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
      cursor++;
    }
    this._pDrawMax = writeMax;
    this._pGeo.setDrawRange(0, writeMax);
    if (writeMax > 0) {
      this._pGeo.attributes.position.needsUpdate = true;
      this._pGeo.attributes.aColor.needsUpdate = true;
      this._pGeo.attributes.aSize.needsUpdate = true;
      this._pGeo.attributes.aAlpha.needsUpdate = true;
    }
  },

  _integrateSprites(dt) {
    if (this._liveSpriteCount <= 0) return;
    const pool = this._spritePool, st = this._spr, active = this._activeSprites;
    let cursor = 0;
    while (cursor < this._liveSpriteCount) {
      const i = active[cursor];
      const s = st[i];
      s.age += dt;
      const t = s.age / s.life;
      const spr = pool[i];
      if (t >= 1) { this._retireSprite(i); continue; }
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
      cursor++;
    }
  },
};

// ---------------------------------------------------------------------------
// ribbon trail factory (tapering triangle-strip mesh for large ships — cleaner than particle only)
// ---------------------------------------------------------------------------
function makeRibbonTrail(scene, color, nSeg, baseWidth) {
  nSeg = nSeg || 30; baseWidth = baseWidth || 5;
  const verts = nSeg * 2;
  const pos = new Float32Array(verts * 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  posAttr.usage = THREE.DynamicDrawUsage;
  geo.setAttribute('position', posAttr);
  const idx = [];
  for (let i = 0; i < nSeg - 1; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color || '#7fe0ff'),
    transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  scene.add(mesh);

  const pts = new Float32Array(nSeg * 3); // x, z, rot per ring slot
  let head = 0, count = 0;

  return {
    push(x, z, rot) {
      pts[head * 3] = x; pts[head * 3 + 1] = z; pts[head * 3 + 2] = rot;
      head = (head + 1) % nSeg;
      if (count < nSeg) count++;
    },
    rebuild(opacity) {
      if (opacity != null) mat.opacity = opacity;
      for (let i = 0; i < nSeg; i++) {
        const t = i / Math.max(1, count - 1);
        const slot = ((head - 1 - i) % nSeg + nSeg) % nSeg;
        const x = pts[slot * 3], z = pts[slot * 3 + 1], rot = pts[slot * 3 + 2];
        const w = baseWidth * Math.max(0, 1 - t * 0.97);
        const px = Math.sin(rot) * w, pz = -Math.cos(rot) * w;
        const vi = i * 2;
        pos[vi * 3] = x + px; pos[vi * 3 + 1] = 0.4; pos[vi * 3 + 2] = z + pz;
        pos[(vi + 1) * 3] = x - px; pos[(vi + 1) * 3 + 1] = 0.4; pos[(vi + 1) * 3 + 2] = z - pz;
      }
      geo.attributes.position.needsUpdate = true;
    },
    clear() { count = 0; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// pure helpers (module scope)
// ---------------------------------------------------------------------------
function dirOf(rot) { return { x: Math.cos(rot), z: Math.sin(rot) }; }
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

function budgetInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.floor(n));
}

function presentationStyle(color0, color1, spriteKind, overrides = {}) {
  return {
    color0,
    color1,
    lightColor: overrides.lightColor || color1,
    spriteKind,
    spriteLife: overrides.spriteLife || 0.34,
    spriteSize0: overrides.spriteSize0 || 0.5,
    spriteSize1: overrides.spriteSize1 || 3.6,
    spriteOpacity: overrides.spriteOpacity || 0.82,
    echoRing: !!overrides.echoRing,
    radial: !!overrides.radial,
    spread: overrides.spread || 0.85,
    speed0: overrides.speed0 || 24,
    speedJitter: overrides.speedJitter || 30,
    life0: overrides.life0 || 0.32,
    lifeJitter: overrides.lifeJitter || 0.22,
    size0: overrides.size0 || 1.8,
    size1: overrides.size1 ?? 0.0,
    drag: overrides.drag || 2.2,
    y: overrides.y || 0,
    vy: overrides.vy || 0,
    lightPeak: overrides.lightPeak || 0,
    lightDecay: overrides.lightDecay || 9,
    lightDistance: overrides.lightDistance || 140,
  };
}

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
