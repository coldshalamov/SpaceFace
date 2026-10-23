// Actual Io world owners; explicit quarry placement and damage events are fixtures, not flight.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {world} from '../src/systems/world.js';
import {bountyHunt,makeBountyHunterSpec,makeBountyQuarrySpec} from '../src/systems/bountyHunt.js';
import {economy} from '../src/systems/economy.js';
import {factions} from '../src/systems/factions.js';
import {protectedStationAt} from '../src/ai/engagementAuthority.js';
import {QUARRY_TUNING as QT} from '../src/data/bountyHunters.js';
function boot(){
 const sim=createSimulation({seed:4242,systems:[world,economy,factions,bountyHunt]});
 const s=sim.state;s.mode='flight';s.playerId=sim.spawn({type:'ship',team:0,hull:100,hullMax:100,pos:{x:0,z:0}}).id;
 sim.registry.get('factions').newGame();sim.registry.get('world').enterSector('sector_io_reach');
 const reach=s.entityList.find(e=>e.data?.stationId==='station_reach');
 const merc=s.entityList.find(e=>e.data?.stationId==='station_io_merc');
 const gate=s.entityList.find(e=>e.data?.isGate&&!protectedStationAt(s,e));
 const events=[],escapes=[];sim.bus.on('faction:repDelta',e=>events.push(e));sim.bus.on('bountyHunt:quarryEscaped',e=>escapes.push(e));
 const pair=(pos)=>{const q=sim.spawn(makeBountyQuarrySpec({contractId:'refuge:probe',pos:{...pos}}));const h=sim.spawn(makeBountyHunterSpec({contractId:'refuge:probe',contractTargetId:q.id,pos:{x:pos.x+800,z:pos.z}}));return{q,h}};
 return {sim,s,reach,merc,gate,events,escapes,pair,tick(){sim.registry.get('bountyHunt').update(1/60,s)},assist(h){sim.bus.emit('combat:damage',{targetId:h.id,attackerId:s.playerId,applied:QT.escapeAssistDmg})},close(){sim.dispose()}};
}
for(const kind of ['gate','merc'])test(`actual Io ${kind} is not an asylum or assisted-escape payout`,()=>{const t=boot();try{const st=t[kind];assert.ok(st);assert.equal(protectedStationAt(t.s,st),null);const {q,h}=t.pair(st.pos);t.assist(h);const cr=t.s.player.credits;t.tick();assert.notEqual(q.data.bountyHunt.escaped,true);assert.equal(h.data.contractTargetId,q.id);assert.equal(t.s.player.credits,cr);assert.equal(t.s.bountyHunt.outcomes['refuge:probe'],undefined)}finally{t.close()}});
test('actual Reach refuge pays the existing assist once and releases the hunter',()=>{const t=boot();try{assert.equal(protectedStationAt(t.s,t.reach)?.entityId,t.reach.id);const {q,h}=t.pair(t.reach.pos);t.assist(h);const cr=t.s.player.credits;t.tick();assert.equal(q.data.bountyHunt.escaped,true);assert.equal(h.data.contractTargetId,null);assert.equal(t.s.player.credits-cr,QT.escapeGratitudeCr);assert.deepEqual(t.events.map(e=>[e.reason,e.delta]),[['bounty_bought_escape',QT.escapeGratitudeRep],['bounty_cost_contract',QT.escapeGuildCostRep]]);t.tick();assert.equal(t.s.player.credits-cr,QT.escapeGratitudeCr)}finally{t.close()}});
test('nearer invalid port does not mask the next lawful refuge or steer toward false safety',()=>{const t=boot();try{const {q}=t.pair({x:t.merc.pos.x+100,z:t.merc.pos.z});t.tick();assert.notEqual(q.data.bountyHunt.escaped,true);assert.equal(q.data.intent.mode,'bounty_quarry_flee');assert.equal(q.data.intent.aimAngle,Math.atan2(t.reach.pos.z-q.pos.z,t.reach.pos.x-q.pos.x))}finally{t.close()}});
test('a removed station identity cannot grant a numeric-id refuge',()=>{const t=boot();try{delete t.reach.data.stationId;delete t.reach.stationId;assert.equal(protectedStationAt(t.s,t.reach),null);const {q}=t.pair(t.reach.pos);t.tick();assert.notEqual(q.data.bountyHunt.escaped,true)}finally{t.close()}});
test('a dead lawful station no longer provides refuge',()=>{const t=boot();try{t.reach.alive=false;const {q}=t.pair(t.reach.pos);t.tick();assert.notEqual(q.data.bountyHunt.escaped,true)}finally{t.close()}});
test('existing 420-unit arrival threshold is not widened to the protection ring',()=>{const t=boot();try{const {q}=t.pair({x:t.reach.pos.x+QT.refugeRange+1,z:t.reach.pos.z});assert.ok(protectedStationAt(t.s,q));t.tick();assert.notEqual(q.data.bountyHunt.escaped,true)}finally{t.close()}});
test('unassisted lawful escape keeps its existing zero payout',()=>{const t=boot();try{const {q}=t.pair(t.reach.pos);const cr=t.s.player.credits;t.tick();assert.equal(q.data.bountyHunt.escaped,true);assert.equal(t.s.player.credits,cr);assert.equal(t.events.length,0)}finally{t.close()}});
test('shooting the quarry still voids gratitude despite a later assisted lawful escape',()=>{const t=boot();try{const {q,h}=t.pair(t.reach.pos);t.assist(h);t.sim.bus.emit('combat:damage',{targetId:q.id,attackerId:t.s.playerId,applied:1});const cr=t.s.player.credits;t.tick();assert.equal(q.data.bountyHunt.escaped,true);assert.equal(t.s.player.credits,cr);assert.equal(t.events.length,0)}finally{t.close()}});

