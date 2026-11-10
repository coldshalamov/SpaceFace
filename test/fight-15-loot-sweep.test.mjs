import assert from 'node:assert/strict';
import test from 'node:test';

// FIGHT-15 — clearing a raid's escort wing flips the survivors to looting the spill.
// The live record + kill path run through the real encounterDirector; the sweep rule itself
// lives in src/ai/lootSweep.js and steers each survivor's doctrine through the ordinary
// setEntityDoctrine seam. The take is booked onto ai.stolenLoot, the durable custody ledger
// ambient pressure-shed and kill-respill already own.

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { looseSweepPod, sweepStaleLootSweeps } from '../src/ai/lootSweep.js';

function boot(seed = 4242) {
  const voices = [];
  const sim = createSimulation({
    seed,
    systems: [encounterDirector],
    helpers: { voice: { say(payload) { voices.push(payload); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200,
  });
  state.playerId = player.id;
  return { sim, state, bus, player, voices };
}

function spawnRaider(sim, pos, name = 'Reach Cutter') {
  return sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x: pos.x, z: pos.z }, hull: 80, hullMax: 100, mass: 80, radius: 10,
    data: {
      name,
      ai: { archetype: 'pirate_raider', fsm: 'attack', passive: false, roe: 'weapons_free' },
      intent: { fire: false, fireGroup: null, moveX: 0, moveZ: 0 },
      combat: { targetId: null, lockTarget: null },
    },
  });
}

function spawnPod(sim, pos, spec = {}) {
  return sim.spawn({
    type: 'payload', pos: { x: pos.x, z: pos.z }, radius: 6,
    data: {
      kind: 'cargo', commodityId: 'cmdty_alloys', amount: 7,
      jettisonedCargo: true, ownerId: 'civilian_hauler_1', ...spec,
    },
  });
}

// A live record the way the director's own spawners leave it: ids + roles + a phase.
function bindLive(t, members, roles, id = 'live_fight15') {
  const live = {
    id, shapeId: id, script: 'namedHunter',
    ids: members.map((m) => m.id), roles: { ...roles },
    data: {}, phase: 'active', sectorId: 'sector_tethys_junction',
    deadlineAt: t.state.simTime + 300,
  };
  t.state.encounterDirector.live[id] = live;
  return live;
}

function kill(t, ent) {
  ent.alive = false;
  t.bus.emit('entity:killed', {
    id: ent.id, killerId: t.player.id, pos: { x: ent.pos.x, z: ent.pos.z }, entity: ent,
  });
}

test('seed 4242: killing the last escort flips surviving raiders onto the loose spill', () => {
  const t = boot();
  const e1 = spawnRaider(t.sim, { x: 500, z: 0 }, 'Screen One');
  const e2 = spawnRaider(t.sim, { x: 540, z: 40 }, 'Screen Two');
  const r1 = spawnRaider(t.sim, { x: 600, z: 60 });
  const r2 = spawnRaider(t.sim, { x: 620, z: 90 });
  const pod = spawnPod(t.sim, { x: 700, z: 80 });
  const events = { dispatched: [], collected: [], ended: [] };
  for (const [evt, key] of [
    ['encounter:lootSweepDispatched', 'dispatched'],
    ['encounter:lootSweepCollected', 'collected'],
    ['encounter:lootSweepEnded', 'ended'],
  ]) t.bus.on(evt, (p) => events[key].push(p));
  bindLive(t, [e1, e2, r1, r2], {
    [e1.id]: 'escort', [e2.id]: 'escort', [r1.id]: 'raider', [r2.id]: 'raider',
  });

  kill(t, e1);
  assert.equal(r1.data.ai.lootSweep, undefined, 'one living escort holds the screen');
  assert.equal(events.dispatched.length, 0);

  kill(t, e2);
  const stamped = [r1, r2].filter((r) => r.data.ai.lootSweep);
  assert.equal(stamped.length, 2, 'both survivors peel off the dead screen');
  // One pod, one claim: a second hull does not contest the same freight — it holds the
  // scan loiter for the next piece of spill.
  const seeker = [r1, r2].find((r) => r.data.ai.activity.reason === 'loot_sweep:seek');
  const scanner = [r1, r2].find((r) => r.data.ai.activity.reason === 'loot_sweep:scan');
  assert.ok(seeker, 'one survivor runs the pod transit');
  assert.equal(seeker.data.ai.activity.kind, 'transit');
  assert.equal(seeker.data.ai.activity.targetId, pod.id, 'the nearest loose pod is the anchor');
  assert.equal(seeker.data.ai.roe, 'hold_fire');
  assert.ok(scanner, 'the other holds the spill-field scan');
  assert.equal(scanner.data.ai.activity.kind, 'loiter');
  assert.equal(events.dispatched.length, 2);
  assert.ok(t.voices.some((v) => v.kind === 'lootSweep'), 'a peel bark names the move');

  // Physical contact is the collection seam: the pickup:collected receipt books the take.
  const p = { pickupId: pod.id, collectorId: seeker.id, kind: 'cargo', commodityId: 'cmdty_alloys', amount: 7 };
  t.bus.emit('pickup:collected', p);
  assert.equal(p.acceptedAmount, 7, 'the sweep writes the acceptance receipt');
  assert.deepEqual(seeker.data.ai.stolenLoot.lines, [{ commodityId: 'cmdty_alloys', qty: 7 }],
    'the take lands in the durable stolenLoot ledger');
  assert.equal(seeker.data.ai.activity.kind, 'flee', 'a loaded sweeper runs the leave leg');
  assert.equal(seeker.data.ai.activity.reason, 'loot_sweep:leave');
  assert.equal(events.collected.length, 1);
  console.log('seed=4242 sweep=2 dispatched pod=1 collected=7u leave=flee');
});

