#!/usr/bin/env node
/** Browser proof against the shipped MP4, not mock imagery. Run a server on 8123.
 * INTRO_PLAYWRIGHT can point at an isolated installed playwright/index.mjs.
 * Output is a disposable review artifact; nothing writes to shipped assets.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.INTRO_PLAYWRIGHT
  ? pathToFileURL(process.env.INTRO_PLAYWRIGHT).href : 'playwright-core');
const args=process.argv.slice(2), oi=args.indexOf('--out');
const out=resolve(oi<0?'.devshots/signal-remix':args[oi+1]);
const url=process.env.INTRO_URL || 'http://127.0.0.1:8123/tools/cinematic/signal-remix.html';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.INTRO_BROWSER_CHANNEL || 'chrome',headless:true,args:[
  '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
]});
const report={renderer:'Chrome / software WebGL2 (not a hardware performance claim)',frames:[],checks:[],errors:[]};
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
page.on('pageerror',e=>report.errors.push(e.message));
try {
  await page.goto(url+'?capture&art',{waitUntil:'load'});
  await page.waitForFunction(()=>window.__remixProof?.ready,{timeout:30000});
  const initial=await page.evaluate(()=>({status:__remixProof.controller?.inspect(),errors:__remixProof.errors}));
  assert(initial.status&&!initial.status.failed,'No valid compositor: '+JSON.stringify(initial));
  for(const t of [1.3,4,7.4,10.8,14.5,17.6]){
    const state=await page.evaluate(t=>__remixProof.frame(t),t);
    assert(state.status.frameCount>0&&!state.status.failed,'frame failed at '+t);
    await page.screenshot({path:resolve(out,`remix-${t}.png`)});report.frames.push({t,...state});
  }
  for(const view of ['original','tableaux','terminal']){
    await page.evaluate(view=>__remixProof.frame(9,view),view);
    await page.screenshot({path:resolve(out,`${view}.png`)});
  }
  // Restoring the actual lockup checks layering/legibility independently of art-only stills.
  await page.evaluate(()=>document.documentElement.classList.remove('art-only'));
  await page.evaluate(()=>__remixProof.frame(14.5));
  await page.screenshot({path:resolve(out,'with-lockup.png')});
  report.checks.push('six source shots, all three retained sources, existing lockup');
  await page.goto(url+'?managed&capture',{waitUntil:'load'});
  await page.waitForFunction(()=>window.__remixProof?.ready&&__remixProof.controller?.inspect().frameCount>2,null,{timeout:30000});
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.intro-signal-remix').length),1);
  assert(Math.abs(await page.evaluate(()=>__remixProof.video.playbackRate)-32/18)<1e-5);
  const stopCount=async()=>{
    await page.waitForTimeout(150);
    const n=await page.evaluate(()=>__remixProof.controller.inspect().frameCount);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>__remixProof.controller.inspect().frameCount),n);
  };
  await page.evaluate(()=>document.querySelector('#boot-overlay').classList.add('hidden'));
  await stopCount();assert(await page.evaluate(()=>__remixProof.video.paused));
  await page.evaluate(()=>document.querySelector('#boot-overlay').classList.remove('hidden'));
  await page.waitForFunction(()=>__remixProof.controller.inspect().running&&!__remixProof.video.paused);
  report.checks.push('hidden host suspends video + GPU, then resumes without duplicate canvases');
  await page.evaluate(()=>document.documentElement.classList.add('sf-reduce-motion'));
  await stopCount();assert(await page.evaluate(()=>__remixProof.video.paused));
  await page.screenshot({path:resolve(out,'reduced-motion.png')});
  await page.evaluate(()=>document.documentElement.classList.remove('sf-reduce-motion'));
  await page.waitForFunction(()=>__remixProof.controller.inspect().running&&!__remixProof.video.paused);
  await page.evaluate(()=>document.documentElement.classList.add('sf-reduce-flash'));
  await page.waitForFunction(()=>__remixProof.controller.inspect().reducedFlash);
  await page.screenshot({path:resolve(out,'reduced-flash.png')});
  report.checks.push('live motion/flash preference changes');
  await page.evaluate(()=>document.documentElement.classList.remove('sf-reduce-flash'));
  for(const viewport of [{width:2560,height:1080},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(500);
    const state=await page.evaluate(()=>__remixProof.controller.inspect());
    assert(state.width<=1280&&state.height<=720&&!state.failed);
    await page.screenshot({path:resolve(out,`viewport-${viewport.width}.png`)});
  }
  report.checks.push('ultrawide + portrait cover and resolution caps');
  await page.evaluate(()=>__remixProof.controller.canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(()=>__remixProof.controller.inspect().failed);
  assert.equal(await page.evaluate(()=>__remixProof.controller.canvas.style.display),'none');
  assert.equal(await page.evaluate(()=>__remixProof.video.playbackRate),1);
  report.checks.push('context loss reveals untouched original movie and restores original playback rate');
  await page.evaluate(()=>__remixProof.video.remove());await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.intro-signal-remix').length),0);
  report.checks.push('removed host releases canvas and controller');
  assert.deepEqual(report.errors,[]);
  report.passed=true;
} catch(error) { report.passed=false;report.failure=error.stack;report.diagnostics=await page.evaluate(()=>({ready:window.__remixProof?.ready,errors:window.__remixProof?.errors,video:[...document.querySelectorAll('video')].map(v=>({readyState:v.readyState,networkState:v.networkState,source:v.currentSrc,error:v.error?.message,codec:v.canPlayType('video/mp4; codecs=\"avc1.42E01E\"')}))})).catch(()=>null);await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});throw error; }
finally { await writeFile(resolve(out,'browser-report.json'),JSON.stringify(report,null,2));await browser.close(); }
