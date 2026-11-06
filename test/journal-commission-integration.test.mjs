import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const shots = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/finish/integration-2026-11-04/journal-unification';

test('mounted journal selects live commissions, refreshes identities and sends current owner actions', async () => {
  await mkdir(shots, { recursive: true });
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, viewport, phone] of [
      ['desktop', { width: 1360, height: 720 }, false],
      ['compact', { width: 960, height: 540 }, false],
      ['phone', { width: 390, height: 844 }, true],
      ['landscape', { width: 568, height: 320 }, true],
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=missionLog&chrome=0${phone ? '&phone=1' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__BENCH_READY === true);
      await page.evaluate(() => {
        const s = window.__BENCH_STATE;
        s.missions.active = [];
        s.ui.trackedMissionId = null;
        s.cinderglassJobView = null; s.counterweightCircuitView = null; s.breakwaterSpurView = null;
        window.__journalEvents = [];
        for (const event of ['cinderglassJob:action', 'ui:trackMission', 'ui:abandonMission'])
          window.__BENCH_BUS.on(event, payload => window.__journalEvents.push({event, payload}));
        window.__benchRefresh();
      });
      assert.match(await page.locator('.sf-mlog-stage').innerText(), /No active missions/);
      await page.evaluate(() => {
        const s = window.__BENCH_STATE;
        s.cinderglassJobView = { operationId: 'cg:1', revision: 2, journal: { id:'cinderglassJob', title:'The Cinderglass Job', objective:'Tow the same CG-7 pod to Tala’s cradle below 8 WU/s. Khand accepts only an intact original.', facts:[], outcome:null },
          recoveryActions:[{ id:'tuneBeacon', label:'Request fresh CG-7 beacon fix', action:{token:'life:1',operationId:'cg:1',revision:2} }],
          navigation:[{id:'cinderglassJob:pod',label:'CG-7 pod · beacon fix · 44s old',labelCopy:{template:'CG-7 pod · beacon fix · {age}s old',values:{age:44}},action:{token:'life:1',operationId:'cg:1',revision:2}},
            {id:'cinderglassJob:cradle',label:'Tala Rook · receiving cradle',action:{token:'life:1',operationId:'cg:1',revision:2}}] };
        s.counterweightCircuitView = { eventId:'fragile_freight', attemptId:7, phase:'running', journal:{attempt:{title:'FRAGILE FREIGHT',phase:'running',legIndex:0,conditionFrac:.82,legs:[{label:'Line',hint:'Attach the same original pod.',status:'active',retries:1},{label:'Seat',status:'pending'}]},lastResult:{outcome:'complete',medal:'silver',timeS:45,reason:'pod_damage'}} };
        s.breakwaterSpurView = { phase:'operating', stage:3, charter:'bonded', nextAction:'Tow the consignment to the Belt Outpost southeast receiving mark; settle below 4 WU/s and keep the line attached.', receipts:[{kind:'bond_posted',text:'Bond posted.'}] };
        window.__benchRefresh();
      });
      const stage = page.locator('.sf-mlog-stage');
      assert.match(await stage.innerText(), /The Cinderglass Job/i);
      assert.doesNotMatch(await stage.innerText(), /No active missions|No contract/);
      assert.doesNotMatch(await page.locator('.sf-mlog-body').innerText(), /CHOOSE A FIRST CONTRACT/);
      await page.waitForTimeout(1600);
      await page.screenshot({path:`${shots}/cinder-${name}.png`});
      const tune = stage.getByRole('button', {name:'Request fresh CG-7 beacon fix'});
      await tune.scrollIntoViewIfNeeded(); await tune.click();
      await stage.getByRole('button', {name:'Track CG-7 pod · beacon fix · 44s old'}).click();
      let events = await page.evaluate(() => window.__journalEvents);
      assert.equal(events.at(-2).payload.revision, 2);
      assert.equal(events.at(-1).payload.markerId, 'cinderglassJob:pod');
      // Mutate the mirror without repaint: even an old visible button must use the current payload.
      await page.evaluate(() => { const c=window.__BENCH_STATE.cinderglassJobView; c.revision=3; c.navigation[0].action={token:'life:2',operationId:'cg:1',revision:3}; });
      await stage.getByRole('button', {name:'Track CG-7 pod · beacon fix · 44s old'}).click();
      events = await page.evaluate(() => window.__journalEvents);
      assert.equal(events.at(-1).payload.token, 'life:2'); assert.equal(events.at(-1).payload.revision, 3);
      // An old control cannot address a replacement operation.
      await page.evaluate(() => { window.__BENCH_STATE.cinderglassJobView.operationId='cg:replacement'; });
      const beforeReplacement = events.length;
      await stage.getByRole('button', {name:'Track CG-7 pod · beacon fix · 44s old'}).click();
      assert.equal((await page.evaluate(() => window.__journalEvents)).length, beforeReplacement);
      await page.evaluate(() => { window.__BENCH_STATE.cinderglassJobView.operationId='cg:1'; window.__benchRefresh(); });
      await page.evaluate(() => {
        const s=window.__BENCH_STATE;
        s.missions.active=[{id:'native:1',status:'active',title:'Native contract',type:'delivery',objectiveProgress:0,objectiveTarget:1}];
        window.__benchRefresh();
      });
      assert.match(await stage.innerText(), /The Cinderglass Job/i, 'new native work does not steal commission selection');
      const native = page.locator('.sf-mlog-list:not(.sf-mlog-commissions) .k-row').filter({hasText:'Native contract'});
      await native.focus(); await page.keyboard.press('Enter');
      assert.match(await stage.innerText(), /Native contract/i);
      await page.evaluate(() => { window.__BENCH_STATE.cinderglassJobView.revision=4; window.__benchRefresh(); });
      assert.match(await stage.innerText(), /Native contract/i, 'late mirror refresh preserves the chosen native contract');
      await page.locator('.sf-mlog-commissions .k-row').filter({hasText:'The Cinderglass Job'}).click();
      await page.evaluate(() => { window.__BENCH_STATE.missions.active=[]; window.__benchRefresh(); });
      await page.locator('.sf-mlog-commissions .k-row').filter({hasText:'Counterweight Circuit'}).click();
      assert.match(await stage.innerText(), /Attach the same original pod/);
      assert.match(await stage.innerText(), /82%/); assert.match(await stage.innerText(), /1 retry/);
      await page.screenshot({path:`${shots}/circuit-${name}.png`});
      await page.locator('.sf-mlog-commissions .k-row').filter({hasText:'Breakwater Spur'}).click();
      assert.equal(await stage.evaluate(el => el.scrollTop), 0, 'switching work starts its dossier at the top');
      assert.match(await stage.innerText(), /southeast receiving mark/);
      assert.match(await stage.innerText(), /Bond posted/);
      await page.screenshot({path:`${shots}/spur-${name}.png`});
      await page.locator('.sf-mlog-commissions .k-row').filter({hasText:'The Cinderglass Job'}).click();
      await page.evaluate(() => { const c=window.__BENCH_STATE.cinderglassJobView; c.operationId='cg:replacement'; c.journal.objective='Read the new CG-7 plate.'; c.navigation=[]; c.recoveryActions=[]; window.__benchRefresh(); });
      assert.match(await stage.innerText(), /Read the new CG-7 plate/);
      await page.evaluate(() => { window.__BENCH_STATE.cinderglassJobView.journal.outcome={id:'delivered_tala'}; window.__benchRefresh(); });
      assert.doesNotMatch(await stage.innerText(), /Read the new CG-7 plate/);
      events = await page.evaluate(() => window.__journalEvents);
      assert.ok(events.every(e => e.event === 'cinderglassJob:action'), 'commission identities never reach mission owners');
      await page.close();
    }
  } finally { await browser.close(); await server.close(); }
});
