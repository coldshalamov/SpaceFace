import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmQuota, swarmConcurrent } from '../src/data/swarmMode.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { swarmFoundryRound } from '../src/data/swarmFoundryScore.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import { foundryWardenIntermission } from '../src/ui/screens/crucibleDraft.js';
import { planSwarmOpeningCyst } from '../src/systems/swarmOpeningCyst.js';
const DT = 1/60;
const planFor = (extra = {}) => planWave({ seed: 4242, wave: 9, arenaId: 'helios_core', ruleset: 'swarm', ...extra });
function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [spawnBudget, swarmArena, survivalWave] });
  t.after(() => sim.dispose());
  const { state, bus } = sim; state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', alive: true, team: 0, pos: { x:0,z:0 }, vel:{x:0,z:0},
    radius:8, mass:40, hull:100, hullMax:100, collides:true, data:{} });
  state.playerId = player.id; resolvePhysicsBodySpec(player);
  const start = () => {
    state.run = { ...createRunState({kind:'survival',ruleset:'swarm',seed:4242}), arenaId:'helios_core',wave:9,phase:'wave_intro' };
    bus.emit('run:wavePlanned',{wave:9,plan:planFor()}); state.run.phase='active';bus.emit('run:waveStarted',{wave:9});
  }; start();
  return { sim, state, bus, player, start, owner:sim.registry.get('survivalWave'),
    engine:sim.registry.get('swarmArena')._brood,
    ships:()=>state.entityList.filter(e=>e.alive&&e.type==='ship'&&e.id!==player.id),
    tick(n=1){for(let i=0;i<n;i++)sim.step(DT);} };
}

test('one existing opening seat becomes the learned ward, without changing quota or rewards',()=>{
  for(const seed of [1,42,91,4242]) {
    const p=planFor({seed});const score=swarmFoundryRound({arenaId:'helios_core',wave:9});
    assert.equal(score.id,'break_the_guard');assert.equal(p.swarm.killTarget,swarmQuota(9));
    assert.equal(p.swarm.concurrent,swarmConcurrent(9));assert.equal(p.arenaPhase,'loose_plate');
    assert.equal(p.schedule.reduce((n,x)=>n+x.count,0),12);
    const pair=p.schedule.filter(x=>x.readAfterTicks===1);
    assert.equal(pair.length,2);assert.deepEqual(pair.map(x=>x.enemyId).sort(),['lancer_sniper','warden_escort']);
    assert.equal(pair[0].gateGroup,pair[1].gateGroup);assert.ok(pair.every(x=>x.atTick===0&&x.count===1));
    assert.ok(p.schedule.filter(x=>x.readAfterTicks!==1).every(x=>x.readAfterTicks===840));
    const preview=swarmRoundPreview({arenaId:'helios_core',wave:9,seed,plan:p});
    assert.equal(preview.event,null);assert.equal(preview.foreground.title,'Break the guard');
  }
});
for(const idle of [600,4000])test(`guard pair then Cyst then crowd preserve finite debt after ${idle} idle ticks`,t=>{
  const h=fixture(t);h.tick(idle);assert.equal(h.ships().length,0);assert.equal(h.engine.view.aliveCount,0);
  assert.equal(h.engine.view.pendingCount,220);noteSwarmPilotAction(h.state);h.tick();
  assert.equal(h.ships().length,2);const warden=h.ships().find(e=>e.data.lootTableId==='warden_escort');
  assert.equal(warden.data.ai.combatDoctrineId,'escort_screen');
  h.tick(478);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.ships().length,2);
  h.tick();assert.equal(h.owner._foundryTicks,480);assert.equal(h.engine.view.aliveCount,4);assert.equal(h.engine.view.pendingCount,216);
  const v=h.engine._bodies;const live=Array.from({length:v.alive.length},(_,i)=>i).filter(i=>v.alive[i]);
  assert.equal(live.filter(i=>v.liveFamilyId[v.family[i]]==='lantern_cyst').length,1);
  assert.equal(live.filter(i=>v.liveFamilyId[v.family[i]]==='mite').length,3);
  h.tick(359);assert.equal(h.owner._foundryTicks,839);assert.equal(h.ships().length,2);assert.equal(warden.data.ai.swarmLastStand,undefined);
  h.tick();assert.ok(h.ships().length>2);
  h.tick(120);assert.ok(h.engine.view.pendingCount<216);
  assert.equal(h.state.run.credits,0);assert.equal(h.state.run.score,0);
});

