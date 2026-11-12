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
  float coolHeat=heat*(1.0-smoothstep(0.16,0.96,t));
  float end=1.0-smoothstep(0.80,1.0,t);
  vec3 color=pigment*(0.10+tubeCrest*(0.65+1.85*coolHeat))*mix(0.72,1.05,key);
  color+=vec3(1.8,1.55,1.05)*pow(tubeCrest,4.0)*coolHeat*0.38;
  color+=pigment*pow(1.0-facing,2.0)*0.10;
  return vec4(color,clamp(alpha*(0.24+0.58*tubeCrest)*broken*end,0.0,1.0));
}
vec4 sfEventSurface(float kind,vec2 uv,vec2 section,float seed,float t,vec3 world,
    vec3 pigment,float alpha,float heat){
  if(kind>3.5)return sfEventPressureSurface(uv,section,seed,t,world,pigment,alpha,heat);
  float u=uv.x,v=uv.y,lobe=section.x;
  float mineral=step(kind,0.5);
  float armor=step(0.5,kind)*step(kind,1.5);
  float reactor=step(1.5,kind)*step(kind,2.5);
  float fuel=step(2.5,kind);
  float hot=fuel+reactor;
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
  float coolHeat=heat*(1.0-smoothstep(0.16,0.96,t));
  float end=1.0-smoothstep(0.80,1.0,t);
  float tips=smoothstep(0.0,0.035,u)*(1.0-smoothstep(0.965,1.0,u));
  vec3 stone=mix(vec3(0.10,0.085,0.065),pigment*0.62,0.55)*mix(0.42,1.05,key);
  vec3 metal=pigment*vec3(0.15,0.20,0.26)*mix(0.42,1.05,key);
  vec3 chroma=pigment/max(0.40,max(pigment.r,max(pigment.g,pigment.b)));
  vec3 color=stone*(0.45+0.55*cavity)*mineral;
  color+=metal*(0.50+0.50*cavity)*armor;
  color+=pigment*(0.04+0.10*cavity)*reactor;
  color+=vec3(0.045,0.018,0.009)*fuel;
  color+=chroma*(ridge*2.60+cavity*0.07)*coolHeat*reactor;
  color+=pigment*(0.18+0.72*ridge)*coolHeat*2.10*fuel;
  color+=vec3(2.60,1.02,0.24)*(fault*1.05+ridge*0.14)*coolHeat*mineral;
  color+=vec3(3.70,1.95,0.62)*(ridge*0.70+fault*0.40)*coolHeat*armor;
  color+=vec3(2.30,1.10,0.30)*ridge*coolHeat*fuel;
  color+=vec3(1.62,1.46,1.16)*pow(ridge,4.0)*coolHeat*(0.42*reactor+0.85*fuel+0.45*armor);
  color+=vec3(1.05,1.05,1.05)*pow(ridge,5.0)*coolHeat*0.22;
  color+=pigment*rim*0.10;
  float opacityWeight=mineral*(0.94+0.06*cavity)
    +armor*(0.66+0.30*ridge)
    +reactor*(0.12+0.55*ridge+0.08*cavity)*tips
    +fuel*(0.18+0.55*ridge+0.08*cavity)*tips;
  return vec4(color,clamp(alpha*end*opacityWeight,0.0,1.0));
}
#endif
`;
