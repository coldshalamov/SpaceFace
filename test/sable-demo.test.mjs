import test from 'node:test';
import assert from 'node:assert/strict';
import { measureSableDemo } from '../src/core/sableDemo.js';
import { createGameState } from '../src/core/gameState.js';
import { buildSlotList, getDerivedStats } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { sablePreviewStamp, sablePreviewMatches } from '../src/ui/orrery/sableDemo.js';
import { startBenchServer } from '../scripts/lib/benchServer.mjs';
import { loadPlaywright } from '../scripts/lib/load-playwright.mjs';

const hull=SHIPS.find(s=>s.id==='ship_kestrel'),slots=buildSlotList(hull);
let previous;test.before(()=>{previous=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});test.after(()=>restoreFeatureMaps(previous));
function inputs(type,moduleId){const beforeFittings=new Array(slots.length).fill(null),afterFittings=beforeFittings.slice();afterFittings[slots.findIndex(s=>s.type===type)]=moduleId;
  return {defId:hull.id,beforeFittings,afterFittings,moduleId};}

test('native drive comparison measures the actual installed mass, peak speed and deliberate braking',async()=>{
  const args=inputs('engine','mod_engine_fusion_m'),packet=await measureSableDemo(args);
  assert.equal(packet.ok,true);assert.equal(packet.family,'drive');
  const [before,after]=packet.runs;assert.ok(before.peakSpeed>0);assert.ok(after.peakSpeed>before.peakSpeed);
  assert.equal(after.mass,getDerivedStats(hull.id,args.afterFittings).mass);
  assert.ok(after.stoppedSpeed<after.peakSpeed);assert.equal(after.samples.length,41);
  console.log('SABLE_NATIVE_DRIVE',JSON.stringify({before:{mass:before.mass,peak:before.peakSpeed,stop:before.stoppedSpeed},after:{mass:after.mass,peak:after.peakSpeed,stop:after.stoppedSpeed}}));
});
test('shield trial routes identical strikes through combat and reads the real fitted capacity',async()=>{
  const args=inputs('shield','mod_shield_booster_s'),packet=await measureSableDemo(args);
  assert.equal(packet.ok,true);assert.equal(packet.family,'shield');const [before,after]=packet.runs;
  assert.equal(after.shieldMax,getDerivedStats(hull.id,args.afterFittings).shieldMax);assert.ok(after.shieldMax>before.shieldMax);
  assert.equal(after.impacts.length,3);assert.ok(after.impacts.some(hit=>hit.shieldAbsorbed>0));
  assert.ok(after.samples.at(-1).hull>=before.samples.at(-1).hull);
});
test('ten cancelled or completed previews do not mutate campaign fits, resources or RNG',async()=>{
  const state=createGameState(313),owned={defId:hull.id,fittings:new Array(slots.length).fill(null)};state.player.ownedShips=[owned];
  const wire=JSON.stringify({player:state.player,rng:state.rng.getState(),tick:state.tick,simTime:state.simTime});
  for(let i=0;i<10;i++){
    const abort=new AbortController(),args=inputs(i%2?'shield':'engine',i%2?'mod_shield_booster_s':'mod_engine_ion_m');
    if(i%2===0)abort.abort();
    try{const result=await measureSableDemo({...args,player:state.player,signal:abort.signal});assert.equal(result.ok,true);}catch(error){assert.equal(error.name,'AbortError');}
  }
  assert.equal(JSON.stringify({player:state.player,rng:state.rng.getState(),tick:state.tick,simTime:state.simTime}),wire);
});
test('async result signatures reject changed hull, fit, cargo-derived mass, selection and session',()=>{
  const state=createGameState(1),owned={defId:hull.id,fittings:new Array(slots.length).fill(null)},stamp=sablePreviewStamp(state,owned,'mod_engine_ion_m',1);
  assert.equal(sablePreviewMatches(stamp,state,owned,'mod_engine_ion_m',1),true);
  assert.equal(sablePreviewMatches(stamp,state,{...owned},'mod_engine_ion_m',1),false);
  assert.equal(sablePreviewMatches(stamp,state,owned,'mod_engine_fusion_m',1),false);
  owned.fittings[0]='wpn_blaster_s';assert.equal(sablePreviewMatches(stamp,state,owned,'mod_engine_ion_m',1),false);owned.fittings[0]=null;
  state.player.cargo.usedMass=40;assert.equal(sablePreviewMatches(stamp,state,owned,'mod_engine_ion_m',1),false);state.player.cargo.usedMass=0;
  state.player={...state.player};assert.equal(sablePreviewMatches(stamp,state,owned,'mod_engine_ion_m',1),false);
});
test('unsupported families never receive an invented physical trajectory',async()=>{
  const result=await measureSableDemo(inputs('cargo','mod_cargo_expander_s'));assert.equal(result.ok,false);assert.equal(result.reason,'no-physical-demo');
});
test('Sable chooser controls run, pause, retain and close the local trial without campaign writes', {timeout:120000}, async()=>{
  const server=await startBenchServer(),playwright=await loadPlaywright();let browser;
  try{
    browser=await playwright.chromium.launch({headless:true,args:['--disable-gpu','--mute-audio']});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(server.baseUrl+'tools/ui-bench.html?screen=station-shipworks&chrome=0',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__BENCH_READY===true,null,{timeout:90000});
    const slot=await page.evaluate(async()=>{
      const state=window.BENCH.state;state.world.currentSectorId='sector_ceres_belt';state.ui.docked=true;state.ui.dockedStationId='station_ceres';
      const station={id:90001,type:'station',alive:true,pos:{x:0,z:0},radius:50,data:{stationId:'station_ceres'}};
      const actor={id:90002,type:'ship',alive:true,pos:{x:145,z:70},data:{worldRecordId:'ceres:sable-venn:patchwork',sectorId:'sector_ceres_belt'}};
      state.entities.set(station.id,station);state.entities.set(actor.id,actor);state.entityList.push(station,actor);
      state.spawnBudget={entityOwners:new Map([[String(actor.id),actor.data.worldRecordId]]),entityRefs:new Map([[String(actor.id),actor]])};
      const {buildSlotList}=await import('/src/systems/ships.js'),{SHIPS}=await import('/src/data/ships.js');
      window.__SABLE_BEFORE=JSON.stringify({player:state.player,rng:state.rng.getState()});
      return buildSlotList(SHIPS.find(s=>s.id===state.player.ownedShips[0].defId)).findIndex(s=>s.type==='engine');
    });
    await page.locator(`[data-spatial-slot="${slot}"]:visible, .orr-sw-node[data-slot="${slot}"]:visible`).first().click();
    const demonstrate=page.locator('[data-sable-demo="mod_engine_ion_m"]').first();await demonstrate.click();
    const trial=page.locator('[data-sable-preview]');await trial.locator('[role="status"]').filter({hasText:'WU/s'}).waitFor({timeout:20000});
    await trial.getByRole('button',{name:'Replay',exact:true}).press('Enter');
    await trial.getByRole('button',{name:'Pause',exact:true}).press('Space');assert.equal(await trial.getByRole('button',{name:'Play',exact:true}).count(),1);
    await trial.getByRole('button',{name:'Keep current',exact:true}).press('Enter');assert.equal(await trial.count(),0);
    const retained=await demonstrate.evaluate(button=>{const ancestors=[];for(let node=button;node;node=node.parentElement){const s=getComputedStyle(node),r=node.getBoundingClientRect();ancestors.push({node:node.tagName,classes:node.className,hidden:node.hidden,display:s.display,visibility:s.visibility,width:r.width,height:r.height});}return ancestors;});
    assert.equal(await demonstrate.isVisible(),true,JSON.stringify(retained));
    await demonstrate.click();await page.locator('[data-sable-preview]').getByRole('button',{name:'Return to fit',exact:true}).press('Enter');assert.equal(await trial.count(),0);
    await demonstrate.click();await page.locator('[data-sable-preview]').press('Escape');assert.equal(await trial.count(),0);
    await demonstrate.click();await page.evaluate(()=>{const owned=window.BENCH.state.player.ownedShips[0];owned.fittings=[...(owned.fittings||[])];owned.fittings[0]='wpn_blaster_m';});
    await trial.waitFor({state:'detached',timeout:20000});
    // No display result may survive the changed fitting. Restore this functional fixture.
    await page.evaluate(()=>{const snapshot=JSON.parse(window.__SABLE_BEFORE);window.BENCH.state.player.ownedShips[0].fittings=snapshot.player.ownedShips[0].fittings;});
    for(let i=0;i<10;i++){await demonstrate.click();await page.locator('[data-sable-preview]').getByRole('button',{name:'Keep current',exact:true}).click();}
    await page.waitForTimeout(200);
    const result=await page.evaluate(()=>({equal:window.__SABLE_BEFORE===JSON.stringify({player:window.BENCH.state.player,rng:window.BENCH.state.rng.getState()}),retained:document.querySelectorAll('[data-sable-preview]').length}));
    assert.equal(result.equal,true);assert.equal(result.retained,0);
  }finally{await browser?.close();await server.close();}
});
