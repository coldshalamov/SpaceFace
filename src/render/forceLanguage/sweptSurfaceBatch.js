import * as THREE from 'three';
import {
  registerDynamicBufferOwner, unregisterDynamicBufferOwner,
  assertDynamicBufferOwnerWritable, markDynamicBufferItems, commitDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

// One real folded mesh strip, not a billboard/point cloud. Shared by all instances. The author
// supplies an analytic path; the shader supplies the cross-section, continuous body and hot fold.
// Nine vec4 instance attributes + position + instanceMatrix use 14 of WebGL2's minimum 16 attributes.
const NAMES = ['iOrigin', 'iPath', 'iShape', 'iTint', 'iMotion', 'iFinish', 'iLife', 'iBehavior', 'iPivot'];
export const SURFACE_STATIONS = 48;
export const SURFACE_ACROSS = 5;
export const SURFACE_FLOATS = 36;
const LEGACY_DEFAULTS = [0, 0, -1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
export const SURFACE_VERTEX = /* glsl */`
attribute vec4 iOrigin; // local XYZ, orientation
attribute vec4 iPath;   // 0=polar, 1=linear, start angle, end angle, start radius/distance
attribute vec4 iShape;  // end radius/distance, width, lift, bow
attribute vec4 iTint;   // linear RGB, alpha
attribute vec4 iMotion;// flow, phase, radial traveling crest, material style
attribute vec4 iFinish;// reveal, taper, source envelope, pitch
attribute vec4 iLife; // birth seconds, build seconds (0 = legacy), releaseAt (-1 = live), release seconds
attribute vec4 iBehavior; // family animation code, semantic role, local phase, reserved
attribute vec4 iPivot; // local source XZ, reserved; permits whole-tool growth, not strip-by-strip scaling
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying vec4 vTint;
varying vec4 vFlow;
varying float vFront;
varying vec4 vCycle; // kind, release, powered local time, role
const float PI=3.14159265359;
void main(){
  float t=position.x;
  float across=position.y;
  bool cycle = iLife.y > 0.0;
  bool releasing = cycle && iLife.z >= 0.0;
  float poweredAt = releasing ? min(uTime, iLife.z) : uTime;
  float age = max(0.0, poweredAt - iLife.x);
  float motionTime = (cycle ? age : uTime) * uMotion;
  float release = releasing ? smoothstep(0.0, iLife.w, max(0.0, uTime-iLife.z)) : 0.0;
  float build = cycle ? smoothstep(0.0, iLife.y, age) : 1.0;
  float phase=fract(motionTime*0.58*iMotion.x+iMotion.y);
  bool radial = iMotion.z > 0.5 && iMotion.z < 1.5;
  bool conveyor = iMotion.z > 1.5;
  float front=radial ? 0.10+0.90*phase : 1.0;
  float a=mix(iPath.y,iPath.z,t);
  float r=mix(iPath.w,iShape.x,t)*front;
  vec2 p=vec2(cos(a),sin(a))*r;
  vec2 derivative=vec2(cos(a),sin(a))*(iShape.x-iPath.w)*front
    +vec2(-sin(a),cos(a))*r*(iPath.z-iPath.y);
  if(iPath.x>0.5){
    p=vec2(mix(iPath.w,iShape.x,t),sin(PI*t)*iShape.w);
    derivative=vec2(iShape.x-iPath.w,PI*cos(PI*t)*iShape.w);
    mat2 rot=mat2(cos(iPath.y),sin(iPath.y),-sin(iPath.y),cos(iPath.y));
    if(conveyor) p.x += phase * (iShape.x-iPath.w) * 0.65;
    p=rot*p; derivative=rot*derivative;
  }
  vec2 normal=vec2(-derivative.y,derivative.x)/max(length(derivative),0.001);
  float taper=mix(1.0,pow(max(sin(PI*t),0.0),0.65),iFinish.y);
  // Surface fold. Lifecycle growth below acts around the owning tool's source. The separate
  // physics-boundary role stays at its authoritative extent and vanishes on removal.
  p+=normal*across*iShape.y*taper;
  float height=iShape.z*sin(PI*t)+(1.0-across*across)*iShape.y*0.23*taper;
  if(iMotion.w>0.5 && iMotion.w<1.5)height+=iShape.y*(1.0-across)*0.6*taper;
  float ca=cos(iOrigin.w),sa=sin(iOrigin.w);
  height+=p.x*sin(iFinish.w);
  p.x*=cos(iFinish.w);
  p=mat2(ca,sa,-sa,ca)*p;
  vec2 relative = iOrigin.xz - iPivot.xy + p;
  float envelope = 1.0;
  if(cycle){
    float kind=iBehavior.x, role=iBehavior.y;
    float localPhase=iBehavior.z*6.2831853;
    bool boundary=role>0.5 && role<1.5;
    envelope=smoothstep(0.0,0.10,age)*(1.0-release);
    if(boundary){
      // No decorative persistence of a force boundary, including the first release frame.
      if(releasing) envelope=0.0;
    }else{
      float growth=mix(1.0,0.055+0.945*build,uMotion);
      float spin=0.0;
      if(kind<1.5){
        // Seed: opposed lock plates breathe/ratchet, never orbit or imply suction.
        float stroke=sin(motionTime*3.7+localPhase);
        relative*=1.0+uMotion*0.075*stroke;
        height+=uMotion*length(relative)*0.055*sin(motionTime*3.7+localPhase+1.1);
        spin=uMotion*(1.0-build)*0.48;
        growth*=mix(1.0,1.0-0.92*release,uMotion);
      }else if(kind<2.5){
        // Well: the silhouette itself turns and flexes; illumination is secondary motion.
        spin=(-0.48*motionTime+uMotion*0.16*sin(motionTime*1.9+t*6.28+localPhase));
        if(role>1.5)spin=0.64*motionTime;
        spin+=uMotion*((1.0-build)*1.8-release*1.15);
        growth*=mix(1.0,1.0-0.95*release,uMotion);
        height+=uMotion*iShape.y*0.34*sin(t*9.0-motionTime*3.2+localPhase);
      }else if(kind<3.5){
        // Repulsor: never a reverse Well on shutdown. Freeze the front, peel into cooling shards.
        spin=uMotion*0.055*sin(motionTime*1.7+localPhase);
        growth*=1.0+uMotion*release*0.04;
        height+=uMotion*release*iShape.y*2.8;
      }else if(kind<4.5){
        // Cone: a flowing pressure curtain, with fixed outer rails.
        relative+=vec2(-sa,ca)*uMotion*iShape.y*0.70*sin(t*7.0-motionTime*3.6+localPhase)*sin(PI*t);
        height+=uMotion*release*iShape.y*2.0;
      }else{
        // Skim: lateral scoops travel in the path stage; retiring banks fold onto the centerline.
        vec2 q=mat2(ca,-sa,sa,ca)*relative;
        q.y*=1.0-uMotion*release*0.88;
        relative=mat2(ca,sa,-sa,ca)*q;
        height+=uMotion*iShape.y*0.22*sin(motionTime*2.4+t*7.0+localPhase);
      }
      relative=mat2(cos(spin),sin(spin),-sin(spin),cos(spin))*relative*growth;
      height*=growth;
    }
  }
  vec3 world=cycle ? vec3(iPivot.x+relative.x,iOrigin.y+height,iPivot.y+relative.y)
    : iOrigin.xyz+vec3(p.x,height,p.y);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.0);
  vCycle=vec4(cycle ? iBehavior.x : 0.0,release,motionTime,iBehavior.y);
  vUv=vec2(t,across); vTint=iTint;
  vFlow=vec4(iMotion.x,iMotion.y,iMotion.w,iFinish.x);
  vFront=(radial||conveyor ? smoothstep(0.0,0.13,phase)*(1.0-smoothstep(0.76,1.0,phase)) : 1.0)*iFinish.z*envelope;
}`;
export const SURFACE_FRAGMENT = /* glsl */`
uniform float uTime;
uniform float uMotion;
uniform float uFlash;
varying vec2 vUv;
varying vec4 vTint;
varying vec4 vFlow;
varying float vFront;
varying vec4 vCycle;
void main(){
  float t=vUv.x; float v=vUv.y;
  float edge=1.0-smoothstep(0.78,1.0,abs(v));
  float tips=smoothstep(0.0,0.018,t)*(1.0-smoothstep(0.97,1.0,t));
  float reveal=1.0-smoothstep(vFlow.w-0.07,vFlow.w+0.01,t);
  float pixel=max(fwidth(v)*1.15,0.055);
  float fold=exp(-pow((v+0.40)/max(0.13,pixel),2.0));
  float rim=exp(-pow((v-0.68)/max(0.08,pixel),2.0));
  float groove=0.5+0.5*sin(t*62.0+v*8.0+vFlow.y*9.0);
  float packet=pow(0.5+0.5*cos(t*16.0-vCycle.z*vFlow.x*5.0+vFlow.y*6.283),3.0);
  float body=0.30+0.18*groove;
  float hot=(fold*(0.75+0.48*packet)+rim*0.58)*uFlash;
  if(vFlow.z>0.5 && vFlow.z<1.5){
    // Compression shell: one outward-facing crest over a broad, descending pressure skirt.
    hot=(fold*0.25+rim*(1.25+0.12*packet))*uFlash;
    body=0.34+0.27*(1.0-smoothstep(-0.6,0.9,v));
  }
  if(vFlow.z>1.5 && vFlow.z<2.5){
    // Frame-lock jaws are solid, machined force plates, not another glowing ring.
    float ratchet=pow(0.5+0.5*cos(t*11.0-vCycle.z*4.4+vFlow.y*6.283),4.0);
    body=0.48+0.20*groove;hot=(fold*(0.22+ratchet*0.70)+rim*0.68)*uFlash;
  }
  if(vFlow.z>2.5 && vFlow.z<3.5){
    // Kinetic: torn, hard striations and dead metal between the directed explosive blades.
    body=0.12+0.18*step(0.45,groove); hot*=0.82+0.18*step(0.3,sin(t*87.0+v*13.0));
  }
  float fracture=1.0;
  if(vCycle.y>0.0){
    // Persistent fragments cool and erode; they do not remain active conveyor/force symbols.
    float grain=fract(sin(floor(t*38.0)*127.1+floor((v+1.0)*6.0)*311.7+vFlow.y*51.0)*43758.5453);
    fracture=smoothstep(vCycle.y-0.18,vCycle.y+0.06,grain);
    if(vCycle.x>3.5 && vCycle.x<4.5)fracture*=smoothstep(vCycle.y-0.12,vCycle.y+0.08,t);
    hot*=1.0-0.88*vCycle.y;
    body*=1.0-0.45*vCycle.y;
  }
  vec3 color=vTint.rgb*(body+hot*1.5)+vec3(0.55,0.68,0.78)*pow(fold,3.0)*hot*0.40;
  float alpha=edge*tips*reveal*vTint.a*vFront*fracture*(0.57+0.43*max(fold,rim));
  if(alpha<0.003)discard;
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

function stripGeometry(){
  const g=new THREE.BufferGeometry();
  const p=new Float32Array((SURFACE_STATIONS+1)*(SURFACE_ACROSS+1)*3);
  const ix=new Uint16Array(SURFACE_STATIONS*SURFACE_ACROSS*6);
  let n=0,k=0;
  for(let s=0;s<=SURFACE_STATIONS;s++)for(let a=0;a<=SURFACE_ACROSS;a++){
    p[n++]=s/SURFACE_STATIONS; p[n++]=a/SURFACE_ACROSS*2-1; p[n++]=0;
  }
  for(let s=0;s<SURFACE_STATIONS;s++)for(let a=0;a<SURFACE_ACROSS;a++){
    const j=s*(SURFACE_ACROSS+1)+a,b=j+SURFACE_ACROSS+1;
    ix[k++]=j;ix[k++]=b;ix[k++]=j+1;ix[k++]=b;ix[k++]=b+1;ix[k++]=j+1;
  }
  g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(new THREE.BufferAttribute(ix,1));
  return g;
}

export class SweptSurfaceBatch {
  constructor(scene,{capacity=224,name='SF_ForceSurfaces'}={}){
    this.capacity=capacity;this.count=0;this.disposed=false;this.dropped=0;
    this.geometry=stripGeometry();this.attributes=[];this.dirty=new Uint8Array(NAMES.length);
    for(const name of NAMES){
      const attr=new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name,attr);this.attributes.push(attr);
    }
    this.material=new THREE.ShaderMaterial({
      name:'SF_FoldedForceSurface',vertexShader:SURFACE_VERTEX,fragmentShader:SURFACE_FRAGMENT,
      uniforms:{uTime:{value:0},uMotion:{value:1},uFlash:{value:1}},
      transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,forceSinglePass:true,
      blending:THREE.NormalBlending,toneMapped:false,
    });
    this.mesh=new THREE.InstancedMesh(this.geometry,this.material,capacity);
    this.mesh.name=name;this.mesh.frustumCulled=false;this.mesh.count=0;this.mesh.visible=false;
    this.mesh.renderOrder=16;
    const identity=new THREE.Matrix4();for(let i=0;i<capacity;i++)this.mesh.setMatrixAt(i,identity);
    this.mesh.instanceMatrix.needsUpdate=true;
    if(scene)scene.add(this.mesh);
    this.owner=registerDynamicBufferOwner(scene,{id:name,mesh:this.mesh,attributes:NAMES.map((name,i)=>({name,attribute:this.attributes[i]}))});
  }
  begin(time=0,reducedMotion=false,reducedFlash=false){
    if(this.disposed)return false;
    assertDynamicBufferOwnerWritable(this.owner);
    this.count=0;this.dropped=0;this.dirty.fill(0);
    const u=this.material.uniforms;
    u.uTime.value=Number.isFinite(time)?time:0;u.uMotion.value=reducedMotion?0:1;u.uFlash.value=reducedFlash?0.56:1;
    return true;
  }
  /** Copy a retained 36-float descriptor (24-float weapon callers remain compatible). Stable fields animate via a uniform, no buffer uploads. */
  add(values){
    if(this.disposed)return false;
    if(this.count>=this.capacity){this.dropped++;return false;}
    const item=this.count++,off=item*4;
    for(let b=0;b<NAMES.length;b++){
      const arr=this.attributes[b].array;let changed=false;
      for(let c=0;c<4;c++){
        const index=b*4+c;
        const value=Math.fround(index<values.length ? values[index] : LEGACY_DEFAULTS[index-24]);
        if(arr[off+c]!==value){arr[off+c]=value;changed=true;}
      }
      if(changed){this.dirty[b]=1;if(this.owner)markDynamicBufferItems(this.owner,b,item);}
    }
    return true;
  }
  end(){
    if(this.disposed)return;
    if(this.owner)commitDynamicBufferOwner(this.owner,this.count);
    else {this.mesh.count=this.count;for(let b=0;b<NAMES.length;b++)if(this.dirty[b])this.attributes[b].needsUpdate=true;}
    this.mesh.visible=this.count>0;
  }
  reproject(dx,dz){
    if(this.disposed||!this.mesh.count||(!dx&&!dz))return;
    assertDynamicBufferOwnerWritable(this.owner);
    const attr=this.attributes[0],array=attr.array;
    const pivot=this.attributes[8],pa=pivot.array;
    for(let i=0;i<this.mesh.count;i++){array[i*4]+=dx;array[i*4+2]+=dz;pa[i*4]+=dx;pa[i*4+1]+=dz;}
    if(this.owner){markDynamicBufferItems(this.owner,0,0,this.mesh.count);markDynamicBufferItems(this.owner,8,0,this.mesh.count);commitDynamicBufferOwner(this.owner,this.mesh.count);}
    else {attr.needsUpdate=true;pivot.needsUpdate=true;}
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    unregisterDynamicBufferOwner(this.owner);this.owner=null;
    this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();this.mesh.dispose();
  }
}

/** Same material/geometry key as runtime; renderer startup staging owns these resources. */
export function createForceSurfacePrecompileMesh(){
  const group=new THREE.Group();const batch=new SweptSurfaceBatch(group,{capacity:1,name:'SF_Precompile_ForceSurface'});
  const d=new Float32Array([0,0,0,0, 0,0,5.5,4, 4,0.8,0,0, 0.2,0.6,1,1, 0,0,0,0, 1,0,1,0]);
  batch.begin();batch.add(d);batch.end();batch.mesh.removeFromParent();return batch.mesh;
}
