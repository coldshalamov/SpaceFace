import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
// Each entry gets a fresh module graph: importing the runtime first can conceal
// a presentation -> cargo owner -> scanner -> presentation initialization cycle.
const loaders=[];
for(let i=0;i<process.execArgv.length;i++) {
  const arg=process.execArgv[i];
  if(arg==='--loader'||arg==='--experimental-loader'||arg==='--import')loaders.push(arg,process.execArgv[++i]);
  else if(arg.startsWith('--loader=')||arg.startsWith('--experimental-loader=')||arg.startsWith('--import='))loaders.push(arg);
}
for(const entry of ['../systems/scanner.js','../data/contactHail.js','../world/charonSupplyReadout.js','../world/anvilOrchardShiftEncounter.js']) {
  test(`standalone presentation entry initializes: ${entry}`,()=>{
    const url=new URL(`../src/${entry.slice(3)}`,import.meta.url).href;
    const result=spawnSync(process.execPath,[...loaders,'--input-type=module','-e',`await import(${JSON.stringify(url)});`],{encoding:'utf8',timeout:30000});
    assert.equal(result.error,undefined,result.error?.message);
    assert.equal(result.status,0,result.stderr);
  });
}
