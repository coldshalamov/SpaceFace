// ShockShell — the VFX kit's thin travelling fronts and truthful boundary lines.
//
// A shell is a thin annulus (or arc) lying on the play plane. Its radius moves along an authored
// curve: a push front expands with an ease-out (fast, then braking), a pull front contracts with
// an ease-in (accelerating as it falls), a boundary holds still at the field's true reach. The
// fragment is a bright leading lip over a faint trailing skirt, broken up along its length by
// noise so it never reads as a clean vector donut. Additive and HDR: it is light, not cloth.
//
// Cost: one instanced draw, 96 segments x 2 triangles per live shell; dead slots are degenerate.
import * as THREE from 'three';

export const SHELL_CAPACITY = 96;
export const SHELL_MODE = Object.freeze({ EXPAND: 0, CONTRACT: 1, HOLD: 2 });
const SEGMENTS = 96;
const NAMES = ['sA', 'sB', 'sC', 'sD'];

const VERTEX = /* glsl */`
attribute vec4 sA; // centre xyz, birth
attribute vec4 sB; // radius from, radius to, life, half width (WU)
attribute vec4 sC; // colour rgb (HDR), alpha
attribute vec4 sD; // mode, arc start, arc span (0 = full ring), seed
uniform float uTime;
varying float vAcross;
varying float vAngle;
varying float vLife;
varying vec4 vColor;
varying float vMode;
varying float vSeed;
varying float vRadius;
void main(){
  float age=uTime-sA.w;
  float life=max(sB.z,1e-3);
  float t=age/life;
  if(age<0.0||t>=1.0||sC.a<=0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);vColor=vec4(0.0);return;}
  float mode=sD.x;
  float e=mode<0.5?1.0-pow(1.0-t,2.6):(mode<1.5?t*t*t:0.0);
  float radius=mode<1.5?mix(sB.x,sB.y,e):sB.y;
  float span=sD.z>0.0?sD.z:6.2831853;
  float a=sD.y+position.x*span;
  float across=position.y;
  float hw=sB.w*(mode<1.5?mix(1.0,0.45,t):1.0);
  vec2 dir=vec2(cos(a),sin(a));
  vec3 world=sA.xyz+vec3(dir.x,0.0,dir.y)*(radius+across*hw);
  vAcross=mode<0.5?across:(mode<1.5?-across:across);
  vAngle=a;
  vLife=mode<1.5?t:clamp(min(age*6.0,1.0)*min((life-age)*4.0,1.0),0.0,1.0);
  vColor=sC;
  vMode=mode;
  vSeed=sD.w;
  vRadius=radius;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.0);
}`;

const FRAGMENT = /* glsl */`
uniform float uTime;
uniform float uFlash;
varying float vAcross;
varying float vAngle;
varying float vLife;
varying vec4 vColor;
varying float vMode;
varying float vSeed;
varying float vRadius;
float hash(float p){return fract(sin(p*127.1)*43758.5453);}
float noise1(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(hash(i),hash(i+1.0),f);}
void main(){
  float a;
  if(vMode>1.5){
    // Boundary: a crisp hairline with a soft inner skirt and a slow travelling tick.
    float line=exp(-vAcross*vAcross*18.0);
    float tick=0.75+0.25*noise1(vAngle*vRadius*0.06+uTime*0.7+vSeed*31.0);
    a=line*tick*vLife;
  }else{
    // Front: hot leading lip (+1 side), dim skirt behind, broken along the circumference.
    // A 'wall' front (seed integer part >= 5) is a broad, blinding band that holds full strength for
    // its first ~40 % of life and is gone by half-life; ordinary fronts are a hot lip and a skirt.
    bool wall=floor(vSeed)>4.5;
    float lip=wall?exp(-pow((vAcross-0.15)*1.5,2.0)):exp(-pow((vAcross-0.5)*2.4,2.0));
    float skirt=0.22*smoothstep(-1.0,0.4,vAcross)*(1.0-smoothstep(0.4,1.0,vAcross));
    float cells=vRadius*0.09+3.0;
    // seed: fractional part = noise phase, integer part = extra fade exponent (a front that is
    // thick and blinding for its first frames and gone before it brakes).
    float sd=fract(vSeed);
    float fadeExp=2.0+floor(vSeed);
    float n=noise1(vAngle*cells+sd*53.0)*0.65+noise1(vAngle*cells*2.7-sd*11.0+vLife*3.0)*0.35;
    float breakup=smoothstep(0.18+0.55*vLife,0.9,n+0.25);
    float fade=wall?(1.0-smoothstep(0.3,0.5,vLife)):pow(1.0-vLife,fadeExp)*smoothstep(0.0,0.05,vLife);
    a=(lip+skirt)*breakup*fade;
  }
  if(a<0.003)discard;
  gl_FragColor=vec4(vColor.rgb*vColor.a*a*uFlash,0.0);
}`;

function ringGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  const pos = [];
  const idx = [];
  for (let i = 0; i <= SEGMENTS; i++) { pos.push(i / SEGMENTS, -1, 0, i / SEGMENTS, 1, 0); }
  for (let i = 0; i < SEGMENTS; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function createShellMaterial() {
  return new THREE.ShaderMaterial({
    name: 'SF_Kit_ShockShell',
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uTime: { value: 0 }, uFlash: { value: 1 } },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Pure light: ONE, ONE (THREE.AdditiveBlending is SRC_ALPHA, ONE and would multiply by alpha).
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export function shellSpec() {
  return { x: 0, y: 1.2, z: 0, birth: 0, from: 0, to: 10, life: 0.3, halfWidth: 2, r: 1, g: 1, b: 1, alpha: 1, mode: 0, arcStart: 0, arcSpan: 0, seed: 0 };
}

export class ShockShell {
  constructor(scene, { capacity = SHELL_CAPACITY } = {}) {
    this.capacity = capacity;
    this.geometry = ringGeometry();
    this.arrays = [];
    this.attrs = [];
    for (const n of NAMES) {
      const arr = new Float32Array(capacity * 4);
      const attr = new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(n, attr);
      this.arrays.push(arr);
      this.attrs.push(attr);
    }
    this.material = createShellMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'SF_Kit_ShockShell';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 17;
    this.mesh.visible = false;
    this.geometry.instanceCount = 0;
    // Slot ownership: transient fronts cycle through the free list; holds are claimed by key.
    this.end = new Float64Array(capacity).fill(-1);
    this.held = new Map();
    this.highWater = 0;
    this.dirty = false;
    this.time = 0;
    if (scene && typeof scene.add === 'function') scene.add(this.mesh);
  }

  _free() {
    let best = -1;
    let oldest = Infinity;
    for (let i = 0; i < this.capacity; i++) {
      if (this.end[i] === Infinity) continue; // held
      if (this.end[i] < this.time) return i;
      if (this.end[i] < oldest) { oldest = this.end[i]; best = i; }
    }
    return best;
  }

  _write(i, s) {
    const [A, B, C, D] = this.arrays;
    const o = i * 4;
    A[o] = s.x; A[o + 1] = s.y; A[o + 2] = s.z; A[o + 3] = s.birth;
    B[o] = s.from; B[o + 1] = s.to; B[o + 2] = s.life; B[o + 3] = s.halfWidth;
    C[o] = s.r; C[o + 1] = s.g; C[o + 2] = s.b; C[o + 3] = s.alpha;
    D[o] = s.mode; D[o + 1] = s.arcStart; D[o + 2] = s.arcSpan; D[o + 3] = s.seed;
    if (i + 1 > this.highWater) this.highWater = i + 1;
    this.dirty = true;
  }

  /** A transient front (expand or contract). */
  emit(s) {
    const i = this._free();
    if (i < 0) return -1;
    this.end[i] = s.birth + s.life;
    this._write(i, s);
    return i;
  }

  /** A held boundary line at a field's true reach, refreshed every frame by key. */
  hold(key, s) {
    let i = this.held.get(key);
    if (i == null) {
      i = this._free();
      if (i < 0) return -1;
      this.held.set(key, i);
      s.birth = this.time;
    } else {
      s.birth = this.arrays[0][i * 4 + 3];
    }
    this.end[i] = Infinity;
    s.mode = SHELL_MODE.HOLD;
    s.life = 1e6;
    const o = i * 4;
    const [A, B, C, D] = this.arrays;
    if (A[o] !== s.x || A[o + 2] !== s.z || B[o + 1] !== s.to || C[o + 3] !== s.alpha || A[o + 3] !== s.birth
      || D[o + 1] !== Math.fround(s.arcStart) || D[o + 2] !== Math.fround(s.arcSpan)) this._write(i, s);
    return i;
  }

  /** Retire a held line with a short fade (writes a life that ends 0.25 s from now). */
  release(key) {
    const i = this.held.get(key);
    if (i == null) return;
    this.held.delete(key);
    const o = i * 4;
    const birth = this.arrays[0][o + 3];
    this.arrays[1][o + 2] = Math.max(0.3, this.time - birth + 0.25);
    this.end[i] = this.time + 0.25;
    this.dirty = true;
  }

  heldKeys() { return this.held.keys(); }

  update(time, { reducedFlash = false } = {}) {
    this.time = time;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uFlash.value = reducedFlash ? 0.55 : 1;
    if (this.dirty) {
      for (const a of this.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, this.highWater * 4); a.needsUpdate = true; }
      this.dirty = false;
    }
    let live = this.held.size > 0;
    if (!live) for (let i = 0; i < this.highWater; i++) if (this.end[i] > time) { live = true; break; }
    this.geometry.instanceCount = live ? this.highWater : 0;
    this.mesh.visible = live;
    return live;
  }

  reproject(dx, dz) {
    if (!dx && !dz) return;
    const A = this.arrays[0];
    for (let i = 0; i < this.highWater; i++) { A[i * 4] += dx; A[i * 4 + 2] += dz; }
    this.attrs[0].clearUpdateRanges();
    this.attrs[0].addUpdateRange(0, this.highWater * 4);
    this.attrs[0].needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
