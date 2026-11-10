import test from 'node:test';
import assert from 'node:assert/strict';
import scene, { runtime } from '../src/data/encounters/925-scene-struck-bell.js';
import { STRUCK_BELL_SITE as S, STRUCK_BELL_ID, struckBellBodySpec, struckBellAdmission, struckBellPlacementClear, struckBellAnchor, STRUCK_BELL_ANCHORS } from '../src/systems/struckBellRuntime.js';

function fixture() {
  let now = 0, id = 1;
  const listeners = new Map(), events = [], entities = new Map();
  const bus = {
    on(name, fn) { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); return () => set.delete(fn); },
    emit(name, p) { for (const fn of [...(listeners.get(name) || [])]) fn(p); },
  };
  const player = { id: 0, occupantGeneration: 100, alive: true, type: 'ship', radius: 14, pos: { x: S.anchor.x - 180, z: S.anchor.z }, vel: { x: 0, z: 0 } };
  entities.set(0, player);
  const state = { mode: 'flight', timeScale: 1, simTime: 0, tick: 0, playerId: 0, player: { tether: null }, entities,
    world: { currentSectorId: 'sector_phoebe_echo' }, encounterDirector: { stats: {}, live: {} } };
  const live = { id: 'lesson', shapeId: STRUCK_BELL_ID, sectorId: 'sector_phoebe_echo', anchor: { ...S.anchor },
    ids: [], roles: {}, vars: {}, plan: {} };
  state.encounterDirector.live[live.id] = live;
  const spawn = (row) => { const e = { ...row, id: id++, occupantGeneration: id + 100, alive: true, pos: { ...row.pos }, vel: { x: 0, z: 0 }, data: { ...row.data } }; entities.set(e.id, e); return e; };
  const d = { bus, helpers: { spawnEntity: spawn }, registry: {}, now: () => now, player: () => entities.get(0),
    entsOf: (l) => l.ids.map((i) => entities.get(i)),
    spawnShips(l, rows) { return rows.map((row) => { const e = spawn({ ...row, type: 'ship' }); l.ids.push(e.id); l.roles[e.id] = row.role; return e.id; }); },
    spawnProp(l, row) { return spawn(row); },
    say(l, c, text) { events.push(['say', text]); }, offerChoices(l, ids) { events.push(['offer', ids]); },
    grant(n) { events.push(['grant', n]); }, rep(f, n) { events.push(['rep', f, n]); },
    resolve(l, o) { events.push(['resolve', o]); l.phase = 'done'; bus.emit('encounter:resolved', { encounterId: l.id }); delete state.encounterDirector.live[l.id]; },
    abort(l, r) { events.push(['abort', r]); l.phase = 'done'; bus.emit('encounter:resolved', { encounterId: l.id }); delete state.encounterDirector.live[l.id]; },
  };
  const f = { state, live, d, player, bus, events, entities, listeners,
    tick(t) { now = t; state.simTime = t; state.tick = Math.round(t * 60); runtime.tick(d, live, state, t); },
    choose(c) { if (live.offerConsumed) return; live.offerConsumed = true; runtime.choose(d, live, state, c); },
    get(name) { return entities.get(live.ids.find((i) => live.roles[i] === name)); },
    fire() { runtime.fire(d, live, state); f.tick(6); },
    start(c = 'a') { f.fire(); f.choose(c); },
    latch() { state.player.tether = { active: true, targetId: f.get('stone')?.id }; f.bus.emit('tether:latched', { sourceId: player.id, targetId: f.get('stone')?.id }); f.tick(now + 1 / 60); },
    release(extra = {}) { bus.emit('tether:releaseRated', { targetId: f.get('stone')?.id, sourceId: player.id, deliberate: true, observedTick: state.tick, ...extra }); state.player.tether = null; },
    impact(extra = {}) { const p = { aId: f.get('stone')?.id, bId: f.get('bell')?.id, tick: state.tick, backend: 'rapier-dynamic', aGeneration: f.get('stone')?.occupantGeneration, bGeneration: f.get('bell')?.occupantGeneration, impulse: 30, ...extra }; bus.emit('physics:impact', p); return p; },
    paid() { return events.filter((e) => e[0] === 'grant'); },
    subscriptions() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
  return f;
}
test('agreeing is not a strike or a payout', () => { const f = fixture(); f.start(); f.tick(8); assert.equal(f.paid().length, 0); assert.equal(f.live.phase, 'bell_strike'); });
test('actual original release/impact evidence certifies once; payload pooling cannot rewrite it', () => {
  const f = fixture(); f.start(); f.latch(); f.release(); const payload = f.impact(); payload.impulse = 0; payload.aId = -1;
  f.tick(7); f.tick(8); f.choose('a');
  assert.deepEqual(f.paid(), [['grant', 30]]);
  assert.deepEqual(f.events.filter((e) => e[0] === 'rep'), [['rep', 'faction_choir', 2]]);
  assert.equal(f.state.encounterDirector.stats.livedSeen[STRUCK_BELL_ID], 'a'); assert.equal(f.subscriptions(), 0);
});
for (const mode of ['choiceOnly', 'unreleased', 'heldPush', 'foreignPair', 'tinyImpact', 'oldTick', 'wrongSource', 'brokenLine', 'expiredRelease'])
  test(mode + ' cannot earn a strike', () => {
    const f = fixture(); f.start();
    if (mode !== 'choiceOnly') { f.latch(); if (mode !== 'unreleased') f.release(mode === 'wrongSource' ? { sourceId: 99 } : mode === 'brokenLine' ? { deliberate: false } : {}); }
    if (mode === 'heldPush') f.state.player.tether = { active: true, targetId: f.get('stone').id };
    if (mode === 'expiredRelease') f.tick(30);
    if (mode !== 'choiceOnly') f.impact(mode === 'foreignPair' ? { aId: f.player.id } : mode === 'tinyImpact' ? { impulse: 0.1 } : mode === 'oldTick' ? { tick: -1 } : {});
    f.tick(mode === 'expiredRelease' ? 31 : 7);
    assert.equal(f.paid().length, 0);
  });
