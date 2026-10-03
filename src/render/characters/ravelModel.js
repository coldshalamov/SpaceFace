// Original authored-native alien mechanism. This is the primary asset, not a missing-GLB
// fallback. The same mesh and choreography are used by visualFactory and the playable bench.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAVEL as C } from '../../data/ravel.js';
const TAU=Math.PI*2, sat=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=sat(x);return x*x*(3-2*x);};
function materials(){
 const m={
  shell:new THREE.MeshPhysicalMaterial({color:0xd1c2a4,metalness:0.24,roughness:0.43,clearcoat:0.3}),
  dark:new THREE.MeshStandardMaterial({color:0x16252b,metalness:0.77,roughness:0.34}),
  cut:new THREE.MeshStandardMaterial({color:0x080f16,metalness:0.42,roughness:0.63}),
  brass:new THREE.MeshStandardMaterial({color:0x927d51,metalness:0.84,roughness:0.34}),
  wine:new THREE.MeshStandardMaterial({color:0x634247,metalness:0.33,roughness:0.55}),
  light:new THREE.MeshStandardMaterial({color:0x99e9da,emissive:0x70ffdb,emissiveIntensity:1.25,roughness:0.26,metalness:0.3}),
  core:new THREE.MeshPhysicalMaterial({color:0xdbd1ff,emissive:0x9c7bff,emissiveIntensity:1.3,roughness:0.22,metalness:0.44,clearcoat:0.6}),
 };
 for(const [k,v]of Object.entries(m))v.name=`RAVEL_${k}`;return m;
}
function add(parent,g,m,name,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.name=name;o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
function slab(points,depth=1,bevel=.3){
 const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:6}).rotateX(-Math.PI/2);
}
function sector(inner,outer,a0,a1,height=1,steps=12){
 const p=[];for(let i=0;i<=steps;i++){const a=a0+(a1-a0)*i/steps;p.push([Math.cos(a)*outer,Math.sin(a)*outer]);}
 for(let i=steps;i>=0;i--){const a=a0+(a1-a0)*i/steps;p.push([Math.cos(a)*inner,Math.sin(a)*inner]);}return slab(p,height,.14);
}
function tube(parent,points,r,mat,name){return add(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,6,false),mat,name);}
function rigid(group){
 group.updateMatrixWorld(true);const byMat=new Map(),old=new Set();
 for(const child of [...group.children]){if(!child.isMesh)continue;child.updateMatrix();
  const g=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();g.applyMatrix4(child.matrix);g.clearGroups();
  if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(!byMat.has(child.material))byMat.set(child.material,[]);byMat.get(child.material).push(g);old.add(child.geometry);group.remove(child);}
 for(const [m,gs]of byMat){const g=mergeGeometries(gs,false);if(!g)throw new Error('RAVEL rigid geometry schema mismatch');add(group,g,m,`${group.name}:${m.name}`);gs.forEach(g=>g.dispose());}old.forEach(g=>g.dispose());
}
function forceMaterial(mode){return new THREE.ShaderMaterial({name:`RAVEL_force_${mode}`,transparent:true,depthWrite:false,side:THREE.DoubleSide,
 uniforms:{uTime:{value:0},uPower:{value:.4},uQuiet:{value:0},uRadius:{value:1},uOpacity:{value:1},uCast:{value:mode==='wave'?1:0}},
 vertexShader:`varying vec2 vUv;uniform float uTime,uQuiet,uRadius,uCast;void main(){vUv=uv;vec3 p=position;
  if(uCast>.5){float a=position.x;float r=uRadius+(uv.y-.5)*14.;p=vec3(cos(a)*r,sin(uv.y*3.14159)*8.,sin(a)*r);
  p.y+=sin(uv.x*18.-uTime*(1.-uQuiet)*3.)*sin(uv.y*3.14159)*2.5;}
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`varying vec2 vUv;uniform float uTime,uPower,uQuiet,uOpacity,uCast;
  void main(){float edge=sin(vUv.y*3.14159);float run=vUv.x*9.-uTime*(1.-uQuiet)*.7;
   float channel=.5+.5*sin(run*6.28318+vUv.y*4.);float crest=pow(max(0.,1.-abs(vUv.y-.54)*8.),2.);
   float cut=smoothstep(.04,.18,fract(vUv.x*5.+.13));
   vec3 cold=vec3(.035,.23,.22);vec3 hot=mix(vec3(.28,.95,.79),vec3(1.,.36,.19),uCast);
   vec3 col=mix(cold,hot,crest*.8+channel*.14)*(1.+uPower*.7);
   float alpha=edge*cut*(.18+crest*.56+uPower*.12)*uOpacity;
   gl_FragColor=vec4(col,alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`,});}
function sheetGeometry(n=48){const p=[],uv=[],ix=[];for(let i=0;i<=n;i++)for(let j=0;j<5;j++){
 p.push(-C.waveHalfAngle+2*C.waveHalfAngle*i/n,0,0);uv.push(i/n,j/4);if(i<n&&j<4){const k=i*5+j;ix.push(k,k+5,k+1,k+1,k+5,k+6);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;}
function ribbonGeometry(){const p=new Float32Array(33*2*3),uv=new Float32Array(33*2*2),ix=[];
 for(let i=0;i<=32;i++)for(let j=0;j<2;j++){const k=i*2+j;uv[k*2]=i/32;uv[k*2+1]=j;if(i<32&&j===0)ix.push(k,k+2,k+1,k+1,k+2,k+3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(ix);return g;}
function updateRibbon(mesh,x,z,t,power,reduce){
 const a=mesh.geometry.attributes.position,dx=x,dz=z,len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len;
 for(let i=0;i<=32;i++){const u=i/32,arch=Math.sin(u*Math.PI),curl=reduce?0:Math.sin(u*7-t*1.2)*arch*2.4;
  for(let j=0;j<2;j++){const w=(j-.5)*(2.0+power*4)*arch;
   a.setXYZ(i*2+j,dx*u+nx*(curl+w),1+arch*(3+power*8)+w*.5,dz*u+nz*(curl+w));}}
 a.needsUpdate=true;mesh.geometry.computeBoundingSphere();
}
function buildSpool(e){
 const root=new THREE.Group();root.name=`RAVEL_counterweight_${e.data?.ravelIndex??0}`;const m=materials();
 const body=new THREE.Group();body.name='counterweight_load_frame';root.add(body);
 // A forked shuttle, not a sphere: two blunt cheeks protect an exposed luminous spool axle.
 const cheek=[[-4.2,-3.8],[-1,-5.3],[3.5,-4.8],[5.2,-1.1],[4.2,3.8],[1.4,5.1],[-2.8,4.0],[-1.5,1.1],[-2,-1.4]];
 add(body,slab(cheek,1.2,.3),m.shell,'upper_shuttle_cheek',0,1.1,0);
 const lower=add(body,slab(cheek,1.1,.3),m.dark,'lower_shuttle_cheek',0,-2.6,0);lower.rotation.y=Math.PI;
 const axle=add(body,new THREE.CylinderGeometry(2,2,5.2,12),m.brass,'load_spindle');axle.rotation.z=Math.PI/2;
 for(let i=0;i<4;i++){const g=new THREE.TorusGeometry(2.2,.24,6,20);g.rotateY(Math.PI/2);add(body,g,i===1?m.light:m.dark,'spool_winding',-1.7+i*1.1,0,0);}
 for(const sign of [-1,1]){add(body,new THREE.BoxGeometry(2,1.2,4.3),m.wine,'sacrificial_heel',sign*3.2,.2,.2);
  add(body,new THREE.BoxGeometry(.3,.12,2.8),m.light,'edge_insert',sign*3.3,2.5,0);}
 // One/two/three inset marks make the counterweights distinguishable without color.
 for(let i=0;i<=(e.data?.ravelIndex??0);i++)add(body,new THREE.BoxGeometry(1.5,.12,.28),m.dark,'identity_notch',.2,2.65,-2.3+i*.8);
 rigid(body);
 root.userData.ravelParts={body};root.userData.updateAuthoredMotion=(entity,time,a11y={})=>{
  const p=entity?.data?.ravelPose||{},t=Number.isFinite(p.simTime)?p.simTime:time||0;
  body.rotation.x=a11y.reducedMotion?0:Math.sin(t*.7+(entity.data.ravelIndex||0))*.13;
  body.rotation.y=a11y.reducedMotion?0:t*.18;
  m.light.emissiveIntensity=p.loose?.5:(a11y.reducedFlash?1:1.4+(p.charge||0));
  m.light.color.setHex(p.loose?0xd9bea0:0x99e9da);m.light.emissive.setHex(p.loose?0xc59a55:0x70ffdb);
 };return finish(root,e);
}
export function buildRavelVisual(e={data:{ravelPart:'core',ravelPose:{}}}){
 if(e.data?.ravelPart==='spool')return buildSpool(e);
 const root=new THREE.Group();root.name='RAVEL_the_unraveller';const m=materials();
 const frame=new THREE.Group();frame.name='moon_loom_load_frame';root.add(frame);
 const profile=[[0,-7],[3,-7],[7,-4.7],[9,-1],[8.5,2],[7,3],[6.7,2.3],[7.2,-.3],[5.6,-3.5],[2,-5.5],[0,-5.5]];
 add(frame,new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),32),m.dark,'hollow_housing');
 // Radial load struts grow from a dense recessed machine, not disconnected ornament.
 for(let i=0;i<3;i++){
  const a=i*TAU/3,arm=new THREE.Group();arm.rotation.y=-a;arm.name=`fixed_load_arch_${i}`;frame.add(arm);
  tube(arm,[[5,-2,0],[10,-4,0],[17,-2,-2],[20,1,-4]],1.05,m.dark,'compression_arch');
  tube(arm,[[6,0,1.5],[11,-1,1.5],[17,1,-.5]],.32,m.brass,'return_conduit');
  add(arm,slab([[7,-3],[14,-5],[22,-4],[25,-1],[22,3],[15,5],[10,3]],1.4,.45),m.dark,'arm_underframe',0,-2,0);
  for(let k=0;k<4;k++)add(arm,new THREE.BoxGeometry(.65,1.8,5.2-k*.45),m.brass,'heat_lamella',10+k*1.5,-1,0);
  add(arm,sector(18.5,22.2,-.23,.26,1),m.wine,'joint_gasket',0,-.3,0);rigid(arm);
 }
 // Deliberate fourth socket: a sheared stump, visibly unpaired even before its quiet-time story.
 const scar=new THREE.Group();scar.name='missing_fourth_weight_socket';scar.rotation.y=-Math.PI/3;frame.add(scar);
 add(scar,slab([[7,-2],[13,-2],[16,-.9],[12,.1],[15,1.1],[10,2],[7,1]],1.5,.15),m.brass,'fracture_tooth',0,0,0);
 tube(scar,[[7,1,1],[10,3,1],[13,2,.5]],.2,m.wine,'cut_return_line');rigid(scar);
 // Core architecture: deeply dark turbine vanes around a hot faceted spindle.
 const spindle=new THREE.Group();spindle.name='ANIM_spindle';root.add(spindle);
 add(spindle,new THREE.OctahedronGeometry(5.9,0),m.core,'exposed_mnemonic_crystal',0,3.8,0);
 for(let i=0;i<6;i++){
  const a=i*TAU/6;
  tube(spindle,[[Math.cos(a)*3,-2,Math.sin(a)*3],[Math.cos(a+.22)*6,2,Math.sin(a+.22)*6],
    [Math.cos(a+.35)*3.2,9.5,Math.sin(a+.35)*3.2]],.32,m.brass,'spindle_cage_rib');
 }
 rigid(spindle);
 const jaws=[];
 for(let i=0;i<3;i++){
  const pivot=new THREE.Group();pivot.name=`ANIM_hook_${i}`;pivot.rotation.y=-i*TAU/3;root.add(pivot);jaws.push(pivot);
  const arm=new THREE.Group();arm.name=`carved_hook_${i}`;pivot.add(arm);
  const outline=[[7,-3],[13,-6],[21,-5.2],[27,-1.8],[29,2],[26,6],[22,8],[22.4,4],[20,1.5],[13,2],[8,1.3]];
  add(arm,slab(outline,1.8,.5),i===1?m.wine:m.shell,'swept_ceramic_guard',0,2.0,0);
  // Guard surface is y=4.3 including bevel: keep every detail above it.
  add(arm,slab([[10,-3.6],[15,-4.5],[22,-3.5],[25,-1.6],[21,-1.8],[15,-2.4]],.2,.08),m.dark,'recessed_guard_channel',0,4.42,0);
  add(arm,slab([[11,-2.7],[16,-3.2],[21,-2.6],[22,-2.1],[16,-2.5]],.1,.04),m.light,'loaded_inlay',0,4.78,0);
  add(arm,slab([[23.5,0],[27,2],[25,5],[23.5,5],[25,2]],.55,.15),m.brass,'worn_gripping_tip',0,4.46,0);
  for(let k=0;k<4;k++)add(arm,new THREE.BoxGeometry(.28,.2,1.5),m.brass,'guard_stitches',10+k*2.5,4.46,.4);
  add(arm,new THREE.CylinderGeometry(1.55,1.7,1.5,12),m.dark,'joint_well',9,2,-.7);
  add(arm,new THREE.CylinderGeometry(.8,.8,.22,12),m.brass,'joint_lock',9,4.45,-.7);rigid(arm);
 }
 const lids=[];
 for(let i=0;i<3;i++){
  const pivot=new THREE.Group();pivot.name=`ANIM_spindle_shutter_${i}`;pivot.rotation.y=-i*TAU/3;root.add(pivot);lids.push(pivot);
  add(pivot,slab([[1,-.7],[6,-3.8],[10,-2],[8,1.8],[5,3.4]],.8,.26),m.shell,'overlapping_iris_leaf',0,8.8,0);
  add(pivot,slab([[3,.2],[6,-1],[7.8,-.5],[5.7,.1]],.10,.06),m.dark,'iris_recess',0,9.95,0);rigid(pivot);
 }
 // Extract radius: twelve physical-looking broken teeth, not an opaque screen disc.
 const marks=new THREE.Group();marks.name='Ravel_extraction_boundary';root.add(marks);
 const markMaterial=new THREE.MeshBasicMaterial({color:0x79d3bf,transparent:true,opacity:.46,depthWrite:false});
 for(let i=0;i<18;i++){
  const a=i*TAU/18,g=sector(C.freeRadius-1,C.freeRadius+1,a-.018,a+.018,.15,2);
  add(marks,g,markMaterial,'extraction_tooth',0,-3,0);
 }rigid(marks);
 // Aim rails terminate at the real maximum reach. They lock to the attack sample, never to camera.
 const telegraph=new THREE.Group();telegraph.name='Ravel_locked_cast_lane';root.add(telegraph);
 const tellMaterial=new THREE.MeshBasicMaterial({color:0xed9a71,transparent:true,opacity:.45,depthWrite:false,side:THREE.DoubleSide});
 const reach=C.waveStart+C.cast*C.waveSpeed;
 for(const sign of [-1,1]){
  const a=sign*C.waveHalfAngle;
  add(telegraph,slab([[Math.cos(a)*28,Math.sin(a)*28],[Math.cos(a)*(reach),Math.sin(a)*reach],
   [Math.cos(a)*(reach)-Math.sin(a)*sign*1.4,Math.sin(a)*reach+Math.cos(a)*sign*1.4],
   [Math.cos(a)*28-Math.sin(a)*sign*1.4,Math.sin(a)*28+Math.cos(a)*sign*1.4]],.2,.05),tellMaterial,'locked_cast_edge',0,-1,0);
 }
 for(let i=0;i<7;i++)add(telegraph,slab([[0,-4],[4,0],[0,4],[-1.4,3],[1.6,0],[-1.4,-3]],.1,0),tellMaterial,'cast_direction_chevron',42+i*28,-1,0);
 rigid(telegraph);
 const ribbonMat=forceMaterial('thread'),ribbons=[];
 for(let i=0;i<3;i++){const o=add(root,ribbonGeometry(),ribbonMat,`live_load_thread_${i}`);o.frustumCulled=false;o.castShadow=o.receiveShadow=false;ribbons.push(o);}
 const waveMat=forceMaterial('wave'),wave=add(root,sheetGeometry(),waveMat,'cast_pressure_crest');
 wave.castShadow=wave.receiveShadow=false;wave.frustumCulled=false;
 const quietNeedle=add(root,new THREE.ConeGeometry(.75,13,6),m.light,'the_empty_fourth_place',7,6,12);quietNeedle.rotation.z=.65;
 root.userData.ravelParts={jaws,lids,spindle,marks,telegraph,wave,ribbons,quietNeedle};
 let lastTime=null;
 root.userData.updateAuthoredMotion=(entity,time,a11y={})=>{
  const p=entity?.data?.ravelPose||{},t=Number.isFinite(p.simTime)?p.simTime:time||0;
  const reduce=!!a11y.reducedMotion,flash=!!a11y.reducedFlash,charge=sat(p.charge||0);
  const peace=p.phase==='peace',open=p.phase==='exposed'||peace,active=['windup','cast','exposed','recover'].includes(p.phase);
  const disabled=(p.freed||0)|(p.broken||0);
  const dt=lastTime===null?1:Math.max(0,Math.min(.1,t-lastTime));lastTime=t;
  const follow=(value,target)=>reduce?target:value+(target-value)*(1-Math.exp(-dt*10));
  for(let i=0;i<3;i++){
   const loose=!!(disabled&(1<<i));
   jaws[i].rotation.y=follow(jaws[i].rotation.y,-i*TAU/3+(loose?-.48:open?-.36:charge*.12));
   jaws[i].rotation.z=follow(jaws[i].rotation.z,loose?-.18:open?-.14:0);
   jaws[i].position.y=follow(jaws[i].position.y,loose?-2:0);
   lids[i].rotation.y=follow(lids[i].rotation.y,-i*TAU/3+(open?.72:.05));
   lids[i].position.y=follow(lids[i].position.y,open?1.5:0);
  }
  spindle.rotation.y=reduce?0:t*(peace?.075:.24);
  spindle.rotation.z=reduce?0:Math.sin(t*.17)*.09;
  m.core.emissiveIntensity=flash?(open?1.2:.5):(open?2.1:.65+charge*.55);
  m.light.emissiveIntensity=flash?.8:(peace?.75:1.2+charge*.7);
  marks.visible=active;markMaterial.opacity=.3+charge*.18;
  telegraph.visible=p.phase==='windup'||p.phase==='cast';telegraph.rotation.y=-(p.angle||0)+(entity.rot||0);
  tellMaterial.opacity=p.phase==='cast'?.2:.28+charge*.3;
  for(let i=0;i<3;i++){
   const point=p.points?.[i],o=ribbons[i];o.visible=!!point?.live&&!peace;
   if(o.visible)updateRibbon(o,point.x,point.z,t,charge,reduce);
  }
  ribbonMat.uniforms.uTime.value=t;ribbonMat.uniforms.uQuiet.value=reduce?1:0;ribbonMat.uniforms.uPower.value=flash?.3:charge;
  wave.visible=p.phase==='cast'&&p.waveRadius>0;
  wave.rotation.y=-(p.angle||0)+(entity.rot||0);
  waveMat.uniforms.uRadius.value=p.waveRadius||1;waveMat.uniforms.uTime.value=t;
  waveMat.uniforms.uQuiet.value=reduce?1:0;waveMat.uniforms.uPower.value=flash?.3:.9;
  waveMat.uniforms.uOpacity.value=(p.waveFade??1)*(flash?.55:1);
  quietNeedle.visible=peace&&p.quiet===true;
 };
 return finish(root,e);
}
function finish(root,e){
 root.userData.kind='drone';root.userData.animated=true;root.userData.ravel=true;
 root.userData.visualLanguage='ravel-alien-gravity-loom';root.userData.authoredAssetState='authored';root.userData.authoredVisualRoot='authored-root';
 root.userData.disposeRavel=()=>disposeRavelVisual(root);root.userData.updateAuthoredMotion(e,0,{});return root;
}
export function disposeRavelVisual(root){
 if(!root||root.userData.ravelDisposed)return;root.userData.ravelDisposed=true;
 const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);});
 gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());root.removeFromParent();
}
