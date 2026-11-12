// A real player line makes this already-filed ambient haul worth resuming.
// Retention changes no admission, ownership, mass, reward or movement law.
export function retainFrontierClaimCarry(state,claim,body){
 if(state.mode!=='flight'||state.run?.kind==='survival'||state.physicsVenue?.active
  ||claim.state!=='open'||!body?.alive||body.occupantGeneration!==claim.wreckGen
  ||body.data?.frontierDisputeId!==claim.id)return false;
 if(body.data.frontierClaimRetention===claim.id)return true;
 if(body.flags?.persistent||body.flags?.missionPinned||body.data?.persistent||body.data?.missionPinned
  ||body.data?.missionId!=null||body.data?.missionTag!=null||body.data?.missionTargetSlot!=null||body.data?.wreckMissionId!=null||body.data?.worldRecordId!=null)return false;
 const p=state.entities.get(state.playerId),t=state.player?.tether,a=state.combat?.attachments?.byId?.[String(t?.attachmentId)];
 if(!p?.alive||!t?.active||t.targetId!==body.id||a?.state!=='active'||a.id!==t.attachmentId
  ||a.ownerId!==p.id||a.targetId!==body.id||a.ownerGeneration!==p.occupantGeneration
  ||a.targetGeneration!==body.occupantGeneration)return false;
 body.flags ||= {};body.flags.persistent=true;body.data.frontierClaimRetention=claim.id;
 body.data.frontierClaimRetentionVersion=1;body.data.frontierClaimRetentionLife=body.occupantGeneration;
 claim.carryRetained=true;return true;
}
export function releaseFrontierClaimCarry(claim,body){
 if(!body?.alive||body.occupantGeneration!==claim.wreckGen||body.data?.frontierDisputeId!==claim.id
  ||body.data.frontierClaimRetention!==claim.id)return false;
 // Do not undo a later mission/world owner adopting this body.
 if(!body.flags?.missionPinned&&!body.data?.persistent&&!body.data?.missionPinned
  &&body.data?.missionId==null&&body.data?.missionTag==null&&body.data?.missionTargetSlot==null&&body.data?.wreckMissionId==null&&body.data?.worldRecordId==null)body.flags.persistent=false;
 delete body.data.frontierClaimRetention;delete body.data.frontierClaimRetentionVersion;delete body.data.frontierClaimRetentionLife;return true;
}

// Reconcile only our versioned life stamp. Legacy unstamped orphans are not guessed.
export function reconcileFrontierClaimRetention(state,{restored=false}={}){
 const bindings=new Map();
 if(restored&&state.sessionEntityIdRemap instanceof Map)for(const b of (Array.isArray(state.frontier?.claimCarryBindings)?state.frontier.claimCarryBindings:[])){
  if(!Number.isSafeInteger(b?.life)||b.life<=0)continue;
  const id=state.sessionEntityIdRemap.get(String(b?.savedId));
  if(id!=null)bindings.set(String(id),b);
 }
 for(const body of state.entityList||[]){
  const data=body?.data,id=data?.frontierClaimRetention;
  if(!body?.alive||typeof id!=='string'||!id||data.frontierClaimRetentionVersion!==1
   ||data.frontierDisputeId!==id)continue;
  if(restored){const b=bindings.get(String(body.id));
   data.frontierClaimRetentionLife=b?.claimId===id&&b?.life===data.frontierClaimRetentionLife?body.occupantGeneration:null;
  }
  if(data.frontierClaimRetentionLife!==body.occupantGeneration)continue;
  const active=(state.frontier?.disputes||[]).some(d=>d.state==='open'&&d.id===id
   &&d.wreckId===body.id&&d.wreckGen===body.occupantGeneration);
  if(!active)releaseFrontierClaimCarry({id,wreckGen:body.occupantGeneration},body);
 }
}

// This proof is generated at serialization, not inferred from tags after restore.
export function frontierClaimRetentionSnapshot(state){
 const bindings=[];
 for(const body of state.entityList||[]){const d=body?.data;
  if(body?.alive&&d?.frontierClaimRetentionVersion===1&&typeof d.frontierClaimRetention==='string'
   &&d.frontierClaimRetention===d.frontierDisputeId&&d.frontierClaimRetentionLife===body.occupantGeneration)
   bindings.push({savedId:body.id,life:body.occupantGeneration,claimId:d.frontierClaimRetention});
 }
 return bindings;
}
