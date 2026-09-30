import * as THREE from 'three';
import {
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';
import { BOLT_VARIANT } from './recipes.js';
import { DEFAULT_BOLT_MIN_LENGTH_PIXELS, DEFAULT_BOLT_MIN_PIXELS, tanHalfFov } from './pixelFloor.js';
import { createSpindleGeometry } from './projectileGeometries.js';

export const ENERGY_BOLT_CAPACITY = 256;

const BOLT_POS = 0;
const BOLT_PREV = 1;
const BOLT_AXIS = 2;
const BOLT_SIZE = 3;
const BOLT_COLOR = 4;
const BOLT_SHEATH = 5;
const BOLT_MIN_PIXELS = 6;
const BOLT_VARIATION = 7;

// Cosmetic identity survives draw sorting, origin shifts and re-admission. Never consume the
// simulation RNG to make two rounds of the same weapon breathe differently.
export function weaponEffectSeed(entityId) {
  let h = typeof entityId === 'number' ? entityId | 0 : 2166136261;
  if (typeof entityId === 'string') {
    for (let i = 0; i < entityId.length; i++) h = Math.imul(h ^ entityId.charCodeAt(i), 16777619);
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const VERTEX_SHADER = /* glsl */`
  attribute vec2 aBoltTopology;
  attribute vec3 aBoltPos;
  attribute vec3 aBoltPrev;
  attribute vec3 aBoltAxis;
  attribute vec4 aBoltSize;
  attribute vec3 aBoltColor;
  attribute vec3 aBoltSheath;
  attribute float aBoltMinPixels;
  attribute vec2 aBoltVariation;

  uniform float uTanHalfFov;
  uniform float uViewportHeight;
  uniform float uMinPixels;
  uniform float uMinLengthPixels;
  uniform float uBoltTime;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vSheath;
  varying float vIntensity;
  varying float vVariant;
  varying float vAlong;
  varying vec2 vVariation;
  varying vec3 vBoltWorld;
  varying float vPatch;

  void main() {
    vUv = uv;
    vColor = aBoltColor;
    vSheath = aBoltSheath;
    vIntensity = aBoltSize.z;
    vVariant = aBoltSize.w;
    vAlong = uv.x;
    vVariation = aBoltVariation;
    vPatch=aBoltTopology.y;
    bool special=(aBoltSize.w>0.5&&aBoltSize.w<1.5)||(aBoltSize.w>3.5&&aBoltSize.w<5.5)||aBoltSize.w>6.5;
    if(special!=(aBoltTopology.x>0.5)){
      vBoltWorld=vec3(0.0);gl_Position=vec4(2.0,2.0,2.0,1.0);return;
    }

    vec3 curr = aBoltPos;
    vec3 prev = aBoltPrev;
    vec3 axis = curr - prev;
    float smear = length(axis);
    if (smear < 0.08) {
      axis = aBoltAxis;
      smear = 0.0;
    }
    float axisLen = length(axis);
    axis = axisLen > 1e-5 ? axis / axisLen : vec3(1.0, 0.0, 0.0);

    vec3 mid = mix(prev, curr, 0.5);
    float dist = length(cameraPosition - mid);
    float worldPerPx = dist * uTanHalfFov * 2.0 / max(uViewportHeight, 1.0);
    // Default contract remains worldPerPx * uMinPixels; authored recipes may
    // override it per instance through aBoltMinPixels.
    float minPixels = aBoltMinPixels > 0.0 ? aBoltMinPixels : uMinPixels;
    // Narrow ballistic bodies in world space, before enforcing their readability
    // floor. Scaling geometry after max() made distant rail shots subpixel.
    float ballisticWidth = aBoltSize.w >= 1.5 && aBoltSize.w < 3.5
      ? (aBoltSize.w < 2.5 ? 0.32 : 0.22) : 1.0;
    float width = max(aBoltSize.y * ballisticWidth, worldPerPx * minPixels);
    // Drawn extent is a readability envelope around a moving object, never a hazard boundary:
    // the dash is a one-sided smear along the velocity axis whose length is dominated by the
    // distance travelled this frame, and the authoritative collision radius stays with the
    // simulation. Nothing here is a ring, a shell or a symmetric footprint at a damage radius.
    float dash = max(aBoltSize.x + smear, worldPerPx * uMinLengthPixels);

    // Stable 3D orthonormal frame around velocity axis (no camera-facing billboarding)
    vec3 up = abs(axis.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 r1 = normalize(cross(axis, up));
    vec3 r2 = cross(axis, r1);

    // Each family has an actual cross-section, not just a different tint on the same dart.
    // The hollow pulse lip cups forward; plasma has rolling lobes; induction tears into
    // opposed forks. All deformation lives in the velocity frame, never the camera frame.
    float t = uv.x;
    float side = uv.y * 2.0 - 1.0;
    float bow = sin(t * 3.14159265);
    float evolution = uBoltTime * (0.88 + aBoltVariation.y * 0.24) + aBoltVariation.x;
    vec3 shaped = position;
    if (aBoltSize.w < 0.5) {
      shaped.x += (1.0 - side * side) * bow * 0.19;
      shaped.yz *= 0.70 + smoothstep(0.35, 0.80, t) * 0.62;
    } else if (aBoltSize.w < 1.5) {
      // Three unequal hollow convection channels orbit a hot open interior. The
      // rolled cross-section exposes sidewalls and a dark cavity at every view.
      float chargeRegion=aBoltTopology.y;
      float helix=chargeRegion*2.0943951+t*(1.8+chargeRegion*.24)-evolution*2.3;
      float envelope=pow(max(bow,0.0),.58);
      float roll=side*2.35;
      float channel=(.13+.025*sin(t*8.0-evolution*3.2+chargeRegion))*envelope;
      float radius=(.32+.055*sin(t*9.0-evolution*4.1+chargeRegion*2.1))*envelope;
      float radial=radius+sin(roll)*channel;
      float tangential=(.65-cos(roll))*channel;
      shaped.x=(t-.5)+envelope*side*.055;
      shaped.y=cos(helix)*radial-sin(helix)*tangential;
      shaped.z=sin(helix)*radial+cos(helix)*tangential;
    } else if (aBoltSize.w >= 1.5 && aBoltSize.w < 2.5) {
      // Kinetic sabot: a machined dart, not a recoloured pulse. Needle nose, a hard flared
      // base where the driving band bit, and a rifling twist carried in the velocity frame.
      shaped.yz *= 0.45 + 0.70 * pow(1.0 - t, 1.9);
      float spin = (t - 0.5) * 0.62;
      float cs = cos(spin);
      float sn = sin(spin);
      shaped.yz = vec2(shaped.y * cs - shaped.z * sn, shaped.y * sn + shaped.z * cs);
      shaped.x += (1.0 - side * side) * (1.0 - t) * 0.09;
    } else if (aBoltSize.w >= 2.5 && aBoltSize.w < 3.5) {
      // Rail carries a continuous penetrator with a broad driving heel. No detached
      // white collar or periodic bands: a hot leading edge leaves a cold solid shaft.
      shaped.yz *= 0.44 + 0.82 * pow(1.0 - t, 2.4);
      shaped.x += side * side * (1.0-t) * .04;
    } else if (aBoltSize.w >= 3.5 && aBoltSize.w < 4.5) {
      // Induction is an opposed fork, not a thermal helix. Two thick channels
      // bridge at the heel, split, and reconnect at the charged leading junction.
      if(aBoltTopology.y>1.5){vBoltWorld=vec3(0.0);gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
      float branch=aBoltTopology.y<.5?-1.0:1.0;
      float envelope=pow(max(bow,0.0),.62),crossAngle=side*3.14159265;
      shaped.x=t-.5;
      shaped.y=branch*.38*envelope+sin(crossAngle)*.15*envelope;
      shaped.z=cos(crossAngle)*.15*envelope+branch*.07*envelope*sin(t*9.0-evolution*3.4);
    } else if (aBoltSize.w >= 4.5 && aBoltSize.w < 5.5) {
      // Three offset bow shells compress forward and peel at their open shoulders.
      // Their short axial bowls carry a pressure wall rather than a pointed dart.
      float shell=aBoltTopology.y;
      float theta=side*2.2+shell*2.0943951;
      float span=.18+.42*sin(t*3.14159265)*(.86+.10*sin(evolution*3.0-shell));
      shaped.x=(t-.5)*.48+.16*cos(side*1.8)-shell*.075;
      shaped.y=cos(theta)*span;
      shaped.z=sin(theta)*span;
    } else if (aBoltSize.w > 7.5) {
      // A motor is fed at t=1 (the real rear nozzle). Two open, rolled exhaust banks
      // spread into unequal afterburn reaches; torpedo carries a third loaded bank.
      float bankId=aBoltTopology.y,heavy=step(8.5,aBoltSize.w);
      if(bankId>1.5&&heavy<.5){vBoltWorld=vec3(0.0);gl_Position=vec4(2.0,2.0,2.0,1.0);return;}
      float aft=1.0-t,turn=bankId*(heavy>.5?2.0943951:3.14159265);
      float section=side*2.3+.25*sin(aft*9.0-evolution*3.8+bankId);
      float spread=(.09+.36*pow(aft,.7))*(.8+.2*sin(t*3.14159265));
      float radial=sin(section)*spread,deep=(.52-cos(section))*spread;
      shaped.x=t-.5;
      shaped.y=cos(turn)*radial-sin(turn)*deep;
      shaped.z=sin(turn)*radial+cos(turn)*deep;
      shaped.yz+=vec2(sin(aft*8.0-evolution*4.2+bankId),cos(aft*7.0-evolution*3.0+bankId))*.06*aft;
    } else if (aBoltSize.w > 6.5) {
      // Siege carries a loaded three-lobed bore chamber, with a dark axial lumen and
      // a blunt compressed leading shoulder. This is separate volume topology, not a rail tint.
      float bankId=aBoltTopology.y,turn=bankId*2.0943951;
      float envelope=pow(max(bow,0.0),.42);
      float roll=side*2.35+.12*sin(t*7.0-evolution*2.4+bankId);
      float radius=(.28+.11*smoothstep(.38,.76,t))*envelope;
      float radial=radius+sin(roll)*.17*envelope;
      float cross=(.62-cos(roll))*.17*envelope;
      shaped.x=t-.5+envelope*.045*sin(side*2.0+bankId);
      shaped.y=cos(turn)*radial-sin(turn)*cross;
      shaped.z=sin(turn)*radial+cos(turn)*cross;
    } else if (aBoltSize.w >= 5.5) {
      // Flak: a stubby tumbling fragment. Stepped facets instead of a taper, and a body that
      // sits off the flight axis, so fragmentation never reads as a short glowing dart.
      shaped.yz *= (0.82 + 0.36 * step(0.5, fract(t * 3.0))) * 1.22;
      shaped.x *= 0.58;
      shaped.y += 0.17 * sin(t * 6.28318 + side);
      shaped.z += 0.14 * cos(t * 6.28318);
    }
    vec3 world = mid
      + axis * shaped.x * dash
      + (r1 * shaped.y + r2 * shaped.z) * width;
    vBoltWorld=world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vSheath;
  varying float vIntensity;
  varying float vVariant;
  varying float vAlong;
  varying vec2 vVariation;
  varying vec3 vBoltWorld;
  varying float vPatch;

  uniform sampler2D uSceneDepth;
  uniform float uDepthEnabled;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uSoftDistance;
  // B16: the cross-section patterns must travel with the round instead of riding a still image.
  uniform float uBoltTime;
  uniform float uBoltFlicker;

  float boltWave(float phase) {
    return sin(phase)*(1.0-smoothstep(0.7,3.14159,fwidth(phase)));
  }
  float boltStrand(float distance, float width) {
    float resolved=max(width,fwidth(distance));
    return exp(-pow(distance/resolved,2.0))*width/resolved;
  }

  float linearDepth(float depth01) {
    float z = depth01 * 2.0 - 1.0;
    return (2.0 * uCameraNear * uCameraFar)
      / max(uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear), 1e-5);
  }

  void main() {
    float boltClock = uBoltTime * (0.88 + vVariation.y * 0.24) + vVariation.x;
    bool thermal=vVariant>.5&&vVariant<1.5;
    bool induction=vVariant>3.5&&vVariant<4.5;
    bool pressure=vVariant>4.5&&vVariant<5.5;
    bool siege=vVariant>6.5&&vVariant<7.5;
    bool motor=vVariant>7.5;
    if(thermal||induction||pressure||siege||motor){
      float t=vUv.x,v=vUv.y*2.0-1.0;
      float flow=t*13.0-boltClock*5.8+vPatch*2.1;
      float curl=v+.19*boltWave(t*9.0-boltClock*3.1+vPatch);
      float convection=.5+.5*boltWave(flow+curl*2.8);
      float secondary=.5+.5*boltWave(t*23.0-boltClock*7.0-curl*4.0+vPatch);
      float broad=boltStrand(curl+.28,.30);
      float fold=boltStrand(curl-.56,.14);
      float channel=boltStrand(curl-.08,.18);
      float patches=smoothstep(.18,.74,convection*.65+secondary*.35);
      float body=.15+.42*patches;
      float hot=broad*(.20+.80*convection)+fold*(.45+1.2*secondary);
      float alpha=(.11+.39*patches+.18*fold)*(1.0-.72*channel);
      float edge=1.0-smoothstep(.88,1.0,abs(v));
      if(induction){
        // The branch is substantial, but charge travels in discrete attached fronts.
        float conductor=.5+.5*boltWave(v*6.2831853+t*5.0);
        hot=(.35+.75*conductor)*(.4+.6*pow(convection,3.0));
        body=.12+.30*conductor;alpha=.18+.42*conductor;edge=1.0;
      }else if(pressure){
        float front=boltStrand(t-.73-.05*boltWave(boltClock*3.0+vPatch),.15);
        hot=front*(.65+.70*secondary)+broad*.22;
        body=.20+.25*convection;alpha=.13+.40*front+.14*patches;
      }else if(siege){
        // Dense transported charge walks toward the shoulder while return flow vents
        // down the outer folds. Dark separation survives even on a bright sky.
        float shoulder=boltStrand(t-.72,.13);
        float charge=boltStrand(t-(.24+.45*convection),.18);
        hot=shoulder*(.45+.50*secondary)+charge*broad*.65+fold*.28;
        body=.18+.24*patches;alpha=.23+.25*patches+.12*shoulder;
      }else if(motor){
        float aft=1.0-t;
        float carried=.5+.5*boltWave(aft*17.0-boltClock*8.0+vPatch*1.8);
        float nozzle=boltStrand(aft-.13,.10);
        hot=(broad*(.35+.75*carried)+fold*.45)*(1.0-aft*.58)+nozzle*.48;
        body=.12+.20*carried;alpha=(.20+.28*carried)*(1.0-smoothstep(.63,1.0,aft));
        channel=boltStrand(curl,.25);
      }
      float tips=smoothstep(0.0,.085,t)*(1.0-smoothstep(.90,1.0,t));
      alpha*=edge*tips;
      vec3 N=normalize(cross(dFdx(vBoltWorld),dFdy(vBoltWorld)));
      float viewDepth=.72+.28*(1.0-abs(dot(N,normalize(cameraPosition-vBoltWorld))));
      vec3 colour=mix(vSheath*.36,vColor,.20+.25*patches)*body*viewDepth;
      colour+=mix(vSheath,vColor,.58)*hot*(1.0-.65*channel)*1.9;
      colour+=vec3(.95,.98,1.0)*pow(fold,3.0)*secondary*.50;
      float radiance=vIntensity*mix(.52,1.0,uBoltFlicker);
      if(uDepthEnabled>.5){
        vec2 screenUv=gl_FragCoord.xy/max(uResolution,vec2(1.0));
        float sceneZ=linearDepth(texture2D(uSceneDepth,screenUv).x),fragZ=linearDepth(gl_FragCoord.z);
        float soft=clamp((sceneZ-fragZ)/max(uSoftDistance,1e-4),0.0,1.0);
        alpha*=soft;radiance*=mix(.4,1.0,soft);
      }
      if(alpha<.003)discard;
      gl_FragColor=vec4(colour*radiance,alpha);return;
    }
    float across = abs(vUv.y * 2.0 - 1.0);
    float core = pow(max(0.0, 1.0 - across), 6.0);
    float sheath = 1.0 - smoothstep(0.72, 1.0, across);
    float tip = smoothstep(0.0, 0.16, vAlong) * (1.0 - smoothstep(0.68, 1.0, vAlong));
    float body = (sheath * 0.55 + core * 0.85) * tip;
    if (body < 0.004) discard;

    vec3 col = mix(vSheath, vColor, clamp(core * 1.15, 0.0, 1.0));

    // Variant 0: Pulse - a cupped dielectric lip with an electric-cyan punch. The lip is a wave
    // the round sheds down its own flanks, and the head surges as the charge sloshes forward:
    // this is the starter gun, so it is the shot the player sees most and it may never be a
    // still image sliding across the screen.
    float pulse = 1.0 - step(0.5, vVariant);
    float pulseTip = smoothstep(0.0, 0.1, vAlong) * (1.0 - smoothstep(0.88, 1.0, vAlong));
    float pulseHead = smoothstep(0.40, 0.76, vAlong);
    float pulseShed = sin(vAlong * 5.0 + uBoltTime * 17.0);
    float pulseLip = exp(-pow((across - (0.57 + 0.13 * pulseShed)) / 0.13, 2.0));
    float pulseSurge = 0.9 + uBoltFlicker * 0.1 * sin(uBoltTime * 29.0 - vAlong * 4.0);
    body = mix(body, (sheath * 0.20 + pulseLip * (0.72 + pulseHead * 0.95)
      + core * (0.25 + pulseHead * 0.58) * pulseSurge) * pulseTip, pulse);
    col = mix(col, vec3(0.92, 0.98, 1.0), pulseLip * pulse * pulseHead * 0.67);

    // Variant 1: Plasma - superheated incandescent convection with boiling edges
    float plasma = step(0.5, vVariant) * (1.0 - step(1.5, vVariant));
    float plasmaBulb = sin(clamp(vAlong, 0.0, 1.0) * 3.14159);
    float plasmaBoil = 0.5 + 0.5 * boltWave(vAlong * (10.0 + vVariation.y * 2.0) - boltClock * 14.0);
    float plasmaCore = pow(max(0.0, 1.0 - across), 3.2);
    body = mix(body, (plasmaCore * 1.1 + sheath * 0.7)
      * (0.52 + plasmaBulb * 0.42 + plasmaBoil * 0.16), plasma);
    col = mix(col, vec3(1.0, 0.95, 0.75), plasmaCore * plasma * 0.85);

    // Variant 2: Kinetic Mach tracer - hypersonic sabot needle with shock-diamond
    // flicker. A needle-thin white-hot head up front, an amber propellant tail behind:
    // crisp ballistic punch that reads at combat distance, not a soft glowing ball.
    float kinetic = step(1.5, vVariant) * (1.0 - step(2.5, vVariant));
    float machHead = smoothstep(0.55, 1.0, vAlong);
    float machTail = 1.0 - smoothstep(0.0, 0.5, vAlong);
    float machCore = pow(max(0.0, 1.0 - across), 12.0);
    float machDiamonds = 0.82 + uBoltFlicker * 0.18 * boltWave(vAlong * 46.0 - boltClock * 55.0);
    body = mix(body, (machCore * 1.5 + sheath * 0.28) * machDiamonds * (0.75 + machHead * 0.9), kinetic);
    col = mix(col, vec3(1.0, 0.97, 0.9), machCore * machHead * kinetic * 0.95);
    col = mix(col, vec3(1.0, 0.62, 0.22), machTail * kinetic * 0.85);

    // Variant 3: Rail - a continuous cold shaft with a brief incandescent leading edge.
    float rail = step(2.5, vVariant) * (1.0 - step(3.5, vVariant));
    float railNeedle = pow(max(0.0, 1.0 - across), 10.0);
    float railHalo = pow(max(0.0, 1.0 - across), 2.6);
    float railHead = smoothstep(0.35, 1.0, vAlong);
    float railTip=boltStrand(vAlong-.78,.085);
    body = mix(body, (railNeedle*(.64+.22*railHead)+railHalo*.24)*tip, rail);
    vec3 railStock=mix(vSheath*.25,vColor*.72,railHead)+vec3(.75,.48,.20)*railTip*railNeedle;
    col = mix(col,railStock,rail);

    // Variant 4: EMP - bifurcated electric arcs crackling across fins
    float emp = step(3.5, vVariant) * (1.0 - step(4.5, vVariant));
    float forkCenter = 0.43 + 0.15 * sin(vAlong * 6.28318 - boltClock * 5.0);
    float empArc = boltStrand(across - forkCenter, 0.17);
    float empCrackle = 0.78 + uBoltFlicker * 0.22 * boltWave(vAlong * 24.0 - boltClock * 33.0);
    // Open air between the two branches is a silhouette feature, not a pale stripe
    // painted over the pulse body. A short root joins them at the trailing heel.
    float empRoot = (1.0 - smoothstep(0.12, 0.30, vAlong)) * core;
    body = mix(body, (empArc * 1.28 + empRoot * 0.55) * tip * empCrackle, emp);
    if (emp > 0.5) body *= smoothstep(0.025,0.12,empArc + empRoot);
    col = mix(col, vec3(0.75, 0.88, 1.0), empArc * emp * 0.8);

    // Variant 5: Concussion - dense shockwave compression slug. Pressure rings peel off the bow
    // shock and race down the slug's flanks while the bow itself throbs: the round that shoves
    // hulls around has to look like it is carrying a wall of pressure, not like a painted capsule.
    float concussion = step(4.5, vVariant) * (1.0 - step(5.5, vVariant));
    float concShock = smoothstep(0.65, 0.98, vAlong);
    float concRings = 0.5 + 0.5 * boltWave(vAlong * 21.0 + boltClock * 44.0);
    float concThrob = 0.86 + uBoltFlicker * 0.14 * sin(boltClock * 26.0);
    body = mix(body, (core * 0.85 + sheath * (0.5 + 0.34 * concRings * (1.0 - concShock)))
      * (0.8 + concShock * 0.6 * concThrob), concussion);
    col = mix(col, vec3(1.0, 0.8, 0.45), concShock * concussion * 0.65);

    // Variant 6: Flak - fragmentation fleck with incendiary spark jacket
    float flak = step(5.5, vVariant);
    // The spark jacket crawls tailward and spits: fragmentation is burning, not striped.
    float flakCrawl = boltWave(vAlong * 25.0 + boltClock * 39.0);
    float flakSpit = 1.0 + uBoltFlicker * 0.16 * boltWave(boltClock * 67.0 + vAlong * 9.0);
    body = mix(body, (core * 1.1 + sheath * 0.6) * (0.7 + 0.3 * flakCrawl) * flakSpit, flak);
    col = mix(col, vec3(1.0, 0.9, 0.6), core * flak * 0.8);

    // The incandescent core carries a modest HDR lift; alpha and the sheath enamel are untouched.
    float radiance = body * vIntensity * (1.0 + 0.25 * core);
    // A dark saturated outer enamel is part of the energy object. Normal blending lets
    // that lip separate it from a bright sky; only the hot fold feeds the bloom shoulder.
    float inkLip = smoothstep(0.69, 0.88, across) * (1.0 - smoothstep(0.95, 1.0, across));
    col = mix(col, vSheath * 0.065, inkLip * 0.88);
    float alpha = clamp(max(body, inkLip * tip * 0.82), 0.0, 1.0);

    if (uDepthEnabled > 0.5) {
      vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
      float sceneZ = linearDepth(texture2D(uSceneDepth, screenUv).x);
      float fragZ = linearDepth(gl_FragCoord.z);
      float soft = clamp((sceneZ - fragZ) / max(uSoftDistance, 1e-4), 0.0, 1.0);
      alpha *= soft;
      radiance *= mix(0.4, 1.0, soft);
    }

    gl_FragColor = vec4(col * radiance, alpha);
  }
`;

function dynamicAttribute(length, itemSize) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(length), itemSize);
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute;
}

export class EnergyBoltPool {
  constructor(scene, options = {}) {
    this.capacity = Math.max(1, options.capacity || ENERGY_BOLT_CAPACITY);
    this.scene = scene;
    this.geometry = createSpindleGeometry(3);
    this.pos = dynamicAttribute(this.capacity * 3, 3);
    this.prev = dynamicAttribute(this.capacity * 3, 3);
    this.axis = dynamicAttribute(this.capacity * 3, 3);
    this.size = dynamicAttribute(this.capacity * 4, 4);
    this.color = dynamicAttribute(this.capacity * 3, 3);
    this.sheath = dynamicAttribute(this.capacity * 3, 3);
    this.minPixels = dynamicAttribute(this.capacity, 1);
    this.variation = dynamicAttribute(this.capacity * 2, 2);
    this.geometry.setAttribute('aBoltPos', this.pos);
    this.geometry.setAttribute('aBoltPrev', this.prev);
    this.geometry.setAttribute('aBoltAxis', this.axis);
    this.geometry.setAttribute('aBoltSize', this.size);
    this.geometry.setAttribute('aBoltColor', this.color);
    this.geometry.setAttribute('aBoltSheath', this.sheath);
    this.geometry.setAttribute('aBoltMinPixels', this.minPixels);
    this.geometry.setAttribute('aBoltVariation', this.variation);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTanHalfFov: { value: tanHalfFov() },
        uViewportHeight: { value: 1000 },
        uMinPixels: { value: DEFAULT_BOLT_MIN_PIXELS },
        uMinLengthPixels: { value: DEFAULT_BOLT_MIN_LENGTH_PIXELS },
        uSceneDepth: { value: null },
        uDepthEnabled: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCameraNear: { value: 0.5 },
        uCameraFar: { value: 4000 },
        uSoftDistance: { value: 1.4 },
        uBoltTime: { value: 0 },
        uBoltFlicker: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.name = 'SF_WeaponEnergyBolts';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.userData.spacefaceWeaponBoltPool = true;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, identity);
    this.mesh.instanceMatrix.needsUpdate = true;

    this.entityIds = new Int32Array(this.capacity);
    this.entityIds.fill(-1);
    this.byEntity = new Map();
    this.writeCount = 0;
    // Quiet settled flight: beginFrame Map.clear + uniform writes + commit attr
    // republish ran every tick after the last bolt died. Trust empty mesh after the
    // first empty publish; defer begin until writeBolt (or drop on quiet commit).
    this._quietEmpty = false;
    this._deferredBegin = null;
    this._color = new THREE.Color();
    this._camera = null;
    this._time = 0;
    this._instanceAttributes = [
      this.pos, this.prev, this.axis, this.size, this.color, this.sheath, this.minPixels, this.variation,
    ];
    this._sortDepth = new Float64Array(this.capacity);
    this._sortOrder = new Uint32Array(this.capacity);
    this._sortOrderScratch = new Uint32Array(this.capacity);
    this._sortDestinations = new Uint32Array(this.capacity);
    this._sortAttributeScratch = new Float32Array(this.capacity * 4);
    this._sortEntityScratch = new Int32Array(this.capacity);
    this._remapEntity = (index, id) => this.byEntity.set(id, this._sortDestinations[index]);
    this.dynamicBufferOwner = scene ? registerDynamicBufferOwner(scene, {
      id: 'weapon-energy-bolts',
      mesh: this.mesh,
      attributes: [
        { name: 'position', attribute: this.pos },
        { name: 'prev', attribute: this.prev },
        { name: 'axis', attribute: this.axis },
        { name: 'size', attribute: this.size },
        { name: 'color', attribute: this.color },
        { name: 'sheath', attribute: this.sheath },
        { name: 'minPixels', attribute: this.minPixels },
        { name: 'variation', attribute: this.variation },
      ],
    }) : null;
    if (scene) scene.add(this.mesh);
  }

  setCamera(camera, viewportHeight) {
    this._camera = camera || null;
    const u = this.material.uniforms;
    u.uTanHalfFov.value = tanHalfFov(camera && camera.fov);
    u.uViewportHeight.value = Math.max(1, viewportHeight || 1000);
    if (camera) {
      u.uCameraNear.value = camera.near;
      u.uCameraFar.value = camera.far;
    }
  }

  setDepthTexture(texture, width, height) {
    const u = this.material.uniforms;
    u.uSceneDepth.value = texture || null;
    u.uDepthEnabled.value = texture ? 1 : 0;
    u.uResolution.value.set(Math.max(1, width || 1), Math.max(1, height || 1));
  }

  beginFrame(dt = 0, accessibilityProfile = null) {
    // Already empty/invisible: defer Map.clear + uniform writes until a bolt is written.
    // commit() drops the deferred begin when writeCount stays 0 — picture unchanged.
    if (this._quietEmpty) {
      this._deferredBegin = { dt, accessibilityProfile };
      this.writeCount = 0;
      return;
    }
    this._beginFrameNow(dt, accessibilityProfile);
  }

  _beginFrameNow(dt = 0, accessibilityProfile = null) {
    const profileId = accessibilityProfile && accessibilityProfile.id;
    const reducedMotion = profileId === 'reduced-motion' || profileId === 'reduced-motion-and-flash';
    const reducedFlash = profileId === 'reduced-flash' || profileId === 'reduced-motion-and-flash';
    if (!reducedMotion && Number.isFinite(dt) && dt > 0) this._time += Math.min(dt, 0.1);
    this.material.uniforms.uBoltTime.value = this._time;
    this.material.uniforms.uBoltFlicker.value = reducedFlash ? 0 : 1;
    this.writeCount = 0;
    this.byEntity.clear();
    this._deferredBegin = null;
  }

  writeBolt({
    entityId,
    x, y, z,
    prevX, prevY, prevZ,
    ax, ay, az,
    length, width, intensity, variant,
    coreR, coreG, coreB,
    sheathR, sheathG, sheathB,
    minPixels,
  }) {
    if (this._deferredBegin) {
      const deferred = this._deferredBegin;
      this._deferredBegin = null;
      this._quietEmpty = false;
      this._beginFrameNow(deferred.dt, deferred.accessibilityProfile);
    } else if (this._quietEmpty) {
      this._quietEmpty = false;
      this._beginFrameNow(0, null);
    }
    const index = this.writeCount;
    if (index >= this.capacity) return -1;
    this.writeCount = index + 1;
    this.entityIds[index] = entityId == null ? -1 : entityId;
    if (entityId != null) this.byEntity.set(entityId, index);
    const seed = weaponEffectSeed(entityId == null ? index : entityId);
    this.variation.setXY(index, seed * Math.PI * 2, (seed * 37.719) % 1);
    this.pos.setXYZ(index, x, y, z);
    this.prev.setXYZ(index, prevX, prevY, prevZ);
    this.axis.setXYZ(index, ax, ay, az);
    this.size.setXYZW(
      index,
      length,
      width,
      intensity,
      Number.isFinite(variant) ? variant : BOLT_VARIANT.PULSE,
    );
    this.color.setXYZ(index, coreR, coreG, coreB);
    this.sheath.setXYZ(index, sheathR, sheathG, sheathB);
    this.minPixels.setX(
      index,
      Number.isFinite(minPixels) && minPixels > 0 ? minPixels : DEFAULT_BOLT_MIN_PIXELS,
    );
    if (this.dynamicBufferOwner) {
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_POS, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_PREV, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_AXIS, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_SIZE, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_COLOR, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_SHEATH, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_MIN_PIXELS, index);
      markDynamicBufferItems(this.dynamicBufferOwner, BOLT_VARIATION, index);
    }
    return index;
  }

  _sortBackToFront() {
    const count = this.writeCount;
    const camera = this._camera;
    if (count < 2 || !camera || !camera.matrixWorldInverse) return false;
    // Presentation can run before renderer.render refreshes a moved camera's inverse.
    if (typeof camera.updateWorldMatrix === 'function') camera.updateWorldMatrix(true, false);
    const view = camera.matrixWorldInverse.elements;
    const pos = this.pos.array;
    const prev = this.prev.array;
    const depth = this._sortDepth;
    let order = this._sortOrder;
    let scratch = this._sortOrderScratch;
    let sorted = true;
    for (let i = 0; i < count; i++) {
      const offset = i * 3;
      // Camera-space Z increases towards the camera: most negative draws first.
      // Use the shader's swept midpoint, not distance or only the current endpoint.
      depth[i] = 0.5 * ((pos[offset] + prev[offset]) * view[2]
        + (pos[offset + 1] + prev[offset + 1]) * view[6]
        + (pos[offset + 2] + prev[offset + 2]) * view[10]) + view[14];
      order[i] = i;
      if (i > 0 && depth[i - 1] > depth[i]) sorted = false;
    }
    if (sorted) return false;

    // Stable merge sort bounds dense volleys at O(n log n), with no per-frame arrays.
    for (let width = 1; width < count; width *= 2) {
      for (let start = 0; start < count; start += width * 2) {
        const middle = Math.min(start + width, count);
        const end = Math.min(start + width * 2, count);
        let left = start;
        let right = middle;
        for (let out = start; out < end; out++) {
          scratch[out] = right >= end || (left < middle && depth[order[left]] <= depth[order[right]])
            ? order[left++] : order[right++];
        }
      }
      const swap = order;
      order = scratch;
      scratch = swap;
    }
    for (let i = 0; i < count; i++) {
      this._sortDestinations[order[i]] = i;
      this._sortEntityScratch[i] = this.entityIds[order[i]];
    }
    for (let i = 0; i < count; i++) this.entityIds[i] = this._sortEntityScratch[i];
    // Preserve the original map keys, including callers that use string entity IDs.
    this.byEntity.forEach(this._remapEntity);
    const values = this._sortAttributeScratch;
    for (let attrIndex = 0; attrIndex < this._instanceAttributes.length; attrIndex++) {
      const attribute = this._instanceAttributes[attrIndex];
      const { array, itemSize } = attribute;
      for (let i = 0; i < count; i++) {
        const source = order[i] * itemSize;
        const target = i * itemSize;
        for (let c = 0; c < itemSize; c++) values[target + c] = array[source + c];
      }
      for (let i = 0; i < count * itemSize; i++) array[i] = values[i];
      if (this.dynamicBufferOwner) markDynamicBufferItems(this.dynamicBufferOwner, attrIndex, 0, count);
    }
    // instanceMatrix is deliberately identical for every slot; the shader uses the attributes above.
    return true;
  }

  commit() {
    // Quiet latch: deferred begin + no writes → stay empty without republishing.
    if (this._deferredBegin && this.writeCount === 0) {
      this._deferredBegin = null;
      return;
    }
    // Already published empty — skip sort + attr needsUpdate churn.
    if (this.writeCount === 0 && this.mesh.count === 0 && !this.mesh.visible) {
      this._quietEmpty = true;
      return;
    }
    this._sortBackToFront();
    if (this.dynamicBufferOwner) {
      commitDynamicBufferOwner(this.dynamicBufferOwner, this.writeCount);
    } else {
      this.mesh.count = this.writeCount;
      this.pos.needsUpdate = true;
      this.prev.needsUpdate = true;
      this.axis.needsUpdate = true;
      this.size.needsUpdate = true;
      this.color.needsUpdate = true;
      this.sheath.needsUpdate = true;
      this.minPixels.needsUpdate = true;
      this.variation.needsUpdate = true;
    }
    this.mesh.visible = this.writeCount > 0;
    this._quietEmpty = this.writeCount === 0 && this.mesh.count === 0 && !this.mesh.visible;
  }

  get live() {
    return this.writeCount;
  }

  dispose() {
    unregisterDynamicBufferOwner(this.dynamicBufferOwner);
    this.dynamicBufferOwner = null;
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function createEnergyBoltPrecompileMesh() {
  const pool = new EnergyBoltPool(null, { capacity: 2 });
  pool.beginFrame();
  pool.writeBolt({
    entityId: 1,
    x: 0, y: 0.4, z: 0,
    prevX: -4, prevY: 0.4, prevZ: 0,
    ax: 1, ay: 0, az: 0,
    length: 10, width: 1.7, intensity: 2.1, variant: BOLT_VARIANT.PULSE,
    coreR: 0.2, coreG: 0.81, coreB: 1,
    sheathR: 0.37, sheathG: 0.5, sheathB: 1,
  });
  pool.commit();
  return pool.mesh;
}
