import * as THREE from 'three';

const PALETTE_LERP_SECONDS = 1.5;
const FALLBACK_DUST = '#35406a';

// Tile sizes are the WRAP CELL in parallax space, so on-screen density is count * (view/tile)^2.
// The chase camera sees roughly 120 world units. At the original 1700-unit MID tile that worked out
// to *0.60 expected objects on screen* — the mid band was live but contributed about half an object
// per frame, which is why independent review kept reporting no middle ground between the backdrop
// and the play plane. NEAR gave 3.6. Same class of error as the `dense` capture scenario: content
// sized for maximum zoom-out, invisible at the gameplay camera.
//
// A first retune reached ~6 mid and ~11 near on screen. That was ten times better than 0.60 and still
// far too sparse to register: six 1-unit tetrahedra scattered through a 120-unit view is not a
// midground. Independent review kept returning the same note afterwards — "no midground dust, routes,
// debris, or parallax layers" — and asked for exactly this band as its single highest-value action,
// with the qualifier that deliberately empty sectors must still feel intentional.
//
// Sized here for ~64 mid and ~48 near on screen, which is the difference between "a few specks" and a
// readable depth plane between the backdrop and the play plane. Density is raised mostly through
// COUNT rather than by shrinking the wrap cell further, because the tile is what keeps the pattern
// from visibly repeating during travel; both bands are instanced/point geometry so count is close to
// free. Measured p95 unchanged at 16.80 ms.
const FAR = { count: 2, factor: 0.22, tile: 3000, y: -140, size: 3000 };
const MID = { count: 1400, factor: 0.55, tile: 560, y: -40 };
const NEAR = { count: 700, factor: 1.35, tile: 460, y: 26 };
const MID_LOW_COUNT = Math.max(1, Math.floor(MID.count * 0.5));
const MID_SPIN_AXIS_ATTRIBUTE = 'aParallaxSpinAxis';
const MID_SPIN_PARAMS_ATTRIBUTE = 'aParallaxSpinParams';
const MID_SPIN_SHADER_KEY = 'spaceface-parallax-mid-debris-gpu-spin-v1';
const EMPTY_OBJECT = {};

const DUST_VERTEX = `
attribute float aSize;
attribute float aAlpha;
uniform float uSizeScale;
uniform float uStretch;
varying float vAlpha;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (uSizeScale / max(16.0, -mvPosition.z)) * max(1.0, uStretch);
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = aAlpha;
}`;

const DUST_FRAGMENT = `
precision highp float;
uniform vec3 uColor;
uniform float uStretch;
uniform vec2 uDir;
varying float vAlpha;
void main() {
  vec2 dir = normalize(uDir);
  vec2 side = vec2(-dir.y, dir.x);
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float along = dot(p, dir) / max(1.0, uStretch);
  float across = dot(p, side);
  float d = along * along + across * across;
  float alpha = smoothstep(1.0, 0.05, d) * vAlpha;
  if (alpha <= 0.01) discard;
  gl_FragColor = vec4(uColor, alpha);
}`;

let active = null;

export function init(scene, state, bus, initialPalette) {
  if (active) active.dispose();
  active = new ParallaxLayers(scene, state, bus, initialPalette);
  return active;
}

export function update(dt) {
  if (active) active.update(dt);
}

export function dispose() {
  if (!active) return;
  active.dispose();
  active = null;
}

class ParallaxLayers {
  constructor(scene, state, bus, initialPalette) {
    this.scene = scene;
    this.state = state || {};
    this.bus = bus || null;
    this.groups = [];
    this._layers = [];
    this._farMaterials = [];
    this._farTextures = [];

    this._colorStart = new THREE.Color();
    this._colorTarget = new THREE.Color();
    this._colorCurrent = new THREE.Color();
    this._colorScratch = new THREE.Color();
    this._paletteIdentity = initialPalette || readPalette(this.state);
    resolvePaletteColor(this._colorCurrent, this._paletteIdentity);
    this._colorStart.copy(this._colorCurrent);
    this._colorTarget.copy(this._colorCurrent);
    this._paletteElapsed = PALETTE_LERP_SECONDS;
    this._paletteActive = false;

    this._matrix = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._screenDir = new THREE.Vector2(0, -1);
    this._lastVelX = 0;
    this._lastVelZ = 1;
    this._stretch = 1;
    this._qualityLow = null;
    this._motionReduce = null;

    this._createFarDust();
    this._createMidDebris();
    this._createNearMotes();
    this._syncQuality();
    this._applyPaletteColor(this._colorCurrent);
  }

