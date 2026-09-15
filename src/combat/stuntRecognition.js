// PQ-146 revision 2. Physical witnesses, never action requests or scalar hitstun notifications.
import { angleBetween, EVIDENCE_REVISION } from './stuntEvidence.js';
export const STUNT_SCHEMA_VERSION = 2;
export const TrickRarity = Object.freeze({ COMMON:'common', UNCOMMON:'uncommon', RARE:'rare', LEGENDARY:'legendary' });
const rows = [
  ['bolas','Bolas','tether',90],['wrecking_ball','Wrecking Ball','tether',90],['clothesline','Clothesline','tether',140],
  ['collateral','Collateral',null,0],['near_miss','Close Shave',null,0],['tow_kill','Tow-kill','tether',90],
  ['rock_discovery','Rock Discovery','impact',50],['well_golf','Well Golf','field',140],['dead_mans_mass',"Dead Man's Mass",'debris',140],
  ['razor_release','Razor Release',null,0],['bank_job','Bank Job','rebound',90],['return_to_sender','Return to Sender','rebound',140],
  ['kickstart','Kickstart','escape',140],['needle_thread','Needle Thread','escape',140],['one_two','One-Two','impact',140],
  ['slingshot_golf','Slingshot Golf','field',200],
];
export const TRICK_DEFINITIONS = Object.freeze(Object.fromEntries(rows.map(([id,name,family,baseScore]) => [id,Object.freeze({id,name,family,baseScore,
  role: family ? 'primary' : id === 'near_miss' ? 'bridge' : 'modifier',
  rarity: baseScore===200?'legendary':baseScore===140?'rare':baseScore===90?'uncommon':'common' })])));
export const KNOWN_TRICK_IDS = Object.freeze(Object.keys(TRICK_DEFINITIONS));
export const STUNT_CONSTANTS = Object.freeze({ IMPULSE_WINDOW_TICKS:480, SLING_WINDOW_TICKS:480, CHAIN_WINDOW_TICKS:180 });
const PRECEDENCE = ['slingshot_golf','one_two','return_to_sender','clothesline','dead_mans_mass','well_golf','bolas','tow_kill','wrecking_ball','bank_job','rock_discovery','needle_thread','kickstart'];
export function createStuntDetector(options={}) { return new StuntDetector(options); }
const within = (end,start,limit) => Number.isFinite(end)&&Number.isFinite(start)&&end>=start&&end-start<=limit;
const material = r => r.damageApplied===true && (r.targetKilled===true || (r.hullDamage>=r.targetHullMax*0.25 && r.targetHullMax>0 && r.helmLossSeconds>=1));

