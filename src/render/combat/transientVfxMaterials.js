import * as THREE from 'three';
import { DENSITY_FILM, decodeDensityFilm } from './densityVolumeData.js';

let decodedFilm;
/** A texture per pool owner, shared by its two volume materials; CPU decode is reusable. */
export function createTransientDensityTexture() {
  if (!decodedFilm) {
    const film = decodeDensityFilm();
    // 2x2x3 frame cells fit below WebGL2's minimum 256-texel 3D dimension limit. A 12-deep
    // strip would require 384 and silently fail on otherwise supported implementations.
    decodedFilm = new Uint8Array(film.length);
    const n = DENSITY_FILM.grid;
    for (let f = 0; f < DENSITY_FILM.frames; f++) {
      const cx = f % 2, cy = Math.floor(f / 2) % 2, cz = Math.floor(f / 4);
      for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) {
        const src = ((f*n+z)*n+y)*n*2;
        const dst = (((cz*n+z)*n*2+(cy*n+y))*n*2+cx*n)*2;
        decodedFilm.set(film.subarray(src,src+n*2),dst);
      }
    }
  }
  const texture = new THREE.Data3DTexture(decodedFilm, 64, 64, 96);
  texture.name = 'SF_OfflineDensityFilm_RG8';
  texture.format = THREE.RGFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const INSTANCE_DECLARATIONS = /* glsl */`
  attribute vec3 aSpritePosition;
  attribute vec2 aSpriteScale;
  attribute float aSpriteRoll;
  attribute vec3 aSpriteColor;
  attribute float aSpriteOpacity;
  attribute vec2 aSpritePhase;
  attribute float aSpriteAxis;
  varying vec3 vSpriteColor;
  varying float vSpriteOpacity;
  varying vec2 vPhase;
  vec3 rotateHeading(vec3 p, float angle) {
    float c = cos(angle), s = sin(angle);
    return vec3(c*p.x-s*p.z, p.y, s*p.x+c*p.z);
  }
  vec3 instanceScale() {
    return vec3(aSpriteScale.x, max(0.01, sqrt(aSpriteScale.x*aSpriteScale.y)*0.72), aSpriteScale.y);
  }
`;

