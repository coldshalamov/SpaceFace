import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const load = (p, names, deps = {}) => Function(...Object.keys(deps), src(p).replace(/^import[^;]+;\n/gm, '').replace(/export /g, '') + ';return {' + names + '};')(...Object.values(deps));
const { forEachFieldRock } = load('src/world/livingWorldViews.js', 'forEachFieldRock');
const { starterMiningRouteFocus, starterMiningReceiptMatches, starterBuoySpec } = load('src/missions/starterWorkday.js', 'starterMiningRouteFocus,starterMiningReceiptMatches,starterBuoySpec', { forEachFieldRock });
const { activeOwnedShip, shipCarriesModule } = load('src/data/starterJobs.js', 'activeOwnedShip,shipCarriesModule');
const ASTEROIDS = Function('return ' + src('src/data/mining.js').match(/export const ASTEROIDS = ([\s\S]*?\n\]);/)[1])();
const H = 'sector_helios_prime';
const global = (p) => ({ x: p.x + 10000, z: p.z - 20000 });
const mission = () => ({ id: 'first-iron', status: 'active', type: 'mining_quota', destSectorId: H, destStationId: 'station_helios',
  objectiveTarget: 2, objectiveProgress: 0, params: { starterWorkdayVersion: 1, starterJobId: 'starter_hitch', starterStep: 1, cmdtyId: 'cmdty_ore_iron', requiredModule: 'mod_drill_amp' } });
const rock = (id, x = 600, typeId = 'ast_common_rock') => ({ id, alive: true, type: 'asteroid', pos: global({ x, z: -300 }), data: { typeId, oreHP: 120, sectorId: H } });
const state = (rocks = []) => ({ playerId: 1, world: { currentSectorId: H }, entityList: rocks, entities: new Map(rocks.map(e => [e.id,e])) });
const focus = (m, s) => starterMiningRouteFocus(m, s, global, ASTEROIDS);
// Execute the actual production mining navigation branch, not a copied implementation.
const missionsSource = src('src/systems/missions.js');
const branchStart = missionsSource.indexOf("    if (m.type === 'mining_quota') {");
const branchEnd = missionsSource.indexOf("    if (m.type === BULK_HAUL_TYPE)", branchStart);
const waypoint = Function('starterMiningRouteFocus', 'sectorLocalToGlobalForSector', 'ASTEROIDS',
  'return function(m) { const base = {kind:"mission",missionId:m.id,sectorId:m.destSectorId};' + missionsSource.slice(branchStart, branchEnd) + '}'
)(starterMiningRouteFocus, global, ASTEROIDS);
function nav(m, s, nearest) { return waypoint.call({ state: s, _nearestAsteroid: () => nearest }, m); }

