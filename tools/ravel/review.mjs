/** Browser proof using the production fixture; no test-only renderer or replacement physics.
 * RAVEL_PLAYWRIGHT may point at an installed playwright/index.mjs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const { chromium } = await import(process.env.RAVEL_PLAYWRIGHT || 'playwright');
const out=path.resolve(process.env.RAVEL_REVIEW_OUT||'.ravel-review');await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;const errors=[],report={scope:'Isolated production encounter, not a full-world or packaged Electron playtest',checks:[]};
try{
 await sleep(600);browser=await chromium.launch({executablePath:process.env.RAVEL_CHROME||'/usr/bin/google-chrome',headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push(m.text());});
 page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));
 await page.goto('http://127.0.0.1:8765/tools/ravel/bench.html',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__ravelReady===true,{timeout:30000});
 await page.screenshot({path:path.join(out,'01-encounter.png')});
 await page.click('#study');await page.screenshot({path:path.join(out,'02-model-study.png')});
 await page.click('#study');
 const before=await page.evaluate(()=>window.__ravelLab.fixture.player.pos.z);
 await page.keyboard.down('KeyW');await sleep(250);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>window.__ravelLab.fixture.player.pos.z);
 if(!(after<before))throw Error('W did not move the actual Rapier body');report.checks.push('Keyboard flight moves the real body');
 await page.click('#hail');await page.click('#hail');
 if(await page.evaluate(()=>window.__ravelLab.fixture.system._phase)!=='windup')throw Error('Dual scan did not start the encounter');
 await page.screenshot({path:path.join(out,'03-telegraph.png')});report.checks.push('Hail and challenge through real DOM controls');
 await page.evaluate(()=>{const lab=window.__ravelLab,f=lab.fixture;f.state.timeScale=1;
  for(let n=0;n<140&&f.system._phase!=='cast';n++)f.step();for(let n=0;n<32;n++)f.step();f.state.timeScale=0;lab.render();});
 await page.screenshot({path:path.join(out,'04-pressure-cast.png')});
 const paused=await page.evaluate(()=>window.__ravelLab.fixture.state.simTime);await sleep(150);
 if(paused!==await page.evaluate(()=>window.__ravelLab.fixture.state.simTime))throw Error('Pause clock drift');report.checks.push('Pause freezes simulation');
 await page.check('#motion');await page.check('#flash');await page.evaluate(()=>window.__ravelLab.render());
 await page.screenshot({path:path.join(out,'05-accessibility.png')});report.checks.push('Reduced motion and flash controls keep cast geometry visible');
 await page.evaluate(()=>{const lab=window.__ravelLab,f=lab.fixture;f.system.deserialize({version:1,met:true,hull:720,freed:7,broken:0,quiet:true});
  f.bus.emit('save:loaded',{});lab.setStudy(true);lab.render();});
 await page.screenshot({path:path.join(out,'06-peace-restored.png')});report.checks.push('Peaceful saved state loads and renders without an active attack');
 await page.click('#reset');await page.waitForFunction(()=>window.__ravelLab.fixture.state.ravel.met===false);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'07-narrow-layout.png')});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal layout overflow');
 report.checks.push('Reset and narrow viewport layout');report.stats=await page.evaluate(()=>window.__ravelLab.stats());
 report.errors=errors;if(errors.length)throw Error(errors.join('\n'));report.passed=true;
}catch(e){report.passed=false;report.error=String(e.stack||e);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();console.log(JSON.stringify(report,null,2));}
