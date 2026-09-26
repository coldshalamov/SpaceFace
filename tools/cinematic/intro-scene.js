// SpaceFace — INTRO CINEMATIC (offline render harness)
//
// A fully deterministic, shot-structured intro visualizer rendered with the game's own
// GLB assets. Everything is a pure function of time t — scripts/render-intro-cinematic.mjs
// steps t frame-by-frame and bakes the result to assets/cinematics/intro-visualizer.mp4,
// which plays on the boot overlay and the title splash instead of a live render.
//
// Six shots, ~32s, seamless loop: the last frame and the first both sit on the same
// near-black field so the mp4 can loop invisibly behind the loader.
//
//   WAKE     0.0– 4.0  dead field; a nav buoy strobes; a huge rock slides past the frame edge
//   WITNESS  4.0–10.4  a pressure helmet tumbles through a single warm light and eclipses it
//   FIELD   10.4–16.6  wreck drift at several depths moving on different vectors
//   COURIER 16.6–22.4  the Kestrel enters close, banks, and burns away toward the gate
//   GATE    22.4–28.8  approach the jump ring; rim strobes chase; the anomaly holds centre
//   LAPSE   28.8–32.0  through the throat; debris rises past the camera; fade to the same black

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const INTRO_SPEC = Object.freeze({ duration: 32, fps: 24, width: 1920, height: 1080 });

const TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => t * t * (3 - 2 * t);
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// Deterministic hash noise — the whole cut is a pure function of t.
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
// Layered-sine "handheld" drift: non-repeating-feeling but perfectly periodic-safe.
const sway = (t, a, b, c) => Math.sin(t * a) * .62 + Math.sin(t * b + 1.7) * .27 + Math.sin(t * c + 4.1) * .11;

const ASSET_ROOT = '../../assets/ships/release/parts/';
const MODELS = {
  kestrel: 'wholeships/kestrel.glb',
  gate: 'places/place_gate_jump_ring.glb',
  rockA: 'places/place_asteroid_rock_a.glb',
  rockB: 'places/place_asteroid_rock_b.glb',
  rockC: 'places/place_asteroid_rock_c.glb',
  buoy: 'places/place_nav_buoy.glb',
  ringSpan: 'places/place_aftermath_deb_ore_freighter_ring_span.glb',
  corvetteFwd: 'places/place_aftermath_wreck_corvette_forward__stripped_heavy.glb',
  cableBundle: 'places/place_aftermath_frag_cable_bundle.glb',
  grating: 'places/place_aftermath_frag_grating_sheet.glb',
  cargoPod: 'places/place_cargo_pod_standard.glb',
  memorial: 'places/place_memorial_array.glb',
};

// ---------------------------------------------------------------- materials