test('accepted first ticket points at authored live iron, not nearer ice', () => {
  const m = mission(), iron = rock(2, 610), ice = rock(1, 600, 'ast_icy');
  assert.equal(nav(m, state([ice, iron]), ice).targetEntityId, 2);
  assert.match(focus(m, state([iron])).label, /Inner claim/);
});
test('worked-out face leads to another real Helios iron face outside authored radius', () => {
  const m = mission(), spent = rock(1), ice = rock(2, 601, 'ast_icy'), alternate = rock(3, 1600, 'ast_metallic');
  spent.data.oreHP = 0;
  const s = state([spent, ice, alternate]), before = JSON.stringify(s);
  const wp = nav(m, s, ice);
  assert.equal(wp.targetEntityId, 3); assert.deepEqual(wp.pos, alternate.pos);
  assert.match(wp.reason, /unavailable/); assert.equal(JSON.stringify(s), before);
});
test('missing or untrusted bodies produce an honest search hint, never a resource target', () => {
  for (const change of [
    e => e.alive = false, e => e.alive = undefined, e => e.data.oreHP = 0,
    e => delete e.data.oreHP, e => e.data.oreHP = NaN, e => e.pos.x = Infinity,
    e => e.data.typeId = 'unknown', e => delete e.data.typeId,
    e => e.data.typeId = 'ast_icy', e => e.data.typeId = 'ast_crystalline',
    e => e.data.missionTag = 'other', e => e.sectorId = 'foreign',
    e => e.homeSectorId = 'foreign', e => e.data.sectorId = 'foreign',
    e => e.data.respawnAt = 0, e => e.data.homeSectorId = 'foreign', e => e.data.siteAnchored = true,
    e => e.data.opticStructureId = 'lattice', e => { e.data.isChunk = true; e.data.bulkMassU = 21; },
  ]) {
    const bad = rock(9); change(bad);
    const wp = nav(mission(), state([bad]), bad);
    assert.equal(wp.targetEntityId, undefined); assert.match(wp.reason, /No eligible iron face/);
    assert.deepEqual(wp.pos, global({ x: 600, z: -300 })); assert.equal(wp.stationId, null);
  }
});
test('leaving Helios routes to its sector, not an attractive foreign rock or stale face', () => {
  const s = state([rock(1)]); s.world.currentSectorId = 'sector_ceres_belt';
  const wp = nav(mission(), s, rock(9));
  assert.equal(wp.sectorId, H); assert.equal(wp.targetEntityId, undefined); assert.equal(wp.pos, undefined);
  assert.match(wp.reason, /Return to Helios Prime/);
});
test('ordinary and legacy mining keep original nearest-rock fallback', () => {
  for (const edit of [m => delete m.params.starterWorkdayVersion, m => m.params.starterWorkdayVersion = 99, m => m.params.starterJobId = 'other']) {
    const m = mission(); edit(m); const ice = rock(7, 650, 'ast_icy');
    assert.equal(focus(m, state([ice])), null);
    assert.deepEqual(nav(m, state([ice]), ice).pos, ice.pos);
  }
});
test('all three authored Hitch sites retain their own first choice', () => {
  for (const [step, x, z] of [[1,600,-300],[2,830,-180],[3,-900,640]]) {
    const m=mission(); m.params.starterStep=step; const e=rock(step); e.pos=global({x,z});
    assert.equal(focus(m,state([e])).targetEntityId,step);
  }
});
test('player receipt policy still rejects NPC, unknown and foreign mining', () => {
  const m=mission(), s=state();
  assert.equal(starterMiningReceiptMatches(m,{minerId:1,qty:2},s),true);
  for(const p of [{minerId:2,qty:2},{qty:2},{minerId:1,qty:0},{minerId:1,qty:Infinity}])
    assert.equal(starterMiningReceiptMatches(m,p,s),false);
  s.world.currentSectorId='foreign'; assert.equal(starterMiningReceiptMatches(m,{minerId:1,qty:2},s),false);
});
test('physical mining owner still requires tool fit and two real player iron receipts', () => {
  const objective = src('src/systems/missionObjectiveOps.js');
  const body = objective.slice(objective.indexOf('  _onMiningYield(p) {'), objective.indexOf('  _onBulkHaulDelivered(p) {')).trim().replace(/,$/, '');
  const onYield=Function('starterMiningReceiptMatches','activeOwnedShip','shipCarriesModule','CONTRACT_47A_B0_TAG',
    'return ({'+body+'})._onMiningYield')(starterMiningReceiptMatches,activeOwnedShip,shipCarriesModule,'campaign-b0');
  const m=mission(), s=state(); s.missions={active:[m]}; s.player={ownedShips:[{fittings:['mod_drill_amp','mod_mining_laser_s']}]};
  let settled=0; const ctx={state:s,bus:{emit(){}},_storyTrigger(){},_refreshTrackedMissionNav(){},_completeMission(){settled++;}};
  const yieldIron=(minerId,qty)=>onYield.call(ctx,{minerId,qty,commodityId:'cmdty_ore_iron'});
  yieldIron(2,2); yieldIron(undefined,2); assert.equal(m.objectiveProgress,0);
  s.player.ownedShips[0].fittings=[]; yieldIron(1,2); assert.equal(m.objectiveProgress,0);
  s.player.ownedShips[0].fittings=['mod_drill_amp','mod_mining_laser_s'];
  yieldIron(1,1); assert.equal(m.objectiveProgress,1); assert.equal(settled,0);
  yieldIron(1,1); assert.equal(m.objectiveProgress,2); assert.equal(settled,1);
});
test('Pelican authored bodies and navigation branch remain outside this correction', () => {
  for(const [step,mass] of [[1,40],[2,65],[3,90]]) {
    const m=mission(); m.type='tow_recovery'; m.params.starterJobId='starter_pelican'; m.params.starterStep=step;
    assert.equal(focus(m,state()),null);
    const b=starterBuoySpec(m,global); assert.equal(b.mass,mass); assert.equal(b.physicsBody.dynamic,true);
    assert.equal(b.data.packagedPropFile,'places/place_lane_beacon.glb');
  }
});


