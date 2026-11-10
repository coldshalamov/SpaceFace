import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_GAME_STARTERS } from '../src/data/newGameDefaults.js';
import { RACING_DRIVES, racingLoadoutFor, applyRacingLoadout } from '../src/data/racingLoadouts.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { racingLoadoutCategory, raceRecordKey, readRaceTape } from '../src/systems/racingSteer.js';
import { readRacingCoach } from '../src/ui/racingCoach.js';

const player = () => ({ id:1, alive:true, pos:{x:0,z:0}, vel:{x:500,z:0}, rot:0, radius:16, mass:50, data:{} });
const stateFor = p => ({ playerId:1, entities:new Map([[1,p]]), player:{activeShipIndex:0,
  ownedShips:[{defId:'ship_kestrel',fittings:['mod_engine_ion_m',null]}]}, settings:{gameplay:{}}, input:{} });

test('every borrowed hull/drive fits through the production ship owner',()=>{
  for(const starter of NEW_GAME_STARTERS)for(const drive of RACING_DRIVES){
    const fit=racingLoadoutFor(starter.id,drive.id);
    const fittings=fittingsFromDefaultModules(starter.shipId,fit.modules);
    assert.ok(fittings.includes(drive.moduleId),`${starter.name}: ${drive.name}`);
    assert.equal(fittings.filter(Boolean).length,fit.modules.length);
    assert.ok(getDerivedStats(starter.shipId,fittings).propulsion.combatSpeed>0);
  }
});

test('borrowing a circuit fit is fenced from campaign launches',()=>{
  const p=player(),state=stateFor(p),ships={fittingsFromDefaults:fittingsFromDefaultModules};
  const before=JSON.stringify(state.player);
  assert.equal(applyRacingLoadout(state,ships,{starter:'starter_hitch',racingDrive:'sprint'}),false);
  assert.equal(JSON.stringify(state.player),before);
  assert.equal(applyRacingLoadout(state,ships,{racingSession:true,starter:'starter_hitch',racingDrive:'sprint'}),true);
  assert.ok(state.player.ownedShips[0].fittings.includes('mod_engine_sprint_m'));
});

test('records separate fitted ships and load mass, not camera preference',()=>{
  const p=player(),s=stateFor(p),base=racingLoadoutCategory(s);
  s.settings.gameplay.steeringView='racing';assert.equal(racingLoadoutCategory(s),base);
  s.player.ownedShips[0].fittings[0]='mod_engine_sprint_m';assert.notEqual(racingLoadoutCategory(s),base);
  const fit=racingLoadoutCategory(s);p.mass+=100;assert.notEqual(racingLoadoutCategory(s),fit);
  const params={courseId:'test',racingContractId:'practice',courseRevision:3,laps:1};
  assert.notEqual(raceRecordKey(params,base),raceRecordKey(params,fit));
});

test('corner advice uses braking authority without changing flight',()=>{
  const p=player(),s=stateFor(p),before=JSON.stringify(p);
  const gates=[{x:0,z:0},{x:100,z:0},{x:100,z:500}];
  const coach=readRacingCoach({nextGate:1,gateRadiusWU:90},p,gates,s);
  assert.equal(coach.brakeNow,true);assert.ok(coach.brakingDistance>100);
  assert.equal(JSON.stringify(p),before);
  p.vel.x=10;assert.equal(readRacingCoach({nextGate:1,gateRadiusWU:90},p,gates,s).brakeNow,false);
});

test('momentum advice identifies a projected gate miss even when the nose faces the gate',()=>{
  const p=player(),s=stateFor(p);p.vel={x:100,z:140};
  const coach=readRacingCoach({nextGate:1,gateRadiusWU:90},p,[{x:0,z:0},{x:200,z:0},{x:600,z:0}],s);
  assert.equal(coach.projectedMiss,true);assert.equal(coach.hint,'CORRECT YOUR DRIFT');
});

test('adventure clock waits for its start gate, then excludes the station approach',()=>{
  const p=player(),params={adventureSpeedId:'speed',raceStartSimS:10,nextGate:0,gates:[{x:0,z:0},{x:100,z:0}]};
  assert.equal(readRaceTape(params,p,params.gates,50).elapsed,0);
  params.adventureSpeedStartSimS=40;
  assert.equal(readRaceTape(params,p,params.gates,50).elapsed,10);
});
