// Read-only emergent combat presentation. Four bounded draws, four physical verbs:
// connected current, rupturing pressure, deposited matter, and optical fracture.
import * as THREE from 'three';
import { EMERGENT_TUNING } from '../../data/emergentPrimitives.js';
import { sampleDischargeLifecycle, sampleFieldLifecycle } from './effectLifecycle.js';

const TAU = Math.PI * 2;
const CAPS = [64, 24, 16, 16];
const KINDS = ['arc', 'ring', 'gel', 'prism'];
const DEPOSIT_CYCLE = Object.freeze({ attack: 0.24, release: 0.34, code: 0 });
const PRISM_CYCLE = Object.freeze({ attack: 0.18, release: 0.28, code: 0 });
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

// Parameters describe constructed surfaces, not noise final art. Variation changes articulated
// shape and transport timing, never the simulation's RNG or a moving-position texture hash.
const DEFORM = /* glsl */`
attribute vec3 aSurface;
attribute vec4 iResponse; // stable seed, build/extent, heat, retirement
attribute float iBorn;
#if FAMILY == 1
attribute vec3 aPressure; // position along this broken front, authored reach, trailing depth
#endif
uniform float uTime;
uniform float uMotion;
varying vec3 vSurface;
varying vec4 vResponse;
varying float vClock;
vec3 current(float u, float seed, float clock) {
  float runout = sin(u * 3.14159265);
  return vec3(u - 0.5,
    runout * (0.30*sin(u*19.0+seed+clock*11.0) + 0.12*sin(u*41.0-seed-clock*7.0)),
    runout * (0.62*sin(u*15.0+seed-clock*13.0) + 0.24*sin(u*33.0+clock*9.0)));
}
vec3 articulate(vec3 p) {
  float seed=iResponse.x, clock=max(0.0,uTime-iBorn)*uMotion;
  float u=aSurface.x, v=aSurface.y, member=aSurface.z;
  vSurface=aSurface; vResponse=iResponse; vClock=clock;
#if FAMILY == 0
  float junction=member<1.5?0.29:0.64;
  float path=member<0.5?u:mix(junction,junction+0.20,u);
  vec3 center=current(path,seed,clock);
  if(member>0.5) {
    vec3 root=current(junction,seed,clock);
    center=mix(root,center,u);
    center.z+=sin(u*1.57)*(member<1.5?0.72:-0.85);
    center.y+=sin(u*2.3+member)*u*0.28;
  }
  float taper=member<0.5?0.72+0.28*sin(u*3.14159):1.0-u;
  float radius=0.18*taper*(0.65+0.35*iResponse.y);
  return center+vec3(0.0,cos(v)*radius,sin(v)*radius);
#elif FAMILY == 1
  // Five unequal compression sheets instead of one circular cross-section. Their narrow
  // hot edges lead, while broad radial folds open behind them and tear into tapered runoff.
  float along=aPressure.x;
  vSurface.x=along;
  float shoulder=pow(max(0.0,sin(along*3.14159265)),0.70);
  float progress=(0.24+0.70*iResponse.y);
  float advance=min(clock,0.65)*(0.24+0.09*sin(member*1.9+seed));
  float reach=aPressure.y*(0.90+0.12*sin(member*2.17+seed));
  float bow=0.14*shoulder+0.11*(along-0.5)*sin(member+seed);
  float front=(reach+bow)*progress+advance;
  float creasePhase=along*(13.0+member*1.3)+seed;
  float folded=sin(creasePhase-v*3.2-clock*6.0);
  float tornTail=0.75+0.19*sin(creasePhase)+0.09*sin(along*31.0+member);
  float depth=aPressure.z*shoulder*tornTail*(1.0-iResponse.w*0.48);
  float r=front-depth*pow(1.0-v,0.78);
  float angle=u+sin(member*3.7+seed)*0.08+(1.0-v)*shoulder*0.08*folded;
  float foldHeight=shoulder*sin(v*3.14159265)*(0.10+0.12*folded);
  float leadingFold=shoulder*max(0.0,1.0-abs(v-0.82)*5.5)*0.12;
  return vec3(cos(angle)*r,foldHeight+leadingFold+advance*0.04,sin(angle)*r);
#elif FAMILY == 2
  // The opaque deposit rises within its real footprint. Closed underside preserves mass.
  float edge=pow(clamp(u,0.0,1.0),5.0);
  float creep=(sin(v*5.0-clock*1.8+seed)+0.4*sin(v*9.0+clock*1.1))*0.012;
  p.xz*=1.0-edge*(0.025+creep)*uMotion;
  p.y*=0.22+0.78*iResponse.y;
  p.y+=max(0.0,p.y)*edge*0.13*sin(v*6.0-clock*2.1+seed)*uMotion;
  p.y*=1.0-0.92*iResponse.w;
  return p;
#else
  // Keep splinters aligned with the actual reflecting plane. Small shear, no false spin.
  p.x+=sin(clock*1.9+seed+member*2.1)*0.018*p.y*uMotion;
  p.z+=sin(clock*1.4-seed+member)*0.012*p.y*uMotion;
  p.y*=0.22+0.78*iResponse.y;
  p.y*=1.0-0.90*iResponse.w;
  return p;
#endif
}
`;