test('pause, duplicate calls and retry do not consume either debut read',t=>{
  const h=fixture(t);noteSwarmPilotAction(h.state);h.tick(300);const clock=h.owner._foundryTicks;
  h.state.mode='pause';h.tick(300);assert.equal(h.owner._foundryTicks,clock);assert.equal(h.engine.view.aliveCount,0);
  h.state.mode='flight';h.tick();for(let i=0;i<100;i++){h.owner.update();h.engine.step(h.state);}
  assert.equal(h.owner._foundryTicks,clock+1);assert.equal(h.engine.view.aliveCount,0);
  h.bus.emit('run:ended',{reason:'retry'});h.start();h.tick(600);
  assert.equal(h.owner._foundryTicks,0);assert.equal(h.engine.view.pendingCount,220);assert.equal(h.engine.view.aliveCount,0);
});

test('blocked Cyst geometry keeps every life owed and falls back to normal arrivals',t=>{
  const h=fixture(t);
  h.sim.spawn({type:'station',alive:true,collides:true,pos:{x:0,z:0},vel:{x:0,z:0},radius:500,mass:100000,data:{}});
  noteSwarmPilotAction(h.state);h.tick(525);assert.equal(h.engine.view.aliveCount,0);assert.equal(h.engine.view.pendingCount,220);
  h.tick(600);assert.equal(h.engine.view.aliveCount+h.engine.view.pendingCount,220);
});

test('Cyst placement is non-mutating, has real escape, and never spends missing debt',t=>{
  const h=fixture(t);const debt=[{id:'lantern_cyst',count:1},{id:'mite',count:3}];
  const before=JSON.stringify(debt),poses=h.state.entityList.map(e=>[e.id,{...e.pos}]);
  const scene=planSwarmOpeningCyst(h.state,h.state.run,9,debt,4.4,3.8);assert.ok(scene);
  assert.equal(Math.hypot(scene.cyst.x-h.player.pos.x,scene.cyst.z-h.player.pos.z),110);
  assert.equal(JSON.stringify(debt),before);assert.deepEqual(h.state.entityList.map(e=>[e.id,{...e.pos}]),poses);
  for(const plan of [[],[{id:'mite',count:3}],[{id:'lantern_cyst',count:1},{id:'mite',count:2}]])
    assert.equal(planSwarmOpeningCyst(h.state,h.state.run,9,plan,4.4,3.8),null);
  for(const patch of [{arenaId:'the_hive'},{arenaMutators:['dense']},{telemetry:{circuit:{}}}])
    assert.equal(planSwarmOpeningCyst(h.state,{...h.state.run,...patch},9,debt,4.4,3.8),null);
});

test('normal Armory previews the real pair and finite follow-up without selling new stock',()=>{
  const run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),arenaId:'helios_core',wave:8,phase:'draft'};
  const before=JSON.stringify(run);assert.match(foundryWardenIntermission(run),/A Warden guards the next Lancer/);
  assert.match(foundryWardenIntermission(run),/save your purse/);assert.equal(JSON.stringify(run),before);
  for(const patch of [{wave:7},{wave:9},{phase:'active'},{arenaId:'the_hive'},
    {arenaMutators:['dense']},{telemetry:{circuit:{}}},{telemetry:{startWave:9}}])
    assert.equal(foundryWardenIntermission({...run,...patch}),null);
  for(const extra of [{arenaId:'the_hive'},{mutators:['heavies_only']},{circuitRound:{kind:'survive'}},{wave:10}])
    assert.equal(planFor(extra).swarm.foundry,undefined);
});

