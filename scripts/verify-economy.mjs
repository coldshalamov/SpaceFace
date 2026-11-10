#!/usr/bin/env node
/** Recompute, syntax-check, and run the isolated economic component tests. No npm install. */
import {spawnSync} from 'node:child_process';
import {readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const reportFlag=args.indexOf('--report-dir');
const reportDir=reportFlag<0?null:path.resolve(args[reportFlag+1] || 'economy-verification');
const results=[];
function run(label,argv,{capture=false}={}) {
  const processResult=spawnSync(process.execPath,argv,{
    cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit',maxBuffer:16*1024*1024,
  });
  const entry={label,command:['node',...argv],passed:processResult.status===0};
  results.push(entry);
  if(processResult.error)throw processResult.error;
  if(!entry.passed) {
    if(capture)process.stderr.write((processResult.stdout||'')+(processResult.stderr||''));
    throw new Error(`${label} failed with status ${processResult.status}`);
  }
  return processResult;
}
function walk(dir) {
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(dir,entry.name);
    return entry.isDirectory()?walk(file):/\.(m?js)$/.test(file)?[file]:[];
  });
}
let success=false;
try {
  run('Generated tables match the authoring model',['scripts/generate-economy.mjs','--check']);
  const code=[...walk(path.join(root,'src')),...walk(path.join(root,'scripts')),...walk(path.join(root,'tests'))];
  for(const file of code)run(`Syntax: ${path.relative(root,file)}`,['--check',file],{capture:true});
  console.log(`Syntax checked ${code.length} JavaScript modules.`);
  const tests=readdirSync(path.join(root,'tests/economy')).filter(n=>n.endsWith('.test.mjs')).sort()
    .map(n=>'tests/economy/'+n);
  const result=run('Economic component tests (includes seeded 12h sessions)',[
    '--import','./tests/fixtures/register.mjs','--test',...tests,
  ],{capture:true});
  if(reportDir){mkdirSync(reportDir,{recursive:true});writeFileSync(path.join(reportDir,'tests.tap'),result.stdout);}
  console.log(result.stdout.split('\n').filter(line=>/^# (tests |pass |fail |duration_ms )/.test(line)).join('\n'));
  if(args.includes('--fixture'))run('Publish the four 12h component fixtures',[
    'scripts/economy-fixture.mjs','--seeds','4242,8008','--hours','12',
    ...(reportDir?['--output',path.join(reportDir,'fixture-12h.json')]:[]),
  ]);
  success=true;
  console.log('PASS — economic component scope only; native gameplay integration remains a separate acceptance gate.');
} catch(error) { console.error(error.stack || String(error)); process.exitCode=1; }
finally {
  if(reportDir) {
    mkdirSync(reportDir,{recursive:true});
    writeFileSync(path.join(reportDir,'verification.json'),JSON.stringify({
      schema:1,node:process.version,success,
      scope:'Packet economic runtime plus explicit test-only ports. No native renderer, combat AI, mission settlement, or asteroid publication.',
      results,
    },null,2)+'\n');
  }
}