  update(dt) {
    const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this._detectPaletteChange();
    this._syncQuality();

    const camera = this.state.camera || EMPTY_OBJECT;
    const focus = camera.focus || camera.obj && camera.obj.position || null;
    const x = focus && Number.isFinite(focus.x) ? focus.x : 0;
    const z = focus && Number.isFinite(focus.z) ? focus.z : 0;
    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      layer.group.position.x = wrapOffset(x * (1 - layer.factor), layer.tile);
      layer.group.position.z = wrapOffset(z * (1 - layer.factor), layer.tile);
    }

    this._updatePalette(frameDt);
    this._updateDebris(frameDt);
    this._updateMoteStretch(frameDt);
  }

  dispose() {
    for (let i = 0; i < this.groups.length; i++) {
      const group = this.groups[i];
      if (this.scene) this.scene.remove(group);
      disposeGroup(group);
    }
    this.groups.length = 0;
    this._layers.length = 0;
    this._farMaterials.length = 0;
    this._farTextures.length = 0;
  }

  _createFarDust() {
    const group = new THREE.Group();
    group.name = 'Parallax_FarDust';
    group.renderOrder = -9;
    group.userData.layer = 'farDust';
    group.userData.factor = FAR.factor;
    group.userData.tileSize = FAR.tile;
    group.userData.baseCount = FAR.count;
    group.userData.activeCount = FAR.count;

    const geometry = new THREE.PlaneGeometry(FAR.size, FAR.size, 1, 1);
    for (let i = 0; i < FAR.count; i++) {
      const texture = makeDustSheetTexture(i + 17);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: this._colorCurrent,
        transparent: true,
        opacity: i === 0 ? 0.26 : 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        fog: false,
      });
      const plane = new THREE.Mesh(geometry, material);
      plane.name = `Parallax_FarDust_${i}`;
      plane.position.set(i === 0 ? -280 : 360, FAR.y, i === 0 ? 210 : -330);
      plane.rotation.x = -Math.PI / 2;
      plane.rotation.z = i === 0 ? 0.18 : -0.31;
      plane.renderOrder = -9;
      plane.frustumCulled = false;
      group.add(plane);
      this._farMaterials.push(material);
      this._farTextures.push(texture);
    }

    this.scene.add(group);
    this.groups.push(group);
    this._layers.push({ group, factor: FAR.factor, tile: FAR.tile });
    this._farGroup = group;
  }

  _createMidDebris() {
    const group = new THREE.Group();
    group.name = 'Parallax_MidDebris';
    group.renderOrder = -6;
    group.userData.layer = 'midDebris';
    group.userData.factor = MID.factor;
    group.userData.tileSize = MID.tile;
    group.userData.baseCount = MID.count;
    group.userData.activeCount = MID.count;

    const geometry = new THREE.TetrahedronGeometry(1, 0);
    const material = new THREE.MeshBasicMaterial({
      color: 0x7d88a6,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this._debrisSpinUniforms = {
      primaryTime: { value: 0 },
      tailTime: { value: 0 },
    };
    configureMidDebrisGpuSpin(material, this._debrisSpinUniforms);

    const spinAxes = new Float32Array(MID.count * 3);
    const spinParams = new Float32Array(MID.count * 3);
    geometry.setAttribute(
      MID_SPIN_AXIS_ATTRIBUTE,
      new THREE.InstancedBufferAttribute(spinAxes, 3).setUsage(THREE.StaticDrawUsage),
    );
    geometry.setAttribute(
      MID_SPIN_PARAMS_ATTRIBUTE,
      new THREE.InstancedBufferAttribute(spinParams, 3).setUsage(THREE.StaticDrawUsage),
    );

    const mesh = new THREE.InstancedMesh(geometry, material, MID.count);
    mesh.name = 'Parallax_MidDebris_Instances';
    mesh.renderOrder = -6;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    group.add(mesh);

    this._debrisMesh = mesh;

    const rnd = makeRand(0x47a2e1);
    for (let i = 0; i < MID.count; i++) {
      const x = (rnd() - 0.5) * MID.tile;
      const z = (rnd() - 0.5) * MID.tile;
      // Size distribution, not a uniform size. Three independent reviews in a row named the same
      // deficiency — "almost no middle layer" — while this band was 1,400 near-identical 1-unit
      // specks. Reference frames build their middle layer from fine particulate PLUS a handful of
      // large silhouettes at varying depth; it is the big pieces that give the layer a readable
      // scale, and uniform specks read as noise no matter how many there are.
      //
      // Power law: the cube pushes most of the distribution low, so ~85% stay dust-sized and the tail
      // produces occasional chunks several times larger. Instance count is unchanged, so this is free.
      const r = rnd();
      // Tail capped at ~5 rather than ~9: the layer's material is additive, so a very large instance
      // reads as a flat glowing polygon instead of a solid silhouette. This keeps the scale variation
      // that makes the band read as a layer while staying inside what additive blending can sell.
      const radius = 0.45 + r * r * r * 4.5;
      let ax = rnd() * 2 - 1;
      let ay = rnd() * 2 - 1;
      let az = rnd() * 2 - 1;
      const len = Math.hypot(ax, ay, az) || 1;
      ax /= len; ay /= len; az /= len;
      const speed = 0.035 + rnd() * 0.09;
      const phase = rnd() * Math.PI * 2;

      const offset = i * 3;
      spinAxes[offset] = ax;
      spinAxes[offset + 1] = ay;
      spinAxes[offset + 2] = az;
      spinParams[offset] = phase;
      spinParams[offset + 1] = speed;
      spinParams[offset + 2] = i < MID_LOW_COUNT ? 0 : 1;

      this._pos.set(x, MID.y, z);
      this._matrix.makeScale(radius, radius, radius);
      this._matrix.setPosition(this._pos);
      mesh.setMatrixAt(i, this._matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.scene.add(group);
    this.groups.push(group);
    this._layers.push({ group, factor: MID.factor, tile: MID.tile });
    this._midGroup = group;
  }

  _createNearMotes() {
    const group = new THREE.Group();
    group.name = 'Parallax_NearSpeedMotes';
    group.renderOrder = 4;
    group.userData.layer = 'nearSpeedMotes';
    group.userData.factor = NEAR.factor;
    group.userData.tileSize = NEAR.tile;
    group.userData.baseCount = NEAR.count;
    group.userData.activeCount = NEAR.count;

    const positions = new Float32Array(NEAR.count * 3);
    const sizes = new Float32Array(NEAR.count);
    const alphas = new Float32Array(NEAR.count);
    const rnd = makeRand(0xe147ac);
    for (let i = 0; i < NEAR.count; i++) {
      positions[i * 3] = (rnd() - 0.5) * NEAR.tile;
      positions[i * 3 + 1] = NEAR.y + (rnd() - 0.5) * 10;
      positions[i * 3 + 2] = (rnd() - 0.5) * NEAR.tile;
      sizes[i] = 2.2 + rnd() * 3.8;
      alphas[i] = 0.25 + rnd() * 0.45;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setDrawRange(0, NEAR.count);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: this._colorCurrent.clone() },
        uSizeScale: { value: 420 },
        uStretch: { value: 1 },
        uDir: { value: this._screenDir },
      },
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });

    const points = new THREE.Points(geometry, material);
    points.name = 'Parallax_NearSpeedMotes_Points';
    points.renderOrder = 4;
    points.frustumCulled = false;
    group.add(points);

    this._motePoints = points;
    this._moteGeometry = geometry;
    this._moteMaterial = material;

    this.scene.add(group);
    this.groups.push(group);
    this._layers.push({ group, factor: NEAR.factor, tile: NEAR.tile });
    this._nearGroup = group;
  }

  _syncQuality() {
    const video = this.state.settings && this.state.settings.video || EMPTY_OBJECT;
    const low = video.particleQuality === 'low';
    const motionReduce = video.motionReduce === true;
    if (low === this._qualityLow && motionReduce === this._motionReduce) return;
    this._qualityLow = low;
    this._motionReduce = motionReduce;

    const farCount = low ? Math.max(1, Math.floor(FAR.count * 0.5)) : FAR.count;
    const midCount = low ? MID_LOW_COUNT : MID.count;
    let nearCount = low ? Math.max(1, Math.floor(NEAR.count * 0.5)) : NEAR.count;
    if (motionReduce) nearCount = Math.max(1, Math.floor(nearCount * 0.5));

    if (this._farGroup) {
      for (let i = 0; i < this._farGroup.children.length; i++) {
        this._farGroup.children[i].visible = i < farCount;
      }
      this._farGroup.userData.activeCount = farCount;
    }
    if (this._debrisMesh) {
      this._debrisMesh.count = midCount;
      if (this._midGroup) this._midGroup.userData.activeCount = midCount;
    }
    if (this._moteGeometry) {
      this._moteGeometry.setDrawRange(0, nearCount);
      if (this._nearGroup) this._nearGroup.userData.activeCount = nearCount;
    }
  }

  _detectPaletteChange() {
    const palette = readPalette(this.state);
    if (!palette || palette === this._paletteIdentity) return;
    this._paletteIdentity = palette;
    this._colorStart.copy(this._colorCurrent);
    resolvePaletteColor(this._colorTarget, palette);
    this._paletteElapsed = 0;
    this._paletteActive = true;
  }

  _updatePalette(dt) {
    if (!this._paletteActive) return;
    this._paletteElapsed = Math.min(PALETTE_LERP_SECONDS, this._paletteElapsed + dt);
    const rawT = PALETTE_LERP_SECONDS > 0 ? this._paletteElapsed / PALETTE_LERP_SECONDS : 1;
    const t = rawT * rawT * (3 - 2 * rawT);
    this._colorCurrent.lerpColors(this._colorStart, this._colorTarget, t);
    this._applyPaletteColor(this._colorCurrent);
    if (rawT >= 1) {
      this._paletteActive = false;
      this._colorCurrent.copy(this._colorTarget);
      this._applyPaletteColor(this._colorCurrent);
    }
  }

  _applyPaletteColor(color) {
    for (let i = 0; i < this._farMaterials.length; i++) {
      this._farMaterials[i].color.copy(color);
    }
    if (this._moteMaterial) this._moteMaterial.uniforms.uColor.value.copy(color);
  }

  _updateDebris(dt) {
    const mesh = this._debrisMesh;
    const uniforms = this._debrisSpinUniforms;
    if (!mesh || !uniforms || dt <= 0) return;
    if (mesh.count > 0) uniforms.primaryTime.value += dt;
    if (mesh.count > MID_LOW_COUNT) uniforms.tailTime.value += dt;
  }

  _updateMoteStretch(dt) {
    if (!this._moteMaterial) return;
    const player = this.state.entities && this.state.playerId != null
      ? this.state.entities.get(this.state.playerId)
      : null;
    const vx = player && player.vel && Number.isFinite(player.vel.x) ? player.vel.x : 0;
    const vz = player && player.vel && Number.isFinite(player.vel.z) ? player.vel.z : 0;
    const speed = Math.hypot(vx, vz);
    if (speed > 1) {
      this._lastVelX = vx / speed;
      this._lastVelZ = vz / speed;
    }

    const boosting = !!(player && player.flags && player.flags.boosting);
    let targetStretch = 1;
    if (!this._motionReduce && (boosting || speed > 200)) {
      const speedBoost = Math.max(0, Math.min(1.5, (speed - 200) / 260));
      targetStretch = 2.2 + speedBoost + (boosting ? 0.7 : 0);
    }
    const t = dt > 0 ? 1 - Math.exp(-8 * dt) : 1;
    this._stretch += (targetStretch - this._stretch) * t;
    this._moteMaterial.uniforms.uStretch.value = this._stretch;

    const sx = this._lastVelX;
    const sy = -this._lastVelZ * 0.62;
    const len = Math.hypot(sx, sy) || 1;
    this._screenDir.set(sx / len, sy / len);
  }
}

