import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { missions } from '../src/systems/missions.js';
import { mining } from '../src/systems/mining.js';
import { cargo } from '../src/systems/cargo.js';
import { HELIOS_CLAIM_OPENING, stepHeliosClaimOpening } from '../src/systems/heliosClaimOpening.js';
import { expireRichSeamOpportunities, richSeamOpportunityReadout, fieldDepletion } from '../src/systems/fieldDepletion.js';
import { economy } from '../src/systems/economy.js';
import { world } from '../src/systems/world.js';
import { contactHailAvailability, createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';
import { firstIronContactIdentity, firstIronWorkingPosition } from '../src/data/heliosFirstIronContact.js';
import { insertDressingRow } from '../src/world/dressingTable.js';
import { stampSolidDressing } from '../src/world/solidDressing.js';
import { modelTruthPlanarRadius } from '../src/data/modelTruth.js';

const SECTOR = 'sector_helios_prime';
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function prepare(state, owner, spawn, player) {
  state.mode = 'flight'; state.world.currentSectorId = SECTOR; state.ui.screenStack = [];
  state.playerId = player.id;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['mod_drill_amp', 'mod_mining_laser_s'] }];
  state.player.activeShipIndex = 0; state.onboarding = { active: false, finished: true };
  const offer = owner.ensureBoard('station_helios').slots.find(m => m.params?.starterJobId === 'starter_hitch');
  assert.ok(offer); assert.equal(owner.acceptMission(offer.id), true);
  const worker = spawn({ type: 'ship', team: 2, pos: { x: 100, z: -100 }, radius: 12, mass: 40,
    hull: 100, hullMax: 100, data: { ai: { passive: true }, trafficRole: 'miner',
      activityActorSlotId: 'helios_seam_miner', worldRecordId: 'first-iron-worker', jobId: 'job:first-iron-worker' } });
  state.npcJobs = { byId: { 'job:first-iron-worker': { entityId: worker.id, worldRecordId: 'first-iron-worker',
    job: { id: 'job:first-iron-worker', kind: 'miner', materialized: true } } } };
  const rock = spawn({ type: 'asteroid', pos: { x: 450, z: 0 }, radius: 25, mass: 200,
    hull: 60, hullMax: 60, physicsBody: { dynamic: false, radius: 25 },
    data: { typeId: 'ast_common_rock', oreHP: 60, oreHPMax: 60, yieldU: 30 } });
  state.player.targetId = worker.id;
  return { worker, rock, mission: state.missions.active.find(m => m.params?.starterJobId === 'starter_hitch') };
}
function fixture({ withMining = false } = {}) {
  const sim = createSimulation({ seed: 73319, systems: [missions, scanner, ...(withMining ? [mining, cargo, economy] : [])], updateOrder: [] });
  const { state, bus } = sim, player = sim.spawn({ type: 'ship', isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, radius: 10, mass: 30, hull: 100, data: {} });
  const scene = prepare(state, sim.registry.get('missions'), spec => sim.spawn(spec), player);
  return { sim, state, bus, player, ...scene, close: () => sim.dispose() };
}
const offer = f => createContactHailOffer(f.state, contactHailAvailability(f.state), 'first-iron', f.state.simTime + 8);
const reply = (f, o = offer(f)) => createContactHailResponse(f.state, o, 'route');

test('first-ticket cutter offers a working position without changing job, resource, cargo or mission', () => {
  const f = fixture(); try {
    const unchanged = () => JSON.stringify([f.state.player, f.state.missions, f.state.npcJobs, f.state.entityList]);
    const before = unchanged(), o = offer(f), r = reply(f, o);
    assert.deepEqual(o.actions.map(a => a.id), ['status', 'identify', 'route']);
    assert.equal(o.actions[2].label, 'MARK FIRST IRON');
    assert.ok(r.firstIronCourse); assert.equal(r.firstIronCourse.autopilot, false);
    assert.ok(distance(r.firstIronCourse.pos, f.rock.pos) > f.rock.radius + f.player.radius);
    assert.ok(distance(r.firstIronCourse.pos, f.rock.pos) < 240);
    assert.match(r.lines.join(' '), /keep my own cut.*mining beam/);
    assert.equal(unchanged(), before);
  } finally { f.close(); }
});

