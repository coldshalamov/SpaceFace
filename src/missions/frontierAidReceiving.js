const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
const tag='frontierAidReceiving';
// Reads the debt owner. Guides are nonphysical and never stand in for a delivery.
export function tickFrontierAidReceiving(owner,settleRadius){
 const s=owner.state;if(!s)return;
 const active=s.mode==='flight'&&s.run?.kind!=='survival'&&!s.physicsVenue?.active;
 const wanted=new Map();
 for(const d of s.frontier?.debts||[]){
  const rec=owner._steadRec(s,d.debtorId),body=rec&&owner._steadEnt(s,rec);
  if(!active||!body||d.receivingDebtorGen!==body.occupantGeneration||!finite(body.pos)||rec.sectorId!==s.world?.currentSectorId)continue;
  const marker=s.entities.get(d.markerId);
  const open=d.state==='open'&&marker?.alive&&marker.data?.frontierAidId===d.id&&marker.occupantGeneration===d.markerGen;
  if(open)wanted.set(d.id,{d,body,radius:settleRadius+(Number(body.radius)||0)});
 }
 const kept=new Map();
 for(const e of [...(s.entityList||[])]){
  if(!e?.alive||e.data?.[tag]!==true)continue;
  const w=wanted.get(e.data.debtId);
  if(w&&!kept.has(w.d.id)&&e.physicsBody===false&&e.data.frameId===w.body.id&&e.data.frameGen===w.body.occupantGeneration){kept.set(w.d.id,e);}
  else owner.helpers.removeEntity(e.id);
 }
 for(const [id,w]of wanted){
  let e=kept.get(id);
  if(!e)e=owner.helpers.spawnEntity({type:'beacon',pos:{...w.body.pos},radius:1,mass:0,hull:1,hullMax:1,collides:false,physicsBody:false,homeSectorId:s.world.currentSectorId,data:{[tag]:true,debtId:id,frameId:w.body.id,frameGen:w.body.occupantGeneration,parentType:'story_prop',circuitMark:true,tetherable:false,masslineTetherable:false,scannerSignalKind:'salvage'}});
  if(e){e.pos.x=w.body.pos.x;e.pos.z=w.body.pos.z;e.data.ringRadius=w.radius;e.data.visualRadius=w.radius;e.data.scanLabel=`${w.d.debtorName||'HOMESTEAD'} · AID RECEIVING · marker center inside ring`;}
 }
 const pilot=s.entities?.get(s.playerId);
 if(!active||!pilot?.alive||!finite(pilot.pos)||s.ui?.docked||s.player?.flags?.docked)return;
 for(const d of s.frontier?.debts||[]){
  const rec=owner._steadRec(s,d.debtorId),body=rec&&owner._steadEnt(s,rec);
  if(!body||d.receivingDebtorGen!==body.occupantGeneration||!finite(body.pos)||rec.sectorId!==s.world?.currentSectorId)continue;
  if(!d.receivingContact||typeof d.receivingContact!=='object'||Array.isArray(d.receivingContact))d.receivingContact={};
  const mem=d.receivingContact,near=Math.hypot(pilot.pos.x-body.pos.x,pilot.pos.z-body.pos.z)<=650;
  const say=(key,text)=>owner.bus.emit('comms:popup',{id:`frontier_aid_receiving:${d.id}:${key}`,sender:d.debtorName||'FRONTIER HOUSEHOLD',category:'story',ttl:12,persist:false,text});
  if(wanted.has(d.id)&&near&&!mem.arrival){mem.arrival=true;say('arrival',`${d.creditorName||'Our neighbor'} has sent a marker for us. Bring its center inside this receiving ring and we can take it aboard. The hull inside is solid; choose your approach around it. You do not need to push the marker against our walls.`);return;}
  if(d.state==='paid'&&near&&!mem.paid){mem.paid=true;say('paid',d.how==='carried'?`The marker from ${d.creditorName||'our neighbor'} arrived. We recorded the aid and the board settled the carrier payment. One household remembered another.`:'Your supply delivery covered the open marker. The board settled that aid obligation too; there is no second marker to carry.');return;}
  if(d.state==='lapsed'&&near&&mem.arrival&&!mem.lapsed){mem.lapsed=true;say('lapsed','That aid marker is no longer available. Its old receiving guide is closed; check the board for current work.');return;}
 }
}
