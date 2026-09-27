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
export const SURFACE_ACROSS = 8;
export const FIELD_SURFACE_ACROSS = 12;
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
attribute vec4 iBehavior; // family animation code, semantic role, local phase, structural flex
attribute vec4 iPivot; // local source XZ, integer rib count + environment slot/16, working heat
uniform float uTime;
uniform float uMotion;
uniform vec4 uBodies[30];
uniform vec2 uBodyVelocity[30];
varying vec2 vUv;
varying vec4 vTint;
varying vec4 vFlow;
varying float vFront;
varying vec4 vCycle; // kind, release, powered local time, role
varying vec4 vMaterial; // structural flex, machined rib count, working heat, reserved
varying vec3 vSurfaceWorld;
varying vec3 vSurfaceNormal;
varying float vFieldReach;
varying vec2 vResponse;
const float PI=3.14159265359;
void main(){
  float t=position.x;
  float across=position.y;
  bool cycle = iLife.y > 0.0;
  bool releasing = cycle && iLife.z >= 0.0;
  bool working=cycle && !(iBehavior.y>0.5 && iBehavior.y<1.5);
  float poweredAt = releasing ? min(uTime, iLife.z) : uTime;
  float age = max(0.0, poweredAt - iLife.x);
  // Age, not the session clock. A muzzle flash is a tenth of a second; tying its
  // travel to uTime made the band crawl at ignition and thrash after a long flight.
  // After power stops, charge still travels into a slowing residue. The force footprint dies
  // immediately, but the material does not freeze in mid-air and shrink like a paused clip.
  float residueAge = releasing ? max(0.0,uTime-iLife.z) : 0.0;
  float coast = (1.0-exp(-residueAge*3.0))/3.0;
  float independentRate=working?0.78+0.44*fract(iBehavior.z*3.731):1.0;
  float motionTime = (age+coast) * uMotion * independentRate;
  float mature=cycle?smoothstep(iLife.y*.90,iLife.y*1.85,age-iLife.y*.12*fract(iBehavior.z)):1.0;
  bool counterflow=working && iBehavior.w>1.3;
  float release = releasing ? smoothstep(0.0, iLife.w, max(0.0, uTime-iLife.z)) : 0.0;
  float poweredPhase=fract(age*uMotion*independentRate*.58*iMotion.x+iMotion.y);
  // Released fronts finish their current crossing and disappear at phase=1.
  // Do not wrap a dead emitter back to phase=0 and invent a new powered front.
  float phase=releasing?poweredPhase+coast*uMotion*independentRate*.58*iMotion.x:poweredPhase;
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
  // The legacy discharge strip keeps its exact cross-section. Deployed powers use a
  // separate rolled profile: a genuine luminous volume with sidewalls and parallax,
  // rather than a flat strip whose only visible feature is one narrow hot line.
  float height=iShape.z*sin(PI*t);
  vec3 sectionNormal=vec3(0.0,1.0,0.0);
  float sectionDx=1.0,sectionDy=0.0,sourceSpin=0.0;
  if(working){
    float family=iBehavior.x;
    float phaseOffset=iBehavior.z*6.2831853;
    float wave=t*8.0-motionTime*2.2+phaseOffset;
    float section=across*PI;
    float roll=0.36*sin(t*5.0-motionTime*1.1+phaseOffset);
    float span=iShape.y*taper;
    float lateral=0.0,vertical=0.0;
    if(family<1.5){
      // Seed: four closed, bevel-like clamp members. They stroke, never circulate.
      lateral=sign(cos(section))*pow(abs(cos(section)),0.55)*span;
      vertical=sign(sin(section))*pow(abs(sin(section)),0.55)*span*0.62;
      sectionDx=-sin(section);sectionDy=cos(section)*0.62;
    }else if(family<2.5){
      // Accretion: a rolling, hollow crescent channel. Its raised near/far shoulders
      // expose a dark interior instead of drawing five lines around an empty centre.
      float curl=across*2.45;
      lateral=sin(curl)*span;
      vertical=(0.68-cos(curl))*span*0.90;
      sectionDx=cos(curl)*2.45;sectionDy=sin(curl)*2.205;
      height+=span*0.26*sin(wave);
      roll+=0.28*sin(t*8.0-motionTime*1.6+phaseOffset);
    }else if(family<3.5){
      // Pressure: broad swept bowls have a vertical leading wall and a low skirt.
      lateral=across*span;
      vertical=(0.76*pow(0.5-0.5*across,2.0)+0.26*sin(section))*span;
      sectionDy=-0.76*(0.5-0.5*across)+0.26*PI*cos(section);
      roll=-0.34+0.12*sin(wave);
    }else if(family<4.5){
      // Directed power: closed lenticular channels with a thick central extrusion.
      lateral=cos(section)*span;
      vertical=sin(section)*span*0.72;
      sectionDx=-sin(section);sectionDy=cos(section)*0.72;
      roll=0.45*sin(t*8.0-motionTime*2.3+phaseOffset);
    }else{
      // Skim: standing S-folds lean into the intake; separated high and low banks
      // occupy the same real rectangular footprint without becoming a fan or tube.
      lateral=across*span;
      vertical=sin(across*2.5)*span*0.78;
      sectionDy=cos(across*2.5)*1.95;
      roll=0.18*sin(wave);
    }
    float flex=iBehavior.w*uMotion*(1.0-release*0.55);
    lateral*=1.0+flex*0.13*sin(wave+across*2.0)*sin(PI*t);
    float rolledLateral=lateral*cos(roll)-vertical*sin(roll);
    height+=lateral*sin(roll)+vertical*cos(roll);
    p+=normal*rolledLateral;
    float sectionTangent=sectionDx*cos(roll)-sectionDy*sin(roll);
    float sectionLift=sectionDx*sin(roll)+sectionDy*cos(roll);
    sectionNormal=normalize(vec3(-normal.x*sectionLift,sectionTangent,-normal.y*sectionLift));
  }else{
    p+=normal*across*iShape.y*taper;
    height+=(1.0-across*across)*iShape.y*0.23*taper;
    if(iMotion.w>0.5 && iMotion.w<1.5)height+=iShape.y*(1.0-across)*0.6*taper;
  }
  float ca=cos(iOrigin.w),sa=sin(iOrigin.w);
  if(!cycle){height+=p.x*sin(iFinish.w);p.x*=cos(iFinish.w);}
  p=mat2(ca,sa,-sa,ca)*p;
  vec2 relative = iOrigin.xz - iPivot.xy + p;
  float envelope = 1.0;
  if(cycle){
    float kind=iBehavior.x, role=iBehavior.y;
    float localPhase=iBehavior.z*6.2831853;
    bool boundary=role>0.5 && role<1.5;
    envelope=smoothstep(0.0,0.10,age);
    if(boundary){
      if(releasing)envelope=0.0;
    }else{
      // The path exists at its real reach throughout. Ignition propagates through
      // its material; there is no whole-object miniature growing to full size.
      float partDelay=fract(iBehavior.z)*iLife.y*.20;
      float activation=smoothstep(partDelay,iLife.y+partDelay,age);
      float arrival=t; // Well paths start at the outer intake and end at the throat.
      float bornFront=smoothstep(arrival-.065,arrival+.065,activation);
      if(kind<1.5)bornFront=smoothstep(partDelay,partDelay+.13,age);
      if(radial)bornFront*=smoothstep(poweredPhase-.08,poweredPhase+.06,activation);
      envelope*=mix(1.0,bornFront,uMotion);
      if(counterflow)envelope*=mature;
      float flex=iBehavior.w;
      vec2 outward=relative/max(length(relative),.001);
      vec2 tangent=vec2(-outward.y,outward.x);
      float detach=smoothstep(fract(iBehavior.z+t*.47)*.24,1.0,release);
      float wave=sin(t*7.0-motionTime*2.4+localPhase);
      if(kind<1.5){
        // Opposed parts engage in sequence. The mature lock alternates ratchet
        // strokes; on release each jaw shears sideways and lifts, never recedes
        // by replaying its initial slide in reverse.
        float stroke=max(0.0,sin(motionTime*3.7+localPhase));
        // Only an already seated pair can carry a bridge. Its opposing travelling
        // deflection is independent of the forks' take-up; no CPU buffer animation.
        if(role>1.5&&role<2.5){
          envelope*=mature;
          relative+=tangent*uMotion*iShape.y*mature*sin(t*PI)*sin(motionTime*2.3+t*7.0+localPhase)*.74;
          height+=uMotion*iShape.y*mature*sin(t*PI)*cos(motionTime*1.7+t*5.0+localPhase);
        }
        relative+=outward*uMotion*iShape.y*((1.0-activation)*2.6+stroke*flex*1.8);
        relative+=tangent*uMotion*iShape.y*mature*sin(t*PI)*sin(motionTime*1.3+localPhase)*.65;
        relative+=tangent*uMotion*iShape.y*detach*(1.8+fract(iBehavior.z)*2.2);
        height+=uMotion*iShape.y*(mature*.38*sin(motionTime*2.2+localPhase)+detach*(.8+t));
      }else if(kind<2.5){
        // Inflow channels flex independently around anchored paths. Lower mature
        // currents counter-advect through their interiors; no rigid vortex spin.
        float curl=wave*.07*flex+sin(motionTime*.71+localPhase)*.035;
        sourceSpin=uMotion*curl*sin(PI*t);
        relative=mat2(cos(sourceSpin),sin(sourceSpin),-sin(sourceSpin),cos(sourceSpin))*relative;
        relative+=tangent*uMotion*iShape.y*(wave*.28+detach*(1.0+2.1*t));
        relative-=outward*uMotion*iShape.y*detach*(.5+fract(iBehavior.z)*1.3);
        height+=uMotion*iShape.y*(mature*.28*sin(t*10.0-motionTime*3.2+localPhase)+detach*(.4+1.2*t));
      }else if(kind<3.5){
        // Discrete fronts propagate radially in the path stage. At full stride
        // crests buckle independently; off-switch detaches curling shell pieces.
        relative+=tangent*uMotion*iShape.y*wave*.16*mature;
        relative+=outward*uMotion*iShape.y*detach*(1.1+fract(iBehavior.z)*1.7);
        height+=uMotion*iShape.y*(mature*.23*sin(t*11.0-motionTime*2.6+localPhase)+detach*(.5+1.2*sin(t*PI)));
      }else if(kind<4.5){
        // Axial banks flutter and shed sideways as mature countercurrents arrive.
        // Release peels individual pieces forward at their current position.
        relative+=vec2(-sa,ca)*uMotion*iShape.y*(.44*flex*wave*sin(PI*t)+detach*sin(localPhase+t*4.0));
        relative+=vec2(ca,sa)*uMotion*iShape.y*detach*(1.4+1.1*t);
        height+=uMotion*iShape.y*(mature*.20*sin(t*9.0+motionTime*2.7)+detach*(.8+fract(iBehavior.z)));
      }else{
        // Intake scoops continue travelling while mature return eddies lift from
        // alternating banks. Released pieces separate upward and downstream,
        // never collapse every bank onto the same centreline.
        relative+=vec2(-sa,ca)*uMotion*iShape.y*wave*.24*mature;
        relative+=vec2(ca,sa)*uMotion*iShape.y*detach*(.8+1.7*t);
        height+=uMotion*iShape.y*(mature*.34*sin(motionTime*2.4+t*7.0+localPhase)+detach*(.7+1.4*fract(iBehavior.z)));
      }
      // Incomplete channels release only material that ignition reached.
      envelope*=1.0-smoothstep(.55+fract(iBehavior.z)*.20,1.0,release);
    }
  }
  float contactResponse=0.0;
  if(working){
    int contactBase=int(floor(fract(iPivot.z)*16.0+.5))*3;
    vec2 worldXZ=iPivot.xy+relative;
    for(int contact=0;contact<3;contact++){
      vec4 body=uBodies[contactBase+contact];
      vec2 delta=worldXZ-body.xy;
      float distanceToBody=length(delta);
      float range=max(1.0,iShape.y*2.2);
      float influence=(1.0-smoothstep(body.z,body.z+range,distanceToBody))*body.w*mature;
      vec2 away=distanceToBody>.001?delta/distanceToBody:vec2(cos(iBehavior.z*6.2831853),sin(iBehavior.z*6.2831853));
      float shear=clamp(dot(uBodyVelocity[contactBase+contact],vec2(-away.y,away.x))*.015,-1.0,1.0);
      // Split the decorative current around solid material; never deform its
      // truthful perimeter or modify any force/collision state.
      worldXZ+=away*influence*min(iShape.y*1.4,body.z*.35);
      worldXZ+=vec2(-away.y,away.x)*influence*iShape.y*.35*shear;
      height+=influence*min(3.5,iShape.y*.65)*(1.0+.25*sin(t*7.0-motionTime*2.4+iBehavior.z*6.2831853));
      contactResponse=max(contactResponse,influence);
    }
    relative=worldXZ-iPivot.xy;
  }

  if(working && iBehavior.x>1.5){
    // Deformation cannot invent force outside the authoritative influence area.
    float reach=max(iFinish.w,0.001);
    if(iBehavior.x<4.5){
      if(iBehavior.x>3.5){
        vec2 q=mat2(ca,-sa,sa,ca)*relative;
        float heading=clamp(atan(q.y,q.x),-iFinish.z,iFinish.z);
        q=vec2(cos(heading),sin(heading))*length(q);
        relative=mat2(ca,sa,-sa,ca)*q;
      }
      relative*=min(1.0,reach/max(length(relative),0.001));
    }else{
      vec2 q=mat2(ca,-sa,sa,ca)*relative;
      q=clamp(q,vec2(0.0,-iFinish.z),vec2(reach,iFinish.z));
      relative=mat2(ca,sa,-sa,ca)*q;
    }
  }
  vec3 world=cycle ? vec3(iPivot.x+relative.x,iOrigin.y+height,iPivot.y+relative.y)
    : iOrigin.xyz+vec3(p.x,height,p.y);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.0);
  vSurfaceWorld=(modelMatrix*vec4(world,1.0)).xyz;
  float normalAngle=iOrigin.w+sourceSpin;
  vec2 normalXZ=mat2(cos(normalAngle),sin(normalAngle),-sin(normalAngle),cos(normalAngle))*sectionNormal.xz;
  vSurfaceNormal=mat3(modelMatrix)*vec3(normalXZ.x,sectionNormal.y,normalXZ.y);
  vFieldReach=cycle?length(relative)/max(iFinish.w,0.001):0.0;
  vCycle=vec4(cycle ? iBehavior.x : 0.0,release,counterflow?-motionTime*.73:motionTime,iBehavior.y);
  vResponse=vec2(mature,contactResponse);
  // Weapon sources keep the smooth, fully hot surface they already ship: the machined channel and
  // the cool-structure channel are lifecycle-only, so a 24-float legacy descriptor is unchanged.
  vMaterial=vec4(cycle ? iBehavior.w : 1.0, cycle ? floor(iPivot.z) : 0.0, cycle ? iPivot.w : 1.0, 0.0);
  vUv=vec2(t,across); vTint=iTint;
  vFlow=vec4(iMotion.x,iMotion.y,iMotion.w,iFinish.x);
  vFront=(radial||conveyor ? smoothstep(0.0,0.13,phase)*(1.0-smoothstep(0.76,1.0,phase)) : 1.0)*(cycle?1.0:iFinish.z)*envelope;
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
varying vec4 vMaterial;
varying vec3 vSurfaceWorld;
varying vec3 vSurfaceNormal;
varying float vFieldReach;
varying vec2 vResponse;
// Integrate unresolved detail toward its mean instead of letting a bright comb become pixels.
float filteredWave(float phase){
  return 0.5+0.5*sin(phase)*(1.0-smoothstep(0.7,3.14159,fwidth(phase)));
}
float strand(float distance,float width){
  float footprint=max(fwidth(distance),0.001);
  float resolved=max(width,footprint);
  return exp(-pow(distance/resolved,2.0))*min(1.0,width/footprint);
}
// The energy body is emission plus absorption through a rolled section. Transport is
// layered in body-sized folds; fine ridges decorate it instead of being the whole object.
vec4 fieldVolume(){
  float t=vUv.x,v=vUv.y,kind=vCycle.x,flow=vCycle.z;
  float heat=clamp(vMaterial.z,0.0,1.0),phase=vFlow.y*6.2831853;
  float tipAA=max(fwidth(t)*1.25,0.014);
  float tips=smoothstep(0.0,tipAA,t)*(1.0-smoothstep(1.0-tipAA,1.0,t));
  float reveal=1.0-smoothstep(vFlow.w-0.07,vFlow.w+0.01,t);
  float direction=kind<2.5?-1.0:1.0;
  float transport=t*11.0-flow*direction*3.2+phase;
  if(kind>4.5)transport=v*4.8-flow*3.0+phase;
  if(kind<1.5)transport=t*10.0-flow*3.7+phase;
  float warped=v+0.20*sin(t*7.0-flow*1.4+phase);
  float bulk=filteredWave(transport+1.6*sin(warped*3.0+t*2.0));
  float secondary=filteredWave(t*19.0-flow*direction*4.7+warped*5.5+phase*1.3);
  float channel=strand(warped-0.16*sin(t*13.0-flow*2.1+phase),0.24);
  float shoulder=strand(warped+0.50,0.22)+0.72*strand(warped-0.57,0.17);
  float ignition=pow(bulk,3.0)*(0.36+0.64*secondary);
  float sectionMass=0.48+0.52*(1.0-abs(v)*0.42);
  // Material separates into broad advecting charge patches and transparent wakes.
  // A constant density made a 190-WU field a full-screen plastic object. This is
  // continuous tearing through the body, not a global fade or tiny noisy cells.
  float tearing=0.56*filteredWave(t*21.0-flow*direction*2.4+sin(v*6.0+phase)*1.8)
    +0.44*filteredWave(v*9.0+t*9.0-flow*direction*1.5+phase);
  float chargePatch=smoothstep(0.34,0.78,tearing);
  bool accretion=kind>1.5&&kind<2.5;
  if(accretion){
    // Accretion has dense travelling parcels with real openings between them.
    // Cross-flow curls shear each parcel differently; a constant luminous shoulder
    // would otherwise turn the large footprint into three uninterrupted cloth sails.
    float stream=t*38.0+flow*4.1+phase;
    float curl=sin(warped*8.0+stream*.43+sin(t*17.0-flow*1.7+phase)*1.8);
    float parcel=.48*filteredWave(stream*.53+curl*1.9)
      +.34*filteredWave(stream*1.17+warped*9.0-curl)
      +.18*filteredWave(stream*2.63-warped*17.0+phase);
    float parcelAA=max(fwidth(parcel),.025);
    chargePatch=smoothstep(.49-.105-parcelAA,.49+.105+parcelAA,parcel);
    ignition*=.38+.62*filteredWave(stream+curl*2.0);
  }
  float innerPresence=1.0-smoothstep(0.16,0.72,vFieldReach);
  float opticalDepth=sectionMass*(0.07+chargePatch*(0.22+0.25*bulk))*(0.46+0.54*innerPresence);
  float edge=1.0-smoothstep(0.89,1.0,abs(v));
  // Closed clamp/extrusion sections have no artificial slit at their shared back seam.
  if(kind<1.5||(kind>3.5&&kind<4.5))edge=1.0;
  vec3 normal=normalize(vSurfaceNormal);
  float facing=abs(dot(normal,normalize(cameraPosition-vSurfaceWorld)));
  float sideLight=0.34+0.66*abs(dot(normal,normalize(vec3(-0.45,0.8,0.35))));
  float absorbed=1.0-exp(-opticalDepth*(0.72+0.28*(1.0-facing)));
  float coolChannel=channel*(0.40+0.60*bulk);
  vec3 dark=vTint.rgb*vec3(0.15,0.21,0.38);
  vec3 body=mix(dark,vTint.rgb,0.32+0.68*bulk)*sideLight;
  body*=1.0-0.68*coolChannel;
  float hot=(shoulder*(0.36+1.45*ignition)+0.36*ignition)*(0.24+0.76*chargePatch);
  if(kind>2.5&&kind<3.5){
    // Pressure light lives on the outward lip; the skirt carries compressed amber body.
    hot=((0.35+1.85*bulk)*strand(v+0.64,0.24)+0.25*secondary)*(0.24+0.76*chargePatch);
    body*=0.78+0.22*(1.0-v)*0.5;
  }else if(kind>4.5){
    // Intake banks light across their fold, exposing alternating heavy and open folds.
    hot=(shoulder*(0.45+1.35*bulk)+0.24*secondary)*(0.24+0.76*chargePatch);
  }else if(kind<1.5){
    // Mechanical mass keeps a restrained body and charge that traverses its raised edges.
    // A dark load-bearing frame with moving charged sections, not a luminous
    // reticle whose whole loop stays equally bright. Independent packets reveal
    // its changing strain; late bridges retain their separate material arrival.
    float load=pow(bulk,3.0)*(0.35+0.65*secondary);
    body*=0.27;hot=shoulder*(0.05+2.4*load)+ignition*.38;
    absorbed=max(absorbed*.66,0.11+load*.30);
  }
  if(accretion){
    hot=(shoulder*(.16+2.25*ignition)+.26*ignition)*(.06+.94*chargePatch);
    body*=.32+.68*chargePatch;
    absorbed*=.07+.93*chargePatch;
  }
  // Mature colliding streams develop secondary knots; their cadence is slower
  // than ignition and cannot appear in the build stage.
  hot+=vResponse.x*(.16*ignition*secondary)+vResponse.y*(.35+.40*ignition)*shoulder;
  float fracture=1.0;
  if(vCycle.y>0.0){
    float tear=0.55*filteredWave(t*17.0+v*3.0+phase)+0.45*filteredWave(t*9.0-v*5.0+phase*1.7);
    fracture=smoothstep(vCycle.y-0.20,vCycle.y+0.10,tear);
    if((kind>1.5&&kind<2.5)||(kind>3.5&&kind<4.5)){
      // Source cutoff progresses through the path while existing charge coasts.
      float cutoff=vCycle.y*(1.12+.10*sin(phase))-0.08;
      fracture*=smoothstep(cutoff-.08,cutoff+.08,t);
    }
    hot*=1.0-0.90*vCycle.y;body*=1.0-0.45*vCycle.y;
  }
  // A substantial coloured body remains below the brightest folds; this is not a
  // white wire with a bloom halo. The open channels and varied section normals give depth.
  vec3 emission=vTint.rgb*(body*(0.12+0.18*heat)+hot*heat*uFlash*3.0)
    +vec3(0.78,0.88,1.0)*pow(shoulder*0.58,3.0)*ignition*heat*uFlash*0.70;
  // Hot folds carry light through thin material once, rather than disappearing
  // under a second alpha multiply. Coverage stays substantial only inside the
  // broad transported crest; background ships remain visible through the wakes.
  float crestCoverage=clamp(hot*0.14,0.0,0.30)*(0.52+0.48*innerPresence);
  absorbed=min(0.64,absorbed+crestCoverage);
  vec3 color=body*0.22+emission/max(0.50,absorbed*2.4);
  float alpha=edge*tips*reveal*vTint.a*vFront*fracture*absorbed;
  return vec4(color,alpha);
}
void main(){
  if(vCycle.x>0.5 && !(vCycle.w>0.5&&vCycle.w<1.5)){
    vec4 fieldColor=fieldVolume();
    if(fieldColor.a<0.003)discard;
    gl_FragColor=fieldColor;
    #include <colorspace_fragment>
    return;
  }
  float t=vUv.x; float v=vUv.y;
  float edge=1.0-smoothstep(0.90-max(fwidth(v),0.015),1.0,abs(v));
  float tipAA=max(fwidth(t)*1.3,0.018);
  float tips=smoothstep(0.0,tipAA,t)*(1.0-smoothstep(1.0-tipAA,1.0,t));
  float reveal=1.0-smoothstep(vFlow.w-0.07,vFlow.w+0.01,t);
  float wandering=0.17*sin(t*8.0-vCycle.z*1.7+vFlow.y*8.0)*sin(t*3.14159);
  float fold=strand(v+0.40+wandering,0.105);
  float rim=strand(v-0.68+wandering*.4,0.065);
  // Broad pigment folds survive play scale. A high-frequency sine comb used to make
  // every force resemble corrugated ribbon irrespective of its physical construction.
  float warp=0.32*sin(t*9.0-vCycle.z*2.1+vFlow.y*8.0);
  float groove=filteredWave(t*18.0+v*4.0+vFlow.y*9.0+warp);
  float packet=pow(filteredWave(t*16.0-vCycle.z*vFlow.x*5.0+vFlow.y*6.283+1.5708),3.0);
  // Legacy weapon discharges and the quiet truthful footprint keep their original
  // surface response. Deployed energy volumes have already returned above.
  bool boundary=vCycle.x>0.5;
  float body=0.12+0.38*smoothstep(0.28,0.64,groove);
  float hot=(fold*(0.75+0.48*packet)+rim*0.58)*uFlash;
  if(vFlow.z>0.5 && vFlow.z<1.5){
    hot=(fold*0.25+rim*(1.25+0.12*packet))*uFlash;
    body=0.34+0.27*(1.0-smoothstep(-0.6,0.9,v));
  }
  if(vFlow.z>1.5 && vFlow.z<2.5){
    float ratchet=pow(filteredWave(t*11.0-vCycle.z*4.4+vFlow.y*6.283+1.5708),4.0);
    body=0.48+0.20*groove;hot=(fold*(0.22+ratchet*0.70)+rim*0.68)*uFlash;
  }
  if(vFlow.z>2.5 && vFlow.z<3.5){
    body=0.12+0.18*smoothstep(0.4,0.5,groove);hot*=0.82+0.18*filteredWave(t*87.0+v*13.0);
  }
  float heat=vMaterial.z;
  hot*=heat;
  float shadowPool=1.0-smoothstep(0.20,0.55,groove);
  vec3 pigment=mix(vTint.rgb,vTint.rgb*vec3(0.30,0.24,0.68),shadowPool*0.78);
  pigment=mix(pigment*vec3(0.46,0.50,0.60)+vec3(0.030,0.034,0.042),pigment,clamp(heat,0.0,1.0));
  vec3 emission=vTint.rgb*hot*1.5+vec3(0.55,0.68,0.78)*pow(fold,3.0)*hot*0.40;
  float coverage=boundary?0.36+0.5*max(fold,rim):0.57+0.43*max(fold,rim);
  vec3 color=pigment*body+emission;
  float alpha=edge*tips*reveal*vTint.a*vFront*coverage;
  if(alpha<0.003)discard;
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

function stripGeometry(across= SURFACE_ACROSS){
  const g=new THREE.BufferGeometry();
  const p=new Float32Array((SURFACE_STATIONS+1)*(across+1)*3);
  const ix=new Uint16Array(SURFACE_STATIONS*across*6);
  let n=0,k=0;
  for(let s=0;s<=SURFACE_STATIONS;s++)for(let a=0;a<=across;a++){
    p[n++]=s/SURFACE_STATIONS; p[n++]=a/across*2-1; p[n++]=0;
  }
  for(let s=0;s<SURFACE_STATIONS;s++)for(let a=0;a<across;a++){
    const j=s*(across+1)+a,b=j+across+1;
    ix[k++]=j;ix[k++]=b;ix[k++]=j+1;ix[k++]=b;ix[k++]=b+1;ix[k++]=j+1;
  }
  g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setIndex(new THREE.BufferAttribute(ix,1));
  return g;
}

export class SweptSurfaceBatch {
  constructor(scene,{capacity=224,name='SF_ForceSurfaces',fieldVolume=false}={}){
    this.capacity=capacity;this.count=0;this.disposed=false;this.dropped=0;
    this.geometry=stripGeometry(fieldVolume?FIELD_SURFACE_ACROSS:SURFACE_ACROSS);this.attributes=[];this.dirty=new Uint8Array(NAMES.length);
    for(const name of NAMES){
      const attr=new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name,attr);this.attributes.push(attr);
    }
    this.material=new THREE.ShaderMaterial({
      name:'SF_FoldedForceSurface',vertexShader:SURFACE_VERTEX,fragmentShader:SURFACE_FRAGMENT,
      uniforms:{uTime:{value:0},uMotion:{value:1},uFlash:{value:1},
        uBodies:{value:Array.from({length:30},()=>new THREE.Vector4())},
        uBodyVelocity:{value:Array.from({length:30},()=>new THREE.Vector2())}},
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
