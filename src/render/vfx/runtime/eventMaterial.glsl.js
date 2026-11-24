/** Shared, closed-volume event grammar. Continuous designed contours only: no hash-noise art,
 * camera-facing cards, point sprites, untouched emissive primitives or per-event materials.
 * The four damage substances share one branch-light parameterization so the shader compiles
 * quickly on integrated GPUs while still producing distinct silhouettes and internal motion. */
export const EVENT_COMMON_GLSL = /* glsl */`
#ifndef SF_EVENT_COMMON_V1
#define SF_EVENT_COMMON_V1
const float SF_EVENT_PI=3.141592653589793;
const float SF_EVENT_TAU=6.283185307179586;
vec3 sfEventRotate(vec3 p,float angle){
  float c=cos(angle),s=sin(angle);
  return vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);
}
vec3 sfEventFamilyColor(float kind,float seed){
  float mineral=step(kind,0.5);
  float armor=step(0.5,kind)*step(kind,1.5);
  float reactor=step(1.5,kind)*step(kind,2.5);
  float fuel=step(2.5,kind);
  vec3 stone=vec3(0.40,0.33,0.24);
  vec3 metal=vec3(0.38,0.46,0.55);
  vec3 plasma=mix(vec3(0.52,0.74,1.38),vec3(1.58,0.74,0.20),smoothstep(0.16,0.50,seed));
  vec3 flame=vec3(1.48,0.44,0.075);
  return stone*mineral+metal*armor+plasma*reactor+flame*fuel;
}
vec3 sfEventPressureLocal(vec2 uv,vec2 section,float seed,float t,vec3 shape){
  float u=uv.x,angle=uv.y*SF_EVENT_TAU,lobe=section.x,signedLobe=lobe-1.0;
  float character=sin(seed*17.13+lobe*4.73);
  float span=1.02+0.13*sin(seed+lobe*2.0);
  float arc=signedLobe*2.05+(u-0.5)*span+seed*0.38+character*0.15;
  float radius=shape.x*(0.37+0.025*sin(seed*3.0+lobe)+t*0.035);
  float tube=shape.y*(0.070+0.012*sin(seed*5.0+lobe));
  return vec3(cos(arc)*(radius+cos(angle)*tube),
    sin(angle)*tube*shape.z/max(shape.y,0.001)+signedLobe*shape.z*0.035,
    sin(arc)*(radius+cos(angle)*tube));
}
// shape = (length, width, height). uv.x runs along the event axis; uv.y wraps the closed section.
vec3 sfEventLocal(float kind,vec2 uv,vec2 section,float seed,float t,vec3 shape){
  float u=uv.x,v=uv.y,angle=v*SF_EVENT_TAU,lobe=section.x,signedLobe=lobe-1.0;
  float character=sin(seed*17.13+lobe*4.73);
  float mineral=step(kind,0.5);
  float armor=step(0.5,kind)*step(kind,1.5);
  float reactor=step(1.5,kind)*step(kind,2.5);
  float fuel=step(2.5,kind);
  float hot=fuel+reactor;
  float radialPower=mix(mix(mix(0.46,0.62,armor),0.50,reactor),0.54,fuel);
  float envelope=pow(max(0.0,sin(u*SF_EVENT_PI)),radialPower);
  float facetAmount=mineral*0.36+armor*0.10;
  float facet=mix(1.0,1.0/max(max(abs(cos(angle)),abs(sin(angle))),0.72),facetAmount);
  float widthScale=mineral*0.70+armor*0.78+reactor*1.00+fuel*1.08;
  float heightScale=mineral*0.70+armor*1.15+reactor*1.00+fuel*0.95;
  float lengthScale=mineral*0.72+armor*0.92+reactor*1.04+fuel*1.12;
  float lobeSpread=mineral*0.12+armor*0.10+reactor*0.15+fuel*0.16;
  float rollScale=mineral*0.15+armor*0.55+reactor*1.35+fuel*1.10;
  float swirl=mineral*0.20+armor*0.38+reactor*0.42+fuel*0.50;
  float radius=shape.y*envelope*(0.42+0.58*(0.88+0.15*sin(u*9.0+seed+lobe)))*facet*widthScale;
  float roll=angle+rollScale*signedLobe+swirl*sin(u*5.0+seed-t*2.4+lobe);
  vec3 p=vec3(0.0);
  p.x=(u-0.5)*shape.x*lengthScale+signedLobe*shape.x*lobeSpread;
  p.y=cos(roll)*radius*(shape.z/max(shape.y,0.001))*heightScale;
  p.z=sin(roll)*radius;
  p.y+=signedLobe*shape.z*(armor*0.18+reactor*0.16+fuel*0.15+mineral*0.08);
  p.z+=signedLobe*shape.y*(armor*0.30+reactor*0.18+fuel*0.20+mineral*0.08);
  p.y+=sin(u*5.0+seed-t*1.8+lobe)*shape.z*(0.18*hot+0.08)*envelope;
  p.z+=cos(u*4.5-seed+t*1.5+lobe)*shape.y*(0.14*hot+0.05)*envelope;
  float twist=signedLobe*mix(0.20,1.05,hot);
  float ct=cos(twist),st=sin(twist);
  p.yz=vec2(ct*p.y-st*p.z,st*p.y+ct*p.z);
  p.xz+=vec2(sin(u*5.0+seed+lobe),cos(u*6.0-seed+lobe))*shape.y*0.10*envelope*(mineral+fuel);
  p.x+=signedLobe*t*t*shape.x*(mineral*0.14+reactor*0.10+fuel*0.12);
  p.y+=character*t*shape.z*0.18*mineral;
  return p;
}
#endif
`;

