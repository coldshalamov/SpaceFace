// Native contact integration regression: real bound measured wrecks, no ambient/game/GPU.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { isPhysicsBoundWholeHulk } from '../src/data/wholeShipVisualIdentity.js';

test('fitted wreck glances preserve finite dissipative contact and player/dynamic momentum with helm intact', async () => {
const DT = 1/60, sector = 'sector_helios_prime', seed = 47047;
const start = performance.now(), sim = createSimulation({ seed, systems: [aftermathWrecks] });
sim.state.mode = 'flight'; sim.state.world.currentSectorId = sector;
const datum = [
  ['ship_hawser', {x:-70,z:-140}, {x:28,z:0}, .12],
  ['ship_kestrel', {x:5,z:-132}, {x:0,z:0}, -.18],
  ['ship_mule', {x:0,z:140}, {x:0,z:0}, -.1],
];
const markers = datum.map(([id,pos,vel,rot],i) => {
  const ship=SHIPS.find(s=>s.id===id);
  return {markerId:`aft_contact_${id}`,sectorId:sector,wreckClass:'battlefield',
    victimId:100+i,victimDefId:id,victimVisual:{defId:id},
    victimRadius:ship.collisionRadius,victimMass:ship.mass,
    victimVel:vel,victimAngVel:0,victimRot:rot,victimPitch:0,victimBank:0,
    pos:sectorLocalToGlobalForSector(pos,sector),t:0,tick:0,
    wreckHull:1,wreckHullMax:1,salvagePool:{cmdty_scrap_metal:3}};
});
const aftermath=sim.registry.get('aftermathWrecks');
aftermath.deserialize({schemaVersion:3,seed,bySector:{[sector]:markers}});
assert.equal(aftermath._spawnForSector(sector),3);
const wrecks=datum.map(([id])=>sim.state.entityList.find(e=>e.data?.provenance?.markerId===`aft_contact_${id}`));
const player=sim.spawn({...makeShipEntitySpec('ship_kestrel',{isPlayer:true,
  pos:sectorLocalToGlobalForSector({x:-70,z:147},sector),rot:0}),vel:{x:35,z:0},angVel:0});
sim.state.playerId=player.id;
const bodies=[...wrecks,player];
const labels=new Map(bodies.map((e,i)=>[e.id,['Hawser wreck','Kestrel wreck','Mule wreck','ordinary player Kestrel'][i]]));
const native=await createSg02DynamicBodyOwner({publishTelemetry:false});
const stateOf=rec=>{
  const v=rec.body.linvel(),w=rec.body.angvel(),p=rec.body.translation();
  const mass=rec.body.mass(),inertia=rec.body.principalInertia().y;
  return {x:p.x,z:p.z,vx:v.x,vz:v.z,wy:-w.y,mass,inertia,
    energy:.5*mass*(v.x*v.x+v.z*v.z)+.5*inertia*w.y*w.y};
};
const states=()=>new Map(bodies.map(e=>[e.id,stateOf(native.records.get(e.id))]));
const pairEnergy=(frame,pair)=>pair.ids.reduce((sum,id)=>sum+frame.get(id).energy,0);
const pairs=[{name:'glancing heavy Hawser -> light Kestrel wreck',ids:[wrecks[0].id,wrecks[1].id],contacts:[]},
  {name:'ordinary player -> convex Mule wreck',ids:[player.id,wrecks[2].id],contacts:[]}];
let raw=null,rawBefore=null;
try {
  for(const e of wrecks) {
    assert.equal(isPhysicsBoundWholeHulk(e),true);
    assert.equal(aftermath._resolveBoundWreck(e.data.provenance.markerId),e);
  }
  native.syncFromEntities(bodies);
  const initial=states();
  const peak=new Map(bodies.map(e=>[e.id,{native:0,published:0}]));
  const materials=bodies.map(e=>{
    const rec=native.records.get(e.id),c=rec.colliders[0];
    return {id:e.id,label:labels.get(e.id),mass:rec.body.mass(),inertiaY:rec.body.principalInertia().y,
      nativeColliders:rec.colliders.length,material:rec.spec.material,restitution:c.restitution(),
      combineRule:c.restitutionCombineRule(),angularDamping:rec.body.angularDamping(),
      occupantGeneration:e.occupantGeneration,markerId:e.data?.provenance?.markerId||null};
  });
  const actualStep=native.world.step;
  native.world.step=function(...args){rawBefore=states();const result=actualStep.apply(this,args);raw=states();return result;};
  let ticks=0,lastContact=-1;
  for(;ticks<360;ticks++){
    native.step(DT,bodies);
    const final=states();
    for(const e of bodies){
      const r=raw.get(e.id),s=final.get(e.id),max=peak.get(e.id);
      assert.ok(Object.values(s).every(Number.isFinite));
      max.native=Math.max(max.native,Math.abs(r.wy));max.published=Math.max(max.published,Math.abs(s.wy));
      assert.ok(Math.abs(s.wy)<=6+1e-5,'existing native yaw sanity ceiling');
    }
    for(const receipt of native.drainContactImpacts()){
      const pair=pairs.find(p=>p.ids.includes(receipt.aId)&&p.ids.includes(receipt.bId));
      assert.ok(pair,'no unintended cross-lane collision');
      pair.contacts.push({tick:ticks,normal:receipt.normal,point:receipt.pos,
        impulse:receipt.impulse,energyBefore:pairEnergy(rawBefore,pair),
        rawEnergyAfter:pairEnergy(raw,pair),energyAfter:pairEnergy(final,pair),
        before:pair.ids.map(id=>rawBefore.get(id)),rawAfter:pair.ids.map(id=>raw.get(id)),
        after:pair.ids.map(id=>final.get(id))});
      if(pair.ids.includes(player.id)){
        const solver=raw.get(player.id),published=final.get(player.id);
        assert.equal(published.vx,solver.vx,'dynamic partner retains native equal-and-opposite X response');
        assert.equal(published.vz,solver.vz,'dynamic partner retains native equal-and-opposite Z response');
        assert.equal(published.wy,0,'player helm remains on its no-command yaw baseline');
      }
      lastContact=ticks;
    }
    if(pairs.every(p=>p.contacts.length)&&ticks-lastContact>=120) {ticks++;break;}
  }
  const final=states();
  const result={scope:'one deterministic SG02 scene; real aftermath-restored/bound wrecks plus canonical player; two spatially separate impact lanes',
    excludedOwners:'flight/AI/tumble/damage/salvage consumers and ambient systems are not stepped; native contact response only; no HP/material/clamp modifications',
    seed,dt:DT,ticks,simSeconds:ticks*DT,wallMs:performance.now()-start,materials,
    bodies:bodies.map(e=>({id:e.id,label:labels.get(e.id),initial:initial.get(e.id),final:final.get(e.id),
      peakAngularRadPerSecond:peak.get(e.id)})),
    pairs:pairs.map(pair=>{
      const first=pair.contacts[0],last=pair.contacts.at(-1);
      assert.ok(first,`${pair.name}: actual native force receipt`);
      const [a,b]=pair.ids.map(id=>final.get(id));
      const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
      const separationRate=((b.vx-a.vx)*dx+(b.vz-a.vz)*dz)/d;
      const initialEnergy=pairEnergy(initial,pair),finalEnergy=pairEnergy(final,pair);
      assert.ok(separationRate>0,'contact has resolved into finite separating motion');
      assert.ok(ticks-1-last.tick>=120,'two simulated seconds without another contact');
      return {name:pair.name,ids:pair.ids,forceReceiptTicks:pair.contacts.length,
        firstTick:first.tick,lastTick:last.tick,quietTicks:ticks-1-last.tick,
        initialEnergy,passiveEnergyCheck:finalEnergy<=initialEnergy*(1+1e-4),firstContactEnergy:{before:first.energyBefore,rawAfter:first.rawEnergyAfter,after:first.energyAfter},
        lastContactEnergy:last.energyAfter,finalEnergy,centerSeparation:d,separationRate,
        maxContactRawEnergyRatio:Math.max(...pair.contacts.map(c=>c.rawEnergyAfter/c.energyBefore)),
        maxContactPublishedEnergyRatio:Math.max(...pair.contacts.map(c=>c.energyAfter/c.energyBefore)),
        contacts:pair.contacts};
    })};
  assert.ok(peak.get(wrecks[0].id).native>1e-4 && peak.get(wrecks[1].id).native>1e-4,'glance creates actual multi-part spin');
  assert.equal(wrecks.every(e=>e.hull===1),true,'native-only check did not alter actual finite wreck HP');
  assert.equal(aftermathForSector(sim.state,sector).length,3);
  console.log('FITTED_CONTACT_RESULT',JSON.stringify({...result,pairs:result.pairs.map(({contacts,...p})=>p)}));
  assert.ok(result.pairs.every(p=>p.passiveEnergyCheck),'this zero-command contact scene gains no total kinetic energy');
}finally{native.dispose();sim.dispose();}
});
