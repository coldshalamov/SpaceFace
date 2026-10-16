import {ensurePhysicsBodySpec} from '../core/physicsAuthority.js';
import {TALLY_THREE as T,tallyThreeSource} from '../data/tallyThree.js';
import {TALLY_THREE_RADIUS,tallyThreePhysicalBody} from '../data/tallyThreeBody.js';
import {makeShipEntitySpec} from '../systems/ships.js';
const AUTHORED_MASS=makeShipEntitySpec(T.assessorShipId).mass;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
export function claimsTallyAssessor(e){const d=e?.data;return e?.worldRecordId===T.assessorId||d?.worldRecordId===T.assessorId||d?.role==='claim_assessor'||d?.placeId==='place_tally_three';}
export function tallyAssessorOccupancy(state){
 const live=(state?.entityList||[]).filter(e=>e?.alive!==false&&claimsTallyAssessor(e));
 const far=(state?.world?.farActors?.rows||[]).filter(e=>e?.alive!==false&&claimsTallyAssessor(e));
 const count=live.length+far.length;
 return {kind:count===0?'absent':count!==1?'ambiguous':live.length?'live':'shelved',live,far,entity:count===1?(live[0]||far[0]):null};
}
export function validTallyPhase(p){return !!p&&typeof p==='object'&&!Array.isArray(p)
 &&['patrol','assess','disputed','receipt'].includes(p.phase)&&Number.isSafeInteger(p.tick)&&p.tick>=0
 &&Object.keys(p).every(k=>['phase','tick','receiptId'].includes(k))
 &&(p.phase==='receipt'?typeof p.receiptId==='string'&&p.receiptId.length>0&&p.receiptId.length<=256:p.receiptId==null);}
function validTallyBody(e){
 const authored=tallyThreePhysicalBody(e.mass),body=e.physicsBody;
 const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
 if(!body)return false;
 if(equal(body,authored))return true;
 // Only the detached canonical body is normalized. Candidate bytes are compared raw,
 // so normalization cannot clamp malformed revision/health or erase unknown subkeys.
 const expected=ensurePhysicsBodySpec({type:'ship',mass:e.mass,radius:e.radius,physicsBody:authored});
 if(!Number.isSafeInteger(body.revision)||body.revision<0)return false;
 expected.revision=body.revision;
 if(!Array.isArray(body.thrusters)||body.thrusters.length!==expected.thrusters.length)return false;
 for(let i=0;i<expected.thrusters.length;i++){
  const health=body.thrusters[i]?.health;
  if(!Number.isFinite(health)||health<0||health>1)return false;
  expected.thrusters[i].health=health;
 }
 return equal(body,expected);
}
export function validTallyAssessor(e){const d=e?.data;
 return !!e&&(e.worldRecordId==null||e.worldRecordId===T.assessorId)&&e.type==='ship'&&d?.worldRecordId===T.assessorId&&d.defId===T.assessorShipId
 &&(!d.hullDefId||d.hullDefId===T.assessorShipId)&&d.role==='claim_assessor'
 &&d.placeId==='place_tally_three'&&d.archetypeGlb==='place_tally_three'&&d.placeScale===1
 &&validTallyPhase(d.tallyThree)&&d.homeSectorId===T.sectorId&&d.sectorId===T.sectorId&&d.trafficRole==='tug'
 &&e.team===2&&e.factionId==='faction_dmc'&&e.radius===TALLY_THREE_RADIUS&&e.mass===AUTHORED_MASS
 &&validTallyBody(e);
}
export function validTallyRecordIdentity(rec){return !!rec&&rec.recordId===T.assessorId&&rec.type==='ship'&&rec.kind==='convoy'
 &&rec.shipDefId===T.assessorShipId&&rec.team===2&&rec.factionId==='faction_dmc'&&rec.sectorId===T.sectorId
 &&rec.homeSectorId===T.sectorId&&rec.trafficRole==='tug'&&rec.identityKey===T.assessorId;}
export function tallyAssessorTerminal(state){const r=state?.world?.records?.byId?.[T.assessorId],source=tallyThreeSource(state);
 return !source||source.sourceKey!==T.sourceKey||source.sectorId!==T.sectorId||source.assessorLost===true
 ||(r&&!validTallyRecordIdentity(r))||r?.alive===false||r?.outcome==='destroyed'||r?.outcome==='defeated';}
export function canPromoteTallyAssessor(state,row){const o=tallyAssessorOccupancy(state);
 return state?.world?.currentSectorId===T.sectorId&&!tallyAssessorTerminal(state)&&o.kind==='shelved'&&o.entity===row&&validTallyAssessor(row)
 &&state.world.farActors.byId.get(row.id)===row
 &&(row.jobId??null)===(row.data.jobId??null)&&row.trafficRole===row.data.trafficRole
 &&JSON.stringify(row.route??null)===JSON.stringify(row.data.route??row.data.itinerary??null)
 &&(!Object.hasOwn(row,'cargoManifest')||JSON.stringify(row.cargoManifest)===JSON.stringify(row.data.cargoManifest));}
export function decorateTallyAssessorSpec(spec){
 spec.radius=TALLY_THREE_RADIUS;spec.physicsBody=tallyThreePhysicalBody(spec.mass);
 spec.data={...spec.data,derived:{...spec.data?.derived,radius:TALLY_THREE_RADIUS},worldRecordId:T.assessorId,
 sectorId:T.sectorId,homeSectorId:T.sectorId,placeId:'place_tally_three',archetypeGlb:'place_tally_three',placeScale:1,
 callsign:'Tally-3',name:'Tally-3',role:'claim_assessor',trafficRole:'tug',transientSector:true};return spec;
}
export function tallyAssessorRecordSpec(state,rec){
 if(state?.world?.currentSectorId!==T.sectorId||rec?.recordId!==T.assessorId||tallyAssessorTerminal(state)||tallyAssessorOccupancy(state).kind!=='absent'
 ||rec.type!=='ship'||rec.kind!=='convoy'||rec.shipDefId!==T.assessorShipId||rec.team!==2||rec.factionId!=='faction_dmc'
 ||(rec.extra?.tallyThreeIdentityVersion!=null&&rec.extra.tallyThreeIdentityVersion!==1)
 ||((rec.extra?.tallyThreeIdentityVersion===1||rec.extra?.tallyThree!=null)&&!validTallyPhase(rec.extra?.tallyThree))
 ||rec.sectorId!==T.sectorId||rec.homeSectorId!==T.sectorId||rec.trafficRole!=='tug'||rec.identityKey!==T.assessorId)return null;
 const spec=makeShipEntitySpec(T.assessorShipId,{team:rec.team,factionId:rec.factionId,pos:clone(rec.pos),ai:clone(rec.ai)});
 for(const k of ['pos','vel','rot','angVel','hull','hullMax','shield','shieldMax','armorHp','armorMax'])if(rec[k]!=null)spec[k]=clone(rec[k]);
 for(const k of ['cargoManifest','jobId','itinerary','freightDockSeq'])if(rec[k]!=null)spec.data[k]=clone(rec[k]);
 const delivery=tallyThreeSource(state)?.delivery;
 spec.data.tallyThree=clone(rec.extra?.tallyThree)|| (delivery?{phase:'receipt',tick:Number.isSafeInteger(delivery.tick)?delivery.tick:state.tick,receiptId:delivery.receiptId}:{phase:'patrol',tick:state.tick});
 decorateTallyAssessorSpec(spec);
 if(rec.extra?.tallyThreeIdentityVersion===1){spec.physicsBody=clone(rec.extra.tallyThreeBody);if(!validTallyAssessor(spec))return null;}
 return spec;
}