test('advice rejects wrong ticket, fit, worker, player lifetime and stale context', () => {
  const changes = [f => f.mission.status = 'completed', f => f.mission.params.starterStep = 2,
    f => f.mission.params.starterWorkdayVersion = 0, f => f.state.player.ownedShips[0].fittings = [],
    f => f.worker.occupantGeneration++, f => f.player.occupantGeneration++,
    f => f.state.npcJobs.byId[f.worker.data.jobId].control = {}, f => f.state.world.enterSerial = 1,
    f => f.state.world.currentSectorId = 'sector_ceres_belt', f => f.state.ui.docked = true,
    f => f.state.save = { restoring: true }, f => f.state.onboarding.active = true,
    f => f.state.player.targetId = null, f => f.state.simTime += 8,
    f => f.state.npcJobs.byId[f.worker.data.jobId].job.phase = 'flee'];
  for (const change of changes) {
    const f = fixture(); try { const o = offer(f); if (change === changes[11]) f.state.onboarding.finished = false;
      change(f); assert.equal(reply(f, o), null, String(change));
    } finally { f.close(); }
  }
});

test('current mineable iron, not ice, spent faces, foreign rocks or the cutter’s own cut', () => {
  for (const mutate of [f => f.rock.data.typeId = 'ast_ice', f => f.rock.data.oreHP = 0,
    f => f.rock.data.siteAnchored = true, f => f.rock.homeSectorId = 'elsewhere',
    f => f.worker.data.minerShiftRockId = f.rock.id, f => f.rock.pos.x = 2000]) {
    const f = fixture(); try { mutate(f); const r = reply(f);
      assert.equal(r.firstIronCourse, undefined); assert.match(r.lines.join(' '), /Keep your current course/);
    } finally { f.close(); }
  }
});

test('solid dressing measured skin and dormant field rocks exclude occupied working positions', () => {
  const f = fixture(); try {
    const fix = firstIronWorkingPosition(f.state, f.worker), data = { placeId: 'place_claim_outpost_fence' };
    stampSolidDressing(data, { radius: 20 });
    const row = insertDressingRow(f.state, { pos: { x: fix.pos.x, z: fix.pos.z + 80 }, radius: 20,
      collides: true, physicsBody: { dynamic: false }, data });
    assert.ok(modelTruthPlanarRadius(row) > 80); const saved = structuredClone(row);
    const changed = firstIronWorkingPosition(f.state, f.worker);
    assert.ok(!changed || distance(changed.pos, fix.pos) > 1); assert.deepEqual(row, saved);
    row.physicsBody = false; assert.deepEqual(firstIronWorkingPosition(f.state, f.worker), fix);
    f.sim.spawn({ type: 'asteroid', pos: { ...f.rock.pos }, radius: 500, mass: 1000, hull: 100,
      data: { typeId: 'ast_ice', oreHP: 100 } });
    assert.equal(firstIronWorkingPosition(f.state, f.worker), null);
  } finally { f.close(); }
});

