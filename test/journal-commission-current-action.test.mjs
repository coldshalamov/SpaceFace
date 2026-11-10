import test from 'node:test';
import assert from 'node:assert/strict';
import { stat, writeFile } from 'node:fs/promises';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const image = 'C:/Users/93rob/Documents/GHub/SpaceFace/.devshots/finish/integration-2026-11-04/journal-unification/current-action-desktop.png';

test('mounted current action follows selected commission and restores native and campaign policy', async () => {
  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  let picture;
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 720 } });
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=missionLog&chrome=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__BENCH_READY === true);
    await page.evaluate(() => {
      const s = window.__BENCH_STATE;
      s.missions.active = []; s.ui.trackedMissionId = null;
      s.story.beatIndex = 1; s.onboarding = { active: false, finished: true };
      s.nav.waypoint = { kind: 'position', pos: {x:100,z:200}, label:'Tala Rook · receiving cradle' };
      s.cinderglassJobView = null; s.counterweightCircuitView = null; s.breakwaterSpurView = null;
      window.__journalEvents = [];
      for (const event of ['ui:trackMission', 'ui:abandonMission']) window.__BENCH_BUS.on(event, p => window.__journalEvents.push({event,p}));
      window.__benchRefresh();
    });
    const current = page.locator('.sf-mlog-recommend');
    assert.match(await current.innerText(), /Weigh-In/i);
    await page.evaluate(() => {
      const s = window.__BENCH_STATE;
      s.cinderglassJobView = { operationId:'cg:1', journal:{id:'cinderglassJob',title:'The Cinderglass Job',objective:'Tow the same CG-7 pod to Tala’s cradle below 8 WU/s. Khand accepts only an intact original.',facts:[],outcome:null},
        navigation:[{id:'cinderglassJob:cradle',label:'Tala Rook · receiving cradle',action:{token:'life:1',operationId:'cg:1',revision:2}}], recoveryActions:[] };
      s.counterweightCircuitView = {eventId:'fragile_freight',attemptId:7,phase:'running',journal:{attempt:{title:'FRAGILE FREIGHT',legIndex:0,legs:[{label:'Line',hint:'Attach the same original pod.'}]}}};
      s.breakwaterSpurView = {phase:'operating',nextAction:'Tow the consignment to the Belt Outpost southeast receiving mark.'};
      window.__benchRefresh();
    });
    assert.match(await current.innerText(), /The Cinderglass Job/i);
    assert.match(await current.innerText(), /Tow the same CG-7 pod/);
    assert.doesNotMatch(await current.innerText(), /Weigh-In|no goal marker/i);
    assert.equal(await current.locator('button').count(), 0);
    await page.waitForTimeout(1600);
    picture = await page.screenshot();
    const entries = page.locator('.sf-mlog-commissions .k-row');
    await entries.filter({hasText:'Counterweight Circuit'}).click();
    assert.match(await current.innerText(), /Attach the same original pod/);
    await entries.filter({hasText:'Breakwater Spur'}).click();
    assert.match(await current.innerText(), /southeast receiving mark/);
    await page.evaluate(() => {
      const s=window.__BENCH_STATE;
      s.missions.active=[{id:'native:1',status:'active',title:'Native contract',type:'delivery',objectiveProgress:0,objectiveTarget:1}];
      s.ui.trackedMissionId='native:1'; window.__benchRefresh();
    });
    assert.doesNotMatch(await current.innerText(), /southeast receiving mark/);
    assert.match(await current.innerText(), /mission|deliver|contract|cargo|destination/i);
    await page.locator('.sf-mlog-list:not(.sf-mlog-commissions) .k-row').filter({hasText:'Native contract'}).click();
    assert.match(await page.locator('.sf-mlog-stage').innerText(), /Native contract/i);
    await page.evaluate(() => { window.__BENCH_STATE.ui.trackedMissionId=null; window.__benchRefresh(); });
    assert.match(await current.innerText(), /Track Native contract/i);
    await page.evaluate(async () => {
      const s=window.__BENCH_STATE;
      s.missions.active=[]; s.ui.trackedMissionId=null;
      const {createPostEndingContinuity}=await import('/src/story/endings/index.js');
      s.story.endgameResolved=true; s.story.endgameChoice='A';
      s.story.postEnding=createPostEndingContinuity('A',s.simTime || 0,s.meta.seed);
      window.__benchRefresh();
    });
    await page.locator('.sf-mlog-commissions .k-row').filter({hasText:'Breakwater Spur'}).click();
    assert.match(await current.innerText(), /southeast receiving mark/);
    assert.equal(await page.locator('[data-campaign-thread="true"]').count(), 1, 'post-ending continuity persists beside selected work');
    const campaignText = await page.locator('[data-campaign-thread="true"]').innerText();
    const campaignObjective = await page.evaluate(() => window.__BENCH_STATE.story.postEnding.objective);
    assert.ok(campaignText.includes(campaignObjective));
    await page.evaluate(() => { const s=window.__BENCH_STATE; s.cinderglassJobView=null; s.counterweightCircuitView=null; s.breakwaterSpurView=null; window.__benchRefresh(); });
    assert.equal(await page.locator('[data-campaign-thread="true"]').count(), 0);
    assert.notEqual((await current.innerText()).trim(), '');
    assert.doesNotMatch(await current.innerText(), /southeast receiving mark/);
    await page.evaluate(() => { const s=window.__BENCH_STATE; s.story.endgameResolved=false; s.story.endgameChoice=null; s.story.postEnding=null; window.__benchRefresh(); });
    assert.match(await current.innerText(), /Weigh-In/i, 'removing commissions restores ordinary recommendation');
    assert.deepEqual(await page.evaluate(() => window.__journalEvents), []);
    await page.close();
  } finally { await browser.close(); await server.close(); }
  await writeFile(image, picture);
  assert.ok((await stat(image)).size > 0);
  if (process.env.SF_JOURNAL_IMAGE_OUTPUT) console.log('JOURNAL_IMAGE=' + picture.toString('base64'));
});