test('native pilot fire breaks the actual Warden link; Cyst attack and ordinary gun response stay real',async t=>{
  const {bootRealPath}=await import('../scripts/lib/bench/realPath.mjs');
  const {input}=await import('../src/systems/input.js');
  const {runSession}=await import('../src/systems/runSession.js');
  const {combat}=await import('../src/systems/combat.js');
  const {COMBAT_LAB_STARTER_PACKAGES}=await import('../src/data/combatLabSetups.js');
  const kit=COMBAT_LAB_STARTER_PACKAGES.find(k=>k.id==='ricochet_runner');
  const fittings=Array(13).fill(null);for(const row of kit.loadout)fittings[row.slotIndex]=row.defId;
  async function play(shoot){
    const h=await bootRealPath({seed:4242,systems:[input,runSession,spawnBudget,survivalWave,swarmArena,combat,
      'tacticalAI','actions','weapons','flightV3','aiPorts','physics'],
      hulls:[{hullId:kit.hullId,fittings,isPlayer:true,pos:{x:0,z:0}}]});
    try{
      const s=h.state,p=h.player;
      // Earlier clears and this initial ship pose are fixtures. All enemies arrive
      // through the live plan; only normal projected aim, primary fire and brake
      // input follow. No damage, actor movement, stock or reward is injected.
      s.run={...createRunState({kind:'survival',ruleset:'swarm',seed:4242}),arenaId:'helios_core',wave:9,phase:'wave_intro'};
      s.input.autoFire=false;h.bus.emit('run:wavePlanned',{wave:9,plan:planFor()});
      s.run.phase='active';h.bus.emit('run:waveStarted',{wave:9});
      const engine=h.runtime.getSystem('swarmArena')._brood, inp=h.runtime.getSystem('input');
      const hits=[],bursts=[],tells=[],links=[],inputLog=[],kills=[],projectiles=[];
      let firstHitLink=null;
      const guard=()=>s.entityList.find(e=>e.data?.lootTableId==='warden_escort');
      h.bus.on('combat:damage',e=>{
        hits.push({tick:s.tick,...e});
        if(shoot&&!firstHitLink&&e.attackerId===p.id&&e.targetId===guard()?.id)
          firstHitLink={...guard().data.swarmSpecialist};
      });
      h.bus.on('swarm:broodProjectileHit',e=>projectiles.push({tick:s.tick,...e}));
      h.bus.on('swarm:broodKills',e=>kills.push({tick:s.tick,...e}));
      h.bus.on('swarm:broodTelegraph',e=>tells.push({tick:s.tick,...e}));
      h.bus.on('swarm:broodBurst',e=>bursts.push({tick:s.tick,...e,pilot:{...p.pos}}));
      const event=d=>{inputLog.push({tick:s.tick,...d});inp.ingestLaneDomEvent(d);};
      const key=(code,pressed)=>event({type:pressed?'keydown':'keyup',code,pressed,blocked:false});
      key('Digit0',true);h.step(1);key('Digit0',false);
      for(let i=0;i<838;i++){
        // Turn the actual fixed-gun hull toward the next clear entrance before
        // firing. Merely projecting a cursor behind a nose-limited gun is not a hit.
        if(shoot&&s.tick===250)key('KeyA',true);
        if(shoot&&s.tick===350)key('KeyA',false);
        const w=guard();
        if(shoot&&w&&s.tick>=50&&s.tick<200){
          event({type:'cursorProjection',x:w.pos.x,z:w.pos.z});event({type:'mousedown',button:0,clientX:600,clientY:400,blocked:false,offCanvas:false});
        }
        if(shoot&&s.tick===200)event({type:'mouseup',button:0});
        const b=engine._bodies;
        const cyst=Array.from(b.alive).findIndex((a,i)=>a&&b.liveFamilyId[b.family[i]]==='lantern_cyst');
        if(shoot&&s.tick>=480&&cyst>=0){
          event({type:'cursorProjection',x:b.px[cyst]+b.vx[cyst]*0.18,z:b.pz[cyst]+b.vz[cyst]*0.18});event({type:'mousedown',button:0,clientX:600,clientY:400,blocked:false,offCanvas:false});
        }
        if(shoot&&s.tick>=480&&cyst<0)event({type:'mouseup',button:0});
        h.step(1);
        if([36,37,74,75,102].includes(s.tick))links.push({tick:s.tick,...guard()?.data.swarmSpecialist});
      }
      const ward=s.entityList.find(e=>e.data?.lootTableId==='lancer_sniper');
      assert.ok(guard()?.alive&&ward?.alive);assert.equal(s.run.spawnedThreat,2);assert.equal(s.run.resolvedThreat,0);
      assert.equal(engine.view.pendingCount,216);assert.ok(p.alive && p.hull>0, 'the native pilot must survive both readings');
      assert.equal(h.proof().backend,'rapier-dynamic');assert.equal(h.proof().flightBackend,'v3');
      assert.ok(links.some(x=>x.tick===36&&x.phase==='windup'));
      assert.ok(links.some(x=>x.tick===37&&x.phase==='active'&&x.targetId===ward.id&&x.linkEnergy===92));
      return {hits,bursts,tells,links,firstHitLink,inputLog,kills,projectiles,credits:s.run.credits,score:s.run.score,
        alive:engine.view.aliveCount,guardId:guard().id,hull:p.hull,shield:p.shield};
    }finally{h.dispose();}
  }
  const idle=await play(false),fire=await play(true);
  assert.equal(idle.links.find(x=>x.tick===75).phase,'active');
  const hit=fire.hits.find(e=>e.attackerId===1&&e.targetId===fire.guardId);
  assert.ok(hit&&hit.tick>=50&&hit.tick<200);assert.equal(hit.weaponId,'wpn_bank_stream_m');
  assert.equal(fire.firstHitLink.phase,'recovery');assert.equal(fire.firstHitLink.targetId,null);
  assert.equal(fire.firstHitLink.linkEnergy,0);
  const tell=idle.tells.find(e=>e.familyId==='lantern_cyst'), natural=idle.bursts.find(e=>e.familyId==='lantern_cyst');
  assert.ok(tell&&natural);assert.ok(natural.tick-tell.tick>=66);
  assert.ok(Math.hypot(natural.pos.x-natural.pilot.x,natural.pos.z-natural.pilot.z)<90);
  const shot=fire.bursts.find(e=>e.familyId==='lantern_cyst');assert.ok(shot);
  assert.ok(Math.hypot(shot.pos.x-shot.pilot.x,shot.pos.z-shot.pilot.z)>90);
  const naturalReceipt=idle.kills.find(e=>e.tick===natural.tick&&e.cause==='explosive');
  assert.ok(naturalReceipt);assert.equal(naturalReceipt.count,0);
  assert.equal(naturalReceipt.environmentalCount,1);assert.equal(naturalReceipt.credits,0);assert.equal(naturalReceipt.score,0);
  // The stationary pilot has acted and can still earn real collision kills;
  // those are distinct from the untouched Cyst's own automatic fuse.
  assert.equal(idle.credits,idle.kills.reduce((n,k)=>n+k.credits,0));
  assert.equal(idle.score,idle.kills.reduce((n,k)=>n+k.score,0));
  const cystHit=fire.projectiles.find(e=>e.tick===shot.tick&&e.killed&&e.ownerId===1);
  assert.ok(cystHit,'a real native projectile, not the Cyst timeout, kills the Cyst');
  const cystPay=fire.kills.find(e=>e.tick===shot.tick&&e.cause==='direct');
  assert.ok(cystPay);assert.equal(cystPay.credits,3);assert.equal(cystPay.score,34);
  assert.equal(fire.credits,3);assert.equal(fire.score,34);assert.equal(fire.alive,3);
  assert.ok(fire.inputLog.some(e=>e.type==='mousedown'&&e.button===0));
  t.diagnostic(JSON.stringify({guardHit:hit.tick,prime:tell.tick,naturalBurst:natural.tick,
    shotBurst:shot.tick,shotDistance:Math.hypot(shot.pos.x-shot.pilot.x,shot.pos.z-shot.pilot.z),
    credits:fire.credits,score:fire.score,hull:fire.hull,shield:fire.shield}));
});

