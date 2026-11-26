#!/usr/bin/env node
// Real screen modules + real draft/fitting owners, using the repository's seeded UI bench.
// Not a full gameplay/bootstrap or GPU performance test. No production data is mutated.
// node scripts/check-crucible-preparation-ui.mjs [--out=/tmp/crucible-ui]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
const out = path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6) || '.devshots/crucible-preparation');
mkdirSync(out, {recursive:true});
const server = await startBenchServer();
let browser;
const errors = [], checks = [];
try {
  const {chromium} = await loadPlaywright();
  browser = await chromium.launch({headless:true, ...(process.env.SF_CHROMIUM ? {executablePath:process.env.SF_CHROMIUM} : {})});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(String(error)));
  const open = async (shot, size={width:1440,height:900}) => {
    await page.setViewportSize(size);
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=${shot}&chrome=0`);
    await page.waitForFunction(()=>window.__BENCH_READY===true);
    await page.locator('.screen').first().waitFor({state:'visible'});
    assert.match(await page.title(), /SpaceFace/);
    assert.ok((await page.locator('body').innerText()).length > 100);
  };
  const snap = async name => page.screenshot({path:path.join(out,`${name}.png`)});
  const wallet = () => page.evaluate(()=>window.__BENCH_STATE.run.credits);
  const card = name => page.locator('.sf-cru-card').filter({has:page.locator('h2',{hasText:name})});
  const openGuns = async () => {
    const guns = page.getByRole('button', { name: /^Guns & launchers,/ });
    if (!(await guns.isVisible())) await page.getByRole('button', { name: /Browse all/ }).click();
    await guns.click();
  };

  await open('crucible');
  assert.equal(await page.locator('.orr-preparation').getAttribute('data-prep-step'),'0');
  await snap('encounter');
  await page.getByRole('tab',{name:'01 Match setup'}).press('ArrowRight');
  assert.equal(await page.locator('.orr-preparation').getAttribute('data-prep-step'),'1');
  const ships = await page.locator('.sf-crd-hull:visible').evaluateAll(tiles => tiles.map(tile => tile.dataset.starterId));
  assert.ok(ships.length > 1 && ships.every(id => id.startsWith('hull:')), 'ship step offers individual hulls');
  assert.equal(new Set(ships).size, ships.length, 'each hull appears exactly once');
  assert.equal(await page.locator('.orr-prep-fitting:not(.is-empty)').count(), 0, 'ordinary Swarm starts with empty equipment slots');
  await page.locator('.orr-prep-shipart').waitFor({state:'visible'});
  await page.waitForFunction(()=>{
    const image=document.querySelector('.orr-prep-shipart');
    return image?.complete && image.naturalWidth>0;
  });
  await page.locator('.orr-prep-fitting').first().click();
  assert.equal(await page.locator('.orr-prep-fitting').first().getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.orr-prep-fitting').first().innerText(), /Slot 1 · (Small|Medium|Large) \w+\s+Empty/i);
  assert.match(await page.locator('.orr-prep-fitnote').innerText(), /Slot 1 · (Small|Medium|Large) \w+ · Empty/i);
  await page.getByRole('button',{name:'Ship',exact:true}).click();
  await snap('ship-kit');
  await page.evaluate(()=>{window.__launches=0;window.__BENCH_BUS.on('game:new',()=>window.__launches++);});
  await page.getByRole('button',{name:'Review equipment →',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__launches),1);
  checks.push('Match setup and distinct unarmed hulls, real ship art, equipment slot preview, and launch intent');

  await open('crucible-draft');
  const launchSummary = page.locator('.orr-armory-launch-summary');
  assert.match(await launchSummary.innerText(), /Hornet.*Bank Stream M.*Concussion Cannon M.*1 empty weapon slot/);
  assert.match(await launchSummary.innerText(), /Turning & braking \d+\/10.*64 cr left/);
  assert.ok(await page.getByRole('button', { name: 'Launch round 4' }).isVisible());
  const featuredCredits = await wallet();
  if (!(await page.locator('.sf-cru-card--dealt:visible').count())) {
    await page.getByRole('button', { name: /Featured equipment/ }).click();
  }
  await page.locator('.sf-cru-card--dealt').first().click();
  assert.equal(await wallet(), featuredCredits, 'Reading a featured card must not spend');
  await openGuns();
  const before=await wallet();
  await card('Autocannon S').click();
  assert.equal(await wallet(),before,'Inspect must not spend');
  await card('Pulse Laser S').hover();
  assert.equal(await page.locator('.orr-armory-reading__name').innerText(),'Autocannon S');
  await card('Autocannon S').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.orr-armory-reading__name').innerText(),'Concussion Cannon S');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('.orr-armory-reading__name').innerText(),'Autocannon S');
  await snap('armory');
  await page.locator('.orr-armory-purchase').click();
  assert.equal(await wallet(),before-18);
  assert.equal(await page.locator('.orr-armory-purchase').isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.__BENCH_STATE.player.ownedShips[window.__BENCH_STATE.player.activeShipIndex].fittings[2]),'wpn_autocannon_s');
  assert.match(await launchSummary.innerText(), /Autocannon S.*46 cr left/);
  assert.equal(await card('Autocannon S').evaluate(e=>e===document.activeElement),true);
  assert.match(await page.locator('.orr-armory-build summary').innerText(),/5 of 8 slots filled/);
  await page.locator('.orr-armory-build summary').click();
  await snap('installed-build');
  await page.locator('.sf-cru-search').fill('zzzz-no-such-equipment');
  assert.equal(await page.locator('.orr-armory-empty').isVisible(),true);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  assert.ok(await page.locator('.sf-cru-card').count()>10);
  checks.push('Inspection/hover never spend, vertical keyboard navigation, exact purchase/fit, focus restoration, build manifest, empty-search recovery');

  await open('crucible-draft');
  await openGuns();
  await card('Autocannon S').click();
  const trialBefore=await wallet();
  await page.locator('.orr-armory-reading__more > summary').click();
  await page.getByRole('button',{name:'Demo — fly it one round',exact:true}).click();
  assert.equal(await wallet(),trialBefore);
  assert.equal(await page.getByRole('button',{name:'On trial',exact:true}).isDisabled(),true);
  checks.push('Accessible demo control fits a one-round trial without charging the wallet');

  await open('crucible-rearm');
  assert.equal(await page.getByRole('heading',{name:'Rearm',exact:true}).isVisible(),true);
  assert.equal(await page.locator('.sf-cru-card').count(),3);
  checks.push('Gauntlet retains its three-choice rearm');

  for (const size of [{width:1280,height:800},{width:390,height:844}]) {
    await open('crucible',size);
    const width = await page.locator('.orr-preparation').evaluate(e=>e.scrollWidth);
    assert.ok(width<=size.width+1,`Door horizontal overflow: ${width}`);
    await page.getByRole('button',{name:'Choose ship →',exact:true}).click();
    await page.getByRole('button',{name:'Review equipment →',exact:true}).scrollIntoViewIfNeeded();
    await snap(`ship-${size.width}`);
    await open('crucible-draft',size);
    assert.ok(await launchSummary.isVisible());
    await openGuns();
    await card('Autocannon S').click();
    await page.locator('.orr-armory-purchase').scrollIntoViewIfNeeded();
    const armoryWidth=await page.locator('.orr-visual-armory').evaluate(e=>e.scrollWidth);
    assert.ok(armoryWidth<=size.width+1,`Armory horizontal overflow: ${armoryWidth}`);
    await snap(`armory-${size.width}`);
  }
  await page.evaluate(()=>document.documentElement.classList.add('sf-reduce-motion'));
  await card('Pulse Laser S').click();
  assert.equal(await page.locator('.orr-armory-item video').count(), 0);
  assert.equal(await page.locator('.orr-armory-item svg').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  checks.push('1280×800 and 390×844: reachable launch/install, no horizontal overflow, game reduced-motion preference');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,checks,errors},null,2));
  writeFileSync(path.join(out,'checks.json'),JSON.stringify({pass:true,checks,errors},null,2));
} finally {
  if(browser) await browser.close();
  await server.close();
}
