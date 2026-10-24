// Focused native-physics proof, not production-manifest or player-journey evidence.
// Only initial spawn assigns poses/velocities; subsequent movement belongs to Rapier.
// Radius-2 synthetic carriers isolate authority, not actual MTS hull clearance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarTick } from '../src/core/catchupPolicy.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { runtime } from '../src/data/encounters/357-the-handoff.js';

async function boot(passing) {
  const sim = createSimulation({ seed: 357, systems: [flightV3, physics] });
  const { state } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  Object.assign(state.input, { moveX: 0, moveZ: 0, turnIntent: 0, brake: !passing,
    boost: false, fire: false, assistMode: 'drift' });
  const ship = (x, z, vx = 0) => sim.spawn({ type: 'ship', team: 0,
    pos: { x, z }, vel: { x: vx, z: 0 }, rot: 0, angVel: 0,
    radius: 2, mass: 100, hull: 100, hullMax: 100, collides: true,
    physicsBody: { mass: 100, radius: 2, dynamic: true },
    data: { intent: {}, ai: {} } });
  const seller = ship(32, 0), buyer = ship(-32, 0);
  const player = ship(passing ? -138 : 132, 80, passing ? 60 : 0);
  state.playerId = player.id;
  const events = [], pods = [], received = [], observations = [], contacts = new Map(), initial = new Map();
  sim.bus.on('physics:impact', p => { const key=[p.aId,p.bId].sort().join(':');
    const row=contacts.get(key)||{a:p.aId,b:p.bId,count:0,first:state.simTime,last:0};
    row.count++;row.last=state.simTime;contacts.set(key,row); });
  const live = { id: 'native_handoff', shape: {}, ids: [seller.id, buyer.id], roles: {}, data: {},
    plan: { zoneCenter: { x: 0, z: 0 }, ships: [{ role: 'hauler', pos: {} }, { role: 'raider', pos: {} }] } };
  const d = { now: () => state.simTime, stream: () => () => .5,
    spawnShips: () => live.ids, aliveCount: () => 1,
    entsOf: (_, role) => [role === 'hauler' ? seller : buyer],
    spawnCargoPod: (_, spec) => { const p = spawnJettisonedCargoPod(state, spec, sim.helpers); pods.push(p); return p; },
    say() {}, emit: (name, p) => events.push({ name, ...p }),
    rep: (faction, delta) => events.push({ name: 'rep', faction, delta }),
    grant: (amount, reason) => events.push({ name: 'grant', amount, reason }),
    player: () => player,
    resolve: (_, outcome) => { live.outcome = outcome; live.phase = 'done'; } };
  runtime.fire(d, live, state);
  for (const e of [player, seller, buyer, ...pods]) initial.set(e.id, { ...e.pos });
  const phys = sim.registry.get('physics');
  assert.equal(await phys.prepareBackend(state), true);
  // Natural director update pumps new encounters before ticking live scripts in that pass.
  const observe = () => { observations.push(state.simTime); runtime.tick(d, live, state, state.simTime); };
  observe();
  let lastCalendarNow = 0, accumulated = 0;
  const advance = () => {
    sim.step(1 / 60);
    // Observe native publication before runtime can overwrite projected velocity again.
    for (const r of received) if (r.native.length < 6) {
      const p = state.entities.get(r.id);
      r.native.push({ t: state.simTime, x: p.pos.x, z: p.pos.z,
        relativeSpeed: Math.hypot(p.vel.x-buyer.vel.x,p.vel.z-buyer.vel.z),
        relativeDisplacement: Math.hypot((p.pos.x-buyer.pos.x)-r.rx,(p.pos.z-buyer.pos.z)-r.rz) });
    }
    const before = new Set(pods.filter(p => p.data.deliveredBy).map(p => p.id));
    if (isCalendarTick(state, 'encounterDirector')) {
      accumulated += Math.max(0, state.simTime-lastCalendarNow); lastCalendarNow=state.simTime;
      if (accumulated >= 1) { accumulated=0; observe(); }
    }
    for (const p of pods) if (p.data.deliveredBy && !before.has(p.id)) received.push({ id: p.id,
      t: state.simTime, distance: Math.hypot(p.pos.x-buyer.pos.x,p.pos.z-buyer.pos.z),
      rx: p.pos.x-buyer.pos.x, rz: p.pos.z-buyer.pos.z, native: [] });
  };
  return { sim, state, seller, buyer, player, events, pods, received, initial, live, advance, observations, contacts,
    close() { phys._disableSg02DynamicAuthority(); sim.dispose(); } };
}
const reward = h => h.events.filter(e => e.name === 'grant' || e.name === 'rep');
const speed = e => Math.hypot(e.vel.x, e.vel.z);

