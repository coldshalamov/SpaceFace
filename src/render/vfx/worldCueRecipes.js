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
const miningVariants=Object.freeze({
  'mining.fracture.anticipation':{...recipe('grind','deposition',0xe7b779,.8),surfaceWork:true},
  'mining.fracture.released':{...recipe('harvest','deposition',0xd5c8a6,.95),surfaceWork:true},
  'mining.rich_core.exposed':{...recipe('repair','deposition',0xbda3ff,1.05),surfaceWork:true},
  'mining.rich_core.charge':{...recipe('catch','capture',0xc2d9ff,.90),surfaceWork:true,surfaceCapture:true},
  'mining.chunk.tether_required':{...recipe('catch','capture',0xe6ba7c,.95),surfaceWork:true,surfaceCapture:true},
  'mining.yield.collected':{...recipe('harvest','deposition',0xd4dcad,.78),surfaceWork:true},
});
export const isComposedMiningCue=id=>Object.hasOwn(miningVariants,id);
// FB-142 — the planet verbs have a shape. The collector mouth opening (skim intake), the
// settled yield depositing into the hold, a refused deposit priming on the closed hold (the
// mining.cargo.full register — a capacity warning, never a success), the plunge ring advancing
// a stage, and the recovery burn shoving back out of the well. planetRuntime emits one cue
// beside each planet:* event; the receipt anchors on the working ship, not the planet centre.
const planetVariants=Object.freeze({
  'planet.skim.intake':recipe('catch','capture',0x9fd8e8,.7),
  'planet.harvest.deposit':recipe('harvest','deposition',0xc9e6a0,.78),
  'planet.harvest.denied':recipe('prime','capture',0xd9a970,.68),
  'planet.plunge.stage':recipe('ignition','compression',0xff8a5c,.8),
  'planet.recovery.burn':recipe('ignition','compression',0xffb070,.7),
});
export const isComposedPlanetCue=id=>Object.hasOwn(planetVariants,id);
const variants=Object.freeze({
  ...travelVariants,...miningVariants,...planetVariants,
  'mining.survey.pulse':recipe('survey','pressure',0x78bdcc,1.05),
  'mining.survey.resolved':recipe('cool','deposition',0x96c2c6,.62),
  'mining.survey.classified':recipe('command','induction',0x94dcd1,.82),
  'mining.survey.tracked':recipe('catch','capture',0x82c5dc,.68),
  'mining.survey.investigated':recipe('cool','deposition',0xbbd3bb,.90),
  // FB-131 — the scanner speaks: a ghost that slips past range leaves a fading mark at its
  // last-known position, a counted bearing ticks at the player's own instrument, and a
  // revealed wreck/cache blooms where the reveal happened. No new layer, no anomaly position.
  'mining.survey.escaped':recipe('cool','deposition',0x9fb4c4,.85),
  'mining.survey.bearing':recipe('survey','induction',0x9fd4e8,.55),
  'mining.survey.revealed':recipe('command','capture',0xaedecf,.95),
  'mining.seam.reward':recipe('harvest','deposition',0xeac081,.88),
  'mining.drill.seismic_pulse':recipe('survey','pressure',0xb5b58f,.74),
  'mining.drill.contact':{...recipe('grind','deposition',0xcfaa78,.40),surfaceWork:true},
  'mining.drill.break':recipe('fling','pressure',0xdbbd89,.60),
  'mining.drill.yield':{...recipe('harvest','deposition',0xd6dca0,.78),surfaceWork:true},
  'mining.drill.gas_hazard':{...recipe('prime','capture',0xe49a66,.75),surfaceWork:true,surfaceCapture:true},
  // The closed receiver is a capacity warning, never a successful pickup/yield.
  'mining.cargo.full':recipe('prime','capture',0xd9a970,.68),
  // PIC-28: a hot dock leaves pods on the apron. Amber deposition at the berth so the
  // spill is seen where it happened, not only counted in the hold and the toast.
  'cargo.spill.berth':recipe('harvest','deposition',0xe0a45c,.9),
  // PIC-26: the scavenger's cut is a torch mark on the wreck at the contact, not a new marker.
  'wreck.scavenge.cut':{...recipe('grind','deposition',0xf0b060,.45),surfaceWork:true},
  // PIC-27: the cooking core and the ejected core are bodies you can follow, not a countdown.
  'salvage.cooker.tracked':recipe('prime','capture',0xff8844,.8),
  'salvage.core.tracked':recipe('prime','capture',0xff6a3c,.9),
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
  // FB-131: a bearing is an instrument tick at the player's hull — never an anchor on the
  // (still unrevealed) anomaly the bearing points toward.
  'mining.survey.bearing',
  'mining.heat.overheated','mining.vent.ready','mining.cargo.full']);
