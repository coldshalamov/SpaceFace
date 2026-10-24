// The Candle Relighting — the starter sector's guaranteed first-hour wonder. The Fleet's
// tender column forms up behind the player's frame, walks the memorial bearing, and resolves
// at the Fleet; a pilot who follows gets the dark plinth's invitation (the landmark quest's
// reason to come back with a scanner). Focused director harness, eighth-bell pattern.
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { encounterDirector, planEncountersDay } from '../src/systems/encounterDirector.js';
import { runtime as candleRuntime } from '../src/data/encounters/585-candle-relighting.js';

const SECTOR = 'sector_helios_prime';
const SHAPE = 'candle_relighting';
const MEMORIAL_LOCAL = Object.freeze({ x: 1680, z: -820 });
// The production walk (~2,000 WU at the cruise pace, plus nav give) must finish well inside
// the 300 s authored deadline; the proof window sits under it.
const WALK_PROOF_S = 200;

function memorialGlobal() {
  const origin = sectorGlobalOrigin(SECTOR);
  return { x: origin.x + MEMORIAL_LOCAL.x, z: origin.z + MEMORIAL_LOCAL.z };
}

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function force(t, suffix, anchor = { x: 0, z: 0 }) {
  t.state.world.currentSectorId = SECTOR;
  const encounterId = `debug:relight:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE,
    encounterId,
    sectorId: SECTOR,
    anchor,
    force: true,
    data: {},
  });
  assert.equal(result.ok, true, `${SHAPE}/${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

function live(t, encounterId) {
  return t.state.encounterDirector.live[encounterId];
}

function collect(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

test('the relighting is authored day-0 content inside its window, and only in Helios', () => {
  const shape = ENCOUNTERS[SHAPE];
  assert.ok(shape, 'catalog must contain the encounter');
  assert.equal(shape.earlyWindowGuaranteeDay, 0);
  assert.deepEqual([...shape.earlyDelayS], [540, 810]);
  const zones = zonesForSector(SECTOR);
  // Planner contract: the day-0 guarantee never lands later than its authored window. An
  // organic ambient pick of the shape may ride earlier (the splice only clamps late organic
  // delays), so the upper bound is the hard promise; the pinned lower bound must also occur
  // across seeds for the days the organic deck draws something else.
  const delays = [];
  for (let seed = 4242; seed < 4262; seed++) {
    const planned = planEncountersDay(seed, SECTOR, 0, zones, null, { [shape.id]: shape })
      .find((row) => row.shapeId === shape.id);
    assert.ok(planned, `day 0 must guarantee the relighting (seed ${seed})`);
    assert.ok(planned.delay <= 810,
      `guaranteed onset ${planned.delay} must not pass the authored window (seed ${seed})`);
    delays.push(planned.delay);
  }
  assert.ok(delays.some((delay) => delay >= 540),
    'the authored early window must pin onsets when the organic deck misses the shape');
  for (const day of [0, 1, 2]) {
    const rows = planEncountersDay(4242, 'sector_ceres_belt', day,
      zonesForSector('sector_ceres_belt'), null, { [shape.id]: shape });
    assert.equal(rows.find((row) => row.shapeId === shape.id), undefined,
      `the relighting must not plan outside Helios (day ${day})`);
  }
});

test('firing forms the tender column behind the frame, walking the memorial bearing', () => {
  const t = boot();
  const voices = collect(t, ['encounter:voice']);
  const id = force(t, 'cast');
  const rec = live(t, id);
  assert.equal(rec.ids.length, 5, 'lead + four lamps');
  assert.equal(rec.phase, 'walk');
  const ents = rec.ids.map((entId) => t.state.entities.get(entId));
  const lead = t.state.entities.get(rec.data.leadId);
  assert.ok(lead && lead.pos, 'the lead tender exists');
  const memorial = memorialGlobal();
  for (const ent of ents) {
    assert.equal(ent.data.ai.passive, true, 'tenders are working pilots, not combatants');
    assert.equal(ent.data.ai.roe, 'hold_fire');
    assert.equal(ent.data.ai.spawnContext, 'convoy_civilian');
    assert.equal(ent.data.ai.activity.reason, 'encounter:candle_relighting');
    assert.equal(ent.data.intent.fire, false);
  }
  // Every hull starts behind the fire anchor relative to the memorial bearing, lead furthest
  // along, and nobody spawns on top of the player.
  const toMemorial = (pos) => Math.hypot(memorial.x - pos.x, memorial.z - pos.z);
  const anchor = rec.anchor;
  assert.ok(toMemorial(lead.pos) < toMemorial(anchor), 'the column leads toward the Fleet');
  const sorted = ents.map((ent) => toMemorial(ent.pos)).sort((a, b) => a - b);
  assert.ok(sorted[0] < sorted[sorted.length - 1], 'the lamps trail in a stagger');
  assert.equal(voices.filter((row) => row.payload.primary).length, 1,
    'exactly one primary line on entry (one-voice law)');
});

function placeOnMarks(t, rec, count = 5) {
  for (const mark of rec.data.workMarks.slice(0, count)) {
    const ship = t.state.entities.get(mark.id);
    ship.pos.x = mark.x; ship.pos.z = mark.z;
    ship.vel = { x: 0, z: 0 };
  }
}
function tickAt(t, rec, now) { candleRuntime.tick(t.director, rec, t.state, now); }
function receipt(t) { return t.state.encounterDirector.receipts.at(-1); }

test('individual marks clear the memorial and each original live hull bound', () => {
  const t = boot(); const id = force(t, 'marks'); const rec = live(t, id);
  const memorial = memorialGlobal();
  for (const mark of rec.data.workMarks) {
    const ship = t.state.entities.get(mark.id);
    assert.ok(Math.hypot(mark.x - memorial.x, mark.z - memorial.z) > 100 + ship.radius + 36);
    assert.deepEqual(ship.data.ai.activity.anchor, { x: mark.x, z: mark.z });
    assert.deepEqual(ship.data.ai.activity.anchorVelocity, { x: 0, z: 0 });
    for (const other of rec.data.workMarks) if (other.id !== mark.id) {
      assert.ok(Math.hypot(mark.x-other.x, mark.z-other.z) > ship.radius
        + t.state.entities.get(other.id).radius + 72);
    }
  }
});

test('coincident and near-coincident anchors retain separated safe work marks', () => {
  for (const offset of [0,0.001]) {
    const t=boot(); const memorial=memorialGlobal();
    const id=force(t,'coincident'+offset,{x:memorial.x+offset,z:memorial.z});
    const rec=live(t,id);
    for(const mark of rec.data.workMarks) {
      const ship=t.state.entities.get(mark.id);
      assert.ok(Math.hypot(mark.x-memorial.x,mark.z-memorial.z)>100+ship.radius+36);
      for(const other of rec.data.workMarks) if(other.id!==mark.id)
        assert.ok(Math.hypot(mark.x-other.x,mark.z-other.z)>ship.radius+t.state.entities.get(other.id).radius+72);
    }
  }
});

test('lead-only arrival cannot finish the watch or stop its trailing lamps', () => {
  const t = boot(); const id = force(t, 'lead'); const rec = live(t, id);
  placeOnMarks(t, rec, 1); tickAt(t, rec, 1); tickAt(t, rec, 20);
  assert.ok(live(t,id)); assert.equal(receipt(t), undefined);
  assert.equal(rec.phase, 'walk');
  for (const mark of rec.data.workMarks.slice(1)) {
    const ship=t.state.entities.get(mark.id);
    assert.notDeepEqual(ship.data.ai.activity.anchor,ship.pos);
  }
});

test('late lamps and motion reset the uninterrupted eight-second service', () => {
  const t = boot(); const id = force(t,'late'); const rec=live(t,id);
  placeOnMarks(t,rec,4); tickAt(t,rec,10); tickAt(t,rec,30);
  assert.equal(rec.data.serviceStartedAt,undefined);
  placeOnMarks(t,rec); tickAt(t,rec,31); tickAt(t,rec,38.9);
  assert.ok(live(t,id));
  const ship=t.state.entities.get(rec.data.workMarks[4].id); ship.vel.x=5;
  tickAt(t,rec,39); assert.equal(rec.data.serviceStartedAt,undefined);
  ship.vel.x=0; tickAt(t,rec,40); tickAt(t,rec,47.9); assert.ok(live(t,id));
  tickAt(t,rec,48); assert.equal(receipt(t).outcome,'relit');
});

test('a follower witnesses only the completed service and resolution is once-only', () => {
  const t=boot(); const id=force(t,'witness'); const rec=live(t,id);
  placeOnMarks(t,rec); Object.assign(t.state.entities.get(t.state.playerId).pos,memorialGlobal());
  const events=collect(t,['encounter:resolved','encounter:receipt']);
  tickAt(t,rec,1); tickAt(t,rec,9);
  assert.equal(receipt(t).outcome,'witnessed');
  assert.match(receipt(t).text,/Twenty-four tended/);
  assert.match(receipt(t).text,/scanner/);
  tickAt(t,rec,10);
  assert.equal(events.filter(x=>x.name==='encounter:resolved').length,1);
  assert.equal(events.filter(x=>x.name==='encounter:receipt').length,1);
});

test('missing original tender interrupts rather than promoting a survivor to success', () => {
  for(const missing of [1,5]) {
    const t=boot(); const id=force(t,'missing'+missing); const rec=live(t,id);
    placeOnMarks(t,rec);
    for(const mark of rec.data.workMarks.slice(0,missing)) t.state.entities.get(mark.id).alive=false;
    tickAt(t,rec,1);
    assert.equal(receipt(t).outcome,missing===5?'lost':'interrupted');
    assert.doesNotMatch(receipt(t).text,/Twenty-four tended|completed its watch/);
  }
});

test('recycled entity id cannot replace an original tender or receive its work intent', () => {
  const t=boot();const id=force(t,'recycled');const rec=live(t,id);
  placeOnMarks(t,rec);
  const old=t.state.entities.get(rec.data.workMarks[1].id);
  const replacement={...old,data:{ai:{activity:{kind:'loiter',reason:'foreign'}}}};
  t.state.entities.set(old.id,replacement);
  tickAt(t,rec,1);
  assert.equal(receipt(t).outcome,'interrupted');
  assert.equal(replacement.data.ai.activity.reason,'foreign');
  assert.equal(replacement.data.despawnAt,undefined,'director must not retire a recycled replacement');
  assert.equal(t.state.encounterDirector.squadMembership[old.id],undefined);
});

test('a coarse tick cannot finish a service whose eight seconds cross the deadline', () => {
  const t=boot();const id=force(t,'late-tick');const rec=live(t,id);
  placeOnMarks(t,rec);rec.deadlineAt=300;tickAt(t,rec,295);tickAt(t,rec,303);
  assert.equal(receipt(t).outcome,'partial');
});

test('deadline records partial or delayed work without promising a relighting', () => {
  for(const count of [0,4,5]) {
    const t=boot(); const id=force(t,'deadline'+count); const rec=live(t,id);
    placeOnMarks(t,rec,count); rec.deadlineAt=10; tickAt(t,rec,10);
    assert.equal(receipt(t).outcome,count?'partial':'walked_on');
    assert.doesNotMatch(receipt(t).text,/will be lit|Twenty-four tended|completed its watch/);
  }
});

test('completed receipt survives sector departure and the actual save director subset', async () => {
  const {save: saveSystem}=await import('../src/save/saveSystem.js');
  const t=boot(); const id=force(t,'saved'); const rec=live(t,id);
  placeOnMarks(t,rec); tickAt(t,rec,1); tickAt(t,rec,9);
  const original=structuredClone(receipt(t));
  t.state.world.currentSectorId='sector_ceres_belt';
  const snapshot=saveSystem._serializeEncounterDirector.call({state:t.state});
  assert.equal(Object.hasOwn(snapshot,'live'),false,'no claim of live encounter restoration');
  const continued=boot();
  Object.assign(continued.state.encounterDirector,JSON.parse(JSON.stringify(snapshot)));
  continued.state.world.currentSectorId=SECTOR;
  assert.deepEqual(receipt(continued),original);
  assert.equal(Object.keys(continued.state.encounterDirector.live).length,0);
});

// Production path: with the full AI/tactical-navigation stack live, the column must actually
// fly the bearing and close on the Fleet — intent writes are not the deliverable, the walk is.
test('production path: the tender column really walks to the Fleet', { timeout: 300_000 }, async () => {
  const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
  const { makeShipEntitySpec, fittingsFromDefaultModules } = await import('../src/systems/ships.js');
  const { NEW_GAME } = await import('../src/data/newGameDefaults.js');
  os.setPriority?.(os.constants.priority.PRIORITY_LOW);
  const origin = sectorGlobalOrigin(SECTOR);
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  try {
    const { state, bus } = runtime;
    state.mode = 'flight';
    state.settings.gameplay.tutorialHints = false;
    runtime.getSystem('ships').newGame();
    state.playerId = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
      pos: { x: origin.x, z: origin.z }, rot: 0,
    })).id;
    runtime.getSystem('world').newGame();
    runtime.getSystem('economy').newGame();
    runtime.getSystem('world').enterSector(NEW_GAME.startingSectorId, {});
    bus.emit('game:started', {});
    await runtime.getSystem('physics').prepareBackend(state, { reset: true });

    const director = runtime.getSystem('encounterDirector');
    const endings=[]; bus.on('encounter:resolved',p=>{if(p.shape===SHAPE)endings.push(p);});
    const killed=[]; bus.on('entity:killed',p=>killed.push(p));
    const fired = director.requestAuthoredEncounter({
      shapeId: SHAPE,
      encounterId: 'debug:relight:realpath',
      sectorId: SECTOR,
      anchor: { x: origin.x + 200, z: origin.z },
      force: true,
      data: {},
    });
    assert.equal(fired.ok, true, JSON.stringify(fired));
    const rec = state.encounterDirector.live['debug:relight:realpath'];
    assert.ok(rec, 'the forced relighting is live');
    const memorial = memorialGlobal();
    const leadOf = () => state.entities.get(rec.data.leadId);
    const distTo = (pos) => Math.hypot(memorial.x - pos.x, memorial.z - pos.z);
    const trajectory=[];
    let settledTicks = 0;
    let longestSettledTicks = 0;
    let closed = false;
    let resolved = false;
    for (let second = 0; second < WALK_PROOF_S && !resolved; second++) {
      const before = leadOf()?.pos ? distTo(leadOf().pos) : Infinity;
      // Use the ordinary local-course input. Only the player flies after the convoy;
      // no tender pose, velocity, residency flag or native body is moved by the fixture.
      for(let tick=0;tick<60;tick++) {
        const player=state.entities.get(state.playerId); const lead=leadOf();
        Object.assign(state.input,{moveX:0,moveZ:0,turnIntent:0,brake:false,boost:false});
        if(lead?.pos && player?.pos && !state.nav.autopilot?.active
          && Math.hypot(lead.pos.x-player.pos.x,lead.pos.z-player.pos.z)>300)
          bus.emit('ui:setCourse',{pos:{x:lead.pos.x,z:lead.pos.z},targetEntityId:lead.id,arrivalRadius:180,label:'Follow Fleet tenders'});
        runtime.runTicks(1,1/60);
        const allWorking = rec.data.workMarks.every(mark => {
          const ship = state.entities.get(mark.id);
          return ship?.hull > 0 && Math.hypot(ship.pos.x-mark.x,ship.pos.z-mark.z) <= 36
            && Math.hypot(ship.vel.x,ship.vel.z) <= 4;
        });
        settledTicks = allWorking ? settledTicks + 1 : 0;
        longestSettledTicks = Math.max(longestSettledTicks, settledTicks);
      }
      const lead = leadOf();
      if(second%20===0 || rec.phase==='service') trajectory.push({t:state.simTime,phase:rec.phase,
        work:rec.data.workMarks.map(m=>{const e=state.entities.get(m.id);return e?[
          Number(Math.hypot(e.pos.x-m.x,e.pos.z-m.z).toFixed(2)),
          Number(Math.hypot(e.vel.x,e.vel.z).toFixed(2)),e.hull]:null;})});
      if (lead?.pos && distTo(lead.pos) < before - 20) closed = true;
      if (!state.encounterDirector.live['debug:relight:realpath']) resolved = true;
    }
    assert.ok(closed, `the lead must close on the Fleet within ${WALK_PROOF_S}s of production ticks`);
    assert.ok(resolved, JSON.stringify({reason:'column did not complete',phase:rec.phase,marks:rec.data.workMarks.map(m=>({mark:m,pos:state.entities.get(m.id)?.pos,vel:state.entities.get(m.id)?.vel,hull:state.entities.get(m.id)?.hull}))}));
    const receipt = state.encounterDirector.receipts.find(row => row.shape === SHAPE);
    assert.ok(receipt, JSON.stringify({reason:'actual director saved its receipt',endings,phase:rec.phase,data:rec.data,marks:rec.data.workMarks?.map(m=>({mark:m,ship:state.entities.get(m.id)?.pos,velocity:state.entities.get(m.id)?.vel}))}));
    assert.ok(['relit','witnessed'].includes(receipt.outcome), JSON.stringify({receipt,endings,killed,trajectory}));
    assert.ok(longestSettledTicks >= 480, `all five maintain the work envelope for eight native seconds: ${longestSettledTicks} ticks`);
    assert.ok(Math.hypot(state.entities.get(state.playerId).pos.x-origin.x,
      state.entities.get(state.playerId).pos.z-origin.z)>500,'the player followed through ordinary course/native motion');
    if(process.env.SPACEFACE_CANDLE_TRACE==='1') console.log('CANDLE_NATIVE_TRACE '+JSON.stringify({receipt,longestSettledTicks,trajectory}));
  } finally {
    runtime.dispose();
  }
});
