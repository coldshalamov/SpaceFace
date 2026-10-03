#!/usr/bin/env node
// Real screen modules + real draft/fitting owners, using the repository's seeded UI bench.
// Not a full gameplay/bootstrap or GPU performance test. No production data is mutated.
// node scripts/check-crucible-preparation-ui.mjs [--out=/tmp/crucible-ui]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startBenchServer } from './lib/benchServer.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const out = path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6) || '.devshots/crucible-preparation');
mkdirSync(out, {recursive:true});
const server = await startBenchServer();
let browser;
const errors = [], checks = [];
try {
  const {chromium} = await loadPlaywright();
  browser = await chromium.launch({headless:true, ...(process.env.SF_CHROMIUM ? {executablePath:process.env.SF_CHROMIUM} : {})});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(String(error)));
  const open = async (shot, size={width:1440,height:900}) => {
    await page.setViewportSize(size);
    await page.goto(`${server.baseUrl}tools/ui-bench.html?screen=${shot}&chrome=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(()=>window.__BENCH_READY===true);
    await page.locator('.screen').first().waitFor({state:'visible'});
    assert.match(await page.title(), /SpaceFace/);
    assert.ok((await page.locator('body').innerText()).length > 100);
  };
  const snap = async name => page.screenshot({path:path.join(out,`${name}.png`)});
  const wallet = () => page.evaluate(()=>window.__BENCH_STATE.run.credits);
  const card = name => page.locator('.sf-cru-card').filter({has:page.locator('h2',{hasText:name})});

  await open('crucible');
  assert.equal(await page.locator('.orr-preparation').getAttribute('data-prep-step'),'0');
  await snap('encounter');
  await page.getByRole('tab',{name:'01 Encounter'}).press('ArrowRight');
  assert.equal(await page.locator('.orr-preparation').getAttribute('data-prep-step'),'1');
  assert.ok(await page.locator('.orr-sigil, .orr-prep-hullsub, .orr-prep-thumb').count() > 0);
  await page.locator('.orr-prep-fitting').first().click();
  assert.equal(await page.locator('.orr-prep-fitting').first().getAttribute('aria-pressed'),'true');
  assert.ok(await page.locator('.orr-prep-fitnote').innerText());
  await page.getByRole('button',{name:'Ship',exact:true}).click();
  await snap('ship-kit');
  await page.evaluate(()=>{window.__launches=0;window.__BENCH_BUS.on('game:new',()=>window.__launches++);});
  await page.getByRole('button',{name:'Open armory →',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__launches),1);
  checks.push('Door tabs, real starter art, true hardpoint selection and existing New Game launch intent');

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
    await page.getByRole('button',{name:'Choose ship & kit →',exact:true}).click();
    await page.getByRole('button',{name:'Open armory →',exact:true}).scrollIntoViewIfNeeded();
    await snap(`ship-${size.width}`);
    await open('crucible-draft',size);
    await page.locator('[data-category="Weapons"]').click();
    await card('Autocannon S').click();
    await page.locator('.orr-armory-purchase').scrollIntoViewIfNeeded();
    const armoryWidth=await page.locator('.orr-visual-armory').evaluate(e=>e.scrollWidth);
    assert.ok(armoryWidth<=size.width+1,`Armory horizontal overflow: ${armoryWidth}`);
    await snap(`armory-${size.width}`);
  }
  await page.locator('[data-category="Service"]').click();
  await page.locator('.sf-cru-card').first().click();
  await page.evaluate(()=>document.documentElement.classList.add('sf-reduce-motion'));
  assert.equal(await page.locator('.orr-armory-item > svg').evaluate(e=>getComputedStyle(e).animationName),'none');
  checks.push('1280×800 and 390×844: reachable launch/install, no horizontal overflow, game reduced-motion preference');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,checks,errors},null,2));
  writeFileSync(path.join(out,'checks.json'),JSON.stringify({pass:true,checks,errors},null,2));
} finally {
  if(browser) await browser.close();
  await server.close();
}
