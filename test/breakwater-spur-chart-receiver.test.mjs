import test from 'node:test';
import assert from 'node:assert/strict';
import {startBenchServer} from '../scripts/lib/benchServer.mjs';
import {loadPlaywright} from '../scripts/lib/load-playwright.mjs';

test('mounted chart finds and tracks the active bonded southeast receiver mark', {timeout:120000},async()=>{
 const server=await startBenchServer(),{chromium}=await loadPlaywright();
 const browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-webgl']});
 try {
  const page=await browser.newPage({viewport:{width:1360,height:720},reducedMotion:'reduce'});
  await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=galaxyMap&chrome=0`);
  await page.waitForFunction(()=>window.__BENCH_READY===true);
  await page.evaluate(()=>{
   const s=window.__BENCH_STATE;s.world.currentSectorId='sector_ceres_belt';
   s.breakwaterSpurView={phase:'operating',stage:3,charter:'bonded',looseLoad:{kind:'consignment',status:'in_transit'},nextAction:'Tow the consignment to the Belt Outpost southeast receiving mark.'};
   window.__receiverCourses=[];window.__BENCH_BUS.on('ui:setCourse',p=>window.__receiverCourses.push(p));window.__benchRefresh();
  });
  await page.locator('.gm-search-input').fill('southeast receiving mark');
  await page.locator('.gm-search-item').filter({hasText:'southeast receiving mark'}).first().click();
  assert.match(await page.locator('.gm-inspector-details').innerText(),/tow the sealed load to this mark/i);
  const track=page.locator('#gm-set-course-btn');await track.scrollIntoViewIfNeeded();
  await page.screenshot({path:'.devshots/finish/integration-2026-11-04/breakwater-review/receiver-chart.png'});
  await track.click();
  const result=await page.evaluate(async()=>({course:window.__receiverCourses.at(-1),expected:(await import('/src/data/sectorCoordinates.js')).sectorLocalToGlobalForSector({x:804.04,z:-964.04},'sector_ceres_belt')}));
  assert.deepEqual(result.course.pos,result.expected);assert.equal(result.course.arrivalRadius,60);
 } finally {await browser.close();await server.close();}
});