for (const passing of [true, false]) test(`native ${passing ? 'fly-through rejects custody' : 'settled hold bonds original cargo'} and native pod motion`, { timeout: 45000 }, async t => {
  const h = await boot(passing);
  try {
    let insideFast = 0, contiguousHold = 0, longestHold = 0, bondAt = null, bondPose = null;
    let directedDisplacement = null, deadlineObservedAt = null, dwellStart = h.live.data.parleySince;
    const snapshots = [];
    const snapshot = kind => ({ kind, time: h.state.simTime, outcome: h.live.outcome || null,
      bodies: [h.player,h.seller,h.buyer,...h.pods].map(e=>({ id:e.id, role:e===h.player?'player':e===h.seller?'seller':e===h.buyer?'buyer':'pod',
        x:e.pos.x,z:e.pos.z,ownerId:e.data?.ownerId??null,alive:e.alive!==false })) });
    let terminalCaptured = false;
    for (let i = 0; i < 6900; i++) {
      h.advance();
      if (h.live.data.parleySince != null) dwellStart = h.live.data.parleySince;
      if (deadlineObservedAt === null && h.observations.at(-1) >= h.live.deadlineAt) deadlineObservedAt=h.state.simTime;
      const relative = Math.hypot(h.player.vel.x-h.seller.vel.x, h.player.vel.z-h.seller.vel.z);
      const inside = Math.hypot(h.player.pos.x-h.seller.pos.x,h.player.pos.z-h.seller.pos.z) <= 210;
      if (inside && relative > 6.4) insideFast++;
      contiguousHold = inside && relative <= 6.4 ? contiguousHold+1 : 0;
      longestHold = Math.max(longestHold, contiguousHold);
      if (h.live.data.custodyCommit && bondAt === null) {
        bondAt = h.state.simTime;
        snapshots.push(snapshot('acceptance'));
        assert.notEqual(h.live.phase, 'done', 'player bond does not terminate NPC trade');
        assert.equal(h.live.ids.length, 2, 'original cast remains live');
        assert.ok(!h.seller.data.ai.forceFlee && !h.buyer.data.ai.forceFlee);
        const p = h.pods.find(p => p.id === h.live.data.custodyCommit.podId);
        bondPose = { x: p.pos.x, z: p.pos.z, toX: h.player.pos.x-p.pos.x, toZ: h.player.pos.z-p.pos.z };
      }
      if (bondPose && directedDisplacement === null && h.state.simTime-bondAt >= 2) {
        const p=h.pods.find(p=>p.id===h.live.data.custodyCommit.podId);
        directedDisplacement=((p.pos.x-bondPose.x)*bondPose.toX+(p.pos.z-bondPose.z)*bondPose.toZ)/Math.hypot(bondPose.toX,bondPose.toZ);
      }
      if (!terminalCaptured && h.live.phase === 'done') { terminalCaptured = true; snapshots.push(snapshot('terminal_receipt')); }
      if (deadlineObservedAt !== null && h.state.simTime-deadlineObservedAt >= .11) break;
    }
    const bonded = h.pods.filter(p => p.data.ownerId === h.player.id);
    const native = h.state.physicsRuntime.diagnostics.backend;
    const detail = { native, passing, snapshots, time: h.state.simTime, insideFast, longestHold, bondAt,
      outcome: h.live.outcome, observations:h.observations, dwellStart, deadlineObservedAt,
      contacts:[...h.contacts.values()], remaining:h.pods.filter(p=>p.data.ownerId===h.seller.id).map(p=>p.id),
      bondPose, directedDisplacement, player: { pos: h.player.pos, speed: speed(h.player) },
      received: h.received, rewards: reward(h), pods: h.pods.map(p => ({ id: p.id,
        pos: p.pos, speed: speed(p), owner: p.data.ownerId, displacement:
        Math.hypot(p.pos.x-h.initial.get(p.id).x,p.pos.z-h.initial.get(p.id).z) })) };
    t.diagnostic(JSON.stringify(detail));
    assert.equal(native, 'rapier-dynamic');
    assert.equal(h.pods.length, 4);
    assert.ok(h.pods.every(p => h.state.entities.get(p.id) === p && p.physicsBody && [p.pos.x,p.pos.z,p.vel.x,p.vel.z].every(Number.isFinite)), 'original physical bodies remain');
    assert.ok(h.pods.some(p => Math.hypot(p.pos.x-h.initial.get(p.id).x,p.pos.z-h.initial.get(p.id).z)>10), 'native pods move');
    assert.ok(h.received.length > 0, 'buyer physically receives original cargo');
    assert.ok(h.received.every(r => r.distance <= 26));
    if (passing) {
      assert.ok(insideFast >= 360, 'at least six actual native seconds pass inside ring above hold speed');
      assert.ok(h.player.pos.x-h.initial.get(h.player.id).x > 500, 'native player traverses the lane');
      assert.equal(bonded.length, 0); assert.deepEqual(reward(h), []);
      assert.equal(h.live.outcome, 'deal_done');
      assert.equal(h.received.length, 4);
      assert.ok(h.pods.every(p => p.data.ownerId === h.buyer.id));
    } else {
      assert.ok(longestHold >= 360); assert.ok(bondAt-dwellStart >= 6);
      assert.ok(h.observations.filter(t=>t>=dwellStart&&t<=bondAt).every((t,i,a)=>i===0||t-a[i-1]<=2));
      assert.equal(h.live.outcome, 'contact_made'); assert.equal(bonded.length, 1);
      assert.equal(h.received.length, 3, 'all remaining original pods physically received');
      assert.equal(h.pods.filter(p=>p.data.ownerId===h.seller.id).length, 0);
      assert.ok(h.received.some(r=>r.t>bondAt), 'NPC receipt continues after player bond');
      assert.ok(h.pods.filter(p=>p!==bonded[0]).every(p=>p.data.ownerId===h.buyer.id));
      assert.equal(h.live.ids.length, 0, 'cast released only at terminal outcome');
      assert.equal(bonded[0].id, h.live.data.custodyCommit.podId);
      assert.equal(bonded[0].data.amount, 2);
      assert.deepEqual(reward(h), [{name:'rep',faction:'faction_quiet',delta:2},
        {name:'grant',amount:60,reason:'handoff:quiet_lay'}]);
      assert.ok(directedDisplacement > 5, 'accepted native pod travels toward player during first two seconds after shove');
    }
    assert.equal(h.received[0]?.native.length, 6, 'observe six native ticks after first collision-free receipt');
    assert.ok(h.received[0].native.every(n => n.relativeSpeed < .05 && n.relativeDisplacement < .02),
      'received native pods match buyer velocity and park immediately after next-tick command consumption, before collisions');
  } finally { h.close(); }
});
