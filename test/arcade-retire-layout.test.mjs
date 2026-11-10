import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';
const out='.devshots/finish/integration-2026-11-04/arcade-retirement';
test('mounted Pause confirmation and result Retry retain real controls',async()=>{
 await mkdir(out,{recursive:true});const server=await startBenchServer(),{chromium}=await loadPlaywright();const browser=await chromium.launch({headless:true});
 try {for(const [name,viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=pause&chrome=0${name==='phone'?'&phone=1':''}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__BENCH_READY===true);
  await page.evaluate(async()=>{
   const s=window.__BENCH_STATE;s.run={kind:'survival',ruleset:'swarm',phase:'active',seed:4242,retireToken:7};
   window.__retire=[];window.__BENCH_BUS.on('run:retireRequested',p=>window.__retire.push(p));
   const pause=await import('/src/ui/screens/pause.js');
   window.__workerGeneration=1;
   pause.pauseScreen.onShow({state:s,bus:window.__BENCH_BUS,registry:window.BENCH.registry,helpers:{workerReadGeneration:()=>window.__workerGeneration}});
  });
  const end=page.getByRole('button',{name:/end run/i});
  await page.evaluate(()=>{window.__BENCH_STATE.run.retireToken=null});
  await end.click();assert.equal(await page.locator('.sf-confirm').count(),0,'missing worker identity cannot fall through to Main Menu');
  await page.evaluate(()=>{window.__BENCH_STATE.run.retireToken=7});
  await end.click();
  await page.locator('.sf-confirm__cancel').click();assert.deepEqual(await page.evaluate(()=>window.__retire),[]);
  assert.equal(await page.evaluate(()=>window.__BENCH_STATE.mode),'paused','cancel leaves the run paused');
  await end.click();assert.match(await page.locator('#sf-confirm-note').innerText(),/unranked.*unbanked/i);
  await page.waitForTimeout(800);
  await page.screenshot({path:`${out}/pause-confirm-${name}.png`});
  await page.evaluate(()=>{window.__BENCH_STATE.run.retireToken=8});
  await page.locator('.sf-confirm__ok').click();await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.__retire),[],'stale confirmation sends no intent');
  await end.click();await page.evaluate(()=>{window.__workerGeneration=2});
  await page.locator('.sf-confirm__ok').click();await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>window.__retire),[],'an old worker generation cannot retire a replacement');
  await end.click();await page.locator('.sf-confirm__ok').click();
  await page.waitForFunction(()=>window.__retire.length===1,null,{timeout:5000});
  assert.deepEqual(await page.evaluate(()=>window.__retire),[{token:8}]);
  await page.evaluate(async()=>{
   const launch=await import('/src/ui/crucibleLaunch.js');const setup=launch.crucibleSetupFor({starterId:'kinetic_baseline',seed:4242,ruleset:'swarm'});
   launch.requestCrucibleRun({emit(){}},setup,'swarm');
   const registry=window.BENCH.registry,get=registry.get.bind(registry);
   const result={outcome:'aborted',stopReason:'player_retired',unranked:true,seed:4242,ruleset:'swarm',wave:4,deepestWave:4,
    wavesCleared:3,lastRoundCleared:3,remainingEnemies:18,roundThreatBudget:30,roundThreatResolved:12,kills:31,credits:80,xp:15,level:1,
    headline:'You retired at wave 4.',bankLine:'Retired run — unranked. Unbanked salvage does not carry back to the hangar.',moments:[],picks:[]};
   registry.get=name=>name==='survivalResults'?{lastResult:()=>result,resultRevision:()=>1}:get(name);
   window.__newGames=[];window.__BENCH_BUS.on('game:new',p=>window.__newGames.push(p));
   await window.BENCH.goto('crucible-results');
   window.__newGames=[];
  });
  assert.match(await page.locator('#screens').innerText(),/Run Retired/i);
  assert.match(await page.locator('#screens').innerText(),/unranked.*unbanked/i);
  assert.match(await page.locator('#screens').innerText(),/18/);
  assert.match(await page.locator('#screens').innerText(),/31 clean kills/i);
  assert.match(await page.locator('#screens').innerText(),/Kills\s+31/i);
  await page.waitForTimeout(1000);
  await page.screenshot({path:`${out}/result-${name}.png`});
  await page.getByRole('button',{name:/run it again/i}).click();
  const requests=await page.evaluate(()=>window.__newGames);assert.equal(requests.length,1,JSON.stringify(requests));assert.equal(requests[0].crucibleLaunch,true);
  await page.close();
 }} finally {await browser.close();await server.close();}
});
