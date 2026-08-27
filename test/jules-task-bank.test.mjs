import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'..');
function run(...args){ return spawnSync(process.execPath,['scripts/jules-dispatch.mjs',...args],{cwd:ROOT,encoding:'utf8'}); }
test('bank validates exact scale/model split',()=>{ const r=run('--validate'); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/1,000 tasks/); assert.match(r.stdout,/700 Flash \/ 300 Pro/); });
test('first and last task render',()=>{ for(const id of ['JULES-0001','JULES-1000']){ const r=run('--id',id,'--format','prompt'); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,new RegExp(id)); assert.match(r.stdout,/LOCAL MERGE GATE/); }});
test('selection collision-caps subjects',()=>{ const r=run('--next','--model','flash','--count','20','--seed','47','--format','json'); assert.equal(r.status,0,r.stderr); const arr=JSON.parse(r.stdout); assert.equal(arr.length,20); assert.equal(new Set(arr.map(x=>x.collision)).size,20); assert.ok(arr.every(x=>x.model==='flash')); });