function radialGlowTexture(inner = '#ffffff', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
let GLOW_TEX = null;
function glowSprite(color, scale = 1) {
  if (!GLOW_TEX) GLOW_TEX = radialGlowTexture();
  const m = new THREE.SpriteMaterial({
    map: GLOW_TEX, color, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}

// Scuffed pressure-shell paint for the Witness helmet — procedural worn white.
function helmetShellMaterial(envMap) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b9b6ad';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = hash(i * 1.3) * 256, y = hash(i * 2.7) * 256;
    const r = .5 + hash(i * 3.1) * 2.2;
    g.fillStyle = `rgba(${hash(i) > .6 ? '70,66,58' : '198,196,188'},${.05 + hash(i * 7.7) * .16})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  for (let i = 0; i < 60; i++) { // hairline scuffs
    const x = hash(i * 5.1) * 256, y = hash(i * 9.3) * 256, a = hash(i * 4.4) * TAU, l = 4 + hash(i) * 26;
    g.strokeStyle = `rgba(58,54,46,${.08 + hash(i * 2.2) * .2})`;
    g.lineWidth = .6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: tex, color: 0x8f8c84, roughness: .7, metalness: .05,
    envMap, envMapIntensity: .5,
  });
}

// ---------------------------------------------------------------- builders

// "The Witness" — an EVA pressure helmet as a salvage-horror relic. A shell, a dark
// visor that catches light like an eye, neck bellows, comms pack, hoses, a dying lamp.
function makeHelmet(envMap) {
  const g = new THREE.Group();
  const shellMat = helmetShellMaterial(envMap);
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: .5, metalness: .35, envMap, envMapIntensity: .7 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8a4a26, roughness: .45, metalness: .6, envMap, envMapIntensity: .9 });

  // Shell — sphere with the face sphere flattened slightly forward.
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36), shellMat);
  shell.scale.set(0.96, 1.06, 0.98);
  g.add(shell);

  // Visor — a wide dark lens that protrudes through the shell on the +X cap so
  // it actually reads as a faceplate, glossy enough to mirror whatever passes.
  const visorGeo = new THREE.SphereGeometry(0.94, 48, 32, -0.75, 1.5, 0.75, 1.55);
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0d14, roughness: .12, metalness: .9,
    clearcoat: .4, clearcoatRoughness: .08,
    envMap, envMapIntensity: 0.85, side: THREE.FrontSide,
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0.30, -0.04, 0);
  visor.rotation.y = Math.PI / 2; // face +X (game forward convention)
  g.add(visor);
  // Visor bezel.
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.055, 12, 40), trimMat);
  bezel.position.copy(visor.position); bezel.rotation.y = Math.PI / 2;
  bezel.scale.set(1, 1.18, 1);
  bezel.position.x += 0.12;
  g.add(bezel);

  // Neck bellows — stacked rings under the shell.
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62 - i * 0.045, 0.055, 10, 28), darkMat);
    ring.position.y = -1.02 - i * 0.085;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.52, 0.3, 24, 1, true), darkMat);
  neck.position.y = -1.12; g.add(neck);

  // Rear life-pack hump.
  const pack = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), shellMat);
  pack.scale.set(0.7, 0.85, 0.75);
  pack.position.set(-0.78, -0.15, 0);
  g.add(pack);
  const packPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.66), darkMat);
  packPlate.position.set(-0.94, -0.3, 0);
  g.add(packPlate);
  for (let i = 0; i < 4; i++) { // vent slots
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.5), trimMat);
    slot.position.set(-1.19, -0.18 - i * 0.09, 0);
    g.add(slot);
  }

  // Side comms box + dying lamp.
  const comm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.2), darkMat);
  comm.position.set(0.15, 0.32, 0.88);
  g.add(comm);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x201108, emissive: 0xff9a3c, emissiveIntensity: 1.5 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMat);
  lamp.position.set(0.3, 0.44, 0.96);
  g.add(lamp);
  // No sprite for the lamp — the emissive bead plus bloom is enough; a sprite
  // at this scale reads as a detached orb.
  const lampGlow = { material: { opacity: 0 }, position: lamp.position };

  // Two hose arcs down the back.
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: .8, metalness: .1 });
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.28, 0.5, side * 0.55),
      new THREE.Vector3(-0.3, 0.25, side * 0.95),
      new THREE.Vector3(-0.85, -0.3, side * 0.6),
      new THREE.Vector3(-0.95, -0.65, side * 0.3),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.045, 8), hoseMat));
  }
  // Chin lamp cluster.
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), trimMat);
    d.position.set(0.86, -0.62 + i * 0.1, 0.28 - i * 0.28);
    g.add(d);
  }
  return { group: g, visorMat, lampMat, lampGlow };
}

// The anomaly — an absorbing black sphere with a violet fresnel skin and warped
// accretion arcs, plus a debris ring that drifts slowly INWARD (wrong direction).
function makeAnomaly() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(22, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 }));
  g.add(core);
  // Fresnel halo — violet skin that is brightest at grazing angle.
  const haloMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x7a3cff) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
        float pulse = 0.82 + 0.18 * sin(uTime * 0.9);
        gl_FragColor = vec4(uColor * f * pulse * 1.6, f * 0.9);
      }`,
  });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(23.6, 48, 32), haloMat));

  // Warped accretion arcs — three rings at different tilts and radii.
  const arcs = [];
  const arcMat = new THREE.MeshBasicMaterial({ color: 0x6a3cd0, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcMat2 = new THREE.MeshBasicMaterial({ color: 0x2fa898, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcDef = [
    { r: 40, tube: 0.5, tilt: 0.32, speed: 0.09, mat: arcMat },
    { r: 58, tube: 0.35, tilt: 0.38, speed: -0.06, mat: arcMat2 },
    { r: 82, tube: 0.28, tilt: 0.30, speed: 0.038, mat: arcMat },
  ];
  for (const d of arcDef) {
    const geo = new THREE.TorusGeometry(d.r, d.tube, 8, 140, TAU * 0.94);
    const m = new THREE.Mesh(geo, d.mat);
    m.rotation.x = Math.PI / 2 + d.tilt;
    m.userData.speed = d.speed;
    arcs.push(m); g.add(m);
  }
  // Inward-spiralling debris shards.
  const shardGeo = new THREE.IcosahedronGeometry(0.9, 0);
  const shardMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: .9, metalness: .3 });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, 90);
  const shardData = [];
  for (let i = 0; i < 90; i++) {
    shardData.push({
      r0: 60 + hash(i * 3.3) * 130,
      a0: hash(i * 7.1) * TAU,
      y: (hash(i * 5.5) - 0.5) * 46,
      spd: 0.5 + hash(i * 9.7) * 0.8,
      rot: hash(i * 2.9) * TAU,
    });
  }
  g.add(shards);
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  function update(t) {
    haloMat.uniforms.uTime.value = t;
    for (const a of arcs) a.rotation.z = t * a.userData.speed;
    for (let i = 0; i < shardData.length; i++) {
      const d = shardData[i];
      const life = (t * 0.028 * d.spd + hash(i * 4.7)) % 1;   // 1→0 inward
      const r = lerp(d.r0, 24, easeIn(life));
      const ang = d.a0 + t * (0.05 + d.spd * 0.03);
      _p.set(Math.cos(ang) * r, d.y * (1 - life * 0.7), Math.sin(ang) * r);
      _e.set(t * d.spd, d.rot + t * 0.4, 0);
      _q.setFromEuler(_e);
      _s.setScalar(lerp(1, 0.25, life));
      _m4.compose(_p, _q, _s);
      shards.setMatrixAt(i, _m4);
    }
    shards.instanceMatrix.needsUpdate = true;
  }
  return { group: g, update };
}

