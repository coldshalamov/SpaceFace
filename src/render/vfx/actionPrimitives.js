import { SweptSurfaceBatch, SURFACE_FLOATS } from '../forceLanguage/sweptSurfaceBatch.js';

export const ACTION_PRIMITIVES = Object.freeze({
  compression: 1, connection: 2, deposition: 3, pressure: 4, induction: 5, capture: 6,
});
const BY_VERB = Object.freeze({ ignition: 'compression', vent: 'compression',
  transfer: 'connection', latch: 'connection', cut: 'connection',
  repair: 'deposition', grind: 'deposition', cool: 'deposition', harvest: 'deposition',
  fling: 'pressure', combo: 'pressure', shove: 'pressure',
  disrupt: 'induction', command: 'induction', prime: 'capture', arm: 'capture',
  catch: 'capture', capture: 'capture' });
export function actionPrimitiveForVerb(verb) { return BY_VERB[verb] || null; }
const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };

// These are different physical cross-sections on the existing pooled surface topology,
// not a second VFX renderer. Local coordinates also drive the analytic material, so no
// texture resolution or camera-facing sheet determines the effect's outline.
const VERTEX = /* glsl */`
attribute vec4 iOrigin; attribute vec4 iPath; attribute vec4 iShape;
attribute vec4 iTint; attribute vec4 iMotion; attribute vec4 iFinish;
attribute vec4 iLife; attribute vec4 iBehavior; attribute vec4 iPivot;
uniform float uTime; uniform float uMotion;
varying vec2 vUv; varying vec4 vTint; varying vec4 vAction;
varying vec3 vNormal; varying vec3 vWorld; varying vec2 vLocal;
const float PI=3.14159265359;
vec3 actionPoint(float t,float v){
  float kind=iPath.x,age=max(0.0,uTime-iLife.x)*uMotion;
  float phase=iShape.w,along=mix(iPath.y,iPath.z,t);
  float belly=pow(max(.0,sin(PI*t)),.55),width=iShape.x;
  float lift=iShape.y,bow=iPath.w;
  vec3 p=vec3(along,0.0,sin(PI*t)*bow);
  float curl=v*PI;
  if(kind<1.5){
    // Open exhaust throat becomes three rolling, unequal hot folds downstream.
    float section=v*2.48+.35*sin(t*5.0-age*2.4+phase);
    float spread=width*(.48+.52*sin(PI*t));
    p.z+=sin(section)*spread;
    p.y=(.56-cos(section))*lift+sin(PI*t)*lift*.28*sin(t*8.0-age*3.1+phase);
    p.z+=sin(t*6.2-age*2.7+phase)*bow*.28*belly;
  }else if(kind<2.5){
    // Closed loaded conductor: changing elliptical section with a dark lumen.
    float twist=.35*sin(t*7.0-age*2.2+phase);
    p.z+=cos(curl+twist)*width*(.75+.25*belly);
    p.y=sin(curl+twist)*lift;
    p.z+=sin(t*11.0-age*3.3+phase)*width*.12*belly;
  }else if(kind<3.5){
    // A deposited lenticular patch has area and a raised wet/welded rim.
    // Its unequal boundary and vertical seam distinguish it from a flat decal.
    float edge=pow(max(0.0,sin(PI*t)),.38);
    p.z=v*width*edge*(.84+.12*sin(t*10.0+phase));
    p.y=lift*(1.0-v*v)*belly+lift*.14*sin(t*9.0+v*3.0-age*1.3+phase)*belly;
  }else if(kind<4.5){
    // Standing pressure wall: a bowed lip, folded skirt and vertical compression.
    float a=mix(iPath.y,iPath.z,t),r=iShape.z;
    float radial=r+v*width;
    p=vec3(cos(a)*radial,lift*(.72*pow(.5-.5*v,2.0)+.21*sin(v*PI)),sin(a)*radial);
    p.y+=lift*.18*sin(t*9.0-age*2.8+phase)*belly;
  }else if(kind<5.5){
    // Induction bridges are broad prismatic branches, with staggered kinks and
    // a flattened diamond section instead of a wire or lightning billboard.
    p.z+=bow*.34*sin(t*PI*3.0+phase)*belly;
    p.z+=sign(cos(curl))*pow(abs(cos(curl)),.65)*width;
    p.y=sign(sin(curl))*pow(abs(sin(curl)),.65)*lift;
    p.y+=sin(t*8.0-age*3.0+phase)*lift*.20*belly;
  }else{
    // Closed angular clamp members have a load-bearing back and bright teeth.
    p.z+=bow*(.5-.5*cos(t*PI));
    p.z+=sign(cos(curl))*pow(abs(cos(curl)),.38)*width;
    p.y=sign(sin(curl))*pow(abs(sin(curl)),.38)*lift;
  }
  p.z+=iBehavior.z;
  float c=cos(iOrigin.w),s=sin(iOrigin.w);
  return iOrigin.xyz+vec3(c*p.x-s*p.z,p.y,c*p.z+s*p.x);
}
void main(){
  float t=position.x,v=position.y;
  vec3 p=actionPoint(t,v);
  vec3 along=actionPoint(min(1.0,t+.001),v)-actionPoint(max(0.0,t-.001),v);
  vec3 across=actionPoint(t,min(1.0,v+.002))-actionPoint(t,max(-1.0,v-.002));
  vNormal=normalize(mat3(modelMatrix)*(cross(across,along)+vec3(0.0,.000001,0.0)));
  vWorld=(modelMatrix*vec4(p,1.0)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  vUv=vec2(t,v);vTint=iTint;
  vAction=vec4(iPath.x,max(0.0,uTime-iLife.x)*uMotion*iMotion.x,iShape.w,iMotion.y);
  // vLocal is material arrival and independent source cutoff, not shape scaling.
  vLocal=iFinish.xy;
}`;

