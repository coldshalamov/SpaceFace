const tag='frontierSalvageReceiving';
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.z);
// Physical endpoints for existing claim law. No wreck production, transfer or reward.
export function tickFrontierSalvageChoice(owner,settleRadius){
 const s=owner.state;if(!s)return;
 const active=s.mode==='flight'&&s.run?.kind!=='survival'&&!s.physicsVenue?.active;
 const rows=[],wanted=new Map();
 for(const d of s.frontier?.disputes||[]){
  if(!active||d.sectorId!==s.world?.currentSectorId)continue;
  const claimants=(d.steadIds||[]).map((id,i)=>{const rec=owner._steadRec(s,id),body=rec&&owner._steadEnt(s,rec);return body&&finite(body.pos)&&d.receivingGens?.[i]===body.occupantGeneration?{rec,body}:null;}).filter(Boolean);
  if(!claimants.length)continue;
  const w=s.entities.get(d.wreckId),live=d.state==='open'&&w?.alive&&finite(w.pos)&&w.occupantGeneration===d.wreckGen&&w.data?.frontierDisputeId===d.id;
  rows.push({d,claimants,w,live});
  if(live)for(const c of claimants)wanted.set(`${d.id}:${c.body.id}`,{d,...c});
 }
 const kept=new Map();
 for(const e of [...(s.entityList||[])]){
  if(!e?.alive||e.data?.[tag]!==true)continue;
  const key=e.data.choiceKey,c=wanted.get(key);
  if(c&&!kept.has(key)&&e.physicsBody===false&&e.data.frameGen===c.body.occupantGeneration)kept.set(key,e);
  else owner.helpers.removeEntity(e.id);
 }
 for(const [key,c]of wanted){let e=kept.get(key);
  if(!e)e=owner.helpers.spawnEntity({type:'beacon',pos:{...c.body.pos},radius:1,mass:0,hull:1,hullMax:1,collides:false,physicsBody:false,homeSectorId:s.world.currentSectorId,data:{[tag]:true,choiceKey:key,frameGen:c.body.occupantGeneration,parentType:'story_prop',circuitMark:true,tetherable:false,masslineTetherable:false,scannerSignalKind:'salvage'}});
  if(e){e.pos.x=c.body.pos.x;e.pos.z=c.body.pos.z;e.data.ringRadius=settleRadius+(Number(c.body.radius)||0);e.data.visualRadius=e.data.ringRadius;e.data.scanLabel=`${c.rec.name||'HOMESTEAD'} · CLAIM RECEIVING · tow filed wreck here`;}
 }
 const p=s.entities?.get(s.playerId);if(!active||!p?.alive||!finite(p.pos)||s.ui?.docked||s.player?.flags?.docked)return;
 for(const {d,claimants,w,live}of rows){
  if(!d.choiceContact||typeof d.choiceContact!=='object'||Array.isArray(d.choiceContact))d.choiceContact={};
  const mem=d.choiceContact,near=q=>finite(q)&&Math.hypot(p.pos.x-q.x,p.pos.z-q.z)<=650;
  const say=(id,text)=>owner.bus.emit('comms:popup',{id:`frontier_salvage_choice:${d.id}:${id}`,sender:'FRONTIER CLAIMS',category:'story',ttl:14,persist:false,text});
  if(live&&near(w.pos)&&!mem.offered){mem.offered=true;const names=claimants.map(c=>c.rec.name||'a household').join(' and ');say('offer',`${names} filed this hulk. ${claimants.length>1?'Choose a receiving household':'Use the household’s receiving ring'}: tow the wreck’s center inside a marked circle and the household takes the hulk for supplies. The board pays the haul. The hulls inside the rings are solid. Stripping the filed wreck, or carrying it beyond every claimant’s claim area, costs standing.`);return;}
  if(mem.offered&&!mem.closed&&d.state!=='open'&&claimants.some(c=>near(c.body.pos))){mem.closed=true;say('closed',d.state==='settled'?'The receiving household took title to the hulk. Its supplies record and the board’s haul payment are filed. The other receiving circles are closed.':d.state==='jumped'?'The board recorded a jumped claim. This haul did not settle a household’s filed rights; its receiving circles are closed.':'That salvage claim has lapsed. Its old receiving circles are closed; check current claims before another haul.');return;}
 }
}