export function classifyStuntEvidence(receipt) {
  const e=receipt?.stuntEvidence;
  if (e?.revision!==EVIDENCE_REVISION || !e.root || !e.path || (!e.contact&&!receipt.escape)) return [];
  const {root:r,path:p,contact:c}=e, tick=receipt.tick;
  if (r.truncated || !within(tick,r.tick,480) || p.edges>4 || !within(tick,p.tick,180)) return [];
  if(receipt.escape) {
    if(receipt.escape.completed!==true||!r.threatAtRoot||!within(tick,r.tick,180))return [];
    if(r.needle&&r.escape?.boundaryIds?.length===2)return ['needle_thread'];
    const launch=r.nodes.find(n=>n.kind==='launch_retained'&&n.deltaV>=.3*r.reference.cruise&&n.exitSpeed>=1.25*r.reference.cruise
      &&n.retainedSpeed>=.9*n.exitSpeed&&n.retainedTicks>=45);
    return launch&&r.sourceId===r.actorId?['kickstart']:[];
  }
  if (receipt.targetHostile!==true || !material(receipt)) return [];
  const u=r.reference.cruise, constraint=r.constraint, release=r.release;
  if (!(u>0)) return [];
  const targetRef=c.aId===receipt.targetId?c.aRef:c.bRef;
  const out=[];
  const add=(id,yes)=>{if(yes) out.push(id);};
  const swing=constraint && constraint.loadedTicks>=15 && constraint.sweep>=60;
  const attached=constraint?.attached===true || (release?.reason==='break' && release.tick===tick);
  const victimIsPayload=receipt.targetId===r.sourceId;
  const terrain=receipt.surface==='terrain'||receipt.surface==='structure';
  add('rock_discovery',victimIsPayload&&terrain&&within(tick,r.tick,180)&&p.closingSpeed>=0.5*u);
  add('bolas',swing&&release&&within(tick,release.tick,180)&&!victimIsPayload&&r.sourceType==='ship'&&r.sourceDeathTick==null&&p.closingSpeed>=0.5*u);
  add('wrecking_ball',constraint&&attached&&constraint.loadedTicks>=15&&constraint.loadedTicks<=120&&constraint.sweep>=45
    &&!victimIsPayload&&r.reference.mass>=0.5*targetRef.mass&&p.closingSpeed>=0.5*targetRef.cruise);
  add('tow_kill',constraint&&attached&&victimIsPayload&&receipt.targetKilled&&constraint.loadedTicks>=18&&constraint.loadedTicks<=180
    &&constraint.displacement>=2*r.reference.length&&(terrain||(receipt.otherMass>=150)));
  add('dead_mans_mass',!victimIsPayload&&r.sourceDeathTick!=null&&r.tick>r.sourceDeathTick&&within(tick,r.tick,180)
    &&r.reference.mass>=0.2*(r.sceneReferenceMass??16)&&(angleBetween(r.before,r.after)>=25||Math.hypot(r.dv.x,r.dv.z)>=0.3*u));
  const second=e.previousRoot;
  add('one_two',second&&within(r.tick,second.tick,120)&&r.tick-second.tick>=12&&within(tick,r.tick,120)
    &&within(tick,second.tick,480)&&angleBetween(r.before,r.after)>=45&&Math.hypot(r.dv.x,r.dv.z)>=0.2*u
    &&r.tick-(second.nodes.at(-1)?.endTick??second.tick)>=12);
  const field=r.nodes.find(n=>n.kind==='field_exit'&&n.entryCausal===true&&n.bend>=35&&n.deltaV>=0.2*u&&within(tick,n.tick,180));
  add('well_golf',field);
  add('slingshot_golf',field&&swing&&release&&within(field.entryTick,release.tick,120)&&within(tick,field.tick,120));
  const intercept=r.nodes.find(n=>n.kind==='line_intercept'&&n.loadedTicks>=9&&n.endpointDisplacement>0&&n.deltaV>=0.3*u&&within(tick,n.tick,120));
  add('clothesline',intercept&&intercept.crossedPriorCorridor===true&&within(intercept.tick,intercept.displacementTick,90));
  const bank=r.nodes.find(n=>n.kind==='reflection'&&n.angle>=25&&n.unreflectedMiss===true&&n.directOccluded===true&&within(tick,n.tick,120));
  add('bank_job',bank&&((bank.surfaceDisplacement>=bank.surfaceWidth&&bank.surfaceWidth>0)||bank.surfaceTurn>=20
    ||(bank.playerDisplacement>=r.playerLength&&bank.playerTurn>=25))&&within(r.tick,bank.solutionTick,120));
  add('return_to_sender',r.projectileOwnerId===receipt.targetId&&angleBetween(r.before,r.after)>=60
    &&r.originalMissesOwner===true&&within(tick,r.tick,120)&&(r.kind!=='passive_reflect'));
  const launch=r.nodes.find(n=>n.kind==='launch_retained'&&n.deltaV>=0.3*u&&n.exitSpeed>=1.25*u&&n.retainedSpeed>=0.9*n.exitSpeed&&n.retainedTicks>=45);
  add('kickstart',launch&&r.sourceId===r.actorId&&r.threatAtRoot!=null&&within(tick,r.tick,180));
  return out.sort((a,b)=>PRECEDENCE.indexOf(a)-PRECEDENCE.indexOf(b));
}

