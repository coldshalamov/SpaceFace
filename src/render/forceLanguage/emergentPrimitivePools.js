// Read-only emergent combat presentation. Four bounded draws, four physical verbs:
// connected current, rupturing pressure, deposited matter, and optical fracture.
import * as THREE from 'three';
import { EMERGENT_TUNING } from '../../data/emergentPrimitives.js';
import { sampleDischargeLifecycle, sampleFieldLifecycle } from './effectLifecycle.js';
import { ForceParticleFlow } from '../vfx/forceParticleFlow.js';

const TAU = Math.PI * 2;
const CAPS = [64, 24, 16, 16];
const KINDS = ['arc', 'ring', 'gel', 'prism'];
const DEPOSIT_CYCLE = Object.freeze({ attack: 0.24, release: 0.34, code: 0 });
const PRISM_CYCLE = Object.freeze({ attack: 0.18, release: 0.28, code: 0 });
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

// Both geometry and material use these fronts. Birth supplies local material; retirement is a
// different traversal, so an intact deposit/crystal never just reverses its spawn animation.
const MATTER_FRONTS = /* glsl */`
float matterArrival(vec3 surface,vec4 response) {
#if FAMILY == 2
  float path=surface.x*(0.62+0.12*sin(surface.y*3.0+response.x));
  path+=0.06*(1.0+sin(surface.y*5.0+response.x));
  return smoothstep(path,path+0.16,response.y);
#else
  float facet=0.045*sin(surface.x*6.283185+response.x+surface.z);
  float path=surface.z*0.17+surface.y*0.37+facet;
  return smoothstep(path,path+0.17,response.y);
#endif
}
float matterDrain(vec3 surface,vec4 response) {
#if FAMILY == 2
  float path=0.10+0.34*(0.5+0.5*cos(surface.y-response.x))+0.13*(1.0-surface.x);
  return smoothstep(path,path+0.34,response.w);
#else
  // Different tips delaminate first; the breaking front travels down each reflecting face.
  float path=surface.z*0.14+(1.0-surface.y)*0.39;
  path+=0.035*sin(surface.x*12.56637+response.x+surface.z*1.8);
  return smoothstep(path,path+0.26,response.w);
#endif
}
`;

// Two fed seams bend independently through the deposit. Their meeting regions compress into
// wet folds only after both flows arrive; neither a radial icon nor a scrolling noise texture.
const REACTIVE_FOLDS = /* glsl */`
vec3 reactiveFolds(vec2 q,float seed,float clock) {
  float feedA=q.y-0.22-0.24*sin(q.x*4.4-clock*1.27+seed);
  float feedB=q.y+0.24+0.29*sin(q.x*3.7+clock*0.93-seed*0.7);
  float foldA=exp(-feedA*feedA/(0.14*0.14));
  float foldB=exp(-feedB*feedB/(0.18*0.18));
  float encounter=foldA*foldB*smoothstep(0.35,1.15,clock);
  return vec3(foldA,foldB,encounter);
}
`;

