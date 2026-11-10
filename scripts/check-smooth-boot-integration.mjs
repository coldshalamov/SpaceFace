/** Run AFTER installing in the real checkout. Syntax + live-source lifecycle integration, not
 * a GPU benchmark. It deliberately does not import the enormous singleton registry dependency graph.
 */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {runBootInitializers} from '../src/core/bootSystemInit.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const paths=['src/main.js','src/core/registry.js','src/core/newGameStartTransition.js',
'src/core/bootScheduler.js','src/core/bootSystemInit.js','src/core/bootWork.js',
'src/ui/loadingPresenter.js','src/ui/bootEntry.js','src/ui/loadingProgressModel.js',
'src/ui/loadingProgressDriver.js','src/ui/orrery/bootRing.js','src/ui/orrery/bootRingWorker.js',
'src/render/startupGpuResidency.js','src/render/pipelineReadiness.js','scripts/build-bundle.mjs'];
for(const path of paths){
  const result=spawnSync(process.execPath,['--check',resolve(root,path)],{encoding:'utf8'});
  assert.equal(result.status,0,`${path}\n${result.stderr}`);
}
const html=await readFile(resolve(root,'index.html'),'utf8');
assert.match(html,/src="\.\/src\/ui\/bootEntry\.js"/);
assert.doesNotMatch(html,/src="\.\/src\/main\.js"/);
assert.match(html,/styles\/boot-instrument\.css/);
const main=await readFile(resolve(root,'src/main.js'),'utf8');
assert.match(main,/await registry\.initAsync/);assert.match(main,/__SF_BOOT_INIT__/);
const registry=await readFile(resolve(root,'src/core/registry.js'),'utf8');
const start=registry.indexOf('export function createSystemLifecycle(');
const end=registry.indexOf('\n}\n',start)+3;
assert.ok(start>=0&&end>start,'Lifecycle must still have a source-visible boundary');
const source=registry.slice(start,end).replace('export function','function');
const create=new Function('runBootInitializers','TEARDOWN_DEPENDENCIES','destroySystems',source+'\nreturn createSystemLifecycle;')(
 runBootInitializers,[],systems=>{for(const s of [...systems].reverse())s.destroy?.();});
let count=0;
const lifecycle=create({systems:[{init(){count++;}}]});
const first=lifecycle.initAsync({yieldToMain:()=>{}});assert.equal(first,lifecycle.initAsync());await first;
assert.equal(count,1);lifecycle.init();assert.equal(count,1);lifecycle.destroy();await assert.rejects(lifecycle.initAsync());
const calls=[],failure=Error('sentinel');
const failing=create({systems:[{init(){},destroy(){calls.push('one');}},
 {init(){throw failure;},destroy(){calls.push('two');}}]});
await assert.rejects(failing.initAsync({yieldToMain:()=>{}}),err=>err===failure);
assert.deepEqual(calls,['two','one']);failing.destroy();assert.equal(calls.length,2);
console.log('PASS: syntax of 15 integrated files, entry wiring, duplicate-init ownership and rollback against the actual registry source.');
