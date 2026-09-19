#!/usr/bin/env node
/** Dependency-free entrypoint; loader stubs stay isolated in the child process. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const args=process.argv.slice(2),here=path.dirname(fileURLToPath(import.meta.url));
const value=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
if(!args.includes('--worker')) {
 const r=spawnSync(process.execPath,['--import',path.join(here,'../tests/fixtures/register.mjs'),fileURLToPath(import.meta.url),'--worker',...args],{stdio:'inherit'});
 process.exit(r.status??1);
}
const {runSession}=await import('../tests/fixtures/session.mjs');
const seeds=String(value('--seeds','4242,8008')).split(',').map(Number);
const hours=Number(value('--hours','12'));
if(!Number.isInteger(hours)||hours<1||hours>24||seeds.some(n=>!Number.isSafeInteger(n)))throw new RangeError('Finite integer seeds; hours 1..24 required');
const runs=[];
for(const seed of seeds)for(const career of ['miner','trader']) {
 const r=runSession({seed,career,hours,spontaneousEvents:!args.includes('--quiet')});runs.push(r);
 console.log(`${r.career} / ${seed}: ${r.completedWork} completed scheduled jobs, net ${r.netCashFlowCr}cr; hourly [${r.netByHour.join(', ')}]`);
}
const report={schema:1,modelVersion:1,
 scope:'ECONOMIC COMPONENT FIXTURE. Real packet economy/cycle runtime; synthetic world ports, scheduled mining deliveries/travel, and model-assumed operating debits. No physics, combat AI, native mission settlement or production asteroid spawning was executed.',
 assumptions:{startingCredits:{miner:0,trader:2500},lot:24,minerJobS:180,traderJobS:240,operatingFraction:.18,worldAndCargoPorts:'Explicit fixture adapters; see tests/fixtures/loader.mjs'},runs};
const output=value('--output',null);if(output){fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(`Wrote ${output}`);}