test('seed 4242: freight custody pods stay with the custody script — sweepers keep loose spill', () => {
  const t = boot();
  const e1 = spawnRaider(t.sim, { x: 500, z: 0 });
  const r1 = spawnRaider(t.sim, { x: 600, z: 60 });
  // A custody pod nearer than the loose one must not be the sweep's target.
  spawnPod(t.sim, { x: 610, z: 60 }, { freightCustodyPod: { ownerId: 'haul_1' } });
  const loose = spawnPod(t.sim, { x: 900, z: 200 });
  bindLive(t, [e1, r1], { [e1.id]: 'escort', [r1.id]: 'raider' }, 'live_fight15_custody');

  kill(t, e1);
  const ai = r1.data.ai;
  assert.equal(ai.activity.reason, 'loot_sweep:seek');
  assert.equal(ai.activity.targetId, loose.id, 'the loose pod, never the custody pod');

  const p = { pickupId: loose.id, collectorId: r1.id, kind: 'cargo', commodityId: 'cmdty_alloys', amount: 7 };
  t.bus.emit('pickup:collected', p);
  assert.equal(p.acceptedAmount, 7);
  // A custody pod brushing the sweeper gets no sweep receipt — the freight owner answers it.
  const c = { pickupId: 'custody_pod_x', collectorId: r1.id, kind: 'cargo', amount: 4 };
  t.bus.emit('pickup:collected', c);
  assert.equal(c.acceptedAmount, undefined);
});

test('a sweep excludes the tow target supplied by its systems caller', () => {
  const t = boot();
  const hunter = spawnRaider(t.sim, { x: 600, z: 60 });
  const pod = spawnPod(t.sim, { x: 700, z: 80 });
  assert.equal(looseSweepPod(t.state, pod, hunter, t.state.simTime), true);
  assert.equal(looseSweepPod(t.state, pod, hunter, t.state.simTime, {
    playerTowedPodId: pod.id,
  }), false, 'the supplied tow target is unavailable to a sweep');
});

