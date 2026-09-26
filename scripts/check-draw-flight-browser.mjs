// Run: xvfb-run -a node scripts/check-draw-flight-browser.mjs (Linux, xdotool installed).
// Actual browser/native mouse events + Rapier; component fixture, not full-game art acceptance.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=resolve(process.argv[2] || '.devshots/draw-flight/browser');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return}
  try{const bytes=await readFile(file);const ext=extname(file);
    res.writeHead(200,{'Content-Type': ['.js','.mjs'].includes(ext)?'text/javascript':ext==='.html'?'text/html':ext==='.wasm'?'application/wasm':ext==='.json'?'application/json':'application/octet-stream'});res.end(bytes)
  }catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:false,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[],results=[];
let currentPage=null,currentCase=null;
try{
 for(const locked of [false,true]){
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  currentPage=page;currentCase=locked?'locked':'unlocked';
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/test/fixtures/draw-flight.html`);
  await page.waitForFunction(()=>window.fixtureReady===true,null,{timeout:30000});
  await page.evaluate(()=>{
    window.drawFlightMouseEvents=[];
    addEventListener('mousemove',e=>drawFlightMouseEvents.push({dx:e.movementX,dy:e.movementY,
      trusted:e.isTrusted,locked:!!document.pointerLockElement}));
  });
  // CDP mouse.move is absolute viewport input, not an OS-relative pointer-lock command.
  // Use native X11 relative motion while locked, and require delivery of trusted DOM events.
  const move=async(x,y,dx,dy)=>{
    if(!locked){await page.mouse.move(x,y);return}
    const before=await page.evaluate(()=>drawFlightMouseEvents.length);
    await exec('xdotool',['mousemove_relative','--',String(dx),String(dy)],{timeout:5000});
    await page.waitForFunction(n=>drawFlightMouseEvents.length>n,before,{timeout:5000});
    const events=await page.evaluate(n=>drawFlightMouseEvents.slice(n),before);
    assert.ok(events.every(e=>e.trusted),'native event provenance');
    assert.ok(Math.abs(events.reduce((n,e)=>n+e.dx,0)-dx)<=1,'actual horizontal device delta');
    assert.ok(Math.abs(events.reduce((n,e)=>n+e.dy,0)-dy)<=1,'actual vertical device delta');
  };
  if(!locked)await page.evaluate(()=>{document.getElementById('gl-canvas').requestPointerLock=()=>Promise.reject(new Error('denied for unlocked-path test'))});
  if(locked){
    await page.bringToFront();
    const before=await page.evaluate(()=>drawFlightMouseEvents.length);
    // Establish the OS cursor position before locking. Mixing a CDP cursor position with
    // the first native event would manufacture a jump from two different coordinate histories.
    await exec('xdotool',['mousemove','580','500'],{timeout:5000});
    await page.waitForFunction(n=>drawFlightMouseEvents.length>n,before,{timeout:5000});
  }else await page.mouse.move(500,400);
  await page.keyboard.press('g');
  await page.evaluate(()=>drawFlightFixture.step(1));
  assert.equal((await page.evaluate(()=>drawFlightFixture.snapshot())).auto,true,'G toggles through production owner');
  if(locked)await page.waitForFunction(()=>document.pointerLockElement===document.getElementById('gl-canvas'));
  // One deliberate native swipe must produce a bounded stick vector, not route geometry.
  await move(560,400,60,0);
  let s=await page.evaluate(()=>drawFlightFixture.step(120));
  assert.ok(s.vector?.active,'real mouse motion activates the dynamic combat stick');
  assert.ok(s.vector.screenX>0.2,'rightward native motion deflects the stick right');
  assert.ok(Math.hypot(s.vector.screenX,s.vector.screenY)<=1.0001,'stick deflection is bounded');
  assert.equal(s.active,false,'desktop G no longer activates persistent path following');
  assert.equal(s.command,null,'desktop G no longer emits drawFlight path commands');
  assert.equal(s.points?.length||0,0,'desktop G never mints route geometry');
  assert.ok(s.speed>5,'the live vector reaches Flight V3 / Rapier and moves the real hull');
  const firstVector={...s.vector};
  const firstPos={...s.pos};

  // Continue the same virtual stick downward. The vector should rotate continuously rather than
  // append a backlog of waypoints; movement remains under the ordinary propulsion kernel.
  for(let i=1;i<=10;i++){
    await move(560,400+i*12,0,12);
    await page.evaluate(()=>drawFlightFixture.step(2));
  }
  s=await page.evaluate(()=>drawFlightFixture.step(90));
  assert.ok(s.vector.active && s.vector.screenY>firstVector.screenY+0.2,
    'additional native deltas rotate the live stick vector');
  assert.ok(Math.hypot(s.pos.x-firstPos.x,s.pos.z-firstPos.z)>10,
    'continuous stick authority keeps the real hull moving');
  assert.equal(s.points?.length||0,0,'turning the stick still authors no path');
  await page.screenshot({path:resolve(out,locked?'locked-turn.png':'unlocked-turn.png')});

  // Camera pan must not reinterpret an already-held screen-space stick as a world-route jump.
  const beforePan={...s.vector};
  await page.evaluate(()=>drawFlightFixture.pan(180,-100));
  s=await page.evaluate(()=>drawFlightFixture.step(2));
  assert.ok(Math.hypot(s.vector.screenX-beforePan.screenX,s.vector.screenY-beforePan.screenY)<1e-6,
    'camera motion does not move the physical virtual-stick knob');

  // Deliberate brake outranks the combat stick without disabling target assist.
  await page.keyboard.down('s');
  s=await page.evaluate(()=>drawFlightFixture.step(240));
  assert.equal(s.command,null);
  assert.equal(s.active,false);
  assert.equal(s.auto,true,'braking does not drop G target assist');
  assert.ok(s.speed<3,'S brake overrides a deflected combat stick');
  await page.keyboard.up('s');

  // Releasing brake resumes the held vector; no fresh drawn stroke is required.
  s=await page.evaluate(()=>drawFlightFixture.step(90));
  assert.ok(s.vector.active && s.speed>5,'held combat-stick authority resumes after brake release');

  // Modal ownership neutralizes the published vector and ignores hidden pointer motion.
  await page.evaluate(()=>drawFlightFixture.block(true));
  s=await page.evaluate(()=>drawFlightFixture.step(1));
  assert.equal(s.vector.active,false);
  await page.mouse.move(500,560);
  s=await page.evaluate(()=>drawFlightFixture.step(1));
  assert.equal(s.vector.active,false,'overlay cannot write hidden flight');

  await page.evaluate(()=>drawFlightFixture.block(false));
  await page.keyboard.press('g');
  s=await page.evaluate(()=>drawFlightFixture.step(1));
  assert.equal(s.auto,false);
  assert.equal(s.vector.active,false);
  assert.equal(s.command,null);
  results.push({locked,nativePointer:locked,mouseEvents:await page.evaluate(()=>drawFlightMouseEvents),proof:s.proof,assertions:'passed'});
  await page.close();currentPage=null;
 }
 assert.deepEqual(errors,[],'no browser runtime exceptions');
 await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors},null,2));
 console.log(JSON.stringify({results,errors},null,2));
}catch(error){
 const failure={case:currentCase,error:error.stack||String(error),errors,results};
 if(currentPage){
  failure.snapshot=await currentPage.evaluate(()=>window.drawFlightFixture?.snapshot()).catch(()=>null);
  failure.mouseEvents=await currentPage.evaluate(()=>window.drawFlightMouseEvents).catch(()=>null);
  await currentPage.screenshot({path:resolve(out,`${currentCase}-failure.png`)}).catch(()=>{});
 }
 await writeFile(resolve(out,'failure.json'),JSON.stringify(failure,null,2));
 throw error;
}finally{await browser.close();server.close()}
