// Receipt fixtures for the shipping subscription table. This module draws nothing.
// All positions below describe the isolated encounter; no extra source/contact metadata
// is added to a production receipt merely to make its presentation look better.
export const GAMEPLAY_ACTION_SCENARIOS = Object.freeze({
  repair:2.2, boost:1.2, harvest:1.8, fizzle:1.5, vent:2, cargo:1.6,
  'well-capture':1.8,'well-fling':1.6,'well-grind':1.6,'hitch-latch':1.6,
  'hitch-cut':1.6,'specialist-disrupt':1.8,'chain-prime':1.8,'chain-cool':1.6,
  'charge-combo':1.7,'action-transfer':2.2,'bomb-command':1.6,
  'mine-arm':1.8,'mine-detonate':1.8,
  'countermeasure-chaff':2,'countermeasure-ecm':1.8,'countermeasure-decoy':2.3,
  'charge-stick':1.6,'charge-arm':1.8,'snare-catch':1.8,'reel-pump':1.6,
  'snap-catch':1.8,'inertial-shunt':1.8,'corrosive-contact':2,'cryo-contact':2.2,
  'cloak-engage':1.8,'cloak-drop':1.6,'optic-contact':1.5,'optic-rekindle':1.9,
  'beacon-deploy':2,
});

