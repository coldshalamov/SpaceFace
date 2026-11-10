// CR-FEED owns local equipment and operator consent only. Cargo, payment and motion
// remain with the mission, intake and native attachment/physics owners.
import { FURNACE_INTAKE } from '../data/furnace.js';
import { authoredFurnaceWorksite, furnaceMouthGlobal, isFurnaceOwnedLot, furnaceMiteClearance } from './furnaceWorksite.js';
export const FURNACE_CAPSTAN = Object.freeze({ id: 'cr_feed_quarantine_gantry', version: 1,
  attachmentDefId: 'attachment_furnace_capstan', reach: 900, hailRange: 650, reelRate: 14, minLength: 55 });
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const jobs = s => s?.missions?.active?.filter(authoredFurnaceWorksite) || [];
function jobFor(s) { const found=jobs(s); return found.length===1 && !found[0].params.furnaceLedgerInvalid ? found[0] : null; }
function record(s,m) { const r=s.story?.flags?.furnace_capstan; return r?.version===1 && r.missionId===m?.id && Array.isArray(r.slots) && r.slots.length===3 && r.slots.every((row,slot)=>row && row.slot===slot && ['held','reeling','released'].includes(row.mode)) ? r : null; }
function original(s,m,slot) { const lot=m?.params?.furnaceLots?.[slot], e=s.entities?.get(lot?.entityId); return lot && !lot.received && !lot.lost && e?.alive && isFurnaceOwnedLot(e,s) ? e : null; }
function hardware(s,m) { return (s.entityList||[]).find(e=>e.alive && e.data?.furnaceCapstanId===FURNACE_CAPSTAN.id && e.data.furnaceMissionId===m?.id); }
function activeLines(s,anchor,pod) { return Object.values(s.combat?.attachments?.byId||{}).filter(a=>a.state==='active' && a.ownerId===anchor?.id && a.targetId===pod?.id && a.ownerGeneration===anchor?.occupantGeneration && a.targetGeneration===pod?.occupantGeneration && a.defId===FURNACE_CAPSTAN.attachmentDefId); }
function manualLine(s,pod) { const p=s.entities?.get(s.playerId);return Object.values(s.combat?.attachments?.byId||{}).some(a=>a.state==='active' && a.targetId===pod.id && a.targetGeneration===pod.occupantGeneration && ((a.ownerId===s.playerId && a.ownerGeneration===p?.occupantGeneration) || (a.controllerId===s.playerId && a.controllerGeneration===p?.occupantGeneration))); }
export function furnaceCapstanSpec(m, hull=600) { return {type:'fx',ttl:Infinity,team:2,pos:furnaceMouthGlobal(),vel:{x:0,z:0},rot:0,
  radius:24,mass:10000,hull,hullMax:600,collides:true,physicsBody:{radius:24,mass:10000,dynamic:false},
  homeSectorId:FURNACE_INTAKE.sectorId,flags:{missionPinned:true},
  data:{furnaceCapstanId:FURNACE_CAPSTAN.id,furnaceMissionId:m.id,placeId:'place_maintenance_gantry',placeTargetRadius:32,
    combatProfileId:'combat_profile_tether_anchor',scanLabel:'CR-FEED — quarantine gantry',scannerSignalKind:'salvage',
    masslineTetherable:false,tetherable:false,missionPinned:true,persistenceOwner:'furnaceIntake'}}; }