for(const kind of ['gate','outlaw'])test(`overlapping ${kind} cannot impersonate the lawful port protecting its position`,()=>{const t=boot();try{const pos={x:t.reach.pos.x+200,z:t.reach.pos.z};const fake=t.sim.spawn({type:'station',factionId:kind==='gate'?'faction_free':'faction_quiet',pos,data:{stationId:'station_fake',isGate:kind==='gate'}});assert.equal(protectedStationAt(t.s,fake)?.entityId,t.reach.id);t.pair(pos);t.tick();assert.equal(t.escapes.length,1);assert.equal(t.escapes[0].stationId,'station_reach')}finally{t.close()}});
test('overlapping second lawful port remains eligible despite first governing-station lookup',()=>{const t=boot();try{const pos={x:t.reach.pos.x+200,z:t.reach.pos.z};const second=t.sim.spawn({type:'station',factionId:'faction_free',pos,data:{stationId:'station_second'}});assert.equal(protectedStationAt(t.s,second)?.entityId,t.reach.id);t.pair(pos);t.tick();assert.equal(t.escapes[0].stationId,'station_second')}finally{t.close()}});
test('refuge spatial authority does not acquire new quarry-faction or player-heat conditions',()=>{const t=boot();try{const {q}=t.pair(t.reach.pos);q.factionId='faction_pirates';t.s.heat={value:999,wanted:true};assert.equal(protectedStationAt(t.s,q)?.entityId,t.reach.id);t.tick();assert.equal(q.data.bountyHunt.escaped,true)}finally{t.close()}});

test('arrival remains strict: exactly 420 active, 419 escaped',()=>{const t=boot();try{const {q}=t.pair({x:t.reach.pos.x+QT.refugeRange,z:t.reach.pos.z});t.tick();assert.notEqual(q.data.bountyHunt.escaped,true);q.pos.x-=1;t.tick();assert.equal(q.data.bountyHunt.escaped,true)}finally{t.close()}});
test('top-level station identity and data faction fallback match jurisdiction authority',()=>{const t=boot();try{t.reach.stationId=t.reach.data.stationId;delete t.reach.data.stationId;t.reach.data.factionId=t.reach.factionId;delete t.reach.factionId;assert.equal(protectedStationAt(t.s,t.reach)?.entityId,t.reach.id);const {q}=t.pair(t.reach.pos);t.tick();assert.equal(q.data.bountyHunt.escaped,true)}finally{t.close()}});
test('malformed station coordinates cannot manufacture refuge at a zero coordinate',()=>{for(const bad of [NaN,undefined,Infinity]){const t=boot();try{t.reach.pos.x=bad;t.reach.pos.z=0;const {q}=t.pair({x:0,z:0});t.tick();assert.notEqual(q.data.bountyHunt.escaped,true)}finally{t.close()}}});
test('malformed query coordinates cannot count as arrival at a lawful port',()=>{for(const bad of [NaN,undefined,Infinity]){const t=boot();try{t.reach.pos.x=0;t.reach.pos.z=0;const {q}=t.pair({x:bad,z:0});q.pos.x=bad;t.tick();assert.notEqual(q.data.bountyHunt.escaped,true)}finally{t.close()}}});
test('finite zero station and quarry coordinates remain a valid refuge',()=>{const t=boot();try{t.reach.pos.x=0;t.reach.pos.z=0;const {q}=t.pair({x:0,z:0});t.tick();assert.equal(q.data.bountyHunt.escaped,true)}finally{t.close()}});