async function mountHails(f,{radial=false}={}){
 const {fakeDom}=await import('./helpers/fake-dom.mjs');
 const {createContactHailPrompt}=await import('../src/ui/contactHailPrompt.js');
 const {createCommsRadial}=await import('../src/ui/commsRadial.js');
 const doc=fakeDom(),listeners=new Map(),old=globalThis.document;
 const make=tag=>{
  const e=doc._make(tag),keys=new Map();
  e.querySelector=selector=>{const key=/^\[data-k="([^"]+)"\]$/.exec(selector)?.[1];if(!key)return null;if(!keys.has(key)){const child=make('div');e.appendChild(child);keys.set(key,child);}return keys.get(key);};
  e.removeChild=child=>{const i=e.children.indexOf(child);if(i>=0)e.children.splice(i,1);child.parentNode=null;};
  e.remove=()=>e.parentNode?.removeChild(e);
  e.replaceChildren=(...rows)=>{for(const child of [...e.children])e.removeChild(child);e.append(...rows);};
  e.contains=other=>e===other||e.children.some(x=>x.contains(other));
  e.focus=()=>{doc.activeElement=e;};e.removeEventListener=()=>{};
  e.closest=selector=>selector==='[data-choice]'&&e.dataset.choice?e:null;
  e.getBoundingClientRect=()=>{const left=Number.parseFloat(e.style.left)||0,top=e.dataset.choice?e.parentNode.children.filter(x=>x.dataset.choice).indexOf(e)*46:(Number.parseFloat(e.style.top)||0);return{left,top,width:180,height:40,right:left+180,bottom:top+40};};
  Object.defineProperty(e,'isConnected',{get:()=>doc.body?.contains(e)||doc.head.contains?.(e)||false});
  return e;
 };
 doc.createElement=make;doc.createElementNS=(_,tag)=>make(tag);doc.body=make('body');
 const root=make('div');root.id='ui-root';doc.body.appendChild(root);
 const headLookup=doc.getElementById;
 doc.getElementById=id=>id==='ui-root'?root:root.children.find(e=>e.id===id)||headLookup(id);
 doc.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
 doc.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);
 doc.key=(key,code=key,type='keydown')=>{const ev={key,code,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};for(const fn of listeners.get(type)||[])fn(ev);return ev;};
 globalThis.document=doc;
 const gamepad={isConnected:()=>true,axes:{leftX:0,leftY:0},actions:{accept:{pressed:false}}};
 const ui=radial?createCommsRadial({state:f.state,bus:f.bus,gamepad}):createContactHailPrompt({state:f.state,bus:f.bus});
 return {doc,ui,root,gamepad,close(){ui.destroy();globalThis.document=old;}};
}

test('mounted pointer and keyboard hail plot exactly once through the ordinary world owner, without autopilot', async () => {
  for (const mode of ['pointer', 'Digit3', 'Numpad3']) {
    const f = fixture(); let mounted; try {
      mounted = await mountHails(f); const { ui, doc } = mounted;
      const courses = [], responses = [];
      f.bus.on('ui:setCourse', c => { courses.push(c); world._onSetCourse.call({ state: f.state, bus: f.bus }, c); });
      f.bus.on('contactHail:response', r => responses.push(r));
      f.bus.emit('contactHail:availability', contactHailAvailability(f.state)); ui.request();
      const panel = ui.el.querySelector('[data-k="panel"]'), actions = panel.querySelector('[data-k="actions"]');
      assert.deepEqual(actions.children.map(e => e.dataset.choice), ['status', 'identify', 'route']);
      if (mode === 'pointer') for (const fn of panel.listeners.click) fn({ target: actions.children[2] });
      else assert.equal(doc.key('3', mode).defaultPrevented, true);
      assert.equal(courses.length, 1); assert.equal(f.state.nav.autopilot.active, false);
      assert.deepEqual(f.state.nav.waypoint.pos, courses[0].pos); assert.equal(f.state.nav.waypoint.targetEntityId, undefined);
      f.bus.emit('contactHail:response', responses[0]); assert.equal(courses.length, 1);
    } finally { mounted?.close(); f.close(); }
  }
});