// Engine flare cluster for a hull — additive glows + plume cone + light.
function makeEngineFlare(color = 0x9fd8ff) {
  const g = new THREE.Group();
  const core = glowSprite(color, 3.2);
  const halo = glowSprite(color, 7.5); halo.material.opacity = 0.35;
  g.add(core, halo);
  // Plume: stretched additive cone behind the nozzle.
  const plumeMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uPow; varying vec2 vUv;
      void main(){
        float along = vUv.y;                 // 1 at nozzle, 0 at tail
        float edge = sin(vUv.x * 3.14159);
        float a = pow(along, 1.8) * edge * 0.55 * uPow;
        gl_FragColor = vec4(uColor * a * 2.2, a);
      }`,
  });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(1.1, 16, 24, 6, true), plumeMat);
  plume.rotation.z = Math.PI / 2;   // cone axis → -X (astern)
  plume.position.x = -8;
  g.add(plume);
  const light = new THREE.PointLight(color, 900, 260, 2);
  g.add(light);
  return { group: g, core, halo, plume, plumeMat, light };
}

// Blinking strobe package — sprite + light, irregular double/triple pulse train.
function makeStrobe(color = 0xff2a20) {
  const g = new THREE.Group();
  const s = glowSprite(color, 4.5);
  g.add(s);
  const l = new THREE.PointLight(color, 0, 420, 2);
  g.add(l);
  return {
    group: g, sprite: s, light: l,
    // pulse(t, period, phase): sharp strobe pattern with a ghost double-blink.
    pulse(t, period = 2.3, phase = 0) {
      const u = ((t / period) + phase) % 1;
      const main = Math.exp(-Math.pow((u - 0.08) * 26, 2));
      const ghost = Math.exp(-Math.pow((u - 0.19) * 34, 2)) * 0.5;
      const v = main + ghost;
      s.material.opacity = clamp(v, 0, 1);
      s.scale.setScalar(4.5 + v * 7);
      l.intensity = v * 1400;
      return v;
    },
  };
}

// Starfield — two shells of shader points, subtle twinkle, no skybox texture.
function makeStars() {
  const layers = [];
  for (const [count, size, tint, spread] of [[2600, 2.3, 0xbfd0e8, 2600], [420, 3.7, 0xeef4ff, 2400]]) {
    const pos = new Float32Array(count * 3), phase = new Float32Array(count), mag = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // rejection-free sphere shell
      const u = hash(i * 3.71 + size), v = hash(i * 7.13 + count), w = hash(i * 1.97);
      const th = u * TAU, ph = Math.acos(2 * v - 1), r = spread * (0.8 + w * 0.2);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      phase[i] = hash(i * 4.3) * TAU;
      mag[i] = 0.35 + hash(i * 6.7) * 0.65;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(tint) }, uSize: { value: size } },
      vertexShader: `
        attribute float aPhase; attribute float aMag; uniform float uTime; uniform float uSize;
        varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.75 + 0.25 * sin(uTime * (0.4 + aMag * 0.6) + aPhase);
          vA = aMag * tw;
          gl_PointSize = uSize * aMag;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(d)) * vA;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    layers.push({ pts, mat });
  }
  return {
    group: new THREE.Group().add(...layers.map(l => l.pts)),
    update(t) { for (const l of layers) l.mat.uniforms.uTime.value = t; },
  };
}

// Nebula: a few huge, very dim radial-gradient billboards — cold violet/teal wash.
function makeNebula() {
  const g = new THREE.Group();
  const defs = [
    { c1: 'rgba(48,30,80,0.30)', c2: 'rgba(0,0,0,0)', at: [-900, 300, -1500], s: 1600 },
    { c1: 'rgba(18,60,66,0.26)', c2: 'rgba(0,0,0,0)', at: [1200, -200, -1700], s: 1900 },
    { c1: 'rgba(64,32,20,0.18)', c2: 'rgba(0,0,0,0)', at: [-300, -600, -1400], s: 1300 },
    { c1: 'rgba(30,20,60,0.26)', c2: 'rgba(0,0,0,0)', at: [500, 700, -1900], s: 1700 },
  ];
  for (const d of defs) {
    const tex = radialGlowTexture(d.c1, d.c2);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    m.position.set(...d.at);
    m.scale.setScalar(d.s);
    g.add(m);
  }
  return g;
}

// Camera-parented dust motes — always some near-field parallax.
function makeDust(count = 700) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (hash(i * 1.7) - 0.5) * 160;
    pos[i * 3 + 1] = (hash(i * 2.9) - 0.5) * 90;
    pos[i * 3 + 2] = -hash(i * 4.3) * 140 - 4;
    seed[i] = hash(i * 8.3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aSeed; uniform float uTime; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.11 + aSeed * 40.0) * 3.0;
        p.y += cos(uTime * 0.13 + aSeed * 31.0) * 2.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vA = smoothstep(140.0, 30.0, d) * (0.05 + aSeed * 0.12);
        gl_PointSize = 1.0 + aSeed * 1.6;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(d)) * vA;
        gl_FragColor = vec4(vec3(0.65, 0.75, 0.85) * a, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, mat };
}

