import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
 // Ordinary ESM imports pass through the read shim too. Seed the same named
 // export as the real generated reader, from exactly the redirected JSON fixture.
 const seedFixture=census=>{
  const text=JSON.stringify(census,null,2)+'\n';
  writeFileSync(json,text);
  writeFileSync(module,`export const CENSUS_JSON = ${JSON.stringify(text)};\n`);
 };
 seedFixture(before);
 const shim=join(tmp,'redirect.mjs');
 writeFileSync(shim,`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {fileURLToPath} from 'node:url';
 const read=fs.readFileSync.bind(fs),write=fs.writeFileSync.bind(fs),exists=fs.existsSync.bind(fs);
 function target(p){const s=(p instanceof URL?fileURLToPath(p):String(p)).replaceAll(String.fromCharCode(92),'/');return process.env.CENSUS_TEST_MISSING==='1' && s.endsWith('/places/${ID}.glb')?${JSON.stringify(join(tmp,'missing.glb'))}:s.endsWith('/src/data/modelTruthCensus.json')?${JSON.stringify(json)}:s.endsWith('/src/data/modelTruthCensus.generated.js')?${JSON.stringify(module)}:p;}
 fs.readFileSync=(p,o)=>read(target(p),o);fs.writeFileSync=(p,b,o)=>write(target(p),b,o);fs.existsSync=p=>exists(target(p));syncBuiltinESMExports();`);
 const inherited=[];for(let i=0;i<process.execArgv.length;i++){const a=process.execArgv[i];if(['--import','--loader','--experimental-loader'].includes(a)){inherited.push(a,process.execArgv[++i]);}else if(a.startsWith('--import=')||a.startsWith('--loader='))inherited.push(a);}
 const run=(args,env={})=>spawnSync(process.execPath,[...inherited,'--import',pathToFileURL(shim).href,script,...args],{encoding:'utf8',timeout:120000,maxBuffer:4e6,env:{...process.env,...env}});
 try {
  const result=run([`--only=${ID}`,'--append-selected']);assert.equal(result.status,0,result.stderr+result.stdout);
  const after=JSON.parse(readFileSync(json,'utf8'));assert.deepEqual(after.rows.slice(0,-1),before.rows);assert.equal(after.rows.at(-1).id,ID);assert.equal(after.rows.at(-1).status,'green');assert.equal(after.rows.length,before.rows.length+1);
  const generated=readFileSync(module,'utf8');
  const exported=generated.match(/^export const CENSUS_JSON = (.*);$/m);assert.ok(exported,'generated reader must export CENSUS_JSON');
  assert.deepEqual(JSON.parse(JSON.parse(exported[1])),after,'generated reader and census must agree');
  const rejectedCases=[
   [[`--only=${ID}`,'--append-selected'],/refuses an existing census row/],
   [['--only=place','--append-selected'],/rejects unknown, ambiguous or family selection/],
   [['--only=missing_colony_id','--append-selected'],/rejects unknown, ambiguous or family selection/],
   [[`--only=${ID}`,'--append-selected','--update-selected'],/requires one explicit new catalog ID/],
   [[`--only=${ID}`,'--append-selected','--check'],/requires one explicit new catalog ID/],
   [['--append-selected'],/requires one explicit new catalog ID/],
   [[`--only=${ID},${ID}`,'--append-selected'],/requires one unambiguous --only=ID/],
   [[`--only=${ID}`,'--only=place_conveyor_barge','--append-selected'],/requires one unambiguous --only=ID/],
   [[`--only=${ID}`,'--append-selected','--append-selected'],/requires one unambiguous --only=ID/],
  ];
  for(const [flags,diagnostic] of rejectedCases){
   const rejected=run(flags);assert.equal(rejected.error,undefined);assert.equal(rejected.status,1,flags.join(' '));assert.match(rejected.stderr,diagnostic);
   assert.deepEqual(JSON.parse(readFileSync(json,'utf8')),after,'rejected append mutated census');
   assert.equal(readFileSync(module,'utf8'),generated,'rejected append mutated generated reader');
  }
  seedFixture(before);
  const beforeModule=readFileSync(module,'utf8');
  const missing=run([`--only=${ID}`,'--append-selected'],{CENSUS_TEST_MISSING:'1'});assert.equal(missing.error,undefined);assert.equal(missing.status,1);assert.match(missing.stderr,/passing measured new row/);assert.deepEqual(JSON.parse(readFileSync(json,'utf8')),before);assert.equal(readFileSync(module,'utf8'),beforeModule);
 } finally {rmSync(tmp,{recursive:true,force:true});}
});