test('new course, Close, target replacement, expired offer and load prevent late guidance from stealing navigation', async () => {
  const changes = [f => f.bus.emit('ui:setCourse', { pos: { x: 9, z: 9 } }),
    (f, m) => m.ui.hide(), f => f.worker.occupantGeneration++, f => f.state.simTime += 8,
    f => f.bus.emit('game:load'), f => f.state.player.targetId = null,
    f => f.state.world.enterSerial = 1, f => f.mission.status = 'completed'];
  for (const change of changes) {
    const f = fixture(); let mounted; try {
      mounted = await mountHails(f); const o = offer(f), r = reply(f, o), courses = [];
      f.bus.emit('contactHail:offer', o); change(f, mounted);
      f.bus.on('ui:setCourse', c => courses.push(c)); f.bus.emit('contactHail:response', r);
      assert.equal(courses.length, 0, String(change));
      const lines = mounted.ui.el.querySelector('[data-k="panel"]').querySelector('[data-k="lines"]').children.map(e => e.textContent).join(' ');
      if (change === changes[0]) assert.match(lines, /NOT MARKED.*current course is unchanged/);
      assert.doesNotMatch(lines, /I have marked/);
    } finally { mounted?.close(); f.close(); }
  }
});

test('radial gamepad can choose the existing ROUTE action and the common prompt plots its reply', async () => {
  const f = fixture(); let mounted, prompt; try {
    mounted = await mountHails(f, { radial: true });
    const { createContactHailPrompt } = await import('../src/ui/contactHailPrompt.js');
    prompt = createContactHailPrompt({ state: f.state, bus: f.bus });
    const courses = []; f.bus.on('ui:setCourse', c => courses.push(c));
    mounted.doc.key('Alt', 'AltLeft'); const fan = mounted.doc.getElementById('sf-commsfan');
    const wedges = fan.querySelector('[data-k="wedgehost"]').children.filter(e => e.dataset.choice);
    // Exact published parent retains IDENTIFY, so move through its three real choices.
    assert.deepEqual(wedges.map(e => e.dataset.choice), ['status', 'identify', 'route']);
    mounted.gamepad.axes.leftY = 1; mounted.ui.tick(); mounted.gamepad.axes.leftY = 0; mounted.ui.tick();
    mounted.gamepad.axes.leftY = 1; mounted.ui.tick(); mounted.gamepad.axes.leftY = 0; mounted.ui.tick();
    assert.equal(mounted.doc.activeElement.dataset.choice, 'route');
    mounted.gamepad.actions.accept.pressed = true; mounted.ui.tick(); assert.equal(courses.length, 1);
  } finally { prompt?.destroy(); mounted?.close(); f.close(); }
});

test('native Hitch follows the chosen working fix, brakes and cuts first-ticket iron with the ordinary beam',
  { timeout: 120000 }, async () => {
    const { bootRealPath, writeRealPathInput } = await import('../scripts/lib/bench/realPath.mjs');
    const h = await bootRealPath({ seed: 73319, systems: [missions, scanner, mining, economy, 'flightV3', 'physics'],
      hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 0, z: 0 }, rot: 0 }] });
    let mounted;
    try {
      const s = h.state, scene = prepare(s, h.runtime.getSystem('missions'), spec => h.runtime.spawn(spec), h.player);
      const f = { state: s, bus: h.bus, ...scene, player: h.player };
      const before = { ...h.player.pos }, awards = [], hits = [], yields = [];
      h.bus.on('economy:grantCredits', p => awards.push(p));
      h.bus.on('physics:impact', p => { if ([p.aId, p.bId].includes(h.player.id)) hits.push(p); });
      h.bus.on('mining:yield', p => yields.push(p));
      h.bus.on('ui:setCourse', c => world._onSetCourse.call({ state: s, bus: h.bus }, c));
      mounted = await mountHails(f); h.bus.emit('contactHail:availability', contactHailAvailability(s));
      mounted.ui.request(); mounted.doc.key('3', 'Digit3');
      const fix = { ...s.nav.waypoint.pos }; assert.equal(s.nav.autopilot.active, false);
      for (let i = 0; i < 3600; i++) {
        const p = h.player, dx = fix.x - p.pos.x, dz = fix.z - p.pos.z;
        const scale = Math.min(.5, 30 / Math.max(1, Math.hypot(dx, dz)));
        const ax = (dx * scale - p.vel.x) * .12, az = (dz * scale - p.vel.z) * .12;
        const co = Math.cos(p.rot), sn = Math.sin(p.rot);
        writeRealPathInput(s, { moveZ: ax * co + az * sn, moveX: -ax * sn + az * co });
        h.step(1);
        if (distance(p.pos, fix) < 4 && Math.hypot(p.vel.x, p.vel.z) < 2) break;
      }
      assert.ok(distance(h.player.pos, fix) < 4, JSON.stringify({ pos: h.player.pos, fix }));
      assert.ok(distance(before, h.player.pos) > 250); assert.equal(hits.length, 0);
      for (let i = 0; i < 600 && scene.mission.status === 'active'; i++) {
        writeRealPathInput(s, { brake: true });
        s.input.fireGroup = 2; s.input.aimAngle = Math.atan2(scene.rock.pos.z - h.player.pos.z, scene.rock.pos.x - h.player.pos.x);
        h.step(1);
      }
      s.input.fireGroup = 0;
      assert.equal(scene.mission.status, 'completed'); assert.equal(s.missions.starterJobStep.starter_hitch, 1);
      assert.ok(yields.filter(p => p.minerId === h.player.id && p.commodityId === 'cmdty_ore_iron').reduce((n, p) => n + p.qty, 0) >= 2);
      assert.equal(awards.filter(p => p.amount === 420).length, 1, JSON.stringify(awards));
      assert.equal(hits.length, 0); assert.equal(scene.worker.data.jobId, 'job:first-iron-worker');
      console.log('FIRST_IRON_NATIVE', JSON.stringify({ atS: s.simTime, travel: distance(before, h.player.pos),
        fix, contacts: hits.length, starterStep: s.missions.starterJobStep.starter_hitch, awards }));
    } finally { mounted?.close(); h.dispose(); }
  });

