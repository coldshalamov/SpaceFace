import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ID='place_charon_colony_service_barge';
const script=fileURLToPath(new URL('../scripts/model-truth-census.mjs',import.meta.url));
const actual=JSON.parse(readFileSync(new URL('../src/data/modelTruthCensus.json',import.meta.url),'utf8'));
// Exercise the actual public CLI and actual release model. Redirect only its two
// census outputs to a temporary directory; never rewrite the checked-in census.
test('append-selected measures exactly one new row and preserves every existing row',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'sf-census-append-'));const json=join(tmp,'census.json'),module=join(tmp,'census.generated.js');
 const before={...actual,rows:actual.rows.filter(r=>r.id!==ID)};
 const red=before.rows.filter(r=>r.status==='red').length;before.counts={...before.counts,rows:before.rows.length,red,green:before.rows.length-red};
 writeFileSync(json,JSON.stringify(before));writeFileSync(module,'');
 const shim=join(tmp,'redirect.mjs');
 writeFileSync(shim,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {fileURLToPath} from 'node:url';
 const read=fs.readFileSync.bind(fs),write=fs.writeFileSync.bind(fs),exists=fs.existsSync.bind(fs);
 function target(p){const s=p instanceof URL?fileURLToPath(p):String(p);return process.env.CENSUS_TEST_MISSING==='1' && s.endsWith('/places/${ID}.glb')?${JSON.stringify(join(tmp,'missing.glb'))}:s.endsWith('/src/data/modelTruthCensus.json')?${JSON.stringify(json)}:s.endsWith('/src/data/modelTruthCensus.generated.js')?${JSON.stringify(module)}:p;}
 fs.readFileSync=(p,o)=>read(target(p),o);fs.writeFileSync=(p,b,o)=>write(target(p),b,o);fs.existsSync=p=>exists(target(p));syncBuiltinESMExports();`);
 const inherited=[];for(let i=0;i<process.execArgv.length;i++){const a=process.execArgv[i];if(['--import','--loader','--experimental-loader'].includes(a)){inherited.push(a,process.execArgv[++i]);}else if(a.startsWith('--import=')||a.startsWith('--loader='))inherited.push(a);}
 const run=(args,env={})=>spawnSync(process.execPath,[...inherited,'--import',shim,script,...args],{encoding:'utf8',timeout:120000,maxBuffer:4e6,env:{...process.env,...env}});
 try {
  const result=run([`--only=${ID}`,'--append-selected']);assert.equal(result.status,0,result.stderr+result.stdout);
  const after=JSON.parse(readFileSync(json,'utf8'));assert.deepEqual(after.rows.slice(0,-1),before.rows);assert.equal(after.rows.at(-1).id,ID);assert.equal(after.rows.at(-1).status,'green');assert.equal(after.rows.length,before.rows.length+1);
  const generated=readFileSync(module,'utf8');assert.ok(generated.includes('export const CENSUS_JSON = '));
  for(const flags of [[`--only=${ID}`,'--append-selected'],['--only=place','--append-selected'],['--only=missing_colony_id','--append-selected'],[`--only=${ID}`,'--append-selected','--update-selected'],[`--only=${ID}`,'--append-selected','--check'],['--append-selected'],[`--only=${ID},${ID}`,'--append-selected'],[`--only=${ID}`,'--only=place_conveyor_barge','--append-selected'],[`--only=${ID}`,'--append-selected','--append-selected']]){
   const rejected=run(flags);assert.notEqual(rejected.status,0,flags.join(' '));assert.deepEqual(JSON.parse(readFileSync(json,'utf8')),after,'rejected append mutated census');
  }
  writeFileSync(json,JSON.stringify(before));
  const missing=run([`--only=${ID}`,'--append-selected'],{CENSUS_TEST_MISSING:'1'});assert.notEqual(missing.status,0);assert.match(missing.stderr,/passing measured new row/);assert.deepEqual(JSON.parse(readFileSync(json,'utf8')),before);
 } finally {rmSync(tmp,{recursive:true,force:true});}
});
