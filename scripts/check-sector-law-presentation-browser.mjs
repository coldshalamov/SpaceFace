#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SHOT_DIR = '.devshots/sector-law';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort(start=8490) {
  for (let port=start;port<start+100;port++) {
    const free = await new Promise((resolve) => {
      const server=createServer(); server.once('error',()=>resolve(false));
      server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));
    });
    if (free) return port;
  }
  throw new Error('No free sector-law browser-check port');
}

async function waitReachable(url) {
  for (let i=0;i<100;i++) {
    try { if ((await fetch(url)).ok) return; } catch (_) {}
    await sleep(100);
  }
  throw new Error(`Fixture server did not become reachable: ${url}`);
}

let child=null;
let browser=null;
try {
  mkdirSync(SHOT_DIR,{recursive:true});
  const port=await freePort();
  const base=`http://127.0.0.1:${port}/`;
  child=spawn(process.execPath,['server.js',String(port)],{cwd:ROOT,stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.on('data',()=>{}); child.stderr.on('data',()=>{});
  await waitReachable(base);
  browser=await chromium.launch({headless:true});

  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[]; page.on('pageerror',(error)=>errors.push(String(error.message||error)));
  await page.goto(`${base}test/sector-law-presenter-fixture.html`,{waitUntil:'networkidle'});
  await page.locator('#sf-sector-law').waitFor({state:'visible'});
  let proof=await page.evaluate(()=>{
    const root=document.getElementById('sf-sector-law'); const rect=root.getBoundingClientRect();
    return { text:root.textContent.replace(/\s+/g,' ').trim(), role:root.getAttribute('role'), aria:root.getAttribute('aria-label'),
      area:(rect.width*rect.height)/(innerWidth*innerHeight), center:rect.left<innerWidth*.6&&rect.right>innerWidth*.4&&rect.top<innerHeight*.6&&rect.bottom>innerHeight*.4 };
  });
  assert.match(proof.text,/HIGH SECURITY.*HELIOS PRIME.*SOLAR CONCORD NAVY/i);
  assert.match(proof.text,/Attacking civilians, patrols, or stations triggers dispatch/i);
  assert.match(proof.text,/Rapid patrol response/i);
  assert.equal(proof.role,'status');
  assert.match(proof.aria,/Jurisdiction: Solar Concord Navy/i);
  assert.ok(proof.area<.20);
  assert.equal(proof.center,false);
  await page.screenshot({path:`${SHOT_DIR}/entry-high-1920x1080.png`,fullPage:true});

  await page.evaluate(()=>window.sfSectorLawFixture.advance(5.1));
  assert.equal(await page.locator('#sf-sector-law').isHidden(),true,'entry card expires on sim time');

  await page.setViewportSize({width:800,height:600});
  await page.evaluate(()=>window.sfSectorLawFixture.enter('sector_sker_haven'));
  await page.locator('#sf-sector-law').waitFor({state:'visible'});
  proof=(await page.locator('#sf-sector-law').textContent()).replace(/\s+/g,' ').trim();
  assert.match(proof,/LAWLESS.*SKER HAVEN.*NO RECOGNIZED AUTHORITY/i);
  assert.match(proof,/No patrol dispatch/i);
  assert.doesNotMatch(proof,/PATROL ETA|INTERCEPT ACTIVE/i);
  await page.screenshot({path:`${SHOT_DIR}/entry-lawless-800x600.png`,fullPage:true});

  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(()=>{
    const f=window.sfSectorLawFixture; f.state.world.currentSectorId='sector_helios_prime'; f.state.simTime=100; f.distress();
  });
  proof=(await page.locator('#sf-sector-law').textContent()).replace(/\s+/g,' ').trim();
  assert.match(proof,/DISTRESS LOGGED.*ETA 4\.0 S.*CUTLASS-7/i);
  assert.match(proof,/Hostile fire inside protected jurisdiction/i);
  await page.evaluate(()=>window.sfSectorLawFixture.advance(1.25));
  await page.waitForFunction(()=>document.querySelector('[data-k=status]')?.textContent==='ETA 2.8 S');
  await page.screenshot({path:`${SHOT_DIR}/distress-1280x720.png`,fullPage:true});

  await page.evaluate(()=>window.sfSectorLawFixture.dispatch());
  proof=(await page.locator('#sf-sector-law').textContent()).replace(/\s+/g,' ').trim();
  assert.match(proof,/INTERCEPT ACTIVE.*WEAPONS AUTHORIZED/i);
  assert.match(proof,/2 PATROL UNITS INTERCEPTING/i);
  assert.match(proof,/AGGRESSOR CUTLASS-7/i);
  await page.screenshot({path:`${SHOT_DIR}/intercept-1280x720.png`,fullPage:true});

  await page.evaluate(()=>window.sfSectorLawFixture.resolve('disengaged'));
  proof=(await page.locator('#sf-sector-law').textContent()).replace(/\s+/g,' ').trim();
  assert.match(proof,/CONTACT BROKEN.*PATROL STOOD DOWN/i);
  assert.match(proof,/Aggressor cleared the station ring/i);
  await page.screenshot({path:`${SHOT_DIR}/receipt-1280x720.png`,fullPage:true});

  // A malformed event cannot invent police targeting against a neutral player.
  await page.evaluate(()=>{
    const f=window.sfSectorLawFixture; f.presenter.hide();
    f.distress({ attackerId:'player', cause:'hostile_fire' });
  });
  assert.equal(await page.locator('#sf-sector-law').isHidden(),true);
  assert.deepEqual(errors,[],'fixture has no browser errors');
  await page.close();
  console.log('Sector law browser proof OK: high/lawless entry, deterministic ETA, dispatch/intercept/receipt, neutral-player guard, responsive and zero browser errors.');
} finally {
  if (browser) await browser.close().catch(()=>{});
  if (child && !child.killed) child.kill();
}
