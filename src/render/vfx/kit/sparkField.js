// SparkField — the VFX kit's particle system: stateless GPU particles.
//
// Every particle is written ONCE, when it is emitted: origin, velocity, birth, life, size and colour
// curves, a shape id and a blend mode. The vertex shader evaluates where it is now in closed form
// (drag, gravity-like field term, optional spiral about a field centre), so a live particle costs
// no CPU per frame and nothing is read back. Particles lie on the play plane and stretch along
// their own velocity, which is what a top-down camera reads as speed.
//
// One draw for everything: premultiplied blending (ONE, ONE_MINUS_SRC_ALPHA) carries additive
// energy (alpha 0, HDR colour that feeds the bloom) and alpha matter (dust, soot) in the same
// buffer. Dead slots collapse to a degenerate quad, so they cost vertices, never fragments.
//
// Cost: one instanced draw, CAPACITY instances x 4 vertices; uploads only the slots written this
// frame (two update ranges at most). Fragment cost is the live particles' area only.
import * as THREE from 'three';

export const SPARK_CAPACITY = 4096;
// Shapes (fragment profiles).
export const SPARK_SHAPE = Object.freeze({ STREAK: 0, GLOW: 1, GRAIN: 2, PUFF: 3, CHIP: 4 });
// Blend: 0 = additive light, 1 = alpha matter (premultiplied). Values between mix the two.
export const SPARK_ADD = 0;
export const SPARK_MATTER = 1;

const NAMES = ['aA', 'aV', 'aS', 'aC0', 'aC1', 'aF'];
const STRIDE = 4;

const VERTEX = /* glsl */`
attribute vec4 aA;  // origin xyz, birth
attribute vec4 aV;  // velocity xyz, life
attribute vec4 aS;  // size0, size1, drag, stretch
attribute vec4 aC0; // colour at birth (linear HDR), shape
attribute vec4 aC1; // colour at death, blend (0 additive .. 1 matter)
attribute vec4 aF;  // field centre xz, radial accel (+ inward), swirl (rad/s at the rim)
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vLife;
varying float vSeed;

vec3 positionAt(float t){
  float k=aS.z;
  vec3 p=aA.xyz+aV.xyz*(k>1e-4?(1.0-exp(-k*t))/k:t);
  if(abs(aF.z)>1e-4||abs(aF.w)>1e-4){
    // Polar field term about (aF.x,aF.y): the radius falls by a(t^2)/2 (never through the centre),
    // and the angle advances faster as the particle falls inward, like matter in a drain.
    vec2 rel=p.xz-aF.xy;
    float r=length(rel);
    float r0=max(r,1e-3);
    float fall=0.5*aF.z*t*t;
    float r1=max(0.0,r0-fall);
    float ang=atan(rel.y,rel.x)+aF.w*t*(1.0+2.0*clamp(fall/r0,0.0,1.0));
    p.xz=aF.xy+vec2(cos(ang),sin(ang))*r1;
  }
  return p;
}

void main(){
  float age=uTime-aA.w;
  float life=max(aV.w,1e-3);
  float t=age/life;
  vLife=t;
  vShape=aC0.w;
  vSeed=fract(aA.w*13.37+aA.x*0.071+aA.z*0.113);
  if(age<0.0||t>=1.0){
    gl_Position=vec4(2.0,2.0,2.0,1.0);
    vColor=vec4(0.0);
    vUv=vec2(0.0);
    return;
  }
  vec3 p=positionAt(age);
  vec3 q=positionAt(max(0.0,age-0.034));
  vec2 d=p.xz-q.xz;
  float speed=length(d)/0.034;
  vec2 axis=speed>1e-3?d/max(length(d),1e-5):vec2(1.0,0.0);
  vec2 side=vec2(-axis.y,axis.x);
  float size=mix(aS.x,aS.y,t);
  float len=size+aS.w*speed;
  vec2 corner=position.xy;
  vec3 world=p+vec3(axis*corner.x*len*0.5+side*corner.y*size*0.5,0.0).xzy;
  world.y=p.y;
  vUv=corner;
  // Colour over life; intensity cools with the square of remaining life for light, holds for matter.
  float cool=mix((1.0-t)*(1.0-t),1.0-t*t,aC1.w);
  float fadeIn=smoothstep(0.0,0.06,t);
  vColor=vec4(mix(aC0.rgb,aC1.rgb,t)*cool*fadeIn,aC1.w);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.0);
}`;

const FRAGMENT = /* glsl */`
uniform float uFlash;
varying vec2 vUv;
varying vec4 vColor;
varying float vShape;
varying float vLife;
varying float vSeed;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 uv=vUv;
  float m=0.0;
  float core=0.0;
  if(vShape<0.5){
    // Streak: hot head at +x, tapering tail, gaussian across.
    float along=uv.x*0.5+0.5;
    float tail=pow(along,1.6)*(1.0-smoothstep(0.86,1.0,along));
    float across=exp(-uv.y*uv.y*5.0);
    m=tail*across;
    core=pow(across,6.0)*smoothstep(0.55,0.9,along);
  }else if(vShape<1.5){
    // Glow: tight hot core with a short falloff (never a broad halo).
    float r=length(uv);
    m=exp(-r*r*9.0)*(1.0-smoothstep(0.7,1.0,r));
    core=exp(-r*r*40.0);
  }else if(vShape<2.5){
    // Grain: a small hard-edged mote.
    float r=length(uv);
    m=1.0-smoothstep(0.55,1.0,r);
    core=0.0;
  }else if(vShape<3.5){
    // Puff: a lumpy soot body that thins as it ages.
    float r=length(uv);
    float n=noise(uv*2.6+vSeed*17.0+vLife*0.9)*0.6+noise(uv*5.3-vSeed*9.0)*0.4;
    m=smoothstep(1.0,0.25,r+(n-0.5)*0.55)*(1.0-vLife*0.35);
  }else{
    // Chip: an angular fragment (diamond) with a bright edge.
    float d=abs(uv.x)*0.8+abs(uv.y);
    m=1.0-smoothstep(0.82,1.0,d);
    core=smoothstep(0.6,0.95,d)*m;
  }
  if(m<0.004)discard;
  float matter=vColor.a;
  vec3 col=vColor.rgb*(m+core*1.5*(1.0-matter));
  float light=mix(uFlash,1.0,matter);
  gl_FragColor=vec4(col*light,m*matter);
}`;

