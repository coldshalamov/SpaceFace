import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { starterBuoyRouteFocus, starterBuoySpec, registerStarterBuoyTow, isOriginalStarterBuoyTow } from '../src/missions/starterWorkday.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
const src = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const source = src('src/systems/missions.js');
const start = source.indexOf('  _missionWaypoint(m) {');
const end = source.indexOf('\n  _firstLiveMissionTarget(m)', start);
const method = source.slice(start, end).trim().replace(/,$/, '');
const waypoint = Function('firstWaspRouteFocus', 'starterBuoyRouteFocus', 'SECTOR_BY_ID', 'STATION_INFO', 'missionNavReason',
  'return ({' + method + '})._missionWaypoint;')(() => null, starterBuoyRouteFocus,
  new Map([['sector_helios_prime', { name: 'Helios Prime' }]]),
  new Map([['station_helios', { name: 'Helios Station' }]]), () => 'physical job');
const nav = (m, s) => waypoint.call({ state: s }, m);
function setup(step = 1) {
  const m = { id: `starter-starter_pelican-${step}`, status: 'active', source: 'starterJob',
    type: 'tow_recovery', destStationId: 'station_helios', destSectorId: 'sector_helios_prime',
    params: { starterJobId: 'starter_pelican', starterStep: step, starterWorkdayVersion: 1, requiredModule: 'mod_winch_hd' }, targetEntityIds: [7] };
  const e = { ...starterBuoySpec(m, p => ({ ...p })), id: 7, alive: true, occupantGeneration: `buoy-${step}` };
  Object.assign(e.data, { physicalRole: 'slag_core', missionId: m.id, missionTargetSlot: 0,
    worldRecordId: `record-${step}`, identityKey: `mission:${m.id}:0`, homeSectorId: m.destSectorId });
  const player = { id: 1, alive: true, occupantGeneration: 'pilot' };
  const s = { playerId: 1, world: { currentSectorId: m.destSectorId }, missions: { active: [m] },
    entities: new Map([[7, e], [1, player]]),
    player: { ownedShips: [{ defId: 'ship_pelican', fittings: ['mod_winch_hd'] }], tether: { active: false, targetId: null } },
    combat: { attachments: { byId: {} } } };
  assert.equal(registerStarterBuoyTow(s, e, m), true);
  return { m, e, s };
}
function latch(s, e) {
  s.player.tether = { active: true, targetId: e.id, attachmentId: 'line' };
  s.combat.attachments.byId.line = { id: 'line', state: 'active', ownerId: 1, ownerGeneration: 'pilot', targetId: e.id, targetGeneration: e.occupantGeneration };
}
for (const step of [1, 2, 3]) {
  test(`buoy ${step}: actual waypoint follows original, turns home only on live player winch, and returns on drop`, () => {
    const {m,e,s} = setup(step), before = JSON.stringify(m);
    const outbound = nav(m,s);
    assert.equal(outbound.stationId, null); assert.equal(outbound.targetEntityId, 7);
    assert.equal(outbound.label,e.data.name); assert.deepEqual(outbound.pos,e.pos);
    assert.match(outbound.reason,/Winch/); assert.doesNotMatch(outbound.reason,/slag core/);
    e.pos.x += 70; assert.equal(nav(m,s).pos.x,e.pos.x);
    latch(s,e); const inbound = nav(m,s);
    assert.equal(inbound.stationId,'station_helios'); assert.equal(inbound.targetEntityId,undefined);
    assert.equal(inbound.pos,undefined); assert.match(inbound.reason,/line attached/);
    s.player.tether.active = false; m.params.latchedTargetId = e.id;
    assert.equal(nav(m,s).stationId,null,'stale mission latch cannot claim custody');
    delete m.params.latchedTargetId; latch(s,e);
    assert.equal(nav(m,s).stationId,'station_helios'); assert.equal(JSON.stringify(m),before);
  });
  test(`buoy ${step}: Continue requires newly admitted original before routing restored ID`, () => {
    const {m,e,s} = setup(step), restored = structuredClone(e);
    restored.id = 42; restored.occupantGeneration = 'restored'; m.targetEntityIds=[42];
    s.entities.delete(7); s.entities.set(42,restored);
    assert.equal(nav(m,s).targetEntityId,undefined);
    assert.equal(registerStarterBuoyTow(s,restored,m),true);
    assert.equal(nav(m,s).targetEntityId,42);
    latch(s,restored); assert.equal(nav(m,s).stationId,'station_helios');
  });
  test(`buoy ${step}: return-sector and terminal state remain truthful`, () => {
    const {m,e,s}=setup(step); latch(s,e); s.world.currentSectorId='sector_ceres_belt';
    const wp=nav(m,s); assert.equal(wp.stationId,null); assert.equal(wp.pos,undefined);
    assert.equal(wp.targetEntityId,undefined); assert.match(wp.reason,/Return to Helios Prime/);
    for(const status of ['completed','failed','expired','abandoned']) {m.status=status;assert.equal(nav(m,s),null);}
  });
}
test('lost, recycled, foreign, copied and malformed occupants never receive a buoy marker',()=>{
  for(const mutate of [e=>e.alive=false,e=>e.hull=0,e=>e.data.missionId='foreign',e=>e.data.missionTag='foreign',
    e=>e.data.identityKey='foreign',e=>e.data.worldRecordId='foreign',e=>e.data.missionTargetSlot=1,
    e=>e.occupantGeneration='recycled',e=>e.pos.x=NaN,e=>e.mass=999,e=>e.data.homeSectorId='foreign',
    e=>e.sectorId='foreign',e=>e.data.sectorId='foreign']) {
    const {m,e,s}=setup();mutate(e);const wp=nav(m,s);
    assert.equal(wp.targetEntityId,undefined);assert.equal(wp.stationId,null);assert.match(wp.reason,/missing buoy is not a delivery/);
  }
  const {m,e,s}=setup();s.entities.set(e.id,structuredClone(e));
  assert.equal(nav(m,s).targetEntityId,undefined);
});
test('another tow, dead attachment, wrong endpoints and recycled attachment cannot claim receiving leg',()=>{
  for(const mutate of [s=>s.player.tether.targetId=99,s=>s.player.tether.attachmentId='missing',
    s=>s.combat.attachments.byId.line.state='broken',s=>s.combat.attachments.byId.line.ownerId=99,
    s=>s.combat.attachments.byId.line.ownerGeneration='old-pilot',s=>s.combat.attachments.byId.line.targetGeneration='old-buoy',
    s=>s.combat.attachments.byId.line.targetId=99,s=>s.entities.get(1).alive=false]) {
    const {m,e,s}=setup();latch(s,e);mutate(s);assert.equal(nav(m,s).stationId,null);
  }
});
test('hull or fit switch keeps physical route readable without granting tow eligibility',()=>{
  for(const mutate of [s=>s.player.ownedShips[0].defId='ship_wasp',s=>s.player.ownedShips[0].fittings=[]]) {
    const {m,e,s}=setup();mutate(s);
    assert.equal(isOriginalStarterBuoyTow(s,e),false);
    assert.equal(nav(m,s).targetEntityId,e.id);assert.match(nav(m,s).reason,/Pelican with Heavy-Duty Winch/);
    latch(s,e);assert.equal(nav(m,s).stationId,'station_helios');assert.match(nav(m,s).reason,/requires a Pelican/);
  }
});
test('ordinary, legacy, malformed and other branch work never opts into authored buoy routing',()=>{
  for(const mutate of [m=>m.source='board',m=>m.type='demolition',m=>m.destStationId='other',
    m=>m.params.starterJobId='starter_hitch',m=>m.params.starterWorkdayVersion=0,
    m=>m.params.starterStep=4,m=>m.params.starterStep='1',m=>m.params.requiredModule='other']) {
    const {m,s}=setup();mutate(m);assert.equal(starterBuoyRouteFocus(m,s),null);
  }
  assert.equal(starterBuoyRouteFocus(null,{}),null);
});
test('actual HUD station-priority consumer changes from buoy position to receiving station and back',()=>{
  const evidence=src('src/ui/hud.js'), arrow=evidence.indexOf('  function updateObjectiveArrow(p, slow) {');
  const a=evidence.indexOf('    if (state.nav && state.nav.waypoint) {',arrow),b=evidence.indexOf('    if (!wp && m)',a);
  assert.ok(arrow>=0&&a>arrow&&b>a);
  const ns=src('src/ui/navigationWaypoint.js');
  const resolve=Function('resolveEntitySelection','SECTORS',ns.replace(/^import[^;]+;\n/gm,'').replace(/export /g,'')+';return resolveWaypointPresentationPosition;')((s,stable)=>s.entities.get(stable.id),[]);
  const home={x:1280,z:-420};
  const consume=Function('resolveNavStation','resolveWaypointPresentationPosition','return function(state){let wp=null,wpLabel=null,navMeta=null;'+evidence.slice(a,b)+';return {wp,wpLabel};}')(()=>({pos:home}),resolve);
  for(const step of [1,2,3]) {
    const {m,e,s}=setup(step);s.nav={waypoint:nav(m,s)};
    assert.deepEqual(consume(s).wp,e.pos);
    latch(s,e);s.nav.waypoint=nav(m,s);assert.deepEqual(consume(s).wp,home);
    s.player.tether.active=false;s.nav.waypoint=nav(m,s);assert.deepEqual(consume(s).wp,e.pos);
  }
});