const HARDWARE_CUES=new Set(['mining.heat.overheated','mining.vent.ready','mining.cargo.full']);
const DETACHED_CUES=new Set(['mining.survey.pulse','mining.drill.seismic_pulse','mining.drill.break',
  // The escaped ghost is already gone; its mark is a memory at last-known position, not a track.
  'mining.survey.escaped']);
const TRACKED_BODY_CUES=new Set(['salvage.cooker.tracked','salvage.core.tracked']);
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const body=(state,id)=>id==null?null:state.entities?.get?.(id);
const copy=p=>({x:p.x,y:Number.isFinite(p.y)?p.y:0,z:p.z});

function bodyByTrackKey(state,key){
  if(!key)return null;
  const index=state.entityIndex;
  const lists=[];
  if(index&&index.ready===true&&Array.isArray(index.pickups))lists.push(index.pickups);
  if(index&&index.ready===true&&Array.isArray(index.wrecks))lists.push(index.wrecks);
  if(!lists.length&&state.entities&&typeof state.entities.values==='function')lists.push(state.entities.values());
  for(let l=0;l<lists.length;l++){
    for(const entity of lists[l]){
      if(!entity||entity.alive===false)continue;
      if(entity.data&&entity.data.trackKey===key&&point(entity.pos))return entity;
    }
  }
  return null;
}

function trackedBodyReceipt(payload,state){
  const named=body(state,payload.targetId);
  const liveNamed=named&&named.alive!==false&&point(named.pos)?named:null;
  const tracked=liveNamed||bodyByTrackKey(state,payload.trackKey);
  const anchor=tracked?tracked.pos:point(payload.position)?payload.position:null;
  if(!point(anchor))return null;
  let direction=null;
  if(point(payload.direction)&&Math.hypot(payload.direction.x,payload.direction.z)>1e-6){
    direction={x:payload.direction.x,z:payload.direction.z};
  }else if(point(payload.velocity)&&Math.hypot(payload.velocity.x,payload.velocity.z)>1e-6){
    direction={x:payload.velocity.x,z:payload.velocity.z};
  }else if(Number.isFinite(tracked?.rot)){
    direction={x:Math.cos(tracked.rot),z:Math.sin(tracked.rot)};
  }
  return {kind:payload.id,targetId:tracked?tracked.id:(payload.targetId??null),
    sourceId:payload.sourceId??null,pos:copy(anchor),direction,trackedBody:true,
    attachToTarget:!!tracked};
}

/** Consume the normalized presentation envelope, never the drill UI's col/row.
 * Unknown/missing-position receivers fail closed rather than flash at the player.
 * A resolved scan is a local return at its transmitter: found counts do not invent
 * successful targets, and signal classification does not imply material collection. */
