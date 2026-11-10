/** Shared material-scale flow, not screen-space grain or a new rendering pass. */
export const LIVING_NOISE_GLSL = /* glsl */`
#ifndef SF_LIVING_NOISE_V1
#define SF_LIVING_NOISE_V1
float sfLivingHash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
// Value and analytic gradient of a C2 scalar potential. Curl = perpendicular gradient.
vec3 sfLivingPotential(vec2 p){
  vec2 i=floor(p),f=fract(p);
  vec2 u=f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 du=30.0*f*f*(f-1.0)*(f-1.0);
  float a=sfLivingHash(i),b=sfLivingHash(i+vec2(1.0,0.0));
  float c=sfLivingHash(i+vec2(0.0,1.0)),d=sfLivingHash(i+vec2(1.0));
  return vec3(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),
    du.x*mix(b-a,d-c,u.y),du.y*mix(c-a,d-b,u.x));
}
vec2 sfLivingCurl(vec2 p){vec3 n=sfLivingPotential(p);return vec2(n.z,-n.y);}
#endif
`;
export const LIVING_MATERIAL_GLSL = /* glsl */`${LIVING_NOISE_GLSL}
#ifndef SF_LIVING_MATERIAL_V1
#define SF_LIVING_MATERIAL_V1
// Material coordinates move with the source-to-receiver direction. Two scales shear into one
// another; there is no global breathe/spin beat, scrolling comb, or screen-space sparkle.
vec3 sfLivingFilm(vec2 coord,float travel,float seed){
  vec2 p=coord-vec2(travel,0.0)+vec2(seed*3.17,seed*1.73);
  vec2 drift=sfLivingCurl(p*.53+vec2(3.1,-2.7));
  p+=drift*.38;
  vec3 broad=sfLivingPotential(p);
  vec3 fine=sfLivingPotential(p*2.13+drift*.44+vec2(-4.7,9.3));
  float footprint=max(length(fwidth(p)),.001);
  float detail=1.0-smoothstep(.26,.8,footprint);
  float mass=mix(broad.x,broad.x*.73+fine.x*.27,detail);
  float ridge=1.0-smoothstep(.025+footprint*.10,.13+footprint*.22,abs(mass-.57));
  float opening=smoothstep(.39,.61,mass);
  return vec3(mass,ridge,opening);
}
#endif
`;
