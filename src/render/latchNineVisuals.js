import {LATCH_GEOMETRY as G} from '../data/latchNineGeometry.js';
import {isLatchActor,LATCH_PLACE_FILE,latchPlaceTransform} from '../data/latchNineIdentity.js';
import {readLatchNative} from '../core/latchNineNative.js';
import {latchPropulsionFrameForEntity,latchPropulsionState} from '../systems/latchNinePropulsion.js';
import {cloneMaterialPreservingShaderHooks} from './materialClone.js';
export {isLatchActor,LATCH_PLACE_FILE,latchPlaceTransform};
const bindings=new WeakMap();
function inside(node,root){for(let n=node;n;n=n.parent){if(n.visible===false)return false;if(n===root)return true;}return false;}
function active(entity){const state=latchPropulsionState(entity);for(const b of bindings.get(entity)||[]){if(b.retired||b.life!==entity.occupantGeneration||!inside(b.root,entity.mesh))continue;let top=b.root,visible=true;while(top){if(top.visible===false)visible=false;if(!top.parent)break;top=top.parent;}if(!visible)continue;if(!state?.render?.scene||top!==state.render.scene)continue;return b;}return null;}
function sourceMatches(root){const source=root?.userData?.latchNineAuthoredSource;return source?.assetId==='SF_PLACE_LATCH_NINE'&&typeof source.file==='string'&&source.file.replace(/^.*assets\/ships\/(?:release\/)?parts\//,'')===LATCH_PLACE_FILE;}
export function createLatchNineVisualDriver(root,entity){
 if(!isLatchActor(entity)||!sourceMatches(root))return null;
 const nodes=new Map();root.traverse(n=>nodes.set(n.name,n));
 const rigs=G.paddles.map(p=>({node:nodes.get('MOTION_LATCH_PADDLE_'+p.id.toUpperCase()),p}));
 const samples=G.thrusters.map(t=>({channel:t,socket:nodes.get(t.node),meshes:[],materials:[],level:0}));
 for(const sample of samples)for(const node of nodes.values())if(node.isMesh&&node.name.includes('HOOK_LATCH_THRUSTER_'+sample.channel.id+'_'))sample.meshes.push(node);
 if(rigs.some(r=>!r.node)||samples.some(s=>!s.socket||s.meshes.length!==3))throw Error('Latch canonical asset lacks its complete source rig/nozzle groups: '+JSON.stringify({paddles:rigs.map(r=>!!r.node),thrusters:samples.map(s=>({id:s.channel.id,socket:!!s.socket,meshes:s.meshes.length}))}));
 for(const rig of rigs)rig.rest=rig.node.quaternion.clone();
 const originalMaterials=new Map();
 for(const sample of samples){const clones=new Map();for(const node of sample.meshes){originalMaterials.set(node,node.material);const clone=source=>{if(clones.has(source))return clones.get(source);const material=cloneMaterialPreservingShaderHooks(source),maximum=source.userData?.latchMaximum??source.emissiveIntensity??1;material.userData={...material.userData,spacefaceSharedAsset:false,latchMaximum:maximum};material.emissiveIntensity=0;sample.materials.push({material,maximum});clones.set(source,material);return material;};node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);}}
 const identity={id:entity.id,life:entity.occupantGeneration};let owner=entity,registered=false,retired=false,set=null;
 const binding={entity,root,life:identity.life,samples,retired:false};
 const activate=live=>{if(retired||!live||live.id!==identity.id||live.occupantGeneration!==identity.life||!isLatchActor(live)||!inside(root,live.mesh))return false;if(registered)return live===owner;owner=live;binding.entity=live;set=bindings.get(live);if(!set)bindings.set(live,set=new Set());set.add(binding);registered=true;return true;};
 const clear=()=>{for(const sample of samples){sample.level=0;for(const {material} of sample.materials)material.emissiveIntensity=0;}};
 const nativeScratch={angles:[0,0,0],blocked:[false,false,false],controlForce:{},controlTorque:{}};
 const update=(live,a11y)=>{if(!registered&&entity.deferAuthoredMotionRegistration!==true)activate(live);const valid=live===owner&&active(owner)===binding;const native=valid?readLatchNative(owner,nativeScratch):null,frame=valid?latchPropulsionFrameForEntity(owner):null;
  for(let i=0;i<rigs.length;i++){const r=rigs[i],angle=native?.angles[i]||0;r.node.quaternion.copy(r.rest);r.node.rotateY(-angle);r.node.updateMatrix();}
  for(let i=0;i<samples.length;i++){const sample=samples[i];sample.level=frame?.thrusters[i]?.fraction||0;for(const {material,maximum} of sample.materials)material.emissiveIntensity=maximum*sample.level*(a11y?.reducedFlash?.valueOf()? .55:1);}
 };
 return {activate,update,motionPadSpec:[{nodes:rigs.map(r=>r.node),chordFactor:0,tMax:Math.max(...G.paddles.map(p=>Math.hypot(p.width/2,p.length)-p.length))+.05}],dispose(){if(retired)return;clear();retired=true;binding.retired=true;set?.delete(binding);if(set&&!set.size)bindings.delete(owner);for(const [node,material] of originalMaterials)node.material=material;for(const sample of samples)for(const {material} of sample.materials)material.dispose();originalMaterials.clear();},binding};
}
export function latchNinePropulsionAwake(state){for(const entity of state?.entities?.values()||[])if(isLatchActor(entity)&&active(entity)&&latchPropulsionFrameForEntity(entity)?.thrusters.some(t=>t.fraction>0))return true;return false;}
export function createLatchNinePlumeBatch(plume,Vector3){
 const slots=G.thrusters.map(channel=>({channel,position:new Vector3(),axis:new Vector3(),sockets:[{x:0,y:0,z:0,ax:0,ay:0,az:0}],driveState:{plumeDrive:0,boostBlend:0,ignition:0},signals:{entityId:'latch:'+channel.id,throttle:0,boost:0,speedDrive:0}}));
 return {plume,slots,reset(){for(const slot of slots)slot.driveState.plumeDrive=slot.signals.throttle=0;plume.reset();},update(state,dt,a11y){plume.beginUpdate(a11y);let count=0;for(const entity of state.entities.values()){
  if(!isLatchActor(entity))continue;const binding=active(entity),frame=latchPropulsionFrameForEntity(entity);if(!binding||!frame)continue;
  for(let i=0;i<slots.length;i++){const slot=slots[i],sample=binding.samples[i],level=frame.thrusters[i].fraction;slot.driveState.plumeDrive=slot.signals.throttle=level;if(!(level>0)||!sample.meshes.some(m=>inside(m,entity.mesh)&&m.visible))continue;
   sample.socket.getWorldPosition(slot.position);slot.axis.fromArray(slot.channel.exhaust).transformDirection(sample.socket.parent.matrixWorld);const out=slot.sockets[0];out.x=slot.position.x;out.y=slot.position.y;out.z=slot.position.z;out.ax=-slot.axis.x;out.ay=-slot.axis.y;out.az=-slot.axis.z;
   const first=plume.pool.activeCount;plume.writeEntity(dt,level,slot.sockets,slot.signals,slot.driveState,1);const lip=i<2?.58:.083,g=plume.pool.recipe.geometry;for(let j=first;j<plume.pool.activeCount;j++){plume.pool.slots[j].width*=2*lip/g.baseWidth;plume.pool.slots[j].length*=9*lip/g.baseLength;}count++;
  }
 }plume.endUpdate(a11y?.reducedMotion?0:dt);return count;},dispose(){this.reset();plume.group?.removeFromParent();plume.dispose();}};
}

export function latchNineCatalogRow(isPublished){
 const box=(id,center,size)=>({id,center:{x:center[0],y:center[1],z:center[2]},size:{x:size[0],y:size[1],z:size[2]}});
 return {id:'place_latch_nine',assetId:'SF_PLACE_LATCH_NINE',family:'latch-nine',file:LATCH_PLACE_FILE,fit:'authored-origin',placeScale:1,entityRadius:13,colliderKind:'compound',colliderId:'latch-nine:reconstructed-v1',compoundBoxesWU:[...G.staticSlabs.map(p=>box(p.id,p.center,p.size)),...G.paddles.map(p=>box('paddle-'+p.id,[p.pivot[0],p.pivot[1],p.pivot[2]+(p.length-.2)/2],[p.width,p.thickness,p.length+.2]))],solid:true,packagedLive:isPublished(LATCH_PLACE_FILE),referenceState:'rest'};
}