// Final grade pass — vignette, grain, chromatic aberration, split-tone, fades, flicker.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },      // 0 = black
    uFlicker: { value: 0 },   // luminance dip 0..1
    uCA: { value: 0.018 },    // chromatic aberration — subtle edge fringes only
    uGrain: { value: 0.038 },
    uVig: { value: 0.30 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uFade, uFlicker, uCA, uGrain, uVig;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // chromatic aberration, stronger at edges
      vec2 off = c * (uCA * r2 * 2.2);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // split tone: cool shadows, faint warm highs
      col = mix(col, col * vec3(0.92, 1.0, 1.12), (1.0 - smoothstep(0.0, 0.55, dot(col, vec3(0.333)))));
      col += vec3(0.012, 0.010, 0.006) * smoothstep(0.55, 1.0, dot(col, vec3(0.333)));
      // vignette
      col *= 1.0 - uVig * smoothstep(0.12, 0.62, r2);
      // film grain, animated
      float g = rnd(uv * vec2(1920.0, 1080.0) + fract(uTime * 13.7) * 91.7) - 0.5;
      col += g * uGrain * (0.4 + 0.6 * (1.0 - clamp(dot(col, vec3(0.333)) * 2.0, 0.0, 1.0)));
      // flicker dip (frames where the signal skips)
      col *= 1.0 - uFlicker * 0.24;
      // fade
      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// ---------------------------------------------------------------- loading

async function loadAll(renderer) {
  const gltf = new GLTFLoader();
  const ktx2 = new KTX2Loader().setTranscoderPath('../../vendor/addons/libs/basis/').detectSupport(renderer);
  gltf.setKTX2Loader(ktx2);
  gltf.setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  const jobs = Object.entries(MODELS).map(async ([key, rel]) => {
    const asset = await gltf.loadAsync(ASSET_ROOT + rel);
    const root = asset.scene;
    // Assets ship LOD0/1/2 meshes in one file — keep LOD0 only or they triple-render.
    const drop = [];
    root.traverse((o) => { if (/^LOD[12]_/.test(o.name)) drop.push(o); });
    for (const o of drop) o.parent && o.parent.remove(o);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const centre = new THREE.Vector3(); box.getCenter(centre);
    root.position.sub(centre);                    // recentre
    const wrap = new THREE.Group(); wrap.add(root);
    wrap.userData.size = size;
    out[key] = wrap;
  });
  await Promise.all(jobs);
  return out;
}

function scaleTo(wrap, largest) {
  const s = largest / Math.max(wrap.userData.size.x, wrap.userData.size.y, wrap.userData.size.z);
  wrap.scale.setScalar(s);
  return wrap;
}

// ---------------------------------------------------------------- cinematic

export async function createIntroCinematic({ canvas, width = 1920, height = 1080 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010204);
  scene.fog = new THREE.FogExp2(0x05070d, 0.00055);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 9000);
  scene.add(camera);

  // Environment reflections — a dark world with one cold source and one warm one
  // so metals and the visor have something to answer.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x030509);
  const warm = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: 0xffb36a }));
  warm.position.set(30, 6, 18); warm.lookAt(0, 0, 0);
  const cold = new THREE.Mesh(new THREE.PlaneGeometry(46, 46),
    new THREE.MeshBasicMaterial({ color: 0x2c4a78 }));
  cold.position.set(-40, 22, -30); cold.lookAt(0, 0, 0);
  envScene.add(warm, cold);
  const envMap = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();

  const assets = await loadAll(renderer);
  // Give every GLB the env light and sane tone response.
  for (const key of Object.keys(assets)) {
    assets[key].traverse((o) => {
      if (o.isMesh && o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if ('envMap' in m) { m.envMap = envMap; m.envMapIntensity = 0.7; }
          m.needsUpdate = true;
        }
      }
    });
  }

  // Shared field dressing.
  const stars = makeStars(); scene.add(stars.group);
  const nebula = makeNebula(); scene.add(nebula);
  const dust = makeDust(); camera.add(dust.pts);

  // ================================================================ SHOT RIGS

  // ---- WAKE -----------------------------------------------------------------
  const wake = new THREE.Group();
  const wakeRock = scaleTo(assets.rockB, 260);
  wakeRock.position.set(-120, -18, -250);
  wakeRock.rotation.set(0.6, 0.4, 0.2);
  const wakeRock2 = scaleTo(assets.rockA, 60);
  wakeRock2.position.set(120, 40, -190);
  const wakeBuoy = scaleTo(assets.buoy, 20);
  wakeBuoy.position.set(56, -6, -160);
  const wakeStrobe = makeStrobe(0xff2a20);
  wakeStrobe.group.position.set(56, 2, -160);
  const wakeKey = new THREE.DirectionalLight(0x6f8cb8, 1.6);
  wakeKey.position.set(-0.4, 0.8, -0.4);
  const wakeHemi = new THREE.HemisphereLight(0x283450, 0x080a10, 0.9);
  wake.add(wakeRock, wakeRock2, wakeBuoy, wakeStrobe.group, wakeKey, wakeHemi);
  scene.add(wake);

  // ---- WITNESS ---------------------------------------------------------------
  const witness = new THREE.Group();
  const helmet = makeHelmet(envMap);
  helmet.group.scale.setScalar(1.7);
  helmet.group.position.set(0, 0, -13);
  witness.add(helmet.group);
  // The warm worklight the helmet eclipses — a physical glow far behind it,
  // placed low so the helmet crosses its bearing mid-shot.
  const witnessLamp = glowSprite(0xffb36a, 5);
  witnessLamp.position.set(-7, -12, -140);
  const witnessLampLight = new THREE.PointLight(0xffa860, 3400, 900, 2);
  witnessLampLight.position.copy(witnessLamp.position);
  const witnessRim = new THREE.DirectionalLight(0x9fb8e8, 4.2);
  witnessRim.position.set(-0.7, 0.4, 0.6);
  const witnessFill = new THREE.DirectionalLight(0x38445f, 0.85);
  witnessFill.position.set(0.5, -0.6, 0.4);
  witness.add(witnessLamp, witnessLampLight, witnessRim, witnessFill);
  // A shard crossing faster behind — parallax marker.
  const witnessShard = scaleTo(assets.grating, 8);
  witnessShard.position.set(-70, 16, -85);
  // Mute the shard's paint — a dark silhouette marker, not a color object.
  witnessShard.traverse((o) => {
    if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.35); }
  });
  witness.add(witnessShard);
  scene.add(witness);

  // ---- FIELD -----------------------------------------------------------------
  const field = new THREE.Group();
  const fieldSpan = scaleTo(assets.ringSpan, 240);
  fieldSpan.position.set(-40, -20, -420);
  fieldSpan.rotation.set(0.4, 0.9, 0.3);
  const fieldCorvette = scaleTo(assets.corvetteFwd, 90);
  fieldCorvette.position.set(160, 30, -260);
  fieldCorvette.rotation.set(0.2, -0.8, 0.5);
  const fieldCables = scaleTo(assets.cableBundle, 26);
  fieldCables.position.set(40, -40, -120);
  const fieldRock = scaleTo(assets.rockC, 120);
  fieldRock.position.set(-220, 60, -300);
  const fieldPod = scaleTo(assets.cargoPod, 9);
  fieldPod.position.set(-30, 4, -60);           // near-plane crosser
  const fieldBuoyA = scaleTo(assets.buoy.clone(), 12);
  fieldBuoyA.position.set(-160, -50, -500);
  const fieldStrobeA = makeStrobe(0xff3428);
  fieldStrobeA.group.position.copy(fieldBuoyA.position);
  const fieldMemorial = scaleTo(assets.memorial, 90);
  fieldMemorial.position.set(300, -80, -560);
  const fieldKey = new THREE.DirectionalLight(0xffb07a, 2.3);
  fieldKey.position.set(-0.8, 0.15, 0.5);
  const fieldRim = new THREE.DirectionalLight(0x5a7cae, 1.4);
  fieldRim.position.set(0.6, 0.5, -0.6);
  const fieldHemi = new THREE.HemisphereLight(0x1e2840, 0x0a0c12, 0.85);
  field.add(fieldSpan, fieldCorvette, fieldCables, fieldRock, fieldPod, fieldBuoyA, fieldStrobeA.group,
    fieldMemorial, fieldKey, fieldRim, fieldHemi);
  scene.add(field);

  // ---- COURIER ----------------------------------------------------------------
  const courier = new THREE.Group();
  const ship = scaleTo(assets.kestrel, 34);
  const flare = makeEngineFlare(0x9fd8ff);
  flare.group.position.set(-17.5, 0.4, 0);   // astern of +X-forward hull
  ship.add(flare.group);
  courier.add(ship);
  const courierKey = new THREE.DirectionalLight(0xcfe0ff, 2.4);
  courierKey.position.set(-0.5, 0.8, 0.4);
  const courierRim = new THREE.DirectionalLight(0x7fa8ff, 1.7);
  courierRim.position.set(0.7, 0.3, -0.6);
  const courierHemi = new THREE.HemisphereLight(0x2c3852, 0x0c0e16, 0.8);
  // Passing bar light — a station lamp the ship flies under.
  const barLight = new THREE.PointLight(0xffc080, 3200, 320, 2);
  barLight.position.set(0, 60, -120);
  const barGlow = glowSprite(0xffc080, 9); barGlow.position.copy(barLight.position);
  // Distant gate visible at end of the shot — a clone: the same asset also stars in GATE.
  const farGate = scaleTo(assets.gate.clone(), 300);
  farGate.position.set(-700, 60, -1400);
  farGate.rotation.y = 0.5;
  courier.add(courierKey, courierRim, courierHemi, barLight, barGlow, farGate);
  scene.add(courier);

  // ---- GATE -------------------------------------------------------------------
  const gateShot = new THREE.Group();
  const gate = scaleTo(assets.gate, 300);
  gate.position.set(0, 10, -220);
  // bore axis toward camera — the ring reads as a ring, not a wall
  gate.rotation.set(0.10, 1.5, -0.2);
  gateShot.add(gate);
  const anomaly = makeAnomaly();
  anomaly.group.scale.setScalar(1.35);
  anomaly.group.position.copy(gate.position);
  anomaly.group.rotation.copy(gate.rotation);
  gateShot.add(anomaly.group);
  // pull the anomaly deeper into the throat so its arcs read through the ring
  anomaly.group.translateZ(-45);
  // Chase strobes around the rim — a local ring of sprites in gate space.
  const rimStrobes = [];
  const rimLocal = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const s = glowSprite(0xffa040, 5);
    s.position.set(Math.cos(a) * 150, Math.sin(a) * 150, 0);
    rimLocal.add(s);
    rimStrobes.push(s);
  }
  rimLocal.position.copy(gate.position);
  rimLocal.rotation.copy(gate.rotation);
  gateShot.add(rimLocal);
  const gateKey = new THREE.DirectionalLight(0x8ea8d8, 1.5);
  gateKey.position.set(0.4, 0.8, 0.5);
  const gateViolet = new THREE.PointLight(0x7a3cff, 3800, 1200, 2);
  gateViolet.position.copy(gate.position);
  const gateHemi = new THREE.HemisphereLight(0x1c2438, 0x070810, 0.75);
  // Foreground debris crossing while we approach.
  const gateDebris = scaleTo(assets.grating.clone(), 14);
  gateDebris.position.set(-30, 14, -60);
  gateShot.add(gateDebris, gateKey, gateViolet, gateHemi);
  scene.add(gateShot);

  // ---- LAPSE ------------------------------------------------------------------
  const lapse = new THREE.Group();
  const lapseBuoy = makeStrobe(0xff2a20);
  lapseBuoy.group.position.set(40, -20, -300);
  const lapseRock = scaleTo(assets.rockA.clone(), 70);
  lapseRock.position.set(-50, -80, -130);     // rises past camera
  const lapseShard = scaleTo(assets.cableBundle.clone(), 8);
  lapseShard.position.set(20, -100, -70);
  const lapseViolet = new THREE.PointLight(0x6a3cd8, 1400, 900, 2);
  lapseViolet.position.set(0, 30, -200);
  // The throat walls glow violet — a vast dim curtain the debris rises past.
  const lapseCurtain = glowSprite(0x5a30c8, 900);
  lapseCurtain.material.opacity = 0.12;
  lapseCurtain.position.set(20, 60, -520);
  const lapseCurtain2 = glowSprite(0x2a4a9a, 380);
  lapseCurtain2.material.opacity = 0.12;
  lapseCurtain2.position.set(-70, -50, -460);
  const lapseHemi = new THREE.HemisphereLight(0x181e30, 0x05060a, 0.8);
  const lapseRim = new THREE.DirectionalLight(0x44598a, 1.1);
  lapseRim.position.set(0.3, 1, -0.4);
  lapse.add(lapseBuoy.group, lapseRock, lapseShard, lapseViolet, lapseHemi, lapseRim, lapseCurtain, lapseCurtain2);
  scene.add(lapse);

  // ================================================================ POST
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.65, 0.9, 0.72);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // ================================================================ TIMELINE
  const SHOTS = [
    { name: 'wake', t0: 0.0, t1: 4.0 },
    { name: 'witness', t0: 4.0, t1: 10.4 },
    { name: 'field', t0: 10.4, t1: 16.6 },
    { name: 'courier', t0: 16.6, t1: 22.4 },
    { name: 'gate', t0: 22.4, t1: 28.8 },
    { name: 'lapse', t0: 28.8, t1: 32.0 },
  ];

  const _look = new THREE.Vector3();
  function camSet(px, py, pz, lx, ly, lz, roll = 0) {
    camera.position.set(px, py, pz);
    _look.set(lx, ly, lz);
    camera.lookAt(_look);
    camera.rotation.z += roll;
  }

  // Flicker schedule — short luminance dips at chosen times (never a bright flash).
  const FLICKERS = [10.42, 16.68, 22.5, 27.9];
  function flickerAt(t) {
    let f = 0;
    for (const ft of FLICKERS) {
      const d = (t - ft) * 24;
      if (d >= 0 && d < 3) f = Math.max(f, d < 1.5 ? 1 : 0.4);
    }
    return f;
  }

  function updateWake(t, u) {
    // Slow push-in; the buoy's double-strobe; a giant rock sliding across the left edge.
    const drift = easeInOut(u);
    camSet(
      0 + sway(t, .21, .47, .83) * 1.2,
      -4 + sway(t, .17, .39, .71) * 0.9,
      lerp(0, 26, drift),
      -8 + sway(t, .13, .31, .59) * 3,
      2, -240,
      sway(t, .07, .19, .37) * 0.012,
    );
    wakeRock.position.x = -120 + t * 2.4;
    wakeRock.rotation.y = 0.4 + t * 0.011;
    wakeRock2.rotation.y = -0.3 + t * 0.02;
    wakeStrobe.pulse(t, 2.3, 0);
    // at ~2.8s a brighter answering triple-blink
    if (t > 2.8 && t < 3.6) wakeStrobe.pulse(t * 2.1, 0.7, 0.2);
  }

  function updateWitness(t, u) {
    // Helmet tumbles on a precessing axis across the single warm lamp; eclipse ~u .55.
    const h = helmet.group;
    // visor sweeps across camera mid-shot, then away — the 'look' of the relic
    h.rotation.y = 1.35 + (t - 4.0) * 0.14;
    h.rotation.x = Math.sin(t * 0.23) * 0.55 + u * 0.4;
    h.rotation.z = -0.2 + t * 0.07;
    h.position.x = lerp(-6, 4, u);
    h.position.y = lerp(1.2, -3.2, u);
    h.position.z = -13 + Math.sin(u * Math.PI) * -2.5;
    // Lamp flickers faintly, dies hard at the eclipse moment, gutters back.
    const eclipse = smooth(0.5, 0.55, u) * (1 - smooth(0.6, 0.66, u));
    const gutter = 0.75 + 0.25 * Math.sin(t * 13.7) * Math.sin(t * 4.1);
    const lampV = (1 - eclipse * 0.97) * gutter;
    witnessLamp.material.opacity = lampV * 0.55;
    witnessLamp.scale.setScalar(5 * (0.8 + lampV * 0.4));
    witnessLampLight.intensity = 3400 * lampV;
    // Helmet lamp dying: irregular sputter.
    const sput = hash(Math.floor(t * 9) * 0.77) > 0.4 ? 1 : 0.15;
    helmet.lampMat.emissiveIntensity = 2.2 * sput * (0.6 + 0.4 * Math.sin(t * 27));
    helmet.lampGlow.material.opacity = 0.55 * sput;
    // Shard parallax crossing behind, opposite direction.
    witnessShard.position.x = lerp(-70, 30, u);
    witnessShard.rotation.set(t * 0.3, t * 0.17, 0.4);
    camSet(
      lerp(-1, 2.6, easeInOut(u)) + sway(t, .19, .43, .79) * 0.5,
      lerp(0.5, -0.8, u) + sway(t, .15, .37, .67) * 0.4,
      lerp(0, 3.2, u),
      h.position.x * 0.55, h.position.y * 0.4 - 1, -13,
      sway(t, .06, .17, .31) * 0.014,
    );
  }

  function updateField(t, u) {
    // Lateral dolly + slight crane — layers slide at different rates and directions.
    camSet(
      lerp(-60, 30, easeInOut(u)) + sway(t, .18, .41, .77) * 1.4,
      lerp(-8, 14, u) + sway(t, .14, .35, .63) * 1.0,
      lerp(-20, 30, u),
      lerp(-30, 40, u), lerp(0, -10, u), -240,
      sway(t, .05, .15, .29) * 0.018,
    );
    fieldPod.position.x = lerp(-70, 90, easeInOut(u));       // near plane — fast cross
    fieldPod.position.y = lerp(10, -14, u);
    fieldPod.rotation.set(t * 0.5, t * 0.31, t * 0.22);
    fieldCorvette.rotation.y = -0.8 + t * 0.008;
    fieldCorvette.position.x = 160 + Math.sin(t * 0.05) * 8;
    fieldSpan.rotation.z = 0.3 + t * 0.004;
    fieldCables.position.y = -40 + Math.sin(t * 0.11) * 5;   // slow sink-rise drift
    fieldCables.rotation.y = t * 0.05;
    fieldRock.position.y = 60 - u * 26;                       // sinking slowly
    fieldStrobeA.pulse(t, 2.9, 0.35);
    fieldMemorial.rotation.y = t * 0.006;
  }

  function updateCourier(t, u) {
    // Ship path: enters close low-right, slides left, banks away to the gate.
    const pu = easeInOut(clamp(u * 1.15, 0, 1));
    const px = lerp(90, -160, pu);
    const py = lerp(-26, 20, pu * pu);
    const pz = lerp(-80, -700, pu * pu);
    ship.position.set(px, py, pz);
    // Bank into the turn then settle on the burn-away vector.
    ship.rotation.z = lerp(-0.35, 0.5, smooth(0.25, 0.6, u)) + Math.sin(t * 0.4) * 0.02;
    ship.rotation.y = lerp(0.5, -0.35, smooth(0.3, 0.75, u));
    ship.rotation.x = lerp(0.08, -0.12, u);
    // Throttle: flare builds after the bank.
    const throttle = smooth(0.35, 0.75, u);
    flare.plumeMat.uniforms.uPow.value = 0.5 + throttle * 1.6;
    flare.plume.scale.x = 1 + throttle * 2.4;
    flare.plume.scale.y = flare.plume.scale.z = 1 + throttle * 0.5;
    flare.light.intensity = 500 + throttle * 2200;
    flare.core.scale.setScalar(3.2 * (0.8 + throttle * 0.8));
    flare.halo.material.opacity = 0.25 + throttle * 0.3;
    // RCS micro-puff flicker at the bank start.
    if (u > 0.3 && u < 0.45) {
      const p = Math.sin(t * 37) > 0.3 ? 1 : 0;
      flare.core.material.opacity = 0.9 + p * 0.1;
    }
    // Camera: tight chase at entry, then releases — lets the ship recede.
    const follow = 1 - smooth(0.45, 0.8, u);   // 1 tight → 0 let go
    camSet(
      lerp(30, -6, easeInOut(Math.min(u * 1.4, 1))) + px * 0.28 * follow + sway(t, .2, .44, .8) * 0.8,
      lerp(-12, 8, u) + py * 0.2 * follow + sway(t, .16, .38, .7) * 0.6,
      lerp(-30, 10, u),
      px * lerp(0.75, 0.15, u), py * lerp(0.8, 0.3, u), pz,
      sway(t, .08, .2, .36) * 0.02,
    );
    farGate.rotation.z = t * 0.01;
  }

  function updateGate(t, u) {
    // Steady ominous push toward the throat; strobes chase around the rim.
    const pu = easeInOut(u);
    camSet(
      lerp(60, 6, pu) + sway(t, .17, .39, .73) * 1.1,
      lerp(44, 10, pu) + sway(t, .13, .33, .61) * 0.8,
      lerp(150, 60, pu),
      gate.position.x * 0.9, gate.position.y * 0.8, gate.position.z,
      lerp(0.04, -0.02, u) + sway(t, .06, .17, .3) * 0.012,
    );
    anomaly.update(t);
    // Chase sequence — each strobe lights in turn, and near the end they sync-pulse.
    for (let i = 0; i < rimStrobes.length; i++) {
      const s = rimStrobes[i];
      const chase = ((t * 1.6) - i / rimStrobes.length) % 1;
      let v = Math.exp(-Math.pow(((chase + 1) % 1) * 9 - 1.2, 2));
      if (u > 0.82) v = Math.max(v, Math.sin((u - 0.82) * 22) * 0.9); // end-state pulse
      s.material.opacity = clamp(v, 0, 1);
      s.scale.setScalar(5 + v * 6);
    }
    gateViolet.intensity = 3800 * (0.75 + 0.25 * Math.sin(t * 0.9)) + u * 3200;
    gateDebris.position.x = lerp(-70, 20, u);
    gateDebris.position.y = lerp(24, -6, u);
    gateDebris.rotation.set(0.4 + t * 0.2, t * 0.14, 0.1);
  }

  function updateLapse(t, u) {
    // Inside the throat: near-black, debris RISES past camera, lone strobe, fade out.
    camSet(
      sway(t, .19, .41, .77) * 1.4,
      lerp(0, 30, easeInOut(u)) + sway(t, .15, .35, .65) * 0.8,
      lerp(0, -40, u),
      10, lerp(0, -30, u), -280,
      sway(t, .05, .14, .27) * 0.02,
    );
    lapseRock.position.y = -80 + u * 150;      // wrong-way drift: things rise
    lapseRock.rotation.set(t * 0.1, t * 0.06, 0.3);
    lapseShard.position.y = -100 + u * 190;
    lapseShard.rotation.set(t * 0.4, 0.2, t * 0.21);
    lapseBuoy.pulse(t, 2.6, 0.5);
    lapseViolet.intensity = 1400 * (1 - u) + 300;
  }

  const UPDATE = { wake: updateWake, witness: updateWitness, field: updateField, courier: updateCourier, gate: updateGate, lapse: updateLapse };
  const GROUPS = { wake, witness, field, courier, gate: gateShot, lapse };

  function fadeAt(t) {
    // Fade up from black over the first 1.2s and down to the same black at the end —
    // the loop seam is two identical near-black frames.
    return smooth(0, 1.2, t) * (1 - smooth(31.0, 32.0, t));
  }

  function render(t) {
    t = ((t % INTRO_SPEC.duration) + INTRO_SPEC.duration) % INTRO_SPEC.duration;
    let active = SHOTS[SHOTS.length - 1];
    for (const s of SHOTS) if (t >= s.t0 && t < s.t1) { active = s; break; }
    for (const s of SHOTS) GROUPS[s.name].visible = s === active;
    const u = clamp((t - active.t0) / (active.t1 - active.t0), 0, 1);
    stars.update(t);
    UPDATE[active.name](t, u);
    grade.uniforms.uTime.value = t;
    grade.uniforms.uFade.value = fadeAt(t);
    grade.uniforms.uFlicker.value = flickerAt(t);
    composer.render();
  }

  return {
    render,
    scene, camera, groups: GROUPS, shared: { stars: stars.group, nebula, dust: dust.pts }, grade, bloom,
    shotName(t) {
      t = ((t % INTRO_SPEC.duration) + INTRO_SPEC.duration) % INTRO_SPEC.duration;
      for (const s of SHOTS) if (t >= s.t0 && t < s.t1) return s.name;
      return 'lapse';
    },
    stats() { return { tris: renderer.info.render.triangles, calls: renderer.info.render.calls }; },
    dispose() { renderer.dispose(); },
  };
}
