import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const shots = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/finish/integration-2026-11-04/journal-unification';
test('mounted chart and journal expose commission views and navigation at desktop and compact sizes', async () => {
  await mkdir(shots, { recursive: true });
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, viewport] of [['desktop',{width:1440,height:900}],['phone',{width:390,height:844}]]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=missionLog&chrome=0${name === 'phone' ? '&phone=1' : ''}`, { waitUntil:'domcontentloaded' });
      await page.waitForFunction(() => window.__BENCH_READY === true);
      await page.evaluate(() => {
        const s = window.__BENCH_STATE;
        s.cinderglassJobView = { journal: { title:'The Cinderglass Job', objective:'Tow the same CG-7 pod to Tala’s cradle below 3 WU/s.', facts:[], outcome:null },
          navigation:[{id:'cinderglassJob:pod',label:'CG-7 pod',action:{token:'life:1',operationId:'cg:1',revision:2}}] };
        s.counterweightCircuitView = { eventId:'fragile_freight', phase:'running', journal:{attempt:{title:'FRAGILE FREIGHT',legIndex:0,legs:[{label:'Line',hint:'Attach the same original pod.'}]},lastResult:null} };
        s.breakwaterSpurView = { phase:'operating', stage:3, charter:'cooperative', nextAction:'Deliver the supply cartridge to the shelf.', receipts:[{kind:'supply_paid',text:'Supply delivery accepted and paid.'}] };
        window.__commissionActions = [];
        window.__BENCH_BUS.on('cinderglassJob:action', p => window.__commissionActions.push(p));
        window.__benchRefresh();
      });
      const panel = page.locator('.sf-mlog-commissions');
      const stage = page.locator('.sf-mlog-stage');
      await panel.locator('.k-row').filter({hasText:'The Cinderglass Job'}).click();
      await assertVisibleText(stage, 'Tow the same CG-7 pod');
      await stage.getByRole('button', {name:'Track CG-7 pod'}).click();
      await panel.locator('.k-row').filter({hasText:'Counterweight Circuit'}).click();
      await assertVisibleText(stage, 'FRAGILE FREIGHT');
      await assertVisibleText(stage, 'Attach the same original pod');
      await panel.locator('.k-row').filter({hasText:'Breakwater Spur'}).click();
      await assertVisibleText(stage, 'Deliver the supply cartridge');
      const actions = await page.evaluate(() => window.__commissionActions);
      assert.equal(actions[0].token, 'life:1'); assert.equal(actions[0].operationId, 'cg:1');
      assert.equal(actions[0].markerId, 'cinderglassJob:pod');
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({path:`${shots}/journal-${name}.png`});
      await page.evaluate(() => {
        const j = window.__BENCH_STATE.cinderglassJobView.journal;
        j.outcome = {id:'delivered_tala',paidCr:300}; j.objective = null;
        window.__BENCH_STATE.counterweightCircuitView = {phase:null,journal:{attempt:null,lastResult:{eventId:'fragile_freight',outcome:'complete',medal:'silver',reason:'pod_damage'}}};
        window.__benchRefresh();
      });
      await page.locator('[aria-controls="sf-mlog-completed-list"]').click();
      await assertVisibleText(page.locator('#sf-mlog-completed-list'), 'delivered tala');
      await assertVisibleText(page.locator('#sf-mlog-completed-list'), 'Supply delivery accepted and paid');
      await assertVisibleText(page.locator('#sf-mlog-completed-list'), 'pod damage');
      const lastReceipt = page.locator('#sf-mlog-completed-list .sf-mlog-receipt-row').last();
      await lastReceipt.scrollIntoViewIfNeeded();
      const box = await lastReceipt.boundingBox();
      assert.ok(box && box.y < viewport.height && box.y + box.height > 0, 'last completed receipt is reachable');
      await page.screenshot({path:`${shots}/journal-receipts-${name}.png`});
      for (const [sector, nameToFind, mode] of [
        ['sector_ceres_belt','Breakwater Spur','spur'],
        ['sector_pallas_drift','Counterweight Circuit','circuit'],
        ['sector_tethys_junction','CG-7 pod','cinder'],
      ]) {
        await page.evaluate(async ({sector,mode}) => {
          await window.BENCH.goto('galaxyMap');
          const s=window.__BENCH_STATE; s.world.currentSectorId=sector;
          s.world.counterweightCircuit={discovered:true};
          if(mode==='cinder') {
            const m=await import('/src/data/sectorCoordinates.js');
            s.cinderglassJobView.markers=[{id:'cinderglassJob:pod',label:'CG-7 pod',pos:m.sectorLocalToGlobalForSector({x:200,z:100},sector)}];
          }
          window.__chartCourses=[]; window.__BENCH_BUS.on('ui:setCourse', p => window.__chartCourses.push(p));
          window.__benchRefresh();
        }, {sector,mode});
        const search=page.locator('.gm-search-input');
        await search.fill(nameToFind);
        const result=page.locator('.gm-search-item').filter({hasText:nameToFind}).first();
        await result.click({timeout:5000});
        await page.mouse.move(5, 5);
        await page.screenshot({path:`${shots}/chart-${mode}-${name}.png`});
        assert.match(await page.locator('body').innerText(), new RegExp(nameToFind,'i'));
        if (mode === 'spur') assert.match(await page.locator('.gm-inspector-details').innerText(), /Deliver the supply cartridge/i);
        const track=page.locator('#gm-set-course-btn');
        await track.scrollIntoViewIfNeeded();
        await page.screenshot({path:`${shots}/chart-action-${mode}-${name}.png`});
        await track.click({timeout:5000});
        const course=await page.evaluate(() => window.__chartCourses.at(-1));
        assert.ok(course && Number.isFinite(course.pos?.x) && Number.isFinite(course.pos?.z), `${mode} emits an actual course`);
        if (mode === 'spur') {
          const expected=await page.evaluate(async () => { const m=await import('/src/features/breakwaterSpur/readModel.js'); return m.breakwaterSiteGlobal(); });
          assert.equal(course.pos.x,expected.x); assert.equal(course.pos.z,expected.z);
        }
      }
      await page.close();
    }
  } finally { await browser.close(); await server.close(); }
});
async function assertVisibleText(locator, text) { await locator.waitFor({state:'visible'}); assert.ok((await locator.innerText()).toLowerCase().includes(text.toLowerCase())); }
