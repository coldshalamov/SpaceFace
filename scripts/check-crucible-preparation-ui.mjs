#!/usr/bin/env node
// Real screen modules + real draft/fitting owners, using the repository's seeded UI bench.
// Not a full gameplay/bootstrap or GPU performance test. No production data is mutated.
// Focused armory transaction checks; check-swarm-hangar-ux.mjs owns the complete title journey.
// node scripts/check-crucible-preparation-ui.mjs [--out=.devshots/crucible-preparation]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { launchChromium } from './player-truth/browser.mjs';
const out = path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6) || '.devshots/crucible-preparation');
mkdirSync(out, {recursive:true});
const server = await startBenchServer();
let browser;
const errors = [], checks = [];
try {
  const {chromium} = await loadPlaywright();
  ({browser} = await launchChromium(chromium, {headless:true, ...(process.env.SF_CHROMIUM ? {executablePath:process.env.SF_CHROMIUM} : {})}));
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
  const launches = () => page.evaluate(()=>window.BENCH.log.filter(line=>/^game:new\(/.test(line)).length);
  const card = name => page.locator('.sf-cru-card').filter({has:page.locator('h2',{hasText:name})});

  await open('crucible');
  assert.equal(await page.locator('.orr-swarm-hangar').getAttribute('data-prep-step'),'0');
  const alternateHull = page.locator('[data-swarm-hull][aria-disabled="false"]:not([aria-pressed="true"])').first();
  const hullId = await alternateHull.getAttribute('data-swarm-hull');
  await alternateHull.click();
  assert.equal(await alternateHull.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.sf-hangar-shipstage').getAttribute('data-hull-id'),hullId);
  await page.waitForFunction(()=>{
    const image=document.querySelector('[data-swarm-hull][aria-pressed="true"] img');
    return image?.complete && image.naturalWidth>0;
  });
  const loadout = page.locator('[data-swarm-kit][aria-disabled="false"]').first();
  await loadout.click();
  assert.equal(await loadout.getAttribute('aria-pressed'),'true');
  assert.ok(await page.locator('.sf-hangar-manifest').innerText());
  await snap('ship-loadout');
  assert.equal(await launches(),0,'Choosing ship and equipment must not begin a run');
  await page.locator('.sf-hangar-next').click();
  assert.equal(await page.locator('.orr-swarm-hangar').getAttribute('data-prep-step'),'1');
  await snap('arena-difficulty');
  await page.getByRole('button',{name:/^Review equipment for /}).click();
  assert.equal(await launches(),1);
  checks.push('Ship-first setup, distinct hull art, selected equipment manifest and one canonical review-equipment launch intent');

  await open('crucible-draft');
  await page.locator('[data-category="Weapons"]').click();
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
  assert.equal(await card('Autocannon S').evaluate(e=>e===document.activeElement),true);
  assert.match(await page.locator('.orr-armory-build summary').innerText(),/5 \/ 8 fitted/);
  await page.locator('.orr-armory-build summary').click();
  await snap('installed-build');
  await page.locator('.sf-cru-search').fill('zzzz-no-such-equipment');
  assert.equal(await page.locator('.orr-armory-empty').isVisible(),true);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  assert.ok(await page.locator('.sf-cru-card').count()>10);
  checks.push('Inspection/hover never spend, vertical keyboard navigation, exact purchase/fit, focus restoration, build manifest, empty-search recovery');

  await open('crucible-draft');
  await page.locator('[data-category="Weapons"]').click();
  await card('Autocannon S').click();
  const trialBefore=await wallet();
  const more = page.locator('.orr-armory-reading__more');
  if (await more.getAttribute('open') === null) await more.locator('summary').click();
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
    const width = await page.locator('.orr-swarm-hangar').evaluate(e=>e.scrollWidth);
    assert.ok(width<=size.width+1,`Hangar horizontal overflow: ${width}`);
    await page.locator('.sf-hangar-next').scrollIntoViewIfNeeded();
    await snap(`ship-${size.width}`);
    await page.locator('.sf-hangar-next').click();
    await page.getByRole('button',{name:/^Review equipment for /}).scrollIntoViewIfNeeded();
    await snap(`run-${size.width}`);
    await open('crucible-draft',size);
    await page.locator('[data-category="Weapons"]').click();
    await card('Autocannon S').click();
    await page.locator('.orr-armory-purchase').scrollIntoViewIfNeeded();
    const armoryWidth=await page.locator('.orr-visual-armory').evaluate(e=>e.scrollWidth);
    assert.ok(armoryWidth<=size.width+1,`Armory horizontal overflow: ${armoryWidth}`);
    await snap(`armory-${size.width}`);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.orr-armory-item > svg').evaluate(e=>getComputedStyle(e).animationName),'none');
  checks.push('1280×800 and 390×844: reachable review/install, no horizontal overflow, system reduced-motion preference');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,checks,errors},null,2));
  writeFileSync(path.join(out,'checks.json'),JSON.stringify({pass:true,checks,errors},null,2));
} finally {
  if(browser) await browser.close();
  await server.close();
}