export function resolveWorldCueReceipt(payload,state={}){
  const kind=payload?.id;
  if(!Object.hasOwn(variants,kind))return null;
  if(TRACKED_BODY_CUES.has(kind))return trackedBodyReceipt(payload,state);
  const sourceId=payload.sourceId??null,source=body(state,sourceId);
  if(isComposedTravelCue(kind)){
    // Travel names the hull as source, except interdiction: that envelope names
    // the sector as source and the intercepted hull as receiver.
    const hullId=kind==='travel.interdiction.triggered'?payload.targetId:sourceId;
    const hull=body(state,hullId);
    if(!point(hull?.pos)||hull.alive===false)return null;
    const angle=Number.isFinite(payload.payload?.heading)?payload.payload.heading:hull.rot||0;
    return {kind,targetId:hullId,sourceId:hullId,pos:copy(hull.pos),
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
  const atBodyCenter=liveTarget&&Math.hypot(anchor.x-liveTarget.pos.x,anchor.z-liveTarget.pos.z)<Math.max(1,liveTarget.radius*.20);
  return {kind,targetId,sourceId,pos:copy(anchor),direction,bodySurface:!!atBodyCenter,
    sourcePos:point(source?.pos)?copy(source.pos):undefined,
    attachToTarget:!!liveTarget&&!DETACHED_CUES.has(kind)};
}

const seamKey = (payload) => `${payload && payload.fieldId || ''}:${payload && payload.activityObjectSlotId || ''}`;

function seamRock(state, payload) {
  const entities = state && state.entities;
  if (!entities || typeof entities.values !== 'function') return null;
  const fieldId = payload && payload.fieldId;
  const slot = payload && payload.activityObjectSlotId;
  const asteroidId = payload && payload.asteroidId;
  let fallback = null;
  for (const entity of entities.values()) {
    if (!entity || entity.alive === false || entity.type !== 'asteroid') continue;
    if (asteroidId != null && entity.id === asteroidId) return entity;
    const data = entity.data || {};
    if (fieldId && slot && data.fieldId === fieldId && data.activityObjectSlotId === slot) return entity;
    if (fieldId && data.fieldId === fieldId && data.activityObjectSlotId) fallback = fallback || entity;
  }
  return fallback;
}

/** One glint on the open seam rock. A second open for the same seam returns that record. */
export function admitRichSeamGlint(state, payload = {}) {
  if (!state) return null;
  const presentation = state.presentation && typeof state.presentation === 'object'
    ? state.presentation
    : (state.presentation = {});
  const key = seamKey(payload);
  const prev = presentation.richSeamGlint;
  if (prev && prev.ended !== true && prev.key === key) return prev;
  const rock = seamRock(state, payload);
  const record = {
    id: 'rich-seam-glint',
    kind: 'glint',
    key,
    targetId: rock ? rock.id : null,
    fieldId: payload.fieldId || null,
    activityObjectSlotId: payload.activityObjectSlotId || null,
    pos: rock && rock.pos && Number.isFinite(rock.pos.x) && Number.isFinite(rock.pos.z)
      ? { x: rock.pos.x, y: Number.isFinite(rock.pos.y) ? rock.pos.y : 0, z: rock.pos.z }
      : null,
    ended: false,
    mapMarker: false,
  };
  presentation.richSeamGlint = record;
  if (rock) {
    if (!rock.data) rock.data = {};
    rock.data.richSeamGlint = record.id;
  }
  return record;
}

/** field:richSeamWorked / field:richSeamMissed ends the one live glint. */
export function endRichSeamGlint(state, payload = {}) {
  const presentation = state && state.presentation;
  const rec = presentation && presentation.richSeamGlint;
  if (!rec || rec.ended === true) return null;
  // Only ONE glint is ever live, and several seams may hold open records — a resolution
  // receipt that names a different seam must not kill this one. A payload carrying no
  // seam identity (legacy emits) keeps the old unconditional end.
  const key = seamKey(payload);
  if (key !== ':' && rec.key && key !== rec.key) return null;
  rec.ended = true;
  const rock = seamRock(state, { ...payload, asteroidId: rec.targetId })
    || (rec.targetId != null && state.entities && state.entities.get && state.entities.get(rec.targetId));
  if (rock && rock.data && rock.data.richSeamGlint === rec.id) delete rock.data.richSeamGlint;
  presentation.richSeamGlint = null;
  return rec;
}

export function richSeamGlintRecord(state) {
  const rec = state && state.presentation && state.presentation.richSeamGlint;
  return rec && rec.ended !== true ? rec : null;
}