test('pre-choice latch/release/impact never carries into agreed work', () => {
  const f = fixture(); f.fire(); f.latch(); f.release(); f.impact(); f.choose('a'); f.tick(8); assert.equal(f.paid().length, 0);
});
test('a missed throw may be recovered and deliberately released again', () => {
  const f = fixture(); f.start(); f.latch(); f.release(); f.tick(28); f.impact(); f.tick(29); assert.equal(f.paid().length, 0);
  f.latch(); f.release(); f.impact(); f.tick(30); assert.equal(f.paid().length, 1);
});
for (const kind of ['stone', 'bell', 'runner', 'ship_1', 'ship_2'])
  for (const loss of ['dead', 'reused', 'generation']) test(kind + ' ' + loss + ' ends unpaid', () => {
    const f = fixture(); f.start(); f.latch(); f.release(); const e = f.get(kind);
    if (loss === 'dead') e.alive = false; else if (loss === 'generation') e.occupantGeneration++; else f.entities.set(e.id, { ...e, pos: { ...e.pos } });
    f.impact(); f.tick(7); assert.equal(f.paid().length, 0); assert.ok(f.events.some((e) => e[0] === 'abort')); assert.equal(f.subscriptions(), 0);
  });
test('bearing option requires eight quiet separated measured readings at actual observer', () => {
  const f = fixture(); f.start('b'); assert.equal(f.events.some((e) => e[0] === 'resolve'), false);
  const observer = f.get('ship_2'); f.player.pos = { x: observer.pos.x - 100, z: observer.pos.z };
  for(let t=7;t<14;t++)f.tick(t); assert.equal(f.events.some((e) => e[0] === 'resolve'), false); f.tick(14);
  assert.deepEqual(f.events.filter((e) => e[0] === 'rep'), [['rep', 'faction_vael', 1], ['rep', 'faction_choir', -1]]); assert.equal(f.paid().length, 0);
  assert.equal(f.state.encounterDirector.stats.livedSeen[STRUCK_BELL_ID], 'b');
});
for (const reset of ['range', 'speed', 'observerSpeed', 'pause']) test('bearing resets on ' + reset, () => {
  const f = fixture(); f.start('b'); const observer = f.get('ship_2');
  f.player.pos = { x: observer.pos.x - 100, z: observer.pos.z }; for(let t=7;t<=13;t++)f.tick(t);
  if (reset === 'range') f.player.pos.x -= 300; if (reset === 'speed') f.player.vel.x = 4;
  if (reset === 'observerSpeed') observer.vel.x = 4; if (reset === 'pause') f.state.timeScale = 0;
  f.tick(14); f.player.pos.x = observer.pos.x - 100; f.player.vel.x = observer.vel.x = 0; f.state.timeScale = 1;
  for(let t=15;t<22;t++)f.tick(t); assert.equal(f.events.some((e) => e[0] === 'resolve'), false); f.tick(22);
  assert.ok(f.events.some((e) => e[0] === 'resolve' && e[1] === 'b'));
});
test('decline is honest and has no faction or credit consequence', () => {
  const f = fixture(); f.start('c'); assert.equal(f.paid().length, 0); assert.equal(f.events.filter((e) => e[0] === 'rep').length, 0); assert.equal(f.subscriptions(), 0);
});
for (const reason of ['timeout', 'leave', 'death', 'identity', 'sector']) test(reason + ' ends unpaid and removes listeners', () => {
  const f = fixture(); f.start();
  if (reason === 'leave') f.player.pos.x += 2000;
  if (reason === 'death') f.player.alive = false;
  if (reason === 'identity') f.entities.set(0, { ...f.player });
  if (reason === 'sector') f.state.world.currentSectorId = 'sector_eris_margin';
  f.tick(reason === 'timeout' ? 151 : 7); assert.equal(f.paid().length, 0); assert.equal(f.live.phase, 'done'); assert.equal(f.subscriptions(), 0);
});
for (const event of ['save:restoring', 'save:loaded', 'sector:exit', 'game:newGame', 'game:new']) test(event + ' abandons transient evidence without payout', () => {
  const f = fixture(); f.start(); f.latch(); f.release(); f.bus.emit(event, { encounterId: f.live.id });
  assert.equal(f.subscriptions(), 0); assert.equal(f.state.encounterDirector.live[f.live.id], undefined); f.impact(); f.tick(8); assert.equal(f.paid().length, 0);
});
test('paused choice is reoffered on resume without extending fixed deadline', () => {
  const f = fixture(); f.fire(); const deadline = f.live.deadlineAt; f.state.timeScale = 0; f.choose('a');
  assert.equal(f.live.phase, 'offer'); assert.equal(f.live.offerConsumed, false);
  f.state.timeScale = 1; f.tick(7); f.choose('a'); assert.equal(f.live.phase, 'bell_strike'); assert.equal(f.live.deadlineAt, deadline);
});
test('practice bodies are real finite asteroid geometry, not beacon hit proxies', () => {
  for (const name of ['bell', 'stone']) { const b = struckBellBodySpec(name); assert.equal(b.type, 'asteroid'); assert.equal(b.collides, true);
    assert.ok(b.physicsBody.radius > b.radius); assert.equal(b.flags?.invuln, undefined); assert.equal(b.data.yieldU, 1); }
  assert.match(scene.receipts.a, /practice bell/); assert.match(scene.receipts.b, /No song fragment/);
});
test('unavailable and remote players cannot spawn a practice lesson', () => {
  const f = fixture(); f.player.pos.x += 9000; assert.equal(struckBellAdmission(f.state, {}, f.player), false);
  runtime.fire(f.d, f.live, f.state); assert.equal(f.entities.size, 1); assert.equal(f.paid().length, 0);
});