const FRAGMENT = /* glsl */`
uniform float uFlash;
varying vec2 vUv; varying vec4 vTint; varying vec4 vAction;
varying vec3 vNormal; varying vec3 vWorld; varying vec2 vLocal;
float wave(float phase){return mix(.5,.5+.5*sin(phase),1.0-smoothstep(.8,3.14159,fwidth(phase)));}
float band(float distance,float width){
  float pixel=max(.001,fwidth(distance));
  float filtered=sqrt(width*width+pixel*pixel*.65);
  return exp(-pow(distance/filtered,2.0))*width/filtered;
}
void main(){
  float t=vUv.x,v=vUv.y,kind=vAction.x,time=vAction.y,phase=vAction.z;
  float flow=wave(t*14.0-time*5.1+phase+sin(v*3.0+t*5.0));
  float islands=wave(t*21.0-time*2.9+sin(v*6.0+phase)*1.4);
  float body=.16+.24*smoothstep(.25,.80,islands);
  float crest=band(v-.34-.16*sin(t*7.0-time*2.0+phase),.24)
    +.65*band(v+.52+.13*sin(t*10.0-time*1.6+phase),.21);
  float hot=crest*(.32+1.25*pow(flow,3.0));
  float dark=band(v+.04+.17*sin(t*9.0-time*2.8+phase),.22);
  float edge=1.0-smoothstep(.90,1.0,abs(v));
  if(kind>1.5&&kind<2.5){
    edge=1.0;hot*=.72;
    dark=band(v-.15*sin(t*13.0-time*2.6+phase),.32);
  }else if(kind>2.5&&kind<3.5){
    float front=sin(t*8.0+v*3.0+phase)+.45*sin(v*7.0-t*4.0-time*1.2);
    hot=band(front-.35,.17)*(.32+.88*flow);
    body=.22+.32*smoothstep(-.6,.6,front);dark=.25+.55*wave(t*10.0+v*5.0+phase);
  }else if(kind>3.5&&kind<4.5){
    hot=band(v+.62,.25)*(.55+1.55*flow)+band(v-.46,.20)*.30;
    body*=.64;dark=band(v-.04,.30);
  }else if(kind>4.5&&kind<5.5){
    edge=1.0;
    float knot=pow(wave(t*19.0-time*7.0+phase),5.0);
    hot=crest*(.38+1.7*knot);body*=.62;dark=band(v,.30);
  }else if(kind>5.5){
    edge=1.0;body=.35;dark=.6;
    hot=(band(v-.72,.15)+band(v+.72,.15))*(.32+wave(t*18.0-time*3.0+phase));
  }
  float arrival=smoothstep(t-.055,t+.055,vLocal.x);
  float cutoff=smoothstep(vLocal.y-.06,vLocal.y+.06,t);
  float tip=max(.015,fwidth(t));
  float ends=smoothstep(0.0,tip,t)*(1.0-smoothstep(1.0-tip,1.0,t));
  float light=.40+.60*abs(dot(normalize(vNormal),normalize(vec3(-.4,.8,.3))));
  float grazing=1.0-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld)));
  vec3 pigment=vTint.rgb*(.12+.15*flow)*(1.0-dark*.75)*light;
  // Optical coverage stays translucent; the small transported crests must still
  // carry HDR energy after alpha compositing, or the volume reads like dyed plastic.
  float core=pow(max(0.0,hot-.52),2.0);
  vec3 emission=vTint.rgb*hot*vAction.w*uFlash*(3.7+.65*grazing)
    +mix(vec3(1.0),vTint.rgb,.24)*core*2.2*vAction.w*uFlash;
  float coverage=min(.68,body+hot*.13)*(1.0-dark*.28);
  float alpha=edge*ends*arrival*cutoff*vTint.a*coverage;
  if(alpha<.003)discard;
  gl_FragColor=vec4(pigment+emission,alpha);
  #include <colorspace_fragment>
}`;

