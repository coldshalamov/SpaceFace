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
    await page.screenshot({path:`${SHOT_DIR}/decision-${viewport.width}x${viewport.height}.png`,fullPage:true});

    await page.evaluate(()=>window.sfRecoveryFixture.custody('awaiting_tether'));
    const custodyProof=await page.evaluate(()=>{const root=document.getElementById('sf-recovery-encounter'),status=root.querySelector('[data-k=status]'),meter=root.querySelector('[data-k=meter]'),actions=root.querySelector('[data-k=actions]');return{text:root.textContent.replace(/\s+/g,' ').trim(),role:root.getAttribute('role'),live:root.getAttribute('aria-live'),atomic:root.getAttribute('aria-atomic'),aria:root.getAttribute('aria-label'),statusHidden:status.getAttribute('aria-hidden'),meterHidden:meter.hidden,actionsHidden:actions.hidden,buttons:root.querySelectorAll('button').length,focused:root.contains(document.activeElement)}});
    assert.match(custodyProof.text,/CIVILIAN RECOVERY.*WINDOW 75 S.*MTS RELIEF MULE.*8 CARGO.*FIXTURE LAWFUL HARBOR/i);
    assert.doesNotMatch(custodyProof.text,/DEADLINE T\+/i);
    assert.match(custodyProof.text,/Massline latch and reel inside 60 WU.*tow 8 cargo to Fixture Lawful Harbor/i);
    assert.equal(custodyProof.role,'status');assert.equal(custodyProof.live,'polite');assert.equal(custodyProof.atomic,'true');
    assert.match(custodyProof.aria,/75 seconds remaining/i);
    assert.equal(custodyProof.statusHidden,'true');assert.equal(custodyProof.meterHidden,true);assert.equal(custodyProof.actionsHidden,true);assert.equal(custodyProof.buttons,0);assert.equal(custodyProof.focused,false);
    await page.evaluate(()=>window.sfRecoveryFixture.custody('tethered'));
    let custodyText=(await page.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(custodyText,/Line attached.*Reel to 60 WU/i);
    await page.evaluate(()=>window.sfRecoveryFixture.custody('secured'));
    custodyText=(await page.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(custodyText,/Custody locked.*MTS RELIEF MULE.*Fixture Lawful Harbor/i);
    await page.evaluate(()=>window.sfRecoveryFixture.custodyReceipt('recovered'));
    custodyText=(await page.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(custodyText,/CUSTODY RECEIPT.*SUCCESS.*FREIGHT RECOVERED.*138 CREDITS.*8 CARGO.*FIXTURE LAWFUL HARBOR.*Receipt civilian-recovery:fixture-manifest:6000:recovered/i);
    assert.doesNotMatch(custodyText,/WINDOW|seconds remaining/i);
    assert.doesNotMatch(await page.locator('#sf-recovery-encounter').getAttribute('aria-label'),/seconds remaining/i);
    await page.screenshot({path:`${SHOT_DIR}/custody-success-${viewport.width}x${viewport.height}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();
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

  const custody=await browser.newPage({viewport:VIEWPORTS[1]});await custody.goto(`${base}test/recovery-encounter-prompt-fixture.html`,{waitUntil:'networkidle'});
  const lifecycle=await custody.evaluate(()=>{const f=window.sfRecoveryFixture,before=f.listenerCount('surrender:option');f.reinit();return{before,after:f.listenerCount('surrender:option'),roots:document.querySelectorAll('#sf-recovery-encounter').length}});
  assert.deepEqual(lifecycle,{before:1,after:1,roots:1},'reinit unsubscribes the old prompt before mounting one replacement');
  await custody.evaluate(()=>{const root=document.getElementById('sf-recovery-encounter'),status=root.querySelector('[data-k=status]');window.__custodyMutations={aria:0,status:0};new MutationObserver((rows)=>{for(const row of rows){if(row.type==='attributes'&&row.attributeName==='aria-label')window.__custodyMutations.aria++;}}).observe(root,{attributes:true,attributeFilter:['aria-label']});new MutationObserver(()=>window.__custodyMutations.status++).observe(status,{childList:true,characterData:true,subtree:true});window.sfRecoveryFixture.custody('awaiting_tether')});
  const initialAria=await custody.locator('#sf-recovery-encounter').getAttribute('aria-label');
  await custody.evaluate(()=>{const f=window.sfRecoveryFixture;f.advance(.2);f.advance(.6)});
  assert.equal(await custody.locator('[data-k=status]').textContent(),'WINDOW 75 S','visual countdown does not rewrite within one sim-time second');
  assert.equal(await custody.locator('#sf-recovery-encounter').getAttribute('aria-label'),initialAria,'countdown never rewrites the accessible phase announcement');
  await custody.evaluate(()=>window.sfRecoveryFixture.advance(.3));
  assert.equal(await custody.locator('[data-k=status]').textContent(),'WINDOW 74 S');
  await custody.evaluate(()=>window.sfRecoveryFixture.custody('awaiting_tether'));
  let mutations=await custody.evaluate(()=>window.__custodyMutations);assert.equal(mutations.aria,1,'duplicate option does not announce the same phase again');
  await custody.evaluate(()=>window.sfRecoveryFixture.custody('tethered'));
  mutations=await custody.evaluate(()=>window.__custodyMutations);assert.equal(mutations.aria,2,'tethered phase announces once');
  await custody.evaluate(()=>window.sfRecoveryFixture.custody('secured'));
  mutations=await custody.evaluate(()=>window.__custodyMutations);assert.equal(mutations.aria,3,'secured phase announces once');
  await custody.evaluate(()=>{const f=window.sfRecoveryFixture;f.custody('lost',{id:'civilian-recovery:fixture-timeout:7000',deadlineAt:176.1,lostReason:'timed_out'});f.custodyReceipt('timed_out',{id:'civilian-recovery:fixture-timeout:7000:timed_out',recoveryId:'civilian-recovery:fixture-timeout:7000',outcome:'timed_out'})});
  mutations=await custody.evaluate(()=>window.__custodyMutations);assert.equal(mutations.aria,4,'terminal loss and its canonical receipt share one accessible announcement');
  let lostText=(await custody.locator('#sf-recovery-encounter').textContent()).replace(/\s+/g,' ').trim();assert.match(lostText,/RECOVERY CLOSED.*LOST.*FREIGHT RECOVERY LOST.*0 CREDITS.*8 CARGO.*REASON TIMED OUT.*Receipt civilian-recovery:fixture-timeout:7000:timed_out/i);
  assert.doesNotMatch(lostText,/WINDOW|seconds remaining/i);assert.doesNotMatch(await custody.locator('#sf-recovery-encounter').getAttribute('aria-label'),/seconds remaining/i);
  await custody.evaluate(()=>{const f=window.sfRecoveryFixture;f.custody('awaiting_tether',{id:'civilian-recovery:fixture-motion:8000'});f.state.settings.video.motionReduce=true;f.prompt.tick()});
  let motion=await custody.evaluate(()=>{const root=document.getElementById('sf-recovery-encounter');return{data:root.dataset.reducedMotion,duration:getComputedStyle(root).transitionDuration}});assert.equal(motion.data,'true');assert.match(motion.duration,/^0s(?:, 0s)?$/);
  await custody.emulateMedia({reducedMotion:'reduce'});motion=await custody.evaluate(()=>{const root=document.getElementById('sf-recovery-encounter');window.sfRecoveryFixture.state.settings.video.motionReduce=false;window.sfRecoveryFixture.prompt.tick();return{data:root.dataset.reducedMotion,duration:getComputedStyle(root).transitionDuration}});assert.equal(motion.data,'false');assert.match(motion.duration,/^0s(?:, 0s)?$/);
  const commsOwner=await custody.evaluate(()=>{const f=window.sfRecoveryFixture;f.mountComms();return{roots:document.querySelectorAll('#sf-recovery-encounter').length,subscribers:f.listenerCount('surrender:option')}});assert.deepEqual(commsOwner,{roots:1,subscribers:1});
  const commsReinit=await custody.evaluate(()=>{const f=window.sfRecoveryFixture;f.mountComms();return{roots:document.querySelectorAll('#sf-recovery-encounter').length,subscribers:f.listenerCount('surrender:option')}});assert.deepEqual(commsReinit,{roots:1,subscribers:1},'default comms owner replaces its prompt and subscriber exactly once');
  const commsDestroyed=await custody.evaluate(()=>{const f=window.sfRecoveryFixture;f.destroyComms();return{roots:document.querySelectorAll('#sf-recovery-encounter').length,subscribers:f.listenerCount('surrender:option')}});assert.deepEqual(commsDestroyed,{roots:0,subscribers:0},'default comms owner destroy removes prompt and subscriber');
  await custody.close();
  console.log('Recovery encounter browser proof OK: derelict interaction plus custody offer -> tethered -> secured -> success and precise timeout/loss, 3 responsive viewports, role/ARIA, bounded sim-time countdown, lifecycle cleanup, OS/in-game reduced motion, no custody controls or browser errors.');
}finally{if(browser)await browser.close().catch(()=>{});if(child&&!child.killed)child.kill()}