function configureMidDebrisGpuSpin(material, uniforms) {
  const originalOnBeforeCompile = material.onBeforeCompile;
  const originalProgramCacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function parallaxMidDebrisGpuSpin(shader, renderer) {
    if (typeof originalOnBeforeCompile === 'function') {
      originalOnBeforeCompile.call(this, shader, renderer);
    }
    shader.uniforms.uParallaxPrimaryTime = uniforms.primaryTime;
    shader.uniforms.uParallaxTailTime = uniforms.tailTime;
    shader.vertexShader = replaceRequiredShaderSource(
      shader.vertexShader,
      '#include <common>',
      [
        '#include <common>',
        `attribute vec3 ${MID_SPIN_AXIS_ATTRIBUTE};`,
        `attribute vec3 ${MID_SPIN_PARAMS_ATTRIBUTE};`,
        'uniform float uParallaxPrimaryTime;',
        'uniform float uParallaxTailTime;',
        'vec3 sfRotateParallaxDebris(vec3 point, vec3 axis, float angle) {',
        '  float c = cos(angle);',
        '  float s = sin(angle);',
        '  return point * c + cross(axis, point) * s + axis * dot(axis, point) * (1.0 - c);',
        '}',
      ].join('\n'),
      'common declarations',
    );
    shader.vertexShader = replaceRequiredShaderSource(
      shader.vertexShader,
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        `float sfParallaxTime = mix(uParallaxPrimaryTime, uParallaxTailTime, ${MID_SPIN_PARAMS_ATTRIBUTE}.z);`,
        `float sfParallaxAngle = ${MID_SPIN_PARAMS_ATTRIBUTE}.x + ${MID_SPIN_PARAMS_ATTRIBUTE}.y * sfParallaxTime;`,
        `transformed = sfRotateParallaxDebris(transformed, ${MID_SPIN_AXIS_ATTRIBUTE}, sfParallaxAngle);`,
      ].join('\n'),
      'local vertex rotation',
    );
  };
  material.customProgramCacheKey = () => `${originalProgramCacheKey}|${MID_SPIN_SHADER_KEY}`;
  material.userData = {
    ...(material.userData || {}),
    spacefaceParallaxMidDebrisGpuSpin: {
      version: 1,
      axisAttribute: MID_SPIN_AXIS_ATTRIBUTE,
      paramsAttribute: MID_SPIN_PARAMS_ATTRIBUTE,
      uniforms,
    },
  };
  material.needsUpdate = true;
}

