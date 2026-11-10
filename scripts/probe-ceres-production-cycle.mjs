// Bounded production-owner proof runner. Diagnostics never change sim scheduling or input.
import {spawn} from 'node:child_process';
import {appendFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),folder=new URL('.devshots/ceres-workfleet/',root);
mkdirSync(folder,{recursive:true});const file=new URL('runtime-full-factory-parent.jsonl',folder);
const started=Date.now();
const record=(event,extra={})=>appendFileSync(file,JSON.stringify({event,at:new Date().toISOString(),elapsedMs:Date.now()-started,pid:process.pid,...extra})+'\n');
const command=['--max-old-space-size=256','--unhandled-rejections=strict','--test','--test-reporter=tap',new URL('test/ceres-workfleet-production-cycle.test.mjs',root).pathname];
record('start',{execPath:process.execPath,args:command,node:process.version,runnerSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')});
const child=spawn(process.execPath,command,{cwd:root,stdio:['ignore','inherit','inherit']});record('spawn',{childPid:child.pid});
child.on('error',error=>record('spawn-error',{message:error.message,stack:error.stack}));
child.on('exit',(code,signal)=>record('child-exit',{code,signal}));
child.on('close',(code,signal)=>{record('child-close',{code,signal});process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{record('parent-signal',{signal});child.kill(signal);});
process.on('exit',code=>record('parent-exit',{code}));
