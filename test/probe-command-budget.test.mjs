import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandDeadlineEnv, readCommandDeadline, remainingDiagnosticBudget, closeOwnedProbeResources, PROBE_CLEANUP_RESERVE_MS } from '../scripts/lib/probeCommandBudget.mjs';

test('runner deadline uses actual180s or420s budget, replaces inherited deadline and preserves environment',()=>{
 for(const timeout of [180000,420000]){
  const env=commandDeadlineEnv({KEEP:'yes',SPACEFACE_COMMAND_DEADLINE_MS:'1'},123,timeout);
  assert.equal(readCommandDeadline(env),123+timeout);assert.equal(env.KEEP,'yes');
 }
 const source=readFileSync(new URL('../scripts/check-ci-report.mjs',import.meta.url),'utf8');
 assert.match(source,/env: commandDeadlineEnv\(process.env, started, def.timeoutMs\)/);
 assert.match(source,/}, def.timeoutMs\)/);
});
test('remaining optional budget preserves cleanup reserve without extending original deadline',()=>{
 assert.equal(remainingDiagnosticBudget(180000,100000,90000),70000);
 assert.equal(remainingDiagnosticBudget(420000,100000,90000),90000);
 assert.equal(remainingDiagnosticBudget(180000,180000-PROBE_CLEANUP_RESERVE_MS,90000),0);
 assert.equal(remainingDiagnosticBudget(180000,200000,90000),0);
 assert.equal(remainingDiagnosticBudget(null,100000,90000),90000);
 for(const value of [undefined,'', 'bad','Infinity','-1','0'])assert.equal(readCommandDeadline({SPACEFACE_COMMAND_DEADLINE_MS:value}),null);
});
test('owned cleanup always kills server after successful or rejected browser close',async()=>{
 for(const reject of [false,true]){let kills=0;const warnings=[];
 const complete=await closeOwnedProbeResources({browser:{close:async()=>{if(reject)throw Error('close failed');}},server:{kill:()=>kills++},warn:x=>warnings.push(x)});
 assert.equal(complete,!reject);assert.equal(kills,1);assert.equal(warnings.length,reject?1:0);
 }
});
test('wedged browser cleanup is bounded, reports incomplete and kills owned server',async()=>{
 let fire,kills=0,cleared=false;const warnings=[];
 const done=closeOwnedProbeResources({browser:{close:()=>new Promise(()=>{})},server:{kill:()=>kills++},warn:x=>warnings.push(x),setTimer:fn=>{fire=fn;return 123;},clearTimer:id=>{assert.equal(id,123);cleared=true;}});
 fire();assert.equal(await done,false);assert.equal(kills,1);assert.equal(cleared,true);assert.match(warnings[0],/incomplete.*deadline/);
});
test('server still terminated when no browser was created',async()=>{
 let kills=0;await closeOwnedProbeResources({server:{kill:()=>kills++}});assert.equal(kills,1);
});
test('cleanup failure never replaces original probe acceptance failure',async()=>{
 const original=Error('primary gate failed');let kills=0;
 await assert.rejects(async()=>{try{throw original;}finally{await closeOwnedProbeResources({browser:{close:async()=>{throw Error('cleanup failed');}},server:{kill:()=>kills++},warn:()=>{}});}},error=>error===original);
 assert.equal(kills,1);
});
test('checker marks incomplete cleanup nonzero without replacing a thrown primary error',async()=>{
 const source=readFileSync(new URL('../scripts/check-47a-live-cold-open.mjs',import.meta.url),'utf8');
 const line=source.split('\n').find(line=>line.includes('if (!await closeOwnedProbeResources'));
 assert.ok(line);
 const run=new Function('closeOwnedProbeResources','process','browser','server','primary',`return (async()=>{try{if(primary)throw primary;}finally{${line}}})();`);
 for(const complete of [true,false]){const process={exitCode:0};await run(async()=>complete,process,null,null,null);assert.equal(process.exitCode,complete?0:1);}
 const original=Error('primary');const process={exitCode:0};await assert.rejects(run(async()=>false,process,null,null,original),error=>error===original);assert.equal(process.exitCode,1);
});
