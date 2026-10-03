// One exact authored workfleet. Ordinary tugs, cutters and wrecks keep their own identity.
import { CERES_WORKFLEET_CONTRACT as C } from '../data/ceresWorkfleet.js';
import { ceresWorkfleetSlide, ceresWorkfleetRigPose } from '../data/ceresWorkfleetArticulation.js';
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';
export const ceresWorkfleetRole=ceresWorkfleetRoleForEntity;
export function isCeresWorkfleetPlace(entity) {
  const role=ceresWorkfleetRole(entity);
  return role==='cradle'||role==='cutterHead';
}
export function ceresWorkfleetPlaceFile(entity) {
  const role=ceresWorkfleetRole(entity);
  return role && role!=='breaker'?C.assets[role].file:null;
}
export function ceresWorkfleetPlaceTransform(data) {
  const role=data?.ceresWorkfleetRole;
  return (role==='cradle'||role==='cutterHead') && data.worldRecordId===C.identities[role]
    && data.placeId===C.assets[role].id ? {scale:C.sourceScale,y:0}:null;
}
export const CERES_BREAKER_ASSET=C.assets.breaker.assetId;
export const CERES_BREAKER_FILE=C.assets.breaker.file;
export const CERES_WORKFLEET_SOURCE_SCALE=C.sourceScale;

// Ship assembly is radius-normalized; places instead consume sourceScale directly.
export const CERES_BREAKER_NORMALIZED_SCALE=C.sourceScale/C.assets.breaker.radius;

// Node names are the sealed bank interface. Positions and piston lengths come from
// the same physical contract as native contact shapes; no renderer-owned clock.
export function ceresWorkfleetVisualRigs(role) {
  const asset=C.assets[role];
  if (role!=='breaker' && role!=='cradle') return [];
  const breaker=role==='breaker', axis=breaker?'z':'x';
  const joints=breaker?asset.motion.shoes:asset.motion.pads;
  const prefix=breaker?'SHOE':'RETENTION', rigs=[];
  for (let i=0;i<2;i++) {
    const side=i===0?-1:1, label=i===0?'PORT':'STARBOARD', joint=joints[i];
    rigs.push({node:`MOTION_${prefix}_${label}`,
      pivotWU:breaker?[27,0,joint.open]:[joint.open,0,0],runtimeAxis:axis,
      retainedDeltaWU:joint.retained-joint.open,retainedScale:1});
    for (const [n,long] of asset.motion.rams.longitudinalPositions.entries()) {
      const id=`${prefix.toLowerCase()}_ram_${side}_${long}`;
      const a=asset.states.open.boxes.find(b=>b.id===id);
      const b=asset.states.retained.boxes.find(b=>b.id===id);
      rigs.push({node:`MOTION_${prefix}_RAM_${label}_${n}`,
        pivotWU:breaker?[long,0,asset.motion.rams.roots[i]]:[asset.motion.rams.roots[i],0,long],
        runtimeAxis:axis,retainedDeltaWU:0,retainedScale:b.size[axis]/a.size[axis]});
    }
  }
  return rigs;
}

export function createCeresWorkfleetMotionDriver(root, entity) {
  const role=ceresWorkfleetRole(entity);
  if (role!=='breaker' && role!=='cradle') return null;
  const rigs=ceresWorkfleetVisualRigs(role), byName=new Map(rigs.map(r=>[r.node,r]));
  const found=new Set(), joints=[];
  root.traverse(node=>{
    const rig=byName.get(node.name);
    if (!rig) return;
    found.add(node.name);
    joints.push({node,a:ceresWorkfleetRigPose(rig,0),b:ceresWorkfleetRigPose(rig,1)});
  });
  if (found.size!==rigs.length) throw new Error(`Ceres ${role} is missing a sealed physical motion pivot`);
  return liveEntity=>{
    if (ceresWorkfleetRole(liveEntity)!==role) return;
    const fraction=ceresWorkfleetSlide(liveEntity);
    for (const {node,a,b} of joints) {
      node.position.set(a.position.x+(b.position.x-a.position.x)*fraction,
        a.position.y+(b.position.y-a.position.y)*fraction,
        a.position.z+(b.position.z-a.position.z)*fraction);
      node.scale.set(a.scale.x+(b.scale.x-a.scale.x)*fraction,
        a.scale.y+(b.scale.y-a.scale.y)*fraction,
        a.scale.z+(b.scale.z-a.scale.z)*fraction);
      node.updateMatrix();
    }
  };
}