test('ready typed asteroid index wins over stale entityList, including authoritative emptiness', () => {
  const m=mission(), decoy=rock(1), indexed=rock(2,1600), s=state([decoy]);
  s.entities.set(indexed.id,indexed);
  s.entityIndex={__spacefaceEntityIndexV1:true,ready:true,asteroids:[indexed]};
  assert.equal(nav(m,s,decoy).targetEntityId,2);
  s.entityIndex.asteroids=[];
  assert.equal(nav(m,s,decoy).targetEntityId,undefined);
  assert.match(nav(m,s,decoy).reason,/No eligible iron face/);
  s.entityIndex.ready=false;
  assert.equal(nav(m,s,decoy).targetEntityId,1);
});
test('ordinary metallic surface and small beam-workable chunks remain eligible', () => {
  const e=rock(1); e.data.opticMaterial='metal'; e.data.isChunk=true; e.data.bulkMassU=20;
  assert.equal(focus(mission(),state([e])).targetEntityId,1);
});
test('stale indexed occupant cannot grant a recycled target id', () => {
  const e=rock(1), s=state([e]); s.entities.set(1,rock(1,9000,'ast_icy'));
  assert.match(focus(mission(),s).reason,/No eligible iron face/);
});
const dormant = (id=20,x=600) => ({...rock(id,x),fieldResident:true,liveEntityId:null});
function fieldState(records) {
  const s=state(); s.world.asteroidField={schema:'spaceface.asteroidField.v1',rocks:records};
  s.entityIndex={__spacefaceEntityIndexV1:true,ready:true,asteroids:[]}; return s;
}
test('dormant-only first iron face guides by its actual position without promoting or targeting', () => {
  const e=dormant(), s=fieldState([e]), before=JSON.stringify(s);
  const wp=nav(mission(),s,null);
  assert.deepEqual(wp.pos,e.pos); assert.match(wp.label,/Inner claim/);
  assert.equal(wp.targetEntityId,undefined); assert.equal(JSON.stringify(s),before);
  assert.equal(s.entities.size,0); assert.equal(s.entityList.length,0);
});
test('dormant depleted, respawn, promoted, foreign and unknown-schema records do not masquerade as work', () => {
  for(const edit of [e=>e.alive=false,e=>e.data.oreHP=0,e=>e.data.respawnAt=1,e=>e.liveEntityId=30,e=>e.homeSectorId='foreign']) {
    const e=dormant();edit(e);assert.match(focus(mission(),fieldState([e])).reason,/No eligible iron face/);
  }
  const s=fieldState([dormant()]); s.world.asteroidField.schema='unknown';
  assert.match(focus(mission(),s).reason,/No eligible iron face/);
});
test('promotion follows the actual moved living body, never the stale dormant location', () => {
  const rec=dormant(), live=rock(30,1600);rec.liveEntityId=30;
  const s=fieldState([rec]);s.entities.set(30,live);s.entityIndex.asteroids=[live];
  const wp=focus(mission(),s);assert.deepEqual(wp.pos,live.pos);assert.equal(wp.targetEntityId,30);
  assert.match(wp.label,/alternate/);
});
test('dormant presentation id colliding with any live occupant is not exposed as work', () => {
  const rec=dormant(),s=fieldState([rec]);s.entities.set(rec.id,rock(rec.id,9000,'ast_icy'));
  assert.match(focus(mission(),s).reason,/No eligible iron face/);
});

test('foreign-sector correction reaches the existing course-request owner', () => {
  const start=missionsSource.indexOf('  _syncWaypointRoute(waypoint) {');
  const end=missionsSource.indexOf('  _clearMis',start);
  const body=missionsSource.slice(start,end).trim().replace(/,$/,'');
  const sync=Function('deferredEnterNow','return ({'+body+'})._syncWaypointRoute')(()=>0);
  const s=state([rock(1)]);s.world.currentSectorId='sector_ceres_belt';s.nav={};
  const emitted=[];sync.call({state:s,bus:{emit:(...args)=>emitted.push(args)}},nav(mission(),s,rock(1)));
  assert.equal(emitted.length,1);assert.equal(emitted[0][0],'ui:setCourse');
  assert.equal(emitted[0][1].sectorId,H);assert.equal(emitted[0][1].missionId,'first-iron');
});