test('production attachment creator and tether mirror drive the route through attach and cut', () => {
  const {m,e,s}=setup(2);
  const player=s.entities.get(s.playerId);
  Object.assign(player,{type:'ship',isPlayer:true,pos:{x:e.pos.x-30,z:e.pos.z},vel:{x:0,z:0},rot:0,radius:12,mass:30,hull:100,hullMax:100,data:{}});
  s.tick=1;s.simTime=0;
  ensureCombatState(s);
  const events=[],bus={emit:(name,payload)=>events.push({name,payload})};
  // Only the physical joint port is stubbed: the real service creates/stamps/stores
  // the authoritative record, and the real tether system publishes its reader mirror.
  const helpers={combatPhysics:{createAttachment:()=>1,cutAttachment:()=>true}};
  const service=createAttachmentService({state:s,catalog:createCombatCatalog(),helpers,bus});
  const result=service.create({defId:'tether_standard',ownerId:player.id,targetId:e.id});
  assert.equal(result.ok,true,result.reason);
  const a=result.attachment;
  assert.equal(a.state,'active');assert.equal(a.ownerGeneration,'pilot');
  assert.equal(a.targetGeneration,e.occupantGeneration);
  assert.equal(s.combat.attachments.byId[a.id],a);
  const host=Object.create(tetherGameplay);
  host.helpers=helpers;host.bus=bus;host._active={attachmentId:a.id,targetId:e.id};
  host._mirror(s,e.id,0,a.restLength);
  assert.equal(s.player.tether.attachmentId,a.id);
  assert.equal(nav(m,s).stationId,'station_helios');
  assert.equal(service.cut(a.id,player.id,'test_release').ok,true);
  assert.notEqual(a.state,'active');
  assert.equal(nav(m,s).stationId,null,'broken authority wins even before mirror refresh');
  host._active=null;host._mirror(s,null,0);
  assert.equal(s.player.tether.active,false);assert.equal(s.player.tether.attachmentId,null);
  assert.equal(nav(m,s).targetEntityId,e.id);
  assert.ok(events.some(row=>row.name==='tether:attached'));
});