export function createGameplayActions({state,owner,shipMesh,targetMesh}) {
  let scenario='idle',fired=false,lastPulse=-1,events=[];
  function reset(id='idle') {
    scenario=id;fired=false;lastPulse=-1;events=[];
    for(const id of ['lab-charge','lab-mine','lab-beacon'])state.entities.delete(id);
    const ship=state.entities.get(1),target=state.entities.get(2);
    if(ship){ship.view={root:shipMesh};delete ship.data.cm;}
    if(target)target.view={root:targetMesh};
    state.beacons=[];
  }
  function update() {
    if(!GAMEPLAY_ACTION_SCENARIOS[scenario]||state.simTime<.2)return;
    const continuous=scenario==='repair'||scenario==='action-transfer';
    if(fired&&(!continuous||state.simTime>1.1||state.simTime-lastPulse<.16))return;
    const ship=state.entities.get(1),target=state.entities.get(2);
    const s=ship.pos,t=target.pos,contact={x:t.x-target.radius*.85,z:t.z};
    const well={id:'lab-contact-field',kind:'well',ownerId:ship.id,center:{x:s.x+14,z:s.z+9},radius:190};
    state.fields.active=[well];
    const emit=(name,payload)=>{owner.fireEvent(name,payload);events.push({name,at:state.simTime,payload});};
    const charge={id:'lab-charge',type:'charge',alive:true,pos:{...contact},prevPos:{...contact},
      radius:2,rot:0,vel:{x:0,z:0},data:{ownerId:ship.id,hostId:target.id}};
    const mine={...charge,id:'lab-mine',type:'mine',pos:{x:s.x-14,z:s.z}};
    switch(scenario){
      case 'repair': emit('beam:repaired',{targetId:target.id,healAmount:.4});break;
      case 'action-transfer':emit('beam:transferred',{targetId:target.id});break;
      case 'boost':emit('ship:boostPreKick',{shipId:ship.id});break;
      case 'harvest':emit('mining:richCoreCompleted',{asteroidId:target.id});break;
      case 'fizzle':emit('mining:richCoreFizzle',{asteroidId:target.id});break;
      case 'vent':emit('salvage:reactorVented',{wreckId:target.id});break;
      case 'cargo':emit('cargo:caughtByNet',{podId:target.id,netId:ship.id});break;
      case 'well-capture':emit('well:capture',{schemaVersion:1,actorId:ship.id,wellId:well.id,sourceId:well.id,targetId:target.id,victimId:target.id,bodies:3,tick:12});break;
      case 'well-fling':emit('well:fling',{schemaVersion:1,actorId:ship.id,wellId:well.id,sourceId:well.id,targetId:target.id,victimId:target.id,primed:true,tick:12});break;
      case 'well-grind':emit('well:grind',{schemaVersion:1,aId:ship.id,bId:target.id,fieldId:well.id,ticks:12,pos:{x:(s.x+t.x)*.5,z:(s.z+t.z)*.5},tick:12});break;
      case 'hitch-latch':emit('fields:hitchLatched',{entityId:target.id,fieldId:well.id,sourceId:ship.id});break;
      case 'hitch-cut':emit('fields:hitchCut',{entityId:target.id,fieldId:well.id,sourceId:ship.id});break;
      case 'specialist-disrupt':emit('fields:specialistDisrupt',{sourceId:ship.id,count:2,radius:40});break;
      case 'chain-prime':emit('chain:primed',{schemaVersion:1,victimId:target.id,byId:ship.id,reason:'impulse',deltaV:18,durationS:1,until:1.2,windowS:1,link:1,tick:12});break;
      case 'chain-cool':emit('chain:primeEnded',{schemaVersion:1,victimId:target.id,reason:'expired',tick:12});break;
      case 'charge-combo':emit('charge:combo',{combo:'tailPop',ownerId:ship.id,targetId:target.id,impulse:200});break;
      case 'bomb-command':emit('bombs:commanded',{ownerId:ship.id,count:2,tick:12});break;
      case 'mine-arm':state.entities.set(mine.id,mine);emit('weapons:mineArmed',{mineId:mine.id,ownerId:ship.id,pos:mine.pos});break;
      case 'mine-detonate':state.entities.set(mine.id,mine);emit('weapons:mineDetonated',{mineId:mine.id,ownerId:ship.id,pos:mine.pos,blastRadius:36});break;
      case 'countermeasure-chaff':case 'countermeasure-ecm':case 'countermeasure-decoy':{
        const kind=scenario.slice(15),x=kind==='ecm'?s.x:s.x-ship.radius-5;
        ship.data.cm={effect:{cfg:{kind},originX:x,originZ:s.z,decoyId:'lab-diversion'},effectT:2};
        emit('countermeasure:deployed',{shipId:ship.id,kind,x:s.x,z:s.z,radius:40,durationS:2,decoyId:'lab-diversion'});break;
      }
      case 'charge-stick':state.entities.set(charge.id,charge);emit('charge:stuck',{chargeId:charge.id,hostId:target.id,pos:{...contact}});break;
      case 'charge-arm':state.entities.set(charge.id,charge);emit('charge:armed',{chargeId:charge.id,pos:{...contact}});break;
      case 'snare-catch':emit('massline:snareCaught',{deploymentId:'lab-snare',attachmentId:'lab-link',anchorId:ship.id,targetId:target.id,transverseSpeed:12,pos:contact});break;
      case 'reel-pump':emit('tether:reelPump',{targetId:target.id,time:.2,tick:12,reelStrength:.8,strain:.6,risk:.3});break;
      case 'snap-catch':emit('tether:snapCatch',{targetId:target.id,latchTime:0,snapTime:.1,landTime:.2,snapRelSpeed:28,landTangentialSpeed:20,quality:.8,rating:'clean'});break;
      case 'inertial-shunt':emit('weapons:inertialShunt',{shunterId:ship.id,targetId:target.id,targetDeltaV:18,shunterDeltaV:4});break;
      case 'corrosive-contact':emit('cargo:volatileCorrosive',{class:'corrosive',podId:target.id,targetId:ship.id,hullTick:2});break;
      case 'cryo-contact':emit('cargo:volatileCryo',{class:'cryo',podId:target.id,targetId:ship.id,closingSpeed:12,durationTicks:80});break;
      case 'cloak-engage':emit('cloak:engaged',{radius:ship.radius,energy:40});break;
      case 'cloak-drop':emit('cloak:dropped',{reason:'released',energy:30});break;
      case 'optic-contact':emit('optic:contact',{kind:'reflect',reason:'contact',materialId:'diamond',projectileId:'lab-optic',targetId:target.id,ownerId:ship.id,pos:contact,rays:2,spent:false});break;
      case 'optic-rekindle':emit('optic:rekindled',{targetId:target.id,structureId:'lab-crystal',cell:2,materialId:'diamond',pos:contact});break;
      case 'beacon-deploy':state.beacons=[{id:'lab-record',entityId:'lab-beacon'}];state.entities.set('lab-beacon',{...charge,id:'lab-beacon'});emit('beacon:deployed',{id:'lab-record',pos:contact});break;
    }
    fired=true;lastPulse=state.simTime;
  }
  return {reset,update,inspect:()=>({scenario,events})};
}