for(const method of ['_commitLastThree','_commitStragglers','_commitLastStand'])test(`${method} preserves the read but resumes ordinary cleanup afterward`,t=>{
  const h=fixture(t);noteSwarmPilotAction(h.state);h.tick();
  const ships=h.ships();for(const e of ships){e.pos.x=5000;e.pos.z=5000;}
  for(const member of h.owner._cohort.values())member.strayTicks=10000;
  h.state.simTime=2000;h.owner._cursor=100000;h.owner._foundryTicks=839;h.owner[method]();
  assert.ok(ships.every(e=>e.data.ai.swarmLastStand!==true));
  h.owner._foundryTicks=840;h.owner[method]();assert.ok(ships.every(e=>e.data.ai.swarmLastStand===true));
});

test('restarting after the four-life Cyst scene retires every old life and restores the full debt',t=>{
  const h=fixture(t);noteSwarmPilotAction(h.state);h.tick(525);
  assert.equal(h.engine.view.aliveCount,4);h.bus.emit('run:ended',{reason:'retry'});h.start();h.tick(600);
  assert.equal(h.engine.view.aliveCount,0);assert.equal(h.engine.view.pendingCount,220);
  noteSwarmPilotAction(h.state);h.tick(525);assert.equal(h.engine.view.aliveCount,4);assert.equal(h.engine.view.pendingCount,216);
});