// Parameters describe constructed surfaces, not noise final art. Variation changes articulated
// shape and transport timing, never the simulation's RNG or a moving-position texture hash.
const DEFORM = /* glsl */`
${MATTER_FRONTS}
${REACTIVE_FOLDS}
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
varying float vStrike;
vec2 currentKnot(float knot,float seed) {
  return vec2(sin(knot*2.17+seed)*0.24+sin(knot*4.31-seed)*0.09,
    sin(knot*2.61+seed)*0.62+sin(knot*4.79-seed)*0.18);
}
vec3 current(float u, float seed, float clock) {
  float runout = sin(u * 3.14159265);
  float at=u*12.0,knot=floor(at);
  vec2 bent=mix(currentKnot(knot,seed),currentKnot(knot+1.0,seed),fract(at));
  // The connected discharge skeleton holds while smaller charge packets travel through it.
  // Motion displaces the spine slightly, never teleports it into a new random curve.
  bent+=vec2(sin(u*31.0-clock*16.0),sin(u*43.0-clock*21.0))*0.045;
  return vec3(u-0.5,bent*runout);
}
vec3 articulate(vec3 p) {
  float seed=iResponse.x, clock=max(0.0,uTime-iBorn)*uMotion;
  float u=aSurface.x, v=aSurface.y, member=aSurface.z;
  vSurface=aSurface; vResponse=iResponse; vClock=clock; vStrike=1.0;
#if FAMILY == 0
  bool sheath=member>4.5;
  bool trunk=member<0.5||sheath;
  float phase=iResponse.w;
  float delay=0.035+member*0.045;
  // Overlapping live thermal receipts keep their contact phase young. Let the retained
  // connection finish branching, while its actual TTL still owns cooling and retraction.
  float branchPhase=max(phase,min(clock/0.22,0.42));
  float ignition=smoothstep(delay,delay+0.18,branchPhase);
  float retract=1.0-smoothstep(0.42+member*0.035,0.98,phase);
  float branchLife=mix(0.78,ignition*retract,uMotion);
  float junction=0.10+member*0.18+sin(seed+member)*0.025;
  float branchU=u*branchLife;
  float path=trunk?u:mix(junction,junction+0.14,branchU);
  vec3 center=current(path,seed,clock);
  if(!trunk) {
    vec3 root=current(junction,seed,clock);
    center=mix(root,center,branchU);
    float polarity=mod(member,2.0)<0.5?-1.0:1.0;
    center.z+=branchU*polarity*(0.52+0.18*sin(member*2.1+seed));
    center.z+=sin(branchU*13.0+member)*branchU*0.13;
    center.y+=sin(branchU*7.3+member)*branchU*0.16;
    vStrike=branchLife;
  }
  float taper=trunk?0.76+0.24*sin(u*3.14159):pow(1.0-u,0.72)*branchLife;
  float packet=0.5+0.5*sin(u*14.0-clock*23.0+seed);
  float radius=(sheath?0.46:trunk?0.25:0.16)*taper*(0.20+0.80*iResponse.y);
  radius*=0.78+0.22*packet;
  // The outer conductor is a folded three-lobed section. Its broad sides carry lower-radiance
  // charge while sharp folds and the separate inner channel carry the hot travelling knots.
  float fold=sheath?0.76+0.24*cos(v*3.0-u*8.0+clock*5.0):1.0;
  return center+vec3(0.0,cos(v)*radius*fold,sin(v)*radius*fold);
#elif FAMILY == 1
  // A travelling compression front, not a solid sheet. Most of this support is empty in
  // the fragment shader: only a disturbed leading edge and a few trailing wisps carry light.
  float along=aPressure.x;
  vSurface.x=along;
  float shoulder=pow(max(0.0,sin(along*3.14159265)),0.70);
  float phase=mix(0.48,iResponse.w,uMotion);
  float localPhase=clamp(phase*(0.95+0.16*sin(member*1.9+seed)),0.0,1.0);
  float progress=0.24+0.84*localPhase;
  float reach=aPressure.y*(0.90+0.12*sin(member*2.17+seed));
  float bow=0.14*shoulder+0.11*(along-0.5)*sin(member+seed);
  float front=(reach+bow)*progress;
  float creasePhase=along*(13.0+member*1.3)+seed;
  float folded=sin(creasePhase-v*3.2-clock*6.0);
  float tornTail=0.75+0.19*sin(creasePhase)+0.09*sin(along*31.0+member);
  float depth=aPressure.z*shoulder*tornTail*(1.0-localPhase*0.55);
  float r=front-depth*pow(1.0-v,0.78);
  float angle=u+sin(member*3.7+seed)*0.08+(1.0-v)*shoulder*0.08*folded;
  float foldHeight=shoulder*sin(v*3.14159265)*(0.034+0.078*folded);
  return vec3(cos(angle)*r,foldHeight,sin(angle)*r);
#elif FAMILY == 2
  // Local material arrives from unequal contact sectors, then ridge crests creep across the
  // deposited mass. During release one side drains first and the other folds into its furrow.
  // The radial footprint stays fixed; this is redistribution, not a growing/shrinking object.
  float arrival=matterArrival(aSurface,iResponse);
  float drain=matterDrain(aSurface,iResponse);
  float edge=pow(clamp(u,0.0,1.0),5.0);
  float creep=(sin(v*5.0-clock*1.8+seed)+0.4*sin(v*9.0+clock*1.1))*0.012;
  p.xz*=1.0-edge*(0.025+creep)*uMotion;
  vec2 q=vec2(cos(v),sin(v))*u;
  vec3 folds=reactiveFolds(q,seed,clock);
  float interior=1.0-smoothstep(0.70,0.98,u);
  float wetHeight=0.028+interior*(0.045+folds.x*0.085+folds.y*0.105+folds.z*0.07);
  if(member<0.5)p.y=wetHeight;
  p.y=max(0.0,p.y*(0.08+0.92*arrival)*(1.0-drain));
  p.xz*=1.0-edge*drain*0.035*uMotion;
  return p;
#else
  // Crystal facets nucleate independently from their bases. Once supplied, each splinter
  // flexes about its own root; the reflecting plane never spins. Retirement peels its tip
  // into smaller face-local remnants instead of scaling the whole crystal down.
  float arrival=matterArrival(aSurface,iResponse);
  float drain=matterDrain(aSurface,iResponse);
  float lever=max(0.0,p.y+0.18);
  float differential=sin(clock*(1.3+member*0.27)+seed+member*2.1);
  p.x+=(differential*0.025+(1.0-arrival)*(member-1.0)*0.045)*lever*uMotion;
  p.z+=(sin(clock*(1.1+member*0.18)-seed+member)*0.017+drain*(member-1.0)*0.022)*lever*uMotion;
  p.y-=drain*lever*0.12*uMotion;
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
varying float vStrike;
varying vec3 vViewPosition;
// Pixel-sized ramps integrate narrow optical details instead of letting subpixel ridges
// flicker. Unresolved repeated structure converges to coverage, not aliased bright dots.
float bandAA(float value,float center,float halfWidth) {
  float pixel=max(fwidth(value)*0.80,0.0015);
  return 1.0-smoothstep(halfWidth-pixel,halfWidth+pixel,abs(value-center));
}
float pulseAA(float phase,float width) {
  float wave=0.5+0.5*sin(phase),pixel=max(fwidth(wave)*0.80,0.002);
  float ridge=smoothstep(1.0-width-pixel,1.0+pixel,wave);
  return mix(ridge,width, smoothstep(1.3,3.14,fwidth(phase)));
}
void main() {
  vec3 n=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
  float grazing=pow(1.0-abs(dot(n,normalize(vViewPosition))),2.0);
  float time=vClock;
  float heat=vResponse.z;
#if FAMILY == 0
  float sheath=step(4.5,vSurface.z);
  float packets=pulseAA(vSurface.x*13.0-time*23.0+vResponse.x,0.32);
  float filaments=pulseAA(vSurface.x*71.0-time*47.0+vSurface.z*1.7,0.10);
  float fold=pulseAA(vSurface.y*3.0-vSurface.x*8.0+time*5.0,0.38);
  float core=mix(0.35+0.65*abs(cos(vSurface.y)),0.2+0.8*fold,sheath);
  float cooling=smoothstep(0.40,0.99,vResponse.w);
  vec3 color=mix(vec3(0.12,0.48,1.0),vec3(0.65,0.22,0.10),cooling);
  color=mix(color,vec3(0.73,0.95,1.0),packets*0.65*(1.0-cooling));
  color*=0.50+uFlash*heat*(0.95+packets*4.9+filaments*0.42)*core;
  // Reserve bloom headroom inside transported charge knots, not across the whole connection.
  color+=vec3(0.85,1.65,3.2)*packets*pow(core,4.0)*heat*uFlash*1.3;
  float density=mix(0.28+packets*0.50+filaments*0.10,
    (0.10+fold*0.25)*(0.50+packets*0.50),sheath)*sqrt(max(heat,0.0))*vStrike;
#else
  float wave=vSurface.x*(10.0+vSurface.z*1.1)+vResponse.x;
  float disturbed=0.85+0.045*sin(wave-time*8.0)+0.018*sin(wave*2.6-time*11.0);
  float crest=bandAA(vSurface.y,disturbed,0.045+0.016*(1.0-vResponse.w));
  float hotEdge=bandAA(vSurface.y,disturbed+0.016,0.016);
  float runoffPhase=wave-vSurface.y*6.1-time*5.2;
  float wisps=pulseAA(runoffPhase,0.075)*bandAA(vSurface.y,0.48+0.09*sin(wave-time*3.0),0.26);
  float skirt=sin(vSurface.y*3.14159265)*pulseAA(wave-vSurface.y*2.0-time*3.0,0.72)
    *smoothstep(0.02,0.23,vSurface.y)*(1.0-smoothstep(0.73,0.94,vSurface.y));
  float tip=smoothstep(0.0,0.11,vSurface.x)*(1.0-smoothstep(0.87,1.0,vSurface.x));
  float breaks=0.42+0.58*pulseAA(vSurface.x*17.0-time*5.0+vResponse.x,0.65);
  vec3 color=mix(vec3(0.58,0.15,0.035),vec3(1.0,0.75,0.37),crest);
  color*=0.48+heat*uFlash*(crest*5.9+hotEdge*3.9+wisps*1.9+grazing*0.22);
  color+=vec3(0.23,0.39,0.58)*skirt*heat*(0.45+uFlash*0.65);
  float density=tip*sqrt(max(heat,0.0))*(crest*breaks*0.78+wisps*0.15+skirt*0.16);
#endif
  float facing=abs(dot(n,normalize(vViewPosition)));
  density*=smoothstep(0.0,max(fwidth(facing)*0.8,0.025),facing);
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
  const sides=8;
  for (let branch = 0; branch < 6; branch++) {
    const segments = branch>0&&branch<5 ? 20 : 72, start = positions.length / 3;
    for (let i = 0; i <= segments; i++) for (let side = 0; side <= sides; side++) {
      positions.push(i / segments - 0.5, Math.cos(side / sides * TAU)*0.06, Math.sin(side / sides * TAU)*0.06);
      surfaces.push(i / segments, side / sides * TAU, branch);
    }
    for (let i = 0; i < segments; i++) for (let side = 0; side < sides; side++) {
      const a = start + i * (sides+1) + side, b = a + sides+1;
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
  const positions = [], surfaces = [], indices = [], sides = 96, rings = 32;
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
    for(let level=0;level<4;level++) for(let side=0;side<=8;side++) {
      const angle=side/8*TAU+0.18, height=[-0.22,-0.06,0.72,1.0][level];
      const width=[0.14,0.44,0.35,0.04][level]*(shard===1?1:0.68);
      positions.push(offset+Math.cos(angle)*width+height*(shard-1)*0.13,
        height*(shard===1?1.15:0.78),Math.sin(angle)*width*0.49+(shard%2)*0.07);
      surfaces.push(side/8,level/3,shard);
    }
    for(let level=0;level<3;level++) for(let side=0;side<8;side++) {
      const a=start+level*9+side,b=a+1;
      indices.push(a,a+9,b,b,a+9,b+9);
    }
    for(let side=1;side<7;side++) {
      indices.push(start,start+side+1,start+side,start+27,start+27+side,start+27+side+1);
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
    color:family===2?0x326f59:0x9bc9d0,roughness:family===2?0.24:0.12,
    metalness:family===2?0.18:0.24,clearcoat:0.8,clearcoatRoughness:0.15,
    transparent:false,depthWrite:true,toneMapped:false,
  });
  mat.defines={...mat.defines,FAMILY:family};
  mat.userData.uniforms=uniforms;
  mat.onBeforeCompile=(shader)=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=DEFORM+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=articulate(position);');
    shader.fragmentShader=MATTER_FRONTS+REACTIVE_FOLDS+`uniform float uTime; uniform float uMotion; uniform float uFlash;
      varying vec3 vSurface; varying vec4 vResponse; varying float vClock;
      float opticalPulseAA(float phase,float width) {
        float wave=0.5+0.5*sin(phase),pixel=max(fwidth(wave)*0.8,0.002);
        float ridge=smoothstep(1.0-width-pixel,1.0+pixel,wave);
        return mix(ridge,width,smoothstep(1.3,3.14,fwidth(phase)));
      }\n`+shader.fragmentShader;
    if(family===2)shader.fragmentShader=shader.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>',/* glsl */`
      #include <clearcoat_normal_fragment_maps>
      // Geometry carries the wet ridges; lighting must follow their changing slopes as well.
      normal=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
      #ifdef USE_CLEARCOAT
        clearcoatNormal=normal;
      #endif
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',/* glsl */`
      #include <emissivemap_fragment>
      float supplied=matterArrival(vSurface,vResponse);
      float drained=matterDrain(vSurface,vResponse);
      // Actual material front, not opacity over a complete primitive. Opaque local fragments
      // keep scene lighting/depth while fresh edges announce assembly or delamination.
      if(supplied<0.035||drained>0.97) discard;
      float formationEdge=4.0*supplied*(1.0-supplied);
      float breakingEdge=4.0*drained*(1.0-drained);
      float opticalEdge=pow(1.0-abs(dot(normal,normalize(vViewPosition))),3.0);
      float transport=vClock;
      ${family===2?`
      vec2 q=vec2(cos(vSurface.y),sin(vSurface.y))*vSurface.x;
      vec3 folds=reactiveFolds(q,vResponse.x,transport);
      float edgePixel=max(fwidth(vSurface.x)*0.8,0.0015);
      float boundary=smoothstep(0.65-edgePixel,0.92+edgePixel,vSurface.x)*(1.0-smoothstep(0.94-edgePixel,1.0+edgePixel,vSurface.x));
      float interior=1.0-smoothstep(0.75,0.97,vSurface.x);
      float chargeA=opticalPulseAA(q.x*7.2-transport*3.1+vResponse.x,0.46);
      float chargeB=opticalPulseAA(q.x*6.1+transport*2.0-vResponse.x,0.38);
      float creaseA=pow(folds.x,3.0)*chargeA,creaseB=pow(folds.y,3.0)*chargeB;
      float reaction=folds.z*(0.5+0.5*sin(transport*2.7+q.x*4.0));
      diffuseColor.rgb*=0.52+folds.x*0.26+folds.y*0.20;
      totalEmissiveRadiance+=vec3(0.025,0.12,0.065)*(folds.x+folds.y)*interior;
      totalEmissiveRadiance+=(vec3(0.20,2.9,1.35)*creaseA+vec3(0.12,1.35,2.1)*creaseB
        +vec3(2.4,2.8,0.62)*reaction)*interior*uFlash*vResponse.z;
      totalEmissiveRadiance+=vec3(0.06,0.58,0.29)*boundary*(0.16+folds.x*0.22+folds.y*0.2)*uFlash*vResponse.z;
      totalEmissiveRadiance+=vec3(0.04,0.42,0.21)*(formationEdge*0.8+breakingEdge*0.24)*uFlash;
      `:`
      vec3 spectral=0.5+0.5*cos(vec3(0.0,2.1,4.2)+opticalEdge*8.0+vSurface.z*1.7+vResponse.x);
      float face=floor(min(vSurface.x,0.999)*8.0);
      float travellingFace=opticalPulseAA(vSurface.y*6.4-transport*(1.7+vSurface.z*0.21)+vResponse.x+face*1.3,0.32);
      float lateral=fract(vSurface.x*8.0),pixel=max(fwidth(vSurface.x*8.0),0.015);
      float bevel=1.0-smoothstep(0.025-pixel,0.13+pixel,min(lateral,1.0-lateral));
      float facingLight=0.18+0.82*pow(max(0.0,dot(normal,normalize(vec3(0.3,0.8,0.5)))),2.0);
      totalEmissiveRadiance+=(vec3(0.06,0.12,0.17)+spectral*(travellingFace*facingLight*2.3
        +bevel*(0.55+travellingFace*1.6)+opticalEdge*0.35))*uFlash*vResponse.z;
      totalEmissiveRadiance+=spectral*(formationEdge*0.7+breakingEdge*0.38)*uFlash;
      diffuseColor.rgb*=0.70+spectral*opticalEdge*0.8;
      `}
    `);
  };
  mat.customProgramCacheKey=()=>`emergent-structure-${family}-reactive-folds-v4`;
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
  const particles=new ForceParticleFlow(group,{capacity:96});
  const particleFlags={reducedMotion:false,reducedFlash:false};
  const burst={kind:'current',x:0,z:0,y:0.5,dx:1,dz:0,radius:1,seed:0,count:6,life:0.22,strength:1};
  let originX=0,originZ=0,originSet=false;
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
    group,arcs,rings,gels,prisms,particles,
    update(state,toLocal) {
      if(disposed)return counts;
      const now=finite(state?.simTime,clock);
      const rewound=now<clock,dt=Math.max(0,now-clock);
      const hadCurrent=arcs.count>0&&!rewound,hadPressure=rings.count>0&&!rewound;
      if(rewound){for(const family of slots)for(const slot of family)slot.key=null;particles.clear();}
      clock=now;uniforms.uTime.value=clock;
      const video=state?.settings?.video,a11y=state?.settings?.accessibility;
      const reducedMotion=!!(video?.motionReduce||a11y?.motionReduce||a11y?.reducedMotion||a11y?.reduceMotion);
      uniforms.uMotion.value=reducedMotion?0:1;
      uniforms.uFlash.value=video?.flashReduce||a11y?.flashReduce||a11y?.reducedFlash?0.24:1;
      particleFlags.reducedMotion=reducedMotion;particleFlags.reducedFlash=uniforms.uFlash.value<1;
      map(0,0,toLocal);
      if(originSet&&(local.x!==originX||local.z!==originZ))particles.reproject(local.x-originX,local.z-originZ);
      originX=local.x;originZ=local.z;originSet=true;
      // Quarks disposes a system updated outside a Scene. Keep the public pool usable before
      // attachment (prewarm/tests) without destroying its future renderer on the first update.
      let renderRoot=group;while(renderRoot.parent)renderRoot=renderRoot.parent;
      particles.update(renderRoot.isScene?dt:0,particleFlags);
      let emitted=false;
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
        // Burst on admission of a new active packet. A thermal ray republishes overlapping
        // receipts every tick; while this family remains powered those are not new ignitions.
        // Saturation favors existing parcels and caps all current/pressure residue at 96.
        if(fresh&&((family===0&&!hadCurrent)||(family===1&&!hadPressure))) {
          burst.kind=family===0?'current':'repulsor';burst.x=ax;burst.z=az;burst.seed=slot.seed;
          burst.dx=family===0?local.x-ax:1;burst.dz=family===0?local.z-az:0;
          burst.radius=family===0?Math.hypot(local.x-ax,local.z-az):extent;
          burst.count=family===0?6:10;burst.life=family===0?0.22:0.32;burst.strength=family===0?1.1:0.8;
          if(particles.emit(burst)>0)emitted=true;
        }
        matrix.compose(position,quaternion,scaleVec);
        const target=inst.instanceMatrix.array,offset=index*16,values=matrix.elements;
        let dirty=false;for(let j=0;j<16;j++)if(target[offset+j]!==Math.fround(values[j])){target[offset+j]=values[j];dirty=true;}
        if(dirty)inst.instanceMatrix.needsUpdate=true;
        let age=Math.max(0,clock-slot.born);
        if(family<2) {
          if(Number.isFinite(source?.ttl))age=Math.max(0,0.22-source.ttl);
          const phase=source?Math.min(1,age/0.22):Math.min(0.45,age/0.22);
          sampleDischargeLifecycle(phase*0.22,0.22,reducedMotion,envelope);
          response(inst,index,slot.seed,family===0?envelope.width:envelope.length,envelope.opacity,phase);
        } else {
          const life=family===2?EMERGENT_TUNING.viscosityLife:EMERGENT_TUNING.prismLife;
          const cycle=family===2?DEPOSIT_CYCLE:PRISM_CYCLE;
          if(Number.isFinite(source?.life))age=Math.max(0,life-source.life);
          const releaseAt=Number.isFinite(source?.life)&&age>=life-cycle.release?life-cycle.release:-1;
          sampleFieldLifecycle(age,0,releaseAt,cycle,envelope);
          response(inst,index,slot.seed,reducedMotion?1:envelope.build,0.7+0.3*envelope.build,envelope.release);
        }
      }
      for(let family=0;family<4;family++) {
        meshes[family].count=admitted[family];meshes[family].visible=admitted[family]>0;
        for(const slot of slots[family])if(!slot.seen)slot.key=null;
      }
      counts.arcs=admitted[0];counts.rings=admitted[1];counts.gels=admitted[2];counts.prisms=admitted[3];
      if(emitted)particles.batch.update();
      return counts;
    },
    dispose() {
      if(disposed)return;disposed=true;
      particles.dispose();
      for(const inst of meshes){inst.count=0;inst.visible=false;inst.geometry.dispose();inst.material.dispose();group.remove(inst);}
      group.clear();
      counts.arcs=0;counts.rings=0;counts.gels=0;counts.prisms=0;
      if(group.parent)group.parent.remove(group);
    },
  };
}