for (const defect of ['missingBackend', 'wrongBackend', 'missingGeneration', 'wrongGeneration', 'futureTick']) test(defect+' impact rejects stale or unmeasured contact', () => {
 const f=fixture();f.start();f.latch();f.release();const p={};
 if(defect==='missingBackend')p.backend=undefined;if(defect==='wrongBackend')p.backend='custom';
 if(defect==='missingGeneration')p.aGeneration=undefined;if(defect==='wrongGeneration')p.bGeneration=-1;
 if(defect==='futureTick')p.tick=f.state.tick+1;
 f.impact(p);f.tick(7);assert.equal(f.paid().length,0);
});
test('duplicate release cannot refresh an already consumed latch epoch',()=>{
 const f=fixture();f.start();f.latch();f.release();f.tick(28);f.release();f.impact();f.tick(29);assert.equal(f.paid().length,0);
});
test('actual latch and release between director samples is observed synchronously',()=>{
 const f=fixture();f.start();const stone=f.get('stone');
 f.state.player.tether={active:true,targetId:stone.id};f.bus.emit('tether:latched',{sourceId:f.player.id,targetId:stone.id});
 f.release();f.impact();f.tick(7);assert.equal(f.paid().length,1);
});
test('save restoring followed by failed restore cannot strand a live lesson',()=>{
 const f=fixture();f.start();f.bus.emit('save:restoring',{});f.bus.emit('save:error',{});assert.equal(f.state.encounterDirector.live[f.live.id],undefined);assert.equal(f.subscriptions(),0);
});
test('soft sector exit explicitly terminates preserved director live',()=>{
 const f=fixture();f.start();f.bus.emit('sector:exit',{continuous:true,noTeleport:true});assert.equal(f.state.encounterDirector.live[f.live.id],undefined);
});
test('spawn refuses player occupying actual stone location',()=>{
 const f=fixture();f.player.pos={...struckBellBodySpec('stone').pos};runtime.fire(f.d,f.live,f.state);assert.equal(f.entities.size,1);assert.equal(f.live.phase,'done');
});
test('same-timestamp ticks and large catch-up cannot fabricate bearing readings',()=>{
 const f=fixture();f.start('b');const o=f.get('ship_2');f.player.pos={x:o.pos.x-100,z:o.pos.z};
 for(let i=0;i<20;i++)f.tick(7);f.tick(50);assert.equal(f.events.some(e=>e[0]==='resolve'),false);
});

