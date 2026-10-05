/** Browser proof on a WebGL-capable runner. Uses the real workshop, no DOM-only mock. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(root,'artifacts/ruckus/browser');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{
 let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const file=resolve(root,'.'+p);
 if(!file.startsWith(root)){res.writeHead(403).end();return;}const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(data);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/tools/ruckus/`;
let browser;const errors=[],report={};
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.ruckusLab&&document.querySelector('#boot').hidden);
 await page.click('#hail');await page.waitForTimeout(200);await page.click('#view');await page.screenshot({path:resolve(out,'inspect.png')});
 await page.click('#view');await page.click('#throw');await page.waitForTimeout(1100);await page.screenshot({path:resolve(out,'chase.png')});
 report.game=await page.evaluate(()=>{const f=ruckusLab.fixture;
  for(let i=0;i<2300&&f.state.ruckus.returns<1;i++)f.step();
  for(let n=2;n<=3;n++){f.throwCore({x:n===2?-1:1,z:.25});for(let i=0;i<2300&&f.state.ruckus.returns<n;i++)f.step();}
  f.hold();f.run(4);f.state.timeScale=0;ruckusLab.present();return ruckusLab.snapshot();});
 assert.equal(report.game.memory.returns,3,'three real-physics returns');
 await page.waitForTimeout(100);await page.screenshot({path:resolve(out,'gift.png')});
 report.hold=await page.evaluate(()=>{const f=ruckusLab.fixture,r=f.system._countdown;f.state.timeScale=1;f.run(2);f.state.timeScale=0;return {before:r,after:f.system._countdown,pulses:f.state.ruckus.pulses};});
 assert.equal(report.hold.before,report.hold.after);assert.equal(report.hold.pulses,0);
 report.release=await page.evaluate(()=>{const f=ruckusLab.fixture;f.state.timeScale=1;f.release({x:1,z:0},0);f.run(4);f.state.timeScale=0;ruckusLab.present();return ruckusLab.snapshot();});
 assert.equal(report.release.memory.pulses,1);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:resolve(out,'mobile.png')});
 report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(report.mobileOverflow,false);
 report.mobileLayout=await page.evaluate(()=>{
  const lab=ruckusLab,b=lab.maps.get(lab.fixture.body().id),p=b.position.clone().project(lab.camera);
  const header=document.querySelector('header').getBoundingClientRect(),tag=document.querySelector('.tag').getBoundingClientRect();
  return {bodyScreenX:(p.x+1)*innerWidth/2,bodyScreenY:(1-p.y)*innerHeight/2,headerBottom:header.bottom,tagTop:tag.top};
 });
 assert.ok(report.mobileLayout.bodyScreenX>25&&report.mobileLayout.bodyScreenX<365,'retriever is framed on mobile');
 assert.ok(report.mobileLayout.bodyScreenY>180&&report.mobileLayout.bodyScreenY<590,'retriever is clear of mobile HUD');
 assert.ok(report.mobileLayout.headerBottom<report.mobileLayout.tagTop,'mobile identity and status do not overlap');
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{ruckusLab.a11y.reducedMotion=true;ruckusLab.a11y.reducedFlash=true;ruckusLab.present();});
 report.errors=errors;assert.deepEqual(errors,[]);await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({message:error.message,errors},null,2));throw error;}
finally{await browser?.close();await new Promise(r=>server.close(r));}