export function furnaceCapstanRead(s,e=undefined) {
  const m=jobFor(s),r=record(s,m),a=e||hardware(s,m);
  if(!m||!r||r.disabled||!a?.alive||a!==hardware(s,m)||s.entities?.get(a.id)!==a) return null;
  const pending=m.params.furnaceLots.filter(l=>!l.received&&!l.lost);
  const hauling=pending.find(l=>r.slots[l.slot]?.mode==='reeling');
  const lot=hauling||pending[0],pod=lot&&original(s,m,lot.slot),slot=lot?.slot;
  const inReach=!!pod&&distance(a.pos,pod.pos)<=FURNACE_CAPSTAN.reach;
  const held=pod&&activeLines(s,a,pod).length===1;
  return {missionId:m.id,anchorId:a.id,generation:a.occupantGeneration,slot,pending:pending.length,
    cleared:furnaceMiteClearance(s).length,hauling:!!hauling,held:!!held,inReach,
    playerHeld:!!pod&&manualLine(s,pod),mode:r.slots[slot]?.mode||null,
    podId:pod?.id??null,podGeneration:pod?.occupantGeneration??null,lineId:pod?(activeLines(s,a,pod)[0]?.id??null):null};
}
export function furnaceCapstanAvailability(s,e) {
  const read=furnaceCapstanRead(s,e),p=s.entities?.get(s.playerId);
  if(!read||s.mode!=='flight'||s.ui?.docked||s.player?.flags?.docked||!p?.alive
    ||s.world?.currentSectorId!==FURNACE_INTAKE.sectorId||s.player?.targetId!==e.id
    ||!Number.isSafeInteger(e.occupantGeneration)||e.occupantGeneration<1
    ||distance(p.pos,e.pos)>FURNACE_CAPSTAN.hailRange) return null;
  return {enabled:true,reason:null,targetId:e.id,entity:e,kind:'furnace_capstan',label:'HAIL CR-FEED',distance:distance(p.pos,e.pos)};
}
export function furnaceCapstanOffer(s,availability,requestId,expiresAt) {
  const a=availability?.entity,read=furnaceCapstanRead(s,a);
  if(!read||!furnaceCapstanAvailability(s,a))return null;
  let action=null;
  if(read.hauling)action={id:'furnace_hold',label:'HOLD WINCH'};
  else if(read.pending&&read.cleared===4&&read.inReach&&!read.playerHeld)action={id:'furnace_haul',label:`WINCH POD ${read.slot+1}`};
  const status=read.cleared<4?'Clear the four marked mite sites before winding.'
    :!read.pending?'All original pods accounted for.'
    :!read.inReach?'Original pod is outside the 900 WU cable reach. No replacement will be issued.'
    :read.playerHeld?'Cut your own line before asking the gantry to take the load.'
    :read.hauling?`Winding original pod ${read.slot+1}. HOLD stops the drum; the pod keeps its momentum.`
    :`Original pod ${read.slot+1} ready. WINCH draws this 40 t load into the large intake ring.`;
  return {requestId,targetId:a.id,kind:'furnace_capstan',expiresAt,furnaceCapstan:{...read},
    lines:['CR-FEED · 40 t yard winch included. No charge. Actual receipts pay. The 900 WU safety trip releases an overstretched cable.',
      `${status} Stay within 650 WU. Leaving or Continue holds; hail to resume. Keep clear of the load and cable.`],
    actions:[...(action?[action]:[]),...(read.held?[{id:'furnace_release',label:'RELEASE TO MANUAL'}]:[]),{id:'status',label:'STATUS'}]};
}
export function furnaceCapstanResponse(s,offer,choice) {
  const a=s.entities?.get(offer?.targetId),read=furnaceCapstanRead(s,a),id=String(choice||'').toLowerCase();
  if(!read||!furnaceCapstanAvailability(s,a)||!(offer.expiresAt>s.simTime)
    ||offer.furnaceCapstan?.missionId!==read.missionId||offer.furnaceCapstan.generation!==read.generation
    ||offer.furnaceCapstan.slot!==read.slot||offer.furnaceCapstan.podId!==read.podId
    ||offer.furnaceCapstan.podGeneration!==read.podGeneration||offer.furnaceCapstan.lineId!==read.lineId
    ||offer.furnaceCapstan.mode!==read.mode||!offer.actions?.some(row=>row.id===id))return null;
  return {requestId:offer.requestId,targetId:a.id,kind:'furnace_capstan',choice:id,expiresAt:s.simTime+8,
    furnaceCapstan:{...offer.furnaceCapstan},lines:[id==='status'?`CR-FEED · ${read.pending} original pods outstanding. ${read.cleared}/4 mite sites clear.`:'CR-FEED · Winch command received. Mechanical status follows.']};
}
export function initFurnaceCapstan(owner,on) {
  owner._capstanOffers=new Map();
  // init() tears down the previous incarnation before subscribing again. Its
  // destruction receipts may still be queued, so retain identity across re-init.
  owner._capstanRetiredBodies ||= new WeakSet();
  on('contactHail:offer',p=>{if(p?.kind==='furnace_capstan'){
    owner._capstanOffers.clear();owner._capstanOffers.set(p.requestId,{...p,body:owner.state.entities?.get(p.targetId),pod:owner.state.entities?.get(p.furnaceCapstan?.podId)});
  }});
  on('contactHail:response',p=>applyFurnaceCapstanCommand(owner,p));
  for(const event of ['save:restoring','game:newGame','sector:exit','contactHail:clear'])on(event,()=>owner._capstanOffers.clear());
  on('save:loaded',()=>{const m=jobFor(owner.state),r=record(owner.state,m);if(r)for(const row of r.slots)if(row?.mode==='reeling')row.mode='held';});
  on('tether:broken',p=>{
    if(owner._restoring||owner._capstanRemoving)return;
    const m=jobFor(owner.state),r=record(owner.state,m),a=hardware(owner.state,m);
    if(!r||p?.ownerId!==a?.id)return;
    const pod=owner.state.entities?.get(p.targetId),line=owner.state.combat?.attachments?.byId?.[p.attachmentId];
    // A queued old-body teardown may arrive after its numeric ID is recycled.
    // Only the exact cable occupants may change this mission's saved custody.
    if(!line||line.defId!==FURNACE_CAPSTAN.attachmentDefId||line.ownerId!==a.id
      ||line.targetId!==pod?.id||line.ownerGeneration!==a.occupantGeneration
      ||line.targetGeneration!==pod.occupantGeneration||pod.data?.furnaceMissionId!==m.id)return;
    const row=r.slots[pod.data.furnaceLotSlot];if(row){row.mode='released';row.length=null;row.reason=p.reason;}
  });
  on('entity:destroyed',p=>{if(owner._restoring||owner._capstanRemoving||owner._capstanRetiredBodies.has(p?.entity)||p?.entity?.data?.furnaceCapstanId!==FURNACE_CAPSTAN.id)return;
    const m=jobFor(owner.state),r=record(owner.state,m);if(r&&p.entity.data.furnaceMissionId===m.id){
      r.disabled=true;owner._capstanOffers.clear();
      // A true loss can be queued before re-init briefly materializes a successor.
      // Remove that successor as intentional teardown; never leave repaired hardware.
      removeFurnaceCapstan(owner);
    }});
}
function applyFurnaceCapstanCommand(owner,p) {
  if(p?.kind!=='furnace_capstan'||owner._restoring)return;
  const offer=owner._capstanOffers.get(p.requestId);owner._capstanOffers.delete(p.requestId);
  const s=owner.state,a=s.entities?.get(p.targetId);
  if(!offer||a!==offer.body||owner.state.entities?.get(offer.furnaceCapstan?.podId)!==offer.pod||p.targetId!==offer.targetId||!furnaceCapstanResponse(s,offer,p.choice))return;
  const read=furnaceCapstanRead(s,a),m=jobFor(s),r=record(s,m),row=r.slots[read.slot];
  if(p.choice==='status'||!row)return;
  const pod=original(s,m,read.slot),lines=owner.ctx.registry?.get?.('combat')?.kernel?.attachments;
  if(!lines)return;
  let text;
  if(p.choice==='furnace_haul'&&read.cleared===4&&read.inReach&&!read.playerHeld&&!read.hauling){
    if(row.mode==='released')row.length=null;
    row.mode='reeling';text=`Winch engaged on original pod ${read.slot+1}. Watch the cable shorten; stay clear of the intake.`;
  } else if(p.choice==='furnace_hold'&&read.hauling){row.mode='held';text='Drum held at its present length. Momentum is unchanged; hail to resume.';
  } else if(p.choice==='furnace_release'&&read.held){
    row.mode='released';row.length=null;for(const line of activeLines(s,a,pod))lines.cut(line.id,a.id,'furnace_manual_release');
    text='Gantry line released. The pod is yours to handle; your own Line rating has not changed.';
  } else return;
  owner.bus.emit('comms:popup',{id:`furnace_winch_${s.tick}`,sender:'CR-FEED',category:'story',ttl:7,text,persist:false});
}
export function removeFurnaceCapstan(owner) {
  owner._capstanOffers?.clear();
  owner._capstanRemoving=true;
  for(const e of owner.state?.entityList||[])if(e.alive&&e.data?.furnaceCapstanId===FURNACE_CAPSTAN.id){
    // Core publishes destruction on its queue. Keep object identity until that
    // event arrives; a synchronous boolean alone mistakes teardown for damage.
    owner._capstanRetiredBodies?.add(e);owner.helpers?.removeEntity?.(e.id);
  }
  owner._capstanRemoving=false;
}
export function stepFurnaceCapstan(owner,dt=0) {
  const s=owner.state,m=jobFor(s);
  if(!m||!owner._adventure()){removeFurnaceCapstan(owner);return;}
  if(owner._restoring||!Array.isArray(m.params.furnaceLots))return;
  const flags=s.story?.flags;if(!flags)return;
  let r=record(s,m);
  if(!r){
    if(flags.furnace_capstan?.missionId===m.id)return; // Corrupt custody fails closed.
    r={version:1,missionId:m.id,hull:600,slots:m.params.furnaceLots.map((lot,slot)=>{
      const mouth=furnaceMouthGlobal();
      const untouched=Math.abs(lot.pos.x-(mouth.x+280+slot*170))<0.01 && Math.abs(lot.pos.z-mouth.z)<0.01
        && Math.hypot(lot.vel?.x||0,lot.vel?.z||0)<0.01;
      return {slot,mode:untouched?'held':'released',length:null};
    })};flags.furnace_capstan=r;
  }
  if(r.disabled||!Number.isFinite(r.hull)||r.hull<=0||r.hull>600)return;
  let a=hardware(s,m);if(!a)a=owner.helpers.spawnEntity?.(furnaceCapstanSpec(m,r.hull));if(!a)return;
  r.hull=a.hull;

  const lines=owner.ctx.registry?.get?.('combat')?.kernel?.attachments,p=s.entities?.get(s.playerId);
  if(!lines)return;
  const attended=s.mode==='flight'&&!s.ui?.docked&&!s.player?.flags?.docked&&p?.alive&&distance(p.pos,a.pos)<=FURNACE_CAPSTAN.hailRange;
  for(let slot=0;slot<3;slot++){
    const row=r.slots[slot],pod=original(s,m,slot);if(!row||row.slot!==slot||!pod)continue;
    if(!['held','reeling','released'].includes(row.mode))row.mode='released';
    let attached=activeLines(s,a,pod);
    if(manualLine(s,pod)){row.mode='released';row.length=null;for(const line of attached)lines.cut(line.id,a.id,'furnace_player_control');continue;}
    if(row.mode==='released')continue;
    // The capped spring cannot promise a tension break. Its local limit switch
    // releases an overrun through the canonical cut service, never a pose reset.
    if(attached.length&&distance(a.pos,pod.pos)>FURNACE_CAPSTAN.reach){
      row.mode='released';row.length=null;
      for(const line of attached)lines.cut(line.id,a.id,'furnace_cable_reach');
      owner.bus.emit('comms:popup',{id:`furnace_winch_limit_${s.tick}_${slot}`,sender:'CR-FEED',category:'story',ttl:8,
        text:`Pod ${slot+1} exceeded the 900 WU cable limit. Safety release tripped; the original load is drifting. No replacement or receipt was issued.`,persist:false});
      continue;
    }
    if(row.mode==='reeling'&&(!attended||furnaceMiteClearance(s).length!==4))row.mode='held';
    if(!attached.length){
      const gap=distance(a.pos,pod.pos);if(gap>FURNACE_CAPSTAN.reach)continue;
      const created=lines.create({defId:FURNACE_CAPSTAN.attachmentDefId,ownerId:a.id,targetId:pod.id,
        sourceWorld:{...a.pos},targetWorld:{...pod.pos}});
      if(!created.ok)continue;attached=[created.attachment];
      // Resume a saved drum setting without moving either endpoint. Only the native
      // rope receives this length. Never reel a fresh migrated pod toward a saved pose.
      if(Number.isFinite(row.length)&&row.length>=FURNACE_CAPSTAN.minLength&&row.length<=FURNACE_CAPSTAN.reach)
        lines.reel(created.attachment.id,row.length-created.attachment.restLength,FURNACE_CAPSTAN.minLength);
    }
    const line=attached[0];
    // This registered owner runs on a coarse cadence; spend its actual elapsed
    // simulation interval, not a fictitious 60 Hz frame. Native rope caps still apply.
    if(row.mode==='reeling'&&dt>0)lines.reel(line.id,-FURNACE_CAPSTAN.reelRate*Math.min(dt,1),FURNACE_CAPSTAN.minLength);
    row.length=line.restLength;
  }
}
