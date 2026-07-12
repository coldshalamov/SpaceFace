#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT=process.cwd();
const SHOT_DIR='.devshots/scanner-signal';
const VIEWPORTS=[{width:1920,height:1080},{width:1280,height:720},{width:800,height:600}];
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

async function freePort(start=8520){
  for(let port=start;port<start+100;port++){
    const free=await new Promise((resolve)=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
    if(free)return port;
  }
  throw new Error('No free scanner-signal browser-check port');
}

async function waitReachable(url){
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch(_){} await sleep(100);}
  throw new Error(`Fixture server did not become reachable: ${url}`);
}

let child=null; let browser=null;
try{
  mkdirSync(SHOT_DIR,{recursive:true});
  const port=await freePort(); const base=`http://127.0.0.1:${port}/`;
  child=spawn(process.execPath,['server.js',String(port)],{cwd:ROOT,stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.on('data',()=>{}); child.stderr.on('data',()=>{});
  await waitReachable(base);
  browser=await chromium.launch({headless:true});

  for(const viewport of VIEWPORTS){
    const page=await browser.newPage({viewport}); const errors=[];
    page.on('pageerror',(error)=>errors.push(String(error&&error.message||error)));
    await page.goto(`${base}test/scanner-signal-prompt-fixture.html`,{waitUntil:'networkidle'});
    await page.locator('#sf-signal-investigation').waitFor({state:'visible'});
    const proof=await page.evaluate(()=>{
      const root=document.getElementById('sf-signal-investigation'); const rect=root.getBoundingClientRect();
      return {text:root.textContent.replace(/\s+/g,' ').trim(),role:root.getAttribute('role'),aria:root.getAttribute('aria-label'),
        buttons:root.querySelectorAll('button').length,area:(rect.width*rect.height)/(innerWidth*innerHeight),
        center:rect.left<innerWidth*.6&&rect.right>innerWidth*.4&&rect.top<innerHeight*.6&&rect.bottom>innerHeight*.4};
    });
    assert.match(proof.text,/SCAN RETURN.*CONFIDENCE 35%.*SHIP SIGNATURE/i);
    assert.match(proof.text,/MEDIUM.*900 WU.*PASS 1/i);
    assert.match(proof.text,/Traffic pattern unresolved.*TRACK \/ INVESTIGATE/i);
    assert.match(proof.text,/\+1 OTHER RETURN/i);
    assert.doesNotMatch(proof.text,/HOSTILE|PIRATE|AMBUSH/i);
    assert.equal(proof.role,'status');
    assert.match(proof.aria,/Track or investigate/i);
    assert.equal(proof.buttons,1);
    assert.ok(proof.area<.20,`signal card covers ${(proof.area*100).toFixed(1)}% of viewport`);
    assert.equal(proof.center,false,'signal card never covers central flight read');
    await page.screenshot({path:`${SHOT_DIR}/${viewport.width}x${viewport.height}.png`,fullPage:true});
    assert.deepEqual(errors,[],'fixture has no browser errors');
    await page.close();
  }

  const clickPage=await browser.newPage({viewport:VIEWPORTS[0]});
  await clickPage.goto(`${base}test/scanner-signal-prompt-fixture.html`,{waitUntil:'networkidle'});
  await clickPage.locator('[data-k=track]').click();
  let proof=await clickPage.evaluate(()=>({
    track:window.sfSignalFixture.emitted.filter((e)=>e.name==='signal:track').at(-1),
    text:document.getElementById('sf-signal-investigation').textContent.replace(/\s+/g,' ').trim(),
    actionHidden:document.querySelector('[data-k=track]').hidden,
  }));
  assert.equal(proof.track.payload.signalId,'signal:quiet-hook');
  assert.equal(proof.track.payload.source,'click');
  assert.match(proof.text,/NAV FIX ARMED.*UNCERTAIN TRAFFIC.*OBJECTIVE \+ MAP UPDATED/i);
  assert.equal(proof.actionHidden,true);
  await clickPage.evaluate(()=>window.sfSignalFixture.complete());
  proof=(await clickPage.locator('#sf-signal-investigation').textContent()).replace(/\s+/g,' ').trim();
  assert.match(proof,/INVESTIGATION COMPLETE.*DISCOVERY RECEIPT.*SAVED/i);
  await clickPage.screenshot({path:`${SHOT_DIR}/receipt-1920x1080.png`,fullPage:true});
  await clickPage.close();

  const padPage=await browser.newPage({viewport:VIEWPORTS[1]});
  await padPage.goto(`${base}test/scanner-signal-prompt-fixture.html`,{waitUntil:'networkidle'});
  const pad=await padPage.evaluate(()=>{
    const f=window.sfSignalFixture; f.gamepad.actions.accept={pressed:true,held:true,released:false,value:1}; f.prompt.tick();
    return f.emitted.filter((e)=>e.name==='signal:track').at(-1);
  });
  assert.equal(pad.payload.signalId,'signal:quiet-hook');
  assert.equal(pad.payload.source,'gamepad');
  await padPage.close();
  console.log('Scanner signal browser proof OK: 3 responsive viewports, compact non-modal card, click + controller tracking, durable receipt presentation, zero browser errors.');
}finally{
  if(browser)await browser.close().catch(()=>{});
  if(child&&!child.killed)child.kill();
}
