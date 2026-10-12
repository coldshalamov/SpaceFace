import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function probe(mode){
 const result=spawnSync(process.execPath,['test/fixtures/save-loaded-completion-child.mjs',mode],{
  cwd:process.cwd(),encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,
  env:{...process.env,SPACEFACE_PLAYER_STORE_DIR:''},
 });
 assert.equal(result.error,undefined,`${mode}: ${result.error?.message}`);
 assert.equal(result.status,0,`${mode}: ${result.stderr}\n${result.stdout}`);
 const row=result.stdout.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line))
  .find(row=>row.probe==='save-loaded-completion');
 assert(row,`${mode}: missing completion receipt`);return row;
}
for(const mode of ['fast','slow','queued-sector'])test(`production restore completes every legitimate listener before native completion (${mode})`,()=>{
 const row=probe(mode);
 assert.equal(row.ok,true);assert.equal(row.tick,row.savedTick,'restore does not advance the gameplay clock');
 assert.deepEqual(row.seen,Array.from({length:160},(_,i)=>i),'all save-loaded listeners run once in registration order');
 assert.equal(row.pending,0,'successful restore leaves no deferred semantic listeners');
 assert.equal(row.nativeBoundaries.length,1,'one native completion boundary');
 assert.equal(row.nativeBoundaries[0].pending,0,'native completion cannot precede listeners');
 assert.equal(row.nativeBoundaries[0].seen,160,'native completion sees all restored owners');
 if(mode!=='fast')assert(row.drains>65,'slow listener progress must outlive the old fixed loop guard');
 if(mode==='queued-sector'){
  assert.equal(row.sectorPublished,true);
  assert.equal(row.sectorSeen.length,160,'initial and queued sector tails both complete');
  assert.equal(row.nativeBoundaries[0].sectorSeen,160,'queued sector callbacks finish before native completion');
 }
});
for(const mode of ['stalled','rearming'])test(`production restore fails closed on a bounded ${mode} listener drain`,()=>{
 const row=probe(mode);
 assert.equal(row.ok,false,'a stuck or endlessly rearmed restore cannot report success');
 assert.equal(row.nativeBoundaries.length,0,'failure never crosses native completion');
 assert(row.drains>0&&row.drains<=10000,'hostile drains have a finite safety bound, including rollback');
});


test('failed restore cancels its pending callbacks before a successful rollback completes',()=>{
 const row=probe('fail-once');
 assert.equal(row.ok,false,'requested load failed even though rollback succeeds');
 assert.equal(row.credits,0,'rollback restores the prior player value');
 assert.equal(row.pending,0,'rollback leaves no semantic event tail');
 const afterFailure=row.listenerContexts.slice(row.failureBoundaryContexts);
 assert.equal(afterFailure.some(entry=>entry.slot==='loaded-listener-completion'),false,
  'failed-session callbacks cannot execute against rollback state');
 assert.equal(afterFailure.length,160,'all rollback listeners still execute');
 assert(afterFailure.every(entry=>entry.slot==='quick'&&entry.credits===0));
 assert.equal(row.nativeBoundaries.length,1,'only valid rollback reaches native completion');
 assert.equal(row.nativeBoundaries[0].pending,0);
 assert.equal(row.nativeBoundaries[0].seen,row.failureBoundaryContexts+160);
});