/** Reuses the surface pool, upload owner and particle owner supplied by ActionVfx.
 * render consumes a retained global-frame slot; it never reads/writes simulation. */
export class ActionPrimitiveComposer {
  constructor(batch, particles, toLocal = null) {
    this.batch=batch;this.particles=particles;this.toLocal=toLocal;this.local={x:0,z:0};
    this.d=new Float32Array(SURFACE_FLOATS);
    this.burst={kind:'current',x:0,y:1,z:0,dx:1,dz:0,radius:8,seed:0,count:5,life:.5,strength:1};
    batch.material.name='SF_ActionPrimitiveMatter';
    batch.material.vertexShader=VERTEX;batch.material.fragmentShader=FRAGMENT;
    batch.material.needsUpdate=true;
  }
  // Public composing seam for other receipt owners. Same retained slot contract;
  // reading this alias creates no wrapper, rest array, or bound function per call.
  get piece(){return this._piece;}
  _piece(kind,x,z,angle,start,end,width,height,bow,side,reach,phase,opacity,arrival=1,cutoff=-.1,heat=1){
    const d=this.d,s=this.slot,c=s.recipe.color;
    if(this.toLocal)this.toLocal(x,z,this.local);else{this.local.x=x;this.local.z=z;}
    d[0]=this.local.x;d[1]=s.y+1.1;d[2]=this.local.z;d[3]=angle;
    d[4]=kind;d[5]=start;d[6]=end;d[7]=bow;
    d[8]=width;d[9]=height;d[10]=reach;d[11]=phase+s.seed*TAU;
    d[12]=c.r;d[13]=c.g;d[14]=c.b;d[15]=opacity;
    d[16]=.78+s.seed*.44;d[17]=heat;d[18]=d[19]=0;
    d[20]=arrival;d[21]=cutoff;d[22]=d[23]=0;
    d[24]=s.born;d[25]=s.recipe.life;d[26]=-1;d[27]=1;
    d[28]=0;d[29]=0;d[30]=side;d[31]=0;
    d[32]=this.local.x;d[33]=this.local.z;d[34]=d[35]=0;
    this.batch.add(d);
  }
  _matter(s,age,reduced,kind,angle,reach,x=s.x,z=s.z){
    if(reduced||age<.045)return;
    const continuous=s.recipe.continuous;
    const pulse=Math.floor(age/(continuous?.16:.19));
    if(pulse<=s.particlePulse||(!continuous&&age>s.recipe.life*.58))return;
    s.particlePulse=pulse;
    const p=this.burst;
    if(this.toLocal)this.toLocal(x,z,this.local);else{this.local.x=x;this.local.z=z;}
    p.x=this.local.x;p.y=s.y+1.3;p.z=this.local.z;p.dx=Math.cos(angle);p.dz=Math.sin(angle);
    p.kind=kind;p.radius=reach;p.seed=s.seed+pulse*.381966;p.count=kind==='heat'?7:5;
    p.life=Math.min(.78,s.recipe.life*.86);p.strength=.84;p.age=0;
    this.particles.emit(p);
  }
  render(s,now,reduced=false,flash=false){
    this.slot=s;
    const age=Math.max(0,now-s.born),life=s.recipe.life;
    const since=Math.max(0,now-(s.recipe.continuous?s.last:s.born));
    const progress=clamp(since/life),motion=reduced?.32:progress;
    const flowTime=reduced?.25:age;
    const attack=smooth(age/.06),cool=1-smooth((progress-.46)/.54);
    const alpha=attack*cool*(flash?.64:1);
    const r=clamp(s.radius,2.5,24),w=clamp(r*.30,1.3,5.4);
    const a=s.angle,seed=s.seed*TAU,verb=s.recipe.verb;
    const family=s.recipe.primitive||actionPrimitiveForVerb(verb);
    const cutoff=s.recipe.continuous?clamp((progress-.50)*2.2)-.1:clamp((progress-.62)*2.9)-.1;
    const feed=clamp(age/(.10+s.seed*.07));
    if(family==='compression'){
      const vent=verb==='vent',length=r*(vent?3.4:1.65),axis=a;
      // Two unequal exhaust channels, one delayed counterfold and a loaded throat.
      for(let i=0;i<3;i++){
        const delay=i*.035,local=clamp((age-delay)/(vent?.30:.11));
        const peel=clamp((motion-.48-i*.06)/.45);
        this._piece(1,s.x,s.z,axis+(i-1)*.13,length*(.03+i*.025),length*(.86+i*.08),
          w*(1-i*.16),w*(.90-i*.17),w*(i-1)*.55,(i-1)*w*.65+peel*w*(i-1),0,i*2.1,
          alpha*smooth(local),local,cutoff+(i*.06),1.25-i*.12);
      }
      this._piece(4,s.x,s.z,axis+Math.PI,-.80,.80,w*.56,w*.75,0,0,w*.85,seed,alpha*.78,feed,cutoff,1.1);
      this._matter(s,age,reduced,vent?'heat':'cone',axis,length);
    }else if(family==='connection'){
      const dx=s.x-s.sx,dz=s.z-s.sz,len=Math.hypot(dx,dz),axis=Math.atan2(dz,dx);
      if(len>.5&&s.hasSource){
        const width=clamp(Math.min(r*.24,len*.075),1.15,3.3);
        const cut=verb==='cut';
        // The sheath remains loaded while staggered packets cross its dark interior.
        this._piece(2,s.sx,s.sz,axis,0,len,width,width*.72,width*.7,0,0,seed,
          alpha*(cut?.64:.76),feed,cut?clamp(progress*1.6)-.1:cutoff,.72);
        for(let i=0;i<3;i++){
          const at=cut?(.17+i*.28)+motion*.16:(flowTime*(.52+s.seed*.15)+i*.31)%1;
          const from=clamp(at),to=Math.min(1,from+.19);
          const opacity=alpha*smooth(from/.08)*(1-smooth((from-.78)/.22));
          this._piece(2,s.sx,s.sz,axis,len*from,len*to,width*.82,width*.62,
            width*.45*Math.sin(i+seed+flowTime*2),cut?(i-1)*w*motion*1.5:0,0,i*2.2,
            opacity,feed,-.1,1.35);
        }
        this._matter(s,age,reduced,'transfer',axis,len,s.sx,s.sz);
      }
      // Local clamps close at the received end even without an inferred source.
      for(let side=-1;side<=1;side+=2)this._piece(6,s.x,s.z,a+Math.PI/2,-r*.36,r*.36,
        w*.48,w*.40,w*.30,side*w*(.88+(verb==='cut'?motion:1-feed)*.6),0,side,
        alpha,feed,cutoff,.8);
    }else if(family==='deposition'){
      const grind=verb==='grind',harvest=verb==='harvest',spent=verb==='cool';
      const axis=a+Math.PI/2;
      // Two adjoining deposits form a local surface patch, not four strokes around a hull.
      for(let i=0;i<2;i++){
        const delay=i*.075,fill=clamp((age-delay)/.22);
        this._piece(3,s.x,s.z,axis,-r*.58,r*.62,w*(1-i*.18),w*(.26+i*.20),0,
          (i-.5)*w*.76,0,i*2.8,alpha*(spent?.58:.91),spent?1:fill,cutoff+(i*.11),spent?.24:.8);
      }
      // The working seam crosses the deposited area; its cooling trail is separate.
      const scan=reduced?.44:(Math.sin(flowTime*3.1+seed)*.5+.5);
      this._piece(5,s.x,s.z,axis,-r*.5+scan*r*.35,r*.1+scan*r*.35,w*.43,w*.32,w*.42,
        (scan-.5)*w*.9,0,seed,alpha*(spent?.32:1),feed,cutoff,grind?1.6:1.05);
      if(grind||harvest)for(let i=0;i<2;i++){
        const travel=reduced?.35:1-Math.exp(-motion*(3.2+i*.7));
        this._piece(4,s.x,s.z,a+(i-.5)*.68,-.42,.42,w*.63,w*.8,0,0,r*(.45+travel*(1.5+i*.32)),
          i*2.7,alpha*.82,feed,cutoff,1.2);
      }
      this._matter(s,age,reduced,grind?'heat':harvest?'repulsor':spent?'current':'repair',a,r*(harvest?2.4:1.25));
    }else if(family==='pressure'){
      // Separate bowed fronts cross different distances. No shared radial scale.
      for(let i=0;i<3;i++){
        const delay=i*.062,dt=Math.max(0,flowTime-delay),distance=r*(.28+(1-Math.exp(-dt*(4.5-i*.7)))*(1.8+i*.48));
        const admitted=smooth((age-delay)/.065),shed=clamp((progress-.48-i*.05)/.42);
        this._piece(4,s.x,s.z,a+(i-1)*.34,-.68+i*.09,.74-i*.08,
          w*(1-i*.15),w*(1.18-i*.18),0,0,distance,seed+i*2.4,alpha*admitted,1,shed*.95-.1,1.28-i*.18);
      }
      this._piece(1,s.x,s.z,a+Math.PI,0,r*1.15,w*.70,w*.50,w*.40,0,0,seed+2,
        alpha*.66,feed,cutoff,.72);
      this._matter(s,age,reduced,verb==='combo'?'heat':'cone',a,r*3.4);
    }else if(family==='induction'){
      // A main loaded bridge separates into three independently timed forks.
      const length=r*1.45,breakup=verb==='disrupt'?smooth((progress-.25)/.55):smooth((progress-.56)/.4);
      this._piece(5,s.x,s.z,a,-r*.45,length,w*.58,w*.48,w*.50,0,0,seed,
        alpha,feed,breakup*.8-.1,1.1);
      for(let i=0;i<3;i++){
        const at=.22+i*.23,side=i%2?-1:1;
        const x=s.x+Math.cos(a)*length*at,z=s.z+Math.sin(a)*length*at;
        const local=smooth((age-.045-i*.04)/.08);
        this._piece(5,x,z,a+side*(.56+i*.14),0,r*(.68+i*.19),w*(.53-i*.07),w*.40,
          side*w*.60,side*breakup*w,0,seed+i*1.91,alpha*local,1,breakup*(.85+i*.08)-.1,1.18);
      }
      this._piece(3,s.x,s.z,a,-w,w,w*.70,w*.36,0,0,0,seed+2,alpha*.68,feed,cutoff,.36);
      this._matter(s,age,reduced,'current',a,r*2.2);
    }else if(family==='capture'){
      const locked=verb==='arm'||verb==='prime',catching=verb==='catch';
      // Opposed load-bearing hooks arrive separately, close and unload tangentially.
      for(let i=0;i<3;i++){
        const heading=a+(i-1)*(catching?.58:2.08),arrived=smooth((age-i*.045)/.16);
        const load=reduced?.65:1-arrived;
        const shear=reduced?0:smooth((progress-.57-i*.035)/.38);
        const distance=r*(.56+load*.42),x=s.x+Math.cos(heading)*distance,z=s.z+Math.sin(heading)*distance;
        this._piece(6,x,z,heading+Math.PI/2,-r*.48,r*.38,w*.58,w*.56,w*.83,
          shear*w*(i-1),0,seed+i*1.7,alpha*arrived,1,cutoff+i*.065,locked?.92:.72);
      }
      // Inward-curving material bridges only emerge once jaws have taken the load.
      const meet=smooth((age-.14)/.16);
      for(let i=0;i<2;i++)this._piece(1,s.x,s.z,a+(i?1:-1)*.60,-r*.72,r*.38,
        w*.75,w*.52,w*(i?1:-1),0,0,seed+i*2,alpha*meet*.83,1,cutoff,.95);
      this._matter(s,age,reduced,locked?'seed':'well',a,r*1.45);
    }
  }
}

/** Retain exactly the runtime action program during the existing renderer cook. */
export function createActionPrimitivePrecompileMesh(){
  const batch=new SweptSurfaceBatch(null,{capacity:1,name:'SF_Precompile_ActionMatter',fieldVolume:true});
  const composer=new ActionPrimitiveComposer(batch,null);
  const slot={x:0,y:0,z:0,sx:0,sz:0,born:0,last:0,angle:0,radius:5,seed:.3,particlePulse:-1,
    recipe:{verb:'vent',primitive:'compression',life:1,continuous:false,color:{r:.8,g:.4,b:.1}}};
  batch.begin(.02);composer.render(slot,.02);batch.end();
  batch.mesh.userData.precompileRetainedPipeline='action-primitives';
  return batch.mesh;
}
