import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { domKeyEvent } from '../src/systems/input.js';
import { SWEEP_WINDOW_ID, SWEEP_WINDOW_LANE as L, sweepWindowGapOpen } from '../src/systems/sweepWindowRuntime.js';

test('native Eris catch-up keeps beam danger and Save receipts honest', async () => {
  const flags=snapshotFeatureMaps(),r=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:113});
  applyFeatureConfigToMaps(r.config.features);
  try {
    const s=r.state,ships=r.getSystem('ships'),world=r.getSystem('world'),physics=r.getSystem('physics'),director=r.getSystem('encounterDirector'),input=r.getSystem('input'),save=r.getSystem('save');
    s.mode='flight';s.ui.screenStack=[];ships.newGame();s.onboarding={active:false,finished:true};
    const owned=s.player.ownedShips[0];owned.defId='ship_wasp';owned.fittings=ships.fittingsFromDefaults('ship_wasp',NEW_GAME_STARTERS.find(row=>row.shipId==='ship_wasp').fittedModules);
    const player=r.spawn(makeShipEntitySpec('ship_wasp',{isPlayer:true,player:s.player,team:0,fittings:owned.fittings,pos:{x:0,z:0}}));s.playerId=player.id;
    world.enterSector('sector_eris_margin');
    // Nearby arrival is scenario setup through the real relocation owner, not flown travel.
    world.relocatePlayerInSector({x:L.start.x+100,z:L.start.z,heading:0},{reason:'eris-native-arrival'});
    assert.equal(await physics.prepareBackend(s),true);
    const credits=s.player.credits,quiet=s.factions?.faction_quiet?.rep??0,effects=[];
    r.bus.on('economy:grantCredits',p=>{if(p.reason===SWEEP_WINDOW_ID)effects.push({kind:'credits',...p});});
    r.bus.on('faction:repDelta',p=>{if(p.reason===SWEEP_WINDOW_ID)effects.push({kind:'rep',...p});});
    const tick=()=>r.step(1/60),keys=new Map();
    const key=(code,pressed)=>{if(keys.get(code)===pressed)return;keys.set(code,pressed);domKeyEvent(input,{code,pressed,blocked:false,repeat:false});};
    const steer=runner=>{
      const p=s.entities.get(s.playerId),dx=runner.pos.x+80-p.pos.x,dz=runner.pos.z-p.pos.z,range=Math.hypot(dx,dz);
      const error=Math.atan2(Math.sin(Math.atan2(dz,dx)-p.rot),Math.cos(Math.atan2(dz,dx)-p.rot)),turn=error*2-(p.angVel||0)*0.5;
      key('KeyW',range>45&&Math.abs(error)<0.6);key('KeyA',turn<-.15);key('KeyD',turn>.15);key('Digit0',range<45&&Math.hypot(p.vel.x,p.vel.z)>12);
    };
    const roundtrip=(name,envelope)=>{
      const body=gzipSync(JSON.stringify(envelope));
      if(process.env.ERIS_EVIDENCE_DIR){mkdirSync(process.env.ERIS_EVIDENCE_DIR,{recursive:true});const file=path.join(process.env.ERIS_EVIDENCE_DIR,name+'.json.gz');writeFileSync(file,body);return JSON.parse(gunzipSync(readFileSync(file)));}
      return JSON.parse(gunzipSync(body));
    };
    let encounterId=null,runner=null,holdAt=null,unfinished=null,deadline=null,reacquired=false,waitingTicks=0,hazardTicks=0,releaseAt=null;
    const initialPlayer={...player.pos};
    for(let i=0;i<125*60;i++){
      const live=encounterId?s.encounterDirector.live[encounterId]:Object.values(s.encounterDirector.live).find(l=>l.shapeId===SWEEP_WINDOW_ID);
      if(live){
        if(!encounterId)console.log('ERIS_STAGE',JSON.stringify({stage:'admitted',t:s.simTime,entities:s.entityList.length}));
        encounterId=live.id;runner??=s.entities.get(live.ids.find(id=>live.roles[id]==='runner'));
        assert.equal(s.entities.get(runner.id),runner,'current scene keeps its original runner');
        if(live.phase==='offer')director._onChoose({encounterId,choiceId:'a'});
        if(live.phase==='sweep_gap'&&sweepWindowGapOpen(s.simTime)){director._onChoose({encounterId,choiceId:'a'});if(live.phase==='sweep_cross')releaseAt=s.simTime;}
        const work=live.vars.sweepWindow;
        if(work?.holdAnchor){
          if(holdAt==null){holdAt=s.simTime;deadline=work.deadline;console.log('ERIS_STAGE',JSON.stringify({stage:'holding',t:s.simTime,runnerId:runner.id}));unfinished=roundtrip('eris-interrupted',save.serialize('eris-held-crossing'));}
          waitingTicks++;if(s.fields?.telemetry?.affected>0)hazardTicks++;
          assert.equal(work.deadline,deadline,'waiting cannot extend the working window');
        } else if(holdAt!=null&&work?.stage==='cross')reacquired=true;
        if(holdAt!=null&&s.simTime-holdAt>=8)steer(runner);
      } else if(encounterId)break;
      if(!encounterId&&s.simTime>24)assert.fail('ordinary Eris admission did not occur within the bounded nearby visit');
      tick();
    }
    for(const [code] of keys)key(code,false);
    assert.ok(encounterId&&runner,'ordinary populated Eris admission must occur');
    assert.ok(holdAt!=null&&waitingTicks>=8*60,'parked pilot causes an actual hold for a full canonical sweep');
    assert.ok(hazardTicks>0,'canonical Metronome field still acts during waiting');assert.equal(reacquired,true);
    assert.ok(Math.hypot(player.pos.x-initialPlayer.x,player.pos.z-initialPlayer.z)>50,'actual input flies the player back alongside');
    const receipts=s.encounterDirector.receipts.filter(row=>row.shape===SWEEP_WINDOW_ID);assert.equal(receipts.length,1);assert.equal(receipts[0].outcome,'a');
    assert.equal(runner.alive,true);assert.ok(Math.hypot(runner.pos.x-L.end.x,runner.pos.z-L.end.z)<=L.arrivalRadius);
    assert.equal(effects.filter(e=>e.kind==='credits').length,1);assert.equal(effects.filter(e=>e.kind==='rep').length,1);
    assert.equal(s.player.credits,credits+30);assert.equal(s.factions.faction_quiet.rep,quiet+2);
    const completed=roundtrip('eris-completed',save.serialize('eris-earned-crossing'));
    assert.equal(save.loadEnvelope(unfinished),true);assert.equal(s.player.credits,credits);
    assert.equal(Object.values(s.encounterDirector.live).some(l=>l.shapeId===SWEEP_WINDOW_ID),false,'unfinished crossing is abandoned under existing Save contract');
    assert.notEqual(s.encounterDirector.stats.livedStarted?.[SWEEP_WINDOW_ID],undefined);
    director._onChoose({encounterId,choiceId:'a'});for(let i=0;i<3;i++)tick();assert.equal(s.player.credits,credits);
    assert.equal(save.loadEnvelope(completed),true);const earned=s.player.credits;
    director._onChoose({encounterId,choiceId:'a'});for(let i=0;i<3;i++)tick();
    assert.equal(s.player.credits,earned);assert.equal(earned,credits+30);assert.equal(s.factions.faction_quiet.rep,quiet+2);
    assert.equal(s.encounterDirector.receipts.filter(row=>row.shape===SWEEP_WINDOW_ID&&row.outcome==='a').length,1);
    console.log('ERIS_NATIVE_SAVE',JSON.stringify({encounterId,runnerId:runner.id,releaseAt,holdAt,waitingTicks,hazardTicks,reacquired,arrivalAt:receipts[0].t,runnerHull:runner.hull,creditsDelta:30,quietDelta:2,unfinishedReward:0,receipts:1,source:'production nodeSafeOnly; configured nearby arrival; actual keyboard flight; same-process full Save disk/JSON roundtrip when evidence directory is supplied'}));
  } finally {r.dispose();restoreFeatureMaps(flags);}
});