test('production first-iron board and actual world-owned cutter provide a real working fix through scanner', async () => {
  const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');
  const { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } = await import('../src/data/featureFlags.js');
  const flags = snapshotFeatureMaps(), r = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 73319 });
  applyFeatureConfigToMaps(r.config.features);
  try {
    const s = r.state, ships = r.getSystem('ships'), w = r.getSystem('world'), owner = r.getSystem('missions');
    s.mode = 'flight'; s.ui.screenStack = []; ships.newGame();
    const p = r.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, team: 0, pos: { x: 0, z: 0 } }));
    s.playerId = p.id; w.enterSector(SECTOR); s.onboarding = { active: false, finished: true };
    const board = owner.ensureBoard('station_helios').slots.find(m => m.params?.starterJobId === 'starter_hitch');
    assert.equal(owner.acceptMission(board.id), true);
    const worker = s.entityList.find(e => e.alive && e.data?.activityActorSlotId === 'helios_seam_miner'); assert.ok(worker);
    w.relocatePlayerInSector({ x: worker.pos.x - 160, z: worker.pos.z }, { reason: 'first-iron-contact-fixture' });
    s.player.targetId = worker.id; const offers = [], responses = [];
    r.bus.on('contactHail:offer', o => offers.push(o)); r.bus.on('contactHail:response', a => responses.push(a));
    r.bus.emit('contactHail:request', { targetId: worker.id, source: 'test' }); const o = offers.at(-1);
    assert.ok(o?.firstIronHail, JSON.stringify({ o, identity: firstIronContactIdentity(s, worker), owned: s.player.ownedShips }));
    r.bus.emit('contactHail:choice', { requestId: o.requestId, targetId: worker.id, choice: 'route' });
    assert.ok(responses.at(-1)?.firstIronCourse, JSON.stringify(responses.at(-1)));
    console.log('FIRST_IRON_PRODUCTION', JSON.stringify({ worker: worker.data.worldRecordId,
      entities: s.entityList.length, dressing: s.world.dressing?.rows.length, course: responses.at(-1).firstIronCourse }));
  } finally { r.dispose(); restoreFeatureMaps(flags); }
});