export function ceresWorkfleetCatalogRows(isPublished = () => false) {
  return Object.entries(C.assets).map(([role,asset])=>({
    id:asset.id,assetId:asset.assetId,family:'ceres-workfleet',file:asset.file,
    fit:'authored-origin',placeScale:C.sourceScale,entityRadius:asset.radius,
    colliderKind:'compound',colliderId:`ceres-workfleet:${role}`,
    compoundBoxesWU:asset.states?.open.boxes||asset.boxes,
    solid:true,packagedLive:isPublished(asset.file),referenceState:'open',
  }));
}

// Independent source throats share opaque bell metal, never mutable radiance.
import { readCeresWorkfleetActuation } from '../core/ceresWorkfleetActuation.js';
import { cloneMaterialPreservingShaderHooks } from './materialClone.js';
const propulsionBindings = new WeakMap();
export const CERES_WORKFLEET_NOZZLE_CAPACITY = 16;
export function isCeresWorkfleetPropulsion(entity) {
  const role = ceresWorkfleetRole(entity);
  return role === 'breaker' || role === 'cutterHead';
}
export function createCeresWorkfleetNozzleSamples(role) {
  return (C.assets[role]?.propulsion?.channels || []).map(channel => ({channel, force:0, capacity:0, level:0}));
}
// Signed local force allocation. Actual force is retained without saturation; only
// radiance is normalized. No opposing throats at a station can burn together.
export function sampleCeresWorkfleetNozzles(role, receipt, samples) {
  const fx=receipt?.localFx||0, fz=receipt?.localFz||0, torque=receipt?.torque||0;
  const linear=receipt?.linearCapacity||0, angular=receipt?.torqueCapacity||0;
  for (const sample of samples) {
    const id=sample.channel.id;
    let force=0, capacity=0;
    if (role==='breaker') {
      if (id.startsWith('MAIN_')) { force=Math.max(0,fx)/4; capacity=linear/4; }
      else if (id.startsWith('RETRO_')) { force=Math.max(0,-fx)/2; capacity=linear/2; }
      else if (id.startsWith('RCS_')) {
        const push=fz/2+(id.includes('_BOW_')?torque:-torque)/128;
        force=Math.max(0,id.endsWith('_PORT')?push:-push); capacity=linear/2+angular/128;
      }
    } else if (role==='cutterHead') {
      if (id.startsWith('AXIAL_')) {
        const push=fx/2+(id.endsWith('_PORT')?torque:-torque)/9.2;
        force=Math.max(0,id.startsWith('AXIAL_AFT_')?push:-push); capacity=linear/2+angular/9.2;
      } else if (id.startsWith('LATERAL_')) {
        force=Math.max(0,id.endsWith('_PORT')?fz:-fz); capacity=linear;
      }
    }
    sample.force=force; sample.capacity=capacity;
    sample.level=capacity>0?Math.min(1,force/capacity):0;
  }
  return samples;
}
function inside(node, root) {
  for (let n=node;n;n=n.parent) if(n===root)return true;else if(n.visible===false)return false;
  return false;
}
function visibleCore(sample) {
  for(const node of sample.meshes) {
    let visible=true;
    for(let n=node;n;n=n.parent)if(n.visible===false){visible=false;break;}
    if(visible)return true;
  }
  return false;
}
function activeBinding(entity) {
  const bindings=propulsionBindings.get(entity);
  if (!bindings || !entity.mesh) return null;
  for (const binding of bindings) if (!binding.disposed && binding.life===entity.occupantGeneration
    && inside(binding.root,entity.mesh)) return binding;
  return null;
}
export function createCeresWorkfleetPropulsionDriver(root, entity) {
  if (!root || !isCeresWorkfleetPropulsion(entity)) return null;
  const role=ceresWorkfleetRole(entity), samples=createCeresWorkfleetNozzleSamples(role);
  const byName=new Map(), nodes=new Map();
  for (const sample of samples) {
    sample.meshes=[]; sample.materials=[];
    byName.set(sample.channel.socket,sample);
    for (const name of sample.channel.coreMeshes) byName.set(name,sample);
  }
  root.traverse(node=>{
    const sample=byName.get(node.name); if(!sample)return;
    if(node.name===sample.channel.socket) sample.socket=node;
    else if(node.isMesh) sample.meshes.push(node);
    nodes.set(node.name,node);
  });
  if (!samples.length || samples.some(s=>!s.socket || s.channel.coreMeshes.some(n=>!nodes.get(n)?.isMesh))) {
    throw new Error(`Ceres ${role} is missing a sealed propulsion socket or independent glow core`);
  }
  for (const sample of samples) {
    const clones=new Map();
    for (const node of sample.meshes) {
      const clone=source=>{
        if(clones.has(source))return clones.get(source);
        const material=cloneMaterialPreservingShaderHooks(source);
        material.userData={...material.userData,spacefaceSharedAsset:false,spacefaceCeresThruster:true};
        const maximum=Math.max(1,Number(source.userData?.ceresThrusterMaximum)||Number(source.emissiveIntensity)||1);
        material.userData.ceresThrusterMaximum=maximum;
        material.emissiveIntensity=0;
        sample.materials.push({material,maximum}); clones.set(source,material); return material;
      };
      node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);
    }
  }
  const binding={entity,root,role,samples,life:entity.occupantGeneration,disposed:false};
  const identity={id:entity.id,worldRecordId:entity.data.worldRecordId,life:entity.occupantGeneration};
  let boundEntity=entity, activated=entity.deferAuthoredMotionRegistration!==true, set=null;
  const register=owner=>{
    set=propulsionBindings.get(owner);if(!set)propulsionBindings.set(owner,set=new Set());set.add(binding);
  };
  if(activated)register(boundEntity);
  const clear=()=>{for(const sample of samples) {sample.force=sample.level=0;
    for(const entry of sample.materials)entry.material.emissiveIntensity=0;}};
  const update=(liveEntity,a11y)=>{
    const receipt=activated && liveEntity===boundEntity && !binding.disposed
      && binding.life===boundEntity.occupantGeneration && activeBinding(boundEntity)===binding
      ?readCeresWorkfleetActuation(boundEntity):null;
    sampleCeresWorkfleetNozzles(role,receipt,samples);
    const reducedFlash=a11y?.reducedFlash ?? receipt?.state?.settings?.accessibility?.flashReduce;
    for(const sample of samples)for(const entry of sample.materials)
      entry.material.emissiveIntensity=entry.maximum*sample.level*(reducedFlash ? .55 : 1);
  };
  // Appearance rebuilds compose a detached snapshot. Only the renderer's explicit
  // post-publication activation may hand that binding to the authoritative object.
  // Never resolve an entity by ID, transfer a receipt, or steal the retained root.
  const activate=liveEntity=>{
    if(binding.disposed)return false;
    if(activated)return liveEntity===boundEntity;
    if(!liveEntity || liveEntity.deferAuthoredMotionRegistration===true || liveEntity.alive===false
      || liveEntity.id!==identity.id || !Number.isSafeInteger(identity.life)
      || liveEntity.occupantGeneration!==identity.life || ceresWorkfleetRole(liveEntity)!==role
      || liveEntity.data.worldRecordId!==identity.worldRecordId || !inside(root,liveEntity.mesh))return false;
    clear();boundEntity=liveEntity;binding.entity=liveEntity;activated=true;register(liveEntity);return true;
  };
  const dispose=()=>{clear();binding.disposed=true;
    if(set){set.delete(binding);if(!set.size)propulsionBindings.delete(boundEntity);}};
  return {update,clear,activate,dispose,binding};
}

