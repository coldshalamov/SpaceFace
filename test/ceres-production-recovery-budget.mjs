import assert from 'node:assert/strict';

// Test-only allowance for an already active, finite authored recovery. It never
// changes production time, controls, poses, ownership, plans or their deadlines.
export function captureProductionWorkfleet(state, C) {
  const names=['worker','cutterHead','payload','cradle'];
  const rows=names.map(role=>{const owners=state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===C.identities[role]);assert.ok(owners.length<=1,'unique live commissioning role');return owners[0];});
  return rows.every(Boolean)?rows.map(e=>({e,id:e.id,life:e.occupantGeneration,record:e.data.worldRecordId,structure:JSON.stringify([e.type,e.mass,e.data.worldSiteId,e.data.worldSitePayloadId,e.data.worldSiteStructural,e.data.persistenceOwner])})):null;
}
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const finite=e=>[e.pos?.x,e.pos?.z,e.rot,e.vel?.x,e.vel?.z,e.angVel].every(Number.isFinite);
const signature=p=>JSON.stringify([p.schemaVersion,p.kind,p.startedTick,p.deadlineTick,p.start,p.plate,p.turn,p.stage]);
export function allowProductionRecovery({state,native,originalBodies,restorePlan,restoreReturnBudget,atPose,settleTicks=1800,normalLimit=12000}) {
  assert.equal(state.tick,normalLimit,'allowance is considered exactly once at the normal cutoff');
  const job=state.npcJobs?.ceresWorkfleet;
  assert.equal(job?.phase,'reacquire','normal cutoff requires an active recovery');
  const raw=job.reacquire,plan=restorePlan(raw);
  assert.ok(plan,'recovery plan must pass the production schema/geometry validator');
  assert.equal(plan.kind,'approach','allowance covers only final approach, not a return/replan cycle');
  assert.ok(plan.startedTick<=state.tick&&state.tick<plan.deadlineTick,'plan must already be active and unexpired');
  const rawReturn=job.reacquireReturnBudget;
  const ret=rawReturn==null?null:restoreReturnBudget(rawReturn);
  assert.ok(rawReturn==null||ret,'present return budget must be valid');
  assert.ok(!ret||(ret.startedTick<=state.tick&&state.tick<ret.deadlineTick),'return budget must be active');
  const deadline=Math.min(plan.deadlineTick,ret?.deadlineTick??Infinity);
  assert.ok(Number.isSafeInteger(deadline)&&deadline>state.tick);
  assert.ok(Number.isSafeInteger(settleTicks)&&settleTicks>0);
  assert.equal(originalBodies?.length,4,'original commissioning bodies are required');
  const [worker,head,section]=originalBodies.map(r=>r.e),mountId=job.mountId;
  const originalSignature=signature(plan),returnSignature=JSON.stringify(rawReturn??null);
  const nativeLives=originalBodies.map(r=>native.records.get(r.id));
  const nativeBodies=nativeLives.map(r=>r?.body),sectionSpec=section.physicsBody;
  const sectionSchema=JSON.stringify([sectionSpec?.schemaVersion,sectionSpec?.material,sectionSpec?.collisionProxyManifest]);
  let previousTick=state.tick,leg=plan.leg,windowTick=state.tick;
  const error=p=>p.leg==='turn'?Math.abs(wrap(worker.rot-p.turn.rot)):Math.hypot(worker.pos.x-p.stage.x,worker.pos.z-p.stage.z);
  let windowError=error(plan);
  function lineValid(line,a,b){return line?.state==='active'&&line.ownerId===a.id&&line.targetId===b.id&&line.ownerGeneration===a.occupantGeneration&&line.targetGeneration===b.occupantGeneration;}
  function bodiesAndCustody(extracted){
    assert.equal(state.npcJobs.ceresWorkfleet,job,'job identity must remain original');
    for(const [index,r] of originalBodies.entries()){
      const e=r.e;
      assert.equal(state.entities.get(r.id),e,'original entity identity');assert.equal(e.id,r.id);assert.equal(e.occupantGeneration,r.life,'original occupant life');
      assert.equal(e.data?.worldRecordId,r.record);
      const owners=state.entityList.filter(x=>x.alive&&x.data?.worldRecordId===r.record);assert.equal(owners.length,1,'unique live original role');assert.equal(owners[0],e);
      assert.equal(JSON.stringify([e.type,e.mass,e.data.worldSiteId,e.data.worldSitePayloadId,e.data.worldSiteStructural,e.data.persistenceOwner]),r.structure,'original structural schema');assert.ok(e.alive&&e.hull>0&&finite(e),'live finite body');
      assert.ok(Number.isSafeInteger(r.life)&&r.life>0,'generation must match positive spawn token');
      const rec=native.records.get(r.id);assert.equal(rec?.entity,e,'original native body');assert.equal(rec,nativeLives[index]);assert.equal(rec.body,nativeBodies[index]);assert.notEqual(rec.body.isEnabled(),false);
      assert.ok(e.id!==state.playerId&&!e.playerOwned&&!e.data?.playerOwned&&!e.data?.disabled&&!e.data?.controlLease,'unclaimed enabled worker custody');
      const record=state.world?.records?.byId?.[r.record];assert.ok(!record?.playerOwned&&record?.alive!==false&&!['destroyed','defeated'].includes(record?.outcome),'world record custody');
    }
    assert.equal(section.physicsBody,sectionSpec,'section physical schema identity');assert.equal(sectionSpec?.schemaVersion,1);assert.equal(section.physicsBody?.dynamic,true);assert.notEqual(section.collides,false);
    assert.equal(JSON.stringify([sectionSpec?.schemaVersion,sectionSpec?.material,sectionSpec?.collisionProxyManifest]),sectionSchema,'section physical geometry unchanged');
    const lines=state.combat?.attachments?.byId||{};
    assert.equal(job.mountId,mountId);assert.ok(lineValid(lines[mountId],head,worker),'original generation-valid mounted head');
    const ids=new Set(originalBodies.map(r=>r.id));
    for(const [id,line] of Object.entries(lines))if(line.state==='active'&&(ids.has(line.ownerId)||ids.has(line.targetId))){
      assert.ok(id===mountId||(extracted&&id===job.towId&&lineValid(line,worker,section)),'no foreign or premature tow custody');
    }
    if(extracted)assert.ok(lineValid(lines[job.towId],worker,section),'real original-body tow required');
  }
  function check({initial=false}={}){
    assert.ok(Number.isSafeInteger(state.tick)&&state.tick>=previousTick&&state.tick<=deadline,'original fixed deadline/clock');
    if(!initial)assert.equal(state.tick,previousTick+1,'extension must use each ordinary tick');
    previousTick=state.tick;
    const extracted=job.phase==='extract';bodiesAndCustody(extracted);
    if(extracted){assert.ok(atPose(worker,plan.stage),'extract still requires the original physical stage');return true;}
    assert.equal(job.phase,'reacquire');assert.equal(job.blockedReason??null,null,'recovery must remain actively advancing');
    assert.equal(job.reacquireBlocker??null,null);assert.equal(job.reacquire,raw,'no replacement or restarted recovery');
    const current=restorePlan(job.reacquire);assert.ok(current);assert.equal(signature(current),originalSignature,'no reset, geometry change or deadline extension');
    assert.equal(JSON.stringify(job.reacquireReturnBudget??null),returnSignature,'return budget cannot reset');
    assert.ok(current.leg===leg||(leg==='turn'&&current.leg==='approach'),'only normal forward leg transition');
    if(current.leg!==leg){leg=current.leg;windowTick=state.tick;windowError=error(current);}
    if(state.tick-windowTick>=settleTicks){
      const now=error(current),threshold=current.leg==='turn'?.001:.05;
      assert.ok(windowError-now>threshold,'physical progress required within authored settling window');
      windowTick=state.tick;windowError=now;
    }
    assert.ok(state.tick<deadline,'original deadline reached without extract');
    return false;
  }
  check({initial:true});
  return Object.freeze({deadline,check});
}