test('older course response does not consume a newer offer; dormant iron advice is a position, not a fabricated live target', async () => {
  const f = fixture(); let mounted; try {
    mounted = await mountHails(f); const old = offer(f), oldReply = reply(f, old), courses = [];
    const newer = { ...offer(f), requestId: 'newer-first-iron' };
    f.bus.emit('contactHail:offer', old); f.bus.emit('contactHail:offer', newer);
    f.bus.on('ui:setCourse', c => courses.push(c));
    f.bus.emit('contactHail:response', oldReply); assert.equal(courses.length, 0);
    f.bus.emit('contactHail:response', reply(f, newer)); assert.equal(courses.length, 1);
    const dormant = { ...f.rock, id: 'field:first-iron', fieldResident: true, liveEntityId: null,
      pos: { ...f.rock.pos }, data: { ...f.rock.data } };
    f.sim.helpers.removeEntity(f.rock.id);
    f.state.world.asteroidField = { schema: 'spaceface.asteroidField.v1', rocks: [dormant] };
    const r = reply(f); assert.ok(r.firstIronCourse); assert.equal(r.firstIronCourse.targetEntityId, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(r)).firstIronCourse.pos, r.firstIronCourse.pos);
    const obstacle = { ...dormant, id: 'field:ice', pos: { ...r.firstIronCourse.pos }, radius: 100,
      data: { ...dormant.data, typeId: 'ast_ice' } };
    f.state.world.asteroidField.rocks.push(obstacle);
    const moved = firstIronWorkingPosition(f.state, f.worker);
    assert.ok(!moved || distance(moved.pos, r.firstIronCourse.pos) > 1);
  } finally { mounted?.close(); f.close(); }
});


test('published fallback cutter offers its actual shared face without stopping its work; other cuts remain optional', () => {
  const f = fixture(); try {
    f.worker.data.activityActorSlotId = 'helios_starter_cutter';
    f.worker.pos = {x:250,z:0}; f.worker.data.minerShiftRockId=f.rock.id;
    const job = f.state.npcJobs.byId[f.worker.data.jobId].job;
    job.phase='work'; job.progress=.2; f.worker.data.minerShiftActive=true;
    const before = JSON.stringify([f.state.npcJobs,f.worker,f.rock,f.state.missions,f.state.player.cargo]);
    const o=offer(f), r=reply(f,o);
    assert.ok(r.firstIronCourse.sharedFace); assert.equal(r.firstIronCourse.faceId,f.rock.id);
    assert.equal(r.firstIronCourse.faceGeneration,f.rock.occupantGeneration);
    assert.match(r.lines.join(' '),/Kessler.*lower my beam.*actually cut.*resume/);
    assert.equal(JSON.stringify([f.state.npcJobs,f.worker,f.rock,f.state.missions,f.state.player.cargo]),before);
    // A shared point is outside the live beam corridor, not on its worker-to-face centerline.
    assert.ok(Math.abs(r.firstIronCourse.pos.z)>f.player.radius+35);
    job.phase='return'; assert.equal(reply(f).firstIronCourse,undefined,'returning cutter must not invite a shared cut');
  } finally {f.close();}
});

test('the existing first ticket and tracked inner claim explain the optional ordinary Hail route', () => {
  const f=fixture();try{
    assert.match(f.mission.brief,/Kessler.*select the seam cutter.*Hail.*MARK FIRST IRON/);
    assert.match(f.mission.brief,/any Helios iron you cut counts.*keeps working if you pass by/);
  }finally{f.close();}
});


test('queued guidance rejects a depleted, replaced, shifted or obstructed working face', async () => {
  const changes=[f=>f.rock.data.oreHP=0,f=>f.rock.occupantGeneration++,f=>f.rock.pos.x+=20,
    (f,r)=>f.sim.spawn({type:'asteroid',pos:{...r.firstIronCourse.pos},radius:100,mass:1000,hull:100,
      data:{typeId:'ast_ice',oreHP:100}})];
  for(const change of changes){const f=fixture();let mounted;try{
    mounted=await mountHails(f);const o=offer(f),r=reply(f,o),courses=[];
    f.bus.emit('contactHail:offer',o);change(f,r);f.bus.on('ui:setCourse',c=>courses.push(c));
    f.bus.emit('contactHail:response',r);assert.equal(courses.length,0,String(change));
  }finally{mounted?.close();f.close();}}
});


