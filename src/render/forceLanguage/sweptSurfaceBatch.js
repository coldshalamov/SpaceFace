import * as THREE from 'three';
import {
  registerDynamicBufferOwner, unregisterDynamicBufferOwner,
  assertDynamicBufferOwnerWritable, markDynamicBufferItems, commitDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

// One real folded mesh strip, not a billboard/point cloud. Shared by all instances. The author
// supplies an analytic path; the shader supplies the cross-section, continuous body and hot fold.
// Six vec4 instance attributes + position fit WebGL2's minimum vertex attribute budget.
const NAMES = ['iOrigin', 'iPath', 'iShape', 'iTint', 'iMotion', 'iFinish'];
export const SURFACE_STATIONS = 48;
export const SURFACE_ACROSS = 5;
export const SURFACE_FLOATS = 24;
export const SURFACE_VERTEX = /* glsl */`
attribute vec4 iOrigin; // local XYZ, orientation
attribute vec4 iPath;   // 0=polar, 1=linear, start angle, end angle, start radius/distance
attribute vec4 iShape;  // end radius/distance, width, lift, bow
attribute vec4 iTint;   // linear RGB, alpha
attribute vec4 iMotion;// flow, phase, radial traveling crest, material style
attribute vec4 iFinish;// reveal, taper, source envelope, pitch
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying vec4 vTint;
varying vec4 vFlow;
varying float vFront;
const float PI=3.14159265359;
void main(){
  float t=position.x;
  float across=position.y;
  float phase=fract(uTime*0.46*uMotion*iMotion.x+iMotion.y);
  float front=mix(1.0,0.13+0.87*phase,iMotion.z);
  float a=mix(iPath.y,iPath.z,t);
  float r=mix(iPath.w,iShape.x,t)*front;
  vec2 p=vec2(cos(a),sin(a))*r;
  vec2 derivative=vec2(cos(a),sin(a))*(iShape.x-iPath.w)*front
    +vec2(-sin(a),cos(a))*r*(iPath.z-iPath.y);
  if(iPath.x>0.5){
    p=vec2(mix(iPath.w,iShape.x,t),sin(PI*t)*iShape.w);
    derivative=vec2(iShape.x-iPath.w,PI*cos(PI*t)*iShape.w);
    mat2 rot=mat2(cos(iPath.y),sin(iPath.y),-sin(iPath.y),cos(iPath.y));
    p=rot*p; derivative=rot*derivative;
  }
  vec2 normal=vec2(-derivative.y,derivative.x)/max(length(derivative),0.001);
  float taper=mix(1.0,pow(max(sin(PI*t),0.0),0.65),iFinish.y);
  // Growth is a reveal, NOT a false expanding influence boundary. Actual range stays fixed.
  p+=normal*across*iShape.y*taper;
  float height=iShape.z*sin(PI*t)+(1.0-across*across)*iShape.y*0.23*taper;
  if(iMotion.w>0.5 && iMotion.w<1.5)height+=iShape.y*(1.0-across)*0.6*taper;
  float ca=cos(iOrigin.w),sa=sin(iOrigin.w);
  height+=p.x*sin(iFinish.w);
  p.x*=cos(iFinish.w);
  p=mat2(ca,sa,-sa,ca)*p;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(iOrigin.xyz+vec3(p.x,height,p.y),1.0);
  vUv=vec2(t,across); vTint=iTint;
  vFlow=vec4(iMotion.x,iMotion.y,iMotion.w,iFinish.x);
  vFront=mix(1.0,smoothstep(0.0,0.13,phase)*(1.0-smoothstep(0.76,1.0,phase)),iMotion.z)*iFinish.z;
}`;
export const SURFACE_FRAGMENT = /* glsl */`
uniform float uTime;
uniform float uMotion;
uniform float uFlash;
varying vec2 vUv;
varying vec4 vTint;
varying vec4 vFlow;
varying float vFront;
void main(){
  float t=vUv.x; float v=vUv.y;
  float edge=1.0-smoothstep(0.78,1.0,abs(v));
  float tips=smoothstep(0.0,0.018,t)*(1.0-smoothstep(0.97,1.0,t));
  float reveal=1.0-smoothstep(vFlow.w-0.07,vFlow.w+0.01,t);
  float pixel=max(fwidth(v)*1.15,0.055);
  float fold=exp(-pow((v+0.40)/max(0.13,pixel),2.0));
  float rim=exp(-pow((v-0.68)/max(0.08,pixel),2.0));
  float groove=0.5+0.5*sin(t*62.0+v*8.0+vFlow.y*9.0);
  float packet=pow(0.5+0.5*cos(t*16.0-uTime*vFlow.x*5.0*uMotion+vFlow.y*6.283),4.0);
  float body=0.30+0.18*groove;
  float hot=(fold*(0.75+0.48*packet)+rim*0.58)*uFlash;
  if(vFlow.z>0.5 && vFlow.z<1.5){
    // Compression shell: one outward-facing crest over a broad, descending pressure skirt.
    hot=(fold*0.25+rim*(1.25+0.12*packet))*uFlash;
    body=0.34+0.27*(1.0-smoothstep(-0.6,0.9,v));
  }
  if(vFlow.z>1.5 && vFlow.z<2.5){
    // Frame-lock jaws are solid, machined force plates, not another glowing ring.
    body=0.62+0.20*groove;hot=(fold*0.22+rim*0.68)*uFlash;
  }
  if(vFlow.z>2.5 && vFlow.z<3.5){
    // Kinetic: torn, hard striations and dead metal between the directed explosive blades.
    body=0.12+0.18*step(0.45,groove); hot*=0.82+0.18*step(0.3,sin(t*87.0+v*13.0));
  }
  vec3 color=vTint.rgb*(body+hot*1.5)+vec3(0.55,0.68,0.78)*pow(fold,3.0)*hot*0.40;
  float alpha=edge*tips*reveal*vTint.a*vFront*(0.57+0.43*max(fold,rim));
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
  /** Copy a retained 24-float descriptor. Stable fields animate via a uniform, no buffer uploads. */
  add(values){
    if(this.disposed)return false;
    if(this.count>=this.capacity){this.dropped++;return false;}
    const item=this.count++,off=item*4;
    for(let b=0;b<6;b++){
      const arr=this.attributes[b].array;let changed=false;
      for(let c=0;c<4;c++){
        const value=Math.fround(values[b*4+c]);
        if(arr[off+c]!==value){arr[off+c]=value;changed=true;}
      }
      if(changed){this.dirty[b]=1;if(this.owner)markDynamicBufferItems(this.owner,b,item);}
    }
    return true;
  }
  end(){
    if(this.disposed)return;
    if(this.owner)commitDynamicBufferOwner(this.owner,this.count);
    else {this.mesh.count=this.count;for(let b=0;b<6;b++)if(this.dirty[b])this.attributes[b].needsUpdate=true;}
    this.mesh.visible=this.count>0;
  }
  reproject(dx,dz){
    if(this.disposed||!this.mesh.count||(!dx&&!dz))return;
    assertDynamicBufferOwnerWritable(this.owner);
    const attr=this.attributes[0],array=attr.array;
    for(let i=0;i<this.mesh.count;i++){array[i*4]+=dx;array[i*4+2]+=dz;}
    if(this.owner){markDynamicBufferItems(this.owner,0,0,this.mesh.count);commitDynamicBufferOwner(this.owner,this.mesh.count);}
    else attr.needsUpdate=true;
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
