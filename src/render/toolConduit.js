// Closed transported channels, curved work faces and source lips share two resident draws.
// Fixed topology and analytic materials: no camera-facing cards or per-frame vertex uploads.
import { BufferGeometry, Float32BufferAttribute } from 'three';

export function createToolConduitGeometry() {
  const positions = [], uvs = [], strands = [], kinds = [], index = [];
  for (let member = 0; member < 11; member++) {
    const kind = member < 3 ? 0 : member < 9 ? 1 : 2;
    const strand = member < 3 ? member : member < 9 ? member - 3 : member - 9;
    const stations = kind === 0 ? 48 : 20, across = kind === 0 ? 13 : 9;
    const base = positions.length / 3;
    for (let s = 0; s <= stations; s++) {
      for (let k = 0; k < across; k++) {
        positions.push(0, 0, 0); uvs.push(s / stations, k / (across - 1)); strands.push(strand); kinds.push(kind);
      }
      if (s < stations) for (let k = 0; k < across - 1; k++) {
        const a = base + s * across + k;
        index.push(a, a + 1, a + across, a + 1, a + across + 1, a + across);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aConduitStrand', new Float32BufferAttribute(strands, 1));
  geometry.setAttribute('aConduitKind', new Float32BufferAttribute(kinds, 1));
  geometry.setIndex(index);
  return geometry;
}

export function installToolConduitShader(material, shared, role) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uSfBeamTime: shared.time, uSfBeamFlow: shared.flow, uSfBeamPower: shared.power,
      uSfBeamStart: shared.start, uSfBeamEnd: shared.end,
      uSfBeamRadius: role === 'core' ? shared.coreRadius : shared.sheathRadius,
      uSfBeamMotion: shared.motion,
      uSfBeamVerb: shared.verb, uSfBeamStop: shared.stop, uSfBeamSeed: shared.seed,
      uSfBeamContact: shared.contactRadius, uSfBeamTarget: shared.targetRadius,
    });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float aConduitStrand, aConduitKind;
      varying vec2 vSfBeam; varying vec3 vSfMember; varying float vSfFacing;
      uniform vec3 uSfBeamStart, uSfBeamEnd;
      uniform float uSfBeamTime,uSfBeamMotion,uSfBeamVerb,uSfBeamRadius,uSfBeamFlow;
      uniform float uSfBeamContact,uSfBeamTarget,uSfBeamSeed;
    `).replace('#include <begin_vertex>', `
      float t=uv.x,v=uv.y*2.0-1.0,id=aConduitStrand,kind=aConduitKind;
      float time=uSfBeamTime*uSfBeamMotion,seed=uSfBeamSeed;
      vec3 axis=normalize(uSfBeamEnd-uSfBeamStart+vec3(.00001));
      vec3 side=normalize(cross(axis,vec3(0.0,1.0,0.0))),up=cross(side,axis);
      float belly=sin(t*3.14159265),phase=id*2.0944+seed;
      vec3 transformed,normal;
      if(kind<.5){
        // Closed loaded cross-sections: neither radius nor deformation is a global on/off scale.
        float winding=clamp(length(uSfBeamEnd-uSfBeamStart)*.065,3.0,10.0);
        phase+=t*winding-time*uSfBeamFlow*(1.9+id*.23)+belly*.42*sin(t*8.0-time*2.6+id);
        float spread=uSfBeamRadius*(.16+.72*belly),thickness=uSfBeamRadius*(.24+.13*belly);
        if(uSfBeamVerb>.5&&uSfBeamVerb<1.5){phase=id*2.0944+.10*sin(t*15.0-time*6.0);spread*=.27;thickness*=1.25;}
        if(uSfBeamVerb>1.5&&uSfBeamVerb<2.5){phase=id*2.0944+t*2.8+sin(time*.9+id)*.25;spread*=.5+t*.9;}
        float section=v*3.14159265;
        vec3 radial=side*cos(phase)+up*sin(phase),tangent=side*-sin(phase)+up*cos(phase);
        normal=radial*cos(section)+tangent*sin(section);
        transformed=mix(uSfBeamStart,uSfBeamEnd,t)+radial*spread
          +normal*thickness*(.85+.15*sin(t*13.0-time*3.7+id));
      }else if(kind<1.5){
        // Work faces meet the actual curved receiving surface. Unequal members lay, vent or peel.
        float reach=uSfBeamContact*(.60+id*.075),a=(t-.5)*2.1+(id-2.5)*.18;
        float lateral=(t-.5)*reach*2.0,height=.35+sin(t*3.14159265)*reach*.22+v*reach*.16;
        float outflow=.5+.5*sin(t*7.0-time*(2.1+id*.18)+id+seed);
        float depth=.35+sin(t*3.14159265)*reach*(.12+outflow*.22);
        if(uSfBeamVerb<.5){depth+=reach*.32*sin(t*3.14159265);height+=sin(a+time*.7)*reach*.15;}
        else if(uSfBeamVerb<1.5){lateral*=.72;height+=id*.18;depth+=t*t*reach*.48;}
        else if(uSfBeamVerb<2.5){lateral+=(id-2.5)*reach*.14;depth*=.35;height+=(id-2.5)*reach*.085;}
        else{lateral=cos(a+id*1.0472)*reach*.6;height+=sin(a+id*1.0472)*reach*.45;depth+=reach*.2;}
        float curvature=lateral*lateral/(2.0*max(2.0,uSfBeamTarget));
        transformed=uSfBeamEnd+side*lateral+up*height-axis*(depth+curvature);
        normal=normalize(-axis+up*.6+side*sin(a)*.45);
      }else{
        float angle=mix(-1.15,1.15,t)+id*3.14159;
        vec3 radial=side*cos(angle)+up*sin(angle);
        transformed=uSfBeamStart+axis*(.4+v*.6)+radial*uSfBeamRadius*(.60+.18*sin(t*3.14159));normal=radial;
      }
      vSfBeam=uv;vSfMember=vec3(kind,id,seed);
      vSfFacing=.28+.72*abs(dot(normal,normalize(cameraPosition-transformed)));
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vSfBeam;varying vec3 vSfMember;varying float vSfFacing;
      uniform float uSfBeamTime,uSfBeamFlow,uSfBeamPower,uSfBeamMotion,uSfBeamVerb,uSfBeamStop;
      float sfWave(float p){return mix(.5,.5+.5*sin(p),1.0-smoothstep(.8,3.14,fwidth(p)));}
      float sfBand(float d,float w){float p=fwidth(d),f=sqrt(w*w+p*p*.65);return exp(-d*d/(f*f))*w/f;}
    `).replace('#include <color_fragment>', `#include <color_fragment>
      float t=vSfBeam.x,v=vSfBeam.y*2.0-1.0,kind=vSfMember.x,id=vSfMember.y;
      float time=uSfBeamTime*uSfBeamMotion,seed=vSfMember.z;
      float travel=uSfBeamFlow>0.0?t:1.0-t;
      float delay=kind<.5?travel*.13+id*.012:kind<1.5?.13+id*.021:.015*id;
      float arrival=smoothstep(delay,delay+.045,uSfBeamTime);
      float stopAge=uSfBeamStop<0.0?0.0:max(0.0,uSfBeamTime-uSfBeamStop-delay);
      float cooling=1.0-smoothstep(kind<.5?.015:.10,kind<.5?.20:.59+id*.024,stopAge);
      float packet=sfWave(t*21.0-time*uSfBeamFlow*(7.0+id*.45)+seed+id*2.1);
      float fold=sfBand(v-.42*sin(t*5.0-time*1.7+id),.26),crest=pow(packet,3.0)*fold;
      float body=.20+.34*sfWave(t*11.0-time*2.3+v*4.0+seed),edge=1.0;
      if(kind>.5){edge=(1.0-smoothstep(.66,1.0,abs(v)))*sin(t*3.14159265);
        crest=sfBand(t-fract(time*(.50+id*.037)+id*.163),.13)*(.4+.6*fold);body*=.55;}
      if(uSfBeamVerb>.5&&uSfBeamVerb<1.5&&kind<.5){
        // The cutter keeps a coherent core, but its three channels must not add
        // into one featureless white bar. Charge travels through separated seats.
        packet=sfWave(t*15.0-time*(8.0+id*.37)+id*1.4+seed);
        body=.13+.08*packet;
        crest=.045+sfBand(v-.30*sin(t*8.0-time*2.8+id),.21)*pow(packet,4.0);
      }
      float heat=arrival*cooling*uSfBeamPower;
      vec3 tint=mix(diffuseColor.rgb*vec3(.34,.26,.42),diffuseColor.rgb,sqrt(cooling));
      diffuseColor.rgb=tint*(body+crest*${role === 'core' ? '5.2' : '2.2'})*vSfFacing*heat;
      diffuseColor.rgb+=vec3(1.0,.84,.57)*pow(crest,3.0)*${role === 'core' ? '.52' : '.10'}*heat;
      diffuseColor.a*=edge*(.24+packet*.45+crest*.25)*arrival*cooling;
    `);
  };
  material.customProgramCacheKey = () => `sf-tool-work-surface-v5-${role}`;
}
