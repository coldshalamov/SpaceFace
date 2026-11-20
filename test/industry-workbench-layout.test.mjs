import test from 'node:test';
import assert from 'node:assert/strict';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

test('Industry keeps its selected product and real crafting action reachable in a short berth', {timeout:120000}, async () => {
  const server = await startBenchServer();
  const {chromium} = await loadPlaywright();
  const browser = await chromium.launch({headless:true,args:['--disable-gpu','--disable-webgl']});
  try {
    for (const [name,width,height] of [['Ceres berth',1500,900],['compact',700,600],['desktop',1360,720],['phone',390,844]]) {
      const page = await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
      await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=station-industry&chrome=0${name==='phone'?'&phone=1':''}`);
      await page.waitForFunction(() => window.__BENCH_READY);
      const select=async id=>{const row=page.locator(`[data-bp="${id}"]`); await row.scrollIntoViewIfNeeded(); await row.click();};
      if (name === 'compact') {
        await page.evaluate(() => {
          const s = BENCH.state;
          s.ui.dockedStationId = 'station_forge';
          s.crafting = { queues: { station_forge: { bpId: 'bp_build_pulse_laser_s', total: 20, elapsed: 2 } } };
        });
        await select('bp_refine_alloys');
        const titanium = page.locator('.orr-chain__label').filter({ hasText: 'Titanium Ore' });
        const status = page.locator('.sx-fab-status');
        await status.scrollIntoViewIfNeeded();
        assert.match(await status.innerText(), /Fabricator occupied/);
        const material = await titanium.boundingBox();
        const queued = await status.boundingBox();
        assert.ok(material.y + material.height <= queued.y, 'the compact queue status clears the material labels');
        assert.ok(queued.y > 0 && queued.y + queued.height <= height, 'the queue status scrolls into view');
        await page.close();
        continue;
      }
      if (name === 'Ceres berth') {
        await page.evaluate(() => {
          const s = BENCH.state;
          s.ui.dockedStationId = 'station_ceres';
          s.player.cargo.items = { cmdty_ore_iron: 1, cmdty_fuel_cells: 8, cmdty_alloys: 6 };
          s.economy.markets.station_ceres = { cmdty_ore_iron: { stock: 97 } };
        });
        await select('bp_refine_alloys');
        const titanium = page.locator('.orr-chain__label').filter({ hasText: 'Titanium Ore' });
        await titanium.waitFor({ state: 'visible' });
        assert.match(await titanium.innerText(), /not traded here/i);
        const material = await titanium.boundingBox();
        const note = await page.locator('.sx-fab-notes').boundingBox();
        assert.ok(material.y + material.height <= note.y, `Titanium (${material.y}–${material.y + material.height}) clears the refining note (${note.y})`);
      }
      await page.evaluate(async () => {
        const s=BENCH.state; s.ui.dockedStationId='station_forge';
        s.player.cargo.items={cmdty_ore_iron:6,cmdty_refined_metals:3,cmdty_silicate:4};
        s.player.cargo.capVolume=100; s.player.cargo.usedVolume=13;
        const {crafting}=await import('/src/systems/crafting.js');
        const owner=Object.create(crafting); owner.init({state:s,bus:BENCH.bus,registry:BENCH.registry});
        const get=BENCH.registry.get.bind(BENCH.registry);
        BENCH.registry.get=(name)=>name==='crafting'?owner:get(name);
      });
      await select('bp_build_cargo_net_s');
      assert.match(await page.locator('.orr-chain').innerText(),/Silicate Rock/i);
      assert.match(await page.locator('.orr-chain').innerText(),/Deck Cargo Net S/i);
      assert.equal(await page.locator('.orr-chain__unit').evaluate(el=>getComputedStyle(el.parentElement).opacity),'1','system reduced motion leaves product visible');
      assert.equal(await page.locator('.sx-fab-status').count(),0,'idle line cannot overlap inputs');
      assert.match(await page.locator('.sx-fab-build').innerText(),/Fabricate/i);
      await select('bp_refine_metals');
      const button=page.locator('.sx-fab-build');
      assert.match(await page.locator('.orr-chain').innerText(),/Refined Metals/i);
      assert.match(await button.getAttribute('aria-label'),/Refine: hold/i);
      await button.scrollIntoViewIfNeeded();
      const rect=await button.boundingBox();
      const hit=await button.evaluate(el=>{const r=el.getBoundingClientRect(), e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===el||el.contains(e);});
      assert.ok(hit && rect.y >= (name==='phone'?47:0) && rect.y+rect.height <= height-(name==='phone'?34:0),`${name} action is reachable within the safe area`);
      await button.focus(); await page.keyboard.down('Space'); await page.waitForTimeout(1300); await page.keyboard.up('Space');
      await page.waitForFunction(()=>BENCH.state.player.cargo.items.cmdty_ore_iron===4);
      assert.equal(await page.evaluate(()=>BENCH.state.player.cargo.items.cmdty_refined_metals),4);
      await page.close();
    }
  } finally { await browser.close(); await server.close(); }
});
