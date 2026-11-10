import test from 'node:test';
import assert from 'node:assert/strict';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const directive = { objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture', targetObserved: true },
  formation: { kind:'wedge', slot:{x:0,z:0}, velocity:{x:0,z:0}, bound:170, breakFormation:false } };
function frame(x=380, z=0) {
  return { self: { id:2, team:1, pos:{x:0,z:0}, vel:{x:0,z:0}, rot:0,
    activity:{kind:ActivityKind.ATTACK_RUN,reason:'fixture',anchor:{x:0,z:0},leashRadius:2600,startedTick:0},
    roe:RulesOfEngagement.WEAPONS_FREE },
    contacts:[{ id:1,kind:ContactKind.SHIP,alive:true,valid:true,visible:true,ageTicks:0,hostile:true,confidence:1,threat:.7,
      pos:{x,z},vel:{x:0,z:0},operationalMassBand:'medium',mobilityBand:'medium',cargoBand:'empty',tetherabilityBand:'good',tags:[] }], events:[] };
}
function fixture(doctrineId) {
  const target={id:1,occupantGeneration:1,type:'ship',alive:true,team:0,pos:{x:380,z:0},vel:{x:0,z:0},rot:0,data:{}};
  const shooter={id:2,occupantGeneration:1,type:'ship',alive:true,team:1,pos:{x:0,z:0},vel:{x:0,z:0},rot:0,
    data:{intent:{fire:false},combat:{},weapons:[{projSpeed:320,gimbalArc:1.2}],ai:{passive:false,lawful:false,forcePlayerTarget:true,
      hostileTeams:[0],motive:'cargo_extortion',engagementTrigger:'explicit_refusal',zoneId:'zone_fixture',approachTelegraph:'engine_flare',noFireResponseWindowS:1,
      combatDoctrineId:doctrineId,activity:normalizeActivity({kind:ActivityKind.ATTACK_RUN,reason:'fixture',anchor:{x:0,z:0},leashRadius:2200,startedTick:0}),roe:RulesOfEngagement.WEAPONS_FREE}}};
  const state={tick:60,simTime:1,playerId:1,player:{heat:0},world:{currentSectorId:'sector_fixture'},
    entities:new Map([[1,target],[2,shooter]]),entityList:[target,shooter],combat:{trace:{events:[]}}};
  const runtime=new CombatDoctrineRuntime({seed:808});
  const update=(tick,x=380,z=0)=>runtime.update({tick,entityId:2,doctrineId,perception:frame(x,z),directive});
  const fire=(doctrine,{targetId=1,observed=true}={})=>applyAIFiringIntent({entityId:2,
    directive:{objective:{kind:ObjectiveKind.FOCUS,targetId,targetObserved:observed,reason:`combat_doctrine:${doctrineId}:${doctrine.phase}`}},
    action:{actionId:'action_burst'},combatDoctrine:doctrine},state);
  return {state,target,shooter,update,fire};
}
for (const role of [CombatDoctrineId.INTERCEPTOR_FLYBY,CombatDoctrineId.BRAWLER_COMMIT]) {
  test(`${role}: delayed arrival fire cannot re-anchor an escaped warning`,()=>{
    const h=fixture(role), cue=h.update(60);
    assert.equal(cue.phase,'engine_flare');
    h.shooter.data.ai.swarmFireHoldUntil=1.9; h.fire(cue);
    assert.equal(h.shooter.data.intent.fire,false);
    const run=h.update(90); assert.ok(run.fireWindow);
    const later=h.update(114,380,260); assert.ok(later.fireWindow);
    h.target.pos={x:380,z:260}; h.shooter.rot=Math.atan2(260,380); h.state.tick=114; h.state.simTime=1.9;
    h.fire(later); assert.equal(h.shooter.data.intent.fire,true);
    const delta=Math.abs(wrap(h.shooter.data.intent.aimAngle-cue.aimCommit.bearing));
    assert.ok(delta<=cue.aimCommit.capRad+1e-9,`released ${delta.toFixed(3)} outside ${cue.aimCommit.capRad}`);
  });
  test(`${role}: a recycled target cannot inherit a run, but a newly announced run can fire`,()=>{
    const h=fixture(role), cue=h.update(60); h.fire(cue);
    const run=h.update(90); h.state.tick=90; h.fire(run); assert.equal(h.shooter.data.intent.fire,true);
    const replacement={...h.target,occupantGeneration:2,pos:{x:380,z:20},data:{}};
    h.state.entities.set(1,replacement); h.state.entityList[0]=replacement;
    h.fire(run); assert.equal(h.shooter.data.intent.fire,false,'old run cannot authorize replacement life');
    const fresh={...run,aimCommit:{...run.aimCommit,bearing:.1,untilTick:run.aimCommit.untilTick+100},phaseStartedTick:200};
    h.state.tick=200; h.shooter.rot=.1; h.fire(fresh);
    assert.equal(h.shooter.data.intent.fire,true,'fresh warning may engage the replacement');
    replacement.team=1; h.fire(fresh); assert.equal(h.shooter.data.intent.fire,false,'authority can revoke the fresh shot');
  });
  test(`${role}: lost, unseen, switched, and expired targets cannot fire the old run`,()=>{
    const h=fixture(role), cue=h.update(60); h.fire(cue);
    const run=h.update(90); h.state.tick=90;
    h.fire(run,{observed:false}); assert.equal(h.shooter.data.intent.fire,false);
    h.target.alive=false; h.fire(run); assert.equal(h.shooter.data.intent.fire,false);
    h.target.alive=true; h.state.entities.delete(1); h.fire(run); assert.equal(h.shooter.data.intent.fire,false);
    h.state.entities.set(1,h.target);
    const other={...h.target,id:3,occupantGeneration:1,data:{}}; h.state.entities.set(3,other);
    h.fire(run,{targetId:3}); assert.equal(h.shooter.data.intent.fire,false,'a different target needs a new warning');
    h.state.tick=run.aimCommit.untilTick+1; h.fire(run); assert.equal(h.shooter.data.intent.fire,false,'expired warning cannot fire');
  });
  test(`${role}: a recycled shooter cannot carry an old firing window`,()=>{
    const h=fixture(role), cue=h.update(60); h.fire(cue);
    const run=h.update(90); h.state.tick=90; h.fire(run); assert.equal(h.shooter.data.intent.fire,true);
    h.shooter.occupantGeneration=2; h.fire(run);
    assert.equal(h.shooter.data.intent.fire,false);
    const fresh={...run,aimCommit:{...run.aimCommit,untilTick:run.aimCommit.untilTick+100},phaseStartedTick:200};
    h.state.tick=200; h.fire(fresh); assert.equal(h.shooter.data.intent.fire,true);
  });
}