export function ceresWorkfleetPropulsionAwake(state) {
  for(const entity of state?.entities?.values()||[]) {
    if(!isCeresWorkfleetPropulsion(entity))continue;
    const receipt=readCeresWorkfleetActuation(entity,state);
    if(receipt && activeBinding(entity) && (receipt.localFx!==0 || receipt.localFz!==0 || receipt.torque!==0)) return true;
  }
  return false;
}

// Sixteen retained source channels write into the same production continuous-plume
// primitive as the ordinary fleet. No burst emitter, particle framework or history.
export function createCeresWorkfleetPlumeBatch(plume, Vector3) {
  const slots=[];
  for(const role of ['breaker','cutterHead'])for(const channel of C.assets[role].propulsion.channels) {
    slots.push({role,channel,entity:null,life:null,root:null,
      driveState:{plumeDrive:0,boostBlend:0,ignition:0},
      signals:{entityId:`ceres:${role}:${channel.id}`,throttle:0,boost:0,speedDrive:0},
      sockets:[{x:0,y:0,z:0,ax:0,ay:0,az:0}],position:new Vector3(),axis:new Vector3()});
  }
  if(slots.length!==CERES_WORKFLEET_NOZZLE_CAPACITY)throw new Error('Ceres workfleet must own exactly 16 nozzle states');
  let activeCount=0, asleep=true;
  const clearSlot=slot=>{slot.entity=slot.life=slot.root=null;slot.driveState.plumeDrive=0;
    slot.driveState.boostBlend=0;slot.driveState.ignition=0;slot.signals.throttle=0;};
  const reset=()=>{for(const slot of slots)clearSlot(slot);if(!asleep || plume.pool.activeCount>0)plume.reset();activeCount=0;asleep=true;};
  return {slots,plume,get activeCount(){return activeCount;},reset,
    update(state,dt,a11y) {
      activeCount=0;plume.beginUpdate(a11y);
      for(const entity of state.entities.values()) {
        if(!isCeresWorkfleetPropulsion(entity))continue;
        const binding=activeBinding(entity),receipt=readCeresWorkfleetActuation(entity,state);
        if(!binding||!receipt)continue;
        sampleCeresWorkfleetNozzles(binding.role,receipt,binding.samples);
        for(const sample of binding.samples) {
          let slot=null;
          for(const candidate of slots)if(candidate.role===binding.role && candidate.channel===sample.channel){slot=candidate;break;}
          if(!slot)continue;
          // Discontinuous lifetime, lost admission, coast and opposed reversal remove
          // the active boundary immediately; smoothing cannot light a false throat.
          if(!(sample.level>0)) {clearSlot(slot);continue;}
          const visible=visibleCore(sample);
          if(!visible) {clearSlot(slot);continue;}
          slot.entity=entity;slot.life=entity.occupantGeneration;slot.root=binding.root;
          const socket=sample.socket,out=slot.sockets[0],direction=sample.channel.exhaustDirection;
          socket.getWorldPosition(slot.position);
          slot.axis.set(direction.x,direction.y,direction.z).transformDirection(socket.parent.matrixWorld);
          out.x=slot.position.x;out.y=slot.position.y;out.z=slot.position.z;
          // Production shader extends along -axis, so submit the reaction-force axis.
          out.ax=-slot.axis.x;out.ay=-slot.axis.y;out.az=-slot.axis.z;
          slot.signals.throttle=sample.level;
          // The receipt is already the final actuator response, so there is no
          // second spring between zero/opposed force and the nozzle's brightness.
          slot.driveState.plumeDrive=sample.level;
          const first=plume.pool.activeCount;
          plume.writeEntity(dt,sample.level,slot.sockets,slot.signals,slot.driveState,1);
          const geometry=plume.pool.recipe.geometry;
          for(let i=first;i<plume.pool.activeCount;i++) {
            const layer=plume.pool.slots[i];
            layer.width*=sample.channel.lipRadiusWU*2/geometry.baseWidth;
            layer.length*=sample.channel.lipRadiusWU*9/geometry.baseLength;
          }
          activeCount++;
        }
      }
      for(const slot of slots)if(slot.entity && (!readCeresWorkfleetActuation(slot.entity,state)
        || !activeBinding(slot.entity)))clearSlot(slot);
      plume.endUpdate(a11y?.reducedMotion?0:dt);
      asleep=activeCount===0;return activeCount;
    },dispose(){reset();plume.group?.removeFromParent();plume.dispose();}};
}
