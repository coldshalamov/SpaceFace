#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT=process.cwd(),SHOT_DIR='.devshots/recovery-encounter';
const VIEWPORTS=[{width:1920,height:1080},{width:1280,height:720},{width:800,height:600}];
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function freePort(start=8560){for(let port=start;port<start+100;port++){const free=await new Promise((resolve)=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)))});if(free)return port}throw new Error('No free recovery browser-check port')}
async function waitReachable(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return}catch(_){}await sleep(100)}throw new Error(`Fixture server did not become reachable: ${url}`)}

let child=null,browser=null;
try{
  mkdirSync(SHOT_DIR,{recursive:true});const port=await freePort(),base=`http://127.0.0.1:${port}/`;
  child=spawn(process.execPath,['server.js',String(port)],{cwd:ROOT,stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});await waitReachable(base);
  browser=await chromium.launch({headless:true});
  for(const viewport of VIEWPORTS){
    const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',(error)=>errors.push(String(error&&error.message||error)));
    await page.goto(`${base}test/recovery-encounter-prompt-fixture.html`,{waitUntil:'networkidle'});
    await page.evaluate(()=>window.sfRecoveryFixture.show('decision'));
    await page.locator('#sf-recovery-encounter').waitFor({state:'visible'});
    const proof=await page.evaluate(()=>{const root=document.getElementById('sf-recovery-encounter'),rect=root.getBoundingClientRect();return{text:root.textContent.replace(/\s+/g,' ').trim(),role:root.getAttribute('role'),aria:root.getAttribute('aria-label'),buttons:[...root.querySelectorAll('button')].map((b)=>({text:b.textContent.trim(),disabled:b.disabled,aria:b.getAttribute('aria-label')})),area:(rect.width*rect.height)/(innerWidth*innerHeight),center:rect.left<innerWidth*.6&&rect.right>innerWidth*.4&&rect.top<innerHeight*.6&&rect.bottom>innerHeight*.4}});
    assert.match(proof.text,/DERELICT RECOVERY.*STABLE · CHOOSE.*LIFE SIGNS · POD INTACT/i);
    assert.match(proof.text,/REGISTERED CLAIM.*CLAIMED.*RESCUE.*BLACK BOX.*STRIP/i);
    assert.equal(proof.role,'status');assert.match(proof.aria,/Method sets cargo, payout, and reputation/i);
    assert.equal(proof.buttons.length,3);assert.equal(proof.buttons[0].disabled,false);assert.ok(proof.buttons.every((b)=>/Controller/.test(b.aria)));
    assert.ok(proof.area<(viewport.width<=800?.26:.20),`card covers ${(proof.area*100).toFixed(1)}%`);assert.equal(proof.center,false);
    await page.screenshot({path:`${SHOT_DIR}/decision-${viewport.width}x${viewport.height}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();
  }

  const flow=await browser.newPage({viewport:VIEWPORTS[0]});await flow.goto(`${base}test/recovery-encounter-prompt-fixture.html`,{waitUntil:'networkidle'});
  let text=(await flow.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(text,/IDENTIFY.*UNIDENTIFIED DERELICT.*Pulse scanner within 260 WU/i);
  await flow.evaluate(()=>window.sfRecoveryFixture.show('hazard',{condition:'unstable',conditionLabel:'REACTOR LEAK · CORE LIVE',ownership:'OPEN SALVAGE',legalStatus:'open',hasSurvivor:false,hazard:'reactor_leak',hazardRemaining_s:8.4}));
  text=(await flow.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(text,/CORE 8\.4 S.*VENT CORE/i);assert.doesNotMatch(text,/HOSTILE|AMBUSH/i);
  await flow.locator('[data-choice=vent]').click();text=(await flow.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(text,/STABILIZE 20%.*REACTOR VENTED.*Massline holding/i);
  await flow.evaluate(()=>window.sfRecoveryFixture.show('decision'));await flow.locator('[data-choice=blackbox]').click();
  text=(await flow.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(text,/RECOVERY RECEIPT.*BLACK BOX SECURED.*360 credits.*4 reputation.*1 cargo units/i);
  await flow.screenshot({path:`${SHOT_DIR}/receipt-1920x1080.png`,fullPage:true});await flow.close();

  const pad=await browser.newPage({viewport:VIEWPORTS[1]});await pad.goto(`${base}test/recovery-encounter-prompt-fixture.html`,{waitUntil:'networkidle'});
  const choice=await pad.evaluate(()=>{const f=window.sfRecoveryFixture;f.show('decision');f.gamepad.actions.accept={pressed:true,held:true,value:1};f.prompt.tick();return f.emitted.filter((e)=>e.name==='recovery:choose').at(-1)});
  assert.equal(choice.payload.choice,'rescue');assert.equal(choice.payload.source,'gamepad');await pad.close();
  console.log('Recovery encounter browser proof OK: identify/hazard/stabilize/decision/receipt, 3 responsive viewports, click + controller, no center obstruction or browser errors.');
}finally{if(browser)await browser.close().catch(()=>{});if(child&&!child.killed)child.kill()}
