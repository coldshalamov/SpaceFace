// Focused component acceptance: real production rig + native simulation + Rapier + public bench controls.
// This is NOT a claim that the multi-GB full-game route has been booted.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const modulePath=process.env.VESPER_PLAYWRIGHT_MODULE;
const { chromium }=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const out=new URL('../../.devshots/vesper/',import.meta.url),root=new URL('../../',import.meta.url);
await mkdir(out,{recursive:true});const port=18273,server=spawn(process.execPath,['server.js',String(port)],{cwd:root,stdio:'ignore'});
let browser;const errors=[],report={route:'scripts/characters/vesper-bench.html',scope:'component WebGL and physics bench; not full-game acceptance',checks:[],errors};
try {
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/scripts/characters/vesper-bench.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${port}/scripts/characters/vesper-bench.html`,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.vesperBench!==undefined,{timeout:30000});
 assert.equal(await page.locator('#error').textContent(),'');report.checks.push('production models construct and shaders link');
 await page.screenshot({path:fileURLToPath(new URL('01-encounter.png',out))});
 await page.locator('#scan').click();await page.waitForTimeout(3000);
 assert.equal(await page.evaluate(()=>vesperBench.state.vesper.met),true);report.checks.push('public Scan button wakes character');
 for(const i of [0,2,1]){
  const b=page.locator(`[data-bell="${i}"]`);await b.hover();await page.mouse.down();await page.waitForTimeout(1400);await page.mouse.up();await page.waitForTimeout(120);
 }
 assert.ok(await page.evaluate(()=>vesperBench.state.vesper.performances>=1),'public grip-and-release controls complete phrase through Rapier');
 report.checks.push('LOW-HIGH-MIDDLE performed via pointer controls and actual solver, not injected outcome');
 await page.screenshot({path:fileURLToPath(new URL('02-live-phrase.png',out))});
 await page.locator('#scan').click();assert.equal(await page.evaluate(()=>vesperBench.system._following),true);
 await page.locator('#scan').click();assert.equal(await page.evaluate(()=>vesperBench.system._following),false);
 report.checks.push('optional follow/stay toggles');
 await page.locator('#pause').click();const t=await page.evaluate(()=>vesperBench.state.simTime);await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>vesperBench.state.simTime),t);report.checks.push('pause freezes simulation');
 await page.locator('#quiet').click();assert.equal(await page.locator('#quiet').getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>vesperBench.studyPose('listen'));await page.screenshot({path:fileURLToPath(new URL('03-model-awake.png',out))});
 await page.evaluate(()=>vesperBench.studyPose('sleep'));await page.screenshot({path:fileURLToPath(new URL('04-model-sleep.png',out))});
 await page.evaluate(()=>{vesperBench.setReduced(false);vesperBench.studyPose('bloom');});await page.screenshot({path:fileURLToPath(new URL('05-model-song.png',out))});
 report.checks.push('awake, folded and overtone visual stills; reduced motion control');
 await page.locator('#reset').click();assert.equal(await page.evaluate(()=>vesperBench.state.vesper.met),false);
 assert.equal(await page.evaluate(()=>vesperBench.roots.size),4);report.checks.push('reset has exactly four render roots');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:fileURLToPath(new URL('06-mobile.png',out))});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.checks.push('390px layout has no horizontal overflow');
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>vesperBench.setView(false));
 report.renderer=await page.evaluate(()=>({calls:vesperBench.renderer.info.render.calls,triangles:vesperBench.renderer.info.render.triangles,
  geometries:vesperBench.renderer.info.memory.geometries,textures:vesperBench.renderer.info.memory.textures,programs:vesperBench.renderer.info.programs.length,
  version:vesperBench.renderer.getContext().getParameter(vesperBench.renderer.getContext().VERSION),soundCues:vesperBench.soundCount}));
 await page.evaluate(()=>vesperBench.dispose());assert.equal(await page.locator('canvas').count(),0);report.checks.push('explicit teardown removes canvas and frees model resources');
 assert.deepEqual(errors,[]);report.status='passed';
} catch(error){report.status='failed';report.failure=error.stack||String(error);process.exitCode=1;}
finally{await browser?.close();server.kill();await writeFile(new URL('browser-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
