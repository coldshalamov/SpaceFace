import * as THREE from 'three';
import {
  registerDynamicBufferOwner, unregisterDynamicBufferOwner,
  assertDynamicBufferOwnerWritable, markDynamicBufferItems, commitDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

// Fixed topology: long accretion bends remain smooth without CPU tessellation or a
// camera-dependent quality tier. A Mesh + InstancedBufferGeometry needs no matrix attributes.
export const BOMB_FLOW_STATIONS = 96;
export const BOMB_FLOW_ACROSS = 10;
export const BOMB_FLOW_CAPACITY = 24 * 3;
const NAMES = ['bfOrigin', 'bfShape', 'bfLife', 'bfTint',
  'bfBody0', 'bfBody1', 'bfBody2', 'bfVelocity0', 'bfVelocity1', 'bfVelocity2'];
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

const FLOW_GLSL = /* glsl */`
attribute vec4 bfOrigin; // local XZ, radius, motion age (zero in reduced motion)
attribute vec4 bfShape; // seed, angle, strength envelope, opacity
attribute vec4 bfLife; // transport age, shutdown age, release duration, cooling
attribute vec4 bfTint; // linear RGB, accessibility heat scale
attribute vec4 bfBody0; attribute vec4 bfBody1; attribute vec4 bfBody2;
attribute vec4 bfVelocity0; attribute vec4 bfVelocity1; attribute vec4 bfVelocity2;
const float BF_PI=3.14159265359;
vec3 bfBase(float u,float v){
  float radius=bfOrigin.z,time=bfOrigin.w,seed=bfShape.x;
  float belly=max(0.0,sin(BF_PI*u));
  float reach=radius*((.76+.14*sin(seed*1.7))*(1.0-u)+u*.072);
  float bend=bfShape.y+u*(3.2+.72*sin(seed))-time*(.09+.62*u*u)
    +.19*sin(u*7.0-time*(1.1+.25*sin(seed))+seed)+.08*sin(u*16.0+time*.7-seed);
  float slope=3.2+.72*sin(seed)-time*1.24*u
    +1.33*cos(u*7.0-time*(1.1+.25*sin(seed))+seed)+1.28*cos(u*16.0+time*.7-seed);
  vec2 radial=vec2(cos(bend),sin(bend));
  vec2 tangent=-radius*(.688+.14*sin(seed*1.7))*radial
    +reach*vec2(-radial.y,radial.x)*slope;
  vec2 sectionNormal=vec2(-tangent.y,tangent.x)/max(length(tangent),.001);
  float width=min(6.2,radius*(.035+belly*.105))*(.32+.68*sqrt(belly));
  float centreY=min(48.0,radius)*(.15*(1.0-u)-.075*u+belly*.050*sin(u*7.2-time*2.2+seed))
    *(.55+bfShape.z*.45);
  float fold=min(5.2,width*(.88+.16*sin(u*9.0-time*2.5+seed)));
  float curl=v*2.45;
  vec2 xz=radial*reach+sectionNormal*sin(curl)*width;
  xz*=min(1.0,radius/max(.001,length(xz)));
  return vec3(bfOrigin.x+xz.x,centreY+(.68-cos(curl))*fold,bfOrigin.y+xz.y);
}
// Same nearest-surface response as FlowEnvironment.samplePoint. Selection was
// already performed by the bomb owner: this path never queries simulation state.
void bfContact(vec3 point,vec4 body,vec4 velocity,inout float best,inout vec3 response,inout float contact){
  vec2 delta=point.xz-body.xy;
  float distanceToBody=length(delta),gap=distanceToBody-body.z;
  float band=max(2.0,min(24.0,body.z*.65));
  if(body.w<=0.0||gap>band||gap< -band*1.5||abs(gap)>=best)return;
  best=abs(gap);
  vec2 away=distanceToBody>0.000001?delta/distanceToBody:vec2(1.0,0.0);
  vec2 tangent=vec2(-away.y,away.x);
  contact=pow(max(0.0,1.0-abs(gap)/(gap<0.0?band*1.5:band)),2.0)*body.w;
  float shear=clamp(dot(velocity.xy,tangent),-60.0,60.0)*.018*contact;
  vec2 offset=away*(max(0.0,-gap)+band*.18)*contact+tangent*shear;
  float materialLift=velocity.z>.5&&velocity.z<1.5?.18:.11;
  response=vec3(offset.x,min(4.0,body.z*materialLift)*contact,offset.y);
}
vec3 bfPoint(float u,float v,out float contact){
  vec3 point=bfBase(u,v),response=vec3(0.0);
  contact=0.0;float best=1.0e20;
  bfContact(point,bfBody0,bfVelocity0,best,response,contact);
  bfContact(point,bfBody1,bfVelocity1,best,response,contact);
  bfContact(point,bfBody2,bfVelocity2,best,response,contact);
  point+=response;
  vec2 relative=point.xz-bfOrigin.xy;
  relative*=min(1.0,bfOrigin.z/max(.001,length(relative)));
  return vec3(bfOrigin.x+relative.x,point.y,bfOrigin.y+relative.y);
}
float bfCoverage(float u){
  float seed=bfShape.x;
  float transit=.29+.12*(.5+.5*sin(seed*2.3));
  float arrival=.035+.09*(.5+.5*sin(seed))+u*transit;
  float supplied=smoothstep(0.0,.12,bfLife.x-arrival);
  float drainTransit=min(transit,max(.01,bfLife.z-.14));
  float drained=1.0-smoothstep(0.0,.13,bfLife.x-bfLife.y-u*drainTransit);
  return supplied*drained;
}
`;

function geometry() {
  const g = new THREE.InstancedBufferGeometry();
  const vertices = (BOMB_FLOW_STATIONS + 1) * (BOMB_FLOW_ACROSS + 1);
  const p = new Float32Array(vertices * 3), n = new Float32Array(vertices * 3);
  const color = new Float32Array(vertices * 4).fill(1);
  const index = new Uint16Array(BOMB_FLOW_STATIONS * BOMB_FLOW_ACROSS * 6);
  for (let u = 0, i = 0; u <= BOMB_FLOW_STATIONS; u++) for (let v = 0; v <= BOMB_FLOW_ACROSS; v++, i++) {
    p[i * 3] = u / BOMB_FLOW_STATIONS; p[i * 3 + 1] = v / BOMB_FLOW_ACROSS * 2 - 1;
    n[i * 3 + 1] = 1;
  }
  for (let u = 0, i = 0; u < BOMB_FLOW_STATIONS; u++) for (let v = 0; v < BOMB_FLOW_ACROSS; v++) {
    const a = u * (BOMB_FLOW_ACROSS + 1) + v, b = a + BOMB_FLOW_ACROSS + 1;
    index[i++] = a; index[i++] = a + 1; index[i++] = b;
    index[i++] = b; index[i++] = a + 1; index[i++] = b + 1;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  // Base material retains its USE_COLOR_ALPHA path and bombSurface declaration.
  // These static values are overridden analytically after its shader hook runs.
  g.setAttribute('color', new THREE.BufferAttribute(color, 4));
  g.setAttribute('bombSurface', new THREE.BufferAttribute(new Float32Array(vertices * 4), 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.instanceCount = 0;
  return g;
}

function flowMaterial(factory) {
  if (typeof factory !== 'function') throw new TypeError('BombFlowSurface requires a material factory');
  const material = factory(), baseCompile = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.name = 'BombAnalyticAccretion';
  material.forceSinglePass = true;
  material.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${FLOW_GLSL}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
vColor = vec4(bfTint.rgb,bfShape.w*bfCoverage(position.x));`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float bfHit=0.0,bfScratch=0.0;
vec3 bfPosition=bfPoint(position.x,position.y,bfHit);
// Differentiate the continuous surface, including moving bends and contacts. These
// smooth normals do not inherit the long planar triangle facets of CPU sections.
vec3 bfAlong=bfPoint(min(1.0,position.x+.0005),position.y,bfScratch)
  -bfPoint(max(0.0,position.x-.0005),position.y,bfScratch);
vec3 bfAcross=bfPoint(position.x,min(1.0,position.y+.001),bfScratch)
  -bfPoint(position.x,max(-1.0,position.y-.001),bfScratch);
objectNormal=normalize(cross(bfAcross,bfAlong)+vec3(0.0,.000001,0.0));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed=bfPosition;`)
      .replace('vBombSurface = bombSurface;', `float bfCrest=pow(.5+.5*cos(position.x*10.2-bfOrigin.w*4.2+bfShape.x),4.0);
float bfHeat=(2.7+bfCrest*3.5)*(.40+bfShape.z*.60)*(1.0-bfLife.w*.78);
vBombSurface=vec4(position.y,(bfHeat+bfHit*1.5)*bfTint.w,position.x,1.0+bfShape.x+bfOrigin.w*.9);`);
  };
  material.customProgramCacheKey = () => `${baseKey}:analytic-accretion-v1`;
  return material;
}

/** Retained request keys: x,z,radius,time,envelope,seed,angle,r,g,b,opacity,
 * transportAge,shutdownAge,releaseDuration,cooling,heatScale,environment {records,count}.
 * All positions and supplied environment records are in the same render-local frame. */
export class BombFlowSurface {
  constructor(scene, materialFactory, { capacity = BOMB_FLOW_CAPACITY } = {}) {
    this.capacity = Math.max(1, Math.min(BOMB_FLOW_CAPACITY, Math.floor(finite(capacity, BOMB_FLOW_CAPACITY))));
    this.count = 0; this.dropped = 0; this.disposed = false;
    this.geometry = geometry(); this.material = flowMaterial(materialFactory);
    this.attributes = NAMES.map(name => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attr); return attr;
    });
    this.descriptor = new Float32Array(NAMES.length * 4);
    this.dirtyStart = new Int32Array(NAMES.length); this.dirtyEnd = new Int32Array(NAMES.length);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'BombAnalyticAccretion'; this.mesh.visible = false; this.mesh.count = 0;
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    if (scene) scene.add(this.mesh);
    this.owner = registerDynamicBufferOwner(scene, { id: this.mesh.name, mesh: this.mesh,
      attributes: NAMES.map((name, i) => ({ name, attribute: this.attributes[i] })) });
  }
  begin() {
    if (this.disposed) return false;
    assertDynamicBufferOwnerWritable(this.owner);
    this.count = this.dropped = 0; this.dirtyStart.fill(this.capacity); this.dirtyEnd.fill(0);
    return true;
  }
  add(request) {
    if (this.disposed) return false;
    if (this.count >= this.capacity) { this.dropped++; return false; }
    if (!request || !Number.isFinite(request.x) || !Number.isFinite(request.z)
      || !Number.isFinite(request.radius) || request.radius <= 0) return false;
    const d = this.descriptor, env = request.environment;
    d[0] = request.x; d[1] = request.z; d[2] = request.radius; d[3] = finite(request.time);
    d[4] = finite(request.seed); d[5] = finite(request.angle); d[6] = finite(request.envelope, 1); d[7] = finite(request.opacity, 1);
    d[8] = finite(request.transportAge); d[9] = finite(request.shutdownAge, 1e10);
    d[10] = Math.max(.001, finite(request.releaseDuration, .42)); d[11] = finite(request.cooling);
    d[12] = finite(request.r, 1); d[13] = finite(request.g, 1); d[14] = finite(request.b, 1); d[15] = finite(request.heatScale, 1);
    for (let body = 0; body < 3; body++) {
      const contact = env && body < env.count ? env.records[body] : null;
      const b = 16 + body * 4, v = 28 + body * 4;
      d[b] = finite(contact?.x); d[b + 1] = finite(contact?.z); d[b + 2] = Math.max(0, finite(contact?.radius)); d[b + 3] = contact ? finite(contact.strength, 1) : 0;
      d[v] = finite(contact?.vx); d[v + 1] = finite(contact?.vz); d[v + 2] = finite(contact?.material); d[v + 3] = 0;
    }
    const item = this.count++, offset = item * 4;
    for (let a = 0; a < this.attributes.length; a++) {
      const array = this.attributes[a].array; let dirty = false;
      for (let c = 0; c < 4; c++) if (array[offset + c] !== d[a * 4 + c]) { array[offset + c] = d[a * 4 + c]; dirty = true; }
      if (dirty) {
        this.dirtyStart[a] = Math.min(this.dirtyStart[a], item); this.dirtyEnd[a] = item + 1;
        if (this.owner) markDynamicBufferItems(this.owner, a, item);
      }
    }
    return true;
  }
  end() {
    if (this.disposed) return;
    if (this.owner) commitDynamicBufferOwner(this.owner, this.count);
    else for (let i = 0; i < this.attributes.length; i++) if (this.dirtyEnd[i] > this.dirtyStart[i]) {
      const a = this.attributes[i]; a.clearUpdateRanges();
      a.addUpdateRange(this.dirtyStart[i] * 4, (this.dirtyEnd[i] - this.dirtyStart[i]) * 4); a.needsUpdate = true;
    }
    this.geometry.instanceCount = this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    unregisterDynamicBufferOwner(this.owner); this.owner = null;
    this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose();
    this.geometry.instanceCount = this.mesh.count = this.count = 0; this.mesh.visible = false;
  }
}

/** Same linked program as live channels; warm only one retained instance. */
export function createBombFlowPrecompileMesh(materialFactory) {
  const owner = new BombFlowSurface(null, materialFactory, { capacity: 1 });
  owner.begin(); owner.add({ x: 0, z: 0, radius: 12, time: .8, transportAge: .8,
    seed: 1.2, angle: 0, envelope: 1, opacity: .88, r: .35, g: .78, b: 1 }); owner.end();
  owner.mesh.name = 'SF_Precompile_BombAccretion';
  owner.mesh.userData.precompileRetainedPipeline = 'bomb-accretion';
  return owner.mesh;
}
