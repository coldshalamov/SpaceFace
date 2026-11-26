import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {hasInheritedReleaseLock} from '../scripts/lib/inheritedReleaseLock.mjs';

const owned = {token:'reviewed-lease',parentPid:'123',actualParentPid:123,
  owner:{pid:123,token:'reviewed-lease'},isProcessRunning:(pid)=>pid===123};

test('an absent lease leaves normal lock acquisition in control', () => {
  assert.equal(hasInheritedReleaseLock({}),false);
});

test('only the live direct owner may supply an inherited release lock', () => {
  assert.equal(hasInheritedReleaseLock(owned),true);
  for (const update of [
    {token:undefined}, {token:''}, {parentPid:undefined}, {parentPid:'123x'},
    {actualParentPid:456}, {owner:{pid:456,token:'reviewed-lease'}},
    {owner:{pid:123,token:'other-lease'}}, {owner:null}, {isProcessRunning:()=>false},
  ]) assert.throws(()=>hasInheritedReleaseLock({...owned,...update}),/inherited SG-04 release lock/i);
});

test('a real child recognizes its own parent and rejects a different parent', () => {
  const helper=new URL('../scripts/lib/inheritedReleaseLock.mjs',import.meta.url).href;
  const program=`import {hasInheritedReleaseLock} from ${JSON.stringify(helper)};
    const pid=process.env.TASK_PARENT_PID,token=process.env.TASK_LOCK_TOKEN;
    const base={token,parentPid:pid,actualParentPid:process.ppid,owner:{pid:Number(pid),token},isProcessRunning:p=>{try{process.kill(p,0);return true;}catch{return false;}}};
    if(!hasInheritedReleaseLock(base))process.exit(2);
    try{hasInheritedReleaseLock({...base,actualParentPid:0});process.exit(3);}catch{}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',program],{
    encoding:'utf8',env:{...process.env,TASK_PARENT_PID:String(process.pid),TASK_LOCK_TOKEN:'child-test'},windowsHide:true,
  });
  assert.equal(result.status,0,result.stderr);
});