test('spawn checks Map-only bodies even when entityList lags behind',()=>{
 const f=fixture();f.state.entityList=[f.player];const rock={id:30,alive:true,type:'asteroid',pos:{...struckBellBodySpec('stone').pos},radius:10,data:{typeId:'ast_common_rock'}};f.entities.set(30,rock);
 assert.equal(struckBellPlacementClear(f.state),false);
});
test('spawn uses expanded crystalline collider instead of visual radius',()=>{
 const f=fixture(),b=struckBellBodySpec('bell');f.entities.set(30,{id:30,alive:true,type:'asteroid',pos:{x:b.pos.x+62,z:b.pos.z},radius:24,data:{typeId:'ast_crystalline'}});
 assert.equal(struckBellPlacementClear(f.state),false);
});

test('finite authored anchor selection skips an obstructed site and defers when all are blocked',()=>{
 const f=fixture();f.entities.set(30,{id:30,alive:true,type:'asteroid',pos:{...struckBellBodySpec('stone').pos},radius:10,data:{typeId:'ast_common_rock'}});
 assert.deepEqual(struckBellAnchor(f.state,f.player),STRUCK_BELL_ANCHORS[1]);
 for(let i=0;i<STRUCK_BELL_ANCHORS.length;i++) f.entities.set(40+i,{id:40+i,alive:true,pos:{...struckBellBodySpec('stone',STRUCK_BELL_ANCHORS[i]).pos},radius:10});
 assert.equal(struckBellAnchor(f.state,f.player),null);
});
test('fire never replaces a blocked requested anchor with a different safe site',()=>{
 const f=fixture();f.entities.set(30,{id:30,alive:true,pos:{...struckBellBodySpec('stone').pos},radius:10});
 assert.ok(struckBellAnchor(f.state,f.player));runtime.fire(f.d,f.live,f.state);
 assert.equal(f.state.encounterDirector.live[f.live.id],undefined);assert.equal(f.entities.size,2);
});