test('seed 4242: the player tow is checked at dispatch, pickup, and every sweep step', () => {
  const t = boot();
  const escort = spawnRaider(t.sim, { x: 500, z: 0 });
  const hunter = spawnRaider(t.sim, { x: 600, z: 60 });
  const pod = spawnPod(t.sim, { x: 700, z: 80 });
  t.state.player.tether = { active: true, targetId: pod.id };
  bindLive(t, [escort, hunter], { [escort.id]: 'escort', [hunter.id]: 'raider' }, 'live_fight15_tow');

  kill(t, escort);
  const ai = hunter.data.ai;
  assert.equal(ai.lootSweep.phase, 'scan', 'a pod already on the player line is not targeted');
  assert.equal(ai.lootSweep.podId, null);

  t.state.player.tether = null;
  for (let n = 0; n < 80; n++) t.sim.step();
  assert.equal(ai.activity.targetId, pod.id, 'releasing the line makes the pod available');

  t.state.player.tether = { active: true, targetId: pod.id };
  const pickup = { pickupId: pod.id, collectorId: hunter.id, kind: 'cargo', commodityId: 'cmdty_alloys', amount: 7 };
  t.bus.emit('pickup:collected', pickup);
  assert.equal(pickup.acceptedAmount, undefined, 'a fresh tow blocks collection between sweep ticks');
  assert.equal(ai.stolenLoot, undefined, 'the player-towed cargo never enters the hunter hold');

  for (let n = 0; n < 80; n++) t.sim.step();
  assert.equal(ai.lootSweep.phase, 'scan', 'grabbing the target mid-sweep drops the errand claim');
  assert.equal(ai.lootSweep.podId, null);
  assert.equal(ai.activity.kind, 'loiter');

  t.state.player.tether = null;
  for (let n = 0; n < 80; n++) t.sim.step();
  assert.equal(ai.activity.targetId, pod.id, 'a later release is observed by the next sweep step');
  const releasedPickup = { ...pickup };
  t.bus.emit('pickup:collected', releasedPickup);
  assert.equal(releasedPickup.acceptedAmount, 7, 'loose cargo still uses the ordinary sweep receipt');
  assert.deepEqual(ai.stolenLoot.lines, [{ commodityId: 'cmdty_alloys', qty: 7 }]);
  console.log('seed=4242 tow: dispatch=excluded pickup=blocked mid-sweep=scan release=7u collected');
});

test('seed 4242: lawful guards and foreign hulls do not sweep — only the raid\'s own faction peels', () => {
  const t = boot();
  const e1 = spawnRaider(t.sim, { x: 500, z: 0 });
  const raider = spawnRaider(t.sim, { x: 600, z: 60 });
  const guard = t.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: 620, z: 60 }, hull: 80, hullMax: 100, radius: 10,
    data: { ai: { archetype: 'patrol', fsm: 'attack' }, combat: {} },
  });
  spawnPod(t.sim, { x: 700, z: 80 });
  // The raider and the fallen escort share a faction; the lawful hull does not.
  bindLive(t, [e1, raider, guard], {
    [e1.id]: 'escort', [raider.id]: 'raider', [guard.id]: 'squad',
  }, 'live_fight15_faction');

  kill(t, e1);
  assert.ok(raider.data.ai.lootSweep, 'same-faction survivor peels');
  assert.equal(guard.data.ai.lootSweep, undefined, 'a lawful wingmate never loots');
});

test('seed 4242: an empty field parks the sweep on scan, and a late pod still gets taken', () => {
  const t = boot();
  const e1 = spawnRaider(t.sim, { x: 500, z: 0 });
  const r1 = spawnRaider(t.sim, { x: 600, z: 60 });
  bindLive(t, [e1, r1], { [e1.id]: 'escort', [r1.id]: 'raider' }, 'live_fight15_scan');

  kill(t, e1);
  assert.equal(r1.data.ai.lootSweep.phase, 'scan');
  assert.equal(r1.data.ai.activity.kind, 'loiter');
  assert.equal(r1.data.ai.activity.reason, 'loot_sweep:scan');

  const pod = spawnPod(t.sim, { x: 800, z: 100 });
  for (let n = 0; n < 80; n++) t.sim.step();
  assert.equal(r1.data.ai.activity.reason, 'loot_sweep:seek',
    'the director cadence picks up the late-dropping pod');
  assert.equal(r1.data.ai.activity.targetId, pod.id);
});

test('a saved mid-sweep stamp restores its posture instead of leaving a phantom doctrine', () => {
  const t = boot();
  const r1 = spawnRaider(t.sim, { x: 600, z: 60 });
  const prior = { kind: 'attack_run', reason: 'raid', targetId: null };
  r1.data.ai.activity = prior;
  r1.data.ai.lootSweep = {
    phase: 'seek', podId: 'pod_gone', liveId: 'live_x', collected: 2,
    posture: { activity: prior, roe: 'weapons_free', forcePlayerTarget: true, huntPlayer: true },
  };
  const swept = sweepStaleLootSweeps(t.state);
  assert.equal(swept, 1);
  assert.equal(r1.data.ai.lootSweep, undefined);
  assert.equal(r1.data.ai.activity, prior, 'the pre-sweep attack doctrine comes back');
  assert.equal(r1.data.ai.forcePlayerTarget, true);
});