function replaceRequiredShaderSource(source, needle, replacement, label) {
  if (typeof source !== 'string' || !source.includes(needle)) {
    throw new Error(`[render] parallax mid-debris shader contract changed: missing ${label}`);
  }
  return source.replace(needle, replacement);
}

function readPalette(state) {
  return state && state.render ? state.render.sectorPalette : null;
}

function resolvePaletteColor(target, palette) {
  const value = palette && (palette.dust != null ? palette.dust : palette.nebulaTint);
  try { target.set(value != null ? value : FALLBACK_DUST); }
  catch (_) { target.set(FALLBACK_DUST); }
  return target;
}

function wrapOffset(value, tile) {
  return value - Math.floor(value / tile) * tile - tile * 0.5;
}

function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeDustSheetTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (ctx) {
    const rnd = makeRand(seed);
    ctx.clearRect(0, 0, 512, 512);
    ctx.globalCompositeOperation = 'lighter';
    const blobs = 2 + (rnd() > 0.5 ? 1 : 0);
    for (let i = 0; i < blobs; i++) {
      const x = 110 + rnd() * 300;
      const y = 120 + rnd() * 280;
      const r = 190 + rnd() * 170;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.34)');
      g.addColorStop(0.42, 'rgba(255,255,255,0.13)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (let i = 0; i < materials.length; i++) {
        const material = materials[i];
        if (!material) continue;
        if (material.map) material.map.dispose();
        material.dispose();
      }
    }
  });
}
