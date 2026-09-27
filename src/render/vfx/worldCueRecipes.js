// Composed semantic world cues. Legacy travel sheets hand off to this owner.
// A drill tile coordinate or destination sector id is never a world-space contact.
const recipe=(verb,primitive,color,life)=>Object.freeze({verb,primitive,color,life,continuous:false});
const travelVariants=Object.freeze({
  'travel.cruise.charging':recipe('travel-charge','capture',0x84d8ec,.88),
  'travel.cruise.engaged':recipe('travel-release','compression',0xa4ebff,.90),
  'travel.cruise.cancelled':recipe('travel-cool','deposition',0x84a7bd,.68),
  'travel.cruise.interrupted':recipe('travel-fail','pressure',0xf3a074,.92),
  'travel.jump.aligning':recipe('travel-charge','capture',0x8ab4ff,1.1),
  'travel.jump.commit_window':recipe('travel-lock','capture',0xc1e7ff,.66),
  'travel.jump.committed':recipe('travel-release','compression',0x8bd8ff,1.05),
  'travel.jump.failed':recipe('travel-fail','pressure',0xf2a276,.92),
  'travel.interdiction.triggered':recipe('travel-block','pressure',0xeb9277,1.1),
});
export const isComposedTravelCue=id=>Object.hasOwn(travelVariants,id);
const variants=Object.freeze({
  ...travelVariants,
  'mining.survey.pulse':recipe('survey','pressure',0x78bdcc,1.05),
  'mining.survey.resolved':recipe('cool','deposition',0x96c2c6,.62),
  'mining.survey.classified':recipe('command','induction',0x94dcd1,.82),
  'mining.survey.tracked':recipe('catch','capture',0x82c5dc,.68),
  'mining.survey.investigated':recipe('cool','deposition',0xbbd3bb,.90),
  'mining.seam.reward':recipe('harvest','deposition',0xeac081,.88),
  'mining.drill.seismic_pulse':recipe('survey','pressure',0xb5b58f,.74),
  'mining.drill.contact':recipe('grind','deposition',0xcfaa78,.40),
  'mining.drill.break':recipe('fling','pressure',0xdbbd89,.60),
  'mining.drill.yield':recipe('harvest','deposition',0xd6dca0,.78),
  'mining.drill.gas_hazard':recipe('prime','capture',0xe49a66,.75),
  // The closed receiver is a capacity warning, never a successful pickup/yield.
  'mining.cargo.full':recipe('prime','capture',0xd9a970,.68),
  'mining.heat.overheated':recipe('prime','capture',0xf09259,.64),
  // Ready means cooled and available; it does not claim that the pilot vented.
  'mining.vent.ready':recipe('cool','deposition',0x86bbc3,.62),
});

// Root merges this single variant recipe at the existing presentation:cue subscription.
// resolveWorldCueReceipt is the mandatory whitelist before ActionVfx selects a variant.
export const WORLD_CUE_ACTION_RECIPE=Object.freeze({
  ...recipe('cool','deposition',0x96c2c6,.62),variants,
});

const SOURCE_CUES=new Set(['mining.survey.pulse','mining.survey.resolved',
  'mining.heat.overheated','mining.vent.ready','mining.cargo.full']);
const HARDWARE_CUES=new Set(['mining.heat.overheated','mining.vent.ready','mining.cargo.full']);
const DETACHED_CUES=new Set(['mining.survey.pulse','mining.drill.seismic_pulse','mining.drill.break']);
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const body=(state,id)=>id==null?null:state.entities?.get?.(id);
const copy=p=>({x:p.x,y:Number.isFinite(p.y)?p.y:0,z:p.z});

/** Consume the normalized presentation envelope, never the drill UI's col/row.
 * Unknown/missing-position receivers fail closed rather than flash at the player.
 * A resolved scan is a local return at its transmitter: found counts do not invent
 * successful targets, and signal classification does not imply material collection. */
export function resolveWorldCueReceipt(payload,state={}){
  const kind=payload?.id;
  if(!Object.hasOwn(variants,kind))return null;
  const sourceId=payload.sourceId??null,source=body(state,sourceId);
  if(isComposedTravelCue(kind)){
    // The normalized source names the actual travelling hull; targetId can be a sector.
    if(!point(source?.pos)||source.alive===false)return null;
    const angle=Number.isFinite(payload.payload?.heading)?payload.payload.heading:source.rot||0;
    return {kind,targetId:sourceId,sourceId,pos:copy(source.pos),
      direction:{x:Math.cos(angle),z:Math.sin(angle)},attachToTarget:true};
  }
  const targetId=SOURCE_CUES.has(kind)?sourceId:payload.targetId??null;
  const target=body(state,targetId),liveTarget=target?.alive!==false&&point(target?.pos)?target:null;
  // Heat/capacity envelopes name the mined rock as context, so their normalized
  // position can be that rock. The affected hardware belongs to the named source miner.
  const anchor=HARDWARE_CUES.has(kind)?liveTarget?.pos:
    kind==='mining.survey.resolved'&&liveTarget?liveTarget.pos:
    point(payload.position)?payload.position:liveTarget?.pos;
  if(!point(anchor))return null;
  let direction=null;
  if(point(payload.direction)&&Math.hypot(payload.direction.x,payload.direction.z)>1e-6){
    direction={x:payload.direction.x,z:payload.direction.z};
  }else if(point(source?.pos)&&sourceId!==targetId){
    const x=anchor.x-source.pos.x,z=anchor.z-source.pos.z;
    if(Math.hypot(x,z)>1e-6)direction={x,z};
  }
  if(!direction&&Number.isFinite((liveTarget||source)?.rot)){
    const angle=(liveTarget||source).rot;direction={x:Math.cos(angle),z:Math.sin(angle)};
  }
  return {kind,targetId,sourceId,pos:copy(anchor),direction,
    sourcePos:point(source?.pos)?copy(source.pos):undefined,
    attachToTarget:!!liveTarget&&!DETACHED_CUES.has(kind)};
}