test('first-iron directions neither arm nor refresh the 180-second claim, and physical bonus pickups remain single-use', () => {
  for(const phase of ['early','open','expired']){
    const f=fixture({withMining:true});try{
      const d=HELIOS_CLAIM_OPENING,s=f.state;
      f.player.pos={x:200,z:0};f.worker.pos={x:250,z:0};
      f.player.data.miningBeam={...s.player.miningBeam,directToCargo:false};
      Object.assign(f.rock.data,{fieldId:d.fieldId,activityObjectSlotId:d.slotId,oreHP:10,oreHPMax:10,yieldU:2});
      f.rock.hull=f.rock.hullMax=10;f.worker.data.minerShiftRockId=f.rock.id;
      s.npcJobs.byId[f.worker.data.jobId].job.phase='work';
      const owner={state:s,bus:f.bus,_ceresCausal:{seeds:{claim_staked:phase!=='early'}}};
      const claim=()=>stepHeliosClaimOpening(owner,()=>f.rock);
      const read=()=>richSeamOpportunityReadout(s,d.fieldId,d.slotId);
      if(phase!=='early'){assert.equal(claim().expiresAtT,180);}
      if(phase==='expired'){s.simTime=181;expireRichSeamOpportunities(s);assert.equal(read().state,'missed');}
      const before=JSON.stringify(s.fieldDepletion),route=reply(f);
      assert.ok(route.firstIronCourse.sharedFace);assert.equal(JSON.stringify(s.fieldDepletion),before);
      const cutter=f.sim.registry.get('mining');
      cutter.applyMining(f.rock.id,10000,1,f.player.id);
      const bonus=s.entityList.filter(e=>e.alive&&e.type==='pickup'&&e.data?.richLotSource)
        .reduce((n,e)=>n+e.data.richLotSource.richQty,0);
      console.log('CLAIM_CONTACT',JSON.stringify({phase,record:read(),ore:f.rock.data.oreHP,alive:f.rock.alive,pickups:s.entityList.filter(e=>e.type==='pickup').map(e=>e.data),cargo:s.player.cargo.items}));
      assert.equal(bonus,phase==='open'?8:0,'only the still-open original face releases eight real bonus units');
      const terminal=read();assert.equal(terminal?.state,phase==='early'?undefined:phase==='open'?'worked':'missed');
      const depletionOwner={...fieldDepletion,state:s};
      const saved=JSON.parse(JSON.stringify(depletionOwner.serialize()));
      depletionOwner.deserialize(saved);
      owner._ceresCausal.seeds.claim_staked=true;s.simTime=500;
      claim();firstIronWorkingPosition(s,f.worker);
      assert.deepEqual(read(),terminal,'late contact and owner restore never create another opportunity');
      const pickupUnits=s.entityList.filter(e=>e.alive&&e.type==='pickup').reduce((n,e)=>n+(e.data.amount||0),0);
      cutter.applyMining(f.rock.id,10000,1,f.player.id);
      assert.equal(s.entityList.filter(e=>e.alive&&e.type==='pickup').reduce((n,e)=>n+(e.data.amount||0),0),pickupUnits);
      for(const pickup of [...s.entityList].filter(e=>e.alive&&e.type==='pickup')){
        f.player.pos={...pickup.pos};cutter._updatePickups(1/60,s);
      }
      const held=JSON.stringify(s.player.cargo.items);cutter._updatePickups(1/60,s);
      assert.equal(JSON.stringify(s.player.cargo.items),held,'collecting again does not duplicate units');
      assert.ok(Object.values(s.player.cargo.items).reduce((n,v)=>n+v,0)>0);
    }finally{f.close();}
  }
});