export const EVENT_VOLUME_GLSL = /* glsl */`${EVENT_COMMON_GLSL}
#ifndef SF_EVENT_VOLUME_V1
#define SF_EVENT_VOLUME_V1
float sfEventBand(float x,float width){
  float aa=max(fwidth(x),0.0015);
  return 1.0-smoothstep(max(0.0005,width-aa),width+aa,abs(x));
}
vec4 sfEventPressureSurface(vec2 uv,vec2 section,float seed,float t,vec3 world,
    vec3 pigment,float alpha,float heat){
  float u=uv.x,v=uv.y,lobe=section.x;
  vec3 normal=normalize(cross(dFdx(world),dFdy(world)));
  float facing=abs(dot(normal,normalize(cameraPosition-world)));
  float key=0.30+0.70*abs(dot(normal,normalize(vec3(-0.45,0.82,0.31))));
  float tubeCrest=sfEventBand(v-0.5,0.19);
  float broken=0.60+0.40*sin(u*7.0+seed+lobe*2.0);
  float coolHeat=heat*pow(1.0-smoothstep(0.05,0.72,t),1.35);
  float end=pow(1.0-smoothstep(0.10,1.0,t),1.30);
  float radialFade=(1.0-smoothstep(0.24,1.0,abs(u-0.5)*2.0))*mix(1.0,0.72,abs(lobe-1.0));
  vec3 color=pigment*(0.06+tubeCrest*(0.48+1.15*coolHeat))*mix(0.72,1.05,key);
  color+=vec3(1.25,1.08,0.75)*pow(tubeCrest,4.0)*coolHeat*0.24;
  color+=pigment*pow(1.0-facing,2.0)*0.08;
  color=min(color,vec3(2.4));
  return vec4(color,min(0.50,clamp(alpha*(0.16+0.40*tubeCrest)*broken*end*radialFade,0.0,1.0)));
}
vec4 sfEventSurface(float kind,vec2 uv,vec2 section,float seed,float t,vec3 world,
    vec3 pigment,float alpha,float heat){
  if(kind>3.5)return sfEventPressureSurface(uv,section,seed,t,world,pigment,alpha,heat);
  float u=uv.x,v=uv.y,lobe=section.x;
  float mineral=step(kind,0.5);
  float armor=step(0.5,kind)*step(kind,1.5);
  float reactor=step(1.5,kind)*step(kind,2.5);
  float fuel=step(2.5,kind);
  vec3 normal=normalize(cross(dFdx(world),dFdy(world)));
  vec3 viewDir=normalize(cameraPosition-world);
  float facing=abs(dot(normal,viewDir));
  float key=0.30+0.70*abs(dot(normal,normalize(vec3(-0.45,0.82,0.31))));
  float rim=pow(1.0-facing,2.0);
  float axial=u*(7.0+2.0*fuel)-t*(2.4+1.6*fuel)+seed+lobe*2.1;
  float ridgeA=sfEventBand(v-(0.5+0.235*sin(axial)),mix(0.105,0.150,fuel));
  float ridgeB=sfEventBand(v-(0.5+0.235*sin(axial+2.35)),0.082);
  float ridge=max(ridgeA,ridgeB);
  float cavity=1.0-ridge;
  float fault=sfEventBand(u-(0.31+0.15*sin(v*6.0+seed+lobe)),mix(0.028,0.055,armor));
  // Punchy hot beat on impact, then fast cooling and smooth dissolve (no long white/black slab).
  float coolHeat=heat*pow(1.0-smoothstep(0.05,0.72,t),1.35);
  float end=pow(1.0-smoothstep(0.10,1.0,t),1.30);
  float tips=smoothstep(0.0,0.12,u)*(1.0-smoothstep(0.88,1.0,u));
  float radialFade=(1.0-smoothstep(0.24,1.0,abs(u-0.5)*2.0))*mix(1.0,0.70,abs(lobe-1.0));
  vec3 stone=mix(vec3(0.10,0.085,0.065),pigment*0.58,0.55)*mix(0.42,1.05,key);
  vec3 metal=pigment*vec3(0.14,0.19,0.25)*mix(0.42,1.05,key);
  vec3 chroma=pigment/max(0.45,max(pigment.r,max(pigment.g,pigment.b)));
  vec3 color=stone*(0.45+0.55*cavity)*mineral;
  color+=metal*(0.48+0.52*cavity)*armor;
  color+=pigment*(0.02+0.05*cavity)*reactor;
  color+=vec3(0.04,0.016,0.008)*fuel;
  color+=chroma*(ridge*1.42+cavity*0.03)*coolHeat*reactor;
  color+=pigment*(0.14+0.52*ridge)*coolHeat*1.35*fuel;
  color+=vec3(1.55,0.65,0.18)*(fault*0.85+ridge*0.12)*coolHeat*mineral;
  color+=vec3(2.05,1.02,0.32)*(ridge*0.56+fault*0.34)*coolHeat*armor;
  color+=vec3(1.45,0.68,0.20)*ridge*coolHeat*fuel;
  color+=vec3(1.25,1.12,0.90)*pow(ridge,4.0)*coolHeat*(0.24*reactor+0.42*fuel+0.26*armor);
  color+=vec3(0.55,0.55,0.55)*pow(ridge,5.0)*coolHeat*0.18;
  color+=pigment*rim*0.08;
  color=min(color,vec3(2.6));
  float solidFade=mix(0.42,1.0,radialFade)*tips;
  float opacityWeight=mineral*(0.52+0.12*cavity)*solidFade
    +armor*(0.36+0.22*ridge)*solidFade
    +reactor*(0.04+0.32*ridge+0.02*cavity)*tips*radialFade
    +fuel*(0.08+0.34*ridge+0.03*cavity)*tips*radialFade;
  return vec4(color,min(0.56,clamp(alpha*end*opacityWeight,0.0,1.0)));
}
#endif
`;