const ENERGY_VERTEX = /* glsl */`
${DEFORM}
varying vec3 vViewPosition;
void main() {
  vec4 view=modelViewMatrix*instanceMatrix*vec4(articulate(position),1.0);
  vViewPosition=-view.xyz;
  gl_Position=projectionMatrix*view;
}`;
const ENERGY_FRAGMENT = /* glsl */`
uniform float uTime;
uniform float uMotion;
uniform float uFlash;
varying vec3 vSurface;
varying vec4 vResponse;
varying float vClock;
varying vec3 vViewPosition;
void main() {
  vec3 n=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
  float grazing=pow(1.0-abs(dot(n,normalize(vViewPosition))),2.0);
  float time=vClock;
  float heat=vResponse.z;
#if FAMILY == 0
  float stream=pow(0.5+0.5*sin(vSurface.x*24.0-time*19.0+vResponse.x),6.0);
  float core=0.36+0.64*abs(cos(vSurface.y));
  vec3 color=mix(vec3(0.045,0.19,0.54),vec3(0.68,0.94,1.0),core);
  color*=0.62+uFlash*heat*(2.0+stream*3.2+grazing);
#else
  float crest=smoothstep(0.70,0.91,vSurface.y)*(1.0-smoothstep(0.95,1.0,vSurface.y)*0.85);
  float fold=pow(0.5+0.5*cos(vSurface.x*(13.0+vSurface.z*1.3)-vSurface.y*3.2-time*6.0+vResponse.x),6.0);
  float radialRunoff=fold*pow(vSurface.y,0.65)*(1.0-crest);
  vec3 color=mix(vec3(0.075,0.055,0.095),vec3(0.82,0.18,0.045),radialRunoff*0.75);
  color=mix(color,vec3(1.0,0.76,0.38),crest);
  color*=0.60+heat*uFlash*(0.65+crest*3.4+radialRunoff*1.5+grazing*0.45);
#endif
  float density=clamp(heat*1.35,0.0,1.0);
#if FAMILY == 1
  density*=smoothstep(0.0,0.11,vSurface.y)*(0.68+0.32*max(crest,radialRunoff));
#endif
  gl_FragColor=vec4(color,density);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeGeometry(positions, surfaces, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSurface', new THREE.Float32BufferAttribute(surfaces, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function currentGeometry() {
  const positions = [], surfaces = [], indices = [];
  for (let branch = 0; branch < 3; branch++) {
    const segments = branch ? 14 : 40, start = positions.length / 3;
    for (let i = 0; i <= segments; i++) for (let side = 0; side <= 6; side++) {
      positions.push(i / segments - 0.5, Math.cos(side / 6 * TAU)*0.06, Math.sin(side / 6 * TAU)*0.06);
      surfaces.push(i / segments, side / 6 * TAU, branch);
    }
    for (let i = 0; i < segments; i++) for (let side = 0; side < 6; side++) {
      const a = start + i * 7 + side, b = a + 7;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  return makeGeometry(positions,surfaces,indices);
}

function pressureGeometry() {
  const positions = [], surfaces = [], pressure = [], indices = [];
  // Unequal front angle/span/reach/depth. Open angular gaps and tapering ends prevent a
  // circular icon even before deformation; depth carries visible material behind the edge.
  const fronts = [
    [0.08,0.86,1.00,0.52], [1.28,0.56,0.78,0.36], [2.22,1.12,1.08,0.65],
    [3.73,0.89,0.83,0.45], [5.08,0.73,0.98,0.56],
  ];
  const alongSteps=24,radialSteps=10;
  for (let petal = 0; petal < fronts.length; petal++) {
    const [startAngle,span,reach,depth]=fronts[petal];
    const start = positions.length / 3;
    for (let i = 0; i <= alongSteps; i++) for (let j = 0; j <= radialSteps; j++) {
      const along=i/alongSteps,radial=j/radialSteps,angle=startAngle+along*span;
      const radius=reach-depth*Math.sin(along*Math.PI)*(1-radial);
      positions.push(Math.cos(angle)*radius,Math.sin(radial*Math.PI)*0.12,Math.sin(angle)*radius);
      surfaces.push(angle,radial,petal);pressure.push(along,reach,depth);
    }
    for (let i = 0; i < alongSteps; i++) for (let j = 0; j < radialSteps; j++) {
      const a = start+i*(radialSteps+1)+j, b=a+radialSteps+1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
  }
  const geometry=makeGeometry(positions,surfaces,indices);
  geometry.setAttribute('aPressure',new THREE.Float32BufferAttribute(pressure,3));
  return geometry;
}

function depositGeometry() {
  const positions = [], surfaces = [], indices = [], sides = 72, rings = 16;
  for (let ring = 0; ring <= rings; ring++) for (let side = 0; side <= sides; side++) {
    const u = ring/rings, angle = side/sides*TAU;
    const lobe = 0.91+0.052*Math.cos(angle*5)+0.025*Math.cos(angle*9+0.4);
    const r = u*lobe;
    const y = 0.035+Math.pow(1-u*u,1.4)*(0.18+0.025*Math.cos(angle*3)*u);
    positions.push(Math.cos(angle)*r,y,Math.sin(angle)*r);
    surfaces.push(u,angle,0);
  }
  for (let ring = 0; ring < rings; ring++) for (let side = 0; side < sides; side++) {
    const a=ring*(sides+1)+side,b=a+sides+1;
    indices.push(a,a+1,b,a+1,b+1,b);
  }
  const center=positions.length/3;
  positions.push(0,0,0); surfaces.push(0,0,1);
  const base=positions.length/3;
  for(let side=0;side<=sides;side++) {
    const angle=side/sides*TAU,lobe=0.91+0.052*Math.cos(angle*5)+0.025*Math.cos(angle*9+0.4);
    positions.push(Math.cos(angle)*lobe,0,Math.sin(angle)*lobe); surfaces.push(1,angle,1);
    if(side<sides) {
      const top=rings*(sides+1)+side,bottom=base+side;
      indices.push(top,top+1,bottom,top+1,bottom+1,bottom,center,bottom,bottom+1);
    }
  }
  return makeGeometry(positions,surfaces,indices);
}

function prismGeometry() {
  const positions=[],surfaces=[],indices=[];
  // Three unequal bevel-cut splinters: broad reflecting faces, narrow chipped edges.
  for(let shard=0;shard<3;shard++) {
    const start=positions.length/3, offset=(shard-1)*0.37;
    for(let level=0;level<4;level++) for(let side=0;side<8;side++) {
      const angle=side/8*TAU+0.18, height=[-0.22,-0.06,0.72,1.0][level];
      const width=[0.14,0.44,0.35,0.04][level]*(shard===1?1:0.68);
      positions.push(offset+Math.cos(angle)*width+height*(shard-1)*0.13,
        height*(shard===1?1.15:0.78),Math.sin(angle)*width*0.49+(shard%2)*0.07);
      surfaces.push(side/8,level/3,shard);
    }
    for(let level=0;level<3;level++) for(let side=0;side<8;side++) {
      const a=start+level*8+side,b=start+level*8+(side+1)%8;
      indices.push(a,a+8,b,b,a+8,b+8);
    }
    for(let side=1;side<7;side++) {
      indices.push(start,start+side+1,start+side,start+24,start+24+side,start+24+side+1);
    }
  }
  const indexed=makeGeometry(positions,surfaces,indices),geometry=indexed.toNonIndexed();
  indexed.dispose();geometry.computeVertexNormals();
  return geometry;
}

function material(family, uniforms) {
  if(family<2) return new THREE.ShaderMaterial({
    name: family===0?'emergent-connected-current':'emergent-pressure-fracture',
    defines:{FAMILY:family},uniforms,vertexShader:ENERGY_VERTEX,fragmentShader:ENERGY_FRAGMENT,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
  });
  const mat=new THREE.MeshPhysicalMaterial({
    name:family===2?'emergent-reactive-deposit':'emergent-optical-splinters',
    color:family===2?0x174d47:0x78a8b8,roughness:family===2?0.28:0.15,
    metalness:family===2?0.22:0.55,clearcoat:0.8,clearcoatRoughness:0.15,
    transparent:false,depthWrite:true,toneMapped:false,
  });
  mat.defines={...mat.defines,FAMILY:family};
  mat.userData.uniforms=uniforms;
  mat.onBeforeCompile=(shader)=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=DEFORM+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=articulate(position);');
    shader.fragmentShader=`uniform float uTime; uniform float uMotion; uniform float uFlash;
      varying vec3 vSurface; varying vec4 vResponse; varying float vClock;\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',/* glsl */`
      #include <emissivemap_fragment>
      float opticalEdge=pow(1.0-abs(dot(normal,normalize(vViewPosition))),3.0);
      float transport=vClock;
      ${family===2?`
      float seam=pow(0.5+0.5*sin(vSurface.y*7.0-vSurface.x*17.0+transport*2.3+vResponse.x),12.0);
      float boundary=smoothstep(0.65,0.92,vSurface.x)*(1.0-smoothstep(0.94,1.0,vSurface.x));
      diffuseColor.rgb*=0.73+0.27*sin(vSurface.x*24.0+vSurface.y*3.0);
      totalEmissiveRadiance+=vec3(0.08,0.78,0.46)*(boundary*(0.34+seam*0.7)+opticalEdge*0.1)*uFlash*vResponse.z;
      `:`
      vec3 spectral=0.5+0.5*cos(vec3(0.0,2.1,4.2)+opticalEdge*8.0+vSurface.z*1.7+vResponse.x);
      float travellingFace=pow(0.5+0.5*sin(vSurface.y*9.0-transport*2.6+vResponse.x),8.0);
      totalEmissiveRadiance+=(spectral*opticalEdge*(0.75+travellingFace*1.6)+vec3(0.025,0.065,0.08))*uFlash*vResponse.z;
      diffuseColor.rgb*=0.70+spectral*opticalEdge*0.8;
      `}
    `);
  };
  mat.customProgramCacheKey=()=>`emergent-structure-${family}-v1`;
  return mat;
}

function seedFor(item, time) {
  // Event seed, not visible hash texture. Birth varies repeated deployments at the same place.
  const value=Math.sin(finite(item.x)*12.9898+finite(item.z)*7.233+finite(item.x2)*3.1
    +finite(item.z2)*1.37+finite(item.scale)*9.7+time*11.17)*43758.5453;
  return (value-Math.floor(value))*TAU;
}

export function createEmergentPrimitivePools() {
  const group=new THREE.Group();group.name='emergent-primitive-pools';
  const uniforms={uTime:{value:0},uMotion:{value:1},uFlash:{value:1}};
  const geometries=[currentGeometry(),pressureGeometry(),depositGeometry(),prismGeometry()];
  const meshes=[],slots=[];
  for(let family=0;family<4;family++) {
    const geometry=geometries[family];
    geometry.setAttribute('iResponse',new THREE.InstancedBufferAttribute(new Float32Array(CAPS[family]*4),4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('iBorn',new THREE.InstancedBufferAttribute(new Float32Array(CAPS[family]),1).setUsage(THREE.DynamicDrawUsage));
    const inst=new THREE.InstancedMesh(geometry,material(family,uniforms),CAPS[family]);
    inst.name=`emergent-${KINDS[family]}`;inst.count=0;inst.visible=false;inst.frustumCulled=false;
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);meshes.push(inst);group.add(inst);
    slots.push(Array.from({length:CAPS[family]},()=>({key:null,x:0,z:0,x2:0,z2:0,scale:0,yaw:0,born:0,seed:0,seen:false})));
  }
  const [arcs,rings,gels,prisms]=meshes;
  const local={x:0,z:0},counts={arcs:0,rings:0,gels:0,prisms:0},admitted=new Uint16Array(4);
  const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),position=new THREE.Vector3(),scaleVec=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const envelope={length:1,width:1,opacity:1,build:1,release:0,scale:1,crossScale:1,stage:''};
  let clock=0,disposed=false;
  function map(x,z,toLocal) {
    if(typeof toLocal==='function')toLocal(x,z,local);else {local.x=x;local.z=z;}
  }
  function sourceOf(world,item,family) {
    const list=family===2?world.fields:family===3?world.prisms:world.flashes;
    if(!list)return null;
    let best=null;
    for(let i=0;i<list.length;i++) {
      const source=list[i];
      if(source.x!==item.x||source.z!==item.z)continue;
      if(family<2&&(source.kind!==item.kind||source.x2!==item.x2||source.z2!==item.z2||source.scale!==item.scale))continue;
      if(family>=2&&source.radius!==item.scale)continue;
      if(family===3&&finite(source.yaw)!==finite(item.yaw))continue;
      if(family>=2)return source;
      if(!best||source.ttl>best.ttl)best=source;
    }
    return best;
  }
  function response(inst,index,seed,growth,heat,retirement) {
    const attr=inst.geometry.attributes.iResponse,a=attr.array,at=index*4;
    if(a[at]!==Math.fround(seed)||a[at+1]!==Math.fround(growth)||a[at+2]!==Math.fround(heat)||a[at+3]!==Math.fround(retirement)) {
      a[at]=seed;a[at+1]=growth;a[at+2]=heat;a[at+3]=retirement;attr.needsUpdate=true;
    }
  }
  return {
    group,arcs,rings,gels,prisms,
    update(state,toLocal) {
      if(disposed)return counts;
      const now=finite(state?.simTime,clock);
      if(now<clock)for(const family of slots)for(const slot of family)slot.key=null;
      clock=now;uniforms.uTime.value=clock;
      const video=state?.settings?.video,a11y=state?.settings?.accessibility;
      const reducedMotion=!!(video?.motionReduce||a11y?.motionReduce||a11y?.reducedMotion||a11y?.reduceMotion);
      uniforms.uMotion.value=reducedMotion?0:1;
      uniforms.uFlash.value=video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash?0.24:1;
      for(let family=0;family<4;family++) {admitted[family]=0;for(const slot of slots[family])slot.seen=false;}
      const world=state?.emergent,items=world?.presentation;
      const count=Math.min(items?.length||0,Math.max(0,world?.presentationCount|0));
      for(let i=0;i<count;i++) {
        const item=items[i];if(!item)continue;
        const family=KINDS.indexOf(item.kind);
        if(family<0||admitted[family]>=CAPS[family])continue;
        const x=finite(item.x),z=finite(item.z),x2=finite(item.x2,x),z2=finite(item.z2,z);
        const extent=Number.isFinite(item.scale)&&item.scale>0?item.scale:family===2?12:family===3?2.4:8,yaw=finite(item.yaw);
        if(family===0&&Math.hypot(x2-x,z2-z)<=0.05)continue;
        // The thermal producer publishes a new overlapping flash every tick. One connection
        // carries that energy; do not stack a dozen opaque copies of the same silhouette.
        let duplicate=false;
        for(const candidate of slots[family])if(candidate.seen&&candidate.x===x&&candidate.z===z&&candidate.x2===x2&&candidate.z2===z2&&candidate.scale===extent&&candidate.yaw===yaw){duplicate=true;break;}
        if(duplicate)continue;
        const source=sourceOf(world,item,family);
        let slot=null;
        for(const candidate of slots[family]) {
          if(candidate.key===null||candidate.seen)continue;
          if((source&&candidate.key===source)||(candidate.x===x&&candidate.z===z&&candidate.x2===x2&&candidate.z2===z2&&candidate.scale===extent&&candidate.yaw===yaw)) {slot=candidate;break;}
        }
        if(!slot)for(const candidate of slots[family])if(candidate.key===null){slot=candidate;break;}
        if(!slot)for(const candidate of slots[family])if(!candidate.seen){slot=candidate;break;}
        if(!slot)continue;
        const samePose=slot.x===x&&slot.z===z&&slot.x2===x2&&slot.z2===z2&&slot.scale===extent&&slot.yaw===yaw;
        const fresh=slot.key===null||(!samePose&&(!source||slot.key!==source));
        if(fresh){slot.born=clock;slot.seed=seedFor(item,clock);}
        slot.key=source||true;slot.x=x;slot.z=z;slot.x2=x2;slot.z2=z2;slot.scale=extent;slot.yaw=yaw;slot.seen=true;
        const index=admitted[family]++,inst=meshes[family];
        const bornAttribute=inst.geometry.attributes.iBorn;
        if(bornAttribute.array[index]!==Math.fround(slot.born)){bornAttribute.array[index]=slot.born;bornAttribute.needsUpdate=true;}
        map(x,z,toLocal);const ax=local.x,az=local.z;
        if(family===0) {
          map(x2,z2,toLocal);const dx=local.x-ax,dz=local.z-az,len=Math.hypot(dx,dz),width=Math.min(3,Math.max(0.85,len*0.055));
          position.set((ax+local.x)*0.5,0.5,(az+local.z)*0.5);scaleVec.set(len,width,width);
          quaternion.setFromAxisAngle(up,-Math.atan2(dz,dx));
        } else {position.set(ax,family===3?0.6:0.2,az);scaleVec.set(extent,extent,extent);quaternion.setFromAxisAngle(up,-yaw);}
        matrix.compose(position,quaternion,scaleVec);
        const target=inst.instanceMatrix.array,offset=index*16,values=matrix.elements;
        let dirty=false;for(let j=0;j<16;j++)if(target[offset+j]!==Math.fround(values[j])){target[offset+j]=values[j];dirty=true;}
        if(dirty)inst.instanceMatrix.needsUpdate=true;
        let age=Math.max(0,clock-slot.born);
        if(family<2) {
          if(Number.isFinite(source?.ttl))age=Math.max(0,0.22-source.ttl);
          const phase=source?Math.min(1,age/0.22):Math.min(0.45,age/0.22);
          sampleDischargeLifecycle(phase*0.22,0.22,reducedMotion,envelope);
          response(inst,index,slot.seed,envelope.length,envelope.opacity,reducedMotion?0:phase);
        } else {
          const life=family===2?EMERGENT_TUNING.viscosityLife:EMERGENT_TUNING.prismLife;
          const cycle=family===2?DEPOSIT_CYCLE:PRISM_CYCLE;
          if(Number.isFinite(source?.life))age=Math.max(0,life-source.life);
          const releaseAt=Number.isFinite(source?.life)&&age>=life-cycle.release?life-cycle.release:-1;
          sampleFieldLifecycle(age,0,releaseAt,cycle,envelope);
          response(inst,index,slot.seed,reducedMotion?1:envelope.scale,0.7+0.3*envelope.build,envelope.release);
        }
      }
      for(let family=0;family<4;family++) {
        meshes[family].count=admitted[family];meshes[family].visible=admitted[family]>0;
        for(const slot of slots[family])if(!slot.seen)slot.key=null;
      }
      counts.arcs=admitted[0];counts.rings=admitted[1];counts.gels=admitted[2];counts.prisms=admitted[3];
      return counts;
    },
    dispose() {
      if(disposed)return;disposed=true;
      for(const inst of meshes){inst.count=0;inst.visible=false;inst.geometry.dispose();inst.material.dispose();group.remove(inst);}
      counts.arcs=0;counts.rings=0;counts.gels=0;counts.prisms=0;
      if(group.parent)group.parent.remove(group);
    },
  };
}