function quad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function createSparkMaterial() {
  return new THREE.ShaderMaterial({
    name: 'SF_Kit_SparkField',
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uTime: { value: 0 }, uFlash: { value: 1 } },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** A reusable emit record. Fill it and pass it to `emit`; nothing is allocated per particle. */
export function sparkSpec() {
  return {
    x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, birth: 0, life: 0.5,
    size0: 1, size1: 1, drag: 0, stretch: 0,
    r0: 1, g0: 1, b0: 1, r1: 1, g1: 1, b1: 1, shape: 0, blend: 0,
    cx: 0, cz: 0, accel: 0, swirl: 0,
  };
}

export class SparkField {
  constructor(scene, { capacity = SPARK_CAPACITY, name = 'SF_Kit_SparkField' } = {}) {
    this.capacity = capacity;
    this.geometry = quad();
    this.arrays = [];
    this.attrs = [];
    for (const n of NAMES) {
      const arr = new Float32Array(capacity * STRIDE);
      const attr = new THREE.InstancedBufferAttribute(arr, STRIDE).setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(n, attr);
      this.arrays.push(arr);
      this.attrs.push(attr);
    }
    // Every slot starts dead (birth far in the future never happens: life 0 makes t >= 1).
    this.material = createSparkMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.geometry.instanceCount = 0;
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 18;
    this.mesh.visible = false;
    this.cursor = 0;
    this.highWater = 0;
    this.liveUntil = -1;
    this.time = 0;
    this.dirtyLo = -1;
    this.dirtyHi = -1;
    this.dirtyWrap = false;
    this.emitted = 0;
    if (scene && typeof scene.add === 'function') scene.add(this.mesh);
  }

  /** Write one particle. Returns the slot index. */
  emit(p) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    if (i + 1 > this.highWater) this.highWater = i + 1;
    const o = i * STRIDE;
    const [A, V, S, C0, C1, F] = this.arrays;
    A[o] = p.x; A[o + 1] = p.y; A[o + 2] = p.z; A[o + 3] = p.birth;
    V[o] = p.vx; V[o + 1] = p.vy; V[o + 2] = p.vz; V[o + 3] = p.life;
    S[o] = p.size0; S[o + 1] = p.size1; S[o + 2] = p.drag; S[o + 3] = p.stretch;
    C0[o] = p.r0; C0[o + 1] = p.g0; C0[o + 2] = p.b0; C0[o + 3] = p.shape;
    C1[o] = p.r1; C1[o + 1] = p.g1; C1[o + 2] = p.b1; C1[o + 3] = p.blend;
    F[o] = p.cx; F[o + 1] = p.cz; F[o + 2] = p.accel; F[o + 3] = p.swirl;
    if (this.dirtyLo < 0) { this.dirtyLo = i; this.dirtyHi = i; } else if (i < this.dirtyLo) { this.dirtyWrap = true; this.dirtyHi = Math.max(this.dirtyHi, i); } else this.dirtyHi = Math.max(this.dirtyHi, i);
    const end = p.birth + p.life;
    if (end > this.liveUntil) this.liveUntil = end;
    this.emitted++;
    return i;
  }

  /** Upload what was written this frame and advance the clock. */
  update(time, { reducedFlash = false } = {}) {
    this.time = time;
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uFlash.value = reducedFlash ? 0.55 : 1;
    if (this.dirtyLo >= 0) {
      for (const attr of this.attrs) {
        attr.clearUpdateRanges();
        if (this.dirtyWrap) attr.addUpdateRange(0, this.capacity * STRIDE);
        else attr.addUpdateRange(this.dirtyLo * STRIDE, (this.dirtyHi - this.dirtyLo + 1) * STRIDE);
        attr.needsUpdate = true;
      }
      this.dirtyLo = this.dirtyHi = -1;
      this.dirtyWrap = false;
    }
    const live = time < this.liveUntil;
    this.geometry.instanceCount = live ? this.highWater : 0;
    this.mesh.visible = live;
    return live;
  }

  /** Floating-origin rebase: shift every origin and field centre. */
  reproject(dx, dz) {
    if (!dx && !dz) return;
    const [A, , , , , F] = this.arrays;
    for (let i = 0; i < this.highWater; i++) {
      const o = i * STRIDE;
      A[o] += dx; A[o + 2] += dz;
      F[o] += dx; F[o + 1] += dz;
    }
    for (const attr of [this.attrs[0], this.attrs[5]]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.highWater * STRIDE);
      attr.needsUpdate = true;
    }
  }

  liveEstimate() {
    // Particles are written in birth order, so an upper bound is enough for budgets.
    return this.time < this.liveUntil ? Math.min(this.highWater, this.emitted) : 0;
  }

  clear() {
    this.liveUntil = -1;
    for (const arr of this.arrays[1].length ? [this.arrays[1]] : []) for (let i = 3; i < arr.length; i += STRIDE) arr[i] = 0;
    this.attrs[1].clearUpdateRanges();
    this.attrs[1].addUpdateRange(0, this.capacity * STRIDE);
    this.attrs[1].needsUpdate = true;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
