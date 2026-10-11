// Reproducible component-only browser probe. It never opens the game server or player saves.
// node test/racing-ui-probe.mjs; --bundle-only emits a self-contained local inspection page.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.RACING_ARTIFACT_DIR || path.join(os.tmpdir(),'spaceface-racing-ui');
await fs.mkdir(out,{recursive:true});
const entry="import {raceBoardScreen} from './src/ui/screens/raceBoard.js';\nimport {mountRacingHud} from './src/ui/racingHud.js';\nimport {createBus} from './src/core/eventBus.js';\nimport {createUiInput} from './src/ui/input.js';\nimport {racingOfferFor,raceGateGlobals} from './src/data/raceLevels.js';\nimport {rememberRaceRecord,raceRecordKey} from './src/systems/racingSteer.js';\n\nconst bus=createBus(),events=[];let open=true;\nfor(const event of ['game:new','race:reset','race:abort','race:toggleView','settings:changed'])bus.on(event,p=>events.push([event,p]));\nconst player={id:1,alive:true,pos:{x:0,z:0},rot:0,vel:{x:0,z:0}};\nconst state={mode:'menu',simTime:0,settings:{gameplay:{},video:{}},ui:{},input:{actions:{}},entities:new Map([[1,player]]),playerId:1,world:{currentSectorId:'sector_helios_prime'},missions:{active:[]},render:{}};\nconst screenManager={isOpen:()=>open,activeId:()=>open?'raceBoard':null,activeDef:()=>null,getActiveScreenDef:()=>({id:'raceBoard'}),pushScreen:()=>{open=true;document.querySelector('#screens').hidden=false;raceBoardScreen.refresh(ctx);},popScreen:()=>{open=false;document.querySelector('#screens').hidden=true;}};\nconst ctx={state,bus,screenManager,registry:{get:()=>null}};\nraceBoardScreen.mount(document.querySelector('#board'),ctx);\nconst hud=mountRacingHud({root:document.querySelector('#ui-root'),bus,state,screens:screenManager});\nconst keys=createUiInput(ctx,screenManager);\nwindow.probe={ctx,state,bus,player,events,hud,keys,screenManager,board:raceBoardScreen,\n free(){state.mode='flight';state.missions.active=[];screenManager.popScreen();state.simTime++;hud.frame();},\n race(id='contract_textile_qual'){this.free();const offer=racingOfferFor(id);offer.params.gridUntilSimS=state.simTime+3.2;offer.status='active';state.missions.active=[offer];Object.assign(player.pos,raceGateGlobals(offer.params)[0]);state.world.currentSectorId=offer.params.courseSectorId;state.simTime+=.2;hud.frame();},\n tick(dt){state.simTime+=dt;hud.frame();},\n reopen(){screenManager.pushScreen('raceBoard');state.simTime++;hud.frame();},\n record(){const p=racingOfferFor('contract_textile_qual').params;rememberRaceRecord(localStorage,raceRecordKey(p),42.34);},\n result(){bus.emit('mission:completed',{racingContractId:'contract_textile_qual',raceElapsedS:42.34,raceClean:true,raceBand:'razor',raceLapTimesS:[42.34]});},\n dispose(){hud.dispose();keys.dispose();raceBoardScreen.dispose();}\n};window.ready=true;\n";
const bundled=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'racing-fixture.js'},bundle:true,write:false,format:'iife',platform:'browser',logLevel:'warning'});
const css=await fs.readFile(path.join(root,'styles/kit.css'),'utf8');
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#0b1015;color:#ece5d6}#screens{position:relative;padding:28px;box-sizing:border-box}#screens>.race-board{position:relative;display:block;max-height:none}#fixture-note{font:12px monospace;padding:12px 28px;opacity:.7}#typing{position:fixed;bottom:0;left:0}</style>
<div id="fixture-note">COMPONENT PROBE — actual circuit UI; no game scene or campaign data.</div><div id="ui-root"><div id="screens"><div id="board" data-screen="raceBoard"></div></div></div><input id="typing" aria-label="Text-entry shortcut test">
<script>${bundled.outputFiles[0].text.replaceAll('</script','<\/script')}</script>`;
await fs.writeFile(path.join(out,'racing-ui.html'),html);
if(!process.argv.includes('--bundle-only')){
  const {chromium}=await import('playwright');
  const launchOptions={headless:true};
  if(process.env.RACING_BROWSER_CHANNEL)launchOptions.channel=process.env.RACING_BROWSER_CHANNEL;
  if(process.env.RACING_BROWSER_EXECUTABLE)launchOptions.executablePath=process.env.RACING_BROWSER_EXECUTABLE;
  const browser=await chromium.launch(launchOptions);
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.setContent(html);await page.waitForFunction(()=>window.ready===true);
    assert.equal(await page.locator('.race-board-course').count(),3);
    assert.equal(await page.locator('.race-board-launch').count(),8);
    const selectedOptions={};
    for(const name of ['Circuit ship','Circuit drive']){
      const control=page.getByRole('combobox',{name,exact:true});
      assert.ok(await control.isVisible(),`${name} is visible`);
      const values=await control.locator('option').evaluateAll(options=>options.map(option=>option.value));
      assert.equal(values.length,3,`${name} exposes three choices`);
      for(const value of values){
        await control.selectOption(value);
        assert.equal(await control.inputValue(),value,`${name} selects ${value}`);
        await page.evaluate(()=>probe.board.refresh(probe.ctx));
        assert.equal(await control.inputValue(),value,`${name} survives board refresh`);
      }
      selectedOptions[name]=values;
    }
    await page.getByRole('combobox',{name:'Circuit ship',exact:true}).selectOption('starter_wasp');
    await page.getByRole('combobox',{name:'Circuit drive',exact:true}).selectOption('sprint');
    await page.screenshot({path:path.join(out,'board-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    const practiceView=page.getByRole('button',{name:/^Practice: /});
    for(const mode of ['racing','auto','overhead']){
      await practiceView.click();
      assert.equal(await practiceView.innerText(),`Practice: ${mode}`);
    }
    assert.ok(await practiceView.evaluate(button=>{
      const bounds=button.getBoundingClientRect(),container=button.closest('.race-board').getBoundingClientRect();
      return bounds.left>=container.left&&bounds.right<=container.right;
    }),'practice view control fits inside the mobile board');
    await page.getByRole('combobox',{name:'Circuit ship',exact:true}).selectOption('starter_wasp');
    await page.getByRole('combobox',{name:'Circuit drive',exact:true}).selectOption('sprint');
    await page.screenshot({path:path.join(out,'board-mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile horizontal overflow');
    await page.evaluate(()=>probe.free());await page.keyboard.press('Backslash');await page.evaluate(()=>probe.tick(.2));
    assert.equal(await page.evaluate(()=>probe.state.settings.gameplay.steeringView),'racing');
    await page.locator('#typing').focus();await page.keyboard.press('Backslash');
    assert.equal(await page.evaluate(()=>probe.state.settings.gameplay.steeringView),'racing');
    await page.locator('#typing').evaluate(e=>e.blur());
    await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'Backslash',key:'\\',repeat:true,bubbles:true})));
    assert.equal(await page.evaluate(()=>probe.state.settings.gameplay.steeringView),'racing');
    await page.evaluate(()=>probe.race());await page.keyboard.press('Backslash');
    assert.equal(await page.evaluate(()=>probe.state.settings.gameplay.steeringView),'racing');
    assert.ok(await page.locator('#race-tape').isVisible());
    assert.ok(await page.getByRole('button',{name:'Mission view',exact:true}).isDisabled());
    await page.evaluate(()=>probe.tick(4));
    assert.match(await page.locator('.race-tape-stats').innerText(),/wu\/s · GATE/);
    await page.evaluate(()=>{
      const params=probe.state.missions.active[0].params,[start,gate]=params.gates;
      const offset={x:probe.player.pos.x-start.x,z:probe.player.pos.z-start.z};
      const length=Math.hypot(gate.x-start.x,gate.z-start.z);
      const approach={x:(gate.x-start.x)/length,z:(gate.z-start.z)/length};
      params.nextGate=1;
      Object.assign(probe.player.pos,{x:gate.x+offset.x-approach.x*30,z:gate.z+offset.z-approach.z*30});
      Object.assign(probe.player.vel,{x:approach.x*1200,z:approach.z*1200});
      probe.tick(2);
    });
    assert.match(await page.locator('.race-tape-hint').innerText(),/BRAKE FOR TURN/,'shared race advice reaches the flight instrument');
    await page.screenshot({path:path.join(out,'hud-mobile.png')});
    await page.getByRole('button',{name:'Recover',exact:true}).click();
    assert.ok(await page.evaluate(()=>probe.events.some(e=>e[0]==='race:reset')));
    await page.evaluate(()=>{probe.race('contract_junction_draft');probe.state.settings.gameplay.steeringView='auto';probe.tick(.2);});
    assert.match(await page.locator('.race-tape-title').innerText(),/APPROACH/);
    assert.match(await page.locator('.race-tape-goal').innerText(),/WAKE 0.0 \/ 2.0s/);
    assert.ok(await page.getByRole('button',{name:'Recover',exact:true}).isDisabled());
    assert.ok(await page.getByRole('button',{name:/Overhead/}).isEnabled());
    await page.screenshot({path:path.join(out,'approach-mobile.png')});
    await page.evaluate(()=>{const p=probe.state.missions.active[0].params;p.phase='grid';probe.tick(.2);});
    assert.ok(await page.getByRole('button',{name:'Mission view',exact:true}).isDisabled());
    await page.evaluate(()=>{const p=probe.state.missions.active[0].params;p.phase='chase';p.raceStartSimS=probe.state.simTime;p.gridUntilSimS=probe.state.simTime;p.draftTimeS=1.25;probe.tick(.2);});
    assert.match(await page.locator('.race-tape-goal').innerText(),/WAKE 1.3 \/ 2.0s/);
    await page.screenshot({path:path.join(out,'wake-mobile.png')});
    await page.evaluate(()=>{const p=probe.state.missions.active[0].params;p.phase='handoff';p.raceElapsedS=42.34;p.raceClean=true;probe.tick(.2);});
    assert.match(await page.locator('.race-tape-stats').innerText(),/42.34s.*PAYMENT PENDING/);
    assert.ok(await page.getByRole('button',{name:/Overhead/}).isEnabled());
    assert.ok(await page.getByRole('button',{name:'Recover',exact:true}).isDisabled());
    assert.equal(await page.locator('.race-tape-map').isVisible(),false);
    await page.screenshot({path:path.join(out,'handoff-mobile.png')});
    await page.getByRole('button',{name:'Leave run',exact:true}).click();
    assert.ok(await page.evaluate(()=>probe.events.some(e=>e[0]==='race:abort')));
    await page.evaluate(()=>{probe.result();probe.state.missions.active=[];probe.state.world.currentSectorId='sector_helios_prime';probe.reopen();});
    assert.equal(await page.getByRole('region',{name:'Last circuit result'}).count(),1);
    assert.match(await page.locator('.race-board-result').innerText(),/42.34s/);
    assert.ok(await page.getByRole('button',{name:'Retry in this flight',exact:true}).isEnabled());
    await page.evaluate(()=>{
      probe.ctx.registry.get=name=>name==='missions'?{postAndAcceptAuthoredOffer:offer=>{probe.events.push(['retry',offer.params.racingContractId]);probe.state.missions.active=[{...offer,status:'active'}];return {ok:true,missionId:offer.id};}}:name==='world'?{relocatePlayerInSector:()=>true}:null;
    });
    const games=await page.evaluate(()=>probe.events.filter(e=>e[0]==='game:new').length);
    await page.getByRole('button',{name:'Retry in this flight',exact:true}).click();
    assert.ok(await page.evaluate(()=>probe.events.some(e=>e[0]==='retry'&&e[1]==='contract_textile_qual')));
    assert.equal(await page.evaluate(()=>probe.events.filter(e=>e[0]==='game:new').length),games);
    await page.evaluate(()=>{probe.state.missions.active=[];probe.reopen();});
    const before=await page.evaluate(()=>probe.state.settings.gameplay.steeringView);
    await page.keyboard.press('Backslash');
    assert.equal(await page.evaluate(()=>probe.state.settings.gameplay.steeringView),before);
    // Fresh launch must carry the save guard and double-click protection, through the real confirm.
    await page.evaluate(()=>{probe.state.mode='menu';probe.reopen();});
    assert.ok(await page.getByRole('button',{name:'Retry in this flight',exact:true}).isDisabled());
    await page.locator('.race-board-launch').first().click();
    assert.ok(await page.getByRole('dialog').isVisible());
    await page.getByRole('button',{name:'Launch circuit',exact:true}).click();
    await page.waitForFunction(()=>probe.events.some(e=>e[0]==='game:new'&&e[1]?.racingSession===true));
    const launches=await page.evaluate(()=>probe.events.filter(e=>e[0]==='game:new').map(e=>e[1]));
    assert.equal(launches.length,1,'confirmation emits one fresh launch');
    assert.equal(launches[0].racingSession,true);
    assert.equal(launches[0].starter,'starter_wasp');
    assert.equal(launches[0].racingDrive,'sprint');
    await page.evaluate(()=>probe.dispose());assert.equal(await page.locator('#race-tape').count(),0);
    assert.deepEqual(errors,[]);
    const result={scope:'Actual UI modules in an asset-free component fixture, not full-game playability.',browserPlugin:'Browser plugin not available',pageErrors:errors,viewports:['1440x1050','390x844'],selectedOptions,launch:launches[0]};
    await fs.writeFile(path.join(out,'ui-result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  }finally{await browser.close();}
}
console.log('Racing component artifacts: '+out);