export class StuntDetector {
  constructor({playerId=null}={}) { this.playerId=playerId;this.tick=0;this.incidents=new Map();this.detectedTricks=[]; }
  setPlayerId(id) { this.playerId=id??null; }
  processTrace(events) {
    return [...events].sort((a,b)=>(a.tick??a.data?.tick??0)-(b.tick??b.data?.tick??0)
      || String(a.type).localeCompare(String(b.type))).flatMap(e=>this.processEvent(e.type??e.event,e.data??e.payload??e));
  }
  processEvent(name,receipt) {
    if (!receipt || !Number.isFinite(receipt.tick)) return [];
    this.tick=Math.max(this.tick,receipt.tick);
    if (name!=='combat:collisionConsequence'&&name!=='stunt:escapeConsequence') return [];
    const e=receipt.stuntEvidence,r=e?.root;
    if (!r || this.playerId==null || r.actorId!==this.playerId) return [];
    const candidates=classifyStuntEvidence(receipt);
    if (!candidates.length) return [];
    const episodeId=candidates.includes('one_two')?r.previousRoot:r.id;
    const old=this.incidents.get(episodeId);
    if (old && (receipt.tick>old.amendmentDeadline || old.finalized)) return [];
    const terminal=receipt.victimLife;
    if (!terminal || terminal.lifeId==null) return [];
    const lives=old ? old.victimLives.map(v=>({...v})) : [];
    const previous=lives.find(v=>v.lifeId===terminal.lifeId);
    if (previous) {
      const moreSpecific=PRECEDENCE.indexOf(candidates[0])<PRECEDENCE.indexOf(old.trickId);
      const newRelease=(r.release?.grade??null)!==(old.modifiers?.razorRelease??null);
      if((previous.dead||!terminal.dead)&&!moreSpecific&&!newRelease)return [];
      previous.dead=previous.dead||terminal.dead;
    }
    else { if(lives.length>=8)return [];lives.push({...terminal}); }
    const primary=old&&PRECEDENCE.indexOf(old.trickId)<PRECEDENCE.indexOf(candidates[0])?old.trickId:candidates[0];
    const def=TRICK_DEFINITIONS[primary];
    const collateralCount=e.path.edges>1 ? lives.length : old?.modifiers.collateralCount??1;
    const razor=r.release&&within(receipt.tick,r.release.tick,180)?r.release.grade:null;
    const modifiers={razorRelease:razor,collateralCount,closeShave:receipt.escape?.closeShave===true&&primary!=='needle_thread'};
    const chain=r.nodes.map((n,i)=>({step:i+1,type:n.kind,entityId:n.entityId??n.sourceId,targetId:n.targetId,
      tick:n.tick,detail:n.kind, ...n}));
    const trick={schemaVersion:2,trickId:primary,name:def.name,rarity:def.rarity,baseScore:def.baseScore,family:def.family,
      actorId:r.actorId,targetId:receipt.targetId,secondaryIds:[r.sourceId],episodeId,rootId:episodeId,rootTick:e.previousRoot?.tick??r.tick,
      tick:receipt.tick,firstPayoffTick:old?.firstPayoffTick??receipt.tick,amendment:!!old,
      amendmentDeadline:old?.amendmentDeadline??Math.min(receipt.tick+180,r.tick+480),victimLives:lives,modifiers,
      causeChain:chain, factualTags:candidates.slice(1), evidenceRevision:EVIDENCE_REVISION,encounterId:r.encounterId,
      pureEscape:!!receipt.escape,threatEpisodeId:receipt.escape?.threatEpisodeId,
      consequence:{killed:receipt.targetKilled,escaped:!!receipt.escape,hullDamage:receipt.hullDamage,hullMax:receipt.targetHullMax,helmLossSeconds:receipt.helmLossSeconds},
      metrics:{payloadMass:r.reference.mass,playerDryHullMass:r.playerMass,usefulDeltaV:e.path.usefulDeltaV,referenceCruise:r.reference.cruise,
        normalClosingSpeed:e.path.closingSpeed,availableMomentum:Math.max(old?.metrics?.availableMomentum??0,e.path.momentum??0),referenceMomentum:r.referenceMomentum??0,
        mass:r.reference.mass,deltaV:e.path.usefulDeltaV,collateralCount,selfLaunch:r.sourceId===r.actorId,projectileOnly:r.sourceType==='projectile'},
      sourceRadius:r.reference.radius,terminalPos:e.contact?(e.contact.aId===receipt.targetId?e.contact.aPos:e.contact.bPos):null,
      sourceName:r.sourceName??String(r.sourceId),targetName:receipt.targetName??String(receipt.targetId)};
    this.incidents.set(episodeId,trick);
    if(this.incidents.size>256)this.incidents.delete(this.incidents.keys().next().value);
    this.detectedTricks.push(trick);if(this.detectedTricks.length>64)this.detectedTricks.shift();
    return [trick];
  }
  serialize() { return {revision:2,tick:this.tick,incidents:[...this.incidents]}; }
  deserialize(raw) { if(raw?.revision===2){this.tick=raw.tick;this.incidents=new Map((raw.incidents??[]).slice(-256));} }
}
