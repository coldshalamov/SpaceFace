// Bounded public-input Adventure route. Reads state only to report results; no service
// calls, teleports, synthetic captures, authored-asset bypasses, or shared player saves.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { bootToMenu, adventureToFlight } from './player-truth/routes.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const {createGameServer}=createRequire(import.meta.url)('./lib/gameServer.cjs');
const mobile=process.argv.includes('--mobile');
const out=`${root}.devshots/black-flag/public-${mobile?'touch':'desktop'}`;
mkdirSync(out,{recursive:true});
process.env.SPACEFACE_PLAYER_STORE_DIR='';
const server=createGameServer({root,playerStoreDir:''});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11','--ignore-gpu-blocklist']});
const report={route:'public main menu → default Adventure → Black Flag opportunity',mobile,steps:[],errors:[],complete:false};
const step=(name,ok,detail)=>{report.steps.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}: ${detail}`);};
let page;
const observe=async phase=>{
  const sample=await page.evaluate(()=>{
    const sf=window.SF,st=sf?.state;if(!st)return null;
    const target=st.entities?.get(st.player?.targetId);
    return {simTime:st.simTime,playerId:st.playerId,targetId:target?.id,targetGeneration:target?.data?.shipjackGeneration,
      targetPos:target?.pos,targetVel:target?.vel,autopilot:st.nav?.autopilot || null,
      targetAi:target?.data?.ai ?? null,targetIntent:target?.data?.intent ?? null,
      jobId:target?.data?.jobId ?? null,worldRecordId:target?.data?.worldRecordId ?? null,
      persistenceOwner:target?.data?.persistenceOwner ?? null,uncrewed:target?.data?.shipjackUncrewed ?? null,
      targetFlags:target?.flags,targetSpin:target?.angularVel?.y ?? target?.angVel ?? null,
      navWaypoint:st.nav?.waypoint || null,navRoute:st.nav?.route || null,
      combatDrive:target ? st.combat?.entities?.[String(target.id)]?.subsystems?.subsystem_drive ?? null : null,
      combatEntityPresent:!!(target&&st.combat?.entities?.[String(target.id)]),
      targetReadout:target?.data?.shipjackReadout || null,tether:st.player?.tether || null,
      lane:typeof sf.simLaneDiag==='function'?sf.simLaneDiag():{lane:'main',workerDiagnosticPresent:false}};
  });
  (report.observations ||= []).push({phase,...sample});
};
try {
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(180000);
  await bootToMenu(page,`http://127.0.0.1:${server.address().port}/`,step);
  await adventureToFlight(page,step,{seed:4242});
  await page.screenshot({path:`${out}/01-flight.png`});
  const button=label=>page.getByRole('button',{name:label}).first();
  const press=async label=>{const control=button(label);await control.waitFor({state:'visible',timeout:60000});if(mobile)await control.tap();else await control.click();};
  await press(/Acquire vessel signal/);
  step('discovery',true,'Selected the physical vessel through the local recovery-channel choice.');
  const approach=async(distance=105,stable=true)=>{
    const control=button(/Approach on autopilot/);
    if(await control.isVisible().catch(()=>false)) {
      await press(/Approach on autopilot/);
      await page.waitForFunction(({distance,stable})=>{const st=window.SF.state,p=st.entities.get(st.playerId),t=st.entities.get(st.player.targetId);return p&&t&&Math.hypot(p.pos.x-t.pos.x,p.pos.z-t.pos.z)<distance&&(!stable||Math.hypot(p.vel.x-t.vel.x,p.vel.z-t.vel.z)<14);},{distance,stable},{timeout:150000});
      step('physical approach',true,'Selected public autopilot approach; flew to close relative motion without moving a body through debug.');
    }
  };
  // Read and negotiate as soon as the real interface permits; do not spend a long
  // unscanned approach while a captain can still agree to a safer recovery.
  if(!await button(/Identify vessel|Read frame & signal/).isEnabled())await approach(1100,false);
  await press(/Identify vessel|Read frame & signal/);
  await page.waitForFunction(()=>{
    const st=window.SF?.state,sj=st?.player?.shipjack;return Object.values(sj?.custodyAttempts || {}).some(row=>row.scanned);
  },null,{timeout:45000});
  step('scan',true,'Frame identified from the live flight decision.');
  await observe('frame identified');
  await page.screenshot({path:`${out}/02-frame-read.png`});
  await press(/Negotiate crew passage|Hail captain/);
  await page.waitForFunction(()=>Object.values(window.SF?.state?.player?.shipjack?.custodyAttempts || {}).some(row=>row.surrendered),null,{timeout:45000});
  step('parley',true,'Crew accepted safe passage through the same touch/keyboard-accessible flight surface.');
  await observe('crew passage');
  await page.screenshot({path:`${out}/03-safe-passage.png`});
  {
    await approach();
    const intended=await page.evaluate(()=>({targetId:window.SF.state.player.targetId,generation:window.SF.state.entities.get(window.SF.state.player.targetId)?.occupantGeneration,previewTargetId:window.SF.state.masslineAcquisition?.selected?.targetId}));
    if(intended.previewTargetId!==intended.targetId)throw new Error(`Massline preview selects ${intended.previewTargetId ?? 'nothing'}, not the prize ${intended.targetId}; align through ordinary flight controls before latching.`);
    if(mobile)await page.getByRole('button',{name:/Tether: tap to latch or cut/}).tap();
    else await page.keyboard.press('Space');
    await page.waitForFunction(({targetId,generation})=>{const s=window.SF.state,l=s.player.tether,a=s.combat?.attachments?.byId?.[l.attachmentId];return l.active&&l.targetId===targetId&&a?.state==='active'&&a.ownerId===s.playerId&&a.targetId===targetId&&a.targetGeneration===generation;},intended,{timeout:10000});
    report.masslineAttachment=await page.evaluate(()=>({...window.SF.state.combat.attachments.byId[window.SF.state.player.tether.attachmentId]}));
    step('physical restraint',true,'Authoritative Massline attachment names the prize and its exact occupant generation.');
    const before=await page.evaluate(()=>({id:window.SF.state.playerId,at:window.SF.state.simTime}));
    await page.waitForFunction(at=>window.SF.state.simTime>at+1.6,before.at,{timeout:30000});
    await press(/Reach service port/);
    const at=await page.evaluate(()=>window.SF.state.simTime);
    await page.waitForFunction(at=>window.SF.state.simTime>at+1.4,at,{timeout:30000});
    await press(/Claim helm/);
    await press(/Assume control/);
    await page.waitForFunction(id=>window.SF.state.playerId!==id,before.id,{timeout:30000});
    step('physical handoff',true,'Massline input, service-port claim and vulnerable airlock crossing changed the controlled body through actual public controls.');
    await page.screenshot({path:`${out}/04-new-helm.png`});
  }
  report.observed=await page.evaluate(()=>{
    const st=window.SF.state,sj=st.player.shipjack;
    return {mode:st.mode,playerId:st.playerId,targetId:st.player.targetId,sectorId:st.world.currentSectorId,
      vessels:Object.values(sj.vesselsById).map(row=>({name:row.name,title:row.title,custodian:row.custodian,condition:row.condition,location:row.location,crewSafe:row.crewSafe})),attempts:sj.custodyAttempts};
  });
  report.complete=true;
} catch(error) {
  report.failure=error.message;step('route incomplete',false,error.message);
  if(page)await observe('route stopped').catch(()=>{});
  if(page) {report.visible=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});}
  process.exitCode=1;
} finally {
  writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