const SURFACE_VERTEX = /* glsl */`
  ${INSTANCE_DECLARATIONS}
  attribute vec2 aSurfaceSection;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSection;
  void main() {
    vec3 p = position;
    // A material front travels along the fold; the sheet itself opens and shears with age.
    float time = aSpritePhase.x;
    float phase = aSurfaceSection.x + aSpritePhase.y;
    p.y += 0.045 * sin(uv.x*5.1-time*6.5+phase*6.28318) * aSurfaceSection.y;
    p.xz *= 0.86 + 0.14 * sin(uv.x*2.0+time*1.5+phase);
    p = rotateHeading(p * instanceScale(), aSpriteAxis);
    vec4 world = modelMatrix * vec4(aSpritePosition + p, 1.0);
    vWorld = world.xyz;
    vUv = uv;
    vSection = aSurfaceSection.x;
    vPhase = aSpritePhase;
    vSpriteColor = aSpriteColor;
    vSpriteOpacity = aSpriteOpacity;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SURFACE_FRAGMENT = /* glsl */`
  uniform float uRadiance;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSection;
  varying vec2 vPhase;
  varying vec3 vSpriteColor;
  varying float vSpriteOpacity;
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float grazing = pow(1.0-abs(dot(n, normalize(cameraPosition-vWorld))), 2.0);
    float crossSection = vUv.y*2.0-1.0;
    float ridge = exp(-pow((crossSection-0.20*sin(vUv.x*5.0+vSection*6.28-vPhase.x*4.0))*5.6,2.0));
    float lip = exp(-pow((abs(crossSection)-0.78)*11.0,2.0));
    float body = 0.10 + 0.87*ridge + 0.48*lip;
    float transport = 0.60 + 0.40*sin(vUv.x*11.0-vPhase.x*10.0+vSection*6.28);
    float tips = smoothstep(0.0,0.10,vUv.x)*(1.0-smoothstep(0.79,1.0,vUv.x));
    float edge = 1.0-smoothstep(0.86,1.0,abs(crossSection));
    float release = 1.0-smoothstep(0.53+0.14*vSection,1.0,vPhase.x+vUv.x*0.13);
    float alpha = vSpriteOpacity * tips * edge * release;
    if (alpha < 0.004) discard;
    vec3 heat = mix(vSpriteColor*0.32, vSpriteColor, body);
    heat += mix(vSpriteColor,vec3(max(vSpriteColor.r,max(vSpriteColor.g,vSpriteColor.b))),0.55)*0.22*ridge*transport;
    gl_FragColor = vec4(heat*uRadiance*(body+0.32*grazing)*(0.65+0.35*transport), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const VOLUME_VERTEX = /* glsl */`
  ${INSTANCE_DECLARATIONS}
  varying vec3 vLocalPosition;
  varying vec3 vLocalCamera;
  varying vec3 vCenter;
  varying vec3 vScale;
  varying float vHeading;
  void main() {
    vec3 scale = instanceScale();
    // All transient batches live in the render scene, with an identity object transform.
    // inverse(modelMatrix) keeps this true under a translated/scaled diagnostic parent too.
    vec3 localCamera = (inverse(modelMatrix)*vec4(cameraPosition,1.0)).xyz;
    vLocalCamera = rotateHeading(localCamera-aSpritePosition, -aSpriteAxis)/scale;
    vLocalPosition = position;
    vCenter = aSpritePosition;
    vScale = scale;
    vHeading = aSpriteAxis;
    vPhase = aSpritePhase;
    vSpriteColor = aSpriteColor;
    vSpriteOpacity = aSpriteOpacity;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(aSpritePosition+rotateHeading(position*scale,aSpriteAxis),1.0);
  }
`;

const VOLUME_FRAGMENT = /* glsl */`
  precision highp sampler3D;
  uniform sampler3D uDensityFilm;
  uniform float uRadiance;
  uniform float uCombustion;
  uniform mat4 uWorldToClip;
  uniform mat4 uObjectToWorld;
  varying vec3 vLocalPosition;
  varying vec3 vLocalCamera;
  varying vec3 vCenter;
  varying vec3 vScale;
  varying float vHeading;
  varying vec2 vPhase;
  varying vec3 vSpriteColor;
  varying float vSpriteOpacity;
  vec2 frameDensity(vec3 p, float frame) {
    vec3 cell=vec3(mod(frame,2.0),mod(floor(frame/2.0),2.0),floor(frame/4.0));
    vec3 uvw=(0.5+clamp(p,0.0,1.0)*31.0+cell*32.0)/vec3(64.0,64.0,96.0);
    vec2 d = texture(uDensityFilm,uvw).rg;
    return d*d;
  }
  vec3 rotateHeading(vec3 p, float angle) {
    float c=cos(angle), s=sin(angle);
    return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);
  }
  void main() {
    vec3 ray = normalize(vLocalPosition-vLocalCamera);
    // The signed epsilon avoids division by zero without changing ray direction.
    vec3 safeRay = mix(vec3(-1.0),vec3(1.0),step(vec3(0.0),ray))*max(abs(ray),vec3(0.00001));
    vec3 a=(-vec3(0.5)-vLocalCamera)/safeRay, b=(vec3(0.5)-vLocalCamera)/safeRay;
    vec3 nearV=min(a,b), farV=max(a,b);
    float begin=max(0.0,max(nearV.x,max(nearV.y,nearV.z)));
    float end=min(farV.x,min(farV.y,farV.z));
    if (end<=begin) discard;
    float film=clamp(vPhase.x,0.0,1.0)*11.0;
    float f0=floor(film), f1=min(11.0,f0+1.0);
    float stride=(end-begin)/16.0;
    vec3 sum=vec3(0.0);
    float transmittance=1.0;
    float first=-1.0;
    for (int i=0;i<16;i++) {
      float distanceAlong=begin+(float(i)+0.5)*stride;
      vec3 p=vLocalCamera+ray*distanceAlong;
      // Roll the internal flow about its force axis, never about the camera. This changes
      // cavity silhouettes without randomly moving the contact or inventing a new force.
      float flowRoll=vPhase.y*6.2831853;
      vec3 filmPoint=vec3(p.x,cos(flowRoll)*p.y-sin(flowRoll)*p.z,
        sin(flowRoll)*p.y+cos(flowRoll)*p.z);
      vec2 field=mix(frameDensity(filmPoint+0.5,f0),frameDensity(filmPoint+0.5,f1),fract(film));
      float edge=1.0-smoothstep(0.40,0.495,max(abs(p.x),max(abs(p.y),abs(p.z))));
      float density=field.r*edge;
      float absorb=1.0-exp(-density*stride*13.0);
      if (first<0.0 && density>0.015) first=distanceAlong;
      // Simulation temperature opens cavities between hot folds; smoke retains cooler body depth.
      float hot=clamp(field.g*2.5,0.0,1.0);
      vec3 soot=vSpriteColor*(0.29+0.57*field.g+0.30*(p.y+0.5));
      vec3 fire=mix(vSpriteColor*0.28, vSpriteColor*1.55,hot);
      fire=mix(fire,vec3(1.65,1.17,0.65),pow(hot,4.0)*0.63);
      sum+=transmittance*absorb*mix(soot,fire,uCombustion);
      transmittance*=1.0-absorb;
    }
    float opacity=1.0-transmittance;
    float alpha=opacity*vSpriteOpacity;
    if (alpha<0.004 || first<0.0) discard;
    // Test the first occupied sample, not the proxy's back face. A separate resolved scene depth
    // is still required for soft intersections INSIDE a volume; never sample the attached target.
    vec3 firstLocal=vLocalCamera+ray*first;
    vec3 objectPoint=vCenter+rotateHeading(firstLocal*vScale,vHeading);
    vec4 clip=uWorldToClip*uObjectToWorld*vec4(objectPoint,1.0);
    gl_FragDepth=clamp(clip.z/clip.w*0.5+0.5,0.0,1.0);
    gl_FragColor=vec4(sum/max(opacity,0.0001)*uRadiance,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createTransientVfxMaterial(kind, radiance, densityTexture = null) {
  const volume = kind === 'smoke' || kind === 'combustion';
  const smoke = kind === 'smoke';
  const material = new THREE.ShaderMaterial({
    name: `SF_Transient_${kind}_${volume ? 'density-film' : 'folded-surface'}`,
    uniforms: {
      uRadiance: { value: radiance },
      ...(volume ? {
        uDensityFilm: { value: densityTexture },
        uCombustion: { value: smoke ? 0 : 1 },
        uWorldToClip: { value: new THREE.Matrix4() },
        uObjectToWorld: { value: new THREE.Matrix4() },
      } : {}),
    },
    vertexShader: volume ? VOLUME_VERTEX : SURFACE_VERTEX,
    fragmentShader: volume ? VOLUME_FRAGMENT : SURFACE_FRAGMENT,
    transparent: true, depthWrite: false, depthTest: true,
    blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: volume ? THREE.BackSide : THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: smoke,
  });
  material.userData.spacefaceTransientTechnique = volume ? 'baked-density-film' : 'swept-folded-surface';
  return material;
}

/** The same sheet response, driven by the existing structural pool's instance matrices. */
export function createStructuralSurfaceMaterial(name) {
  const material = new THREE.ShaderMaterial({
    name,
    uniforms: { uRadiance: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec2 aSurfaceSection;
      attribute vec2 aStructuralPhase;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vSection;
      varying vec2 vPhase;
      varying vec3 vSpriteColor;
      varying float vSpriteOpacity;
      void main() {
        vec3 p=position;
        p.y+=0.045*sin(uv.x*5.1-aStructuralPhase.x*6.5+aSurfaceSection.x*6.28318)*aSurfaceSection.y;
        vec4 world=modelMatrix*instanceMatrix*vec4(p,1.0);
        vWorld=world.xyz; vUv=uv; vSection=aSurfaceSection.x;
        vPhase=aStructuralPhase;
        vSpriteColor=instanceColor;
        vSpriteOpacity=1.0;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: SURFACE_FRAGMENT,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    forceSinglePass: true, toneMapped: false,
  });
  material.userData.spacefaceArcadeVfxMaterial = true;
  material.userData.spacefaceTransientTechnique = 'swept-folded-surface';
  return material;
}
